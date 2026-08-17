import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { calculateFare } from '../domain/pricingService.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Reglas reales del servidor, no números fijos: la comisión por omisión y el
// redondeo a dos decimales que usa settleDriverForCompletedTrip.
const COMMISSION_RATE = 0.15;
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-settle-'));
  const port = 14900 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'database.json'), JWT_SECRET: 'settlement-test-secret' },
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

function whenConnected(socket) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El socket no conectó')), 8000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
  });
}

function whenEvent(socket, event, predicate, label = event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`No llegó ${label}`)); }, 9000);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer); socket.off(event, handler); resolve(payload);
    }
    socket.on(event, handler);
  });
}

test('la tarifa canónica es la que se debita, se liquida y no se duplica', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');

  const passengerResponse = await asJson(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({ email: 'liq@58express.com', phone: '+584120003030', password: 'password123', role: 'passenger', firstName: 'Ana', lastName: 'Cliente' })
  });
  assert.equal(passengerResponse.status, 201);
  const passenger = await passengerResponse.json();

  const driverResponse = await asJson(`${url}/api/admin/drivers`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ email: 'dliq@58express.com', phone: '+584140003030', firstName: 'Carlos', lastName: 'Mendoza', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: 'LIQ001' })
  });
  assert.equal(driverResponse.status, 201);
  const driverAccount = await driverResponse.json();
  const driverToken = await login(url, 'dliq@58express.com', driverAccount.temporaryPassword, 'driver');

  // 1. Recarga aprobada.
  const topup = await (await asJson(`${url}/api/wallet/topups`, passenger.token, {
    method: 'POST', body: JSON.stringify({ amount: 20, reference: '31415926' })
  })).json();
  const aprobado = await asJson(`${url}/api/admin/transactions/${topup.id}`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', referenceConfirmed: true })
  });
  assert.equal((await aprobado.json()).balance, 20);

  // 4. Conductor aprobado, conectado y ubicado.
  const driverSocket = io(url, { auth: { token: driverToken } });
  const passengerSocket = io(url, { auth: { token: passenger.token } });
  t.after(() => [driverSocket, passengerSocket].forEach(s => s.close()));
  await whenConnected(driverSocket);
  const conectado = whenEvent(driverSocket, 'driver:connected', () => true);
  driverSocket.emit('driver:connect', { status: 'AVAILABLE' });
  await conectado;
  driverSocket.emit('driver:location', { latitude: 10.6428, longitude: -71.6126, heading: 0 });
  await new Promise(r => setTimeout(r, 150));
  await whenConnected(passengerSocket);

  // 2. Viaje con billetera, tarifa manipulada y ruta válida.
  const oferta = whenEvent(driverSocket, 'rideRequested', trip => trip.id === 'trip_liq', 'oferta');
  const creacion = await asJson(`${url}/api/trips/create`, passenger.token, {
    method: 'POST',
    body: JSON.stringify({
      id: 'trip_liq',
      pickup: { lat: 10.6427, lng: -71.6125, address: 'Mi ubicación actual' },
      destination: { lat: 10.65, lng: -71.60, address: 'Vereda del Lago' },
      rideType: 'MOTO',
      paymentMethod: 'wallet',
      fareUSD: 0.01,
      distanceKm: 5,
      durationMin: 12
    })
  });
  assert.equal(creacion.status, 200);
  const creado = (await creacion.json()).trip;

  // 3. La tarifa almacenada la calculó el servidor, no el cliente.
  const canonica = calculateFare({ distanceKm: 5, durationMin: 12, rideType: 'MOTO' }).fareUSD;
  assert.equal(creado.fareUSD, canonica, 'tarifa canónica del servidor');
  assert.equal(creado.fareSource, 'SERVER_CALCULATED');
  assert.notEqual(creado.fareUSD, 0.01);
  await oferta;

  // 5 y 6. Aceptar y recorrer el ciclo completo.
  const asignado = whenEvent(passengerSocket, 'tripStatusUpdated', u => u.tripId === 'trip_liq' && u.status === 'EN_ROUTE', 'asignación');
  driverSocket.emit('rideAccepted', { tripId: 'trip_liq' });
  await asignado;

  for (const estado of ['ARRIVED', 'IN_PROGRESS']) {
    const paso = whenEvent(passengerSocket, 'tripStatusUpdated', u => u.tripId === 'trip_liq' && u.status === estado, estado);
    driverSocket.emit('tripStatusUpdated', { tripId: 'trip_liq', status: estado });
    await paso;
  }
  const completado = whenEvent(passengerSocket, 'tripStatusUpdated', u => u.tripId === 'trip_liq' && u.status === 'COMPLETED', 'finalización');
  driverSocket.emit('tripStatusUpdated', { tripId: 'trip_liq', status: 'COMPLETED' });
  await completado;
  await new Promise(r => setTimeout(r, 250));

  // Expectativas derivadas de la tarifa canónica y las reglas reales.
  const comisionEsperada = roundMoney(canonica * COMMISSION_RATE);
  const netoEsperado = roundMoney(canonica - comisionEsperada);

  // 7. El pasajero pagó exactamente la tarifa canónica.
  const walletPasajero = await (await asJson(`${url}/api/wallet/me`, passenger.token)).json();
  assert.equal(walletPasajero.balance, roundMoney(20 - canonica), 'saldo tras el cobro');
  const pagos = walletPasajero.transactions.filter(x => x.type === 'RIDE_PAYMENT' && x.tripId === 'trip_liq');
  assert.equal(pagos.length, 1, 'exactamente un movimiento de pago');
  assert.equal(pagos[0].amount, -canonica, 'se debitó la tarifa canónica, no la declarada');
  assert.notEqual(pagos[0].amount, -0.01);

  // 8 y 9. El conductor recibió el neto y la comisión sigue la regla real.
  const walletConductor = await (await asJson(`${url}/api/wallet/me`, driverToken)).json();
  assert.equal(walletConductor.balance, netoEsperado, 'ganancia neta del conductor');
  const ganancias = walletConductor.transactions.filter(x => x.type === 'DRIVER_EARNING' && x.tripId === 'trip_liq');
  assert.equal(ganancias.length, 1, 'exactamente un movimiento de ganancia');
  assert.equal(ganancias[0].gross, canonica);
  assert.equal(ganancias[0].commission, comisionEsperada);
  assert.equal(ganancias[0].net, netoEsperado);
  assert.equal(roundMoney(ganancias[0].commission + ganancias[0].net), canonica, 'comisión y neto suman la tarifa');

  // 11. Reenviar la finalización no vuelve a liquidar.
  for (let i = 0; i < 3; i += 1) {
    driverSocket.emit('tripStatusUpdated', { tripId: 'trip_liq', status: 'COMPLETED' });
    await new Promise(r => setTimeout(r, 120));
  }
  const pasajeroTrasReenvio = await (await asJson(`${url}/api/wallet/me`, passenger.token)).json();
  const conductorTrasReenvio = await (await asJson(`${url}/api/wallet/me`, driverToken)).json();
  assert.equal(pasajeroTrasReenvio.balance, roundMoney(20 - canonica), 'el saldo del pasajero no cambia');
  assert.equal(conductorTrasReenvio.balance, netoEsperado, 'el saldo del conductor no cambia');
  assert.equal(pasajeroTrasReenvio.transactions.filter(x => x.type === 'RIDE_PAYMENT' && x.tripId === 'trip_liq').length, 1);
  assert.equal(conductorTrasReenvio.transactions.filter(x => x.type === 'DRIVER_EARNING' && x.tripId === 'trip_liq').length, 1);

  // 10 bis. Y la vista de administración cuadra con lo liquidado.
  const finanzas = await (await asJson(`${url}/api/admin/finance`, adminToken)).json();
  const registro = finanzas.transactions.find(x => x.id === 'trip_liq');
  assert.ok(registro, 'el viaje aparece en finanzas');
  assert.equal(registro.gross, canonica);
  assert.equal(registro.commission, comisionEsperada);
  assert.equal(registro.driverNet, netoEsperado);
});
