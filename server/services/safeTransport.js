import crypto from 'node:crypto';
import {
  DEFAULT_MATERIALIZATION_HORIZON_MS,
  DEFAULT_TIMEZONE,
  generateOccurrences,
  isValidCalendarDate,
  utcToLocalDate,
  validateSubscriptionPayload,
  validateScheduledRidePayload
} from '../domain/scheduleCalendar.js';

/**
 * Traslado seguro — SAFE-TRANSPORT-1C: ciclo de vida de suscripciones y
 * materializador idempotente de ocurrencias.
 *
 * Reglas que este servicio protege:
 *
 *  - El dueño sale SIEMPRE del token (`user.id`), jamás del cuerpo.
 *  - El estado, el plan y sus contadores son del SERVIDOR: el cliente pide,
 *    el servidor decide. La facturación NO existe en esta fase.
 *  - IDEMPOTENCIA en dos capas: en memoria por `occurrenceKey` (el proceso es
 *    único y el bucle es síncrono entre búsqueda e inserción), y como candado
 *    FINAL el índice UNIQUE de `scheduled_rides.occurrence_key` — si otro
 *    proceso ganara la carrera, la escritura falla, la copia en memoria se
 *    revierte y la siguiente pasada converge. El intervalo NO es el candado.
 *  - Materializar es RECONCILIAR: la agenda vigente de la suscripción es la
 *    verdad, y las ocurrencias futuras sin compromiso se acercan a ella —
 *    crear la que falta, reprogramar la que cambió de hora (misma clave),
 *    cancelar lógicamente la que sobró y revivir la que vuelve a existir.
 *    Jamás se toca una ocurrencia con viaje creado, con conductor
 *    comprometido, en curso, terminada o pasada.
 *  - NADA de conductores en esta fase: ni ofertas, ni asignaciones, ni
 *    notificaciones, ni traspaso a viaje real, ni consumo de créditos.
 *  - PRIVACIDAD: estos documentos son patrones de vida (casa ↔ trabajo con
 *    horario). A los registros de telemetría van identificadores y conteos;
 *    jamás direcciones, coordenadas ni placeId.
 */

const VALORES_VERDADEROS = new Set(['1', 'true', 'yes', 'on']);

/** Bandera maestra. Sin definir = APAGADO: API oculta y materializador dormido. */
export function isSafeTransportEnabled(value = process.env.SAFE_TRANSPORT_ENABLED) {
  return VALORES_VERDADEROS.has(String(value ?? '').trim().toLowerCase());
}

/** Cadencia del materializador. El candado es la base de datos, no el reloj. */
export const DEFAULT_MATERIALIZER_INTERVAL_MS = 5 * 60_000;
const MIN_INTERVAL_MS = 30_000;

export function resolveMaterializerIntervalMs(value = process.env.SAFE_TRANSPORT_MATERIALIZER_INTERVAL_MS) {
  const ms = Number(String(value ?? '').trim());
  if (!Number.isFinite(ms) || ms < MIN_INTERVAL_MS) return DEFAULT_MATERIALIZER_INTERVAL_MS;
  return Math.floor(ms);
}

/**
 * Ventanas de cobertura aprobadas en SAFE-1A. En 1C son SOLO clasificación
 * pura de tiempo para que SAFE-1D construya encima; aquí nadie contacta a un
 * conductor ni marca AT_RISK con días de antelación.
 */
export const COVERAGE_WINDOWS = Object.freeze({
  materializationHorizonMs: DEFAULT_MATERIALIZATION_HORIZON_MS, // T-72h
  primaryConfirmationDeadlineMs: 45 * 60_000,                   // T-45min
  backupThresholdMs: 20 * 60_000,                               // T-20min
  handoffLeadMs: 0                                              // T-0
});

/** Fase de cobertura de una recogida vista desde `nowMs`. Pura, sin efectos. */
export function classifyCoverageTiming({ scheduledPickupAtUtcMs, nowMs, windows = COVERAGE_WINDOWS }) {
  if (!Number.isFinite(scheduledPickupAtUtcMs) || !Number.isFinite(nowMs)) {
    throw new Error('INVALID_COVERAGE_INPUT');
  }
  const restante = scheduledPickupAtUtcMs - nowMs;
  if (restante < windows.handoffLeadMs) return 'PAST_DUE';
  if (restante <= windows.backupThresholdMs) return 'BACKUP_WINDOW';
  if (restante <= windows.primaryConfirmationDeadlineMs) return 'PRIMARY_CONFIRMATION_WINDOW';
  return 'BEFORE_CONFIRMATION_WINDOW';
}

// ---------------------------------------------------------------------------
// Formas de entrada (el cliente propone, el servidor construye el documento)
// ---------------------------------------------------------------------------

const PLAN_TYPES = Object.freeze({ WEEKLY: 1, MONTHLY: 4 }); // semanas por ciclo
const VEHICLE_RE = /^[A-Z_]{2,20}$/;
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_PAUSES = 20;
const MAX_EXCEPTIONS = 60;
const MAX_ADDRESS = 300;
const MAX_TIMELINE = 20;

/** Solo lo que el traslado necesita del lugar: nada de campos extra colados. */
function sanearLugar(lugar) {
  if (!lugar || typeof lugar !== 'object') return null;
  const lat = Number(lugar.lat);
  const lng = Number(lugar.lng);
  const address = typeof lugar.address === 'string' ? lugar.address.trim().slice(0, MAX_ADDRESS) : '';
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) return null;
  if (!address) return null;
  return { lat, lng, address };
}

function sanearPausas(pausas) {
  if (pausas === undefined) return { ok: true, value: [] };
  if (!Array.isArray(pausas) || pausas.length > MAX_PAUSES) return { ok: false };
  const limpias = [];
  for (const pausa of pausas) {
    if (!pausa || typeof pausa !== 'object') return { ok: false };
    if (!isValidCalendarDate(pausa.from) || !isValidCalendarDate(pausa.to)) return { ok: false };
    if (pausa.from > pausa.to) return { ok: false };
    const limpia = { from: pausa.from, to: pausa.to };
    if (typeof pausa.reason === 'string' && pausa.reason.trim()) {
      limpia.reason = pausa.reason.trim().slice(0, 120);
    }
    limpias.push(limpia);
  }
  return { ok: true, value: limpias };
}

function sanearExcepciones(excepciones) {
  if (excepciones === undefined) return { ok: true, value: [] };
  if (!Array.isArray(excepciones) || excepciones.length > MAX_EXCEPTIONS) return { ok: false };
  const limpias = [];
  for (const excepcion of excepciones) {
    if (!excepcion || typeof excepcion !== 'object') return { ok: false };
    if (!isValidCalendarDate(excepcion.date)) return { ok: false };
    const limpia = { date: excepcion.date };
    if (excepcion.skip === true) {
      limpia.skip = true;
    } else {
      if (excepcion.outboundTime !== undefined) {
        if (!HORA_RE.test(String(excepcion.outboundTime))) return { ok: false };
        limpia.outboundTime = excepcion.outboundTime;
      }
      if (excepcion.returnTime !== undefined) {
        if (!HORA_RE.test(String(excepcion.returnTime))) return { ok: false };
        limpia.returnTime = excepcion.returnTime;
      }
      if (limpia.outboundTime === undefined && limpia.returnTime === undefined) return { ok: false };
    }
    limpias.push(limpia);
  }
  return { ok: true, value: limpias };
}

function sanearWeekdays(weekdays) {
  if (!Array.isArray(weekdays) || !weekdays.length) return null;
  const unicos = [...new Set(weekdays)];
  if (unicos.some(d => !Number.isInteger(d) || d < 1 || d > 7)) return null;
  return unicos.sort((a, b) => a - b);
}

/**
 * Capacidad nominal del ciclo — un descriptor, NO facturación: en esta fase
 * nada consume `ridesUsed` y no hay renovación ni débito de billetera.
 */
function capacidadDelPlan(tipo, weekdays, tramos) {
  return weekdays.length * tramos * PLAN_TYPES[tipo];
}

const contarTramos = patron =>
  (patron.outbound?.time ? 1 : 0) + (patron.return?.time ? 1 : 0);

// ---------------------------------------------------------------------------
// El servicio
// ---------------------------------------------------------------------------

const err = (status, code) => ({ ok: false, status, code });

export function createSafeTransportService({
  database,
  persistRecord,
  enabled = isSafeTransportEnabled(),
  horizonMs = DEFAULT_MATERIALIZATION_HORIZON_MS,
  intervalMs = resolveMaterializerIntervalMs(),
  now = () => Date.now(),
  logger = console
} = {}) {
  if (!database) throw new Error('SAFE_TRANSPORT_REQUIRES_DATABASE');
  if (typeof persistRecord !== 'function') throw new Error('SAFE_TRANSPORT_REQUIRES_PERSIST');

  const subs = () => database.transportSubscriptions;
  const rides = () => database.scheduledRides;

  /**
   * TODA reconciliación pasa por UNA cola: dos invocaciones «paralelas» en el
   * mismo proceso corren en serie y la idempotencia hace converger la segunda.
   * (Entre procesos, el candado es el UNIQUE de la base de datos.)
   */
  let cola = Promise.resolve();
  function enSerie(trabajo) {
    const siguiente = cola.then(trabajo, trabajo);
    cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  /** El contrato de persistencia devuelve boolean; si aun así lanzara, un
   *  fallo de escritura jamás debe tumbar al materializador ni a la API. */
  async function guardar(tabla, doc) {
    try { return await persistRecord(tabla, doc); }
    catch (error) {
      logger.error(`[+58express SafeTransport] escritura fallida en ${tabla}: ${error.message}`);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Suscripciones
  // -------------------------------------------------------------------------

  function construirPatron(entrada, base = null) {
    const patron = {
      weekdays: entrada.weekdays !== undefined ? sanearWeekdays(entrada.weekdays) : base?.weekdays ?? null,
      timezone: entrada.timezone !== undefined ? entrada.timezone : base?.timezone ?? DEFAULT_TIMEZONE
    };
    if (!patron.weekdays) return null;
    const outboundTime = entrada.outbound?.time !== undefined ? entrada.outbound.time : base?.outbound?.time;
    const returnTime = entrada.return?.time !== undefined ? entrada.return.time : base?.return?.time;
    if (outboundTime !== undefined && outboundTime !== null) patron.outbound = { time: outboundTime };
    if (returnTime !== undefined && returnTime !== null) patron.return = { time: returnTime };
    return patron;
  }

  /** Ensayo del calendario: pausas o excepciones malformadas caen aquí. */
  function ensayarCalendario(doc) {
    const desde = now();
    generateOccurrences({ subscription: doc, fromUtcMs: desde, toUtcMs: desde + horizonMs });
  }

  async function createSubscription(user, body = {}) {
    // Techo del MVP: UNA suscripción viva (no cancelada) por pasajero.
    if (subs().some(s => s.passengerId === user.id && s.status !== 'CANCELLED')) {
      return err(409, 'SUBSCRIPTION_LIMIT');
    }

    const home = sanearLugar(body.route?.home);
    const worksite = sanearLugar(body.route?.worksite);
    if (!home || !worksite) return err(400, 'INVALID_ROUTE');

    const patron = construirPatron(body.pattern ?? {});
    if (!patron) return err(400, 'INVALID_WEEKDAYS');

    const pausas = sanearPausas(body.pauses);
    if (!pausas.ok) return err(400, 'INVALID_PAUSES');
    const excepciones = sanearExcepciones(body.exceptions);
    if (!excepciones.ok) return err(400, 'INVALID_EXCEPTIONS');

    const planType = body.plan?.type === undefined ? 'WEEKLY' : body.plan.type;
    if (!Object.hasOwn(PLAN_TYPES, planType)) return err(400, 'INVALID_PLAN_TYPE');

    let vehiclePreference = null;
    if (body.vehiclePreference !== undefined && body.vehiclePreference !== null) {
      if (!VEHICLE_RE.test(String(body.vehiclePreference))) return err(400, 'INVALID_VEHICLE_PREFERENCE');
      vehiclePreference = String(body.vehiclePreference);
    }

    let preferredDriverId = null;
    if (body.preferredDriverId !== undefined && body.preferredDriverId !== null) {
      // Se guarda como SOLICITUD. No asigna, no revela nada del conductor y
      // no se valida contra la flota: SAFE-1D implementará el consentimiento.
      if (typeof body.preferredDriverId !== 'string' || !body.preferredDriverId.trim()) {
        return err(400, 'INVALID_PREFERRED_DRIVER');
      }
      preferredDriverId = body.preferredDriverId.trim().slice(0, 80);
    }

    const zona = patron.timezone || DEFAULT_TIMEZONE;
    let effectiveFrom;
    if (body.effectiveFrom !== undefined) {
      if (!isValidCalendarDate(body.effectiveFrom)) return err(400, 'INVALID_EFFECTIVE_FROM');
      effectiveFrom = body.effectiveFrom;
    }

    const instante = new Date(now()).toISOString();
    const suscripcion = {
      id: `tsub_${crypto.randomUUID()}`,
      passengerId: user.id,       // SIEMPRE del token; el cuerpo no opina.
      status: 'ACTIVE',           // el servidor decide el estado inicial.
      plan: {
        type: planType,
        ridesIncluded: capacidadDelPlan(planType, patron.weekdays, Math.max(1, contarTramos(patron))),
        ridesUsed: 0,             // nadie consume créditos en esta fase.
        renewsAt: null,
        graceUntil: null
      },
      route: { home, worksite },
      pattern: patron,
      vehiclePreference,
      preferredDriverId,
      pauses: pausas.value,
      exceptions: excepciones.value,
      createdAt: instante,
      updatedAt: instante
    };
    if (effectiveFrom === undefined) {
      // Por defecto arranca HOY en la zona de la suscripción.
      try { effectiveFrom = utcToLocalDate(now(), zona); }
      catch { return err(400, 'INVALID_TIMEZONE'); }
    }
    suscripcion.effectiveFrom = effectiveFrom;

    const defecto = validateSubscriptionPayload(suscripcion);
    if (defecto) return err(400, defecto);
    try { ensayarCalendario(suscripcion); }
    catch { return err(400, 'INVALID_SCHEDULE'); }

    subs().push(suscripcion);
    if (!await guardar('transportSubscriptions', suscripcion)) {
      subs().pop();
      return err(503, 'DATABASE_WRITE_FAILED');
    }

    // Materializa YA su ventana: el estado visible no espera al intervalo.
    await enSerie(() => reconciliarSuscripcion(suscripcion, resumenVacio()));
    return { ok: true, subscription: suscripcion };
  }

  function ownedSubscription(user, id) {
    return subs().find(s => s.id === id && s.passengerId === user.id) ?? null;
  }

  function listSubscriptions(user) {
    return subs().filter(s => s.passengerId === user.id);
  }

  /** Campos que el dueño puede editar. Todo lo demás es del servidor. */
  const CAMPOS_EDITABLES = new Set(['pattern', 'vehiclePreference', 'preferredDriverId', 'pauses', 'exceptions']);
  const CAMPOS_DEL_SERVIDOR = new Set(['id', 'passengerId', 'status', 'plan', 'route', 'createdAt', 'updatedAt', 'effectiveFrom']);

  async function updateSubscription(user, id, body = {}) {
    const suscripcion = ownedSubscription(user, id);
    if (!suscripcion) return err(404, 'SUBSCRIPTION_NOT_FOUND');
    if (suscripcion.status === 'CANCELLED') return err(409, 'SUBSCRIPTION_CANCELLED');

    for (const clave of Object.keys(body ?? {})) {
      if (CAMPOS_DEL_SERVIDOR.has(clave)) return err(400, 'SERVER_OWNED_FIELD');
      if (!CAMPOS_EDITABLES.has(clave)) return err(400, 'UNKNOWN_FIELD');
    }

    const candidata = structuredClone(suscripcion);
    if (body.pattern !== undefined) {
      const patron = construirPatron(body.pattern, suscripcion.pattern);
      if (!patron) return err(400, 'INVALID_WEEKDAYS');
      candidata.pattern = patron;
    }
    if (body.vehiclePreference !== undefined) {
      if (body.vehiclePreference === null) candidata.vehiclePreference = null;
      else if (!VEHICLE_RE.test(String(body.vehiclePreference))) return err(400, 'INVALID_VEHICLE_PREFERENCE');
      else candidata.vehiclePreference = String(body.vehiclePreference);
    }
    if (body.preferredDriverId !== undefined) {
      if (body.preferredDriverId === null) candidata.preferredDriverId = null;
      else if (typeof body.preferredDriverId !== 'string' || !body.preferredDriverId.trim()) {
        return err(400, 'INVALID_PREFERRED_DRIVER');
      } else candidata.preferredDriverId = body.preferredDriverId.trim().slice(0, 80);
    }
    if (body.pauses !== undefined) {
      const pausas = sanearPausas(body.pauses);
      if (!pausas.ok) return err(400, 'INVALID_PAUSES');
      candidata.pauses = pausas.value;
    }
    if (body.exceptions !== undefined) {
      const excepciones = sanearExcepciones(body.exceptions);
      if (!excepciones.ok) return err(400, 'INVALID_EXCEPTIONS');
      candidata.exceptions = excepciones.value;
    }

    candidata.updatedAt = new Date(now()).toISOString();
    const defecto = validateSubscriptionPayload(candidata);
    if (defecto) return err(400, defecto);
    try { ensayarCalendario(candidata); }
    catch { return err(400, 'INVALID_SCHEDULE'); }

    const indice = subs().indexOf(suscripcion);
    subs()[indice] = candidata;
    if (!await guardar('transportSubscriptions', candidata)) {
      subs()[indice] = suscripcion;
      return err(503, 'DATABASE_WRITE_FAILED');
    }

    // La agenda cambió: reconciliar SUS ocurrencias futuras sin compromiso.
    await enSerie(() => reconciliarSuscripcion(candidata, resumenVacio()));
    return { ok: true, subscription: candidata };
  }

  /** ACTIVE→PAUSED, PAUSED→ACTIVE, viva→CANCELLED. Nada más existe en 1C. */
  const TRANSICIONES = Object.freeze({
    PAUSED: ['ACTIVE'],
    ACTIVE: ['PAUSED'],
    CANCELLED: ['ACTIVE', 'PAUSED']
  });

  async function setSubscriptionStatus(user, id, destino) {
    const suscripcion = ownedSubscription(user, id);
    if (!suscripcion) return err(404, 'SUBSCRIPTION_NOT_FOUND');
    if (!TRANSICIONES[destino]?.includes(suscripcion.status)) {
      return err(409, 'INVALID_STATUS_TRANSITION');
    }
    const anterior = suscripcion.status;
    suscripcion.status = destino;
    suscripcion.updatedAt = new Date(now()).toISOString();
    if (!await guardar('transportSubscriptions', suscripcion)) {
      suscripcion.status = anterior;
      return err(503, 'DATABASE_WRITE_FAILED');
    }
    // Pausar/cancelar retira sus ocurrencias futuras libres; reanudar las
    // revive (misma clave: el candado UNIQUE impide duplicarlas).
    await enSerie(() => reconciliarSuscripcion(suscripcion, resumenVacio()));
    return { ok: true, subscription: suscripcion };
  }

  // -------------------------------------------------------------------------
  // Ocurrencias del pasajero (lectura acotada)
  // -------------------------------------------------------------------------

  const DIA_MS = 24 * 60 * 60 * 1000;
  const RANGO_POR_DEFECTO = Object.freeze({ atrasMs: DIA_MS, adelanteMs: 7 * DIA_MS });
  const RANGO_MAXIMO_MS = 30 * DIA_MS;

  function listScheduledRides(user, { fromMs, toMs } = {}) {
    const ahora = now();
    const desde = Number.isFinite(fromMs) ? fromMs : ahora - RANGO_POR_DEFECTO.atrasMs;
    const hasta = Number.isFinite(toMs) ? toMs : ahora + RANGO_POR_DEFECTO.adelanteMs;
    if (hasta <= desde || hasta - desde > RANGO_MAXIMO_MS) return null;
    return rides()
      .filter(r => r.passengerId === user.id)
      .filter(r => {
        const t = Date.parse(r.scheduledPickupAt);
        return Number.isFinite(t) && t >= desde && t < hasta;
      })
      .sort((a, b) => Date.parse(a.scheduledPickupAt) - Date.parse(b.scheduledPickupAt)
        || (a.id < b.id ? -1 : 1));
  }

  // -------------------------------------------------------------------------
  // Materializador (idempotente; la reconciliación ES la operación)
  // -------------------------------------------------------------------------

  const resumenVacio = () => ({
    subscriptionsSeen: 0,
    invalidSubscriptions: 0,
    created: 0,
    rescheduled: 0,
    revived: 0,
    cancelledObsolete: 0,
    persistFailures: 0,
    errors: 0
  });

  /** ¿Esta ocurrencia puede tocarla la reconciliación? Solo si nadie se ha
   *  comprometido con ella: sin viaje, sin conductor, planificada o cancelada
   *  por la propia reconciliación. Lo demás es intocable. */
  const esLibre = ride => !ride.tripId
    && ride.assignmentStatus === 'UNASSIGNED'
    && (ride.serviceStatus === 'PLANNED' || /^CANCELLED_[A-Z_]+$/.test(String(ride.serviceStatus)));

  const esFutura = (ride, ahora) => {
    const t = Date.parse(ride.scheduledPickupAt);
    return Number.isFinite(t) && t >= ahora;
  };

  function anotar(ride, evento, instante) {
    if (!Array.isArray(ride.timeline)) ride.timeline = [];
    ride.timeline.push({ event: evento, at: new Date(instante).toISOString() });
    if (ride.timeline.length > MAX_TIMELINE) ride.timeline = ride.timeline.slice(-MAX_TIMELINE);
    ride.updatedAt = new Date(instante).toISOString();
  }

  async function reconciliarSuscripcion(suscripcion, resumen) {
    resumen.subscriptionsSeen += 1;
    const ahora = now();

    // Una suscripción inválida se REPORTA y se deja en paz: no genera nada y
    // tampoco cancela lo existente — un defecto de datos no destruye agenda.
    if (validateSubscriptionPayload(suscripcion)) {
      resumen.invalidSubscriptions += 1;
      logger.warn(`[+58express SafeTransport] suscripcion invalida ignorada: ${suscripcion?.id ?? 'sin-id'}`);
      return;
    }

    const propias = rides().filter(r => r.subscriptionId === suscripcion.id);
    // El horizonte de comparación cubre también cualquier ocurrencia futura ya
    // escrita más allá de la ventana: todo lo futuro es comparable.
    const masLejana = Math.max(0, ...propias.map(r => Date.parse(r.scheduledPickupAt) || 0));
    const hasta = Math.max(ahora + horizonMs, masLejana + 60 * 60 * 1000);

    const esperadas = suscripcion.status === 'ACTIVE'
      ? generateOccurrences({ subscription: suscripcion, fromUtcMs: ahora, toUtcMs: hasta })
      : [];
    const esperadasPorClave = new Map(esperadas.map(o => [o.occurrenceKey, o]));
    const propiasPorClave = new Map(propias.map(r => [r.occurrenceKey, r]));

    // 1) Lo que la agenda ESPERA: crear, reprogramar o revivir.
    for (const ocurrencia of esperadas) {
      // Solo dentro de la ventana operativa real de materialización.
      if (ocurrencia.scheduledPickupAtUtcMs >= ahora + horizonMs) continue;
      const existente = propiasPorClave.get(ocurrencia.occurrenceKey);
      if (!existente) {
        await crearOcurrencia(suscripcion, ocurrencia, ahora, resumen);
        continue;
      }
      if (!esLibre(existente)) continue; // comprometida: intocable
      const objetivo = new Date(ocurrencia.scheduledPickupAtUtcMs).toISOString();
      const revivir = existente.serviceStatus !== 'PLANNED';
      const reprogramar = existente.scheduledPickupAt !== objetivo
        || existente.localTime !== ocurrencia.localTime;
      if (!revivir && !reprogramar) continue;
      const previa = { serviceStatus: existente.serviceStatus, scheduledPickupAt: existente.scheduledPickupAt, localTime: existente.localTime };
      existente.serviceStatus = 'PLANNED';
      existente.scheduledPickupAt = objetivo;
      existente.localTime = ocurrencia.localTime;
      anotar(existente, revivir ? 'REVIVED' : 'RESCHEDULED', ahora);
      if (await guardar('scheduledRides', existente)) {
        resumen[revivir ? 'revived' : 'rescheduled'] += 1;
      } else {
        Object.assign(existente, previa);
        resumen.persistFailures += 1;
      }
    }

    // 2) Lo que SOBRA: futura, libre, aún PLANNED y ya fuera de la agenda.
    for (const ride of propias) {
      if (esperadasPorClave.has(ride.occurrenceKey)) continue;
      if (!esFutura(ride, ahora) || !esLibre(ride) || ride.serviceStatus !== 'PLANNED') continue;
      const previa = ride.serviceStatus;
      ride.serviceStatus = suscripcion.status === 'ACTIVE'
        ? 'CANCELLED_SCHEDULE_CHANGE'
        : (suscripcion.status === 'PAUSED' ? 'CANCELLED_SUBSCRIPTION_PAUSED' : 'CANCELLED_SUBSCRIPTION_INACTIVE');
      anotar(ride, ride.serviceStatus, ahora);
      if (await guardar('scheduledRides', ride)) {
        resumen.cancelledObsolete += 1;
      } else {
        ride.serviceStatus = previa;
        resumen.persistFailures += 1;
      }
    }
  }

  async function crearOcurrencia(suscripcion, ocurrencia, ahora, resumen) {
    const instante = new Date(ahora).toISOString();
    const ida = ocurrencia.direction === 'OUTBOUND';
    const ride = {
      id: `sride_${crypto.randomUUID()}`,
      subscriptionId: suscripcion.id,
      passengerId: suscripcion.passengerId,
      occurrenceKey: ocurrencia.occurrenceKey,
      direction: ocurrencia.direction,
      localDate: ocurrencia.localDate,
      localTime: ocurrencia.localTime,
      scheduledPickupAt: new Date(ocurrencia.scheduledPickupAtUtcMs).toISOString(),
      assignmentStatus: 'UNASSIGNED', // SAFE-1D pondrá conductores; 1C jamás.
      serviceStatus: 'PLANNED',
      tripId: null,
      pickup: structuredClone(ida ? suscripcion.route.home : suscripcion.route.worksite),
      destination: structuredClone(ida ? suscripcion.route.worksite : suscripcion.route.home),
      vehiclePreference: suscripcion.vehiclePreference ?? null,
      timeline: [{ event: 'MATERIALIZED', at: instante }],
      createdAt: instante,
      updatedAt: instante
    };
    if (validateScheduledRidePayload(ride)) {
      resumen.errors += 1;
      return;
    }
    rides().push(ride);
    if (!await guardar('scheduledRides', ride)) {
      // El candado FINAL es el UNIQUE de occurrence_key: si otro proceso ganó
      // la carrera (o la escritura falló), la memoria se revierte y la
      // siguiente pasada converge sin duplicar.
      rides().splice(rides().indexOf(ride), 1);
      resumen.persistFailures += 1;
      return;
    }
    resumen.created += 1;
  }

  /** El gancho interno de materialización. Idempotente por construcción y
   *  en SERIE: dos invocaciones simultáneas corren una detrás de la otra. */
  function runSafeTransportMaterialization() {
    return enSerie(async () => {
      const resumen = resumenVacio();
      for (const suscripcion of [...subs()]) {
        try {
          await reconciliarSuscripcion(suscripcion, resumen);
        } catch (error) {
          // Un fallo en una suscripción no tumba la pasada ni el proceso.
          resumen.errors += 1;
          logger.error(`[+58express SafeTransport] fallo materializando ${suscripcion?.id ?? 'sin-id'}: ${error.message}`);
        }
      }
      return resumen;
    });
  }

  // -------------------------------------------------------------------------
  // El intervalo (NO es el candado; solo la cadencia)
  // -------------------------------------------------------------------------

  let timer = null;
  let corriendo = false;
  let pasadasSaltadas = 0;

  async function tick() {
    if (corriendo) {
      // Solapamiento: se salta, no se encola. La base de datos protege el
      // resto de los casos.
      pasadasSaltadas += 1;
      return null;
    }
    corriendo = true;
    try {
      const resumen = await runSafeTransportMaterialization();
      const huboCambios = resumen.created || resumen.rescheduled || resumen.revived
        || resumen.cancelledObsolete || resumen.invalidSubscriptions || resumen.errors
        || resumen.persistFailures;
      if (huboCambios) {
        // Solo conteos e identificador de proceso: jamás rutas ni horarios.
        logger.log(`[+58express SafeTransport] materializacion: ${JSON.stringify(resumen)}`);
      }
      return resumen;
    } catch (error) {
      logger.error(`[+58express SafeTransport] pasada fallida: ${error.message}`);
      return null;
    } finally {
      corriendo = false;
    }
  }

  function startMaterializer() {
    if (!enabled) {
      logger.log('[+58express SafeTransport] apagado (SAFE_TRANSPORT_ENABLED sin activar)');
      return false;
    }
    if (timer) return true;
    timer = setInterval(() => { tick(); }, intervalMs);
    timer.unref?.();
    logger.log(`[+58express SafeTransport] materializador armado cada ${Math.round(intervalMs / 1000)}s`);
    // Primera pasada sin esperar al intervalo, fuera del camino de arranque.
    setImmediate(() => { tick(); });
    return true;
  }

  function stopMaterializer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    enabled,
    intervalMs,
    horizonMs,
    createSubscription,
    listSubscriptions,
    getSubscription: ownedSubscription,
    updateSubscription,
    setSubscriptionStatus,
    listScheduledRides,
    runSafeTransportMaterialization,
    tick,
    startMaterializer,
    stopMaterializer,
    skippedOverlaps: () => pasadasSaltadas
  };
}
