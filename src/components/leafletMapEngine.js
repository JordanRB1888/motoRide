/**
 * Motor de render sobre Leaflet.
 *
 * Es el comportamiento Leaflet de siempre --mismos divIcon, misma semantica--
 * encapsulado tras la interfaz de motor que `MapComponent` consume. Las
 * teselas son OpenStreetMap (ver utils/mapTiles.js): CARTO empezo a exigir
 * clave y estampaba «API KEY REQUIRED» en cada tesela. Cuando Google Maps no esta configurado o
 * no puede cargar, este motor es el respaldo y la experiencia es la de
 * siempre: un fallo de Google jamas deja a la aplicacion sin mapa.
 */

import { OSM_TILE_URL, tileLayerOptionsForTheme } from '../utils/mapTiles.js';

export function createLeafletEngine({ container, center, zoom = 14, theme = 'dark' } = {}) {
  if (typeof L === 'undefined') throw new Error('LEAFLET_NOT_LOADED');
  if (!container) throw new Error('LEAFLET_ENGINE_REQUIRES_CONTAINER');

  const map = L.map(container, { zoomControl: true }).setView([center.lat, center.lng], zoom);
  let tileLayer = L.tileLayer(OSM_TILE_URL, tileLayerOptionsForTheme(theme)).addTo(map);

  return {
    kind: 'leaflet',
    map,

    setTheme(nuevoTema) {
      if (tileLayer) map.removeLayer(tileLayer);
      tileLayer = L.tileLayer(OSM_TILE_URL, tileLayerOptionsForTheme(nuevoTema)).addTo(map);
      tileLayer.bringToBack();
    },

    /**
     * El L.marker nativo ya cumple el contrato del marcador --setLatLng,
     * getLatLng, getElement, remove--, asi que se devuelve tal cual, con el
     * mismo divIcon de siempre.
     */
    crearMarcadorHtml({ lat, lng, html, className = '', anchor = [0, 0], size = null, tooltip = '', tooltipClass = '', tooltipAnchor = [0, 0] }) {
      const iconoHtml = L.divIcon({
        className,
        html,
        iconSize: size,
        iconAnchor: anchor,
        tooltipAnchor
      });
      const marcador = L.marker([lat, lng], { icon: iconoHtml, riseOnHover: true }).addTo(map);
      if (tooltip) {
        marcador.bindTooltip(tooltip, { direction: 'top', className: tooltipClass, opacity: 0.96 });
      }
      return marcador;
    },

    crearPolyline(latlngs, { color = '#00D2FF', weight = 8, opacity = 1 } = {}) {
      // L.polyline ya trae .remove(); no hace falta envolver.
      return L.polyline(latlngs, { color, weight, opacity, lineCap: 'round' }).addTo(map);
    },

    fitBounds(puntos) {
      if (!puntos.length) return;
      map.fitBounds(L.latLngBounds(puntos), { padding: [50, 50] });
    },

    setView(lat, lng, zoom = null) {
      map.setView([lat, lng], zoom ?? map.getZoom(), { animate: true });
    },

    onClick(callback) {
      map.on('click', (evento) => callback({ latlng: evento.latlng }));
    },

    destroy() {
      map.remove();
    }
  };
}
