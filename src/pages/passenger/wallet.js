import { icon } from '../../utils/icons.js';
import { paymentService } from '../../services/mockPayment.js';
import { authService } from '../../services/mockAuth.js';
import { db } from '../../services/mockDatabase.js';
import { showToast } from '../../components/toast.js';
import { getBcvEuroRate, formatVes, formatEur } from '../../utils/bcvRates.js';

export function renderWallet(container) {
  const currentUser = authService.getCurrentUser() || { id: 'passenger_1', firstName: 'Jordan', walletBalance: 25.00 };
  const bcvRate = getBcvEuroRate();
  
  // Calculate current balances in EUR and VES
  const walletEUR = currentUser.walletBalance !== undefined ? currentUser.walletBalance : 25.00;
  const formattedVES = formatVes(walletEUR);

  // Get transactions
  let txHistory = db.query('transactions', tx => tx.userId === currentUser.id);
  if (txHistory.length === 0) {
    txHistory = [
      { id: 'tx_1', userId: currentUser.id, type: 'TOP_UP', amount: 25.00, currency: 'EUR', description: 'Recarga Inicial Pago Móvil (Euros BCV)', date: new Date().toISOString(), status: 'completed' },
      { id: 'tx_2', userId: currentUser.id, type: 'TRIP_PAYMENT', amount: -3.50, currency: 'EUR', description: 'Viaje Basílica ➔ Sambil', date: new Date(Date.now() - 86400000).toISOString(), status: 'completed' }
    ];
  }

  container.innerHTML = `
    <div class="wallet-page" style="padding: 20px 16px 100px; max-width: 480px; margin: 0 auto;">
      <div class="header-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:10px;">
        <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 800; margin: 0;">Mi Billetera</h2>
        <span class="badge badge-info" style="font-size: 0.8rem; padding: 6px 12px; border: 1px solid var(--accent-secondary);">
          🇪🇺 Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)}
        </span>
      </div>
      
      <!-- VIP Gold Digital Card -->
      <div class="balance-card" style="
        background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%);
        border-radius: 24px;
        padding: 24px;
        color: #121824;
        box-shadow: 0 15px 35px rgba(255, 193, 7, 0.35), 0 4px 0 #b38600;
        margin-bottom: 28px;
        position: relative;
        overflow: hidden;
      ">
        <div style="position: absolute; right: -20px; top: -20px; width: 140px; height: 140px; background: rgba(255,255,255,0.15); border-radius: 50%; pointer-events: none;"></div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <span style="font-weight: 900; letter-spacing: 1px; font-size: 1rem; opacity: 0.9;">+58EXPRESS WALLET</span>
          <span style="font-weight: 700; font-size: 0.85rem; background: rgba(18,24,36,0.15); padding: 4px 10px; border-radius: 12px;">ACTIVA 🇻🇪</span>
        </div>

        <div style="font-size: 2.4rem; font-weight: 900; font-family: 'JetBrains Mono', monospace; line-height: 1.1; margin-bottom: 4px;">
          €${walletEUR.toFixed(2)} <span style="font-size: 1.1rem; font-weight: 700;">EUR</span>
        </div>
        <div style="font-size: 1.05rem; font-weight: 800; opacity: 0.9; margin-bottom: 24px;">
          ~ ${formattedVES}
        </div>

        <div style="display:flex; gap: 12px;">
          <button id="topup-btn" class="btn" style="
            flex: 1;
            padding: 14px;
            background: #121824;
            color: #FFC107;
            border: none;
            border-radius: 16px;
            font-weight: 800;
            font-size: 0.95rem;
            cursor: pointer;
            box-shadow: 0 6px 15px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: transform 0.15s ease;
          ">
            ⚡ Recargar Saldo por Pago Móvil
          </button>
        </div>
      </div>
      
      <!-- Transaction History Section -->
      <div class="transactions-section">
        <h3 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 16px; display:flex; justify-content:space-between; align-items:center;">
          Historial de Movimientos
          <small style="color: var(--text-muted); font-size: 0.8rem; font-weight:400;">Últimos 30 días</small>
        </h3>
        
        <div class="tx-list" style="display: flex; flex-direction: column; gap: 12px;">
          ${txHistory.map(tx => `
            <div class="tx-item diorama-card-3d" style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 16px;
              background: var(--surface-card);
              border-radius: 16px;
              border: 1px solid var(--border-color);
            ">
              <div style="display:flex; align-items:center; gap: 14px;">
                <div style="
                  width: 44px; height: 44px; border-radius: 50%;
                  background: ${tx.amount > 0 ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 77, 77, 0.15)'};
                  color: ${tx.amount > 0 ? 'var(--success)' : 'var(--danger)'};
                  display: flex; align-items: center; justify-content: center;
                  font-size: 1.2rem; flex-shrink: 0;
                ">
                  ${tx.amount > 0 ? '⇣' : '⇡'}
                </div>
                <div>
                  <strong style="display:block; color: var(--text-primary); font-size: 0.95rem;">${tx.description || 'Movimiento Wallet'}</strong>
                  <span style="color: var(--text-secondary); font-size: 0.8rem;">${new Date(tx.date || Date.now()).toLocaleDateString('es-VE')}</span>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="
                  font-weight: 800;
                  font-size: 1.05rem;
                  color: ${tx.amount > 0 ? 'var(--success)' : 'var(--text-primary)'};
                  font-family: 'JetBrains Mono', monospace;
                ">
                  ${tx.amount > 0 ? '+' : ''}€${Math.abs(tx.amount).toFixed(2)} EUR
                </div>
                <small style="color: var(--text-muted); font-size: 0.75rem;">${tx.status === 'completed' ? '✓ Exitoso' : 'Pendiente'}</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Top-Up Modal Event Handler
  container.querySelector('#topup-btn').addEventListener('click', () => {
    openTopUpModal(container, currentUser, () => renderWallet(container));
  });
}

function openTopUpModal(container, currentUser, onComplete) {
  const bcvRate = getBcvEuroRate();
  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = `
    position: fixed; inset: 0; z-index: 3000;
    background: rgba(10, 15, 24, 0.85); backdrop-filter: blur(16px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
  `;

  modalOverlay.innerHTML = `
    <div class="diorama-card-3d glass-panel" style="
      width: 100%; max-width: 440px; padding: 24px; border-radius: 24px;
      background: var(--surface-card); border: 2px solid var(--accent-primary);
      box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(255,193,7,0.3);
      animation: dioramaLand 0.3s ease-out;
    ">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
        <h3 style="color: var(--text-primary); margin: 0; font-size: 1.3rem; font-weight:800;">⚡ Recargar Billetera (Euros BCV)</h3>
        <button id="close-topup" style="color:var(--text-secondary); font-size: 1.3rem; cursor:pointer; background:none; border:none;">✕</button>
      </div>

      <div style="background: var(--surface-elevated); padding: 14px; border-radius: 16px; margin-bottom: 20px; border: 1px solid var(--border-color);">
        <small style="color:var(--text-secondary); display:block; margin-bottom:4px;">Datos para Pago Móvil (Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)}):</small>
        <div style="color:var(--accent-primary); font-weight:700; font-size:0.9rem;">📱 Teléfono: 0414-555-0000</div>
        <div style="color:var(--text-primary); font-weight:600; font-size:0.85rem;">🪪 RIF: J-501234567 · Banesco (0134)</div>
      </div>

      <form id="topup-form" style="display:flex; flex-direction:column; gap: 16px;">
        <div>
          <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Monto a recargar (€ EUR):</label>
          <input type="number" id="topup-amount" value="10.00" min="1" step="0.5" required style="
            width:100%; padding:14px; border-radius:14px; border:1px solid var(--border-gold);
            background:var(--surface-input); color:white; font-size:1.1rem; font-weight:700; outline:none;
          ">
        </div>

        <div>
          <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Número de Referencia (6 dígitos):</label>
          <input type="text" id="topup-ref" placeholder="Ej: 849201" required maxLength="8" style="
            width:100%; padding:14px; border-radius:14px; border:1px solid var(--border-color);
            background:var(--surface-input); color:white; font-size:1rem; outline:none;
          ">
        </div>

        <button type="submit" class="btn btn-3d primary-btn" style="
          width:100%; padding:16px; font-weight:800; font-size:1.1rem; margin-top:8px;
          background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%); color:#121824;
        ">
          ✓ CONFIRMAR RECARGA
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  modalOverlay.querySelector('#close-topup').addEventListener('click', () => {
    modalOverlay.remove();
  });

  modalOverlay.querySelector('#topup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(modalOverlay.querySelector('#topup-amount').value) || 10.00;
    const ref = modalOverlay.querySelector('#topup-ref').value || 'REC-' + Math.floor(Math.random() * 899999 + 100000);

    const newBalance = (currentUser.walletBalance || 25.00) + amount;
    db.update('users', currentUser.id, { walletBalance: newBalance });

    db.insert('transactions', {
      userId: currentUser.id,
      type: 'TOP_UP',
      amount: amount,
      currency: 'EUR',
      description: `Recarga Pago Móvil Ref: ${ref}`,
      date: new Date().toISOString(),
      status: 'completed'
    });

    const vesEquivalent = formatVes(amount);
    showToast(`¡Recarga exitosa de €${amount.toFixed(2)} EUR (~ ${vesEquivalent})!`, 'success');
    modalOverlay.remove();
    onComplete();
  });
}
