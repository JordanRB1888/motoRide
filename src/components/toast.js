import { icon } from '../utils/icons.js';

let toastContainer = null;

function initToastContainer() {
  if (toastContainer) return;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container-master';
  Object.assign(toastContainer.style, {
    position: 'fixed',
    top: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    zIndex: 99999,
    width: 'calc(100% - 32px)',
    maxWidth: '420px',
    pointerEvents: 'none'
  });
  document.body.appendChild(toastContainer);
}

const typeConfigs = {
  success: { color: '#00E676', bgGlow: 'rgba(0, 230, 118, 0.18)', badge: '✅', border: 'rgba(0, 230, 118, 0.4)' },
  error: { color: '#FF4D4D', bgGlow: 'rgba(255, 77, 77, 0.18)', badge: '🚨', border: 'rgba(255, 77, 77, 0.4)' },
  warning: { color: '#FFC107', bgGlow: 'rgba(255, 193, 7, 0.18)', badge: '⚡', border: 'rgba(255, 193, 7, 0.4)' },
  info: { color: '#00D2FF', bgGlow: 'rgba(0, 210, 255, 0.18)', badge: 'ℹ️', border: 'rgba(0, 210, 255, 0.4)' }
};

export function showToast(message, type = 'info', duration = 3200) {
  initToastContainer();

  // Enforce max 3 toasts
  if (toastContainer.children.length >= 3) {
    const oldestToast = toastContainer.firstElementChild;
    if (oldestToast) closeToast(oldestToast);
  }

  const config = typeConfigs[type] || typeConfigs.info;

  const toast = document.createElement('div');
  toast.className = 'custom-toast-pill-master';
  Object.assign(toast.style, {
    background: '#121824',
    color: '#FFFFFF',
    border: `1.5px solid ${config.border}`,
    borderRadius: '20px',
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    boxShadow: `0 15px 35px rgba(0,0,0,0.8), 0 0 20px ${config.bgGlow}`,
    position: 'relative',
    overflow: 'hidden',
    transform: 'translateY(-30px) scale(0.92)',
    opacity: '0',
    transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    pointerEvents: 'auto'
  });

  const badgeElem = document.createElement('div');
  badgeElem.style.cssText = `
    width: 38px; height: 38px; border-radius: 50%;
    background: ${config.bgGlow}; color: ${config.color};
    display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem; flex-shrink: 0; box-shadow: 0 0 10px ${config.color}33;
  `;
  badgeElem.innerHTML = config.badge;

  const textElem = document.createElement('div');
  Object.assign(textElem.style, {
    flex: '1',
    color: '#FFFFFF',
    fontSize: '0.95rem',
    fontWeight: '800',
    lineHeight: '1.35',
    fontFamily: "'Outfit', 'Inter', sans-serif"
  });
  textElem.textContent = message;

  const closeBtn = document.createElement('button');
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    color: '#94A3B8',
    cursor: 'pointer',
    padding: '4px',
    fontSize: '1.1rem',
    fontWeight: '900',
    display: 'flex',
    alignItems: 'center'
  });
  closeBtn.innerHTML = '✕';
  closeBtn.onclick = () => closeToast(toast);

  // Bottom animated countdown timer bar
  const progress = document.createElement('div');
  Object.assign(progress.style, {
    position: 'absolute',
    bottom: '0',
    left: '0',
    height: '3px',
    background: config.color,
    width: '100%',
    transition: `width ${duration}ms linear`
  });

  toast.appendChild(badgeElem);
  toast.appendChild(textElem);
  toast.appendChild(closeBtn);
  toast.appendChild(progress);
  
  toastContainer.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0) scale(1)';
    toast.style.opacity = '1';
    
    requestAnimationFrame(() => {
      progress.style.width = '0%';
    });
  });

  const timeoutId = setTimeout(() => {
    closeToast(toast);
  }, duration);

  toast.dataset.timeoutId = timeoutId;
}

function closeToast(toast) {
  if (toast.dataset.closing) return;
  toast.dataset.closing = 'true';
  clearTimeout(parseInt(toast.dataset.timeoutId));
  
  toast.style.transform = 'translateY(-20px) scale(0.95)';
  toast.style.opacity = '0';
  
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 350);
}
