import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPostgresPersistence, createPostgresPool } from '../services/postgresPersistence.js';
import { createDriverFinanceStore } from '../services/driverFinanceStore.js';
import { canTakeNewWork } from '../domain/driverFinance.js';

/**
 * DRIVER-FINANCE-1 v6 — el dinero que entra y sale, exactamente una vez.
 *
 * La quinta auditoría encontró que un crédito o un débito cuyo COMMIT entraba
 * y cuya confirmación se perdía volvía a mover el dinero al reintentarse:
 *
 *   1.00 + 2.00 → 3.00 → reintento → 5.00
 *   10.00 − 2.00 → 8.00 → reintento → 6.00
 *
 * La reserva de comisión ya tenía su testigo —el viaje— y el mantenimiento el
 * suyo —el periodo—, pero una recarga o un retiro eran anónimos. Ahora cada
 * operación externa trae su identidad, y esa identidad es clave primaria.
 *
 * Y la segunda mitad del fichero cubre la carrera del reconciliador: decidía
 * con el estado del viaje leído SIN cerrojo, y podía quitarle la reserva a una
 * carrera que mientras tanto había arrancado de verdad.
 *
 * Todo contra la base indicada en `TEST_DATABASE_URL` (nunca producción).
 */

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };

const sufijo = () => `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
const POLITICA = { canTakeNewWork: s => canTakeNewWork(s, { enabled: true }) };
const SUELO = -5;
const silencioso = { error() {}, warn() {}, log() {} };

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

async function montar() {
  const pool = createPostgresPool({ connectionString });
  const dbA = baseVacia();
  const a = await createPostgresPersistence({ pool, database: dbA, logger: silencioso });
  assert.equal(a.financeReady, true, 'el libro contable debe estar migrado en la base de pruebas');
  return { pool, dbA, a };
}

const leerSaldo = async (pool, id) => {
  const { rows } = await pool.query(
    `select (payload->>'walletBalance')::numeric as saldo from public.users where id = $1`, [id]);
  return rows.length ? Number(rows[0].saldo) : null;
};
const leerEstado = async (pool, id) => {
  const { rows } = await pool.query(
    `select wallet_balance_usd from public.driver_finance_state where driver_id = $1`, [id]);
  return rows.length ? Number(rows[0].wallet_balance_usd) : null;
};
const contarOperaciones = async (pool, operationId) => {
  const { rows } = await pool.query(
    `select count(*)::int as n from public.driver_money_operations where operation_id = $1`, [operationId]);
  return rows[0].n;
};
const leerReserva = async (pool, tripId) => {
  const { rows } = await pool.query(
    `select status from public.driver_commission_reservations where trip_id = $1`, [tripId]);
  return rows[0]?.status ?? null;
};

async function altaConductor(a, dbA, extra = {}) {
  const id = `drv_v6_${sufijo()}`;
  const doc = conductor(id, extra);
  dbA.users.push(doc);
  assert.equal(await a.persistRecord('users', doc), true);
  await a.ensureDriverFinanceState({ driver: doc, maintenanceAnchorAt: Date.now(), activityAnchorAt: Date.now() });
  return { id, doc };
}

async function crearPasajero(a, dbA) {
  const id = `psg_v6_${sufijo()}`;
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

const CONSTRUCTORES = driverId => ({
  settlement: ({ applied, deferred, balanceAfter }) => ({
    id: `transaction_${crypto.randomUUID()}`, userId: driverId, type: 'PLATFORM_COMMISSION',
    amount: -applied, commissionApplied: applied, commissionDeferred: deferred,
    currency: 'USD', status: 'APPROVED', balanceAfter, createdAt: new Date().toISOString()
  }),
  maintenance: ({ period, balanceAfter }) => ({
    id: `transaction_maint_${driverId}_${period}`, userId: driverId,
    type: 'DRIVER_ACCOUNT_MAINTENANCE', maintenancePeriod: period, amount: -1,
    currency: 'USD', status: 'APPROVED', balanceAfter, createdAt: new Date().toISOString()
  }),
  deferred: ({ paid, balanceAfter }) => ({
    id: `transaction_${crypto.randomUUID()}`, userId: driverId,
    type: 'DRIVER_DEFERRED_COMMISSION_PAYMENT', amount: -paid,
    currency: 'USD', status: 'APPROVED', balanceAfter, createdAt: new Date().toISOString()
  })
});

/**
 * Un pozo de conexiones idéntico al real salvo por el desenlace del COMMIT.
 *
 *   'CONFIRMA_Y_PIERDE' → la transacción SÍ entra y la respuesta se pierde.
 *                          Es el caso peligroso: la base ya cambió.
 *   'RECHAZA'           → el COMMIT falla de verdad; nada entró.
 *
 * Solo se sabotea el PRIMER commit: el reintento se comporta con normalidad.
 */
function poolConCommitSaboteado(pool, modo) {
  let saboteado = false;
  return {
    connect: async () => {
      const client = await pool.connect();
      const original = client.query.bind(client);
      client.query = async (texto, valores) => {
        if (!saboteado && typeof texto === 'string' && texto.trim().toLowerCase() === 'commit') {
          saboteado = true;
          if (modo === 'CONFIRMA_Y_PIERDE') await original('commit');
          else await original('rollback');
          throw new Error('conexión perdida al confirmar');
        }
        return original(texto, valores);
      };
      const soltar = client.release.bind(client);
      client.release = (...args) => { delete client.query; return soltar(...args); };
      return client;
    },
    query: (...args) => pool.query(...args)
  };
}

// ==========================================================================
// §4 · el crédito confirmado cuya confirmación se pierde
// ==========================================================================

test('§4 · un crédito confirmado y no acusado NO se aplica dos veces al reintentar', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  const operacion = `audit-credit-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    const saboteado = createDriverFinanceStore({
      pool: poolConCommitSaboteado(pool, 'CONFIRMA_Y_PIERDE'), logger: silencioso
    });
    const primero = await saboteado.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, builders: CONSTRUCTORES(id)
    });
    // La implementación resuelve la duda leyendo el testigo: entró.
    assert.ok(['CREDITED', 'AMBIGUOUS'].includes(primero.outcome), `desenlace inesperado: ${primero.outcome}`);
    assert.equal(await leerEstado(pool, id), 3, 'el dinero SÍ entró');

    // Y ahora el reintento, con la MISMA identidad.
    const reintento = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, builders: CONSTRUCTORES(id)
    });
    assert.equal(reintento.outcome, 'ALREADY_APPLIED', 'la base recuerda que esta operación ya ocurrió');
    assert.equal(await leerEstado(pool, id), 3, 'SIGUE EN 3.00 — antes se iba a 5.00');
    assert.equal(await leerSaldo(pool, id), 3, 'y el documento lo refleja');
    assert.equal(await contarOperaciones(pool, operacion), 1, 'un solo testigo');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// §5 · el débito confirmado cuya confirmación se pierde
// ==========================================================================

test('§5 · un débito confirmado y no acusado NO se descuenta dos veces', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  const operacion = `audit-debit-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 10 }));

    const saboteado = createDriverFinanceStore({
      pool: poolConCommitSaboteado(pool, 'CONFIRMA_Y_PIERDE'), logger: silencioso
    });
    const primero = await saboteado.debitDriverWallet({ driverId: id, amountUSD: 2, operationId: operacion });
    assert.ok(['DEBITED', 'AMBIGUOUS'].includes(primero.outcome), `desenlace inesperado: ${primero.outcome}`);
    assert.equal(await leerEstado(pool, id), 8, 'el retiro SÍ salió');

    const reintento = await a.debitDriverWallet({ driverId: id, amountUSD: 2, operationId: operacion });
    assert.equal(reintento.outcome, 'ALREADY_APPLIED');
    assert.equal(await leerEstado(pool, id), 8, 'SIGUE EN 8.00 — antes se iba a 6.00');
    assert.equal(await contarOperaciones(pool, operacion), 1, 'un solo testigo');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// §6 · deshecho antes de confirmar: no hay testigo, y se aplica una vez
// ==========================================================================

test('§6 · un crédito deshecho antes de confirmar se aplica UNA vez al reintentar', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  const operacion = `audit-credit-rb-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    const saboteado = createDriverFinanceStore({
      pool: poolConCommitSaboteado(pool, 'RECHAZA'), logger: silencioso
    });
    const primero = await saboteado.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, builders: CONSTRUCTORES(id)
    });
    assert.notEqual(primero.outcome, 'CREDITED', 'no entró');
    assert.equal(await leerEstado(pool, id), 1, 'el saldo no se movió');
    assert.equal(await contarOperaciones(pool, operacion), 0, 'y no hay testigo de algo que no pasó');

    const reintento = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, builders: CONSTRUCTORES(id)
    });
    assert.equal(reintento.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 3, 'ahora sí, exactamente una vez');
    assert.equal(await contarOperaciones(pool, operacion), 1);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§6b · un débito deshecho antes de confirmar se aplica UNA vez al reintentar', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  const operacion = `audit-debit-rb-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 10 }));
    const saboteado = createDriverFinanceStore({
      pool: poolConCommitSaboteado(pool, 'RECHAZA'), logger: silencioso
    });
    const primero = await saboteado.debitDriverWallet({ driverId: id, amountUSD: 2, operationId: operacion });
    assert.notEqual(primero.outcome, 'DEBITED');
    assert.equal(await leerEstado(pool, id), 10);
    assert.equal(await contarOperaciones(pool, operacion), 0);

    assert.equal((await a.debitDriverWallet({ driverId: id, amountUSD: 2, operationId: operacion })).outcome, 'DEBITED');
    assert.equal(await leerEstado(pool, id), 8);
    assert.equal(await contarOperaciones(pool, operacion), 1);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// Nadie mueve dinero sin identidad, y dos intentos a la vez no se duplican
// ==========================================================================

test('un ingreso o un retiro SIN identidad se rechaza antes de tocar nada', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 4 }));
    const credito = await a.creditDriverWallet({ driverId: id, creditUSD: 3, builders: CONSTRUCTORES(id) });
    assert.equal(credito.outcome, 'OPERATION_ID_REQUIRED',
      'sin identidad, un reintento acreditaría otra vez: no se acepta');
    const debito = await a.debitDriverWallet({ driverId: id, amountUSD: 1 });
    assert.equal(debito.outcome, 'OPERATION_ID_REQUIRED');
    assert.equal(await leerEstado(pool, id), 4, 'y nada se movió');

    // La cobranza SIN ingreso sí puede ir sin identidad: no entra dinero, y
    // cada obligación lleva su propio testigo.
    const cobranza = await a.creditDriverWallet({ driverId: id, creditUSD: 0, builders: CONSTRUCTORES(id) });
    assert.equal(cobranza.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 4);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('dos intentos SIMULTÁNEOS de la misma operación mueven el dinero una vez', saltar, async () => {
  const pool = createPostgresPool({ connectionString });
  const dbA = baseVacia();
  const a = await createPostgresPersistence({ pool, database: dbA, logger: silencioso });
  const b = await createPostgresPersistence({ pool, database: baseVacia(), logger: silencioso });
  let id = null;
  const operacion = `audit-credit-race-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));
    const [uno, dos] = await Promise.all([
      a.creditDriverWallet({ driverId: id, creditUSD: 2, operationId: operacion, builders: CONSTRUCTORES(id) }),
      b.creditDriverWallet({ driverId: id, creditUSD: 2, operationId: operacion, builders: CONSTRUCTORES(id) })
    ]);
    const desenlaces = [uno.outcome, dos.outcome].sort();
    assert.deepEqual(desenlaces, ['ALREADY_APPLIED', 'CREDITED'], 'uno acredita, el otro reconoce');
    assert.equal(await leerEstado(pool, id), 3, 'el dinero entró una sola vez');
    assert.equal(await contarOperaciones(pool, operacion), 1);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// §15/§16/§17 · el reconciliador NO decide con la foto vieja del viaje
// ==========================================================================

/**
 * El pozo que dispara la carrera. La búsqueda de candidatos usa `pool.query`;
 * la transacción de cada reserva usa `pool.connect`. Interponiéndose en el
 * PRIMER `connect` se cambia el viaje exactamente en la ventana peligrosa:
 * después de verlo como candidato y antes de decidir sobre él.
 */
function poolQueCambiaElViajeAntesDeDecidir(pool, mutacion) {
  let hecho = false;
  return {
    connect: async () => {
      if (!hecho) { hecho = true; await mutacion(); }
      return pool.connect();
    },
    query: (...args) => pool.query(...args)
  };
}

async function prepararReservaProgramadaVencida(pool, a, dbA) {
  const { id } = await altaConductor(a, dbA, { walletBalance: 5 });
  const pasajero = await crearPasajero(a, dbA);
  const viaje = `trip_v6_${sufijo()}`;
  const ayer = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await crearViaje(pool, viaje, pasajero, { status: 'SCHEDULED', assignedDriverId: null, scheduledAt: ayer });
  assert.equal((await a.acceptTripWithReservation({
    tripId: viaje, driverId: id, commissionUSD: 0.5, floorUSD: SUELO,
    updatedAt: new Date().toISOString(), assignment: 'SCHEDULED', policy: POLITICA
  })).outcome, 'OK');
  assert.equal(await leerReserva(pool, viaje), 'RESERVED');
  return { id, pasajero, viaje };
}

test('§15 · si el traslado ARRANCÓ mientras tanto, su reserva NO se libera', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null; let viaje = null;
  try {
    ({ id, pasajero, viaje } = await prepararReservaProgramadaVencida(pool, a, dbA));

    // Es candidato: programado y vencido hace dos días. Pero entre verlo y
    // decidir sobre él, la carrera empieza de verdad.
    const almacen = createDriverFinanceStore({
      pool: poolQueCambiaElViajeAntesDeDecidir(pool, () => pool.query(
        `update public.trips set payload = payload || '{"status":"IN_PROGRESS"}'::jsonb where id = $1`, [viaje])),
      logger: silencioso
    });
    const r = await almacen.reconcileStaleReservations({ limit: 25 });

    assert.equal(await leerReserva(pool, viaje), 'RESERVED',
      'ANTES la liberaba: le quitaba el dinero comprometido a una carrera EN CURSO');
    assert.equal(r.released, 0, 'no se liberó nada');
    assert.equal(r.stillActive, 1, 'y se registra que al releer seguía viva');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje].filter(Boolean));
    await pool.end();
  }
});

test('§16 · si el traslado COMPLETÓ mientras tanto, se trata como completado', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null; let viaje = null;
  try {
    ({ id, pasajero, viaje } = await prepararReservaProgramadaVencida(pool, a, dbA));

    const almacen = createDriverFinanceStore({
      pool: poolQueCambiaElViajeAntesDeDecidir(pool, () => pool.query(
        `update public.trips set payload = payload || '{"status":"COMPLETED"}'::jsonb where id = $1`, [viaje])),
      logger: silencioso
    });
    const r = await almacen.reconcileStaleReservations({ limit: 25 });

    assert.equal(await leerReserva(pool, viaje), 'SETTLEMENT_PENDING',
      'la carrera se hizo: su dinero queda pendiente, no liberado como traslado vencido');
    assert.equal(r.pendingSettlements, 1);
    assert.equal(r.staleScheduled, 0, 'y NO se contó como traslado vencido');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje].filter(Boolean));
    await pool.end();
  }
});

test('§17 · si el traslado se CANCELÓ mientras tanto, se libera como corresponde', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null; let viaje = null;
  try {
    ({ id, pasajero, viaje } = await prepararReservaProgramadaVencida(pool, a, dbA));

    const almacen = createDriverFinanceStore({
      pool: poolQueCambiaElViajeAntesDeDecidir(pool, () => pool.query(
        `update public.trips set payload = payload || '{"status":"CANCELLED"}'::jsonb where id = $1`, [viaje])),
      logger: silencioso
    });
    const r = await almacen.reconcileStaleReservations({ limit: 25 });

    assert.equal(await leerReserva(pool, viaje), 'RELEASED', 'cancelada: la capacidad vuelve');
    assert.equal(r.released, 1);
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje].filter(Boolean));
    await pool.end();
  }
});

test('§17b · una liquidación que ocurre entremedias gana: el reconciliador no la pisa', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null; let viaje = null;
  try {
    ({ id, pasajero, viaje } = await prepararReservaProgramadaVencida(pool, a, dbA));

    // El viaje completa Y se liquida por el camino normal justo antes de que
    // el reconciliador decida.
    const almacen = createDriverFinanceStore({
      pool: poolQueCambiaElViajeAntesDeDecidir(pool, async () => {
        await pool.query(
          `update public.trips set payload = payload || '{"status":"COMPLETED"}'::jsonb where id = $1`, [viaje]);
        await a.settleTripForDriver({
          tripId: viaje, driverId: id, commissionUSD: 0.5, creditUSD: 0, builders: CONSTRUCTORES(id)
        });
      }),
      logger: silencioso
    });
    const r = await almacen.reconcileStaleReservations({ limit: 25 });

    assert.equal(await leerReserva(pool, viaje), 'SETTLED', 'la liquidación real manda');
    assert.equal(r.released, 0);
    assert.equal(r.settled, 0, 'el reconciliador encontró la reserva ya resuelta y no hizo nada');
    assert.equal(await leerEstado(pool, id), 4.5, '5.00 − 0.50, una sola vez');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje].filter(Boolean));
    await pool.end();
  }
});
