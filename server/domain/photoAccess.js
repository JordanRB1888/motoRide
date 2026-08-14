import { TRIP_STATUS, normalizeTripStatus } from './tripStateMachine.js';

/**
 * Quién puede obtener la fotografía privada de una persona.
 *
 * La fotografía de perfil es el mismo material que un documento de
 * verificación: al aprobar una solicitud, la selfie del expediente se copia
 * como foto de perfil. Por eso su acceso se decide aquí, con una regla
 * explícita, y no por el hecho de conocer un identificador.
 */

/**
 * Estados en los que dos participantes siguen compartiendo un viaje.
 *
 * Se derivan de los estados canónicos: activo es todo lo que no es terminal.
 * `COMPLETED` y `CANCELLED` cierran el viaje y con él el acceso mutuo.
 */
export const ACTIVE_TRIP_STATUSES = Object.freeze([
  TRIP_STATUS.SEARCHING,
  TRIP_STATUS.DRIVER_ASSIGNED,
  TRIP_STATUS.ARRIVED,
  TRIP_STATUS.IN_PROGRESS
]);

const TERMINAL = Object.freeze([TRIP_STATUS.COMPLETED, TRIP_STATUS.CANCELLED]);

/** Acepta los alias históricos (`EN_ROUTE`, `IN_TRIP`, `ACCEPTED`…) vía normalización. */
export function isActiveTripStatus(status) {
  const canonical = normalizeTripStatus(status);
  return ACTIVE_TRIP_STATUSES.includes(canonical) && !TERMINAL.includes(canonical);
}

/** ¿Estas dos personas son las dos partes de ese viaje? */
function areCounterparts(trip, oneId, otherId) {
  if (!trip?.passengerId || !trip?.driverId) return false;
  return (
    (trip.passengerId === oneId && trip.driverId === otherId) ||
    (trip.driverId === oneId && trip.passengerId === otherId)
  );
}

/**
 * Decide si `viewer` puede obtener la fotografía de `targetId`.
 *
 * Devuelve un motivo además del veredicto para que la ruta pueda distinguir
 * el caso legítimo sin fotografía de todo lo demás, sin filtrar nada al
 * exterior: quien no está autorizado recibe siempre la misma respuesta.
 */
export function canViewUserPhoto({ viewer, targetId, trips = [] } = {}) {
  if (!viewer?.id || !targetId || typeof targetId !== 'string') {
    return { allowed: false, reason: 'NO_RELATION' };
  }
  // 1. El titular siempre puede ver la suya.
  if (viewer.id === targetId) return { allowed: true, reason: 'OWNER' };
  // 2. Administración la necesita para la gestión, sin depender de un viaje.
  if (viewer.role === 'admin') return { allowed: true, reason: 'ADMIN' };
  // 3. La contraparte, únicamente mientras el viaje siga abierto.
  const shared = (Array.isArray(trips) ? trips : []).some(
    trip => isActiveTripStatus(trip?.status) && areCounterparts(trip, viewer.id, targetId)
  );
  if (shared) return { allowed: true, reason: 'ACTIVE_TRIP' };
  return { allowed: false, reason: 'NO_RELATION' };
}

/**
 * Ruta autenticada desde la que se obtiene una fotografía.
 *
 * Se compone siempre a partir del identificador, con el prefijo `/api`. Sin él
 * la petición no llega al backend: cae en el rewrite de la SPA y devuelve HTML
 * con estado 200, de modo que el fallo se manifiesta como una imagen rota en
 * lugar de como un error.
 */
export function userPhotoEndpoint(userId) {
  return `/api/users/${encodeURIComponent(String(userId ?? ''))}/photo`;
}

/**
 * URL que se publica en una proyección.
 *
 * Se deriva del almacenamiento real, nunca del valor persistido: los registros
 * antiguos guardan rutas sin el prefijo `/api`, y cualquier valor externo
 * heredado dejaría de ser una fotografía privada de la aplicación.
 */
export function userPhotoUrl(user) {
  return user?.photoStorageKey ? userPhotoEndpoint(user.id) : null;
}
