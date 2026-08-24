import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const swPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'sw.js'
);

const ORIGIN = 'https://plus58express.test';

/** Respuesta simulada: controla ok/type/redirected, que es lo que filtra el worker. */
function makeResponse({ ok = true, status = 200, type = 'basic', redirected = false, body = 'contenido' } = {}) {
  const response = { ok, status, type, redirected, body };
  response.clone = () => ({ ...response, clone: response.clone });
  return response;
}

function makeRequest(url, { method = 'GET', mode = 'no-cors', headers = {} } = {}) {
  const absolute = url.startsWith('http') ? url : `${ORIGIN}${url}`;
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    url: absolute,
    method,
    mode,
    headers: { has: name => name.toLowerCase() in lower, get: name => lower[name.toLowerCase()] ?? null }
  };
}

const keyOf = request => (typeof request === 'string' ? `${ORIGIN}${request}` : request.url);

/** Carga public/sw.js en un contexto aislado con dobles de la Cache API. */
function loadServiceWorker({ networkResponses = {}, networkFailsFor = [], putDelayMs = 0 } = {}) {
  const code = fs.readFileSync(swPath, 'utf8');
  const listeners = new Map();
  const store = new Map();
  const fetchCalls = [];
  // Se marca cuándo termina de verdad cada escritura, para comprobar que las
  // estrategias esperan al cache.put y no lo dejan suelto en segundo plano.
  const writes = { completed: 0 };

  const makeCache = name => ({
    async put(request, response) {
      if (putDelayMs) await new Promise(resolve => setTimeout(resolve, putDelayMs));
      if (!store.has(name)) store.set(name, new Map());
      store.get(name).set(keyOf(request), response);
      writes.completed += 1;
    },
    async match(request) {
      return store.get(name)?.get(keyOf(request)) ?? undefined;
    },
    async addAll(urls) {
      if (!store.has(name)) store.set(name, new Map());
      for (const url of urls) store.get(name).set(keyOf(url), makeResponse());
    }
  });

  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      return makeCache(name);
    },
    async keys() { return [...store.keys()]; },
    async delete(name) { return store.delete(name); },
    async match(request) {
      for (const entries of store.values()) {
        const hit = entries.get(keyOf(request));
        if (hit) return hit;
      }
      return undefined;
    }
  };

  const fetchDouble = async (request) => {
    const url = keyOf(request);
    fetchCalls.push(url);
    if (networkFailsFor.some(fragment => url.includes(fragment))) {
      throw new Error('NETWORK_FAILURE');
    }
    const pathname = new URL(url).pathname;
    return networkResponses[pathname] ?? makeResponse();
  };

  const self = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    skipWaiting: () => { self.skipWaitingCalled = true; },
    clients: { claim: () => { self.claimCalled = true; }, matchAll: async () => [], openWindow: async () => null },
    location: { origin: ORIGIN },
    registration: { showNotification: async () => {} },
    skipWaitingCalled: false,
    claimCalled: false
  };

  const context = { self, caches, fetch: fetchDouble, URL, Response, Error, console, clients: self.clients, setTimeout };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'sw.js' });

  const dispatch = async (type, event) => {
    const handler = listeners.get(type);
    assert.ok(handler, `El worker no registró un listener de ${type}`);
    const pending = [];
    const wrapped = {
      ...event,
      pending,
      waitUntil: promise => pending.push(promise),
      respondWith: promise => { wrapped.response = promise; }
    };
    handler(wrapped);
    // `waitUntil` puede registrarse más tarde, ya dentro de la estrategia
    // asíncrona, así que `pending` se expone para esperarlo desde la prueba.
    await Promise.allSettled(pending);
    return wrapped;
  };

  return { listeners, store, caches, fetchCalls, self, dispatch, writes };
}

// El nombre se lee del propio service worker en vez de repetirse aquí. Fijar
// el literal obligaba a tocar este archivo en cada subida de versión —y una
// subida es justo lo que hay que hacer cuando cambian los iconos, que tienen
// nombre fijo y se sirven desde caché—. Lo que el contrato debe garantizar no
// es «se llama así», sino que esté versionado y que solo avance.
const CURRENT_CACHE = (fs.readFileSync(swPath, 'utf8').match(/const CACHE_NAME = '([^']+)'/) || [])[1];

// Última versión publicada en producción. Subir este número al desplegar una
// nueva; nunca bajarlo.
const VERSION_MINIMA = 12;

test('el nombre de caché está versionado y solo puede avanzar', () => {
  assert.ok(CURRENT_CACHE, 'No se encontró CACHE_NAME');
  const match = CURRENT_CACHE.match(/^58express-pwa-v(\d+)-[a-z0-9-]+$/);
  assert.ok(match,
    `CACHE_NAME debe seguir el patrón 58express-pwa-v<N>-<motivo>, y es "${CURRENT_CACHE}"`);
  // Retroceder dejaría a los teléfonos ya instalados sirviendo desde su caché
  // el esqueleto y los iconos antiguos, que es exactamente el fallo que esta
  // versión existe para evitar.
  assert.ok(Number(match[1]) >= VERSION_MINIMA,
    `la versión de caché no puede retroceder: v${match[1]} es anterior a v${VERSION_MINIMA}`);
});

test('install precarga el esqueleto y llama a skipWaiting', async () => {
  const sw = loadServiceWorker();
  await sw.dispatch('install', {});
  assert.equal(sw.self.skipWaitingCalled, true);
  const cache = sw.store.get(CURRENT_CACHE);
  assert.ok(cache, 'No se creó la caché actual');
  assert.ok(cache.has(`${ORIGIN}/index.html`));
  assert.ok(cache.has(`${ORIGIN}/manifest.json`));
});

test('activate borra las cachés previas de +58Express y conserva las ajenas', async () => {
  const sw = loadServiceWorker();
  await (await sw.caches.open('58express-pwa-v10-brand-icon')).put('/viejo.txt', makeResponse());
  await (await sw.caches.open('58express-pwa-v9-legacy')).put('/mas-viejo.txt', makeResponse());
  await (await sw.caches.open('otra-app-cache')).put('/ajeno.txt', makeResponse());
  await (await sw.caches.open(CURRENT_CACHE)).put('/index.html', makeResponse());

  await sw.dispatch('activate', {});

  const restantes = (await sw.caches.keys()).sort();
  assert.deepEqual(restantes, [CURRENT_CACHE, 'otra-app-cache'].sort());
  assert.equal(sw.self.claimCalled, true, 'clients.claim() debe seguir ejecutándose');
});

test('la navegación usa network-first y guarda el fallback', async () => {
  const sw = loadServiceWorker();
  const evento = await sw.dispatch('fetch', { request: makeRequest('/', { mode: 'navigate' }) });
  await evento.response;
  const guardado = sw.store.get(CURRENT_CACHE)?.get(`${ORIGIN}/index.html`);
  assert.ok(guardado, 'La copia de /index.html debía quedar en caché');
});

test('sin red, la navegación devuelve el /index.html almacenado', async () => {
  const sw = loadServiceWorker({ networkFailsFor: ['/'] });
  await (await sw.caches.open(CURRENT_CACHE)).put('/index.html', makeResponse({ body: 'offline' }));
  const evento = await sw.dispatch('fetch', { request: makeRequest('/', { mode: 'navigate' }) });
  const respuesta = await evento.response;
  assert.equal(respuesta.body, 'offline');
});

test('sin red y sin fallback, el error se propaga en vez de ocultarse', async () => {
  const sw = loadServiceWorker({ networkFailsFor: ['/'] });
  const evento = await sw.dispatch('fetch', { request: makeRequest('/', { mode: 'navigate' }) });
  await assert.rejects(() => evento.response, /NETWORK_FAILURE/);
});

test('nunca se almacenan peticiones dinámicas ni autenticadas', async () => {
  const casos = [
    { nombre: 'POST', request: makeRequest('/assets/x.js', { method: 'POST' }) },
    { nombre: 'API', request: makeRequest('/api/trips/active/me') },
    { nombre: 'socket.io', request: makeRequest('/socket.io/?EIO=4') },
    { nombre: 'sw.js', request: makeRequest('/sw.js') },
    { nombre: 'Authorization', request: makeRequest('/assets/y.css', { headers: { Authorization: 'Bearer x' } }) },
    { nombre: 'otro origen', request: makeRequest('https://cdn.externo.test/lib.js') }
  ];

  for (const { nombre, request } of casos) {
    const sw = loadServiceWorker();
    const evento = await sw.dispatch('fetch', { request });
    // El worker no intercepta: deja pasar la petición a la red sin tocarla.
    assert.equal(evento.response, undefined, `${nombre} no debía interceptarse`);
    assert.equal(sw.store.size, 0, `${nombre} no debía almacenarse`);
  }
});

test('las respuestas incorrectas, redirigidas o de otro tipo no se almacenan', async () => {
  const casos = [
    { nombre: '404', response: makeResponse({ ok: false, status: 404 }) },
    { nombre: 'redirigida', response: makeResponse({ redirected: true }) },
    { nombre: 'opaca', response: makeResponse({ type: 'opaque' }) },
    { nombre: 'cors', response: makeResponse({ type: 'cors' }) }
  ];
  for (const { nombre, response } of casos) {
    const sw = loadServiceWorker({ networkResponses: { '/assets/app-abc123.js': response } });
    const evento = await sw.dispatch('fetch', { request: makeRequest('/assets/app-abc123.js') });
    await evento.response;
    const cache = sw.store.get(CURRENT_CACHE);
    assert.ok(!cache || !cache.has(`${ORIGIN}/assets/app-abc123.js`), `${nombre} no debía almacenarse`);
  }
});

test('los bundles de /assets/ son cache-first', async () => {
  const sw = loadServiceWorker();
  const request = makeRequest('/assets/index-BhXfzlqk.js');

  const primera = await sw.dispatch('fetch', { request });
  await primera.response;
  assert.equal(sw.fetchCalls.length, 1, 'la primera vez debe ir a la red');
  assert.ok(sw.store.get(CURRENT_CACHE).has(`${ORIGIN}/assets/index-BhXfzlqk.js`));

  const segunda = await sw.dispatch('fetch', { request });
  await segunda.response;
  assert.equal(sw.fetchCalls.length, 1, 'la segunda vez debe servirse de caché sin tocar la red');
});

test('las imágenes públicas usan stale-while-revalidate', async () => {
  const sw = loadServiceWorker({ networkResponses: { '/vehicles/moto-real.png': makeResponse({ body: 'nueva' }) } });
  const request = makeRequest('/vehicles/moto-real.png');
  await (await sw.caches.open(CURRENT_CACHE)).put('/vehicles/moto-real.png', makeResponse({ body: 'guardada' }));

  const evento = await sw.dispatch('fetch', { request });
  const respuesta = await evento.response;
  // Responde de inmediato con lo almacenado...
  assert.equal(respuesta.body, 'guardada');
  // ...y revalida contra la red en segundo plano.
  assert.equal(sw.fetchCalls.length, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sw.store.get(CURRENT_CACHE).get(`${ORIGIN}/vehicles/moto-real.png`).body, 'nueva');
});

test('una imagen pública sin copia previa se sirve de la red y se guarda', async () => {
  const sw = loadServiceWorker({ networkResponses: { '/app-icon-brand-192.png': makeResponse({ body: 'icono' }) } });
  const evento = await sw.dispatch('fetch', { request: makeRequest('/app-icon-brand-192.png') });
  const respuesta = await evento.response;
  assert.equal(respuesta.body, 'icono');
  assert.ok(sw.store.get(CURRENT_CACHE).has(`${ORIGIN}/app-icon-brand-192.png`));
});

test('el resto de recursos propios prefiere la red y no se acumula en caché', async () => {
  const sw = loadServiceWorker();
  const evento = await sw.dispatch('fetch', { request: makeRequest('/algun-dato.json') });
  await evento.response;
  assert.equal(sw.fetchCalls.length, 1);
  const cache = sw.store.get(CURRENT_CACHE);
  assert.ok(!cache || !cache.has(`${ORIGIN}/algun-dato.json`), 'no debe almacenarse automáticamente');
});

test('se conservan los listeners de push y notificationclick', () => {
  const sw = loadServiceWorker();
  assert.ok(sw.listeners.has('push'), 'falta el listener de push');
  assert.ok(sw.listeners.has('notificationclick'), 'falta el listener de notificationclick');
});

// --- Escrituras vinculadas al ciclo de vida ---

test('la navegación no resuelve hasta que la escritura del fallback termina', async () => {
  const sw = loadServiceWorker({ putDelayMs: 40 });
  const evento = await sw.dispatch('fetch', { request: makeRequest('/', { mode: 'navigate' }) });
  await evento.response;
  assert.equal(sw.writes.completed, 1, 'el cache.put debía haber terminado antes de responder');
  assert.ok(sw.store.get(CURRENT_CACHE).has(`${ORIGIN}/index.html`));
});

test('el bundle inmutable no resuelve hasta que la escritura termina', async () => {
  const sw = loadServiceWorker({ putDelayMs: 40 });
  const evento = await sw.dispatch('fetch', { request: makeRequest('/assets/index-abc123.js') });
  await evento.response;
  assert.equal(sw.writes.completed, 1, 'el cache.put debía haber terminado antes de responder');
  assert.ok(sw.store.get(CURRENT_CACHE).has(`${ORIGIN}/assets/index-abc123.js`));
});

test('una imagen sin copia previa espera la escritura antes de completar', async () => {
  const sw = loadServiceWorker({ putDelayMs: 40 });
  const evento = await sw.dispatch('fetch', { request: makeRequest('/vehicles/car-real.png') });
  await evento.response;
  assert.equal(sw.writes.completed, 1, 'el cache.put debía haber terminado antes de responder');
});

test('la promesa de waitUntil incluye la escritura, no solo la descarga', async () => {
  const sw = loadServiceWorker({
    putDelayMs: 40,
    networkResponses: { '/vehicles/moto-real.png': makeResponse({ body: 'nueva' }) }
  });
  await (await sw.caches.open(CURRENT_CACHE)).put('/vehicles/moto-real.png', makeResponse({ body: 'guardada' }));
  const escriturasIniciales = sw.writes.completed;

  const evento = await sw.dispatch('fetch', { request: makeRequest('/vehicles/moto-real.png') });
  const respuesta = await evento.response;
  assert.equal(respuesta.body, 'guardada', 'debe responder de inmediato con lo almacenado');

  assert.equal(sw.pendingCount ?? evento.pending.length, 1, 'la revalidación debía entregarse a waitUntil');
  // Al resolver lo entregado a waitUntil, la escritura ya tiene que estar hecha.
  await Promise.all(evento.pending);
  assert.equal(sw.writes.completed, escriturasIniciales + 1, 'waitUntil debe cubrir el cache.put');
  assert.equal(sw.store.get(CURRENT_CACHE).get(`${ORIGIN}/vehicles/moto-real.png`).body, 'nueva');
});

// --- Exclusiones antes de cualquier estrategia ---

test('una navegación a /api/private no se intercepta ni toca el fallback', async () => {
  const sw = loadServiceWorker();
  await (await sw.caches.open(CURRENT_CACHE)).put('/index.html', makeResponse({ body: 'original' }));
  const evento = await sw.dispatch('fetch', { request: makeRequest('/api/private', { mode: 'navigate' }) });
  assert.equal(evento.response, undefined, 'no debía interceptarse');
  assert.equal(sw.fetchCalls.length, 0, 'el worker no debía tocar la red');
  assert.equal(sw.store.get(CURRENT_CACHE).get(`${ORIGIN}/index.html`).body, 'original');
});

test('las rutas exactas /api y /socket.io quedan excluidas', async () => {
  for (const ruta of ['/api', '/socket.io', '/api/', '/socket.io/']) {
    const sw = loadServiceWorker();
    const evento = await sw.dispatch('fetch', { request: makeRequest(ruta, { mode: 'navigate' }) });
    assert.equal(evento.response, undefined, `${ruta} no debía interceptarse`);
    assert.equal(sw.store.size, 0, `${ruta} no debía almacenarse`);
  }
});

test('una navegación con Authorization no se intercepta ni sustituye el fallback', async () => {
  const sw = loadServiceWorker();
  await (await sw.caches.open(CURRENT_CACHE)).put('/index.html', makeResponse({ body: 'original' }));
  const request = makeRequest('/panel', { mode: 'navigate', headers: { Authorization: 'Bearer token' } });
  const evento = await sw.dispatch('fetch', { request });
  assert.equal(evento.response, undefined);
  assert.equal(sw.store.get(CURRENT_CACHE).get(`${ORIGIN}/index.html`).body, 'original');
});

test('una navegación hacia otro origen no se intercepta ni sustituye el fallback', async () => {
  const sw = loadServiceWorker();
  await (await sw.caches.open(CURRENT_CACHE)).put('/index.html', makeResponse({ body: 'original' }));
  const request = makeRequest('https://otro-sitio.test/pagina', { mode: 'navigate' });
  const evento = await sw.dispatch('fetch', { request });
  assert.equal(evento.response, undefined);
  assert.equal(sw.fetchCalls.length, 0);
  assert.equal(sw.store.get(CURRENT_CACHE).get(`${ORIGIN}/index.html`).body, 'original');
});

test('una navegación por POST no se intercepta', async () => {
  const sw = loadServiceWorker();
  const request = makeRequest('/formulario', { mode: 'navigate', method: 'POST' });
  const evento = await sw.dispatch('fetch', { request });
  assert.equal(evento.response, undefined);
  assert.equal(sw.store.size, 0);
});

// --- Alcance de las imágenes públicas ---

test('solo son públicas las rutas de marca y los archivos de la raíz', async () => {
  const publicas = ['/vehicles/moto-real.png', '/vehicles/car-map-real.png', '/icons/pin.svg', '/app-icon-brand-192.png', '/logo.png', '/favicon.svg'];
  for (const ruta of publicas) {
    const sw = loadServiceWorker({ networkResponses: { [ruta]: makeResponse({ body: 'img' }) } });
    const evento = await sw.dispatch('fetch', { request: makeRequest(ruta) });
    await evento.response;
    assert.ok(
      sw.store.get(CURRENT_CACHE)?.has(`${ORIGIN}${ruta}`),
      `${ruta} debía tratarse como imagen pública`
    );
  }
});

test('una ruta anidada desconocida no es pública por terminar en .png o .jpg', async () => {
  const privadas = ['/uploads/private-document.png', '/documents/cedula.jpg', '/private-uploads/licencia.webp', '/users/driver_9/photo.png'];
  for (const ruta of privadas) {
    const sw = loadServiceWorker();
    const evento = await sw.dispatch('fetch', { request: makeRequest(ruta) });
    await evento.response;
    const cache = sw.store.get(CURRENT_CACHE);
    assert.ok(!cache || !cache.has(`${ORIGIN}${ruta}`), `${ruta} no debía almacenarse`);
  }
});

test('/api/users/photo.png no se intercepta pese a parecer una imagen', async () => {
  const sw = loadServiceWorker();
  const evento = await sw.dispatch('fetch', { request: makeRequest('/api/users/photo.png') });
  assert.equal(evento.response, undefined, 'no debía interceptarse');
  assert.equal(sw.fetchCalls.length, 0);
  assert.equal(sw.store.size, 0);
});
