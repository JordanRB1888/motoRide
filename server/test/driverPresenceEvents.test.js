import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'presence-events-admin';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

let escenario = null;

async function levantarServidor() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-presence-'));
  const port = 16500 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'presence-events-secret',
      ADMIN_PASSWORD
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let traza = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`El servidor no inició: ${traza}`)), 15000);
    child.stdout.on('data', chunk => {
      traza += chunk.toString();
      if (traza.includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', chunk => { traza += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}: ${traza}`)));
  });
  return { url: `http://127.0.0.1:${port}`, child };
}

const pedir = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
});

async function login(url, identifier, password, role) {
  const respuesta = await pedir(`${url}/api/auth/login`, null, {
    method: 'POST', body: JSON.stringify({ identifier, password, role })
  });
  assert.equal(respuesta.status, 200, `Login fallido para ${identifier}`);
  return (await respuesta.json()).token;
}

async function crearConductor(url, adminToken, sufijo) {
  const respuesta = await pedir(`${url}/api/admin/drivers`, adminToken, {
    method: 'POST',
    body: JSON.stringify({
      email: `presencia${sufijo}@ejemplo.com`, phone: `+5841466600${sufijo}`,
      firstName: `Presencia${sufijo}`, lastName: 'Conductor',
      vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: `PRE${sufijo}00`
    })
  });
  assert.equal(respuesta.status, 201);
  const cuenta = await respuesta.json();
  return {
    id: cuenta.user.id,
    token: await login(url, `presencia${sufijo}@ejemplo.com`, cuenta.temporaryPassword, 'driver')
  };
}

async function preparar() {
  if (escenario) return escenario;
  const { url, child } = await levantarServidor();
  const adminToken = await login(url, 'admin@58express.com', ADMIN_PASSWORD, 'admin');
  escenario = { url, child, adminToken };
  return escenario;
}

function esperar(socket, event, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No llegó el evento ${event}`)), timeoutMs);
    socket.once(event, payload => { clearTimeout(timer); resolve(payload); });
  });
}

function recolectar(socket, event) {
  const recibidos = [];
  socket.on(event, payload => recibidos.push(payload));
  return recibidos;
}

/** Socket de administración, que es quien recibe `admin:driver_updated`. */
async function abrirAdmin(url, adminToken) {
  const socket = io(url, { auth: { token: adminToken } });
  await esperar(socket, 'connect');
  await pause(200);
  return socket;
}

test.after(() => {
  if (escenario?.child) escenario.child.kill();
});

/**
 * `admin:driver_updated` lo emiten tres sitios distintos. Dos mandan el
 * usuario completo, que lleva `id`; el tercero --la rama que salta cuando el
 * conductor ya no esta en la base-- mandaba solo `userId`. El panel fusiona
 * por `id`, asi que ese payload se descartaba en silencio y la pantalla se
 * quedaba mostrando al conductor conectado.
 */

test('todo aviso de conductor actualizado trae identificador en `id`', async () => {
  const { url, adminToken } = await preparar();
  const admin = await abrirAdmin(url, adminToken);
  const conductor = await crearConductor(url, adminToken, '1');
  const socketConductor = io(url, { auth: { token: conductor.token } });

  try {
    const avisos = recolectar(admin, 'admin:driver_updated');
    await esperar(socketConductor, 'connect');
    socketConductor.emit('driver:connect', { status: 'AVAILABLE' });
    await esperar(socketConductor, 'driver:connected');
    socketConductor.emit('driver:status', { status: 'BUSY' });
    await pause(500);

    assert.ok(avisos.length >= 2, `se esperaban varios avisos, llegaron ${avisos.length}`);
    for (const aviso of avisos) {
      assert.equal(typeof aviso.id, 'string', `aviso sin id: ${JSON.stringify(aviso).slice(0, 120)}`);
      assert.equal(aviso.id, conductor.id);
    }
  } finally {
    socketConductor.close();
    admin.close();
    await pause(300);
  }
});

test('al desconectarse, el conductor se anuncia OFFLINE con su identificador', async () => {
  const { url, adminToken } = await preparar();
  const admin = await abrirAdmin(url, adminToken);
  const conductor = await crearConductor(url, adminToken, '2');
  const socketConductor = io(url, { auth: { token: conductor.token } });

  try {
    await esperar(socketConductor, 'connect');
    socketConductor.emit('driver:connect', { status: 'AVAILABLE' });
    await esperar(socketConductor, 'driver:connected');
    await pause(300);

    const avisos = recolectar(admin, 'admin:driver_updated');
    socketConductor.close();
    await pause(800);

    const offline = avisos.find(aviso => aviso.status === 'OFFLINE');
    assert.ok(offline, `no llegó el aviso de desconexión; llegaron ${JSON.stringify(avisos)}`);
    assert.equal(offline.id, conductor.id, 'el aviso debe traer `id`, que es por donde fusiona el panel');
  } finally {
    admin.close();
    await pause(300);
  }
});

test('un conductor dado de baja con el socket abierto también se anuncia con `id`', async () => {
  const { url, adminToken } = await preparar();
  const admin = await abrirAdmin(url, adminToken);
  const conductor = await crearConductor(url, adminToken, '3');
  const socketConductor = io(url, { auth: { token: conductor.token } });

  try {
    await esperar(socketConductor, 'connect');
    socketConductor.emit('driver:connect', { status: 'AVAILABLE' });
    await esperar(socketConductor, 'driver:connected');
    await pause(300);

    // La baja desconecta los sockets del conductor dentro del propio
    // manejador, asi que el aviso sale durante la peticion: hay que estar
    // escuchando antes de lanzarla.
    const avisos = recolectar(admin, 'admin:driver_updated');

    // Al cerrarse ese socket el servidor ya no encuentra el registro y toma
    // la rama que solo mandaba `userId`.
    const baja = await pedir(`${url}/api/admin/drivers/${conductor.id}`, adminToken, { method: 'DELETE' });
    assert.ok([200, 204].includes(baja.status), `baja fallida: ${baja.status}`);
    await pause(800);

    const offline = avisos.find(aviso => aviso.status === 'OFFLINE');
    assert.ok(offline, `no llegó el aviso; llegaron ${JSON.stringify(avisos)}`);
    assert.equal(offline.id, conductor.id, 'esta es la rama que se olvidaba de `id`');
    assert.equal(offline.userId, conductor.id, 'se conserva `userId` por compatibilidad');
  } finally {
    admin.close();
    await pause(300);
  }
});

test('el panel puede fusionar cualquiera de esos avisos sin duplicar', async () => {
  const { url, adminToken } = await preparar();
  const admin = await abrirAdmin(url, adminToken);
  const conductor = await crearConductor(url, adminToken, '4');
  const socketConductor = io(url, { auth: { token: conductor.token } });

  try {
    const avisos = recolectar(admin, 'admin:driver_updated');
    await esperar(socketConductor, 'connect');
    socketConductor.emit('driver:connect', { status: 'AVAILABLE' });
    await esperar(socketConductor, 'driver:connected');
    socketConductor.emit('driver:status', { status: 'BUSY' });
    await pause(300);
    socketConductor.close();
    await pause(800);

    // Se reproduce lo que hace el panel: fusionar por `id` sobre la coleccion.
    const { mergeById, withCanonicalId } = await import('../../src/utils/liveUpdates.js');
    let coleccion = [];
    for (const aviso of avisos) {
      const normalizado = withCanonicalId(aviso, ['id', 'userId', 'driverId']);
      assert.ok(normalizado, `aviso sin identificador utilizable: ${JSON.stringify(aviso).slice(0, 120)}`);
      coleccion = mergeById(coleccion, normalizado);
    }

    assert.equal(coleccion.length, 1, `un solo conductor, no ${coleccion.length} registros`);
    assert.equal(coleccion[0].id, conductor.id);
    assert.equal(coleccion[0].status, 'OFFLINE', 'el estado final debe ser el ultimo anunciado');
  } finally {
    admin.close();
    await pause(300);
  }
});
