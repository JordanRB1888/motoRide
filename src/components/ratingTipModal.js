import { getBcvEuroRate, formatVes } from '../utils/bcvRates.js';
import { showToast } from './toast.js';

export function createRatingTipModal({ trip, driver, onSubmit }) {
    const bcvRate = getBcvEuroRate();
    const overlay = document.createElement('div');
    overlay.className = 'diorama-card-3d fade-in';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(10, 15, 24, 0.92); backdrop-filter: blur(24px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    let selectedRating = 5;
    let selectedTipEUR = 1.00; // Default tip €1 EUR
    let selectedTags = [];

    const tags = [
        "Manejo seguro 🛵",
        "Casco impecable 🪖",
        "Llegó muy rápido ⚡",
        "Excelente trato 🤝",
        "Buena conversación 💬"
    ];

    const modal = document.createElement('div');
    modal.style.cssText = `
        width: 100%; max-width: 440px; background: var(--surface-card); border-radius: 28px;
        border: 2px solid var(--border-gold); padding: 24px; text-align: center;
        box-shadow: 0 30px 70px rgba(0,0,0,0.8);
        animation: dioramaLand 0.35s ease-out;
    `;

    const render = () => {
        modal.innerHTML = `
            <div style="display:flex; justify-content:center; margin-bottom:12px;">
                <img src="${driver?.photoUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (driver?.firstName || 'Carlos')}" 
                     style="width: 72px; height: 72px; border-radius: 50%; border: 3px solid var(--accent-primary); box-shadow: 0 0 20px rgba(255,193,7,0.4);" />
            </div>

            <h3 style="color: var(--text-primary); font-size: 1.3rem; font-weight: 900; margin-bottom: 4px;">
                ¿Cómo estuvo tu viaje con ${driver?.firstName || 'Carlos'}?
            </h3>
            <small style="color: var(--text-secondary); font-size: 0.85rem; display:block; margin-bottom: 16px;">
                Mototaxista verificado 🇻🇪 · ${driver?.vehicleBrand || 'Bera'} (${driver?.vehiclePlate || 'AC3M49P'})
            </small>

            <!-- Star Rating Bar -->
            <div style="display:flex; justify-content:center; gap: 10px; margin-bottom: 20px;" id="star-bar">
                ${[1, 2, 3, 4, 5].map(star => `
                    <span class="star-btn" data-star="${star}" style="
                        font-size: 2.2rem; cursor: pointer; transition: transform 0.15s ease;
                        color: ${star <= selectedRating ? '#FFC107' : '#475569'};
                        filter: ${star <= selectedRating ? 'drop-shadow(0 0 8px rgba(255,193,7,0.6))' : 'none'};
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
                        <button class="tag-chip-btn" data-tag="${tag}" style="
                            padding: 8px 14px; border-radius: 16px; font-size: 0.8rem; font-weight: 700; cursor: pointer;
                            background: ${isSelected ? 'var(--accent-primary)' : 'var(--surface-elevated)'};
                            color: ${isSelected ? '#121824' : 'var(--text-primary)'};
                            border: 1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'};
                        ">
                            ${tag}
                        </button>
                    `;
                }).join('')}
            </div>

            <!-- Tip Section -->
            <div style="background: rgba(255,193,7,0.06); padding: 16px; border-radius: 20px; border: 1px solid rgba(255,193,7,0.25); margin-bottom: 22px; text-align: left;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                    <strong style="color: var(--text-primary); font-size: 0.9rem;">💚 Añadir Propina al Conductor:</strong>
                    <span style="color: var(--accent-primary); font-weight: 900; font-family: 'JetBrains Mono', monospace; font-size: 1rem;">
                        €${selectedTipEUR.toFixed(2)} EUR
                    </span>
                </div>

                <div style="display:flex; gap: 8px; margin-bottom: 10px;">
                    <button class="tip-btn" data-tip="0" style="
                        flex:1; padding: 10px; border-radius: 12px; font-weight: 800; font-size: 0.82rem; cursor: pointer;
                        background: ${selectedTipEUR === 0 ? 'var(--accent-secondary)' : 'var(--surface-card)'};
                        color: ${selectedTipEUR === 0 ? '#121824' : 'var(--text-primary)'};
                        border: 1px solid var(--border-color);
                    ">Sin Propina</button>
                    <button class="tip-btn" data-tip="0.5" style="
                        flex:1; padding: 10px; border-radius: 12px; font-weight: 800; font-size: 0.82rem; cursor: pointer;
                        background: ${selectedTipEUR === 0.5 ? 'var(--accent-primary)' : 'var(--surface-card)'};
                        color: ${selectedTipEUR === 0.5 ? '#121824' : 'var(--text-primary)'};
                        border: 1px solid var(--border-color);
                    ">€0.50</button>
                    <button class="tip-btn" data-tip="1.0" style="
                        flex:1; padding: 10px; border-radius: 12px; font-weight: 800; font-size: 0.82rem; cursor: pointer;
                        background: ${selectedTipEUR === 1.0 ? 'var(--accent-primary)' : 'var(--surface-card)'};
                        color: ${selectedTipEUR === 1.0 ? '#121824' : 'var(--text-primary)'};
                        border: 1px solid var(--border-color);
                    ">€1.00</button>
                    <button class="tip-btn" data-tip="2.0" style="
                        flex:1; padding: 10px; border-radius: 12px; font-weight: 800; font-size: 0.82rem; cursor: pointer;
                        background: ${selectedTipEUR === 2.0 ? 'var(--accent-primary)' : 'var(--surface-card)'};
                        color: ${selectedTipEUR === 2.0 ? '#121824' : 'var(--text-primary)'};
                        border: 1px solid var(--border-color);
                    ">€2.00</button>
                </div>

                <small style="color: var(--text-secondary); font-size: 0.78rem; display: block; text-align: center;">
                    Equivalente en Bs. VES (BCV): <strong>${formatVes(selectedTipEUR)}</strong>
                </small>
            </div>

            <!-- Submit Button -->
            <button id="submit-rating-btn" class="btn btn-3d primary-btn" style="
                width: 100%; padding: 16px; font-size: 1.1rem; font-weight: 900;
                background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%); color: #121824;
                border-radius: 18px; letter-spacing: 0.5px;
            ">
                ⚡ ENVIAR CALIFICACIÓN Y CONTINUAR
            </button>
        `;

        // Star bar click listeners
        modal.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedRating = parseInt(btn.dataset.star, 10);
                render();
            });
        });

        // Tag click listeners
        modal.querySelectorAll('.tag-chip-btn').forEach(btn => {
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

        // Tip click listeners
        modal.querySelectorAll('.tip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedTipEUR = parseFloat(btn.dataset.tip);
                render();
            });
        });

        // Submit
        modal.querySelector('#submit-rating-btn').addEventListener('click', () => {
            showToast(`¡Gracias! Calificación de ${selectedRating} ⭐ enviada a ${driver?.firstName || 'Carlos'}`, 'success');
            overlay.remove();
            if (onSubmit) onSubmit({ rating: selectedRating, tags: selectedTags, tipEUR: selectedTipEUR });
        });
    };

    overlay.appendChild(modal);
    render();
    return overlay;
}
