/**
 * Proveedor de teselas del mapa Leaflet — UNICO punto que decide la URL.
 *
 * Historia: la aplicacion usaba los basemaps de CARTO (dark_all / voyager).
 * CARTO empezo a exigir clave de API para servirlos y ahora estampa
 * «API KEY REQUIRED» en cada tesela, lo que dejo inutilizable el mapa del
 * panel de administracion y el respaldo Leaflet de pasajero/conductor.
 *
 * El reemplazo es OpenStreetMap estandar: sin clave, sin registro, con la
 * atribucion que exige su licencia. Para el tema oscuro no existe variante
 * nativa de OSM, asi que el modo oscuro se logra con un filtro CSS aplicado
 * SOLO al contenedor de teselas (la clase de abajo): los marcadores y las
 * rutas, que viven en otros panes, no se invierten.
 *
 * La politica de uso de tile.openstreetmap.org admite aplicaciones de
 * trafico moderado como esta; si el volumen creciera mucho, el siguiente
 * paso natural seria migrar tambien el panel a Google Maps, que ya esta
 * integrado con clave propia en pasajero/conductor.
 */

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Clase CSS (definida en index.css) que oscurece las teselas por filtro. */
export const DARK_TILES_CLASS = 'x58-osm-dark-tiles';

/**
 * Opciones listas para L.tileLayer segun el tema.
 * El filtro solo se aplica en oscuro; en claro las teselas van tal cual.
 */
export function tileLayerOptionsForTheme(theme = 'dark') {
  return {
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    className: theme === 'dark' ? DARK_TILES_CLASS : ''
  };
}
