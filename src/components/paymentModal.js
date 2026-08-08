import { icon } from '../utils/icons.js';

export function createPaymentModal(options = {}) {
  const { currentMethod = 'efectivo', walletBalance = 0, onSelect = () => {}, onTopUp = () => {} } = options;
  let selectedMethod = currentMethod;
  const methods = [
    { id: 'efectivo', name: 'Efectivo', desc: 'Paga directamente al conductor', icon: 'banknote' },
    { id: 'pago_movil', name: 'Pago Móvil', desc: 'Transferencia bancaria en bolívares', icon: 'smartphone' },
    { id: 'wallet', name: 'Billetera Express', desc: `Saldo disponible: $${Number(walletBalance).toFixed(2)}`, icon: 'wallet' },
    { id: 'zelle', name: 'Zelle', desc: 'Transferencia digital en USD', icon: 'dollarSign' },
    { id: 'zinli', name: 'Zinli', desc: 'Pago mediante billetera digital', icon: 'creditCard' }
  ];

  const overlay = document.createElement('div');
  overlay.className = 'payment-modal-overlay';
  overlay.innerHTML = `
    <section class="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
      <div class="payment-modal-handle"></div>
      <header><div><small>+58 EXPRESS</small><h2 id="payment-modal-title">Selecciona cómo pagar</h2></div><button type="button" class="payment-close" aria-label="Cerrar">${icon('close', 20)}</button></header>
      <div class="payment-methods"></div>
      <button type="button" class="payment-confirm">Confirmar método</button>
      <button type="button" class="payment-topup">Recargar Billetera Express</button>
    </section>`;
  const modal = overlay.querySelector('.payment-modal');
  const methodsContainer = overlay.querySelector('.payment-methods');

  function renderMethods() {
    methodsContainer.innerHTML = methods.map(method => `
      <button type="button" class="payment-method ${selectedMethod === method.id ? 'active' : ''}" data-method="${method.id}">
        <span class="payment-method-icon">${icon(method.icon, 20)}</span>
        <span><strong>${method.name}</strong><small>${method.desc}</small></span>
        <i aria-hidden="true"></i>
      </button>`).join('');
    methodsContainer.querySelectorAll('.payment-method').forEach(button => button.addEventListener('click', () => {
      selectedMethod = button.dataset.method;
      renderMethods();
    }));
  }

  function open() {
    overlay.classList.add('open');
    document.documentElement.classList.add('payment-modal-open');
  }
  function close() {
    overlay.classList.remove('open');
    document.documentElement.classList.remove('payment-modal-open');
    window.setTimeout(() => overlay.remove(), 260);
  }

  overlay.querySelector('.payment-close').addEventListener('click', close);
  overlay.querySelector('.payment-confirm').addEventListener('click', () => { onSelect(selectedMethod); close(); });
  overlay.querySelector('.payment-topup').addEventListener('click', () => { close(); onTopUp(); });
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  renderMethods();
  document.body.appendChild(overlay);
  return { element: overlay, open, close, getSelected: () => selectedMethod };
}
