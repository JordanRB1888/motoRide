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

  const persistedDb = new DatabaseSync(dataFile, { readOnly: true });
  const persisted = JSON.parse(persistedDb.prepare('SELECT payload FROM trips WHERE id = ?').get('test_trip').payload);
  persistedDb.close();
  assert.equal(persisted.status, 'DRIVER_ASSIGNED');
});
