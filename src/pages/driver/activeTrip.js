import { createSlideButton } from '../../components/slideButton.js';
import { icon } from '../../utils/icons.js';

const money = value => Number(value || 0).toFixed(2);
const fareOf = trip => trip?.pricing?.fareUSD ?? trip?.fareUSD ?? trip?.fareEUR ?? trip?.fare ?? 0;
const paymentLabel = method => ({ cash_usd: 'Efectivo USD', cash_ves: 'Efectivo Bs.', pago_movil: 'Pago Móvil', wallet: 'Wallet' }[method] || 'Efectivo USD');

function tripFacts(trip, passenger = null, showPassenger = true) {
    const distance = Number(trip?.distanceKm ?? trip?.distance ?? 0);
    const duration = Number(trip?.durationMin ?? trip?.duration ?? 0);
    return `
        ${showPassenger ? `<div style="display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:12px;border-radius:16px;background:rgba(0,210,255,.08);border:1px solid rgba(0,210,255,.25)"><img src="${passenger?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(passenger?.name || 'Pasajero')}`}" alt="Pasajero" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--accent-secondary)"><div style="min-width:0;flex:1"><small style="color:var(--text-muted);display:block">PASAJERO</small><strong style="display:block;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${passenger?.name || trip?.passengerName || 'Pasajero'}</strong><span style="color:var(--accent-primary);font-size:.8rem">★ ${passenger?.rating || 5}</span></div></div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><div style="padding:11px;border-radius:14px;background:var(--surface-elevated);border:1px solid var(--border-color)"><small style="color:var(--text-muted);display:block">TARIFA</small><strong style="color:var(--success);font-size:1.15rem">$${money(fareOf(trip))}</strong></div><div style="padding:11px;border-radius:14px;background:var(--surface-elevated);border:1px solid var(--border-color)"><small style="color:var(--text-muted);display:block">PAGO</small><strong style="color:var(--text-primary);font-size:.9rem">${paymentLabel(trip?.paymentMethod)}</strong></div><div style="padding:11px;border-radius:14px;background:var(--surface-elevated);border:1px solid var(--border-color)"><small style="color:var(--text-muted);display:block">DISTANCIA</small><strong style="color:var(--text-primary)">${distance.toFixed(1)} km</strong></div><div style="padding:11px;border-radius:14px;background:var(--surface-elevated);border:1px solid var(--border-color)"><small style="color:var(--text-muted);display:block">TIEMPO</small><strong style="color:var(--text-primary)">${Math.round(duration)} min</strong></div></div>
        <div style="padding:12px;border-radius:14px;background:var(--surface-elevated);border:1px solid var(--border-color);margin-bottom:8px"><small style="color:var(--text-muted);display:block">● RECOGIDA</small><strong style="color:var(--text-primary);font-size:.88rem">${trip?.pickup?.address || 'Ubicación del pasajero'}</strong></div>
        <div style="padding:12px;border-radius:14px;background:var(--surface-elevated);border:1px solid var(--border-color);margin-bottom:14px"><small style="color:var(--text-muted);display:block">🏁 DESTINO</small><strong style="color:var(--text-primary);font-size:.88rem">${trip?.destination?.address || 'Destino del viaje'}</strong></div>`;
}

function primaryAction(label, onClick, color = '#00E676') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = `width:100%;padding:16px;border:0;border-radius:16px;background:${color};color:#101722;font-size:1rem;font-weight:950;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35)`;
    button.addEventListener('click', onClick);
    return button;
}

export function renderEnRouteToPickup(trip, onArrived, onChat, onCall, passenger = null) {
    const container = document.createElement('div');
    container.className = 'active-trip-panel slide-up-animation';
    container.style.cssText = 'padding: 16px; max-width: 440px; margin: 0 auto;';
    
    container.innerHTML = `
        <div class="diorama-card-3d" style="padding: 20px; border-radius: 24px; background: var(--surface-card); border: 2px solid var(--accent-secondary);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px;">
                <h4 style="color:var(--text-primary); font-size:1.05rem; font-weight:800; margin:0;">En camino a buscar al cliente</h4>
                <span class="badge badge-info" style="font-size:0.8rem; font-weight:800;">⏱️ 3 min</span>
            </div>

            ${tripFacts(trip, passenger)}

            <div style="background: var(--surface-elevated); padding: 14px 16px; border-radius: 16px; border: 1px solid var(--border-color); margin-bottom: 14px; display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap: 12px;">
                    <span style="font-size: 1.4rem;">📍</span>
                    <div>
                        <small style="color:var(--text-muted); font-size:0.75rem; display:block;">PUNTO DE RECOGIDA EN MARACAIBO</small>
                        <strong style="color:var(--text-primary); font-size:0.95rem;">${trip.pickup?.address || 'Basílica de Chiquinquirá'}</strong>
                    </div>
                </div>
            </div>

            <!-- In-Trip Driver Communication Buttons -->
            <div style="display:flex; gap: 10px; margin-bottom: 16px;">
                <button class="btn btn-driver-chat" style="
                    flex:1; padding: 12px; border-radius: 14px; background: rgba(255,193,7,0.15);
                    border: 1.5px solid var(--accent-primary); color: var(--accent-primary); font-weight: 800;
                    display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
                ">
                    💬 Chat con Pasajero
                </button>
                <button class="btn btn-driver-call" style="
                    flex:1; padding: 12px; border-radius: 14px; background: rgba(0,210,255,0.15);
                    border: 1.5px solid var(--accent-secondary); color: var(--accent-secondary); font-weight: 800;
                    display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
                ">
                    📞 Llamar Pasajero
                </button>
            </div>

            <div class="slide-action-container" id="slide-arrive" style="margin-top: 10px;"></div>
        </div>
    `;
    
    const chatBtn = container.querySelector('.btn-driver-chat');
    if (chatBtn && onChat) chatBtn.addEventListener('click', onChat);

    const callBtn = container.querySelector('.btn-driver-call');
    if (callBtn && onCall) callBtn.addEventListener('click', onCall);

    container.querySelector('#slide-arrive').appendChild(primaryAction('CONFIRMAR: LLEGUÉ A RECOGER AL CLIENTE', onArrived));
    return container;
}

export function renderWaitingPassenger(trip, passenger, onStart, onChat, onCall) {
    const container = document.createElement('div');
    container.className = 'active-trip-panel slide-up-animation';
    container.style.cssText = 'padding: 16px; max-width: 440px; margin: 0 auto;';
    
    container.innerHTML = `
        <div class="diorama-card-3d" style="padding: 20px; border-radius: 24px; background: var(--surface-card); border: 2px solid var(--accent-primary);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px;">
                <h4 style="color:var(--text-primary); font-size:1.05rem; font-weight:800; margin:0;">Esperando al pasajero</h4>
                <span class="badge badge-warning" id="waiting-timer" style="font-size:0.85rem; font-weight:800; font-family:'JetBrains Mono', monospace;">00:00</span>
            </div>

            ${tripFacts(trip, passenger)}

            <div style="display:flex; justify-content:space-between; align-items:center; background: var(--surface-elevated); padding: 14px 16px; border-radius: 16px; border: 1px solid var(--border-color); margin-bottom: 18px;">
                <div style="display:flex; align-items:center; gap: 12px;">
                    <img src="${passenger.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + passenger.name}" style="width: 46px; height: 46px; border-radius: 50%; border: 2px solid var(--accent-primary);" />
                    <div>
                        <strong style="display:block; color:var(--text-primary); font-size:0.95rem;">${passenger.name}</strong>
                        <span style="color:var(--accent-primary); font-size:0.82rem; font-weight:700;">⭐ ${passenger.rating || 4.9} Pasajero VIP</span>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-driver-chat" style="width:40px; height:40px; border-radius:50%; background:rgba(0,210,255,0.15); color:var(--accent-secondary); border:1px solid var(--accent-secondary); font-size:1.1rem; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Abrir Chat">💬</button>
                    <button class="btn btn-driver-call" style="width:40px; height:40px; border-radius:50%; background:rgba(0,230,118,0.15); color:var(--success); border:1px solid var(--success); font-size:1.1rem; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Llamar Cliente">📞</button>
                </div>
            </div>

            <div class="slide-action-container" id="slide-start"></div>
        </div>
    `;
    
    let seconds = 0;
    const timerEl = container.querySelector('#waiting-timer');
    setInterval(() => {
        seconds++;
        const m = String(Math.floor(seconds/60)).padStart(2, '0');
        const s = String(seconds%60).padStart(2, '0');
        if(timerEl) timerEl.textContent = `${m}:${s}`;
    }, 1000);

    const chatBtn = container.querySelector('.btn-driver-chat');
    if (chatBtn && onChat) chatBtn.addEventListener('click', onChat);

    const callBtn = container.querySelector('.btn-driver-call');
    if (callBtn && onCall) callBtn.addEventListener('click', onCall);

    container.querySelector('#slide-start').appendChild(primaryAction('CLIENTE A BORDO · INICIAR VIAJE', onStart, '#FFC107'));
    return container;
}

export function renderInTrip(trip, onComplete, onChat, onCall, passenger = null) {
    const container = document.createElement('div');
    container.className = 'active-trip-panel slide-up-animation';
    container.style.cssText = 'padding: 16px; max-width: 440px; margin: 0 auto;';
    
    container.innerHTML = `
        <div class="diorama-card-3d" style="padding: 20px; border-radius: 24px; background: var(--surface-card); border: 2px solid var(--success);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <h4 style="color:var(--text-primary); font-size:1.05rem; font-weight:800; margin:0;">En ruta hacia el destino</h4>
                <span class="badge badge-success" style="font-size:0.8rem; font-weight:800;">🟢 EN VIAJE</span>
            </div>

            ${tripFacts(trip, passenger)}

            <div style="width: 100%; height: 8px; background: var(--surface-elevated); border-radius: 10px; overflow: hidden; margin-bottom: 16px;">
                <div style="width: 65%; height: 100%; background: linear-gradient(90deg, #00E676 0%, #00D2FF 100%); border-radius: 10px;"></div>
            </div>

            <div style="background: var(--surface-elevated); padding: 14px 16px; border-radius: 16px; border: 1px solid var(--border-color); margin-bottom: 14px; display:flex; align-items:center; gap: 12px;">
                <span style="font-size: 1.4rem;">🚩</span>
                <div>
                    <small style="color:var(--text-muted); font-size:0.75rem; display:block;">DESTINO EN MARACAIBO</small>
                    <strong style="color:var(--text-primary); font-size:0.95rem;">${trip.destination?.address || 'Sambil Maracaibo'}</strong>
                </div>
            </div>

            <!-- In-Trip Communication Buttons -->
            <div style="display:flex; gap: 10px; margin-bottom: 16px;">
                <button class="btn btn-driver-chat" style="
                    flex:1; padding: 10px; border-radius: 14px; background: rgba(255,193,7,0.15);
                    border: 1.5px solid var(--accent-primary); color: var(--accent-primary); font-weight: 800;
                    display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; font-size:0.88rem;
                ">
                    💬 Chat con Pasajero
                </button>
                <button class="btn btn-driver-call" style="
                    flex:1; padding: 10px; border-radius: 14px; background: rgba(0,210,255,0.15);
                    border: 1.5px solid var(--accent-secondary); color: var(--accent-secondary); font-weight: 800;
                    display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; font-size:0.88rem;
                ">
                    📞 Llamar
                </button>
            </div>

            <div class="slide-action-container" id="slide-complete"></div>
        </div>
    `;

    const chatBtn = container.querySelector('.btn-driver-chat');
    if (chatBtn && onChat) chatBtn.addEventListener('click', onChat);

    const callBtn = container.querySelector('.btn-driver-call');
    if (callBtn && onCall) callBtn.addEventListener('click', onCall);

    container.querySelector('#slide-complete').appendChild(primaryAction('CONFIRMAR ENTREGA · VIAJE COMPLETADO', onComplete));
    return container;
}

export function renderTripSummary(trip, earnings) {
    const container = document.createElement('div');
    container.className = 'trip-summary-card slide-up-animation';
    container.style.cssText = 'padding: 16px; max-width: 440px; margin: 0 auto;';
    
    const net = (earnings.fare - earnings.commission).toFixed(2);
    
    container.innerHTML = `
        <div class="diorama-card-3d glass-panel" style="padding: 24px; border-radius: 28px; background: var(--surface-card); border: 2px solid var(--border-gold); text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 8px;">🏁</div>
            <h3 style="color: var(--text-primary); font-size: 1.4rem; font-weight: 900; margin-bottom: 16px;">¡Viaje Completado con Éxito!</h3>
            
            <div style="background: rgba(255,193,7,0.06); padding: 18px; border-radius: 20px; border: 1px solid var(--border-gold); margin-bottom: 20px; text-align: left;">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px; color: var(--text-secondary); font-size: 0.9rem;">
                    <span>Tarifa del Viaje</span>
                    <strong style="color:var(--text-primary);">$${earnings.fare.toFixed(2)} USD</strong>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom: 12px; color: var(--danger); font-size: 0.9rem;">
                    <span>Comisión App (15%)</span>
                    <strong>-$${earnings.commission.toFixed(2)} USD</strong>
                </div>
                <div style="height: 1px; background: var(--border-color); margin-bottom: 12px;"></div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight: 800; color: var(--text-primary); font-size: 1rem;">GANANCIA NETA</span>
                    <span style="font-weight: 900; color: var(--success); font-size: 1.8rem; font-family: 'JetBrains Mono', monospace;">
                        $${net} USD
                    </span>
                </div>
            </div>
            
            <button class="btn btn-3d primary-btn btn-continue" style="
                width: 100%; padding: 16px; font-weight: 900; font-size: 1.1rem;
                background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%); color: #121824;
            ">
                ⚡ DISPONIBLE PARA SIGUIENTE VIAJE
            </button>
        </div>
    `;
    
    return container;
}
