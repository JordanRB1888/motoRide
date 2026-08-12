import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { DatabaseSync } from 'node:sqlite';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Campos que nunca pueden cruzar de un rol al otro. */
const PROHIBIDOS = [
  'email', 'passwordHash', 'photoStorageKey', 'cedula', 'documents',
  'walletBalance', 'location', 'socketId', 'driverApplicationId',
  'accountStatus', 'isVerified', 'status', 'disabledReason',
  'emailVerified', 'phoneVerified', 'role'
];

const CLAVES_PASAJERO = ['firstName', 'id', 'lastName', 'photoUrl', 'rating'];
const CLAVES_CONDUCTOR = [
  'firstName', 'id', 'lastName', 'photoUrl', 'rating', 'totalTrips',
  'vehicleBrand', 'vehicleColor', 'vehicleModel', 'vehiclePlate', 'vehicleType'
];

function startProcess(dataFile, port) {
  return spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, JWT_SECRET: 'minimization-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function waitForBoot(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 10000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
}

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-min-'));
  const dataFile = path.join(tempDir, 'database.json');
  const port = 5900 + Math.floor(Math.random() * 400);
  const child = startProcess(dataFile, port);
  t.after(() => child.kill());
  await waitForBoot(child);
  return { url: `http://127.0.0.1:${port}`, dataFile, port, child };
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
    method: 'POST', body: JSON.stringify({ identifier, password, role })
  });
  assert.equal(response.status, 200, `Login fallido para ${identifier}`);
  return (await response.json()).token;
}

async function registerPassenger(url, { email, phone, firstName = 'Ana' }) {
  const response = await asJson(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({ email, phone, password: 'password123', role: 'passenger', firstName, lastName: 'Cliente' })
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function createDriver(url, adminToken, { email, phone, plate }) {
  const response = await asJson(`${url}/api/admin/drivers`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ email, phone, firstName: 'Carlos', lastName: 'Mendoza', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: plate })
  });
  assert.equal(response.status, 201);
  const account = await response.json();
  return { ...account, token: await login(url, email, account.temporaryPassword, 'driver') };
}

function waitFor(socket, event, { predicate = () => true, timeoutMs = 6000, label = event } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`No llegó ${label}`)); }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer); socket.off(event, handler); resolve(payload);
    }
    socket.on(event, handler);
  });
}

async function connectDriver(url, token, { lat = 10.6428, lng = -71.6126 } = {}) {
  const socket = io(url, { auth: { token } });
  await waitFor(socket, 'connect', { label: 'connect' });
  socket.emit('driver:connect', { status: 'AVAILABLE' });
  await waitFor(socket, 'driver:connected', { label: 'driver:connected' });
  socket.emit('driver:location', { latitude: lat, longitude: lng, heading: 0 });
  await new Promise(r => setTimeout(r, 150));
  return socket;
}

const PICKUP = { lat: 10.6427, lng: -71.6125 };
const DESTINATION = { lat: 10.65, lng: -71.60 };

function assertSinCamposProhibidos(objeto, contexto) {
  for (const campo of PROHIBIDOS) {
    assert.equal(objeto?.[campo], undefined, `${contexto}: no debía incluir ${campo}`);
  }
}

/** Monta un viaje asignado con pasajero y conductor reales. */
async function escenarioViajeAsignado(t, sufijo) {
  const server = await startServer(t);
  const { url } = server;
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: `p${sufijo}@58express.com`, phone: `+58412000${sufijo}` });
  const driver = await createDriver(url, adminToken, { email: `d${sufijo}@58express.com`, phone: `+58414000${sufijo}`, plate: `MIN${sufijo}` });

  const driverSocket = await connectDriver(url, driver.token);
  const passengerSocket = io(url, { auth: { token: passenger.token } });
  t.after(() => [driverSocket, passengerSocket].forEach(s => s.close()));
  await waitFor(passengerSocket, 'connect', { label: 'connect pasajero' });

  const oferta = waitFor(driverSocket, 'rideRequested', { predicate: p => p.id === `trip_${sufijo}` });
  const creacion = await asJson(`${url}/api/trips/create`, passenger.token, {
    method: 'POST',
    body: JSON.stringify({ id: `trip_${sufijo}`, pickup: PICKUP, destination: DESTINATION, fareUSD: 5, paymentMethod: 'efectivo', rideType: 'MOTO' })
  });
  assert.equal(creacion.status, 200);
  await oferta;

  const asignado = waitFor(passengerSocket, 'tripStatusUpdated', { predicate: p => p.tripId === `trip_${sufijo}` });
  driverSocket.emit('rideAccepted', { tripId: `trip_${sufijo}` });
  await asignado;
  await new Promise(r => setTimeout(r, 150));

  return { ...server, adminToken, passenger, driver, driverSocket, passengerSocket, tripId: `trip_${sufijo}` };
}

test('el conductor recibe exactamente las claves permitidas del pasajero', async (t) => {
  const s = await escenarioViajeAsignado(t, '01');
  const respuesta = await asJson(`${s.url}/api/trips/active/me`, s.driver.token);
  assert.equal(respuesta.status, 200);
  const { passenger } = await respuesta.json();

  assert.deepEqual(Object.keys(passenger).sort(), CLAVES_PASAJERO.sort());
  assertSinCamposProhibidos(passenger, 'passenger visto por el conductor');
  assert.equal(passenger.phone, undefined, 'el teléfono del pasajero no se entrega en esta fase');
  // Lo que la app del conductor sí necesita sigue presente.
  assert.equal(passenger.firstName, 'Ana');
  assert.equal(passenger.lastName, 'Cliente');
  assert.ok('rating' in passenger);
});

test('el pasajero recibe exactamente las claves permitidas del conductor', async (t) => {
  const s = await escenarioViajeAsignado(t, '02');
  const respuesta = await asJson(`${s.url}/api/trips/active/me`, s.passenger.token);
  assert.equal(respuesta.status, 200);
  const { driver } = await respuesta.json();

  // Viaje activo: se permite el teléfono para poder llamar.
  assert.deepEqual(Object.keys(driver).sort(), [...CLAVES_CONDUCTOR, 'phone'].sort());
  assertSinCamposProhibidos(driver, 'driver visto por el pasajero');
  assert.equal(driver.firstName, 'Carlos');
  assert.equal(driver.vehiclePlate, 'MIN02');
});

test('los campos sensibles no aparecen en /trips/active/me', async (t) => {
  const s = await escenarioViajeAsignado(t, '03');

  // Se inspecciona el perfil del OTRO participante: el propio no se recorta,
  // porque son los datos de quien pregunta.
  const vistaPasajero = await (await asJson(`${s.url}/api/trips/active/me`, s.passenger.token)).json();
  const vistaConductor = await (await asJson(`${s.url}/api/trips/active/me`, s.driver.token)).json();

  for (const [rol, ajeno] of [['pasajero ve al conductor', vistaPasajero.driver], ['conductor ve al pasajero', vistaConductor.passenger]]) {
    const crudo = JSON.stringify(ajeno);
    for (const marca of ['passwordHash', 'photoStorageKey', 'walletBalance', 'socketId', 'driverApplicationId', 'cedula', 'documents', 'accountStatus']) {
      assert.ok(!crudo.includes(marca), `${rol}: no debía contener ${marca}`);
    }
    assert.ok(!crudo.includes('@58express.com'), `${rol}: no debía viajar ningún correo`);
  }

  // Y el viaje en sí tampoco arrastra un perfil contaminado.
  assert.ok(!JSON.stringify(vistaPasajero.trip).includes('passwordHash'));
  assert.ok(!JSON.stringify(vistaConductor.trip).includes('walletBalance'));

  // El propio perfil sí conserva sus datos: es de quien pregunta.
  assert.ok(vistaPasajero.passenger.email, 'el pasajero conserva su propio correo');
  assert.equal(typeof vistaPasajero.passenger.walletBalance, 'number', 'y su propio saldo');
});

test('los campos sensibles no aparecen en /trips/:id', async (t) => {
  const s = await escenarioViajeAsignado(t, '04');
  const comoPasajero = await (await asJson(`${s.url}/api/trips/${s.tripId}`, s.passenger.token)).json();
  const comoConductor = await (await asJson(`${s.url}/api/trips/${s.tripId}`, s.driver.token)).json();

  assertSinCamposProhibidos(comoPasajero.driver, '/trips/:id driver');
  assertSinCamposProhibidos(comoConductor.passenger, '/trips/:id passenger');
  assert.deepEqual(Object.keys(comoConductor.passenger).sort(), CLAVES_PASAJERO.sort());

  // El propio perfil de quien pregunta no se recorta.
  assert.ok(comoPasajero.passenger.email, 'el pasajero conserva su propio correo');
  assert.ok(comoConductor.driver.email, 'el conductor conserva su propio correo');
});

test('el teléfono del conductor desaparece cuando el viaje deja de estar activo', async (t) => {
  const s = await escenarioViajeAsignado(t, '05');
  const activo = await (await asJson(`${s.url}/api/trips/${s.tripId}`, s.passenger.token)).json();
  assert.equal(typeof activo.driver.phone, 'string', 'viaje activo: se permite llamar');

  for (const estado of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    s.driverSocket.emit('tripStatusUpdated', { tripId: s.tripId, status: estado });
    await new Promise(r => setTimeout(r, 120));
  }

  const cerrado = await (await asJson(`${s.url}/api/trips/${s.tripId}`, s.passenger.token)).json();
  assert.equal(cerrado.trip.status, 'COMPLETED');
  assert.equal(cerrado.driver.phone, undefined, 'viaje cerrado: el teléfono ya no se entrega');
  assert.deepEqual(Object.keys(cerrado.driver).sort(), CLAVES_CONDUCTOR.sort());
});

test('la bolsa de programados no entrega el perfil completo del pasajero', async (t) => {
  const server = await startServer(t);
  const { url } = server;
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: 'prog@58express.com', phone: '+584120009090' });
  const driver = await createDriver(url, adminToken, { email: 'dprog@58express.com', phone: '+584140009090', plate: 'PROG01' });

  const creacion = await asJson(`${url}/api/trips/scheduled`, passenger.token, {
    method: 'POST',
    body: JSON.stringify({
      pickup: { address: 'Vereda del Lago' }, destination: { address: 'Sambil Maracaibo' },
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), fareUSD: 4.5, rideType: 'MOTO'
    })
  });
  assert.equal(creacion.status, 201);

  const bolsa = await (await asJson(`${url}/api/trips/scheduled/available`, driver.token)).json();
  assert.ok(bolsa.length >= 1);
  for (const viaje of bolsa) {
    assert.deepEqual(Object.keys(viaje.passenger).sort(), CLAVES_PASAJERO.sort());
    assertSinCamposProhibidos(viaje.passenger, 'bolsa de programados');
  }
  const crudo = JSON.stringify(bolsa);
  assert.ok(!crudo.includes('prog@58express.com'), 'no debía viajar el correo del pasajero');
  assert.ok(!crudo.includes('+584120009090'), 'no debía viajar el teléfono del pasajero');
});

test('scheduled_trip:claimed no entrega información privada del conductor', async (t) => {
  const server = await startServer(t);
  const { url } = server;
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: 'claim@58express.com', phone: '+584120008080' });
  const driver = await createDriver(url, adminToken, { email: 'dclaim@58express.com', phone: '+584140008080', plate: 'CLAIM1' });

  const passengerSocket = io(url, { auth: { token: passenger.token } });
  t.after(() => passengerSocket.close());
  await waitFor(passengerSocket, 'connect', { label: 'connect pasajero' });

  const programado = await (await asJson(`${url}/api/trips/scheduled`, passenger.token, {
    method: 'POST',
    body: JSON.stringify({
      pickup: { address: 'La Limpia' }, destination: { address: 'Vereda del Lago' },
      scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), fareUSD: 5, rideType: 'MOTO'
    })
  })).json();

  const aviso = waitFor(passengerSocket, 'scheduled_trip:claimed', { predicate: p => p.tripId === programado.id });
  const reclamo = await asJson(`${url}/api/trips/scheduled/${programado.id}/claim`, driver.token, { method: 'POST' });
  assert.equal(reclamo.status, 200);
  const evento = await aviso;

  assert.deepEqual(Object.keys(evento.driver).sort(), CLAVES_CONDUCTOR.sort());
  assertSinCamposProhibidos(evento.driver, 'scheduled_trip:claimed');
  assert.equal(evento.driver.phone, undefined, 'un viaje programado aún no habilita la llamada');
  assert.ok(!JSON.stringify(evento).includes('dclaim@58express.com'));
});

test('un viaje histórico con perfil incrustado queda saneado al responder', async (t) => {
  // Fase 1: arrancar, registrar al pasajero y detener el servidor.
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-hist-'));
  const dataFile = path.join(tempDir, 'database.json');
  const port = 6400 + Math.floor(Math.random() * 300);

  const primero = startProcess(dataFile, port);
  await waitForBoot(primero);
  const url = `http://127.0.0.1:${port}`;
  const passenger = await registerPassenger(url, { email: 'hist@58express.com', phone: '+584120007070' });
  primero.kill();
  await new Promise(r => setTimeout(r, 600));

  // Fase 2: inyectar un viaje como los que guardaba el código anterior a
  // cafc7e8, con el registro completo del conductor incrustado.
  const db = new DatabaseSync(dataFile);
  const viajeAntiguo = {
    id: 'trip_historico',
    passengerId: passenger.user.id,
    driverId: 'driver_antiguo',
    status: 'COMPLETED',
    fareUSD: 4.5,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    completedAt: new Date(Date.now() - 86000000).toISOString(),
    driver: {
      id: 'driver_antiguo', firstName: 'Carlos', lastName: 'Mendoza',
      photoUrl: '/api/users/driver_antiguo/photo', rating: 4.9, totalTrips: 120,
      vehicleType: 'MOTO', vehicleBrand: 'Bera', vehicleModel: 'BR200',
      vehicleColor: 'Negro', vehiclePlate: 'OLD001',
      email: 'antiguo@58express.com', phone: '+584140006060',
      cedula: 'V-11223344', walletBalance: -7.5,
      documents: { cedula: 'approved' }, socketId: 'sId_old',
      location: { lat: 10.6, lng: -71.6 }, accountStatus: 'ACTIVE', isVerified: true
    }
  };
  db.prepare('INSERT INTO trips (id, payload) VALUES (?, ?)').run(viajeAntiguo.id, JSON.stringify(viajeAntiguo));
  db.close();

  // Fase 3: arrancar de nuevo y pedir el historial.
  const segundo = startProcess(dataFile, port);
  t.after(() => segundo.kill());
  await waitForBoot(segundo);
  const token = await login(url, 'hist@58express.com', 'password123', 'passenger');

  const historial = await (await asJson(`${url}/api/trips/me/history`, token)).json();
  const historico = historial.find(item => item.id === 'trip_historico');
  assert.ok(historico, 'el viaje histórico debía estar en el historial');

  assert.deepEqual(Object.keys(historico.driver).sort(), CLAVES_CONDUCTOR.sort());
  assertSinCamposProhibidos(historico.driver, 'viaje histórico');
  assert.equal(historico.driver.phone, undefined, 'viaje cerrado: sin teléfono');

  const crudo = JSON.stringify(historial);
  assert.ok(!crudo.includes('antiguo@58express.com'), 'no debía sobrevivir el correo');
  assert.ok(!crudo.includes('V-11223344'), 'no debía sobrevivir la cédula');
  assert.ok(!crudo.includes('sId_old'), 'no debía sobrevivir el socketId');

  // Los datos del viaje en sí se conservan.
  assert.equal(historico.status, 'COMPLETED');
  assert.equal(historico.fareUSD, 4.5);
  assert.equal(historico.driver.vehiclePlate, 'OLD001');
});
