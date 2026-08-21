import { getBcvEuroRate, formatVes } from '../utils/bcvRates.js';
import { showToast } from './toast.js';
import { icon } from '../utils/icons.js';
import { apiService } from '../services/apiService.js';

export function createScheduleRideModal({ originName = 'Basílica de Chiquinquirá', destinationName = '', fareEUR = 4.50, onSchedule, onClose }) {
    const bcvRate = getBcvEuroRate();

    const overlay = document.createElement('div');
    overlay.className = 'diorama-card-3d fade-in';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9000;
        background: rgba(10, 15, 24, 0.92); backdrop-filter: blur(24px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    // Default tomorrow date & 08:00 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDateStr = tomorrow.toISOString().split('T')[0];

    let selectedDate = defaultDateStr;
    let selectedTime = '08:00';
    let isPaidInAdvance = true; // Default pay in advance option as requested
    let currentOrigin = originName || 'Basílica de Chiquinquirá';
    let currentDestination = destinationName || 'Sambil Maracaibo';
    let currentFareEUR = fareEUR || 4.50;

    const modal = document.createElement('div');
    modal.style.cssText = `
        width: 100%; max-width: 480px; max-height: 90vh; background: var(--surface-card); border-radius: 28px;
        border: 2px solid var(--accent-primary); padding: 24px; text-align: left;
        box-shadow: 0 30px 70px rgba(0,0,0,0.8), 0 0 35px rgba(255,193,7,0.3);
        display: flex; flex-direction: column; overflow: hidden; animation: dioramaLand 0.35s ease-out;
    `;

    const render = () => {
        const fareVES = currentFareEUR * bcvRate;

        modal.innerHTML = `
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px dashed var(--border-color); padding-bottom: 14px; margin-bottom: 16px;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,193,7,0.15); display:flex; align-items:center; justify-content:center; color:var(--accent-primary); font-size:1.3rem;">
                        ${icon('calendar', 32)}
                    </div>
                    <div>
                        <h3 style="color: var(--text-primary); font-size: 1.2rem; font-weight: 900; margin: 0;">Programar Viaje Futuro</h3>
                        <small style="color: var(--text-secondary); font-size: 0.78rem;">Reserva de moto con opción de pago por adelantado 🇻🇪</small>
                    </div>
                </div>
                <button id="close-schedule-modal" style="color: var(--text-secondary); font-size: 1.3rem; background: none; border: none; cursor: pointer;">✕</button>
            </div>

            <div style="flex:1; overflow-y: auto; padding-right: 4px; margin-bottom: 16px;">
                <!-- Origin & Destination Inputs -->
                <div style="background: var(--surface-elevated); padding: 14px; border-radius: 18px; border: 1px solid var(--border-color); margin-bottom: 16px; display:flex; flex-direction:column; gap:10px;">
                    <div>
                    <div>
                        <small style="color:var(--text-muted); font-size:0.75rem; display:block; margin-bottom:2px;">${icon('mapPin', 14)} LUGAR DE RECOGIDA (ORIGEN)</small>
                        <input type="text" id="sch-origin-input" value="${currentOrigin}" placeholder="Ej: Basílica de Chiquinquirá" style="
                            width:100%; padding:10px 12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:var(--text-primary); font-size:0.9rem; outline:none; font-weight:700;
                        " />
                    </div>
                    <div>
                        <small style="color:var(--text-muted); font-size:0.75rem; display:block; margin-bottom:2px;">${icon('flag', 14)} LUGAR DE DESTINO EN MARACAIBO</small>
                        <input type="text" id="sch-dest-input" value="${currentDestination}" placeholder="Ej: Sambil, Vereda del Lago, Aeropuerto" style="
                            width:100%; padding:10px 12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:var(--text-primary); font-size:0.9rem; outline:none; font-weight:700;
                        " />
                    </div>
                </div>

                <!-- Custom Date & Time Inputs -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <small style="color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">${icon('calendar', 14)} Fecha del Viaje *</small>
                        <input type="date" id="schedule-date-input" value="${selectedDate}" min="${new Date().toISOString().split('T')[0]}" style="
                            width:100%; padding:12px; border-radius:14px; border:1.5px solid var(--border-gold); background:var(--surface-input); color:var(--text-primary); font-size:0.9rem; outline:none; font-weight:700;
                        " />
                    </div>
                    <div>
                        <small style="color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">${icon('clock', 14)} Hora de Recogida *</small>
                        <input type="time" id="schedule-time-input" value="${selectedTime}" style="
                            width:100%; padding:12px; border-radius:14px; border:1.5px solid var(--border-gold); background:var(--surface-input); color:var(--text-primary); font-size:0.9rem; outline:none; font-weight:700;
                        " />
                    </div>
                </div>

                <!-- Advance Payment Option Switch -->
                <div style="background: rgba(0,230,118,0.06); padding: 14px; border-radius: 18px; border: 1.5px solid var(--success); margin-bottom: 16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <strong style="color:var(--text-primary); font-size:0.92rem;">${icon('creditCard', 16)} Opciones de Pago de la Reserva:</strong>
                        <span class="badge badge-success" style="font-size:0.75rem;">Protección al Conductor</span>
                    </div>

                    <div style="display:flex; gap: 10px; margin-top: 10px;">
                        <button class="pay-option-btn" data-advance="true" style="
                            flex:1; padding: 12px; border-radius: 14px; font-weight: 800; font-size: 0.82rem; cursor: pointer; text-align: center;
                            background: ${isPaidInAdvance ? 'var(--success)' : 'var(--surface-card)'};
                            color: ${isPaidInAdvance ? '#121824' : 'var(--text-primary)'};
                            border: 1px solid var(--border-color);
                        ">
                            ✓ Pagar por Adelantado<br>
                            <small style="opacity:0.85;">(Garantiza asignación)</small>
                        </button>

                        <button class="pay-option-btn" data-advance="false" style="
                            flex:1; padding: 12px; border-radius: 14px; font-weight: 800; font-size: 0.82rem; cursor: pointer; text-align: center;
                            background: ${!isPaidInAdvance ? 'var(--accent-secondary)' : 'var(--surface-card)'};
                            color: ${!isPaidInAdvance ? '#121824' : 'var(--text-primary)'};
                            border: 1px solid var(--border-color);
                        ">
                            ${icon('banknote', 16)} Pagar al Iniciar Viaje<br>
                            <small style="opacity:0.85;">(Pago Móvil/Efectivo)</small>
                        </button>
                    </div>
                </div>

                <!-- Price Guarantee Card -->
                <div style="background: rgba(255,193,7,0.06); padding: 14px; border-radius: 18px; border: 1px solid var(--border-gold); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <small style="color:var(--text-muted); font-size:0.75rem; display:block;">TARIFA CONGELADA DE LA RESERVA</small>
                        <strong style="color:var(--accent-primary); font-size:1.4rem; font-family:'JetBrains Mono', monospace;">€${currentFareEUR.toFixed(2)} EUR</strong>
                    </div>
                    <div style="text-align:right;">
                        <small style="color:var(--text-muted); font-size:0.72rem; display:block;">EQUIVALENTE VES (BCV)</small>
                        <strong style="color:var(--text-primary); font-size:0.95rem;">~ ${formatVes(currentFareEUR)}</strong>
                    </div>
                </div>
            </div>

            <!-- Submit Button -->
            <button id="confirm-schedule-btn" class="btn btn-3d primary-btn" style="
                width: 100%; padding: 16px; border-radius: 18px; font-weight: 900; font-size: 1.05rem;
                background: linear-gradient(135deg, #00E676 0%, #00B0FF 100%); color: #121824;
            ">
                ${icon('check', 18)} CONFIRMAR RESERVA Y PROGRAMACIÓN
            </button>
        `;

        modal.querySelector('#close-schedule-modal').addEventListener('click', () => {
            overlay.remove();
            if (onClose) onClose();
        });

        const dateInput = modal.querySelector('#schedule-date-input');
        const timeInput = modal.querySelector('#schedule-time-input');
        const originInput = modal.querySelector('#sch-origin-input');
        const destInput = modal.querySelector('#sch-dest-input');

        dateInput.addEventListener('change', (e) => selectedDate = e.target.value);
        timeInput.addEventListener('change', (e) => selectedTime = e.target.value);
        originInput.addEventListener('input', (e) => currentOrigin = e.target.value);
        destInput.addEventListener('input', (e) => currentDestination = e.target.value);

        modal.querySelectorAll('.pay-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                isPaidInAdvance = btn.dataset.advance === 'true';
                render();
            });
        });

        modal.querySelector('#confirm-schedule-btn').addEventListener('click', async () => {
            if (!selectedDate || !selectedTime || !currentDestination) {
                showToast('Por favor completa la fecha, hora y lugar de destino', 'error');
                return;
            }

            const formattedDateTime = `${selectedDate} a las ${selectedTime}`;
            const scheduledTrip = await apiService.post('/trips/scheduled', {
                pickup: { address: currentOrigin },
                destination: { address: currentDestination },
                scheduledAt: new Date(`${selectedDate}T${selectedTime}:00`).toISOString(),
                fareUSD: currentFareEUR,
                paymentMethod: isPaidInAdvance ? 'WALLET_PENDING' : 'CASH'
            });
            if (!scheduledTrip) return showToast('No se pudo registrar la reserva. Selecciona una hora futura válida.', 'error');

            showToast(`Reserva confirmada para ${formattedDateTime}.`, 'success');
            overlay.remove();
            if (onSchedule) onSchedule(scheduledTrip);
        });
    };

    overlay.appendChild(modal);
    render();
    return overlay;
}
