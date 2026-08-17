import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { DEFAULT_EVENT_LIMITS } from '../services/socketRateLimit.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Un solo arranque de servidor para todo el archivo: levantar uno por prueba
// multiplica las colisiones de puerto aleatorio.
let escenario = null;

async function levantarServidor() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-ratelimit-'));
  const port = 6200 + Math.floor(Math.random() * 700);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'ratelimit-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 15000);
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

async function preparar() {
  if (escenario) return escenario;
  const { url, child } = await levantarServidor();
  const adminToken = await login(url, 'admin@58express.com', process.env.ADMIN_PASSWORD || 'admin', 'admin');
  const respuesta = await asJson(`${url}/api/admin/drivers`, adminToken, {
    method: 'POST',
    body: JSON.stringify({
      email: 'limite@58express.com', phone: '+584140000911', firstName: 'Limite',
      lastName: 'Conductor', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: 'LIM911'
    })
  });
  assert.equal(respuesta.status, 201);
  const cuenta = await respuesta.json();
  const driverToken = await login(url, 'limite@58express.com', cuenta.temporaryPassword, 'driver');
  escenario = { url, child, adminToken, driverToken, driverId: cuenta.user.id };
  return escenario;
}

function esperar(socket, event, timeoutMs = 5000) {
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

test.after(() => {
  if (escenario?.child) escenario.child.kill();
});

test('inundar el GPS se corta en el tope y solo avisa una vez', async () => {
  const { url, driverToken } = await preparar();
  const socket = io(url, { auth: { token: driverToken } });
  try {
    await esperar(socket, 'connect');
    socket.emit('driver:connect', { status: 'AVAILABLE' });
    await esperar(socket, 'driver:connected');

    const difusiones = recolectar(socket, 'driverLocationUpdated');
    const avisos = recolectar(socket, 'socket:rate_limited');

    const tope = DEFAULT_EVENT_LIMITS['driver:location'].limit;
    const enviados = tope * 3;
    for (let i = 0; i < enviados; i += 1) {
      socket.emit('driver:location', { latitude: 10.64 + i / 10000, longitude: -71.61, heading: 0 });
    }
    await pause(800);

    // El manejador no puede haberse ejecutado más veces que el tope: cada
    // ejecución escribe en disco y difunde a las salas de administración.
    assert.ok(difusiones.length > 0, 'las primeras posiciones sí deben procesarse');
    assert.ok(
      difusiones.length <= tope,
      `se procesaron ${difusiones.length} de ${enviados} enviados, por encima del tope ${tope}`
    );

    // Un único aviso pese a decenas de eventos descartados: si se respondiera a
    // cada uno, quien inunda obtendría una emisión del servidor por mensaje.
    assert.equal(avisos.length, 1, `llegaron ${avisos.length} avisos, debía llegar uno`);
    assert.equal(avisos[0].event, 'driver:location');
    assert.ok(avisos[0].retryAfterMs > 0, 'el aviso indica cuándo reintentar');
  } finally {
    socket.close();
  }
});

test('agotar el GPS no bloquea los demás eventos del mismo socket', async () => {
  const { url, driverToken, adminToken, driverId } = await preparar();
  const socket = io(url, { auth: { token: driverToken } });
  try {
    await esperar(socket, 'connect');
    socket.emit('driver:connect', { status: 'AVAILABLE' });
    await esperar(socket, 'driver:connected');

    for (let i = 0; i < DEFAULT_EVENT_LIMITS['driver:location'].limit * 3; i += 1) {
      socket.emit('driver:location', { latitude: 10.64, longitude: -71.61, heading: 0 });
    }
    await pause(400);

    // Con el GPS agotado, un cambio de disponibilidad debe seguir llegando:
    // los contadores son por evento, no por socket.
    socket.emit('driver:status', { status: 'BUSY' });
    await pause(400);

    const usuarios = await (await asJson(`${url}/api/users`, adminToken)).json();
    const conductor = usuarios.find(item => item.id === driverId);
    assert.equal(conductor.status, 'BUSY', 'el cambio de estado debía procesarse');
  } finally {
    socket.close();
  }
});

test('cada conexión tiene su propio contador', async () => {
  const { url, driverToken } = await preparar();
  const primero = io(url, { auth: { token: driverToken } });
  const segundo = io(url, { auth: { token: driverToken } });
  try {
    await esperar(primero, 'connect');
    await esperar(segundo, 'connect');

    for (let i = 0; i < DEFAULT_EVENT_LIMITS['driver:location'].limit * 3; i += 1) {
      primero.emit('driver:location', { latitude: 10.64, longitude: -71.61, heading: 0 });
    }
    await pause(400);

    // El segundo socket arranca con su ventana intacta. Esto también deja
    // constancia de que el tope por socket no protege por sí solo frente a
    // muchas conexiones simultáneas: eso lo cubre el límite de conexiones.
    const difusiones = recolectar(segundo, 'driverLocationUpdated');
    segundo.emit('driver:location', { latitude: 10.65, longitude: -71.62, heading: 0 });
    await pause(400);
    assert.ok(difusiones.length > 0, 'el segundo socket no debía estar limitado');
  } finally {
    primero.close();
    segundo.close();
  }
});
