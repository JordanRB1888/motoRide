export class BottomSheet {
  constructor(options = {}) {
    this.options = {
      snapPoints: [10, 50, 90], // vh percentages
      ...options
    };
    
    this.currentSnapIndex = 0;
    this.startY = 0;
    this.currentY = 0;
    this.isDragging = false;
    this.callbacks = [];
    
    this._createDOM();
    this._attachEvents();
  }

  _createDOM() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'bottom-sheet-overlay';
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      opacity: '0',
      visibility: 'hidden',
      transition: 'opacity 0.3s ease, visibility 0.3s',
      zIndex: 8999
    });

    this.sheet = document.createElement('div');
    this.sheet.className = 'bottom-sheet';
    Object.assign(this.sheet.style, {
      position: 'fixed',
      left: '50%',
      bottom: '68px',
      width: '94%',
      maxWidth: '460px',
      height: 'auto',
      maxHeight: 'calc(82vh - 70px)',
      backgroundColor: 'var(--surface-card, #182232)',
      backdropFilter: 'blur(24px)',
      webkitBackdropFilter: 'blur(24px)',
      borderRadius: '28px',
      border: '1.5px solid var(--border-gold, #FFC107)',
      boxShadow: '0 -15px 40px rgba(0,0,0,0.8), 0 0 25px rgba(255,193,7,0.2)',
      transform: 'translate(-50%, 200%)',
      transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 9000,
      display: 'none',
      flexDirection: 'column'
    });

    this.handle = document.createElement('div');
    this.handle.className = 'bottom-sheet-handle-area';
    Object.assign(this.handle.style, {
      padding: '16px',
      display: 'flex',
      justifyContent: 'center',
      cursor: 'grab',
      touchAction: 'none'
    });

    const pill = document.createElement('div');
    Object.assign(pill.style, {
      width: '40px',
      height: '4px',
      backgroundColor: 'var(--text-secondary, #94A3B8)',
      borderRadius: '2px',
      opacity: '0.5'
    });
    this.handle.appendChild(pill);

    this.content = document.createElement('div');
    this.content.className = 'bottom-sheet-content';
    Object.assign(this.content.style, {
      flex: 1,
      overflowY: 'auto',
      padding: '0 16px 16px',
      color: 'var(--text-primary, #F8FAFC)'
    });

    this.sheet.appendChild(this.handle);
    this.sheet.appendChild(this.content);
    
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.sheet);
  }

  _attachEvents() {
    this.overlay.addEventListener('click', () => this.close());
    
    // Touch Events
    this.handle.addEventListener('touchstart', this._onDragStart.bind(this), { passive: true });
    document.addEventListener('touchmove', this._onDragMove.bind(this), { passive: false });
    document.addEventListener('touchend', this._onDragEnd.bind(this));
    
    // Mouse Events for testing
    this.handle.addEventListener('mousedown', this._onDragStart.bind(this));
    document.addEventListener('mousemove', this._onDragMove.bind(this));
    document.addEventListener('mouseup', this._onDragEnd.bind(this));
  }

  _onDragStart(e) {
    this.isDragging = true;
    this.startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    const rect = this.sheet.getBoundingClientRect();
    this.initialTransform = rect.top;
    
    this.sheet.style.transition = 'none'; // Disable transition during drag
  }

  _onDragMove(e) {
    if (!this.isDragging) return;
    
    // Prevent scrolling while dragging the handle
    if (e.type.includes('touch') && e.cancelable) {
      e.preventDefault();
    }
    
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    const deltaY = clientY - this.startY;
    let newY = this.initialTransform + deltaY;
    
    // Prevent dragging above highest snap point
    const minSnapY = window.innerHeight * (1 - this.options.snapPoints[this.options.snapPoints.length - 1] / 100);
    if (newY < minSnapY) {
      newY = minSnapY - Math.pow(minSnapY - newY, 0.8); // Resistance
    }
    
    this.sheet.style.transform = `translateY(${newY}px)`;
  }

  _onDragEnd(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    
    this.sheet.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    
    const rect = this.sheet.getBoundingClientRect();
    const currentVh = 100 - ((rect.top / window.innerHeight) * 100);
    
    // Find closest snap point
    let closestIndex = 0;
    let minDiff = 100;
    
    this.options.snapPoints.forEach((point, index) => {
      const diff = Math.abs(currentVh - point);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });
    
    // If dragged too low, close it
    if (currentVh < this.options.snapPoints[0] / 2 && this.currentSnapIndex === 0) {
      this.close();
    } else {
      this.snapTo(closestIndex);
    }
  }

  setContent(html) {
    if (typeof html === 'string') {
      this.content.innerHTML = html;
    } else if (html instanceof HTMLElement) {
      this.content.innerHTML = '';
      this.content.appendChild(html);
    }
  }

  snapTo(index) {
    if (index < 0 || index >= this.options.snapPoints.length) return;
    
    this.currentSnapIndex = index;
    const vh = this.options.snapPoints[index];
    const translateY = 100 - vh;
    
    this.sheet.style.transform = `translate(-50%, ${translateY}vh)`;
    this._notifyStateChange();
  }

  open() {
    this.sheet.style.display = 'flex';
    this.sheet.style.visibility = 'visible';
    this.overlay.style.visibility = 'visible';
    this.overlay.style.opacity = '1';
    
    // Default to middle snap point if available, else first
    const targetIndex = this.options.snapPoints.length > 1 ? Math.floor(this.options.snapPoints.length / 2) : 0;
    this.snapTo(targetIndex);
  }

  expand() {
    this.sheet.style.display = 'flex';
    this.sheet.style.visibility = 'visible';
    this.overlay.style.visibility = 'visible';
    this.overlay.style.opacity = '1';
    const lastIndex = this.options.snapPoints.length - 1;
    this.snapTo(lastIndex);
  }

  collapse() {
    this.close();
  }

  close() {
    this.overlay.style.opacity = '0';
    this.sheet.style.transform = 'translate(-50%, 200%)';
    
    setTimeout(() => {
      this.overlay.style.visibility = 'hidden';
      this.sheet.style.visibility = 'hidden';
      this.sheet.style.display = 'none';
    }, 300);
  }

  onStateChange(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }

  _notifyStateChange() {
    const point = this.options.snapPoints[this.currentSnapIndex];
    this.callbacks.forEach(cb => cb(this.currentSnapIndex, point));
  }

  getElement() {
    return this.sheet;
  }

  destroy() {
    this.overlay.remove();
    this.sheet.remove();
  }
}
