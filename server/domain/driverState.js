// Estados que un conductor puede fijar por su cuenta desde la app.
export const DRIVER_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  IN_TRIP: 'IN_TRIP',
  OFFLINE: 'OFFLINE'
});

// Estados internos que solamente administración puede asignar.
export const ADMIN_DRIVER_STATUS = Object.freeze({
  SUSPENDED: 'SUSPENDED',
  PENDING_APPROVAL: 'PENDING_APPROVAL'
});

// `ONLINE` sobrevive en clientes y registros antiguos con el mismo significado
// que `AVAILABLE`; se normaliza en lugar de rechazarse para no romper sesiones.
const STATUS_ALIASES = Object.freeze({
  ONLINE: DRIVER_STATUS.AVAILABLE,
  DISPONIBLE: DRIVER_STATUS.AVAILABLE,
  OCUPADO: DRIVER_STATUS.BUSY,
  EN_VIAJE: DRIVER_STATUS.IN_TRIP,
  DESCONECTADO: DRIVER_STATUS.OFFLINE
});

const SELF_ASSIGNABLE = new Set(Object.values(DRIVER_STATUS));
const ALL_DRIVER_STATUSES = new Set([...SELF_ASSIGNABLE, ...Object.values(ADMIN_DRIVER_STATUS)]);

/**
 * Devuelve el estado canónico que el propio conductor puede asignarse, o null
 * si el valor no está expresamente permitido. Los estados administrativos
 * (`SUSPENDED`, `PENDING_APPROVAL`) se rechazan aquí a propósito: un conductor
 * no debe poder auto-suspenderse ni auto-reactivarse.
 */
export function normalizeDriverStatus(status) {
  const raw = String(status ?? '').trim().toUpperCase().replaceAll(' ', '_');
  if (!raw) return null;
  const canonical = STATUS_ALIASES[raw] || raw;
  return SELF_ASSIGNABLE.has(canonical) ? canonical : null;
}

export function isKnownDriverStatus(status) {
  const raw = String(status ?? '').trim().toUpperCase().replaceAll(' ', '_');
  return ALL_DRIVER_STATUSES.has(STATUS_ALIASES[raw] || raw);
}

export function isValidLatitude(value) {
  const latitude = Number(value);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

export function isValidLongitude(value) {
  const longitude = Number(value);
  return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

/**
 * Normaliza un par de coordenadas admitiendo los nombres que usan los clientes
 * (`lat`/`latitude`, `lng`/`longitude`). Devuelve null si algo está fuera de
 * rango, no es finito o viene vacío.
 */
export function normalizeCoordinates(input = {}) {
  const rawLat = input?.lat ?? input?.latitude;
  const rawLng = input?.lng ?? input?.longitude;
  if (rawLat === null || rawLat === undefined || String(rawLat).trim() === '') return null;
  if (rawLng === null || rawLng === undefined || String(rawLng).trim() === '') return null;
  if (!isValidLatitude(rawLat) || !isValidLongitude(rawLng)) return null;
  const heading = Number(input?.heading);
  return {
    lat: Number(rawLat),
    lng: Number(rawLng),
    heading: Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0
  };
}
