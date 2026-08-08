import { showToast } from './toast.js';
import { icon } from '../utils/icons.js';

export function createDriverRatingModal({ trip, passengerName = 'Cliente Pruebas', onSubmit }) {
    const overlay = document.createElement('div');
    overlay.className = 'driver-rating-overlay fade-in';
    const modal = document.createElement('section');
    modal.className = 'driver-rating-premium';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    let selectedRating = 5;
    let selectedTags = [];
    let commentDraft = '';
    const tags = ['Puntual', 'Amable y respetuoso', 'Buena comunicación', 'Pago rápido y exacto', 'Excelente pasajero'];
    const labels = ['', 'Debe mejorar', 'Regular', 'Bien', 'Muy bien', 'Excelente'];
    const fare = Number(trip?.pricing?.fareUSD ?? trip?.fareUSD ?? trip?.fare ?? 0).toFixed(2);
    const payment = ({ cash_usd: 'Efectivo USD', cash_ves: 'Efectivo Bs.', pago_movil: 'Pago móvil', wallet: 'Wallet' })[trip?.paymentMethod] || 'Efectivo USD';
    const avatar = trip?.passengerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(passengerName)}`;

    const finish = payload => {
        overlay.remove();
        onSubmit?.(payload);
    };

    const render = () => {
        modal.innerHTML = `
            <header class="rating-success-header">
                <div class="rating-brand">+58 <span>EXPRESS</span></div>
                <div class="rating-completed">${icon('check', 18)} Viaje completado</div>
                <small>$${fare} · ${payment}</small>
            </header>
            <div class="rating-passenger-avatar"><img src="${avatar}" alt="${passengerName}"></div>
            <h2>${passengerName}</h2>
            <p>Califica tu experiencia con el pasajero</p>
            <div class="driver-rating-stars" id="star-bar-driver">
                ${[1,2,3,4,5].map(star => `<button class="star-btn-driver ${star <= selectedRating ? 'selected' : ''}" data-star="${star}" aria-label="${star} estrellas">★</button>`).join('')}
            </div>
            <strong class="rating-label">${labels[selectedRating]}</strong>
            <h3>¿Qué describe mejor a este pasajero?</h3>
            <div class="driver-rating-tags">
                ${tags.map(tag => `<button class="tag-driver-btn ${selectedTags.includes(tag) ? 'selected' : ''}" data-tag="${tag}">${tag}</button>`).join('')}
            </div>
            <textarea id="driver-rating-comment" rows="3" placeholder="Comentario opcional sobre el pasajero">${commentDraft}</textarea>
            <button id="submit-driver-rating-btn" class="driver-rating-submit">Enviar calificación</button>
            <button id="skip-driver-rating-btn" class="driver-rating-skip">Omitir por ahora</button>
            <small class="rating-safety-note">${icon('shield', 15)} Tu opinión ayuda a mantener una comunidad segura</small>
        `;

        modal.querySelectorAll('.star-btn-driver').forEach(button => button.addEventListener('click', () => {
            commentDraft = modal.querySelector('#driver-rating-comment').value;
            selectedRating = Number(button.dataset.star);
            render();
        }));
        modal.querySelectorAll('.tag-driver-btn').forEach(button => button.addEventListener('click', () => {
            commentDraft = modal.querySelector('#driver-rating-comment').value;
            const tag = button.dataset.tag;
            selectedTags = selectedTags.includes(tag) ? selectedTags.filter(item => item !== tag) : [...selectedTags, tag];
            render();
        }));
        modal.querySelector('#submit-driver-rating-btn').addEventListener('click', () => {
            const comment = modal.querySelector('#driver-rating-comment').value.trim();
            showToast(`Calificación de ${selectedRating} estrellas registrada`, 'success');
            finish({ rating: selectedRating, tags: selectedTags, comment });
        });
        modal.querySelector('#skip-driver-rating-btn').addEventListener('click', () => finish({ rating: null, tags: [], comment: '' }));
    };

    overlay.appendChild(modal);
    render();
    return overlay;
}
