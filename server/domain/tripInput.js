// Validación y normalización de lo que un pasajero envía al pedir una carrera.
// Funciones puras, sin acceso a la base de datos, para poder probarlas solas.

/**
 * Identificador de viaje.
 *
 * Se conserva el identificador que genera el cliente en lugar de imponer uno
 * del servidor porque la app del pasajero no adopta el viaje devuelto: guarda
 * su propio `currentTrip.id` y con él cancela la carrera, correlaciona los
 * eventos de Socket.IO y construye la clave de la cola sin conexión. Cambiarlo
 * por un identificador del servidor rompería esa correlación en el cliente ya
 * desplegado. Lo que sí se exige aquí es forma acotada; la unicidad y la
 * propiedad se comprueban en la ruta.
 */
const TRIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function normalizeTripId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return TRIP_ID_PATTERN.test(id) ? id : null;
}

/** Métodos de pago canónicos y los alias que hoy envían las pantallas. */
export const PAYMENT_METHODS = Object.freeze({
  WALLET: 'WALLET',
  CASH: 'CASH',
  PAGO_MOVIL: 'PAGO_MOVIL',
  ZELLE: 'ZELLE',
  ZINLI: 'ZINLI'
});

const PAYMENT_ALIASES = Object.freeze({
  WALLET: PAYMENT_METHODS.WALLET,
  BILLETERA: PAYMENT_METHODS.WALLET,
  BILLETERA_EXPRESS: PAYMENT_METHODS.WALLET,
  CASH: PAYMENT_METHODS.CASH,
  CASH_USD: PAYMENT_METHODS.CASH,
  EFECTIVO: PAYMENT_METHODS.CASH,
  PAGO_MOVIL: PAYMENT_METHODS.PAGO_MOVIL,
  PAGOMOVIL: PAYMENT_METHODS.PAGO_MOVIL,
  ZELLE: PAYMENT_METHODS.ZELLE,
  ZINLI: PAYMENT_METHODS.ZINLI
});

/** Devuelve el método canónico, o null si no se reconoce. */
export function normalizePaymentMethod(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!key) return null;
  return PAYMENT_ALIASES[key] ?? null;
}

// Límites derivados de reglas que ya existen en el servidor, no inventados:
// el radio máximo de despacho acota el área operativa, y la ventana de 12 h
// con la que /trips/active/me considera vivo un viaje acota su duración.
export const DEFAULT_DISPATCH_RADIUS_KM = 15;

/**
 * Un radio mal configurado no puede desactivar las comprobaciones: `NaN`,
 * `Infinity`, cero o un valor negativo harían que ninguna distancia superara
 * el límite. Ante cualquiera de esos casos se vuelve al valor por defecto.
 */
export function resolveDispatchRadiusKm(rawValue) {
  // Solo número o cadena numérica: `Number(true)` vale 1 y `Number([])` vale 0,
  // así que el tipo se comprueba antes de convertir.
  const isNumeric = typeof rawValue === 'number';
  const isNumericText = typeof rawValue === 'string' && rawValue.trim() !== '';
  if (!isNumeric && !isNumericText) return DEFAULT_DISPATCH_RADIUS_KM;
  const radius = Number(rawValue);
  if (!Number.isFinite(radius) || radius <= 0) return DEFAULT_DISPATCH_RADIUS_KM;
  return radius;
}

export const MAX_DISPATCH_RADIUS_KM = resolveDispatchRadiusKm(process.env.MAX_DISPATCH_RADIUS_KM);
export const MAX_TRIP_DISTANCE_KM = MAX_DISPATCH_RADIUS_KM * 10;
export const MAX_TRIP_DURATION_MIN = 12 * 60;

/**
 * Métricas de ruta. Devuelve `{ distanceKm, durationMin }` cuando ambas son
 * utilizables, `null` cuando faltan las dos, y lanza `INVALID_ROUTE_METRICS`
 * cuando vienen presentes pero fuera de rango.
 */
export function normalizeRouteMetrics({ distanceKm, durationMin } = {}) {
  const faltaDistancia = distanceKm === undefined || distanceKm === null || distanceKm === '';
  const faltaDuracion = durationMin === undefined || durationMin === null || durationMin === '';
  if (faltaDistancia && faltaDuracion) return null;

  // `Number([])` y `Number(null)` valen 0, así que el tipo original se
  // comprueba antes de convertir: solo número o cadena numérica.
  const convertible = value => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  const distancia = convertible(distanceKm) ? Number(distanceKm) : NaN;
  const duracion = convertible(durationMin) ? Number(durationMin) : NaN;
  const valida = value => Number.isFinite(value) && value >= 0;

  if (!valida(distancia) || !valida(duracion)) {
    const error = new Error('INVALID_ROUTE_METRICS');
    error.code = 'INVALID_ROUTE_METRICS';
    throw error;
  }
  if (distancia > MAX_TRIP_DISTANCE_KM || duracion > MAX_TRIP_DURATION_MIN) {
    const error = new Error('ROUTE_METRICS_OUT_OF_RANGE');
    error.code = 'ROUTE_METRICS_OUT_OF_RANGE';
    throw error;
  }
  return { distanceKm: distancia, durationMin: duracion };
}

/**
 * Estimación de tarifa enviada por el cliente.
 *
 * Solo se usa como respaldo cuando el servidor no puede calcular la tarifa,
 * porque no dispone de una fuente propia de distancia y duración. Se acota
 * para que un valor absurdo no llegue a convertirse en importe cobrable.
 */
export const MAX_CLIENT_FARE_USD = 500;

export function normalizeClientFareEstimate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' || typeof value === 'boolean') return null;
  const fare = Number(value);
  if (!Number.isFinite(fare) || fare <= 0 || fare > MAX_CLIENT_FARE_USD) return null;
  return Math.round((fare + Number.EPSILON) * 100) / 100;
}
