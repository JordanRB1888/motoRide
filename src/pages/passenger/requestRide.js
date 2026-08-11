import { icon } from '../../utils/icons.js';
import { createStatusBadge } from '../../components/statusBadge.js';
import { createRatingStars } from '../../components/ratingStars.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';

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
            <span class="ride-type-vehicle">${vehicleImage('MOTO', { decorative: true })}</span><div><strong>Moto</strong><small>Rápida y económica</small></div>
          </button>
          <button type="button" class="ride-type-option ${fareData.rideType === 'CAR' ? 'active' : ''}" data-ride-type="CAR">
            <span class="ride-type-vehicle">${vehicleImage('CAR', { decorative: true })}</span><div><strong>Automóvil</strong><small>Más comodidad</small></div>
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
        <button type="button" class="ride-type-option" data-ride-type="MOTO" style="padding:13px 10px; border-radius:16px; border:1.5px solid ${fareData.rideType === 'MOTO' ? 'var(--accent-primary)' : 'var(--border-color)'}; background:${fareData.rideType === 'MOTO' ? 'rgba(255,193,7,.16)' : 'var(--surface-elevated)'}; color:var(--text-primary); font-weight:850; cursor:pointer;"><span class="ride-type-vehicle">${vehicleImage('MOTO', { decorative: true })}</span>Moto<br><small style="color:var(--text-secondary);">Rápida y económica</small></button>
        <button type="button" class="ride-type-option" data-ride-type="CAR" style="padding:13px 10px; border-radius:16px; border:1.5px solid ${fareData.rideType === 'CAR' ? 'var(--accent-primary)' : 'var(--border-color)'}; background:${fareData.rideType === 'CAR' ? 'rgba(255,193,7,.16)' : 'var(--surface-elevated)'}; color:var(--text-primary); font-weight:850; cursor:pointer;"><span class="ride-type-vehicle">${vehicleImage('CAR', { decorative: true })}</span>Automóvil<br><small style="color:var(--text-secondary);">Más comodidad</small></button>
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
  const isCar = rideType === 'CAR';
  div.className = 'searching-animation searching-ride-card fade-in';
  
  div.innerHTML = `
    <section class="searching-ride-shell" aria-live="polite">
      <div class="searching-ride-main">
        <div class="searching-radar" aria-hidden="true">
          <span class="searching-radar-ring ring-one"></span>
          <span class="searching-radar-ring ring-two"></span>
          <span class="searching-radar-sweep"></span>
          <div class="searching-vehicle-art ${isCar ? 'is-car' : 'is-moto'}">
            ${vehicleImage(isCar ? 'CAR' : 'MOTO', { className: 'searching-real-vehicle', decorative: true })}
          </div>
        </div>
        <div class="searching-ride-copy">
          <span class="searching-live-label"><i></i> BÚSQUEDA EN TIEMPO REAL</span>
          <h3>Buscando conductor</h3>
          <p>Contactando ${isCar ? 'automóviles' : 'mototaxistas'} cercanos</p>
          <div class="searching-ride-meta">
            <span>${icon(isCar ? 'car' : 'bike', 18)} <b>${isCar ? 'Automóvil' : 'Moto'}</b></span>
            <span>${icon('clock', 18)} <small>Tiempo estimado</small><b>2–5 min</b></span>
          </div>
        </div>
      </div>
      <button type="button" class="searching-minimize-btn" aria-label="Minimizar búsqueda">
        ${icon('chevronDown', 18)} Minimizar
      </button>
      <button type="button" class="searching-cancel-btn cancel-btn">
        ${icon('close', 18)} Cancelar solicitud
      </button>
    </section>
  `;

  div.querySelector('.cancel-btn').addEventListener('click', onCancel);
  div.querySelector('.searching-minimize-btn').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('58express:minimize-passenger-trip'));
  });

  return div;
}

export function renderDriverCard(driver, trip, onCall, onChat, onCancelTrip, onMinimize) {
  const div = document.createElement('div');
  div.className = 'driver-card assigned-driver-card fade-in';
  const driverName = `${driver.firstName || 'Conductor'} ${driver.lastName || ''}`.trim();
  const driverInitials = driverName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const fallbackAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(driverName)}`;
  const driverAvatar = driver.photoUrl || fallbackAvatar;
  const etaMinutes = Math.max(1, Math.round(Number(trip?.pickupEtaMin ?? trip?.etaMin ?? 3)));
  const driverArrived = trip?.status === 'ARRIVED';
  
  div.innerHTML = `
    <section class="assigned-driver-shell">
      <header class="assigned-driver-header passenger-trip-card-header">
        <div class="assigned-driver-identity">
          <div class="assigned-driver-avatar">
            <span>${driverInitials}</span>
            <img src="${driverAvatar}" alt="Foto de ${driverName}">
            <i aria-label="Conductor conectado"></i>
          </div>
          <div class="assigned-driver-name">
            <small>TU CONDUCTOR</small>
            <h4>${driverName}</h4>
            <div>${icon('starFilled', 14)} <strong>${driver.rating || 4.9}</strong> <span>(${driver.totalTrips || 120} viajes)</span></div>
          </div>
        </div>
        <div class="passenger-trip-card-actions">
          <button class="trip-card-minimize-btn" type="button" aria-label="Minimizar información del viaje">${icon('chevronDown', 18)}</button>
        </div>
      </header>

      <div class="assigned-vehicle-row">
        <div>
          <small>Vehículo</small>
          <strong>${driver.vehicleBrand || 'Bera'} ${driver.vehicleModel || 'SBR'} <span>· ${driver.vehicleColor || 'Negro'}</span></strong>
        </div>
        <b>${driver.vehiclePlate || 'AC3M49P'}</b>
      </div>

      <div class="assigned-driver-status ${driverArrived ? 'has-arrived' : ''}">
        <span><i></i> ${driverArrived ? 'Conductor en el punto' : 'Conductor en camino'}</span>
        <strong>${driverArrived ? 'Llegó' : `${etaMinutes} min`}</strong>
      </div>

      <div class="assigned-driver-actions">
        <button type="button" class="call-btn">
          ${icon('phone', 19)} Llamar
        </button>
        <button type="button" class="chat-btn">
          ${icon('message', 19)} Chat interno
        </button>
      </div>

      <button type="button" class="cancel-driver-trip-btn">
        ${icon('close', 17)} Cancelar viaje
      </button>
    </section>
  `;

  const avatarImage = div.querySelector('.assigned-driver-avatar img');
  avatarImage.addEventListener('error', () => {
    if (avatarImage.src !== fallbackAvatar) {
      avatarImage.src = fallbackAvatar;
      return;
    }
    avatarImage.hidden = true;
  });

  div.querySelector('.call-btn').addEventListener('click', onCall);
  div.querySelector('.chat-btn').addEventListener('click', onChat);
  div.querySelector('.trip-card-minimize-btn').addEventListener('click', onMinimize);
  
  const cancelBtn = div.querySelector('.cancel-driver-trip-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (onCancelTrip) onCancelTrip();
    });
  }

  return div;
}
