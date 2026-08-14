import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalPhotoPath, createPrivatePhotoLoader, hydratePrivatePhotos } from '../src/utils/privatePhoto.js';
import { composeApiUrl } from '../src/services/apiUrl.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/** Recorre todo src/ en vez de una lista fija: el fallo anterior fue esa lista. */
function todosLosFuentes() {
  const salida = [];
  const recorrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completo);
      else if (entrada.name.endsWith('.js')) salida.push(path.relative(raiz, completo).split(path.sep).join('/'));
    }
  };
  recorrer(path.join(raiz, 'src'));
  return salida;
}

/** Doble mínimo de imagen. */
function makeImg(photoPath) {
  return { dataset: photoPath ? { privatePhoto: photoPath } : {}, isConnected: true, src: 'neutro' };
}

function makeHarness({ responder } = {}) {
  const requested = [];
  const revoked = [];
  let n = 0;
  const loader = createPrivatePhotoLoader({
    loadUrl: async endpoint => {
      requested.push(endpoint);
      return responder ? await responder(endpoint) : `blob:foto-${++n}`;
    },
    revokeUrl: url => revoked.push(url)
  });
  return { loader, requested, revoked };
}

// ---------------------------------------------------------------- barrido

test('ninguna pantalla deja una ruta privada directamente en un src', () => {
  const ofensores = [];
  for (const relativo of todosLosFuentes()) {
    if (relativo === 'src/utils/privatePhoto.js' || relativo === 'src/services/apiUrl.js') continue;
    // Se ignora lo que ya pasa por una salvaguarda conocida.
    const fuente = leer(relativo)
      .replace(/neutralizePrivatePhoto\([^)]*\)/g, 'NEUTRO')
      .replace(/canonicalPhotoPath\([^)]*\)/g, 'CANONICO');
    for (const [n, linea] of fuente.split('\n').entries()) {
      if (!/src="\$\{/.test(linea)) continue;
      if (/photoUrl|passengerAvatar|\.avatar\b/.test(linea) && !/startsWith\('http'\)/.test(linea)) {
        ofensores.push(`${relativo}:${n + 1}`);
      }
    }
  }
  assert.deepEqual(ofensores, [], `rutas privadas en src directo: ${ofensores.join(', ')}`);
});

test('nadie compone la URL de una fotografía con resolveUrl a mano', () => {
  const ofensores = todosLosFuentes().filter(r => /resolveUrl\([^)]*photoUrl/.test(leer(r)));
  assert.deepEqual(ofensores, [], 'resolveUrl(photoUrl) acaba en un src sin sesión');
});

test('safeImageUrl nunca recibe una ruta privada sin neutralizar', () => {
  const ofensores = [];
  for (const relativo of todosLosFuentes()) {
    for (const coincidencia of leer(relativo).match(/safeImageUrl\([^)]*\)/g) || []) {
      if (/photoUrl/.test(coincidencia) && !/neutralizePrivatePhoto/.test(coincidencia)) {
        ofensores.push(`${relativo}: ${coincidencia}`);
      }
    }
  }
  assert.deepEqual(ofensores, [], 'safeImageUrl acepta rutas de la aplicación y las devolvería tal cual');
});

// ------------------------------------------------- consumidores concretos

test('el avatar propio del conductor se carga por fetch autenticado', () => {
  const fuente = leer('src/pages/driver/driverApp.js');
  assert.ok(fuente.includes('createPrivatePhotoLoader'), 'debe usar el cargador privado');
  assert.ok(fuente.includes('getPrivateFileUrl'), 'y pedirla con la sesión en la cabecera');
  assert.ok(
    fuente.includes("privatePhotos.applyTo(container.querySelector('#driver-avatar')"),
    'debe hidratar el avatar tras pintar'
  );
  // El marcado nace neutro: la ruta privada no aparece en la plantilla.
  const plantilla = fuente.slice(fuente.indexOf('container.innerHTML = `'), fuente.indexOf('`;', fuente.indexOf('container.innerHTML = `')));
  assert.ok(!plantilla.includes('user.photoUrl'), 'la plantilla no puede llevar la ruta privada');
  assert.ok(plantilla.includes('id="driver-avatar"'), 'y conserva el nodo del diseño aprobado');
});

test('reemplazar la foto revoca la copia de la cabecera del conductor', () => {
  const app = leer('src/pages/driver/driverApp.js');
  assert.ok(app.includes('onPhotoChanged'), 'la cabecera debe enterarse del cambio');
  const i = app.indexOf('onPhotoChanged');
  const bloque = app.slice(i, i + 320);
  assert.ok(bloque.includes("privatePhotos.release('propia')"), 'y revocar la anterior');
  assert.ok(
    bloque.indexOf("release('propia')") < bloque.indexOf('applyTo'),
    'revoca antes de volver a pedirla'
  );
  assert.ok(leer('src/pages/driver/driverProfile.js').includes('notifyPhotoChanged'), 'el perfil debe avisar');
});

test('la tarjeta del conductor asignado se hidrata en vez de exponer la ruta', () => {
  const tarjeta = leer('src/pages/passenger/requestRide.js');
  assert.ok(tarjeta.includes('data-private-photo='), 'marca la imagen para hidratación');
  // Desde 2B-2-2 el estado neutro es el avatar local, no una URL externa.
  assert.ok(tarjeta.includes('localAvatarHtml('), 'y el hueco nace con el avatar local');
  assert.ok(!/src="\$\{[^"]*photoUrl/.test(tarjeta), 'sin la ruta privada en el src');

  const app = leer('src/pages/passenger/passengerApp.js');
  const i = app.indexOf('renderDriverCard(currentDriver');
  assert.notEqual(i, -1, 'passengerApp debe pintar la tarjeta');
  const despues = app.slice(i, i + 700);
  assert.ok(despues.includes('hydratePrivatePhotos'), 'y hidratarla después de insertarla');
});

// ------------------------------------------------------- comportamiento

test('la hidratación pide la ruta autenticada correcta, sin /api duplicado', async () => {
  const { loader, requested } = makeHarness();
  const img = makeImg('/api/users/user_1/photo');
  await hydratePrivatePhotos({ querySelectorAll: () => [img] }, loader);

  assert.deepEqual(requested, ['/api/users/user_1/photo']);
  const final = composeApiUrl('https://motoride-production-4ce4.up.railway.app/api', requested[0]);
  assert.equal(final, 'https://motoride-production-4ce4.up.railway.app/api/users/user_1/photo');
  assert.ok(!final.includes('/api/api'));
  assert.equal(img.src, 'blob:foto-1');
});

test('una ruta antigua sin /api se pide igualmente con el prefijo', async () => {
  const { loader, requested } = makeHarness();
  const img = makeImg('/users/user_1/photo');
  await hydratePrivatePhotos({ querySelectorAll: () => [img] }, loader);
  assert.deepEqual(requested, ['/api/users/user_1/photo'], 'siempre se pide la canónica');
  assert.equal(canonicalPhotoPath('/users/user_1/photo'), '/api/users/user_1/photo');
});

test('401, 403 y 404 dejan el avatar neutro sin crear object URL', async () => {
  for (const _ of [401, 403, 404]) {
    const { loader, revoked } = makeHarness({ responder: () => null });
    const img = makeImg('/api/users/ajeno/photo');
    await hydratePrivatePhotos({ querySelectorAll: () => [img] }, loader);
    assert.equal(img.src, 'neutro', 'el avatar neutro se conserva');
    assert.deepEqual(revoked, []);
    assert.equal(loader.openCount, 0);
  }
});

test('dos hidrataciones de la misma ruta no descargan dos veces', async () => {
  const { loader, requested } = makeHarness();
  const uno = makeImg('/api/users/user_1/photo');
  const dos = makeImg('/api/users/user_1/photo');
  await Promise.all([
    hydratePrivatePhotos({ querySelectorAll: () => [uno] }, loader),
    hydratePrivatePhotos({ querySelectorAll: () => [dos] }, loader)
  ]);
  assert.equal(requested.length, 1, 'la segunda comparte la carga en curso');
  assert.equal(uno.src, dos.src);
});

test('cerrar o cambiar de viaje revoca los object URLs de la tarjeta', async () => {
  const { loader, revoked } = makeHarness();
  await hydratePrivatePhotos({ querySelectorAll: () => [makeImg('/api/users/user_1/photo')] }, loader);
  assert.equal(loader.openCount, 1);

  loader.releaseAll();
  assert.deepEqual(revoked, ['blob:foto-1']);
  assert.equal(loader.openCount, 0);

  loader.destroy();
  assert.equal(loader.destroyed, true);
});

// ---------------------------------------------------- diseño preservado

test('el diseño aprobado conserva sus clases y su estructura', () => {
  const app = leer('src/pages/driver/driverApp.js');
  for (const marca of ['driver-app', 'glass-header', 'driver-avatar-info', 'driver-avatar', 'driver-details']) {
    assert.ok(app.includes(marca), `driverApp debe conservar la clase ${marca}`);
  }
  const tarjeta = leer('src/pages/passenger/requestRide.js');
  assert.ok(tarjeta.includes('alt="Foto de '), 'la tarjeta conserva su imagen y su texto alternativo');

  // El lenguaje visual restaurado sigue presente y enganchado.
  assert.ok(fs.existsSync(path.join(raiz, 'src/styles/um-motion-preview.css')), 'um-motion-preview.css debe existir');
  const main = leer('src/main.js');
  assert.ok(main.includes("import('./styles/um-motion-preview.css')"), 'main.js debe cargarlo');
  assert.ok(main.includes('um-motion-preview'), 'y aplicar su clase');
  assert.ok(fs.existsSync(path.join(raiz, 'src/components/notificationCenterModal.js')), 'el centro de notificaciones debe existir');
});
