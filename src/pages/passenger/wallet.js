import { apiService } from '../../services/apiService.js';
import { authService } from '../../services/authService.js';
import { icon } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';
import { getBcvEuroRate, formatVes } from '../../utils/bcvRates.js';

const PAYMENT_DATA = Object.freeze({
  bank: 'Venezuela',
  identity: '26242188',
  phone: '04127844848'
});

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const copyPaymentData = async () => {
  const text = `Banco: ${PAYMENT_DATA.bank}\nCédula/RIF: ${PAYMENT_DATA.identity}\nTeléfono: ${PAYMENT_DATA.phone}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Datos de Pago Móvil copiados.', 'success');
  } catch {
    showToast(`Banco ${PAYMENT_DATA.bank} · ${PAYMENT_DATA.identity} · ${PAYMENT_DATA.phone}`, 'info');
  }
};

const paymentDataMarkup = () => `<div class="wallet-payment-data">
  <div><small>BANCO</small><strong>${PAYMENT_DATA.bank}</strong></div>
  <div><small>CÉDULA / RIF</small><strong>${PAYMENT_DATA.identity}</strong></div>
  <div><small>TELÉFONO</small><strong>${PAYMENT_DATA.phone}</strong></div>
  <button type="button" data-copy-payment>${icon('copy', 15)} Copiar datos</button>
</div>`;

const transactionPresentation = transaction => {
  if (transaction.type === 'TOP_UP') return { label: 'Recarga por Pago Móvil', iconName: 'plus' };
  if (transaction.type === 'RIDE_PAYMENT') return { label: 'Pago de viaje', iconName: 'mapPin' };
  return { label: String(transaction.type || 'Movimiento'), iconName: 'dollarSign' };
};

export function renderWallet(container) {
  const user = authService.getCurrentUser();
  if (!user) return;

  let wallet = { balance: 0, currency: 'USD', transactions: [] };
  let filter = 'all';

  const load = async () => {
    const result = await apiService.get('/wallet/me');
    if (result) wallet = result;
    render();
  };

  const openPaymentDetails = () => {
    const modal = document.createElement('div');
    modal.className = 'wallet-topup-backdrop';
    modal.innerHTML = `<section class="wallet-topup-modal wallet-payment-modal">
      <button type="button" data-close aria-label="Cerrar">${icon('close', 18)}</button>
      <span>${icon('smartphone', 22)}</span>
      <small class="wallet-modal-eyebrow">DATOS OFICIALES +58EXPRESS</small>
      <h3>Realiza tu Pago Móvil</h3>
      <p>Envía el pago a estos datos y guarda la referencia bancaria para registrar la recarga.</p>
      ${paymentDataMarkup()}
      <button type="button" class="wallet-payment-continue">Ya pagué · Registrar recarga</button>
    </section>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.querySelector('[data-copy-payment]').onclick = copyPaymentData;
    modal.querySelector('.wallet-payment-continue').onclick = () => {
      modal.remove();
      openTopup();
    };
  };

  const openTopup = () => {
    const modal = document.createElement('div');
    modal.className = 'wallet-topup-backdrop';
    modal.innerHTML = `<form class="wallet-topup-modal">
      <button type="button" data-close aria-label="Cerrar">${icon('close', 18)}</button>
      <span>${icon('shield', 22)}</span>
      <small class="wallet-modal-eyebrow">VERIFICACIÓN DE RECARGA</small>
      <h3>Registrar recarga</h3>
      <p>La referencia quedará pendiente hasta que administración compruebe el pago.</p>
      ${paymentDataMarkup()}
      <label>Monto a acreditar en USD<input name="amount" type="number" min="1" max="1000" step="0.01" required placeholder="Ej. 10.00"></label>
      <label>Referencia de Pago Móvil<input name="reference" inputmode="numeric" minlength="6" maxlength="20" required placeholder="Últimos números de la referencia"></label>
      <button type="submit">${icon('check', 16)} Enviar a verificación</button>
    </form>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.querySelector('[data-copy-payment]').onclick = copyPaymentData;
    modal.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit.disabled = true;
      const result = await apiService.post('/wallet/topups', {
        amount: Number(values.amount),
        reference: values.reference
      });
      submit.disabled = false;
      if (!result) {
        return showToast(
          apiService.lastError?.error === 'REFERENCE_EXISTS'
            ? 'Esa referencia ya fue registrada.'
            : 'No se pudo registrar la recarga.',
          'error'
        );
      }
      modal.remove();
      showToast('Recarga enviada a verificación administrativa.', 'success');
      await load();
    };
  };

  const render = () => {
    const transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];
    const visibleTransactions = filter === 'topups'
      ? transactions.filter(transaction => transaction.type === 'TOP_UP')
      : transactions;

    container.innerHTML = `<div class="wallet-real-page fade-in">
      <header class="wallet-real-heading">
        <small>${icon('wallet', 15)} BILLETERA +58EXPRESS</small>
        <h2>Tu dinero, con trazabilidad.</h2>
        <p>Las recargas se acreditan únicamente después de validación administrativa.</p>
      </header>
      <section class="wallet-real-balance">
        <div class="wallet-balance-head"><small>SALDO DISPONIBLE</small><b>${icon('shield', 16)} Transacción segura</b></div>
        <strong>$${Number(wallet.balance || 0).toFixed(2)} <em>USD</em></strong>
        <span>≈ ${formatVes(Number(wallet.balance || 0))} · Tasa referencial ${getBcvEuroRate()}</span>
        <div class="wallet-balance-actions">
          <button id="wallet-payment-data" type="button">${icon('smartphone', 16)} Ver datos de Pago Móvil</button>
          <button id="wallet-request-topup" type="button">${icon('plus', 16)} Registrar recarga</button>
        </div>
      </section>
      <section class="wallet-real-history">
        <div class="wallet-history-heading"><h3>${icon('fileText', 19)} Movimientos</h3><span>${transactions.length} registros</span></div>
        <div class="wallet-history-filters">
          <button class="${filter === 'all' ? 'active' : ''}" data-wallet-filter="all">Todos</button>
          <button class="${filter === 'topups' ? 'active' : ''}" data-wallet-filter="topups">Recargas</button>
        </div>
        <div class="wallet-history-list">
          ${visibleTransactions.map(transaction => {
            const presentation = transactionPresentation(transaction);
            const amount = Number(transaction.amount || 0);
            return `<article>
            <span class="wallet-tx-icon ${escapeHtml(String(transaction.status).toLowerCase())}">${icon(presentation.iconName, 17)}</span>
            <div><strong>${escapeHtml(presentation.label)}</strong><small>${new Date(transaction.createdAt).toLocaleString('es-VE')} · ${transaction.reference ? `Ref. ${escapeHtml(transaction.reference)}` : `Viaje ${escapeHtml(transaction.tripId || '—')}`}</small></div>
            <b>${amount < 0 ? '−' : '+'}$${Math.abs(amount).toFixed(2)}<small>${escapeHtml(transaction.status)}</small></b>
          </article>`;
          }).join('') || `<div class="wallet-empty">
            <span>${icon('fileText', 34)}</span><strong>Aún no tienes movimientos</strong><p>Tus recargas y pagos aparecerán aquí.</p>
          </div>`}
        </div>
      </section>
    </div>`;

    container.querySelector('#wallet-payment-data').onclick = openPaymentDetails;
    container.querySelector('#wallet-request-topup').onclick = openTopup;
    container.querySelectorAll('[data-wallet-filter]').forEach(button => {
      button.onclick = () => {
        filter = button.dataset.walletFilter;
        render();
      };
    });
  };

  render();
  load();
}
