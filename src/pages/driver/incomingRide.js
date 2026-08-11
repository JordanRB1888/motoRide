import { icon } from '../../utils/icons.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';

export function renderIncomingRide(trip, passenger, onAccept, onReject) {
    const overlay = document.createElement('div');
    overlay.className = 'incoming-ride-modal';

    const fare = Number(trip?.pricing?.fareUSD ?? trip?.fareUSD ?? trip?.fareEUR ?? trip?.fare ?? 4.5);
    const distance = Number(trip?.distanceKm ?? trip?.distance ?? 4.5);
    const duration = Number(trip?.durationMin ?? trip?.duration ?? 12);
    const pickup = trip?.pickup?.address || 'Mi ubicación actual';
    const destination = trip?.destination?.address || 'Basílica de Nuestra Señora de Chiquinquirá, Maracaibo';
    const name = passenger?.name || trip?.passengerName || 'Cliente Pruebas';
    const rating = passenger?.rating || 4.9;
    const avatar = passenger?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
    const payment = ({ cash_usd: 'Efectivo USD', cash_ves: 'Efectivo Bs.', pago_movil: 'Pago móvil', wallet: 'Wallet' })[trip?.paymentMethod] || 'Efectivo USD';
    const rideType = trip?.rideType === 'CAR' ? 'Automóvil' : 'Moto';

    overlay.innerHTML = `
        <section class="incoming-request-card" role="dialog" aria-modal="true" aria-label="Nueva solicitud de viaje">
            <header class="incoming-request-header">
                <div class="incoming-countdown">
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                        <circle class="countdown-track" cx="50" cy="50" r="42"></circle>
                        <circle id="ring-progress-svg" class="countdown-progress" cx="50" cy="50" r="42"></circle>
                    </svg>
                    <strong id="countdown-timer">15</strong><small>s</small>
                </div>
                <div><small>NUEVA SOLICITUD</small><h2>Carrera disponible cerca de ti</h2></div>
            </header>

            <div class="incoming-request-metrics">
                <div class="incoming-earning"><small>GANANCIA NETA</small><strong>$${fare.toFixed(2)} <span>USD</span></strong></div>
                <div><small>DISTANCIA</small><strong>${icon('mapPin', 18)} ${distance.toFixed(1)} km</strong></div>
                <div><small>TIEMPO</small><strong>${icon('clock', 18)} ${Math.round(duration)} min</strong></div>
                <span class="incoming-type incoming-real-vehicle">${vehicleImage(trip?.rideType, { decorative: true })}<span>${rideType}</span></span>
                <span class="incoming-payment">${icon('wallet', 17)} ${payment}</span>
            </div>

            <div class="incoming-route">
                <span class="route-line"></span>
                <i class="route-node pickup"></i><div><small>PUNTO DE RECOGIDA</small><strong>${pickup}</strong></div>
                <i class="route-node destination"></i><div><small>DESTINO FINAL</small><strong>${destination}</strong></div>
            </div>

            <div class="incoming-passenger">
                <img src="${avatar}" alt="${name}">
                <div><strong>${name}</strong><span>★ ${rating}</span></div>
                <em>Pasajero VIP</em>
            </div>

            <button id="btn-accept-ride" class="incoming-accept">Aceptar viaje ${icon('arrowRight', 20)}</button>
            <button id="btn-reject-ride" class="incoming-reject">Rechazar</button>
        </section>
    `;

    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        [440, 554, 659].forEach((frequency, index) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.frequency.value = frequency;
            oscillator.connect(gain); gain.connect(audioContext.destination);
            oscillator.start(audioContext.currentTime + index * .2);
            gain.gain.exponentialRampToValueAtTime(.00001, audioContext.currentTime + index * .2 + .3);
            oscillator.stop(audioContext.currentTime + index * .2 + .3);
        });
    } catch {}

    let timeLeft = 15;
    const timer = overlay.querySelector('#countdown-timer');
    const ring = overlay.querySelector('#ring-progress-svg');
    const circumference = 264;
    const timerId = window.setInterval(() => {
        timeLeft -= 1;
        timer.textContent = String(timeLeft);
        ring.style.strokeDashoffset = String(circumference - (timeLeft / 15) * circumference);
        if (timeLeft <= 0) { window.clearInterval(timerId); onReject(); }
    }, 1000);

    overlay.querySelector('#btn-accept-ride').addEventListener('click', () => { window.clearInterval(timerId); onAccept(); });
    overlay.querySelector('#btn-reject-ride').addEventListener('click', () => { window.clearInterval(timerId); onReject(); });
    return overlay;
}
