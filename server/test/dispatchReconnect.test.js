import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function once(socket, event, predicate = () => true, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No llegó ${event}`)), timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

test('D integración: disconnect -> reconnect -> registro -> oferta restaurada', async t => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58-dispatch-reconnect-'));
  const port = 19400 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.sqlite'),
      JWT_SECRET: 'dispatch-reconnect-secret-with-safe-length',
      ADMIN_PASSWORD: 'dispatch-admin-password'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());

  let startup = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Servidor no inició: ${startup}`)), 10_000);
    child.stdout.on('data', chunk => {
      startup += chunk.toString();
      if (startup.includes('Running')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', chunk => { startup += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Servidor terminó ${code}: ${startup}`)));
  });

  const url = `http://127.0.0.1:${port}`;
  const request = (route, token, options = {}) => fetch(`${url}${route}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const login = async (identifier, password, role) => {
    const response = await request('/api/auth/login', null, {
      method: 'POST', body: JSON.stringify({ identifier, password, role })
    });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  };

  const adminToken = await login('admin@58express.com', 'dispatch-admin-password', 'admin');
  const passengerResponse = await request('/api/auth/register', null, {
    method: 'POST',
    body: JSON.stringify({
      email: 'reconnect.passenger@example.com', phone: '+584121110001', password: 'password123',
      role: 'passenger', firstName: 'Reconnect', lastName: 'Passenger'
    })
  });
  assert.equal(passengerResponse.status, 201);
  const passenger = await passengerResponse.json();
  const driverResponse = await request('/api/admin/drivers', adminToken, {
    method: 'POST',
    body: JSON.stringify({
      email: 'reconnect.driver@example.com', phone: '+584141110002', firstName: 'Reconnect',
      lastName: 'Driver', vehicleBrand: 'Bera', vehicleModel: 'SBR', vehiclePlate: 'REC001'
    })
  });
  assert.equal(driverResponse.status, 201);
  const driverAccount = await driverResponse.json();
  const driverToken = await login('reconnect.driver@example.com', driverAccount.temporaryPassword, 'driver');

  const first = io(url, { auth: { token: driverToken }, transports: ['websocket'] });
  await once(first, 'connect');
  first.emit('driver:connect', { status: 'AVAILABLE' });
  await once(first, 'driver:connected');
  first.emit('driver:location', { latitude: 10.6428, longitude: -71.6126 });
  await wait(100);
  first.close();
  await wait(250);

  const reconnected = io(url, { auth: { token: driverToken }, transports: ['websocket'] });
  t.after(() => reconnected.close());
  await once(reconnected, 'connect');
  reconnected.emit('driver:connect', { status: 'AVAILABLE' });
  await once(reconnected, 'driver:connected');
  reconnected.emit('driver:location', { latitude: 10.6428, longitude: -71.6126 });
  await wait(100);

  const offer = once(reconnected, 'rideRequested', payload => payload.id === 'trip_after_reconnect');
  const create = await request('/api/trips/create', passenger.token, {
    method: 'POST',
    body: JSON.stringify({
      id: 'trip_after_reconnect', pickup: { lat: 10.6427, lng: -71.6125 },
      destination: { lat: 10.65, lng: -71.60 }, fareUSD: 4, paymentMethod: 'CASH', rideType: 'MOTO'
    })
  });
  assert.equal(create.status, 200);
  assert.equal((await offer).offeredDriverId, driverAccount.user.id);
});
