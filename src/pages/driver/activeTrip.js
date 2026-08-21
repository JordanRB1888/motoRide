import { icon } from '../../utils/icons.js';
import { paymentLabel } from '../../utils/paymentLabels.js';

import { neutralizePrivatePhoto } from '../../utils/privatePhoto.js';
import { localAvatarHtml } from '../../utils/localAvatar.js';
const fareOf = trip => Number(trip?.pricing?.fareUSD ?? trip?.fareUSD ?? trip?.fareEUR ?? trip?.fare ?? 0);

function createTripSheet({ trip, passenger, stage, title, status, actionLabel, onAction, onChat, onCall, timer = false }) {
    const container = document.createElement('div');
    container.className = `active-trip-panel driver-trip-sheet stage-${stage} slide-up-animation`;
    const distance = Number(trip?.distanceKm ?? trip?.distance ?? 0);
    const duration = Number(trip?.durationMin ?? trip?.duration ?? 0);
    const name = passenger?.name || trip?.passengerName || 'Cliente Pruebas';
    const avatar = localAvatarHtml({ name, role: 'passenger', label: name });
    const pickup = trip?.pickup?.address || 'Mi ubicación actual';
    const destination = trip?.destination?.address || 'Basílica de Nuestra Señora de Chiquinquirá, Maracaibo';

    container.innerHTML = `
        <div class="trip-sheet-handle"></div>
        <header class="trip-sheet-status">
            <div><small>${stage === 'pickup' ? 'RUMBO A LA RECOGIDA' : stage === 'waiting' ? 'PUNTO DE RECOGIDA' : 'NAVEGACIÓN ACTIVA'}</small><h3>${title}</h3></div>
            <span class="trip-stage-pill ${stage}" ${timer ? 'id="waiting-timer"' : ''}>${status}</span>
            <button class="trip-sheet-collapse" type="button" aria-label="Minimizar viaje">⌄</button>
        </header>

        <div class="trip-passenger-row">
            ${avatar}
            <div><strong>${name}</strong><span>★ ${passenger?.rating || 4.9} · Pasajero VIP</span></div>
            <button class="trip-contact-btn btn-driver-chat" type="button" aria-label="Abrir chat">${icon('message', 20)}</button>
            <button class="trip-contact-btn call btn-driver-call" type="button" aria-label="Llamar pasajero">${icon('phone', 20)}</button>
        </div>

        <div class="trip-quick-facts">
            <div><small>Tarifa</small><strong>$${fareOf(trip).toFixed(2)}</strong></div>
            <div><small>Pago</small><strong>${paymentLabel(trip?.paymentMethod)}</strong></div>
            <div><small>Distancia</small><strong>${distance.toFixed(1)} km</strong></div>
            <div><small>Tiempo</small><strong>${Math.round(duration)} min</strong></div>
        </div>

        <div class="trip-route-compact">
            <span class="trip-route-line"></span>
            <i class="pickup"></i><div><small>Recogida</small><strong>${pickup}</strong></div>
            <i class="destination"></i><div><small>Destino</small><strong>${destination}</strong></div>
        </div>
        ${stage === 'trip' ? '<div class="trip-progress"><span></span></div>' : ''}
        <button class="trip-primary-action" type="button">${actionLabel}</button>
    `;

    container.querySelector('.trip-sheet-collapse').addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('58express:toggle-driver-trip-panel'));
    });
    container.querySelector('.trip-primary-action').addEventListener('click', onAction);
    container.querySelector('.btn-driver-chat').addEventListener('click', onChat);
    container.querySelector('.btn-driver-call').addEventListener('click', onCall);

    if (timer) {
        let seconds = 0;
        const timerElement = container.querySelector('#waiting-timer');
        const timerId = window.setInterval(() => {
            if (!container.isConnected) { window.clearInterval(timerId); return; }
            seconds += 1;
            timerElement.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        }, 1000);
    }
    return container;
}

export function renderEnRouteToPickup(trip, onArrived, onChat, onCall, passenger = null) {
    return createTripSheet({ trip, passenger, stage: 'pickup', title: 'En camino a buscar al cliente', status: '3 min', actionLabel: 'Llegué al punto de recogida', onAction: onArrived, onChat, onCall });
}

export function renderWaitingPassenger(trip, passenger, onStart, onChat, onCall) {
    return createTripSheet({ trip, passenger, stage: 'waiting', title: 'Llegaste al punto de recogida', status: '00:00', actionLabel: 'Cliente a bordo · Iniciar viaje', onAction: onStart, onChat, onCall, timer: true });
}

export function renderInTrip(trip, onComplete, onChat, onCall, passenger = null) {
    return createTripSheet({ trip, passenger, stage: 'trip', title: 'En ruta hacia el destino', status: 'En viaje', actionLabel: 'Confirmar llegada al destino', onAction: onComplete, onChat, onCall });
}

export function renderTripSummary(trip, earnings) {
    const container = document.createElement('div');
    container.className = 'trip-summary-card slide-up-animation';
    const net = Number(earnings.fare - earnings.commission).toFixed(2);
    container.innerHTML = `
        <section class="driver-trip-summary">
            <span class="summary-check">${icon('check', 24)}</span>
            <small>VIAJE COMPLETADO</small><h2>¡Excelente trabajo!</h2>
            <div><span>Tarifa</span><strong>$${Number(earnings.fare).toFixed(2)} USD</strong></div>
            <div><span>Comisión (15%)</span><strong>-$${Number(earnings.commission).toFixed(2)} USD</strong></div>
            <div class="net"><span>Ganancia neta</span><strong>$${net} USD</strong></div>
            <button class="btn-continue">Disponible para el siguiente viaje</button>
        </section>`;
    return container;
}
