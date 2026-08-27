/**
 * Rutas de navegación — MAPS-2B (fundación de datos).
 *
 * Este módulo produce UNA forma neutra de ruta de navegación, la consuma
 * quien la consuma y la produzca quien la produzca:
 *
 *   {
 *     provider: 'google' | 'osrm',
 *     travelMode, path: [{lat,lng}...], distanceMeters, durationMillis,
 *     localizedDistance, localizedDuration,
 *     steps: [{ instruction, maneuver, distanceMeters, durationMillis,
 *               startLocation, endLocation, path }]
 *   }
 *
 * Tres separaciones que este módulo tiene PROHIBIDO romper:
 *
 *  1. TARIFA: la distancia facturable sale de fareCalculator (OSRM) por su
 *     propio camino. Nada de lo que este módulo devuelve entra en el dinero.
 *  2. DESPACHO: la elegibilidad y el orden de candidatos viven en el
 *     servidor con su propia distancia. Este módulo ni lo conoce.
 *  3. SDK: ningún objeto crudo de Google (LatLngAltitude, Route, Step)
 *     sale de aquí — el modelo es plano y reutilizable mañana por los
 *     Navigation SDK nativos de Android/iOS.
 *
 * Google Routes queda DORMIDO hasta que el propietario habilite Routes API:
 * cualquier indisponibilidad (librería ausente, API sin habilitar, cuota,
 * red, timeout, sin rutas) degrada a la ruta OSRM de siempre, normalizada al
 * mismo contrato. La pantalla jamás se queda sin ruta por culpa de Google.
 *
 * MODO DE VIAJE: 'DRIVING'. La documentación vigente de Google Maps Platform
 * NO lista a Venezuela entre los países con cobertura TWO_WHEELER, así que
 * usar ese modo aquí sería mentirle al conductor. El modo vive detrás de
 * esta constante para poder cambiarlo el día que Google añada cobertura
 * oficial de dos ruedas en Venezuela.
 */

import { getGoogleMapsLoader } from './googleMapsService.js';
import { fareCalculator } from './fareCalculator.js';

export const NAVIGATION_TRAVEL_MODE = Object.freeze({ DRIVING: 'DRIVING' });
export const CURRENT_ROUTE_TRAVEL_MODE = NAVIGATION_TRAVEL_MODE.DRIVING;

export const ROUTES_ERROR = Object.freeze({
  UNAVAILABLE: 'ROUTES_UNAVAILABLE',
  TIMEOUT: 'ROUTES_TIMEOUT',
  NO_ROUTE: 'ROUTES_NO_ROUTE',
  INVALID_ENDPOINTS: 'ROUTES_INVALID_ENDPOINTS'
});

/**
 * Máscara de campos: SOLO lo que MAPS-2B necesita (geometría, distancia,
 * duración, valores localizados y pasos con instrucción/maniobra). Nada de
 * peajes, tramos alternativos ni metadatos caros.
 */
export const GOOGLE_ROUTE_FIELDS = Object.freeze([
  'path',
  'distanceMeters',
  'durationMillis',
  'localizedValues',
  'legs'
]);

const numero = valor => (Number.isFinite(Number(valor)) ? Number(valor) : null);

const punto = (crudo) => {
  if (!crudo) return null;
  const lat = numero(typeof crudo.lat === 'function' ? crudo.lat() : crudo.lat);
  const lng = numero(typeof crudo.lng === 'function' ? crudo.lng() : crudo.lng);
  return lat === null || lng === null ? null : { lat, lng };
};

const listaDePuntos = crudos => (Array.isArray(crudos) ? crudos.map(punto).filter(Boolean) : []);

/**
 * Las instrucciones del proveedor se tratan como TEXTO: si llegaran con
 * marcado, se despoja. Nadie ejecuta HTML de navegación.
 */
const textoPlano = valor => String(valor ?? '').replace(/<[^>]*>/g, '').trim() || null;

/**
 * Ruta de la librería de Google Routes → contrato neutro.
 *
 * La superficie JS vigente expone legs[].steps[] con la instrucción y la
 * maniobra en `navInstruction`; se toleran las variantes planas del mismo
 * dato para no romper con ajustes menores del proveedor.
 */
export function normalizeGoogleRoute(route, { travelMode = CURRENT_ROUTE_TRAVEL_MODE } = {}) {
  if (!route) return null;
  const path = listaDePuntos(route.path);
  const distanceMeters = numero(route.distanceMeters);
  const durationMillis = numero(route.durationMillis ?? route.durationMs);
  if (!path.length || distanceMeters === null || durationMillis === null) return null;

  const steps = [];
  for (const leg of Array.isArray(route.legs) ? route.legs : []) {
    for (const step of Array.isArray(leg?.steps) ? leg.steps : []) {
      const inicio = punto(step.startLocation ?? step.startLatLng);
      const fin = punto(step.endLocation ?? step.endLatLng);
      steps.push({
        instruction: textoPlano(step.navInstruction?.instructions ?? step.instructions),
        maneuver: step.navInstruction?.maneuver ?? step.maneuver ?? null,
        distanceMeters: numero(step.distanceMeters),
        durationMillis: numero(step.staticDurationMillis ?? step.durationMillis),
        startLocation: inicio,
        endLocation: fin,
        // El trazado del paso alimenta la progresión de MAPS-2C.
        path: listaDePuntos(step.path)
      });
    }
  }

  return Object.freeze({
    provider: 'google',
    travelMode,
    path,
    distanceMeters,
    durationMillis,
    localizedDistance: route.localizedValues?.distance?.text ?? null,
    localizedDuration: route.localizedValues?.duration?.text
      ?? route.localizedValues?.staticDuration?.text ?? null,
    steps: Object.freeze(steps)
  });
}

/** Resultado de fareCalculator.calculateRoute (OSRM) → contrato neutro. */
export function normalizeOsrmRoute(routeInfo, { travelMode = CURRENT_ROUTE_TRAVEL_MODE } = {}) {
  if (!routeInfo) return null;
  const coordenadas = routeInfo.geometry?.coordinates;
  const path = Array.isArray(coordenadas)
    ? coordenadas.map(par => punto({ lat: par?.[1], lng: par?.[0] })).filter(Boolean)
    : [];
  const distanceKm = numero(routeInfo.distanceKm);
  const durationMin = numero(routeInfo.durationMin);
  if (distanceKm === null || durationMin === null) return null;

  return Object.freeze({
    provider: 'osrm',
    travelMode,
    path,
    distanceMeters: Math.round(distanceKm * 1000),
    durationMillis: Math.round(durationMin * 60_000),
    localizedDistance: `${distanceKm.toFixed(1)} km`,
    localizedDuration: `${Math.max(1, Math.round(durationMin))} min`,
    // OSRM de respaldo no trae pasos de maniobra detallados: aceptable.
    steps: Object.freeze([])
  });
}

export function createNavigationRouteService({
  mapsLoader = null,
  osrmRoute = (origin, destination) =>
    fareCalculator.calculateRoute(origin.lat, origin.lng, destination.lat, destination.lng),
  timeoutMs = 6_000
} = {}) {
  const loader = mapsLoader ?? getGoogleMapsLoader();
  let routesLibraryPromise = null;
  let generation = 0;

  const conTimeout = promesa => Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(ROUTES_ERROR.TIMEOUT)), timeoutMs))
  ]);

  async function routesLibrary() {
    if (!routesLibraryPromise) {
      routesLibraryPromise = (async () => {
        const maps = await loader.load();
        if (typeof maps?.importLibrary !== 'function') throw new Error(ROUTES_ERROR.UNAVAILABLE);
        const lib = await maps.importLibrary('routes');
        if (typeof lib?.Route?.computeRoutes !== 'function') throw new Error(ROUTES_ERROR.UNAVAILABLE);
        return lib;
      })().catch(error => {
        // El fallo no se cachea para siempre: tras habilitar la API, el
        // siguiente intento vuelve a probar.
        routesLibraryPromise = null;
        throw Object.values(ROUTES_ERROR).includes(error?.message)
          ? error
          : new Error(ROUTES_ERROR.UNAVAILABLE);
      });
    }
    return routesLibraryPromise;
  }

  return {
    isConfigured() {
      return Boolean(loader?.isConfigured?.());
    },

    /** Invalida cualquier cálculo en vuelo (cambio de pantalla, cancelación). */
    cancel() {
      generation += 1;
    },

    /**
     * Calcula la ruta de navegación entre dos puntos CANÓNICOS ({lat,lng} ya
     * resueltos — jamás texto: aquí no se geocodifica nada).
     *
     * @returns {Promise<{stale: boolean, route: object|null}>}
     *   `stale: true` = llegó tarde (el origen/destino cambió): ignórala.
     *   `route: null` con stale false = ni Google ni OSRM pudieron.
     */
    async computeNavigationRoute({ origin, destination, travelMode = CURRENT_ROUTE_TRAVEL_MODE } = {}) {
      const desde = punto(origin);
      const hasta = punto(destination);
      if (!desde || !hasta) throw new Error(ROUTES_ERROR.INVALID_ENDPOINTS);

      generation += 1;
      const mia = generation;

      if (this.isConfigured()) {
        try {
          const lib = await conTimeout(routesLibrary());
          const { routes } = await conTimeout(lib.Route.computeRoutes({
            origin: { location: { lat: desde.lat, lng: desde.lng } },
            destination: { location: { lat: hasta.lat, lng: hasta.lng } },
            travelMode,
            // ETA con tráfico: aceptado por la superficie real (verificado en
            // producción durante la activación de Routes).
            routingPreference: 'TRAFFIC_AWARE',
            // OJO: la librería JS RECHAZA `languageCode` y `units` como
            // propiedades desconocidas (verificado contra la API real desde
            // el origen de producción). El idioma lo resuelve el runtime de
            // Maps —las instrucciones llegan en español igualmente— y las
            // unidades las formatea la aplicación en local (navFormat.js).
            fields: [...GOOGLE_ROUTE_FIELDS]
          }));
          if (mia !== generation) return { stale: true, route: null };
          const normalizada = normalizeGoogleRoute(routes?.[0], { travelMode });
          if (normalizada) return { stale: false, route: normalizada };
          // Sin ruta utilizable: cae al respaldo, igual que un fallo.
        } catch {
          if (mia !== generation) return { stale: true, route: null };
        }
      }

      let cruda = null;
      try {
        cruda = await osrmRoute(desde, hasta);
      } catch {
        cruda = null;
      }
      if (mia !== generation) return { stale: true, route: null };
      return { stale: false, route: normalizeOsrmRoute(cruda, { travelMode }) };
    }
  };
}

let singleton = null;

export function getNavigationRouteService() {
  if (!singleton) singleton = createNavigationRouteService();
  return singleton;
}
