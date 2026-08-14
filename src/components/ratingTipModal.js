import { formatVes } from '../utils/bcvRates.js';
import { showToast } from './toast.js';

import { neutralizePrivatePhoto } from '../utils/privatePhoto.js';
export function createRatingTipModal({ trip, driver, onSubmit }) {
  const overlay = document.createElement('div');
  overlay.className = 'passenger-rating-overlay fade-in';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Calificar viaje y añadir propina');

  let selectedRating = 5;
  let selectedTipEUR = 0;
  let selectedTags = [];
  const tags = ['Manejo seguro', 'Llegó rápido', 'Excelente trato', 'Moto impecable'];

  const modal = document.createElement('section');
  modal.className = 'passenger-rating-card';

  const render = () => {
    modal.innerHTML = `
      <header class="passenger-rating-header">
        <span class="rating-finished-badge">✓ VIAJE COMPLETADO</span>
        <strong>+58<span>express</span></strong>
        <small>#${String(trip?.id || 'viaje').slice(-7)}</small>
      </header>
      <div class="passenger-rating-driver">
        <img src="${neutralizePrivatePhoto(driver?.photoUrl) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(driver?.firstName || 'Carlos')}`}" alt="Conductor ${driver?.firstName || 'Carlos'}">
        <div><small>CALIFICA A TU CONDUCTOR</small><h2>¿Cómo estuvo tu viaje con ${driver?.firstName || 'Carlos'}?</h2><p>${driver?.vehicleBrand || 'Bera'} ${driver?.vehicleModel || 'SBR 150'} · ${driver?.vehiclePlate || 'AC3M49P'}</p></div>
      </div>
      <div class="passenger-rating-stars" aria-label="Calificación de ${selectedRating} estrellas">
        ${[1,2,3,4,5].map(star => `<button class="passenger-star ${star <= selectedRating ? 'selected' : ''}" type="button" data-star="${star}" aria-label="${star} estrellas">★</button>`).join('')}
      </div>
      <div class="passenger-rating-tags">
        ${tags.map(tag => `<button class="passenger-rating-tag ${selectedTags.includes(tag) ? 'selected' : ''}" type="button" data-tag="${tag}">${tag}</button>`).join('')}
      </div>
      <section class="passenger-tip-section">
        <div><span>Propina voluntaria</span><strong>€${selectedTipEUR.toFixed(2)} EUR</strong></div>
        <p>El 100% se acredita al conductor · ${formatVes(selectedTipEUR)}</p>
        <div class="passenger-tip-options">
          ${[0,0.5,1,2].map(tip => `<button class="passenger-tip ${selectedTipEUR === tip ? 'selected' : ''}" type="button" data-tip="${tip}">${tip === 0 ? 'Sin propina' : `€${tip.toFixed(2)}`}</button>`).join('')}
        </div>
      </section>
      <button class="passenger-rating-submit" type="button">Enviar calificación y finalizar</button>
      <small class="passenger-rating-note">Tu opinión ayuda a mantener una comunidad segura.</small>
    `;

    modal.querySelectorAll('.passenger-star').forEach(button => button.addEventListener('click', () => {
      selectedRating = Number(button.dataset.star);
      render();
    }));
    modal.querySelectorAll('.passenger-rating-tag').forEach(button => button.addEventListener('click', () => {
      const tag = button.dataset.tag;
      selectedTags = selectedTags.includes(tag) ? selectedTags.filter(item => item !== tag) : [...selectedTags, tag];
      render();
    }));
    modal.querySelectorAll('.passenger-tip').forEach(button => button.addEventListener('click', () => {
      selectedTipEUR = Number(button.dataset.tip);
      render();
    }));
    modal.querySelector('.passenger-rating-submit').addEventListener('click', () => {
      showToast(`¡Gracias! Calificación de ${selectedRating} estrellas enviada`, 'success');
      overlay.remove();
      onSubmit?.({ rating: selectedRating, tags: selectedTags, tipEUR: selectedTipEUR });
    });
  };

  overlay.appendChild(modal);
  render();
  return overlay;
}
