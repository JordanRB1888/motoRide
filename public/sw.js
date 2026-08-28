const CACHE_NAME = '58express-pwa-v14-scheduled-push';
// Prefijo común de todas las cachés de la aplicación: permite retirar las
// versiones anteriores sin tocar cachés de terceros.
const CACHE_PREFIX = '58express-pwa-';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app-icon-brand-192.png',
  '/app-icon-brand-512.png',
  '/apple-touch-icon-brand-180.png',
  '/favicon-brand-48.png',
  '/brand-logo-v2.png',
  '/brand-logo-header.png',
  '/notification-icon-brand-192.png',
  '/notification-badge-brand-96.png',
  '/manifest.json'
];

// Imágenes públicas de ruta fija: no dependen del despliegue ni de la sesión.
// Solo las carpetas de recursos de marca y los archivos sueltos de la raíz
// pública. Una carpeta desconocida como /uploads/ o /documents/ puede
// contener material privado, así que la extensión por sí sola no basta.
const PUBLIC_IMAGE_PREFIXES = ['/vehicles/', '/icons/'];
const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|webp|svg|ico)$/i;
// Un único segmento en la raíz: /logo.png sí, /documents/cedula.jpg no.
const ROOT_IMAGE_PATTERN = /^\/[^/]+\.(?:png|jpe?g|gif|webp|svg|ico)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * Nada de lo dinámico o autenticado debe llegar a la caché: peticiones que no
 * sean GET, API, websockets, el propio worker, cualquier petición que lleve
 * credenciales y todo lo que venga de otro origen.
 */
function isCacheable(request) {
  if (request.method !== 'GET') return false;
  if (request.headers.has('Authorization')) return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== self.location.origin) return false;

  const path = url.pathname;
  // Ruta exacta y descendientes: `/api` sin barra final es tan dinámico como
  // `/api/trips`.
  if (path === '/api' || path.startsWith('/api/')) return false;
  if (path === '/socket.io' || path.startsWith('/socket.io/')) return false;
  if (path === '/sw.js') return false;

  return true;
}

/** Solo se guardan respuestas propias, correctas y no redirigidas. */
function isStorableResponse(response) {
  return Boolean(
    response &&
    response.ok &&
    response.type === 'basic' &&
    !response.redirected
  );
}

/**
 * Escribe en la caché y devuelve una promesa que solo resuelve cuando el
 * `cache.put` ha terminado de verdad. Nunca se lanza una escritura suelta en
 * segundo plano: quien llama debe poder esperarla o entregarla a waitUntil.
 * Falla en silencio ante cuota agotada o almacenamiento no disponible.
 */
async function putInCache(request, response) {
  if (!isStorableResponse(response)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    return true;
  } catch {
    return false;
  }
}

function isImmutableBundle(url) {
  // Vite emite /assets/<nombre>-<hash>.<ext>: el hash cambia con cada build.
  return url.pathname.startsWith('/assets/');
}

function isPublicImage(url) {
  const path = url.pathname;
  // Los recursos precargados en la instalación siempre son públicos.
  if (ASSETS_TO_CACHE.includes(path)) return true;
  if (PUBLIC_IMAGE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return IMAGE_EXTENSION_PATTERN.test(path);
  }
  return ROOT_IMAGE_PATTERN.test(path);
}

/** HTML: red primero, con la última copia buena como respaldo sin conexión. */
async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    // La copia de respaldo queda escrita antes de responder: si el worker se
    // detiene justo después, el fallback offline ya está en disco.
    await putInCache('/index.html', networkResponse);
    return networkResponse;
  } catch (error) {
    const fallback = await caches.match('/index.html');
    // Sin respaldo se propaga el fallo real: ocultarlo dejaría la pantalla en
    // blanco sin explicación.
    if (!fallback) throw error;
    return fallback;
  }
}

/** Bundles con hash: se sirven de caché y solo se piden la primera vez. */
async function handleImmutableBundle(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const networkResponse = await fetch(request);
  await putInCache(request, networkResponse);
  return networkResponse;
}

/** Imágenes públicas: respuesta inmediata y actualización en segundo plano. */
async function handlePublicImage(request, event) {
  const cached = await caches.match(request);
  // La promesa incluye la escritura, no solo la descarga: así waitUntil
  // mantiene vivo el worker hasta que el cache.put haya terminado.
  const revalidation = fetch(request)
    .then(async (networkResponse) => {
      await putInCache(request, networkResponse);
      return networkResponse;
    })
    .catch(() => null);

  if (cached) {
    event?.waitUntil(revalidation);
    return cached;
  }
  const networkResponse = await revalidation;
  if (networkResponse) return networkResponse;
  throw new Error('IMAGE_UNAVAILABLE');
}

/**
 * Resto de recursos propios: se prefiere la red y no se acumulan en caché de
 * forma indefinida; la copia guardada solo se usa si la red falla.
 */
async function handleOtherSameOrigin(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match(request);
    if (!cached) throw error;
    return cached;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Las exclusiones se aplican antes que cualquier estrategia, incluida la de
  // navegación: una navegación a /api/private o hacia otro origen no debe
  // interceptarse ni acabar sustituyendo el fallback /index.html.
  if (!isCacheable(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  const url = new URL(request.url);

  if (isImmutableBundle(url)) {
    event.respondWith(handleImmutableBundle(request));
    return;
  }

  if (isPublicImage(url)) {
    event.respondWith(handlePublicImage(request, event));
    return;
  }

  event.respondWith(handleOtherSameOrigin(request));
});

/* ==========================================================================
 * Web Push
 *
 * El manejador anterior pintaba en la pantalla de bloqueo lo que viniera del
 * servidor: `event.data.text()` caia directo al cuerpo de la notificacion. Un
 * payload equivocado --o un error de programacion en el backend-- podia
 * mostrar la direccion de recogida o el nombre del pasajero en una pantalla
 * que se ve sin desbloquear el telefono.
 *
 * Aqui el payload es una estructura CERRADA: version, tipo y el identificador
 * de enrutado. El texto vive en este fichero, no viaja. No existe ningun
 * camino por el que una cadena del servidor llegue a la notificacion.
 * ========================================================================== */

const PUSH_PAYLOAD_VERSION = 1;

/**
 * Unica fuente de los textos. Un tipo desconocido no se muestra: no se inventa
 * un texto por defecto, porque ese texto por defecto seria justamente la
 * puerta por la que volveria a colarse contenido no previsto.
 */
const PUSH_TEXTS = {
  ride_request: {
    title: 'Nueva solicitud de viaje',
    body: 'Tienes una nueva solicitud disponible.'
  },
  // Transporte Seguro. Los textos viven AQUI, como los demas: el servidor
  // manda un tipo, nunca una cadena, asi que por esta puerta no puede
  // colarse una direccion ni un nombre a la pantalla de bloqueo.
  scheduled_offer: {
    title: 'Traslado programado disponible',
    body: 'Te ofrecen cubrir un traslado programado. Abre la app para verlo.'
  },
  scheduled_pickup_due: {
    title: 'Es hora de tu traslado programado',
    body: 'Tu traslado programado comienza ahora. Abre la app para ir a la recogida.'
  },
  scheduled_cancelled: {
    title: 'Traslado programado cancelado',
    body: 'Un traslado que tenias comprometido fue cancelado.'
  }
};

/**
 * @returns {{tipo: string, tripId: string|null}|null} null significa
 *   «no mostrar nada»: payload ausente, ilegible, de otra version o de un tipo
 *   que este worker no conoce.
 */
function leerPayloadPush(event) {
  if (!event || !event.data) return null;

  let datos;
  try {
    datos = event.data.json();
  } catch {
    // Ni siquiera se intenta `event.data.text()`: ese era el fallo original.
    return null;
  }
  if (!datos || typeof datos !== 'object') return null;
  if (datos.v !== PUSH_PAYLOAD_VERSION) return null;

  const tipo = datos.t;
  // hasOwnProperty y no `PUSH_TEXTS[tipo]`: un tipo como "constructor" o
  // "__proto__" encontraria algo en la cadena de prototipos y pasaria por
  // valido.
  if (typeof tipo !== 'string' || !Object.prototype.hasOwnProperty.call(PUSH_TEXTS, tipo)) return null;

  const tripId = typeof datos.tripId === 'string' && datos.tripId !== '' ? datos.tripId : null;
  return { tipo, tripId };
}

self.addEventListener('push', (event) => {
  const payload = leerPayloadPush(event);
  if (!payload) return;

  const textos = PUSH_TEXTS[payload.tipo];
  const opciones = {
    body: textos.body,
    icon: '/notification-icon-brand-192.png',
    badge: '/notification-badge-brand-96.png',
    vibrate: [300, 100, 300],
    // Una etiqueta por viaje: repetir el aviso de la misma carrera reemplaza
    // la notificacion en vez de apilar una torre. El identificador de viaje no
    // revela nada privado por si solo.
    tag: payload.tripId ? `${payload.tipo}:${payload.tripId}` : payload.tipo,
    renotify: true,
    // Solo lo minimo para enrutar al abrir. Ni nombre, ni telefono, ni
    // direcciones, ni importe.
    data: { v: PUSH_PAYLOAD_VERSION, t: payload.tipo, tripId: payload.tripId }
  };

  // Deliberadamente SIN `actions`. El worker declaraba «ACEPTAR CARRERA» y
  // `notificationclick` ni siquiera leia `event.action`: prometia algo que no
  // hacia. Aceptar un viaje exige sesion autenticada y pasa por el flujo de la
  // aplicacion, no por un boton de la pantalla de bloqueo.
  event.waitUntil(self.registration.showNotification(textos.title, opciones));
});

/** Ventana de esta misma aplicacion, sea cual sea la ruta que tenga abierta. */
function esClientePropio(cliente) {
  try {
    return new URL(cliente.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const datos = event.notification.data || {};
  const tripId = typeof datos.tripId === 'string' && datos.tripId !== '' ? datos.tripId : null;

  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Antes solo se enfocaba una ventana cuya URL contuviera `#/driver`. Con
    // la aplicacion abierta en la pantalla de inicio no coincidia, asi que se
    // abria una SEGUNDA ventana del PWA teniendo una delante. Ahora vale
    // cualquier ventana del mismo origen y la navegacion se pide por mensaje.
    const propia = ventanas.find(esClientePropio);

    if (propia) {
      if (typeof propia.focus === 'function') await propia.focus();
      propia.postMessage({ type: 'push:navigate', target: 'driver_ride_request', tripId });
      return;
    }

    if (typeof self.clients.openWindow === 'function') {
      await self.clients.openWindow('/#/driver');
    }
  })());
});

/**
 * El navegador rota el endpoint cada cierto tiempo. Si nadie se entera, la
 * suscripcion muere en silencio.
 *
 * Aqui NO se contacta con el backend. Un service worker no tiene sesion: no
 * guarda el JWT ni puede obtenerlo, y mandar un alta sin autenticar seria un
 * endpoint anonimo capaz de escribir en la base. Lo que se hace es resuscribir
 * en el navegador --que si es posible sin credenciales-- y avisar a las
 * ventanas abiertas de que hace falta volver a registrar en el servidor. Si no
 * hay ninguna abierta, la reconciliacion del proximo arranque en primer plano
 * lo resuelve.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    let resuscrita = false;
    try {
      const clave = event.oldSubscription?.options?.applicationServerKey;
      if (clave && self.registration?.pushManager?.subscribe) {
        await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: clave
        });
        resuscrita = true;
      }
    } catch {
      resuscrita = false;
    }

    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const cliente of ventanas) {
      if (!esClientePropio(cliente)) continue;
      cliente.postMessage({ type: 'push:resubscribe-required', resubscribed: resuscrita });
    }
  })());
});
