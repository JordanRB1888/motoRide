export const composeBottomSheetTransform = (offset = '0px') => {
  const normalizedOffset = typeof offset === 'number' ? `${offset}px` : offset;
  return `translate(-50%, ${normalizedOffset})`;
};

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

    // Si cambia el ancho de la ventana, el armazon se mueve: la hoja debe
    // seguirlo o volveria a quedar descuadrada sin que nadie la reabra.
    this._onResize = () => this._syncToAppShell();
    window.addEventListener('resize', this._onResize);
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
      bottom: '80px',
      // El ancho real lo fija _syncToAppShell(): estos valores son solo el
      // arranque antes del primer sincronizado.
      width: '94%',
      maxWidth: '460px',
      height: 'auto',
      maxHeight: 'calc(85vh - 100px)',
      backgroundColor: 'var(--surface-card, #182232)',
      backdropFilter: 'blur(24px)',
      webkitBackdropFilter: 'blur(24px)',
      borderRadius: '28px',
      border: '1.5px solid var(--border-gold, #FFC107)',
      boxShadow: '0 -15px 40px rgba(0,0,0,0.8), 0 0 25px rgba(255,193,7,0.2)',
      transform: composeBottomSheetTransform('200%'),
      transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 9000,
      display: 'none',
      flexDirection: 'column'
    });

    this.handle = document.createElement('div');
    this.handle.className = 'bottom-sheet-handle-area';
    Object.assign(this.handle.style, {
      padding: '12px 16px 8px',
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
      padding: '0 16px 28px',
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
    const computedBottom = Number.parseFloat(window.getComputedStyle(this.sheet).bottom) || 0;
    this.initialTop = rect.top;
    this.dragNaturalTop = window.innerHeight - computedBottom - rect.height;

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
    let newTop = this.initialTop + deltaY;
    
    // Prevent dragging above highest snap point
    const minSnapY = window.innerHeight * (1 - this.options.snapPoints[this.options.snapPoints.length - 1] / 100);
    if (newTop < minSnapY) {
      newTop = minSnapY - Math.pow(minSnapY - newTop, 0.8); // Resistance
    }

    const dragOffset = newTop - this.dragNaturalTop;
    this.sheet.style.transform = composeBottomSheetTransform(`${dragOffset}px`);
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
    const isFarePreview = html instanceof HTMLElement && html.classList.contains('fare-preview-premium');
    const isDestinationSearch = typeof html === 'string' && html.includes('class="search-sheet"');
    const isActiveTrip = html instanceof HTMLElement && (html.classList.contains('driver-card') || html.classList.contains('active-ride'));
    const isSearchingRide = html instanceof HTMLElement && html.classList.contains('searching-ride-card');
    this.sheet.classList.toggle('fare-preview-sheet', isFarePreview);
    this.sheet.classList.toggle('destination-search-sheet', isDestinationSearch);
    this.sheet.classList.toggle('passenger-active-trip-sheet', isActiveTrip);
    this.sheet.classList.toggle('searching-ride-sheet', isSearchingRide);
    this.overlay.classList.toggle('fare-preview-overlay', isFarePreview);
    this.overlay.classList.toggle('destination-search-overlay', isDestinationSearch);
    this.overlay.classList.toggle('searching-ride-overlay', isSearchingRide);
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
    
    this.sheet.style.transform = this.sheet.classList.contains('fare-preview-sheet') || this.sheet.classList.contains('destination-search-sheet') || this.sheet.classList.contains('passenger-active-trip-sheet') || this.sheet.classList.contains('searching-ride-sheet')
      ? composeBottomSheetTransform()
      : composeBottomSheetTransform(`${translateY}vh`);
    this._notifyStateChange();
  }

  /**
   * Ancla la hoja al contenedor REAL de la aplicacion.
   *
   * La hoja es hija de <body> y usa position: fixed, asi que sin esto su
   * ancho porcentual se resuelve contra el viewport. En movil coinciden y no
   * se nota; en escritorio la aplicacion se dibuja dentro de un armazon de
   * telefono mas estrecho y la hoja se salia por la derecha.
   *
   * Se mide el armazon vivo y se fijan centro y ancho a partir de el, de modo
   * que left >= shell.left y right <= shell.right se cumplen en cualquier
   * ancho, y sobreviven a abrir, arrastrar, encajar, cerrar y reabrir porque
   * el arrastre solo toca transform.
   */
  _syncToAppShell() {
    const shell = document.querySelector('.passenger-app, .driver-app, .admin-app')
      || document.getElementById('app');
    if (!shell) return;
    const caja = shell.getBoundingClientRect();
    if (!caja.width) return;

    const MARGEN = 12;
    const ancho = Math.max(0, Math.round(caja.width - MARGEN * 2));

    // Prioridad `important`: varias reglas heredadas fijan el ancho de la
    // hoja con !important y ganarian a un estilo en linea normal. Esta es la
    // unica forma de que la medida del armazon mande, sin reescribir esas
    // reglas ni tocar las demas hojas.
    this.sheet.style.setProperty('width', `${ancho}px`, 'important');
    this.sheet.style.setProperty('max-width', 'none', 'important');
    // El centro del armazon, no el del viewport.
    this.sheet.style.setProperty('left', `${Math.round(caja.left + caja.width / 2)}px`, 'important');
  }

  open() {
    this._syncToAppShell();
    this.sheet.style.display = 'flex';
    this.sheet.style.visibility = 'visible';
    this.overlay.style.visibility = 'visible';
    this.overlay.style.opacity = '1';
    
    // Default to middle snap point if available, else first
    const targetIndex = this.options.snapPoints.length > 1 ? Math.floor(this.options.snapPoints.length / 2) : 0;
    this.snapTo(targetIndex);
  }

  expand() {
    this._syncToAppShell();
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
    this.sheet.style.transform = composeBottomSheetTransform('200%');
    
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
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.overlay.remove();
    this.sheet.remove();
  }
}
