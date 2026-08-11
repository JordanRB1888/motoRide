const CACHE_NAME = '58express-pwa-v11-modern-ui';
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

// Push Notification Listeners for Background Alerts
self.addEventListener('push', (event) => {
  let data = { title: '⚡ ¡NUEVA SOLICITUD DE CARRERA!', body: 'Un cliente está solicitando mototaxi cerca de ti.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'Entra a la app para aceptar el viaje.',
    icon: data.icon || '/notification-icon-brand-192.png',
    badge: data.badge || '/notification-badge-brand-96.png',
    vibrate: [300, 100, 300, 100, 300],
    data: { url: '/#/driver' },
    actions: [
      { action: 'accept', title: '⚡ ACEPTAR CARRERA' },
      { action: 'dismiss', title: 'Cerrar' }
    ]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let client of clientList) {
        if (client.url.includes('#/driver') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/#/driver');
      }
    })
  );
});
