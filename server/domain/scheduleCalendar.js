/**
 * Calendario de recurrencia del traslado seguro — SAFE-TRANSPORT-1B.
 *
 * PURO: sin base de datos, sin red, sin Date.now interno. Convierte el patrón
 * semanal de una suscripción (días + hora de ida + hora de vuelta, en hora
 * LOCAL de una zona IANA) en ocurrencias concretas dentro de un horizonte
 * explícito, respetando pausas, excepciones y fecha de inicio.
 *
 * ZONA HORARIA: la conversión local→UTC usa Intl.DateTimeFormat con la zona
 * IANA — jamás aritmética fija de UTC-4 ni la zona de la máquina. El MVP
 * opera en America/Caracas (sin DST), pero el módulo es correcto para zonas
 * CON DST (guard de portabilidad en la suite). Semántica determinista en los
 * bordes de DST: una hora local INEXISTENTE (salto de primavera) se resuelve
 * al instante válido con el desfase vigente tras el salto; una hora local
 * DUPLICADA (retroceso de otoño) se resuelve de forma determinista por el
 * mismo algoritmo de doble pasada (independiente del sistema).
 *
 * IDEMPOTENCIA: la clave de ocurrencia es determinista —
 * `subscriptionId:fechaLocal:direccion` — y la base de datos la declara
 * ÚNICA: generar dos veces jamás duplica.
 */

export const OCCURRENCE_DIRECTION = Object.freeze({ OUTBOUND: 'OUTBOUND', RETURN: 'RETURN' });

/** Horizonte de materialización aprobado en SAFE-1A. */
export const DEFAULT_MATERIALIZATION_HORIZON_MS = 72 * 60 * 60 * 1000;

export const DEFAULT_TIMEZONE = 'America/Caracas';

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// La forma no basta: '2026-13-40' pasa el regex y Date.UTC lo normalizaría en
// silencio a otra fecha. Una fecha solo vale si el calendario la devuelve igual.
function esFechaCalendarioValida(valor) {
  if (!FECHA_RE.test(String(valor ?? ''))) return false;
  const [y, m, d] = String(valor).split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

// ---------------------------------------------------------------------------
// Zona horaria (Intl, sin dependencias)
// ---------------------------------------------------------------------------

const formatters = new Map();
function formatterDe(timeZone) {
  if (!formatters.has(timeZone)) {
    // Lanza de forma natural ante una zona IANA inválida: fail fast.
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
  }
  return formatters.get(timeZone);
}

/** Partes de pared (Y/M/D h:m:s) de un instante UTC visto desde la zona. */
function paredDe(utcMs, timeZone) {
  const partes = Object.fromEntries(
    formatterDe(timeZone).formatToParts(new Date(utcMs))
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, Number(p.value)])
  );
  return Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second);
}

/** Desfase (ms) de la zona respecto de UTC en un instante dado. */
function desfaseDe(utcMs, timeZone) {
  return paredDe(utcMs, timeZone) - utcMs;
}

/**
 * Hora LOCAL de una zona IANA → instante UTC (ms). Doble pasada determinista.
 * @param {string} fechaLocal 'YYYY-MM-DD'
 * @param {string} horaLocal  'HH:mm'
 */
export function localTimeToUtc(fechaLocal, horaLocal, timeZone = DEFAULT_TIMEZONE) {
  if (!esFechaCalendarioValida(fechaLocal)) throw new Error('INVALID_LOCAL_DATE');
  if (!HORA_RE.test(String(horaLocal ?? ''))) throw new Error('INVALID_LOCAL_TIME');
  const [y, m, d] = fechaLocal.split('-').map(Number);
  const [hh, mm] = horaLocal.split(':').map(Number);
  const ingenuo = Date.UTC(y, m - 1, d, hh, mm);
  const primera = ingenuo - desfaseDe(ingenuo, timeZone);
  const segunda = ingenuo - desfaseDe(primera, timeZone);
  return segunda;
}

/** Día de la semana LOCAL (1=lunes … 7=domingo) de una fecha local. */
export function localWeekday(fechaLocal, timeZone = DEFAULT_TIMEZONE) {
  const mediodia = localTimeToUtc(fechaLocal, '12:00', timeZone);
  const dia = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(mediodia));
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[dia];
}

/** Fecha local 'YYYY-MM-DD' en la que cae un instante UTC visto desde la zona. */
export function utcToLocalDate(utcMs, timeZone = DEFAULT_TIMEZONE) {
  const pared = paredDe(utcMs, timeZone);
  const fecha = new Date(pared);
  const p = n => String(n).padStart(2, '0');
  return `${fecha.getUTCFullYear()}-${p(fecha.getUTCMonth() + 1)}-${p(fecha.getUTCDate())}`;
}

// ---------------------------------------------------------------------------
// Clave de ocurrencia — el candado de idempotencia
// ---------------------------------------------------------------------------

/** Determinista SIEMPRE: misma suscripción + fecha local + dirección = misma clave. */
export function buildOccurrenceKey(subscriptionId, fechaLocal, direction) {
  if (!subscriptionId || !esFechaCalendarioValida(fechaLocal)
    || !Object.values(OCCURRENCE_DIRECTION).includes(direction)) {
    throw new Error('INVALID_OCCURRENCE_KEY_INPUT');
  }
  return `${subscriptionId}:${fechaLocal}:${direction}`;
}

export function isValidOccurrenceKey(valor) {
  return /^.+:\d{4}-\d{2}-\d{2}:(OUTBOUND|RETURN)$/.test(String(valor ?? ''));
}

// ---------------------------------------------------------------------------
// Generación de ocurrencias
// ---------------------------------------------------------------------------

const dentroDePausa = (fechaLocal, pausas) =>
  (Array.isArray(pausas) ? pausas : []).some(p => p?.from && p?.to && fechaLocal >= p.from && fechaLocal <= p.to);

const excepcionDe = (fechaLocal, excepciones) =>
  (Array.isArray(excepciones) ? excepciones : []).find(e => e?.date === fechaLocal) ?? null;

/**
 * Ocurrencias concretas del patrón dentro de [fromUtcMs, toUtcMs).
 *
 * Sin escrituras, sin Date.now: el horizonte lo decide quien llama, y las
 * pruebas son deterministas por construcción.
 *
 * @returns {Array<{occurrenceKey, direction, localDate, localTime,
 *                  scheduledPickupAtUtcMs}>} orden cronológico estable
 */
export function generateOccurrences({ subscription, fromUtcMs, toUtcMs } = {}) {
  const s = subscription;
  if (!s?.id || !s?.pattern) throw new Error('INVALID_SUBSCRIPTION');
  if (!Number.isFinite(fromUtcMs) || !Number.isFinite(toUtcMs) || toUtcMs <= fromUtcMs) {
    throw new Error('INVALID_HORIZON');
  }
  const zona = s.pattern.timezone || DEFAULT_TIMEZONE;
  const dias = Array.isArray(s.pattern.weekdays) ? s.pattern.weekdays : [];
  if (!dias.length || dias.some(d => !Number.isInteger(d) || d < 1 || d > 7)) {
    throw new Error('INVALID_WEEKDAYS');
  }

  const tramos = [];
  if (s.pattern.outbound?.time) tramos.push({ direction: OCCURRENCE_DIRECTION.OUTBOUND, time: s.pattern.outbound.time, override: 'outboundTime' });
  if (s.pattern.return?.time) tramos.push({ direction: OCCURRENCE_DIRECTION.RETURN, time: s.pattern.return.time, override: 'returnTime' });
  if (!tramos.length) throw new Error('INVALID_PATTERN_TIMES');
  for (const tramo of tramos) {
    if (!HORA_RE.test(tramo.time)) throw new Error('INVALID_LOCAL_TIME');
  }

  const ocurrencias = [];
  // Se recorren las fechas LOCALES que tocan el horizonte (un día de margen a
  // cada lado para cubrir el corrimiento de zona) y se filtra por instante.
  const DIA_MS = 24 * 60 * 60 * 1000;
  for (let cursor = fromUtcMs - DIA_MS; cursor < toUtcMs + DIA_MS; cursor += DIA_MS) {
    const fechaLocal = utcToLocalDate(cursor, zona);
    if (ocurrencias.some(o => o.localDate === fechaLocal)) continue; // ya evaluada
    if (s.effectiveFrom && fechaLocal < s.effectiveFrom) continue;
    if (!dias.includes(localWeekday(fechaLocal, zona))) continue;
    if (dentroDePausa(fechaLocal, s.pauses)) continue;
    const excepcion = excepcionDe(fechaLocal, s.exceptions);
    if (excepcion?.skip) continue;

    for (const tramo of tramos) {
      const hora = excepcion?.[tramo.override] ?? tramo.time;
      if (!HORA_RE.test(String(hora))) throw new Error('INVALID_LOCAL_TIME');
      const instante = localTimeToUtc(fechaLocal, hora, zona);
      if (instante < fromUtcMs || instante >= toUtcMs) continue;
      ocurrencias.push({
        occurrenceKey: buildOccurrenceKey(s.id, fechaLocal, tramo.direction),
        direction: tramo.direction,
        localDate: fechaLocal,
        localTime: hora,
        scheduledPickupAtUtcMs: instante
      });
    }
  }

  ocurrencias.sort((a, b) => a.scheduledPickupAtUtcMs - b.scheduledPickupAtUtcMs);
  return ocurrencias;
}

// ---------------------------------------------------------------------------
// Validadores de persistencia (forma, no política de negocio)
// ---------------------------------------------------------------------------

const SUBSCRIPTION_STATUS = new Set(['ACTIVE', 'PAUSED', 'SUSPENDED_PAYMENT', 'CANCELLED', 'EXPIRED']);
const ASSIGNMENT_STATUS = new Set(['UNASSIGNED', 'OFFERED_PREFERRED', 'ASSIGNING', 'DRIVER_CONFIRMED',
  'BACKUP_REQUIRED', 'COVERAGE_CONFIRMED', 'AT_RISK', 'CANCELLED']);
const SERVICE_STATUS_RE = /^(PLANNED|ACTIVE|COMPLETED|NO_SHOW_PASSENGER|NO_SHOW_DRIVER|CANCELLED_[A-Z_]+)$/;

const coordenadaValida = (v, limite) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= limite;
const lugarValido = l => l && typeof l === 'object'
  && coordenadaValida(l.lat, 90) && coordenadaValida(l.lng, 180)
  && typeof l.address === 'string' && l.address.trim().length > 0;

function zonaValida(tz) {
  try { formatterDe(String(tz)); return true; } catch { return false; }
}

/** ¿El documento de suscripción tiene la forma persistible? Devuelve código o null. */
export function validateSubscriptionPayload(doc) {
  if (!doc || typeof doc !== 'object') return 'MALFORMED';
  if (!doc.id || !doc.passengerId) return 'MISSING_IDS';
  if (!SUBSCRIPTION_STATUS.has(doc.status)) return 'INVALID_STATUS';
  const plan = doc.plan;
  if (!plan || !Number.isInteger(plan.ridesIncluded) || plan.ridesIncluded < 0
    || !Number.isInteger(plan.ridesUsed) || plan.ridesUsed < 0
    || plan.ridesUsed > plan.ridesIncluded) return 'INVALID_PLAN_COUNTERS';
  if (!lugarValido(doc.route?.home) || !lugarValido(doc.route?.worksite)) return 'INVALID_ROUTE';
  const patron = doc.pattern;
  if (!patron || !Array.isArray(patron.weekdays) || !patron.weekdays.length
    || patron.weekdays.some(d => !Number.isInteger(d) || d < 1 || d > 7)) return 'INVALID_WEEKDAYS';
  if (patron.outbound?.time && !HORA_RE.test(patron.outbound.time)) return 'INVALID_TIME';
  if (patron.return?.time && !HORA_RE.test(patron.return.time)) return 'INVALID_TIME';
  if (!patron.outbound?.time && !patron.return?.time) return 'INVALID_TIME';
  if (!zonaValida(patron.timezone || DEFAULT_TIMEZONE)) return 'INVALID_TIMEZONE';
  if (doc.effectiveFrom && !esFechaCalendarioValida(doc.effectiveFrom)) return 'INVALID_EFFECTIVE_FROM';
  return null;
}

/** ¿El documento de ocurrencia tiene la forma persistible? Devuelve código o null. */
export function validateScheduledRidePayload(doc) {
  if (!doc || typeof doc !== 'object') return 'MALFORMED';
  if (!doc.id || !doc.subscriptionId || !doc.passengerId) return 'MISSING_IDS';
  if (!isValidOccurrenceKey(doc.occurrenceKey)) return 'INVALID_OCCURRENCE_KEY';
  if (!ASSIGNMENT_STATUS.has(doc.assignmentStatus)) return 'INVALID_ASSIGNMENT_STATUS';
  if (!SERVICE_STATUS_RE.test(String(doc.serviceStatus ?? ''))) return 'INVALID_SERVICE_STATUS';
  if (!lugarValido(doc.pickup) || !lugarValido(doc.destination)) return 'INVALID_ROUTE';
  if (!Number.isFinite(Date.parse(doc.scheduledPickupAt ?? ''))) return 'INVALID_PICKUP_AT';
  return null;
}
