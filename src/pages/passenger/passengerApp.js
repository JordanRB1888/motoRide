import { MapComponent } from '../../components/mapComponent.js';
import { BottomSheet } from '../../components/bottomSheet.js';
import { showToast } from '../../components/toast.js';
import { icon } from '../../utils/icons.js';
import * as helpers from '../../utils/helpers.js';
import { apiService, db } from '../../services/apiService.js';
import { authService } from '../../services/authService.js';
import { socket } from '../../services/socketClient.js';
import { fareCalculator } from '../../services/fareCalculator.js';
import { renderFarePreview, renderSearchingState, renderDriverCard } from './requestRide.js';
import { renderActiveRide, renderTripComplete } from './activeRide.js';
import { createPrivatePhotoLoader, hydratePrivatePhotos, neutralizePrivatePhoto } from '../../utils/privatePhoto.js';
import { evaluateLocationSample, normalizeLocationSample } from '../../utils/locationQuality.js';
import { fromMapPoint, fromPreset } from '../../utils/canonicalLocation.js';
import { KNOWN_PLACES, findKnownPlace } from '../../utils/knownPlaces.js';
import { createDestinationSearch } from '../../services/destinationSearch.js';
import { getPlacesProvider } from '../../services/placesService.js';
import { createNavigationRouteService } from '../../services/navigationRoute.js';
import { createPrivatePhotoScope } from '../../utils/privatePhotoScope.js';
import { renderRideHistory } from './rideHistory.js';
import { renderWallet } from './wallet.js';
import { renderProfile } from './profile.js';
import { createChatModal } from '../../components/chatModal.js';
import { createSosModal } from '../../components/sosModal.js';
import { createPaymentModal } from '../../components/paymentModal.js';
import { initThemeToggle } from '../../utils/themeToggle.js';
import { createRatingTipModal } from '../../components/ratingTipModal.js';
import { createDigitalReceiptModal } from '../../components/digitalReceiptModal.js';
import { createNotificationCenterModal } from '../../components/notificationCenterModal.js';
import { createScheduleRideModal } from '../../components/scheduleRideModal.js';
import { notificationService } from '../../services/notificationService.js';
import { audioEffects } from '../../utils/audioEffects.js';
import { eventLogger } from '../../utils/logger.js';
import { driverDispatchService } from '../../services/driverDispatchService.js';
import { createAdminSupportChat } from '../../components/adminSupportChat.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';
import { safeCoordinate } from '../../utils/safeDom.js';
import { isInsideMaracaiboServiceArea, MARACAIBO_SERVICE_CENTER } from '../../utils/operatingArea.js';
import { isSafeTransportUiEnabled } from '../../utils/safeTransportFlag.js';
import { renderSafeTransport } from './safeTransport.js';
import { consultarAcceso as consultarAccesoTransporteSeguro } from '../../services/safeTransportService.js';

export function renderPassengerApp(container) {
  let currentState = 'IDLE';
  let mapComponent = null;
  let bottomSheet = null;
  let privatePhotos = null;
  let photoScope = null;
  let currentTrip = null;
  let currentDriver = null;
  let searchTimeout = null;
  let lastRouteRefreshAt = 0;
  let passengerWatchId = null;
  let passengerLocation = null;
  let passengerLocationUpdatedAt = 0;
  let passengerLocationRequestPromise = null;
  let selectedPickupLocation = null;
  let destinationSelectionId = 0;
  let pendingDestinationAfterPermission = null;
  let activeChat = null;
  let activeChatTripId = null;
  let unreadMessages = 0;
  let activeRatingModal = null;
  let tripStatusPollId = null;
  let selectedRideType = 'MOTO';
  let brandRideAnimationTimer = null;
  const notifiedTripEvents = new Set();

  const user = authService.getCurrentUser();
  if (!user) return;

  container.innerHTML = `
    <div class="passenger-app">
      <div id="map-container" class="map-background"></div>

      <header class="passenger-mobile-header">
        <button class="passenger-profile-shortcut" type="button" aria-label="Abrir perfil">
          <span>${(user.firstName || user.name || 'P').charAt(0)}</span>
        </button>
        <div class="passenger-brand-lockup"><img src="/brand-logo-header.png" alt="+58 Express"></div>
        <div class="passenger-header-actions">
          <button id="passenger-support-shortcut" class="passenger-header-icon" type="button" aria-label="Abrir soporte">${icon('message', 20)}</button>
          <button id="header-notif-btn-passenger" class="passenger-header-icon" type="button" title="Centro de Notificaciones">
            ${icon('bell', 20)}
            <span id="notif-badge-passenger">0</span>
          </button>
          <div id="header-theme-toggle-slot"></div>
        </div>
      </header>

      <div id="manual-pickup-banner" class="manual-pickup-banner hidden" role="status">
        <span class="manual-pickup-icon">${icon('mapPin', 20)}</span>
        <div><strong>Marca tu punto de recogida</strong><small>Toca en el mapa el lugar exacto donde estás</small></div>
        <button id="cancel-manual-pickup" type="button" aria-label="Cancelar selección manual">${icon('close', 16)}</button>
      </div>
      
      <!-- Top Search Bar -->
      <div class="top-search-bar" id="top-search-bar">
        <span class="passenger-dock-handle" aria-hidden="true"></span>
        <span class="passenger-search-title">¿A dónde vamos?</span>
        <div class="search-input-wrapper">
          <div class="search-icon">${icon('search')}</div>
          <input type="text" id="destination-input" placeholder="Ingresa tu destino" readonly>
        </div>
        <div class="passenger-vehicle-selector" aria-label="Tipo de servicio">
          <button type="button" class="vehicle-choice active" data-vehicle="MOTO"><span class="vehicle-art">${vehicleImage('MOTO', { decorative: true })}</span><span><b>Moto</b><small>1 pasajero</small><em>Desde $1.50</em></span></button>
          <button type="button" class="vehicle-choice" data-vehicle="CAR"><span class="vehicle-art">${vehicleImage('CAR', { decorative: true })}</span><span><b>Auto</b><small>1–4 pasajeros</small><em>Desde $2.50</em></span></button>
        </div>
        ${isSafeTransportUiEnabled() ? `<div id="safe-transport-entry-slot"></div>` : ''}
      </div>

      <!-- Floating Top Active Route Bar with Direct Cancel Button -->
      <div id="route-cancel-bar" style="
        position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
        width: 92%; max-width: 440px; z-index: 9995; background: rgba(18, 24, 36, 0.95);
        backdrop-filter: blur(20px); border: 1.5px solid var(--border-gold);
        border-radius: 24px; padding: 12px 18px; display: none; align-items: center; justify-content: space-between;
        box-shadow: 0 10px 30px rgba(0,0,0,0.7);
      ">
        <div style="display:flex; align-items:center; gap: 10px; flex:1; overflow:hidden;">
          <span style="color:var(--x58-yellow-text); display:flex;">${icon('mapPin', 20)}</span>
          <div style="flex:1; overflow:hidden;">
            <small style="color:var(--text-secondary); display:block; font-size:0.75rem;">DESTINO ACTUAL</small>
            <strong id="route-cancel-dest-name" style="color:var(--text-primary); font-size:0.9rem; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              Basílica de Chiquinquirá
            </strong>
          </div>
        </div>
        <button id="floating-cancel-route-btn" style="
          background: rgba(255, 77, 77, 0.2); border: 1.5px solid var(--danger);
          color: var(--danger); font-weight: 800; font-size: 0.85rem; padding: 8px 14px;
          border-radius: 14px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; gap: 4px;
        ">
          ${icon('close', 16)} Cancelar Ruta
        </button>
      </div>

      <!-- Bottom Tab Navigation -->
      <div class="bottom-nav">
        <button class="nav-btn active" data-tab="home">
          ${icon('home')}
          <span>Inicio</span>
        </button>
        <button class="nav-btn" data-tab="history">
          ${icon('history')}
          <span>Mis Viajes</span>
        </button>
        <button class="nav-btn" data-tab="wallet">
          ${icon('wallet')}
          <span>Wallet</span>
        </button>
        <button class="nav-btn" data-tab="profile">
          ${icon('user')}
          <span>Perfil</span>
        </button>
      </div>
      
      <div id="bottom-sheet-container"></div>
      <div id="overlay-container"></div>
      <button id="passenger-trip-panel-toggle" class="passenger-trip-panel-toggle hidden" type="button" aria-expanded="true">
        <span class="passenger-trip-toggle-icon">⌄</span>
        <span class="passenger-trip-toggle-label">Minimizar viaje</span>
      </button>
      <button id="passenger-active-chat-btn" class="passenger-active-chat-btn hidden" aria-label="Abrir chat de la carrera">
        <span>${icon('message', 20)}</span><span>Chat</span>
        <span id="passenger-chat-unread" class="passenger-chat-unread hidden">0</span>
      </button>
    </div>
  `;

  // Inject Theme Toggle Button
  const themeSlot = container.querySelector('#header-theme-toggle-slot');
  if (themeSlot) {
    themeSlot.appendChild(initThemeToggle());
  }
  requestAnimationFrame(() => animatePassengerHomeBrand());
  container.querySelector('.passenger-profile-shortcut')?.addEventListener('click', () => handleNavigation('profile'));
  // Piloto controlado (1G): la entrada NO existe hasta que el SERVIDOR
  // confirme que esta cuenta está autorizada — nada se pinta mientras la
  // consulta está en vuelo, y un fallo o un 404 la dejan ausente. La
  // seguridad real vive en el backend; esto es solo visibilidad.
  if (isSafeTransportUiEnabled()) {
    consultarAccesoTransporteSeguro().then(autorizado => {
      const hueco = container.querySelector('#safe-transport-entry-slot');
      if (!autorizado || !hueco) return;
      hueco.innerHTML = `
        <button type="button" id="safe-transport-entry" class="st-entry-card">
          <span>${icon('shield', 20)}</span>
          <span><b>Transporte Seguro</b><small>Programa tus traslados de ida y vuelta</small></span>
          <span class="st-entry-go">${icon('chevronRight', 16)}</span>
        </button>`;
      hueco.querySelector('#safe-transport-entry')?.addEventListener('click', () => handleNavigation('transporte-seguro'));
    }).catch(() => {});
  }
  container.querySelector('#passenger-support-shortcut')?.addEventListener('click', () => document.body.appendChild(createAdminSupportChat(user)));

  // Top Schedule Ride Button Listener
  const topScheduleBtn = container.querySelector('#top-schedule-ride-btn');
  if (topScheduleBtn) {
    topScheduleBtn.addEventListener('click', () => {
      openScheduleModal('Sambil Maracaibo', 4.50);
    });
  }

  // Notification Bell Listener
  const notifBtn = container.querySelector('#header-notif-btn-passenger');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      const modal = createNotificationCenterModal(user);
      container.appendChild(modal);
    });
  }

  // Initialize Map
  const mapEl = container.querySelector('#map-container');
  mapComponent = new MapComponent(mapEl);
  mapComponent.init({ lat: 10.6427, lng: -71.6125 }, 14);

  // Initialize Bottom Sheet
  const sheetEl = container.querySelector('#bottom-sheet-container');
  bottomSheet = new BottomSheet(sheetEl);
    // Dueno unico de las object URLs de fotografias de esta pantalla.
    privatePhotos = createPrivatePhotoLoader({ loadUrl: endpoint => apiService.getPrivateFileUrl(endpoint) });
    // El alcance decide cuando muere la fotografia del conductor: al cambiar
    // de viaje, de conductor o de foto, y al cerrarse el viaje.
    photoScope = createPrivatePhotoScope({ loader: privatePhotos });
  const persistentChatBtn = container.querySelector('#passenger-active-chat-btn');
  const passengerTripToggle = container.querySelector('#passenger-trip-panel-toggle');
  const chatUnreadBadge = container.querySelector('#passenger-chat-unread');
  const manualPickupBanner = container.querySelector('#manual-pickup-banner');
  let passengerTripPanelCollapsed = false;

  function setPassengerTripPanelCollapsed(collapsed) {
    passengerTripPanelCollapsed = Boolean(collapsed);
    passengerTripToggle.setAttribute('aria-expanded', String(!passengerTripPanelCollapsed));
    passengerTripToggle.querySelector('.passenger-trip-toggle-icon').textContent = passengerTripPanelCollapsed ? '⌃' : '⌄';
    passengerTripToggle.querySelector('.passenger-trip-toggle-label').textContent = passengerTripPanelCollapsed ? 'Ver información del viaje' : 'Minimizar viaje';
    if (passengerTripPanelCollapsed) {
      bottomSheet.close();
      passengerTripToggle.classList.remove('hidden');
      persistentChatBtn.classList.toggle('hidden', !currentDriver);
    } else {
      bottomSheet.expand();
      persistentChatBtn.classList.add('hidden');
      // Expanded cards contain their own minimize control. The floating toggle
      // is only needed to restore a card after it has been collapsed.
      passengerTripToggle.classList.add('hidden');
    }
  }

  function showPassengerTripToggle(reset = false) {
    if (reset) passengerTripPanelCollapsed = false;
    setPassengerTripPanelCollapsed(passengerTripPanelCollapsed);
  }

  function hidePassengerTripToggle() {
    passengerTripToggle.classList.add('hidden');
    persistentChatBtn.classList.add('hidden');
    passengerTripPanelCollapsed = false;
  }

  passengerTripToggle.addEventListener('click', () => setPassengerTripPanelCollapsed(!passengerTripPanelCollapsed));
  window.addEventListener('58express:minimize-passenger-trip', () => setPassengerTripPanelCollapsed(true));
  const notificationBadge = container.querySelector('#notif-badge-passenger');
  const updateNotificationBadge = () => {
    const count = notificationService.getUnreadCount(user.id || 'p1');
    notificationBadge.textContent = count > 99 ? '99+' : String(count);
    notificationBadge.style.display = count > 0 ? 'flex' : 'none';
  };
  window.addEventListener('58express:notifications-updated', event => {
    if (event.detail?.userId === (user.id || 'p1')) updateNotificationBadge();
  });
  updateNotificationBadge();
  persistentChatBtn.addEventListener('click', () => openChatModal());
  container.querySelector('#cancel-manual-pickup')?.addEventListener('click', cancelManualPickupSelection);
  requestPassengerPermissions();
  watchPassengerLocationPermission();

  function setPassengerLocation(location) {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || location?.isFallback) return null;
    const isFirstLocation = !passengerLocation;
    passengerLocation = {
      lat,
      lng,
      accuracy: Number(location?.accuracy) || null,
      source: location?.source === 'manual' ? 'manual' : 'gps'
    };
    passengerLocationUpdatedAt = Number(location?.capturedAt) || Date.now();
    mapComponent.setUserLocation(lat, lng);
    if (isFirstLocation) mapComponent.centerOn(lat, lng, 15);
    return passengerLocation;
  }

  async function getPassengerOrigin() {
    if (!passengerLocationRequestPromise) {
      const nativeLocationRequest = (async () => {
        try {
          const location = await mapComponent.getUserLocation({ allowFallback: false });
          return setPassengerLocation(location);
        } catch (error) {
          const cachedLocationIsFresh = passengerLocation && (Date.now() - passengerLocationUpdatedAt) < 60000;
          if (cachedLocationIsFresh) return passengerLocation;
          throw error;
        }
      })();
      passengerLocationRequestPromise = nativeLocationRequest.finally(() => {
        passengerLocationRequestPromise = null;
      });
    }

    let timeoutId;
    const appTimeout = new Promise((resolve, reject) => {
      timeoutId = window.setTimeout(() => {
        const error = new Error('GPS confirmation timed out');
        error.code = 'APP_GPS_TIMEOUT';
        reject(error);
      }, 8000);
    });
    try {
      return await Promise.race([passengerLocationRequestPromise, appTimeout]);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function getGeolocationPermissionState() {
    if (!navigator.permissions?.query) return 'unknown';
    try {
      return (await navigator.permissions.query({ name: 'geolocation' })).state;
    } catch {
      return 'unknown';
    }
  }

  async function retryPendingDestinationAfterPermission() {
    if (!pendingDestinationAfterPermission) return;
    const permissionState = await getGeolocationPermissionState();
    if (permissionState !== 'granted') return;
    const destination = pendingDestinationAfterPermission;
    pendingDestinationAfterPermission = null;
    hideManualPickupBanner();
    selectDestination(destination);
  }

  function showManualPickupBanner() {
    manualPickupBanner?.classList.remove('hidden');
    container.classList.add('manual-pickup-mode');
  }

  function hideManualPickupBanner() {
    manualPickupBanner?.classList.add('hidden');
    container.classList.remove('manual-pickup-mode');
  }

  function beginManualPickupSelection(place, { recenterToMaracaibo = false } = {}) {
    pendingDestinationAfterPermission = { ...place };
    setState('SELECTING_PICKUP');
    mapComponent.clearRoute();
    mapComponent.clearMarkers('destination');
    mapComponent.addMarker([Number(place.lat), Number(place.lng)], 'destination');
    bottomSheet.collapse();
    showManualPickupBanner();
    if (recenterToMaracaibo) {
      mapComponent.centerOn(MARACAIBO_SERVICE_CENTER.lat, MARACAIBO_SERVICE_CENTER.lng, 13);
    }
  }

  function cancelManualPickupSelection() {
    pendingDestinationAfterPermission = null;
    hideManualPickupBanner();
    mapComponent.clearMarkers('destination');
    setState('IDLE');
  }

  function confirmManualPickup(latlng) {
    const destination = pendingDestinationAfterPermission;
    if (!destination) return;
    const manualOrigin = setPassengerLocation({
      lat: latlng.lat,
      lng: latlng.lng,
      capturedAt: Date.now(),
      source: 'manual'
    });
    if (!manualOrigin) return;
    pendingDestinationAfterPermission = null;
    hideManualPickupBanner();
    showToast('Punto de recogida confirmado.', 'success');
    selectDestination(destination, { originOverride: manualOrigin });
  }

  async function watchPassengerLocationPermission() {
    if (!navigator.permissions?.query) return;
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      status.addEventListener?.('change', retryPendingDestinationAfterPermission);
      window.addEventListener('focus', retryPendingDestinationAfterPermission);
    } catch {
      // Safari and some installed PWAs do not expose the Permissions API.
    }
  }

  async function requestPassengerPermissions() {
    const permissionKey = `58express_permissions_prompted_${user.id || 'p1'}`;
    if (localStorage.getItem(permissionKey) === 'yes') {
      const permissionState = await getGeolocationPermissionState();
      if (permissionState === 'granted') {
        getPassengerOrigin().catch(() => {
          showToast('No fue posible actualizar tu ubicación. Verifica que el GPS esté encendido.', 'info');
        });
      }
      return;
    }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:30000;background:rgba(8,13,22,.88);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(16px)';
    overlay.innerHTML = `<div style="width:100%;max-width:420px;padding:24px;border-radius:26px;background:var(--surface-card);border:2px solid var(--accent-primary);box-shadow:0 24px 60px rgba(0,0,0,.65)"><div style="font-size:2.5rem;text-align:center">${icon('mapPin', 24)} ${icon('bell', 24)}</div><h3 style="color:var(--text-primary);text-align:center;margin:10px 0 8px">Permisos para tu seguridad</h3><p style="color:var(--text-secondary);line-height:1.5;font-size:.9rem">+58express necesita tu ubicación para buscar conductores y mostrar el recorrido en vivo. Las notificaciones te avisarán cuando acepten, lleguen, inicien o finalicen tu carrera.</p><button id="allow-passenger-permissions" style="width:100%;padding:15px;border:0;border-radius:16px;background:linear-gradient(135deg,#FFC107,#FF9800);color:#121824;font-weight:950;cursor:pointer">PERMITIR UBICACIÓN Y NOTIFICACIONES</button><button id="later-passenger-permissions" style="width:100%;padding:12px;margin-top:8px;border:0;background:none;color:var(--text-secondary);font-weight:800;cursor:pointer">Ahora no</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#allow-passenger-permissions').addEventListener('click', async () => {
      localStorage.setItem(permissionKey, 'yes');
      // Start both permission requests directly from the user's tap. Browsers
      // require this gesture for notification permission.
      const notificationPermission = notificationService.requestBrowserPermission();
      const locationPermission = getPassengerOrigin().catch(() => null);
      const [notificationGranted, location] = await Promise.all([notificationPermission, locationPermission]);
      overlay.remove();
      if (!location) {
        const permissionState = await getGeolocationPermissionState();
        showToast(permissionState === 'prompt'
          ? 'Confirma “Seguir permitiendo” y pulsa “Listo” para activar tu ubicación.'
          : 'No se obtuvo tu GPS. Activa la ubicación precisa antes de solicitar una carrera.', permissionState === 'prompt' ? 'info' : 'error');
      } else {
        showToast(notificationGranted ? 'Ubicación y notificaciones activadas' : 'Ubicación activada. Puedes habilitar notificaciones en los ajustes del navegador.', notificationGranted ? 'success' : 'info');
      }
    });
    overlay.querySelector('#later-passenger-permissions').addEventListener('click', () => {
      localStorage.setItem(permissionKey, 'yes');
      overlay.remove();
    });
  }

  function notifyTripEvent(key, title, message) {
    const tripId = currentTrip?.id || 'general';
    const uniqueKey = `${tripId}:${key}`;
    if (notifiedTripEvents.has(uniqueKey)) return;
    notifiedTripEvents.add(uniqueKey);
    notificationService.notify(user.id || 'p1', { title, message, category: 'TRIP', icon: '🔔' });
  }

  // Floating Cancel Route Listener
  const floatingCancelBtn = container.querySelector('#floating-cancel-route-btn');
  if (floatingCancelBtn) {
    floatingCancelBtn.addEventListener('click', cancelRouteAndSelectNew);
  }

  // Direct Map Click Listener to pick destination on map
  mapComponent.onMapClick((latlng) => {
    if (currentState === 'SELECTING_PICKUP') {
      confirmManualPickup(latlng);
      return;
    }
    if (currentState === 'IDLE' || currentState === 'SELECTING_DESTINATION' || currentState === 'FARE_PREVIEW') {
      selectDestination(fromMapPoint({ lat: latlng.lat, lng: latlng.lng }));
    }
  });

  // Event Listeners for Nav
  container.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      container.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      handleNavigation(tab);
    });
  });

  // Event Listener for Search and Header Buttons
  const searchInputWrapper = container.querySelector('.search-input-wrapper');
  const searchInput = container.querySelector('#destination-input');
  searchInputWrapper.addEventListener('click', openSearchSheet);
  searchInput.addEventListener('click', openSearchSheet);

  container.querySelectorAll('.vehicle-choice').forEach(button => {
    button.addEventListener('click', () => {
      selectedRideType = button.dataset.vehicle || 'MOTO';
      container.querySelectorAll('.vehicle-choice').forEach(item => item.classList.toggle('active', item === button));
    });
  });

  const menuBtn = container.querySelector('.menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', openProfileMenu);

  function handleNavigation(tab) {
    const overlay = container.querySelector('#overlay-container');
    if (tab === 'home') {
      overlay.innerHTML = '';
      overlay.classList.remove('active');
      animatePassengerHomeBrand();
    } else {
      if (bottomSheet) bottomSheet.close();
      const wrapper = document.createElement('div');
      wrapper.className = 'page-overlay glass-panel active';
      overlay.innerHTML = '';
      overlay.appendChild(wrapper);
      overlay.classList.add('active');
      if (tab === 'history') renderRideHistory(wrapper);
      else if (tab === 'wallet') renderWallet(wrapper);
      else if (tab === 'profile') renderProfile(wrapper);
      else if (tab === 'transporte-seguro') {
        // SAFE-1F: página del Transporte Seguro; su botón «volver» y el paso
        // a un viaje activo regresan al Inicio (la pantalla de viaje normal).
        renderSafeTransport(wrapper, { onClose: () => handleNavigation('home') });
      }
    }
  }

  function animatePassengerHomeBrand() {
    const brand = container.querySelector('.passenger-brand-lockup');
    if (!brand || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    window.clearTimeout(brandRideAnimationTimer);
    brand.classList.remove('passenger-brand-ride-in');
    // Reinicia la animación incluso si el usuario vuelve a tocar Inicio.
    void brand.offsetWidth;
    brand.classList.add('passenger-brand-ride-in');
    brandRideAnimationTimer = window.setTimeout(() => {
      brand.classList.remove('passenger-brand-ride-in');
    }, 950);
  }

  function openProfileMenu() {
    container.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const profileBtn = container.querySelector('.nav-btn[data-tab="profile"]');
    if (profileBtn) profileBtn.classList.add('active');
    handleNavigation('profile');
  }

  function openSearchSheet() {
    setState('SELECTING_DESTINATION');
    const content = `
      <div class="search-sheet">
        <div class="search-sheet-header">
          <h3>¿A dónde quieres ir en Maracaibo?</h3>
          <button id="close-search-sheet-btn" class="search-sheet-close" type="button" aria-label="Cerrar búsqueda">✕</button>
        </div>

        <div class="search-sheet-input">
          <div class="search-sheet-input-icon">
            ${icon('search', 20)}
          </div>
          <input type="text" id="live-search-input" placeholder="Buscar en Maracaibo (ej: Basílica, Sambil, Vereda)..." autocomplete="off">
        </div>

        <div class="search-sheet-scroll">
          <ul class="search-results" id="search-results"></ul>

          <div class="recent-places" style="display:flex; flex-direction:column; gap:12px;">
          ${KNOWN_PLACES.map(lugar => `
          <div class="place-item preset-place" data-preset-id="${lugar.id}"
               style="display:flex; align-items:center; gap:14px; padding:12px 16px; background:var(--surface-elevated); border-radius:16px; border:1px solid var(--border-color); cursor:pointer; transition:all 0.2s ease;">
            <div style="width:40px; height:40px; border-radius:50%; background:${lugar.tone}; display:flex; align-items:center; justify-content:center; color:${lugar.color}; flex-shrink:0;">
              ${icon(lugar.icon, 20)}
            </div>
            <div class="place-info" style="flex:1;">
              <strong style="display:block; color:var(--text-primary); font-size:0.98rem; font-weight:600;">${lugar.label}</strong>
              <span style="color:var(--text-secondary); font-size:0.82rem;">${lugar.secondary}</span>
            </div>
            <span style="color:${lugar.color}; font-size:1.1rem;">➔</span>
          </div>`).join('')}
          </div>
        </div>
      </div>
    `;
    bottomSheet.setContent(content);
    bottomSheet.expand();

    const closeBtn = document.getElementById('close-search-sheet-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        bottomSheet.collapse();
        setState('IDLE');
      });
    }

    // Direct event delegation on bottomSheet.content for instant click handling (0ms delay)
    bottomSheet.content.onclick = (e) => {
      const preset = e.target.closest('.preset-place');
      if (preset) {
        // El marcado solo lleva el id: las coordenadas canonicas viven en
        // knownPlaces y no pueden divergir de lo que se muestra.
        const lugar = findKnownPlace(preset.dataset.presetId);
        if (lugar) selectDestination(fromPreset(lugar));
      }
    };

    const liveInput = document.getElementById('live-search-input');
    if (liveInput) {
      liveInput.focus();
      liveInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length > 2) {
          searchTimeout = setTimeout(() => ejecutarBusquedaDestino(query), 500);
        } else {
          // Campo vacio o muy corto: se invalida lo que este en vuelo para
          // que una respuesta tardia no repueble una lista ya limpia.
          buscadorDestinos.cancel();
          const resultsContainer = document.getElementById('search-results');
          if (resultsContainer) resultsContainer.innerHTML = '';
        }
      });
    }
  }

  /** Nominatim crudo: el respaldo de siempre, con sus validaciones. */
  async function buscarNominatim(query) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Maracaibo, Zulia, Venezuela')}&limit=5`);
    const data = await res.json();
    // Nominatim es un servicio externo: sus coordenadas se validan y su
    // texto nunca entra por innerHTML.
    return (Array.isArray(data) ? data : []).filter(item =>
      safeCoordinate(item?.lat, 'lat') !== null
      && safeCoordinate(item?.lon, 'lng') !== null
      && String(item?.display_name ?? '').trim());
  }

  // Google Places cuando este configurado y disponible; Nominatim como
  // respaldo. Cada busqueda invalida a las anteriores: una respuesta lenta
  // jamas pisa a una mas nueva (MAPS-2A).
  const buscadorDestinos = createDestinationSearch({
    placesProvider: getPlacesProvider(),
    nominatimSearch: buscarNominatim
  });

  async function ejecutarBusquedaDestino(query) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    let respuesta;
    try {
      respuesta = await buscadorDestinos.search(query);
    } catch {
      return;
    }
    if (respuesta.stale) return;

    resultsContainer.innerHTML = '';
    for (const candidato of respuesta.candidates) {
      const li = document.createElement('li');
      li.style.cssText = 'padding:12px; border-bottom:1px solid var(--border-color); cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:10px;';
      // El icono es markup propio de la aplicacion; los textos del proveedor
      // van como texto plano, nunca por innerHTML.
      const pin = document.createElement('span');
      pin.className = 'search-result-pin';
      pin.innerHTML = icon('mapPin');
      const textos = document.createElement('span');
      textos.style.cssText = 'display:flex;flex-direction:column;min-width:0';
      const titulo = document.createElement('strong');
      titulo.style.cssText = 'font-size:.92rem;font-weight:600';
      titulo.textContent = candidato.title;
      textos.appendChild(titulo);
      if (candidato.subtitle) {
        const detalle = document.createElement('small');
        detalle.style.cssText = 'color:var(--text-secondary);font-size:.78rem';
        detalle.textContent = candidato.subtitle;
        textos.appendChild(detalle);
      }
      li.append(pin, textos);
      li.addEventListener('click', async () => {
        // `resolve()` entrega la ubicacion canonica DEFINITIVA del proveedor
        // que mostro el resultado. Sus coordenadas ya no cambian nunca.
        let canonica = null;
        try {
          canonica = await candidato.resolve();
        } catch {
          canonica = null;
        }
        if (!canonica) {
          showToast('No pudimos confirmar ese destino. Intenta con otro resultado.', 'error');
          return;
        }
        selectDestination(canonica);
      });
      resultsContainer.appendChild(li);
    }
  }

  // MAPS-2C: geometria de Google Routes SOLO como mejora visual del
  // trazado del pasajero. Sin respaldo OSRM propio: la polilinea OSRM ya
  // esta pintada por drawRoute (y es la que fija la tarifa); si Google no
  // responde, no se repinta nada y no se duplica ninguna llamada.
  const rutaVisualGoogle = createNavigationRouteService({ osrmRoute: async () => null });

  let selectedPaymentMethod = 'pago_movil';

  let currentSelectedDestinationName = 'Vereda del Lago, Maracaibo';
  // La ubicacion canonica seleccionada (MAPS-2A): marcador, ruta y payload
  // del viaje leen de ESTE objeto. Es inmutable y nadie re-geocodifica su
  // texto: sus lat/lng son la autoridad final.
  let currentSelectedDestination = null;

  async function selectDestination(location, { originOverride = null } = {}) {
    const selectionId = ++destinationSelectionId;
    currentSelectedDestinationName = location?.displayName || 'Punto de Destino en Maracaibo';
    const lat = safeCoordinate(location?.lat, 'lat');
    const lon = safeCoordinate(location?.lng, 'lng');
    if (lat === null || lon === null) {
      showToast('No pudimos identificar las coordenadas de ese destino.', 'error');
      return;
    }
    currentSelectedDestination = location;
    if (!isInsideMaracaiboServiceArea({ lat, lng: lon })) {
      setState('IDLE');
      mapComponent.clearRoute();
      mapComponent.clearMarkers('destination');
      mapComponent.centerOn(MARACAIBO_SERVICE_CENTER.lat, MARACAIBO_SERVICE_CENTER.lng, 13);
      showToast('Ese punto está fuera de la zona +58Express. Elige un destino en Maracaibo.', 'error', 7000);
      return;
    }

    let origin = originOverride;
    if (!origin) {
      const locationToast = showToast('Obteniendo tu ubicación actual para calcular la ruta...', 'info', 10000);
      try {
        origin = await getPassengerOrigin();
      } catch (error) {
        locationToast?.close();
        beginManualPickupSelection(location);
        return;
      }
      locationToast?.close();
    }
    if (selectionId !== destinationSelectionId || !origin) return;

    if (!isInsideMaracaiboServiceArea(origin)) {
      showToast('Tu GPS aparece fuera de Maracaibo. Marca en el mapa el punto real donde debe recogerte el conductor.', 'error', 9000);
      beginManualPickupSelection(location, { recenterToMaracaibo: true });
      return;
    }

    selectedPickupLocation = { ...origin };
    const pickup = [selectedPickupLocation.lat, selectedPickupLocation.lng];
    
    // Show top floating route cancel bar
    const routeCancelBar = container.querySelector('#route-cancel-bar');
    const routeDestName = container.querySelector('#route-cancel-dest-name');
    if (routeCancelBar && routeDestName) {
      routeDestName.textContent = currentSelectedDestinationName;
      routeCancelBar.style.display = 'flex';
    }

    mapComponent.clearRoute();
    mapComponent.clearMarkers('destination');
    mapComponent.setUserLocation(selectedPickupLocation.lat, selectedPickupLocation.lng);
    mapComponent.addMarker([lat, lon], 'destination');

    // Calculate real dynamic distance immediately based on exact destination coordinates
    const calcDistKm = helpers.getHaversineDistanceKm(pickup[0], pickup[1], lat, lon);
    const calcDurMin = Math.max(4, Math.round(calcDistKm * 2.2));
    const initialFare = fareCalculator.calculateFare(calcDistKm, calcDurMin, selectedRideType);

    showFarePreview(currentSelectedDestinationName, { distanceKm: calcDistKm, durationMin: calcDurMin }, initialFare, [lat, lon]);

    // Draw route asynchronously on map & update precise OSRM fare
    mapComponent.drawRoute(pickup, [lat, lon]).then(routeInfo => {
      if (selectionId !== destinationSelectionId) return;
      const realDistKm = routeInfo?.distanceKm || (routeInfo?.distance ? (routeInfo.distance / 1000) : calcDistKm);
      const realDurMin = routeInfo?.durationMin || (routeInfo?.duration ? (routeInfo.duration / 60) : calcDurMin);
      const realFare = fareCalculator.calculateFare(realDistKm, realDurMin, selectedRideType);
      showFarePreview(currentSelectedDestinationName, { distanceKm: realDistKm, durationMin: realDurMin }, realFare, [lat, lon]);

      // MAPS-2C: mejora visual progresiva. Con la TARIFA ya fijada por el
      // routeInfo de OSRM de arriba, se pide la geometria de Google Routes y,
      // si llega, sustituye SOLO el trazado pintado. Si Google no esta o
      // falla, la polilinea OSRM visible se queda tal cual. El precio no se
      // recalcula: navegar y cobrar siguen separados.
      rutaVisualGoogle.computeNavigationRoute({
        origin: { lat: pickup[0], lng: pickup[1] },
        destination: { lat, lng: lon }
      }).then(({ stale, route }) => {
        if (stale || !route || route.provider !== 'google') return;
        if (selectionId !== destinationSelectionId) return;
        mapComponent.drawNavigationRoute(route);
      }).catch(() => {});
    }).catch(err => console.warn('Map route draw info:', err));
  }

  async function openPaymentModal(destName, routeInfo, fareData, destCoords) {
    const latestWallet = await apiService.get('/wallet/me');
    const modal = createPaymentModal({
      currentMethod: selectedPaymentMethod,
      walletBalance: latestWallet?.balance ?? Number(user.walletBalance || 0),
      onSelect: (method) => {
        selectedPaymentMethod = method;
        showToast(`Método de pago: ${method.toUpperCase().replace('_', ' ')} seleccionado`, 'success');
        showFarePreview(destName, routeInfo, fareData, destCoords);
      },
      onTopUp: () => {
        handleNavigation('wallet');
      }
    });
    modal.open();
  }

  function showFarePreview(destName, routeInfo, fareData, destCoords) {
    setState('FARE_PREVIEW');
    const pricedFare = fareCalculator.calculateFare(Number(routeInfo?.distanceKm || 0), Number(routeInfo?.durationMin || 0), selectedRideType);
    const fareUSDVal = Number(pricedFare?.fareUSD ?? fareData?.fareUSD ?? fareData?.totalUSD ?? 4.50);
    const fareVESVal = fareUSDVal * 874.50;
    
    const distKmStr = routeInfo?.distanceKm ? routeInfo.distanceKm.toFixed(1) + ' km' : ((routeInfo?.distance || 4800) / 1000).toFixed(1) + ' km';
    const durMinStr = routeInfo?.durationMin ? Math.round(routeInfo.durationMin) + ' min' : Math.round((routeInfo?.duration || 720) / 60) + ' min';

    const content = renderFarePreview(
      {
        destination: destName,
        distance: distKmStr,
        duration: durMinStr,
        fareUSD: fareUSDVal.toFixed(2),
        fareVES: fareVESVal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        rideType: selectedRideType,
        paymentMethod: selectedPaymentMethod
      }, 
      () => requestRide(destCoords, {
        fareUSD: fareUSDVal,
        fareVES: fareVESVal,
        distanceKm: Number(routeInfo?.distanceKm || 0),
        durationMin: Number(routeInfo?.durationMin || 0),
        paymentMethod: selectedPaymentMethod,
        exchangeRateType: 'BCV',
        rideType: selectedRideType
      }),
      () => openPaymentModal(destName, routeInfo, fareData, destCoords),
      () => cancelRouteAndSelectNew(),
      () => openScheduleModal(destName, fareUSDVal),
      (rideType) => {
        selectedRideType = rideType === 'CAR' ? 'CAR' : 'MOTO';
        showFarePreview(destName, routeInfo, fareData, destCoords);
      }
    );
    
    bottomSheet.setContent(content);
    bottomSheet.expand();
  }

  function openScheduleModal(destName, fareEUR) {
    const modal = createScheduleRideModal({
      destinationName: destName,
      fareEUR,
      onSchedule: (res) => {
        bottomSheet.collapse();
        mapComponent.clearRoute();
        mapComponent.clearMarkers('destination');
        
        // Hide top cancel route bar
        const routeCancelBar = container.querySelector('#route-cancel-bar');
        if (routeCancelBar) routeCancelBar.style.display = 'none';

        setState('IDLE');
        showToast(`📅 Viaje a ${destName} reservado para ${res.formattedDateTime}`, 'success');
      }
    });
    container.appendChild(modal);
  }

  async function requestRide(destCoords, fareData) {
    const pickupLocation = selectedPickupLocation || passengerLocation;
    if (!pickupLocation) {
      showToast('Necesitamos obtener tu ubicación real antes de solicitar la carrera.', 'error');
      return;
    }
    setState('SEARCHING');
    bottomSheet.setContent(renderSearchingState(() => cancelSearch(), fareData?.rideType));
    showPassengerTripToggle(true);
    showToast('Solicitud enviada en tiempo real', 'info');
    
    const fareUSD = fareData?.totalUSD || fareData?.fareUSD || 4.50;
    // A driver is assigned only after the backend matching flow accepts the ride.
    // A SEARCHING ride must never look accepted until the server assigns a driver.
    currentDriver = null;
    
    // Construct trip object synchronously with valid unique ID
    currentTrip = {
      id: 'trip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      passengerId: user.id || 'p1',
      driverId: null,
      status: 'SEARCHING',
      pickup: {
        address: pickupLocation.source === 'manual' ? 'Punto de recogida marcado' : 'Mi ubicación actual',
        lat: pickupLocation.lat,
        lng: pickupLocation.lng,
        accuracy: pickupLocation.accuracy || null,
        source: pickupLocation.source || 'gps'
      },
      // El destino del viaje sale del MISMO objeto canonico que pinto el
      // marcador y pidio la ruta: cero deriva de coordenadas (MAPS-2A).
      destination: {
        address: currentSelectedDestination?.displayName || currentSelectedDestinationName || 'Vereda del Lago, Maracaibo',
        lat: currentSelectedDestination?.lat ?? destCoords[0],
        lng: currentSelectedDestination?.lng ?? destCoords[1]
      },
      fareEUR: fareUSD,
      distanceKm: fareData?.distanceKm,
      durationMin: fareData?.durationMin,
      paymentMethod: fareData?.paymentMethod || selectedPaymentMethod,
      exchangeRateType: fareData?.exchangeRateType || 'BCV',
      rideType: fareData?.rideType === 'CAR' ? 'CAR' : 'MOTO',
      passengerName: `${user.firstName || 'Jordan'} ${user.lastName || 'Pérez'}`.trim(),
      passengerAvatar: neutralizePrivatePhoto(user.photoUrl) || null,
      createdAt: new Date().toISOString()
    };

    eventLogger.log('PASSENGER', `Solicitud de carrera enviada al DriverDispatchService [${currentTrip.id}] hacia ${currentTrip.destination.address}`);

    // SQLite on the backend is the source of truth. The UI only begins a real
    // search after the server accepts (or safely queues) the authenticated request.
    const result = await apiService.createTrip(currentTrip);
    if (!result?.trip) {
      const insufficientWallet = apiService.lastError?.error === 'INSUFFICIENT_WALLET_BALANCE';
      const required = Number(apiService.lastError?.required || currentTrip?.fareUSD || 0);
      const balance = Number(apiService.lastError?.balance || 0);
      currentTrip = null;
      setState('IDLE');
      showPassengerTripToggle(false);
      bottomSheet.setContent('');
      bottomSheet.collapse();
      showToast(
        insufficientWallet
          ? `Saldo insuficiente en Wallet: tienes $${balance.toFixed(2)} y la carrera cuesta $${required.toFixed(2)}.`
          : 'No se pudo registrar la carrera. Comprueba tu conexión e inténtalo nuevamente.',
        'error'
      );
      return;
    }
    currentTrip = result.trip;
    if (result.queued) {
      showToast('Solicitud guardada de forma segura. Se enviará al recuperar conexión.', 'warning');
      window.addEventListener('online', () => setTimeout(startTripStatusPolling, 800), { once: true });
    } else {
      startTripStatusPolling();
    }
    notifyTripEvent('REQUESTED', 'Buscando conductor', `Solicitud enviada hacia ${currentTrip.destination.address}. Te avisaremos cuando un conductor acepte.`);
    startPassengerTracking();
  }

  function cancelRouteAndSelectNew() {
    // Se revoca antes de tocar la interfaz: si el repintado fallara, la
    // fotografia del conductor anterior no puede quedar viva.
    photoScope?.close();
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (currentTrip && currentTrip.id) {
      eventLogger.log('PASSENGER', `Pasajero canceló el viaje [${currentTrip.id}]`);
      driverDispatchService.cancelTrip(currentTrip.id);
    }

    currentTrip = null;
    currentDriver = null;
    selectedPickupLocation = null;
    pendingDestinationAfterPermission = null;
    hideManualPickupBanner();
    destinationSelectionId += 1;
    persistentChatBtn.classList.add('hidden');
    hidePassengerTripToggle();
    stopPassengerTracking();

    // Hide top route cancel bar
    const routeCancelBar = container.querySelector('#route-cancel-bar');
    if (routeCancelBar) {
      routeCancelBar.style.display = 'none';
    }

    setState('IDLE');
    bottomSheet.setContent('');
    bottomSheet.collapse();
    mapComponent.clearRoute();
    mapComponent.clearMarkers('destination');
    showToast('Solicitud cancelada. Puedes elegir un nuevo destino.', 'info');
    setTimeout(() => {
      openSearchSheet();
    }, 250);
  }

  function cancelSearch() {
    cancelRouteAndSelectNew();
  }

  function resetCompletedPassengerRide() {
    persistentChatBtn.classList.add('hidden');
    hidePassengerTripToggle();
    chatUnreadBadge.classList.add('hidden');
    activeChat?.destroy();
    activeChat = null;
    activeChatTripId = null;
    unreadMessages = 0;
    stopPassengerTracking();
    mapComponent.clearRoute();
    mapComponent.clearMarkers('pickup');
    mapComponent.clearMarkers('destination');
    const routeCancelBar = container.querySelector('#route-cancel-bar');
    if (routeCancelBar) routeCancelBar.style.display = 'none';
    bottomSheet.setContent('');
    bottomSheet.collapse();
    currentTrip = null;
    currentDriver = null;
    selectedPickupLocation = null;
    pendingDestinationAfterPermission = null;
    hideManualPickupBanner();
    destinationSelectionId += 1;
    currentSelectedDestinationName = '';
    stopTripStatusPolling();
    setState('IDLE');
  }

  function showPassengerRating() {
    if (!currentTrip || activeRatingModal?.isConnected) return;
    const completedTrip = currentTrip;
    const completedDriver = currentDriver || completedTrip.driver || {};
    activeRatingModal = createRatingTipModal({
      trip: completedTrip,
      driver: completedDriver,
      onSubmit: (ratingRes) => {
        completedTrip.tipEUR = ratingRes.tipEUR;
        socket.emit('tripRated', {
          tripId: completedTrip.id,
          rating: ratingRes.rating,
          tags: ratingRes.tags,
          tipEUR: ratingRes.tipEUR,
          targetRole: 'driver'
        });
        activeRatingModal = null;
        resetCompletedPassengerRide();
        const receiptModal = createDigitalReceiptModal({
          trip: completedTrip,
          driver: completedDriver,
          passenger: user,
          onClose: () => setState('IDLE')
        });
        document.body.appendChild(receiptModal);
      }
    });
    document.body.appendChild(activeRatingModal);
  }

  function stopTripStatusPolling() {
    if (tripStatusPollId) window.clearInterval(tripStatusPollId);
    tripStatusPollId = null;
  }

  function startTripStatusPolling() {
    if (tripStatusPollId) return;
    tripStatusPollId = window.setInterval(async () => {
      if (!currentTrip?.id || currentState === 'COMPLETED') return;
      const result = await apiService.get(`/trips/${encodeURIComponent(currentTrip.id)}`);
      if (result?.trip?.status && result.trip.status !== currentTrip.status) {
        handlePassengerTripStatus({
          tripId: result.trip.id,
          status: result.trip.status,
          driver: result.driver,
          trip: result.trip
        });
      }
    }, 3500);
  }

  function setState(state) {
    currentState = state;
    // Punto unico del ciclo de vida de la fotografia del conductor. Repetir el
    // mismo estado no revoca ni vuelve a descargar nada.
    photoScope?.sync(state, currentTrip, currentDriver);
    const topSearchBar = container.querySelector('#top-search-bar');
    // The destination bar is a permanent navigation control. Hiding it during
    // asynchronous trip restoration caused it to flash and disappear.
    if (topSearchBar) topSearchBar.style.display = 'flex';
    if (state === 'IDLE' || state === 'SELECTING_DESTINATION') {
      renderActiveDrivers();
    }

    if (state === 'DRIVER_ASSIGNED' || state === 'DRIVER_EN_ROUTE' || state === 'DRIVER_ARRIVED') {
      bottomSheet.setContent(renderDriverCard(currentDriver, currentTrip, 
        () => { window.open(`tel:${currentDriver?.phone || '04140000000'}`, '_self'); },
        () => openChatModal(),
        () => cancelRouteAndSelectNew(),
        () => setPassengerTripPanelCollapsed(true)
      ));
      bottomSheet.expand();
      // La fotografia del conductor asignado se pide solo aqui, con el viaje
      // abierto. Si ya hay una carga en curso para la misma ruta, se comparte.
      hydratePrivatePhotos(container, privatePhotos);
    } else if (state === 'IN_TRIP') {
      bottomSheet.setContent(renderActiveRide(currentTrip, currentDriver, 
        () => openSosModal(),
        () => openChatModal(),
        () => setPassengerTripPanelCollapsed(true)
      ));
      bottomSheet.expand();
      // La fotografia del conductor se pide solo aqui, con el viaje abierto y
      // una peticion autenticada. Su object URL muere al cerrar la pantalla o
      // al cambiar de ruta.
      hydratePrivatePhotos(container, privatePhotos);
    } else if (state === 'COMPLETED') {
      bottomSheet.collapse();
      mapComponent.clearRoute();

      // Play success audio & notify passenger
      audioEffects.playSuccess();
      notificationService.addNotification(user.id || 'p1', {
        title: '🏁 🚀 ¡Has llegado a tu destino!',
        message: `Tu servicio con ${currentDriver?.firstName || 'Carlos'} ha finalizado. Por favor califica la experiencia y el servicio.`,
        category: 'TRIP',
        icon: '⭐'
      });

      stopTripStatusPolling();
      showPassengerRating();
    }
  }

  function openChatModal() {
    if (!currentTrip || !currentDriver) return;
    if (!activeChat || activeChatTripId !== currentTrip.id) {
      activeChat?.destroy();
      activeChat = createChatModal({ tripId: currentTrip.id, currentUser: user, recipientUser: currentDriver });
      activeChatTripId = currentTrip.id;
      document.body.appendChild(activeChat.element);
    }
    unreadMessages = 0;
    chatUnreadBadge.textContent = '0';
    chatUnreadBadge.classList.add('hidden');
    activeChat.open();
  }

  // Última muestra del pasajero ACEPTADA por el filtro de calidad (GPS-1):
  // la vara contra la que se evalúa cada lectura del watch del viaje activo.
  let passengerAcceptedSample = null;

  function startPassengerTracking() {
    if (passengerWatchId !== null || !navigator.geolocation) return;
    passengerWatchId = navigator.geolocation.watchPosition(position => {
      // GPS-1: una lectura de caché vieja, un salto imposible o una lectura
      // de torre pisando a un GPS bueno reciente no mueven el marcador ni se
      // emiten al conductor. Sin fabricar nada: si se rechaza, no pasa nada.
      const sample = normalizeLocationSample(position);
      const veredicto = evaluateLocationSample(sample, { previous: passengerAcceptedSample });
      if (!veredicto.accept) return;
      passengerAcceptedSample = sample;

      setPassengerLocation({
        lat: sample.lat,
        lng: sample.lng,
        accuracy: sample.accuracy,
        capturedAt: sample.timestamp
      });
      socket.emit('passenger:location_update', {
        tripId: currentTrip?.id,
        latitude: sample.lat,
        longitude: sample.lng,
        heading: position.coords.heading || 0
      });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
  }

  function stopPassengerTracking() {
    if (passengerWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(passengerWatchId);
    passengerWatchId = null;
  }

  async function openSosModal() {
    let sosLocation = passengerLocation || currentTrip?.pickup || null;
    try {
      sosLocation = await getPassengerOrigin();
    } catch (error) {
      // The last verified trip pickup is safer than inventing coordinates.
    }
    const sos = createSosModal({
      trip: currentTrip,
      currentUser: user,
      location: sosLocation
    });
    container.appendChild(sos.element);
    sos.open();
  }

  // Socket Listeners for Real-Time State Sync Across Devices
  function handlePassengerTripStatus(data) {
    if (!data) return;
    
    // Match active trip or set as active trip if receiving assignment
    if (!currentTrip || currentTrip.id === data.tripId || data.status === 'EN_ROUTE') {
      if (!currentTrip) {
        currentTrip = data.trip || { id: data.tripId, status: data.status };
      } else {
        currentTrip = { ...currentTrip, ...(data.trip || {}), status: data.status };
      }
      db.update('trips', data.tripId, {
        status: data.status,
        driverId: data.driver?.id,
        driver: data.driver
      });
      
      if (data.driver) {
        currentDriver = data.driver;
      }
      
      eventLogger.log('PASSENGER', `Notificación recibida: Conductor cambió estado a ➔ ${data.status}`, data);

      if (data.status === 'EN_ROUTE' || data.status === 'DRIVER_ASSIGNED') {
        persistentChatBtn.classList.remove('hidden');
        showPassengerTripToggle();
        startPassengerTracking();
        showToast('⚡ ¡Conductor asignado y en camino!', 'success');
        notifyTripEvent('ASSIGNED', 'Conductor asignado', `${currentDriver?.firstName || 'Tu conductor'} aceptó la carrera y va hacia tu ubicación.`);
        setState('DRIVER_EN_ROUTE');
        startTripStatusPolling();
      } else if (data.status === 'ARRIVED' || data.status === 'DRIVER_ARRIVED') {
        showToast('📍 Tu moto ha llegado al punto de recogida', 'info');
        notifyTripEvent('ARRIVED', 'Tu conductor llegó', `${currentDriver?.firstName || 'El conductor'} está esperando en el punto de recogida.`);
        setState('DRIVER_ARRIVED');
      } else if (data.status === 'IN_PROGRESS' || data.status === 'IN_TRIP') {
        showToast('🚀 En viaje hacia tu destino', 'info');
        notifyTripEvent('STARTED', 'Viaje iniciado', `La carrera hacia ${currentTrip?.destination?.address || 'tu destino'} comenzó.`);
        setState('IN_TRIP');
        startTripStatusPolling();
      } else if (data.status === 'COMPLETED') {
        persistentChatBtn.classList.add('hidden');
        hidePassengerTripToggle();
        stopPassengerTracking();
        notifyTripEvent('COMPLETED', 'Llegaste a tu destino', 'La carrera finalizó correctamente. Ya puedes valorar al conductor.');
        setState('COMPLETED');
      } else if (data.status === 'CANCELLED') {
        persistentChatBtn.classList.add('hidden');
        hidePassengerTripToggle();
        stopPassengerTracking();
        notifyTripEvent('CANCELLED', 'Carrera cancelada', data.reason === 'NO_DRIVERS_AVAILABLE' ? 'No encontramos conductores disponibles.' : 'La carrera fue cancelada.');
        currentTrip = null;
        currentDriver = null;
        setState('IDLE');
        bottomSheet.collapse();
        showToast(data.reason === 'NO_DRIVERS_AVAILABLE' ? 'No hay conductores disponibles en este momento' : 'La carrera fue cancelada', 'warning');
        stopTripStatusPolling();
      }
    }
  }

  socket.on('tripStatusUpdated', handlePassengerTripStatus);

  // Track Driver's Real-Time GPS Location Stream
  socket.on('driverLocationUpdated', (locData) => {
    const lat = Number(locData.lat ?? locData.latitude);
    const lng = Number(locData.lng ?? locData.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const driverId = locData.driverId || locData.userId;

    if (!currentTrip || !currentDriver) {
      if (driverId && ['IDLE', 'SELECTING_DESTINATION'].includes(currentState)) {
        mapComponent.addDriverMarker(driverId, lat, lng, locData.heading || 0, locData);
      }
      return;
    }
    if (driverId !== currentDriver.id) return;
    if (locData.tripId && locData.tripId !== currentTrip.id) return;

    mapComponent.addDriverMarker(currentDriver.id, lat, lng, locData.heading || 0, {
      ...currentDriver,
      vehicleType: currentTrip.rideType || currentDriver.vehicleType
    });
    const passengerOnBoard = ['IN_PROGRESS', 'IN_TRIP'].includes(currentTrip.status);
    const liveTarget = passengerOnBoard ? currentTrip.destination : currentTrip.pickup;
    if (passengerOnBoard) {
      mapComponent.clearMarkers('pickup');
      if (currentTrip.destination?.lat && currentTrip.destination?.lng) {
        mapComponent.setDestinationMarker(currentTrip.destination.lat, currentTrip.destination.lng);
      }
    } else if (currentTrip?.pickup?.lat && currentTrip?.pickup?.lng) {
      mapComponent.setPickupMarker(currentTrip.pickup.lat, currentTrip.pickup.lng);
    }
    if (liveTarget?.lat && liveTarget?.lng) {
      const now = Date.now();
      if (now - lastRouteRefreshAt > 10000) {
        lastRouteRefreshAt = now;
        mapComponent.drawRoute(
          { lat, lng },
          liveTarget,
          passengerOnBoard ? '#00E676' : '#FFC107'
        );
      }
    }
  });

  socket.on('chat:message', message => {
    if (message?.tripId !== currentTrip?.id || message.senderId === user.id) return;
    if (!activeChat?.isOpen()) {
      unreadMessages += 1;
      chatUnreadBadge.textContent = unreadMessages > 9 ? '9+' : String(unreadMessages);
      chatUnreadBadge.classList.remove('hidden');
      notificationService.notify(user.id || 'p1', {
        title: `Mensaje de ${message.senderName || currentDriver?.firstName || 'tu conductor'}`,
        message: message.text || 'Te enviaron un archivo adjunto.',
        category: 'TRIP',
        icon: '💬'
      });
    }
  });

  async function restoreActiveTrip() {
    const active = await apiService.get('/trips/active/me');
    if (!active?.trip || active.trip.passengerId !== user.id) {
      const pendingReview = await apiService.get('/trips/pending-review/me');
      if (pendingReview?.trip?.passengerId === user.id) {
        currentTrip = pendingReview.trip;
        currentDriver = pendingReview.driver || pendingReview.trip.driver;
        setState('COMPLETED');
      } else {
        currentTrip = null;
        currentDriver = null;
        setState('IDLE');
      }
      return;
    }
    currentTrip = active.trip;
    selectedRideType = currentTrip.rideType === 'CAR' ? 'CAR' : 'MOTO';
    currentDriver = active.driver || active.trip.driver;
    if (currentTrip.status === 'SEARCHING') {
      const searchAge = Date.now() - new Date(currentTrip.createdAt || 0).getTime();
      if (!Number.isFinite(searchAge) || searchAge > 3 * 60 * 1000) {
        driverDispatchService.cancelTrip(currentTrip.id);
        currentTrip = null;
        currentDriver = null;
        setState('IDLE');
        return;
      }
      currentDriver = null;
      showPassengerTripToggle(true);
      setState('SEARCHING');
      bottomSheet.setContent(renderSearchingState(() => cancelSearch(), selectedRideType));
    } else if (currentDriver) {
      persistentChatBtn.classList.remove('hidden');
      showPassengerTripToggle(true);
      startPassengerTracking();
      startTripStatusPolling();
      if (['IN_PROGRESS', 'IN_TRIP'].includes(currentTrip.status)) setState('IN_TRIP');
      else if (currentTrip.status === 'ARRIVED') setState('DRIVER_ARRIVED');
      else setState('DRIVER_EN_ROUTE');
      bottomSheet.expand();
    } else {
      currentTrip = null;
      setState('IDLE');
    }
    if (currentTrip.pickup?.lat && currentTrip.pickup?.lng) {
      setPassengerLocation({ lat: currentTrip.pickup.lat, lng: currentTrip.pickup.lng, capturedAt: Date.now() });
      selectedPickupLocation = { ...passengerLocation };
    }
  }

  async function renderActiveDrivers() {
    mapComponent.clearMarkers();
    const nearby = await apiService.get('/drivers/nearby');
    const activeDrivers = Array.isArray(nearby) ? nearby : driverDispatchService.getAvailableDrivers();
    activeDrivers.forEach(driver => {
      const lat = Number(driver.location?.lat ?? driver.lat);
      const lng = Number(driver.location?.lng ?? driver.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      driverDispatchService.registerDriver({
        ...driver,
        id: driver.id || driver.driverId,
        location: { lat, lng, heading: Number(driver.heading || driver.location?.heading || 0) }
      });
      mapComponent.addDriverMarker(
        driver.id || driver.driverId,
        lat,
        lng,
        Number(driver.heading || driver.location?.heading || 0),
        driver
      );
    });
  }

  renderActiveDrivers();
  restoreActiveTrip();
}
