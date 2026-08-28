import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SAFE-TRANSPORT-2A — el dinero DE VERDAD, contra el servidor completo:
 * el 402 de entrada, la carrera en WALLET con tarifa fija, la liquidación
 * 80/20 del MOTOR NORMAL al completarse (vía OFFLINE-TRIP-1, sin cambios),
 * el contador del plan y la edición de tarifas del ADMIN.
 */

let puertoSiguiente = 12700;

async function startServer(t, { env = {}, dataFile } = {}) {
  const tempDir = dataFile ? null : await mkdtemp(path.join(tmpdir(), 'plus58express-safe2a-'));
  const ruta = dataFile || path.join(tempDir, 'database.sqlite');
  const port = puertoSiguiente++;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: ruta,
      JWT_SECRET: 'safe-2a-secret',
      ADMIN_PASSWORD: 'clave-admin-de-prueba',
      SAFE_TRANSPORT_ENABLED: 'true',
      SAFE_TRANSPORT_PILOT_USER_IDS: '*',
      SAFE_TRANSPORT_BILLING_ENABLED: 'true',
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
  const r = await pedir(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Persona', lastName: 'Prueba',
      email: `safe2a${sufijo}@ejemplo.com`,
      phone: `+58 421${String(sufijo).slice(-7)}`,
      password: 'password123'
    })
  });
  assert.equal(r.status, 201);
  const cuerpo = await r.json();
  return { token: cuerpo.token, id: cuerpo.user.id };
}

const editarUsuario = (dataFile, userId, cambios) => {
  const sqlite = new DatabaseSync(dataFile);
  const fila = sqlite.prepare('SELECT payload FROM users WHERE id = ?').get(userId);
  const u = JSON.parse(fila.payload);
  Object.assign(u, cambios);
  sqlite.prepare('UPDATE users SET payload = ? WHERE id = ?').run(JSON.stringify(u), userId);
  sqlite.close();
};

const cuerpoDeUna = () => ({
  route: {
    home: { lat: 10.64, lng: -71.61, address: 'Casa de prueba' },
    worksite: { lat: 10.69, lng: -71.63, address: 'Trabajo de prueba' }
  },
  pattern: { weekdays: [1, 2, 3, 4, 5], outbound: { time: '07:00' }, timezone: 'America/Caracas' }
});

test('el dinero completo: 402 de entrada → plan → carrera WALLET → 80/20 real → ridesUsed', async (t) => {
  // Fase 1: cuentas.
  const primero = await startServer(t);
  const pasajera = await nuevaCuenta(primero.url);
  const conductor = await nuevaCuenta(primero.url);

  // Sin saldo: la entrada al plan responde 402 con lo que falta.
  const rechazo = await pedir(`${primero.url}/api/transport/subscriptions`, pasajera.token, {
    method: 'POST', body: JSON.stringify(cuerpoDeUna())
  });
  assert.equal(rechazo.status, 402);
  const cuerpo402 = await rechazo.json();
  assert.equal(cuerpo402.error, 'INSUFFICIENT_WALLET_BALANCE');
  assert.equal(cuerpo402.required, 12, 'L-V solo ida: 5×1×2×$1.20');
  assert.equal(cuerpo402.balance, 0);
  await primero.parar();

  // Fase 2: recarga (directa en la base de PRUEBA) + conductor aprobado.
  editarUsuario(primero.dataFile, pasajera.id, { walletBalance: 20 });
  editarUsuario(primero.dataFile, conductor.id, {
    role: 'driver', isVerified: true, vehicleType: 'MOTO', acceptsScheduledRides: true, walletBalance: 0
  });

  const segundo = await startServer(t, { dataFile: primero.dataFile });
  const alta = await pedir(`${segundo.url}/api/transport/subscriptions`, pasajera.token, {
    method: 'POST', body: JSON.stringify(cuerpoDeUna())
  });
  assert.equal(alta.status, 201, 'con saldo, entra');
  await segundo.parar();

  // Fase 3: dejar una ocurrencia VENCIDA con el conductor comprometido (lo
  // que 1D deja) y reiniciar: el tick inicial entrega la carrera.
  const sqlite = new DatabaseSync(primero.dataFile);
  const filas = sqlite.prepare('SELECT id, payload FROM scheduledRides').all()
    .map(f => ({ id: f.id, doc: JSON.parse(f.payload) }));
  assert.ok(filas.length >= 1);
  const objetivo = filas[0];
  Object.assign(objetivo.doc, {
    scheduledPickupAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    assignmentStatus: 'DRIVER_CONFIRMED',
    assignedDriverId: conductor.id
  });
  sqlite.prepare('UPDATE scheduledRides SET payload = ? WHERE id = ?')
    .run(JSON.stringify(objetivo.doc), objetivo.id);
  sqlite.close();

  const { url } = await startServer(t, { dataFile: primero.dataFile });
  let visto = null;
  for (let i = 0; i < 30 && !visto; i += 1) {
    const r = await pedir(`${url}/api/trips/active/me`, conductor.token);
    if (r.status === 200) visto = await r.json();
    else await new Promise(res => setTimeout(res, 500));
  }
  assert.ok(visto, 'la carrera se entregó al motor normal');
  const tripId = visto.trip?.id ?? visto.id;
  const detalle = await (await pedir(`${url}/api/trips/${tripId}`, conductor.token)).json();
  assert.equal(detalle.trip.paymentMethod, 'WALLET', 'la carrera del plan se paga por wallet');
  assert.equal(detalle.trip.fareUSD, 1.2, 'tarifa FIJA de moto');
  assert.equal(detalle.trip.fareSource, 'SUBSCRIPTION_FIXED');

  // Fase 4: el conductor la realiza (OFFLINE-TRIP-1, sin cambios) y el MOTOR
  // NORMAL liquida: débito a la clienta, 80% al conductor, 20% plataforma.
  const eventos = ['ARRIVED', 'IN_PROGRESS', 'COMPLETED'].map((action, sequence) => ({
    eventId: crypto.randomUUID(), action, sequence, deviceTimestamp: new Date().toISOString()
  }));
  const cerrar = await pedir(`${url}/api/trips/${tripId}/offline-events`, conductor.token, {
    method: 'POST', body: JSON.stringify({ events: eventos })
  });
  assert.equal((await cerrar.json()).status, 'COMPLETED');

  const perfilPasajera = await (await pedir(`${url}/api/auth/me`, pasajera.token)).json();
  assert.equal(Number(perfilPasajera.walletBalance), 18.8, '20 − 1.20 de la carrera');
  const perfilConductor = await (await pedir(`${url}/api/auth/me`, conductor.token)).json();
  assert.equal(Number(perfilConductor.walletBalance), 0.96, 'el 80% de $1.20');

  // El contador del plan sube en la siguiente pasada del planificador (el
  // reinicio dispara el tick inicial).
  await new Promise(res => setTimeout(res, 300));
  const { url: url2 } = await startServer(t, { dataFile: primero.dataFile });
  let ridesUsed = null;
  for (let i = 0; i < 30; i += 1) {
    const subs = await (await pedir(`${url2}/api/transport/subscriptions`, pasajera.token)).json();
    ridesUsed = subs.subscriptions?.[0]?.plan?.ridesUsed;
    if (ridesUsed === 1) break;
    await new Promise(res => setTimeout(res, 500));
  }
  assert.equal(ridesUsed, 1, 'una carrera consumida en el plan');
});

test('el ADMIN edita las tarifas del plan: validado, persistido y solo para administración', async (t) => {
  const { url } = await startServer(t);
  const login = await pedir(`${url}/api/auth/login`, null, {
    method: 'POST',
    body: JSON.stringify({ identifier: 'admin@58express.com', password: 'clave-admin-de-prueba', role: 'admin' })
  });
  assert.equal(login.status, 200);
  const admin = await login.json();

  const antes = await (await pedir(`${url}/api/admin/safe-transport/pricing`, admin.token)).json();
  assert.deepEqual(antes, { perRide: { MOTO: 1.2, CAR: 2 }, platformFeeRate: 0.2 }, 'los valores por defecto');

  const cambio = await pedir(`${url}/api/admin/safe-transport/pricing`, admin.token, {
    method: 'PATCH', body: JSON.stringify({ perRide: { MOTO: 1.5 }, platformFeeRate: 0.22 })
  });
  assert.equal(cambio.status, 200);
  assert.deepEqual(await cambio.json(), { perRide: { MOTO: 1.5, CAR: 2 }, platformFeeRate: 0.22 },
    'edición parcial: lo no enviado se conserva');

  assert.equal((await pedir(`${url}/api/admin/safe-transport/pricing`, admin.token, {
    method: 'PATCH', body: JSON.stringify({ perRide: { MOTO: -5 } })
  })).status, 400, 'lo invalido se rechaza');

  // Ni pasajeros ni conductores tocan las tarifas.
  const intrusa = await nuevaCuenta(url);
  assert.equal((await pedir(`${url}/api/admin/safe-transport/pricing`, intrusa.token)).status, 403);
  assert.equal((await pedir(`${url}/api/admin/safe-transport/pricing`, intrusa.token, {
    method: 'PATCH', body: JSON.stringify({ platformFeeRate: 0 })
  })).status, 403);

  // Y la edición RIGE para la siguiente entrada al plan (en caliente).
  const clienta = await nuevaCuenta(url);
  const rechazo = await pedir(`${url}/api/transport/subscriptions`, clienta.token, {
    method: 'POST', body: JSON.stringify(cuerpoDeUna())
  });
  assert.equal(rechazo.status, 402);
  assert.equal((await rechazo.json()).required, 15, '5×1×2×$1.50: la tarifa nueva rige en caliente');
});
