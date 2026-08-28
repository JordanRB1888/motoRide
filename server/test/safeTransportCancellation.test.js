import test from 'node:test';
import assert from 'node:assert/strict';
import { localTimeToUtc } from '../domain/scheduleCalendar.js';
import { resolvePilotUserIds, createSafeTransportService } from '../services/safeTransport.js';

/**
 * BUGFIX — cancelar el plan debe liberar TODO lo futuro, también lo
 * comprometido.
 *
 * El fallo real de producción: al cancelar una suscripción, sus ocurrencias
 * futuras con conductor CONFIRMADO sobrevivían en PLANNED. Consecuencias en
 * cadena: el conductor las seguía viendo como «Comprometido», la pasajera las
 * seguía viendo como próximas y —lo más caro— seguían ocupando la agenda del
 * conductor, de modo que los planes NUEVOS a esa misma hora ya no podían
 * ofrecérsela: el conductor parecía ocupado por traslados que nadie iba a
 * hacer.
 *
 * Lo que custodian estas pruebas: la cancelación libera; la liberación avisa
 * al conductor una sola vez y sin datos ajenos; lo liberado no ocupa agenda ni
 * se puede aceptar; y NADA de esto toca lo que sí está vivo (compromisos de
 * planes en servicio, viajes ya entregados, historial completado).
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };
const LUNES = localTimeToUtc('2026-08-31', '00:00', 'America/Caracas');
const RECOGIDA_LUNES = localTimeToUtc('2026-08-31', '07:00', 'America/Caracas');
const MIN = 60_000;
const PASAJERO = Object.freeze({ id: 'p1', role: 'passenger' });

const conductor = (id, extra = {}) => ({
  id, role: 'driver', isVerified: true, status: 'AVAILABLE', accountStatus: 'ACTIVE',
  acceptsScheduledRides: true, vehicleType: 'MOTO', firstName: 'Conductor', lastName: id,
  vehiclePlate: `PLACA-${id}`, ...extra
});

const cuerpoDeUna = (extra = {}) => ({
  route: {
    home: { lat: 10.641234, lng: -71.612345, address: 'Casa' },
    worksite: { lat: 10.691111, lng: -71.632222, address: 'Trabajo' }
  },
  pattern: { weekdays: [1], outbound: { time: '07:00' }, timezone: 'America/Caracas' },
  ...extra
});

function crearEntorno({ nowMs = LUNES, drivers = [], tripBridge = null } = {}) {
  const database = {
    users: [{ id: 'p1', role: 'passenger', firstName: 'Ana' }, ...drivers],
    transportSubscriptions: [], scheduledRides: [], notifications: [], trips: []
  };
  const reloj = { ms: nowMs };
  const servicio = createSafeTransportService({
    database, persistRecord: async () => true, enabled: true,
    pilotUserIds: resolvePilotUserIds('*'), tripBridge,
    now: () => reloj.ms, logger: silencioso
  });
  return { database, servicio, reloj };
}

const avisos = (database, userId, event) =>
  database.notifications.filter(n => n.userId === userId && (!event || n.event === event));

/** Alta + oferta al preferido + accept: deja UNA ocurrencia comprometida. */
async function planComprometido(entorno, driverId, cuerpo = cuerpoDeUna()) {
  const alta = await entorno.servicio.createSubscription(PASAJERO, { ...cuerpo, preferredDriverId: driverId });
  assert.equal(alta.ok, true);
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides.at(-1);
  const driver = entorno.database.users.find(u => u.id === driverId);
  assert.equal((await entorno.servicio.acceptScheduledRide(driver, ride.id)).ok, true);
  assert.equal(ride.assignmentStatus, 'DRIVER_CONFIRMED');
  return { sub: alta.subscription, ride, driver };
}

// --------------------------------------------------------------------------
// El fallo, en cada estado de cobertura
// --------------------------------------------------------------------------

test('cancelar el plan deja TERMINAL toda ocurrencia futura sin viaje, en cualquier estado', async () => {
  for (const estado of ['UNASSIGNED', 'OFFERED_PREFERRED', 'ASSIGNING', 'BACKUP_REQUIRED', 'AT_RISK', 'DRIVER_CONFIRMED', 'COVERAGE_CONFIRMED']) {
    const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
    const alta = await entorno.servicio.createSubscription(PASAJERO, cuerpoDeUna());
    const ride = entorno.database.scheduledRides[0];
    // Se coloca el estado a mano SOLO para cubrir la matriz completa.
    ride.assignmentStatus = estado;
    if (['DRIVER_CONFIRMED', 'COVERAGE_CONFIRMED'].includes(estado)) ride.assignedDriverId = 'drv_a';
    if (estado === 'OFFERED_PREFERRED') {
      ride.currentOffer = { driverId: 'drv_a', kind: 'PREFERRED', expiresAt: new Date(RECOGIDA_LUNES).toISOString() };
    }

    const cancelar = await entorno.servicio.setSubscriptionStatus(PASAJERO, alta.subscription.id, 'CANCELLED');
    assert.equal(cancelar.ok, true, estado);
    assert.equal(ride.serviceStatus, 'CANCELLED_SUBSCRIPTION_INACTIVE', `${estado}: la ocurrencia muere`);
    assert.equal(ride.assignedDriverId, null, `${estado}: la asignación operativa se libera`);
    assert.equal(ride.currentOffer, null, `${estado}: sin ofertas en pie`);
    assert.equal(entorno.servicio.listDriverCommitments(conductor('drv_a')).length, 0, `${estado}: fuera de la agenda`);
    assert.equal(entorno.servicio.listDriverOffers(conductor('drv_a')).length, 0, `${estado}: sin ofertas rancias`);
  }
});

test('el conductor comprometido se entera UNA vez, con motivo y sin datos ajenos', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const { sub, ride } = await planComprometido(entorno, 'drv_a');

  assert.equal((await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'CANCELLED')).ok, true);
  const cancelaciones = avisos(entorno.database, 'drv_a', 'scheduled_ride_cancelled');
  assert.equal(cancelaciones.length, 1, 'exactamente una');
  assert.match(cancelaciones[0].message, /cancel/i);
  assert.match(cancelaciones[0].message, /no necesitas cubrirlo/i);
  // Ni saldo, ni wallet, ni el resto de su agenda, ni datos privados.
  const texto = `${cancelaciones[0].title} ${cancelaciones[0].message}`;
  assert.doesNotMatch(texto, /saldo|wallet|billetera|\$|tel|@|Ana/i);
  // La auditoría conserva quién lo tenía y por qué murió.
  assert.equal(ride.releasedDriverId, 'drv_a');
  const eventos = ride.timeline.map(t => t.event);
  assert.ok(eventos.includes('COMMITMENT_RELEASED'));
  assert.ok(eventos.includes('CANCELLED_SUBSCRIPTION_INACTIVE'));

  // Idempotente: repetir la pasada del materializador no reavisa ni resucita.
  await entorno.servicio.runSafeTransportMaterialization();
  await entorno.servicio.runSafeTransportMaterialization();
  assert.equal(avisos(entorno.database, 'drv_a', 'scheduled_ride_cancelled').length, 1);
  assert.equal(ride.serviceStatus, 'CANCELLED_SUBSCRIPTION_INACTIVE', 'no resucita');
});

test('un accept rezagado sobre el plan ya cancelado muere en el motor', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const alta = await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  const driver = entorno.database.users[1];
  // La pasajera cancela mientras la oferta viajaba al teléfono del conductor.
  assert.equal((await entorno.servicio.setSubscriptionStatus(PASAJERO, alta.subscription.id, 'CANCELLED')).ok, true);
  const tardio = await entorno.servicio.acceptScheduledRide(driver, ride.id);
  assert.equal(tardio.ok, false);
  assert.equal(tardio.code, 'RIDE_NOT_AVAILABLE');
  assert.equal(ride.assignedDriverId, null, 'ningún compromiso nace de lo cancelado');
});

// --------------------------------------------------------------------------
// El síntoma caro: el conductor «ocupado» por traslados fantasma
// --------------------------------------------------------------------------

test('lo cancelado NO ocupa agenda: el plan nuevo puede ofertar al mismo conductor a la misma hora', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const viejo = await planComprometido(entorno, 'drv_a');
  assert.equal((await entorno.servicio.setSubscriptionStatus(PASAJERO, viejo.sub.id, 'CANCELLED')).ok, true);

  // Plan NUEVO, mismo conductor preferido, MISMA hora que el viejo.
  const nuevo = await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  assert.equal(nuevo.ok, true);
  await entorno.servicio.runSafeTransportCoverage();

  const rideNuevo = entorno.database.scheduledRides.find(r => r.subscriptionId === nuevo.subscription.id);
  assert.ok(rideNuevo, 'el plan nuevo materializó su ocurrencia');
  assert.equal(rideNuevo.assignmentStatus, 'OFFERED_PREFERRED', 'la oferta SÍ sale: nada lo bloquea');
  assert.equal(rideNuevo.currentOffer?.driverId, 'drv_a');
  // Y el conductor puede aceptarla de verdad.
  const driver = entorno.database.users[1];
  assert.equal(entorno.servicio.listDriverOffers(driver).length, 1, 'una sola oferta: la del plan vivo');
  assert.equal((await entorno.servicio.acceptScheduledRide(driver, rideNuevo.id)).ok, true);
  const compromisos = entorno.servicio.listDriverCommitments(driver);
  assert.equal(compromisos.length, 1, 'solo el compromiso nuevo');
  assert.equal(compromisos[0].rideId, rideNuevo.id);
});

// --------------------------------------------------------------------------
// Lo que NO se puede tocar
// --------------------------------------------------------------------------

test('los compromisos de un plan EN SERVICIO siguen intactos (regresión del piloto real)', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a'), conductor('drv_b')] });
  const vivo = await planComprometido(entorno, 'drv_a');
  // Otro plan, otra pasajera del mismo servicio, se cancela: no puede
  // arrastrar al que sigue en servicio.
  const otroPasajero = { id: 'p2', role: 'passenger' };
  entorno.database.users.push({ id: 'p2', role: 'passenger', firstName: 'Otra' });
  const aCancelar = await entorno.servicio.createSubscription(otroPasajero, { ...cuerpoDeUna(), preferredDriverId: 'drv_b' });
  await entorno.servicio.runSafeTransportCoverage();
  await entorno.servicio.setSubscriptionStatus(otroPasajero, aCancelar.subscription.id, 'CANCELLED');

  assert.equal(vivo.ride.serviceStatus, 'PLANNED', 'el traslado vivo sigue vivo');
  assert.equal(vivo.ride.assignedDriverId, 'drv_a');
  assert.equal(entorno.servicio.listDriverCommitments(vivo.driver).length, 1, 'su conductor lo conserva');
  assert.equal(avisos(entorno.database, 'drv_a', 'scheduled_ride_cancelled').length, 0, 'y no recibe avisos ajenos');
});

test('una ocurrencia YA entregada a un viaje no se cancela por cancelar el plan', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const { sub, ride } = await planComprometido(entorno, 'drv_a');
  // Simula el T-0 ya ocurrido: la ocurrencia vive dentro de un viaje normal.
  ride.tripId = 'trip_sched_x';
  ride.serviceStatus = 'ACTIVE';

  assert.equal((await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'CANCELLED')).ok, true);
  assert.equal(ride.serviceStatus, 'ACTIVE', 'el viaje en curso sigue su vida');
  assert.equal(ride.tripId, 'trip_sched_x');
  assert.equal(avisos(entorno.database, 'drv_a', 'scheduled_ride_cancelled').length, 0,
    'nadie le dice al conductor que abandone una carrera en curso');
});

test('el historial completado no se toca jamás', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const { sub, ride } = await planComprometido(entorno, 'drv_a');
  ride.tripId = 'trip_sched_y';
  ride.serviceStatus = 'COMPLETED';
  const antes = structuredClone(ride);

  await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'CANCELLED');
  assert.equal(ride.serviceStatus, 'COMPLETED');
  assert.equal(ride.tripId, antes.tripId);
  assert.equal(ride.assignedDriverId, antes.assignedDriverId, 'la historia conserva su conductor');
});

test('cancelar dos veces no duplica nada ni resucita nada', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const { sub, ride } = await planComprometido(entorno, 'drv_a');
  assert.equal((await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'CANCELLED')).ok, true);
  const timelineTrasPrimera = ride.timeline.length;

  // La segunda cancelación es una transición inválida y no rompe nada.
  const segunda = await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'CANCELLED');
  assert.equal(segunda.ok, false);
  assert.equal(segunda.code, 'INVALID_STATUS_TRANSITION');
  assert.equal(ride.timeline.length, timelineTrasPrimera, 'sin ruido en la auditoría');
  assert.equal(avisos(entorno.database, 'drv_a', 'scheduled_ride_cancelled').length, 1);
  assert.equal(entorno.database.transportSubscriptions[0].status, 'CANCELLED');
});

test('pausar tambien libera el compromiso, y reanudar lo vuelve a ofrecer desde cero', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const { sub, ride, driver } = await planComprometido(entorno, 'drv_a');

  assert.equal((await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'PAUSED')).ok, true);
  assert.equal(ride.serviceStatus, 'CANCELLED_SUBSCRIPTION_PAUSED');
  assert.equal(entorno.servicio.listDriverCommitments(driver).length, 0, 'el conductor queda libre');
  assert.equal(avisos(entorno.database, 'drv_a', 'scheduled_ride_cancelled').length, 1);

  // Al reanudar, la ocurrencia revive SIN conductor: el compromiso se liberó
  // y debe volver a nacer del consentimiento.
  assert.equal((await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'ACTIVE')).ok, true);
  assert.equal(ride.serviceStatus, 'PLANNED');
  assert.equal(ride.assignedDriverId, null);
  assert.equal(ride.assignmentStatus, 'UNASSIGNED');
});

test('el conflicto horario solo cuenta compromisos de planes EN SERVICIO', async () => {
  // Se prueba por comportamiento observable: con el compromiso vivo, la
  // ocurrencia de OTRA persona a la misma hora no puede ofrecérsele; en
  // cuanto ese plan se cancela, sí.
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  const { sub } = await planComprometido(entorno, 'drv_a');

  const otroPasajero = { id: 'p2', role: 'passenger' };
  entorno.database.users.push({ id: 'p2', role: 'passenger', firstName: 'Otra' });
  const segundo = await entorno.servicio.createSubscription(otroPasajero, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();
  const rideSegundo = entorno.database.scheduledRides.find(r => r.subscriptionId === segundo.subscription.id);
  assert.notEqual(rideSegundo.assignmentStatus, 'OFFERED_PREFERRED',
    'con el compromiso VIVO el conductor está ocupado a esa hora');
  assert.equal(rideSegundo.currentOffer, null);

  // El primer plan se cancela: esa hora queda libre de verdad.
  await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'CANCELLED');
  await entorno.servicio.runSafeTransportCoverage();
  assert.equal(rideSegundo.currentOffer?.driverId, 'drv_a',
    'liberada la agenda, la oferta llega al conductor');
});
