import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io as ioClient } from 'socket.io-client';

import { calculateFare } from '../domain/pricingService.js';
import { estadosActivos, metricasGeodesicas } from '../domain/tripMetrics.js';
import { crearCacheDeRecorridos } from '../services/routeMetricsCache.js';
import { TRIP_STATUS, TRIP_STATUS_ALIASES } from '../domain/tripStateMachine.js';

/**
 * PASSENGER-TRIP-HARDENING-1.
 *
 * Tres cosas que solo se rompen bajo presion:
 *
 *   1. Dos peticiones a la vez creando el viaje de la misma persona.
 *   2. Un cuerpo manipulado intentando pagar menos.
 *   3. La recogida moviendose despues de que un conductor haya salido a buscarla.
 *
 * HACE FALTA UN CONDUCTOR DISPONIBLE
 *
 * Sin candidatos el despacho cancela el viaje EN EL ACTO
 * --`NO_DRIVERS_AVAILABLE`-- y nace ya terminado, asi que no ocupa el hueco de
 * nadie ni se le puede congelar la recogida. Por eso estas pruebas levantan un
 * conductor de verdad, conectado y en linea junto al punto de recogida: es la
 * unica forma de que el viaje quede realmente activo.
 */

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PICKUP = { lat: 10.6427, lng: -71.6125, address: 'Mi ubicación actual' };
const DESTINO = { lat: 10.65, lng: -71.60, address: 'Vereda del Lago' };
const OTRO_DESTINO = { lat: 10.68, lng: -71.58, address: 'Sambil' };

let contador = 0;

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-hard-'));
  const port = 27700 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'hardening-test-secret-0123456789'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let salida = '';
  child.stdout.on('data', trozo => { salida += trozo; });
  child.stderr.on('data', trozo => { salida += trozo; });

  // En Windows `child.kill()` deja `exitCode` en null y esperar 'exit' dos
  // veces cuelga la suite: se apunta si ya salio.
  let termino = false;
  child.once('exit', () => { termino = true; });

  await new Promise((resolve, reject) => {
    const limite = setTimeout(() => reject(new Error(`no arrancó: ${salida}`)), 15000);
    child.stdout.on('data', trozo => {
      if (String(trozo).includes('Running')) { clearTimeout(limite); resolve(); }
    });
    child.once('exit', code => { clearTimeout(limite); reject(new Error(`salió con ${code}: ${salida}`)); });
  });

  t.after(() => { if (!termino) child.kill(); });
  return { url: `http://127.0.0.1:${port}`, salida: () => salida };
}

const pedir = (url, ruta, token, opciones = {}) => fetch(`${url}${ruta}`, {
  ...opciones,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(opciones.headers || {})
  }
});

async function nuevaPasajera(url) {
  contador += 1;
  const r = await pedir(url, '/api/auth/register', null, {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Ana', lastName: `Prueba${contador}`,
      email: `hard.${contador}.${Date.now()}@plus58.test`,
      phone: `+5841277${String(contador).padStart(5, '0')}`,
      password: 'ClaveSegura123', role: 'passenger'
    })
  });
  assert.equal(r.status, 201, 'alta de pasajera');
  return r.json();
}

const esperar = (socket, evento, ms = 6000, filtro = () => true) => new Promise((resolve, reject) => {
  const limite = setTimeout(() => reject(new Error(`no llegó ${evento}`)), ms);
  socket.on(evento, dato => {
    if (!filtro(dato)) return;
    clearTimeout(limite);
    resolve(dato);
  });
});

/**
 * Un conductor conectado, en linea y al lado del punto de recogida.
 *
 * `aceptarAutomaticamente` decide si acepta las ofertas nada mas recibirlas.
 * Apagado, el viaje se queda en SEARCHING con la oferta en vuelo, que es
 * justo el estado en el que hay que probar la invariante.
 */
async function conductorDisponible(t, url, { aceptarAutomaticamente = false } = {}) {
  contador += 1;
  const adminLogin = await pedir(url, '/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ identifier: 'admin@58express.com', password: 'admin', role: 'admin' })
  });
  assert.equal(adminLogin.status, 200, 'login de administración');
  const adminToken = (await adminLogin.json()).token;

  const alta = await pedir(url, '/api/admin/drivers', adminToken, {
    method: 'POST',
    body: JSON.stringify({
      email: `conductor.${contador}.${Date.now()}@plus58.test`,
      phone: `+5841488${String(contador).padStart(5, '0')}`,
      firstName: 'Carlos', lastName: 'Conductor',
      vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: `HRD${contador}`
    })
  });
  assert.equal(alta.status, 201, 'alta de conductor');
  const cuenta = await alta.json();

  const login = await pedir(url, '/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ identifier: cuenta.email ?? cuenta.user?.email, password: cuenta.temporaryPassword, role: 'driver' })
  });
  assert.equal(login.status, 200, 'login del conductor');
  const { token, user } = await login.json();

  const socket = ioClient(url, { auth: { token }, transports: ['websocket'] });
  t.after(() => socket.close());

  socket.on('connect', () => socket.emit('driver:connect', { userId: user.id, status: 'AVAILABLE' }));
  socket.on('driver:connected', () => socket.emit('driver:location', {
    latitude: PICKUP.lat + 0.0001, longitude: PICKUP.lng + 0.0001, heading: 0
  }));
  const ofertas = [];
  socket.on('rideRequested', oferta => {
    ofertas.push(oferta);
    if (aceptarAutomaticamente) socket.emit('rideAccepted', { tripId: oferta.id });
  });

  await esperar(socket, 'driver:connected');
  await new Promise(resolve => setTimeout(resolve, 150));

  return {
    token, id: user.id, socket, ofertas,
    aceptar: tripId => socket.emit('rideAccepted', { tripId })
  };
}

const crear = (url, token, cuerpo = {}) => pedir(url, '/api/trips/create', token, {
  method: 'POST',
  body: JSON.stringify({ pickup: PICKUP, destination: DESTINO, rideType: 'MOTO', paymentMethod: 'efectivo', ...cuerpo })
});

const leerViaje = async (url, token, id) => {
  const r = await pedir(url, `/api/trips/${id}`, token);
  const cuerpo = await r.json();
  return cuerpo.trip ?? cuerpo;
};

// ===========================================================================
// 1. Un solo viaje activo
// ===========================================================================

test('dos creaciones SIMULTÁNEAS de la misma pasajera dejan un solo viaje', async t => {
  const { url } = await startServer(t);
  await conductorDisponible(t, url);
  const pasajera = await nuevaPasajera(url);

  // El doble toque real: dos peticiones distintas, con claves distintas, que
  // salen juntas. Comprobar y despues insertar en dos pasos dejaria pasar las
  // dos y la persona acabaria con dos carreras y dos cobros.
  const [a, b] = await Promise.all([
    crear(url, pasajera.token, { id: 'trip_carrera_a' }),
    crear(url, pasajera.token, { id: 'trip_carrera_b' })
  ]);

  const codigos = [a.status, b.status].sort();
  assert.deepEqual(codigos, [200, 409], `una crea y la otra choca: ${codigos}`);

  const rechazada = [a, b].find(r => r.status === 409);
  const cuerpo = await rechazada.json();
  assert.equal(cuerpo.error, 'ACTIVE_TRIP_EXISTS');
  assert.ok(cuerpo.trip, 'el 409 lleva el viaje activo para no exigir otra petición');

  // Y la verdad la dice el servidor, no el conteo de respuestas.
  const activo = await (await pedir(url, '/api/trips/active/me', pasajera.token)).json();
  assert.ok(activo.trip, 'debería quedar exactamente un viaje activo');
});

test('la misma clave de idempotencia devuelve EL MISMO viaje, no otro', async t => {
  const { url } = await startServer(t);
  await conductorDisponible(t, url);
  const pasajera = await nuevaPasajera(url);

  const [a, b] = await Promise.all([
    crear(url, pasajera.token, { id: 'trip_idem_misma' }),
    crear(url, pasajera.token, { id: 'trip_idem_misma' })
  ]);
  assert.deepEqual([a.status, b.status], [200, 200], 'ninguna falla: es el mismo intento lógico');

  const uno = (await a.json()).trip;
  const otro = (await b.json()).trip;
  assert.equal(uno.id, otro.id, 'dos viajes distintos para un solo intento');
  assert.equal(uno.id, 'trip_idem_misma');
});

test('un reintento tras un corte ambiguo no duplica el viaje', async t => {
  const { url } = await startServer(t);
  await conductorDisponible(t, url);
  const pasajera = await nuevaPasajera(url);

  // La primera llega y se persiste; la respuesta se pierde por el camino y el
  // telefono no se entera de nada. Al reconectar reintenta con la MISMA clave.
  const primera = await crear(url, pasajera.token, { id: 'trip_ambiguo' });
  assert.equal(primera.status, 200);
  const original = (await primera.json()).trip;

  const reintento = await crear(url, pasajera.token, { id: 'trip_ambiguo' });
  assert.equal(reintento.status, 200);
  const cuerpo = await reintento.json();
  assert.equal(cuerpo.trip.id, original.id, 'se creó un viaje duplicado');
  assert.equal(cuerpo.status, 'existing');
  assert.equal(cuerpo.idempotentReplay, true, 'la repetición se anuncia como tal');
});

test('la clave de otra persona no revela nada ni secuestra su viaje', async t => {
  const { url } = await startServer(t);
  await conductorDisponible(t, url);
  const duena = await nuevaPasajera(url);
  const intrusa = await nuevaPasajera(url);

  await crear(url, duena.token, { id: 'trip_ajeno' });
  const r = await crear(url, intrusa.token, { id: 'trip_ajeno' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'TRIP_ID_UNAVAILABLE', 'un código genérico, sin decir de quién es');
});

test('dos pasajeras distintas pueden pedir a la vez sin estorbarse', async t => {
  const { url } = await startServer(t);
  await conductorDisponible(t, url);
  const [una, otra] = await Promise.all([nuevaPasajera(url), nuevaPasajera(url)]);

  const [a, b] = await Promise.all([
    crear(url, una.token, { id: 'trip_una' }),
    crear(url, otra.token, { id: 'trip_otra' })
  ]);
  assert.deepEqual([a.status, b.status], [200, 200], 'la invariante es POR PASAJERA, no global');
});

test('un viaje cancelado deja de ocupar: se puede pedir otro', async t => {
  const { url } = await startServer(t);
  await conductorDisponible(t, url);
  const pasajera = await nuevaPasajera(url);

  const primero = await crear(url, pasajera.token, { id: 'trip_primero' });
  assert.equal(primero.status, 200);

  // Mientras siga activo, no cabe otro.
  const segundoPronto = await crear(url, pasajera.token, { id: 'trip_pronto' });
  assert.equal(segundoPronto.status, 409, 'con uno en marcha no se puede pedir otro');

  const socket = ioClient(url, { auth: { token: pasajera.token }, transports: ['websocket'] });
  t.after(() => socket.close());
  await esperar(socket, 'connect');
  socket.emit('rideCancelled', { tripId: 'trip_primero' });
  await esperar(socket, 'rideCancelled', 6000, d => d.tripId === 'trip_primero');

  const segundo = await crear(url, pasajera.token, { id: 'trip_segundo' });
  assert.equal(segundo.status, 200, 'un viaje cancelado no puede seguir bloqueando');
});

// ===========================================================================
// 2. El precio lo pone el servidor
// ===========================================================================

test('el cuerpo manipulado NO abarata el viaje', async t => {
  const { url } = await startServer(t);
  await conductorDisponible(t, url);
  const esperada = calculateFare({ ...metricasGeodesicas(PICKUP, DESTINO), rideType: 'MOTO' }).fareUSD;

  // Exactamente el ataque del brief: kilómetros ridículos y tarifa de un céntimo.
  const atacante = await nuevaPasajera(url);
  const r = await crear(url, atacante.token, {
    id: 'trip_manipulado', distanceKm: 0.01, durationMin: 1, fareUSD: 0.01, fareEUR: 0.01
  });
  assert.equal(r.status, 200);
  const trip = (await r.json()).trip;

  assert.equal(trip.fareUSD, esperada, 'el precio no lo pone el cliente');
  assert.notEqual(trip.fareUSD, 0.01);
  assert.equal(trip.fareSource, 'SERVER_CALCULATED');
  assert.ok(trip.distanceKm > 0.01, 'la distancia guardada es la medida, no la declarada');

  // Y quien no manipula paga lo mismo: esa es la prueba de que da igual.
  const honesta = await nuevaPasajera(url);
  const limpio = await crear(url, honesta.token, { id: 'trip_limpio' });
  assert.equal((await limpio.json()).trip.fareUSD, esperada, 'manipular no cambia nada');
});

test('la estimación también mide en el servidor y no acepta métricas', async t => {
  const { url } = await startServer(t);
  const pasajera = await nuevaPasajera(url);

  const r = await pedir(url, '/api/pricing/estimate', pasajera.token, {
    method: 'POST',
    body: JSON.stringify({ pickup: PICKUP, destination: DESTINO, rideType: 'MOTO', distanceKm: 999, durationMin: 999 })
  });
  assert.equal(r.status, 200);
  const estimacion = await r.json();

  const esperada = calculateFare({ ...metricasGeodesicas(PICKUP, DESTINO), rideType: 'MOTO' }).fareUSD;
  assert.equal(estimacion.fareUSD, esperada, 'los 999 km declarados no inflan la estimación');
  assert.equal(estimacion.metricsSource, 'SERVER_GEODESIC', 'dice de dónde salió el número');
  assert.ok(estimacion.distanceKm < 10, 'la distancia es la real, no la declarada');
});

test('estimar y crear dan el MISMO precio: no hay ventana entre los dos', async t => {
  const { url } = await startServer(t);
  await conductorDisponible(t, url);
  const pasajera = await nuevaPasajera(url);

  const estimacion = await (await pedir(url, '/api/pricing/estimate', pasajera.token, {
    method: 'POST',
    body: JSON.stringify({ pickup: PICKUP, destination: DESTINO, rideType: 'MOTO' })
  })).json();

  const trip = (await (await crear(url, pasajera.token, { id: 'trip_coherente' })).json()).trip;
  assert.equal(trip.fareUSD, estimacion.fareUSD, 'se cotizó una cosa y se cobró otra');
  assert.equal(trip.distanceKm, estimacion.distanceKm);
});

test('sin los dos puntos no hay precio que dar', async t => {
  const { url } = await startServer(t);
  const pasajera = await nuevaPasajera(url);

  for (const cuerpo of [{}, { pickup: PICKUP }, { destination: DESTINO }, { pickup: PICKUP, destination: { lat: 'x' } }]) {
    const r = await pedir(url, '/api/pricing/estimate', pasajera.token, {
      method: 'POST', body: JSON.stringify(cuerpo)
    });
    assert.equal(r.status, 400, JSON.stringify(cuerpo));
    assert.equal((await r.json()).error, 'VALID_GPS_COORDINATES_REQUIRED');
  }
});

// ===========================================================================
// 3. La recogida se congela cuando alguien sale a buscarla
// ===========================================================================

test('buscando conductor la recogida SIGUE a la pasajera; con conductor asignado NO', async t => {
  const { url } = await startServer(t);
  const conductor = await conductorDisponible(t, url);
  const pasajera = await nuevaPasajera(url);

  const creado = await crear(url, pasajera.token, { id: 'trip_congelado' });
  assert.equal(creado.status, 200);
  assert.equal((await creado.json()).trip.status, TRIP_STATUS.SEARCHING);

  const socket = ioClient(url, { auth: { token: pasajera.token }, transports: ['websocket'] });
  t.after(() => socket.close());
  await esperar(socket, 'connect');

  const mover = async (lat, lng) => {
    socket.emit('passenger:location_update', { tripId: 'trip_congelado', latitude: lat, longitude: lng });
    await new Promise(resolve => setTimeout(resolve, 300));
  };

  // A → B mientras busca: la recogida se mueve con ella, que aún está andando
  // hacia la calle y nadie ha salido todavía a buscarla.
  await mover(10.6500, -71.6200);
  const enB = await leerViaje(url, pasajera.token, 'trip_congelado');
  assert.equal(Math.round(enB.pickup.lat * 10000), 106500, 'buscando, la recogida sigue a la pasajera');

  // El conductor acepta DE VERDAD, por el mismo evento que usa la aplicación.
  const asignado = esperar(socket, 'tripStatusUpdated', 8000, u => u.tripId === 'trip_congelado');
  conductor.aceptar('trip_congelado');
  await asignado;

  const trasAceptar = await leerViaje(url, pasajera.token, 'trip_congelado');
  assert.equal(trasAceptar.status, TRIP_STATUS.DRIVER_ASSIGNED, 'el conductor debía quedar asignado');

  // B → C con un conductor ya en camino: la recogida NO se mueve.
  await mover(10.7000, -71.5000);
  const congelado = await leerViaje(url, pasajera.token, 'trip_congelado');
  assert.equal(
    Math.round(congelado.pickup.lat * 10000), 106500,
    'la recogida se movió bajo las ruedas del conductor'
  );
  assert.ok(
    congelado.passengerLocation && Math.round(congelado.passengerLocation.lat * 10000) === 107000,
    'la posición EN VIVO sí sigue viajando: el conductor la ve acercarse'
  );
});

// ===========================================================================
// 4. Estados activos, caché y reparto
// ===========================================================================

test('los estados activos se derivan: añadir uno no lo deja fuera por olvido', () => {
  const activos = estadosActivos(TRIP_STATUS, TRIP_STATUS_ALIASES);

  for (const estado of ['SEARCHING', 'DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS']) {
    assert.ok(activos.includes(estado), `${estado} ocupa a la pasajera`);
  }
  for (const estado of ['COMPLETED', 'CANCELLED']) {
    assert.ok(!activos.includes(estado), `${estado} ya no ocupa`);
  }
  // Los nombres viejos que siguen en la base cuentan igual: un viaje guardado
  // como ACCEPTED ocupa el hueco lo mismo que uno guardado como DRIVER_ASSIGNED.
  for (const viejo of ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'IN_TRIP']) {
    assert.ok(activos.includes(viejo), `el alias ${viejo} también ocupa`);
  }

  // Y un estado nuevo entra solo, sin que nadie tenga que acordarse de esto.
  const conEstadoNuevo = estadosActivos({ ...TRIP_STATUS, NEGOCIANDO: 'NEGOCIANDO' }, {});
  assert.ok(conEstadoNuevo.includes('NEGOCIANDO'), 'un estado nuevo debe contar sin editar nada');
});

test('cinco peticiones idénticas a la vez producen UNA sola medición', async () => {
  const cache = crearCacheDeRecorridos();
  let llamadas = 0;
  const medir = async () => {
    llamadas += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { distanceKm: 3, durationMin: 8, source: 'ROUTES_API' };
  };

  const resultados = await Promise.all(
    Array.from({ length: 5 }, () => cache.medir(PICKUP, DESTINO, medir))
  );
  assert.equal(llamadas, 1, `se llamó al proveedor ${llamadas} veces para lo mismo`);
  assert.equal(new Set(resultados.map(r => r.distanceKm)).size, 1, 'todos reciben la misma medida');

  // Y después, la siguiente sale de lo guardado sin volver a llamar.
  await cache.medir(PICKUP, DESTINO, medir);
  assert.equal(llamadas, 1, 'la caché no evitó la segunda llamada');
});

test('la caché caduca, y mover el destino la esquiva', async () => {
  let ahora = 1_000_000;
  const cache = crearCacheDeRecorridos({ ttlMs: 60_000, ahora: () => ahora });
  let llamadas = 0;
  const medir = async () => { llamadas += 1; return { distanceKm: llamadas, durationMin: 1, source: 'ROUTES_API' }; };

  await cache.medir(PICKUP, DESTINO, medir);
  assert.equal(llamadas, 1);

  // Otro destino: otra clave, otra medición. Nadie hereda el recorrido ajeno.
  await cache.medir(PICKUP, OTRO_DESTINO, medir);
  assert.equal(llamadas, 2, 'cambiar el destino tiene que volver a medir');

  // Un metro de diferencia cae en la misma celda de once metros.
  await cache.medir(PICKUP, { lat: DESTINO.lat + 0.000005, lng: DESTINO.lng }, medir);
  assert.equal(llamadas, 2, 'moverse un metro no justifica otra llamada');

  // Pasado el minuto se vuelve a medir: el tráfico cambia.
  ahora += 61_000;
  await cache.medir(PICKUP, DESTINO, medir);
  assert.equal(llamadas, 3, 'la caché no puede ser eterna');
});

test('un fallo del proveedor NO se guarda en la caché', async () => {
  const cache = crearCacheDeRecorridos();
  let intentos = 0;
  const medir = async () => {
    intentos += 1;
    if (intentos === 1) throw new Error('proveedor caído');
    return { distanceKm: 3, durationMin: 8, source: 'ROUTES_API' };
  };

  await assert.rejects(() => cache.medir(PICKUP, DESTINO, medir));
  const buena = await cache.medir(PICKUP, DESTINO, medir);
  assert.equal(buena.distanceKm, 3, 'el fallo se quedó pegado durante un minuto');
  assert.equal(intentos, 2);
});

test('nada de esto escribe secretos en los registros', async t => {
  const { url, salida } = await startServer(t);
  await conductorDisponible(t, url);
  const pasajera = await nuevaPasajera(url);
  await crear(url, pasajera.token, { id: 'trip_logs', fareUSD: 0.01 });

  const texto = salida();
  assert.ok(!texto.includes('ClaveSegura123'), 'la contraseña no puede aparecer');
  assert.ok(!texto.includes('hardening-test-secret'), 'el secreto tampoco');
});
