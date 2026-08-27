/**
 * Motor de render sobre Leaflet.
 *
 * Es el comportamiento que la aplicacion ha tenido siempre --mismas teselas de
 * CARTO, misma atribucion, mismos divIcon-- encapsulado tras la interfaz de
 * motor que `MapComponent` consume. Cuando Google Maps no esta configurado o
 * no puede cargar, este motor es el respaldo y la experiencia es la de
 * siempre: un fallo de Google jamas deja a la aplicacion sin mapa.
 */

const tileUrlForTheme = theme => (theme === 'dark'
  ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png');

const OPCIONES_TILES = {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20
};

export function createLeafletEngine({ container, center, zoom = 14, theme = 'dark' } = {}) {
  if (typeof L === 'undefined') throw new Error('LEAFLET_NOT_LOADED');
  if (!container) throw new Error('LEAFLET_ENGINE_REQUIRES_CONTAINER');

  const map = L.map(container, { zoomControl: true }).setView([center.lat, center.lng], zoom);
  let tileLayer = L.tileLayer(tileUrlForTheme(theme), OPCIONES_TILES).addTo(map);

  return {
    kind: 'leaflet',
    map,

    setTheme(nuevoTema) {
      if (tileLayer) map.removeLayer(tileLayer);
      tileLayer = L.tileLayer(tileUrlForTheme(nuevoTema), OPCIONES_TILES).addTo(map);
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
