import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(64).fill(0x20)]);
const REQUIRED_DOCS = [
  'identity_front', 'identity_back', 'driver_license', 'vehicle_registration',
  'vehicle_photo', 'plate_photo', 'driver_selfie'
];

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-evt-'));
  const port = 11700 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'database.json'), JWT_SECRET: 'events-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}` };
}

const asJson = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
});

async function login(url, identifier, password, role) {
  const r = await asJson(`${url}/api/auth/login`, null, { method: 'POST', body: JSON.stringify({ identifier, password, role }) });
  assert.equal(r.status, 200);
  return (await r.json()).token;
}

async function submitApplication(url, { email, phone, plate, identityNumber }) {
  const form = new FormData();
  const campos = {
    firstName: 'Nombre', lastName: 'Apellido', identityNumber, birthDate: '1990-01-01',
    phone, email, address: 'Dirección de ejemplo 123', city: 'Ciudad', region: 'Región',
    password: 'password123', vehicleType: 'MOTO', vehicleBrand: 'Marca', vehicleModel: 'Modelo',
    vehicleYear: '2020', vehicleColor: 'Color', vehiclePlate: plate, vehicleAdditionalInfo: 'Nota'
  };
  for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor);
  for (const tipo of REQUIRED_DOCS) form.append(tipo, new Blob([PNG], { type: 'image/png' }), `${tipo}.png`);
  const response = await fetch(`${url}/api/driver-applications`, { method: 'POST', body: form });
  assert.equal(response.status, 201);
  return response.json();
}

function whenConnected(socket) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El socket no conectó')), 8000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
  });
}

function whenEvent(socket, event, label = event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`No llegó ${label}`)); }, 9000);
    function handler(payload) { clearTimeout(timer); socket.off(event, handler); resolve(payload); }
    socket.on(event, handler);
  });
}

/** Marcas que jamás deben viajar por el canal en tiempo real. */
function assertEventoLimpio(evento, datos) {
  assert.deepEqual(Object.keys(evento).sort(), ['applicationId', 'status', 'updatedAt']);
  const crudo = JSON.stringify(evento);
  for (const marca of [...datos, 'Dirección', 'contentUrl', 'storageKey', 'personal', 'documents', '1990-01-01', 'identityNumber']) {
    assert.ok(!crudo.includes(marca), `el evento no debía contener: ${marca}`);
  }
}

test('driver_application:new avisa a administración sin el expediente', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');

  const adminSocket = io(url, { auth: { token: adminToken } });
  t.after(() => adminSocket.close());
  await whenConnected(adminSocket);

  const aviso = whenEvent(adminSocket, 'driver_application:new');
  const creada = await submitApplication(url, {
    email: 'evento1@ejemplo.test', phone: '+584140020001', plate: 'EVT001', identityNumber: 'V-88888881'
  });
  const evento = await aviso;

  assertEventoLimpio(evento, ['V-88888881', 'evento1@ejemplo.test', '+584140020001']);
  // Y lleva lo justo para que el cliente sepa qué recargar.
  assert.equal(evento.applicationId, creada.application.id);
  assert.equal(evento.status, 'pending');
  assert.ok(evento.updatedAt);
});

test('driver_application:updated avisa a ambas partes sin el expediente', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const creada = await submitApplication(url, {
    email: 'evento2@ejemplo.test', phone: '+584140020002', plate: 'EVT002', identityNumber: 'V-88888882'
  });
  const solicitanteToken = await login(url, 'evento2@ejemplo.test', 'password123', 'passenger');

  const adminSocket = io(url, { auth: { token: adminToken } });
  const solicitanteSocket = io(url, { auth: { token: solicitanteToken } });
  t.after(() => [adminSocket, solicitanteSocket].forEach(s => s.close()));
  await Promise.all([whenConnected(adminSocket), whenConnected(solicitanteSocket)]);

  const avisoAdmin = whenEvent(adminSocket, 'driver_application:updated', 'aviso a administración');
  const avisoSolicitante = whenEvent(solicitanteSocket, 'driver_application:updated', 'aviso al solicitante');

  const decision = await asJson(`${url}/api/admin/driver-applications/${creada.application.id}/decision`, adminToken, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'needs_changes', reason: 'Reenvía el reverso', requestedChanges: ['identity_back'] })
  });
  assert.equal(decision.status, 200);

  const marcas = ['V-88888882', 'evento2@ejemplo.test', '+584140020002'];
  for (const [quien, evento] of [['administración', await avisoAdmin], ['solicitante', await avisoSolicitante]]) {
    assertEventoLimpio(evento, marcas);
    assert.equal(evento.applicationId, creada.application.id, `${quien}: identifica la solicitud`);
    assert.equal(evento.status, 'needs_changes', `${quien}: refleja el estado nuevo`);
    // El motivo de la decisión tampoco viaja: se obtiene por HTTP.
    assert.ok(!JSON.stringify(evento).includes('Reenvía el reverso'), `${quien}: sin el motivo`);
  }
});

test('el aviso de aprobación tampoco transporta datos personales', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const creada = await submitApplication(url, {
    email: 'evento3@ejemplo.test', phone: '+584140020003', plate: 'EVT003', identityNumber: 'V-88888883'
  });

  const adminSocket = io(url, { auth: { token: adminToken } });
  t.after(() => adminSocket.close());
  await whenConnected(adminSocket);

  const aviso = whenEvent(adminSocket, 'driver_application:updated');
  const aprobacion = await asJson(`${url}/api/admin/driver-applications/${creada.application.id}/decision`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ action: 'approve' })
  });
  assert.equal(aprobacion.status, 200);

  const evento = await aviso;
  assertEventoLimpio(evento, ['V-88888883', 'evento3@ejemplo.test', '+584140020003']);
  assert.equal(evento.status, 'approved');

  // La respuesta HTTP del administrador sí conserva el detalle que necesita.
  const detalle = await aprobacion.json();
  assert.equal(detalle.application.status, 'approved');
  assert.equal(detalle.user.role, 'driver');
});
