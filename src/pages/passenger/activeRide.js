import { canonicalPhotoPath, neutralizePrivatePhoto } from '../../utils/privatePhoto.js';
import { icon } from '../../utils/icons.js';
import { createRatingStars } from '../../components/ratingStars.js';
import { showToast } from '../../components/toast.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';

export function renderActiveRide(trip, driver, onSOS, onChat, onMinimize) {
  const div = document.createElement('div');
  div.className = 'active-ride fade-in';
  div.style.cssText = 'padding: 16px; max-width: 440px; margin: 0 auto;';
  
  div.innerHTML = `
    <div class="diorama-card-3d" style="padding: 20px; border-radius: 24px; background: var(--surface-card); border: 2px solid var(--success);">
      
      <div class="passenger-trip-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px;">
        <span style="color:var(--success); font-weight:800; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
          🟢 VIAJE EN PROGRESO
        </span>
        <div class="passenger-trip-card-actions">
          <button class="trip-card-chat-btn" type="button">${icon('message', 16)} Chat</button>
          <button class="trip-card-minimize-btn" type="button" aria-label="Minimizar información del viaje">⌄</button>
        </div>
      </div>

      <!-- Animated Progress Bar -->
      <div style="width: 100%; height: 8px; background: var(--surface-elevated); border-radius: 10px; overflow: hidden; margin-bottom: 18px;">
        <div style="width: 65%; height: 100%; background: linear-gradient(90deg, #00E676 0%, #00D2FF 100%); border-radius: 10px; animation: pulse 2s infinite;"></div>
      </div>

      <!-- Driver info row -->
      <div style="display:flex; justify-content:space-between; align-items:center; background: var(--surface-elevated); padding: 14px 16px; border-radius: 18px; border: 1px solid var(--border-color); margin-bottom: 16px;">
        <div style="display:flex; align-items:center; gap: 12px;">
          <img src="${'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (driver?.firstName || 'Driver')}" data-private-photo="${canonicalPhotoPath(driver?.photoUrl) || ''}" 
               style="width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--accent-primary);">
          <div>
            <strong style="display:block; color:var(--text-primary); font-size:0.95rem;">${driver?.firstName || 'Conductores'} ${driver?.lastName || ''}</strong>
            <span class="active-driver-vehicle" style="color:var(--accent-primary); font-size:0.82rem; font-weight:700;">${vehicleImage(driver?.vehicleType || trip?.rideType || 'MOTO', { className: 'active-driver-vehicle-image', decorative: true })}${driver?.vehicleBrand || 'Bera'} · ${driver?.vehiclePlate || 'AC3M49P'}</span>
          </div>
        </div>

        <button class="btn sos-btn" style="
          padding: 10px 14px; border-radius: 14px; background: rgba(255,77,77,0.15);
          border: 1.5px solid var(--danger); color: var(--danger); font-weight: 800; font-size: 0.85rem;
          display:flex; align-items:center; gap:6px; cursor:pointer;
        ">
          🚨 SOS 911
        </button>
      </div>
    </div>
  `;

  div.querySelector('.sos-btn').addEventListener('click', onSOS);
  div.querySelector('.trip-card-chat-btn').addEventListener('click', onChat);
  div.querySelector('.trip-card-minimize-btn').addEventListener('click', onMinimize);

  return div;
}

export function renderTripComplete(trip, driver, onRate, onTip, onDone) {
  const container = document.createElement('div');
  container.className = 'trip-complete-overlay fade-in';
  container.style.cssText = `
    position: fixed; inset: 0; z-index: 3000;
    background: rgba(10, 15, 24, 0.88); backdrop-filter: blur(20px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
  `;

  let selectedTip = 0;

  container.innerHTML = `
    <div class="diorama-card-3d glass-panel" style="
      width: 100%; max-width: 440px; padding: 28px 24px; border-radius: 28px;
      background: var(--surface-card); border: 2px solid var(--border-gold); text-align: center;
      box-shadow: 0 30px 70px rgba(0,0,0,0.8), 0 0 35px rgba(255,193,7,0.3);
      animation: dioramaLand 0.4s ease-out;
    ">
      <div style="font-size: 3.5rem; margin-bottom: 10px;">🎉</div>
      <h2 style="color: var(--text-primary); font-size: 1.6rem; font-weight: 900; margin-bottom: 4px;">¡Viaje Completado!</h2>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 20px;">Gracias por viajar en Maracaibo con +58express</p>

      <!-- Amount Summary -->
      <div style="background: rgba(255,193,7,0.08); padding: 18px; border-radius: 20px; border: 1px solid var(--border-gold); margin-bottom: 24px;">
        <small style="color:var(--text-secondary); display:block; font-size:0.8rem;">MONTO TOTAL DEL VIAJE</small>
        <div style="font-size: 2.4rem; font-weight: 900; color: var(--accent-primary); font-family: 'JetBrains Mono', monospace;">
          $${(trip?.fareUSD || 4.50).toFixed(2)} <span style="font-size:1rem;">USD</span>
        </div>
      </div>

      <!-- Rating Section -->
      <div style="margin-bottom: 24px;">
        <img src="${neutralizePrivatePhoto(driver?.photoUrl) || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (driver?.firstName || 'Driver')}" 
             style="width: 70px; height: 70px; border-radius: 50%; border: 3px solid var(--accent-secondary); margin-bottom: 8px;">
        <h4 style="color: var(--text-primary); margin-bottom: 4px;">¿Cómo calificas a ${driver?.firstName || 'tu conductor'}?</h4>
        <div class="interactive-rating-stars" style="font-size: 2.2rem; cursor: pointer; color: #FFC107; display: flex; justify-content: center; gap: 8px; margin-top: 8px;">
          <span class="star-btn" data-star="1">⭐</span>
          <span class="star-btn" data-star="2">⭐</span>
          <span class="star-btn" data-star="3">⭐</span>
          <span class="star-btn" data-star="4">⭐</span>
          <span class="star-btn" data-star="5">⭐</span>
        </div>
      </div>

      <!-- Tip Options -->
      <div style="margin-bottom: 24px;">
        <small style="color:var(--text-secondary); display:block; margin-bottom: 10px;">Añadir propina voluntaria:</small>
        <div style="display:flex; justify-content:center; gap: 10px;">
          <button class="btn tip-btn" data-val="0.50" style="padding: 10px 16px; border-radius: 14px; background: var(--surface-elevated); border: 1px solid var(--border-color); color: white; font-weight: 700;">+$0.50</button>
          <button class="btn tip-btn" data-val="1.00" style="padding: 10px 16px; border-radius: 14px; background: var(--surface-elevated); border: 1px solid var(--border-color); color: white; font-weight: 700;">+$1.00</button>
          <button class="btn tip-btn" data-val="2.00" style="padding: 10px 16px; border-radius: 14px; background: var(--surface-elevated); border: 1px solid var(--border-color); color: white; font-weight: 700;">+$2.00</button>
        </div>
      </div>

      <button id="finish-trip-btn" class="btn btn-3d primary-btn" style="
        width: 100%; padding: 16px; font-weight: 900; font-size: 1.1rem;
        background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%); color: #121824;
      ">
        ✓ FINALIZAR Y CONTINUAR
      </button>
    </div>
  `;

  // Star Rating clicks
  const starBtns = container.querySelectorAll('.star-btn');
  starBtns.forEach((star, idx) => {
    star.addEventListener('click', () => {
      showToast(`⭐ Calificación enviada: ${idx + 1} Estrellas`, 'success');
    });
  });

  // Tip buttons clicks
  const tipBtns = container.querySelectorAll('.tip-btn');
  tipBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tipBtns.forEach(b => { b.style.borderColor = 'var(--border-color)'; b.style.background = 'var(--surface-elevated)'; });
      btn.style.borderColor = 'var(--accent-primary)';
      btn.style.background = 'rgba(255,193,7,0.15)';
      selectedTip = parseFloat(btn.dataset.val);
      showToast(`Propina añadida: +$${selectedTip.toFixed(2)} USD`, 'success');
    });
  });

  container.querySelector('#finish-trip-btn').addEventListener('click', () => {
    container.remove();
    onDone();
  });

  return container;
}
