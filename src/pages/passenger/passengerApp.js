import { MapComponent } from '../../components/mapComponent.js';
import { BottomSheet } from '../../components/bottomSheet.js';
import { showToast } from '../../components/toast.js';
import { icon } from '../../utils/icons.js';
import * as helpers from '../../utils/helpers.js';
import { apiService, db } from '../../services/apiService.js';
import { authService } from '../../services/mockAuth.js';
import { tripEngine } from '../../services/mockTrip.js';
import { socket } from '../../services/socketClient.js';
import { fareCalculator } from '../../services/fareCalculator.js';
import { renderFarePreview, renderSearchingState, renderDriverCard } from './requestRide.js';
import { renderActiveRide, renderTripComplete } from './activeRide.js';
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

export function renderPassengerApp(container) {
  let currentState = 'IDLE';
  let mapComponent = null;
  let bottomSheet = null;
  let currentTrip = null;
  let currentDriver = null;
  let searchTimeout = null;
  let lastRouteRefreshAt = 0;
  let passengerWatchId = null;
  let passengerLocation = { lat: 10.6427, lng: -71.6125 };
  let activeChat = null;
  let activeChatTripId = null;
  let unreadMessages = 0;
  let selectedRideType = 'MOTO';

  const user = authService.getCurrentUser() || { id: 'p1', name: 'Pasajero' };

  container.innerHTML = `
    <div class="passenger-app">
      <div id="map-container" class="map-background"></div>
      
      <!-- Top Search Bar -->
      <div class="top-search-bar" id="top-search-bar">
        <button class="menu-btn">${icon('menu')}</button>
        <div class="search-input-wrapper">
          <div class="search-icon">${icon('search')}</div>
          <input type="text" id="destination-input" placeholder="¿A dónde vas en Maracaibo?" readonly>
        </div>
        <div class="user-avatar-actions" style="display:flex; align-items:center; gap:8px;">
          <button id="header-notif-btn-passenger" style="
            background: rgba(255,193,7,0.15); border: 1.5px solid var(--accent-primary); color: var(--accent-primary);
            width: 36px; height: 36px; border-radius: 50%; display:flex; align-items:center; justify-content:center;
            cursor: pointer; position: relative; flex-shrink: 0;
          " title="Centro de Notificaciones">
            ${icon('bell', 18)}
            <span id="notif-badge-passenger" style="
              position: absolute; top: -3px; right: -3px; background: var(--danger); color: white;
              font-size: 0.65rem; font-weight: 900; width: 16px; height: 16px; border-radius: 50%;
              display: flex; align-items: center; justify-content: center; border: 1.5px solid #121824;
            ">3</span>
          </button>
          <div id="header-theme-toggle-slot"></div>
        </div>
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
          <span style="color:var(--accent-primary); display:flex;">${icon('mapPin', 20)}</span>
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
      <button id="passenger-active-chat-btn" class="passenger-active-chat-btn hidden" aria-label="Abrir chat de la carrera">
        <span>💬</span><span>Chat</span>
        <span id="passenger-chat-unread" class="passenger-chat-unread hidden">0</span>
      </button>
    </div>
  `;

  // Inject Theme Toggle Button
  const themeSlot = container.querySelector('#header-theme-toggle-slot');
  if (themeSlot) {
    themeSlot.appendChild(initThemeToggle());
  }

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
  const persistentChatBtn = container.querySelector('#passenger-active-chat-btn');
  const chatUnreadBadge = container.querySelector('#passenger-chat-unread');
  persistentChatBtn.addEventListener('click', () => openChatModal());
  mapComponent.getUserLocation().then(location => {
    passengerLocation = location;
    mapComponent.setUserLocation(location.lat, location.lng);
  });

  // Floating Cancel Route Listener
  const floatingCancelBtn = container.querySelector('#floating-cancel-route-btn');
  if (floatingCancelBtn) {
    floatingCancelBtn.addEventListener('click', cancelRouteAndSelectNew);
  }

  // Direct Map Click Listener to pick destination on map
  mapComponent.onMapClick((latlng) => {
    if (currentState === 'IDLE' || currentState === 'SELECTING_DESTINATION' || currentState === 'FARE_PREVIEW') {
      selectDestination({
        display_name: 'Punto de Destino en Maracaibo',
        lat: latlng.lat,
        lon: latlng.lng
      });
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

  const menuBtn = container.querySelector('.menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', openProfileMenu);

  function handleNavigation(tab) {
    const overlay = container.querySelector('#overlay-container');
    if (tab === 'home') {
      overlay.innerHTML = '';
      overlay.classList.remove('active');
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
    }
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
      <div class="search-sheet" style="padding: 12px 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="font-size:1.15rem; font-weight:700; color:var(--text-primary); margin:0;">¿A dónde quieres ir en Maracaibo?</h3>
          <button id="close-search-sheet-btn" style="color:var(--text-secondary); font-size:1.2rem; cursor:pointer; padding:4px;">✕</button>
        </div>

        <div style="position:relative; margin-bottom:20px;">
          <div style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--accent-primary);">
            ${icon('search', 20)}
          </div>
          <input type="text" id="live-search-input" placeholder="Buscar en Maracaibo (ej: Basílica, Sambil, Vereda)..." autocomplete="off" 
                 style="width: 100%; padding: 14px 14px 14px 44px; border-radius: 28px; border: 1.5px solid var(--border-gold); background: var(--surface-input); color: white; font-size:0.95rem; outline:none; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
        </div>

        <ul class="search-results" id="search-results"></ul>

        <div class="recent-places" style="display:flex; flex-direction:column; gap:12px;">
          <div class="place-item preset-place" data-name="Basílica de Nuestra Señora de Chiquinquirá, Maracaibo" data-lat="10.6427" data-lon="-71.6125" 
               style="display:flex; align-items:center; gap:14px; padding:12px 16px; background:var(--surface-elevated); border-radius:16px; border:1px solid var(--border-color); cursor:pointer; transition:all 0.2s ease;">
            <div style="width:40px; height:40px; border-radius:50%; background:rgba(255,193,7,0.15); display:flex; align-items:center; justify-content:center; color:var(--accent-primary); flex-shrink:0;">
              ${icon('home', 20)}
            </div>
            <div class="place-info" style="flex:1;">
              <strong style="display:block; color:var(--text-primary); font-size:0.98rem; font-weight:600;">Basílica de La Chiquinquirá</strong>
              <span style="color:var(--text-secondary); font-size:0.82rem;">Casco Central, Maracaibo</span>
            </div>
            <span style="color:var(--accent-primary); font-size:1.1rem;">➔</span>
          </div>

          <div class="place-item preset-place" data-name="Centro Comercial Sambil Maracaibo" data-lat="10.6975" data-lon="-71.6342" 
               style="display:flex; align-items:center; gap:14px; padding:12px 16px; background:var(--surface-elevated); border-radius:16px; border:1px solid var(--border-color); cursor:pointer; transition:all 0.2s ease;">
            <div style="width:40px; height:40px; border-radius:50%; background:rgba(0,210,255,0.15); display:flex; align-items:center; justify-content:center; color:var(--accent-secondary); flex-shrink:0;">
              ${icon('briefcase', 20)}
            </div>
            <div class="place-info" style="flex:1;">
              <strong style="display:block; color:var(--text-primary); font-size:0.98rem; font-weight:600;">Sambil Maracaibo</strong>
              <span style="color:var(--text-secondary); font-size:0.82rem;">Av. Goajira, Maracaibo</span>
            </div>
            <span style="color:var(--accent-secondary); font-size:1.1rem;">➔</span>
          </div>

          <div class="place-item preset-place" data-name="Vereda del Lago Maracaibo" data-lat="10.6658" data-lon="-71.5975" 
               style="display:flex; align-items:center; gap:14px; padding:12px 16px; background:var(--surface-elevated); border-radius:16px; border:1px solid var(--border-color); cursor:pointer; transition:all 0.2s ease;">
            <div style="width:40px; height:40px; border-radius:50%; background:rgba(0,230,118,0.15); display:flex; align-items:center; justify-content:center; color:var(--success); flex-shrink:0;">
              ${icon('mapPin', 20)}
            </div>
            <div class="place-info" style="flex:1;">
              <strong style="display:block; color:var(--text-primary); font-size:0.98rem; font-weight:600;">Vereda del Lago</strong>
              <span style="color:var(--text-secondary); font-size:0.82rem;">Av. El Milagro, Maracaibo</span>
            </div>
            <span style="color:var(--success); font-size:1.1rem;">➔</span>
          </div>

          <div class="place-item preset-place" data-name="Calle 72 / 5 de Julio, Maracaibo" data-lat="10.6689" data-lon="-71.6167" 
               style="display:flex; align-items:center; gap:14px; padding:12px 16px; background:var(--surface-elevated); border-radius:16px; border:1px solid var(--border-color); cursor:pointer; transition:all 0.2s ease;">
            <div style="width:40px; height:40px; border-radius:50%; background:rgba(255,152,0,0.15); display:flex; align-items:center; justify-content:center; color:var(--warning); flex-shrink:0;">
              ${icon('mapPin', 20)}
            </div>
            <div class="place-info" style="flex:1;">
              <strong style="display:block; color:var(--text-primary); font-size:0.98rem; font-weight:600;">5 de Julio / Calle 72</strong>
              <span style="color:var(--text-secondary); font-size:0.82rem;">Sector Tierra Negra, Maracaibo</span>
            </div>
            <span style="color:var(--warning); font-size:1.1rem;">➔</span>
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
        selectDestination({
          display_name: preset.dataset.name,
          lat: preset.dataset.lat,
          lon: preset.dataset.lon
        });
      }
    };

    const liveInput = document.getElementById('live-search-input');
    if (liveInput) {
      liveInput.focus();
      liveInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value;
        if (query.length > 2) {
          searchTimeout = setTimeout(() => fetchNominatim(query), 500);
        }
      });
    }
  }

  async function fetchNominatim(query) {
    const resultsContainer = document.getElementById('search-results');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Maracaibo, Zulia, Venezuela')}&limit=5`);
      const data = await res.json();
      resultsContainer.innerHTML = '';
      data.forEach(item => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:12px; border-bottom:1px solid var(--border-color); cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:10px;';
        li.innerHTML = `${icon('mapPin')} <span>${item.display_name}</span>`;
        li.addEventListener('click', () => selectDestination(item));
        resultsContainer.appendChild(li);
      });
    } catch (err) {
      console.error('Nominatim error', err);
    }
  }

  let selectedPaymentMethod = 'pago_movil';

  let currentSelectedDestinationName = 'Vereda del Lago, Maracaibo';

  function selectDestination(place) {
    currentSelectedDestinationName = place.display_name || 'Punto de Destino en Maracaibo';
    const lat = parseFloat(place.lat) || 10.6658;
    const lon = parseFloat(place.lon) || -71.5975;
    const pickup = [10.6427, -71.6125]; // Maracaibo Basílica default
    
    // Show top floating route cancel bar
    const routeCancelBar = container.querySelector('#route-cancel-bar');
    const routeDestName = container.querySelector('#route-cancel-dest-name');
    if (routeCancelBar && routeDestName) {
      routeDestName.textContent = currentSelectedDestinationName;
      routeCancelBar.style.display = 'flex';
    }

    mapComponent.addMarker([lat, lon], 'destination');

    // Calculate real dynamic distance immediately based on exact destination coordinates
    const calcDistKm = helpers.getHaversineDistanceKm(pickup[0], pickup[1], lat, lon);
    const calcDurMin = Math.max(4, Math.round(calcDistKm * 2.2));
    const initialFare = fareCalculator.calculateFare(calcDistKm, calcDurMin, selectedRideType);

    showFarePreview(currentSelectedDestinationName, { distanceKm: calcDistKm, durationMin: calcDurMin }, initialFare, [lat, lon]);

    // Draw route asynchronously on map & update precise OSRM fare
    mapComponent.drawRoute(pickup, [lat, lon]).then(routeInfo => {
      const realDistKm = routeInfo?.distanceKm || (routeInfo?.distance ? (routeInfo.distance / 1000) : calcDistKm);
      const realDurMin = routeInfo?.durationMin || (routeInfo?.duration ? (routeInfo.duration / 60) : calcDurMin);
      const realFare = fareCalculator.calculateFare(realDistKm, realDurMin, selectedRideType);
      showFarePreview(currentSelectedDestinationName, { distanceKm: realDistKm, durationMin: realDurMin }, realFare, [lat, lon]);
    }).catch(err => console.warn('Map route draw info:', err));
  }

  function openPaymentModal(destName, routeInfo, fareData, destCoords) {
    const modal = createPaymentModal({
      currentMethod: selectedPaymentMethod,
      walletBalance: user.walletBalance || 25.0,
      onSelect: (method) => {
        selectedPaymentMethod = method;
        showToast(`Método de pago: ${method.toUpperCase().replace('_', ' ')} seleccionado`, 'success');
      },
      onTopUp: () => {
        handleNavigation('wallet');
      }
    });
    container.appendChild(modal.element);
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
        rideType: selectedRideType
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

  function requestRide(destCoords, fareData) {
    setState('SEARCHING');
    bottomSheet.setContent(renderSearchingState(() => cancelSearch(), fareData?.rideType));
    showToast('📡 Transmitiendo solicitud de mototaxi en tiempo real...', 'info');
    
    const fareUSD = fareData?.totalUSD || fareData?.fareUSD || 4.50;
    // A driver is assigned only after the backend matching flow accepts the ride.
    // Preselecting a mock driver made SEARCHING rides look accepted after refresh.
    currentDriver = null;
    
    // Construct trip object synchronously with valid unique ID
    currentTrip = {
      id: 'trip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      passengerId: user.id || 'p1',
      driverId: null,
      status: 'SEARCHING',
      pickup: { address: 'Mi ubicación actual', lat: passengerLocation.lat, lng: passengerLocation.lng },
      destination: { address: currentSelectedDestinationName || 'Vereda del Lago, Maracaibo', lat: destCoords[0], lng: destCoords[1] },
      fareEUR: fareUSD,
      distanceKm: fareData?.distanceKm,
      durationMin: fareData?.durationMin,
      paymentMethod: fareData?.paymentMethod || selectedPaymentMethod,
      exchangeRateType: fareData?.exchangeRateType || 'BCV',
      rideType: fareData?.rideType === 'CAR' ? 'CAR' : 'MOTO',
      passengerName: `${user.firstName || 'Jordan'} ${user.lastName || 'Pérez'}`.trim(),
      passengerAvatar: user.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.firstName || 'Jordan')}`,
      createdAt: new Date().toISOString()
    };

    db.insert('trips', currentTrip);

    eventLogger.log('PASSENGER', `Solicitud de carrera enviada al DriverDispatchService [${currentTrip.id}] hacia ${currentTrip.destination.address}`);

    // Persist and dispatch through the backend. If REST is temporarily unavailable,
    // fall back to the authenticated real-time channel.
    apiService.post('/trips/create', currentTrip).then((result) => {
      if (!result?.trip) driverDispatchService.dispatchTrip(currentTrip);
    });
    startPassengerTracking();
  }

  function cancelRouteAndSelectNew() {
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (currentTrip && currentTrip.id) {
      eventLogger.log('PASSENGER', `Pasajero canceló el viaje [${currentTrip.id}]`);
      driverDispatchService.cancelTrip(currentTrip.id);
    }

    currentTrip = null;
    currentDriver = null;
    persistentChatBtn.classList.add('hidden');
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

  function setState(state) {
    currentState = state;
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
        () => cancelRouteAndSelectNew()
      ));
    } else if (state === 'IN_TRIP') {
      bottomSheet.setContent(renderActiveRide(currentTrip, currentDriver, 
        () => openSosModal()
      ));
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

      // Open Rating & Tip Modal
      const ratingModal = createRatingTipModal({
        trip: currentTrip,
        driver: currentDriver,
        onSubmit: (ratingRes) => {
          if (currentTrip) currentTrip.tipEUR = ratingRes.tipEUR;
          
          // Open Digital Receipt Modal
          const receiptModal = createDigitalReceiptModal({
            trip: currentTrip,
            driver: currentDriver,
            passenger: user,
            onClose: () => {
              setState('IDLE');
            }
          });
          container.appendChild(receiptModal);
        }
      });
      container.appendChild(ratingModal);
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

  function startPassengerTracking() {
    if (passengerWatchId !== null || !navigator.geolocation) return;
    passengerWatchId = navigator.geolocation.watchPosition(position => {
      passengerLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
      mapComponent.setUserLocation(passengerLocation.lat, passengerLocation.lng);
      socket.emit('passenger:location_update', {
        tripId: currentTrip?.id,
        latitude: passengerLocation.lat,
        longitude: passengerLocation.lng,
        heading: position.coords.heading || 0
      });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
  }

  function stopPassengerTracking() {
    if (passengerWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(passengerWatchId);
    passengerWatchId = null;
  }

  function openSosModal() {
    const sos = createSosModal({
      trip: currentTrip,
      currentUser: user,
      location: { lat: 10.6427, lng: -71.6125 }
    });
    container.appendChild(sos.element);
    sos.open();
  }

  // Socket Listeners for Real-Time State Sync Across Devices
  socket.on('tripStatusUpdated', (data) => {
    if (!data) return;
    
    // Match active trip or set as active trip if receiving assignment
    if (!currentTrip || currentTrip.id === data.tripId || data.status === 'EN_ROUTE') {
      if (!currentTrip) {
        currentTrip = { id: data.tripId, status: data.status };
      } else {
        currentTrip.status = data.status;
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
        startPassengerTracking();
        showToast('⚡ ¡Conductor asignado y en camino!', 'success');
        setState('DRIVER_EN_ROUTE');
      } else if (data.status === 'ARRIVED' || data.status === 'DRIVER_ARRIVED') {
        showToast('📍 Tu moto ha llegado al punto de recogida', 'info');
        setState('DRIVER_ARRIVED');
      } else if (data.status === 'IN_PROGRESS' || data.status === 'IN_TRIP') {
        showToast('🚀 En viaje hacia tu destino', 'info');
        setState('IN_TRIP');
      } else if (data.status === 'COMPLETED') {
        persistentChatBtn.classList.add('hidden');
        stopPassengerTracking();
        setState('COMPLETED');
      } else if (data.status === 'CANCELLED') {
        persistentChatBtn.classList.add('hidden');
        stopPassengerTracking();
        currentTrip = null;
        currentDriver = null;
        setState('IDLE');
        bottomSheet.collapse();
        showToast(data.reason === 'NO_DRIVERS_AVAILABLE' ? 'No hay conductores disponibles en este momento' : 'La carrera fue cancelada', 'warning');
      }
    }
  });

  // Track Driver's Real-Time GPS Location Stream
  socket.on('driverLocationUpdated', (locData) => {
    if (!currentTrip || !currentDriver || locData?.tripId !== currentTrip.id) return;
    if (locData.driverId !== currentDriver.id) return;
    const lat = Number(locData.lat ?? locData.latitude);
    const lng = Number(locData.lng ?? locData.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    mapComponent.addDriverMarker(currentDriver.id, lat, lng, locData.heading || 0, currentDriver);
    if (currentTrip?.pickup?.lat && currentTrip?.pickup?.lng) {
      mapComponent.setPickupMarker(currentTrip.pickup.lat, currentTrip.pickup.lng);
      const now = Date.now();
      if (now - lastRouteRefreshAt > 10000) {
        lastRouteRefreshAt = now;
        mapComponent.drawRoute(
          { lat, lng },
          currentTrip.pickup,
          '#FFC107'
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
    }
  });

  async function restoreActiveTrip() {
    const active = await apiService.get('/trips/active/me');
    if (!active?.trip || active.trip.passengerId !== user.id) {
      currentTrip = null;
      currentDriver = null;
      setState('IDLE');
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
      setState('SEARCHING');
      bottomSheet.setContent(renderSearchingState(() => cancelSearch(), selectedRideType));
    } else if (currentDriver) {
      persistentChatBtn.classList.remove('hidden');
      startPassengerTracking();
      if (['IN_PROGRESS', 'IN_TRIP'].includes(currentTrip.status)) setState('IN_TRIP');
      else if (currentTrip.status === 'ARRIVED') setState('DRIVER_ARRIVED');
      else setState('DRIVER_EN_ROUTE');
      bottomSheet.expand();
    } else {
      currentTrip = null;
      setState('IDLE');
    }
    if (currentTrip.pickup?.lat && currentTrip.pickup?.lng) {
      passengerLocation = { lat: currentTrip.pickup.lat, lng: currentTrip.pickup.lng };
      mapComponent.setUserLocation(passengerLocation.lat, passengerLocation.lng);
    }
  }

  function renderActiveDrivers() {
    mapComponent.clearMarkers();
    const activeDrivers = db.query('users', { role: 'driver' });
    activeDrivers.forEach(driver => {
      if (driver.location && driver.location.lat && driver.location.lng) {
        mapComponent.addMarker([driver.location.lat, driver.location.lng], 'driver', { icon: 'motorcycle' });
      }
    });
  }

  renderActiveDrivers();
  restoreActiveTrip();
}
