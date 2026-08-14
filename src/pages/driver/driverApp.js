import { authService } from '../../services/authService.js';
import { db, apiService } from '../../services/apiService.js';
import { socket } from '../../services/socketClient.js';
import { MapComponent } from '../../components/mapComponent.js';
import { icon } from '../../utils/icons.js';
import { renderIncomingRide } from './incomingRide.js';
import { renderEnRouteToPickup, renderWaitingPassenger, renderInTrip, renderTripSummary } from './activeTrip.js';
import { renderEarnings } from './earnings.js';
import { renderDocuments } from './documents.js';
import { renderDriverTrips } from './driverTrips.js';
import { renderDriverProfile } from './driverProfile.js';
import { renderScheduledRides } from './scheduledRides.js';
import { createChatModal } from '../../components/chatModal.js';
import { createSosModal } from '../../components/sosModal.js';
import { createDriverRatingModal } from '../../components/driverRatingModal.js';
import { showToast } from '../../components/toast.js';
import { initThemeToggle } from '../../utils/themeToggle.js';
import { createNotificationCenterModal } from '../../components/notificationCenterModal.js';
import { eventLogger } from '../../utils/logger.js';
import { driverDispatchService } from '../../services/driverDispatchService.js';
import { driverGpsTracker } from '../../services/driverGpsTracker.js';
import { notificationService } from '../../services/notificationService.js';
import { createPrivatePhotoLoader } from '../../utils/privatePhoto.js';

import { localAvatarHtml } from '../../utils/localAvatar.js';
export function renderDriverApp(container) {
  // Dueno unico del object URL de la fotografia propia. Se revoca al
  // reemplazarla y en cualquier salida (clearApp cierra todos los cargadores).
  const privatePhotos = createPrivatePhotoLoader({ loadUrl: endpoint => apiService.getPrivateFileUrl(endpoint) });
    const user = authService.getCurrentUser();
    if (!user || user.role !== 'driver' || !user.isVerified) {
        authService.logout();
        window.navigateTo('#/');
        return;
    }

    const driverFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Carlos Mendoza';
    // Avatar neutro primero; la fotografia real llega despues de una peticion
    // autenticada, porque el navegador no envia la sesion al resolver un `src`.
    const driverAvatarLocal = localAvatarHtml({ name: driverFullName, role: 'driver', className: 'driver-avatar', label: driverFullName });

    container.innerHTML = `
        <div class="driver-app">
            <div id="driver-map" class="driver-map-bg"></div>
            
            <div class="driver-top-container">
                <div class="driver-header glass-header">
                    <div class="driver-avatar-info" id="driver-header-btn">
                        ${driverAvatarLocal}<img id="driver-avatar" alt="${driverFullName}" class="driver-avatar" hidden />
                        <div class="driver-details">
                            <span id="driver-name" class="driver-name">${driverFullName}</span>
                            <div class="driver-status-text" id="driver-status-text">Desconectado</div>
                        </div>
                    </div>

                    <div class="driver-brand-lockup" aria-label="+58 Express"><img src="/brand-logo-header.png" alt="+58 Express"></div>
                    
                    <div class="driver-header-actions">
                        <button id="header-notif-btn-driver" style="
                            background: rgba(255,193,7,0.15); border: 1.5px solid var(--accent-primary); color: var(--accent-primary);
                            width: 36px; height: 36px; border-radius: 50%; display:flex; align-items:center; justify-content:center;
                            cursor: pointer; position: relative; flex-shrink: 0;
                        " title="Centro de Notificaciones">
                            ${icon('bell', 18)}
                            <span style="
                                position: absolute; top: -3px; right: -3px; background: var(--danger); color: white;
                                font-size: 0.6rem; font-weight: 900; width: 14px; height: 14px; border-radius: 50%;
                                display: flex; align-items: center; justify-content: center; border: 1px solid #121824;
                            ">2</span>
                        </button>
                        <div id="driver-theme-toggle-slot"></div>
                        <div class="online-toggle-container">
                            <label class="online-toggle-switch">
                                <input type="checkbox" id="online-toggle" />
                                <span class="online-toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="stats-bar" id="stats-bar">
                    <div class="stat-item diorama-card-3d" id="stat-btn-trips" style="cursor:pointer;" title="Ver Perfil & Viajes">
                        <span class="stat-label" style="display:flex; align-items:center; gap:4px;">${icon('navigation', 14)} Viajes</span>
                        <span class="stat-value" id="stat-trips">${user.totalTrips || 0}</span>
                    </div>
                    <div class="stat-item diorama-card-3d" id="stat-btn-earnings" style="cursor:pointer;" title="Ver Ganancias & Retirar">
                        <span class="stat-label" style="display:flex; align-items:center; gap:4px;">${icon('dollarSign', 14)} Ganancias</span>
                        <span class="stat-value ${Number(user.walletBalance || 0) < 0 ? 'debt' : ''}" id="stat-earnings">${Number(user.walletBalance || 0) < 0 ? '−' : ''}$${Math.abs(Number(user.walletBalance || 0)).toFixed(2)}</span>
                    </div>
                    <div class="stat-item diorama-card-3d" id="stat-btn-rating" style="cursor:pointer;" title="Ver Perfil & Calificación">
                        <span class="stat-label" style="display:flex; align-items:center; gap:4px;">${icon('star', 14)} Calificación</span>
                        <span class="stat-value" id="stat-rating">${user.rating || 5.0}</span>
                    </div>
                </div>
            </div>

            <div id="driver-main-content" class="driver-main-content">
                <div class="offline-overlay glass-panel" id="offline-overlay" style="max-width: 440px; margin: 0 auto; padding: 24px; text-align: center;">
                    <h2 style="color:var(--text-primary); font-size:1.4rem; font-weight:800; margin-bottom:6px;">Estás Desconectado</h2>
                    <p style="color:var(--text-secondary); font-size:0.9rem;">Conéctate para empezar a recibir solicitudes de viajes cercanos en Maracaibo</p>
                    <button class="btn btn-3d primary-btn btn-connect" id="btn-connect-overlay" style="width:100%; margin-top:16px; padding:16px; font-size:1.05rem; font-weight:900; display:flex; align-items:center; justify-content:center; gap:8px;">
                        ${icon('power', 20)} CONECTARSE AHORA
                    </button>
                </div>

                <div class="online-overlay hidden" id="online-overlay" style="text-align: center; position: absolute; top: 160px; left: 50%; transform: translateX(-50%); z-index: 15; width: 90%; max-width: 420px;">
                    <div class="waiting-badge" style="
                        display: flex; align-items: center; justify-content: center; gap: 12px;
                        padding: 14px 20px; border-radius: 20px; background: rgba(15, 20, 32, 0.94);
                        backdrop-filter: blur(16px); border: 1.5px solid var(--success);
                        color: var(--success); font-weight: 800; font-size: 0.95rem;
                        box-shadow: 0 10px 25px rgba(0,0,0,0.5), 0 0 20px rgba(0,230,118,0.3);
                    ">
                        <div class="pulsing-dot" style="width:12px; height:12px; border-radius:50%; background:var(--success); box-shadow: 0 0 10px var(--success); flex-shrink:0;"></div>
                        <span>En línea <b aria-hidden="true">·</b> GPS activo</span>
                    </div>
                </div>
                <div id="active-trip-container" class="active-trip-container hidden"></div>
            </div>

            <button id="driver-trip-panel-toggle" class="driver-trip-panel-toggle hidden" type="button" aria-expanded="true">
                <span class="trip-toggle-icon">⌄</span>
                <span class="trip-toggle-label">Minimizar viaje</span>
            </button>

            <button id="driver-active-chat-btn" class="driver-active-chat-btn hidden" aria-label="Abrir chat de la carrera">
                <span class="driver-chat-icon">💬</span>
                <span class="driver-chat-label">Chat</span>
                <span id="driver-chat-unread" class="driver-chat-unread hidden">0</span>
            </button>

            <div class="driver-nav-tabs">
                <button class="nav-tab active" data-tab="inicio">${icon('home')} <span>Inicio</span></button>
                <button class="nav-tab" data-tab="ganancias">${icon('wallet')} <span>Ganancias</span></button>
                <button class="nav-tab" data-tab="viajes">${icon('history')} <span>Viajes</span></button>
                <button class="nav-tab" data-tab="perfil">${icon('user')} <span>Perfil</span></button>
            </div>
            
            <div id="page-overlay" class="page-overlay hidden"></div>
        </div>
    `;

    // Solo despues de pintar el estado neutro se pide la fotografia propia,
    // con la sesion en la cabecera. Si no hay, o el acceso no corresponde,
    // el avatar neutro se queda.
    privatePhotos.applyTo(container.querySelector('#driver-avatar'), user.photoUrl, { key: 'propia' });

    let isOnline = false;
    let currentTrip = null;
    let currentPassenger = null;
    let activeChat = null;
    let activeChatTripId = null;
    let unreadMessages = 0;
    let tripPanelCollapsed = false;
    let driverHomeAnimationTimer = null;
    const notifiedDriverEvents = new Set();
    let currentMap = new MapComponent('driver-map', { is3D: true, navigation: true });
    const ownDriverMarkerId = `self:${user.id || 'driver'}`;

    window.addEventListener('58express:driver-position', event => {
        const position = event.detail || {};
        const lat = Number(position.latitude ?? position.lat);
        const lng = Number(position.longitude ?? position.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        currentMap.addDriverMarker(ownDriverMarkerId, lat, lng, Number(position.heading || 0), {
            vehicleType: currentTrip?.rideType || user.vehicleType || user.vehicle?.type || 'MOTO'
        });
    });

    const toggle = container.querySelector('#online-toggle');
    const statusText = container.querySelector('#driver-status-text');
    const offlineOverlay = container.querySelector('#offline-overlay');
    const onlineOverlay = container.querySelector('#online-overlay');
    const btnConnectOverlay = container.querySelector('#btn-connect-overlay');
    const activeTripContainer = container.querySelector('#active-trip-container');
    const persistentChatBtn = container.querySelector('#driver-active-chat-btn');
    const tripPanelToggle = container.querySelector('#driver-trip-panel-toggle');
    const chatUnreadBadge = container.querySelector('#driver-chat-unread');
    const driverHeaderBtn = container.querySelector('#driver-header-btn');
    const driverThemeSlot = container.querySelector('#driver-theme-toggle-slot');
    if (driverThemeSlot) {
        driverThemeSlot.appendChild(initThemeToggle());
    }

    const driverNotifBtn = container.querySelector('#header-notif-btn-driver');
    const driverNotifBadge = driverNotifBtn?.querySelector('span');
    const updateDriverNotificationBadge = () => {
        const count = notificationService.getUnreadCount(user.id || 'd1');
        if (!driverNotifBadge) return;
        driverNotifBadge.textContent = count > 99 ? '99+' : String(count);
        driverNotifBadge.style.display = count > 0 ? 'flex' : 'none';
    };
    const notifyDriver = (key, title, message, category = 'TRIP', tripId = currentTrip?.id) => {
        const uniqueKey = `${tripId || 'general'}:${key}`;
        if (notifiedDriverEvents.has(uniqueKey)) return;
        notifiedDriverEvents.add(uniqueKey);
        notificationService.notify(user.id || 'd1', { title, message, category, icon: category === 'FINANCE' ? '💵' : '🏍️' });
    };
    window.addEventListener('58express:notifications-updated', event => {
        if (event.detail?.userId === (user.id || 'd1')) updateDriverNotificationBadge();
    });
    updateDriverNotificationBadge();
    if (driverNotifBtn) {
        driverNotifBtn.addEventListener('click', () => {
            const modal = createNotificationCenterModal(user);
            container.appendChild(modal);
        });
    }

    function setOnline(online) {
        if (online && user.isVerified === false) {
            toggle.checked = false;
            showToast('Tu cuenta está pendiente de aprobación administrativa', 'warning');
            return;
        }
        isOnline = online;
        toggle.checked = online;
        if (online) {
            statusText.textContent = 'En Línea';
            statusText.style.color = 'var(--success)';
            offlineOverlay.classList.add('hidden');
            onlineOverlay.classList.remove('hidden');
            
            // Iniciar seguimiento GPS continuo en tiempo real con Socket.IO & PostgreSQL
            driverGpsTracker.startTracking(user);
            driverDispatchService.registerDriver({
                ...user,
                id: user.id,
                status: 'AVAILABLE'
            });
        } else {
            statusText.textContent = 'Desconectado';
            statusText.style.color = 'var(--text-secondary)';
            offlineOverlay.classList.remove('hidden');
            onlineOverlay.classList.add('hidden');
            
            driverGpsTracker.stopTracking();
            currentMap.removeDriverMarker(ownDriverMarkerId);
            driverDispatchService.updateDriverStatus(user.id, 'OFFLINE');
        }
    }

    toggle.addEventListener('change', (e) => setOnline(e.target.checked));
    if (btnConnectOverlay) {
        btnConnectOverlay.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setOnline(true);
        });
    }
    if (driverHeaderBtn) driverHeaderBtn.addEventListener('click', () => switchTab('perfil'));


    // Stats Bar Items Clicks
    const statTripsBtn = container.querySelector('#stat-btn-trips');
    if (statTripsBtn) statTripsBtn.addEventListener('click', () => switchTab('perfil'));

    const statEarningsBtn = container.querySelector('#stat-btn-earnings');
    if (statEarningsBtn) statEarningsBtn.addEventListener('click', () => switchTab('ganancias'));

    const statRatingBtn = container.querySelector('#stat-btn-rating');
    if (statRatingBtn) statRatingBtn.addEventListener('click', () => switchTab('perfil'));

    const topLogoutBtn = container.querySelector('#top-logout-btn-driver');
    if (topLogoutBtn) {
        topLogoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            authService.logout();
            window.navigateTo('#/');
        });
    }

    function openDriverProfileModal() {
        const overlay = container.querySelector('#page-overlay');
        overlay.classList.remove('hidden');
        overlay.classList.add('active');
        overlay.style.display = 'block';
        overlay.innerHTML = '';
        renderDriverProfile(overlay, {
          onOpenDocuments: () => switchTab('documentos'),
          // Reemplazar la foto invalida la copia de la cabecera.
          onPhotoChanged: photoUrl => {
            privatePhotos.release('propia');
            privatePhotos.applyTo(container.querySelector('#driver-avatar'), photoUrl, { key: 'propia' });
          }
        });
    }

    function animateDriverHome() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const brand = container.querySelector('.driver-brand-lockup');
        const stats = container.querySelector('#stats-bar');
        if (!brand) return;
        window.clearTimeout(driverHomeAnimationTimer);
        brand.classList.remove('driver-brand-ride-in');
        stats?.classList.remove('driver-stats-reveal');
        // Fuerza el reinicio para repetir el recorrido al volver a Inicio.
        void brand.offsetWidth;
        brand.classList.add('driver-brand-ride-in');
        stats?.classList.add('driver-stats-reveal');
        driverHomeAnimationTimer = window.setTimeout(() => {
            brand.classList.remove('driver-brand-ride-in');
            stats?.classList.remove('driver-stats-reveal');
        }, 1050);
    }

    function switchTab(tabName) {
        const tabs = container.querySelectorAll('.nav-tab');
        const pageOverlay = container.querySelector('#page-overlay');
        tabs.forEach(t => t.classList.remove('active'));
        const activeNavTab = container.querySelector(`.nav-tab[data-tab="${tabName}"]`);
        if (activeNavTab) activeNavTab.classList.add('active');

        if (tabName === 'inicio') {
            pageOverlay.classList.add('hidden');
            pageOverlay.classList.remove('active');
            pageOverlay.style.display = 'none';
            pageOverlay.innerHTML = '';
            requestAnimationFrame(animateDriverHome);
        } else if (tabName === 'programados') {
            pageOverlay.classList.remove('hidden');
            pageOverlay.classList.add('active');
            pageOverlay.style.display = 'block';
            pageOverlay.innerHTML = '';
            pageOverlay.appendChild(renderScheduledRides());
        } else if (tabName === 'ganancias') {
            pageOverlay.classList.remove('hidden');
            pageOverlay.classList.add('active');
            pageOverlay.style.display = 'block';
            pageOverlay.innerHTML = '';
            pageOverlay.appendChild(renderEarnings());
        } else if (tabName === 'documentos') {
            pageOverlay.classList.remove('hidden');
            pageOverlay.classList.add('active');
            pageOverlay.style.display = 'block';
            pageOverlay.innerHTML = '';
            pageOverlay.appendChild(renderDocuments());
        } else if (tabName === 'viajes') {
            pageOverlay.classList.remove('hidden');
            pageOverlay.classList.add('active');
            pageOverlay.style.display = 'block';
            pageOverlay.innerHTML = '';
            pageOverlay.appendChild(renderDriverTrips());
        } else if (tabName === 'perfil') {
            openDriverProfileModal();
        }
        if (tabName !== 'inicio' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            pageOverlay.classList.remove('driver-overlay-enter');
            void pageOverlay.offsetWidth;
            pageOverlay.classList.add('driver-overlay-enter');
        }
    }


    function openChatWithPassenger(trip, passenger) {
        if (!activeChat || activeChatTripId !== trip.id) {
            activeChat?.destroy();
            activeChat = createChatModal({
                tripId: trip.id,
                currentUser: user,
                recipientUser: {
                    id: passenger.id || trip.passengerId,
                    firstName: passenger.name || 'Pasajero',
                    photoUrl: passenger.avatar
                }
            });
            document.body.appendChild(activeChat.element);
            activeChatTripId = trip.id;
        }
        unreadMessages = 0;
        chatUnreadBadge.textContent = '0';
        chatUnreadBadge.classList.add('hidden');
        activeChat.open();
    }

    persistentChatBtn.addEventListener('click', () => {
        if (currentTrip && currentPassenger) openChatWithPassenger(currentTrip, currentPassenger);
    });

    function setTripPanelCollapsed(collapsed) {
        tripPanelCollapsed = Boolean(collapsed);
        activeTripContainer.classList.toggle('trip-panel-collapsed', tripPanelCollapsed);
        tripPanelToggle.setAttribute('aria-expanded', String(!tripPanelCollapsed));
        tripPanelToggle.querySelector('.trip-toggle-icon').textContent = tripPanelCollapsed ? '⌃' : '⌄';
        tripPanelToggle.querySelector('.trip-toggle-label').textContent = tripPanelCollapsed ? 'Ver información del viaje' : 'Minimizar viaje';
    }

    function showTripPanel() {
        activeTripContainer.classList.remove('hidden');
        tripPanelToggle.classList.remove('hidden');
        setTripPanelCollapsed(false);
    }

    function clearCompletedTripUi() {
        tripPanelToggle.classList.add('hidden');
        activeTripContainer.classList.add('hidden');
        activeTripContainer.classList.remove('trip-panel-collapsed');
        activeTripContainer.innerHTML = '';
        persistentChatBtn.classList.add('hidden');
        activeChat?.close();
        currentMap.clearRoute();
        currentMap.clearMarkers('pickup');
        currentMap.clearMarkers('destination');
        currentTrip = null;
        currentPassenger = null;
        setOnline(true);
    }

    tripPanelToggle.addEventListener('click', () => setTripPanelCollapsed(!tripPanelCollapsed));
    document.addEventListener('58express:toggle-driver-trip-panel', () => setTripPanelCollapsed(!tripPanelCollapsed));

    function callPassenger(passenger) {
        window.open(`tel:${passenger?.phone || '+584125550001'}`, '_self');
    }

    function tripFare(trip) {
        return Number(trip?.pricing?.fareUSD ?? trip?.fareUSD ?? trip?.fareEUR ?? trip?.fare ?? 0);
    }

    function showTripRoute(trip, stage = 'PICKUP') {
        const pickup = trip?.pickup;
        const destination = trip?.destination;
        if (stage !== 'DESTINATION' && Number.isFinite(Number(pickup?.lat)) && Number.isFinite(Number(pickup?.lng))) {
            currentMap.setPickupMarker(Number(pickup.lat), Number(pickup.lng));
        } else if (stage === 'DESTINATION') {
            currentMap.clearMarkers('pickup');
        }
        if (Number.isFinite(Number(destination?.lat)) && Number.isFinite(Number(destination?.lng))) {
            currentMap.setDestinationMarker(Number(destination.lat), Number(destination.lng));
        }
        const driverPosition = driverGpsTracker.getLastPosition();
        const start = stage === 'DESTINATION' ? pickup : (driverPosition && {
            lat: driverPosition.latitude,
            lng: driverPosition.longitude
        });
        const end = stage === 'DESTINATION' ? destination : pickup;
        if (start && end && Number.isFinite(Number(start.lat)) && Number.isFinite(Number(start.lng)) && Number.isFinite(Number(end.lat)) && Number.isFinite(Number(end.lng))) {
            currentMap.drawRoute(start, end, stage === 'DESTINATION' ? '#00E676' : '#FFC107');
        }
        currentMap.fitBounds();
    }

    function acceptRide(trip, passenger) {
        const modal = container.querySelector('.incoming-ride-modal') || document.querySelector('.incoming-ride-modal');
        
        const driverPayload = {
            id: user.id || 'd1',
            firstName: user.firstName || 'Carlos',
            lastName: user.lastName || 'Mendoza',
            phone: user.phone || '+58 414-000-0004',
            photoUrl: user.photoUrl || null,
            vehicleBrand: user.vehicleBrand || 'Bera',
            vehicleModel: user.vehicleModel || 'SBR 150',
            vehiclePlate: user.vehiclePlate || 'AC3M49P',
            vehicleColor: user.vehicleColor || 'Negro',
            rating: user.rating || 4.9,
            totalTrips: user.totalTrips || 120
        };

        // Atomic Acceptance Lock Check via DriverDispatchService
        const lockRes = driverDispatchService.acceptTripAtomic(trip.id, driverPayload);
        if (!lockRes.success) {
            if (modal) modal.remove();
            showToast('🚫 Este viaje ya fue tomado por otro conductor', 'warning');
            setOnline(true);
            return;
        }

        if (modal) modal.remove();
        currentTrip = trip;
        currentPassenger = passenger;
        notifyDriver('ACCEPTED', 'Carrera aceptada', `Vas a recoger a ${passenger?.name || 'el pasajero'} en ${trip.pickup?.address || 'su ubicación'}.`, 'TRIP', trip.id);
        persistentChatBtn.classList.remove('hidden');
        
        onlineOverlay.classList.add('hidden');
        showTripPanel();

        // En route
        const enRouteView = renderEnRouteToPickup(
            trip, 
            () => arrivePickup(trip, passenger),
            () => openChatWithPassenger(trip, passenger),
            () => callPassenger(passenger),
            passenger
        );
        activeTripContainer.innerHTML = '';
        activeTripContainer.appendChild(enRouteView);
        showTripRoute(trip, 'PICKUP');
    }

    function rejectRide(modal, trip) {
        if (modal) modal.remove();
        if (trip && trip.id) {
            eventLogger.log('DRIVER', `Conductor rechazó/omitión solicitud de viaje [${trip.id}]`);
            socket.emit('rideRejected', { tripId: trip.id, driverId: user.id || 'd1' });
        }
        setOnline(true);
    }

    function arrivePickup(trip, passenger) {
        eventLogger.log('DRIVER', `Conductor llegó al punto de recogida [${trip.id}]`);
        trip.status = 'ARRIVED';
        notifyDriver('ARRIVED', 'Llegaste al punto de recogida', `Avisamos a ${passenger?.name || 'el pasajero'} que ya estás esperando.`, 'TRIP', trip.id);
        socket.emit('tripStatusUpdated', { tripId: trip.id, status: 'ARRIVED' });
        const waitingView = renderWaitingPassenger(
            trip, 
            passenger, 
            () => startTrip(trip, passenger),
            () => openChatWithPassenger(trip, passenger),
            () => callPassenger(passenger)
        );
        activeTripContainer.innerHTML = '';
        activeTripContainer.appendChild(waitingView);
        showTripRoute(trip, 'PICKUP');
    }

    function startTrip(trip, passenger) {
        eventLogger.log('DRIVER', `Pasajero abordó. Viaje iniciado en progreso [${trip.id}]`);
        trip.status = 'IN_PROGRESS';
        notifyDriver('STARTED', 'Viaje iniciado', `Navega hacia ${trip.destination?.address || 'el destino indicado'}.`, 'TRIP', trip.id);
        socket.emit('tripStatusUpdated', { tripId: trip.id, status: 'IN_PROGRESS' });
        const inTripView = renderInTrip(
            trip, 
            () => completeTrip(trip, passenger),
            () => openChatWithPassenger(trip, passenger),
            () => callPassenger(passenger),
            passenger
        );
        activeTripContainer.innerHTML = '';
        activeTripContainer.appendChild(inTripView);
        showTripRoute(trip, 'DESTINATION');
    }

    function completeTrip(trip, passenger) {
        eventLogger.log('DRIVER', `Viaje completado exitosamente [${trip.id}]`);
        trip.status = 'COMPLETED';
        notifyDriver('COMPLETED', 'Viaje completado', `La carrera finalizó. Tarifa: $${tripFare(trip).toFixed(2)} USD.`, 'TRIP', trip.id);
        socket.emit('tripStatusUpdated', { tripId: trip.id, status: 'COMPLETED' });
        persistentChatBtn.classList.add('hidden');
        
        const ratingModal = createDriverRatingModal({
            trip,
            passengerName: passenger?.name || 'Pasajero',
            onSubmit: (res) => {
                socket.emit('tripRated', { tripId: trip.id, rating: res.rating, tags: res.tags, comment: res.comment, targetRole: 'passenger' });
                const fare = tripFare(trip);
                const walletPayment = ['wallet', 'billetera', 'billetera express'].includes(String(trip.paymentMethod || '').replaceAll('_', ' ').toLowerCase());
                if (walletPayment) {
                    notifyDriver('EARNINGS', 'Ganancia acreditada', `Se acreditaron $${(fare * 0.85).toFixed(2)} USD netos por la carrera.`, 'FINANCE', trip.id);
                    showToast(`Viaje finalizado · Neto acreditado $${(fare * 0.85).toFixed(2)} USD`, 'success');
                } else {
                    notifyDriver('COMMISSION', 'Comisión registrada', `Recibiste el pago directamente. +58Express descontó $${(fare * 0.15).toFixed(2)} USD de comisión.`, 'FINANCE', trip.id);
                    showToast(`Viaje finalizado · Comisión $${(fare * 0.15).toFixed(2)} descontada`, 'info');
                }
                clearCompletedTripUi();
            }
        });
        container.appendChild(ratingModal);
    }

    // Real-Time Socket Listener for Passenger Ride Requests Across Tabs & Cloud
    socket.on('rideRequested', (tripData) => {
        // Auto-connect driver online when a ride request arrives
        if (!isOnline) {
            setOnline(true);
        }

        const trip = {
            id: tripData.id || ('trip_' + Date.now()),
            passengerId: tripData.passengerId,
            pickup: tripData.pickup || { address: 'Basílica de Chiquinquirá, Maracaibo' },
            destination: tripData.destination || { address: 'Vereda del Lago, Maracaibo' },
            distance: tripData.distance || 4.5,
            duration: tripData.duration || 12,
            distanceKm: tripData.distanceKm || tripData.distance || 4.5,
            durationMin: tripData.durationMin || tripData.duration || 12,
            fare: tripData.pricing?.fareUSD || tripData.fareUSD || tripData.fareEUR || tripData.fare || 4.50,
            fareUSD: tripData.pricing?.fareUSD || tripData.fareUSD || tripData.fareEUR || tripData.fare || 4.50,
            fareVES: tripData.pricing?.fareVES || tripData.fareVES,
            paymentMethod: tripData.paymentMethod || 'cash_usd',
            rideType: tripData.rideType || 'MOTO',
            status: 'requested'
        };
        const passenger = {
            id: tripData.passengerId,
            name: tripData.passengerName || 'Jordan Pérez',
            rating: tripData.passengerRating || 4.9,
            avatar: tripData.passengerAvatar || null,
            phone: tripData.passengerPhone
        };

        eventLogger.log('DRIVER', `Solicitud emergente recibida de ${passenger.name} ➔ ${trip.destination.address}`);

        notifyDriver('REQUESTED', 'Nueva solicitud de carrera', `${passenger.name} solicita un viaje hacia ${trip.destination.address}.`, 'TRIP', trip.id);

        // Avoid duplicate modal if already visible on body
        if (document.querySelector('.incoming-ride-modal')) return;

        const modal = renderIncomingRide(trip, passenger, 
            () => acceptRide(trip, passenger), 
            () => rejectRide(modal, trip)
        );
        document.body.appendChild(modal);
    });

    // Cancel Listener: Close incoming modal if passenger cancels
    socket.on('rideCancelled', (data) => {
        const modal = document.querySelector('.incoming-ride-modal');
        if (modal) {
            modal.remove();
            showToast('El pasajero ha cancelado la solicitud de viaje', 'info');
        }
        if (currentTrip?.id === data?.tripId) {
            notifyDriver('CANCELLED', 'Carrera cancelada', 'El pasajero canceló la carrera activa.', 'TRIP', data.tripId);
            clearCompletedTripUi();
        }
    });

    socket.on('chat:message', (message) => {
        if (message?.tripId !== currentTrip?.id || message.senderId === user.id) return;
        if (!activeChat?.isOpen()) {
            unreadMessages += 1;
            chatUnreadBadge.textContent = unreadMessages > 9 ? '9+' : String(unreadMessages);
            chatUnreadBadge.classList.remove('hidden');
            notificationService.notify(user.id || 'd1', {
                title: `Mensaje de ${message.senderName || currentPassenger?.name || 'tu pasajero'}`,
                message: message.text || 'El pasajero envió un archivo adjunto.',
                category: 'TRIP',
                icon: '💬'
            });
        }
    });

    socket.on('passengerLocationUpdated', (location) => {
        if (!currentTrip || location?.tripId !== currentTrip.id) return;
        const lat = Number(location.lat ?? location.latitude);
        const lng = Number(location.lng ?? location.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (['IN_PROGRESS', 'IN_TRIP'].includes(currentTrip.status)) {
            // The passenger is already onboard. Keep the destination route;
            // redrawing toward pickup here used to erase navigation.
            return;
        }
        currentTrip.pickup = { ...(currentTrip.pickup || {}), lat, lng };
        currentMap.setPickupMarker(lat, lng);
        const driverPosition = driverGpsTracker.getLastPosition();
        if (driverPosition?.latitude && driverPosition?.longitude) {
            currentMap.drawRoute(
                { lat: driverPosition.latitude, lng: driverPosition.longitude },
                { lat, lng },
                '#FFC107'
            );
        }
    });

    socket.on('wallet:updated', update => {
        const balance = Number(update?.balance || 0);
        user.walletBalance = balance;
        const session = authService.getSession();
        if (session?.token) authService.acceptSession(user, session.token);
        const earningsStat = container.querySelector('#stat-earnings');
        if (earningsStat) {
            earningsStat.textContent = `${balance < 0 ? '−' : ''}$${Math.abs(balance).toFixed(2)}`;
            earningsStat.classList.toggle('debt', balance < 0);
        }
        const transaction = update?.transaction;
        if (transaction?.type === 'PLATFORM_COMMISSION') {
            showToast(`Comisión descontada: $${Math.abs(Number(transaction.amount || 0)).toFixed(2)}. Saldo operativo: $${balance.toFixed(2)}.`, balance < 0 ? 'warning' : 'info');
        } else if (transaction?.type === 'TOP_UP' && transaction.status === 'APPROVED') {
            showToast(`Recarga acreditada. Saldo operativo: $${balance.toFixed(2)}.`, 'success');
        } else if (transaction?.type === 'DRIVER_EARNING') {
            showToast(`Ganancia acreditada. Saldo disponible: $${balance.toFixed(2)}.`, 'success');
        }
        window.dispatchEvent(new CustomEvent('58express:wallet-updated', { detail: update }));
    });

    async function restoreActiveTrip() {
        const active = await apiService.get('/trips/active/me');
        if (!active?.trip || active.trip.driverId !== user.id) return;
        currentTrip = active.trip;
        currentPassenger = {
            id: active.passenger?.id || active.trip.passengerId,
            name: `${active.passenger?.firstName || 'Pasajero'} ${active.passenger?.lastName || ''}`.trim(),
            avatar: active.passenger?.photoUrl,
            rating: active.passenger?.rating || 5
        };
        persistentChatBtn.classList.remove('hidden');
        onlineOverlay.classList.add('hidden');
        showTripPanel();
        let view;
        if (['ARRIVED'].includes(active.trip.status)) {
            view = renderWaitingPassenger(currentTrip, currentPassenger,
                () => startTrip(currentTrip, currentPassenger),
                () => openChatWithPassenger(currentTrip, currentPassenger),
                () => callPassenger(currentPassenger));
        } else if (['IN_PROGRESS', 'IN_TRIP'].includes(active.trip.status)) {
            view = renderInTrip(currentTrip,
                () => completeTrip(currentTrip, currentPassenger),
                () => openChatWithPassenger(currentTrip, currentPassenger),
                () => callPassenger(currentPassenger),
                currentPassenger);
        } else {
            view = renderEnRouteToPickup(currentTrip,
                () => arrivePickup(currentTrip, currentPassenger),
                () => openChatWithPassenger(currentTrip, currentPassenger),
                () => callPassenger(currentPassenger),
                currentPassenger);
        }
        activeTripContainer.innerHTML = '';
        activeTripContainer.appendChild(view);
        showTripRoute(currentTrip, ['IN_PROGRESS', 'IN_TRIP'].includes(currentTrip.status) ? 'DESTINATION' : 'PICKUP');
    }

    // Auto-enable online mode by default so driver is ready immediately
    setOnline(true);
    restoreActiveTrip();
    requestAnimationFrame(animateDriverHome);

    // Tab Navigation
    const tabs = container.querySelectorAll('.nav-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}
