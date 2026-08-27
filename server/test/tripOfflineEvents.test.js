import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * OFFLINE-TRIP-1A: reconciliacion idempotente de acciones del conductor,
 * probada CONTRA EL SERVIDOR REAL con un viaje real aceptado en linea.
 *
 * Lo sagrado: reenviar un evento (ACK perdido, reintentos) produce UN efecto
 * --una sola liquidacion de cartera--; el orden no puede saltarse eslabones;
 * un conductor ajeno no toca nada; y el camino en linea de siempre usa LA
 * MISMA logica (sus suites siguen en verde).
 */

async function arrancarServidor(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-offline1a-'));
  const port = 19800 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'database.json'), JWT_SECRET: 'offline1a-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 8000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return `http://127.0.0.1:${port}`;
}

const json = { 'content-type': 'application/json' };

async function montarViajeActivo(t, url) {
  const login = async (identifier, password, role) => {
    const r = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ identifier, password, role }) });
    assert.equal(r.status, 200);
    return (await r.json()).token;
  };
  const adminToken = await login('admin@58express.com', 'admin', 'admin');

  const regPasajero = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ email: 'p.offline@58express.com', phone: '+584120005511', password: 'password123', role: 'passenger', firstName: 'Ofe', lastName: 'Linea' })
  });
  const pasajero = await regPasajero.json();

  const crearConductor = async (n) => {
    const r = await fetch(`${url}/api/admin/drivers`, {
      method: 'POST', headers: { ...json, authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ email: `d.offline${n}@58express.com`, phone: `+58414000${5600 + n}`, firstName: `Del${n}`, lastName: 'Sur', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: `OF${n}A58` })
    });
    const cuenta = await r.json();
    const token = await login(`d.offline${n}@58express.com`, cuenta.temporaryPassword, 'driver');
    return { id: cuenta.user.id, token };
  };
  const conductor = await crearConductor(1);
  const intruso = await crearConductor(2);

  // Viaje real aceptado EN LINEA (unico camino de asignacion; el offline
  // empieza siempre con un viaje ya aceptado).
  const socketConductor = io(url, { auth: { token: conductor.token } });
  t.after(() => socketConductor.close());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('conductor sin registrar')), 5000);
    socketConductor.on('connect', () => socketConductor.emit('driver:connect', { userId: conductor.id, status: 'AVAILABLE' }));
    socketConductor.on('driver:connected', () => {
      socketConductor.emit('driver:location', { latitude: 10.6428, longitude: -71.6126, heading: 0 });
      clearTimeout(timeout); resolve();
    });
  });
  const aceptado = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('sin oferta')), 8000);
    socketConductor.on('rideRequested', oferta => {
      socketConductor.emit('rideAccepted', { tripId: oferta.id, driver: { id: conductor.id, firstName: 'Del1' } });
      clearTimeout(timeout); resolve(oferta.id);
    });
  });
  await new Promise(resolve => setTimeout(resolve, 120));
  const creacion = await fetch(`${url}/api/trips/create`, {
    method: 'POST', headers: { ...json, authorization: `Bearer ${pasajero.token}` },
    body: JSON.stringify({ id: 'offline_trip_1', pickup: { lat: 10.6427, lng: -71.6125 }, destination: { lat: 10.65, lng: -71.60 }, fareUSD: 6, paymentMethod: 'efectivo', rideType: 'MOTO' })
  });
  assert.equal(creacion.status, 200);
  const tripId = await aceptado;
  await new Promise(resolve => setTimeout(resolve, 200));

  return { adminToken, pasajero, conductor, intruso, tripId, socketConductor };
}

const evento = (action, sequence, extra = {}) => ({
  eventId: crypto.randomUUID(),
  action,
  sequence,
  deviceTimestamp: new Date().toISOString(),
  location: { lat: 10.6489, lng: -71.6072, accuracy: 12, timestamp: Date.now() },
  expectedTripState: null,
  ...extra
});

const sincronizar = (url, token, tripId, events) => fetch(`${url}/api/trips/${tripId}/offline-events`, {
  method: 'POST', headers: { ...json, authorization: `Bearer ${token}` }, body: JSON.stringify({ events })
});

const billetera = async (url, token) => (await (await fetch(`${url}/api/wallet/me`, { headers: { authorization: `Bearer ${token}` } })).json());

test('el ciclo offline completo aplica en orden, liquida UNA vez y es idempotente ante reintentos', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, intruso, tripId } = await montarViajeActivo(t, url);

  const lote = [
    evento('ARRIVED', 0, { expectedTripState: 'EN_ROUTE' }),
    evento('IN_PROGRESS', 1, { expectedTripState: 'ARRIVED' }),
    evento('COMPLETED', 2, { expectedTripState: 'IN_PROGRESS' })
  ];

  // ---- primera entrega: se aplica todo, en orden ----
  const primera = await sincronizar(url, conductor.token, tripId, lote);
  assert.equal(primera.status, 200);
  const r1 = await primera.json();
  assert.deepEqual(r1.results.map(r => r.result), ['APPLIED', 'APPLIED', 'APPLIED']);
  assert.equal(r1.status, 'COMPLETED');

  const carteraTrasCompletar = await billetera(url, conductor.token);
  const comisiones = carteraTrasCompletar.transactions.filter(tx => tx.type === 'PLATFORM_COMMISSION' && tx.tripId === tripId);
  assert.equal(comisiones.length, 1, 'una unica liquidacion (efectivo: comision unica)');

  // ---- ACK perdido / reintento / 100 duplicados: MISMOS eventId ----
  for (let i = 0; i < 3; i += 1) {
    const reintento = await sincronizar(url, conductor.token, tripId, lote);
    const rr = await reintento.json();
    assert.deepEqual(rr.results.map(r => r.result),
      ['ALREADY_APPLIED', 'ALREADY_APPLIED', 'ALREADY_APPLIED'], `reintento ${i}`);
  }
  const carteraFinal = await billetera(url, conductor.token);
  assert.equal(
    carteraFinal.transactions.filter(tx => tx.type === 'PLATFORM_COMMISSION' && tx.tripId === tripId).length,
    1, 'los reintentos jamas duplican la liquidacion');
  assert.equal(carteraFinal.balance, carteraTrasCompletar.balance);

  // ---- el conductor ajeno no toca nada ----
  const ajeno = await sincronizar(url, intruso.token, tripId, [evento('ARRIVED', 0)]);
  assert.equal(ajeno.status, 403);

  // ---- viaje inexistente: el mismo 403 (sin sondeos) ----
  const fantasma = await sincronizar(url, conductor.token, 'trip_inexistente', [evento('ARRIVED', 0)]);
  assert.equal(fantasma.status, 403);
});

test('el orden es ley: COMPLETED sin sus eslabones se rechaza y nada posterior se intenta', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId } = await montarViajeActivo(t, url);

  const completarPrimero = [
    evento('COMPLETED', 0),
    evento('ARRIVED', 1)
  ];
  const r = await (await sincronizar(url, conductor.token, tripId, completarPrimero)).json();
  assert.equal(r.results[0].result, 'REJECTED', 'EN_ROUTE no permite COMPLETED directo');
  assert.equal(r.results[1].result, 'NOT_ATTEMPTED');
  assert.equal(r.results[1].code, 'BLOCKED_BY_PREVIOUS');

  // El estado del servidor no se movio: la reconciliacion legitima despues
  // funciona desde cero (los rechazados NO quedan en el libro).
  const legitimo = await (await sincronizar(url, conductor.token, tripId, [
    evento('ARRIVED', 0), evento('IN_PROGRESS', 1)
  ])).json();
  assert.deepEqual(legitimo.results.map(x => x.result), ['APPLIED', 'APPLIED']);
  assert.equal(legitimo.status, 'IN_PROGRESS');
});

test('la forma se valida: acciones desconocidas, ids invalidos y relojes locos no pasan', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId } = await montarViajeActivo(t, url);

  const casos = [
    [{ ...evento('ARRIVED', 0), action: 'HACKED_ACTION' }, 'UNSUPPORTED_ACTION'],
    [{ ...evento('ARRIVED', 0), eventId: 'no-es-uuid' }, 'INVALID_EVENT_ID'],
    [{ ...evento('ARRIVED', 0), sequence: -1 }, 'INVALID_SEQUENCE'],
    [{ ...evento('ARRIVED', 0), deviceTimestamp: 'ayer por la tarde' }, 'INVALID_TIMESTAMP'],
    [{ ...evento('ARRIVED', 0), deviceTimestamp: new Date(Date.now() + 3_600_000).toISOString() }, 'TIMESTAMP_OUT_OF_RANGE']
  ];
  for (const [malo, codigo] of casos) {
    const r = await (await sincronizar(url, conductor.token, tripId, [malo])).json();
    assert.equal(r.results[0].result, 'INVALID_EVENT', codigo);
    assert.equal(r.results[0].code, codigo);
  }

  // La evidencia GPS invalida se DESCARTA sin tumbar el evento (el GPS puede
  // faltar legitimamente): el evento aplica con location null.
  const conGpsRoto = { ...evento('ARRIVED', 0), location: { lat: 999, lng: 'x' } };
  const r = await (await sincronizar(url, conductor.token, tripId, [conGpsRoto])).json();
  assert.equal(r.results[0].result, 'APPLIED');

  // Y un evento SIN ubicacion tambien aplica: la falta de satelite no
  // bloquea una accion legitima.
  const sinGps = { ...evento('IN_PROGRESS', 1), location: null };
  const r2 = await (await sincronizar(url, conductor.token, tripId, [sinGps])).json();
  assert.equal(r2.results[0].result, 'APPLIED');
});

test('un lote no autenticado o vacio no llega a ninguna parte', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId } = await montarViajeActivo(t, url);

  const sinToken = await fetch(`${url}/api/trips/${tripId}/offline-events`, {
    method: 'POST', headers: json, body: JSON.stringify({ events: [evento('ARRIVED', 0)] })
  });
  assert.equal(sinToken.status, 401);

  const vacio = await sincronizar(url, conductor.token, tripId, []);
  assert.equal(vacio.status, 400);
});

test('el estado que el servidor ya refleja responde ALREADY_APPLIED (ACK del socket perdido)', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId, socketConductor } = await montarViajeActivo(t, url);

  // El camino EN LINEA de siempre aplica ARRIVED (misma logica compartida).
  socketConductor.emit('tripStatusUpdated', { tripId, status: 'ARRIVED' });
  await new Promise(resolve => setTimeout(resolve, 250));

  // El cliente no recibio el ACK y reintenta por el contrato idempotente.
  const r = await (await sincronizar(url, conductor.token, tripId, [evento('ARRIVED', 0)])).json();
  assert.equal(r.results[0].result, 'ALREADY_APPLIED', 'el efecto ya existia: no se duplica');
  assert.equal(r.status, 'ARRIVED');
});
