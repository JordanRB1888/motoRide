import { icon } from '../../utils/icons.js';
import { createStatusBadge } from '../../components/statusBadge.js';
import { createRatingStars } from '../../components/ratingStars.js';

export function renderFarePreview(fareData, onConfirm, onChangePayment, onCancelRoute, onScheduleRide, onRideTypeChange) {
  const methodLabels = {
    wallet: 'Billetera Express',
    pago_movil: 'Pago Móvil',
    zelle: 'Zelle',
    zinli: 'Zinli',
    efectivo: 'Efectivo'
  };
  const div = document.createElement('div');
  div.className = 'fare-preview fare-preview-premium fade-in';
  div.innerHTML = `
    <section class="fare-confirm-card">
      <header class="fare-confirm-header">
        <div><small>CONFIRMAR VIAJE</small><strong>Tu +58 Express</strong></div>
        <button type="button" class="fare-preview-collapse" aria-expanded="true" aria-label="Minimizar confirmación">${icon('chevronDown', 19)}</button>
      </header>
      <div class="fare-preview-body">
        <div class="fare-destination-row">
          <span class="fare-pin">${icon('mapPin', 19)}</span>
          <div><small>DESTINO SELECCIONADO</small><strong>${fareData.destination}</strong></div>
          <button type="button" class="btn-cancel-route-icon" aria-label="Cambiar destino">${icon('close', 16)}</button>
        </div>
        <div class="ride-type-selector">
          <button type="button" class="ride-type-option ${fareData.rideType === 'MOTO' ? 'active' : ''}" data-ride-type="MOTO">
            <span>🏍️</span><div><strong>Moto</strong><small>Rápida y económica</small></div>
          </button>
          <button type="button" class="ride-type-option ${fareData.rideType === 'CAR' ? 'active' : ''}" data-ride-type="CAR">
            <span>🚘</span><div><strong>Automóvil</strong><small>Más comodidad</small></div>
          </button>
        </div>
        <div class="fare-summary-grid">
          <div class="fare-total"><small>Tarifa estimada</small><strong>$${fareData.fareUSD}</strong><span>USD · ~ Bs. ${fareData.fareVES}</span></div>
          <div class="fare-metric"><small>Distancia</small><strong>${fareData.distance}</strong></div>
          <div class="fare-metric"><small>Tiempo</small><strong>${fareData.duration}</strong></div>
        </div>
        <button type="button" id="payment-selector-btn" class="fare-payment-selector">
          <span class="payment-leading">${icon('banknote', 19)}</span>
          <span><small>Método de pago</small><strong>${methodLabels[fareData.paymentMethod] || 'Efectivo'}</strong></span>
          ${icon('chevronDown', 18)}
        </button>
        <button type="button" class="confirm-ride-btn">${icon('navigation', 19)} Solicitar viaje ahora</button>
        <div class="fare-secondary-actions">
          <button type="button" class="schedule-ride-btn">${icon('calendar', 16)} Programar</button>
          <button type="button" class="btn-cancel-route-full">Cancelar viaje</button>
        </div>
      </div>
    </section>`;

  const body = div.querySelector('.fare-preview-body');
  const collapseButton = div.querySelector('.fare-preview-collapse');
  collapseButton.addEventListener('click', () => {
    const collapsed = div.classList.toggle('is-collapsed');
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.innerHTML = icon(collapsed ? 'chevronUp' : 'chevronDown', 19);
  });
  div.querySelector('.confirm-ride-btn').addEventListener('click', onConfirm);
  div.querySelectorAll('.ride-type-option').forEach(button => button.addEventListener('click', () => onRideTypeChange?.(button.dataset.rideType)));
  div.querySelector('#payment-selector-btn').addEventListener('click', onChangePayment);
  div.querySelector('.schedule-ride-btn').addEventListener('click', () => onScheduleRide?.());
  div.querySelector('.btn-cancel-route-icon').addEventListener('click', () => onCancelRoute?.());
  div.querySelector('.btn-cancel-route-full').addEventListener('click', () => onCancelRoute?.());
  return div;
}

function renderFarePreviewLegacy(fareData, onConfirm, onChangePayment, onCancelRoute, onScheduleRide, onRideTypeChange) {
  const div = document.createElement('div');
  div.className = 'fare-preview fade-in';
  div.style.cssText = 'padding: 8px 10px 32px; max-width: 440px; margin: 0 auto;';
  
  div.innerHTML = `
    <div class="diorama-card-3d" style="padding: 18px 16px 28px; border-radius: 24px; background: var(--surface-card); border: 1.5px solid var(--border-gold);">
      
      <!-- Route Title Header with Cancel Button -->
      <div style="display:flex; align-items:center; justify-content:space-between; gap: 12px; margin-bottom: 16px; background: var(--surface-elevated); padding: 12px 16px; border-radius: 16px; border: 1px solid var(--border-color);">
        <div style="display:flex; align-items:center; gap:10px; flex:1; overflow:hidden;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(0,230,118,0.15); display: flex; align-items: center; justify-content: center; color: var(--success); flex-shrink:0;">
            ${icon('mapPin', 20)}
          </div>
          <div style="flex:1; overflow:hidden;">
            <small style="color:var(--text-secondary); display:block; font-size:0.75rem;">DESTINO SELECCIONADO</small>
            <strong style="color:var(--text-primary); font-size:0.95rem; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${fareData.destination}
            </strong>
          </div>
        </div>

        <button class="btn-cancel-route-icon" title="Cambiar Destino" style="
          background: rgba(255,77,77,0.15); border: 1px solid var(--danger); color: var(--danger);
          padding: 6px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 800; cursor: pointer; flex-shrink:0; display:flex; align-items:center; gap:4px;
        ">
          ${icon('close', 14)} Cancelar
        </button>
      </div>
      
      <div class="ride-type-selector" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
        <button type="button" class="ride-type-option" data-ride-type="MOTO" style="padding:13px 10px; border-radius:16px; border:1.5px solid ${fareData.rideType === 'MOTO' ? 'var(--accent-primary)' : 'var(--border-color)'}; background:${fareData.rideType === 'MOTO' ? 'rgba(255,193,7,.16)' : 'var(--surface-elevated)'}; color:var(--text-primary); font-weight:850; cursor:pointer;">🏍️ Moto<br><small style="color:var(--text-secondary);">Rápida y económica</small></button>
        <button type="button" class="ride-type-option" data-ride-type="CAR" style="padding:13px 10px; border-radius:16px; border:1.5px solid ${fareData.rideType === 'CAR' ? 'var(--accent-primary)' : 'var(--border-color)'}; background:${fareData.rideType === 'CAR' ? 'rgba(255,193,7,.16)' : 'var(--surface-elevated)'}; color:var(--text-primary); font-weight:850; cursor:pointer;">🚘 Automóvil<br><small style="color:var(--text-secondary);">Más comodidad</small></button>
      </div>

      <!-- Fare and Distance Stats -->
      <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(255, 193, 7, 0.06); padding: 16px; border-radius: 20px; border: 1px solid rgba(255,193,7,0.25); margin-bottom: 16px;">
        <div>
          <span style="color:var(--text-secondary); font-size:0.8rem; display:block;">TARIFA ESTIMADA</span>
          <div style="font-size: 2.2rem; font-weight: 900; color: var(--accent-primary); font-family: 'JetBrains Mono', monospace; line-height: 1;">
            $${fareData.fareUSD} <span style="font-size: 0.9rem; font-weight: 700;">USD</span>
          </div>
          <div style="color: var(--text-secondary); font-size: 0.82rem; font-weight: 600; margin-top: 4px;">
            ~ Bs. ${fareData.fareVES} (Tasa BCV)
          </div>
        </div>

        <div style="text-align: right;">
          <div style="background: var(--surface-card); padding: 6px 12px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 6px;">
            <small style="color:var(--text-secondary);">Distancia</small>
            <div style="font-weight: 800; color: var(--text-primary); font-size: 0.95rem; display:flex; align-items:center; justify-content:flex-end; gap:4px;">
              ${icon('mapPin', 14)} ${fareData.distance}
            </div>
          </div>
          <div style="background: var(--surface-card); padding: 6px 12px; border-radius: 12px; border: 1px solid var(--border-color);">
            <small style="color:var(--text-secondary);">Tiempo Est.</small>
            <div style="font-weight: 800; color: var(--accent-secondary); font-size: 0.95rem; display:flex; align-items:center; justify-content:flex-end; gap:4px;">
              ${icon('clock', 14)} ${fareData.duration}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Payment Selector Button -->
      <div id="payment-selector-btn" style="
        display: flex; justify-content: space-between; align-items: center;
        padding: 14px 18px; background: var(--surface-elevated); border-radius: 16px;
        border: 1px solid var(--border-color); cursor: pointer; margin-bottom: 16px;
        transition: all 0.2s ease;
      ">
        <div style="display:flex; align-items:center; gap: 12px;">
          <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(0,210,255,0.15); color: var(--accent-secondary); display: flex; align-items: center; justify-content: center;">
            ${icon('creditCard', 20)}
          </div>
          <div>
            <strong style="display:block; color:var(--text-primary); font-size: 0.9rem;">Método de Pago</strong>
            <span style="color:var(--accent-primary); font-size:0.82rem; font-weight:700;">Pago Móvil / Efectivo USD / Wallet</span>
          </div>
        </div>
        <span style="color:var(--text-secondary); display:flex;">${icon('chevronRight', 20)}</span>
      </div>
      
      <!-- Confirm Ride Button -->
      <button class="btn btn-3d primary-btn confirm-ride-btn" style="
        width: 100%; padding: 16px; font-size: 1.05rem; font-weight: 900;
        background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%); color: #121824;
        border-radius: 18px; letter-spacing: 0.5px; margin-bottom: 10px; display:flex; align-items:center; justify-content:center; gap:8px;
      ">
        ${icon('navigation', 20)} SOLICITAR +58EXPRESS AHORA
      </button>

      <!-- Schedule Future Ride Button -->
      <button class="btn schedule-ride-btn" style="
        width: 100%; padding: 14px; font-size: 0.95rem; font-weight: 800;
        background: rgba(0, 210, 255, 0.12); color: var(--accent-secondary);
        border: 1.5px solid var(--accent-secondary); border-radius: 16px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px;
      ">
        ${icon('calendar', 18)} Programar / Reservar para Más Tarde
      </button>

      <!-- Cancel and Choose New Route Button -->
      <button class="btn btn-cancel-route-full" style="
        width: 100%; padding: 12px; font-size: 0.9rem; font-weight: 800;
        background: rgba(255, 77, 77, 0.12); color: var(--danger);
        border: 1.5px solid var(--danger); border-radius: 16px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      ">
        ${icon('close', 16)} Cancelar Ruta y Elegir Otro Destino
      </button>
    </div>
  `;

  div.querySelector('.confirm-ride-btn').addEventListener('click', onConfirm);
  div.querySelectorAll('.ride-type-option').forEach(button => button.addEventListener('click', () => onRideTypeChange?.(button.dataset.rideType)));
  div.querySelector('#payment-selector-btn').addEventListener('click', onChangePayment);

  const schBtn = div.querySelector('.schedule-ride-btn');
  if (schBtn && onScheduleRide) {
    schBtn.addEventListener('click', onScheduleRide);
  }

  const triggerCancel = () => {
    if (onCancelRoute) onCancelRoute();
  };

  div.querySelector('.btn-cancel-route-icon').addEventListener('click', triggerCancel);
  div.querySelector('.btn-cancel-route-full').addEventListener('click', triggerCancel);

  return div;
}

export function renderSearchingState(onCancel, rideType = 'MOTO') {
  const div = document.createElement('div');
  div.className = 'searching-animation fade-in';
  div.style.cssText = 'padding: 16px 12px 32px; text-align: center; max-width: 440px; margin: 0 auto;';
  
  div.innerHTML = `
    <div class="diorama-card-3d" style="padding: 28px 20px 28px; border-radius: 24px; background: var(--surface-card); border: 1.5px solid var(--border-gold);">
      <div class="ripple-container" style="position:relative; width: 120px; height: 120px; margin: 0 auto 20px; display:flex; align-items:center; justify-content:center;">
        <div class="ripple"></div>
        <div class="ripple delay-1"></div>
        <div class="ripple delay-2"></div>
        <div style="color: var(--accent-primary); position:relative; z-index:2; animation: bounce 1s infinite alternate;">
          ${icon(rideType === 'CAR' ? 'car' : 'bike', 48)}
        </div>
      </div>
      
      <h3 style="color: var(--text-primary); font-size: 1.3rem; font-weight: 800; margin-bottom: 6px;">Buscando ${rideType === 'CAR' ? 'automóvil' : 'moto'} en Maracaibo...</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 24px;">Conectando con conductores cercanos en tiempo real</p>
      
      <button class="btn btn-danger btn-outline cancel-btn" style="
        width: 100%; padding: 14px; border-radius: 14px; font-weight: 800; font-size:0.95rem;
        border: 1.5px solid var(--danger); color: var(--danger); background: rgba(255,77,77,0.15); cursor:pointer;
        display:flex; align-items:center; justify-content:center; gap:8px;
      ">
        ${icon('close', 18)} Cancelar Solicitud y Cambiar Ruta
      </button>
    </div>
  `;

  div.querySelector('.cancel-btn').addEventListener('click', onCancel);

  return div;
}

export function renderDriverCard(driver, trip, onCall, onChat, onCancelTrip) {
  const div = document.createElement('div');
  div.className = 'driver-card fade-in';
  div.style.cssText = 'padding: 16px; max-width: 440px; margin: 0 auto;';
  
  div.innerHTML = `
    <div class="diorama-card-3d" style="padding: 20px; border-radius: 24px; background: var(--surface-card); border: 2px solid var(--accent-secondary);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
        <div style="display:flex; align-items:center; gap: 12px;">
          <img src="${driver.photoUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (driver.firstName || 'Driver')}" 
               style="width: 56px; height: 56px; border-radius: 50%; border: 3px solid var(--accent-secondary); box-shadow: 0 0 15px rgba(0,210,255,0.4);">
          <div>
            <h4 style="color: var(--text-primary); font-size: 1.1rem; font-weight: 800; margin: 0;">${driver.firstName} ${driver.lastName || ''}</h4>
            <div style="color: var(--accent-primary); font-size: 0.85rem; font-weight: 700; margin-top: 2px; display:flex; align-items:center; gap:4px;">
              ${icon('star', 14, 'fill-star')} ${driver.rating || 4.9} (${driver.totalTrips || 120} viajes)
            </div>
          </div>
        </div>
        <div style="background: rgba(0,230,118,0.15); border: 1px solid var(--success); color: var(--success); padding: 8px 14px; border-radius: 16px; font-weight: 800; font-size: 0.85rem; display:flex; align-items:center; gap:6px;">
          ${icon('clock', 14)} En Camino
        </div>
      </div>
      
      <!-- Vehicle Pill -->
      <div style="display:flex; justify-content:space-between; align-items:center; background: var(--surface-elevated); padding: 12px 16px; border-radius: 16px; border: 1px solid var(--border-color); margin-bottom: 16px;">
        <div>
          <small style="color:var(--text-secondary); display:block;">Vehículo</small>
          <strong style="color:var(--text-primary); font-size:0.95rem;">${driver.vehicleBrand || 'Bera'} ${driver.vehicleModel || 'SBR'} (${driver.vehicleColor || 'Negro'})</strong>
        </div>
        <div style="background: var(--accent-primary); color: #121824; font-weight: 900; padding: 6px 12px; border-radius: 10px; font-family: 'JetBrains Mono', monospace; font-size: 0.9rem;">
          ${driver.vehiclePlate || 'AC3M49P'}
        </div>
      </div>
      
      <!-- Actions Call & Chat -->
      <div style="display:flex; gap: 12px; margin-bottom: 12px;">
        <button class="btn call-btn" style="flex:1; padding: 12px; border-radius: 14px; background: rgba(0,210,255,0.15); border: 1px solid var(--accent-secondary); color: var(--accent-secondary); font-weight: 800; display:flex; align-items:center; justify-content:center; gap:8px;">
          ${icon('phone', 18)} Llamar
        </button>
        <button class="btn chat-btn" style="flex:1; padding: 12px; border-radius: 14px; background: rgba(255,193,7,0.15); border: 1px solid var(--accent-primary); color: var(--accent-primary); font-weight: 800; display:flex; align-items:center; justify-content:center; gap:8px;">
          ${icon('message', 18)} Chat Interno
        </button>
      </div>

      <!-- Cancel Order Button (Before driver accepts/starts trip) -->
      <button class="btn cancel-driver-trip-btn" style="
        width: 100%; padding: 12px; border-radius: 14px; background: rgba(255,77,77,0.1); border: 1.5px solid var(--danger);
        color: var(--danger); font-weight: 800; font-size: 0.88rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      ">
        ${icon('close', 16)} Cancelar Orden y Elegir Otra Ruta
      </button>
    </div>
  `;

  div.querySelector('.call-btn').addEventListener('click', onCall);
  div.querySelector('.chat-btn').addEventListener('click', onChat);
  
  const cancelBtn = div.querySelector('.cancel-driver-trip-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (onCancelTrip) onCancelTrip();
    });
  }

  return div;
}
