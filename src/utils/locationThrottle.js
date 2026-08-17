/**
 * Regulador de envío de posición del conductor.
 *
 * `watchPosition` con `enableHighAccuracy` entrega muestras varias veces por
 * segundo en un vehículo en marcha, y cada una emitía un evento de socket y
 * además una petición REST. Eso castiga la batería y los datos del teléfono
 * del conductor —que es quien paga ambos— y supera el techo de frecuencia del
 * servidor.
 *
 * Aquí se decide qué muestras merecen viajar:
 *
 *  - Nunca más de una cada `minIntervalMs`. Es un suelo duro: por rápido que
 *    se mueva la moto, no se envía más a menudo.
 *  - Por debajo de ese suelo, se envía si la moto se ha movido de verdad.
 *  - Y si está parada, se manda una señal de vida cada `heartbeatMs` para que
 *    el servidor y el pasajero sepan que sigue ahí.
 *
 * El regulador no guarda la muestra ni la transforma: solo responde sí o no,
 * de modo que quien llama conserva el control de lo que envía.
 */

export const DEFAULT_MIN_INTERVAL_MS = 2000;
export const DEFAULT_HEARTBEAT_MS = 15_000;
export const DEFAULT_MIN_DISTANCE_METERS = 10;

const RADIO_TERRESTRE_M = 6_371_000;
const GRADOS_A_RADIANES = Math.PI / 180;

/**
 * Distancia aproximada en metros entre dos coordenadas.
 *
 * Aproximación equirectangular: a las distancias que separan dos muestras de
 * GPS consecutivas el error es despreciable y evita las trigonométricas caras
 * de la fórmula del semiverseno en un bucle que se ejecuta constantemente.
 */
export function approximateDistanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const lat1 = Number(a.latitude);
  const lng1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lng2 = Number(b.longitude);
  // Una coordenada ilegible no puede hacer pasar por «quieta» a una moto en
  // marcha: se trata como distancia infinita, que siempre permite el envío.
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;

  const latMedia = ((lat1 + lat2) / 2) * GRADOS_A_RADIANES;
  const x = (lng2 - lng1) * GRADOS_A_RADIANES * Math.cos(latMedia);
  const y = (lat2 - lat1) * GRADOS_A_RADIANES;
  return Math.sqrt(x * x + y * y) * RADIO_TERRESTRE_M;
}

export function createLocationThrottle({
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  minDistanceMeters = DEFAULT_MIN_DISTANCE_METERS
} = {}) {
  let ultimoEnvio = null;      // marca de tiempo del último envío aceptado
  let ultimaPosicion = null;   // posición de ese envío

  /**
   * @returns {boolean} si esta muestra debe enviarse.
   */
  function shouldSend(posicion, ahora = Date.now()) {
    if (!posicion) return false;
    // La primera muestra siempre viaja: es la que sitúa al conductor.
    if (ultimoEnvio === null) return true;

    const transcurrido = ahora - ultimoEnvio;
    // Suelo duro. Va antes que cualquier otra consideración para que ninguna
    // combinación de movimiento y tiempo pueda saltárselo.
    if (transcurrido < minIntervalMs) return false;

    if (approximateDistanceMeters(ultimaPosicion, posicion) >= minDistanceMeters) return true;
    // Parada: señal de vida espaciada.
    return transcurrido >= heartbeatMs;
  }

  /** Se llama solo cuando el envío se ha realizado de verdad. */
  function markSent(posicion, ahora = Date.now()) {
    ultimoEnvio = ahora;
    ultimaPosicion = posicion;
  }

  /** Tras una reconexión conviene volver a enviar la primera muestra. */
  function reset() {
    ultimoEnvio = null;
    ultimaPosicion = null;
  }

  return { shouldSend, markSent, reset, minIntervalMs, heartbeatMs, minDistanceMeters };
}
