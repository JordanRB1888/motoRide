import { getBcvEuroRate, formatVes } from '../utils/bcvRates.js';
import { showToast } from './toast.js';
import { icon } from '../utils/icons.js';

import { neutralizePrivatePhoto } from '../utils/privatePhoto.js';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const nameOf = person => `${person?.firstName || person?.name || ''} ${person?.lastName || ''}`.trim() || 'No disponible';
const numberFrom = (...values) => values.map(Number).find(Number.isFinite) || 0;
const receiptCode = trip => `TR-${String(trip?.id || '58EXP').replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()}`;
const paymentName = value => ({ EFECTIVO: 'Efectivo', CASH: 'Efectivo', PAGO_MOVIL: 'Pago móvil', PAGO_MÓVIL: 'Pago móvil', WALLET: 'Billetera +58Express', TRANSFERENCIA: 'Transferencia' }[String(value || '').toUpperCase()] || value || 'Pago confirmado');

export function createDigitalReceiptModal({ trip, driver, passenger, onClose }) {
    const bcvRate = getBcvEuroRate();
    const fareEUR = numberFrom(trip?.fareEUR, trip?.fareUSD, trip?.pricing?.fareUSD, 4.5);
    const tipEUR = numberFrom(trip?.tipEUR);
    const totalPaidEUR = fareEUR + tipEUR;
    const pickup = trip?.pickup?.address || trip?.pickupAddress || 'Punto de recogida marcado';
    const destination = trip?.destination?.address || trip?.destinationAddress || 'Punto de destino en Maracaibo';
    const distance = numberFrom(trip?.distanceKm, trip?.distance, trip?.pricing?.distanceKm, 4.8);
    const duration = Math.max(1, Math.round(numberFrom(trip?.durationMin, trip?.duration, trip?.estimatedDuration, 12)));
    const completedAt = new Date(trip?.completedAt || trip?.closedAt || trip?.updatedAt || Date.now());
    const code = receiptCode(trip);
    const payment = paymentName(trip?.paymentMethod);
    const driverName = nameOf(driver);
    const passengerName = nameOf(passenger);
    const vehicle = `${driver?.vehicleBrand || 'Vehículo'} ${driver?.vehicleModel || ''}`.trim();
    const plate = driver?.vehiclePlate || 'Sin placa';
    // Recibo histórico: nunca la fotografía privada, solo avatar neutro.
    const driverPhoto = neutralizePrivatePhoto(driver?.photoUrl || driver?.avatar || '');
    const passengerPhoto = neutralizePrivatePhoto(passenger?.photoUrl || passenger?.avatar || '');
    const driverInitials = `${driver?.firstName?.[0] || 'C'}${driver?.lastName?.[0] || ''}`.toUpperCase();
    const passengerInitials = `${passenger?.firstName?.[0] || passenger?.name?.[0] || 'P'}${passenger?.lastName?.[0] || ''}`.toUpperCase();

    const overlay = document.createElement('div');
    overlay.className = 'receipt-screen';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Comprobante digital de viaje');
    overlay.innerHTML = `<div class="receipt-shell" id="receipt-modal-card">
        <header class="receipt-brand-header">
            <img src="/app-icon-v2.png" alt="+58Express">
            <div><h2>+58Express Maracaibo</h2><p>Comprobante digital de viaje</p><span>${icon('checkCircle', 16)} Viaje completado</span></div>
            <button id="close-receipt-btn" type="button" aria-label="Cerrar comprobante">${icon('close', 24)}</button>
        </header>

        <main class="receipt-ticket">
            <section class="receipt-code-row"><div>${icon('fileText', 20)}<span>RECIBO <strong>#${escapeHtml(code)}</strong></span></div><time>${completedAt.toLocaleDateString('es-VE')}</time></section>

            <section class="receipt-route">
                <div class="receipt-route-line"><i class="pickup"></i><span><b>Origen</b><strong>${escapeHtml(pickup)}</strong></span></div>
                <div class="receipt-route-line"><i class="destination"></i><span><b>Destino</b><strong>${escapeHtml(destination)}</strong></span></div>
                <div class="receipt-route-metrics"><article>${icon('mapPin', 20)}<span><small>Distancia</small><strong>${distance.toFixed(1)} km</strong></span></article><article>${icon('clock', 20)}<span><small>Duración</small><strong>${duration} min</strong></span></article></div>
            </section>

            <section class="receipt-people">
                <article><span class="receipt-person-photo">${driverPhoto ? `<img src="${escapeHtml(driverPhoto)}" alt="">` : escapeHtml(driverInitials)}</span><div><small>CONDUCTOR</small><strong>${escapeHtml(driverName)}</strong><p>${escapeHtml(vehicle)} · ${escapeHtml(plate)}</p></div></article>
                <article><span class="receipt-person-photo">${passengerPhoto ? `<img src="${escapeHtml(passengerPhoto)}" alt="">` : escapeHtml(passengerInitials)}</span><div><small>PASAJERO</small><strong>${escapeHtml(passengerName)}</strong><p class="receipt-paid">${icon('shield', 14)} Pago confirmado</p></div></article>
            </section>

            <section class="receipt-payment">
                <dl><div><dt>Tarifa del viaje</dt><dd>€${fareEUR.toFixed(2)}</dd></div>${tipEUR > 0 ? `<div class="tip"><dt>Propina voluntaria</dt><dd>+€${tipEUR.toFixed(2)}</dd></div>` : ''}</dl>
                <div class="receipt-total"><div><small>TOTAL PAGADO</small><strong>€${totalPaidEUR.toFixed(2)} <em>EUR</em></strong></div><div><small>Equivalente VES (BCV)</small><strong>${formatVes(totalPaidEUR)}</strong></div></div>
                <footer><span>${icon('creditCard', 20)}<small>Método de pago</small><strong>${escapeHtml(payment)}</strong></span><b>${icon('shield', 20)}</b></footer>
            </section>

            <section class="receipt-verification"><span>${icon('checkCircle', 24)}</span><div><strong>Comprobante verificado</strong><p>Registro oficial emitido por +58Express.</p></div><code>${escapeHtml(code.slice(-6))}</code></section>
        </main>

        <footer class="receipt-actions"><button id="btn-share-whatsapp" type="button">${icon('message', 20)} Compartir por WhatsApp</button><button id="btn-download-pdf" type="button">${icon('download', 20)} Descargar comprobante PDF</button></footer>
    </div>`;

    const close = () => {
        overlay.remove();
        onClose?.();
    };
    overlay.querySelector('#close-receipt-btn').addEventListener('click', close);

    overlay.querySelector('#btn-share-whatsapp').addEventListener('click', () => {
        const message = [
            '🧾 *COMPROBANTE DE VIAJE +58EXPRESS*',
            `*Recibo:* #${code}`,
            `📍 *Origen:* ${pickup}`,
            `🏁 *Destino:* ${destination}`,
            `🏍️ *Conductor:* ${driverName} (${plate})`,
            `💳 *Método:* ${payment}`,
            `💰 *Total pagado:* €${totalPaidEUR.toFixed(2)} EUR (${formatVes(totalPaidEUR)})`,
            `🇻🇪 *Tasa BCV Euro:* Bs. ${bcvRate.toFixed(2)}`,
            '',
            'Comprobante verificado por +58Express.'
        ].join('\n');
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
        showToast('Comprobante preparado para WhatsApp', 'success');
    });

    overlay.querySelector('#btn-download-pdf').addEventListener('click', () => {
        overlay.classList.add('receipt-printing');
        window.print();
        window.setTimeout(() => overlay.classList.remove('receipt-printing'), 500);
        showToast('Selecciona “Guardar como PDF” en el diálogo de impresión', 'info');
    });

    requestAnimationFrame(() => overlay.querySelector('#close-receipt-btn')?.focus());
    return overlay;
}
