import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPostgresPersistence, createPostgresPool } from '../services/postgresPersistence.js';
import { canTakeNewWork } from '../domain/driverFinance.js';

/**
 * DRIVER-FINANCE-1 v4 — las garantías financieras contra PostgreSQL REAL.
 *
 * POR QUÉ ESTE FICHERO ES EL ÚNICO QUE PUEDE PROBARLAS
 * ---------------------------------------------------
 * La segunda auditoría demostró que SQLite no sirve aquí: sus dobles conceden
 * siempre la reserva y no tienen actualizaciones condicionales, así que
 * enmascaran justo los fallos que importan. Y la tercera demostró algo peor —
 * que probar la primitiva SQL sin probar la ESCRITURA DEL DOCUMENTO que la
 * rodea daba confianza falsa: el cobro era correcto y una escritura obsoleta
 * lo revertía. Por eso casi todas estas pruebas terminan igual: haciendo la
 * operación correcta y luego persistiendo un documento viejo, para comprobar
 * que el resultado durable NO se mueve.
 *
 * ESTADO: se ejecutan contra la base de PRUEBAS indicada en
 * `TEST_DATABASE_URL` (nunca producción: el destino se verifica antes de
 * escribir). Sin esa variable se saltan, y mientras se salten no puede
 * afirmarse que las garantías estén probadas.
 *
 * Nota de red: en el equipo donde se escribieron, el puerto 5432 del pooler
 * está bloqueado y solo responde el 6543.
 */

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };

const DIA_MS = 24 * 60 * 60 * 1000;
const sufijo = () => `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
const POLITICA = { canTakeNewWork: instantanea => canTakeNewWork(instantanea, { enabled: true }) };
const SUELO = -5;

/** Base en memoria mínima, con las colecciones que toca esta fase. */
function baseVacia() {
  return {
    users: [], trips: [], transactions: [], notifications: [],
    driverApplications: [], adminActions: [], settings: [], supportTickets: [],
    pushSubscriptions: [], transportSubscriptions: [], scheduledRides: [], chatMedia: []
  };
}

const conductor = (id, extra = {}) => ({
  id, role: 'driver', email: `${id}@prueba.test`, phone: `+58 400${id.slice(-7)}`,
  firstName: 'Conductor', lastName: 'Prueba', isVerified: true, status: 'AVAILABLE',
  accountStatus: 'ACTIVE', vehicleType: 'MOTO', walletBalance: 0,
  createdAt: new Date().toISOString(), ...extra
});

/** Dos persistencias independientes sobre la MISMA base: es lo más parecido
 *  a dos réplicas que se puede montar dentro de una prueba. */
async function dosReplicas() {
  const pool = createPostgresPool({ connectionString });
  const dbA = baseVacia();
  const dbB = baseVacia();
  const silencioso = { error() {}, warn() {}, log() {} };
  const a = await createPostgresPersistence({ pool, database: dbA, logger: silencioso });
  const b = await createPostgresPersistence({ pool, database: dbB, logger: silencioso });
  assert.equal(a.financeReady, true, 'el libro contable debe estar migrado en la base de pruebas');
  return { pool, dbA, dbB, a, b };
}

const leerSaldo = async (pool, id) => {
  const { rows } = await pool.query(
    `select (payload->>'walletBalance')::numeric as saldo from public.users where id = $1`, [id]);
  return rows.length ? Number(rows[0].saldo) : null;
};

const leerDocumento = async (pool, id) => {
  const { rows } = await pool.query(`select payload from public.users where id = $1`, [id]);
  return rows.length ? rows[0].payload : null;
};

const leerEstado = async (pool, id) => {
  const { rows } = await pool.query(`select * from public.driver_finance_state where driver_id = $1`, [id]);
  return rows[0] ?? null;
};

/** Alta de un conductor con su fila en el libro ya sembrada. */
async function altaConductor(pool, a, dbA, extra = {}) {
  const id = `drv_pg_${sufijo()}`;
  const doc = conductor(id, extra);
  dbA.users.push(doc);
  assert.equal(await a.persistRecord('users', doc), true);
  await a.ensureDriverFinanceState({ driver: doc, maintenanceAnchorAt: Date.now(), activityAnchorAt: Date.now() });
  return { id, doc };
}

/** Los viajes referencian a un pasajero de verdad: la base lo exige. */
async function crearPasajero(pool, a, dbA) {
  const id = `psg_pg_${sufijo()}`;
  dbA.users.push({
    id, role: 'passenger', email: `${id}@prueba.test`, phone: `+58 401${id.slice(-7)}`,
    firstName: 'Pasajera', lastName: 'Prueba', walletBalance: 0, createdAt: new Date().toISOString()
  });
  await a.persistRecord('users', dbA.users.at(-1));
  return id;
}

const crearViaje = (pool, tripId, pasajero, extra = {}) => pool.query(
  `insert into public.trips (id, payload) values ($1, $2::jsonb)`,
  [tripId, JSON.stringify({ id: tripId, status: 'SEARCHING', driverId: null, passengerId: pasajero, fareUSD: 3, ...extra })]
);

const limpiar = async (pool, ids, viajes = []) => {
  // El orden lo dictan las claves foráneas: primero lo que apunta al
  // conductor, después el conductor.
  await pool.query(`delete from public.driver_money_operations where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_inactivity_warnings where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_maintenance_obligations where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_commission_reservations where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_finance_state where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.transactions where payload->>'userId' = any($1::text[])`, [ids]);
  if (viajes.length) {
    await pool.query(`delete from public.transactions where trip_id = any($1::text[])`, [viajes]);
    await pool.query(`delete from public.driver_commission_reservations where trip_id = any($1::text[])`, [viajes]);
    await pool.query(`delete from public.trips where id = any($1::text[])`, [viajes]);
  }
  await pool.query(`delete from public.users where id = any($1::text[])`, [ids]);
};

const apunteMantenimiento = (driverId, periodo, saldo) => ({
  id: `transaction_maint_${driverId}_${periodo}`,
  userId: driverId, type: 'DRIVER_ACCOUNT_MAINTENANCE', maintenancePeriod: periodo,
  amount: -1, description: 'Mantenimiento de cuenta', currency: 'USD',
  status: 'APPROVED', balanceAfter: saldo, createdAt: new Date().toISOString()
});

const apunteDeuda = (driverId, pagado, saldo) => ({
  id: `transaction_${crypto.randomUUID()}`,
  userId: driverId, type: 'DRIVER_DEFERRED_COMMISSION_PAYMENT', amount: -pagado,
  description: 'Comisión pendiente saldada', currency: 'USD',
  status: 'APPROVED', balanceAfter: saldo, createdAt: new Date().toISOString()
});

const CONSTRUCTORES = driverId => ({
  maintenance: ({ period, balanceAfter }) => apunteMantenimiento(driverId, period, balanceAfter),
  deferred: ({ paid, balanceAfter }) => apunteDeuda(driverId, paid, balanceAfter)
});

// ==========================================================================
// A · un conductor DURABLEMENTE bloqueado no puede aceptar
// ==========================================================================

test('A · la aceptacion rechaza a quien la BASE dice que esta bloqueado', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null; const viaje = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 10 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viaje, pasajero);

    // Bloqueado en la BASE, con deuda viva. El documento del conductor sigue
    // diciendo lo que decía: es exactamente la foto vieja de una réplica.
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 0.80, 0, 0.80, 'SETTLED', now())`,
      [`deuda_${viaje}`, id]);
    assert.equal((await a.setFinancialBlock({ driverId: id, active: true })).outcome, 'BLOCKED');

    const r = await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 0.45, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    });
    assert.equal(r.outcome, 'FINANCIAL_BALANCE_BLOCK',
      'saldo positivo no basta: quedan obligaciones sin pagar');

    const { rows } = await pool.query(
      `select count(*)::int as n from public.driver_commission_reservations
        where trip_id = $1`, [viaje]);
    assert.equal(rows[0].n, 0, 'y no quedó ninguna reserva a medias');
    const { rows: viajeFila } = await pool.query(`select driver_id from public.trips where id = $1`, [viaje]);
    assert.equal(viajeFila[0].driver_id, null, 'ni el viaje quedó asignado');
  } finally {
    await pool.query(`delete from public.driver_commission_reservations where trip_id = $1`, [`deuda_${viaje}`]);
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

// ==========================================================================
// B · dos viajes concurrentes del MISMO conductor
// ==========================================================================

test('B · dos viajes concurrentes no pueden gastar la misma capacidad', saltar, async () => {
  const { pool, dbA, a, b } = await dosReplicas();
  let id = null; let pasajero = null;
  const viajeA = `trip_pg_${sufijo()}`;
  const viajeB = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: -4.5 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viajeA, pasajero);
    await crearViaje(pool, viajeB, pasajero);

    // Capacidad real: -4.50 → solo cabe $0.50. Cada viaje pide $0.40.
    const [uno, dos] = await Promise.all([
      a.acceptTripWithReservation({ tripId: viajeA, driverId: id, commissionUSD: 0.4, floorUSD: SUELO, updatedAt: new Date().toISOString(), policy: POLITICA }),
      b.acceptTripWithReservation({ tripId: viajeB, driverId: id, commissionUSD: 0.4, floorUSD: SUELO, updatedAt: new Date().toISOString(), policy: POLITICA })
    ]);
    const desenlaces = [uno.outcome, dos.outcome];
    assert.equal(desenlaces.filter(o => o === 'OK').length, 1, 'solo UNA carrera cabe');
    assert.ok(desenlaces.includes('NO_CAPACITY'), 'la otra se rechaza por capacidad');

    const { rows } = await pool.query(
      `select trip_id, status from public.driver_commission_reservations where driver_id = $1`, [id]);
    assert.equal(rows.length, 1, 'una sola reserva, con su viaje como dueño');
    assert.equal(rows[0].status, 'RESERVED');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viajeA, viajeB]);
    await pool.end();
  }
});

// ==========================================================================
// C · si algo falla DENTRO de la aceptacion, no queda nada
// ==========================================================================

test('C · un fallo dentro de la aceptacion no deja ni reserva ni asignacion', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null;
  const inexistente = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));
    // El viaje no existe: la reserva llega a insertarse y la asignación falla.
    const r = await a.acceptTripWithReservation({
      tripId: inexistente, driverId: id, commissionUSD: 0.9, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    });
    assert.equal(r.outcome, 'TRIP_TAKEN');
    assert.equal(await a.readReservedCommission(id), 0,
      'la reserva se deshizo con el resto de la transacción');
    const { rows } = await pool.query(
      `select count(*)::int as n from public.driver_commission_reservations where trip_id = $1`, [inexistente]);
    assert.equal(rows[0].n, 0, 'ni una fila huérfana');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// D · tras el commit, el estado durable ya es completo y reparable
// ==========================================================================

test('D · aceptada la carrera, un proceso que muere despues no deja nada irreparable', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null;
  const viaje = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viaje, pasajero);

    const r = await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 1.2, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    });
    assert.equal(r.outcome, 'OK');
    // Lo durable ya lo dice TODO: viaje asignado y reserva con dueño. Aunque
    // el proceso muriera aquí mismo, nadie tendría que adivinar nada.
    assert.equal(r.trip.status, 'DRIVER_ASSIGNED');
    assert.equal(r.trip.driverId, id);
    assert.equal(await a.readReservedCommission(id), 1.2);

    // El viaje se cancela y el reconciliador repara.
    await pool.query(
      `update public.trips set payload = payload || '{"status":"CANCELLED"}'::jsonb where id = $1`, [viaje]);
    const reparacion = await a.reconcileStaleReservations({ limit: 50 });
    assert.ok(reparacion.released >= 1, 'la reserva se soltó');
    assert.equal(await a.readReservedCommission(id), 0, 'y la capacidad volvió entera');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

// ==========================================================================
// E/F/G · cualquier final que no sea completar devuelve la capacidad
// ==========================================================================

test('E/F/G · cancelar libera la reserva, y repetirlo no libera dos veces', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null;
  const viaje = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viaje, pasajero);
    assert.equal((await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 1.2, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    })).outcome, 'OK');
    assert.equal(await a.readReservedCommission(id), 1.2, 'la capacidad está comprometida');

    assert.equal(await a.releaseTripReservation(viaje), true, 'se libera');
    assert.equal(await a.readReservedCommission(id), 0, 'y la capacidad vuelve entera');
    assert.equal(await a.releaseTripReservation(viaje), false, 'repetirlo no hace nada');
    assert.equal(await a.readReservedCommission(id), 0);
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

// ==========================================================================
// H · una carrera COMPLETADA con la reserva viva se repara con lo REAL
// ==========================================================================

test('H · el reconciliador cierra la reserva de una carrera completada, sin inventar cifras', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null;
  const viaje = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viaje, pasajero);
    await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 0.45, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    });

    // El proceso muere DESPUÉS de cobrar y antes de cerrar la reserva.
    await pool.query(
      `update public.trips set payload = payload || '{"status":"COMPLETED"}'::jsonb where id = $1`, [viaje]);
    const apunte = {
      id: `transaction_${crypto.randomUUID()}`, userId: id, tripId: viaje,
      type: 'PLATFORM_COMMISSION', amount: -0.3, commission: 0.45,
      commissionApplied: 0.3, commissionDeferred: 0.15, currency: 'USD',
      status: 'APPROVED', createdAt: new Date().toISOString()
    };
    await pool.query(`insert into public.transactions (id, payload) values ($1, $2::jsonb)`,
      [apunte.id, JSON.stringify(apunte)]);

    const primera = await a.reconcileStaleReservations({ limit: 50 });
    assert.equal(primera.settled, 1, 'se cierra la reserva de la carrera completada');
    const { rows } = await pool.query(
      `select status, applied_usd, deferred_usd from public.driver_commission_reservations where trip_id = $1`, [viaje]);
    assert.equal(rows[0].status, 'SETTLED');
    assert.equal(Number(rows[0].applied_usd), 0.3, 'con lo que se cobró DE VERDAD');
    assert.equal(Number(rows[0].deferred_usd), 0.15, 'y la deuda que quedó, con dueño');

    const segunda = await a.reconcileStaleReservations({ limit: 50 });
    assert.equal(segunda.settled, 0, 'y no se cierra dos veces');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

// ==========================================================================
// I · reserva sin viaje: se cuenta, no se inventa un desenlace
// ==========================================================================

test('I · una reserva cuyo viaje no existe se registra, sin conclusiones de dinero', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null;
  const viaje = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viaje, pasajero);
    await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 0.5, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    });
    // Desaparece el viaje: no debería pasar, y por eso se registra.
    await pool.query(`delete from public.trips where id = $1`, [viaje]);

    const r = await a.reconcileStaleReservations({ limit: 50 });
    assert.ok(r.orphans >= 1, 'se cuenta como huérfana');
    assert.equal(await a.readReservedCommission(id), 0.5,
      'y NO se toca: sin viaje no hay desenlace que decidir');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

// ==========================================================================
// J · el mismo mes, cobrado por dos evaluadores a la vez
// ==========================================================================

test('J · el mismo periodo mensual se cobra UNA vez con dos evaluadores', saltar, async () => {
  const { pool, dbA, a, b } = await dosReplicas();
  let id = null;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 10 }));
    const cobro = persistencia => persistencia.chargeMaintenanceObligation({
      driverId: id, period: 1,
      buildTransaction: ({ balanceAfter }) => apunteMantenimiento(id, 1, balanceAfter)
    });

    const [uno, dos] = await Promise.all([cobro(a), cobro(b)]);
    const desenlaces = [uno.outcome, dos.outcome];
    assert.equal(desenlaces.filter(o => o === 'CHARGED').length, 1, 'un solo cobro');
    assert.equal(desenlaces.filter(o => o === 'ALREADY_CHARGED').length, 1, 'el otro se retira');
    assert.equal(Number((await leerEstado(pool, id)).wallet_balance_usd), 9, 'un solo dólar descontado');
    assert.equal(await leerSaldo(pool, id), 9, 'y el documento lo refleja');

    const { rows } = await pool.query(
      `select count(*)::int as n from public.transactions where id = $1`, [`transaction_maint_${id}_1`]);
    assert.equal(rows[0].n, 1, 'un solo apunte en el libro');
    const { rows: obligacion } = await pool.query(
      `select status, paid_at, transaction_id from public.driver_maintenance_obligations
        where driver_id = $1 and period = 1`, [id]);
    assert.equal(obligacion[0].status, 'PAID');
    assert.ok(obligacion[0].paid_at, 'con constancia de cuándo');
    assert.ok(obligacion[0].transaction_id, 'y con qué apunte');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// K · LA prueba decisiva: la escritura obsoleta no revierte el cobro
// ==========================================================================

test('K · una escritura obsoleta NO devuelve el saldo cobrado', saltar, async () => {
  // La reproducción exacta de la tercera auditoría: saldo 10.00, se cobra el
  // mantenimiento y queda en 9.00, y a continuación otra réplica persiste su
  // copia vieja del documento. Antes el saldo durable volvía a 10.00. La
  // prueba oficial anterior no llegaba a mirar esto — solo contaba apuntes —
  // y por eso pasaba mientras el fallo seguía vivo.
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  let id = null;
  try {
    const alta = await altaConductor(pool, a, dbA, { walletBalance: 10 });
    id = alta.id;
    // La copia VIEJA de la otra réplica: saldo 10, sin nada cobrado.
    dbB.users.push({ ...alta.doc, walletBalance: 10 });

    const r = await a.chargeMaintenanceObligation({
      driverId: id, period: 1,
      buildTransaction: ({ balanceAfter }) => apunteMantenimiento(id, 1, balanceAfter)
    });
    assert.equal(r.outcome, 'CHARGED');
    assert.equal(await leerSaldo(pool, id), 9, 'el cobro fue correcto');

    // Y AHORA la escritura obsoleta.
    await b.persistRecord('users', dbB.users[0]);

    assert.equal(await leerSaldo(pool, id), 9,
      'EL SALDO DURABLE SIGUE COBRADO: el documento es proyección, no autoridad');
    assert.equal(Number((await leerEstado(pool, id)).wallet_balance_usd), 9);
    const { rows } = await pool.query(
      `select count(*)::int as n from public.transactions where id = $1`, [`transaction_maint_${id}_1`]);
    assert.equal(rows[0].n, 1, 'y el apunte sigue ahí, uno solo');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// L · la ganancia de una carrera normal salda primero lo que se debe
// ==========================================================================

test('L · una ganancia de billetera paga la deuda antes que el saldo libre', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null;
  const viejo = `trip_pg_${sufijo()}`;
  const nuevo = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viejo, pasajero, { status: 'COMPLETED' });
    await crearViaje(pool, nuevo, pasajero, { status: 'COMPLETED' });

    // Una carrera vieja dejó $0.80 a deber y hay un mes sin pagar.
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 0.80, 0, 0.80, 'SETTLED', now())`, [viejo, id]);
    await pool.query(
      `insert into public.driver_maintenance_obligations (id, driver_id, period, amount_usd, status)
       values ($1, $2, 1, 1, 'DUE')`, [`driver-maintenance:${id}:1`, id]);

    // Gana $2.40 en una carrera que cobró la plataforma.
    const r = await a.settleTripForDriver({
      tripId: nuevo, driverId: id, commissionUSD: 0, creditUSD: 2.4,
      builders: CONSTRUCTORES(id)
    });
    assert.equal(r.outcome, 'SETTLED');
    assert.equal(r.deferredPaid, 0.8, 'primero la comisión diferida');
    assert.deepEqual(r.maintenancePaidPeriods, [1], 'después el mantenimiento vencido');
    assert.equal(r.balanceAfter, 0.6, 'y solo lo que sobra queda libre: 2.40 − 0.80 − 1.00');
    assert.equal(await leerSaldo(pool, id), 0.6, 'el documento lo refleja');

    const { rows } = await pool.query(
      `select deferred_paid_usd from public.driver_commission_reservations where trip_id = $1`, [viejo]);
    assert.equal(Number(rows[0].deferred_paid_usd), 0.8, 'la deuda se cobró EN SU FILA, no en un total');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viejo, nuevo]);
    await pool.end();
  }
});

// ==========================================================================
// M · el Transporte Seguro paga por la MISMA puerta
// ==========================================================================

test('M · el pago del Transporte Seguro tambien pasa por la cobranza', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null;
  const viejo = `trip_pg_${sufijo()}`;
  const traslado = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viejo, pasajero, { status: 'COMPLETED' });
    await crearViaje(pool, traslado, pasajero, { status: 'COMPLETED', commissionRate: 0.2, fareUSD: 1.5 });
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 0.50, 0, 0.50, 'SETTLED', now())`, [viejo, id]);

    // 80/20 sobre $1.50: al conductor le tocan $1.20. Ni la tarifa ni el
    // reparto cambian — lo único que cambia es a dónde va ese $1.20.
    const r = await a.settleTripForDriver({
      tripId: traslado, driverId: id, commissionUSD: 0, creditUSD: 1.2,
      builders: CONSTRUCTORES(id)
    });
    assert.equal(r.deferredPaid, 0.5, 'la deuda vieja se cobra con este pago');
    assert.equal(r.balanceAfter, 0.7, '1.20 − 0.50');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viejo, traslado]);
    await pool.end();
  }
});

// ==========================================================================
// N · la recarga aprobada paga la deuda y levanta el bloqueo en el acto
// ==========================================================================

test('N · una recarga salda todo y desbloquea sin esperar al paso diario', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null;
  const viejo = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: -5 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viejo, pasajero, { status: 'COMPLETED' });
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 0.80, 0, 0.80, 'SETTLED', now())`, [viejo, id]);
    await pool.query(
      `insert into public.driver_maintenance_obligations (id, driver_id, period, amount_usd, status)
       values ($1, $2, 1, 1, 'DUE')`, [`driver-maintenance:${id}:1`, id]);
    await a.setFinancialBlock({ driverId: id, active: true });

    // El ejemplo exacto del dueño: −5.00 + 0.80 + 1.00 → $6.81 lo deja al día
    // con un céntimo de margen.
    const r = await a.creditDriverWallet({
      driverId: id, creditUSD: 6.81, operationId: `v4-recarga:${id}`, builders: CONSTRUCTORES(id) });
    assert.equal(r.outcome, 'CREDITED');
    assert.equal(r.balanceAfter, 0.01, 'exactamente un céntimo en positivo');
    assert.equal(r.deferredPaid, 0.8);
    assert.deepEqual(r.maintenancePaidPeriods, [1]);
    assert.equal(r.blockCleared, true, 'el bloqueo se levanta en el mismo acto');

    const estado = await leerEstado(pool, id);
    assert.equal(estado.block_active, false);
    const doc = await leerDocumento(pool, id);
    assert.equal(doc.financialBlock.active, false, 'y la pantalla lo ve al instante');
    assert.deepEqual(doc.maintenance.pendingPeriods, [], 'sin mantenimientos pendientes');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viejo]);
    await pool.end();
  }
});

// ==========================================================================
// O · reclamar un traslado programado cruza la MISMA puerta
// ==========================================================================

test('O · un traslado programado se le niega al bloqueado y reserva al que puede', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let deudor = null; let sano = null; let pasajero = null;
  const traslado = `trip_pg_${sufijo()}`;
  const otro = `trip_pg_${sufijo()}`;
  try {
    deudor = (await altaConductor(pool, a, dbA, { walletBalance: -5 })).id;
    sano = (await altaConductor(pool, a, dbA, { walletBalance: 3 })).id;
    pasajero = await crearPasajero(pool, a, dbA);
    for (const t of [traslado, otro]) {
      await crearViaje(pool, t, pasajero, { status: 'SCHEDULED', assignedDriverId: null });
    }

    const negado = await a.acceptTripWithReservation({
      tripId: traslado, driverId: deudor, commissionUSD: 0.45, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), assignment: 'SCHEDULED', policy: POLITICA
    });
    assert.equal(negado.outcome, 'FINANCIAL_BALANCE_BLOCK', 'con deuda no se reclama trabajo futuro');
    const { rows: sinAsignar } = await pool.query(
      `select assigned_driver_id from public.trips where id = $1`, [traslado]);
    assert.equal(sinAsignar[0].assigned_driver_id, null);

    const concedido = await a.acceptTripWithReservation({
      tripId: otro, driverId: sano, commissionUSD: 0.45, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), assignment: 'SCHEDULED', policy: POLITICA
    });
    assert.equal(concedido.outcome, 'OK');
    assert.equal(concedido.trip.status, 'SCHEDULED', 'sigue siendo un traslado programado');
    assert.equal(concedido.trip.assignedDriverId, sano);
    assert.equal(await a.readReservedCommission(sano), 0.45,
      'y su comisión proyectada queda reservada por el viaje');
  } finally {
    await limpiar(pool, [deudor, sano, pasajero].filter(Boolean), [traslado, otro]);
    await pool.end();
  }
});

// ==========================================================================
// P · dos creditos concurrentes no cobran la misma obligacion dos veces
// ==========================================================================

test('P · dos creditos simultaneos reparten sin cobrar nada dos veces', saltar, async () => {
  const { pool, dbA, a, b } = await dosReplicas();
  let id = null;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));
    for (const periodo of [1, 2]) {
      await pool.query(
        `insert into public.driver_maintenance_obligations (id, driver_id, period, amount_usd, status)
         values ($1, $2, $3, 1, 'DUE')`, [`driver-maintenance:${id}:${periodo}`, id, periodo]);
    }

    const [uno, dos] = await Promise.all([
      a.creditDriverWallet({ driverId: id, creditUSD: 1, operationId: `v4-credito-a:${id}`, sourceId: 'A', builders: CONSTRUCTORES(id) }),
      b.creditDriverWallet({ driverId: id, creditUSD: 1, operationId: `v4-credito-b:${id}`, sourceId: 'B', builders: CONSTRUCTORES(id) })
    ]);
    assert.equal(uno.outcome, 'CREDITED');
    assert.equal(dos.outcome, 'CREDITED');
    const pagados = [...uno.maintenancePaidPeriods, ...dos.maintenancePaidPeriods].sort();
    assert.deepEqual(pagados, [1, 2], 'cada mes se cobró exactamente una vez');
    assert.equal(await leerSaldo(pool, id), 0, '$2 entraron y $2 pagaron: no sobra ni falta');

    const { rows } = await pool.query(
      `select count(*)::int as n from public.driver_maintenance_obligations
        where driver_id = $1 and status = 'PAID'`, [id]);
    assert.equal(rows[0].n, 2);
    const { rows: apuntes } = await pool.query(
      `select count(*)::int as n from public.transactions
        where payload->>'userId' = $1 and payload->>'type' = 'DRIVER_ACCOUNT_MAINTENANCE'`, [id]);
    assert.equal(apuntes[0].n, 2, 'dos apuntes, ni uno más');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// Q · el ancla de estreno: dos replicas, UNA cronologia
// ==========================================================================

test('Q · dos replicas convergen en UNA sola ancla, no en la ultima escrita', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  try {
    const doc = conductor(id, { walletBalance: 0 });
    dbA.users.push(doc);
    dbB.users.push({ ...doc });
    await a.persistRecord('users', doc);

    const anclaA = Date.now();
    const anclaB = anclaA + 7 * DIA_MS;
    const [uno, dos] = await Promise.all([
      a.ensureDriverFinanceState({ driver: dbA.users[0], maintenanceAnchorAt: anclaA, activityAnchorAt: anclaA }),
      b.ensureDriverFinanceState({ driver: dbB.users[0], maintenanceAnchorAt: anclaB, activityAnchorAt: anclaB })
    ]);
    assert.equal(uno.maintenance.anchorAt, dos.maintenance.anchorAt,
      'las dos réplicas ven la MISMA ancla');
    const estado = await leerEstado(pool, id);
    assert.ok([anclaA, anclaB].includes(Number(estado.maintenance_anchor_at)));

    // Y una tercera llamada NO la mueve: es set-if-absent, no último que gana.
    const tercera = await a.ensureDriverFinanceState({
      driver: dbA.users[0], maintenanceAnchorAt: anclaB + DIA_MS, activityAnchorAt: anclaB + DIA_MS
    });
    assert.equal(tercera.maintenance.anchorAt, Number(estado.maintenance_anchor_at),
      'el ancla no se reescribe: la cronología de una cuenta no se toca');
  } finally {
    await limpiar(pool, [id]);
    await pool.end();
  }
});

// ==========================================================================
// R/S · el aviso: un solo reclamo, y el que no llega se reintenta
// ==========================================================================

test('R/S · dos replicas reclaman el mismo aviso y solo una lo manda', saltar, async () => {
  const { pool, dbA, a, b } = await dosReplicas();
  let id = null;
  const ancla = Date.now();
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: 0 }));

    const [uno, dos] = await Promise.all([
      a.claimInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 7 }),
      b.claimInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 7 })
    ]);
    assert.equal([uno, dos].filter(r => r === 'CLAIMED').length, 1, 'un solo reclamo');
    assert.equal([uno, dos].filter(r => r === 'ALREADY_CLAIMED').length, 1);

    // S · el aviso NO llega: se retira el reclamo y se puede reintentar.
    assert.equal(await a.releaseInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 7 }), true);
    assert.equal(await a.claimInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 7 }), 'CLAIMED',
      'un recordatorio perdido se reintenta');

    // Y cuando SÍ llega, queda sellado y ya no se vuelve a reclamar.
    await a.confirmInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 7 });
    assert.equal(await a.releaseInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 7 }), true);
    assert.equal(await a.claimInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 7 }), 'ALREADY_CLAIMED',
      'lo entregado no se retira');
    const doc = await leerDocumento(pool, id);
    assert.equal(doc.inactivityWarnedThreshold, 7, 'y el documento lo proyecta');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// T · NADA financiero lo revierte una escritura obsoleta
// ==========================================================================

test('T · una escritura obsoleta no revierte ninguno de los ocho estados', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  let id = null; let pasajero = null;
  const viaje = `trip_pg_${sufijo()}`;
  const completada = `trip_pg_${sufijo()}`;
  const ancla = Date.now() - 3 * DIA_MS;
  try {
    const alta = await altaConductor(pool, a, dbA, { walletBalance: 4 });
    id = alta.id;
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viaje, pasajero);
    await crearViaje(pool, completada, pasajero, { status: 'COMPLETED' });

    // LA FOTO VIEJA que va a intentar deshacerlo todo: saldo 4, sin deuda,
    // sin mantenimientos, sin bloqueo, sin avisos.
    dbB.users.push({
      ...alta.doc,
      walletBalance: 4,
      deferredCommissionUSD: 0,
      committedCommission: 0,
      maintenance: { anchorAt: ancla, lastChargedPeriod: 0, pendingPeriods: [] },
      activityAnchorAt: ancla,
      lastQualifyingTripAt: null,
      inactivityWarnedThreshold: null,
      financialBlock: { active: false }
    });

    // A · reserva de comisión
    assert.equal((await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 0.6, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    })).outcome, 'OK');
    // B · débito de mantenimiento + E · obligación pendiente (periodo 2)
    await a.chargeMaintenanceObligation({
      driverId: id, period: 1,
      buildTransaction: ({ balanceAfter }) => apunteMantenimiento(id, 1, balanceAfter)
    });
    await pool.query(
      `insert into public.driver_maintenance_obligations (id, driver_id, period, amount_usd, status)
       values ($1, $2, 2, 1, 'DUE')`, [`driver-maintenance:${id}:2`, id]);
    // C · crédito al conductor + D/E · comisión diferida con dueño
    await a.settleTripForDriver({
      tripId: completada, driverId: id, commissionUSD: 9, creditUSD: 0, builders: CONSTRUCTORES(id)
    });
    // F · bloqueo financiero
    await a.setFinancialBlock({ driverId: id, active: true });
    // G · ancla de actividad
    await a.setActivityAnchor({ driverId: id, lastQualifyingTripAt: ancla + DIA_MS });
    // H · reclamo de aviso entregado
    await a.claimInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 3 });
    await a.confirmInactivityWarning({ driverId: id, anchorAt: ancla, threshold: 3 });

    const antes = await leerDocumento(pool, id);
    const estadoAntes = await leerEstado(pool, id);

    // ===== Y AHORA la escritura obsoleta, la que lo deshacía todo =====
    await b.persistRecord('users', dbB.users[0]);

    const despues = await leerDocumento(pool, id);
    const estadoDespues = await leerEstado(pool, id);

    assert.equal(despues.walletBalance, antes.walletBalance, 'A/C · el saldo no se movió');
    assert.equal(Number(estadoDespues.wallet_balance_usd), Number(estadoAntes.wallet_balance_usd));
    assert.equal(await a.readReservedCommission(id), 0.6, 'A · la reserva sigue viva');
    assert.equal(despues.deferredCommissionUSD, antes.deferredCommissionUSD, 'E · la deuda diferida sigue');
    assert.ok(despues.deferredCommissionUSD > 0, 'y no es cero');
    assert.equal(despues.financialBlock.active, true, 'D/F · el bloqueo sigue puesto');
    assert.deepEqual(despues.maintenance.pendingPeriods, [2], 'F · el mes pendiente sigue pendiente');
    assert.equal(despues.maintenance.lastChargedPeriod, 1, 'B · lo cobrado sigue cobrado');
    assert.equal(despues.activityAnchorAt, antes.activityAnchorAt, 'G · el ancla no retrocede');
    assert.equal(despues.lastQualifyingTripAt, ancla + DIA_MS);
    assert.equal(despues.inactivityWarnedThreshold, 3, 'H · el aviso sigue reclamado');

    const { rows } = await pool.query(
      `select count(*)::int as n from public.driver_maintenance_obligations
        where driver_id = $1 and status = 'PAID'`, [id]);
    assert.equal(rows[0].n, 1, 'y la obligación pagada sigue pagada');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje, completada]);
    await pool.end();
  }
});

// ==========================================================================
// El suelo de deuda, contra la base
// ==========================================================================

test('el suelo de -$5 se respeta al liquidar, y lo que no cabe queda CON DUENO', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  let id = null; let pasajero = null;
  const viaje = `trip_pg_${sufijo()}`;
  try {
    ({ id } = await altaConductor(pool, a, dbA, { walletBalance: -4.8 }));
    pasajero = await crearPasajero(pool, a, dbA);
    await crearViaje(pool, viaje, pasajero);
    await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 0.2, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    });

    // −4.80 con comisión de 1.00: solo caben 0.20 antes del suelo.
    const r = await a.settleTripForDriver({
      tripId: viaje, driverId: id, commissionUSD: 1, creditUSD: 0, builders: CONSTRUCTORES(id)
    });
    assert.equal(r.applied, 0.2, 'lo aplicado');
    assert.equal(r.deferred, 0.8, 'y la deuda');
    assert.equal(r.balanceAfter, -5, 'jamás por debajo del suelo');
    assert.equal(await leerSaldo(pool, id), -5);

    const { rows } = await pool.query(
      `select status, reserved_usd, applied_usd, deferred_usd
         from public.driver_commission_reservations where trip_id = $1`, [viaje]);
    assert.equal(rows[0].status, 'SETTLED');
    assert.equal(Number(rows[0].deferred_usd), 0.8, 'la deuda sabe de qué carrera viene');
    assert.equal(await a.readReservedCommission(id), 0, 'ya no ocupa capacidad');

    // Liquidar dos veces no altera nada.
    const repetida = await a.settleTripForDriver({
      tripId: viaje, driverId: id, commissionUSD: 99, creditUSD: 99, builders: CONSTRUCTORES(id)
    });
    assert.equal(repetida.outcome, 'ALREADY_SETTLED');
    assert.equal(await leerSaldo(pool, id), -5, 'el saldo no se movió al repetir');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});
