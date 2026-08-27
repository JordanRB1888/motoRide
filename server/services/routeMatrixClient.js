/**
 * Cliente de Google Routes — Compute Route Matrix (DISPATCH-2A).
 *
 * SOLO servidor. Habla con el web service oficial
 * `routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix` con una
 * credencial DEDICADA de servidor (`DISPATCH_ROUTES_API_KEY`) que jamas es
 * la clave del navegador, jamas se imprime y jamas sale de este proceso.
 *
 * A Google viajan SOLO datos de enrutado: coordenadas de origenes (posiciones
 * aceptadas de conductores), un destino (la recogida canonica) y parametros
 * de viaje. Ni nombres, ni telefonos, ni identificadores, ni JWT: el mapeo
 * candidato→indice de matriz es estado interno del servidor.
 *
 * La mascara de campos pide LO MINIMO para ordenar: indices, condicion,
 * duracion y distancia. Sin polilineas, sin pasos, sin peajes, sin textos.
 */

export const ROUTE_MATRIX_ERROR = Object.freeze({
  NOT_CONFIGURED: 'ROUTE_MATRIX_NOT_CONFIGURED',
  TIMEOUT: 'ROUTE_MATRIX_TIMEOUT',
  PROVIDER_ERROR: 'ROUTE_MATRIX_PROVIDER_ERROR',
  MALFORMED: 'ROUTE_MATRIX_MALFORMED'
});

const ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const FIELD_MASK = 'originIndex,destinationIndex,condition,duration,distanceMeters';

/** '123s' | '123.45s' → milisegundos, o null si no es utilizable. */
export function parseDurationMillis(duration) {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String(duration ?? ''));
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

export function createRouteMatrixClient({
  apiKey = process.env.DISPATCH_ROUTES_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 1_500,
  logger = console
} = {}) {
  const clave = typeof apiKey === 'string' ? apiKey.trim() : '';

  return {
    isConfigured() {
      return clave.length > 0;
    },

    /**
     * @param {{lat,lng}[]} origins  posiciones ACEPTADAS de los conductores
     * @param {{lat,lng}} destination  recogida canonica
     * @returns {Promise<Array<{originIndex, etaMillis, roadDistanceMeters}>>}
     *   SOLO los elementos con ruta valida; el que falte se trata aguas
     *   arriba como sin-resultado (jamas elimina a un conductor).
     */
    async computeToPickup(origins, destination) {
      if (!this.isConfigured()) throw new Error(ROUTE_MATRIX_ERROR.NOT_CONFIGURED);
      if (!Array.isArray(origins) || !origins.length || !destination) {
        throw new Error(ROUTE_MATRIX_ERROR.MALFORMED);
      }

      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      let respuesta;
      try {
        respuesta = await fetchImpl(ENDPOINT, {
          method: 'POST',
          signal: abort.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': clave,
            'X-Goog-FieldMask': FIELD_MASK
          },
          body: JSON.stringify({
            origins: origins.map(punto => ({
              waypoint: { location: { latLng: { latitude: punto.lat, longitude: punto.lng } } }
            })),
            destinations: [{
              waypoint: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } }
            }],
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE'
          })
        });
      } catch (error) {
        // El nombre del error de red puede arrastrar la URL; se traduce.
        throw new Error(error?.name === 'AbortError'
          ? ROUTE_MATRIX_ERROR.TIMEOUT
          : ROUTE_MATRIX_ERROR.PROVIDER_ERROR);
      } finally {
        clearTimeout(timer);
      }

      if (!respuesta.ok) {
        // Jamas se registra el cuerpo (podria citar la clave o la peticion).
        logger.warn?.(`[+58express Dispatch] Route Matrix respondio ${respuesta.status}`);
        throw new Error(ROUTE_MATRIX_ERROR.PROVIDER_ERROR);
      }

      let elementos;
      try {
        elementos = await respuesta.json();
      } catch {
        throw new Error(ROUTE_MATRIX_ERROR.MALFORMED);
      }
      if (!Array.isArray(elementos)) throw new Error(ROUTE_MATRIX_ERROR.MALFORMED);

      const validos = [];
      for (const elemento of elementos) {
        const etaMillis = parseDurationMillis(elemento?.duration);
        const condicionOk = elemento?.condition === undefined || elemento.condition === 'ROUTE_EXISTS';
        if (!condicionOk || etaMillis === null || !Number.isInteger(elemento?.originIndex)) continue;
        validos.push({
          originIndex: elemento.originIndex,
          etaMillis,
          roadDistanceMeters: Number.isFinite(Number(elemento.distanceMeters))
            ? Number(elemento.distanceMeters) : null
        });
      }
      return validos;
    }
  };
}
