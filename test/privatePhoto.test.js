import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalPhotoPath,
  createPrivatePhotoLoader,
  disposeAllPrivatePhotos,
  hydratePrivatePhotos,
  isPrivatePhotoPath,
  neutralizePrivatePhoto,
  userPhotoEndpoint
} from '../src/utils/privatePhoto.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Doble mínimo de elemento: solo lo que el cargador usa. */
function makeImg({ photoPath = null } = {}) {
  return {
    dataset: photoPath === null ? {} : { privatePhoto: photoPath },
    isConnected: true,
    src: '',
    disconnect() { this.isConnected = false; }
  };
}

function makeHarness({ responder } = {}) {
  const requested = [];
  const created = [];
  const revoked = [];
  let sequence = 0;
  const loader = createPrivatePhotoLoader({
    loadUrl: async endpoint => {
      requested.push(endpoint);
      const url = responder ? await responder(endpoint, ++sequence) : `blob:foto-${++sequence}`;
      if (url) created.push(url);
      return url;
    },
    revokeUrl: url => revoked.push(url)
  });
  return { loader, requested, created, revoked };
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('la ruta se reconoce con y sin el prefijo /api y siempre se pide la canónica', () => {
  assert.equal(userPhotoEndpoint('user_1'), '/api/users/user_1/photo');
  assert.equal(isPrivatePhotoPath('/api/users/user_1/photo'), true);
  // Registro antiguo: sin /api. Se reconoce, pero se pide con prefijo.
  assert.equal(isPrivatePhotoPath('/users/user_1/photo'), true);
  assert.equal(canonicalPhotoPath('/users/user_1/photo'), '/api/users/user_1/photo');
  assert.equal(canonicalPhotoPath('/api/users/user_1/photo'), '/api/users/user_1/photo');

  for (const ajeno of ['https://ejemplo.test/foto.png', '/users/user_1/photo/extra', '/apix/users/a/photo', '', null, 42]) {
    assert.equal(isPrivatePhotoPath(ajeno), false, `no debía reconocerse: ${ajeno}`);
    assert.equal(canonicalPhotoPath(ajeno), null);
  }
});

test('neutralizePrivatePhoto vacía la ruta privada y deja pasar el resto', () => {
  assert.equal(neutralizePrivatePhoto('/api/users/user_1/photo'), '');
  assert.equal(neutralizePrivatePhoto('/users/user_1/photo'), '');
  assert.equal(neutralizePrivatePhoto('https://ejemplo.test/a.png'), 'https://ejemplo.test/a.png');
  assert.equal(neutralizePrivatePhoto(null), '');
});

test('crear el cargador no pide nada', () => {
  const { requested } = makeHarness();
  assert.deepEqual(requested, [], 'nada se descarga hasta que una pantalla lo necesita');
});

test('cargar pide la ruta autenticada una sola vez', async () => {
  const { loader, requested, created } = makeHarness();
  assert.equal(await loader.load('/users/user_1/photo'), 'blob:foto-1');
  assert.equal(await loader.load('/users/user_1/photo'), 'blob:foto-1');
  assert.deepEqual(requested, ['/api/users/user_1/photo'], 'una sola petición, y con /api');
  assert.equal(created.length, 1);
  assert.equal(loader.openCount, 1);
});

test('dos cargas simultáneas comparten la petición', async () => {
  const espera = deferred();
  const { loader, requested } = makeHarness({ responder: () => espera.promise });
  const a = loader.load('/api/users/user_1/photo');
  const b = loader.load('/api/users/user_1/photo');
  espera.resolve('blob:unica');
  assert.deepEqual(await Promise.all([a, b]), ['blob:unica', 'blob:unica']);
  assert.equal(requested.length, 1);
});

test('una ruta que no es de fotografía privada no dispara ninguna petición', async () => {
  const { loader, requested, created } = makeHarness();
  assert.equal(await loader.load('https://ejemplo.test/avatar.png'), null);
  assert.equal(await loader.load(''), null);
  assert.equal(await loader.load(null), null);
  assert.deepEqual(requested, []);
  assert.deepEqual(created, []);
});

test('reemplazar la fotografía propia revoca la anterior', async () => {
  let n = 0;
  const { loader, revoked } = makeHarness({ responder: () => `blob:v${++n}` });
  await loader.load('/api/users/user_1/photo', { key: 'propia' });
  assert.equal(loader.openCount, 1);

  loader.release('propia');
  assert.deepEqual(revoked, ['blob:v1'], 'la anterior se revoca al soltarla');
  assert.equal(loader.openCount, 0);

  await loader.load('/api/users/user_1/photo', { key: 'propia' });
  assert.equal(loader.openCount, 1, 'y la nueva ocupa su lugar');
});

test('cerrar la vista revoca todas las object URLs', async () => {
  const { loader, created, revoked } = makeHarness();
  await loader.load('/api/users/user_1/photo');
  await loader.load('/api/users/user_2/photo');
  assert.equal(loader.openCount, 2);

  loader.releaseAll();

  assert.deepEqual(revoked.slice().sort(), created.slice().sort());
  assert.equal(loader.openCount, 0);
});

test('cambiar de persona revoca la anterior antes de pedir la nueva', async () => {
  const { loader, requested, revoked } = makeHarness();
  await loader.load('/api/users/user_1/photo');
  loader.releaseAll();
  await loader.load('/api/users/user_2/photo');

  assert.deepEqual(requested, ['/api/users/user_1/photo', '/api/users/user_2/photo']);
  assert.deepEqual(revoked, ['blob:foto-1']);
  assert.equal(loader.openCount, 1, 'solo vive la de la persona actual');
});

test('destruir revoca todo y bloquea nuevas cargas', async () => {
  const { loader, created, revoked, requested } = makeHarness();
  await loader.load('/api/users/user_1/photo');

  loader.destroy();

  assert.deepEqual(revoked, created);
  assert.equal(loader.destroyed, true);
  assert.equal(await loader.load('/api/users/user_2/photo'), null);
  assert.equal(requested.length, 1, 'no se lanza ninguna petición nueva');
});

test('una respuesta tardía tras cerrar se revoca y no toca el DOM', async () => {
  const espera = deferred();
  const { loader, created, revoked } = makeHarness({ responder: () => espera.promise });
  const img = makeImg({ photoPath: '/api/users/user_1/photo' });

  const enVuelo = loader.applyTo(img, '/api/users/user_1/photo');
  loader.releaseAll();
  espera.resolve('blob:tardia');

  assert.equal(await enVuelo, null);
  assert.deepEqual(created, ['blob:tardia']);
  assert.deepEqual(revoked, ['blob:tardia'], 'la URL tardía se revoca de inmediato');
  assert.equal(img.src, '', 'y el elemento no se toca');
  assert.equal(loader.openCount, 0);
});

test('un elemento desconectado no se actualiza', async () => {
  const espera = deferred();
  const { loader } = makeHarness({ responder: () => espera.promise });
  const img = makeImg({ photoPath: '/api/users/user_1/photo' });

  const enVuelo = loader.applyTo(img, '/api/users/user_1/photo');
  img.disconnect();
  espera.resolve('blob:para-elemento-muerto');

  assert.equal(await enVuelo, null);
  assert.equal(img.src, '');
});

test('un 401, un 403 o un 404 no crean object URL ni rompen la pantalla', async () => {
  // getPrivateFileUrl devuelve null en los tres casos: son indistinguibles.
  const { loader, created, revoked } = makeHarness({ responder: () => null });
  const img = makeImg({ photoPath: '/api/users/ajeno/photo' });

  assert.equal(await loader.applyTo(img, '/api/users/ajeno/photo'), null);

  assert.deepEqual(created, [], 'sin contenido no hay object URL');
  assert.deepEqual(revoked, [], 'y nada que revocar');
  assert.equal(img.src, '', 'el avatar neutro se queda');
  assert.equal(loader.destroyed, false, 'la pantalla sigue viva');
});

test('un fallo de red se trata como ausencia, no como excepción', async () => {
  const { loader } = makeHarness({ responder: () => { throw new Error('red caída'); } });
  const img = makeImg({ photoPath: '/api/users/user_1/photo' });
  assert.equal(await loader.applyTo(img, '/api/users/user_1/photo'), null);
  assert.equal(img.src, '');
});

test('hidratar solo actúa sobre los elementos marcados', async () => {
  const { loader, requested } = makeHarness();
  const marcado = makeImg({ photoPath: '/api/users/user_1/photo' });
  const sinMarcar = makeImg();
  const container = { querySelectorAll: () => [marcado] };

  await hydratePrivatePhotos(container, loader);

  assert.deepEqual(requested, ['/api/users/user_1/photo']);
  assert.equal(marcado.src, 'blob:foto-1');
  assert.equal(sinMarcar.src, '', 'lo no marcado conserva su avatar neutro');
});

test('el cierre global revoca las object URLs de todos los cargadores', async () => {
  const uno = makeHarness();
  const dos = makeHarness();
  await uno.loader.load('/api/users/user_1/photo');
  await dos.loader.load('/api/users/user_2/photo');

  disposeAllPrivatePhotos();

  assert.deepEqual(uno.revoked, uno.created);
  assert.deepEqual(dos.revoked, dos.created);
  assert.equal(uno.loader.destroyed, true);
  assert.equal(dos.loader.destroyed, true);
});

test('clearApp cierra las fotografías antes de desconectar el DOM', () => {
  // Cableado: main.js es un módulo de Vite (import.meta.env) y no se puede
  // importar bajo Node, así que se comprueba sobre el código fuente el orden,
  // que es lo que aquí importa.
  const main = fs.readFileSync(path.join(raiz, 'src', 'main.js'), 'utf8');
  assert.ok(main.includes("import { disposeAllPrivatePhotos } from './utils/privatePhoto.js'"));
  const inicio = main.indexOf('function clearApp()');
  assert.notEqual(inicio, -1);
  const cuerpo = main.slice(inicio, main.indexOf('\n}', inicio));
  const cierre = cuerpo.indexOf('disposeAllPrivatePhotos()');
  const vaciado = cuerpo.indexOf("appContainer.innerHTML = ''");
  assert.notEqual(cierre, -1, 'clearApp debe cerrar las fotografías');
  assert.ok(cierre < vaciado, 'y hacerlo antes de desconectar el DOM');
});

test('ninguna pantalla inyecta ya una ruta de fotografía privada en un src', () => {
  // Pin de regresión de H-2: la ruta privada en un `src` no funciona, porque el
  // navegador no envía la sesión. Debe pasar por el cargador o neutralizarse.
  const sospechosos = [
    'src/components/digitalReceiptModal.js',
    'src/components/ratingTipModal.js',
    'src/components/driverRatingModal.js',
    'src/components/chatModal.js',
    'src/pages/driver/activeTrip.js',
    'src/pages/driver/incomingRide.js',
    'src/pages/admin/fleetMap.js',
    'src/pages/admin/usersManagement.js',
    'src/pages/passenger/activeRide.js'
  ];
  for (const relativo of sospechosos) {
    const fuente = fs.readFileSync(path.join(raiz, relativo), 'utf8');
    assert.ok(
      fuente.includes('privatePhoto.js'),
      `${relativo}: debe pasar por el módulo de fotografías privadas`
    );
    // Ningún `src` compone directamente la ruta protegida.
    assert.ok(
      !/src="\$\{[^}]*\.photoUrl[^}]*\}"/.test(fuente.replace(/neutralizePrivatePhoto\([^)]*\)/g, 'NEUTRO')),
      `${relativo}: no puede inyectar photoUrl crudo en un src`
    );
  }
});
