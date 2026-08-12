import test from 'node:test';
import assert from 'node:assert/strict';
import {
  passengerPublicProfile,
  driverPublicProfile,
  sanitizeEmbeddedTripDriver
} from '../domain/userProjections.js';

/** Registro realista con todo lo que el modelo puede acumular hoy y mañana. */
function fullDriverRecord() {
  return {
    id: 'driver_9',
    role: 'driver',
    firstName: 'Carlos',
    lastName: 'Mendoza',
    photoUrl: '/api/users/driver_9/photo',
    rating: 4.87,
    totalTrips: 214,
    vehicleType: 'MOTO',
    vehicleBrand: 'Bera',
    vehicleModel: 'BR200',
    vehicleColor: 'Negro',
    vehiclePlate: 'AC3M49P',
    // A partir de aquí, nada debe salir en una proyección pública.
    phone: '+584140001111',
    email: 'carlos@58express.com',
    passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
    photoStorageKey: 'driver_9/8f3a-uuid.jpg',
    cedula: 'V-12345678',
    documents: { cedula: 'approved', licencia: 'approved' },
    walletBalance: -12.5,
    location: { lat: 10.64, lng: -71.61, updatedAt: 1786400000000 },
    socketId: 'sId_AbC123',
    driverApplicationId: 'application_7',
    accountStatus: 'ACTIVE',
    isVerified: true,
    status: 'AVAILABLE',
    disabledReason: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    futureSensitiveField: 'dato que alguien añadirá al modelo mañana'
  };
}

function fullPassengerRecord() {
  return {
    id: 'passenger_3',
    role: 'passenger',
    firstName: 'Ana',
    lastName: 'Cliente',
    photoUrl: '/api/users/passenger_3/photo',
    rating: 4.9,
    phone: '+584120002222',
    email: 'ana@58express.com',
    passwordHash: '$2b$12$zyxwvutsrqponmlkjihgfe',
    photoStorageKey: 'passenger_3/1c2d-uuid.jpg',
    cedula: 'V-87654321',
    walletBalance: 42.75,
    accountStatus: 'ACTIVE',
    emailVerified: false,
    phoneVerified: true,
    totalTrips: 31,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    futureSensitiveField: 'dato que alguien añadirá al modelo mañana'
  };
}

/** Campos que jamás pueden aparecer en un perfil que cruza de rol. */
const PROHIBIDOS = [
  'email', 'passwordHash', 'photoStorageKey', 'cedula', 'documents',
  'walletBalance', 'location', 'socketId', 'driverApplicationId',
  'accountStatus', 'isVerified', 'status', 'disabledReason', 'role',
  'emailVerified', 'phoneVerified', 'createdAt', 'updatedAt',
  'futureSensitiveField'
];

test('passengerPublicProfile devuelve exactamente las claves permitidas', () => {
  const perfil = passengerPublicProfile(fullPassengerRecord());
  assert.deepEqual(
    Object.keys(perfil).sort(),
    ['firstName', 'id', 'lastName', 'photoUrl', 'rating']
  );
});

test('passengerPublicProfile no propaga ningún campo sensible', () => {
  const perfil = passengerPublicProfile(fullPassengerRecord());
  for (const campo of PROHIBIDOS) {
    assert.equal(perfil[campo], undefined, `no debía propagarse: ${campo}`);
  }
  // El teléfono del pasajero no se entrega en ningún caso en esta fase.
  assert.equal(perfil.phone, undefined);
});

test('un campo futuro del modelo no llega al conductor', () => {
  const conCampoNuevo = { ...fullPassengerRecord(), futureSensitiveField: 'secreto' };
  const perfil = passengerPublicProfile(conCampoNuevo);
  assert.equal(perfil.futureSensitiveField, undefined);
  assert.ok(!JSON.stringify(perfil).includes('secreto'));
});

test('driverPublicProfile devuelve exactamente las claves permitidas sin teléfono', () => {
  const perfil = driverPublicProfile(fullDriverRecord());
  assert.deepEqual(
    Object.keys(perfil).sort(),
    ['firstName', 'id', 'lastName', 'photoUrl', 'rating', 'totalTrips',
     'vehicleBrand', 'vehicleColor', 'vehicleModel', 'vehiclePlate', 'vehicleType'].sort()
  );
  assert.equal(perfil.phone, undefined, 'el teléfono exige includePhone');
});

test('driverPublicProfile añade el teléfono solo con includePhone', () => {
  const sinTelefono = driverPublicProfile(fullDriverRecord());
  const conTelefono = driverPublicProfile(fullDriverRecord(), { includePhone: true });
  assert.equal(sinTelefono.phone, undefined);
  assert.equal(conTelefono.phone, '+584140001111');
  assert.equal(Object.keys(conTelefono).length, Object.keys(sinTelefono).length + 1);
  // includePhone no abre la puerta a nada más.
  for (const campo of PROHIBIDOS) {
    assert.equal(conTelefono[campo], undefined, `no debía propagarse: ${campo}`);
  }
});

test('driverPublicProfile no propaga ningún campo sensible', () => {
  const perfil = driverPublicProfile(fullDriverRecord());
  for (const campo of PROHIBIDOS) {
    assert.equal(perfil[campo], undefined, `no debía propagarse: ${campo}`);
  }
  const serializado = JSON.stringify(perfil);
  assert.ok(!serializado.includes('$2b$'), 'no debe aparecer el hash');
  assert.ok(!serializado.includes('V-12345678'), 'no debe aparecer la cédula');
  assert.ok(!serializado.includes('-12.5'), 'no debe aparecer el saldo');
});

test('un campo futuro del modelo no llega al pasajero', () => {
  const perfil = driverPublicProfile({ ...fullDriverRecord(), futureSensitiveField: 'secreto' });
  assert.equal(perfil.futureSensitiveField, undefined);
  assert.ok(!JSON.stringify(perfil).includes('secreto'));
});

test('las proyecciones toleran valores vacíos sin lanzar', () => {
  assert.equal(passengerPublicProfile(null), null);
  assert.equal(passengerPublicProfile(undefined), null);
  assert.equal(driverPublicProfile(null), null);
  assert.equal(driverPublicProfile(undefined, { includePhone: true }), null);

  const vacio = driverPublicProfile({});
  assert.deepEqual(Object.keys(vacio).sort(),
    ['firstName', 'id', 'lastName', 'photoUrl', 'rating', 'totalTrips',
     'vehicleBrand', 'vehicleColor', 'vehicleModel', 'vehiclePlate', 'vehicleType'].sort());
  assert.equal(vacio.id, null);
  assert.equal(vacio.firstName, '');
  assert.equal(vacio.rating, 0);
  assert.equal(vacio.vehicleType, 'MOTO');

  const pasajeroVacio = passengerPublicProfile({});
  assert.equal(pasajeroVacio.id, null);
  assert.equal(pasajeroVacio.rating, 0);
});

test('los valores no textuales o no numéricos se normalizan', () => {
  const perfil = driverPublicProfile({
    id: 'driver_1', firstName: 42, lastName: null, rating: 'no-es-numero',
    totalTrips: undefined, vehiclePlate: { evil: true }, photoUrl: undefined
  });
  assert.equal(perfil.firstName, '');
  assert.equal(perfil.lastName, '');
  assert.equal(perfil.rating, 0);
  assert.equal(perfil.totalTrips, 0);
  assert.equal(perfil.vehiclePlate, '');
  assert.equal(perfil.photoUrl, null);
});

test('sanitizeEmbeddedTripDriver limpia el perfil histórico del viaje', () => {
  const viajeHistorico = {
    id: 'trip_viejo',
    status: 'COMPLETED',
    fareUSD: 4.5,
    passengerId: 'passenger_3',
    driverId: 'driver_9',
    driver: fullDriverRecord()
  };
  const saneado = sanitizeEmbeddedTripDriver(viajeHistorico);

  assert.deepEqual(
    Object.keys(saneado.driver).sort(),
    ['firstName', 'id', 'lastName', 'photoUrl', 'rating', 'totalTrips',
     'vehicleBrand', 'vehicleColor', 'vehicleModel', 'vehiclePlate', 'vehicleType'].sort()
  );
  for (const campo of PROHIBIDOS) {
    assert.equal(saneado.driver[campo], undefined, `no debía sobrevivir: ${campo}`);
  }
  // El resto del viaje se conserva intacto.
  assert.equal(saneado.id, 'trip_viejo');
  assert.equal(saneado.status, 'COMPLETED');
  assert.equal(saneado.fareUSD, 4.5);
  assert.equal(saneado.driverId, 'driver_9');
  // Y no muta el original.
  assert.equal(viajeHistorico.driver.email, 'carlos@58express.com');
});

test('sanitizeEmbeddedTripDriver deja pasar viajes sin perfil incrustado', () => {
  const sinDriver = { id: 'trip_1', status: 'SEARCHING', driverId: null };
  assert.equal(sanitizeEmbeddedTripDriver(sinDriver), sinDriver);
  assert.equal(sanitizeEmbeddedTripDriver(null), null);
  assert.equal(sanitizeEmbeddedTripDriver(undefined), undefined);
  const driverNoObjeto = { id: 'trip_2', driver: 'driver_9' };
  assert.equal(sanitizeEmbeddedTripDriver(driverNoObjeto), driverNoObjeto);
});
