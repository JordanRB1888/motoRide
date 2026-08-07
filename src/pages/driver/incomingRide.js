import { icon } from '../../utils/icons.js';

export function renderIncomingRide(trip, passenger, onAccept, onReject) {
    const modal = document.createElement('div');
    modal.className = 'incoming-ride-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(10, 15, 24, 0.92); backdrop-filter: blur(24px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    const fareNum = typeof trip?.fare === 'number' ? trip.fare : parseFloat(trip?.fare || trip?.fareEUR || 4.50) || 4.50;
    const distNum = trip?.distance || 4.5;
    const durNum = trip?.duration || 12;
    const pickupAddr = trip?.pickup?.address || 'Basílica de Chiquinquirá, Maracaibo';
    const destAddr = trip?.destination?.address || 'Vereda del Lago, Maracaibo';
    const passName = passenger?.name || 'Jordan Pérez';
    const passRating = passenger?.rating || 4.9;
    const passAvatar = passenger?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(passName)}`;
    
    // Play sound using Web Audio API
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const playBeep = (freq, time) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + time);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + time);
            gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + time + 0.3);
            osc.stop(audioCtx.currentTime + time + 0.3);
        };
        playBeep(440, 0);
        playBeep(554, 0.2);
        playBeep(659, 0.4);
    } catch(e) {
        console.log('Audio not supported', e);
    }

    modal.innerHTML = `
        <div class="diorama-card-3d glass-panel" style="
            width: 100%; max-width: 440px; padding: 24px 20px; border-radius: 28px;
            background: var(--surface-card); border: 2.5px solid var(--accent-primary);
            box-shadow: 0 30px 70px rgba(0,0,0,0.8), 0 0 35px rgba(255,193,7,0.35);
            text-align: center; animation: dioramaLand 0.35s ease-out;
        ">
            <!-- Header Ring & Countdown -->
            <div style="position: relative; width: 90px; height: 90px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <svg width="90" height="90" style="transform: rotate(-90deg);">
                    <circle cx="45" cy="45" r="38" stroke="rgba(255,255,255,0.1)" stroke-width="7" fill="none"></circle>
                    <circle id="ring-progress-svg" cx="45" cy="45" r="38" stroke="#FFC107" stroke-width="7" fill="none" stroke-linecap="round"
                            style="stroke-dasharray: 238; stroke-dashoffset: 0; transition: stroke-dashoffset 1s linear;"></circle>
                </svg>
                <div id="countdown-timer" style="position: absolute; font-size: 2.1rem; font-weight: 900; color: #FFC107; font-family: 'JetBrains Mono', monospace;">
                    15
                </div>
            </div>

            <div style="display:inline-block; background: rgba(255,193,7,0.15); color: var(--accent-primary); font-weight: 800; padding: 6px 16px; border-radius: 12px; font-size: 0.9rem; margin-bottom: 14px;">
                ⚡ ¡NUEVA SOLICITUD DE VIAJE EN MARACAIBO!
            </div>

            <!-- Fare & Distance Banner -->
            <div style="display:flex; justify-content:space-around; align-items:center; background: rgba(0,230,118,0.08); padding: 14px; border-radius: 18px; border: 1px solid rgba(0,230,118,0.3); margin-bottom: 18px;">
                <div>
                    <small style="color:var(--text-secondary); display:block; font-size:0.75rem;">GANANCIA TARIFA</small>
                    <div style="font-size: 1.8rem; font-weight: 900; color: var(--success); font-family: 'JetBrains Mono', monospace;">
                        $${fareNum.toFixed(2)} USD
                    </div>
                </div>
                <div style="width:1px; height:36px; background:var(--border-color);"></div>
                <div>
                    <small style="color:var(--text-secondary); display:block; font-size:0.75rem;">DISTANCIA / TIEMPO</small>
                    <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">
                        📍 ${distNum} km · ⏱️ ${durNum}m
                    </div>
                </div>
            </div>

            <!-- Route Details -->
            <div style="background: var(--surface-elevated); padding: 14px 16px; border-radius: 18px; border: 1px solid var(--border-color); text-align: left; margin-bottom: 18px; display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <span style="color: var(--accent-primary); font-size: 1.1rem;">🟢</span>
                    <div>
                        <small style="color:var(--text-muted); font-size:0.72rem; display:block;">PUNTO DE RECOGIDA</small>
                        <strong style="color:var(--text-primary); font-size:0.88rem; display:block;">${pickupAddr}</strong>
                    </div>
                </div>
                <div style="height:1px; background:var(--border-color);"></div>
                <div style="display:flex; align-items:center; gap: 10px;">
                    <span style="color: var(--danger); font-size: 1.1rem;">🚩</span>
                    <div>
                        <small style="color:var(--text-muted); font-size:0.72rem; display:block;">DESTINO FINAL</small>
                        <strong style="color:var(--text-primary); font-size:0.88rem; display:block;">${destAddr}</strong>
                    </div>
                </div>
            </div>

            <!-- Passenger Avatar & Name -->
            <div style="display:flex; align-items:center; justify-content:center; gap: 12px; margin-bottom: 20px; background: var(--surface-input); padding: 10px; border-radius: 16px;">
                <img src="${passAvatar}" style="width: 46px; height: 46px; border-radius: 50%; border: 2px solid var(--accent-primary); object-fit: cover; flex-shrink: 0;" />
                <div style="text-align:left;">
                    <strong style="display:block; color:var(--text-primary); font-size:0.95rem;">${passName}</strong>
                    <span style="color:var(--accent-primary); font-size:0.82rem; font-weight:700;">⭐ ${passRating} Pasajero VIP</span>
                </div>
            </div>

            <!-- Accept / Reject Buttons -->
            <div style="display:flex; flex-direction:column; gap: 10px;">
                <button id="btn-accept-ride" class="btn btn-3d primary-btn" style="
                    width: 100%; padding: 16px; font-weight: 900; font-size: 1.15rem; cursor: pointer;
                    background: linear-gradient(135deg, #00E676 0%, #00B0FF 100%); color: #121824;
                    border-radius: 16px; box-shadow: 0 6px 0 #0088b3, 0 10px 25px rgba(0,230,118,0.4);
                ">
                    ⚡ ACEPTAR VIAJE AHORA
                </button>
                <button id="btn-reject-ride" style="
                    background: none; border: none; color: var(--text-secondary);
                    font-size: 0.9rem; font-weight: 700; cursor: pointer; padding: 8px;
                ">
                    ✕ Rechazar Solicitud
                </button>
            </div>
        </div>
    `;

    const timerEl = modal.querySelector('#countdown-timer');
    const ringProgress = modal.querySelector('#ring-progress-svg');
    let timeLeft = 15;
    const circumference = 238;

    const timerId = setInterval(() => {
        timeLeft--;
        if (timerEl) timerEl.textContent = timeLeft;
        if (ringProgress) {
            const offset = circumference - (timeLeft / 15) * circumference;
            ringProgress.style.strokeDashoffset = offset;
        }

        if (timeLeft <= 0) {
            clearInterval(timerId);
            onReject();
        }
    }, 1000);

    modal.querySelector('#btn-accept-ride').addEventListener('click', () => {
        clearInterval(timerId);
        onAccept();
    });

    modal.querySelector('#btn-reject-ride').addEventListener('click', () => {
        clearInterval(timerId);
        onReject();
    });

    return modal;
}
