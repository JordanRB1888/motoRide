import { icon } from '../utils/icons.js';

export function createSlideButton(options = {}) {
  const {
    text = 'Desliza para confirmar',
    color = 'var(--accent-primary, #FFC107)',
    iconName = 'chevron-right',
    onComplete = () => {}
  } = options;

  const container = document.createElement('div');
  container.className = 'slide-button-container';
  Object.assign(container.style, {
    position: 'relative',
    width: '100%',
    height: '56px',
    background: 'var(--elevated-surface, #273449)',
    borderRadius: '28px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
  });

  // Track background filled as thumb slides
  const track = document.createElement('div');
  Object.assign(track.style, {
    position: 'absolute',
    left: '0', top: '0', bottom: '0',
    width: '56px',
    background: color,
    borderRadius: '28px',
    transition: 'width 0.1s',
    zIndex: 1
  });

  const textElem = document.createElement('div');
  textElem.textContent = text;
  Object.assign(textElem.style, {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    color: 'var(--text-secondary, #94A3B8)',
    fontWeight: '600',
    fontSize: '16px',
    zIndex: 2,
    pointerEvents: 'none',
    // Shimmer effect
    background: 'linear-gradient(90deg, #94A3B8 0%, #F8FAFC 50%, #94A3B8 100%)',
    backgroundSize: '200% auto',
    color: 'transparent',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    animation: 'shimmer 2s infinite linear'
  });

  // Inject shimmer animation keyframes if not exists
  if (!document.getElementById('slide-btn-styles')) {
    const style = document.createElement('style');
    style.id = 'slide-btn-styles';
    style.innerHTML = `
      @keyframes shimmer {
        to { background-position: 200% center; }
      }
      @keyframes popCheck {
        0% { transform: scale(0); opacity: 0; }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  const thumb = document.createElement('div');
  Object.assign(thumb.style, {
    position: 'absolute',
    left: '4px',
    top: '4px',
    width: '48px',
    height: '48px',
    background: '#121824',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: color,
    cursor: 'grab',
    zIndex: 3,
    transition: 'transform 0.1s',
    boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
  });
  thumb.innerHTML = icon(iconName, { size: 24 });

  container.appendChild(track);
  container.appendChild(textElem);
  container.appendChild(thumb);

  let isDragging = false;
  let startX = 0;
  let currentX = 0;
  let maxSlide = 0;
  let completed = false;

  const onDragStart = (e) => {
    if (completed) return;
    isDragging = true;
    startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    maxSlide = container.offsetWidth - thumb.offsetWidth - 8;
    thumb.style.transition = 'none';
    track.style.transition = 'none';
    textElem.style.opacity = '0.3';
  };

  const onDragMove = (e) => {
    if (!isDragging || completed) return;
    if (e.type.includes('touch')) e.preventDefault();
    
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    currentX = Math.max(0, Math.min(clientX - startX, maxSlide));
    
    thumb.style.transform = `translateX(${currentX}px)`;
    track.style.width = `${currentX + 56}px`;
  };

  const onDragEnd = () => {
    if (!isDragging || completed) return;
    isDragging = false;
    
    thumb.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    track.style.transition = 'width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    textElem.style.opacity = '1';
    
    if (currentX > maxSlide * 0.85) {
      // Completed
      completed = true;
      currentX = maxSlide;
      thumb.style.transform = `translateX(${currentX}px)`;
      track.style.width = '100%';
      
      // Change icon to checkmark with animation
      setTimeout(() => {
        thumb.innerHTML = `<div style="animation: popCheck 0.3s ease forwards">${icon('check', { size: 24 })}</div>`;
        thumb.style.color = 'var(--success, #00E676)';
        track.style.background = 'var(--success, #00E676)';
        
        // Haptic feedback if supported
        if (navigator.vibrate) navigator.vibrate(50);
        
        onComplete();
      }, 300);
    } else {
      // Revert
      currentX = 0;
      thumb.style.transform = `translateX(0px)`;
      track.style.width = '56px';
    }
  };

  thumb.addEventListener('touchstart', onDragStart, { passive: false });
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);
  
  thumb.addEventListener('mousedown', onDragStart);
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);

  // Add reset method to container
  container.reset = () => {
    completed = false;
    currentX = 0;
    thumb.style.transform = `translateX(0px)`;
    track.style.width = '56px';
    thumb.innerHTML = icon(iconName, { size: 24 });
    thumb.style.color = color;
    track.style.background = color;
  };

  return container;
}
