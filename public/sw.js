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
const PUBLIC_IMAGE_PREFIXES = ['/vehicles/', '/icons/'];
const PUBLIC_IMAGE_PATTERN = /\.(?:png|jpe?g|gif|webp|svg|ico)$/i;

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
  if (path.startsWith('/api/')) return false;
  if (path.startsWith('/socket.io/')) return false;
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

function putInCache(request, response) {
  if (!isStorableResponse(response)) return;
  const copy = response.clone();
  caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, copy))
    .catch(() => { /* Cuota agotada o almacenamiento no disponible. */ });
}

function isImmutableBundle(url) {
  // Vite emite /assets/<nombre>-<hash>.<ext>: el hash cambia con cada build.
  return url.pathname.startsWith('/assets/');
}

function isPublicImage(url) {
  if (PUBLIC_IMAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
  return PUBLIC_IMAGE_PATTERN.test(url.pathname);
}

/** HTML: red primero, con la última copia buena como respaldo sin conexión. */
async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    if (isStorableResponse(networkResponse)) {
      putInCache('/index.html', networkResponse);
    }
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
  putInCache(request, networkResponse);
  return networkResponse;
}

/** Imágenes públicas: respuesta inmediata y actualización en segundo plano. */
async function handlePublicImage(request, event) {
  const cached = await caches.match(request);
  const networkFetch = fetch(request)
    .then((networkResponse) => {
      putInCache(request, networkResponse);
      return networkResponse;
    })
    .catch(() => null);

  if (cached) {
    // La revalidación continúa aunque ya se haya respondido: sin waitUntil el
    // navegador puede detener el worker antes de que termine.
    event?.waitUntil(networkFetch);
    return cached;
  }
  const networkResponse = await networkFetch;
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

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Todo lo no cacheable sigue su curso normal hacia la red, sin intervención.
  if (!isCacheable(request)) return;

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
