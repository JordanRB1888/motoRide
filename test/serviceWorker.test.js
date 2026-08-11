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
function loadServiceWorker({ networkResponses = {}, networkFailsFor = [] } = {}) {
  const code = fs.readFileSync(swPath, 'utf8');
  const listeners = new Map();
  const store = new Map();
  const fetchCalls = [];

  const makeCache = name => ({
    async put(request, response) {
      if (!store.has(name)) store.set(name, new Map());
      store.get(name).set(keyOf(request), response);
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
      waitUntil: promise => pending.push(promise),
      respondWith: promise => { wrapped.response = promise; }
    };
    handler(wrapped);
    await Promise.allSettled(pending);
    return wrapped;
  };

  return { listeners, store, caches, fetchCalls, self, dispatch };
}

const CURRENT_CACHE = '58express-pwa-v11-modern-ui';

test('el nombre de caché está versionado y v10 ya no es la caché activa', () => {
  const code = fs.readFileSync(swPath, 'utf8');
  const match = code.match(/const CACHE_NAME = '([^']+)'/);
  assert.ok(match, 'No se encontró CACHE_NAME');
  assert.equal(match[1], CURRENT_CACHE);
  assert.notEqual(match[1], '58express-pwa-v10-brand-icon');
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
