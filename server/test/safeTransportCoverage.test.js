import test from 'node:test';
import assert from 'node:assert/strict';
import { localTimeToUtc } from '../domain/scheduleCalendar.js';
import { createSafeTransportService } from '../services/safeTransport.js';
import {
  approximateZone,
  commitmentsConflict,
  resolveBackupOfferPolicy,
  resolveCommitmentWindow,
  scheduledEligibilityDefect,
  selectBackupCandidates
} from '../domain/scheduledCoverage.js';

/**
 * SAFE-TRANSPORT-1D — el motor de cobertura, con el servicio REAL, base en
 * memoria, reloj inyectado y CERO red.
 *
 * Las propiedades que estas pruebas custodian:
 *  - el compromiso nace SOLO del consentimiento explícito del conductor;
 *  - exactamente UN conductor puede quedar comprometido por ocurrencia;
 *  - repetir la pasada no duplica ofertas ni notificaciones;
 *  - antes del consentimiento no viaja la puerta de la casa;
 *  - nada de esto crea viajes, toca el despacho ni consume créditos.
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };

// Lunes 2026-08-31 a las 00:00 de Caracas (04:00Z). Recogida del lunes:
// 07:00 Caracas = 11:00Z.
const LUNES = localTimeToUtc('2026-08-31', '00:00', 'America/Caracas');
const RECOGIDA_LUNES = localTimeToUtc('2026-08-31', '07:00', 'America/Caracas');
const MIN = 60_000;

const PASAJERO = Object.freeze({ id: 'p1', role: 'passenger' });

const conductor = (id, extra = {}) => ({
  id,
  role: 'driver',
  isVerified: true,
  status: 'AVAILABLE',
  accountStatus: 'ACTIVE',
  acceptsScheduledRides: true,
  vehicleType: 'MOTO',
  firstName: `Conductor`,
  lastName: id,
  vehiclePlate: `PLACA-${id}`,
  phone: '+58 400-000-0000',
  email: `${id}@ejemplo.com`,
  ...extra
});

/** Suscripción de UNA sola ocurrencia (lunes 07:00, solo ida): precisión. */
const cuerpoDeUna = (extra = {}) => ({
  route: {
    home: { lat: 10.641234, lng: -71.612345, address: 'Calle Privada 123, casa 4' },
    worksite: { lat: 10.691111, lng: -71.632222, address: 'Centro comercial' }
  },
  pattern: { weekdays: [1], outbound: { time: '07:00' }, timezone: 'America/Caracas' },
  ...extra
});

function crearEntorno({ nowMs = LUNES, drivers = [] } = {}) {
  const database = {
    users: [{ id: 'p1', role: 'passenger', firstName: 'Ana' }, ...drivers],
    transportSubscriptions: [],
    scheduledRides: [],
    notifications: [],
    trips: [] // debe permanecer VACÍA: sin handoff en 1D
  };
  const reloj = { ms: nowMs };
  const servicio = createSafeTransportService({
    database,
    persistRecord: async () => true,
    enabled: true,
    now: () => reloj.ms,
    logger: silencioso
  });
  return { database, servicio, reloj };
}

const notificacionesDe = (database, userId, event) =>
  database.notifications.filter(n => n.userId === userId && (!event || n.event === event));

async function altaConPreferido(servicio, preferredDriverId, cuerpo = cuerpoDeUna()) {
  const alta = await servicio.createSubscription(PASAJERO, { ...cuerpo, preferredDriverId });
  assert.equal(alta.ok, true);
  return alta.subscription;
}

// --------------------------------------------------------------------------
// Módulo puro: ventanas, conflicto, candidatos, zona
// --------------------------------------------------------------------------

test('el conflicto horario es determinista y simétrico (±15/60 min por defecto)', () => {
  const ventana = resolveCommitmentWindow({});
  assert.equal(ventana.beforeMs, 15 * MIN);
  assert.equal(ventana.afterMs, 60 * MIN);
  const t = RECOGIDA_LUNES;
  assert.ok(commitmentsConflict(t, t, ventana), 'la misma hora choca');
  assert.ok(commitmentsConflict(t, t + 60 * MIN, ventana), 'una hora despues aun choca');
  assert.ok(!commitmentsConflict(t, t + 76 * MIN, ventana), '60+15+1 min despues ya no');
  assert.ok(commitmentsConflict(t + 74 * MIN, t, ventana), 'simetrico');
  const politica = resolveBackupOfferPolicy({});
  assert.equal(politica.offerTtlMs, 10 * MIN);
  assert.equal(politica.maxOffers, 5);
});

test('la elegibilidad programada NO exige socket ni GPS, pero si consentimiento', () => {
  const ride = { scheduledPickupAt: new Date(RECOGIDA_LUNES).toISOString(), vehiclePreference: null };
  assert.equal(scheduledEligibilityDefect(conductor('d1'), ride, {}), null,
    'aprobado + activo + opt-in basta: sin requisito de presencia');
  assert.equal(scheduledEligibilityDefect(conductor('d1', { acceptsScheduledRides: false }), ride, {}), 'NOT_OPTED_IN');
  assert.equal(scheduledEligibilityDefect(conductor('d1', { isVerified: false }), ride, {}), 'DRIVER_NOT_APPROVED');
  assert.equal(scheduledEligibilityDefect(conductor('d1', { status: 'SUSPENDED' }), ride, {}), 'DRIVER_NOT_APPROVED');
  assert.equal(scheduledEligibilityDefect(conductor('d1', { accountStatus: 'DISABLED' }), ride, {}), 'ACCOUNT_DISABLED');
  assert.equal(scheduledEligibilityDefect({ ...conductor('d1'), role: 'passenger' }, ride, {}), 'NOT_A_DRIVER');
  assert.equal(scheduledEligibilityDefect(conductor('d1'), { ...ride, vehiclePreference: 'CARRO' }, {}), 'VEHICLE_MISMATCH');
});

test('los candidatos de respaldo son acotados, deterministas y sin GPS', () => {
  const ride = { scheduledPickupAt: new Date(RECOGIDA_LUNES).toISOString(), vehiclePreference: null };
  const flota = [conductor('drv_c'), conductor('drv_a'), conductor('drv_b'),
    conductor('drv_x', { acceptsScheduledRides: false })];
  const candidatos = selectBackupCandidates(flota, ride, { excludedIds: ['drv_b'], limit: 10 });
  assert.deepEqual(candidatos.map(d => d.id), ['drv_a', 'drv_c'],
    'orden estable por identificador; excluidos y no-optados fuera');
  assert.deepEqual(selectBackupCandidates(flota, ride, { limit: 1 }).map(d => d.id), ['drv_a']);
});

test('la zona aproximada redondea a ~1,1 km y no lleva direccion', () => {
  const zona = approximateZone({ lat: 10.641234, lng: -71.612345, address: 'Calle Privada 123' });
  assert.deepEqual(zona, { approxLat: 10.64, approxLng: -71.61 });
  assert.ok(!('address' in zona));
});

// --------------------------------------------------------------------------
// Opt-in del conductor
// --------------------------------------------------------------------------

test('opt-in: apagado por defecto, se enciende y se apaga; solo ese campo', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a', { acceptsScheduledRides: undefined })] });
  const driver = database.users.find(u => u.id === 'drv_a');
  assert.deepEqual(servicio.getDriverPreferences(driver), { acceptsScheduledRides: false }, 'ausencia = false');
  const encendido = await servicio.setDriverPreferences(driver, { acceptsScheduledRides: true });
  assert.deepEqual(encendido.preferences, { acceptsScheduledRides: true });
  const apagado = await servicio.setDriverPreferences(driver, { acceptsScheduledRides: false });
  assert.deepEqual(apagado.preferences, { acceptsScheduledRides: false });
  assert.equal((await servicio.setDriverPreferences(driver, { acceptsScheduledRides: 'si' })).code, 'INVALID_PREFERENCE');
  assert.equal((await servicio.setDriverPreferences(driver, { role: 'admin' })).code, 'UNKNOWN_FIELD');
});

// --------------------------------------------------------------------------
// Oferta al preferido
// --------------------------------------------------------------------------

test('el preferido elegible recibe UNA oferta, y repetir la pasada no la duplica', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a')] });
  await altaConPreferido(servicio, 'drv_a');
  const r1 = await servicio.runSafeTransportCoverage();
  assert.equal(r1.preferredOffers, 1);
  const ride = database.scheduledRides[0];
  assert.equal(ride.assignmentStatus, 'OFFERED_PREFERRED');
  assert.equal(ride.currentOffer.driverId, 'drv_a');
  assert.equal(ride.currentOffer.kind, 'PREFERRED');
  assert.equal(ride.assignedDriverId, null, 'ofertar NO es asignar');
  assert.equal(new Date(ride.currentOffer.expiresAt).getTime(), RECOGIDA_LUNES - 45 * MIN,
    'la oferta preferida vence en T-45min');
  assert.equal(notificacionesDe(database, 'drv_a', 'scheduled_driver_offer').length, 1);

  const r2 = await servicio.runSafeTransportCoverage();
  const r3 = await servicio.runSafeTransportCoverage();
  assert.equal(r2.preferredOffers + r3.preferredOffers, 0, 'cero re-ofertas');
  assert.equal(notificacionesDe(database, 'drv_a', 'scheduled_driver_offer').length, 1,
    'cero notificaciones duplicadas');
});

test('sin opt-in, sin aprobacion o con vehiculo incompatible NO hay oferta preferida', async () => {
  for (const apagado of [
    conductor('drv_a', { acceptsScheduledRides: false }),
    conductor('drv_a', { isVerified: false }),
    conductor('drv_a', { accountStatus: 'DISABLED' })
  ]) {
    const { servicio, database } = crearEntorno({ drivers: [apagado] });
    await altaConPreferido(servicio, 'drv_a');
    await servicio.runSafeTransportCoverage();
    assert.equal(database.scheduledRides[0].assignmentStatus, 'BACKUP_REQUIRED');
    assert.equal(notificacionesDe(database, 'drv_a').length, 0);
  }
  // Vehículo incompatible: la suscripción exige CARRO y el preferido es MOTO.
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a')] });
  await altaConPreferido(servicio, 'drv_a', cuerpoDeUna({ vehiclePreference: 'CARRO' }));
  await servicio.runSafeTransportCoverage();
  assert.equal(database.scheduledRides[0].assignmentStatus, 'BACKUP_REQUIRED');
  assert.equal(notificacionesDe(database, 'drv_a').length, 0);
});

test('el pasajero NO puede forzar: preferredDriverId jamas asigna por si solo', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a')] });
  const sub = await altaConPreferido(servicio, 'drv_a');
  await servicio.runSafeTransportCoverage();
  const ride = database.scheduledRides[0];
  assert.equal(ride.assignedDriverId, null);
  assert.notEqual(ride.assignmentStatus, 'DRIVER_CONFIRMED');
  // Ni siquiera re-editando la preferencia una y otra vez.
  await servicio.updateSubscription(PASAJERO, sub.id, { preferredDriverId: 'drv_a' });
  await servicio.runSafeTransportCoverage();
  assert.equal(database.scheduledRides.every(r => !r.assignedDriverId), true);
});

// --------------------------------------------------------------------------
// Accept / decline / expiración
// --------------------------------------------------------------------------

test('aceptar la oferta preferida confirma: DRIVER_CONFIRMED con el id DEL TOKEN', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a')] });
  await altaConPreferido(servicio, 'drv_a');
  await servicio.runSafeTransportCoverage();
  const driver = database.users.find(u => u.id === 'drv_a');
  const ride = database.scheduledRides[0];

  const resultado = await servicio.acceptScheduledRide(driver, ride.id);
  assert.equal(resultado.ok, true);
  assert.equal(ride.assignmentStatus, 'DRIVER_CONFIRMED');
  assert.equal(ride.assignedDriverId, 'drv_a');
  assert.equal(ride.currentOffer, null);
  assert.equal(notificacionesDe(database, 'p1', 'scheduled_driver_confirmed').length, 1);
  // El compromiso aceptado SÍ lleva la ruta operativa completa.
  assert.equal(resultado.commitment.pickup.address, 'Calle Privada 123, casa 4');
  // Y repetir el accept del mismo conductor es idempotente, no un error.
  assert.equal((await servicio.acceptScheduledRide(driver, ride.id)).ok, true);
  assert.equal(notificacionesDe(database, 'p1', 'scheduled_driver_confirmed').length, 1);
});

test('el conductor equivocado no puede aceptar; una oferta rechazada tampoco revive', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a'), conductor('drv_b')] });
  await altaConPreferido(servicio, 'drv_a');
  await servicio.runSafeTransportCoverage();
  const [a, b] = ['drv_a', 'drv_b'].map(id => database.users.find(u => u.id === id));
  const ride = database.scheduledRides[0];

  assert.equal((await servicio.acceptScheduledRide(b, ride.id)).code, 'NO_ACTIVE_OFFER');
  assert.equal((await servicio.declineScheduledRide(a, ride.id)).ok, true);
  assert.equal(ride.assignmentStatus, 'BACKUP_REQUIRED');
  assert.equal((await servicio.acceptScheduledRide(a, ride.id)).code, 'NO_ACTIVE_OFFER',
    'rechazada = sin oferta viva: no se acepta sin un estado de oferta nuevo');
  assert.equal((await servicio.acceptScheduledRide(a, 'sride_inexistente')).code, 'SCHEDULED_RIDE_NOT_FOUND');
});

test('una oferta vencida no se puede aceptar y el silencio cuenta como rechazo', async () => {
  const { servicio, database, reloj } = crearEntorno({ drivers: [conductor('drv_a'), conductor('drv_b')] });
  await altaConPreferido(servicio, 'drv_a');
  await servicio.runSafeTransportCoverage();
  const a = database.users.find(u => u.id === 'drv_a');
  const ride = database.scheduledRides[0];

  reloj.ms = RECOGIDA_LUNES - 44 * MIN; // pasado el T-45min de la preferida
  assert.equal((await servicio.acceptScheduledRide(a, ride.id)).code, 'OFFER_EXPIRED');
  const pasada = await servicio.runSafeTransportCoverage();
  assert.equal(pasada.expiredOffers, 1);
  assert.ok(ride.declinedDriverIds.includes('drv_a'), 'no responder lo excluye de re-oferta');
  // Y el circuito de respaldo toma el relevo con el siguiente candidato.
  assert.equal(ride.assignmentStatus, 'ASSIGNING');
  assert.equal(ride.currentOffer.driverId, 'drv_b');
  assert.equal(ride.currentOffer.kind, 'BACKUP');
});

test('choque horario: el mismo conductor no puede comprometerse a dos recogidas solapadas', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a')] });
  // Dos pasajeros, la MISMA hora, ambos prefieren al mismo conductor.
  await altaConPreferido(servicio, 'drv_a');
  const p2 = { id: 'p2', role: 'passenger' };
  database.users.push({ id: 'p2', role: 'passenger' });
  const alta2 = await servicio.createSubscription(p2, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  assert.equal(alta2.ok, true);
  await servicio.runSafeTransportCoverage();

  const driver = database.users.find(u => u.id === 'drv_a');
  const [ride1, ride2] = database.scheduledRides;
  assert.equal((await servicio.acceptScheduledRide(driver, ride1.id)).ok, true);
  assert.equal((await servicio.acceptScheduledRide(driver, ride2.id)).code, 'SCHEDULE_CONFLICT');
  assert.equal(ride2.assignedDriverId, null);
  // Y la siguiente pasada ya ni le re-oferta la segunda: choque detectado.
  await servicio.runSafeTransportCoverage();
  assert.notEqual(ride2.currentOffer?.driverId, 'drv_a');
});

// --------------------------------------------------------------------------
// Carrera de accepts: EXACTAMENTE un conductor comprometido
// --------------------------------------------------------------------------

test('CARRERA: dos accepts simultaneos → un solo compromiso y un rechazo determinista', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a'), conductor('drv_b')] });
  await altaConPreferido(servicio, null); // sin preferido: directo a respaldo
  await servicio.runSafeTransportCoverage(); // oferta de respaldo a drv_a (orden estable)
  const [a, b] = ['drv_a', 'drv_b'].map(id => database.users.find(u => u.id === id));
  const ride = database.scheduledRides[0];
  assert.equal(ride.currentOffer.driverId, 'drv_a');

  // drv_b cree tener una oportunidad (estado rancio) y drv_a acepta a la vez.
  const [deA, deB] = await Promise.all([
    servicio.acceptScheduledRide(a, ride.id),
    servicio.acceptScheduledRide(b, ride.id)
  ]);
  assert.equal(deA.ok, true);
  assert.equal(deB.ok, false);
  assert.equal(deB.code, 'RIDE_ALREADY_COVERED', 'rechazo determinista: «ya esta cubierta»');
  assert.equal(ride.assignedDriverId, 'drv_a', 'EXACTAMENTE un conductor');
  assert.equal(ride.assignmentStatus, 'COVERAGE_CONFIRMED');
  const confirmaciones = ride.timeline.filter(e => /CONFIRMED/.test(e.event));
  assert.equal(confirmaciones.length, 1, 'la linea temporal es coherente');
});

// --------------------------------------------------------------------------
// Respaldo, retirada y AT_RISK
// --------------------------------------------------------------------------

test('preferido rechaza → respaldo secuencial → accept = COVERAGE_CONFIRMED', async () => {
  const { servicio, database } = crearEntorno({
    drivers: [conductor('drv_a'), conductor('drv_b'), conductor('drv_c')]
  });
  await altaConPreferido(servicio, 'drv_b'); // preferido: drv_b
  await servicio.runSafeTransportCoverage();
  const ride = database.scheduledRides[0];
  assert.equal(ride.currentOffer.driverId, 'drv_b');

  const b = database.users.find(u => u.id === 'drv_b');
  await servicio.declineScheduledRide(b, ride.id);
  const pasada = await servicio.runSafeTransportCoverage();
  assert.equal(pasada.backupOffers, 1);
  assert.equal(ride.currentOffer.driverId, 'drv_a', 'primer respaldo en orden estable (b ya rechazo)');

  const aDriver = database.users.find(u => u.id === 'drv_a');
  await servicio.declineScheduledRide(aDriver, ride.id);
  await servicio.runSafeTransportCoverage();
  assert.equal(ride.currentOffer.driverId, 'drv_c', 'el siguiente, sin repetir rechazados');

  const c = database.users.find(u => u.id === 'drv_c');
  assert.equal((await servicio.acceptScheduledRide(c, ride.id)).ok, true);
  assert.equal(ride.assignmentStatus, 'COVERAGE_CONFIRMED');
  assert.equal(ride.assignedDriverId, 'drv_c');
  assert.equal(database.trips.length, 0, 'ningun viaje creado');
});

test('retirada de un compromiso futuro: respaldo de nuevo y pasajero avisado', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a'), conductor('drv_b')] });
  await altaConPreferido(servicio, 'drv_a');
  await servicio.runSafeTransportCoverage();
  const a = database.users.find(u => u.id === 'drv_a');
  const ride = database.scheduledRides[0];
  await servicio.acceptScheduledRide(a, ride.id);

  assert.equal((await servicio.withdrawFromScheduledRide(a, ride.id)).ok, true);
  assert.equal(ride.assignedDriverId, null);
  assert.equal(ride.assignmentStatus, 'BACKUP_REQUIRED');
  assert.equal(notificacionesDe(database, 'p1', 'driver_changed').length, 1);
  await servicio.runSafeTransportCoverage();
  assert.equal(ride.currentOffer.driverId, 'drv_b', 'el retirado no se re-oferta');
  assert.equal(database.trips.length, 0);
  // Y nadie puede retirarse de lo ajeno.
  const b = database.users.find(u => u.id === 'drv_b');
  assert.equal((await servicio.withdrawFromScheduledRide(b, ride.id)).code, 'COMMITMENT_NOT_FOUND');
});

test('AT_RISK: sin cobertura al umbral — exactamente una vez, sin despacho y sin viaje', async () => {
  const { servicio, database, reloj } = crearEntorno({ drivers: [] }); // nadie disponible
  await altaConPreferido(servicio, null);
  await servicio.runSafeTransportCoverage();
  const ride = database.scheduledRides[0];
  assert.equal(ride.assignmentStatus, 'BACKUP_REQUIRED', 'sin candidatos, a la espera');
  assert.equal(notificacionesDe(database, 'p1').length, 0, 'sin alarmas prematuras');

  reloj.ms = RECOGIDA_LUNES - 19 * MIN; // dentro del umbral T-20min
  const pasada = await servicio.runSafeTransportCoverage();
  assert.equal(pasada.atRisk, 1);
  assert.equal(ride.assignmentStatus, 'AT_RISK');
  assert.equal(notificacionesDe(database, 'p1', 'scheduled_ride_at_risk').length, 1);

  await servicio.runSafeTransportCoverage();
  await servicio.runSafeTransportCoverage();
  assert.equal(notificacionesDe(database, 'p1', 'scheduled_ride_at_risk').length, 1, 'UNA sola vez');
  assert.equal(database.trips.length, 0);
});

test('el techo de ofertas de respaldo se respeta: sin spam a toda la flota', async () => {
  const flota = ['drv_a', 'drv_b', 'drv_c', 'drv_d', 'drv_e', 'drv_f', 'drv_g'].map(id => conductor(id));
  const { servicio, database, reloj } = crearEntorno({ drivers: flota });
  await altaConPreferido(servicio, null);
  // Agotar el techo: cada oferta vence y pasa al siguiente.
  let vencimientos = 0;
  for (let i = 0; i < 10; i += 1) {
    const pasada = await servicio.runSafeTransportCoverage();
    vencimientos += pasada.backupOffers;
    const oferta = database.scheduledRides[0].currentOffer;
    if (!oferta) break;
    reloj.ms = Date.parse(oferta.expiresAt) + 1;
  }
  assert.equal(vencimientos, 5, 'exactamente maxOffers ofertas; la flota entera JAMAS');
  assert.equal(database.scheduledRides[0].backupOffersSent, 5);
});

// --------------------------------------------------------------------------
// Privacidad y listas del conductor
// --------------------------------------------------------------------------

test('PRIVACIDAD: la oferta no lleva la puerta de la casa; el compromiso si', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a'), conductor('drv_b')] });
  await altaConPreferido(servicio, 'drv_a');
  await servicio.runSafeTransportCoverage();
  const [a, b] = ['drv_a', 'drv_b'].map(id => database.users.find(u => u.id === id));

  const ofertas = servicio.listDriverOffers(a);
  assert.equal(ofertas.length, 1);
  const crudo = JSON.stringify(ofertas);
  assert.ok(!crudo.includes('Calle Privada'), 'sin direccion exacta');
  assert.ok(!crudo.includes('10.641234'), 'sin coordenadas precisas');
  assert.ok(!crudo.includes('address') && !crudo.includes('phone') && !crudo.includes('passengerId'),
    'ni direccion, ni telefono, ni identidad del pasajero');
  assert.deepEqual(ofertas[0].pickupZone, { approxLat: 10.64, approxLng: -71.61 }, 'solo la zona');
  assert.equal(servicio.listDriverOffers(b).length, 0, 'la oferta es SOLO del destinatario');

  await servicio.acceptScheduledRide(a, ofertas[0].rideId);
  const compromisos = servicio.listDriverCommitments(a);
  assert.equal(compromisos.length, 1);
  assert.equal(compromisos[0].pickup.address, 'Calle Privada 123, casa 4',
    'tras consentir, la ruta operativa completa');
  assert.equal(servicio.listDriverCommitments(b).length, 0, 'los compromisos son SOLO del asignado');
});

test('PRIVACIDAD: el pasajero ve identidad segura del conductor, sin telefono ni contabilidad', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a')] });
  await altaConPreferido(servicio, 'drv_a');
  await servicio.runSafeTransportCoverage();
  const a = database.users.find(u => u.id === 'drv_a');
  const ride = database.scheduledRides[0];

  const antes = servicio.projectRideForPassenger(ride);
  assert.equal(antes.driver, null, 'sin compromiso no hay identidad que mostrar');
  assert.ok(!('currentOffer' in antes) && !('declinedDriverIds' in antes) && !('backupOffersSent' in antes),
    'la contabilidad de ofertas es interna');

  await servicio.acceptScheduledRide(a, ride.id);
  const despues = servicio.projectRideForPassenger(ride);
  assert.equal(despues.driver.firstName, 'Conductor');
  assert.equal(despues.driver.vehiclePlate, 'PLACA-drv_a');
  assert.ok(!('phone' in despues.driver), 'sin telefono');
  const crudo = JSON.stringify(despues.driver);
  assert.ok(!crudo.includes('@ejemplo.com') && !crudo.includes('passwordHash'), 'sin correo ni secretos');
});

test('la reconciliacion de agenda RESETEA ofertas pendientes pero jamas un compromiso', async () => {
  const { servicio, database } = crearEntorno({ drivers: [conductor('drv_a')] });
  const sub = await altaConPreferido(servicio, 'drv_a', {
    ...cuerpoDeUna(),
    pattern: { weekdays: [1, 2], outbound: { time: '07:00' }, timezone: 'America/Caracas' }
  });
  await servicio.runSafeTransportCoverage();
  const a = database.users.find(u => u.id === 'drv_a');
  const lunes = database.scheduledRides.find(r => r.localDate === '2026-08-31');
  const martes = database.scheduledRides.find(r => r.localDate === '2026-09-01');
  await servicio.acceptScheduledRide(a, lunes.id); // lunes COMPROMETIDO; martes con oferta

  // El pasajero cambia la hora de toda la agenda.
  await servicio.updateSubscription(PASAJERO, sub.id, {
    pattern: { outbound: { time: '08:00' } }
  });
  assert.equal(lunes.assignedDriverId, 'drv_a', 'el compromiso NO se toca');
  assert.equal(lunes.localTime, '07:00', 'ni se reprograma por detras del conductor');
  assert.equal(martes.localTime, '08:00', 'la oferta pendiente si se reprograma…');
  assert.equal(martes.assignmentStatus, 'UNASSIGNED', '…y su cobertura vuelve a cero');
  assert.equal(martes.currentOffer, null);
  assert.deepEqual(martes.declinedDriverIds, []);
});
