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
import {
  offerViewForDriver,
  resolveBackupOfferPolicy,
  resolveCommitmentWindow,
  scheduledEligibilityDefect,
  selectBackupCandidates
} from '../domain/scheduledCoverage.js';
import { driverPublicProfile } from '../domain/userProjections.js';

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

/**
 * Piloto controlado — SAFE-TRANSPORT-1G. El acceso al Transporte Seguro exige
 * DOS llaves del servidor: la bandera global (SAFE_TRANSPORT_ENABLED) Y la
 * autorización de piloto. La lista vive SOLO en el entorno del backend
 * (SAFE_TRANSPORT_PILOT_USER_IDS: ids internos separados por comas — jamás
 * correos, teléfonos ni nombres; jamás en el código ni en el frontend).
 *
 * Semántica FAIL-CLOSED: sin lista (o vacía/malformada), NADIE está
 * autorizado aunque la bandera global esté encendida. El valor literal `*`
 * abre el acceso a todas las cuentas (el fin del piloto, decisión explícita).
 */
export const PILOT_OPEN_TOKEN = '*';

export function resolvePilotUserIds(value = process.env.SAFE_TRANSPORT_PILOT_USER_IDS) {
  const ids = new Set();
  if (typeof value !== 'string') return ids;
  for (const trozo of value.split(',')) {
    const id = trozo.trim();
    if (!id) continue;
    if (id === PILOT_OPEN_TOKEN) { ids.add(PILOT_OPEN_TOKEN); continue; }
    // Solo identificadores internos plausibles; lo malformado se descarta en
    // silencio (fail-closed) sin registrar su contenido.
    if (/^[A-Za-z0-9_-]{1,80}$/.test(id)) ids.add(id);
  }
  return ids;
}

/**
 * Facturación del plan — SAFE-TRANSPORT-2A. Modelo fijado por el dueño:
 * la clienta mantiene SALDO en su wallet y cada carrera REALIZADA se debita
 * al completarse (tarifa FIJA por categoría); el conductor cobra el 80% al
 * instante y la plataforma retiene el 20%. Carrera no realizada = no se
 * cobra. Sin saldo para la carrera: el viaje NO se crea (cero deuda) y el
 * plan queda SUSPENDED_PAYMENT hasta recargar y reanudar.
 * Todo detrás de SAFE_TRANSPORT_BILLING_ENABLED (apagada = efectivo, como
 * el piloto inicial). Los montos los edita el ADMIN (config persistida).
 */
export function isSafeTransportBillingEnabled(value = process.env.SAFE_TRANSPORT_BILLING_ENABLED) {
  return VALORES_VERDADEROS.has(String(value ?? '').trim().toLowerCase());
}

export const DEFAULT_SAFE_TRANSPORT_PRICING = Object.freeze({
  perRide: Object.freeze({ MOTO: 1.2, CAR: 2 }),
  platformFeeRate: 0.2
});

/** Valida/normaliza la configuración de precios del plan (para el PUT del
 *  admin y para la carga desde settings). Devuelve null si es inválida. */
export function sanitizeSafeTransportPricing(valor) {
  if (!valor || typeof valor !== 'object') return null;
  const moto = Number(valor.perRide?.MOTO);
  const car = Number(valor.perRide?.CAR);
  const fee = Number(valor.platformFeeRate);
  if (!Number.isFinite(moto) || moto <= 0 || moto > 100) return null;
  if (!Number.isFinite(car) || car <= 0 || car > 100) return null;
  if (!Number.isFinite(fee) || fee < 0 || fee > 0.9) return null;
  const redondear = n => Math.round(n * 100) / 100;
  return {
    perRide: { MOTO: redondear(moto), CAR: redondear(car) },
    platformFeeRate: Math.round(fee * 1000) / 1000
  };
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

/**
 * Ventana de gracia del handoff T-0. El planificador pasa cada ~5 min, así
 * que «a la hora exacta» no existe: una ocurrencia está VENCIDA cuando
 * `scheduledPickupAt <= ahora`, y sigue siendo entregable mientras el retraso
 * no supere esta gracia (un reinicio del backend en T-0 no pierde el
 * traslado). Más allá, JAMÁS se despacha horas tarde: estado terminal.
 */
export const DEFAULT_HANDOFF_GRACE_MS = 15 * 60_000;

export function resolveHandoffGraceMs(value = process.env.SAFE_TRANSPORT_HANDOFF_GRACE_MS) {
  const ms = Number(String(value ?? '').trim());
  if (!Number.isFinite(ms) || ms < 60_000) return DEFAULT_HANDOFF_GRACE_MS;
  return Math.floor(ms);
}

export function createSafeTransportService({
  database,
  persistRecord,
  tripBridge = null,
  pilotUserIds = resolvePilotUserIds(),
  billingEnabled = isSafeTransportBillingEnabled(),
  getPricing = () => DEFAULT_SAFE_TRANSPORT_PRICING,
  enabled = isSafeTransportEnabled(),
  horizonMs = DEFAULT_MATERIALIZATION_HORIZON_MS,
  intervalMs = resolveMaterializerIntervalMs(),
  handoffGraceMs = resolveHandoffGraceMs(),
  now = () => Date.now(),
  logger = console
} = {}) {
  if (!database) throw new Error('SAFE_TRANSPORT_REQUIRES_DATABASE');
  if (typeof persistRecord !== 'function') throw new Error('SAFE_TRANSPORT_REQUIRES_PERSIST');

  const subs = () => database.transportSubscriptions;
  const rides = () => database.scheduledRides;

  // --- Piloto controlado (1G): autorización adicional, SIEMPRE del servidor.
  const pilotoAbierto = pilotUserIds.has(PILOT_OPEN_TOKEN);
  const hasPilotAccess = user =>
    Boolean(user?.id) && (pilotoAbierto || pilotUserIds.has(user.id));

  // --- Facturación del plan (2A): tarifas vigentes y costos derivados.
  const precios = () => sanitizeSafeTransportPricing(getPricing()) ?? DEFAULT_SAFE_TRANSPORT_PRICING;
  const tarifaDeCarrera = vehiclePreference =>
    precios().perRide[vehiclePreference === 'CAR' ? 'CAR' : 'MOTO'];
  /** Costo estimado de UNA quincena del plan: tarifa × días × tramos × 2
   *  semanas. Es el requisito de ENTRADA (crear/reanudar); el cobro real es
   *  por carrera realizada. */
  function costoQuincenal(suscripcion) {
    const patron = suscripcion.pattern ?? {};
    const dias = (patron.weekdays ?? []).length;
    const tramos = (patron.outbound?.time ? 1 : 0) + (patron.return?.time ? 1 : 0);
    return Math.round(tarifaDeCarrera(suscripcion.vehiclePreference) * dias * tramos * 2 * 100) / 100;
  }
  const saldoDe = userId =>
    Math.round(Number(users().find(u => u.id === userId)?.walletBalance || 0) * 100) / 100;

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

    // Facturación (2A): la entrada al plan exige saldo para UNA quincena.
    // No se debita nada aquí — el cobro real es por carrera realizada.
    if (billingEnabled) {
      const requerido = costoQuincenal(suscripcion);
      const saldo = saldoDe(user.id);
      if (saldo < requerido) {
        return { ok: false, status: 402, code: 'INSUFFICIENT_WALLET_BALANCE', required: requerido, balance: saldo };
      }
    }

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

  /** Transiciones que el DUEÑO del plan puede pedir. Reanudar desde la
   *  suspensión por pago (2A) exige de nuevo el saldo de una quincena. */
  const TRANSICIONES = Object.freeze({
    PAUSED: ['ACTIVE'],
    ACTIVE: ['PAUSED', 'SUSPENDED_PAYMENT'],
    CANCELLED: ['ACTIVE', 'PAUSED', 'SUSPENDED_PAYMENT']
  });

  async function setSubscriptionStatus(user, id, destino) {
    const suscripcion = ownedSubscription(user, id);
    if (!suscripcion) return err(404, 'SUBSCRIPTION_NOT_FOUND');
    if (!TRANSICIONES[destino]?.includes(suscripcion.status)) {
      return err(409, 'INVALID_STATUS_TRANSITION');
    }
    if (billingEnabled && destino === 'ACTIVE' && suscripcion.status === 'SUSPENDED_PAYMENT') {
      const requerido = costoQuincenal(suscripcion);
      const saldo = saldoDe(user.id);
      if (saldo < requerido) {
        return { ok: false, status: 402, code: 'INSUFFICIENT_WALLET_BALANCE', required: requerido, balance: saldo };
      }
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
    commitmentsReleased: 0,
    persistFailures: 0,
    errors: 0
  });

  /** Estados de cobertura SIN compromiso: ofertas y contabilidad, pero ningún
   *  conductor ha consentido todavía. */
  const SIN_COMPROMISO = new Set(['UNASSIGNED', 'OFFERED_PREFERRED', 'ASSIGNING', 'BACKUP_REQUIRED', 'AT_RISK']);

  /** Estados en los que un conductor YA consintió cubrir la ocurrencia. */
  const COMPROMISO_CONFIRMADO = new Set(['DRIVER_CONFIRMED', 'COVERAGE_CONFIRMED']);

  /** Una suscripción solo manda mientras está EN SERVICIO. Cancelada, pausada
   *  o suspendida por pago, sus ocurrencias no representan nada operativo. */
  const suscripcionOperativa = subscriptionId =>
    subs().find(s => s.id === subscriptionId)?.status === 'ACTIVE';

  /**
   * EL predicado del compromiso, en un solo sitio (y de aquí lo toman la
   * agenda del conductor, el conflicto horario y la revalidación del accept).
   * Un compromiso vale mientras la ocurrencia siga viva, sin viaje, con un
   * conductor que consintió Y con su plan en servicio: un plan cancelado no
   * ocupa la agenda de nadie.
   */
  const esCompromisoOperativo = ride =>
    Boolean(ride)
    && !ride.tripId
    && ride.serviceStatus === 'PLANNED'
    && Boolean(ride.assignedDriverId)
    && COMPROMISO_CONFIRMADO.has(ride.assignmentStatus)
    && suscripcionOperativa(ride.subscriptionId);

  /** ¿Esta ocurrencia puede tocarla la reconciliación? Solo si nadie se ha
   *  comprometido con ella: sin viaje, sin conductor CONFIRMADO, planificada o
   *  cancelada por la propia reconciliación. Una oferta pendiente no es un
   *  compromiso: la agenda del pasajero manda y la oferta se resetea. */
  const esLibre = ride => !ride.tripId
    && !ride.assignedDriverId
    && SIN_COMPROMISO.has(ride.assignmentStatus)
    && (ride.serviceStatus === 'PLANNED' || /^CANCELLED_[A-Z_]+$/.test(String(ride.serviceStatus)));

  /** La agenda cambió bajo una ocurrencia sin compromiso: la cobertura vuelve
   *  a cero (las condiciones que motivaron ofertas o rechazos ya no existen).
   *  Un accept rezagado sobre la oferta vieja muere en la revalidación. */
  function reiniciarCobertura(ride) {
    ride.assignmentStatus = 'UNASSIGNED';
    ride.currentOffer = null;
    ride.declinedDriverIds = [];
    ride.backupOffersSent = 0;
  }

  const esFutura = (ride, ahora) => {
    const t = Date.parse(ride.scheduledPickupAt);
    return Number.isFinite(t) && t >= ahora;
  };

  /** Deshace una mutación fallida SIN cambiar la identidad del objeto (las
   *  referencias vivas — bucles, pruebas — deben seguir viendo el documento). */
  function restaurar(doc, previa) {
    for (const clave of Object.keys(doc)) delete doc[clave];
    Object.assign(doc, previa);
  }

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
      const previa = structuredClone(existente);
      existente.serviceStatus = 'PLANNED';
      existente.scheduledPickupAt = objetivo;
      existente.localTime = ocurrencia.localTime;
      reiniciarCobertura(existente);
      anotar(existente, revivir ? 'REVIVED' : 'RESCHEDULED', ahora);
      if (await guardar('scheduledRides', existente)) {
        resumen[revivir ? 'revived' : 'rescheduled'] += 1;
      } else {
        restaurar(existente, previa);
        resumen.persistFailures += 1;
      }
    }

    // 2) Lo que SOBRA. Dos reglas distintas, y la diferencia importa:
    //
    //    · Con el plan EN SERVICIO, un cambio de agenda jamás rompe un
    //      compromiso ya aceptado (política de 1D): solo se retira lo libre.
    //    · Con el plan FUERA DE SERVICIO (cancelado, pausado o suspendido) no
    //      va a haber traslado. TODA ocurrencia futura sin viaje muere,
    //      incluida la comprometida: si no, el conductor seguiría viéndola
    //      como suya y —peor— seguiría ocupando su agenda, bloqueando las
    //      ofertas de los planes nuevos a esa misma hora.
    const enServicio = suscripcion.status === 'ACTIVE';
    for (const ride of propias) {
      if (esperadasPorClave.has(ride.occurrenceKey)) continue;
      if (!esFutura(ride, ahora) || ride.serviceStatus !== 'PLANNED' || ride.tripId) continue;
      const comprometida = Boolean(ride.assignedDriverId);
      if (comprometida && enServicio) continue;   // el compromiso manda
      if (!comprometida && !esLibre(ride)) continue;
      const previa = structuredClone(ride);
      ride.serviceStatus = enServicio
        ? 'CANCELLED_SCHEDULE_CHANGE'
        : (suscripcion.status === 'PAUSED' ? 'CANCELLED_SUBSCRIPTION_PAUSED' : 'CANCELLED_SUBSCRIPTION_INACTIVE');
      if (comprometida) {
        // Quién lo tenía queda escrito para la auditoría; la asignación
        // OPERATIVA se libera, que es lo que miran agenda y conflictos.
        ride.releasedDriverId = ride.assignedDriverId;
        ride.assignedDriverId = null;
        anotar(ride, 'COMMITMENT_RELEASED', ahora);
      }
      reiniciarCobertura(ride);
      anotar(ride, ride.serviceStatus, ahora);
      if (await guardar('scheduledRides', ride)) {
        resumen.cancelledObsolete += 1;
        if (comprometida) {
          resumen.commitmentsReleased += 1;
          // Exactamente una vez: cuelga de la transición ya persistida.
          await notificar(previa.assignedDriverId, 'scheduled_ride_cancelled',
            'Traslado programado cancelado',
            `El pasajero canceló el traslado programado del ${etiquetaDeRide(ride)}. Ya no necesitas cubrirlo.`);
        }
      } else {
        restaurar(ride, previa);
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
      assignmentStatus: 'UNASSIGNED',
      serviceStatus: 'PLANNED',
      tripId: null,
      // Cobertura (SAFE-1D): solo el consentimiento explícito de un conductor
      // rellena assignedDriverId; el resto es contabilidad de ofertas.
      assignedDriverId: null,
      currentOffer: null,
      declinedDriverIds: [],
      backupOffersSent: 0,
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
  // Cobertura de conductores (SAFE-1D): consentimiento explícito, SIEMPRE
  // -------------------------------------------------------------------------

  const ventanaCompromiso = resolveCommitmentWindow();
  const politicaRespaldo = resolveBackupOfferPolicy();

  const users = () => database.users ?? [];
  const conductorPorId = id => users().find(u => u.id === id && u.role === 'driver') ?? null;

  // Ventanas de SAFE-1A/1C: la preferida debe confirmar antes de T-45min; sin
  // cobertura a T-20min la ocurrencia queda AT_RISK (aviso honesto, sin
  // despacho y sin viaje: eso pertenece a fases posteriores).
  const finDeOfertaPreferida = pickupMs => pickupMs - COVERAGE_WINDOWS.primaryConfirmationDeadlineMs;
  const umbralDeRiesgo = pickupMs => pickupMs - COVERAGE_WINDOWS.backupThresholdMs;

  /** Recogidas YA comprometidas del conductor: SOLO compromisos operativos —
   *  uno de un plan cancelado no le ocupa la agenda ni le quita ofertas. */
  function recogidasComprometidas(driverId, exceptoRideId = null) {
    return rides()
      .filter(r => r.assignedDriverId === driverId && r.id !== exceptoRideId && esCompromisoOperativo(r))
      .map(r => Date.parse(r.scheduledPickupAt))
      .filter(Number.isFinite);
  }

  function defectoDeElegibilidad(driver, ride) {
    // Frontera del piloto (1G): durante el piloto, NINGÚN conductor fuera de
    // la lista puede recibir ni aceptar traslados programados — aunque tenga
    // acceptsScheduledRides=true o datos históricos. Esta frontera termina en
    // el traspaso a viaje normal: el despacho inmediato usa la flota común.
    if (!hasPilotAccess(driver)) return 'NOT_IN_PILOT';
    return scheduledEligibilityDefect(driver, ride, {
      committedPickupsMs: driver?.id ? recogidasComprometidas(driver.id, ride.id) : [],
      window: ventanaCompromiso
    });
  }

  /**
   * Notificación SEMÁNTICA en la app (documento durable de `notifications`).
   * El texto jamás lleva dirección, coordenadas ni teléfono. El transporte
   * push llegará en fases posteriores por ESTA misma frontera — la lógica de
   * cobertura no conoce Web Push.
   */
  async function notificar(userId, event, title, message) {
    if (!userId || !Array.isArray(database.notifications)) return false;
    const doc = {
      id: `notification_${crypto.randomUUID()}`,
      userId,
      title,
      message,
      category: 'SAFE_TRANSPORT',
      event,
      read: false,
      createdAt: new Date(now()).toISOString()
    };
    database.notifications.push(doc);
    if (!await guardar('notifications', doc)) {
      database.notifications.splice(database.notifications.indexOf(doc), 1);
      return false;
    }
    return true;
  }

  const etiquetaDeRide = ride =>
    `${ride.localDate} a las ${ride.localTime} (${ride.direction === 'OUTBOUND' ? 'ida' : 'vuelta'})`;

  /** Transición persistida con vuelta atrás si la escritura falla. */
  async function transicionDeCobertura(ride, evento, mutar, resumen) {
    const previa = structuredClone(ride);
    mutar(ride);
    anotar(ride, evento, now());
    if (await guardar('scheduledRides', ride)) return true;
    restaurar(ride, previa);
    if (resumen) resumen.persistFailures += 1;
    return false;
  }

  const resumenCoberturaVacio = () => ({
    ridesEvaluated: 0,
    preferredOffers: 0,
    backupOffers: 0,
    expiredOffers: 0,
    atRisk: 0,
    persistFailures: 0,
    errors: 0
  });

  /**
   * Evaluación de UNA ocurrencia. IDEMPOTENTE: cada transición depende solo
   * del estado persistido (status + currentOffer), así que repetir la pasada
   * sobre el mismo estado no ofrece dos veces ni notifica dos veces.
   */
  async function evaluarCoberturaDeRide(ride, resumen) {
    if (ride.serviceStatus !== 'PLANNED' || ride.tripId || ride.assignedDriverId) return;
    const ahora = now();
    const pickup = Date.parse(ride.scheduledPickupAt);
    if (!Number.isFinite(pickup) || pickup <= ahora) return;
    resumen.ridesEvaluated += 1;

    // 0) Una oferta vencida se retira: el silencio cuenta como rechazo. Y una
    // oferta cuyo destinatario dejó de ser elegible (opt-out, suspensión o un
    // choque horario sobrevenido) también: mantenerla en pie sería ofrecer lo
    // que ya no puede aceptarse.
    if (ride.currentOffer) {
      const vencida = ahora >= Date.parse(ride.currentOffer.expiresAt);
      const destinatario = conductorPorId(ride.currentOffer.driverId);
      const inelegible = !vencida && defectoDeElegibilidad(destinatario, ride) !== null;
      if (vencida || inelegible) {
        const retirado = ride.currentOffer.driverId;
        const hecho = await transicionDeCobertura(ride, vencida ? 'OFFER_EXPIRED' : 'OFFER_RETIRED', r => {
          r.declinedDriverIds = [...new Set([...(r.declinedDriverIds ?? []), retirado])];
          r.currentOffer = null;
          r.assignmentStatus = 'BACKUP_REQUIRED';
        }, resumen);
        if (!hecho) return;
        resumen.expiredOffers += 1;
      }
    }

    // 1) Sin historia todavía: ¿hay conductor preferido elegible que ofertar?
    if (ride.assignmentStatus === 'UNASSIGNED') {
      const sub = subs().find(s => s.id === ride.subscriptionId);
      const preferidoId = sub?.preferredDriverId ?? null;
      const preferido = preferidoId && !(ride.declinedDriverIds ?? []).includes(preferidoId)
        ? conductorPorId(preferidoId)
        : null;
      const limite = finDeOfertaPreferida(pickup);
      if (preferido && ahora < limite && defectoDeElegibilidad(preferido, ride) === null) {
        const hecho = await transicionDeCobertura(ride, 'OFFERED_PREFERRED', r => {
          r.assignmentStatus = 'OFFERED_PREFERRED';
          r.currentOffer = {
            driverId: preferido.id,
            kind: 'PREFERRED',
            offeredAt: new Date(ahora).toISOString(),
            expiresAt: new Date(limite).toISOString()
          };
        }, resumen);
        if (!hecho) return;
        resumen.preferredOffers += 1;
        await notificar(preferido.id, 'scheduled_driver_offer',
          'Traslado programado disponible',
          `Un pasajero solicita contar contigo el ${etiquetaDeRide(ride)}. Revisa tus ofertas programadas.`);
        return;
      }
      // Sin preferido utilizable: al circuito de respaldo (sin notificación).
      if (!await transicionDeCobertura(ride, 'BACKUP_REQUIRED', r => {
        r.assignmentStatus = 'BACKUP_REQUIRED';
      }, resumen)) return;
    }

    // 2) Respaldo: riesgo primero, luego a lo sumo UNA oferta viva a la vez.
    if (ride.assignmentStatus === 'BACKUP_REQUIRED') {
      if (ahora >= umbralDeRiesgo(pickup)) {
        const hecho = await transicionDeCobertura(ride, 'AT_RISK', r => {
          r.assignmentStatus = 'AT_RISK';
        }, resumen);
        if (!hecho) return;
        resumen.atRisk += 1;
        await notificar(ride.passengerId, 'scheduled_ride_at_risk',
          'Tu traslado programado necesita atención',
          `Aún no hay conductor confirmado para tu traslado del ${etiquetaDeRide(ride)}. Estamos al tanto.`);
        return;
      }
      if ((ride.backupOffersSent ?? 0) >= politicaRespaldo.maxOffers) return;
      const excluidos = [...(ride.declinedDriverIds ?? [])];
      // Frontera del piloto (1G): el fondo de candidatos de respaldo se
      // recorta ANTES de cualquier selección — un conductor fuera del piloto
      // ni siquiera entra a la criba.
      const flota = users().filter(u => hasPilotAccess(u));
      const comprometidasPorConductor = new Map();
      for (const driver of flota) {
        if (driver.role === 'driver') {
          comprometidasPorConductor.set(driver.id, recogidasComprometidas(driver.id, ride.id));
        }
      }
      const [candidato] = selectBackupCandidates(flota, ride, {
        excludedIds: excluidos,
        committedPickupsByDriver: comprometidasPorConductor,
        window: ventanaCompromiso,
        limit: 1
      });
      if (!candidato) return; // sin candidatos: AT_RISK llegará a su hora
      const vence = Math.min(ahora + politicaRespaldo.offerTtlMs, umbralDeRiesgo(pickup));
      const hecho = await transicionDeCobertura(ride, 'BACKUP_OFFERED', r => {
        r.assignmentStatus = 'ASSIGNING';
        r.currentOffer = {
          driverId: candidato.id,
          kind: 'BACKUP',
          offeredAt: new Date(ahora).toISOString(),
          expiresAt: new Date(vence).toISOString()
        };
        r.backupOffersSent = (r.backupOffersSent ?? 0) + 1;
      }, resumen);
      if (!hecho) return;
      resumen.backupOffers += 1;
      await notificar(candidato.id, 'scheduled_driver_offer',
        'Traslado programado disponible',
        `Hay un traslado programado el ${etiquetaDeRide(ride)} que necesita cobertura. Revisa tus ofertas.`);
    }
    // OFFERED_PREFERRED / ASSIGNING con oferta vigente y AT_RISK: nada que
    // hacer — ESA es la idempotencia de ofertas y notificaciones.
  }

  /** La pasada de cobertura completa, en la MISMA cola que la materialización. */
  function runSafeTransportCoverage() {
    return enSerie(async () => {
      const resumen = resumenCoberturaVacio();
      for (const ride of [...rides()]) {
        try {
          await evaluarCoberturaDeRide(ride, resumen);
        } catch (error) {
          resumen.errors += 1;
          logger.error(`[+58express SafeTransport] fallo evaluando cobertura de ${ride?.id ?? 'sin-id'}: ${error.message}`);
        }
      }
      return resumen;
    });
  }

  // -------------------------------------------------------------------------
  // Handoff T-0 (SAFE-1E): UN traslado programado → UN viaje normal
  // -------------------------------------------------------------------------

  const resumenHandoffVacio = () => ({
    due: 0,
    coveredHandoffs: 0,
    fallbackHandoffs: 0,
    reconciled: 0,
    driverInvalidated: 0,
    missed: 0,
    billingSuspended: 0,
    completedSynced: 0,
    cancelledSynced: 0,
    persistFailures: 0,
    errors: 0
  });

  /** Suspensión por pago (2A): el plan se detiene SIN generar deuda y la
   *  clienta se entera con honestidad y con la salida clara (recargar). */
  async function suspenderPorPago(suscripcion) {
    if (!suscripcion || suscripcion.status !== 'ACTIVE') return false;
    const anterior = suscripcion.status;
    suscripcion.status = 'SUSPENDED_PAYMENT';
    suscripcion.updatedAt = new Date(now()).toISOString();
    if (!await guardar('transportSubscriptions', suscripcion)) {
      suscripcion.status = anterior;
      return false;
    }
    await notificar(suscripcion.passengerId, 'subscription_suspended_payment',
      'Tu plan de traslados quedó en pausa por saldo',
      'Tu wallet no cubre la próxima carrera del plan. Recarga tu Billetera Express y reanuda el plan cuando quieras.');
    return true;
  }

  /** Aviso al conductor COMPROMETIDO cuando su ocurrencia muere en T-0 sin
   *  convertirse en viaje (cierre 2B): jamás debe quedarse esperando una
   *  recogida que no ocurrirá. El motivo es genérico a propósito — ni el
   *  saldo ni ningún detalle financiero de la clienta viajan al conductor. */
  async function avisarCancelacionAlConductorComprometido(ride) {
    if (!ride?.assignedDriverId) return;
    if (!['DRIVER_CONFIRMED', 'COVERAGE_CONFIRMED'].includes(ride.assignmentStatus)) return;
    await notificar(ride.assignedDriverId, 'scheduled_ride_cancelled',
      'Traslado programado cancelado',
      `El traslado programado del ${etiquetaDeRide(ride)} fue cancelado. No necesitas hacer nada.`);
  }

  /**
   * Handoff de UNA ocurrencia. Exactamente-una-vez por construcción:
   *
   *  1. Todo corre en la cola serializada del servicio (sin carreras en
   *     proceso).
   *  2. El identificador del viaje es DETERMINISTA (lo fija el puente a
   *     partir del id de la ocurrencia) y es clave primaria en la base: dos
   *     procesos jamás materializan dos filas.
   *  3. ORDEN de escritura: primero el viaje, después el enlace. Si el
   *     proceso cae entre ambos, la siguiente pasada ENCUENTRA el viaje por
   *     su id determinista / scheduledRideId y solo reconcilia el enlace —
   *     sin segundo viaje, sin segundo despacho, sin segundo anuncio.
   */
  async function evaluarHandoffDeRide(ride, resumen) {
    const ahora = now();
    const pickup = Date.parse(ride.scheduledPickupAt);
    if (!Number.isFinite(pickup)) return;

    // Sincronía del ciclo de vida: el viaje normal es la autoridad. Cuando
    // termina o se cancela, la ocurrencia lo refleja EXACTAMENTE una vez
    // (la transición de estado es la guarda durable). Sin créditos: la
    // liquidación del viaje queda tal cual y ridesUsed no se toca en 1E.
    if (ride.serviceStatus === 'ACTIVE' && ride.tripId) {
      const estado = tripBridge.tripStatusOf(ride.tripId);
      if (estado === 'COMPLETED') {
        if (await transicionDeCobertura(ride, 'TRIP_COMPLETED', r => {
          r.serviceStatus = 'COMPLETED';
        }, resumen)) {
          resumen.completedSynced += 1;
          // Contador de uso del plan (2A, SOLO con facturación encendida):
          // una carrera realizada. Idempotente porque esta transición ocurre
          // UNA sola vez por ocurrencia. La liquidación del dinero (wallet
          // 80/20) la hizo el MOTOR NORMAL al completarse el viaje; aquí
          // solo se lleva la cuenta del plan.
          const sub = subs().find(s => s.id === ride.subscriptionId);
          if (billingEnabled && sub?.plan && Number.isInteger(sub.plan.ridesUsed)) {
            sub.plan.ridesUsed += 1;
            await guardar('transportSubscriptions', sub);
          }
        }
      } else if (estado === 'CANCELLED') {
        if (await transicionDeCobertura(ride, 'TRIP_CANCELLED', r => {
          r.serviceStatus = 'CANCELLED_TRIP_CANCELLED';
        }, resumen)) resumen.cancelledSynced += 1;
      }
      return;
    }

    if (ride.serviceStatus !== 'PLANNED' || ride.tripId) return;
    if (pickup > ahora) return; // aún no es T-0

    // Reconciliación tras una caída: si EL viaje ya existe, solo se enlaza.
    const existente = tripBridge.findTripForRide(ride);
    if (existente) {
      if (await transicionDeCobertura(ride, 'TRIP_HANDOFF_RECONCILED', r => {
        r.tripId = existente.id;
        r.serviceStatus = 'ACTIVE';
        r.currentOffer = null;
      }, resumen)) resumen.reconciled += 1;
      // Sin re-anuncio y sin re-despacho: la recuperación de pantallas la da
      // la app actual (/api/trips/active/me y el estado del socket), y un
      // despacho interrumpido por reinicio sigue la semántica existente.
      return;
    }

    // La suscripción debe seguir en servicio: una pausa o cancelación de
    // última hora no genera viajes.
    const sub = subs().find(s => s.id === ride.subscriptionId);
    if (!sub || sub.status !== 'ACTIVE') {
      if (await transicionDeCobertura(ride, 'CANCELLED_SUBSCRIPTION_INACTIVE', r => {
        r.serviceStatus = 'CANCELLED_SUBSCRIPTION_INACTIVE';
        r.currentOffer = null;
      }, resumen)) {
        resumen.missed += 1;
        await avisarCancelacionAlConductorComprometido(ride);
      }
      return;
    }

    // Fuera de gracia: terminal. JAMÁS un despacho horas tarde, jamás cobros.
    if (ahora - pickup > handoffGraceMs) {
      if (await transicionDeCobertura(ride, 'CANCELLED_MISSED_HANDOFF', r => {
        r.serviceStatus = 'CANCELLED_MISSED_HANDOFF';
        r.currentOffer = null;
      }, resumen)) {
        resumen.missed += 1;
        await avisarCancelacionAlConductorComprometido(ride);
      }
      return;
    }

    resumen.due += 1;

    // Revalidación del conductor comprometido en T-0: existencia, aprobación,
    // cuenta y que no esté YA en otro viaje activo. `acceptsScheduledRides`
    // NO se revalida a propósito: la política de 1D dice que el opt-out corta
    // ofertas NUEVAS y los compromisos vigentes se honran hasta el withdraw.
    // La pertenencia al PILOTO (1G) tampoco se revalida aquí, por la misma
    // política: salir del piloto corta ofertas nuevas; un compromiso ya
    // aceptado se honra.
    // Tampoco se exige socket/GPS: el compromiso se aceptó con antelación, el
    // viaje nace DRIVER_ASSIGNED y la app actual se lo muestra al conductor
    // al reconectar (/api/trips/active/me, ventana de 12 h).
    let conductorConfirmado = null;
    if (ride.assignedDriverId
      && ['DRIVER_CONFIRMED', 'COVERAGE_CONFIRMED'].includes(ride.assignmentStatus)) {
      const driver = tripBridge.driverById(ride.assignedDriverId);
      const utilizable = driver && driver.isVerified && driver.status !== 'SUSPENDED'
        && driver.accountStatus !== 'DISABLED' && !tripBridge.driverHasActiveTrip(driver.id);
      if (utilizable) {
        conductorConfirmado = driver;
      } else {
        // Estructuralmente inutilizable: al rescate de última hora, con la
        // razón en la línea temporal y sin detalles sensibles.
        if (!await transicionDeCobertura(ride, 'COMMITTED_DRIVER_UNAVAILABLE', r => {
          r.declinedDriverIds = [...new Set([...(r.declinedDriverIds ?? []), r.assignedDriverId])];
          r.assignedDriverId = null;
          r.assignmentStatus = 'AT_RISK';
        }, resumen)) return;
        resumen.driverInvalidated += 1;
      }
    }

    // EL viaje. Orden sagrado: crear (id determinista) → enlazar → efectos.
    const creado = await tripBridge.createTripForRide({ ride, driver: conductorConfirmado });
    if (!creado.ok) {
      if (creado.code === 'INSUFFICIENT_WALLET_BALANCE') {
        // Facturación (2A): sin saldo para ESTA carrera no se genera deuda —
        // el viaje no nace, la ocurrencia muere con su motivo y el plan se
        // suspende hasta que la clienta recargue y reanude.
        if (!await transicionDeCobertura(ride, 'CANCELLED_INSUFFICIENT_BALANCE', r => {
          r.serviceStatus = 'CANCELLED_INSUFFICIENT_BALANCE';
          r.currentOffer = null;
        }, resumen)) return;
        // El conductor comprometido se entera con motivo genérico: su
        // recogida no ocurrirá y no debe seguir esperándola.
        await avisarCancelacionAlConductorComprometido(ride);
        await suspenderPorPago(sub);
        resumen.billingSuspended += 1;
        return;
      }
      resumen.persistFailures += 1;
      return; // la siguiente pasada reintenta; el id determinista impide duplicar
    }
    await transicionDeCobertura(ride, 'TRIP_HANDOFF', r => {
      r.tripId = creado.trip.id;
      r.serviceStatus = 'ACTIVE';
      r.currentOffer = null;
    }, resumen);
    // Si el enlace no pudo persistirse, el viaje EXISTE y la siguiente pasada
    // lo reconcilia por su id determinista: nunca un segundo viaje. Los
    // efectos siguen: el traslado del pasajero es real desde ya.
    if (conductorConfirmado) {
      resumen.coveredHandoffs += 1;
      // Con conductor comprometido JAMÁS se despacha: cero ofertas de 15 s.
      await tripBridge.announceAssignedTrip(creado.trip);
    } else {
      resumen.fallbackHandoffs += 1;
      // El rescate de última hora: EL MISMO despacho inmediato de siempre
      // (12 filtros, 15 km, ranking por ETA, ofertas de 15 s), UNA sola vez.
      tripBridge.dispatchTrip(creado.trip);
    }
  }

  /** La pasada de handoff completa, en la MISMA cola serializada. */
  function runSafeTransportHandoff() {
    return enSerie(async () => {
      const resumen = resumenHandoffVacio();
      if (!tripBridge) return resumen; // sin puente (pruebas parciales): nada
      for (const ride of [...rides()]) {
        try {
          await evaluarHandoffDeRide(ride, resumen);
        } catch (error) {
          resumen.errors += 1;
          logger.error(`[+58express SafeTransport] fallo en handoff de ${ride?.id ?? 'sin-id'}: ${error.message}`);
        }
      }
      return resumen;
    });
  }

  // -------------------------------------------------------------------------
  // Acciones del conductor (consentimiento explícito, siempre por su token)
  // -------------------------------------------------------------------------

  function getDriverPreferences(user) {
    return { acceptsScheduledRides: user.acceptsScheduledRides === true };
  }

  /**
   * Opt-in/opt-out del conductor. Política documentada: apagarlo impide
   * ofertas NUEVAS (la elegibilidad se reevalúa en cada oferta y en cada
   * accept); los compromisos YA confirmados no se cancelan solos — retirarse
   * de cada uno es una acción explícita (withdraw), para que una ocurrencia
   * inminente jamás pierda su conductor en silencio.
   */
  async function setDriverPreferences(user, body = {}) {
    for (const clave of Object.keys(body ?? {})) {
      if (clave !== 'acceptsScheduledRides') return err(400, 'UNKNOWN_FIELD');
    }
    if (typeof body.acceptsScheduledRides !== 'boolean') return err(400, 'INVALID_PREFERENCE');
    const previa = user.acceptsScheduledRides;
    user.acceptsScheduledRides = body.acceptsScheduledRides;
    if (!await guardar('users', user)) {
      if (previa === undefined) delete user.acceptsScheduledRides;
      else user.acceptsScheduledRides = previa;
      return err(503, 'DATABASE_WRITE_FAILED');
    }
    return { ok: true, preferences: getDriverPreferences(user) };
  }

  /** Vista operativa de un compromiso YA aceptado: aquí sí viaja la ruta
   *  exacta, por la vía autenticada del conductor asignado. */
  function vistaDeCompromiso(ride) {
    return {
      rideId: ride.id,
      direction: ride.direction,
      localDate: ride.localDate,
      localTime: ride.localTime,
      scheduledPickupAt: ride.scheduledPickupAt,
      assignmentStatus: ride.assignmentStatus,
      vehiclePreference: ride.vehiclePreference ?? null,
      pickup: ride.pickup,
      destination: ride.destination
    };
  }

  function listDriverOffers(user) {
    const ahora = now();
    return rides()
      .filter(r => r.currentOffer?.driverId === user.id
        && r.serviceStatus === 'PLANNED' && !r.assignedDriverId && !r.tripId
        // Ninguna oferta rancia de un plan que ya no está en servicio.
        && suscripcionOperativa(r.subscriptionId))
      .filter(r => Date.parse(r.currentOffer.expiresAt) > ahora)
      .filter(r => {
        const t = Date.parse(r.scheduledPickupAt);
        return Number.isFinite(t) && t > ahora && t <= ahora + 7 * DIA_MS;
      })
      .sort((a, b) => Date.parse(a.scheduledPickupAt) - Date.parse(b.scheduledPickupAt))
      .slice(0, 50)
      .map(offerViewForDriver); // SIN dirección exacta antes del consentimiento
  }

  function listDriverCommitments(user) {
    const ahora = now();
    return rides()
      // Solo lo accionable: nada terminal y nada de un plan fuera de servicio.
      .filter(r => r.assignedDriverId === user.id && esCompromisoOperativo(r))
      .filter(r => {
        const t = Date.parse(r.scheduledPickupAt);
        return Number.isFinite(t) && t > ahora - DIA_MS && t <= ahora + 7 * DIA_MS;
      })
      .sort((a, b) => Date.parse(a.scheduledPickupAt) - Date.parse(b.scheduledPickupAt))
      .slice(0, 50)
      .map(vistaDeCompromiso);
  }

  /**
   * Aceptar una oferta. TODO el camino corre en la cola del servicio: dos
   * accepts «simultáneos» se revalidan en serie contra el estado ya mutado —
   * exactamente UN conductor puede quedar comprometido.
   */
  function acceptScheduledRide(user, rideId) {
    return enSerie(async () => {
      const ride = rides().find(r => r.id === rideId);
      if (!ride) return err(404, 'SCHEDULED_RIDE_NOT_FOUND');
      if (ride.assignedDriverId === user.id) {
        return { ok: true, commitment: vistaDeCompromiso(ride) }; // idempotente
      }
      if (ride.assignedDriverId) return err(409, 'RIDE_ALREADY_COVERED');
      if (ride.serviceStatus !== 'PLANNED' || ride.tripId) return err(409, 'RIDE_NOT_AVAILABLE');
      // Un accept rezagado sobre el plan que la pasajera acaba de cancelar
      // muere aquí: jamás nace un compromiso de algo que no va a ocurrir.
      if (!suscripcionOperativa(ride.subscriptionId)) return err(409, 'RIDE_NOT_AVAILABLE');
      const oferta = ride.currentOffer;
      if (!oferta || oferta.driverId !== user.id) return err(409, 'NO_ACTIVE_OFFER');
      const ahora = now();
      if (ahora >= Date.parse(oferta.expiresAt)) return err(409, 'OFFER_EXPIRED');
      const defecto = defectoDeElegibilidad(user, ride);
      if (defecto) {
        // El destinatario ya no puede tomarla: la oferta se retira AHORA para
        // que el circuito de respaldo no espere a que venza sola.
        await transicionDeCobertura(ride, 'OFFER_RETIRED', r => {
          r.declinedDriverIds = [...new Set([...(r.declinedDriverIds ?? []), user.id])];
          r.currentOffer = null;
          r.assignmentStatus = 'BACKUP_REQUIRED';
        }, null);
        return err(defecto === 'SCHEDULE_CONFLICT' ? 409 : 403, defecto);
      }

      const confirmada = oferta.kind === 'PREFERRED' ? 'DRIVER_CONFIRMED' : 'COVERAGE_CONFIRMED';
      const hecho = await transicionDeCobertura(ride, confirmada, r => {
        r.assignedDriverId = user.id; // DEL TOKEN. El cuerpo jamás opina.
        r.assignmentStatus = confirmada;
        r.currentOffer = null;
      }, null);
      if (!hecho) return err(503, 'DATABASE_WRITE_FAILED');
      await notificar(ride.passengerId, 'scheduled_driver_confirmed',
        'Conductor confirmado',
        `Tu traslado del ${etiquetaDeRide(ride)} ya tiene conductor confirmado.`);
      return { ok: true, commitment: vistaDeCompromiso(ride) };
    });
  }

  /** Rechazar una oferta dirigida a mí. Sin castigo alguno: rechazar un
   *  programado es un derecho, no una falta. */
  function declineScheduledRide(user, rideId) {
    return enSerie(async () => {
      const ride = rides().find(r => r.id === rideId);
      if (!ride) return err(404, 'SCHEDULED_RIDE_NOT_FOUND');
      const oferta = ride.currentOffer;
      if (!oferta || oferta.driverId !== user.id) return err(409, 'NO_ACTIVE_OFFER');
      const hecho = await transicionDeCobertura(ride, 'OFFER_DECLINED', r => {
        r.declinedDriverIds = [...new Set([...(r.declinedDriverIds ?? []), user.id])];
        r.currentOffer = null;
        r.assignmentStatus = 'BACKUP_REQUIRED';
      }, null);
      if (!hecho) return err(503, 'DATABASE_WRITE_FAILED');
      return { ok: true };
    });
  }

  /** Retirarse de un compromiso FUTURO. La cobertura vuelve al circuito de
   *  respaldo y el pasajero se entera con honestidad. */
  function withdrawFromScheduledRide(user, rideId) {
    return enSerie(async () => {
      const ride = rides().find(r => r.id === rideId);
      if (!ride || ride.assignedDriverId !== user.id) return err(404, 'COMMITMENT_NOT_FOUND');
      if (ride.serviceStatus !== 'PLANNED' || ride.tripId) return err(409, 'COMMITMENT_NOT_WITHDRAWABLE');
      const ahora = now();
      const pickup = Date.parse(ride.scheduledPickupAt);
      if (!Number.isFinite(pickup) || pickup <= ahora) return err(409, 'COMMITMENT_ALREADY_DUE');
      const hecho = await transicionDeCobertura(ride, 'DRIVER_WITHDREW', r => {
        r.declinedDriverIds = [...new Set([...(r.declinedDriverIds ?? []), user.id])];
        r.assignedDriverId = null;
        r.currentOffer = null;
        r.assignmentStatus = 'BACKUP_REQUIRED';
      }, null);
      if (!hecho) return err(503, 'DATABASE_WRITE_FAILED');
      await notificar(ride.passengerId, 'driver_changed',
        'Cambio de conductor en tu traslado',
        `El conductor de tu traslado del ${etiquetaDeRide(ride)} ya no está disponible. Buscaremos cobertura.`);
      return { ok: true };
    });
  }

  /**
   * Lo que el PASAJERO ve de su ocurrencia: su agenda más la identidad segura
   * del conductor confirmado (proyección de lista blanca, sin teléfono). La
   * contabilidad interna de ofertas no se expone.
   */
  function projectRideForPassenger(ride) {
    const {
      declinedDriverIds: _d, currentOffer: _o, backupOffersSent: _b,
      assignedDriverId, ...visible
    } = ride;
    return {
      ...visible,
      driver: assignedDriverId ? driverPublicProfile(conductorPorId(assignedDriverId)) : null
    };
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
      // El orden del ciclo: materializar → cobertura → handoffs vencidos.
      const resumen = await runSafeTransportMaterialization();
      const cobertura = await runSafeTransportCoverage();
      const handoff = await runSafeTransportHandoff();
      const huboCambios = resumen.created || resumen.rescheduled || resumen.revived
        || resumen.cancelledObsolete || resumen.invalidSubscriptions || resumen.errors
        || resumen.persistFailures
        || cobertura.preferredOffers || cobertura.backupOffers || cobertura.expiredOffers
        || cobertura.atRisk || cobertura.persistFailures || cobertura.errors
        || handoff.due || handoff.reconciled || handoff.missed || handoff.completedSynced
        || handoff.cancelledSynced || handoff.persistFailures || handoff.errors;
      if (huboCambios) {
        // Solo conteos e identificador de proceso: jamás rutas ni horarios.
        logger.log(`[+58express SafeTransport] materializacion: ${JSON.stringify(resumen)} cobertura: ${JSON.stringify(cobertura)} handoff: ${JSON.stringify(handoff)}`);
      }
      return { ...resumen, coverage: cobertura, handoff };
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
    // Telemetría segura del piloto: SOLO configuración y conteo. Jamás ids.
    const piloto = pilotoAbierto
      ? 'abierto'
      : `configurado=${pilotUserIds.size > 0} cuentas=${pilotUserIds.size}`;
    logger.log(`[+58express SafeTransport] materializador armado cada ${Math.round(intervalMs / 1000)}s · piloto: ${piloto}`);
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
    billingEnabled,
    hasPilotAccess,
    getEffectivePricing: precios,
    quincenalCostOf: costoQuincenal,
    intervalMs,
    horizonMs,
    createSubscription,
    listSubscriptions,
    getSubscription: ownedSubscription,
    updateSubscription,
    setSubscriptionStatus,
    listScheduledRides,
    projectRideForPassenger,
    runSafeTransportMaterialization,
    runSafeTransportCoverage,
    runSafeTransportHandoff,
    getDriverPreferences,
    setDriverPreferences,
    listDriverOffers,
    listDriverCommitments,
    acceptScheduledRide,
    declineScheduledRide,
    withdrawFromScheduledRide,
    tick,
    startMaterializer,
    stopMaterializer,
    skippedOverlaps: () => pasadasSaltadas
  };
}
