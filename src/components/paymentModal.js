import { icon } from '../utils/icons.js';

export function createPaymentModal(options = {}) {
  const {
    currentMethod = 'wallet',
    walletBalance = 0,
    onSelect = () => {},
    onTopUp = () => {}
  } = options;

  let selectedMethod = currentMethod;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(5px)',
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    opacity: '0',
    visibility: 'hidden',
    transition: 'opacity 0.3s ease, visibility 0.3s'
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    backgroundColor: 'var(--primary-surface, #121824)',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '24px',
    transform: 'translateY(100%)',
    transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxHeight: '90vh',
    overflowY: 'auto'
  });

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
  
  const title = document.createElement('h2');
  title.textContent = 'Método de pago';
  Object.assign(title.style, { color: 'var(--text-primary, #F8FAFC)', margin: 0, fontSize: '20px', fontWeight: '700' });
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = icon('x', { size: 24 });
  Object.assign(closeBtn.style, { background: 'none', border: 'none', color: 'var(--text-secondary, #94A3B8)', cursor: 'pointer' });
  closeBtn.onclick = close;
  
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Wallet Card
  const walletCard = document.createElement('div');
  Object.assign(walletCard.style, {
    background: 'linear-gradient(135deg, var(--elevated-surface, #273449) 0%, rgba(39, 52, 73, 0.5) 100%)',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  });

  const balanceInfo = document.createElement('div');
  balanceInfo.innerHTML = `
    <div style="color:var(--text-secondary, #94A3B8); font-size:14px; margin-bottom:4px;">Saldo disponible</div>
    <div style="color:var(--accent-primary, #FFC107); font-size:28px; font-weight:700;">$${walletBalance.toFixed(2)}</div>
  `;

  const topUpBtn = document.createElement('button');
  topUpBtn.textContent = 'Recargar';
  Object.assign(topUpBtn.style, {
    background: 'rgba(255, 193, 7, 0.1)',
    color: 'var(--accent-primary, #FFC107)',
    border: '1px solid var(--accent-primary, #FFC107)',
    padding: '8px 16px',
    borderRadius: '20px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  });
  topUpBtn.onclick = onTopUp;
  topUpBtn.onmouseenter = () => topUpBtn.style.background = 'rgba(255, 193, 7, 0.2)';
  topUpBtn.onmouseleave = () => topUpBtn.style.background = 'rgba(255, 193, 7, 0.1)';

  walletCard.appendChild(balanceInfo);
  walletCard.appendChild(topUpBtn);

  // Methods List
  const methodsContainer = document.createElement('div');
  Object.assign(methodsContainer.style, { display: 'flex', flexDirection: 'column', gap: '12px' });

  const methods = [
    { id: 'wallet', name: 'Billetera Express', desc: 'Pago inmediato, sin comisiones', icon: 'wallet', color: '#FFC107' },
    { id: 'pago_movil', name: 'Pago Móvil', desc: 'Transferencia bancaria local', icon: 'smartphone', color: '#00D2FF' },
    { id: 'zelle', name: 'Zelle', desc: 'Transferencia en USD', icon: 'dollar-sign', color: '#743ee4' },
    { id: 'zinli', name: 'Zinli', desc: 'Billetera digital', icon: 'credit-card', color: '#ff4d4d' },
    { id: 'efectivo', name: 'Efectivo', desc: 'Pago al conductor', icon: 'banknote', color: '#00E676' }
  ];

  const renderMethods = () => {
    methodsContainer.innerHTML = '';
    methods.forEach(m => {
      const isSelected = selectedMethod === m.id;
      
      const el = document.createElement('div');
      Object.assign(el.style, {
        display: 'flex',
        alignItems: 'center',
        padding: '16px',
        background: 'var(--card-surface, #1E293B)',
        borderRadius: '12px',
        border: isSelected ? '2px solid var(--accent-primary, #FFC107)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: isSelected ? '0 0 15px rgba(255, 193, 7, 0.15)' : 'none'
      });

      const iconBg = document.createElement('div');
      Object.assign(iconBg.style, {
        width: '40px', height: '40px', borderRadius: '10px',
        background: `${m.color}20`, color: m.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginRight: '16px'
      });
      iconBg.innerHTML = icon(m.icon, { size: 20 });

      const textInfo = document.createElement('div');
      Object.assign(textInfo.style, { flex: 1 });
      textInfo.innerHTML = `
        <div style="color:var(--text-primary, #F8FAFC); font-weight:600; font-size:16px;">${m.name}</div>
        <div style="color:var(--text-secondary, #94A3B8); font-size:13px; margin-top:4px;">${m.desc}</div>
      `;

      const radioBtn = document.createElement('div');
      Object.assign(radioBtn.style, {
        width: '24px', height: '24px', borderRadius: '50%',
        border: isSelected ? '7px solid var(--accent-primary, #FFC107)' : '2px solid var(--text-secondary, #94A3B8)',
        background: isSelected ? 'transparent' : 'transparent',
        transition: 'all 0.2s'
      });

      el.appendChild(iconBg);
      el.appendChild(textInfo);
      el.appendChild(radioBtn);

      el.onclick = () => {
        selectedMethod = m.id;
        renderMethods();
      };

      methodsContainer.appendChild(el);
    });
  };

  renderMethods();

  // Confirm Button
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirmar selección';
  Object.assign(confirmBtn.style, {
    width: '100%',
    padding: '16px',
    background: 'var(--accent-primary, #FFC107)',
    color: '#121824',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '700',
    marginTop: '10px',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(255, 193, 7, 0.3)'
  });
  confirmBtn.onclick = () => {
    onSelect(selectedMethod);
    close();
  };

  modal.appendChild(header);
  modal.appendChild(walletCard);
  modal.appendChild(methodsContainer);
  modal.appendChild(confirmBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function open() {
    overlay.style.visibility = 'visible';
    overlay.style.opacity = '1';
    setTimeout(() => {
      modal.style.transform = 'translateY(0)';
    }, 10);
  }

  function close() {
    modal.style.transform = 'translateY(100%)';
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.visibility = 'hidden';
      }, 300);
    }, 100);
  }

  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return {
    element: overlay,
    open,
    close,
    getSelected: () => selectedMethod
  };
}
