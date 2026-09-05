import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { calculateFare } from '../domain/pricingService.js';
import { metricasGeodesicas } from '../domain/tripMetrics.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Tarifa que el servidor calcularía ahora mismo para esa ruta. Se deriva de la
 * misma función de precios para que la prueba no dependa de la hora: el
 * recargo nocturno y el de hora pico cambian el importe según el reloj de
 * Caracas.
 */
function tarifaCanonica({ distanceKm, durationMin, rideType = 'MOTO' }) {
  return calculateFare({ distanceKm, durationMin, rideType }).fareUSD;
}

/**
 * La tarifa de un recorrido, medido POR EL SERVIDOR.
 *
 * Desde PASSENGER-TRIP-HARDENING-1 el cuerpo de la peticion ya no aporta
 * kilometros: el servidor mide los dos puntos con su propia regla. Por eso lo
 * que se espera aqui se calcula igual que lo calcula el, en vez de fijar un
 * numero a mano que dejaria de valer al tocar el estimador.
 */
function tarifaDelServidor(origen, destino, rideType = 'MOTO') {
  const metricas = metricasGeodesicas(origen, destino);
  return calculateFare({ ...metricas, rideType }).fareUSD;
}

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-int-'));
  const dataFile = path.join(tempDir, 'database.json');
  const port = 14100 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, JWT_SECRET: 'integrity-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}`, dataFile };
}

const asJson = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
});

async function registerPassenger(url, { email, phone, firstName = 'Ana', lastName = 'Cliente' }) {
  const r = await asJson(`${url}/api/auth/register`, null, {
    method: 'POST', body: JSON.stringify({ email, phone, password: 'password123', role: 'passenger', firstName, lastName })
  });
  assert.equal(r.status, 201);
  return r.json();
}

const PICKUP = { lat: 10.6427, lng: -71.6125, address: 'Mi ubicación actual', source: 'gps' };
const DESTINATION = { lat: 10.65, lng: -71.60, address: 'Vereda del Lago' };
const BASE = { pickup: PICKUP, destination: DESTINATION, rideType: 'MOTO', paymentMethod: 'efectivo', fareUSD: 5 };

const crear = (url, token, cuerpo, headers) =>
  asJson(`${url}/api/trips/create`, token, { method: 'POST', body: JSON.stringify(cuerpo), headers });

// --- Identificadores e idempotencia ---

test('reintentar la misma solicitud devuelve el viaje propio ya creado', async (t) => {
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'idem@58express.com', phone: '+584120002001' });

  const primera = await crear(url, passenger.token, { ...BASE, id: 'trip_idem' });
  assert.equal(primera.status, 200);
  const creado = (await primera.json()).trip;

  const segunda = await crear(url, passenger.token, { ...BASE, id: 'trip_idem', fareUSD: 99 });
  assert.equal(segunda.status, 200);
  const repetida = await segunda.json();
  assert.equal(repetida.status, 'existing');
  assert.equal(repetida.trip.id, 'trip_idem');
  assert.equal(repetida.trip.createdAt, creado.createdAt, 'devuelve el mismo viaje, no uno nuevo');
  assert.equal(repetida.trip.fareUSD, creado.fareUSD, 'el reintento no cambia la tarifa');
});

test('reintentar sobre un viaje YA CANCELADO devuelve ese mismo viaje', async (t) => {
  // El caso que se vio en el emulador. La pasajera pide, el viaje se cancela
  // --nadie lo tomó-- y vuelve a tocar el botón con la misma clave. No puede
  // salir un segundo viaje, y la respuesta tiene que ser legible: la pantalla
  // se quedaba con «el viaje se creó pero no se pudo leer».
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'idemcancel@58express.com', phone: '+584120002099' });

  const primera = await crear(url, passenger.token, { ...BASE, id: 'trip_idem_cancel' });
  assert.equal(primera.status, 200);
  const creado = (await primera.json()).trip;

  const admin = await asJson(`${url}/api/auth/login`, null, {
    method: 'POST', body: JSON.stringify({ identifier: 'admin@58express.com', password: 'admin', role: 'admin' })
  });
  const { token: adminToken } = await admin.json();
  const cancelacion = await asJson(`${url}/api/admin/trips/trip_idem_cancel`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' })
  });
  assert.equal(cancelacion.status, 200);

  const reintento = await crear(url, passenger.token, { ...BASE, id: 'trip_idem_cancel' });
  assert.equal(reintento.status, 200);
  const cuerpo = await reintento.json();

  // Mismo viaje, cero duplicados, y el estado REAL: cancelado.
  assert.equal(cuerpo.status, 'existing');
  assert.equal(cuerpo.idempotentReplay, true);
  assert.equal(cuerpo.trip.id, 'trip_idem_cancel');
  assert.equal(cuerpo.trip.createdAt, creado.createdAt);
  assert.equal(cuerpo.trip.status, 'CANCELLED', 'la respuesta tiene que decir la verdad del viaje');

  // Y la forma es LA MISMA que la de una creación: un sobre con `trip` dentro.
  // Si divergieran, el cliente tendría que aprender dos maneras de leer lo
  // mismo, y ahí es justo donde se rompía.
  assert.equal(typeof cuerpo.trip.id, 'string');
  assert.equal(typeof cuerpo.trip.status, 'string');

  // No se creó ningún viaje de más.
  const historial = await asJson(`${url}/api/trips/me/history`, passenger.token, { method: 'GET' });
  const viajes = await historial.json();
  const lista = Array.isArray(viajes) ? viajes : (viajes.trips ?? []);
  assert.equal(lista.filter(v => v.id === 'trip_idem_cancel').length, 1, 'el reintento duplicó el viaje');
});

test('otro pasajero no puede reutilizar un identificador ajeno', async (t) => {
  const { url } = await startServer(t);
  const dueno = await registerPassenger(url, { email: 'dueno2@58express.com', phone: '+584120002002' });
  const intruso = await registerPassenger(url, { email: 'intruso2@58express.com', phone: '+584120002003', firstName: 'Beto' });

  assert.equal((await crear(url, dueno.token, { ...BASE, id: 'trip_ajeno' })).status, 200);

  const colision = await crear(url, intruso.token, { ...BASE, id: 'trip_ajeno' });
  assert.equal(colision.status, 409);
  const cuerpo = await colision.json();
  assert.equal(cuerpo.error, 'TRIP_ID_UNAVAILABLE');
  // El código es genérico: no revela de quién es el viaje.
  const serializado = JSON.stringify(cuerpo);
  assert.ok(!serializado.includes(dueno.user.id), 'no debe revelar al propietario');
  assert.ok(!serializado.includes('dueno2@58express.com'));
  assert.equal(Object.keys(cuerpo).length, 1, 'solo el código de error');

  // Y por la cabecera de idempotencia ocurre lo mismo.
  const porCabecera = await crear(url, intruso.token, BASE, { 'Idempotency-Key': 'trip_ajeno' });
  assert.equal(porCabecera.status, 409);
});

test('Idempotency-Key funciona cuando el cuerpo no trae id', async (t) => {
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'key@58express.com', phone: '+584120002004' });

  const primera = await crear(url, passenger.token, BASE, { 'Idempotency-Key': 'clave_offline_1' });
  assert.equal(primera.status, 200);
  const creado = (await primera.json()).trip;
  assert.equal(creado.id, 'clave_offline_1', 'la clave se usa como identificador del viaje');

  const reintento = await crear(url, passenger.token, BASE, { 'Idempotency-Key': 'clave_offline_1' });
  assert.equal(reintento.status, 200);
  const cuerpo = await reintento.json();
  assert.equal(cuerpo.status, 'existing');
  assert.equal(cuerpo.trip.createdAt, creado.createdAt, 'no se duplica el viaje');
});

test('sin id ni clave, el servidor genera un identificador propio', async (t) => {
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'auto@58express.com', phone: '+584120002005' });

  const primera = (await (await crear(url, passenger.token, BASE)).json()).trip;
  const segunda = (await (await crear(url, passenger.token, BASE)).json()).trip;
  assert.ok(primera.id.startsWith('trip_'));
  assert.notEqual(primera.id, segunda.id, 'dos solicitudes sin clave son viajes distintos');
});

test('los identificadores inválidos se rechazan con 400', async (t) => {
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'malid@58express.com', phone: '+584120002006' });

  const invalidos = ['', '   ', 'a'.repeat(81), 'trip con espacios', 'trip/../otro', '<script>', { objeto: 1 }, ['array'], 42, true];
  for (const id of invalidos) {
    const r = await crear(url, passenger.token, { ...BASE, id });
    assert.equal(r.status, 400, `debía rechazarse: ${JSON.stringify(id)}`);
    assert.equal((await r.json()).error, 'INVALID_TRIP_ID');
  }
  // También por cabecera.
  const porCabecera = await crear(url, passenger.token, BASE, { 'Idempotency-Key': 'clave con espacios' });
  assert.equal(porCabecera.status, 400);
});

test('la base nunca contiene identificadores de viaje duplicados', async (t) => {
  const { url, dataFile } = await startServer(t);
  const uno = await registerPassenger(url, { email: 'dup1@58express.com', phone: '+584120002007' });
  const dos = await registerPassenger(url, { email: 'dup2@58express.com', phone: '+584120002008', firstName: 'Beto' });

  // Ráfaga de solicitudes con la misma clave desde ambos pasajeros.
  const intentos = [];
  for (let i = 0; i < 6; i += 1) {
    intentos.push(crear(url, uno.token, { ...BASE, id: 'trip_carrera' }));
    intentos.push(crear(url, dos.token, { ...BASE, id: 'trip_carrera' }));
  }
  await Promise.all(intentos);
  await new Promise(r => setTimeout(r, 300));

  const db = new DatabaseSync(dataFile, { readOnly: true });
  const ids = db.prepare('SELECT id FROM trips').all().map(row => row.id);
  db.close();
  assert.equal(ids.length, new Set(ids).size, 'no debe haber identificadores repetidos');
  assert.equal(ids.filter(id => id === 'trip_carrera').length, 1, 'solo un viaje con esa clave');
});

// --- Método de pago ---

test('los métodos de pago válidos y sus alias se normalizan', async (t) => {
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'pago@58express.com', phone: '+584120002009' });

  const casos = [
    ['efectivo', 'CASH'], ['EFECTIVO', 'CASH'], ['cash', 'CASH'], ['cash_usd', 'CASH'],
    ['pago_movil', 'PAGO_MOVIL'], ['pago movil', 'PAGO_MOVIL'],
    ['zelle', 'ZELLE'], ['zinli', 'ZINLI']
  ];
  for (const [entrada, esperado] of casos) {
    const r = await crear(url, passenger.token, { ...BASE, paymentMethod: entrada, id: `trip_pago_${esperado}_${entrada.replace(/\W/g, '')}` });
    assert.equal(r.status, 200, `debía aceptarse: ${entrada}`);
    assert.equal((await r.json()).trip.paymentMethod, esperado);
  }
  // Sin método explícito se asume efectivo, como antes.
  const sinMetodo = await crear(url, passenger.token, { ...BASE, paymentMethod: undefined, id: 'trip_sin_metodo' });
  assert.equal((await sinMetodo.json()).trip.paymentMethod, 'CASH');
});

test('los métodos de pago desconocidos se rechazan con 400', async (t) => {
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'pagomal@58express.com', phone: '+584120002010' });

  for (const metodo of ['bitcoin', 'gratis', 'PAYPAL', '', '   ', 42, {}, [], true, 'wallet; DROP TABLE']) {
    const r = await crear(url, passenger.token, { ...BASE, paymentMethod: metodo });
    assert.equal(r.status, 400, `debía rechazarse: ${JSON.stringify(metodo)}`);
    assert.equal((await r.json()).error, 'INVALID_PAYMENT_METHOD');
  }
});

test('la billetera conserva su semántica tras la normalización', async (t) => {
  const { url } = await startServer(t);
  const passenger = await registerPassenger(url, { email: 'wal@58express.com', phone: '+584120002011' });

  // Sin saldo, un viaje con billetera debe rechazarse por fondos: prueba que
  // 'wallet' sigue tratándose como pago con billetera y no como efectivo.
  const r = await crear(url, passenger.token, { ...BASE, paymentMethod: 'wallet', id: 'trip_wallet_sem' });
  assert.equal(r.status, 402);
  assert.equal((await r.json()).error, 'INSUFFICIENT_WALLET_BALANCE');

  // Y en efectivo el mismo viaje sí se crea: es pago directo.
  const efectivo = await crear(url, passenger.token, { ...BASE, paymentMethod: 'efectivo', id: 'trip_cash_sem' });
  assert.equal(efectivo.status, 200);
});

// --- Manipulación de tarifa y métricas ---

test('el precio no lo mueve NADA de lo que mande el cliente', async (t) => {
  const { url } = await startServer(t);
  const esperada = tarifaDelServidor(PICKUP, DESTINATION);

  // Cada intento con su propia pasajera: desde PASSENGER-TRIP-HARDENING-1 una
  // sola no puede tener dos viajes abiertos, y aquí lo que se mide es el
  // precio, no la invariante.
  const casos = [
    { nombre: 'inflada', cuerpo: { fareUSD: 999 } },
    { nombre: 'barata', cuerpo: { fareUSD: 0.01 } },
    { nombre: 'basura', cuerpo: { fareUSD: 'gratis' } },
    // Y las MÉTRICAS: declarar cuarenta kilómetros donde hay uno era la vía
    // por la que se inflaba el importe. Ahora se ignoran igual que la tarifa.
    { nombre: 'kilometros inflados', cuerpo: { distanceKm: 40, durationMin: 90 } },
    { nombre: 'kilometros ridiculos', cuerpo: { distanceKm: 0.01, durationMin: 1 } }
  ];

  const importes = [];
  for (const [indice, caso] of casos.entries()) {
    const passenger = await registerPassenger(url, {
      email: `tarifa${indice}@58express.com`, phone: `+58412000301${indice}`
    });
    const r = await crear(url, passenger.token, { ...BASE, ...caso.cuerpo, id: `trip_tarifa_${indice}` });
    assert.equal(r.status, 200, caso.nombre);
    const trip = (await r.json()).trip;
    assert.equal(trip.fareUSD, esperada, `${caso.nombre}: manda el cálculo del servidor`);
    assert.equal(trip.fareSource, 'SERVER_CALCULATED', caso.nombre);
    importes.push(trip.fareUSD);
  }

  // Todos los intentos pagan lo mismo: es la prueba de que el cuerpo no influye.
  assert.equal(new Set(importes).size, 1, 'alguien consiguió un precio distinto manipulando el cuerpo');
});

test('las métricas basura del cliente ya no se validan: se IGNORAN', async (t) => {
  const { url } = await startServer(t);
  const esperada = tarifaDelServidor(PICKUP, DESTINATION);

  // Antes había que validarlas porque se usaban para cobrar, y una distancia
  // negativa o un texto rompían el cálculo. Ahora no se leen: el servidor mide
  // los dos puntos. Mandar basura no es un error --se descarta-- y sobre todo
  // NO cambia el importe.
  const basura = [
    { distanceKm: -5, durationMin: 12 },
    { distanceKm: 5, durationMin: -12 },
    { distanceKm: 'lejos', durationMin: 12 },
    { distanceKm: [], durationMin: 12 },
    { distanceKm: 99999, durationMin: 99999 }
  ];
  for (const [indice, metricas] of basura.entries()) {
    const passenger = await registerPassenger(url, {
      email: `metricas${indice}@58express.com`, phone: `+58412000302${indice}`
    });
    const r = await crear(url, passenger.token, { ...BASE, ...metricas, id: `trip_metricas_${indice}` });
    assert.equal(r.status, 200, `ya no se rechaza: ${JSON.stringify(metricas)}`);
    const trip = (await r.json()).trip;
    assert.equal(trip.fareUSD, esperada, `no cambia el precio: ${JSON.stringify(metricas)}`);
    assert.ok(trip.distanceKm > 0 && trip.distanceKm < 100, 'la distancia guardada es la del servidor');
  }
});

test('sin métricas en el cuerpo el servidor mide igual: no hay estimación del cliente', async (t) => {
  const { url } = await startServer(t);
  const esperada = tarifaDelServidor(PICKUP, DESTINATION);

  // AQUI ESTABA EL RIESGO PENDIENTE (alta).
  //
  // Sin `distanceKm` el servidor se quedaba sin fuente propia y conservaba la
  // tarifa que declaraba el cliente, acotada. Era la ultima via por la que una
  // pasajera influia en el importe de su viaje. Ya no existe: sin metricas en
  // el cuerpo --que es el caso NORMAL ahora-- el servidor mide los dos puntos.
  for (const [indice, fare] of [0, -1, 999999, 'gratis', null].entries()) {
    const passenger = await registerPassenger(url, {
      email: `estim${indice}@58express.com`, phone: `+58412000303${indice}`
    });
    const r = await crear(url, passenger.token, {
      ...BASE, fareUSD: fare, fareEUR: undefined, id: `trip_estim_${indice}`
    });
    assert.equal(r.status, 200, `ya no se rechaza: ${JSON.stringify(fare)}`);
    const trip = (await r.json()).trip;
    assert.equal(trip.fareUSD, esperada, `la tarifa es la del servidor: ${JSON.stringify(fare)}`);
    assert.equal(trip.fareSource, 'SERVER_CALCULATED');
  }

  // Y NADIE lleva ya la marca de tarifa del cliente: ese camino se borro.
  const ultima = await registerPassenger(url, { email: 'estimz@58express.com', phone: '+584120003039' });
  const aceptada = await crear(url, ultima.token, { ...BASE, fareUSD: 4.5, id: 'trip_estimada' });
  assert.equal(aceptada.status, 200);
  const trip = (await aceptada.json()).trip;
  assert.notEqual(trip.fareUSD, 4.5, 'la estimación del cliente NO se conserva');
  assert.equal(trip.fareSource, 'SERVER_CALCULATED');
  assert.equal(trip.metricsSource, 'SERVER_GEODESIC', 'sin credencial de Routes, la regla propia');
});

test('la tarifa canónica del servidor es la que usan saldo y liquidación', async (t) => {
  const { url } = await startServer(t);
  const adminLogin = await asJson(`${url}/api/auth/login`, null, {
    method: 'POST', body: JSON.stringify({ identifier: 'admin@58express.com', password: 'admin', role: 'admin' })
  });
  const adminToken = (await adminLogin.json()).token;
  const passenger = await registerPassenger(url, { email: 'canon@58express.com', phone: '+584120002015' });

  const topup = await (await asJson(`${url}/api/wallet/topups`, passenger.token, {
    method: 'POST', body: JSON.stringify({ amount: 10, reference: '99887766' })
  })).json();
  await asJson(`${url}/api/admin/transactions/${topup.id}`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', referenceConfirmed: true })
  });

  // El cliente declara 0.01 pero el servidor mide el recorrido: el saldo debe
  // reservarse contra la tarifa que sale de esa medida, no contra la declarada.
  const r = await crear(url, passenger.token, {
    ...BASE, paymentMethod: 'wallet', fareUSD: 0.01, distanceKm: 5, durationMin: 12, id: 'trip_canonico'
  });
  assert.equal(r.status, 200);
  const trip = (await r.json()).trip;
  const esperada = tarifaDelServidor(PICKUP, DESTINATION);
  assert.equal(trip.fareUSD, esperada, 'tarifa canónica del servidor');
  assert.notEqual(trip.fareUSD, 0.01);

  // Y con saldo insuficiente frente a la tarifa canónica, se rechaza aunque la
  // declarada cupiese de sobra.
  const pobre = await registerPassenger(url, { email: 'pobre@58express.com', phone: '+584120002016' });
  const sinSaldo = await crear(url, pobre.token, {
    ...BASE, paymentMethod: 'wallet', fareUSD: 0.01, distanceKm: 5, durationMin: 12, id: 'trip_sin_saldo'
  });
  assert.equal(sinSaldo.status, 402);
  const detalle = await sinSaldo.json();
  assert.equal(detalle.error, 'INSUFFICIENT_WALLET_BALANCE');
  assert.equal(detalle.required, esperada, 'el importe requerido es el canónico, no el declarado');
  assert.notEqual(detalle.required, 0.01);
});

test('un pasajero no puede inyectar identidad ni estado junto a la tarifa', async (t) => {
  const { url } = await startServer(t);
  const victima = await registerPassenger(url, { email: 'victima2@58express.com', phone: '+584120002017' });
  const atacante = await registerPassenger(url, { email: 'atacante3@58express.com', phone: '+584120002018', firstName: 'Beto', lastName: 'Intruso' });

  const r = await crear(url, atacante.token, {
    ...BASE, id: 'trip_manipulado', distanceKm: 5, durationMin: 12,
    fareUSD: 0.01, status: 'COMPLETED', passengerId: victima.user.id,
    passengerName: 'Suplantado', driverId: 'driver_x', walletBalance: 9999, fareSource: 'SERVER_CALCULATED'
  });
  assert.equal(r.status, 200);
  const trip = (await r.json()).trip;

  assert.equal(trip.passengerId, atacante.user.id);
  assert.equal(trip.passengerName, 'Beto Intruso');
  assert.notEqual(trip.status, 'COMPLETED');
  assert.equal(trip.driverId, null);
  assert.equal(trip.walletBalance, undefined);
  assert.equal(trip.fareUSD, tarifaDelServidor(PICKUP, DESTINATION), 'la tarifa la calcula el servidor');
  assert.notEqual(trip.fareUSD, 0.01);
  assert.equal(trip.fareSource, 'SERVER_CALCULATED');
});
