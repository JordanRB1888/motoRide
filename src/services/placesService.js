/**
 * Proveedor de búsqueda Google Places (New) — DORMIDO hasta que Places esté
 * habilitado en el proyecto de Google del propietario.
 *
 * Usa la superficie oficial vigente de la Maps JavaScript API:
 *   google.maps.importLibrary('places')
 *     → AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
 *     → placePrediction.toPlace() + place.fetchFields(...)
 *
 * Contrato de seguridad y de fallo:
 *  - sin clave de Maps configurada no se toca la red (el cargador único de
 *    GOOGLE-MAPS-1 ya lo garantiza);
 *  - si la librería o la API no están disponibles (Places sin habilitar,
 *    cuota, error), TODO falla cerrado con un código escueto y el buscador
 *    degrada a Nominatim: la pantalla jamás se queda sin búsqueda;
 *  - la clave no se imprime y ningún error crudo del proveedor llega al
 *    usuario;
 *  - a Places viaja SOLO el texto buscado y el sesgo geográfico del área de
 *    servicio: nada de nombre, teléfono, JWT, identificadores ni historial.
 *
 * El sesgo usa la definición EXISTENTE del área de servicio (operatingArea):
 * círculo centrado en Maracaibo. La librería admite un radio máximo de
 * 50 km para el sesgo circular, así que el área de 60 km se acota a ese
 * máximo soportado — es sesgo (bias), no muro: la guardia dura de Maracaibo
 * sigue siendo la de la aplicación al seleccionar.
 */

import { getGoogleMapsLoader } from './googleMapsService.js';
import { fromGooglePlaceFields } from '../utils/canonicalLocation.js';
import { MARACAIBO_SERVICE_CENTER, MARACAIBO_SERVICE_RADIUS_KM } from '../utils/operatingArea.js';

export const PLACES_ERROR = Object.freeze({
  NOT_CONFIGURED: 'PLACES_NOT_CONFIGURED',
  UNAVAILABLE: 'PLACES_UNAVAILABLE',
  TIMEOUT: 'PLACES_TIMEOUT'
});

/** Techo del sesgo circular que admite la librería de Places. */
const MAX_BIAS_RADIUS_M = 50_000;

const escueto = codigo => new Error(codigo);

export function createPlacesProvider({
  mapsLoader = null,
  center = MARACAIBO_SERVICE_CENTER,
  radiusKm = MARACAIBO_SERVICE_RADIUS_KM,
  timeoutMs = 4_000
} = {}) {
  const loader = mapsLoader ?? getGoogleMapsLoader();
  /** Promesa compartida de la librería: se resuelve una sola vez. */
  let placesLibraryPromise = null;
  /** Token de sesión vigente: agrupa tecleo+selección para la facturación. */
  let sessionToken = null;

  const conTimeout = promesa => Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(escueto(PLACES_ERROR.TIMEOUT)), timeoutMs))
  ]);

  async function placesLibrary() {
    if (!placesLibraryPromise) {
      placesLibraryPromise = (async () => {
        const maps = await loader.load();
        // `importLibrary` es la puerta oficial actual; sin ella (o si Places
        // no está habilitado en el proyecto) el proveedor no existe.
        if (typeof maps?.importLibrary !== 'function') throw escueto(PLACES_ERROR.UNAVAILABLE);
        const lib = await maps.importLibrary('places');
        if (typeof lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions !== 'function') {
          throw escueto(PLACES_ERROR.UNAVAILABLE);
        }
        return lib;
      })().catch(error => {
        // Un fallo no se queda cacheado para siempre: el siguiente intento
        // vuelve a probar (p. ej. tras habilitar la API).
        placesLibraryPromise = null;
        throw ['PLACES_NOT_CONFIGURED', 'PLACES_UNAVAILABLE', 'PLACES_TIMEOUT'].includes(error?.message)
          ? error
          : escueto(PLACES_ERROR.UNAVAILABLE);
      });
    }
    return placesLibraryPromise;
  }

  return {
    /** ¿Hay clave de Maps? Sin ella este proveedor ni intenta cargar. */
    isConfigured() {
      return Boolean(loader?.isConfigured?.());
    },

    /**
     * Sugerencias para un texto. Devuelve candidatos NEUTROS de interfaz:
     * {key, title, subtitle, resolve()}. El objeto crudo del SDK queda
     * encerrado en el closure de `resolve` y jamás entra al estado de la
     * aplicación; `resolve()` produce la ubicación canónica definitiva con
     * las coordenadas DEL LUGAR ELEGIDO — nada se re-geocodifica después.
     */
    async search(query) {
      if (!this.isConfigured()) throw escueto(PLACES_ERROR.NOT_CONFIGURED);
      const texto = String(query ?? '').trim();
      if (!texto) return [];

      const lib = await conTimeout(placesLibrary());
      if (!sessionToken) sessionToken = new lib.AutocompleteSessionToken();

      const { suggestions } = await conTimeout(
        lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: texto,
          sessionToken,
          language: 'es-419',
          region: 've',
          includedRegionCodes: ['ve'],
          locationBias: {
            center: { lat: center.lat, lng: center.lng },
            radius: Math.min(radiusKm * 1000, MAX_BIAS_RADIUS_M)
          }
        })
      );

      const tokenDeEstaBusqueda = sessionToken;
      return (suggestions ?? [])
        .map(sugerencia => sugerencia?.placePrediction)
        .filter(Boolean)
        .map(prediction => ({
          key: `google:${prediction.placeId}`,
          title: prediction.mainText?.text ?? prediction.text?.text ?? '',
          subtitle: prediction.secondaryText?.text ?? null,
          resolve: async () => {
            const place = prediction.toPlace();
            await conTimeout(place.fetchFields({
              fields: ['location', 'displayName', 'formattedAddress']
            }));
            // La selección cierra la sesión de facturación de este tecleo.
            if (sessionToken === tokenDeEstaBusqueda) sessionToken = null;
            const location = place.location;
            return fromGooglePlaceFields({
              placeId: place.id ?? prediction.placeId,
              displayName: place.displayName ?? prediction.text?.text,
              formattedAddress: place.formattedAddress ?? null,
              lat: typeof location?.lat === 'function' ? location.lat() : location?.lat,
              lng: typeof location?.lng === 'function' ? location.lng() : location?.lng
            });
          }
        }))
        .filter(candidato => candidato.title);
    }
  };
}

let singleton = null;

/** Proveedor compartido de la aplicación. */
export function getPlacesProvider() {
  if (!singleton) singleton = createPlacesProvider();
  return singleton;
}
