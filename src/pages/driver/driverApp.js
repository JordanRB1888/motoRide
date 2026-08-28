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
import { renderSafeTransportDriver } from './safeTransportDriver.js';
import { isSafeTransportUiEnabled } from '../../utils/safeTransportFlag.js';
import { consultarAcceso as consultarAccesoTransporteSeguro } from '../../services/safeTransportService.js';
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
import { canonicalPhotoPath, createPrivatePhotoLoader, hydratePrivatePhotos, userPhotoEndpoint } from '../../utils/privatePhoto.js';
import { createNavigationBanner } from '../../components/navigationBanner.js';
import { NAVIGATION_PHASE, createDriverNavigation } from '../../services/driverNavigation.js';
import { distanceBetweenMeters } from '../../utils/locationQuality.js';
import { createTripEventQueue } from '../../services/tripEventQueue.js';
import { SYNC_STATE, createTripTransitionSync } from '../../services/tripTransitionSync.js';
import { createScreenLifecycle } from '../../utils/screenLifecycle.js';
import { getPushSubscriptionService, PUSH_RESULT } from '../../services/pushSubscriptionService.js';
import { PUSH_NAVIGATE_EVENT } from '../../services/pushClientMessages.js';

import { localAvatarHtml } from '../../utils/localAvatar.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';
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
                            background: rgba(255,193,7,0.15); border: 1.5px solid var(--accent-primary); color: var(--x58-yellow-text);
                            width: 36px; height: 36px; border-radius: 50%; display:flex; align-items:center; justify-content:center;
                            cursor: pointer; position: relative; flex-shrink: 0;
                        " title="Centro de Notificaciones">
                            ${icon('bell', 20)}
                            <span style="
                                position: absolute; top: -3px; right: -3px; background: var(--danger); color: white;
                                font-size: 0.6rem; font-weight: 900; width: 14px; height: 14px; border-radius: 50%;
                                display: flex; align-items: center; justify-content: center; border: 1px solid #121824;
                            ">2</span>
                        </button>
                        <div id="driver-theme-toggle-slot"></div>
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
                <div class="online-overlay hidden" id="online-overlay" style="text-align: center; position: absolute; top: 196px; left: 50%; transform: translateX(-50%); z-index: 15; width: 90%; max-width: 420px;">
                    <div class="waiting-badge" style="
                        display: flex; align-items: center; justify-content: center; gap: 12px;
                        padding: 14px 20px; border-radius: 20px; background: var(--x58-surface-overlay);
                        backdrop-filter: blur(16px); border: 1.5px solid var(--success);
                        color: var(--success); font-weight: 800; font-size: 0.95rem;
                        box-shadow: 0 10px 25px rgba(0,0,0,0.5), 0 0 20px rgba(0,230,118,0.3);
                    ">
                        <div id="driver-realtime-dot" class="pulsing-dot" style="width:12px; height:12px; border-radius:50%; background:var(--success); box-shadow: 0 0 10px var(--success); flex-shrink:0;"></div>
                        <span id="driver-realtime-label">En línea <b aria-hidden="true">·</b> GPS activo</span>
                    </div>
                </div>
                <div id="active-trip-container" class="active-trip-container hidden"></div>
            </div>

            <button id="driver-trip-panel-toggle" class="driver-trip-panel-toggle hidden" type="button" aria-expanded="true">
                <span class="trip-toggle-icon">⌄</span>
                <span class="trip-toggle-label">Minimizar viaje</span>
            </button>

            <button id="driver-active-chat-btn" class="driver-active-chat-btn hidden" aria-label="Abrir chat de la carrera">
                <span class="driver-chat-icon">${icon('message', 20)}</span>
                <span class="driver-chat-label">Chat</span>
                <span id="driver-chat-unread" class="driver-chat-unread hidden">0</span>
            </button>

            <div class="driver-nav-tabs">
                <button class="nav-tab active" data-tab="inicio">${icon('home')} <span>Inicio</span></button>
                <button class="nav-tab" data-tab="ganancias">${icon('wallet')} <span>Ganancias</span></button>
                <button type="button" id="driver-online-fab" class="driver-online-fab" aria-pressed="false" title="Ponerte en linea para recibir carreras">
                    <span class="driver-online-fab-disc">${vehicleImage('MOTO', { variant: 'card', decorative: true, className: 'driver-online-fab-moto' })}</span>
                    <span class="driver-online-fab-label">Fuera</span>
                </button>
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
    const realtimeLifecycle = createScreenLifecycle({ onFrame: () => {} });
    realtimeLifecycle.closeWhenDetached(container.querySelector('.driver-app'));

    let isOnline = false;
    let currentTrip = null;
    let currentPassenger = null;
    // Piloto controlado (1G): el acceso a los traslados programados lo decide
    // el SERVIDOR; mientras no conteste que sí, la entrada no existe.
    let accesoTrasladosProgramados = false;
    if (isSafeTransportUiEnabled()) {
      consultarAccesoTransporteSeguro()
        .then(autorizado => { accesoTrasladosProgramados = Boolean(autorizado); })
        .catch(() => {});
    }
    let activeChat = null;
    let activeChatTripId = null;
    let unreadMessages = 0;
    let tripPanelCollapsed = false;
    let driverHomeAnimationTimer = null;
    const notifiedDriverEvents = new Set();
    let currentMap = new MapComponent('driver-map', { is3D: true, navigation: true });
    const ownDriverMarkerId = `self:${user.id || 'driver'}`;

    // Navegacion dentro de la app (MAPS-2C): banner de guia + controlador.
    // Las muestras llegan YA aceptadas por GPS-1 (el rastreador solo emite
    // aceptadas); la posicion inicial de cada fase es la ultima aceptada.
    // OFFLINE-TRIP-1A: cola durable de acciones del viaje (con ambito de
    // cuenta) + sincronizador idempotente. El pill informa SIEMPRE la verdad:
    // «guardado en este dispositivo» no es «confirmado por el servidor».
    const tripQueue = createTripEventQueue({ userId: user.id });
    // OFFLINE-1B: el indicador vive EN la tarjeta del viaje (donde el
    // conductor mira) y el pill flotante queda como respaldo SOLO cuando no
    // hay tarjeta visible (finalizacion pendiente tras cerrar el viaje, o
    // panel minimizado, que ademas marca su boton con un punto ambar). En la
    // prueba de campo real el pill anterior quedo detras de la barra
    // inferior y de la tarjeta: por eso ahora el estado se pinta DONDE se
    // opera el viaje.
    const syncPill = document.createElement('div');
    syncPill.id = 'trip-sync-pill';
    syncPill.hidden = true;
    syncPill.setAttribute('aria-live', 'polite');
    container.querySelector('.driver-app')?.appendChild(syncPill);
    let ultimoEstadoSync = null;
    let ultimoDetalleSync = {};
    const pintarEstadoSync = (estado, detalle = {}) => {
        ultimoEstadoSync = estado;
        ultimoDetalleSync = detalle;
        const textos = {
            [SYNC_STATE.PENDING]: detalle.savedOffline
                ? 'Guardado sin conexion · Pendiente de sincronizacion'
                : 'Pendiente de sincronizacion',
            [SYNC_STATE.SYNCING]: 'Sincronizando…',
            [SYNC_STATE.SYNCED]: 'Viaje sincronizado',
            [SYNC_STATE.ERROR]: 'No se pudo sincronizar · Se reintentara'
        };
        const texto = textos[estado];
        const persistente = estado === SYNC_STATE.PENDING || estado === SYNC_STATE.ERROR;

        // 1) La franja integrada en la tarjeta activa (si esta montada).
        const integrados = [...document.querySelectorAll('[data-trip-sync]')]
            .filter(elemento => elemento.isConnected);
        for (const franja of integrados) {
            franja.hidden = !texto;
            if (texto) franja.textContent = texto;
            franja.classList.toggle('is-error', estado === SYNC_STATE.ERROR);
            franja.classList.toggle('is-ok', estado === SYNC_STATE.SYNCED);
        }

        // 2) El pill flotante: respaldo cuando NO hay franja visible (sin
        //    tarjeta, o panel minimizado).
        const franjaVisible = integrados.length > 0 && !tripPanelCollapsed;
        syncPill.hidden = !texto || franjaVisible;
        if (texto) syncPill.textContent = texto;
        syncPill.classList.toggle('is-error', estado === SYNC_STATE.ERROR);
        syncPill.classList.toggle('is-ok', estado === SYNC_STATE.SYNCED);

        // 3) El boton de restaurar el panel marca los pendientes.
        tripPanelToggle?.classList.toggle('has-pending-sync', persistente);

        if (estado === SYNC_STATE.SYNCED) {
            // El exito no ocupa la interfaz para siempre; lo pendiente y el
            // error si son persistentes hasta que el sincronizador diga otra
            // cosa (jamas un timeout marca algo como sincronizado).
            window.setTimeout(() => {
                if (ultimoEstadoSync === SYNC_STATE.SYNCED) {
                    syncPill.hidden = true;
                    for (const franja of document.querySelectorAll('[data-trip-sync]')) franja.hidden = true;
                }
            }, 4000);
        }
    };
    /** Reaplica el ultimo estado sobre una vista recien montada. */
    const reaplicarEstadoSync = () => {
        if (ultimoEstadoSync && ultimoEstadoSync !== SYNC_STATE.IDLE) {
            pintarEstadoSync(ultimoEstadoSync, ultimoDetalleSync);
        }
    };
    const tripSync = createTripTransitionSync({
        queue: tripQueue,
        apiService,
        onStateChange: pintarEstadoSync,
        onEventResult: (resultado) => {
            if (resultado.result === 'APPLIED' && resultado.status === 'COMPLETED') {
                tripQueue.clearActiveTripSnapshot();
            }
            if (resultado.result === 'REJECTED' && resultado.code === 'INSUFFICIENT_WALLET_BALANCE') {
                showToast('El cobro del viaje quedo pendiente: saldo del pasajero insuficiente. Se reintentara.', 'warning');
            }
        }
    });
    // Disparadores de reconciliacion: volver la red, restaurarse el realtime
    // y abrir la aplicacion. Nunca por render ni en bucle.
    realtimeLifecycle.addListener(window, 'online', () => tripSync.flush().catch(() => {}));

    /** Instantanea minima y durable del viaje activo para operar sin red. */
    const guardarSnapshotDeViaje = (trip, passenger, estadoLocal) => {
        if (!trip?.id) return;
        tripQueue?.saveActiveTripSnapshot({
            tripId: trip.id,
            status: estadoLocal || trip.status,
            pickup: trip.pickup ? { lat: trip.pickup.lat, lng: trip.pickup.lng, address: trip.pickup.address } : null,
            destination: trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng, address: trip.destination.address } : null,
            fareUSD: Number(trip?.pricing?.fareUSD ?? trip.fareUSD ?? trip.fare ?? 0),
            paymentMethod: trip.paymentMethod || null,
            rideType: trip.rideType || 'MOTO',
            passenger: passenger ? { id: passenger.id, name: passenger.name, rating: passenger.rating } : null
        });
    };

    const navBanner = createNavigationBanner(document.getElementById('driver-map'));
    const driverNav = createDriverNavigation({
        map: currentMap,
        banner: navBanner,
        getCurrentPosition: () => driverGpsTracker.lastAcceptedSample
    });

    window.addEventListener('58express:driver-position', event => {
        const position = event.detail || {};
        const lat = Number(position.latitude ?? position.lat);
        const lng = Number(position.longitude ?? position.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        currentMap.addDriverMarker(ownDriverMarkerId, lat, lng, Number(position.heading || 0), {
            vehicleType: currentTrip?.rideType || user.vehicleType || user.vehicle?.type || 'MOTO'
        });
        // Progresion local de la guia: cero llamadas a Google por tick.
        driverNav.onPositionSample({ lat, lng, accuracy: position.accuracy });
    });

    const onlineFab = container.querySelector('#driver-online-fab');

    /**
     * Unico lugar que traduce «esta disponible» a como se ve el boton central.
     * Lo llaman setOnline y renderRealtimeState: mientras el conductor sigue en
     * linea, una caida y reconexion del socket no debe apagar el boton.
     */
    function reflejarDisponibilidad(online) {
        if (!onlineFab) return;
        onlineFab.classList.toggle('is-online', online);
        onlineFab.setAttribute('aria-pressed', String(online));
        onlineFab.title = online
            ? 'Estas en linea. Pulsa para desconectarte'
            : 'Ponerte en linea para recibir carreras';
        const etiqueta = onlineFab.querySelector('.driver-online-fab-label');
        if (etiqueta) etiqueta.textContent = online ? 'En linea' : 'Fuera';
    }
    const statusText = container.querySelector('#driver-status-text');
    const onlineOverlay = container.querySelector('#online-overlay');
    const realtimeBadge = onlineOverlay?.querySelector('.waiting-badge');
    const realtimeDot = container.querySelector('#driver-realtime-dot');
    const realtimeLabel = container.querySelector('#driver-realtime-label');
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
            // Tocar un aviso abre su pantalla: la oferta programada, las
            // ganancias o el viaje, sin buscarlas a mano.
            const modal = createNotificationCenterModal(user, null, { onNavigate: switchTab });
            container.appendChild(modal);
        });
    }

    function setOnline(online) {
        if (online && user.isVerified === false) {
            showToast('Tu cuenta está pendiente de aprobación administrativa', 'warning');
            return;
        }
        isOnline = online;
        reflejarDisponibilidad(online);
        if (online) {
            renderRealtimeState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RECONNECTING');
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
            onlineOverlay.classList.add('hidden');
            
            driverGpsTracker.stopTracking();
            currentMap.removeDriverMarker(ownDriverMarkerId);
            driverDispatchService.updateDriverStatus(user.id, 'OFFLINE');
        }
    }

    function renderRealtimeState(state) {
        if (!isOnline) return;
        if (state === 'CONNECTED') {
            statusText.textContent = 'En Línea';
            statusText.style.color = 'var(--success)';
            if (realtimeLabel) realtimeLabel.innerHTML = 'En línea <b aria-hidden="true">·</b> GPS activo';
            if (realtimeBadge) realtimeBadge.style.color = realtimeBadge.style.borderColor = 'var(--success)';
            if (realtimeDot) { realtimeDot.style.background = 'var(--success)'; realtimeDot.style.boxShadow = '0 0 10px var(--success)'; }
        } else if (state === 'OFFLINE') {
            statusText.textContent = 'Sin conexión';
            statusText.style.color = 'var(--danger)';
            if (realtimeLabel) realtimeLabel.textContent = 'Sin conexión';
            if (realtimeBadge) realtimeBadge.style.color = realtimeBadge.style.borderColor = 'var(--danger)';
            if (realtimeDot) { realtimeDot.style.background = 'var(--danger)'; realtimeDot.style.boxShadow = '0 0 10px var(--danger)'; }
        } else {
            statusText.textContent = 'Reconectando…';
            statusText.style.color = 'var(--accent-primary)';
            if (realtimeLabel) realtimeLabel.textContent = 'Reconectando…';
            if (realtimeBadge) realtimeBadge.style.color = realtimeBadge.style.borderColor = 'var(--accent-primary)';
            if (realtimeDot) { realtimeDot.style.background = 'var(--accent-primary)'; realtimeDot.style.boxShadow = '0 0 10px var(--accent-primary)'; }
        }
        // renderRealtimeState solo corre si el conductor esta en linea (vuelve
        // arriba si no), asi que aqui se reafirma esa disponibilidad: un
        // reintento de socket no puede dejar el boton apagado.
        reflejarDisponibilidad(true);
    }

    realtimeLifecycle.addListener(window, '58express:driver-realtime-state', event => renderRealtimeState(event.detail?.state));

    /* ----------------------------------------------------------------------
     * Notificaciones push del conductor
     *
     * Push es una MEJORA y nunca un requisito: si el navegador no lo admite,
     * si la persona lo rechaza o si el servidor lo tiene apagado, ponerse en
     * linea sigue funcionando exactamente igual. Por eso `setOnline` se llama
     * SIEMPRE primero y la tarjeta de permiso aparece despues.
     * -------------------------------------------------------------------- */

    const CLAVE_PUSH_PREGUNTADO = `58express_push_asked_${user.id || 'driver'}`;

    const yaSePregunto = () => {
        try { return localStorage.getItem(CLAVE_PUSH_PREGUNTADO) === 'yes'; } catch { return false; }
    };
    const marcarPreguntado = () => {
        try { localStorage.setItem(CLAVE_PUSH_PREGUNTADO, 'yes'); } catch { /* sin almacenamiento */ }
    };

    /**
     * Tarjeta contextual. Reutiliza el sistema de diseno existente --las
     * mismas variables de color y el mismo lenguaje de tarjeta que el resto de
     * la aplicacion-- y no redisena nada.
     */
    function mostrarTarjetaPermisoPush() {
        if (container.querySelector('#driver-push-permission')) return;

        const overlay = document.createElement('div');
        overlay.id = 'driver-push-permission';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:30000;background:rgba(8,13,22,.88);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(16px)';
        overlay.innerHTML = `<div style="width:100%;max-width:420px;padding:24px;border-radius:26px;background:var(--surface-card);border:2px solid var(--accent-primary);box-shadow:0 24px 60px rgba(0,0,0,.65)"><div style="text-align:center">${icon('bell', 32)}</div><h3 style="color:var(--text-primary);text-align:center;margin:10px 0 8px">Avisos de carreras</h3><p style="color:var(--text-secondary);line-height:1.5;font-size:.9rem">Activa las notificaciones para avisarte cuando tengas una solicitud de viaje, aunque tengas la aplicación en segundo plano.</p><button id="driver-push-allow" style="width:100%;padding:15px;border:0;border-radius:16px;background:linear-gradient(135deg,#FFC107,#FF9800);color:#121824;font-weight:950;cursor:pointer">ACTIVAR NOTIFICACIONES</button><button id="driver-push-later" style="width:100%;padding:12px;margin-top:8px;border:0;background:none;color:var(--text-secondary);font-weight:800;cursor:pointer">Ahora no</button></div>`;
        container.appendChild(overlay);

        const cerrar = () => { marcarPreguntado(); overlay.remove(); };

        overlay.querySelector('#driver-push-later').addEventListener('click', cerrar);
        overlay.querySelector('#driver-push-allow').addEventListener('click', async () => {
            marcarPreguntado();
            overlay.remove();
            // El dialogo del navegador SOLO puede pedirse desde este gesto.
            const servicio = await getPushSubscriptionService();
            const { result } = await servicio.subscribe({ requestPermission: true });

            if (result === PUSH_RESULT.SUBSCRIBED || result === PUSH_RESULT.ALREADY_SUBSCRIBED) {
                showToast('Notificaciones activadas', 'success');
            } else if (result === PUSH_RESULT.PERMISSION_DENIED) {
                showToast('Notificaciones bloqueadas. Puedes habilitarlas en los ajustes del navegador.', 'info');
            } else if (result === PUSH_RESULT.PUSH_DISABLED) {
                // Estado normal mientras la funcionalidad no este activada en
                // el servidor. No es un error y no se muestra como tal, pero
                // tampoco puede quedar en silencio: la persona acaba de aceptar
                // en el dialogo del navegador y merece saber que su permiso
                // quedo guardado. Cuando push se active, la reconciliacion la
                // suscribe sola, sin volver a preguntarle nada.
                eventLogger.info('[push] el servidor aun no tiene push activado');
                showToast('Permiso concedido. Te avisaremos cuando esté disponible.', 'info');
            }
        });
    }

    /**
     * Se llama al ponerse en linea. No pide permiso: solo decide si merece la
     * pena ensenar la explicacion. Si ya se pregunto una vez, no se insiste.
     */
    async function ofrecerNotificacionesSiProcede() {
        try {
            const servicio = await getPushSubscriptionService();
            if (!servicio.detectSupport().supported) return;
            const permiso = servicio.getPermissionState();
            if (permiso === 'granted') {
                // Ya concedido: se reconcilia en silencio, sin dialogos.
                await servicio.reconcile();
                return;
            }
            if (permiso !== 'default') return;   // denegado: no se insiste
            if (yaSePregunto()) return;
            mostrarTarjetaPermisoPush();
        } catch (error) {
            eventLogger.warn('[push] no se pudo preparar la suscripcion', error?.message);
        }
    }

    // Reconciliacion en primer plano: es el camino fiable cuando el navegador
    // rota el endpoint, porque el service worker no puede registrar en el
    // backend sin sesion. Idempotente y silenciosa.
    getPushSubscriptionService()
        .then(servicio => servicio.reconcile())
        .catch(() => {});

    // Un toque en la notificacion trae la aplicacion al frente. El payload no
    // es fuente de verdad: se relee el estado autorizado del backend, y si el
    // viaje caduco o lo acepto otro conductor, se ve lo que hay de verdad.
    realtimeLifecycle.addListener(window, PUSH_NAVIGATE_EVENT, () => {
        switchTab('inicio');
        restoreActiveTrip();
    });

    onlineFab?.addEventListener('click', () => {
        const siguiente = !isOnline;
        // La disponibilidad se resuelve ANTES y con independencia de push:
        // ninguna rama de notificaciones puede impedir ponerse en linea.
        setOnline(siguiente);
        if (siguiente && isOnline) ofrecerNotificacionesSiProcede();
    });
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
          // Piloto (1G): la fila existe SOLO si el servidor ya confirmó el
          // acceso de esta cuenta (sin parpadeo: consulta en vuelo o fallida
          // = entrada ausente).
          onOpenScheduledTransport: (isSafeTransportUiEnabled() && accesoTrasladosProgramados)
            ? () => switchTab('traslados-seguros')
            : null,
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
        } else if (tabName === 'traslados-seguros') {
            // SAFE-1F: participacion del conductor en el Transporte Seguro.
            pageOverlay.classList.remove('hidden');
            pageOverlay.classList.add('active');
            pageOverlay.style.display = 'block';
            pageOverlay.innerHTML = '';
            pageOverlay.appendChild(renderSafeTransportDriver());
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
        reaplicarEstadoSync();
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
        driverNav.stop();
        currentMap.clearRoute();
        currentMap.clearMarkers('pickup');
        currentMap.clearMarkers('destination');
        // Al cerrar el viaje se revoca SOLO la foto de este pasajero: la
        // clave es su ruta canonica, LA MISMA que derivo la tarjeta al
        // hidratarse (con o sin photoUrl en el perfil). El avatar propio del
        // conductor ('propia') no se toca.
        const fotoPasajero = canonicalPhotoPath(currentPassenger?.avatar)
            || (currentPassenger?.id ? userPhotoEndpoint(currentPassenger.id) : null);
        if (fotoPasajero) privatePhotos.release(fotoPasajero);
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
        // MAPS-2C: la ruta del conductor es NAVEGACION por fases (Google con
        // respaldo OSRM, normalizada). La fase parte SIEMPRE de la posicion
        // GPS aceptada actual: la ruta a la recogida jamas se reutiliza hacia
        // el destino.
        const end = stage === 'DESTINATION' ? destination : pickup;
        if (end && Number.isFinite(Number(end.lat)) && Number.isFinite(Number(end.lng))) {
            driverNav.startPhase(
                stage === 'DESTINATION' ? NAVIGATION_PHASE.DESTINATION : NAVIGATION_PHASE.PICKUP,
                { lat: Number(end.lat), lng: Number(end.lng) },
                { label: (stage === 'DESTINATION' ? destination?.address : pickup?.address) || '' }
            );
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
        guardarSnapshotDeViaje(trip, passenger, 'EN_ROUTE');
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
        // La foto privada del pasajero se pide DESPUES de conectar la vista:
        // el cargador solo pinta sobre elementos vivos, y si no hay foto o el
        // acceso no corresponde, el avatar local se queda tal cual.
        hydratePrivatePhotos(enRouteView, privatePhotos);
        reaplicarEstadoSync();
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
        const estadoPrevio = trip.status;
        trip.status = 'ARRIVED';
        notifyDriver('ARRIVED', 'Llegaste al punto de recogida', `Avisamos a ${passenger?.name || 'el pasajero'} que ya estás esperando.`, 'TRIP', trip.id);
        // OFFLINE-TRIP-1A: durable primero, entrega idempotente despues. Con
        // red se aplica al instante; sin red queda guardada y sincroniza sola.
        tripSync.recordTransition({
            tripId: trip.id, action: 'ARRIVED', expectedTripState: estadoPrevio,
            location: driverGpsTracker.lastAcceptedSample
        });
        guardarSnapshotDeViaje(trip, passenger, 'ARRIVED');
        const waitingView = renderWaitingPassenger(
            trip, 
            passenger, 
            () => startTrip(trip, passenger),
            () => openChatWithPassenger(trip, passenger),
            () => callPassenger(passenger)
        );
        activeTripContainer.innerHTML = '';
        activeTripContainer.appendChild(waitingView);
        hydratePrivatePhotos(waitingView, privatePhotos);
        reaplicarEstadoSync();
        showTripRoute(trip, 'PICKUP');
    }

    function startTrip(trip, passenger) {
        eventLogger.log('DRIVER', `Pasajero abordó. Viaje iniciado en progreso [${trip.id}]`);
        const estadoPrevio = trip.status;
        trip.status = 'IN_PROGRESS';
        notifyDriver('STARTED', 'Viaje iniciado', `Navega hacia ${trip.destination?.address || 'el destino indicado'}.`, 'TRIP', trip.id);
        tripSync.recordTransition({
            tripId: trip.id, action: 'IN_PROGRESS', expectedTripState: estadoPrevio,
            location: driverGpsTracker.lastAcceptedSample
        });
        guardarSnapshotDeViaje(trip, passenger, 'IN_PROGRESS');
        const inTripView = renderInTrip(
            trip, 
            () => completeTrip(trip, passenger),
            () => openChatWithPassenger(trip, passenger),
            () => callPassenger(passenger),
            passenger
        );
        activeTripContainer.innerHTML = '';
        activeTripContainer.appendChild(inTripView);
        hydratePrivatePhotos(inTripView, privatePhotos);
        reaplicarEstadoSync();
        showTripRoute(trip, 'DESTINATION');
    }

    function completeTrip(trip, passenger) {
        eventLogger.log('DRIVER', `Viaje completado exitosamente [${trip.id}]`);
        const estadoPrevio = trip.status;
        trip.status = 'COMPLETED';
        notifyDriver('COMPLETED', 'Viaje completado', `La carrera finalizó. Tarifa: $${tripFare(trip).toFixed(2)} USD.`, 'TRIP', trip.id);
        tripSync.recordTransition({
            tripId: trip.id, action: 'COMPLETED', expectedTripState: estadoPrevio,
            location: driverGpsTracker.lastAcceptedSample
        });
        if (navigator.onLine === false) {
            showToast('Finalizacion guardada en este dispositivo. Se sincronizara al volver la conexion.', 'info', 6000);
        }
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
        // Solo un movimiento MATERIAL del punto de recogida reinicia la fase
        // de navegacion: el vaiven normal del GPS del pasajero no puede
        // convertirse en recalculos contra Google.
        const previo = currentTrip.pickup;
        const movimiento = (Number.isFinite(Number(previo?.lat)) && Number.isFinite(Number(previo?.lng)))
            ? distanceBetweenMeters({ lat: Number(previo.lat), lng: Number(previo.lng) }, { lat, lng })
            : Infinity;
        currentTrip.pickup = { ...(currentTrip.pickup || {}), lat, lng };
        currentMap.setPickupMarker(lat, lng);
        if (movimiento >= 50) {
            driverNav.startPhase(NAVIGATION_PHASE.PICKUP, { lat, lng }, {
                label: currentTrip.pickup?.address || ''
            });
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

    let restoreActiveTripPromise = null;
    async function restoreActiveTrip() {
        if (restoreActiveTripPromise) return restoreActiveTripPromise;
        restoreActiveTripPromise = restoreActiveTripOnce().finally(() => { restoreActiveTripPromise = null; });
        return restoreActiveTripPromise;
    }

    async function restoreActiveTripOnce() {
        const active = await apiService.get('/trips/active/me');
        // Sin red no hay veredicto del servidor: NO se limpia nada. Si hay
        // una instantanea local durable, el conductor sigue operando su viaje
        // desde este dispositivo; la cola sincronizara al volver la red.
        if (active === null && (apiService.lastError?.status === 0 || apiService.lastError?.error === 'NETWORK_ERROR')) {
            restaurarViajeDesdeSnapshot();
            return;
        }
        if (!active?.trip || active.trip.driverId !== user.id) {
            // El servidor manda: si ya no hay viaje activo (p. ej. la
            // finalizacion pendiente se aplico), se limpia la instantanea.
            tripQueue?.clearActiveTripSnapshot();
            if (currentTrip) clearCompletedTripUi();
            tripSync.flush().catch(() => {});
            return;
        }
        // Si la finalizacion esta guardada localmente pero el servidor aun no
        // la recibio, no se re-pinta el viaje activo: se sincroniza.
        if (tripQueue?.hasPendingAction(active.trip.id, 'COMPLETED')) {
            tripSync.flush().catch(() => {});
            return;
        }
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
        hydratePrivatePhotos(view, privatePhotos);
        reaplicarEstadoSync();
        showTripRoute(currentTrip, ['IN_PROGRESS', 'IN_TRIP'].includes(currentTrip.status) ? 'DESTINATION' : 'PICKUP');
        guardarSnapshotDeViaje(currentTrip, currentPassenger, currentTrip.status);
        tripSync.flush().catch(() => {});
    }

    /**
     * Restauracion SIN servidor (OFFLINE-TRIP-1A): la instantanea durable
     * pinta la vista del estado local para que el conductor pueda seguir
     * registrando acciones. Nada de esto se presenta como confirmado.
     */
    function restaurarViajeDesdeSnapshot() {
        const snapshot = tripQueue?.loadActiveTripSnapshot();
        if (!snapshot?.tripId) return;
        if (tripQueue.hasPendingAction(snapshot.tripId, 'COMPLETED')) {
            pintarEstadoSync(SYNC_STATE.PENDING, { pending: tripQueue.size() });
            return;
        }
        currentTrip = {
            id: snapshot.tripId,
            status: snapshot.status,
            pickup: snapshot.pickup,
            destination: snapshot.destination,
            fareUSD: snapshot.fareUSD,
            paymentMethod: snapshot.paymentMethod,
            rideType: snapshot.rideType
        };
        currentPassenger = snapshot.passenger
            ? { id: snapshot.passenger.id, name: snapshot.passenger.name, rating: snapshot.passenger.rating }
            : null;
        persistentChatBtn.classList.remove('hidden');
        onlineOverlay.classList.add('hidden');
        showTripPanel();
        let view;
        if (snapshot.status === 'ARRIVED') {
            view = renderWaitingPassenger(currentTrip, currentPassenger,
                () => startTrip(currentTrip, currentPassenger),
                () => openChatWithPassenger(currentTrip, currentPassenger),
                () => callPassenger(currentPassenger));
        } else if (['IN_PROGRESS', 'IN_TRIP'].includes(snapshot.status)) {
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
        showTripRoute(currentTrip, ['IN_PROGRESS', 'IN_TRIP'].includes(snapshot.status) ? 'DESTINATION' : 'PICKUP');
        showToast('Viaje activo guardado en este dispositivo. Sin conexion con el servidor.', 'info', 6000);
        pintarEstadoSync(SYNC_STATE.PENDING, { pending: tripQueue.size() });
    }

    realtimeLifecycle.addListener(window, '58express:driver-realtime-restored', () => {
        restoreActiveTrip();
    });

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
