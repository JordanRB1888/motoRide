import { icon } from '../utils/icons.js';
import { fareCalculator } from '../services/fareCalculator.js';
import { showToast } from './toast.js';

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
    this.tileLayer = null;
    this.is3DActive = false;
    
    this._initMap();
    this._createLocationButton();
    this._themeHandler = event => this.setMapTheme(event.detail?.theme);
    window.addEventListener('58express:theme-change', this._themeHandler);
  }

  _initMap() {
    if (!this.targetElement) return;
    try {
      this.map = L.map(this.targetElement, { zoomControl: true }).setView(this.options.center, this.options.zoom);
      
      this.tileLayer = L.tileLayer(this._tileUrlForTheme(localStorage.getItem('58express_theme') || 'light'), {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(this.map);

      this._createMapLegend();
    } catch (err) {
      console.error('[MapComponent] Map init error:', err);
    }
  }

  _tileUrlForTheme(theme) {
    return theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  }

  setMapTheme(theme = 'light') {
    if (!this.map) return;
    if (this.tileLayer) this.map.removeLayer(this.tileLayer);
    this.tileLayer = L.tileLayer(this._tileUrlForTheme(theme), {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.map);
    this.tileLayer.bringToBack();
  }

  _createMapLegend() {
    if (!this.targetElement) return;

    // Check if legend already exists
    if (this.targetElement.querySelector('.map-legend-bar')) return;

    const legend = document.createElement('div');
    legend.className = 'map-legend-bar';
    legend.style.cssText = `
      position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
      z-index: 1000; background: rgba(15, 20, 32, 0.92); backdrop-filter: blur(16px);
      border: 1.5px solid var(--border-gold, #FFC107); border-radius: 20px;
      padding: 8px 16px; display: flex; align-items: center; gap: 16px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6); pointer-events: auto;
    `;

    legend.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:800; color:var(--text-primary);">
        <span style="width:10px; height:10px; border-radius:50%; background:#00E676; box-shadow:0 0 8px #00E676;"></span>
        Mi ubicación
      </div>
      <div style="display:flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:800; color:var(--text-primary);">
        <span style="width:10px; height:10px; border-radius:50%; background:#FFC107; box-shadow:0 0 8px #FFC107;"></span>
        Compañeros
      </div>
      <div style="display:flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:800; color:var(--text-primary);">
        <span style="width:10px; height:10px; border-radius:50%; background:#FF4D4D; box-shadow:0 0 8px #FF4D4D;"></span>
        SOS activos
      </div>
    `;

    if (getComputedStyle(this.targetElement).position === 'static') {
      this.targetElement.style.position = 'relative';
    }
    this.targetElement.appendChild(legend);
  }

  _createLocationButton() {
    if (!this.targetElement) return;

    this.locateBtn = document.createElement('button');
    this.locateBtn.className = 'gps-locate-btn';
    this.locateBtn.title = 'Ir a mi ubicación actual';
    this.locateBtn.innerHTML = `🎯`;
    Object.assign(this.locateBtn.style, {
      position: 'absolute',
      bottom: '100px',
      right: '16px',
      zIndex: '99',
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      backgroundColor: 'rgba(24, 34, 50, 0.92)',
      backdropFilter: 'blur(16px)',
      border: '1.5px solid var(--accent-primary)',
      color: '#FFC107',
      fontSize: '1.3rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 8px 20px rgba(0,0,0,0.5), 0 0 15px rgba(255,193,7,0.25)',
      transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });

    this.locateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.locateBtn.style.transform = 'scale(0.85)';
      setTimeout(() => this.locateBtn.style.transform = 'scale(1)', 150);

      const loc = await this.getUserLocation();
      this.centerOn(loc.lat, loc.lng, 15);
      this.setUserLocation(loc.lat, loc.lng);
      showToast('🎯 Ubicación centrada en tu GPS', 'info');
    });

    if (getComputedStyle(this.targetElement).position === 'static') {
      this.targetElement.style.position = 'relative';
    }
    this.targetElement.appendChild(this.locateBtn);
  }

  toggle3DMode() {
    // 2D flat mode locked
  }

  onMapClick(callback) {
    if (!this.map) return;
    this.map.on('click', (e) => {
      if (typeof callback === 'function') {
        callback(e.latlng);
      }
    });
  }

  init(center = { lat: 10.6427, lng: -71.6125 }, zoom = 14) {
    if (this.map) {
      const c = Array.isArray(center) ? center : [center.lat, center.lng];
      this.map.setView(c, zoom);
    }
  }

  initMap(lat = 10.6427, lng = -71.6125, zoom = 14) {
    if (this.map) {
      this.map.setView([lat, lng], zoom);
    }
  }

  setUserLocation(lat, lng) {
    if (!this.map) return;
    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
      return;
    }
    
    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: `<div style="width: 24px; height: 24px; background-color: var(--accent-secondary, #00D2FF); border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(0,210,255,0.8); animation: pulse 2s infinite;"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    this.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map);
  }

  setDriverLocation(lat, lng) {
    this.setUserLocation(lat, lng);
  }

  addDriverMarker(id, lat, lng, heading = 0, info = {}) {
    if (!this.map) return null;
    if (this.markers.has(id)) {
      this.updateDriverMarker(id, lat, lng, heading);
      return this.markers.get(id);
    }
    
    const svgIcon = L.divIcon({
      className: 'driver-3d-marker',
      html: `
        <div class="moto-3d-badge">
          <div class="moto-3d-shadow"></div>
          <div class="moto-3d-body" style="transform: rotate(${heading}deg);">
            <svg class="moto-3d-arrow" viewBox="0 0 24 24">
              <path d="M12 2L19 21L12 17L5 21L12 2Z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
    
    const marker = L.marker([lat, lng], { icon: svgIcon }).addTo(this.map);
    this.markers.set(id, marker);
    return marker;
  }

  addMarker(latlng, type = 'driver', options = {}) {
    if (!this.map) return;
    const coords = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
    if (type === 'destination') {
      this.setDestinationMarker(coords[0], coords[1]);
    } else if (type === 'pickup') {
      this.setPickupMarker(coords[0], coords[1]);
    } else {
      const id = 'marker_' + Math.random();
      this.addDriverMarker(id, coords[0], coords[1], Math.floor(Math.random() * 360));
    }
  }

  clearMarkers(type = null) {
    if (!this.map) return;
    if (type === 'destination' && this.destinationMarker) {
      this.map.removeLayer(this.destinationMarker);
      this.destinationMarker = null;
    } else if (type === 'pickup' && this.pickupMarker) {
      this.map.removeLayer(this.pickupMarker);
      this.pickupMarker = null;
    } else {
      this.markers.forEach(marker => this.map.removeLayer(marker));
      this.markers.clear();
    }
  }

  updateDriverMarker(id, lat, lng, heading = 0) {
    const marker = this.markers.get(id);
    if (!marker) return;

    const bodyEl = marker.getElement()?.querySelector('.moto-3d-body');
    if (bodyEl) {
      bodyEl.style.transform = `rotate(${heading}deg)`;
    }

    this._animateMarker(marker, [lat, lng], 1500);
  }

  _animateMarker(marker, newLatLng, duration = 1500) {
    const start = marker.getLatLng();
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const lat = start.lat + (newLatLng[0] - start.lat) * progress;
      const lng = start.lng + (newLatLng[1] - start.lng) * progress;
      
      marker.setLatLng([lat, lng]);
      
      if (progress < 1) requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
  }

  removeDriverMarker(id) {
    const marker = this.markers.get(id);
    if (marker) {
      this.map.removeLayer(marker);
      this.markers.delete(id);
    }
  }

  setPickupMarker(lat, lng) {
    if (!this.map) return;
    if (this.pickupMarker) {
      this.pickupMarker.setLatLng([lat, lng]);
      return;
    }
    
    const pickupIcon = L.divIcon({
      className: 'pickup-beacon-marker',
      html: `
        <div class="beacon-3d-container">
          <div class="beacon-head"></div>
          <div class="beacon-pillar"></div>
        </div>
      `,
      iconSize: [24, 64],
      iconAnchor: [12, 64]
    });
    
    this.pickupMarker = L.marker([lat, lng], { icon: pickupIcon }).addTo(this.map);
  }

  setDestinationMarker(lat, lng) {
    if (!this.map) return;
    if (this.destinationMarker) {
      this.destinationMarker.setLatLng([lat, lng]);
      return;
    }
    
    const destIcon = L.divIcon({
      className: 'destination-flag-marker',
      html: `
        <div class="flag-3d-container">
          <div class="flag-head">🚩</div>
          <div class="beacon-pillar" style="background: linear-gradient(to top, rgba(255,77,77,0.8), rgba(255,77,77,0)); box-shadow: 0 0 15px var(--danger);"></div>
        </div>
      `,
      iconSize: [28, 68],
      iconAnchor: [14, 68]
    });
    
    this.destinationMarker = L.marker([lat, lng], { icon: destIcon }).addTo(this.map);
  }

  async drawRoute(start, end, color = 'var(--accent-secondary, #00D2FF)') {
    this.clearRoute();
    if (!this.map) return { distance: 3000, duration: 300 };

    const pickupLat = Array.isArray(start) ? start[0] : start.lat;
    const pickupLng = Array.isArray(start) ? start[1] : start.lng;
    const destLat = Array.isArray(end) ? end[0] : end.lat;
    const destLng = Array.isArray(end) ? end[1] : end.lng;

    try {
      const routeInfo = await fareCalculator.calculateRoute(pickupLat, pickupLng, destLat, destLng);
      if (routeInfo && routeInfo.geometry && routeInfo.geometry.coordinates) {
        const latlngs = routeInfo.geometry.coordinates.map(c => [c[1], c[0]]);
        this.routeLayer = L.polyline(latlngs, {
          color: color,
          weight: 8,
          opacity: 1,
          lineCap: 'round'
        }).addTo(this.map);

        this.fitBounds();
        this._showNavigationBanner(routeInfo, { lat: destLat, lng: destLng });
        return routeInfo;
      }
    } catch (e) {
      console.warn('[MapComponent] Route calculation fallback:', e);
    }

    const fallbackCoords = [[pickupLat, pickupLng], [destLat, destLng]];
    this.routeLayer = L.polyline(fallbackCoords, {
      color: color,
      weight: 8,
      opacity: 1
    }).addTo(this.map);
    
    return { distance: 3500, duration: 420 };
  }

  _showNavigationBanner(routeInfo, destination) {
    if (!this.options.navigation || !this.targetElement) return;
    let banner = this.targetElement.querySelector('.driver-navigation-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'driver-navigation-banner';
      banner.style.cssText = 'position:absolute;top:145px;left:12px;right:12px;z-index:950;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(12,19,31,.94);color:white;border:1px solid rgba(0,230,118,.55);box-shadow:0 10px 28px rgba(0,0,0,.45);pointer-events:auto';
      this.targetElement.appendChild(banner);
    }
    const distance = Number(routeInfo?.distanceKm || 0).toFixed(1);
    const duration = Math.max(1, Math.round(Number(routeInfo?.durationMin || 0)));
    const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`;
    banner.innerHTML = `<div style="font-size:1.7rem">⬆</div><div style="min-width:0;flex:1"><strong style="display:block;font-size:.92rem">Continúa por la ruta marcada</strong><small style="color:#a7f3d0">${distance} km · ${duration} min hasta el destino</small></div><a href="${googleUrl}" target="_blank" rel="noopener" style="padding:8px 10px;border-radius:12px;background:#00E676;color:#101722;text-decoration:none;font-size:.75rem;font-weight:900">NAVEGAR</a>`;
  }

  clearRoute() {
    if (this.routeLayer && this.map) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }
    this.targetElement?.querySelector('.driver-navigation-banner')?.remove();
  }

  fitBounds() {
    if (!this.map) return;
    const latlngs = [];
    if (this.userMarker) latlngs.push(this.userMarker.getLatLng());
    if (this.pickupMarker) latlngs.push(this.pickupMarker.getLatLng());
    if (this.destinationMarker) latlngs.push(this.destinationMarker.getLatLng());
    if (this.routeLayer) latlngs.push(...this.routeLayer.getLatLngs());
    
    if (latlngs.length > 0) {
      this.map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });
    }
  }

  centerOn(lat, lng, zoom = null) {
    if (this.map) {
      this.map.setView([lat, lng], zoom || this.map.getZoom(), { animate: true });
    }
  }

  getUserLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 10.4806, lng: -66.9036 });
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => resolve({ lat: 10.4806, lng: -66.9036 }),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    });
  }

  destroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
