import { authService } from '../../services/mockAuth.js';
import { db } from '../../services/apiService.js';
import { socket } from '../../services/socketClient.js';
import { tripEngine } from '../../services/mockTrip.js';
import { MapComponent } from '../../components/mapComponent.js';
import { icon } from '../../utils/icons.js';
import { renderIncomingRide } from './incomingRide.js';
import { renderEnRouteToPickup, renderWaitingPassenger, renderInTrip, renderTripSummary } from './activeTrip.js';
import { renderEarnings } from './earnings.js';
import { renderDocuments } from './documents.js';
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
import { audioEffects } from '../../utils/audioEffects.js';

export function renderDriverApp(container) {
    const user = authService.getCurrentUser() || {
        id: 'driver_1',
        firstName: 'Carlos',
        lastName: 'Mendoza',
        vehicleBrand: 'Bera',
        vehicleModel: 'BR200',
        vehiclePlate: 'AC3M49P',
        rating: 4.8,
        totalTrips: 342,
        photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos'
    };

    const driverFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Carlos Mendoza';
    const driverAvatarUrl = user.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(driverFullName)}`;

    container.innerHTML = `
        <div class="driver-app">
            <div id="driver-map" class="driver-map-bg"></div>
            
            <div class="driver-top-container">
                <div class="driver-header glass-header">
                    <div class="driver-avatar-info" id="driver-header-btn">
                        <img id="driver-avatar" src="${driverAvatarUrl}" alt="${driverFullName}" class="driver-avatar" />
                        <div class="driver-details">
                            <span id="driver-name" class="driver-name">${driverFullName}</span>
                            <div class="driver-status-text" id="driver-status-text">Desconectado</div>
                        </div>
                    </div>
                    
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
                        <span class="stat-value" id="stat-earnings">$48.50</span>
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
                        <span>EN LÍNEA · Transmitiendo GPS en vivo...</span>
                    </div>
                </div>
                <div id="active-trip-container" class="active-trip-container hidden"></div>
            </div>

            <button id="driver-active-chat-btn" class="driver-active-chat-btn hidden" aria-label="Abrir chat de la carrera">
                <span class="driver-chat-icon">💬</span>
                <span class="driver-chat-label">Chat</span>
                <span id="driver-chat-unread" class="driver-chat-unread hidden">0</span>
            </button>

            <div class="driver-nav-tabs">
                <button class="nav-tab active" data-tab="inicio">${icon('home')} <span>Inicio</span></button>
                <button class="nav-tab" data-tab="ganancias">${icon('wallet')} <span>Ganancias</span></button>
                <button class="nav-tab" data-tab="documentos">${icon('shield')} <span>Documentos</span></button>
                <button class="nav-tab" data-tab="perfil">${icon('user')} <span>Perfil</span></button>
            </div>
            
            <div id="page-overlay" class="page-overlay hidden"></div>
        </div>
    `;

    let isOnline = false;
    let currentTrip = null;
    let currentPassenger = null;
    let activeChat = null;
    let activeChatTripId = null;
    let unreadMessages = 0;
    let currentMap = new MapComponent('driver-map', { is3D: true });

    const toggle = container.querySelector('#online-toggle');
    const statusText = container.querySelector('#driver-status-text');
    const offlineOverlay = container.querySelector('#offline-overlay');
    const onlineOverlay = container.querySelector('#online-overlay');
    const btnConnectOverlay = container.querySelector('#btn-connect-overlay');
    const activeTripContainer = container.querySelector('#active-trip-container');
    const persistentChatBtn = container.querySelector('#driver-active-chat-btn');
    const chatUnreadBadge = container.querySelector('#driver-chat-unread');
    const driverHeaderBtn = container.querySelector('#driver-header-btn');
    const driverThemeSlot = container.querySelector('#driver-theme-toggle-slot');
    if (driverThemeSlot) {
        driverThemeSlot.appendChild(initThemeToggle());
    }

    const driverNotifBtn = container.querySelector('#header-notif-btn-driver');
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
                id: user.id || 'driver_1',
                status: 'AVAILABLE'
            });
        } else {
            statusText.textContent = 'Desconectado';
            statusText.style.color = 'var(--text-secondary)';
            offlineOverlay.classList.remove('hidden');
            onlineOverlay.classList.add('hidden');
            
            driverGpsTracker.stopTracking();
            driverDispatchService.updateDriverStatus(user.id || 'driver_1', 'OFFLINE');
        }
    }

    toggle.addEventListener('change', (e) => setOnline(e.target.checked));
    btnConnectOverlay.addEventListener('click', () => setOnline(true));
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
        renderDriverProfile(overlay);
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
        } else if (tabName === 'perfil') {
            openDriverProfileModal();
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

    function callPassenger(passenger) {
        window.open(`tel:${passenger?.phone || '+584125550001'}`, '_self');
    }

    function tripFare(trip) {
        return Number(trip?.pricing?.fareUSD ?? trip?.fareUSD ?? trip?.fareEUR ?? trip?.fare ?? 0);
    }

    function showTripRoute(trip, stage = 'PICKUP') {
        const pickup = trip?.pickup;
        const destination = trip?.destination;
        if (Number.isFinite(Number(pickup?.lat)) && Number.isFinite(Number(pickup?.lng))) {
            currentMap.setPickupMarker(Number(pickup.lat), Number(pickup.lng));
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
            photoUrl: user.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos`,
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
        persistentChatBtn.classList.remove('hidden');
        
        onlineOverlay.classList.add('hidden');
        activeTripContainer.classList.remove('hidden');

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
        socket.emit('tripStatusUpdated', { tripId: trip.id, status: 'COMPLETED' });
        persistentChatBtn.classList.add('hidden');
        
        const ratingModal = createDriverRatingModal({
            trip,
            passengerName: passenger?.name || 'Pasajero',
            onSubmit: (res) => {
                socket.emit('tripRated', { tripId: trip.id, rating: res.rating, tags: res.tags, comment: res.comment, targetRole: 'passenger' });
                const fare = tripFare(trip);
                const earnings = { fare, commission: fare * 0.15 };
                const summaryView = renderTripSummary(trip, earnings);
                activeTripContainer.innerHTML = '';
                activeTripContainer.appendChild(summaryView);
                
                const continueBtn = summaryView.querySelector('.btn-continue');
                if (continueBtn) {
                    continueBtn.addEventListener('click', () => {
                        activeTripContainer.classList.add('hidden');
                        activeTripContainer.innerHTML = '';
                        setOnline(true);
                    });
                }
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
            avatar: tripData.passengerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tripData.passengerName || 'Jordan')}`,
            phone: tripData.passengerPhone
        };

        eventLogger.log('DRIVER', `Solicitud emergente recibida de ${passenger.name} ➔ ${trip.destination.address}`);

        // Play audible ringtone alert for driver
        try {
            audioEffects.playRideIncoming();
        } catch (e) {}

        // Trigger native device notification (Android / iOS / Desktop background banner)
        notificationService.triggerNativeNotification(
            '⚡ ¡NUEVA SOLICITUD DE VIAJE EN MARACAIBO!',
            `Pasajero: ${passenger.name} · Destino: ${trip.destination.address}`,
            { tag: 'incoming-ride-' + trip.id }
        );

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
            persistentChatBtn.classList.add('hidden');
            activeChat?.close();
        }
    });

    socket.on('chat:message', (message) => {
        if (message?.tripId !== currentTrip?.id || message.senderId === user.id) return;
        if (!activeChat?.isOpen()) {
            unreadMessages += 1;
            chatUnreadBadge.textContent = unreadMessages > 9 ? '9+' : String(unreadMessages);
            chatUnreadBadge.classList.remove('hidden');
        }
    });

    socket.on('passengerLocationUpdated', (location) => {
        if (!currentTrip || location?.tripId !== currentTrip.id) return;
        const lat = Number(location.lat ?? location.latitude);
        const lng = Number(location.lng ?? location.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
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
        activeTripContainer.classList.remove('hidden');
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

    // Tab Navigation
    const tabs = container.querySelectorAll('.nav-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}
