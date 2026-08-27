import { icon } from '../utils/icons.js';
import { fareCalculator } from '../services/fareCalculator.js';
import { showToast } from './toast.js';
import { normalizeVehicleType, vehicleImage } from '../utils/vehicleMedia.js';
import { readAppliedTheme } from '../utils/themePreference.js';
import { getGoogleMapsLoader } from '../services/googleMapsService.js';
import { createGoogleMapEngine } from './googleMapEngine.js';
import { createLeafletEngine } from './leafletMapEngine.js';

/**
 * Componente de mapa de +58Express.
 *
 * Desde GOOGLE-MAPS-1 el render se delega en un MOTOR intercambiable:
 *
 *   - con VITE_GOOGLE_MAPS_API_KEY configurada, se intenta Google Maps;
 *   - sin clave, o si Google no puede cargar (clave rechazada, red caida,
 *     cuota agotada), se usa Leaflet: la experiencia de siempre, intacta.
 *
 * El fallo de Google NUNCA deja la pantalla sin mapa ni rompe la aplicacion:
 * degrada al respaldo y las operaciones pedidas mientras se decidia el motor
 * se reproducen en orden sobre el que haya ganado.
 *
 * Lo que NO cambia con el motor:
 *
 *   - el arte aprobado de los marcadores (vehiculos animados, pasajero
 *     esperando, bandera de destino) es el mismo HTML en ambos;
 *   - la geolocalizacion del dispositivo sigue siendo navigator.geolocation,
 *     nunca un servicio de Google;
 *   - la ruta y su distancia siguen saliendo de OSRM via fareCalculator: el
 *     motor solo PINTA la geometria. Google no participa en la tarifa, en el
 *     despacho ni en el area de servicio de Maracaibo.
 */

const vehicleMarkerArtwork = vehicleType => vehicleImage(vehicleType, {
  variant: 'map',
  className: 'live-vehicle-photo',
  decorative: true
});

const vehicleMarkerHtml = (vehicleType, heading = 0) => `
  <div class="live-vehicle-marker live-vehicle-${vehicleType.toLowerCase()}" style="--vehicle-heading:${Number(heading) || 0}deg">
    <span class="vehicle-heading-cone"></span>
    <span class="vehicle-motion-trail"></span>
    <span class="vehicle-ground-shadow"></span>
    <div class="live-vehicle-rotor">${vehicleMarkerArtwork(vehicleType)}</div>
    <span class="vehicle-live-dot"></span>
  </div>`;

const waitingPassengerHtml = () => `
  <div class="waiting-passenger-marker" role="img" aria-label="Pasajero esperando">
    <span class="passenger-pulse-ring"></span>
    <span class="passenger-ground-shadow"></span>
    <svg class="waiting-passenger-svg" viewBox="0 0 48 58" aria-hidden="true">
      <circle class="passenger-head" cx="24" cy="13" r="8"/>
      <path class="passenger-hair" d="M17 13c0-7 4-10 8-10 5 0 9 4 9 10-4-3-12-3-17 0z"/>
      <path class="passenger-body" d="M14 29c1-7 6-10 10-10s9 3 10 10l3 17H11z"/>
      <path class="passenger-detail" d="M24 21v20M14 31l-5 9M34 31l5 9"/>
    </svg>
    <span class="passenger-status-label">Esperando</span>
  </div>`;

const userLocationHtml = () => `<div style="width: 24px; height: 24px; background-color: var(--accent-secondary, #00D2FF); border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(0,210,255,0.8); animation: pulse 2s infinite;"></div>`;

const destinationFlagHtml = () => `
  <div class="flag-3d-container">
    <div class="flag-head">${icon('flag', 16)}</div>
    <div class="beacon-pillar" style="background: linear-gradient(to top, rgba(255,77,77,0.8), rgba(255,77,77,0)); box-shadow: 0 0 15px var(--danger);"></div>
  </div>`;

/**
 * El motor de Google no entiende var(--…) de CSS: el color de la ruta se
 * traduce a un valor concreto antes de llegar a cualquier motor.
 */
const resolveRouteColor = (color) => {
  if (typeof color === 'string' && color.startsWith('var(')) {
    const respaldo = color.match(/,\s*([^)]+)\)/);
    return respaldo ? respaldo[1].trim() : '#00D2FF';
  }
  return color || '#00D2FF';
};

export class MapComponent {
  constructor(containerId, options = {}) {
    this.targetElement = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    this.options = {
      center: [10.6427, -71.6125], // Maracaibo default
      zoom: 14,
      darkMode: true,
      is3D: false, // Standard 2D flat mode
      ...options
    };

    this.markers = new Map();
    this.routeLayer = null;
    this.userMarker = null;
    this.pickupMarker = null;
    this.destinationMarker = null;
    this.is3DActive = false;
    this._destroyed = false;

    // Motor de render. `map` se conserva como bandera de listo porque todos
    // los metodos historicos preguntan `if (!this.map)`.
    this.engine = null;
    this.map = null;
    this._pendingOps = null;
    this._clickCallback = null;
    this._routePoints = null;
    this._resolveEngineReady = null;
    this._engineReady = new Promise(resolve => { this._resolveEngineReady = resolve; });

    this._initMap();
    this._createLocationButton();
    this._themeHandler = event => this.setMapTheme(event.detail?.theme);
    window.addEventListener('58express:theme-change', this._themeHandler);
  }

  _initMap() {
    if (!this.targetElement) return;
    // `options.mapsLoader` existe para las pruebas: permite ejercitar la rama
    // de Google y la degradacion sin tocar el singleton ni la red.
    const loader = this.options.mapsLoader || getGoogleMapsLoader();
    if (loader.isConfigured()) {
      // La carga de Google es asincrona: mientras se decide, las operaciones
      // se encolan y se reproducen sobre el motor que gane.
      this._pendingOps = [];
      this._initGoogle(loader);
    } else {
      this._initLeaflet();
    }
  }

  _initLeaflet() {
    try {
      this.engine = createLeafletEngine({
        container: this.targetElement,
        center: { lat: this.options.center[0], lng: this.options.center[1] },
        zoom: this.options.zoom,
        // El mapa arranca con el mismo tema que el resto de la interfaz: antes
        // caía en 'light' por omisión y mostraba tiles claros sobre una
        // interfaz oscura en la primera visita.
        theme: readAppliedTheme(document.documentElement)
      });
      this.map = this.engine.map;
      this._createMapLegend();
      this._drainPendingOps();
    } catch (err) {
      console.error('[MapComponent] Map init error:', err);
    }
  }

  async _initGoogle(loader) {
    try {
      const maps = await loader.load();
      if (this._destroyed) return;
      this.engine = createGoogleMapEngine({
        maps,
        container: this.targetElement,
        center: { lat: this.options.center[0], lng: this.options.center[1] },
        zoom: this.options.zoom,
        theme: readAppliedTheme(document.documentElement)
      });
      this.map = this.engine.map;
      this._createMapLegend();
      this._drainPendingOps();
    } catch (error) {
      // El codigo del fallo es escueto (NO_KEY, AUTH_FAILED, LOAD_TIMEOUT…) y
      // NUNCA contiene la clave. Un fallo de Google no deja la pantalla sin
      // mapa: se degrada al motor de siempre y se reproduce la cola.
      console.warn(`[MapComponent] Google Maps no disponible (${error?.message || 'desconocido'}); usando el mapa de respaldo`);
      if (!this._destroyed) this._initLeaflet();
    }
  }

  /**
   * Reproduce en orden las operaciones pedidas mientras el motor cargaba.
   * Con el motor Leaflet sincrono la cola no existe y esto no hace nada.
   */
  _drainPendingOps() {
    const cola = this._pendingOps;
    this._pendingOps = null;
    if (this._resolveEngineReady) {
      this._resolveEngineReady();
      this._resolveEngineReady = null;
    }
    if (cola) {
      for (const [metodo, args] of cola) {
        try {
          this[metodo](...args);
        } catch (err) {
          console.warn(`[MapComponent] operación diferida ${metodo} falló:`, err?.message);
        }
      }
    }
    if (this._clickCallback) this.onMapClick(this._clickCallback);
  }

  /** true = la operacion quedo encolada porque el motor aun se decide. */
  _defer(metodo, args) {
    if (!this.map && this._pendingOps) {
      this._pendingOps.push([metodo, args]);
      return true;
    }
    return false;
  }

  setMapTheme(theme = 'light') {
    // Un cambio de tema que llegue tarde no debe tocar un mapa ya desechado.
    if (this._destroyed) return;
    if (this._defer('setMapTheme', [theme])) return;
    if (!this.engine) return;
    this.engine.setTheme(theme);
  }

  _createMapLegend() {
    if (!this.targetElement) return;

    // Check if legend already exists
    if (this.targetElement.querySelector('.map-legend-bar')) return;

    const legend = document.createElement('div');
    legend.className = 'map-legend-bar';
    legend.style.cssText = `
      position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
      z-index: 1000; background: var(--x58-surface-overlay); backdrop-filter: blur(16px);
      border: 1.5px solid var(--border-gold, #FFC107); border-radius: 20px;
      padding: 6px 14px; display: flex; gap: 14px; align-items: center;
      font-size: 0.68rem; font-weight: 800; color: var(--text-primary); pointer-events: none;
      box-shadow: 0 8px 24px rgba(0,0,0,.35); white-space: nowrap;
    `;
    legend.innerHTML = `
      <span style="display:flex;align-items:center;gap:5px"><i style="width:9px;height:9px;border-radius:50%;background:#00E676;display:inline-block;box-shadow:0 0 8px #00E676"></i>Moto</span>
      <span style="display:flex;align-items:center;gap:5px"><i style="width:9px;height:9px;border-radius:50%;background:#FFC107;display:inline-block;box-shadow:0 0 8px #FFC107"></i>Carro</span>
      <span style="display:flex;align-items:center;gap:5px"><i style="width:9px;height:9px;border-radius:50%;background:#00D2FF;display:inline-block;box-shadow:0 0 8px #00D2FF"></i>Tú</span>
    `;
    this.targetElement.appendChild(legend);
  }

  _createLocationButton() {
    if (!this.targetElement) return;

    this.locateBtn = document.createElement('button');
    this.locateBtn.className = 'gps-locate-btn';
    this.locateBtn.setAttribute('aria-label', 'Centrar mi ubicación');
    this.locateBtn.title = 'Ir a mi ubicación actual';
    this.locateBtn.innerHTML = icon('target', 20);
    Object.assign(this.locateBtn.style, {
      position: 'absolute',
      bottom: '100px',
      right: '16px',
      zIndex: '99',
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      border: '1.5px solid var(--border-gold, #FFC107)',
      background: 'var(--x58-surface-overlay)',
      color: 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      backdropFilter: 'blur(16px)',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)'
    });

    this.locateBtn.addEventListener('click', async () => {
      this.locateBtn.disabled = true;
      try {
        const coords = await this.getUserLocation();
        this.setUserLocation(coords.lat, coords.lng);
        this.centerOn(coords.lat, coords.lng, 16);
      } catch {
        showToast('No pudimos obtener tu ubicación. Activa el GPS.', 'error');
      } finally {
        this.locateBtn.disabled = false;
      }
    });

    this.targetElement.appendChild(this.locateBtn);
  }

  onMapClick(callback) {
    if (typeof callback !== 'function') return;
    this._clickCallback = callback;
    if (!this.map) return;
    this.engine.onClick(({ latlng }) => callback(latlng));
  }

  init(center = { lat: 10.6427, lng: -71.6125 }, zoom = 14) {
    const c = Array.isArray(center) ? { lat: center[0], lng: center[1] } : center;
    this.initMap(c.lat, c.lng, zoom);
  }

  initMap(lat = 10.6427, lng = -71.6125, zoom = 14) {
    if (this._defer('initMap', [lat, lng, zoom])) return;
    if (!this.map) return;
    this.engine.setView(lat, lng, zoom);
  }

  setUserLocation(lat, lng) {
    if (this._defer('setUserLocation', [lat, lng])) return;
    if (!this.map) return;
    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
      return;
    }

    this.userMarker = this.engine.crearMarcadorHtml({
      lat,
      lng,
      html: userLocationHtml(),
      className: 'user-location-marker',
      size: [24, 24],
      anchor: [12, 12],
      zIndex: 500
    });
  }

  setDriverLocation(lat, lng) {
    this.setUserLocation(lat, lng);
  }

  addDriverMarker(id, lat, lng, heading = 0, info = {}) {
    if (this._defer('addDriverMarker', [id, lat, lng, heading, info])) return null;
    if (!this.map) return null;
    if (this.markers.has(id)) {
      this.updateDriverMarker(id, lat, lng, heading);
      return this.markers.get(id);
    }

    const vehicleType = normalizeVehicleType(info.vehicleType || info.rideType || info.vehicle?.type);
    const tooltip = vehicleType === 'CAR' ? 'Automóvil en movimiento' : 'Mototaxi en movimiento';

    const marker = this.engine.crearMarcadorHtml({
      lat,
      lng,
      html: vehicleMarkerHtml(vehicleType, heading),
      className: 'driver-3d-marker live-map-marker',
      size: [58, 58],
      anchor: [29, 29],
      tooltipAnchor: [0, -26],
      tooltip,
      tooltipClass: 'live-marker-tooltip',
      title: tooltip,
      zIndex: 600
    });
    marker._vehicleType = vehicleType;
    marker._lastHeading = Number(heading) || 0;
    this.markers.set(id, marker);
    return marker;
  }

  addMarker(latlng, type = 'driver', options = {}) {
    const coords = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
    if (type === 'destination') {
      this.setDestinationMarker(coords[0], coords[1]);
    } else if (type === 'pickup') {
      this.setPickupMarker(coords[0], coords[1]);
    } else {
      const id = 'marker_' + Math.random();
      this.addDriverMarker(id, coords[0], coords[1], Number(options.heading || 0), options);
    }
  }

  clearMarkers(type = null) {
    if (this._defer('clearMarkers', [type])) return;
    if (!this.map) return;
    if (type === 'destination' && this.destinationMarker) {
      this.destinationMarker.remove();
      this.destinationMarker = null;
    } else if (type === 'pickup' && this.pickupMarker) {
      this.pickupMarker.remove();
      this.pickupMarker = null;
    } else if (!type) {
      this.markers.forEach(marker => marker.remove());
      this.markers.clear();
    }
  }

  updateDriverMarker(id, lat, lng, heading = 0) {
    const marker = this.markers.get(id);
    if (!marker) return;

    const start = marker.getLatLng();
    const movementHeading = this._bearingBetween(start.lat, start.lng, Number(lat), Number(lng));
    const resolvedHeading = Number.isFinite(Number(heading)) && Number(heading) !== 0
      ? Number(heading)
      : movementHeading;
    marker._lastHeading = Number.isFinite(resolvedHeading) ? resolvedHeading : marker._lastHeading;

    const visual = marker.getElement()?.querySelector('.live-vehicle-marker');
    if (visual) {
      visual.style.setProperty('--vehicle-heading', `${marker._lastHeading || 0}deg`);
      visual.classList.add('is-moving');
      window.clearTimeout(marker._movementTimer);
      marker._movementTimer = window.setTimeout(() => visual.classList.remove('is-moving'), 1250);
    }

    this._animateMarker(marker, [lat, lng], 900);
  }

  _bearingBetween(lat1, lng1, lat2, lng2) {
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
    const toRadians = value => value * Math.PI / 180;
    const y = Math.sin(toRadians(lng2 - lng1)) * Math.cos(toRadians(lat2));
    const x = Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2))
      - Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(toRadians(lng2 - lng1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  _animateMarker(marker, newLatLng, duration = 900) {
    if (marker._animationFrame) cancelAnimationFrame(marker._animationFrame);
    const start = marker.getLatLng();
    const startTime = performance.now();
    const endLat = Number(newLatLng[0]);
    const endLng = Number(newLatLng[1]);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - progress, 3);
      const lat = start.lat + (endLat - start.lat) * eased;
      const lng = start.lng + (endLng - start.lng) * eased;

      marker.setLatLng([lat, lng]);

      if (progress < 1) marker._animationFrame = requestAnimationFrame(animate);
      else marker._animationFrame = null;
    };

    marker._animationFrame = requestAnimationFrame(animate);
  }

  removeDriverMarker(id) {
    if (this._defer('removeDriverMarker', [id])) return;
    const marker = this.markers.get(id);
    if (marker) {
      marker.remove();
      this.markers.delete(id);
    }
  }

  setPickupMarker(lat, lng) {
    if (this._defer('setPickupMarker', [lat, lng])) return;
    if (!this.map) return;
    if (this.pickupMarker) {
      this._animateMarker(this.pickupMarker, [lat, lng], 700);
      return;
    }

    this.pickupMarker = this.engine.crearMarcadorHtml({
      lat,
      lng,
      html: waitingPassengerHtml(),
      className: 'pickup-beacon-marker waiting-map-marker',
      size: [58, 72],
      anchor: [29, 62],
      tooltipAnchor: [0, -55],
      tooltip: 'Pasajero esperando aquí',
      tooltipClass: 'live-marker-tooltip passenger-tooltip',
      title: 'Pasajero esperando aquí',
      zIndex: 650
    });
  }

  setDestinationMarker(lat, lng) {
    if (this._defer('setDestinationMarker', [lat, lng])) return;
    if (!this.map) return;
    if (this.destinationMarker) {
      this.destinationMarker.setLatLng([lat, lng]);
      return;
    }

    this.destinationMarker = this.engine.crearMarcadorHtml({
      lat,
      lng,
      html: destinationFlagHtml(),
      className: 'destination-flag-marker',
      size: [28, 68],
      anchor: [14, 68],
      zIndex: 640
    });
  }

  /**
   * La ruta se calcula con fareCalculator (OSRM), como siempre: esa cifra
   * alimenta la tarifa y NO cambia con el motor de render. El motor solo
   * recibe la geometria ya resuelta y la pinta.
   */
  async drawRoute(start, end, color = 'var(--accent-secondary, #00D2FF)') {
    this.clearRoute();
    // Con el motor aun decidiendose se espera a que gane uno: drawRoute ya es
    // asincrono y el resultado (distancia/tiempo) no depende del motor.
    if (!this.map && this._pendingOps) await this._engineReady;
    if (!this.map) return { distance: 3000, duration: 300 };

    const pickupLat = Array.isArray(start) ? start[0] : start.lat;
    const pickupLng = Array.isArray(start) ? start[1] : start.lng;
    const destLat = Array.isArray(end) ? end[0] : end.lat;
    const destLng = Array.isArray(end) ? end[1] : end.lng;
    const strokeColor = resolveRouteColor(color);

    try {
      const routeInfo = await fareCalculator.calculateRoute(pickupLat, pickupLng, destLat, destLng);
      if (routeInfo && routeInfo.geometry && routeInfo.geometry.coordinates) {
        const latlngs = routeInfo.geometry.coordinates.map(c => [c[1], c[0]]);
        this.routeLayer = this.engine.crearPolyline(latlngs, { color: strokeColor, weight: 8, opacity: 1 });
        this._routePoints = latlngs;

        this.fitBounds();
        return routeInfo;
      }
    } catch (e) {
      console.warn('[MapComponent] Route calculation fallback:', e);
    }

    const fallbackCoords = [[pickupLat, pickupLng], [destLat, destLng]];
    this.routeLayer = this.engine.crearPolyline(fallbackCoords, { color: strokeColor, weight: 8, opacity: 1 });
    this._routePoints = fallbackCoords;

    return { distance: 3500, duration: 420 };
  }

  // MAPS-2C: el banner con el enlace externo NAVEGAR desaparecio. La guia
  // vive dentro de la aplicacion (navigationBanner + routeProgress) y la
  // ruta del conductor entra por drawNavigationRoute.

  /**
   * Pinta una ruta de navegación NORMALIZADA (MAPS-2B: contrato neutro de
   * navigationRoute.js, venga de Google Routes o del respaldo OSRM).
   *
   * Es una capacidad de render pura: no calcula nada, no toca la tarifa
   * --que sigue su camino OSRM propio via drawRoute/fareCalculator-- y no
   * gestiona banner de guía (eso es MAPS-2C). Devuelve true si pintó.
   */
  drawNavigationRoute(route, { color = '#00D2FF' } = {}) {
    if (this._defer('drawNavigationRoute', [route, { color }])) return false;
    if (!this.map || !Array.isArray(route?.path) || route.path.length < 2) return false;
    this.clearRoute();
    const latlngs = route.path.map(p => [p.lat, p.lng]);
    this.routeLayer = this.engine.crearPolyline(latlngs, {
      color: resolveRouteColor(color), weight: 8, opacity: 1
    });
    this._routePoints = latlngs;
    this.fitBounds();
    return true;
  }

  clearRoute() {
    if (this.routeLayer) {
      this.routeLayer.remove();
      this.routeLayer = null;
    }
    this._routePoints = null;
  }

  fitBounds() {
    if (this._defer('fitBounds', [])) return;
    if (!this.map) return;
    const puntos = [];
    const aPar = (p) => (Array.isArray(p) ? p : [p.lat, p.lng]);
    if (this.userMarker) puntos.push(aPar(this.userMarker.getLatLng()));
    if (this.pickupMarker) puntos.push(aPar(this.pickupMarker.getLatLng()));
    if (this.destinationMarker) puntos.push(aPar(this.destinationMarker.getLatLng()));
    if (this._routePoints) puntos.push(...this._routePoints);

    if (puntos.length > 0) this.engine.fitBounds(puntos);
  }

  centerOn(lat, lng, zoom = null) {
    if (this._defer('centerOn', [lat, lng, zoom])) return;
    if (!this.map) return;
    this.engine.setView(lat, lng, zoom);
  }

  getUserLocation({ allowFallback = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        if (allowFallback) resolve({ lat: 10.6427, lng: -71.6125, isFallback: true });
        else reject(new Error('La geolocalización no está disponible en este dispositivo'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: position.timestamp || Date.now(),
            isFallback: false
          });
        },
        (error) => {
          if (allowFallback) resolve({ lat: 10.6427, lng: -71.6125, isFallback: true, error });
          else reject(error);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      );
    });
  }

  destroy() {
    // Idempotente: la aplicación reconstruye pantallas y puede pedir la
    // destrucción del mismo mapa más de una vez.
    if (this._destroyed) return;
    this._destroyed = true;
    this._pendingOps = null;

    if (this._themeHandler) {
      window.removeEventListener('58express:theme-change', this._themeHandler);
      this._themeHandler = null;
    }

    // Cada marcador programa un temporizador para quitar el estado "en
    // movimiento"; si sobreviven, disparan sobre nodos ya desechados.
    for (const marker of this.markers.values()) {
      if (marker?._movementTimer) {
        window.clearTimeout(marker._movementTimer);
        marker._movementTimer = null;
      }
    }
    this.markers.clear();

    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    this.map = null;

    this.routeLayer = null;
    this._routePoints = null;
    this.userMarker = null;
    this.pickupMarker = null;
    this.destinationMarker = null;
  }
}
