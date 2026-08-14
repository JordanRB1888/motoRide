import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivatePhotoLoader, hydratePrivatePhotos } from '../src/utils/privatePhoto.js';
import {
  SCOPED_STATES,
  createPrivatePhotoScope,
  photoScopeIdentity,
  photoScopeKey
} from '../src/utils/privatePhotoScope.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VIAJE = { id: 'trip_1' };
const CONDUCTOR = { id: 'driver_1', photoUrl: '/api/users/driver_1/photo' };

function makeImg(photoPath) {
  return { dataset: photoPath ? { privatePhoto: photoPath } : {}, isConnected: true, src: 'neutro' };
}

/**
 * Escenario completo: cargador real, alcance real y un contenedor con la
 * imagen del conductor. Nadie llama a `releaseAll()` desde la prueba; se
 * conduce el ciclo de vida por las mismas transiciones que usa la pantalla.
 */
function escenario({ responder } = {}) {
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
  const scope = createPrivatePhotoScope({ loader });
  let img = makeImg();
  const container = { querySelectorAll: () => (img.dataset.privatePhoto ? [img] : []) };

  /** Reproduce `setState`: sincroniza el alcance y repinta. */
  async function setState(state, trip, driver) {
    scope.sync(state, trip, driver);
    const activo = SCOPED_STATES.includes(state);
    img = makeImg(activo ? driver?.photoUrl : null);
    if (activo) await hydratePrivatePhotos(container, loader);
    return img;
  }

  return { loader, scope, setState, requested, revoked, imagen: () => img };
}

const deferred = () => { let r; const p = new Promise(x => { r = x; }); return { promise: p, resolve: r }; };

// ------------------------------------------------------------- identidad

test('la identidad del alcance combina viaje, conductor y fotografía', () => {
  const id = photoScopeIdentity('IN_TRIP', VIAJE, CONDUCTOR);
  assert.deepEqual(id, { tripId: 'trip_1', driverId: 'driver_1', photoPath: '/api/users/driver_1/photo' });
  assert.equal(photoScopeKey(id), 'trip_1|driver_1|/api/users/driver_1/photo');

  // Una ruta antigua sin /api describe el mismo alcance.
  const antigua = photoScopeIdentity('IN_TRIP', VIAJE, { id: 'driver_1', photoUrl: '/users/driver_1/photo' });
  assert.equal(photoScopeKey(antigua), photoScopeKey(id));
});

test('los estados cerrados y los datos incompletos no abren alcance', () => {
  for (const estado of ['COMPLETED', 'CANCELLED', 'IDLE', 'SELECTING_DESTINATION', 'SEARCHING']) {
    assert.equal(photoScopeIdentity(estado, VIAJE, CONDUCTOR), null, `${estado} no debe abrir alcance`);
  }
  assert.equal(photoScopeIdentity('IN_TRIP', null, CONDUCTOR), null);
  assert.equal(photoScopeIdentity('IN_TRIP', VIAJE, null), null);
  assert.equal(photoScopeIdentity('IN_TRIP', VIAJE, { id: 'driver_1' }), null, 'sin fotografía no hay nada que abrir');
  assert.equal(photoScopeKey(null), null);
});

// --------------------------------------------------------- comportamiento

test('mismo viaje, mismo conductor y misma foto: ni revoca ni vuelve a descargar', async () => {
  const e = escenario();
  await e.setState('DRIVER_ASSIGNED', VIAJE, CONDUCTOR);
  assert.equal(e.requested.length, 1);
  assert.equal(e.imagen().src, 'blob:foto-1');

  // Varias transiciones dentro del mismo alcance.
  await e.setState('DRIVER_ARRIVED', VIAJE, CONDUCTOR);
  await e.setState('IN_TRIP', VIAJE, CONDUCTOR);
  await e.setState('IN_TRIP', VIAJE, CONDUCTOR);

  assert.equal(e.requested.length, 1, 'una sola descarga en todo el alcance');
  assert.deepEqual(e.revoked, [], 'y nada revocado mientras dure');
  assert.equal(e.imagen().src, 'blob:foto-1', 'la imagen se repinta con la misma URL');
  assert.equal(e.loader.openCount, 1);
});

test('mismo viaje con otro conductor: revoca la anterior', async () => {
  const e = escenario();
  await e.setState('DRIVER_ASSIGNED', VIAJE, CONDUCTOR);
  const otro = { id: 'driver_2', photoUrl: '/api/users/driver_2/photo' };

  await e.setState('DRIVER_ASSIGNED', VIAJE, otro);

  assert.deepEqual(e.revoked, ['blob:foto-1'], 'la del conductor anterior muere');
  assert.deepEqual(e.requested, ['/api/users/driver_1/photo', '/api/users/driver_2/photo']);
  assert.equal(e.loader.openCount, 1, 'solo vive la del conductor actual');
  assert.equal(e.imagen().src, 'blob:foto-2');
});

test('otro viaje: revoca la anterior', async () => {
  const e = escenario();
  await e.setState('IN_TRIP', VIAJE, CONDUCTOR);
  await e.setState('IN_TRIP', { id: 'trip_2' }, CONDUCTOR);

  assert.deepEqual(e.revoked, ['blob:foto-1']);
  assert.equal(e.loader.openCount, 1);
});

test('misma persona con la fotografía reemplazada: revoca la anterior', async () => {
  const e = escenario();
  await e.setState('IN_TRIP', VIAJE, CONDUCTOR);
  // El conductor cambia su foto durante el viaje: misma persona, otra ruta.
  const renovado = { id: 'driver_1', photoUrl: '/api/users/driver_1/photo?v=2' };
  await e.setState('IN_TRIP', VIAJE, renovado);

  assert.deepEqual(e.revoked, ['blob:foto-1'], 'la versión anterior no puede sobrevivir');
  assert.equal(e.loader.openCount, 1);
});

for (const estado of ['COMPLETED', 'CANCELLED', 'IDLE']) {
  test(`entrar en ${estado} revoca de inmediato`, async () => {
    const e = escenario();
    await e.setState('IN_TRIP', VIAJE, CONDUCTOR);
    assert.equal(e.loader.openCount, 1);

    await e.setState(estado, estado === 'IDLE' ? null : VIAJE, estado === 'IDLE' ? null : CONDUCTOR);

    assert.deepEqual(e.revoked, ['blob:foto-1'], `${estado} debe revocar`);
    assert.equal(e.loader.openCount, 0);
    assert.equal(e.scope.key, null, 'y cerrar el alcance');
  });
}

test('elegir un destino nuevo no conserva blobs del viaje anterior', async () => {
  const e = escenario();
  await e.setState('IN_TRIP', VIAJE, CONDUCTOR);
  await e.setState('COMPLETED', VIAJE, CONDUCTOR);
  await e.setState('SELECTING_DESTINATION', null, null);

  assert.equal(e.loader.openCount, 0);
  assert.deepEqual(e.revoked, ['blob:foto-1']);
  assert.equal(e.imagen().src, 'neutro', 'la pantalla vuelve al avatar neutro');
});

test('cerrar el alcance a mano revoca aunque no se repinte después', async () => {
  const e = escenario();
  await e.setState('IN_TRIP', VIAJE, CONDUCTOR);

  // Equivale a `cancelRouteAndSelectNew()`: se cierra antes de tocar la interfaz.
  assert.equal(e.scope.close(), true);

  assert.deepEqual(e.revoked, ['blob:foto-1']);
  assert.equal(e.loader.openCount, 0);
  assert.equal(e.scope.close(), false, 'cerrar dos veces no hace nada');
});

test('una respuesta tardía del viaje anterior se revoca y no toca el DOM', async () => {
  const espera = deferred();
  let primera = true;
  const e = escenario({
    responder: () => (primera ? (primera = false, espera.promise) : Promise.resolve('blob:nueva'))
  });

  // Se pinta el viaje 1 y su carga queda en vuelo.
  e.scope.sync('IN_TRIP', VIAJE, CONDUCTOR);
  const img1 = makeImg(CONDUCTOR.photoUrl);
  const enVuelo = hydratePrivatePhotos({ querySelectorAll: () => [img1] }, e.loader);

  // Llega otro viaje antes de que responda.
  e.scope.sync('IN_TRIP', { id: 'trip_2' }, CONDUCTOR);
  img1.isConnected = false;

  espera.resolve('blob:tardia');
  await enVuelo;

  assert.ok(e.revoked.includes('blob:tardia'), 'la URL tardía se revoca');
  assert.equal(img1.src, 'neutro', 'y no se pinta sobre el DOM del viaje anterior');
});

test('tras cerrar el alcance, un viaje nuevo carga con normalidad', async () => {
  const e = escenario();
  await e.setState('IN_TRIP', VIAJE, CONDUCTOR);
  await e.setState('COMPLETED', VIAJE, CONDUCTOR);
  assert.equal(e.loader.openCount, 0);

  await e.setState('DRIVER_ASSIGNED', { id: 'trip_9' }, { id: 'driver_9', photoUrl: '/api/users/driver_9/photo' });

  assert.equal(e.loader.openCount, 1);
  assert.equal(e.imagen().src, 'blob:foto-2');
  assert.deepEqual(e.requested, ['/api/users/driver_1/photo', '/api/users/driver_9/photo']);
});

// ---------------------------------------------------------- integración

test('passengerApp usa el controlador de alcance en sus transiciones reales', () => {
  const fuente = fs.readFileSync(path.join(raiz, 'src/pages/passenger/passengerApp.js'), 'utf8');
  assert.ok(fuente.includes("from '../../utils/privatePhotoScope.js'"), 'debe importar el controlador');
  assert.ok(fuente.includes('createPrivatePhotoScope({ loader: privatePhotos })'), 'y crearlo sobre el cargador real');

  // La sincronización ocurre al principio de setState, antes de repintar.
  const i = fuente.indexOf('function setState(state) {');
  assert.notEqual(i, -1, 'setState debe existir');
  const cuerpo = fuente.slice(i, i + 900);
  const sync = cuerpo.indexOf('photoScope?.sync(state, currentTrip, currentDriver)');
  const primerRender = cuerpo.indexOf('bottomSheet.setContent');
  assert.notEqual(sync, -1, 'setState debe sincronizar el alcance');
  assert.ok(sync < primerRender || primerRender === -1, 'y hacerlo antes de repintar');

  // La cancelación manual cierra el alcance antes de tocar la interfaz.
  const j = fuente.indexOf('function cancelRouteAndSelectNew() {');
  assert.notEqual(j, -1);
  const cancelar = fuente.slice(j, j + 600);
  assert.ok(cancelar.includes('photoScope?.close()'), 'la cancelación debe cerrar el alcance');
  // Debe ser lo primero del cuerpo: cualquier efecto posterior podria fallar.
  const cuerpoCancelar = cancelar.slice(cancelar.indexOf('{') + 1);
  const primeraSentencia = cuerpoCancelar
    .split(String.fromCharCode(10))
    .map(l => l.trim())
    .find(l => l && !l.startsWith('//'));
  assert.equal(primeraSentencia, 'photoScope?.close();', 'el cierre debe ser la primera sentencia');

  // Y no quedan llamadas sueltas de revocación repartidas por la pantalla.
  assert.ok(!fuente.includes('privatePhotos.releaseAll()'), 'la revocación se decide solo en el controlador');
});
