import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SAFE-TRANSPORT-1C — contrato de seguridad de la API, contra el servidor
 * REAL (proceso hijo + SQLite temporal), como el resto de suites de API.
 *
 * Lo que se protege por encima de todo: la bandera manda (apagada, la API no
 * existe), el dueño sale del token, y un pasajero JAMÁS ve ni muta la agenda
 * de otro — esa agenda es un patrón de vida.
 */

let puertoSiguiente = 11900;

async function startServer(t, { env = {}, dataFile } = {}) {
  const tempDir = dataFile ? null : await mkdtemp(path.join(tmpdir(), 'plus58express-safe1c-'));
  const ruta = dataFile || path.join(tempDir, 'database.sqlite');
  const port = puertoSiguiente++;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: ruta,
      JWT_SECRET: 'safe-transport-test-secret',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const salida = new Promise(resolve => child.once('exit', resolve));
  const parar = async () => { child.kill(); await salida; };
  t.after(parar);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 15000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}`, dataFile: ruta, parar };
}

const pedir = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
});

let contadorCuentas = 0;
async function nuevaCuenta(url) {
  contadorCuentas += 1;
  const sufijo = `${Date.now()}${contadorCuentas}`;
  const respuesta = await pedir(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Persona', lastName: 'Prueba',
      email: `safe${sufijo}@ejemplo.com`,
      phone: `+58 424${String(sufijo).slice(-7)}`,
      password: 'password123'
    })
  });
  assert.equal(respuesta.status, 201, 'el registro debía funcionar');
  const cuerpo = await respuesta.json();
  return { token: cuerpo.token, id: cuerpo.user.id };
}

const cuerpoValido = () => ({
  route: {
    home: { lat: 10.64, lng: -71.61, address: 'Casa de prueba' },
    worksite: { lat: 10.69, lng: -71.63, address: 'Trabajo de prueba' }
  },
  pattern: {
    weekdays: [1, 2, 3, 4, 5],
    outbound: { time: '07:00' },
    return: { time: '17:00' },
    timezone: 'America/Caracas'
  }
});

const crear = (url, token, cuerpo = cuerpoValido()) =>
  pedir(`${url}/api/transport/subscriptions`, token, { method: 'POST', body: JSON.stringify(cuerpo) });

// --------------------------------------------------------------------------
// La bandera manda
// --------------------------------------------------------------------------

test('APAGADA (por defecto): la API del traslado seguro NO existe, ni autenticada', async (t) => {
  const { url } = await startServer(t); // sin SAFE_TRANSPORT_ENABLED
  const cuenta = await nuevaCuenta(url);
  assert.equal((await crear(url, cuenta.token)).status, 404);
  assert.equal((await pedir(`${url}/api/transport/subscriptions`, cuenta.token)).status, 404);
  assert.equal((await pedir(`${url}/api/transport/scheduled-rides`, cuenta.token)).status, 404);
});

// --------------------------------------------------------------------------
// Encendida: autenticación, rol y propiedad
// --------------------------------------------------------------------------

test('ENCENDIDA: contrato completo de propiedad y autoridad del servidor', async (t) => {
  const { url } = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' } });

  // Sin token: 401 en todas.
  assert.equal((await crear(url, null)).status, 401);
  assert.equal((await pedir(`${url}/api/transport/subscriptions`, null)).status, 401);
  assert.equal((await pedir(`${url}/api/transport/scheduled-rides`, null)).status, 401);

  const ana = await nuevaCuenta(url);
  const beto = await nuevaCuenta(url);

  // Alta: el cuerpo intenta suplantar y el servidor lo ignora.
  const alta = await crear(url, ana.token, {
    ...cuerpoValido(),
    passengerId: beto.id,
    status: 'EXPIRED',
    plan: { type: 'WEEKLY', ridesIncluded: 999999, ridesUsed: -3 }
  });
  assert.equal(alta.status, 201);
  const { subscription } = await alta.json();
  assert.equal(subscription.passengerId, ana.id, 'el dueño sale del token');
  assert.equal(subscription.status, 'ACTIVE');
  assert.equal(subscription.plan.ridesUsed, 0);
  assert.equal(subscription.plan.ridesIncluded, 10);

  // La materialización inmediata dejó sus ocurrencias visibles para el dueño…
  // Con reloj REAL la ventana de 72 h contiene entre 2 y 6 ocurrencias L-V
  // (el peor caso arranca en fin de semana y alcanza un único día hábil).
  const propias = await (await pedir(`${url}/api/transport/scheduled-rides`, ana.token)).json();
  assert.ok(propias.scheduledRides.length >= 2 && propias.scheduledRides.length <= 6,
    'ocurrencias de la ventana de 72 h');
  assert.ok(propias.scheduledRides.every(r => r.passengerId === ana.id));
  assert.ok(propias.scheduledRides.every(r => r.assignmentStatus === 'UNASSIGNED' && r.tripId === null),
    'sin conductores y sin viajes: 1C');

  // …y NADA para el otro pasajero, en ninguna vía.
  const deBeto = await (await pedir(`${url}/api/transport/scheduled-rides`, beto.token)).json();
  assert.equal(deBeto.scheduledRides.length, 0);
  assert.equal((await pedir(`${url}/api/transport/subscriptions/${subscription.id}`, beto.token)).status, 404);
  assert.equal((await pedir(`${url}/api/transport/subscriptions/${subscription.id}`, beto.token, {
    method: 'PATCH', body: JSON.stringify({ pauses: [] })
  })).status, 404);
  assert.equal((await pedir(`${url}/api/transport/subscriptions/${subscription.id}/cancel`, beto.token, {
    method: 'POST'
  })).status, 404);
  const listaBeto = await (await pedir(`${url}/api/transport/subscriptions`, beto.token)).json();
  assert.equal(listaBeto.subscriptions.length, 0);

  // El servidor es dueño de sus campos también en PATCH.
  for (const cuerpo of [{ status: 'CANCELLED' }, { passengerId: beto.id }, { plan: { ridesUsed: 0 } }]) {
    const r = await pedir(`${url}/api/transport/subscriptions/${subscription.id}`, ana.token, {
      method: 'PATCH', body: JSON.stringify(cuerpo)
    });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'SERVER_OWNED_FIELD');
  }

  // Techo del MVP: una suscripción viva por pasajero.
  assert.equal((await crear(url, ana.token)).status, 409);

  // Ciclo de vida del dueño.
  const pausar = await pedir(`${url}/api/transport/subscriptions/${subscription.id}/pause`, ana.token, { method: 'POST' });
  assert.equal(pausar.status, 200);
  assert.equal((await pausar.json()).subscription.status, 'PAUSED');
  const reanudar = await pedir(`${url}/api/transport/subscriptions/${subscription.id}/resume`, ana.token, { method: 'POST' });
  assert.equal((await reanudar.json()).subscription.status, 'ACTIVE');
  const cancelar = await pedir(`${url}/api/transport/subscriptions/${subscription.id}/cancel`, ana.token, { method: 'POST' });
  assert.equal((await cancelar.json()).subscription.status, 'CANCELLED');
  assert.equal((await pedir(`${url}/api/transport/subscriptions/${subscription.id}/resume`, ana.token, { method: 'POST' })).status, 409);
});

test('ENCENDIDA: entradas invalidas caen con 400 y su codigo', async (t) => {
  const { url } = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' } });
  const cuenta = await nuevaCuenta(url);
  const conPatron = patron => ({ ...cuerpoValido(), pattern: { ...cuerpoValido().pattern, ...patron } });

  const casos = [
    [conPatron({ timezone: 'Marte/Colonia' }), 'INVALID_TIMEZONE'],
    [conPatron({ weekdays: [0, 8] }), 'INVALID_WEEKDAYS'],
    [conPatron({ outbound: { time: '25:00' } }), 'INVALID_TIME'],
    [{ ...cuerpoValido(), route: { home: { lat: 999, lng: 0, address: 'x' }, worksite: cuerpoValido().route.worksite } }, 'INVALID_ROUTE'],
    [{ ...cuerpoValido(), route: { home: cuerpoValido().route.home } }, 'INVALID_ROUTE'],
    [{ ...cuerpoValido(), effectiveFrom: '2026-02-30' }, 'INVALID_EFFECTIVE_FROM']
  ];
  for (const [cuerpo, codigo] of casos) {
    const r = await crear(url, cuenta.token, cuerpo);
    assert.equal(r.status, 400, codigo);
    assert.equal((await r.json()).error, codigo);
  }

  // Lista acotada: el techo de `limit` no es negociable.
  assert.equal((await pedir(`${url}/api/transport/scheduled-rides?limit=100000`, cuenta.token)).status, 400);
  assert.equal((await pedir(`${url}/api/transport/scheduled-rides?from=ayer`, cuenta.token)).status, 400);
});

test('ENCENDIDA: paginacion acotada con cursor sobre las ocurrencias propias', async (t) => {
  const { url } = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' } });
  const cuenta = await nuevaCuenta(url);
  assert.equal((await crear(url, cuenta.token)).status, 201);

  // La ventana de 72 h garantiza al menos 2 ocurrencias: limit=1 pagina seguro.
  const primera = await (await pedir(`${url}/api/transport/scheduled-rides?limit=1`, cuenta.token)).json();
  assert.equal(primera.scheduledRides.length, 1);
  assert.ok(primera.nextCursor, 'hay más páginas');
  const segunda = await (await pedir(
    `${url}/api/transport/scheduled-rides?limit=1&cursor=${encodeURIComponent(primera.nextCursor)}`,
    cuenta.token
  )).json();
  assert.equal(segunda.scheduledRides.length, 1);
  assert.notEqual(segunda.scheduledRides[0].id, primera.scheduledRides[0].id, 'sin solaparse');
});

test('ENCENDIDA: un conductor NO tiene nada en la API del traslado seguro', async (t) => {
  const primero = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' } });
  const cuenta = await nuevaCuenta(primero.url);
  await primero.parar();

  // Convertir la cuenta en conductor aprobado, directamente en la base.
  const sqlite = new DatabaseSync(primero.dataFile);
  const fila = sqlite.prepare('SELECT payload FROM users WHERE id = ?').get(cuenta.id);
  const usuario = JSON.parse(fila.payload);
  usuario.role = 'driver';
  usuario.isVerified = true;
  sqlite.prepare('UPDATE users SET payload = ? WHERE id = ?').run(JSON.stringify(usuario), cuenta.id);
  sqlite.close();

  const segundo = await startServer(t, {
    env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' }, dataFile: primero.dataFile
  });
  assert.equal((await crear(segundo.url, cuenta.token)).status, 403);
  assert.equal((await pedir(`${segundo.url}/api/transport/subscriptions`, cuenta.token)).status, 403);
  assert.equal((await pedir(`${segundo.url}/api/transport/scheduled-rides`, cuenta.token)).status, 403);
});
