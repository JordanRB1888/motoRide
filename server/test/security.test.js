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
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-security-'));
  const port = 12500 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'security-test-secret'
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
  return `http://127.0.0.1:${port}`;
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

// Comprueba que un evento NO se recibe durante la ventana indicada.
function expectSilence(socket, event, windowMs = 600) {
  const received = [];
  socket.on(event, payload => received.push(payload));
  return new Promise(resolve => setTimeout(() => resolve(received), windowMs));
}

async function connectDriver(url, token, { lat, lng }) {
  const socket = io(url, { auth: { token } });
  await waitFor(socket, 'connect', { label: 'connect' });
  socket.emit('driver:connect', { status: 'AVAILABLE' });
  await waitFor(socket, 'driver:connected', { label: 'driver:connected' });
  socket.emit('driver:location', { latitude: lat, longitude: lng, heading: 0 });
  await new Promise(resolve => setTimeout(resolve, 120));
  return socket;
}

const findUser = (users, id) => users.find(user => user.id === id);

test('un pasajero no puede cancelar la carrera de otro pasajero', async (t) => {
  const url = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const owner = await registerPassenger(url, { email: 'dueno@58express.com', phone: '+584120001111', firstName: 'Ana' });
  const intruder = await registerPassenger(url, { email: 'intruso@58express.com', phone: '+584120002222', firstName: 'Beto' });
  const driver = await createDriver(url, adminToken, { email: 'conductor.sec@58express.com', phone: '+584140005555', firstName: 'Carlos', plate: 'SEC001' });

  // Un conductor disponible mantiene el viaje en SEARCHING en vez de que el
  // despacho lo cancele por falta de candidatos.
  const driverSocket = await connectDriver(url, driver.token, { lat: 10.6428, lng: -71.6126 });
  const ownerSocket = io(url, { auth: { token: owner.token } });
  const intruderSocket = io(url, { auth: { token: intruder.token } });
  t.after(() => [driverSocket, ownerSocket, intruderSocket].forEach(socket => socket.close()));
  await Promise.all([
    waitFor(ownerSocket, 'connect', { label: 'connect dueño' }),
    waitFor(intruderSocket, 'connect', { label: 'connect intruso' })
  ]);

  const creation = await asJson(`${url}/api/trips/create`, owner.token, {
    method: 'POST',
    body: JSON.stringify({
      id: 'trip_propiedad',
      pickup: { lat: 10.6427, lng: -71.6125 },
      destination: { lat: 10.65, lng: -71.60 },
      fareUSD: 5,
      paymentMethod: 'efectivo',
      rideType: 'MOTO'
    })
  });
  assert.equal(creation.status, 200);

  // El intruso intenta cancelar un viaje que no le pertenece.
  const rejection = waitFor(intruderSocket, 'rideCancellationRejected', {
    predicate: payload => payload.tripId === 'trip_propiedad',
    label: 'rechazo de cancelación ajena'
  });
  const ownerNotified = expectSilence(ownerSocket, 'rideCancelled');
  intruderSocket.emit('rideCancelled', { tripId: 'trip_propiedad' });
  assert.equal((await rejection).error, 'FORBIDDEN');
  assert.deepEqual(await ownerNotified, [], 'El viaje ajeno no debe cancelarse');

  // El viaje sigue vivo para su dueño.
  const stillActive = await asJson(`${url}/api/trips/active/me`, owner.token);
  assert.equal(stillActive.status, 200);
  assert.equal((await stillActive.json()).trip.id, 'trip_propiedad');

  // El dueño sí puede cancelarlo.
  const cancelled = waitFor(ownerSocket, 'rideCancelled', { predicate: payload => payload.tripId === 'trip_propiedad' });
  ownerSocket.emit('rideCancelled', { tripId: 'trip_propiedad' });
  await cancelled;
  await new Promise(resolve => setTimeout(resolve, 120));

  const trips = await (await asJson(`${url}/api/trips`, adminToken)).json();
  assert.equal(trips.find(trip => trip.id === 'trip_propiedad').status, 'CANCELLED');

  // Y no puede volver a cancelar un viaje ya cerrado.
  const secondRejection = waitFor(ownerSocket, 'rideCancellationRejected', {
    predicate: payload => payload.tripId === 'trip_propiedad',
    label: 'rechazo de doble cancelación'
  });
  ownerSocket.emit('rideCancelled', { tripId: 'trip_propiedad' });
  assert.equal((await secondRejection).error, 'TRIP_NOT_CANCELLABLE');

  // Un viaje inexistente tampoco filtra información.
  const missingRejection = waitFor(ownerSocket, 'rideCancellationRejected', {
    predicate: payload => payload.tripId === 'trip_inexistente'
  });
  ownerSocket.emit('rideCancelled', { tripId: 'trip_inexistente' });
  assert.equal((await missingRejection).error, 'TRIP_NOT_FOUND');
});

test('un conductor no puede modificar a otro conductor con identificadores del payload', async (t) => {
  const url = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const attacker = await createDriver(url, adminToken, { email: 'atacante@58express.com', phone: '+584140006666', firstName: 'Atacante', plate: 'SEC002' });
  const victim = await createDriver(url, adminToken, { email: 'victima@58express.com', phone: '+584140007777', firstName: 'Victima', plate: 'SEC003' });

  const attackerSocket = await connectDriver(url, attacker.token, { lat: 10.6400, lng: -71.6100 });
  const victimSocket = await connectDriver(url, victim.token, { lat: 10.7000, lng: -71.7000 });
  t.after(() => [attackerSocket, victimSocket].forEach(socket => socket.close()));

  const before = await (await asJson(`${url}/api/users`, adminToken)).json();
  assert.equal(findUser(before, victim.user.id).status, 'AVAILABLE');
  assert.equal(findUser(before, victim.user.id).location.lat, 10.7);

  // Intento de apagar al otro conductor suplantando su identificador.
  attackerSocket.emit('driver:status', { driverId: victim.user.id, userId: victim.user.id, status: 'OFFLINE' });
  await new Promise(resolve => setTimeout(resolve, 200));
  attackerSocket.emit('driver:status_change', { driverId: victim.user.id, userId: victim.user.id, status: 'OFFLINE' });
  await new Promise(resolve => setTimeout(resolve, 200));

  // Intento de mover el GPS del otro conductor.
  attackerSocket.emit('driver:location', { driverId: victim.user.id, userId: victim.user.id, latitude: 1.1, longitude: 2.2 });
  await new Promise(resolve => setTimeout(resolve, 200));
  attackerSocket.emit('driver:location_update', { driverId: victim.user.id, userId: victim.user.id, latitude: 3.3, longitude: 4.4 });
  await new Promise(resolve => setTimeout(resolve, 200));

  // Intento por REST enviando el identificador ajeno en el cuerpo.
  const restStatus = await asJson(`${url}/api/drivers/status`, attacker.token, {
    method: 'PATCH',
    body: JSON.stringify({ driverId: victim.user.id, userId: victim.user.id, status: 'OFFLINE' })
  });
  assert.equal(restStatus.status, 200);
  const restLocation = await asJson(`${url}/api/drivers/location`, attacker.token, {
    method: 'PATCH',
    body: JSON.stringify({ driverId: victim.user.id, userId: victim.user.id, latitude: 5.5, longitude: 6.6 })
  });
  assert.equal(restLocation.status, 200);

  const after = await (await asJson(`${url}/api/users`, adminToken)).json();
  const victimAfter = findUser(after, victim.user.id);
  const attackerAfter = findUser(after, attacker.user.id);

  // La víctima quedó intacta.
  assert.equal(victimAfter.status, 'AVAILABLE');
  assert.equal(victimAfter.location.lat, 10.7);
  assert.equal(victimAfter.location.lng, -71.7);

  // Los cambios recayeron sobre el propio atacante.
  assert.equal(attackerAfter.status, 'OFFLINE');
  assert.equal(attackerAfter.location.lat, 5.5);
  assert.equal(attackerAfter.location.lng, 6.6);

  // Las respuestas REST nunca devuelven el hash de contraseña.
  assert.equal((await restStatus.json()).passwordHash, undefined);
  assert.equal((await restLocation.json()).passwordHash, undefined);
});

test('se rechazan estados y coordenadas inválidos en REST y en Socket.IO', async (t) => {
  const url = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const driver = await createDriver(url, adminToken, { email: 'validacion@58express.com', phone: '+584140008888', firstName: 'Validador', plate: 'SEC004' });
  const driverSocket = await connectDriver(url, driver.token, { lat: 10.6428, lng: -71.6126 });
  t.after(() => driverSocket.close());

  for (const status of ['SUSPENDED', 'PENDING_APPROVAL', 'HACKED', '', null, 42, { evil: true }]) {
    const response = await asJson(`${url}/api/drivers/status`, driver.token, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    assert.equal(response.status, 400, `El estado ${JSON.stringify(status)} debió rechazarse`);
    assert.equal((await response.json()).error, 'INVALID_DRIVER_STATUS');
  }

  for (const status of ['AVAILABLE', 'BUSY', 'IN_TRIP', 'OFFLINE', 'available', 'ONLINE']) {
    const response = await asJson(`${url}/api/drivers/status`, driver.token, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    assert.equal(response.status, 200, `El estado ${status} debió aceptarse`);
    const expected = status.toUpperCase() === 'ONLINE' ? 'AVAILABLE' : status.toUpperCase();
    assert.equal((await response.json()).status, expected);
  }

  const invalidCoordinates = [
    { latitude: 91, longitude: 0 },
    { latitude: -91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: -181 },
    { latitude: 'abc', longitude: 'def' },
    { latitude: null, longitude: null },
    { latitude: Infinity, longitude: 0 },
    {}
  ];
  for (const body of invalidCoordinates) {
    const response = await asJson(`${url}/api/drivers/location`, driver.token, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 400, `Las coordenadas ${JSON.stringify(body)} debieron rechazarse`);
    assert.equal((await response.json()).error, 'INVALID_COORDINATES');
  }

  // La ubicación válida previa no fue sobrescrita por los intentos inválidos.
  const users = await (await asJson(`${url}/api/users`, adminToken)).json();
  assert.equal(findUser(users, driver.user.id).location.lat, 10.6428);

  // Socket.IO aplica exactamente la misma validación.
  const locationRejected = waitFor(driverSocket, 'driver:location_rejected', { label: 'rechazo de coordenadas por socket' });
  driverSocket.emit('driver:location', { latitude: 120, longitude: 500 });
  assert.equal((await locationRejected).error, 'INVALID_COORDINATES');

  const statusRejected = waitFor(driverSocket, 'driver:status_rejected', { label: 'rechazo de estado por socket' });
  driverSocket.emit('driver:status', { status: 'SUSPENDED' });
  assert.equal((await statusRejected).error, 'INVALID_DRIVER_STATUS');

  const changeRejected = waitFor(driverSocket, 'driver:status_rejected', { label: 'rechazo de estado alterno por socket' });
  driverSocket.emit('driver:status_change', { status: 'TELEPORTING' });
  assert.equal((await changeRejected).error, 'INVALID_DRIVER_STATUS');

  await new Promise(resolve => setTimeout(resolve, 150));
  const finalUsers = await (await asJson(`${url}/api/users`, adminToken)).json();
  const finalDriver = findUser(finalUsers, driver.user.id);
  assert.equal(finalDriver.location.lat, 10.6428);
  assert.equal(finalDriver.status, 'AVAILABLE');
});

test('los eventos de flota y administración no llegan a conductores ni pasajeros ajenos', async (t) => {
  const url = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: 'curioso@58express.com', phone: '+584120009999', firstName: 'Curioso' });
  const watcher = await createDriver(url, adminToken, { email: 'mirón@58express.com', phone: '+584140001010', firstName: 'Miron', plate: 'SEC005' });
  const mover = await createDriver(url, adminToken, { email: 'movil@58express.com', phone: '+584140002020', firstName: 'Movil', plate: 'SEC006' });

  const watcherSocket = await connectDriver(url, watcher.token, { lat: 10.60, lng: -71.60 });
  const passengerSocket = io(url, { auth: { token: passenger.token } });
  const adminSocket = io(url, { auth: { token: adminToken } });
  t.after(() => [watcherSocket, passengerSocket, adminSocket].forEach(socket => socket.close()));
  await Promise.all([
    waitFor(passengerSocket, 'connect', { label: 'connect pasajero' }),
    waitFor(adminSocket, 'connect', { label: 'connect admin' })
  ]);

  const adminSawUpdate = waitFor(adminSocket, 'admin:driver_updated', {
    predicate: payload => payload.id === mover.user.id,
    label: 'actualización de conductor en administración'
  });
  const adminSawLocation = waitFor(adminSocket, 'admin:driver_location', {
    predicate: payload => payload.driverId === mover.user.id,
    label: 'ubicación de conductor en administración'
  });

  const passengerLeaks = [
    expectSilence(passengerSocket, 'admin:driver_updated', 1200),
    expectSilence(passengerSocket, 'admin:driver_location', 1200),
    expectSilence(passengerSocket, 'driverStatusChanged', 1200)
  ];
  const watcherLeaks = [
    expectSilence(watcherSocket, 'admin:driver_updated', 1200),
    expectSilence(watcherSocket, 'admin:driver_location', 1200),
    expectSilence(watcherSocket, 'driverStatusChanged', 1200)
  ];

  const moverSocket = await connectDriver(url, mover.token, { lat: 10.65, lng: -71.65 });
  t.after(() => moverSocket.close());
  moverSocket.emit('driver:status', { status: 'BUSY' });

  const adminUpdate = await adminSawUpdate;
  await adminSawLocation;

  // Administración recibe el perfil, pero nunca el hash de contraseña.
  assert.equal(adminUpdate.passwordHash, undefined);
  assert.equal(adminUpdate.email, 'movil@58express.com');

  for (const leak of await Promise.all(passengerLeaks)) {
    assert.deepEqual(leak, [], 'Un pasajero sin viaje activo no debe recibir datos de la flota');
  }
  for (const leak of await Promise.all(watcherLeaks)) {
    assert.deepEqual(leak, [], 'Un conductor no debe recibir datos de otros conductores');
  }
});
