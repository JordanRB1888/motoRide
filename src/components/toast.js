import { icon } from '../utils/icons.js';

let toastContainer = null;

function initToastContainer() {
  if (toastContainer) return;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container-master';
  Object.assign(toastContainer.style, {
    position: 'fixed',
    top: 'max(12px, env(safe-area-inset-top))',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    zIndex: 99999,
    width: 'min(calc(100% - 28px), 356px)',
    pointerEvents: 'none'
  });
  document.body.appendChild(toastContainer);
}

const typeConfigs = {
  success: { color: '#24D781', glow: 'rgba(36, 215, 129, 0.13)', icon: 'check', border: 'rgba(36, 215, 129, 0.32)' },
  error: { color: '#FF596B', glow: 'rgba(255, 89, 107, 0.13)', icon: 'alertCircle', border: 'rgba(255, 89, 107, 0.32)' },
  warning: { color: '#FFC400', glow: 'rgba(255, 196, 0, 0.12)', icon: 'alertTriangle', border: 'rgba(255, 196, 0, 0.34)' },
  info: { color: '#FFC400', glow: 'rgba(255, 196, 0, 0.10)', icon: 'info', border: 'rgba(255, 196, 0, 0.28)' }
};

export function showToast(message, type = 'info', duration = 3200) {
  initToastContainer();
  if (toastContainer.children.length >= 3) closeToast(toastContainer.firstElementChild);

  const config = typeConfigs[type] || typeConfigs.info;
  const toast = document.createElement('div');
  toast.className = 'custom-toast-pill-master';
  toast.dataset.toastType = type;
  toast.style.setProperty('--toast-tone', config.color);
  toast.style.setProperty('--toast-glow', config.glow);
  toast.style.setProperty('--toast-border', config.border);
  Object.assign(toast.style, {
    color: '#FFFFFF',
    border: `1px solid ${config.border}`,
    borderRadius: '14px',
    padding: '8px 10px',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    position: 'relative',
    overflow: 'hidden',
    transform: 'translateY(-18px) scale(0.96)',
    opacity: '0',
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    pointerEvents: 'auto'
  });

  const badge = document.createElement('div');
  badge.className = 'custom-toast-icon';
  badge.style.cssText = `width:27px;height:27px;border-radius:8px;background:${config.glow};color:${config.color};display:grid;place-items:center;flex:none;box-shadow:0 0 10px ${config.color}22`;
  badge.innerHTML = icon(config.icon, 15);

  const text = document.createElement('div');
  text.className = 'custom-toast-copy';
  Object.assign(text.style, {
    flex: '1',
    fontSize: '0.76rem',
    fontWeight: '750',
    lineHeight: '1.3',
    fontFamily: "'Outfit', 'Inter', sans-serif"
  });
  text.textContent = message;

  const close = document.createElement('button');
  close.className = 'custom-toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar aviso');
  close.innerHTML = icon('close', 14);
  close.onclick = () => closeToast(toast);

  const progress = document.createElement('div');
  progress.className = 'custom-toast-progress';
  Object.assign(progress.style, {
    position: 'absolute',
    bottom: '0',
    left: '0',
    height: '2px',
    background: config.color,
    width: '100%',
    transition: `width ${duration}ms linear`
  });

  toast.append(badge, text, close, progress);
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0) scale(1)';
    toast.style.opacity = '1';
    requestAnimationFrame(() => { progress.style.width = '0%'; });
  });

  toast.dataset.timeoutId = setTimeout(() => closeToast(toast), duration);
  return { close: () => closeToast(toast) };
}

function closeToast(toast) {
  if (!toast || toast.dataset.closing) return;
  toast.dataset.closing = 'true';
  clearTimeout(Number(toast.dataset.timeoutId));
  toast.style.transform = 'translateY(-12px) scale(0.97)';
  toast.style.opacity = '0';
  setTimeout(() => toast.remove(), 300);
}
