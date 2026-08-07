import { getBcvEuroRate, formatVes } from '../utils/bcvRates.js';
import { showToast } from './toast.js';

export function createDigitalReceiptModal({ trip, driver, passenger, onClose }) {
    const bcvRate = getBcvEuroRate();
    const fareEUR = trip?.fareEUR || trip?.fareUSD || 4.50;
    const fareVES = fareEUR * bcvRate;
    const tipEUR = trip?.tipEUR || 0;
    const totalPaidEUR = fareEUR + tipEUR;

    const overlay = document.createElement('div');
    overlay.className = 'diorama-card-3d fade-in';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(10, 15, 24, 0.92); backdrop-filter: blur(24px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    const modal = document.createElement('div');
    modal.id = 'receipt-modal-card';
    modal.style.cssText = `
        width: 100%; max-width: 440px; background: var(--surface-card); border-radius: 28px;
        border: 2px solid var(--accent-secondary); padding: 24px; text-align: left;
        box-shadow: 0 30px 70px rgba(0,0,0,0.8), 0 0 35px rgba(0,210,255,0.3);
        animation: dioramaLand 0.35s ease-out; position: relative;
    `;

    modal.innerHTML = `
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px dashed var(--border-color); padding-bottom: 16px; margin-bottom: 16px;">
            <div style="display:flex; align-items:center; gap: 10px;">
                <img src="/logo.jpg" style="width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--accent-primary);" />
                <div>
                    <h3 style="color: var(--text-primary); font-size: 1.1rem; font-weight: 900; margin: 0;">+58express Maracaibo</h3>
                    <small style="color: var(--text-secondary); font-size: 0.78rem;">Comprobante Digital de Viaje</small>
                </div>
            </div>
            <button id="close-receipt-btn" style="color: var(--text-secondary); font-size: 1.3rem; background: none; border: none; cursor: pointer;">✕</button>
        </div>

        <!-- Receipt Code & Date -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px; font-size: 0.85rem;">
            <span style="color: var(--text-secondary);">RECIBO ID: <strong style="color: var(--accent-primary); font-family: 'JetBrains Mono', monospace;">#TR-${(trip?.id || '58EXP').substring(0,6).toUpperCase()}</strong></span>
            <span style="color: var(--text-secondary);">${new Date().toLocaleDateString('es-VE')}</span>
        </div>

        <!-- Route Breakdown -->
        <div style="background: var(--surface-elevated); padding: 14px; border-radius: 16px; border: 1px solid var(--border-color); margin-bottom: 16px; font-size: 0.85rem; display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; align-items:center; gap: 8px;">
                <span>🟢</span>
                <span style="color: var(--text-primary);"><strong>Origen:</strong> ${trip?.pickup?.address || 'Basílica de Chiquinquirá'}</span>
            </div>
            <div style="display:flex; align-items:center; gap: 8px;">
                <span>🚩</span>
                <span style="color: var(--text-primary);"><strong>Destino:</strong> ${trip?.destination?.address || 'Sambil Maracaibo'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; color: var(--text-secondary); font-size: 0.78rem; margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.05);">
                <span>Distancia: <strong>${trip?.distance || 4.8} Km</strong></span>
                <span>Tiempo: <strong>${trip?.duration || 12} Min</strong></span>
            </div>
        </div>

        <!-- Driver and Passenger -->
        <div style="display:flex; justify-content:space-between; margin-bottom: 16px; font-size: 0.82rem; background: rgba(255,255,255,0.03); padding: 10px 14px; border-radius: 14px;">
            <div>
                <small style="color: var(--text-muted); display:block;">CONDUCTOR</small>
                <strong style="color: var(--text-primary);">${driver?.firstName || 'Carlos'} ${driver?.lastName || 'Mendoza'}</strong>
                <span style="color: var(--text-secondary); display:block;">${driver?.vehicleBrand || 'Bera'} (${driver?.vehiclePlate || 'AC3M49P'})</span>
            </div>
            <div style="text-align: right;">
                <small style="color: var(--text-muted); display:block;">PASAJERO</small>
                <strong style="color: var(--text-primary);">${passenger?.name || 'Jordan Pérez'}</strong>
                <span style="color: var(--success); display:block; font-weight:700;">✓ Pago Confirmado</span>
            </div>
        </div>

        <!-- Total Breakdown Card -->
        <div style="background: rgba(0, 210, 255, 0.08); border: 1.5px solid var(--accent-secondary); padding: 16px; border-radius: 20px; margin-bottom: 20px;">
            <div style="display:flex; justify-content:space-between; margin-bottom: 6px; font-size: 0.88rem;">
                <span style="color: var(--text-secondary);">Tarifa del Viaje</span>
                <strong style="color: var(--text-primary);">€${fareEUR.toFixed(2)} EUR</strong>
            </div>
            ${tipEUR > 0 ? `
                <div style="display:flex; justify-content:space-between; margin-bottom: 6px; font-size: 0.88rem; color: var(--accent-primary);">
                    <span>Propina Voluntaria</span>
                    <strong>+€${tipEUR.toFixed(2)} EUR</strong>
                </div>
            ` : ''}
            <div style="height: 1px; background: var(--border-color); margin: 8px 0;"></div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="color: var(--text-muted); font-size: 0.78rem; display:block;">TOTAL PAGADO</span>
                    <strong style="font-size: 1.6rem; font-weight: 900; color: var(--accent-secondary); font-family: 'JetBrains Mono', monospace;">
                        €${totalPaidEUR.toFixed(2)} EUR
                    </strong>
                </div>
                <div style="text-align: right;">
                    <span style="color: var(--text-muted); font-size: 0.75rem; display:block;">EQUIVALENTE VES (BCV)</span>
                    <strong style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary);">
                        ~ ${formatVes(totalPaidEUR)}
                    </strong>
                </div>
            </div>
        </div>

        <!-- Action Export Buttons -->
        <div style="display:flex; flex-direction:column; gap: 10px;">
            <button id="btn-share-whatsapp" class="btn" style="
                width: 100%; padding: 14px; border-radius: 16px; background: #25D366; color: #121824;
                font-weight: 900; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
            ">
                📲 Compartir Recibo por WhatsApp
            </button>

            <button id="btn-download-pdf" class="btn" style="
                width: 100%; padding: 12px; border-radius: 16px; background: var(--surface-elevated); color: var(--text-primary);
                border: 1.5px solid var(--border-color); font-weight: 800; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
            ">
                📄 Descargar Comprobante (PDF / Impresión)
            </button>
        </div>
    `;

    overlay.appendChild(modal);

    modal.querySelector('#close-receipt-btn').addEventListener('click', () => {
        overlay.remove();
        if (onClose) onClose();
    });

    // WhatsApp Share Button
    modal.querySelector('#btn-share-whatsapp').addEventListener('click', () => {
        const text = encodeURIComponent(
            `🧾 *COMPROBANTE DE VIAJE +58EXPRESS MARACAIBO*\n` +
            `📍 *Origen:* ${trip?.pickup?.address || 'Basílica de Chiquinquirá'}\n` +
            `🚩 *Destino:* ${trip?.destination?.address || 'Sambil Maracaibo'}\n` +
            `🛵 *Conductor:* ${driver?.firstName || 'Carlos'} (${driver?.vehiclePlate || 'AC3M49P'})\n` +
            `💰 *Total Pagado:* €${totalPaidEUR.toFixed(2)} EUR (~ ${formatVes(totalPaidEUR)})\n` +
            `🇻🇪 Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)}\n\n` +
            `¡Gracias por viajar con +58express!`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
        showToast('Enlace de WhatsApp generado', 'success');
    });

    // PDF / Print Download Button
    modal.querySelector('#btn-download-pdf').addEventListener('click', () => {
        window.print();
        showToast('Iniciando descarga/impresión del recibo...', 'info');
    });

    return overlay;
}
