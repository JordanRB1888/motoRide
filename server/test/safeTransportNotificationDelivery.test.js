import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { localTimeToUtc } from '../domain/scheduleCalendar.js';
import { resolvePilotUserIds, createSafeTransportService } from '../services/safeTransport.js';
import { PUSH_TYPE, buildScheduledPayload } from '../services/pushNotificationService.js';

/**
 * ENTREGA de los avisos del Transporte Seguro.
 *
 * El fallo real: los avisos se escribían en la base y ahí se quedaban. El
 * conductor tenía que ENTRAR a mirar para descubrir que le habían ofrecido un
 * traslado. Ahora el aviso se entrega: en vivo a la app abierta y, cuando hay
 * algo que hacer, al teléfono.
 *
 * Lo que custodian estas pruebas: que la oferta y la hora de recogida suenen;
 * que el push no lleve JAMÁS texto del servidor (solo un tipo); y que ni un
 * socket muerto ni un proveedor caído puedan tumbar el motor.
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };
const LUNES = localTimeToUtc('2026-08-31', '00:00', 'America/Caracas');
const RECOGIDA = localTimeToUtc('2026-08-31', '07:00', 'America/Caracas');
const PASAJERO = Object.freeze({ id: 'p1', role: 'passenger' });

const conductor = (id) => ({
  id, role: 'driver', isVerified: true, status: 'AVAILABLE', accountStatus: 'ACTIVE',
  acceptsScheduledRides: true, vehicleType: 'MOTO', firstName: 'Conductor', lastName: id,
  vehiclePlate: `PLACA-${id}`
});

const cuerpoDeUna = (extra = {}) => ({
  route: {
    home: { lat: 10.641234, lng: -71.612345, address: 'Casa' },
    worksite: { lat: 10.691111, lng: -71.632222, address: 'Trabajo' }
  },
  pattern: { weekdays: [1], outbound: { time: '07:00' }, timezone: 'America/Caracas' },
  ...extra
});

function crearEntorno({ notifier, tripBridge = null, nowMs = LUNES } = {}) {
  const database = {
    users: [{ id: 'p1', role: 'passenger', firstName: 'Ana' }, conductor('drv_a')],
    transportSubscriptions: [], scheduledRides: [], notifications: [], trips: []
  };
  const reloj = { ms: nowMs };
  const servicio = createSafeTransportService({
    database, persistRecord: async () => true, enabled: true, notifier, tripBridge,
    pilotUserIds: resolvePilotUserIds('*'), now: () => reloj.ms, logger: silencioso
  });
  return { database, servicio, reloj };
}

/** Notificador espía: registra lo entregado por cada vía. */
const espia = () => {
  const live = [];
  const push = [];
  return {
    live,
    push,
    notifier: {
      live: (userId, doc) => live.push({ userId, event: doc.event, title: doc.title, message: doc.message }),
      push: (userId, tipo, tripId) => push.push({ userId, tipo, tripId })
    }
  };
};

test('la oferta al conductor se ENTREGA: en vivo y al telefono', async () => {
  const ojo = espia();
  const entorno = crearEntorno({ notifier: ojo.notifier });
  await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();

  const enVivo = ojo.live.filter(x => x.event === 'scheduled_driver_offer');
  assert.equal(enVivo.length, 1, 'llega en vivo a su app');
  assert.equal(enVivo[0].userId, 'drv_a');
  const alTelefono = ojo.push.filter(x => x.tipo === PUSH_TYPE.SCHEDULED_OFFER);
  assert.equal(alTelefono.length, 1, 'y suena el teléfono');
  assert.equal(alTelefono[0].userId, 'drv_a');
  // El documento durable sigue existiendo: la entrega no lo sustituye.
  assert.equal(entorno.database.notifications.filter(n => n.event === 'scheduled_driver_offer').length, 1);
});

test('en el T-0 el conductor comprometido recibe «es hora», con el viaje', async () => {
  const creados = [];
  const tripBridge = {
    findTripForRide: () => null,
    driverById: id => ({ id, role: 'driver', isVerified: true, accountStatus: 'ACTIVE', status: 'AVAILABLE' }),
    driverHasActiveTrip: () => false,
    tripStatusOf: () => null,
    async createTripForRide({ ride, driver }) {
      const trip = { id: `trip_sched_${ride.id}`, scheduledRideId: ride.id, driverId: driver?.id ?? null, status: 'DRIVER_ASSIGNED' };
      creados.push(trip);
      return { ok: true, trip };
    },
    async announceAssignedTrip() {},
    dispatchTrip: () => {}
  };
  const ojo = espia();
  const entorno = crearEntorno({ notifier: ojo.notifier, tripBridge });
  await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  await entorno.servicio.acceptScheduledRide(entorno.database.users[1], ride.id);

  entorno.reloj.ms = RECOGIDA + 60_000; // llegó la hora
  await entorno.servicio.runSafeTransportHandoff();

  const aviso = entorno.database.notifications.find(n => n.event === 'scheduled_pickup_due');
  assert.ok(aviso, 'queda en su centro de notificaciones');
  assert.equal(aviso.userId, 'drv_a');
  assert.match(aviso.message, /comienza ahora/i);
  const push = ojo.push.filter(x => x.tipo === PUSH_TYPE.SCHEDULED_PICKUP_DUE);
  assert.equal(push.length, 1, 'y suena el teléfono a la hora');
  assert.equal(push[0].tripId, creados[0].id, 'con el viaje al que debe entrar');
  assert.ok(ojo.live.some(x => x.event === 'scheduled_pickup_due'), 'también en vivo');
});

test('la cancelacion suena; los avisos informativos no despiertan a nadie', async () => {
  const ojo = espia();
  const entorno = crearEntorno({ notifier: ojo.notifier });
  const alta = await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  await entorno.servicio.acceptScheduledRide(entorno.database.users[1], ride.id);

  // Al confirmar, la pasajera se entera EN VIVO pero sin push (no hay nada
  // que hacer): el teléfono no suena por cortesía.
  assert.ok(ojo.live.some(x => x.event === 'scheduled_driver_confirmed' && x.userId === 'p1'));
  assert.equal(ojo.push.filter(x => x.userId === 'p1').length, 0, 'a la pasajera no se le despierta');

  await entorno.servicio.setSubscriptionStatus(PASAJERO, alta.subscription.id, 'CANCELLED');
  const push = ojo.push.filter(x => x.tipo === PUSH_TYPE.SCHEDULED_CANCELLED);
  assert.equal(push.length, 1, 'que NO vaya a una recogida cancelada sí merece sonar');
  assert.equal(push[0].userId, 'drv_a');
});

test('el push jamas lleva texto del servidor: solo un tipo (y a lo sumo el viaje)', () => {
  const sinViaje = buildScheduledPayload(PUSH_TYPE.SCHEDULED_OFFER);
  assert.deepEqual(sinViaje, { v: 1, t: 'scheduled_offer' });
  const conViaje = buildScheduledPayload(PUSH_TYPE.SCHEDULED_PICKUP_DUE, 'trip_sched_x');
  assert.deepEqual(conViaje, { v: 1, t: 'scheduled_pickup_due', tripId: 'trip_sched_x' });
  // Ni título, ni cuerpo, ni dirección, ni nombre: por esa puerta no pasa.
  for (const payload of [sinViaje, conViaje]) {
    assert.deepEqual(Object.keys(payload).filter(k => !['v', 't', 'tripId'].includes(k)), []);
  }
});

test('una entrega que falla NO tumba el motor ni deshace lo persistido', async () => {
  const roto = {
    live: () => { throw new Error('socket muerto'); },
    push: () => { throw new Error('proveedor caido'); }
  };
  const entorno = crearEntorno({ notifier: roto });
  await entorno.servicio.createSubscription(PASAJERO, { ...cuerpoDeUna(), preferredDriverId: 'drv_a' });
  const resumen = await entorno.servicio.runSafeTransportCoverage();
  assert.equal(resumen.errors, 0, 'la pasada de cobertura termina limpia');
  assert.equal(resumen.preferredOffers, 1, 'y la oferta se hizo igual');
  assert.equal(entorno.database.notifications.length, 1, 'el aviso quedó escrito');
  assert.equal(entorno.database.scheduledRides[0].assignmentStatus, 'OFFERED_PREFERRED');
});

test('el service worker sabe pintar los tipos nuevos, y solo esos', () => {
  const sw = fs.readFileSync(path.join(process.cwd(), '..', 'public', 'sw.js'), 'utf8');
  for (const tipo of ['scheduled_offer', 'scheduled_pickup_due', 'scheduled_cancelled']) {
    assert.ok(sw.includes(`${tipo}: {`), `el worker traduce ${tipo}`);
  }
  // La etiqueta separa por TIPO: una cancelación no puede tapar una oferta.
  assert.match(sw, /tag: payload\.tripId \? `\$\{payload\.tipo\}/);
  // Y la caché sube de versión para que el worker nuevo entre de verdad.
  assert.match(sw, /const CACHE_NAME = '58express-pwa-v14/);
});
