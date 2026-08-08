import { icon } from '../utils/icons.js';
import { socket } from '../services/socketClient.js';
import { showToast } from './toast.js';

export function createSosModal({ trip, currentUser, location }) {
    const modal = document.createElement('div');
    modal.className = 'sos-modal-overlay hidden';

    let countdown = 10;
    let timerId = null;

    modal.innerHTML = `
        <div class="sos-modal-content glass-panel border-danger">
            <div class="sos-header">
                <div class="sos-icon-pulse">
                    ${icon('sos', 48)}
                </div>
                <h2>CENTRAL DE EMERGENCIA SOS</h2>
                <p class="sos-subtitle">Tu seguridad es nuestra prioridad</p>
            </div>

            <div class="sos-countdown-box">
                <p>Notificando a patrulla y contactos en:</p>
                <div class="countdown-number" id="sos-timer">10</div>
                <div class="countdown-bar-bg">
                    <div class="countdown-bar-fill" id="sos-progress"></div>
                </div>
            </div>

            <div class="sos-actions">
                <button class="sos-btn call-police" id="btn-call-police">
                    ${icon('phone', 20)} Llamar a la Policía (911)
                </button>
                <button class="sos-btn share-whatsapp" id="btn-share-whatsapp">
                    ${icon('share', 20)} Compartir Ruta por WhatsApp
                </button>
                <button class="sos-btn alert-central" id="btn-alert-central">
                    ${icon('shield', 20)} Alertar a Monitoreo +58express
                </button>
            </div>

            <button class="sos-cancel-btn" id="btn-cancel-sos">
                Falsa Alarma / Cancelar SOS
            </button>
        </div>
    `;

    const timerEl = modal.querySelector('#sos-timer');
    const progressEl = modal.querySelector('#sos-progress');
    const cancelBtn = modal.querySelector('#btn-cancel-sos');

    function startCountdown() {
        countdown = 10;
        timerEl.textContent = countdown;
        progressEl.style.width = '100%';

        timerId = setInterval(() => {
            countdown--;
            timerEl.textContent = countdown;
            progressEl.style.width = `${(countdown / 10) * 100}%`;

            if (countdown <= 0) {
                clearInterval(timerId);
                triggerEmergencyBroadcast();
            }
        }, 1000);
    }

    function triggerEmergencyBroadcast() {
        showToast('🚨 ALERTA SOS ENVIADA: Central de Monitoreo informada', 'error', 5000);

        socket.emit('admin:sos_alert', {
            id: 'sos_' + Date.now(),
            tripId: trip?.id || 'UNKNOWN',
            user: {
                id: currentUser.id,
                name: `${currentUser.firstName} ${currentUser.lastName || ''}`,
                phone: currentUser.phone,
                role: currentUser.role
            },
            location: location || { lat: 10.4806, lng: -66.9036 },
            timestamp: new Date().toISOString()
        });
    }

    cancelBtn.addEventListener('click', () => {
        if (timerId) clearInterval(timerId);
        showToast('Alerta SOS cancelada', 'info');
        modal.classList.add('hidden');
    });

    modal.querySelector('#btn-call-police').addEventListener('click', () => {
        window.open('tel:911', '_self');
    });

    modal.querySelector('#btn-share-whatsapp').addEventListener('click', () => {
        const text = `🚨 ¡EMERGENCIA SOS! Necesito ayuda. Estoy en viaje con +58express. Mi ubicación aproximada: https://maps.google.com/?q=${location?.lat || 10.4806},${location?.lng || -66.9036}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    });

    modal.querySelector('#btn-alert-central').addEventListener('click', () => {
        if (timerId) clearInterval(timerId);
        triggerEmergencyBroadcast();
        modal.classList.add('hidden');
    });

    return {
        element: modal,
        open() {
            modal.classList.remove('hidden');
            startCountdown();
        },
        close() {
            if (timerId) clearInterval(timerId);
            modal.classList.add('hidden');
        }
    };
}
