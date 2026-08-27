/**
 * Puente entre el service worker y la aplicacion.
 *
 * El worker no puede navegar ni consultar el backend: no tiene sesion. Lo que
 * hace es mandar un mensaje, y aqui se decide que hacer con el.
 *
 * El mensaje se trata como DATO, no como orden. Solo se aceptan dos formas
 * conocidas y se valida su estructura campo a campo; cualquier otra cosa se
 * ignora en silencio. Nada de despachar por nombre lo que venga en `type`.
 */

export const PUSH_NAVIGATE_EVENT = '58express:push-navigate';

/** Formas admitidas. Cualquier mensaje que no encaje se descarta. */
export function parsePushMessage(data) {
  if (!data || typeof data !== 'object') return null;

  if (data.type === 'push:navigate') {
    if (data.target !== 'driver_ride_request') return null;
    const tripId = typeof data.tripId === 'string' && data.tripId !== '' ? data.tripId : null;
    return { kind: 'navigate', target: 'driver_ride_request', tripId };
  }

  if (data.type === 'push:resubscribe-required') {
    return { kind: 'resubscribe', resubscribed: data.resubscribed === true };
  }

  return null;
}

/**
 * @param {object} deps
 * @param {object} deps.navigatorRef  para `navigator.serviceWorker`
 * @param {object} deps.windowRef     para eventos y navegacion
 * @param {() => object|null} deps.getCurrentUser
 * @param {() => Promise<object>} deps.getPushService  reconciliacion diferida
 */
export function installPushMessageHandler({
  navigatorRef = typeof navigator !== 'undefined' ? navigator : undefined,
  windowRef = typeof window !== 'undefined' ? window : undefined,
  getCurrentUser = () => null,
  getPushService = null
} = {}) {
  if (!navigatorRef?.serviceWorker?.addEventListener || !windowRef) return () => {};

  const alRecibir = (evento) => {
    const mensaje = parsePushMessage(evento?.data);
    if (!mensaje) return;

    if (mensaje.kind === 'resubscribe') {
      // El endpoint rotó. El worker no puede registrarlo en el servidor
      // --no tiene token--, asi que la reconciliacion la hace la aplicacion,
      // que si esta autenticada.
      if (typeof getPushService === 'function') {
        Promise.resolve(getPushService())
          .then(servicio => servicio?.reconcile?.())
          .catch(() => {});
      }
      return;
    }

    const usuario = getCurrentUser();

    // Sin sesion --el aviso pudo tocarse dias despues, con el token ya
    // caducado-- se va al inicio y el flujo de autenticacion existente hace su
    // trabajo. No se guarda el viaje en localStorage para «recordarlo»: seria
    // material privado persistido sin necesidad.
    if (!usuario || usuario.role !== 'driver') {
      windowRef.location.hash = '#/';
      return;
    }

    if (windowRef.location.hash !== '#/driver') {
      windowRef.location.hash = '#/driver';
    }

    // El payload del push NO es fuente de verdad: es un timbre. La pantalla
    // del conductor consulta el estado autorizado al backend al recibir esto,
    // y si el viaje caduco o lo acepto otro, muestra lo que hay de verdad.
    windowRef.dispatchEvent(new CustomEvent(PUSH_NAVIGATE_EVENT, {
      detail: { tripId: mensaje.tripId }
    }));
  };

  navigatorRef.serviceWorker.addEventListener('message', alRecibir);
  return () => navigatorRef.serviceWorker.removeEventListener?.('message', alRecibir);
}
