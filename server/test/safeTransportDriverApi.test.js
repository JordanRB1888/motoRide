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
 * SAFE-TRANSPORT-1D — contrato HTTP del conductor, contra el servidor REAL.
 *
 * Lo que se protege: la bandera manda; las preferencias del conductor son
 * SUYAS (un pasajero ni las ve); la oferta no lleva la puerta de la casa y el
 * compromiso aceptado sí; y el pasajero ve la identidad segura del conductor.
 */

let puertoSiguiente = 12100;

async function startServer(t, { env = {}, dataFile } = {}) {
  const tempDir = dataFile ? null : await mkdtemp(path.join(tmpdir(), 'plus58express-safe1d-'));
  const ruta = dataFile || path.join(tempDir, 'database.sqlite');
  const port = puertoSiguiente++;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: ruta,
      JWT_SECRET: 'safe-transport-1d-secret',
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
      email: `safe1d${sufijo}@ejemplo.com`,
      phone: `+58 426${String(sufijo).slice(-7)}`,
      password: 'password123'
    })
  });
  assert.equal(respuesta.status, 201);
  const cuerpo = await respuesta.json();
  return { token: cuerpo.token, id: cuerpo.user.id };
}

/** Convierte una cuenta en conductor aprobado, directamente en la base. */
function volverConductor(dataFile, userId, extra = {}) {
  const sqlite = new DatabaseSync(dataFile);
  const fila = sqlite.prepare('SELECT payload FROM users WHERE id = ?').get(userId);
  const usuario = JSON.parse(fila.payload);
  Object.assign(usuario, { role: 'driver', isVerified: true, vehicleType: 'MOTO', vehiclePlate: 'AB123CD', ...extra });
  sqlite.prepare('UPDATE users SET payload = ? WHERE id = ?').run(JSON.stringify(usuario), userId);
  sqlite.close();
}

const cuerpoValido = () => ({
  route: {
    home: { lat: 10.641234, lng: -71.612345, address: 'Calle Privada 123, casa 4' },
    worksite: { lat: 10.69, lng: -71.63, address: 'Trabajo de prueba' }
  },
  pattern: { weekdays: [1, 2, 3, 4, 5], outbound: { time: '07:00' }, return: { time: '17:00' }, timezone: 'America/Caracas' }
});

test('APAGADA: la API del conductor tampoco existe', async (t) => {
  const { url, dataFile, parar } = await startServer(t);
  const cuenta = await nuevaCuenta(url);
  await parar();
  volverConductor(dataFile, cuenta.id);
  const { url: url2 } = await startServer(t, { dataFile });
  assert.equal((await pedir(`${url2}/api/transport/driver/preferences`, cuenta.token)).status, 404);
  assert.equal((await pedir(`${url2}/api/transport/driver/offers`, cuenta.token)).status, 404);
});

test('ENCENDIDA: preferencias del conductor — suyas, apagadas por defecto, solo booleanas', async (t) => {
  const primero = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' } });
  const conductor = await nuevaCuenta(primero.url);
  const pasajero = await nuevaCuenta(primero.url);
  await primero.parar();
  volverConductor(primero.dataFile, conductor.id);
  const { url } = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' }, dataFile: primero.dataFile });

  // Sin token y con rol equivocado: fuera.
  assert.equal((await pedir(`${url}/api/transport/driver/preferences`, null)).status, 401);
  assert.equal((await pedir(`${url}/api/transport/driver/preferences`, pasajero.token)).status, 403,
    'un pasajero NI VE las preferencias de conductor');

  const antes = await (await pedir(`${url}/api/transport/driver/preferences`, conductor.token)).json();
  assert.deepEqual(antes.preferences, { acceptsScheduledRides: false }, 'opt-in APAGADO por defecto');

  const encender = await pedir(`${url}/api/transport/driver/preferences`, conductor.token, {
    method: 'PATCH', body: JSON.stringify({ acceptsScheduledRides: true })
  });
  assert.equal(encender.status, 200);
  assert.deepEqual((await encender.json()).preferences, { acceptsScheduledRides: true });

  assert.equal((await pedir(`${url}/api/transport/driver/preferences`, conductor.token, {
    method: 'PATCH', body: JSON.stringify({ acceptsScheduledRides: 'si' })
  })).status, 400);
  assert.equal((await pedir(`${url}/api/transport/driver/preferences`, conductor.token, {
    method: 'PATCH', body: JSON.stringify({ walletBalance: 9999 })
  })).status, 400, 'solo el campo del opt-in existe aqui');

  // Listas propias: vacías y acotadas, sin tablón global.
  const ofertas = await (await pedir(`${url}/api/transport/driver/offers`, conductor.token)).json();
  assert.deepEqual(ofertas.offers, []);
  const compromisos = await (await pedir(`${url}/api/transport/driver/commitments`, conductor.token)).json();
  assert.deepEqual(compromisos.commitments, []);
});

test('ENCENDIDA: oferta sin direccion → accept con consentimiento → identidad para el pasajero', async (t) => {
  const primero = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' } });
  const pasajero = await nuevaCuenta(primero.url);
  const conductorA = await nuevaCuenta(primero.url);
  const conductorB = await nuevaCuenta(primero.url);
  const alta = await pedir(`${primero.url}/api/transport/subscriptions`, pasajero.token, {
    method: 'POST', body: JSON.stringify(cuerpoValido())
  });
  assert.equal(alta.status, 201);
  await primero.parar();

  volverConductor(primero.dataFile, conductorA.id, { acceptsScheduledRides: true, firstName: 'Carlos' });
  volverConductor(primero.dataFile, conductorB.id, { acceptsScheduledRides: true });

  // Plantar una oferta dirigida a A sobre una ocurrencia futura real (lo que
  // el motor haría en su pasada; aquí se fija el estado para probar el HTTP).
  const sqlite = new DatabaseSync(primero.dataFile);
  const filas = sqlite.prepare('SELECT id, payload FROM scheduledRides').all()
    .map(f => ({ id: f.id, doc: JSON.parse(f.payload) }))
    .filter(({ doc }) => Date.parse(doc.scheduledPickupAt) > Date.now() + 60 * 60_000)
    .sort((x, y) => Date.parse(x.doc.scheduledPickupAt) - Date.parse(y.doc.scheduledPickupAt));
  assert.ok(filas.length >= 1, 'la suscripcion materializo ocurrencias futuras');
  // La IDA a propósito: su recogida es la CASA, que es la dirección sensible
  // que esta prueba vigila. Coger «la más próxima» hacía que el resultado
  // dependiera de la hora a la que se corriera la suite: por la tarde la más
  // próxima es la VUELTA, y entonces la recogida es el trabajo.
  const objetivo = filas.find(({ doc }) => doc.direction === 'OUTBOUND') ?? filas[0];
  objetivo.doc.assignmentStatus = 'ASSIGNING';
  objetivo.doc.currentOffer = {
    driverId: conductorA.id, kind: 'BACKUP',
    offeredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  };
  sqlite.prepare('UPDATE scheduledRides SET payload = ? WHERE id = ?')
    .run(JSON.stringify(objetivo.doc), objetivo.id);
  sqlite.close();

  const { url } = await startServer(t, { env: { SAFE_TRANSPORT_ENABLED: 'true', SAFE_TRANSPORT_PILOT_USER_IDS: '*' }, dataFile: primero.dataFile });

  // A ve SU oferta (el motor VIVO puede añadir otras de respaldo — correcto),
  // sin la puerta de la casa; para B esta oferta no existe.
  const deA = await (await pedir(`${url}/api/transport/driver/offers`, conductorA.token)).json();
  assert.ok(deA.offers.some(o => o.rideId === objetivo.id), 'la oferta dirigida esta en SU lista');
  const crudo = JSON.stringify(deA.offers);
  assert.ok(!crudo.includes('Calle Privada') && !crudo.includes('address') && !crudo.includes('10.641234'),
    'NINGUNA oferta lleva direccion exacta ni coordenadas precisas');
  const deB = await (await pedir(`${url}/api/transport/driver/offers`, conductorB.token)).json();
  assert.ok(deB.offers.every(o => o.rideId !== objetivo.id), 'la oferta es SOLO del destinatario');

  // B no puede aceptar lo que no es suyo; A sí, y el cuerpo no opina.
  assert.equal((await pedir(`${url}/api/transport/scheduled-rides/${objetivo.id}/accept`, conductorB.token, {
    method: 'POST'
  })).status, 409);
  const aceptar = await pedir(`${url}/api/transport/scheduled-rides/${objetivo.id}/accept`, conductorA.token, {
    method: 'POST', body: JSON.stringify({ assignedDriverId: conductorB.id })
  });
  assert.equal(aceptar.status, 200);
  const { commitment } = await aceptar.json();
  assert.equal(commitment.pickup.address, 'Calle Privada 123, casa 4',
    'tras consentir, la ruta operativa por la via autenticada');

  // Los compromisos son SOLO del asignado.
  const compromisosA = await (await pedir(`${url}/api/transport/driver/commitments`, conductorA.token)).json();
  assert.equal(compromisosA.commitments.length, 1);
  assert.equal((await (await pedir(`${url}/api/transport/driver/commitments`, conductorB.token)).json()).commitments.length, 0);

  // El pasajero ve la identidad SEGURA del conductor confirmado.
  const agenda = await (await pedir(`${url}/api/transport/scheduled-rides`, pasajero.token)).json();
  const confirmada = agenda.scheduledRides.find(r => r.id === objetivo.id);
  assert.equal(confirmada.assignmentStatus, 'COVERAGE_CONFIRMED');
  assert.equal(confirmada.driver.firstName, 'Carlos');
  assert.equal(confirmada.driver.vehiclePlate, 'AB123CD');
  assert.ok(!('phone' in confirmada.driver), 'sin telefono');
  assert.ok(!('currentOffer' in confirmada) && !('declinedDriverIds' in confirmada),
    'la contabilidad interna no viaja al pasajero');

  // Retirada explícita: vuelve al circuito de respaldo y avisa al pasajero.
  assert.equal((await pedir(`${url}/api/transport/scheduled-rides/${objetivo.id}/withdraw`, conductorA.token, {
    method: 'POST'
  })).status, 200);
  const agenda2 = await (await pedir(`${url}/api/transport/scheduled-rides`, pasajero.token)).json();
  assert.equal(agenda2.scheduledRides.find(r => r.id === objetivo.id).driver, null);
});
