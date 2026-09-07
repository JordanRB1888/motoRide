/**
 * Cliente de Google Routes — Compute Routes, para la GEOMETRÍA (ROUTE-1).
 *
 * SOLO servidor. Hermano de `routeMatrixClient.js`, y deliberadamente aparte:
 * aquél ordena candidatos para el despacho y pide explícitamente «sin
 * polilíneas» porque no las necesita; éste pide justo la polilínea y nada más.
 * Mezclarlos habría hecho que ordenar conductores empezara a descargar
 * geometría que se tira.
 *
 * LA CREDENCIAL ES LA MISMA, Y LAS REGLAS TAMBIÉN
 *
 * `DISPATCH_ROUTES_API_KEY`: una credencial DEDICADA de servidor que jamás es
 * la clave del navegador ni la del móvil, jamás se imprime y jamás sale de este
 * proceso. Si no está configurada, este cliente lo dice y no llama a nadie.
 *
 * A Google viajan SOLO dos coordenadas y el modo de viaje. Ni nombres, ni
 * teléfonos, ni identificadores de viaje, ni JWT.
 *
 * LA MÁSCARA DE CAMPOS PIDE LO MÍNIMO
 *
 * La polilínea, los metros y la duración. Sin pasos, sin peajes, sin
 * instrucciones, sin textos: todo eso se paga y no se usa. La distancia y la
 * duración se piden porque vienen en la misma respuesta y responden con la
 * geometría de verdad; NO sustituyen a `tripMetrics`, que sigue siendo quien
 * fija lo que se cobra.
 *
 * SI FALLA, NO HAY GEOMETRÍA
 *
 * Nunca se devuelve una recta entre los dos extremos. Una recta dibujada sobre
 * un mapa se lee como «por aquí se va», y por ahí puede no haber calle. El
 * respaldo geodésico existe para MEDIR —y ahí es honesto, es el servidor
 * midiendo con su propia regla— pero no para DIBUJAR.
 */

import { decodificarPolilinea, adelgazarRuta } from '../domain/polilinea.js';
import { crearAuthDeMaps } from './googleMapsAuth.js';

export const ROUTE_GEOMETRY_ERROR = Object.freeze({
  NOT_CONFIGURED: 'ROUTE_GEOMETRY_NOT_CONFIGURED',
  TIMEOUT: 'ROUTE_GEOMETRY_TIMEOUT',
  PROVIDER_ERROR: 'ROUTE_GEOMETRY_PROVIDER_ERROR',
  MALFORMED: 'ROUTE_GEOMETRY_MALFORMED'
});

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration';

/** '123s' | '123.45s' → milisegundos, o null. Mismo formato que el matrix. */
export function parseDurationMillis(duration) {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String(duration ?? ''));
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

/**
 * Traduce la respuesta de Google a lo que se publica.
 *
 * Pura y exportada a propósito: es donde de verdad se puede equivocar uno, y
 * hay que poder comprobarla sin red.
 */
export function leerRespuestaDeRutas(cuerpo) {
  const ruta = Array.isArray(cuerpo?.routes) ? cuerpo.routes[0] : null;
  if (!ruta) return null;

  const puntos = decodificarPolilinea(ruta.polyline?.encodedPolyline);
  // Un solo punto no es una ruta: no se puede dibujar una línea con él, y
  // publicarlo haría que el mapa enseñara una mancha.
  if (puntos.length < 2) return null;

  return {
    puntos: adelgazarRuta(puntos),
    metros: Number.isFinite(Number(ruta.distanceMeters)) ? Number(ruta.distanceMeters) : null,
    duracionMs: parseDurationMillis(ruta.duration)
  };
}

export function createRouteGeometryClient({
  apiKey = process.env.DISPATCH_ROUTES_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 2_500,
  logger = console,
  // La autoridad de auth. Por omision se construye una con lo que haya en el
  // entorno: cuenta de servicio si existe, clave si no. Quien monta el
  // servidor le pasa la COMPARTIDA, para que el token se cachee una sola vez.
  // Declarada DESPUES de `logger` a proposito: los parametros por defecto se
  // evaluan en orden y aqui se lee `logger`.
  auth = crearAuthDeMaps({ apiKey, logger })
} = {}) {
  return {
    isConfigured() {
      return auth.estaConfigurado();
    },

    /** Con que se esta autenticando: 'oauth' | 'api-key' | 'sin-configurar'. */
    get authMode() {
      return auth.modo;
    },

    /**
     * La geometría de UN tramo.
     *
     * @param {{lat:number,lng:number}} origen
     * @param {{lat:number,lng:number}} destino
     * @returns {Promise<{puntos:Array,metros:number|null,duracionMs:number|null}>}
     * @throws con uno de los `ROUTE_GEOMETRY_ERROR`. Quien llama degrada; aquí
     *         no se inventa una recta.
     */
    async computeRoute(origen, destino) {
      if (!this.isConfigured()) throw new Error(ROUTE_GEOMETRY_ERROR.NOT_CONFIGURED);
      if (!origen || !destino) throw new Error(ROUTE_GEOMETRY_ERROR.MALFORMED);

      // Las cabeceras ANTES de abrir el reloj: pedir un token es una llamada
      // suya y no debe gastar el tiempo que le toca a la ruta.
      let cabecerasDeAuth;
      try {
        cabecerasDeAuth = await auth.cabeceras();
      } catch {
        // El codigo del fallo de auth no sale de aqui: quien llama degrada
        // igual que con cualquier otro fallo del proveedor.
        throw new Error(ROUTE_GEOMETRY_ERROR.PROVIDER_ERROR);
      }

      const abort = new AbortController();
      const reloj = setTimeout(() => abort.abort(), timeoutMs);

      let respuesta;
      try {
        respuesta = await fetchImpl(ENDPOINT, {
          method: 'POST',
          signal: abort.signal,
          headers: {
            'Content-Type': 'application/json',
            ...cabecerasDeAuth,
            'X-Goog-FieldMask': FIELD_MASK
          },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: origen.lat, longitude: origen.lng } } },
            destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
            // Sin alternativas: se dibuja una ruta, no tres.
            computeAlternativeRoutes: false,
            polylineQuality: 'OVERVIEW',
            languageCode: 'es-419',
            units: 'METRIC'
          })
        });
      } catch (error) {
        clearTimeout(reloj);
        // El nombre del error de aborto cambia entre entornos; lo que no cambia
        // es que un aborto nuestro es un tiempo agotado.
        if (abort.signal.aborted) throw new Error(ROUTE_GEOMETRY_ERROR.TIMEOUT);
        logger.warn?.(`[+58express Ruta] el proveedor no respondio (${error?.message || 'sin detalle'})`);
        throw new Error(ROUTE_GEOMETRY_ERROR.PROVIDER_ERROR);
      }
      clearTimeout(reloj);

      if (!respuesta.ok) {
        // El cuerpo del error puede traer la clave repetida: no se registra.
        logger.warn?.(`[+58express Ruta] el proveedor devolvio ${respuesta.status}`);
        throw new Error(ROUTE_GEOMETRY_ERROR.PROVIDER_ERROR);
      }

      let cuerpo;
      try {
        cuerpo = await respuesta.json();
      } catch {
        throw new Error(ROUTE_GEOMETRY_ERROR.MALFORMED);
      }

      const leida = leerRespuestaDeRutas(cuerpo);
      if (leida === null) throw new Error(ROUTE_GEOMETRY_ERROR.MALFORMED);
      return leida;
    }
  };
}
