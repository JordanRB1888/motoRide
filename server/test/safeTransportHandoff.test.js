import test from 'node:test';
import assert from 'node:assert/strict';
import { localTimeToUtc } from '../domain/scheduleCalendar.js';
import { resolvePilotUserIds, createSafeTransportService, resolveHandoffGraceMs, DEFAULT_HANDOFF_GRACE_MS } from '../services/safeTransport.js';

/**
 * SAFE-TRANSPORT-1E — el handoff T-0, con el servicio REAL y un puente fiel
 * al contrato del real (id determinista, referencia scheduledRideId, viajes
 * en database.trips): base en memoria, reloj inyectado, cero red.
 *
 * La propiedad sagrada: UNA ocurrencia produce UN viaje — bajo doble pasada,
 * invocación paralela, caída antes de crear, caída entre crear y enlazar,
 * reinicio del proceso y fallo de persistencia. Y el viaje creado es del
 * MOTOR NORMAL: el traslado seguro no posee ciclo de vida propio de viaje.
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
    home: { lat: 10.641234, lng: -71.612345, address: 'Calle Privada 123, casa 4' },
    worksite: { lat: 10.69, lng: -71.63, address: 'Centro comercial' }
  },
  pattern: { weekdays: [1], outbound: { time: '07:00' }, timezone: 'America/Caracas' }
});

const ESTADOS_ACTIVOS = ['DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'];

/** Puente FIEL al contrato del real (index.js), con fallos inyectables. */
function crearPuente(database, opciones = {}) {
  const registro = { dispatches: [], announcements: [] };
  const bridge = {
    findTripForRide: ride => database.trips.find(t =>
      t.id === `trip_sched_${ride.id}` || t.scheduledRideId === ride.id) ?? null,
    driverById: id => database.users.find(u => u.id === id && u.role === 'driver') ?? null,
    driverHasActiveTrip: driverId => database.trips.some(t =>
      t.driverId === driverId && ESTADOS_ACTIVOS.includes(t.status)),
    tripStatusOf: tripId => database.trips.find(t => t.id === tripId)?.status ?? null,
    async createTripForRide({ ride, driver = null }) {
      if (opciones.fallarCreacion?.()) return { ok: false, code: 'DATABASE_WRITE_FAILED' };
      const instante = new Date().toISOString();
      const trip = {
        id: `trip_sched_${ride.id}`,
        scheduledRideId: ride.id,
        pickup: structuredClone(ride.pickup),
        destination: structuredClone(ride.destination),
        rideType: 'MOTO', paymentMethod: 'CASH',
        passengerId: ride.passengerId,
        driverId: driver?.id ?? null,
        driver: driver ? { id: driver.id, firstName: driver.firstName } : undefined,
        status: driver ? 'DRIVER_ASSIGNED' : 'SEARCHING',
        fareUSD: 1.5, fareSource: 'SERVER_CALCULATED',
        createdAt: instante, updatedAt: instante,
        statusHistory: [{ status: 'SEARCHING', at: instante, actorId: 'system:safe-transport' }]
      };
      database.trips.push(trip);
      return { ok: true, trip };
    },
    async announceAssignedTrip(trip) { registro.announcements.push(trip.id); },
    dispatchTrip: trip => registro.dispatches.push(trip.id)
  };
  return { bridge, registro };
}

function crearEntorno({ nowMs = LUNES, drivers = [], persistImpl, opcionesPuente } = {}) {
  const database = {
    users: [{ id: 'p1', role: 'passenger', firstName: 'Ana' }, ...drivers],
    transportSubscriptions: [],
    scheduledRides: [],
    notifications: [],
    trips: []
  };
  const reloj = { ms: nowMs };
  const { bridge, registro } = crearPuente(database, opcionesPuente ?? {});
  const servicio = createSafeTransportService({
    database,
    persistRecord: persistImpl ?? (async () => true),
    tripBridge: bridge,
    enabled: true,
    pilotUserIds: resolvePilotUserIds('*'),
    now: () => reloj.ms,
    logger: silencioso
  });
  return { database, servicio, reloj, registro };
}

/** Alta + (opcional) confirmación del conductor, todo ANTES de T-0. */
async function prepararRide(entorno, { preferredDriverId = null, confirmar = false } = {}) {
  const alta = await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId });
  assert.equal(alta.ok, true);
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  if (confirmar) {
    const driver = entorno.database.users.find(u => u.id === preferredDriverId);
    const aceptado = await entorno.servicio.acceptScheduledRide(driver, ride.id);
    assert.equal(aceptado.ok, true);
  }
  return ride;
}

// --------------------------------------------------------------------------
// Cubierto: el conductor comprometido recibe SU viaje asignado
// --------------------------------------------------------------------------

test('preferido confirmado → UN viaje DRIVER_ASSIGNED, sin despacho, con enlace exacto', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const ride = await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });

  entorno.reloj.ms = RECOGIDA + MIN; // T-0 pasado por un minuto
  const resumen = await entorno.servicio.runSafeTransportHandoff();

  assert.equal(resumen.coveredHandoffs, 1);
  assert.equal(entorno.database.trips.length, 1, 'UN viaje');
  const trip = entorno.database.trips[0];
  assert.equal(trip.id, `trip_sched_${ride.id}`, 'identificador DETERMINISTA');
  assert.equal(trip.status, 'DRIVER_ASSIGNED');
  assert.equal(trip.driverId, 'drv_a', 'el conductor sale del scheduledRide, de nadie más');
  assert.equal(ride.tripId, trip.id, 'enlace exacto');
  assert.equal(ride.serviceStatus, 'ACTIVE');
  assert.ok(ride.timeline.some(e => e.event === 'TRIP_HANDOFF'));
  assert.deepEqual(entorno.registro.dispatches, [], 'CERO llamadas al despacho');
  assert.deepEqual(entorno.registro.announcements, [trip.id], 'UN anuncio');
});

test('respaldo confirmado (COVERAGE_CONFIRMED) → igual: un viaje asignado, cero despacho', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const ride = await prepararRide(entorno); // sin preferido → oferta de respaldo a drv_a
  const driver = entorno.database.users.find(u => u.id === 'drv_a');
  assert.equal(ride.currentOffer.kind, 'BACKUP');
  assert.equal((await entorno.servicio.acceptScheduledRide(driver, ride.id)).ok, true);
  assert.equal(ride.assignmentStatus, 'COVERAGE_CONFIRMED');

  entorno.reloj.ms = RECOGIDA + MIN;
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.coveredHandoffs, 1);
  assert.equal(entorno.database.trips[0].driverId, 'drv_a');
  assert.deepEqual(entorno.registro.dispatches, []);
});

test('el opt-out posterior NO invalida un compromiso vigente (política 1D respetada)', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });
  const driver = entorno.database.users.find(u => u.id === 'drv_a');
  driver.acceptsScheduledRides = false; // se retira de ofertas NUEVAS

  entorno.reloj.ms = RECOGIDA + MIN;
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.coveredHandoffs, 1, 'el compromiso vigente se honra');
  assert.equal(entorno.database.trips[0].driverId, 'drv_a');
});

// --------------------------------------------------------------------------
// Rescate de última hora: el despacho inmediato EXISTENTE, una sola vez
// --------------------------------------------------------------------------

test('UNASSIGNED vencida → UN viaje SEARCHING + UNA llamada al despacho existente', async () => {
  const entorno = crearEntorno({ drivers: [] });
  const ride = await prepararRide(entorno); // sin conductores: BACKUP_REQUIRED

  entorno.reloj.ms = RECOGIDA + MIN;
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.fallbackHandoffs, 1);
  const trip = entorno.database.trips[0];
  assert.equal(trip.status, 'SEARCHING');
  assert.equal(trip.driverId, null);
  assert.equal(ride.serviceStatus, 'ACTIVE');
  assert.deepEqual(entorno.registro.dispatches, [trip.id], 'exactamente UNA llamada');
  assert.deepEqual(entorno.registro.announcements, []);
});

test('AT_RISK vencida → el mismo rescate', async () => {
  const entorno = crearEntorno({ drivers: [] });
  const ride = await prepararRide(entorno);
  entorno.reloj.ms = RECOGIDA - 10 * MIN;
  await entorno.servicio.runSafeTransportCoverage(); // umbral T-20: AT_RISK
  assert.equal(ride.assignmentStatus, 'AT_RISK');

  entorno.reloj.ms = RECOGIDA + MIN;
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.fallbackHandoffs, 1);
  assert.equal(entorno.database.trips[0].status, 'SEARCHING');
});

test('conductor comprometido INUTILIZABLE en T-0 → rescate, con la razón anotada', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const ride = await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });
  const driver = entorno.database.users.find(u => u.id === 'drv_a');
  driver.accountStatus = 'DISABLED'; // estructuralmente inutilizable

  entorno.reloj.ms = RECOGIDA + MIN;
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.driverInvalidated, 1);
  assert.equal(resumen.fallbackHandoffs, 1);
  const trip = entorno.database.trips[0];
  assert.equal(trip.status, 'SEARCHING');
  assert.equal(trip.driverId, null, 'JAMÁS asignado a un conductor inutilizable');
  assert.ok(ride.timeline.some(e => e.event === 'COMMITTED_DRIVER_UNAVAILABLE'));
  assert.ok(ride.declinedDriverIds.includes('drv_a'));
});

test('conductor comprometido YA en otro viaje activo → rescate, no doble asignación', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });
  entorno.database.trips.push({ id: 'trip_otro', driverId: 'drv_a', status: 'IN_PROGRESS' });

  entorno.reloj.ms = RECOGIDA + MIN;
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.driverInvalidated, 1);
  const nuevo = entorno.database.trips.find(t => t.id !== 'trip_otro');
  assert.equal(nuevo.status, 'SEARCHING');
});

// --------------------------------------------------------------------------
// EXACTAMENTE UNA VEZ
// --------------------------------------------------------------------------

test('doble pasada y pasada paralela: UN viaje, UN despacho, UN anuncio', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });
  entorno.reloj.ms = RECOGIDA + MIN;

  const [r1, r2] = await Promise.all([
    entorno.servicio.runSafeTransportHandoff(),
    entorno.servicio.runSafeTransportHandoff()
  ]);
  const r3 = await entorno.servicio.runSafeTransportHandoff();

  assert.equal(entorno.database.trips.length, 1, 'UN solo viaje bajo paralelismo y repetición');
  assert.equal(r1.coveredHandoffs + r2.coveredHandoffs, 1);
  assert.equal(r3.coveredHandoffs + r3.reconciled, 0, 'la tercera pasada no tiene nada que hacer');
  assert.equal(entorno.registro.announcements.length, 1);
  assert.deepEqual(entorno.registro.dispatches, []);
});

test('CAÍDA antes de crear el viaje: el reintento crea exactamente uno', async () => {
  let fallar = true;
  const entorno = crearEntorno({
    drivers: [],
    opcionesPuente: { fallarCreacion: () => fallar }
  });
  const ride = await prepararRide(entorno);
  entorno.reloj.ms = RECOGIDA + MIN;

  const r1 = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(r1.persistFailures, 1);
  assert.equal(entorno.database.trips.length, 0);
  assert.equal(ride.serviceStatus, 'PLANNED', 'nada a medias');

  fallar = false;
  const r2 = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(r2.fallbackHandoffs, 1);
  assert.equal(entorno.database.trips.length, 1);
  assert.equal(entorno.registro.dispatches.length, 1);
});

test('CAÍDA entre crear y enlazar (LA crítica): la siguiente pasada RECONCILIA, no duplica', async () => {
  // La persistencia de scheduledRides falla justo en el enlace: el viaje ya
  // existe, la ocurrencia queda PLANNED sin tripId — el peor momento posible.
  let fallarRides = false;
  const entorno = crearEntorno({
    drivers: [conductor('drv_a')],
    persistImpl: async tabla => !(tabla === 'scheduledRides' && fallarRides)
  });
  const ride = await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });
  entorno.reloj.ms = RECOGIDA + MIN;

  fallarRides = true;
  const r1 = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(r1.coveredHandoffs, 1, 'el viaje se creó y el pasajero tiene servicio');
  assert.equal(entorno.database.trips.length, 1);
  assert.equal(ride.tripId, null, 'el enlace NO pudo persistirse (simula la caída)');
  assert.equal(ride.serviceStatus, 'PLANNED');

  fallarRides = false;
  const r2 = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(r2.reconciled, 1, 'ENCONTRÓ el viaje existente');
  assert.equal(entorno.database.trips.length, 1, 'jamás un segundo viaje');
  assert.equal(ride.tripId, `trip_sched_${ride.id}`);
  assert.equal(ride.serviceStatus, 'ACTIVE');
  assert.equal(entorno.registro.announcements.length, 1, 'sin segundo anuncio');
  assert.deepEqual(entorno.registro.dispatches, [], 'sin segundo despacho');
});

test('REINICIO del proceso: el estado guardado converge sin duplicar', async () => {
  // Fase 1: un proceso entrega el viaje pero "muere" sin enlazar.
  let fallarRides = false;
  const primero = crearEntorno({
    drivers: [conductor('drv_a')],
    persistImpl: async tabla => !(tabla === 'scheduledRides' && fallarRides)
  });
  const ride = await prepararRide(primero, { preferredDriverId: 'drv_a', confirmar: true });
  primero.reloj.ms = RECOGIDA + MIN;
  fallarRides = true;
  await primero.servicio.runSafeTransportHandoff();

  // Fase 2: "reinicio" — un servicio NUEVO reconstruido sobre lo persistido.
  const persistido = {
    users: structuredClone(primero.database.users),
    transportSubscriptions: structuredClone(primero.database.transportSubscriptions),
    scheduledRides: structuredClone(primero.database.scheduledRides),
    notifications: [],
    trips: structuredClone(primero.database.trips)
  };
  const { bridge, registro } = crearPuente(persistido);
  const renacido = createSafeTransportService({
    database: persistido,
    persistRecord: async () => true,
    tripBridge: bridge,
    enabled: true,
    pilotUserIds: resolvePilotUserIds('*'),
    now: () => RECOGIDA + 3 * MIN,
    logger: silencioso
  });
  const resumen = await renacido.runSafeTransportHandoff();
  assert.equal(resumen.reconciled, 1);
  assert.equal(persistido.trips.length, 1, 'el viaje existente se reconoce');
  const rideRenacida = persistido.scheduledRides[0];
  assert.equal(rideRenacida.tripId, `trip_sched_${ride.id}`);
  assert.equal(rideRenacida.serviceStatus, 'ACTIVE');
  assert.deepEqual(registro.dispatches, [], 'sin re-despacho tras reinicio');
  assert.deepEqual(registro.announcements, [], 'sin re-anuncio tras reinicio');
});

// --------------------------------------------------------------------------
// Ventanas, perdidos y suscripción fuera de servicio
// --------------------------------------------------------------------------

test('antes de T-0 no se entrega nada; la gracia tiene suelo y valor por defecto', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });
  entorno.reloj.ms = RECOGIDA - MIN; // un minuto ANTES
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.due, 0);
  assert.equal(entorno.database.trips.length, 0);
  assert.equal(resolveHandoffGraceMs(undefined), DEFAULT_HANDOFF_GRACE_MS);
  assert.equal(resolveHandoffGraceMs('1000'), DEFAULT_HANDOFF_GRACE_MS, 'suelo de 60 s');
  assert.equal(resolveHandoffGraceMs('120000'), 120000);
});

test('fuera de gracia: estado terminal, JAMÁS un despacho horas tarde ni cobros', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const ride = await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });
  entorno.reloj.ms = RECOGIDA + DEFAULT_HANDOFF_GRACE_MS + MIN;

  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.missed, 1);
  assert.equal(ride.serviceStatus, 'CANCELLED_MISSED_HANDOFF');
  assert.equal(entorno.database.trips.length, 0);
  assert.deepEqual(entorno.registro.dispatches, []);
  await entorno.servicio.runSafeTransportHandoff();
  assert.equal(ride.timeline.filter(e => e.event === 'CANCELLED_MISSED_HANDOFF').length, 1, 'terminal y estable');
});

test('suscripción pausada a última hora: la ocurrencia vencida NO genera viaje', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const ride = await prepararRide(entorno, { preferredDriverId: 'drv_a' });
  const sub = entorno.database.transportSubscriptions[0];
  entorno.reloj.ms = RECOGIDA + MIN;
  await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'PAUSED');

  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.missed, 1);
  assert.equal(ride.serviceStatus, 'CANCELLED_SUBSCRIPTION_INACTIVE');
  assert.equal(entorno.database.trips.length, 0);
});

// --------------------------------------------------------------------------
// Ciclo de vida tras el handoff: el viaje normal es la autoridad
// --------------------------------------------------------------------------

test('COMPLETED del viaje → ocurrencia COMPLETED exactamente una vez; sin créditos', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const ride = await prepararRide(entorno, { preferredDriverId: 'drv_a', confirmar: true });
  entorno.reloj.ms = RECOGIDA + MIN;
  await entorno.servicio.runSafeTransportHandoff();

  // El motor normal recorre su ciclo (ARRIVED → IN_PROGRESS → COMPLETED).
  const trip = entorno.database.trips[0];
  for (const estado of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    trip.status = estado;
    await entorno.servicio.runSafeTransportHandoff();
    if (estado !== 'COMPLETED') {
      assert.equal(ride.serviceStatus, 'ACTIVE', `sigue ACTIVE durante ${estado}`);
    }
  }
  assert.equal(ride.serviceStatus, 'COMPLETED');
  await entorno.servicio.runSafeTransportHandoff();
  assert.equal(ride.timeline.filter(e => e.event === 'TRIP_COMPLETED').length, 1, 'UNA sola vez');
  assert.equal(entorno.database.transportSubscriptions[0].plan.ridesUsed, 0,
    'CERO consumo de créditos en 1E');
});

test('cancelación del viaje tras el handoff → CANCELLED_TRIP_CANCELLED, sin penalizaciones', async () => {
  const entorno = crearEntorno({ drivers: [] });
  const ride = await prepararRide(entorno);
  entorno.reloj.ms = RECOGIDA + MIN;
  await entorno.servicio.runSafeTransportHandoff();
  entorno.database.trips[0].status = 'CANCELLED'; // p. ej. sin conductores

  await entorno.servicio.runSafeTransportHandoff();
  assert.equal(ride.serviceStatus, 'CANCELLED_TRIP_CANCELLED');
  assert.equal(entorno.database.transportSubscriptions[0].plan.ridesUsed, 0);
});

// --------------------------------------------------------------------------
// Seguridad: el handoff es del servidor; el cliente no lo fuerza
// --------------------------------------------------------------------------

test('el cliente no puede inyectar tripId ni serviceStatus por ninguna vía', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  await prepararRide(entorno, { preferredDriverId: 'drv_a' });
  const sub = entorno.database.transportSubscriptions[0];
  assert.equal((await entorno.servicio.updateSubscription(PASAJERO, sub.id, { tripId: 'trip_x' })).code, 'UNKNOWN_FIELD');
  assert.equal((await entorno.servicio.updateSubscription(PASAJERO, sub.id, { serviceStatus: 'ACTIVE' })).code, 'UNKNOWN_FIELD');
  assert.equal((await entorno.servicio.createSubscription(
    { id: 'p9', role: 'passenger' },
    { ...cuerpoDeUna(), tripId: 'trip_x' }
  )).ok, true, 'en el alta los campos desconocidos simplemente no existen en el documento');
  assert.ok(!('tripId' in entorno.database.transportSubscriptions.at(-1)));
});
