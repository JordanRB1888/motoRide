/**
 * Motor de render sobre Google Maps.
 *
 * Implementa exactamente la superficie que `MapComponent` necesita, con la
 * misma semantica que el motor Leaflet. La parte VISUAL de los marcadores --el
 * arte aprobado de vehiculos, pasajero esperando y bandera de destino-- llega
 * como HTML ya construido y se muestra tal cual: este motor no redisena nada.
 *
 * Los marcadores HTML se implementan con OverlayView y no con
 * AdvancedMarkerElement a proposito: AdvancedMarkerElement exige un mapId, y
 * un mapId mueve los estilos del mapa a la nube de Google. Con OverlayView el
 * tema oscuro/claro sigue siendo un JSON en el codigo, cambiable en caliente,
 * y no hace falta habilitar ni configurar nada mas que el Maps JavaScript API.
 *
 * Este modulo NO decide negocio: ni tarifas, ni elegibilidad, ni area de
 * servicio. Pinta lo que le pidan.
 */

/**
 * Estilo nocturno estandar de Google (su ejemplo oficial de mapa oscuro).
 * El claro es el estilo por defecto: styles = [].
 */
const ESTILO_OSCURO = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] }
];

const estilosPara = theme => (theme === 'dark' ? ESTILO_OSCURO : []);

/**
 * @param {object} opciones
 * @param {object} opciones.maps      el espacio `google.maps` ya cargado
 * @param {HTMLElement} opciones.container
 * @param {{lat:number,lng:number}} opciones.center
 * @param {number} opciones.zoom
 * @param {string} opciones.theme     'dark' | 'light'
 */
export function createGoogleMapEngine({ maps, container, center, zoom = 14, theme = 'dark' } = {}) {
  if (!maps?.Map) throw new Error('GOOGLE_MAPS_NOT_LOADED');
  if (!container) throw new Error('GOOGLE_ENGINE_REQUIRES_CONTAINER');

  const map = new maps.Map(container, {
    center,
    zoom,
    styles: estilosPara(theme),
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    gestureHandling: 'greedy'
  });

  /**
   * Marcador HTML posicionado por OverlayView.
   *
   * Reproduce el contrato del L.marker + divIcon actual: `setLatLng`,
   * `getLatLng`, `getElement`, `remove`, y el HTML del icono intacto.
   */
  class MarcadorHtml extends maps.OverlayView {
    constructor({ lat, lng, html, className = '', anchor = [0, 0], title = '', zIndex = 1 }) {
      super();
      this.posicion = { lat: Number(lat), lng: Number(lng) };
      this.ancla = anchor;
      this.raiz = document.createElement('div');
      this.raiz.className = className;
      this.raiz.style.position = 'absolute';
      this.raiz.style.zIndex = String(zIndex);
      if (title) this.raiz.title = title;
      this.raiz.innerHTML = html;
      this.setMap(map);
    }

    onAdd() {
      this.getPanes()?.overlayMouseTarget?.appendChild(this.raiz);
    }

    draw() {
      const proyeccion = this.getProjection();
      if (!proyeccion) return;
      const punto = proyeccion.fromLatLngToDivPixel(new maps.LatLng(this.posicion.lat, this.posicion.lng));
      if (!punto) return;
      this.raiz.style.left = `${punto.x - this.ancla[0]}px`;
      this.raiz.style.top = `${punto.y - this.ancla[1]}px`;
    }

    setLatLng(latlng) {
      const [lat, lng] = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
      this.posicion = { lat: Number(lat), lng: Number(lng) };
      this.draw();
    }

    getLatLng() {
      return { ...this.posicion };
    }

    getElement() {
      return this.raiz;
    }

    remove() {
      this.setMap(null);
    }

    onRemove() {
      this.raiz.parentNode?.removeChild(this.raiz);
    }
  }

  let manejadorClick = null;

  return {
    kind: 'google',
    map,

    setTheme(nuevoTema) {
      // Con estilos JSON el tema cambia en caliente; es la razon de no usar
      // mapId, cuyos estilos viven en la nube y no se pueden alternar aqui.
      map.setOptions({ styles: estilosPara(nuevoTema) });
    },

    crearMarcadorHtml(opciones) {
      return new MarcadorHtml(opciones);
    },

    crearPolyline(latlngs, { color = '#00D2FF', weight = 8, opacity = 1 } = {}) {
      // Las var(--…) de CSS no significan nada para Google: se traducen antes
      // de llegar aqui. La geometria llega ya calculada (OSRM): este motor
      // NUNCA pide la ruta a Google, solo la pinta.
      const linea = new maps.Polyline({
        path: latlngs.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: color,
        strokeWeight: weight,
        strokeOpacity: opacity,
        map
      });
      return { remove: () => linea.setMap(null) };
    },

    fitBounds(puntos) {
      if (!puntos.length) return;
      const limites = new maps.LatLngBounds();
      for (const [lat, lng] of puntos) limites.extend(new maps.LatLng(lat, lng));
      map.fitBounds(limites, 60);
    },

    setView(lat, lng, zoom = null) {
      map.panTo({ lat: Number(lat), lng: Number(lng) });
      if (zoom !== null) map.setZoom(zoom);
    },

    onClick(callback) {
      if (manejadorClick) manejadorClick.remove();
      manejadorClick = maps.event.addListener(map, 'click', (evento) => {
        const lat = evento.latLng?.lat();
        const lng = evento.latLng?.lng();
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          callback({ latlng: { lat, lng } });
        }
      });
    },

    destroy() {
      if (manejadorClick) manejadorClick.remove();
      maps.event.clearInstanceListeners(map);
      // Google no ofrece un destructor del mapa: vaciar el contenedor es la
      // practica documentada para soltar el DOM.
      container.innerHTML = '';
    }
  };
}
