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
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-auth-'));
  const port = 4600 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'integration-test-secret'
    },
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
  return `http://127.0.0.1:${port}/api`;
}

test('registro, login y sesión JWT funcionan sin exponer contraseña', async (t) => {
  const api = await startServer(t);
  const registration = await fetch(`${api}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'nuevo@58express.com',
      password: 'segura123',
      role: 'passenger',
      firstName: 'Nuevo',
      lastName: 'Pasajero'
    })
  });
  assert.equal(registration.status, 201);
  const created = await registration.json();
  assert.ok(created.token);
  assert.equal(created.user.passwordHash, undefined);

  const wrongPassword = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'nuevo@58express.com', password: 'incorrecta', role: 'passenger' })
  });
  assert.equal(wrongPassword.status, 401);

  const me = await fetch(`${api}/auth/me`, { headers: { authorization: `Bearer ${created.token}` } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, 'nuevo@58express.com');

  const forbidden = await fetch(`${api}/users`, { headers: { authorization: `Bearer ${created.token}` } });
  assert.equal(forbidden.status, 403);
});

test('no permite registrar correos duplicados', async (t) => {
  const api = await startServer(t);
  const payload = { email: 'duplicado@58express.com', password: 'segura123', role: 'passenger' };
  const first = await fetch(`${api}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const second = await fetch(`${api}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
});

test('un conductor requiere aprobación administrativa antes de conectarse', async (t) => {
  const api = await startServer(t);
  const registration = await fetch(`${api}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'pendiente@58express.com', password: 'segura123', role: 'driver', firstName: 'Pendiente' })
  });
  const driver = await registration.json();
  assert.equal(driver.user.isVerified, false);

  const rejectedSocket = io(api.replace('/api', ''), { auth: { token: driver.token }, reconnection: false });
  const rejection = await new Promise(resolve => rejectedSocket.on('connect_error', error => resolve(error.message)));
  rejectedSocket.close();
  assert.equal(rejection, 'DRIVER_NOT_APPROVED');

  const adminLogin = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@58express.com', password: 'admin', role: 'admin' })
  });
  const admin = await adminLogin.json();
  const approval = await fetch(`${api}/admin/drivers/${driver.user.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ action: 'approve' })
  });
  assert.equal(approval.status, 200);
  assert.equal((await approval.json()).isVerified, true);

  const approvedSocket = io(api.replace('/api', ''), { auth: { token: driver.token }, reconnection: false });
  await new Promise((resolve, reject) => {
    approvedSocket.on('connect', resolve);
    approvedSocket.on('connect_error', reject);
  });
  approvedSocket.close();
});
