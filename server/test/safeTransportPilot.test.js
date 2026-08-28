import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { localTimeToUtc } from '../domain/scheduleCalendar.js';
import { resolvePilotUserIds, createSafeTransportService } from '../services/safeTransport.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SAFE-TRANSPORT-1G — el piloto controlado.
 *
 * Las propiedades que se custodian: la autorización es DEL SERVIDOR y
 * fail-closed (sin lista, nadie entra aunque la bandera global esté
 * encendida); durante el piloto ningún conductor fuera de la lista recibe ni
 * acepta traslados programados; y la frontera del piloto TERMINA en el
 * traspaso a viaje normal — el despacho inmediato usa la flota común.
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };
const LUNES = localTimeToUtc('2026-08-31', '00:00', 'America/Caracas');
const RECOGIDA = localTimeToUtc('2026-08-31', '07:00', 'America/Caracas');
const MIN = 60_000;
const PASAJERO = Object.freeze({ id: 'p1', role: 'passenger' });

const conductor = (id, extra = {}) => ({
  id, role: 'driver', isVerified: true, status: 'AVAILABLE', accountStatus: 'ACTIVE',
  acceptsScheduledRides: true, vehicleType: 'MOTO', firstName: 'Conductor', lastName: id, ...extra
});

const cuerpoDeUna = () => ({
  route: {
    home: { lat: 10.64, lng: -71.61, address: 'Casa' },
    worksite: { lat: 10.69, lng: -71.63, address: 'Trabajo' }
  },
  pattern: { weekdays: [1], outbound: { time: '07:00' }, timezone: 'America/Caracas' }
});

function crearEntorno({ piloto, drivers = [] } = {}) {
  const database = {
    users: [{ id: 'p1', role: 'passenger' }, ...drivers],
    transportSubscriptions: [],
    scheduledRides: [],
    notifications: [],
    trips: []
  };
  const reloj = { ms: LUNES };
  const registro = { dispatches: [], announcements: [] };
  const bridge = {
    findTripForRide: ride => database.trips.find(t => t.scheduledRideId === ride.id) ?? null,
    driverById: id => database.users.find(u => u.id === id && u.role === 'driver') ?? null,
    driverHasActiveTrip: () => false,
    tripStatusOf: tripId => database.trips.find(t => t.id === tripId)?.status ?? null,
    async createTripForRide({ ride, driver = null }) {
      const trip = {
        id: `trip_sched_${ride.id}`, scheduledRideId: ride.id,
        passengerId: ride.passengerId, driverId: driver?.id ?? null,
        status: driver ? 'DRIVER_ASSIGNED' : 'SEARCHING'
      };
      database.trips.push(trip);
      return { ok: true, trip };
    },
    async announceAssignedTrip(trip) { registro.announcements.push(trip.id); },
    dispatchTrip: trip => registro.dispatches.push(trip.id)
  };
  const servicio = createSafeTransportService({
    database,
    persistRecord: async () => true,
    tripBridge: bridge,
    enabled: true,
    pilotUserIds: resolvePilotUserIds(piloto),
    now: () => reloj.ms,
    logger: silencioso
  });
  return { database, servicio, reloj, registro };
}

// --------------------------------------------------------------------------
// El parser y la autorización
// --------------------------------------------------------------------------

test('el parser es estricto y FAIL-CLOSED: sin lista, nadie; «*» abre; lo malformado se descarta', () => {
  assert.equal(resolvePilotUserIds(undefined).size, 0, 'sin variable = nadie');
  assert.equal(resolvePilotUserIds('').size, 0);
  assert.equal(resolvePilotUserIds('   ,, ,').size, 0, 'elementos vacíos ignorados');
  const tres = resolvePilotUserIds(' passenger_a , driver_b ,, passenger_c ');
  assert.deepEqual([...tres].sort(), ['driver_b', 'passenger_a', 'passenger_c'], 'recorte de espacios');
  assert.equal(resolvePilotUserIds('id con espacios,otro;raro,<script>').size, 0,
    'lo malformado se descarta en silencio (fail-closed)');
  assert.ok(resolvePilotUserIds('*').has('*'), 'el token de apertura');

  const { servicio } = crearEntorno({ piloto: 'passenger_a' });
  assert.equal(servicio.hasPilotAccess({ id: 'passenger_a' }), true);
  assert.equal(servicio.hasPilotAccess({ id: 'passenger_b' }), false);
  assert.equal(servicio.hasPilotAccess(null), false);
  const abierto = crearEntorno({ piloto: '*' }).servicio;
  assert.equal(abierto.hasPilotAccess({ id: 'cualquiera' }), true);
});

// --------------------------------------------------------------------------
// Frontera de cobertura: solo conductores del piloto
// --------------------------------------------------------------------------

test('en modo piloto, SOLO el conductor autorizado recibe ofertas — sin notificar al resto', async () => {
  // drv_a (NO piloto) va ANTES en el orden estable: si ganara, el gate falla.
  const { servicio, database } = crearEntorno({
    piloto: 'p1,drv_b',
    drivers: [conductor('drv_a'), conductor('drv_b')]
  });
  assert.equal((await servicio.createSubscription(PASAJERO, cuerpoDeUna())).ok, true);
  await servicio.runSafeTransportCoverage();

  const ride = database.scheduledRides[0];
  assert.equal(ride.currentOffer.driverId, 'drv_b', 'el piloto, aunque drv_a preceda en orden');
  assert.equal(database.notifications.filter(n => n.userId === 'drv_a').length, 0,
    'NON_PILOT_DRIVER_CAN_RECEIVE_SCHEDULED_OFFER: NO — ni una notificación');
  assert.equal(database.notifications.filter(n => n.userId === 'drv_b').length, 1);
});

test('un conductor preferido FUERA del piloto no recibe la oferta preferida', async () => {
  const { servicio, database } = crearEntorno({
    piloto: 'p1',
    drivers: [conductor('drv_a')] // elegible en todo, salvo el piloto
  });
  assert.equal((await servicio.createSubscription(PASAJERO, {
    ...cuerpoDeUna(), preferredDriverId: 'drv_a'
  })).ok, true);
  await servicio.runSafeTransportCoverage();
  const ride = database.scheduledRides[0];
  assert.equal(ride.assignmentStatus, 'BACKUP_REQUIRED', 'sin oferta preferida');
  assert.equal(database.notifications.filter(n => n.userId === 'drv_a').length, 0);
});

test('un accept fuera del piloto muere en el motor (defensa detrás del 404 del router)', async () => {
  const { servicio, database } = crearEntorno({
    piloto: 'p1,drv_b',
    drivers: [conductor('drv_a'), conductor('drv_b')]
  });
  await servicio.createSubscription(PASAJERO, cuerpoDeUna());
  await servicio.runSafeTransportCoverage();
  const ride = database.scheduledRides[0];
  // Estado rancio simulado: la oferta apunta al no-piloto por accidente.
  ride.currentOffer = { ...ride.currentOffer, driverId: 'drv_a' };
  const intruso = database.users.find(u => u.id === 'drv_a');
  const resultado = await servicio.acceptScheduledRide(intruso, ride.id);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, 'NOT_IN_PILOT');
  assert.equal(ride.assignedDriverId, null, 'jamás comprometido');
});

test('salir del piloto retira la oferta en pie; el COMPROMISO vigente se honra en T-0', async () => {
  const entorno = crearEntorno({ piloto: 'p1,drv_a,drv_b', drivers: [conductor('drv_a'), conductor('drv_b')] });
  const { servicio, database } = entorno;
  await servicio.createSubscription(PASAJERO, cuerpoDeUna());
  await servicio.runSafeTransportCoverage();
  const ride = database.scheduledRides[0];
  const ofertado = ride.currentOffer.driverId; // drv_a (orden estable)

  // Caso A: oferta en pie y el conductor sale del piloto → se retira.
  const restringido = crearEntorno({ piloto: 'p1,drv_b', drivers: [conductor('drv_a'), conductor('drv_b')] });
  restringido.database.transportSubscriptions.push(...structuredClone(database.transportSubscriptions));
  restringido.database.scheduledRides.push(...structuredClone(database.scheduledRides));
  await restringido.servicio.runSafeTransportCoverage();
  const rideRestringida = restringido.database.scheduledRides[0];
  assert.ok(rideRestringida.timeline.some(e => e.event === 'OFFER_RETIRED'),
    `la oferta a ${ofertado} se retira al salir del piloto`);
  assert.equal(rideRestringida.currentOffer?.driverId, 'drv_b', 'y pasa al piloto');

  // Caso B: compromiso ACEPTADO y luego sale del piloto → T-0 lo honra.
  const driver = database.users.find(u => u.id === ofertado);
  assert.equal((await servicio.acceptScheduledRide(driver, ride.id)).ok, true);
  const honrado = crearEntorno({ piloto: 'p1,drv_b', drivers: [conductor('drv_a'), conductor('drv_b')] });
  honrado.database.transportSubscriptions.push(...structuredClone(database.transportSubscriptions));
  honrado.database.scheduledRides.push(...structuredClone(database.scheduledRides));
  honrado.reloj.ms = RECOGIDA + MIN;
  const resumen = await honrado.servicio.runSafeTransportHandoff();
  assert.equal(resumen.coveredHandoffs, 1, 'el compromiso se honra aunque salga del piloto');
  assert.equal(honrado.database.trips[0].driverId, ofertado);
});

test('FRONTERA: el rescate T-0 usa el despacho normal — el piloto no lo restringe', async () => {
  // Nadie del piloto disponible como conductor: la ocurrencia llega sin
  // cobertura a T-0 y el viaje SEARCHING va al despacho inmediato COMÚN.
  const { servicio, database, reloj, registro } = crearEntorno({
    piloto: 'p1',
    drivers: [conductor('drv_x')] // flota normal, fuera del piloto
  });
  await servicio.createSubscription(PASAJERO, cuerpoDeUna());
  await servicio.runSafeTransportCoverage();
  reloj.ms = RECOGIDA + MIN;
  const resumen = await servicio.runSafeTransportHandoff();
  assert.equal(resumen.fallbackHandoffs, 1);
  assert.equal(database.trips[0].status, 'SEARCHING');
  assert.equal(registro.dispatches.length, 1,
    'PILOT_GATE_CHANGES_IMMEDIATE_DISPATCH: NO — el despacho existente recibe el viaje tal cual');
});

// --------------------------------------------------------------------------
// API real: dos llaves del servidor, 404 invisible para el resto
// --------------------------------------------------------------------------

let puertoSiguiente = 12500;

async function startServer(t, { env = {}, dataFile } = {}) {
  const tempDir = dataFile ? null : await mkdtemp(path.join(tmpdir(), 'plus58express-safe1g-'));
  const ruta = dataFile || path.join(tempDir, 'database.sqlite');
  const port = puertoSiguiente++;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: ruta, JWT_SECRET: 'safe-1g-secret', ...env },
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
      email: `safe1g${sufijo}@ejemplo.com`,
      phone: `+58 422${String(sufijo).slice(-7)}`,
      password: 'password123'
    })
  });
  assert.equal(r.status, 201);
  const cuerpo = await r.json();
  return { token: cuerpo.token, id: cuerpo.user.id };
}

function volverConductor(dataFile, userId) {
  const sqlite = new DatabaseSync(dataFile);
  const fila = sqlite.prepare('SELECT payload FROM users WHERE id = ?').get(userId);
  const usuario = JSON.parse(fila.payload);
  Object.assign(usuario, { role: 'driver', isVerified: true, vehicleType: 'MOTO' });
  sqlite.prepare('UPDATE users SET payload = ? WHERE id = ?').run(JSON.stringify(usuario), userId);
  sqlite.close();
}

test('API REAL: dos llaves — bandera global Y piloto; el resto recibe el 404 invisible', async (t) => {
  // Fase 1: registrar cuentas (los ids no se conocen hasta registrarse).
  const primero = await startServer(t);
  const anaPiloto = await nuevaCuenta(primero.url);      // pasajera EN el piloto
  const evaPiloto = await nuevaCuenta(primero.url);      // segunda pasajera EN el piloto
  const beto = await nuevaCuenta(primero.url);           // pasajero FUERA
  const carlosPiloto = await nuevaCuenta(primero.url);   // conductor EN el piloto
  const dario = await nuevaCuenta(primero.url);          // conductor FUERA
  await primero.parar();
  volverConductor(primero.dataFile, carlosPiloto.id);
  volverConductor(primero.dataFile, dario.id);

  // Fase 2: GLOBAL OFF pero con lista: la bandera global manda igual.
  const apagado = await startServer(t, {
    dataFile: primero.dataFile,
    env: { SAFE_TRANSPORT_PILOT_USER_IDS: `${anaPiloto.id},${carlosPiloto.id}` }
  });
  assert.equal((await pedir(`${apagado.url}/api/transport/access`, anaPiloto.token)).status, 404,
    'GLOBAL OFF: ni el piloto entra');
  await apagado.parar();

  // Fase 3: GLOBAL ON + lista de piloto (ana, eva, carlos).
  const { url } = await startServer(t, {
    dataFile: primero.dataFile,
    env: {
      SAFE_TRANSPORT_ENABLED: 'true',
      SAFE_TRANSPORT_PILOT_USER_IDS: ` ${anaPiloto.id} , ${evaPiloto.id} , ${carlosPiloto.id} `
    }
  });

  // Descubrimiento: sí para el piloto, 404 para el resto, 401 sin sesión.
  const acceso = await pedir(`${url}/api/transport/access`, anaPiloto.token);
  assert.equal(acceso.status, 200);
  assert.deepEqual(await acceso.json(), { available: true }, 'sin revelar ninguna otra identidad');
  assert.equal((await pedir(`${url}/api/transport/access`, beto.token)).status, 404);
  assert.equal((await pedir(`${url}/api/transport/access`, null)).status, 401);

  // Pasajera del piloto: opera. Pasajero fuera: 404 en TODO.
  const cuerpo = {
    route: {
      home: { lat: 10.64, lng: -71.61, address: 'Casa' },
      worksite: { lat: 10.69, lng: -71.63, address: 'Trabajo' }
    },
    pattern: { weekdays: [1, 2, 3, 4, 5], outbound: { time: '07:00' }, timezone: 'America/Caracas' }
  };
  const alta = await pedir(`${url}/api/transport/subscriptions`, anaPiloto.token, {
    method: 'POST', body: JSON.stringify(cuerpo)
  });
  assert.equal(alta.status, 201);
  const { subscription } = await alta.json();
  for (const [metodo, ruta] of [
    ['POST', '/api/transport/subscriptions'],
    ['GET', '/api/transport/subscriptions'],
    ['GET', '/api/transport/scheduled-rides'],
    ['POST', `/api/transport/subscriptions/${subscription.id}/cancel`]
  ]) {
    const r = await pedir(`${url}${ruta}`, beto.token, metodo === 'POST'
      ? { method: 'POST', body: JSON.stringify(cuerpo) } : {});
    assert.equal(r.status, 404, `fuera del piloto: ${metodo} ${ruta}`);
    assert.equal((await r.json()).error, 'NOT_FOUND', 'sin mencionar piloto alguno');
  }

  // El piloto NO salta la propiedad: Eva (también piloto) no ve el plan de Ana.
  assert.equal((await pedir(`${url}/api/transport/subscriptions/${subscription.id}`, evaPiloto.token)).status, 404);

  // Conductor del piloto: opera. Conductor fuera: 404 en TODO lo suyo.
  const prefs = await pedir(`${url}/api/transport/driver/preferences`, carlosPiloto.token, {
    method: 'PATCH', body: JSON.stringify({ acceptsScheduledRides: true })
  });
  assert.equal(prefs.status, 200);
  for (const ruta of ['/api/transport/driver/preferences', '/api/transport/driver/offers',
    '/api/transport/driver/commitments']) {
    assert.equal((await pedir(`${url}${ruta}`, dario.token)).status, 404, `conductor fuera: ${ruta}`);
  }
  assert.equal((await pedir(`${url}/api/transport/scheduled-rides/sride_x/accept`, dario.token, {
    method: 'POST'
  })).status, 404, 'ni aceptar a ciegas');
});
