/**
 * Cuánto mide un recorrido, y qué estados ocupan a una pasajera.
 *
 * POR QUÉ ESTE FICHERO
 *
 * Hasta PASSENGER-TRIP-HARDENING-1 la distancia y la duración las mandaba el
 * teléfono y el servidor cobraba con esos números. El precio lo ponía el
 * servidor, sí, pero con la regla que le prestaba el cliente: declarar cuatro
 * kilómetros donde hay uno cambiaba el importe.
 *
 * Aquí el servidor mide por su cuenta. El cliente dice DÓNDE; nunca CUÁNTO.
 *
 * DOS REGLAS, NUNCA LA DEL CLIENTE
 *
 *   ROUTES_API        Google Routes con la credencial de servidor, que vive en
 *                     este proceso y jamás sale hacia un teléfono.
 *   SERVER_GEODESIC   Sin credencial o con el proveedor caído: haversine por
 *                     1,35 y 25 km/h de velocidad urbana.
 *
 * La geodésica NO es «confiar en el cliente». Es el servidor midiendo con regla
 * propia sobre las coordenadas que la persona señaló en el mapa. Es además el
 * mismo estimador con el que ya se cobran los viajes programados, así que dos
 * viajes iguales no salen a precios distintos según por dónde entraron.
 */

/** Los estados en los que un viaje ya no ocupa a nadie. */
export const ESTADOS_TERMINALES = Object.freeze(['COMPLETED', 'CANCELLED']);

/**
 * Los estados que cuentan como «tiene un viaje en marcha».
 *
 * Se DERIVAN en vez de escribirse a mano. Una lista escrita a mano se queda
 * vieja el día que alguien añade un estado, y ese día un viaje activo dejaria
 * de contar como activo: justo el agujero que esta fase viene a cerrar.
 *
 * Los alias históricos que la persistencia todavía contiene --ACCEPTED,
 * IN_TRIP, EN_ROUTE...-- entran también: un viaje guardado con el nombre viejo
 * ocupa el hueco igual que uno con el nombre nuevo.
 */
export function estadosActivos(estados, alias = {}) {
  const canonicos = Object.values(estados).filter(estado => !ESTADOS_TERMINALES.includes(estado));
  const historicos = Object.entries(alias)
    .filter(([, canonico]) => canonicos.includes(canonico))
    .map(([viejo]) => viejo);
  return Object.freeze([...canonicos, ...historicos]);
}

/** Metros de la Tierra, para el haversine. */
const RADIO_TERRESTRE_KM = 6371;

/**
 * Lo que se anda de más por ir por calles y no en línea recta. Es el mismo
 * 1,35 que usa el radio de despacho y el estimador de viajes programados.
 */
export const FACTOR_URBANO = 1.35;

/** Velocidad urbana de referencia en Maracaibo. */
export const VELOCIDAD_URBANA_KMH = 25;

/**
 * Distancia por calle entre dos puntos, en kilómetros.
 *
 * Firma heredada de `calculateDistance` en `index.js`, de donde se mudó para
 * que la fórmula viva en un solo sitio: la usa el radio de despacho, el
 * estimador de viajes programados y ahora también el precio.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RADIO_TERRESTRE_KM * c * FACTOR_URBANO;
}

/** De dónde salieron los kilómetros. Viaja en el viaje y en la estimación. */
export const FUENTE_DE_METRICAS = Object.freeze({
  ROUTES: 'ROUTES_API',
  GEODESICA: 'SERVER_GEODESIC'
});

/** El redondeo con el que se guardan y se cobran las métricas. */
function redondear({ distanceKm, durationMin, source }) {
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    // Nunca cero minutos: un viaje de doscientos metros sigue durando algo, y
    // un cero se propagaria a la tarifa por tiempo.
    durationMin: Math.max(1, Math.round(durationMin)),
    source
  };
}

/** La medida propia del servidor, sin salir a la red. */
export function metricasGeodesicas(origen, destino) {
  const distanceKm = calculateDistance(origen.lat, origen.lng, destino.lat, destino.lng);
  return redondear({
    distanceKm,
    durationMin: (distanceKm / VELOCIDAD_URBANA_KMH) * 60,
    source: FUENTE_DE_METRICAS.GEODESICA
  });
}

/** Error con código, para que quien llama traduzca a HTTP sin leer texto. */
function fallo(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

/**
 * Mide el recorrido con la mejor fuente disponible.
 *
 * NUNCA MIRA EL CUERPO DE LA PETICION
 *
 * Recibe dos puntos y devuelve dos números. No hay parametro por el que colar
 * una distancia, que es precisamente el punto.
 *
 * SI GOOGLE FALLA, NO FALLA EL VIAJE
 *
 * Un proveedor caido no puede dejar a nadie sin poder pedir una carrera. Se
 * cae a la geodésica y se deja dicho en `source` de dónde salió el número, que
 * es lo que permite auditarlo después.
 */
export async function metricasDelRecorrido(origen, destino, { routeMatrix, cache = null, logger = console } = {}) {
  if (!origen || !destino
    || !Number.isFinite(origen.lat) || !Number.isFinite(origen.lng)
    || !Number.isFinite(destino.lat) || !Number.isFinite(destino.lng)) {
    throw fallo('INVALID_ROUTE_METRICS');
  }

  const medir = async () => {
    if (!routeMatrix?.isConfigured?.()) return metricasGeodesicas(origen, destino);
    try {
      const elementos = await routeMatrix.computeToPickup([origen], destino);
      const medida = elementos?.[0];
      const metros = Number(medida?.roadDistanceMeters);
      const millis = Number(medida?.etaMillis);
      if (!Number.isFinite(metros) || !Number.isFinite(millis) || metros <= 0) {
        // Ruta sin resultado --dos puntos sin carretera entre medias-- no es un
        // error del servidor: se mide con la regla propia.
        return metricasGeodesicas(origen, destino);
      }
      return redondear({
        distanceKm: metros / 1000,
        durationMin: millis / 60000,
        source: FUENTE_DE_METRICAS.ROUTES
      });
    } catch (error) {
      // Nunca se registra la respuesta del proveedor: podria citar la clave o
      // las coordenadas de una persona.
      logger.warn?.(`[+58express Trip] Routes no midio el recorrido (${error?.message || 'sin detalle'}); se usa la geodesica`);
      return metricasGeodesicas(origen, destino);
    }
  };

  return cache ? await cache.medir(origen, destino, medir) : await medir();
}
