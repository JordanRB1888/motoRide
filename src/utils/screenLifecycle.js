/** Owns animation frames and global listeners for one rendered screen. */
export function createScreenLifecycle({ window: viewport = globalThis.window, onFrame } = {}) {
  if (typeof onFrame !== 'function') throw new Error('SCREEN_LIFECYCLE_REQUIRES_ON_FRAME');

  const listeners = [];
  let frameId = null;
  let disposed = false;
  let observer = null;
  const reducedMotion = viewport?.matchMedia?.('(prefers-reduced-motion: reduce)') || null;

  function addListener(target, type, handler, options) {
    if (disposed || !target?.addEventListener) return handler;
    target.addEventListener(type, handler, options);
    listeners.push([target, type, handler, options]);
    return handler;
  }

  function renderFrame(time) {
    if (disposed) return;
    onFrame(time);
    if (!disposed) frameId = viewport.requestAnimationFrame(renderFrame);
  }

  function start() {
    if (disposed || frameId !== null) return;
    if (reducedMotion?.matches) {
      onFrame(viewport.performance?.now?.() ?? 0);
      return;
    }
    frameId = viewport.requestAnimationFrame(renderFrame);
  }

  function stop() {
    if (frameId === null) return;
    viewport.cancelAnimationFrame(frameId);
    frameId = null;
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    stop();
    listeners.forEach(([target, type, handler, options]) => target.removeEventListener?.(type, handler, options));
    listeners.length = 0;
    observer?.disconnect?.();
    observer = null;
  }

  function closeWhenDetached(node) {
    const Observer = viewport.MutationObserver;
    if (!Observer || !node) return;
    observer = new Observer(() => {
      if (viewport.document?.body?.contains(node)) return;
      cleanup();
    });
    observer.observe(viewport.document.body, { childList: true, subtree: true });
  }

  if (reducedMotion?.addEventListener) {
    addListener(reducedMotion, 'change', () => { stop(); start(); });
  }

  return {
    addListener,
    start,
    stop,
    cleanup,
    closeWhenDetached,
    get disposed() { return disposed; },
    get animating() { return frameId !== null; },
    get listenerCount() { return listeners.length; }
  };
}
