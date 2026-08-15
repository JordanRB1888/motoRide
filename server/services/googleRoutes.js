/**
 * Cálculo de ruta en el servidor con la Routes API de Google.
 *
 * Hasta ahora la distancia y la duración las aportaba el navegador en el cuerpo
 * de la petición, y la tarifa se calculaba a partir de ellas: quien pedía el
 * viaje podía rebajar el importe declarando menos kilómetros. Con esta pieza el
 * servidor obtiene la ruta por su cuenta desde las dos coordenadas y lo que
 * envíe el cliente deja de influir.
 *
 * Reglas de diseño:
 *
 * - **Nunca lanza.** Cualquier fallo devuelve `null` y el flujo anterior sigue
 *   funcionando. Esta pieza mejora la tarifa; no puede impedir que se pida un
 *   viaje si Google no responde.
 * - **Siempre con tiempo límite.** La creación de un viaje no puede quedarse
 *   colgada esperando a un tercero.
 * - **No registra coordenadas.** Un log con origen y destino sería un rastro de
 *   los movimientos de una persona.
 */

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** Solo lo imprescindible: la máscara reduce respuesta, coste y exposición. */
const FIELD_MASK = 'routes.distanceMeters,routes.duration';

const DEFAULT_TIMEOUT_MS = 3500;

/** Una moto no circula como un coche; Google lo modela aparte. */
function travelModeFor(rideType) {
  return String(rideType || '').toUpperCase() === 'CAR' ? 'DRIVE' : 'TWO_WHEELER';
}

/** Coordenada utilizable: número real y dentro del rango del planeta. */
function isUsableCoordinate(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // (0,0) es el Golfo de Guinea: casi siempre significa «no hay dato».
  return !(lat === 0 && lng === 0);
}

/** `"123s"` -> 2.05 minutos. La API devuelve la duración como cadena. */
export function parseDurationToMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value / 60;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(String(value || '').trim());
  if (!match) return null;
  const segundos = Number(match[1]);
  return Number.isFinite(segundos) ? segundos / 60 : null;
}

/**
 * Extrae distancia y duración de la respuesta de la Routes API.
 *
 * Devuelve `null` si la respuesta no trae una ruta utilizable, en vez de
 * inventar un valor por defecto: una tarifa calculada sobre datos supuestos es
 * peor que no calcularla.
 */
export function extractRouteMetrics(payload) {
  const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
  if (!route) return null;

  const metros = Number(route.distanceMeters);
  const minutos = parseDurationToMinutes(route.duration);
  if (!Number.isFinite(metros) || metros <= 0) return null;
  if (minutos === null || !Number.isFinite(minutos) || minutos <= 0) return null;

  return {
    distanceKm: Number((metros / 1000).toFixed(3)),
    durationMin: Number(minutos.toFixed(2))
  };
}

export function createGoogleRoutesService({
  apiKey = process.env.GOOGLE_MAPS_SERVER_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onDiagnostic = () => {}
} = {}) {
  const key = String(apiKey || '').trim();

  /** Sin clave el servicio existe pero no hace nada: no rompe el arranque. */
  const isConfigured = () => key.length > 0;

  /**
   * Calcula la ruta entre dos puntos.
   *
   * Devuelve `{ distanceKm, durationMin }` o `null`. El motivo del `null` se
   * comunica por `onDiagnostic` con un código, **sin coordenadas**, para poder
   * vigilar la salud de la integración sin registrar dónde viaja la gente.
   */
  async function computeRoute({ origin, destination, rideType } = {}) {
    if (!isConfigured()) { onDiagnostic({ code: 'NOT_CONFIGURED' }); return null; }
    if (!isUsableCoordinate(origin) || !isUsableCoordinate(destination)) {
      onDiagnostic({ code: 'INVALID_COORDINATES' });
      return null;
    }
    if (typeof fetchImpl !== 'function') { onDiagnostic({ code: 'NO_FETCH' }); return null; }

    const controller = new AbortController();
    const temporizador = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': FIELD_MASK
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: Number(origin.lat), longitude: Number(origin.lng) } } },
          destination: { location: { latLng: { latitude: Number(destination.lat), longitude: Number(destination.lng) } } },
          travelMode: travelModeFor(rideType),
          // Sin tráfico en vivo: el precio de un viaje no debe depender de en
          // qué segundo exacto se pulsó el botón.
          routingPreference: 'TRAFFIC_UNAWARE',
          units: 'METRIC',
          languageCode: 'es'
        })
      });

      if (!response?.ok) {
        onDiagnostic({ code: 'HTTP_ERROR', status: response?.status ?? 0 });
        return null;
      }

      const metrics = extractRouteMetrics(await response.json());
      onDiagnostic(metrics ? { code: 'OK' } : { code: 'NO_ROUTE' });
      return metrics;
    } catch (error) {
      onDiagnostic({ code: error?.name === 'AbortError' ? 'TIMEOUT' : 'REQUEST_FAILED' });
      return null;
    } finally {
      clearTimeout(temporizador);
    }
  }

  return { isConfigured, computeRoute };
}
