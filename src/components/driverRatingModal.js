import { showToast } from './toast.js';
import { db } from '../services/mockDatabase.js';

export function createDriverRatingModal({ trip, passengerName = 'Jordan Pérez', onSubmit }) {
    const overlay = document.createElement('div');
    overlay.className = 'diorama-card-3d fade-in';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(10, 15, 24, 0.92); backdrop-filter: blur(24px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    let selectedRating = 5;
    let selectedTags = [];

    const tags = [
        "Pasajero Puntual ⏱️",
        "Amable y Respetuoso 😊",
        "Buena Comunicación 💬",
        "Pago Rápido y Exacto 💵",
        "Excelente Cliente 🌟"
    ];

    const modal = document.createElement('div');
    modal.style.cssText = `
        width: 100%; max-width: 440px; background: var(--surface-card); border-radius: 28px;
        border: 2px solid var(--accent-secondary); padding: 24px; text-align: center;
        box-shadow: 0 30px 70px rgba(0,0,0,0.8);
        animation: dioramaLand 0.35s ease-out;
    `;

    const render = () => {
        modal.innerHTML = `
            <div style="display:flex; justify-content:center; margin-bottom:12px;">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(passengerName)}&background=00D2FF&color=121824&size=128&bold=true" 
                     style="width: 72px; height: 72px; border-radius: 50%; border: 3px solid var(--accent-secondary); box-shadow: 0 0 20px rgba(0,210,255,0.4);" />
            </div>

            <h3 style="color: var(--text-primary); font-size: 1.3rem; font-weight: 900; margin-bottom: 4px;">
                ¿Cómo fue la experiencia con ${passengerName}?
            </h3>
            <small style="color: var(--text-secondary); font-size: 0.85rem; display:block; margin-bottom: 16px;">
                Califica el comportamiento del cliente para mantener la comunidad segura 🇻🇪
            </small>

            <!-- Star Rating Bar -->
            <div style="display:flex; justify-content:center; gap: 10px; margin-bottom: 20px;" id="star-bar-driver">
                ${[1, 2, 3, 4, 5].map(star => `
                    <span class="star-btn-driver" data-star="${star}" style="
                        font-size: 2.2rem; cursor: pointer; transition: transform 0.15s ease;
                        color: ${star <= selectedRating ? '#00D2FF' : '#475569'};
                        filter: ${star <= selectedRating ? 'drop-shadow(0 0 8px rgba(0,210,255,0.6))' : 'none'};
                    ">
                        ★
                    </span>
                `).join('')}
            </div>

            <!-- Review Tags -->
            <div style="display:flex; flex-wrap:wrap; gap: 8px; justify-content:center; margin-bottom: 22px;">
                ${tags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return `
                        <button class="tag-driver-btn" data-tag="${tag}" style="
                            padding: 8px 14px; border-radius: 16px; font-size: 0.8rem; font-weight: 700; cursor: pointer;
                            background: ${isSelected ? 'var(--accent-secondary)' : 'var(--surface-elevated)'};
                            color: ${isSelected ? '#121824' : 'var(--text-primary)'};
                            border: 1px solid ${isSelected ? 'var(--accent-secondary)' : 'var(--border-color)'};
                        ">
                            ${tag}
                        </button>
                    `;
                }).join('')}
            </div>

            <!-- Comment Input -->
            <div style="margin-bottom: 22px;">
                <input type="text" id="driver-rating-comment" placeholder="Comentario opcional sobre el pasajero..." style="
                    width: 100%; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: white; outline: none; font-size: 0.88rem;
                " />
            </div>

            <!-- Submit Button -->
            <button id="submit-driver-rating-btn" class="btn btn-3d primary-btn" style="
                width: 100%; padding: 16px; font-size: 1.05rem; font-weight: 900;
                background: linear-gradient(135deg, #00E676 0%, #00B0FF 100%); color: #121824;
                border-radius: 18px; letter-spacing: 0.5px;
            ">
                ✓ ENVIAR CALIFICACIÓN AL PASAJERO
            </button>
        `;

        // Star bar click listeners
        modal.querySelectorAll('.star-btn-driver').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedRating = parseInt(btn.dataset.star, 10);
                render();
            });
        });

        // Tag click listeners
        modal.querySelectorAll('.tag-driver-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                if (selectedTags.includes(tag)) {
                    selectedTags = selectedTags.filter(t => t !== tag);
                } else {
                    selectedTags.push(tag);
                }
                render();
            });
        });

        // Submit
        modal.querySelector('#submit-driver-rating-btn').addEventListener('click', () => {
            const comment = modal.querySelector('#driver-rating-comment')?.value || '';
            showToast(`¡Gracias! Calificación de ${selectedRating} ⭐ registrada para ${passengerName}`, 'success');
            overlay.remove();
            if (onSubmit) onSubmit({ rating: selectedRating, tags: selectedTags, comment });
        });
    };

    overlay.appendChild(modal);
    render();
    return overlay;
}
