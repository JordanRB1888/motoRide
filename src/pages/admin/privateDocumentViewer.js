/**
 * Apertura bajo demanda de documentos protegidos.
 *
 * El contenido de un documento solo se pide cuando alguien pulsa su botón, y
 * cada Blob URL creada tiene un único dueño: este visor. Abrir un expediente
 * no descarga nada; cerrarlo, cambiar de expediente, cambiar de pestaña o
 * abandonar la pantalla revoca todo lo que se hubiera abierto.
 *
 * Las dependencias se inyectan para que el ciclo de vida se pueda comprobar
 * sin navegador: `loadUrl` autoriza y devuelve una Blob URL, `revokeUrl` la
 * libera y `openUrl` la presenta.
 */

const LABEL_IDLE_IMAGE = 'Ver documento protegido';
const LABEL_IDLE_PDF = 'Ver PDF protegido';
const LABEL_BUSY = 'Abriendo documento…';
const LABEL_FAILED = 'No disponible · reintentar';

/** Ruta canónica del contenido: se compone desde el identificador, nunca se recibe hecha. */
export function documentContentEndpoint(documentId) {
  return `/driver-documents/${encodeURIComponent(documentId)}/content`;
}

export function createPrivateDocumentViewer({
  loadUrl,
  revokeUrl = url => URL.revokeObjectURL(url),
  openUrl = url => window.open(url, '_blank', 'noopener'),
  onError = () => {}
} = {}) {
  /** documentId -> Blob URL ya obtenida y todavía válida. */
  const opened = new Map();
  /** documentId -> petición en curso, para no descargar dos veces lo mismo. */
  const pending = new Map();
  /**
   * Se incrementa cada vez que lo abierto deja de ser válido (cierre, cambio de
   * expediente, destrucción). Una petición que termina con una generación vieja
   * ya no pertenece a nadie: se revoca y no toca el DOM.
   */
  let generation = 0;
  let destroyed = false;

  const isPdf = element => element?.dataset?.mime === 'application/pdf';
  const idleLabel = element => (isPdf(element) ? LABEL_IDLE_PDF : LABEL_IDLE_IMAGE);

  const setLabel = (element, text) => {
    if (!element?.isConnected) return;
    element.textContent = text;
  };

  /** Libera todo lo abierto e invalida las peticiones que sigan en vuelo. */
  const releaseAll = () => {
    for (const url of opened.values()) revokeUrl(url);
    opened.clear();
    pending.clear();
    generation += 1;
  };

  const present = (element, url) => {
    if (!element?.isConnected) return false;
    if (isPdf(element)) {
      element.textContent = 'Abrir PDF protegido';
      return true;
    }
    // La imagen se pinta sin construir HTML a partir de datos del servidor.
    element.textContent = '';
    const image = element.ownerDocument.createElement('img');
    image.src = url;
    image.alt = 'Documento privado';
    element.appendChild(image);
    return true;
  };

  /**
   * Se llama en el propio manejador del clic, sin `await` previo, para que el
   * navegador siga considerando la apertura parte del gesto del usuario.
   * Devuelve la URL ya almacenada o null si todavía hay que descargarla.
   */
  function openStored(element) {
    const documentId = element?.dataset?.privateDocument;
    const already = documentId && !destroyed ? opened.get(documentId) : null;
    if (!already) return null;
    openUrl(already);
    return already;
  }

  function open(element) {
    const documentId = element?.dataset?.privateDocument;
    if (!documentId || destroyed) return Promise.resolve(null);

    // Segunda pulsación: la URL ya está descargada y se abre de forma síncrona.
    const already = openStored(element);
    if (already) return Promise.resolve(already);

    const inFlight = pending.get(documentId);
    if (inFlight) return inFlight;

    const requestedAt = generation;
    let request;
    request = (async () => {
      try {
        setLabel(element, LABEL_BUSY);
        // Un fallo de red se trata como contenido no disponible: nunca se
        // propaga una excepción al manejador del clic.
        const url = await loadUrl(documentContentEndpoint(documentId)).catch(() => null);

        // Respuesta tardía: la pantalla murió o lo abierto ya se invalidó.
        if (destroyed || requestedAt !== generation) {
          if (url) revokeUrl(url);
          return null;
        }
        // El botón ya no está en el documento: nada que actualizar.
        if (!element.isConnected) {
          if (url) revokeUrl(url);
          return null;
        }
        if (!url) {
          // 401, 404 o red caída: no hay Blob URL que registrar ni revocar.
          setLabel(element, LABEL_FAILED);
          onError(documentId);
          return null;
        }

        // Defensa: si algo dejara una URL previa bajo la misma clave, se revoca
        // antes de sustituirla para que ninguna quede sin dueño.
        const displaced = opened.get(documentId);
        if (displaced && displaced !== url) revokeUrl(displaced);

        opened.set(documentId, url);
        if (!present(element, url)) {
          // Se desconectó entre la comprobación y el pintado.
          opened.delete(documentId);
          revokeUrl(url);
          return null;
        }
        // No se abre pestaña aquí: el gesto del usuario ya expiró y el
        // navegador bloquearía la ventana. La vista previa queda dentro del
        // expediente y una pulsación posterior la abre de forma síncrona.
        return url;
      } finally {
        // Solo el dueño de la entrada puede retirarla. Si `releaseAll` vació el
        // registro y otra petición del mismo documento ya ocupa el hueco, esta
        // no debe borrarla al terminar tarde.
        if (pending.get(documentId) === request) pending.delete(documentId);
      }
    })();

    pending.set(documentId, request);
    return request;
  }

  return {
    /** Prepara un botón sin pedir nada: la descarga ocurre en el clic. */
    attach(element) {
      if (!element || destroyed) return;
      setLabel(element, idleLabel(element));
      // Se devuelve la promesa a propósito: el DOM la ignora, pero deja el
      // ciclo de vida observable desde las pruebas.
      element.addEventListener('click', () => open(element));
    },
    open,
    openStored,
    releaseAll,
    destroy() {
      releaseAll();
      destroyed = true;
    },
    get destroyed() { return destroyed; },
    /** Solo para pruebas y diagnóstico: cuántas Blob URLs siguen vivas. */
    get openCount() { return opened.size; }
  };
}
