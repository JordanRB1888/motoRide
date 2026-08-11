export const DEFAULT_BUSINESS_TIME_ZONE = 'America/Caracas';

const formatterCache = new Map();

function createFormatter(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function isSupportedTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    createFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

// La operación es de Venezuela: cualquier zona inválida cae al horario de Caracas
// en vez de degradar silenciosamente a la zona del servidor.
export function resolveBusinessTimeZone(candidate) {
  const requested = String(candidate ?? '').trim();
  if (!requested) return DEFAULT_BUSINESS_TIME_ZONE;
  if (isSupportedTimeZone(requested)) return requested;
  console.warn(`[+58express Pricing] BUSINESS_TIME_ZONE inválida (${requested}); se usa ${DEFAULT_BUSINESS_TIME_ZONE}.`);
  return DEFAULT_BUSINESS_TIME_ZONE;
}

function getFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = createFormatter(timeZone);
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Descompone un instante en la hora local del negocio, sin depender de la
 * zona horaria del proceso ni del sistema operativo del servidor.
 */
export function getBusinessTimeParts(instant = new Date(), timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) {
    const error = new Error('INVALID_BUSINESS_INSTANT');
    error.code = 'INVALID_BUSINESS_INSTANT';
    throw error;
  }
  const zone = resolveBusinessTimeZone(timeZone);
  const parts = Object.fromEntries(
    getFormatter(zone).formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );
  return {
    timeZone: zone,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // Intl puede devolver 24 para medianoche en algunas plataformas.
    hour: parts.hour % 24,
    minute: parts.minute
  };
}

export function getBusinessHour(instant = new Date(), timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
  return getBusinessTimeParts(instant, timeZone).hour;
}
