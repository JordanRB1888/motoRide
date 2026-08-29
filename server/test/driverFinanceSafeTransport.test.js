import test from 'node:test';
import assert from 'node:assert/strict';
import { localTimeToUtc } from '../domain/scheduleCalendar.js';
import { resolvePilotUserIds, createSafeTransportService } from '../services/safeTransport.js';

/**
 * DRIVER-FINANCE-1 × Transporte Seguro.
 *
 * Un conductor bloqueado por deuda no recibe ni acepta traslados NUEVOS, y
 * los que ya tenía comprometidos se liberan A TIEMPO para buscar respaldo.
 * Lo que jamás ocurre: que el pasajero se entere de que su conductor debe
 * dinero. Para él solo hay «no está disponible».
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };
const LUNES = localTimeToUtc('2026-08-31', '00:00', 'America/Caracas');
const PASAJERO = Object.freeze({ id: 'p1', role: 'passenger' });

const conductor = (id, extra = {}) => ({
  id, role: 'driver', isVerified: true, status: 'AVAILABLE', accountStatus: 'ACTIVE',
  acceptsScheduledRides: true, vehicleType: 'MOTO', walletBalance: 10,
  firstName: 'Conductor', lastName: id, vehiclePlate: `PLACA-${id}`, ...extra
});

const cuerpoDeUna = (extra = {}) => ({
  route: {
    home: { lat: 10.641234, lng: -71.612345, address: 'Casa' },
    worksite: { lat: 10.691111, lng: -71.632222, address: 'Trabajo' }
  },
  pattern: { weekdays: [1], outbound: { time: '07:00' }, timezone: 'America/Caracas' },
  ...extra
});

function crearEntorno({ drivers = [], nowMs = LUNES } = {}) {
  const database = {
    users: [{ id: 'p1', role: 'passenger', firstName: 'Ana' }, ...drivers],
    transportSubscriptions: [], scheduledRides: [], notifications: [], trips: []
  };
  const reloj = { ms: nowMs };
  const servicio = createSafeTransportService({
    database, persistRecord: async () => true, enabled: true,
    // La frontera financiera solo existe con DRIVER-FINANCE-1 encendida.
    driverFinanceEnabled: true,
    pilotUserIds: resolvePilotUserIds('*'), now: () => reloj.ms, logger: silencioso
  });
  return { database, servicio, reloj };
}

test('§17 · un conductor con deuda no recibe ofertas programadas', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a', { walletBalance: -5 })] });
  await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();

  const ride = entorno.database.scheduledRides[0];
  assert.notEqual(ride.assignmentStatus, 'OFFERED_PREFERRED', 'ni siquiera al preferido');
  assert.equal(ride.currentOffer, null);
  assert.equal(entorno.servicio.listDriverOffers(entorno.database.users[1]).length, 0);
});

test('§17 · y tampoco puede aceptar una oferta que le llegó antes de endeudarse', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  const driver = entorno.database.users[1];
  assert.equal(ride.currentOffer?.driverId, 'drv_a', 'la oferta existía');

  driver.walletBalance = -5;                        // se endeudó entretanto
  const intento = await entorno.servicio.acceptScheduledRide(driver, ride.id);
  assert.equal(intento.ok, false);
  assert.equal(intento.code, 'FINANCIAL_BALANCE_BLOCK');
  assert.equal(ride.assignedDriverId, null, 'ningún compromiso nace de una cuenta bloqueada');
});

test('§18 · un compromiso FUTURO se libera al bloquearse, y se busca respaldo', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a'), conductor('drv_b')] });
  await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  const driver = entorno.database.users[1];
  assert.equal((await entorno.servicio.acceptScheduledRide(driver, ride.id)).ok, true);
  assert.equal(ride.assignmentStatus, 'DRIVER_CONFIRMED');

  driver.walletBalance = -5;                        // queda bloqueado ANTES del T-0
  const resumen = await entorno.servicio.runSafeTransportCoverage();

  assert.equal(resumen.commitmentsReleased, 1);
  assert.equal(ride.assignedDriverId, null, 'liberado operativamente');
  assert.equal(ride.assignmentStatus, 'BACKUP_REQUIRED', 'y vuelve a buscar cobertura');
  assert.equal(ride.releasedDriverId, 'drv_a', 'la auditoría recuerda quién lo tenía');
  assert.equal(entorno.servicio.listDriverCommitments(driver).length, 0);

  // §47 · PRIVACIDAD: al pasajero jamás se le habla de dinero ajeno.
  const alPasajero = entorno.database.notifications.filter(n => n.userId === 'p1');
  assert.ok(alPasajero.length >= 1);
  for (const aviso of alPasajero) {
    const texto = `${aviso.title} ${aviso.message}`;
    assert.doesNotMatch(texto, /deuda|saldo|dólar|\$|mantenimiento|bloque/i,
      'el pasajero solo sabe que se busca cobertura');
  }
  assert.ok(alPasajero.some(a => /no está disponible|cobertura/i.test(a.message)));

  // Al conductor sí se le dice la verdad, pero sin cifras.
  const alConductor = entorno.database.notifications.filter(n => n.userId === 'drv_a');
  assert.ok(alConductor.some(a => /no puede tomar carreras/i.test(a.message)));
  assert.ok(!alConductor.some(a => /\$-?\d/.test(a.message)), 'sin importes en el aviso');
});

test('§19 · si la ocurrencia YA es un viaje activo, el bloqueo no la interrumpe', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a')] });
  await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  const driver = entorno.database.users[1];
  await entorno.servicio.acceptScheduledRide(driver, ride.id);
  // El T-0 ya ocurrió: vive dentro de un viaje normal.
  ride.tripId = 'trip_sched_x';
  ride.serviceStatus = 'ACTIVE';

  driver.walletBalance = -20;                       // deuda profunda
  await entorno.servicio.runSafeTransportCoverage();

  assert.equal(ride.serviceStatus, 'ACTIVE', 'la carrera en curso sigue su vida');
  assert.equal(ride.tripId, 'trip_sched_x');
  assert.equal(ride.assignedDriverId, 'drv_a', 'y su conductor la termina');
});

test('un conductor al dia sigue trabajando igual: nada cambia para el', async () => {
  const entorno = crearEntorno({ drivers: [conductor('drv_a', { walletBalance: 0 })] });
  await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  assert.equal(ride.assignmentStatus, 'OFFERED_PREFERRED', 'saldo 0.00 y nunca bloqueado: trabaja');
  assert.equal((await entorno.servicio.acceptScheduledRide(entorno.database.users[1], ride.id)).ok, true);
  await entorno.servicio.runSafeTransportCoverage();
  assert.equal(ride.assignmentStatus, 'DRIVER_CONFIRMED', 'y su compromiso no se toca');
});
