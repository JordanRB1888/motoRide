/**
 * Ciclo de vida de una pantalla con animación.
 *
 * El enrutador vacía el contenedor en cada cambio de ruta. Eso desconecta el
 * DOM y nada más: un `requestAnimationFrame` encadenado se sigue reprogramando
 * y los oyentes puestos en `window` siguen vivos, sujetando el DOM viejo. Entrar
 * a una pantalla, salir y volver dejaba dos bucles y dos juegos de oyentes; a la
 * tercera, tres.
 *
 * Esto lo lleva la cuenta por la pantalla: quién puso qué, para poder retirarlo
 * todo de una vez y una sola vez.
 *
 * Va aparte de la pantalla para poder probarlo ejecutándolo. `landing.js` arrastra
 * `socketClient.js`, que lee `import.meta.env`, y eso no existe fuera de Vite:
 * importar la pantalla en una prueba revienta antes de llegar a nada.
 */

/**
 * @param {object} opciones
 * @param {object} [opciones.window] el objeto global; inyectable para pruebas.
 * @param {(time: number) => void} opciones.onFrame lo que se dibuja en cada
 *   fotograma. Debe ser idempotente: con movimiento reducido se llama una vez.
 */
export function createScreenLifecycle({ window: ventana = globalThis.window, onFrame } = {}) {
  if (typeof onFrame !== 'function') throw new Error('SCREEN_LIFECYCLE_REQUIRES_ON_FRAME');

  /** Lo que hay que retirar al cerrar: [objetivo, tipo, handler, opciones]. */
  const oyentes = [];
  let frameId = null;
  let cerrado = false;
  let observador = null;

  /**
   * Quien pide menos movimiento no recibe un bucle perpetuo.
   *
   * El CSS ya frena sus propias animaciones, pero un bucle de JavaScript sigue
   * repintando sesenta veces por segundo: ni el sistema deja de gastar batería
   * ni la escena deja de moverse. Se dibuja un fotograma --para que nada quede
   * a medio colocar-- y ahí se queda.
   */
  const consulta = ventana?.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  const prefiereMenosMovimiento = () => Boolean(consulta?.matches);

  /** Registra un oyente y se apunta cómo retirarlo. */
  function addListener(objetivo, tipo, handler, opciones) {
    if (cerrado || !objetivo?.addEventListener) return handler;
    objetivo.addEventListener(tipo, handler, opciones);
    oyentes.push([objetivo, tipo, handler, opciones]);
    return handler;
  }

  function paso(time) {
    if (cerrado) return;
    onFrame(time);
    // Se comprueba otra vez: `onFrame` puede haber cerrado la pantalla.
    if (cerrado) return;
    frameId = ventana.requestAnimationFrame(paso);
  }

  /** Arranca la animación, o dibuja un único fotograma si se pide menos movimiento. */
  function start() {
    if (cerrado || frameId !== null) return;
    if (prefiereMenosMovimiento()) {
      onFrame(ventana.performance?.now?.() ?? 0);
      return;
    }
    frameId = ventana.requestAnimationFrame(paso);
  }

  function stop() {
    if (frameId === null) return;
    ventana.cancelAnimationFrame(frameId);
    frameId = null;
  }

  /**
   * Cierra la pantalla. Idempotente: llamarlo dos veces no cancela un fotograma
   * ajeno ni retira nada por segunda vez.
   */
  function cleanup() {
    if (cerrado) return;
    cerrado = true;
    stop();
    for (const [objetivo, tipo, handler, opciones] of oyentes) {
      objetivo.removeEventListener?.(tipo, handler, opciones);
    }
    oyentes.length = 0;
    observador?.disconnect?.();
    observador = null;
  }

  /**
   * Cierra sola cuando `nodo` deja de estar en el documento.
   *
   * Mismo patrón de desmontaje que el resto de pantallas del proyecto; no se
   * inventa nada nuevo.
   */
  function closeWhenDetached(nodo) {
    const Observador = ventana.MutationObserver;
    if (!Observador || !nodo) return;
    observador = new Observador(() => {
      if (ventana.document?.body?.contains(nodo)) return;
      cleanup();
    });
    observador.observe(ventana.document.body, { childList: true, subtree: true });
  }

  // Si la preferencia cambia en caliente, la escena se adapta sin recargar.
  if (consulta?.addEventListener) {
    addListener(consulta, 'change', () => { stop(); start(); });
  }

  return {
    addListener,
    start,
    stop,
    cleanup,
    closeWhenDetached,
    get disposed() { return cerrado; },
    get animating() { return frameId !== null; },
    get listenerCount() { return oyentes.length; }
  };
}
