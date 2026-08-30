import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPostgresPersistence, createPostgresPool } from '../services/postgresPersistence.js';
import { createDriverFinanceStore } from '../services/driverFinanceStore.js';
import { canTakeNewWork } from '../domain/driverFinance.js';

/**
 * DRIVER-FINANCE-1 v7 — integridad del libro: identidad, semántica y dueño.
 *
 * La sexta auditoría encontró tres formas de que el dinero acabara donde no
 * debía, y ninguna era teórica:
 *
 *   · un reintento válido pagaba una obligación NUEVA sin descontar nada,
 *     porque las obligaciones se cobraban ANTES de mirar si la operación ya
 *     estaba hecha;
 *   · la misma identidad de operación se aceptaba con otro conductor, otro
 *     importe o la dirección contraria, y respondía «ya aplicado»;
 *   · una liquidación cobraba a quien dijera quien llamaba, sin comprobar de
 *     quién era realmente la carrera.
 *
 * Contra la base indicada en `TEST_DATABASE_URL` (nunca producción).
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
    `select status, driver_id from public.driver_commission_reservations where trip_id = $1`, [tripId]);
  return rows[0] ?? null;
};

async function altaConductor(a, dbA, extra = {}) {
  const id = `drv_v7_${sufijo()}`;
  const doc = conductor(id, extra);
  dbA.users.push(doc);
  assert.equal(await a.persistRecord('users', doc), true);
  await a.ensureDriverFinanceState({ driver: doc, maintenanceAnchorAt: Date.now(), activityAnchorAt: Date.now() });
  return { id, doc };
}

async function crearPasajero(a, dbA) {
  const id = `psg_v7_${sufijo()}`;
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

// ==========================================================================
// CRÍTICO · un reintento válido no toca NADA
// ==========================================================================

test('§2 · repetir una operación no cobra una obligación creada DESPUÉS', saltar, async () => {
  // La reproducción exacta de Codex. El orden importaba: se cobraban las
  // obligaciones y solo entonces se miraba si la operación ya estaba hecha.
  // Un reintento legítimo marcaba PAGADO un mantenimiento nuevo sin
  // descontarle un céntimo al conductor: la plataforma perdonaba dinero y el
  // conductor creía haber pagado.
  const { pool, dbA, a } = await montar();
  let id = null;
  const operacion = `topup:auditoria-${sufijo()}`;
  const origen = { sourceType: 'TOPUP', sourceId: operacion };
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 10 }));

    // A) política APAGADA, crédito de 2.00 → 12.00
    const primero = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, ...origen,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(primero.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 12);

    // B) DESPUÉS aparece un mantenimiento vencido, y la política se enciende.
    await pool.query(
      `insert into public.driver_maintenance_obligations (id, driver_id, period, amount_usd, status)
       values ($1, $2, 1, 1, 'DUE')`, [`driver-maintenance:${id}:1`, id]);

    // C) y llega el reintento de aquella misma operación.
    const reintento = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, ...origen,
      policyEnabled: true, builders: CONSTRUCTORES(id)
    });

    assert.equal(reintento.outcome, 'ALREADY_APPLIED');
    assert.equal(await leerEstado(pool, id), 12, 'el saldo no se movió');
    const { rows } = await pool.query(
      `select status, transaction_id from public.driver_maintenance_obligations
        where driver_id = $1 and period = 1`, [id]);
    assert.equal(rows[0].status, 'DUE',
      'LA OBLIGACIÓN SIGUE DEBIÉNDOSE: antes se marcaba PAGADA sin cobrar nada');
    assert.equal(rows[0].transaction_id, null, 'y sin apunte inventado');
    assert.equal(await contarOperaciones(pool, operacion), 1, 'un solo testigo');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§2b · tampoco cobra una deuda diferida creada después', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null;
  const viejo = `trip_v7_${sufijo()}`;
  const operacion = `topup:auditoria-${sufijo()}`;
  const origen = { sourceType: 'TOPUP', sourceId: operacion };
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 10 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viejo, pasajero, { status: 'COMPLETED', driverId: id });

    await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, ...origen,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    // Una comisión diferida aparece DESPUÉS.
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 0.80, 0, 0.80, 'SETTLED', now())`, [viejo, id]);

    const reintento = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, ...origen,
      policyEnabled: true, builders: CONSTRUCTORES(id)
    });
    assert.equal(reintento.outcome, 'ALREADY_APPLIED');
    assert.equal(await leerEstado(pool, id), 12);
    const { rows } = await pool.query(
      `select deferred_paid_usd from public.driver_commission_reservations where trip_id = $1`, [viejo]);
    assert.equal(Number(rows[0].deferred_paid_usd), 0, 'la deuda sigue entera');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viejo]);
    await pool.end();
  }
});

// ==========================================================================
// ALTO 1 · la misma identidad con otra semántica es un CONFLICTO
// ==========================================================================

test('§5/§7/§8 · reutilizar la identidad con otro importe, dirección u origen falla cerrado', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  const operacion = `topup:auditoria-${sufijo()}`;
  // v8 · el origen de negocio es UNICO en la base, asi que tiene que ser
  // propio de esta ejecucion, igual que la identidad de la operacion.
  const solicitud = `topup-${sufijo()}`;
  const origen = { sourceType: 'TOPUP', sourceId: solicitud };
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));
    assert.equal((await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, ...origen, builders: CONSTRUCTORES(id)
    })).outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 3);

    // Otro IMPORTE.
    const otroImporte = await a.creditDriverWallet({
      driverId: id, creditUSD: 9, operationId: operacion, ...origen, builders: CONSTRUCTORES(id)
    });
    assert.equal(otroImporte.outcome, 'OPERATION_ID_CONFLICT', 'antes respondía ALREADY_APPLIED');

    // Otra DIRECCIÓN.
    const otraDireccion = await a.debitDriverWallet({
      driverId: id, amountUSD: 2, operationId: operacion, ...origen
    });
    assert.equal(otraDireccion.outcome, 'OPERATION_ID_CONFLICT');

    // Otro ORIGEN, misma cantidad y dirección.
    const otroOrigen = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion,
      sourceType: 'PAYOUT', sourceId: solicitud, builders: CONSTRUCTORES(id)
    });
    assert.equal(otroOrigen.outcome, 'OPERATION_ID_CONFLICT');

    // Otro IDENTIFICADOR de origen.
    const otroIdentificador = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion,
      sourceType: 'TOPUP', sourceId: `otro-${solicitud}`, builders: CONSTRUCTORES(id)
    });
    assert.equal(otroIdentificador.outcome, 'OPERATION_ID_CONFLICT');

    assert.equal(await leerEstado(pool, id), 3, 'y el saldo no se movió en ninguno de los cuatro');
    assert.equal(await contarOperaciones(pool, operacion), 1);

    // Y la repetición EXACTA sí se reconoce.
    const exacta = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion, ...origen, builders: CONSTRUCTORES(id)
    });
    assert.equal(exacta.outcome, 'ALREADY_APPLIED');
    assert.equal(await leerEstado(pool, id), 3);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§6 · la misma identidad para OTRO conductor no toca a ninguno de los dos', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let uno = null; let dos = null;
  const operacion = `topup:auditoria-${sufijo()}`;
  const origen = { sourceType: 'TOPUP', sourceId: `topup-${sufijo()}` };
  try {
    ({ id: uno } = await altaConductor(a, dbA, { walletBalance: 1 }));
    ({ id: dos } = await altaConductor(a, dbA, { walletBalance: 10 }));

    assert.equal((await a.creditDriverWallet({
      driverId: uno, creditUSD: 2, operationId: operacion, ...origen, builders: CONSTRUCTORES(uno)
    })).outcome, 'CREDITED');

    const ajeno = await a.creditDriverWallet({
      driverId: dos, creditUSD: 2, operationId: operacion, ...origen, builders: CONSTRUCTORES(dos)
    });
    assert.equal(ajeno.outcome, 'OPERATION_ID_CONFLICT', 'el dinero de uno no puede acreditarse al otro');
    assert.equal(await leerEstado(pool, uno), 3, 'el primero, intacto');
    assert.equal(await leerEstado(pool, dos), 10, 'el segundo, intacto');
  } finally {
    await limpiar(pool, [uno, dos].filter(Boolean));
    await pool.end();
  }
});

test('§9 · un testigo LEGADO, sin origen conocido, nunca autoriza un duplicado', saltar, async () => {
  // Lo que existiera antes de que estos campos existieran no se puede
  // verificar. Inventarle un origen sería mentir; darlo por bueno sería
  // arriesgar dinero. Se falla cerrado.
  const { pool, dbA, a } = await montar();
  let id = null;
  const operacion = `topup:legado-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 5 }));
    // v8 · un testigo legado NO se puede insertar: la base lo prohíbe, porque
    // una operación nueva sin origen conocido sería irrecuperable. La única
    // forma de que exista uno es la que lo creó de verdad —el relleno de la
    // migración, que es un UPDATE— y así se reproduce aquí.
    await pool.query(
      `insert into public.driver_money_operations
         (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
       values ($1, $2, 'CREDIT', 2, 7, 'TOPUP', $1)`, [operacion, id]);
    await pool.query(
      `update public.driver_money_operations set source_type = 'LEGACY_UNKNOWN'
        where operation_id = $1`, [operacion]);

    const r = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion,
      sourceType: 'TOPUP', sourceId: operacion, builders: CONSTRUCTORES(id)
    });
    assert.equal(r.outcome, 'OPERATION_ID_CONFLICT');
    assert.equal(await leerEstado(pool, id), 5, 'sin tocar el saldo');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§9b · el resolutor de COMMIT incierto también compara la semántica', saltar, async () => {
  // El commit entra pero su respuesta se pierde. Al preguntarle a la base, no
  // basta con «existe esa identidad»: tiene que ser LA MISMA operación.
  const pool = createPostgresPool({ connectionString });
  const dbA = baseVacia();
  const a = await createPostgresPersistence({ pool, database: dbA, logger: silencioso });
  let id = null;
  const operacion = `topup:auditoria-${sufijo()}`;
  // v8 · propio de esta ejecución: el origen es único en la base.
  const ajeno = `topup-ajeno-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));
    // Ya existe una operación con esa identidad, pero de OTRO importe.
    await pool.query(
      `insert into public.driver_money_operations
         (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
       values ($1, $2, 'CREDIT', 99, 100, 'TOPUP', $3)`, [operacion, id, ajeno]);

    const poolSaboteado = {
      connect: async () => {
        const client = await pool.connect();
        const original = client.query.bind(client);
        client.query = async (texto, valores) => {
          if (typeof texto === 'string' && texto.trim().toLowerCase() === 'commit') {
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
    const almacen = createDriverFinanceStore({ pool: poolSaboteado, logger: silencioso });
    const r = await almacen.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: operacion,
      sourceType: 'TOPUP', sourceId: ajeno, builders: CONSTRUCTORES(id)
    });
    // La transacción aborta al ver el testigo ajeno, así que ni llega al
    // commit: el desenlace es el conflicto, nunca «ya aplicado».
    assert.equal(r.outcome, 'OPERATION_ID_CONFLICT');
    assert.equal(await leerEstado(pool, id), 1, 'el saldo no se movió');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// ALTO 2 · de quién es la carrera lo dice la BASE
// ==========================================================================

async function prepararCarreraDe(pool, a, dbA, saldo) {
  const { id } = await altaConductor(a, dbA, { walletBalance: saldo });
  const pasajero = await crearPasajero(a, dbA);
  const viaje = `trip_v7_${sufijo()}`;
  await crearViaje(pool, viaje, pasajero);
  assert.equal((await a.acceptTripWithReservation({
    tripId: viaje, driverId: id, commissionUSD: 0.5, floorUSD: SUELO,
    updatedAt: new Date().toISOString(), policy: POLITICA
  })).outcome, 'OK');
  await pool.query(
    `update public.trips set payload = payload || '{"status":"COMPLETED"}'::jsonb where id = $1`, [viaje]);
  return { id, pasajero, viaje };
}

test('§15 · liquidar la carrera de UNO cobrándosela a OTRO se rechaza', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let uno = null; let dos = null; let pasajero = null; let viaje = null;
  try {
    ({ id: uno, pasajero, viaje } = await prepararCarreraDe(pool, a, dbA, 5));
    ({ id: dos } = await altaConductor(a, dbA, { walletBalance: 10 }));

    const r = await a.settleTripForDriver({
      tripId: viaje, driverId: dos, commissionUSD: 0.5, creditUSD: 0, builders: CONSTRUCTORES(dos)
    });

    assert.equal(r.outcome, 'OWNERSHIP_MISMATCH',
      'ANTES devolvía SETTLED y le cobraba la comisión al conductor equivocado');
    const reserva = await leerReserva(pool, viaje);
    assert.equal(reserva.status, 'RESERVED', 'la reserva no se tocó');
    assert.equal(reserva.driver_id, uno, 'y sigue siendo de quien hizo la carrera');
    assert.equal(await leerEstado(pool, uno), 5, 'el dueño, intacto');
    assert.equal(await leerEstado(pool, dos), 10, 'el ajeno, intacto');
  } finally {
    await limpiar(pool, [uno, dos, pasajero].filter(Boolean), [viaje].filter(Boolean));
    await pool.end();
  }
});

test('§17 · si el VIAJE se reasignó, la liquidación del dueño anterior se rechaza', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let uno = null; let dos = null; let pasajero = null; let viaje = null;
  try {
    ({ id: uno, pasajero, viaje } = await prepararCarreraDe(pool, a, dbA, 5));
    ({ id: dos } = await altaConductor(a, dbA, { walletBalance: 10 }));
    // El viaje pasa a otro conductor, pero la reserva sigue siendo del primero.
    await pool.query(
      `update public.trips set payload = payload || jsonb_build_object('driverId', $2::text) where id = $1`,
      [viaje, dos]);

    const r = await a.settleTripForDriver({
      tripId: viaje, driverId: uno, commissionUSD: 0.5, creditUSD: 0, builders: CONSTRUCTORES(uno)
    });
    assert.equal(r.outcome, 'OWNERSHIP_MISMATCH', 'la reserva y el viaje discrepan: no se cobra a nadie');
    assert.equal((await leerReserva(pool, viaje)).status, 'RESERVED');
    assert.equal(await leerEstado(pool, uno), 5);
    assert.equal(await leerEstado(pool, dos), 10);
  } finally {
    await limpiar(pool, [uno, dos, pasajero].filter(Boolean), [viaje].filter(Boolean));
    await pool.end();
  }
});

test('§17b · con dueño correcto, la liquidación sigue funcionando igual', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null; let viaje = null;
  try {
    ({ id, pasajero, viaje } = await prepararCarreraDe(pool, a, dbA, 5));
    const r = await a.settleTripForDriver({
      tripId: viaje, driverId: id, commissionUSD: 0.5, creditUSD: 0, builders: CONSTRUCTORES(id)
    });
    assert.equal(r.outcome, 'SETTLED');
    assert.equal(r.applied, 0.5);
    assert.equal(await leerEstado(pool, id), 4.5, '5.00 − 0.50');
    assert.equal((await leerReserva(pool, viaje)).status, 'SETTLED');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje].filter(Boolean));
    await pool.end();
  }
});

test('§17c · una reasignación SIMULTÁNEA no consigue colar una liquidación ajena', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let uno = null; let dos = null; let pasajero = null; let viaje = null;
  try {
    ({ id: uno, pasajero, viaje } = await prepararCarreraDe(pool, a, dbA, 5));
    ({ id: dos } = await altaConductor(a, dbA, { walletBalance: 10 }));

    const [propia, ajena] = await Promise.all([
      a.settleTripForDriver({ tripId: viaje, driverId: uno, commissionUSD: 0.5, creditUSD: 0, builders: CONSTRUCTORES(uno) }),
      a.settleTripForDriver({ tripId: viaje, driverId: dos, commissionUSD: 0.5, creditUSD: 0, builders: CONSTRUCTORES(dos) })
    ]);

    assert.equal(propia.outcome, 'SETTLED', 'la del dueño entra');
    assert.equal(ajena.outcome, 'OWNERSHIP_MISMATCH', 'la ajena se rechaza, pase lo que pase con el orden');
    assert.equal(await leerEstado(pool, uno), 4.5);
    assert.equal(await leerEstado(pool, dos), 10, 'al ajeno no se le tocó un céntimo');
  } finally {
    await limpiar(pool, [uno, dos, pasajero].filter(Boolean), [viaje].filter(Boolean));
    await pool.end();
  }
});
