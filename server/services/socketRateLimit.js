/**
 * Limitación de frecuencia por socket y por evento.
 *
 * El flanco HTTP tiene limitadores en autenticación y en solicitudes de
 * conductor, pero los eventos de Socket.IO no tenían ninguno: una sesión
 * autenticada podía emitir `driver:location` o `chat:send_message` en bucle
 * sin restricción, y cada uno escribe en disco y difunde a otras salas.
 *
 * Se usa una ventana fija por evento, que es barata y suficiente aquí: no se
 * trata de repartir capacidad con precisión, sino de poner un techo muy por
 * encima del uso legítimo y muy por debajo de lo que hace daño.
 *
 * El contador vive en el socket y muere con él, así que no hay estructura
 * global que crezca. Solo se cuentan eventos que la aplicación registra: un
 * nombre de evento inventado nunca llega hasta aquí.
 */

// Ventanas de diez segundos. Los topes están calculados sobre el uso real:
// `watchPosition` en una moto en marcha emite del orden de una vez por
// segundo, y una persona no envía diez mensajes en diez segundos.
export const DEFAULT_EVENT_LIMITS = Object.freeze({
  'driver:location': { limit: 20, windowMs: 10_000 },
  'driver:location_update': { limit: 20, windowMs: 10_000 },
  'passenger:location_update': { limit: 20, windowMs: 10_000 },
  'chat:send_message': { limit: 10, windowMs: 10_000 },
  'driver:connect': { limit: 10, windowMs: 10_000 },
  'driver:status': { limit: 10, windowMs: 10_000 },
  'driver:status_change': { limit: 10, windowMs: 10_000 },
  'rideRequested': { limit: 10, windowMs: 10_000 },
  'rideAccepted': { limit: 20, windowMs: 10_000 },
  'rideRejected': { limit: 20, windowMs: 10_000 },
  'rideCancelled': { limit: 10, windowMs: 10_000 },
  'tripStatusUpdated': { limit: 20, windowMs: 10_000 },
  'tripRated': { limit: 10, windowMs: 10_000 },
  'join:room': { limit: 20, windowMs: 10_000 }
});

// Cualquier evento sin regla propia. Que exista este techo es lo que impide
// que añadir un evento nuevo lo deje sin protección por descuido.
export const DEFAULT_FALLBACK = Object.freeze({ limit: 30, windowMs: 10_000 });

/**
 * Crea el contador de UN socket. Se descarta al desconectar.
 */
export function createEventRateLimiter({
  limits = DEFAULT_EVENT_LIMITS,
  fallback = DEFAULT_FALLBACK,
  now = Date.now
} = {}) {
  /** @type {Map<string, { usados: number, reinicioEn: number, avisado: boolean }>} */
  const ventanas = new Map();

  function reglaDe(event) {
    const regla = Object.prototype.hasOwnProperty.call(limits, event) ? limits[event] : null;
    return regla || fallback;
  }

  /**
   * Devuelve `null` si el evento puede procesarse, o el detalle del rechazo si
   * ha superado el techo.
   *
   * `notificar` solo es cierto la primera vez que se rechaza dentro de una
   * ventana: si se respondiera a cada evento descartado, quien inunda
   * conseguiría que el servidor emitiera un mensaje por cada uno de los suyos.
   */
  function check(event) {
    const { limit, windowMs } = reglaDe(event);
    const ahora = now();
    let ventana = ventanas.get(event);

    if (!ventana || ahora >= ventana.reinicioEn) {
      ventana = { usados: 0, reinicioEn: ahora + windowMs, avisado: false };
      ventanas.set(event, ventana);
    }

    if (ventana.usados < limit) {
      ventana.usados += 1;
      return null;
    }

    const notificar = !ventana.avisado;
    ventana.avisado = true;
    return { event, limit, windowMs, retryAfterMs: Math.max(0, ventana.reinicioEn - ahora), notificar };
  }

  return { check };
}
