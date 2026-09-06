/**
 * Cliente de Places (New) — búsqueda de texto, para «¿A dónde vas?».
 *
 * SOLO SERVIDOR, Y ESA ES LA GRACIA
 *
 * La búsqueda escrita del destino podría hacerla el teléfono contra Google
 * directamente, pero entonces el teléfono llevaría dentro una credencial de
 * Places: una credencial en un APK es pública, y la factura de las búsquedas
 * de toda la ciudad la pagaría quien la extrajera. Aquí la llamada la hace el
 * servidor, con su cuenta de servicio, y el móvil solo ve resultados.
 *
 * LA AUTENTICACIÓN NO VIVE AQUÍ
 *
 * Las cabeceras las pone `googleMapsAuth`, igual que en los dos clientes de
 * Routes. Places (New) acepta OAuth --comprobado contra la API-- así que en
 * modo cuenta de servicio esta búsqueda tampoco depende de la IP pública.
 *
 * LO QUE SE PIDE Y LO QUE SE DEVUELVE
 *
 * La máscara de campos es la mínima que sirve para pintar una lista y fijar un
 * destino: identificador, nombre, dirección y coordenada. Cada campo de más en
 * la máscara sube el precio de la llamada y no lo pide nadie.
 */

import { crearAuthDeMaps } from './googleMapsAuth.js';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location';

/** Códigos escuetos, sin material de la credencial dentro. */
export const PLACES_ERROR = Object.freeze({
  NOT_CONFIGURED: 'PLACES_NOT_CONFIGURED',
  INVALID_QUERY: 'PLACES_INVALID_QUERY',
  TIMEOUT: 'PLACES_TIMEOUT',
  PROVIDER_ERROR: 'PLACES_PROVIDER_ERROR'
});

/** Lo que se busca aquí es una dirección de Maracaibo, no un país entero. */
const RADIO_DE_SESGO_M = 30_000;
const MAXIMO_DE_RESULTADOS = 8;
/** Dos letras no son una búsqueda: son una tecla a medio escribir. */
const MINIMO_DE_TEXTO = 3;

export function createPlacesClient({
  apiKey = process.env.DISPATCH_ROUTES_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 2_500,
  logger = console,
  // Igual que en Routes: va después de `logger` porque lo usa.
  auth = crearAuthDeMaps({ apiKey, logger })
} = {}) {
  return {
    isConfigured() {
      return auth.estaConfigurado();
    },

    /** Con qué se está autenticando: 'oauth' | 'api-key' | 'sin-configurar'. */
    get authMode() {
      return auth.modo;
    },

    /**
     * Busca lugares por texto, sesgando hacia dónde está quien pregunta.
     *
     * @param {string} texto lo que la persona escribió
     * @param {{lat:number, lng:number}} [cerca] centro del sesgo
     * @returns {Promise<Array<{id, nombre, direccion, lat, lng}>>}
     */
    async buscar(texto, cerca = null) {
      if (!auth.estaConfigurado()) throw new Error(PLACES_ERROR.NOT_CONFIGURED);

      const consulta = typeof texto === 'string' ? texto.trim() : '';
      if (consulta.length < MINIMO_DE_TEXTO) throw new Error(PLACES_ERROR.INVALID_QUERY);

      // Las cabeceras antes del reloj: pedir un token es una llamada suya y no
      // debe gastar el tiempo que le toca a la búsqueda.
      let cabecerasDeAuth;
      try {
        cabecerasDeAuth = await auth.cabeceras();
      } catch {
        throw new Error(PLACES_ERROR.PROVIDER_ERROR);
      }

      const cuerpo = {
        textQuery: consulta,
        languageCode: 'es',
        regionCode: 'VE',
        maxResultCount: MAXIMO_DE_RESULTADOS
      };
      if (cerca && Number.isFinite(cerca.lat) && Number.isFinite(cerca.lng)) {
        cuerpo.locationBias = {
          circle: { center: { latitude: cerca.lat, longitude: cerca.lng }, radius: RADIO_DE_SESGO_M }
        };
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
          body: JSON.stringify(cuerpo)
        });
      } catch (error) {
        // Ni la consulta ni las cabeceras entran en el registro.
        throw new Error(error?.name === 'AbortError' ? PLACES_ERROR.TIMEOUT : PLACES_ERROR.PROVIDER_ERROR);
      } finally {
        clearTimeout(reloj);
      }

      if (!respuesta.ok) {
        logger.warn?.(`[+58express Lugares] Google respondio ${respuesta.status}`);
        throw new Error(PLACES_ERROR.PROVIDER_ERROR);
      }

      const json = await respuesta.json().catch(() => null);
      const lugares = Array.isArray(json?.places) ? json.places : [];
      return lugares
        .map(lugar => ({
          id: typeof lugar?.id === 'string' ? lugar.id : null,
          nombre: lugar?.displayName?.text ?? null,
          direccion: typeof lugar?.formattedAddress === 'string' ? lugar.formattedAddress : null,
          lat: Number(lugar?.location?.latitude),
          lng: Number(lugar?.location?.longitude)
        }))
        // Un resultado sin coordenada no se puede fijar como destino: sobra.
        .filter(lugar => lugar.id && lugar.nombre && Number.isFinite(lugar.lat) && Number.isFinite(lugar.lng));
    }
  };
}
