import test from 'node:test';
import assert from 'node:assert/strict';
import { localTimeToUtc } from '../domain/scheduleCalendar.js';
import {
  createSafeTransportService,
  resolvePilotUserIds,
  sanitizeSafeTransportPricing,
  DEFAULT_SAFE_TRANSPORT_PRICING
} from '../services/safeTransport.js';

/**
 * SAFE-TRANSPORT-2A — la facturación del plan, a nivel de servicio.
 *
 * El modelo del dueño, custodiado por estas pruebas: saldo en wallet como
 * requisito de ENTRADA (una quincena), cobro por CARRERA REALIZADA con
 * tarifa fija por categoría y 80/20, carrera no realizada = no se cobra,
 * y sin saldo = el viaje NO nace (cero deuda) + plan SUSPENDED_PAYMENT.
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };
const LUNES = localTimeToUtc('2026-08-31', '00:00', 'America/Caracas');
const RECOGIDA = localTimeToUtc('2026-08-31', '07:00', 'America/Caracas');
const MIN = 60_000;
const PASAJERO = Object.freeze({ id: 'p1', role: 'passenger' });

const cuerpoLV = (extra = {}) => ({
  route: {
    home: { lat: 10.64, lng: -71.61, address: 'Casa' },
    worksite: { lat: 10.69, lng: -71.63, address: 'Trabajo' }
  },
  pattern: {
    weekdays: [1, 2, 3, 4, 5],
    outbound: { time: '07:00' },
    return: { time: '17:00' },
    timezone: 'America/Caracas'
  },
  ...extra
});

/** Puente falso FIEL al contrato 2A del real: tarifa fija, WALLET, gate de
 *  saldo contra database.users, y registro de lo creado. */
function crearEntorno({ nowMs = LUNES, billing = true, saldo = 0, pricing } = {}) {
  const database = {
    users: [
      { id: 'p1', role: 'passenger', firstName: 'Ana', walletBalance: saldo },
      { id: 'drv_a', role: 'driver', isVerified: true, status: 'AVAILABLE', accountStatus: 'ACTIVE', acceptsScheduledRides: true, vehicleType: 'MOTO', firstName: 'Conductor', lastName: 'A' }
    ],
    transportSubscriptions: [],
    scheduledRides: [],
    notifications: [],
    trips: []
  };
  const reloj = { ms: nowMs };
  const config = sanitizeSafeTransportPricing(pricing) ?? DEFAULT_SAFE_TRANSPORT_PRICING;
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
      if (billing) {
        trip.paymentMethod = 'WALLET';
        trip.fareUSD = config.perRide[ride.vehiclePreference === 'CAR' ? 'CAR' : 'MOTO'];
        trip.fareSource = 'SUBSCRIPTION_FIXED';
        trip.commissionRate = config.platformFeeRate;
        const pasajera = database.users.find(u => u.id === ride.passengerId);
        const balance = Number(pasajera?.walletBalance || 0);
        if (balance < trip.fareUSD) {
          return { ok: false, code: 'INSUFFICIENT_WALLET_BALANCE', required: trip.fareUSD, balance };
        }
      } else {
        trip.paymentMethod = 'CASH';
      }
      database.trips.push(trip);
      return { ok: true, trip };
    },
    async announceAssignedTrip() {},
    dispatchTrip: () => {}
  };
  const servicio = createSafeTransportService({
    database,
    persistRecord: async () => true,
    tripBridge: bridge,
    enabled: true,
    pilotUserIds: resolvePilotUserIds('*'),
    billingEnabled: billing,
    getPricing: () => config,
    now: () => reloj.ms,
    logger: silencioso
  });
  return { database, servicio, reloj };
}

// --------------------------------------------------------------------------
// Configuración de precios (la que edita el admin)
// --------------------------------------------------------------------------

test('el sanitizador de tarifas acepta lo valido y rechaza lo demas', () => {
  assert.deepEqual(
    sanitizeSafeTransportPricing({ perRide: { MOTO: 1.5, CAR: 2.5 }, platformFeeRate: 0.25 }),
    { perRide: { MOTO: 1.5, CAR: 2.5 }, platformFeeRate: 0.25 }
  );
  for (const invalida of [
    null, {},
    { perRide: { MOTO: 0, CAR: 2 }, platformFeeRate: 0.2 },
    { perRide: { MOTO: -1, CAR: 2 }, platformFeeRate: 0.2 },
    { perRide: { MOTO: 1.2, CAR: 2 }, platformFeeRate: 0.95 },
    { perRide: { MOTO: 'gratis', CAR: 2 }, platformFeeRate: 0.2 },
    { perRide: { MOTO: 101, CAR: 2 }, platformFeeRate: 0.2 }
  ]) {
    assert.equal(sanitizeSafeTransportPricing(invalida), null, JSON.stringify(invalida));
  }
  assert.equal(DEFAULT_SAFE_TRANSPORT_PRICING.platformFeeRate, 0.2, 'el 20% pedido por el dueño');
});

// --------------------------------------------------------------------------
// Entrada al plan: la quincena como requisito de saldo
// --------------------------------------------------------------------------

test('crear el plan exige saldo para UNA quincena; no debita nada', async () => {
  const sinSaldo = crearEntorno({ saldo: 10 });
  const rechazo = await sinSaldo.servicio.createSubscription(PASAJERO, cuerpoLV());
  assert.equal(rechazo.ok, false);
  assert.equal(rechazo.status, 402);
  assert.equal(rechazo.code, 'INSUFFICIENT_WALLET_BALANCE');
  // L-V (5 días) × ida+vuelta (2) × 2 semanas × $1.20 = $24.00
  assert.equal(rechazo.required, 24);
  assert.equal(rechazo.balance, 10);

  const conSaldo = crearEntorno({ saldo: 24 });
  const alta = await conSaldo.servicio.createSubscription(PASAJERO, cuerpoLV());
  assert.equal(alta.ok, true);
  assert.equal(conSaldo.database.users[0].walletBalance, 24, 'la entrada NO debita: se cobra por carrera');
  // Solo ida: la quincena cuesta la mitad.
  const solaIda = crearEntorno({ saldo: 11 });
  const cuerpo = cuerpoLV({ pattern: { weekdays: [1, 2, 3, 4, 5], outbound: { time: '07:00' }, timezone: 'America/Caracas' } });
  assert.equal((await solaIda.servicio.createSubscription(PASAJERO, cuerpo)).ok, false);
  solaIda.database.users[0].walletBalance = 12;
  assert.equal((await solaIda.servicio.createSubscription(PASAJERO, cuerpo)).ok, true);
});

test('con la facturacion APAGADA nada de esto existe: entra sin saldo (compatibilidad piloto)', async () => {
  const { servicio } = crearEntorno({ billing: false, saldo: 0 });
  assert.equal((await servicio.createSubscription(PASAJERO, cuerpoLV())).ok, true);
});

// --------------------------------------------------------------------------
// La carrera: tarifa fija, wallet y cero deuda
// --------------------------------------------------------------------------

async function llevarHastaHandoff(entorno, { conductor = true } = {}) {
  const cuerpo = cuerpoLV({ pattern: { weekdays: [1], outbound: { time: '07:00' }, timezone: 'America/Caracas' } });
  const alta = await entorno.servicio.createSubscription(PASAJERO, cuerpo);
  assert.equal(alta.ok, true);
  await entorno.servicio.runSafeTransportCoverage();
  const ride = entorno.database.scheduledRides[0];
  if (conductor) {
    const driver = entorno.database.users.find(u => u.id === 'drv_a');
    assert.equal((await entorno.servicio.acceptScheduledRide(driver, ride.id)).ok, true);
  }
  entorno.reloj.ms = RECOGIDA + MIN;
  return ride;
}

test('la carrera nace en WALLET con la tarifa FIJA de su categoria y el % del plan', async () => {
  const entorno = crearEntorno({ saldo: 30, pricing: { perRide: { MOTO: 1.5, CAR: 2.5 }, platformFeeRate: 0.25 } });
  await llevarHastaHandoff(entorno);
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.coveredHandoffs, 1);
  const trip = entorno.database.trips[0];
  assert.equal(trip.paymentMethod, 'WALLET');
  assert.equal(trip.fareUSD, 1.5, 'la tarifa del admin, no el taximetro');
  assert.equal(trip.fareSource, 'SUBSCRIPTION_FIXED');
  assert.equal(trip.commissionRate, 0.25, 'el % del plan viaja EN el viaje');
});

test('sin saldo para la carrera: el viaje NO nace, la ocurrencia muere con motivo y el plan se suspende', async () => {
  const entorno = crearEntorno({ saldo: 30 });
  const ride = await llevarHastaHandoff(entorno);
  // La clienta gastó su saldo antes de la hora.
  entorno.database.users[0].walletBalance = 0.5;

  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.billingSuspended, 1);
  assert.equal(entorno.database.trips.length, 0, 'CERO deuda: el viaje no existe');
  assert.equal(ride.serviceStatus, 'CANCELLED_INSUFFICIENT_BALANCE');
  const sub = entorno.database.transportSubscriptions[0];
  assert.equal(sub.status, 'SUSPENDED_PAYMENT');
  const avisos = entorno.database.notifications.filter(n =>
    n.userId === 'p1' && n.event === 'subscription_suspended_payment');
  assert.equal(avisos.length, 1, 'aviso honesto con la salida clara');
  // El conductor COMPROMETIDO también se entera (cierre 2B): su recogida no
  // ocurrirá y no debe seguir esperándola — con motivo genérico, sin saldo
  // ni ningún detalle financiero de la clienta.
  const avisosConductor = entorno.database.notifications.filter(n =>
    n.userId === 'drv_a' && n.event === 'scheduled_ride_cancelled');
  assert.equal(avisosConductor.length, 1, 'el conductor comprometido recibe el aviso');
  assert.match(avisosConductor[0].message, /fue cancelado/);
  assert.doesNotMatch(`${avisosConductor[0].title} ${avisosConductor[0].message}`, /saldo|wallet|billetera|\$/i,
    'jamás detalles financieros de la clienta hacia el conductor');
  // Y desaparece de su agenda de compromisos.
  const driver = entorno.database.users.find(u => u.id === 'drv_a');
  assert.equal(entorno.servicio.listDriverCommitments(driver).length, 0);
  // Estable: repetir la pasada no duplica nada.
  await entorno.servicio.runSafeTransportHandoff();
  assert.equal(entorno.database.notifications.filter(n => n.event === 'subscription_suspended_payment').length, 1);
  assert.equal(entorno.database.notifications.filter(n => n.event === 'scheduled_ride_cancelled').length, 1);
  assert.equal(entorno.database.trips.length, 0);
});

test('la quincena usa la agenda REAL: dias elegidos x tramos x 2 semanas (jamas 20 fijo)', async () => {
  // 3 días ida+vuelta: 3 × 2 × 2 × $1.20 = $14.40
  const tresDias = crearEntorno({ saldo: 14 });
  const cuerpo = cuerpoLV({ pattern: { weekdays: [1, 3, 5], outbound: { time: '07:00' }, return: { time: '17:00' }, timezone: 'America/Caracas' } });
  const rechazo = await tresDias.servicio.createSubscription(PASAJERO, cuerpo);
  assert.equal(rechazo.ok, false);
  assert.equal(rechazo.required, 14.4);
  tresDias.database.users[0].walletBalance = 14.4;
  assert.equal((await tresDias.servicio.createSubscription(PASAJERO, cuerpo)).ok, true);
  assert.equal(tresDias.database.users[0].walletBalance, 14.4, 'la entrada sigue sin debitar');
});

test('reanudar desde la suspension exige saldo de quincena; con saldo, vuelve a ACTIVE', async () => {
  const entorno = crearEntorno({ saldo: 30 });
  await llevarHastaHandoff(entorno);
  entorno.database.users[0].walletBalance = 0;
  await entorno.servicio.runSafeTransportHandoff(); // suspende
  const sub = entorno.database.transportSubscriptions[0];
  assert.equal(sub.status, 'SUSPENDED_PAYMENT');

  const sinSaldo = await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'ACTIVE');
  assert.equal(sinSaldo.status, 402);
  assert.equal(sinSaldo.code, 'INSUFFICIENT_WALLET_BALANCE');

  entorno.database.users[0].walletBalance = 50; // recargó
  const reanudar = await entorno.servicio.setSubscriptionStatus(PASAJERO, sub.id, 'ACTIVE');
  assert.equal(reanudar.ok, true);
  assert.equal(sub.status, 'ACTIVE');
  assert.equal(entorno.database.users[0].walletBalance, 50, 'reanudar TAMPOCO debita: solo verifica saldo');
  // Y desde la suspensión también puede cancelar del todo.
  const otra = crearEntorno({ saldo: 30 });
  await llevarHastaHandoff(otra);
  otra.database.users[0].walletBalance = 0;
  await otra.servicio.runSafeTransportHandoff();
  assert.equal((await otra.servicio.setSubscriptionStatus(PASAJERO, otra.database.transportSubscriptions[0].id, 'CANCELLED')).ok, true);
});

test('el contador del plan: ridesUsed sube EXACTAMENTE una vez por carrera completada', async () => {
  const entorno = crearEntorno({ saldo: 30 });
  await llevarHastaHandoff(entorno);
  await entorno.servicio.runSafeTransportHandoff();
  const sub = entorno.database.transportSubscriptions[0];
  assert.equal(sub.plan.ridesUsed, 0);

  entorno.database.trips[0].status = 'COMPLETED';
  await entorno.servicio.runSafeTransportHandoff();
  assert.equal(sub.plan.ridesUsed, 1, 'una carrera realizada');
  await entorno.servicio.runSafeTransportHandoff();
  await entorno.servicio.runSafeTransportHandoff();
  assert.equal(sub.plan.ridesUsed, 1, 'idempotente: jamas doble conteo');
});

test('el rescate sin conductor comprometido cobra IGUAL: misma wallet, misma tarifa', async () => {
  const entorno = crearEntorno({ saldo: 30 });
  await llevarHastaHandoff(entorno, { conductor: false });
  const resumen = await entorno.servicio.runSafeTransportHandoff();
  assert.equal(resumen.fallbackHandoffs, 1);
  const trip = entorno.database.trips[0];
  assert.equal(trip.status, 'SEARCHING');
  assert.equal(trip.paymentMethod, 'WALLET');
  assert.equal(trip.fareUSD, DEFAULT_SAFE_TRANSPORT_PRICING.perRide.MOTO);
  assert.equal(trip.commissionRate, DEFAULT_SAFE_TRANSPORT_PRICING.platformFeeRate,
    'el rescate lleva el MISMO % del plan, lo tome quien lo tome');
});

test('la tarifa se toma de la config VIGENTE en el T-0 (politica: precio actual al handoff)', async () => {
  // El plan nace con la moto a $1.20; el admin la sube ANTES del T-0.
  const config = { valor: { perRide: { MOTO: 1.2, CAR: 2 }, platformFeeRate: 0.2 } };
  const database = {
    users: [
      { id: 'p1', role: 'passenger', firstName: 'Ana', walletBalance: 30 },
      { id: 'drv_a', role: 'driver', isVerified: true, status: 'AVAILABLE', accountStatus: 'ACTIVE', acceptsScheduledRides: true, vehicleType: 'MOTO', firstName: 'Conductor', lastName: 'A' }
    ],
    transportSubscriptions: [], scheduledRides: [], notifications: [], trips: []
  };
  const reloj = { ms: LUNES };
  const bridge = {
    findTripForRide: ride => database.trips.find(t => t.scheduledRideId === ride.id) ?? null,
    driverById: id => database.users.find(u => u.id === id && u.role === 'driver') ?? null,
    driverHasActiveTrip: () => false,
    tripStatusOf: tripId => database.trips.find(t => t.id === tripId)?.status ?? null,
    async createTripForRide({ ride, driver = null }) {
      const vigente = config.valor; // como el puente real: getEffectivePricing() en el T-0
      const trip = {
        id: `trip_sched_${ride.id}`, scheduledRideId: ride.id,
        passengerId: ride.passengerId, driverId: driver?.id ?? null,
        status: driver ? 'DRIVER_ASSIGNED' : 'SEARCHING',
        paymentMethod: 'WALLET',
        fareUSD: vigente.perRide[ride.vehiclePreference === 'CAR' ? 'CAR' : 'MOTO'],
        fareSource: 'SUBSCRIPTION_FIXED',
        commissionRate: vigente.platformFeeRate
      };
      database.trips.push(trip);
      return { ok: true, trip };
    },
    async announceAssignedTrip() {},
    dispatchTrip: () => {}
  };
  const servicio = createSafeTransportService({
    database, persistRecord: async () => true, tripBridge: bridge,
    enabled: true, pilotUserIds: resolvePilotUserIds('*'), billingEnabled: true,
    getPricing: () => config.valor, now: () => reloj.ms, logger: silencioso
  });
  const cuerpo = cuerpoLV({ pattern: { weekdays: [1], outbound: { time: '07:00' }, timezone: 'America/Caracas' } });
  assert.equal((await servicio.createSubscription(PASAJERO, cuerpo)).ok, true);
  await servicio.runSafeTransportCoverage();
  const driver = database.users.find(u => u.id === 'drv_a');
  assert.equal((await servicio.acceptScheduledRide(driver, database.scheduledRides[0].id)).ok, true);

  config.valor = { perRide: { MOTO: 1.5, CAR: 2 }, platformFeeRate: 0.2 }; // el admin sube el precio
  reloj.ms = RECOGIDA + MIN;
  await servicio.runSafeTransportHandoff();
  assert.equal(database.trips[0].fareUSD, 1.5, 'rige el precio VIGENTE al handoff, no el del alta');
});
