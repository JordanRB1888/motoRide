/**
 * Orquestador de la búsqueda de destinos — MAPS-2A.
 *
 * Decide qué proveedor responde y garantiza dos propiedades que la pantalla
 * no debería tener que vigilar:
 *
 *  1. FALLBACK: si Google Places no está configurado, no está habilitado,
 *     falla o tarda, la búsqueda usa Nominatim. La pantalla recibe candidatos
 *     con la misma forma sin importar quién los produjo.
 *  2. SIN RESPUESTAS ZOMBI: cada búsqueda invalida a las anteriores. Una
 *     respuesta lenta de «Mar» jamás pisa los resultados de «Maracaibo».
 *
 * Cada candidato es {key, title, subtitle, resolve()} y `resolve()` devuelve
 * la ubicación canónica DEFINITIVA: las coordenadas del proveedor que mostró
 * el resultado, sin re-geocodificar y sin mezclar proveedores.
 */

import { fromNominatimResult } from '../utils/canonicalLocation.js';

export const MIN_QUERY_LENGTH = 3;

export function createDestinationSearch({
  placesProvider = null,
  nominatimSearch,
  minQueryLength = MIN_QUERY_LENGTH
} = {}) {
  if (typeof nominatimSearch !== 'function') {
    throw new Error('DESTINATION_SEARCH_REQUIRES_NOMINATIM');
  }

  let generation = 0;

  return {
    /** Invalida cualquier búsqueda en vuelo (p. ej. al limpiar el campo). */
    cancel() {
      generation += 1;
    },

    /**
     * @returns {Promise<{stale: boolean, provider: string|null, candidates: Array}>}
     *   `stale: true` significa «llegó tarde: ignórame» — la pantalla no debe
     *   pintar nada con esa respuesta.
     */
    async search(query) {
      const texto = String(query ?? '').trim();
      generation += 1;
      const mia = generation;

      if (texto.length < minQueryLength) {
        return { stale: false, provider: null, candidates: [] };
      }

      // Google primero, si existe y está configurado. Cualquier fallo --sin
      // clave, API sin habilitar, cuota, timeout-- cae a Nominatim sin ruido.
      if (placesProvider?.isConfigured?.()) {
        try {
          const candidatos = await placesProvider.search(texto);
          if (mia !== generation) return { stale: true, provider: 'google', candidates: [] };
          if (candidatos.length) return { stale: false, provider: 'google', candidates: candidatos };
          // Sin resultados de Google se consulta el respaldo: cobertura local
          // irregular no puede dejar la lista vacía si Nominatim sí conoce el
          // sitio.
        } catch {
          if (mia !== generation) return { stale: true, provider: 'google', candidates: [] };
        }
      }

      let items;
      try {
        items = await nominatimSearch(texto);
      } catch {
        items = [];
      }
      if (mia !== generation) return { stale: true, provider: 'nominatim', candidates: [] };

      const candidatos = (Array.isArray(items) ? items : [])
        .map(item => {
          const canonica = fromNominatimResult(item);
          if (!canonica) return null;
          return {
            key: `nominatim:${canonica.placeId ?? canonica.displayName}`,
            title: canonica.displayName,
            subtitle: null,
            resolve: async () => canonica
          };
        })
        .filter(Boolean);

      return { stale: false, provider: 'nominatim', candidates: candidatos };
    }
  };
}
