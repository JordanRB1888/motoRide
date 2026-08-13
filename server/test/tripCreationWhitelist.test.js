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
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-wl-'));
  const port = 6800 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'database.json'), JWT_SECRET: 'whitelist-test-secret' },
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

async function registerPassenger(url, { email, phone, firstName = 'Ana', lastName = 'Cliente' }) {
  const r = await asJson(`${url}/api/auth/register`, null, {
    method: 'POST', body: JSON.stringify({ email, phone, password: 'password123', role: 'passenger', firstName, lastName })
  });
  assert.equal(r.status, 201);
  return r.json();
}

async function createDriver(url, adminToken, { email, phone, plate }) {
  const r = await asJson(`${url}/api/admin/drivers`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ email, phone, firstName: 'Carlos', lastName: 'Mendoza', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: plate })
  });
  assert.equal(r.status, 201);
  const account = await r.json();
  return { ...account, token: await login(url, email, account.temporaryPassword, 'driver') };
}

/** Espera la conexión sin colgarse si el socket ya conectó antes de mirar. */
function whenConnected(socket) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El socket no conectó')), 6000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
  });
}

function whenEvent(socket, event, predicate, label = event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`No llegó ${label}`)); }, 8000);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer); socket.off(event, handler); resolve(payload);
    }
    socket.on(event, handler);
  });
}

const PICKUP = { lat: 10.6427, lng: -71.6125, address: 'Mi ubicación actual', source: 'gps' };
const DESTINATION = { lat: 10.65, lng: -71.60, address: 'Vereda del Lago' };

test('un cliente no puede inyectar identidad ni estado al crear un viaje', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const victima = await registerPassenger(url, { email: 'victima@58express.com', phone: '+584120001212', firstName: 'Ana' });
  const atacante = await registerPassenger(url, { email: 'atacante@58express.com', phone: '+584120001313', firstName: 'Beto', lastName: 'Intruso' });

  const respuesta = await asJson(`${url}/api/trips/create`, atacante.token, {
    method: 'POST',
    body: JSON.stringify({
      id: 'trip_inyeccion',
      pickup: PICKUP,
      destination: DESTINATION,
      rideType: 'MOTO',
      paymentMethod: 'efectivo',
      fareUSD: 5,
      // Todo lo siguiente debe descartarse o derivarse del servidor.
      passengerId: victima.user.id,
      passengerName: 'Nombre Suplantado',
      passengerAvatar: 'javascript:alert(1)',
      passengerRating: 5,
      driverId: 'driver_elegido_por_el_cliente',
      driver: { id: 'driver_falso', firstName: 'Falso', email: 'falso@x.com', walletBalance: 999 },
      assignedDriverId: 'driver_elegido',
      status: 'COMPLETED',
      statusHistory: [{ status: 'COMPLETED', at: '2020-01-01T00:00:00.000Z' }],
      walletBalance: 99999,
      cedula: 'V-00000000',
      documents: { cedula: 'approved' },
      accountStatus: 'ADMIN',
      role: 'admin',
      passwordHash: 'inyectado',
      payoutStatus: 'PAID',
      driverEarningUSD: 500,
      platformCommissionUSD: 0,
      campoArbitrario: 'no deberia persistir',
      createdAt: '1999-01-01T00:00:00.000Z'
    })
  });
  assert.equal(respuesta.status, 200);
  const { trip } = await respuesta.json();

  // Identidad derivada del usuario autenticado.
  assert.equal(trip.passengerId, atacante.user.id, 'el viaje pertenece a quien lo crea');
  assert.notEqual(trip.passengerId, victima.user.id);
  assert.equal(trip.passengerName, 'Beto Intruso', 'el nombre lo compone el servidor');
  assert.notEqual(trip.passengerAvatar, 'javascript:alert(1)');

  // Estado y asignación fijados por el servidor. Sin conductores conectados el
  // despacho cancela el viaje en el acto, así que el estado válido es
  // SEARCHING o CANCELLED: lo que nunca puede es venir del cliente.
  assert.notEqual(trip.status, 'COMPLETED', 'el cliente no fija el estado');
  assert.ok(['SEARCHING', 'CANCELLED'].includes(trip.status), `estado inesperado: ${trip.status}`);
  assert.equal(trip.statusHistory[0].status, 'SEARCHING', 'el historial arranca en SEARCHING');
  assert.equal(trip.driverId, null);
  assert.equal(trip.driver, undefined, 'no se acepta un conductor incrustado');
  assert.equal(trip.assignedDriverId, undefined);
  assert.notEqual(trip.createdAt, '1999-01-01T00:00:00.000Z');

  // Campos administrativos y sensibles descartados.
  for (const campo of ['walletBalance', 'cedula', 'documents', 'accountStatus', 'role', 'passwordHash', 'payoutStatus', 'driverEarningUSD', 'platformCommissionUSD', 'campoArbitrario']) {
    assert.equal(trip[campo], undefined, `no debía persistir: ${campo}`);
  }

  // Y tampoco quedan en la base: se relee por la API de administración.
  const todos = await (await asJson(`${url}/api/trips`, adminToken)).json();
  const persistido = todos.find(item => item.id === 'trip_inyeccion');
  assert.ok(persistido);
  assert.equal(persistido.passengerId, atacante.user.id);
  assert.equal(persistido.campoArbitrario, undefined);
  assert.ok(!JSON.stringify(persistido).includes('V-00000000'));
});

test('las ubicaciones se proyectan y no arrastran campos extra', async (t) => {
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'ubic@58express.com', phone: '+584120001414' });

  const { trip } = await (await asJson(`${url}/api/trips/create`, passenger.token, {
    method: 'POST',
    body: JSON.stringify({
      id: 'trip_ubicacion',
      pickup: { ...PICKUP, notaInterna: 'campo intruso', ownerId: 'otro' },
      destination: { ...DESTINATION, secreto: 'x' },
      rideType: 'MOTO',
      fareUSD: 5
    })
  })).json();

  assert.deepEqual(Object.keys(trip.pickup).sort(), ['accuracy', 'address', 'lat', 'lng', 'source']);
  assert.deepEqual(Object.keys(trip.destination).sort(), ['accuracy', 'address', 'lat', 'lng', 'source']);
  assert.equal(trip.pickup.lat, 10.6427);
  assert.equal(trip.destination.address, 'Vereda del Lago');
  assert.ok(!JSON.stringify(trip).includes('campo intruso'));
});

test('el ciclo completo y la liquidación siguen funcionando tras la lista blanca', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const passenger = await registerPassenger(url, { email: 'ciclo@58express.com', phone: '+584120001515' });
  const driver = await createDriver(url, adminToken, { email: 'dciclo@58express.com', phone: '+584140001515', plate: 'CIC001' });

  // Recarga aprobada para pagar con billetera.
  const topup = await (await asJson(`${url}/api/wallet/topups`, passenger.token, {
    method: 'POST', body: JSON.stringify({ amount: 10, reference: '55667788' })
  })).json();
  const aprobacion = await asJson(`${url}/api/admin/transactions/${topup.id}`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', referenceConfirmed: true })
  });
  assert.equal((await aprobacion.json()).balance, 10);

  const driverSocket = io(url, { auth: { token: driver.token } });
  const passengerSocket = io(url, { auth: { token: passenger.token } });
  t.after(() => [driverSocket, passengerSocket].forEach(s => s.close()));
  await whenConnected(driverSocket);
  const conectado = whenEvent(driverSocket, 'driver:connected', () => true, 'driver:connected');
  driverSocket.emit('driver:connect', { status: 'AVAILABLE' });
  await conectado;
  driverSocket.emit('driver:location', { latitude: 10.6428, longitude: -71.6126 });
  await new Promise(r => setTimeout(r, 150));
  await whenConnected(passengerSocket);

  const oferta = whenEvent(driverSocket, 'rideRequested', trip => trip.id === 'trip_ciclo', 'oferta');
  const creacion = await asJson(`${url}/api/trips/create`, passenger.token, {
    method: 'POST',
    body: JSON.stringify({
      id: 'trip_ciclo', pickup: PICKUP, destination: DESTINATION,
      fareUSD: 4.5, paymentMethod: 'wallet', rideType: 'MOTO'
    })
  });
  assert.equal(creacion.status, 200, 'solicitar');
  const ofrecido = await oferta;
  assert.equal(ofrecido.passengerName, 'Ana Cliente', 'la oferta lleva el nombre derivado por el servidor');

  const asignado = whenEvent(passengerSocket, 'tripStatusUpdated', u => u.tripId === 'trip_ciclo' && u.status === 'EN_ROUTE', 'asignación');
  driverSocket.emit('rideAccepted', { tripId: 'trip_ciclo' });
  await asignado;

  for (const estado of ['ARRIVED', 'IN_PROGRESS']) {
    driverSocket.emit('tripStatusUpdated', { tripId: 'trip_ciclo', status: estado });
    await new Promise(r => setTimeout(r, 120));
  }
  const completado = whenEvent(passengerSocket, 'tripStatusUpdated', u => u.tripId === 'trip_ciclo' && u.status === 'COMPLETED', 'finalización');
  driverSocket.emit('tripStatusUpdated', { tripId: 'trip_ciclo', status: 'COMPLETED' });
  await completado;
  await new Promise(r => setTimeout(r, 200));

  // Liquidación intacta: 10 − 4.5 al pasajero, 85 % al conductor.
  const walletPasajero = await (await asJson(`${url}/api/wallet/me`, passenger.token)).json();
  assert.equal(walletPasajero.balance, 5.5, 'cobro por billetera');
  const pagos = walletPasajero.transactions.filter(x => x.type === 'RIDE_PAYMENT' && x.tripId === 'trip_ciclo');
  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].amount, -4.5);

  // Comisión 15 %: 4.5 × 0.15 = 0.675 → 0.68; neto 4.5 − 0.68 = 3.82.
  const walletConductor = await (await asJson(`${url}/api/wallet/me`, driver.token)).json();
  assert.equal(walletConductor.balance, 3.82, 'ganancia neta del conductor');
  const ganancias = walletConductor.transactions.filter(x => x.type === 'DRIVER_EARNING' && x.tripId === 'trip_ciclo');
  assert.equal(ganancias.length, 1);
  assert.equal(ganancias[0].commission, 0.68);
});
