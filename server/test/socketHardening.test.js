import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-hardening-'));
  const port = 12900 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'hardening-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 10000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}`, child };
}

const asJson = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
});

async function login(url, identifier, password, role) {
  const response = await asJson(`${url}/api/auth/login`, null, {
    method: 'POST',
    body: JSON.stringify({ identifier, password, role })
  });
  assert.equal(response.status, 200, `Login fallido para ${identifier}`);
  return (await response.json()).token;
}

async function registerPassenger(url, { email, phone, firstName }) {
  const response = await asJson(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({ email, phone, password: 'password123', role: 'passenger', firstName, lastName: 'Prueba' })
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function createDriver(url, adminToken, { email, phone, firstName, plate }) {
  const response = await asJson(`${url}/api/admin/drivers`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ email, phone, firstName, lastName: 'Conductor', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: plate })
  });
  assert.equal(response.status, 201);
  const account = await response.json();
  return { ...account, token: await login(url, email, account.temporaryPassword, 'driver') };
}

function waitFor(socket, event, { predicate = () => true, timeoutMs = 5000, label = event } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`No llegó el evento ${label}`));
    }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

function collect(socket, event) {
  const received = [];
  socket.on(event, payload => received.push(payload));
  return received;
}

async function connectDriver(url, token, { lat, lng }) {
  const socket = io(url, { auth: { token } });
  await waitFor(socket, 'connect', { label: 'connect' });
  socket.emit('driver:connect', { status: 'AVAILABLE' });
  await waitFor(socket, 'driver:connected', { label: 'driver:connected' });
  socket.emit('driver:location', { latitude: lat, longitude: lng, heading: 0 });
  await new Promise(resolve => setTimeout(resolve, 150));
  return socket;
}

const findUser = (users, id) => users.find(user => user.id === id);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const PICKUP = { lat: 10.6427, lng: -71.6125 };
const DESTINATION = { lat: 10.65, lng: -71.60 };

async function createTripByRest(url, token, id, extra = {}) {
  const response = await asJson(`${url}/api/trips/create`, token, {
    method: 'POST',
    body: JSON.stringify({ id, pickup: PICKUP, destination: DESTINATION, fareUSD: 5, paymentMethod: 'efectivo', rideType: 'MOTO', ...extra })
  });
  assert.equal(response.status, 200, `No se pudo crear el viaje ${id}`);
  return (await response.json()).trip;
}

test('un conductor que no recibió la oferta no puede aceptar la carrera', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: 'oferta@58express.com', phone: '+584120011111', firstName: 'Ana' });
  // El conductor pegado al punto de recogida recibe la oferta primero.
  const offered = await createDriver(url, adminToken, { email: 'ofertado@58express.com', phone: '+584140011111', firstName: 'Ofertado', plate: 'OFR001' });
  const outsider = await createDriver(url, adminToken, { email: 'ajeno@58express.com', phone: '+584140022222', firstName: 'Ajeno', plate: 'OUT001' });

  const offeredSocket = await connectDriver(url, offered.token, { lat: 10.6428, lng: -71.6126 });
  const outsiderSocket = await connectDriver(url, outsider.token, { lat: 10.7000, lng: -71.6800 });
  const passengerSocket = io(url, { auth: { token: passenger.token } });
  t.after(() => [offeredSocket, outsiderSocket, passengerSocket].forEach(socket => socket.close()));
  await waitFor(passengerSocket, 'connect', { label: 'connect pasajero' });

  const offerReceived = waitFor(offeredSocket, 'rideRequested', {
    predicate: payload => payload.id === 'trip_oferta',
    label: 'oferta al conductor cercano'
  });
  const outsiderOffers = collect(outsiderSocket, 'rideRequested');
  await createTripByRest(url, passenger.token, 'trip_oferta');
  const offer = await offerReceived;
  assert.equal(offer.offeredDriverId, offered.user.id);
  assert.deepEqual(outsiderOffers, [], 'El conductor lejano no debía recibir la oferta todavía');

  // El conductor ajeno conoce el ID e intenta quedarse la carrera.
  const rejection = waitFor(outsiderSocket, 'rideAcceptanceFailed', {
    predicate: payload => payload.tripId === 'trip_oferta',
    label: 'rechazo al conductor no ofrecido'
  });
  outsiderSocket.emit('rideAccepted', { tripId: 'trip_oferta', driver: { id: offered.user.id } });
  assert.equal((await rejection).reason, 'NOT_CURRENT_OFFER');
  await pause(200);

  // Un intento rechazado no deja al conductor en BUSY ni toca el viaje.
  const usersAfterRejection = (await (await asJson(`${url}/api/users?limit=100`, adminToken)).json()).items;
  assert.equal(findUser(usersAfterRejection, outsider.user.id).status, 'AVAILABLE');
  assert.equal(findUser(usersAfterRejection, offered.user.id).status, 'AVAILABLE');
  const tripsAfterRejection = (await (await asJson(`${url}/api/trips?limit=100`, adminToken)).json()).items;
  const pending = tripsAfterRejection.find(trip => trip.id === 'trip_oferta');
  assert.equal(pending.status, 'SEARCHING');
  assert.equal(pending.driverId, null);

  // El conductor ofrecido sí puede aceptar, y solo él queda en BUSY.
  const assignment = waitFor(passengerSocket, 'tripStatusUpdated', {
    predicate: payload => payload.tripId === 'trip_oferta',
    label: 'asignación al conductor ofrecido'
  });
  offeredSocket.emit('rideAccepted', { tripId: 'trip_oferta' });
  const assigned = await assignment;
  await pause(200);

  const usersAfterAssignment = (await (await asJson(`${url}/api/users?limit=100`, adminToken)).json()).items;
  assert.equal(findUser(usersAfterAssignment, offered.user.id).status, 'BUSY');
  assert.equal(findUser(usersAfterAssignment, outsider.user.id).status, 'AVAILABLE');

  // El estado difundido coincide con el estado persistido.
  const persisted = (await (await asJson(`${url}/api/trips?limit=100`, adminToken)).json()).items;
  const persistedTrip = persisted.find(trip => trip.id === 'trip_oferta');
  assert.equal(assigned.canonicalStatus, persistedTrip.status);
  assert.equal(persistedTrip.status, 'DRIVER_ASSIGNED');
  assert.equal(persistedTrip.driverId, offered.user.id);

  // El perfil que viaja al pasajero es el resumen seguro, sin datos privados.
  assert.equal(assigned.driver.id, offered.user.id);
  assert.equal(assigned.driver.email, undefined);
  assert.equal(assigned.driver.passwordHash, undefined);
  assert.equal(assigned.driver.cedula, undefined);
  assert.equal(assigned.driver.documents, undefined);
  assert.equal(assigned.driver.walletBalance, undefined);

  // Y una segunda aceptación sobre el mismo viaje ya no procede.
  const secondAttempt = waitFor(offeredSocket, 'rideAcceptanceFailed', {
    predicate: payload => payload.tripId === 'trip_oferta',
    label: 'rechazo de doble aceptación'
  });
  offeredSocket.emit('rideAccepted', { tripId: 'trip_oferta' });
  assert.equal((await secondAttempt).reason, 'NO_ACTIVE_OFFER');
});

test('los eventos malformados o sobre viajes cerrados no detienen el servidor', async (t) => {
  const { url, child } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: 'basura@58express.com', phone: '+584120033333', firstName: 'Ana' });
  const driver = await createDriver(url, adminToken, { email: 'robusto@58express.com', phone: '+584140033333', firstName: 'Robusto', plate: 'RBS001' });

  const driverSocket = await connectDriver(url, driver.token, { lat: 10.6428, lng: -71.6126 });
  const passengerSocket = io(url, { auth: { token: passenger.token } });
  t.after(() => [driverSocket, passengerSocket].forEach(socket => socket.close()));
  await waitFor(passengerSocket, 'connect', { label: 'connect pasajero' });

  // Un viaje completado de verdad, para atacarlo después de cerrado.
  const offerReceived = waitFor(driverSocket, 'rideRequested', { predicate: payload => payload.id === 'trip_cerrado' });
  await createTripByRest(url, passenger.token, 'trip_cerrado');
  await offerReceived;
  const assigned = waitFor(passengerSocket, 'tripStatusUpdated', { predicate: payload => payload.tripId === 'trip_cerrado' });
  driverSocket.emit('rideAccepted', { tripId: 'trip_cerrado' });
  await assigned;
  for (const status of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    const step = waitFor(passengerSocket, 'tripStatusUpdated', {
      predicate: payload => payload.tripId === 'trip_cerrado' && payload.status === status
    });
    driverSocket.emit('tripStatusUpdated', { tripId: 'trip_cerrado', status });
    await step;
  }

  const hostileAcceptances = [
    { tripId: 'no_existe_en_absoluto' },
    { tripId: 'trip_cerrado' },
    { tripId: '' },
    { tripId: null },
    { tripId: 12345 },
    { tripId: { $ne: null } },
    { tripId: ['trip_cerrado'] },
    { tripId: '../../etc/passwd' },
    { tripId: "'; DROP TABLE trips; --" },
    {},
    null,
    'texto plano',
    42
  ];
  for (const payload of hostileAcceptances) {
    driverSocket.emit('rideAccepted', payload);
    await pause(40);
  }

  const hostileTransitions = [
    { tripId: 'trip_cerrado', status: 'COMPLETED' },
    { tripId: 'trip_cerrado', status: 'SEARCHING' },
    { tripId: 'trip_cerrado', status: null },
    { tripId: 'trip_cerrado', status: { evil: true } },
    { tripId: 'no_existe', status: 'COMPLETED' },
    { tripId: null, status: null },
    {},
    null,
    'texto plano'
  ];
  for (const payload of hostileTransitions) {
    driverSocket.emit('tripStatusUpdated', payload);
    await pause(40);
  }

  const hostileCancellations = [{ tripId: 'trip_cerrado' }, { tripId: null }, {}, null, 7];
  for (const payload of hostileCancellations) {
    passengerSocket.emit('rideCancelled', payload);
    await pause(40);
  }

  await pause(300);

  // El proceso sigue vivo y sirviendo peticiones.
  assert.equal(child.exitCode, null, 'El proceso del servidor murió ante un evento malicioso');
  assert.equal(child.signalCode, null, 'El proceso del servidor recibió una señal de terminación');
  const health = await fetch(`${url}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  // El viaje cerrado quedó exactamente como estaba.
  const trips = (await (await asJson(`${url}/api/trips?limit=100`, adminToken)).json()).items;
  const closed = trips.find(trip => trip.id === 'trip_cerrado');
  assert.equal(closed.status, 'COMPLETED');
  assert.equal(closed.driverId, driver.user.id);

  // Y el conductor no quedó bloqueado en BUSY por los intentos fallidos.
  const users = (await (await asJson(`${url}/api/users?limit=100`, adminToken)).json()).items;
  assert.equal(findUser(users, driver.user.id).status, 'AVAILABLE');
});

test('un pasajero no puede crear ni redespachar viajes emitiendo rideRequested', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: 'emisor@58express.com', phone: '+584120044444', firstName: 'Ana' });
  const driver = await createDriver(url, adminToken, { email: 'receptor@58express.com', phone: '+584140044444', firstName: 'Receptor', plate: 'RCP001' });

  const driverSocket = await connectDriver(url, driver.token, { lat: 10.6428, lng: -71.6126 });
  const passengerSocket = io(url, { auth: { token: passenger.token } });
  t.after(() => [driverSocket, passengerSocket].forEach(socket => socket.close()));
  await waitFor(passengerSocket, 'connect', { label: 'connect pasajero' });

  const driverOffers = collect(driverSocket, 'rideRequested');

  // Intento de crear un viaje directamente por socket.
  const failure = waitFor(passengerSocket, 'rideRequestFailed', {
    predicate: payload => payload.tripId === 'trip_fantasma',
    label: 'rechazo de creación por socket'
  });
  passengerSocket.emit('rideRequested', {
    id: 'trip_fantasma',
    pickup: PICKUP,
    destination: DESTINATION,
    fareUSD: 5,
    paymentMethod: 'efectivo'
  });
  assert.equal((await failure).reason, 'USE_REST_API');
  await pause(300);

  // No se creó nada y ningún conductor fue molestado.
  const tripsAfterGhost = (await (await asJson(`${url}/api/trips?limit=100`, adminToken)).json()).items;
  assert.equal(tripsAfterGhost.find(trip => trip.id === 'trip_fantasma'), undefined);
  assert.deepEqual(driverOffers, [], 'No debió despacharse ninguna oferta');

  // Ahora un viaje legítimo por REST, y un intento de redespacharlo por socket.
  const offerReceived = waitFor(driverSocket, 'rideRequested', { predicate: payload => payload.id === 'trip_legitimo' });
  await createTripByRest(url, passenger.token, 'trip_legitimo');
  await offerReceived;
  const offersBefore = driverOffers.length;
  const snapshotBefore = ((await (await asJson(`${url}/api/trips?limit=100`, adminToken)).json()).items).find(trip => trip.id === 'trip_legitimo');

  const redispatchFailure = waitFor(passengerSocket, 'rideRequestFailed', {
    predicate: payload => payload.tripId === 'trip_legitimo',
    label: 'rechazo de redespacho'
  });
  passengerSocket.emit('rideRequested', {
    id: 'trip_legitimo',
    pickup: { lat: 11.0, lng: -72.0 },
    destination: { lat: 11.1, lng: -72.1 },
    fareUSD: 999,
    paymentMethod: 'wallet',
    status: 'COMPLETED'
  });
  assert.equal((await redispatchFailure).reason, 'USE_REST_API');
  await pause(400);

  // El viaje no fue modificado ni redespachado.
  const snapshotAfter = ((await (await asJson(`${url}/api/trips?limit=100`, adminToken)).json()).items).find(trip => trip.id === 'trip_legitimo');
  assert.equal(driverOffers.length, offersBefore, 'No debió emitirse una nueva oferta');
  assert.equal(snapshotAfter.status, snapshotBefore.status);
  assert.equal(snapshotAfter.fareUSD, snapshotBefore.fareUSD);
  assert.deepEqual(snapshotAfter.pickup, snapshotBefore.pickup);
  assert.deepEqual(snapshotAfter.destination, snapshotBefore.destination);
});

test('tripStatusUpdated difunde un payload canónico sin campos del cliente', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: 'canonico@58express.com', phone: '+584120055555', firstName: 'Ana' });
  const driver = await createDriver(url, adminToken, { email: 'emisor.estado@58express.com', phone: '+584140055555', firstName: 'Emisor', plate: 'CAN001' });

  const driverSocket = await connectDriver(url, driver.token, { lat: 10.6428, lng: -71.6126 });
  const passengerSocket = io(url, { auth: { token: passenger.token } });
  const adminSocket = io(url, { auth: { token: adminToken } });
  t.after(() => [driverSocket, passengerSocket, adminSocket].forEach(socket => socket.close()));
  await Promise.all([
    waitFor(passengerSocket, 'connect', { label: 'connect pasajero' }),
    waitFor(adminSocket, 'connect', { label: 'connect admin' })
  ]);

  const offerReceived = waitFor(driverSocket, 'rideRequested', { predicate: payload => payload.id === 'trip_canonico' });
  await createTripByRest(url, passenger.token, 'trip_canonico');
  await offerReceived;
  const assigned = waitFor(passengerSocket, 'tripStatusUpdated', { predicate: payload => payload.tripId === 'trip_canonico' });
  driverSocket.emit('rideAccepted', { tripId: 'trip_canonico' });
  await assigned;

  const passengerUpdate = waitFor(passengerSocket, 'tripStatusUpdated', {
    predicate: payload => payload.tripId === 'trip_canonico' && payload.status === 'ARRIVED',
    label: 'estado ARRIVED en el pasajero'
  });
  const adminUpdate = waitFor(adminSocket, 'tripStatusUpdated', {
    predicate: payload => payload.tripId === 'trip_canonico' && payload.status === 'ARRIVED',
    label: 'estado ARRIVED en administración'
  });

  // El conductor intenta colar datos suyos y de otros en la difusión.
  driverSocket.emit('tripStatusUpdated', {
    tripId: 'trip_canonico',
    status: 'ARRIVED',
    driver: { id: 'driver_falso', firstName: 'Suplantado', passwordHash: 'filtrado' },
    passengerId: 'passenger_falso',
    role: 'admin',
    fareUSD: 999,
    html: '<script>alert(1)</script>',
    reason: 'NO_DRIVERS_AVAILABLE',
    extra: { anidado: true }
  });

  for (const [audiencia, update] of [['pasajero', await passengerUpdate], ['administración', await adminUpdate]]) {
    assert.deepEqual(
      Object.keys(update).sort(),
      ['canonicalStatus', 'status', 'tripId', 'updatedAt'],
      `El payload difundido a ${audiencia} llevaba campos inesperados`
    );
    assert.equal(update.driver, undefined);
    assert.equal(update.html, undefined);
    assert.equal(update.role, undefined);
    assert.equal(update.fareUSD, undefined);
    assert.equal(update.reason, undefined);
    assert.equal(update.extra, undefined);
    assert.equal(update.passengerId, undefined);
  }

  // El estado difundido es exactamente el que quedó persistido.
  const update = await passengerUpdate;
  const trips = (await (await asJson(`${url}/api/trips?limit=100`, adminToken)).json()).items;
  const persisted = trips.find(trip => trip.id === 'trip_canonico');
  assert.equal(update.status, persisted.status);
  assert.equal(update.canonicalStatus, persisted.status);
  assert.equal(update.updatedAt, persisted.updatedAt);
  assert.equal(persisted.status, 'ARRIVED');
  // Los campos que intentó inyectar el conductor no tocaron el viaje.
  assert.notEqual(persisted.fareUSD, 999);
  assert.equal(persisted.driverId, driver.user.id);

  // Un estado no permitido desde el estado actual se rechaza sin difundir.
  const rejected = waitFor(driverSocket, 'tripStatusRejected', {
    predicate: payload => payload.tripId === 'trip_canonico',
    label: 'rechazo de transición inválida'
  });
  driverSocket.emit('tripStatusUpdated', { tripId: 'trip_canonico', status: 'SEARCHING' });
  assert.equal((await rejected).error, 'INVALID_TRIP_TRANSITION');
});
