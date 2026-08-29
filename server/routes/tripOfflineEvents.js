import express from 'express';
import crypto from 'node:crypto';
import { createIdentityLimiter, CUARTO_DE_HORA } from '../services/httpRateLimit.js';
import { TRIP_STATUS, normalizeTripStatus } from '../domain/tripStateMachine.js';

/**
 * Reconciliación de acciones del conductor registradas SIN conexión —
 * OFFLINE-TRIP-1A.
 *
 * El cliente cuenta qué pasó; ESTE servidor decide si la transición es
 * válida, con LA MISMA lógica de negocio del camino en línea (la función
 * `applyTransition` inyectada es la del socket). Reglas del contrato:
 *
 *  - IDEMPOTENCIA por eventId: el libro de eventos aplicados vive DENTRO del
 *    documento del viaje (`trip.offlineEvents`) y se persiste con él en la
 *    misma escritura — sin migración de esquema y sin ventana en la que el
 *    estado y el libro puedan divergir. Reenviar un evento 1, 5 o 100 veces
 *    produce UN efecto.
 *  - El dueño sale del token: `trip.driverId === req.user.id`, jamás del
 *    cuerpo. El mismo 403 cubre «no existe» y «no es tuyo».
 *  - ORDEN: el lote se procesa por `sequence`; si un evento no puede
 *    aplicarse, los posteriores NO se intentan (NOT_ATTEMPTED) — nunca se
 *    completa un viaje saltándose su inicio.
 *  - Los RECHAZADOS no entran al libro: un reintento legítimo posterior
 *    (cuando el estado ya lo permita) se revalida desde cero.
 *  - El reloj del dispositivo es EVIDENCIA, no autoridad: se acota su
 *    cordura y `processedAt` lo pone el servidor.
 */

export const OFFLINE_EVENT_RESULT = Object.freeze({
  APPLIED: 'APPLIED',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  REJECTED: 'REJECTED',
  INVALID_EVENT: 'INVALID_EVENT',
  NOT_ATTEMPTED: 'NOT_ATTEMPTED',
  RETRYABLE_ERROR: 'RETRYABLE_ERROR'
});

/** Acciones del conductor que pueden viajar sin conexión. Nada más. */
export const OFFLINE_QUEUEABLE_ACTIONS = Object.freeze([
  TRIP_STATUS.ARRIVED,
  TRIP_STATUS.IN_PROGRESS,
  TRIP_STATUS.COMPLETED
]);

/** Máximo de eventos por lote: un viaje real produce 3; 20 es holgura. */
const MAX_EVENTS_PER_BATCH = 20;
/** El libro por viaje jamás crece sin techo. */
const MAX_LEDGER_ENTRIES = 50;
/** Deriva de reloj tolerada hacia el futuro. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
/** Una acción más vieja que esto entra en revisión, no se aplica a ciegas. */
const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const coordenadaValida = (valor, limite) =>
  Number.isFinite(Number(valor)) && Math.abs(Number(valor)) <= limite;

/** Evidencia GPS saneada, o null. La evidencia inválida se DESCARTA (el
 *  evento sigue siendo válido: el GPS puede faltar legítimamente). */
function sanearUbicacion(location) {
  if (!location || typeof location !== 'object') return null;
  if (!coordenadaValida(location.lat, 90) || !coordenadaValida(location.lng, 180)) return null;
  return {
    lat: Number(location.lat),
    lng: Number(location.lng),
    accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
    timestamp: Number.isFinite(Number(location.timestamp)) ? Number(location.timestamp) : null
  };
}

/** Forma del evento, sin decidir nada de negocio. */
function validarForma(evento) {
  if (!evento || typeof evento !== 'object') return 'MALFORMED_EVENT';
  if (!UUID_RE.test(String(evento.eventId ?? ''))) return 'INVALID_EVENT_ID';
  if (!OFFLINE_QUEUEABLE_ACTIONS.includes(evento.action)) return 'UNSUPPORTED_ACTION';
  if (!Number.isInteger(evento.sequence) || evento.sequence < 0) return 'INVALID_SEQUENCE';
  const marca = Date.parse(evento.deviceTimestamp ?? '');
  if (!Number.isFinite(marca)) return 'INVALID_TIMESTAMP';
  return null;
}

export function createTripOfflineEventsRouter({
  database,
  requireAuth,
  requireApprovedDriver,
  applyTransition,
  announceTransition,
  persistDatabase,
  now = () => Date.now()
} = {}) {
  if (!database) throw new Error('OFFLINE_EVENTS_ROUTER_REQUIRES_DATABASE');
  if (typeof applyTransition !== 'function') throw new Error('OFFLINE_EVENTS_ROUTER_REQUIRES_TRANSITION');
  if (typeof persistDatabase !== 'function') throw new Error('OFFLINE_EVENTS_ROUTER_REQUIRES_PERSIST');

  const router = express.Router();
  const limitador = createIdentityLimiter({ name: 'sincronizacion', limit: 30, windowMs: CUARTO_DE_HORA });

  router.post('/trips/:tripId/offline-events', requireAuth, requireApprovedDriver, limitador, async (req, res) => {
    const trip = database.trips.find(item => item.id === req.params.tripId);
    // El mismo 403 para «no existe» y «no es tuyo»: no se sondean viajes.
    if (!trip || trip.driverId !== req.user.id) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const eventos = Array.isArray(req.body?.events) ? req.body.events : null;
    if (!eventos || !eventos.length || eventos.length > MAX_EVENTS_PER_BATCH) {
      return res.status(400).json({ error: 'INVALID_EVENT_BATCH' });
    }

    if (!Array.isArray(trip.offlineEvents)) trip.offlineEvents = [];
    const libro = trip.offlineEvents;
    const yaAplicado = eventId => libro.some(entrada => entrada.eventId === eventId);

    const ordenados = [...eventos].sort((a, b) => (a?.sequence ?? 0) - (b?.sequence ?? 0));
    const resultados = [];
    let bloqueado = false;
    let huboAplicados = false;
    const anuncios = [];

    for (const evento of ordenados) {
      const eventId = typeof evento?.eventId === 'string' ? evento.eventId : null;
      const base = { eventId, action: evento?.action ?? null };

      if (bloqueado) {
        resultados.push({ ...base, result: OFFLINE_EVENT_RESULT.NOT_ATTEMPTED, code: 'BLOCKED_BY_PREVIOUS' });
        continue;
      }

      const defecto = validarForma(evento);
      if (defecto) {
        resultados.push({ ...base, result: OFFLINE_EVENT_RESULT.INVALID_EVENT, code: defecto });
        // Un evento malformado no autoriza a aplicar los que vienen detras
        // en secuencia: podria faltar un eslabon de la cadena.
        bloqueado = true;
        continue;
      }

      // Idempotencia: el mismo eventId jamas produce un segundo efecto.
      if (yaAplicado(evento.eventId)) {
        resultados.push({ ...base, result: OFFLINE_EVENT_RESULT.ALREADY_APPLIED });
        continue;
      }

      // Cordura temporal: el reloj del telefono es evidencia, no autoridad.
      const marca = Date.parse(evento.deviceTimestamp);
      const ahora = now();
      if (marca > ahora + MAX_CLOCK_SKEW_MS
        || marca < Date.parse(trip.createdAt ?? 0) - MAX_CLOCK_SKEW_MS
        || ahora - marca > MAX_OFFLINE_AGE_MS) {
        resultados.push({ ...base, result: OFFLINE_EVENT_RESULT.INVALID_EVENT, code: 'TIMESTAMP_OUT_OF_RANGE' });
        bloqueado = true;
        continue;
      }

      // «El servidor ya refleja este estado» sin este eventId en el libro:
      // es el ACK perdido del camino en linea legado. Efecto unico.
      if (normalizeTripStatus(trip.status) === normalizeTripStatus(evento.action)) {
        libro.push(registrarEntrada(evento, OFFLINE_EVENT_RESULT.ALREADY_APPLIED, ahora));
        huboAplicados = true; // el libro cambio: hay que persistirlo
        resultados.push({ ...base, result: OFFLINE_EVENT_RESULT.ALREADY_APPLIED });
        continue;
      }

      // LA MISMA transicion de negocio del camino en linea.
      // La transicion escribe dinero en la base desde DRIVER-FINANCE-1 v4:
      // se espera, igual que en el camino en linea.
      const resultado = await applyTransition(trip, evento.action, req.user.id);
      if (!resultado.ok) {
        resultados.push({
          ...base,
          result: OFFLINE_EVENT_RESULT.REJECTED,
          code: resultado.code,
          balance: resultado.balance,
          required: resultado.required
        });
        // Los rechazados NO entran al libro: un reintento legitimo posterior
        // se revalida desde cero. Y nada posterior se aplica a ciegas.
        bloqueado = true;
        continue;
      }

      libro.push(registrarEntrada(evento, OFFLINE_EVENT_RESULT.APPLIED, ahora));
      huboAplicados = true;
      anuncios.push({ settlement: resultado.settlement });
      resultados.push({ ...base, result: OFFLINE_EVENT_RESULT.APPLIED, status: trip.status });
    }

    if (libro.length > MAX_LEDGER_ENTRIES) {
      // Techo defensivo: un viaje real produce un puñado de entradas.
      trip.offlineEvents = libro.slice(-MAX_LEDGER_ENTRIES);
    }

    if (huboAplicados) {
      if (!await persistDatabase()) {
        // La memoria ya es correcta (mismo compromiso que el camino online);
        // el cliente reintentara y recibira ALREADY_APPLIED del libro.
        return res.status(503).json({
          error: 'DATABASE_WRITE_FAILED',
          results: resultados.map(r => (r.result === OFFLINE_EVENT_RESULT.APPLIED
            ? { ...r, result: OFFLINE_EVENT_RESULT.RETRYABLE_ERROR, code: 'DATABASE_WRITE_FAILED' }
            : r))
        });
      }
      // Anunciar SOLO tras persistir, y una sola vez con el estado final:
      // pasajero y admin ven el estado real del servidor, no los intermedios.
      if (anuncios.length && typeof announceTransition === 'function') {
        // El anuncio liquida el dinero del conductor ANTES de emitir, y eso
        // ocurre solo despues de que la persistencia haya salido bien.
        await announceTransition(trip, anuncios.at(-1).settlement ?? null);
      }
    }

    res.json({ tripId: trip.id, status: trip.status, results: resultados });
  });

  return router;
}

function registrarEntrada(evento, result, processedAt) {
  return {
    eventId: evento.eventId,
    action: evento.action,
    sequence: evento.sequence,
    deviceTimestamp: evento.deviceTimestamp,
    location: sanearUbicacion(evento.location),
    processedAt: new Date(processedAt).toISOString(),
    result
  };
}

// Identificador local (el cliente genera el suyo; este helper existe para
// pruebas y simetría del contrato).
export function newOfflineEventId() {
  return crypto.randomUUID();
}
