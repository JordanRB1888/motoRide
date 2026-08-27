/**
 * Cola durable de acciones del viaje del conductor — OFFLINE-TRIP-1A.
 *
 * Cada acción (llegué / iniciar / completar) se convierte en UN evento con
 * identidad estable que sobrevive recargas, reinicios del PWA y cambios de
 * red, hasta que el servidor da un veredicto definitivo. El mismo evento se
 * reintenta SIEMPRE con el mismo eventId: si el servidor lo aplicó y el ACK
 * se perdió, el reintento recibe ALREADY_APPLIED y jamás hay doble efecto.
 *
 * La cola vive en localStorage CON ÁMBITO DE CUENTA: si el conductor A cierra
 * sesión con eventos pendientes y B entra en el mismo teléfono, B no puede
 * ver ni sincronizar nada de A — los datos de A esperan a que A vuelva.
 *
 * Aquí no se guarda NUNCA: JWT, contraseñas, material VAPID, fotos ni chat.
 * Solo la acción, el viaje, la secuencia y la evidencia GPS aceptada (o null:
 * la falta de satélite no bloquea una acción legítima y jamás se inventa una
 * coordenada).
 *
 * El contrato del evento es neutro de plataforma: los almacenes nativos de
 * Android/iOS podrán llenar el mismo contrato contra el mismo endpoint.
 */

const QUEUE_PREFIX = '58express_trip_events_v1:';
const SNAPSHOT_PREFIX = '58express_active_trip_v1:';

const leerJson = (storage, clave, respaldo) => {
  try { return JSON.parse(storage.getItem(clave) ?? 'null') ?? respaldo; }
  catch { return respaldo; }
};

export function createTripEventQueue({ userId, storage = globalThis.localStorage } = {}) {
  if (!userId) return null;
  const claveCola = `${QUEUE_PREFIX}${userId}`;
  const claveSnapshot = `${SNAPSHOT_PREFIX}${userId}`;

  const leer = () => leerJson(storage, claveCola, []);
  const escribir = eventos => storage.setItem(claveCola, JSON.stringify(eventos));

  return {
    /**
     * Encola una acción. El eventId nace aquí UNA vez y no cambia jamás; la
     * secuencia es estrictamente creciente POR VIAJE.
     */
    enqueue({ tripId, action, expectedTripState = null, location = null }) {
      if (!tripId || !action) return null;
      const eventos = leer();
      const delViaje = eventos.filter(evento => evento.tripId === tripId);
      // La misma accion pendiente no se duplica: reintentar es reenviar el
      // MISMO evento, no fabricar otro.
      const previo = delViaje.find(evento => evento.action === action);
      if (previo) return previo;

      const evento = {
        eventId: crypto.randomUUID(),
        tripId,
        action,
        deviceTimestamp: new Date().toISOString(),
        location: location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))
          ? {
              lat: Number(location.lat),
              lng: Number(location.lng),
              accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
              timestamp: Number.isFinite(Number(location.timestamp)) ? Number(location.timestamp) : null
            }
          : null,
        sequence: delViaje.length ? Math.max(...delViaje.map(e => e.sequence)) + 1 : 0,
        expectedTripState,
        attempts: 0,
        lastError: null
      };
      eventos.push(evento);
      escribir(eventos);
      return evento;
    },

    /** Todos los pendientes, ordenados por viaje y secuencia. */
    pending() {
      return leer().sort((a, b) =>
        a.tripId === b.tripId ? a.sequence - b.sequence : String(a.tripId).localeCompare(String(b.tripId)));
    },

    pendingFor(tripId) {
      return this.pending().filter(evento => evento.tripId === tripId);
    },

    hasPendingAction(tripId, action) {
      return leer().some(evento => evento.tripId === tripId && evento.action === action);
    },

    /** Retira eventos con veredicto DEFINITIVO del servidor. */
    resolve(eventIds) {
      const definitivos = new Set(eventIds);
      escribir(leer().filter(evento => !definitivos.has(evento.eventId)));
    },

    /** Anota un intento fallido (para visibilidad, no para regenerar ids). */
    markAttempt(eventIds, error = null) {
      const marcados = new Set(eventIds);
      escribir(leer().map(evento => (marcados.has(evento.eventId)
        ? { ...evento, attempts: (evento.attempts ?? 0) + 1, lastError: error }
        : evento)));
    },

    purgeTrip(tripId) {
      escribir(leer().filter(evento => evento.tripId !== tripId));
    },

    size() { return leer().length; },

    // ----- instantánea durable del viaje activo (restauración sin red) -----

    /** Lo mínimo para seguir operando el viaje sin servidor. Sin secretos. */
    saveActiveTripSnapshot(snapshot) {
      if (!snapshot?.tripId) return;
      storage.setItem(claveSnapshot, JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }));
    },

    loadActiveTripSnapshot() {
      return leerJson(storage, claveSnapshot, null);
    },

    clearActiveTripSnapshot() {
      storage.removeItem(claveSnapshot);
    }
  };
}
