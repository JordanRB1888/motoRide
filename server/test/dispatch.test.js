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

test('pasajero, conductor y administración comparten el ciclo de una carrera', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-'));
  const dataFile = path.join(tempDir, 'database.json');
  const port = 4100 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 5000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });

  const url = `http://127.0.0.1:${port}`;
  const login = async (identifier, password, role) => {
    const response = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password, role })
    });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  };
  const passengerToken = await login('pasajero@58express.com', 'password123', 'passenger');
  const driverToken = await login('conductor@58express.com', 'password123', 'driver');
  const adminToken = await login('admin@58express.com', 'admin', 'admin');
  const passenger = io(url, { auth: { token: passengerToken } });
  const driver = io(url, { auth: { token: driverToken } });
  const admin = io(url, { auth: { token: adminToken } });
  t.after(() => [passenger, driver, admin].forEach(socket => socket.close()));

  let adminSawRequest = false;
  admin.on('rideRequested', trip => {
    if (trip.id === 'test_trip') adminSawRequest = true;
  });
  driver.on('connect', () => driver.emit('driver:connect', { userId: 'd1', status: 'AVAILABLE' }));
  driver.on('rideRequested', trip => {
    if (trip.id === 'test_trip') {
      driver.emit('rideAccepted', { tripId: trip.id, driver: { id: 'd1', firstName: 'Carlos' } });
    }
  });

  await Promise.all([
    new Promise(resolve => passenger.on('connect', resolve)),
    new Promise(resolve => driver.on('driver:connected', resolve)),
    new Promise(resolve => admin.on('connect', resolve))
  ]);

  const updatePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó la asignación')), 5000);
    passenger.on('tripStatusUpdated', update => {
      if (update.tripId === 'test_trip' && update.status === 'EN_ROUTE') {
        clearTimeout(timeout);
        resolve(update);
      }
    });
  });

  passenger.emit('rideRequested', {
    id: 'test_trip',
    passengerId: 'p1',
    pickup: { lat: 10.6427, lng: -71.6125 },
    destination: { lat: 10.65, lng: -71.60 },
    fareEUR: 4.5
  });

  const update = await updatePromise;
  assert.equal(adminSawRequest, true);
  assert.equal(update.driver.id, 'd1');

  const locationPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó el GPS del conductor')), 5000);
    passenger.on('driverLocationUpdated', location => {
      if (location.tripId === 'test_trip' && location.driverId === 'd1') {
        clearTimeout(timeout);
        resolve(location);
      }
    });
  });
  driver.emit('driver:location_update', { latitude: 10.643, longitude: -71.613, heading: 45 });
  const location = await locationPromise;
  assert.equal(location.lat, 10.643);

  const passengerLocationPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó el GPS del pasajero')), 5000);
    driver.on('passengerLocationUpdated', location => {
      if (location.tripId === 'test_trip') {
        clearTimeout(timeout);
        resolve(location);
      }
    });
  });
  passenger.emit('passenger:location_update', { latitude: 10.644, longitude: -71.614 });
  const passengerLocation = await passengerLocationPromise;
  assert.equal(passengerLocation.passengerId, 'p1');

  const activeResponse = await fetch(`${url}/api/trips/active/me`, {
    headers: { authorization: `Bearer ${passengerToken}` }
  });
  assert.equal(activeResponse.status, 200);
  assert.equal((await activeResponse.json()).trip.id, 'test_trip');

  const chatPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó el mensaje al conductor')), 5000);
    driver.on('chat:message', message => {
      if (message.tripId === 'test_trip' && message.text === 'Voy saliendo') {
        clearTimeout(timeout);
        resolve(message);
      }
    });
  });
  passenger.emit('chat:send_message', { tripId: 'test_trip', text: 'Voy saliendo' });
  const message = await chatPromise;
  assert.equal(message.senderId, 'p1');

  const historyResponse = await fetch(`${url}/api/trips/test_trip/messages`, {
    headers: { authorization: `Bearer ${passengerToken}` }
  });
  assert.equal(historyResponse.status, 200);
  assert.equal((await historyResponse.json()).length, 1);

  const persistedDb = new DatabaseSync(dataFile, { readOnly: true });
  const persisted = JSON.parse(persistedDb.prepare('SELECT payload FROM trips WHERE id = ?').get('test_trip').payload);
  persistedDb.close();
  assert.equal(persisted.status, 'DRIVER_ASSIGNED');
});
