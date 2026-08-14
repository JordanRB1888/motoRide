/**
 * Carga bajo demanda de fotografías privadas.
 *
 * Una fotografía de perfil ya no es accesible por URL: exige sesión y una
 * relación válida. El navegador no envía la cabecera de sesión al resolver un
 * `<img src>`, así que hay que pedirla con `fetch` autenticado y convertir la
 * respuesta en object URL.
 *
 * Cada object URL tiene un único dueño —este cargador— y se revoca al
 * reemplazarla, al cambiar de persona o de viaje, al cerrar la vista, al
 * cerrar sesión y en cada cambio de ruta. Nada se pide hasta que una pantalla
 * lo necesita de verdad.
 */

/** Registro global para poder cerrar todo sin conocer cada instancia. */
const liveLoaders = new Set();

/** Ruta autenticada de la fotografía de una persona. */
export function userPhotoEndpoint(userId) {
  return `/api/users/${encodeURIComponent(String(userId ?? ''))}/photo`;
}

/**
 * ¿Este valor es una ruta de fotografía privada servida por la aplicación?
 *
 * Los registros antiguos guardan `/users/:id/photo` sin el prefijo `/api`. Esa
 * ruta no llega al backend: cae en el rewrite de la SPA y devuelve HTML con
 * estado 200, de modo que el fallo aparece como una imagen rota. Se reconocen
 * ambas formas y siempre se pide la canónica.
 */
export function isPrivatePhotoPath(value) {
  // Se admite una version en la query (`?v=2`): un reemplazo de la fotografia
  // debe poder distinguirse aunque el identificador no cambie.
  return typeof value === 'string' && /^\/(?:api\/)?users\/[^/?#]+\/photo(?:\?[^#]*)?$/.test(value.trim());
}

/** Normaliza cualquiera de las dos formas a la ruta autenticada. */
export function canonicalPhotoPath(value) {
  if (!isPrivatePhotoPath(value)) return null;
  const path = value.trim();
  return path.startsWith('/api/') ? path : `/api${path}`;
}

/**
 * Devuelve el valor solo si NO es una fotografía privada.
 *
 * Sirve para las pantallas que no deben pedirla —recibos, listados, historial—
 * y que ya tienen un avatar de reserva. Inyectar la ruta privada en un `src`
 * no funcionaría: el navegador no envía la sesión y recibiría un 401.
 */
export function neutralizePrivatePhoto(value) {
  return isPrivatePhotoPath(value) ? '' : (value || '');
}

export function createPrivatePhotoLoader({
  loadUrl,
  revokeUrl = url => URL.revokeObjectURL(url)
} = {}) {
  /** clave -> object URL vigente. */
  const opened = new Map();
  /** clave -> petición en curso, para no descargar dos veces lo mismo. */
  const pending = new Map();
  /**
   * clave -> huecos del DOM que muestran esa fotografía.
   *
   * Revocar el object URL no basta: el `<img>` seguiría apuntando a una URL
   * muerta y el avatar local seguiría oculto. Al soltar una clave hay que
   * devolver el hueco a su estado neutro.
   */
  const bindings = new Map();
  /**
   * clave -> numero de generacion de esa clave.
   *
   * `releaseAll` invalida todo de golpe subiendo la generacion global, pero
   * `release(key)` solo puede invalidar lo suyo: sin esto, una peticion en
   * curso para esa clave sobrevivia y `applyTo` pintaba la respuesta vieja
   * despues de haberla soltado.
   */
  const keyGenerations = new Map();
  const keyGeneration = key => keyGenerations.get(key) || 0;
  let generation = 0;
  let destroyed = false;

  /**
   * Devuelve un hueco a su estado neutro: sin imagen y con el avatar local
   * visible. Tolera elementos ya desconectados del documento.
   */
  const restoreSlot = (element) => {
    if (!element) return;
    element.removeAttribute?.('src');
    if ('src' in element) element.src = '';
    element.hidden = true;
    const local = element.parentElement?.querySelector?.('[data-local-avatar]');
    if (local) local.hidden = false;
  };

  const restoreKey = (key) => {
    for (const element of bindings.get(key) || []) restoreSlot(element);
    bindings.delete(key);
  };

  /** Libera todo, restaura los huecos e invalida lo que siga en vuelo. */
  const releaseAll = () => {
    for (const url of opened.values()) revokeUrl(url);
    for (const key of [...bindings.keys()]) restoreKey(key);
    opened.clear();
    pending.clear();
    bindings.clear();
    for (const key of [...keyGenerations.keys()]) keyGenerations.set(key, keyGeneration(key) + 1);
    generation += 1;
  };

  /** Libera una sola, por ejemplo al sustituir la fotografía propia. */
  const release = (key) => {
    // Invalida lo que siga descargándose para esta clave, sin tocar las demás.
    keyGenerations.set(key, keyGeneration(key) + 1);
    pending.delete(key);
    const url = opened.get(key);
    restoreKey(key);
    if (!url) return;
    revokeUrl(url);
    opened.delete(key);
  };

  /**
   * Obtiene la fotografía de `photoPath`, o null si no hay, no se puede o el
   * acceso no corresponde. Nunca lanza: un 401, un 403 y un 404 se tratan
   * igual, porque para la interfaz los tres significan «muestra el avatar
   * neutro».
   */
  function load(photoPath, { key = photoPath } = {}) {
    if (destroyed) return Promise.resolve(null);
    const endpoint = canonicalPhotoPath(photoPath);
    if (!endpoint) return Promise.resolve(null);

    const already = opened.get(key);
    if (already) return Promise.resolve(already);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const requestedAt = generation;
    const keyRequestedAt = keyGeneration(key);
    let request;
    request = (async () => {
      try {
        const url = await loadUrl(endpoint).catch(() => null);
        // Respuesta tardía: la vista se cerró, cambió de persona o esta clave
        // concreta se soltó mientras la descarga seguía en curso.
        if (destroyed || requestedAt !== generation || keyRequestedAt !== keyGeneration(key)) {
          if (url) revokeUrl(url);
          return null;
        }
        if (!url) return null;
        // Defensa: si algo dejara una URL previa bajo la misma clave, se revoca
        // antes de sustituirla para que ninguna quede sin dueño.
        const displaced = opened.get(key);
        if (displaced && displaced !== url) revokeUrl(displaced);
        opened.set(key, url);
        return url;
      } finally {
        // Solo el dueño de la entrada puede retirarla: una petición invalidada
        // no debe borrar la que ocupó su lugar.
        if (pending.get(key) === request) pending.delete(key);
      }
    })();

    pending.set(key, request);
    return request;
  }

  /**
   * Aplica la fotografía a un elemento cuando llegue, sin bloquear el pintado.
   * Si el elemento se desconecta mientras tanto, no se toca y la URL se
   * conserva bajo su clave para que la revoque el cierre de la vista.
   */
  async function applyTo(element, photoPath, options = {}) {
    if (!element) return null;
    const url = await load(photoPath, options);
    if (!url || destroyed || !element.isConnected) return null;
    element.src = url;
    // El hueco se pinta con el avatar local y la imagen nace oculta: al llegar
    // la fotografia autorizada, una sustituye visualmente al otro. Si nunca
    // llega, el avatar local se queda donde esta.
    if (element.hidden) element.hidden = false;
    const local = element.parentElement?.querySelector?.('[data-local-avatar]');
    if (local) local.hidden = true;
    // Se recuerda el hueco para poder devolverlo a su estado neutro al soltar.
    const clave = options.key ?? photoPath;
    const huecos = bindings.get(clave) || new Set();
    huecos.add(element);
    bindings.set(clave, huecos);
    return url;
  }

  const loader = {
    load,
    applyTo,
    release,
    releaseAll,
    destroy() {
      releaseAll();
      destroyed = true;
      liveLoaders.delete(loader);
    },
    get destroyed() { return destroyed; },
    get openCount() { return opened.size; }
  };
  liveLoaders.add(loader);
  return loader;
}

/**
 * Sustituye el avatar neutro por la fotografía real en los elementos marcados.
 *
 * El marcado se pinta siempre con un estado neutro y solo después se piden las
 * fotografías que el usuario tenga derecho a ver. Si no la tiene, si el acceso
 * no corresponde o si la vista se cierra antes, el avatar neutro se queda.
 */
export function hydratePrivatePhotos(container, loader) {
  if (!container || !loader || loader.destroyed) return Promise.resolve();
  const elements = [...container.querySelectorAll('[data-private-photo]')];
  return Promise.all(elements.map(element => {
    const path = element.dataset.privatePhoto;
    return path ? loader.applyTo(element, path, { key: path }) : null;
  }));
}

/**
 * Registro de object URLs sueltas que no pertenecen a un cargador.
 *
 * Las vistas previas de un formulario no son fotografías privadas, pero
 * comparten el mismo problema: si la pantalla desaparece mientras el modal
 * sigue abierto, nadie las revoca. Se apuntan aquí para que el cierre global
 * las alcance igual.
 */
const looseObjectUrls = new Set();

/** Crea una object URL con dueño: queda registrada hasta que se revoque. */
export function createOwnedObjectUrl(blob) {
  const url = URL.createObjectURL(blob);
  looseObjectUrls.add(url);
  return url;
}

/** Revoca una URL registrada. Repetirlo no hace nada: nunca se revoca dos veces. */
export function revokeOwnedObjectUrl(url) {
  if (!url || !looseObjectUrls.has(url)) return false;
  looseObjectUrls.delete(url);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Cierra todos los cargadores vivos.
 *
 * El enrutador vacía el contenedor en cada cambio de ruta, y eso desconecta el
 * DOM pero no libera las object URLs. Este es el punto único por el que pasan
 * el cierre de sesión y cualquier navegación interna.
 */
export function disposeAllPrivatePhotos() {
  for (const loader of [...liveLoaders]) loader.destroy();
  liveLoaders.clear();
  for (const url of [...looseObjectUrls]) revokeOwnedObjectUrl(url);
}
