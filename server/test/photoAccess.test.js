import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_TRIP_STATUSES,
  isActiveTripStatus,
  canViewUserPhoto,
  userPhotoEndpoint,
  userPhotoUrl
} from '../domain/photoAccess.js';

const PASAJERO = { id: 'user_pasajero', role: 'passenger' };
const CONDUCTOR = { id: 'user_conductor', role: 'driver' };
const AJENO = { id: 'user_ajeno', role: 'passenger' };
const ADMIN = { id: 'user_admin', role: 'admin' };

const viaje = (status) => ({
  id: 'trip_1',
  status,
  passengerId: PASAJERO.id,
  driverId: CONDUCTOR.id
});

test('los estados activos son exactamente los no terminales', () => {
  assert.deepEqual(
    [...ACTIVE_TRIP_STATUSES].sort(),
    ['ARRIVED', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'SEARCHING']
  );
  for (const estado of ACTIVE_TRIP_STATUSES) assert.equal(isActiveTripStatus(estado), true);
  assert.equal(isActiveTripStatus('COMPLETED'), false);
  assert.equal(isActiveTripStatus('CANCELLED'), false);
});

test('los alias históricos se normalizan antes de decidir', () => {
  // Los registros antiguos guardan estos nombres; siguen siendo viajes abiertos.
  for (const alias of ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_TRIP']) {
    assert.equal(isActiveTripStatus(alias), true, `${alias} debía contar como activo`);
  }
  assert.equal(isActiveTripStatus(null), false);
  assert.equal(isActiveTripStatus('INVENTADO'), false);
});

test('el titular siempre puede obtener su propia fotografía', () => {
  const resultado = canViewUserPhoto({ viewer: PASAJERO, targetId: PASAJERO.id, trips: [] });
  assert.equal(resultado.allowed, true);
  assert.equal(resultado.reason, 'OWNER');
});

test('administración puede obtenerla sin ningún viaje activo', () => {
  const resultado = canViewUserPhoto({ viewer: ADMIN, targetId: CONDUCTOR.id, trips: [] });
  assert.equal(resultado.allowed, true);
  assert.equal(resultado.reason, 'ADMIN');
});

test('la contraparte puede obtenerla durante un viaje activo', () => {
  for (const estado of ACTIVE_TRIP_STATUSES) {
    const trips = [viaje(estado)];
    assert.equal(
      canViewUserPhoto({ viewer: PASAJERO, targetId: CONDUCTOR.id, trips }).allowed, true,
      `el pasajero debía poder verla en ${estado}`
    );
    assert.equal(
      canViewUserPhoto({ viewer: CONDUCTOR, targetId: PASAJERO.id, trips }).allowed, true,
      `el conductor debía poder verla en ${estado}`
    );
  }
});

test('al completarse el viaje la contraparte pierde el acceso', () => {
  const trips = [viaje('COMPLETED')];
  assert.equal(canViewUserPhoto({ viewer: PASAJERO, targetId: CONDUCTOR.id, trips }).allowed, false);
  assert.equal(canViewUserPhoto({ viewer: CONDUCTOR, targetId: PASAJERO.id, trips }).allowed, false);
});

test('al cancelarse el viaje la contraparte pierde el acceso', () => {
  const trips = [viaje('CANCELLED')];
  assert.equal(canViewUserPhoto({ viewer: PASAJERO, targetId: CONDUCTOR.id, trips }).allowed, false);
  assert.equal(canViewUserPhoto({ viewer: CONDUCTOR, targetId: PASAJERO.id, trips }).allowed, false);
});

test('un tercero autenticado nunca obtiene acceso', () => {
  const trips = [viaje('IN_PROGRESS')];
  assert.equal(canViewUserPhoto({ viewer: AJENO, targetId: CONDUCTOR.id, trips }).allowed, false);
  assert.equal(canViewUserPhoto({ viewer: AJENO, targetId: PASAJERO.id, trips }).allowed, false);
});

test('un viaje sin conductor asignado no habilita a nadie', () => {
  const buscando = { id: 'trip_2', status: 'SEARCHING', passengerId: PASAJERO.id, driverId: null };
  assert.equal(canViewUserPhoto({ viewer: CONDUCTOR, targetId: PASAJERO.id, trips: [buscando] }).allowed, false);
});

test('un viaje de otras dos personas no habilita a nadie', () => {
  const ajeno = { id: 'trip_3', status: 'IN_PROGRESS', passengerId: 'otro_1', driverId: 'otro_2' };
  assert.equal(canViewUserPhoto({ viewer: PASAJERO, targetId: CONDUCTOR.id, trips: [ajeno] }).allowed, false);
});

test('entradas ausentes o malformadas no conceden acceso', () => {
  assert.equal(canViewUserPhoto().allowed, false);
  assert.equal(canViewUserPhoto({ viewer: PASAJERO, targetId: '' }).allowed, false);
  assert.equal(canViewUserPhoto({ viewer: PASAJERO, targetId: null }).allowed, false);
  assert.equal(canViewUserPhoto({ viewer: PASAJERO, targetId: { id: 'x' } }).allowed, false);
  assert.equal(canViewUserPhoto({ viewer: null, targetId: PASAJERO.id }).allowed, false);
  assert.equal(canViewUserPhoto({ viewer: PASAJERO, targetId: CONDUCTOR.id, trips: null }).allowed, false);
});

test('la ruta se compone con el prefijo /api y el identificador escapado', () => {
  assert.equal(userPhotoEndpoint('user_1'), '/api/users/user_1/photo');
  assert.ok(userPhotoEndpoint('user_1').startsWith('/api/'), 'sin /api caería en el rewrite de la SPA');
  // Un identificador con caracteres extraños no puede alterar la ruta.
  assert.equal(userPhotoEndpoint('a/b'), '/api/users/a%2Fb/photo');
  assert.equal(userPhotoEndpoint('../secreto'), '/api/users/..%2Fsecreto/photo');
});

test('la URL publicada se deriva del almacenamiento, no del valor guardado', () => {
  // Registro antiguo: la ruta persistida no tiene /api y no debe reutilizarse.
  const antiguo = { id: 'user_1', photoStorageKey: 'user_1/x.jpg', photoUrl: '/users/user_1/photo' };
  assert.equal(userPhotoUrl(antiguo), '/api/users/user_1/photo');

  // Valor externo heredado: tampoco se propaga.
  const externo = { id: 'user_2', photoStorageKey: 'user_2/y.png', photoUrl: 'https://ejemplo.test/foto.png' };
  assert.equal(userPhotoUrl(externo), '/api/users/user_2/photo');

  // Sin fotografía almacenada no se publica ninguna URL.
  assert.equal(userPhotoUrl({ id: 'user_3', photoUrl: 'https://ejemplo.test/foto.png' }), null);
  assert.equal(userPhotoUrl({ id: 'user_4' }), null);
  assert.equal(userPhotoUrl(null), null);
});
