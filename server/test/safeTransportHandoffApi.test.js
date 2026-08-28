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
 * SAFE-TRANSPORT-1E — integración REAL: el puente de index.js entrega el
 * traslado programado al motor de viajes de verdad, y desde ahí TODO es la
 * app de siempre: /api/trips/active/me se lo enseña al conductor (aunque
 * estuviera sin socket en T-0), la tarifa la calcula el servidor con las
 * reglas existentes, y las transiciones del conductor — incluida la vía
 * OFFLINE-TRIP-1 — funcionan sin un solo cambio.
 */

let puertoSiguiente = 12300;

async function startServer(t, { env = {}, dataFile } = {}) {
  const tempDir = dataFile ? null : await mkdtemp(path.join(tmpdir(), 'plus58express-safe1e-'));
  const ruta = dataFile || path.join(tempDir, 'database.sqlite');
  const port = puertoSiguiente++;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: ruta,
      JWT_SECRET: 'safe-transport-1e-secret',
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
      email: `safe1e${sufijo}@ejemplo.com`,
      phone: `+58 428${String(sufijo).slice(-7)}`,
      password: 'password123'
    })
  });
  assert.equal(respuesta.status, 201);
  const cuerpo = await respuesta.json();
  return { token: cuerpo.token, id: cuerpo.user.id };
}

/** Espera a que el tick inicial del planificador entregue el viaje. */
async function esperarViajeActivo(url, token, { intentos = 30 } = {}) {
  for (let i = 0; i < intentos; i += 1) {
    const respuesta = await pedir(`${url}/api/trips/active/me`, token);
    if (respuesta.status === 200) return respuesta.json();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}

test('handoff REAL: ocurrencia confirmada → viaje normal asignado, visible, transitable', async (t) => {
  // Fase 1: pasajero con suscripción real (materializa sus ocurrencias).
  const primero = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true' } });
  const pasajero = await nuevaCuenta(primero.url);
  const conductor = await nuevaCuenta(primero.url);
  const alta = await pedir(`${primero.url}/api/transport/subscriptions`, pasajero.token, {
    method: 'POST',
    body: JSON.stringify({
      route: {
        home: { lat: 10.641234, lng: -71.612345, address: 'Calle Privada 123, casa 4' },
        worksite: { lat: 10.69, lng: -71.63, address: 'Centro comercial' }
      },
      pattern: { weekdays: [1, 2, 3, 4, 5, 6, 7], outbound: { time: '07:00' }, timezone: 'America/Caracas' }
    })
  });
  assert.equal(alta.status, 201);
  await primero.parar();

  // Fase 2: en la base, el estado que SAFE-1D habría dejado — un compromiso
  // confirmado — con la recogida YA VENCIDA (dentro de la gracia de T-0).
  const sqlite = new DatabaseSync(primero.dataFile);
  const filaConductor = sqlite.prepare('SELECT payload FROM users WHERE id = ?').get(conductor.id);
  const usuario = JSON.parse(filaConductor.payload);
  Object.assign(usuario, {
    role: 'driver', isVerified: true, vehicleType: 'MOTO',
    vehiclePlate: 'XY987ZT', acceptsScheduledRides: true, firstName: 'Carlos'
  });
  sqlite.prepare('UPDATE users SET payload = ? WHERE id = ?').run(JSON.stringify(usuario), conductor.id);

  const filas = sqlite.prepare('SELECT id, payload FROM scheduledRides').all()
    .map(f => ({ id: f.id, doc: JSON.parse(f.payload) }));
  assert.ok(filas.length >= 1);
  const objetivo = filas[0];
  Object.assign(objetivo.doc, {
    scheduledPickupAt: new Date(Date.now() - 2 * 60_000).toISOString(), // T-0 hace 2 min
    assignmentStatus: 'DRIVER_CONFIRMED',
    assignedDriverId: conductor.id
  });
  sqlite.prepare('UPDATE scheduledRides SET payload = ? WHERE id = ?')
    .run(JSON.stringify(objetivo.doc), objetivo.id);
  sqlite.close();

  // Fase 3: reinicio (como Railway tras una caída en T-0): el tick inicial
  // debe entregar el viaje dentro de la gracia.
  const { url } = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true' }, dataFile: primero.dataFile });

  // El conductor (que estaba SIN socket en T-0) lo ve por la vía de siempre.
  const visto = await esperarViajeActivo(url, conductor.token);
  assert.ok(visto, 'el viaje asignado aparece en /api/trips/active/me');
  const tripId = visto.trip?.id ?? visto.id;
  assert.equal(tripId, `trip_sched_${objetivo.id}`, 'identificador determinista del puente real');

  // El viaje es del MOTOR NORMAL: estado canónico, tarifa del servidor, y ni
  // rastro de los datos privados de la suscripción.
  const detalle = await (await pedir(`${url}/api/trips/${tripId}`, conductor.token)).json();
  const trip = detalle.trip;
  assert.equal(trip.status, 'DRIVER_ASSIGNED');
  assert.equal(trip.driverId, conductor.id);
  assert.equal(trip.pickup.address, 'Calle Privada 123, casa 4', 'la operativa mínima sí viaja');
  assert.equal(trip.fareSource, 'SERVER_CALCULATED');
  assert.ok(Number(trip.fareUSD) > 0, 'tarifa con las reglas existentes');
  const crudo = JSON.stringify(trip);
  for (const privado of ['pattern', 'weekdays', 'ridesIncluded', 'preferredDriverId', 'pauses', 'plan']) {
    assert.ok(!crudo.includes(`"${privado}"`), `el viaje no hereda «${privado}»`);
  }

  // El pasajero ve su ocurrencia ACTIVE, enlazada y con su conductor.
  const agenda = await (await pedir(`${url}/api/transport/scheduled-rides`, pasajero.token)).json();
  const ocurrencia = agenda.scheduledRides.find(r => r.id === objetivo.id);
  assert.equal(ocurrencia.serviceStatus, 'ACTIVE');
  assert.equal(ocurrencia.tripId, tripId);
  assert.equal(ocurrencia.driver.firstName, 'Carlos');

  // Y las transiciones son las NORMALES — por la vía OFFLINE-TRIP-1, que debe
  // funcionar sin cambios sobre un viaje nacido del traslado seguro.
  const eventos = ['ARRIVED', 'IN_PROGRESS', 'COMPLETED'].map((action, sequence) => ({
    eventId: crypto.randomUUID(),
    action,
    sequence,
    deviceTimestamp: new Date().toISOString()
  }));
  const sincronizar = await pedir(`${url}/api/trips/${tripId}/offline-events`, conductor.token, {
    method: 'POST', body: JSON.stringify({ events: eventos })
  });
  assert.equal(sincronizar.status, 200);
  const resultado = await sincronizar.json();
  assert.deepEqual(resultado.results.map(r => r.result), ['APPLIED', 'APPLIED', 'APPLIED'],
    'OFFLINE-TRIP-1 opera el viaje del handoff sin cambios');
  assert.equal(resultado.status, 'COMPLETED');

  // La ocurrencia converge a COMPLETED en la siguiente pasada del planificador
  // (aquí basta con comprobar que el viaje quedó COMPLETED por el motor real y
  // que ningún crédito se consumió).
  const suscripciones = await (await pedir(`${url}/api/transport/subscriptions`, pasajero.token)).json();
  assert.equal(suscripciones.subscriptions[0].plan.ridesUsed, 0, 'cero créditos consumidos en 1E');
});
