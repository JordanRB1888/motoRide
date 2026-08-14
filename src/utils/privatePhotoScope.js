import { canonicalPhotoPath } from './privatePhoto.js';

/**
 * Alcance de la fotografía del viaje.
 *
 * El cargador de fotografías vive lo que vive la pantalla del pasajero, pero la
 * autorización para ver la fotografía del conductor dura solo lo que dura el
 * viaje. Sin un alcance explícito, el object URL de un conductor sobrevivía al
 * viaje y solo moría cuando el enrutador destruía la aplicación entera.
 *
 * Este controlador compara la identidad vigente con la siguiente y decide
 * cuándo hay que revocar. La decisión vive aquí, no repartida en llamadas
 * sueltas por cada transición.
 */

/** Estados en los que el pasajero todavía comparte viaje con su conductor. */
export const SCOPED_STATES = Object.freeze([
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'IN_TRIP'
]);

/**
 * Identidad del alcance, o `null` si no hay ninguno abierto.
 *
 * `null` significa «revoca»: es lo que devuelven COMPLETED, CANCELLED, IDLE,
 * la selección de destino y cualquier estado sin conductor o sin fotografía.
 */
export function photoScopeIdentity(state, trip, driver) {
  if (!SCOPED_STATES.includes(state)) return null;
  const photoPath = canonicalPhotoPath(driver?.photoUrl);
  if (!trip?.id || !driver?.id || !photoPath) return null;
  return { tripId: String(trip.id), driverId: String(driver.id), photoPath };
}

/** Clave comparable. Cambiar viaje, conductor o fotografía cambia el alcance. */
export function photoScopeKey(identity) {
  if (!identity) return null;
  return `${identity.tripId}|${identity.driverId}|${identity.photoPath}`;
}

export function createPrivatePhotoScope({ loader } = {}) {
  let currentKey = null;

  /**
   * Sincroniza el alcance con el estado del viaje.
   *
   * Devuelve `{ changed, open }`: `changed` indica que se revocó lo anterior,
   * `open` si queda un alcance vigente. Repetir la misma llamada no revoca ni
   * vuelve a descargar nada, así que es seguro invocarla en cada render.
   */
  function sync(state, trip, driver) {
    const identity = photoScopeIdentity(state, trip, driver);
    const key = photoScopeKey(identity);
    if (key === currentKey) return { changed: false, open: Boolean(key) };
    // Todo lo del alcance anterior muere antes de abrir el siguiente.
    loader?.releaseAll?.();
    currentKey = key;
    return { changed: true, open: Boolean(key) };
  }

  /** Cierre explícito, para cuando se cancela antes de repintar. */
  function close() {
    if (currentKey === null) return false;
    loader?.releaseAll?.();
    currentKey = null;
    return true;
  }

  return { sync, close, get key() { return currentKey; } };
}
