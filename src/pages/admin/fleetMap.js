import { socketClient } from '../../services/socketClient.js';
import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';
import { icon } from '../../utils/icons.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';

import { neutralizePrivatePhoto } from '../../utils/privatePhoto.js';
import { localAvatarHtml } from '../../utils/localAvatar.js';
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const ACTIVE_TRIP_STATES = new Set(['DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP']);

export function renderFleetMap(container) {
  container.innerHTML = `<div class="fleet-command-view">
    <section class="fleet-command-bar">
      <div class="fleet-command-title"><span>${icon('mapPin', 20)}</span><div><h2>Monitoreo de Flota GPS en Tiempo Real</h2><p>Supervisión directa con Socket.IO y PostgreSQL</p></div></div>
      <div class="fleet-command-kpis">
        <span class="total">TOTAL: <b id="tot-drv">0</b></span>
        <span class="available">DISPONIBLES: <b id="on-drv">0</b></span>
        <span class="trip">EN VIAJE: <b id="trp-drv">0</b></span>
        <span class="offline">OFFLINE: <b id="off-drv">0</b></span>
      </div>
      <select id="status-filter" aria-label="Filtrar conductores por estado">
        <option value="all">Todos los estados</option>
        <option value="AVAILABLE">Solo disponibles</option>
        <option value="IN_TRIP">Solo en viaje</option>
        <option value="OFFLINE">Solo offline</option>
      </select>
    </section>

    <section class="fleet-map-shell">
      <div id="fleet-map" class="fleet-map-canvas"></div>
      <aside class="fleet-live-panel">
        <header><strong>Actividad en vivo</strong><span>${icon('volume2', 16)}</span></header>
        <div id="fleet-live-list" class="fleet-live-list"><p>Esperando telemetría GPS…</p></div>
        <button id="show-all-fleet">Ver todos los movimientos ${icon('chevronRight', 14)}</button>
      </aside>
      <aside id="fleet-driver-panel" class="fleet-driver-panel hidden" aria-live="polite"></aside>
      <div class="fleet-map-legend">
        <span><i class="available"></i>Disponibles</span><span><i class="trip"></i>En viaje</span><span><i class="sos"></i>SOS activos</span><span><i class="offline"></i>Offline</span>
      </div>
    </section>
  </div>`;

  window.setTimeout(() => initializeFleetMap(container), 80);
}

async function initializeFleetMap(container) {
  const mapElement = container.querySelector('#fleet-map');
  if (!mapElement || typeof L === 'undefined') return;

  const map = L.map(mapElement, { zoomControl: true, attributionControl: true }).setView([10.6427, -71.6125], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19
  }).addTo(map);

  const markers = new Map();
  const drivers = new Map();
  let trips = [];
  let selectedDriverId = null;
  let selectedFilter = 'all';
  let activeRoute = null;
  let disposed = false;

  const driverId = driver => driver.userId || driver.driverId || driver.id;
  const statusOf = driver => {
    if (driver.sosActive || String(driver.status).toUpperCase() === 'SOS') return 'SOS';
    const status = String(driver.status || '').toUpperCase();
    if (['AVAILABLE', 'ONLINE'].includes(status) || driver.isAvailable) return 'AVAILABLE';
    if (['BUSY', 'IN_TRIP', 'ON_TRIP', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(status)) return 'IN_TRIP';
    return 'OFFLINE';
  };
  const nameOf = driver => driver.driverName || `${driver.firstName || driver.user?.firstName || 'Conductor'} ${driver.lastName || driver.user?.lastName || ''}`.trim();
  const coordinatesOf = driver => {
    const lat = Number(driver.lat ?? driver.latitude ?? driver.location?.lat);
    const lng = Number(driver.lng ?? driver.longitude ?? driver.location?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  };
  const activeTripFor = id => trips.find(trip => (trip.driverId === id || trip.assignedDriverId === id) && ACTIVE_TRIP_STATES.has(String(trip.status).toUpperCase()));
  const statusText = status => status === 'AVAILABLE' ? 'Disponible' : status === 'IN_TRIP' ? 'En viaje' : status === 'SOS' ? 'SOS activado' : 'Offline';
  const relativeTime = value => {
    const timestamp = new Date(value || 0).getTime();
    if (!timestamp) return 'Sin registro';
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `Hace ${seconds} segundos`;
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `Hace ${minutes} min` : `Hace ${Math.floor(minutes / 60)} h`;
  };

  function markerIcon(driver) {
    const status = statusOf(driver);
    const vehicleIcon = vehicleImage(driver.vehicleType, { variant: 'map', className: 'fleet-real-vehicle', decorative: true });
    return L.divIcon({
      className: 'fleet-driver-leaflet-marker',
      html: `<span class="${status.toLowerCase()}">${vehicleIcon}<i></i></span>`,
      iconSize: [42, 50],
      iconAnchor: [21, 44]
    });
  }

  function matchesFilter(driver) {
    const status = statusOf(driver);
    return selectedFilter === 'all' || status === selectedFilter;
  }

  function renderMarker(driver) {
    const id = driverId(driver);
    const coordinates = coordinatesOf(driver);
    if (!id || !coordinates) return;
    let marker = markers.get(id);
    if (!marker) {
      marker = L.marker(coordinates, { icon: markerIcon(driver), riseOnHover: true }).addTo(map);
      marker.on('click', () => selectDriver(id, true));
      markers.set(id, marker);
    } else {
      marker.setLatLng(coordinates);
      marker.setIcon(markerIcon(driver));
    }
    if (matchesFilter(driver) && !map.hasLayer(marker)) marker.addTo(map);
    if (!matchesFilter(driver) && map.hasLayer(marker)) marker.removeFrom(map);
  }

  function drawRoute(driver, fit = false) {
    if (activeRoute) {
      activeRoute.remove();
      activeRoute = null;
    }
    const coordinates = coordinatesOf(driver);
    const trip = activeTripFor(driverId(driver));
    if (!coordinates || !trip) return;
    const destination = ['IN_PROGRESS', 'IN_TRIP'].includes(String(trip.status).toUpperCase()) ? trip.destination : trip.pickup;
    const target = [Number(destination?.lat), Number(destination?.lng)];
    if (!Number.isFinite(target[0]) || !Number.isFinite(target[1])) return;
    activeRoute = L.polyline([coordinates, target], { color: '#ffc400', weight: 5, opacity: .9, dashArray: '2 9', lineCap: 'round' }).addTo(map);
    if (fit) map.fitBounds(activeRoute.getBounds(), { padding: [80, 80], maxZoom: 15 });
  }

  function selectDriver(id, center = false) {
    const driver = drivers.get(id);
    if (!driver) return;
    selectedDriverId = id;
    const status = statusOf(driver);
    const trip = activeTripFor(id);
    const panel = container.querySelector('#fleet-driver-panel');
    const photo = localAvatarHtml({ name: nameOf(driver), role: 'driver', label: nameOf(driver) });
    const routeLabel = trip ? `${trip.pickup?.address || 'Recogida'} → ${trip.destination?.address || 'Destino'}` : 'Sin viaje activo';
    const battery = Number(driver.batteryLevel ?? driver.battery);
    const speed = Number(driver.speed);
    panel.innerHTML = `<header>${photo}<div><strong>${escapeHtml(nameOf(driver))}</strong><span class="${status.toLowerCase()}">${statusText(status)}</span></div><button id="close-fleet-driver">${icon('close', 18)}</button></header>
      <div class="fleet-driver-facts">
        <article><span class="fleet-detail-vehicle">${vehicleImage(driver.vehicleType, { decorative: true })}</span><div><small>Vehículo</small><strong>${escapeHtml(`${driver.vehicleBrand || 'No disponible'} ${driver.vehicleModel || ''}`.trim())}</strong></div><code>${escapeHtml(driver.vehiclePlate || 'Sin placa')}</code></article>
        <article><span>${icon('route', 17)}</span><div><small>Ruta actual</small><strong>${escapeHtml(routeLabel)}</strong></div></article>
        <article><span>${icon('clock', 17)}</span><div><small>Última actualización GPS</small><strong class="fresh">${relativeTime(driver.updatedAt || driver.location?.updatedAt)}</strong></div></article>
        <article><span>${icon('trending', 17)}</span><div><small>Velocidad actual</small><strong>${Number.isFinite(speed) ? `${Math.round(speed)} km/h` : 'No disponible'}</strong></div></article>
        <article><span>${icon('zap', 17)}</span><div><small>Batería</small><strong class="fresh">${Number.isFinite(battery) ? `${Math.round(battery)}%` : 'No disponible'}</strong></div></article>
      </div>
      <footer><button id="fleet-view-trip" ${trip ? '' : 'disabled'}>${icon('map', 17)} Ver viaje</button><button id="fleet-contact-driver" ${driver.phone ? '' : 'disabled'}>${icon('phone', 17)} Contactar</button></footer>`;
    panel.classList.remove('hidden');
    panel.querySelector('#close-fleet-driver').onclick = () => {
      selectedDriverId = null;
      panel.classList.add('hidden');
      if (activeRoute) activeRoute.remove();
      activeRoute = null;
    };
    panel.querySelector('#fleet-view-trip').onclick = () => drawRoute(driver, true);
    panel.querySelector('#fleet-contact-driver').onclick = () => {
      if (!driver.phone) return showToast('Este conductor no tiene un teléfono registrado.', 'warning');
      window.location.href = `tel:${String(driver.phone).replace(/[^+\d]/g, '')}`;
    };
    drawRoute(driver, false);
    const coordinates = coordinatesOf(driver);
    if (center && coordinates) map.flyTo(coordinates, Math.max(map.getZoom(), 14), { duration: .7 });
  }

  function updateCounters() {
    const values = { AVAILABLE: 0, IN_TRIP: 0, OFFLINE: 0, SOS: 0 };
    drivers.forEach(driver => values[statusOf(driver)]++);
    const total = container.querySelector('#tot-drv');
    const available = container.querySelector('#on-drv');
    const trip = container.querySelector('#trp-drv');
    const offline = container.querySelector('#off-drv');
    if (total) total.textContent = drivers.size;
    if (available) available.textContent = values.AVAILABLE;
    if (trip) trip.textContent = values.IN_TRIP;
    if (offline) offline.textContent = values.OFFLINE;
  }

  function renderActivity() {
    const list = container.querySelector('#fleet-live-list');
    if (!list) return;
    const recent = [...drivers.values()].sort((a, b) => new Date(b.updatedAt || b.location?.updatedAt || 0) - new Date(a.updatedAt || a.location?.updatedAt || 0)).slice(0, 5);
    list.innerHTML = recent.map(driver => {
      const id = driverId(driver);
      const status = statusOf(driver);
      return `<button data-driver-id="${escapeHtml(id)}"><i class="${status.toLowerCase()}"></i><span><strong>${escapeHtml(nameOf(driver))}</strong><small class="${status.toLowerCase()}">${statusText(status)}</small></span><time>${relativeTime(driver.updatedAt || driver.location?.updatedAt).replace('Hace ', '')}</time></button>`;
    }).join('') || '<p>No hay conductores registrados.</p>';
    list.querySelectorAll('[data-driver-id]').forEach(button => button.onclick = () => selectDriver(button.dataset.driverId, true));
  }

  function upsertDriver(payload) {
    if (disposed) return;
    const id = driverId(payload);
    if (!id) return;
    const current = drivers.get(id) || {};
    const next = { ...current, ...payload, location: { ...(current.location || {}), ...(payload.location || {}) } };
    drivers.set(id, next);
    renderMarker(next);
    updateCounters();
    renderActivity();
    if (selectedDriverId === id) selectDriver(id, false);
  }

  try {
    const [initialDrivers, initialTrips] = await Promise.all([apiService.get('/drivers/nearby'), apiService.get('/trips')]);
    if (disposed) return;
    trips = Array.isArray(initialTrips) ? initialTrips : [];
    if (Array.isArray(initialDrivers)) initialDrivers.forEach(upsertDriver);
    const located = [...drivers.values()].map(coordinatesOf).filter(Boolean);
    if (located.length > 1) map.fitBounds(located, { padding: [70, 70], maxZoom: 14 });
    else if (located.length === 1) map.setView(located[0], 14);
  } catch {
    showToast('No se pudo cargar toda la telemetría de la flota.', 'warning');
  }

  container.querySelector('#status-filter').onchange = event => {
    selectedFilter = event.target.value;
    drivers.forEach(renderMarker);
  };
  container.querySelector('#show-all-fleet').onclick = () => {
    selectedFilter = 'all';
    container.querySelector('#status-filter').value = 'all';
    drivers.forEach(renderMarker);
    const located = [...drivers.values()].map(coordinatesOf).filter(Boolean);
    if (located.length) map.fitBounds(located, { padding: [70, 70], maxZoom: 14 });
  };

  const onLocation = payload => payload && upsertDriver(payload);
  const onUpdated = payload => payload && upsertDriver(payload);
  socketClient.connect();
  socketClient.on('admin:driver_location', onLocation);
  socketClient.on('admin:driver_updated', onUpdated);
  window.setTimeout(() => map.invalidateSize(), 180);

  const observer = new MutationObserver(() => {
    if (document.body.contains(container) && container.contains(mapElement)) return;
    disposed = true;
    socketClient.off('admin:driver_location', onLocation);
    socketClient.off('admin:driver_updated', onUpdated);
    map.remove();
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
