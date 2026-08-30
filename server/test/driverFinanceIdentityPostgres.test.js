import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPostgresPersistence, createPostgresPool } from '../services/postgresPersistence.js';

/**
 * DRIVER-FINANCE-1 v9 — una identidad de origen tiene que ser REAL.
 *
 * La octava auditoría acreditó la misma recarga dos veces usando dos cadenas
 * de espacios distintas:
 *
 *   op-A · TOPUP / ' '    · +2.00   saldo 1.00 → 3.00
 *   op-B · TOPUP / '   '  · +2.00   saldo 3.00 → 5.00
 *
 * Las dos pasaban la comprobación de veracidad de JavaScript, las dos eran
 * claves distintas del índice único, y ninguna identificaba nada. Un hecho
 * financiero sin procedencia no es un hecho identificado.
 *
 * Este fichero cubre eso, la propiedad de una carrera cuyo dinero está
 * pendiente de cobro, y que la recuperación siga funcionando con el guardia
 * nuevo puesto.
 *
 * Todo contra la base indicada en `TEST_DATABASE_URL` (nunca producción).
 */

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };

const sufijo = () => `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
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
const contarTestigos = async (pool, driverId) => {
  const { rows } = await pool.query(
    `select count(*)::int as n from public.driver_money_operations where driver_id = $1`, [driverId]);
  return rows[0].n;
};
const leerReserva = async (pool, tripId) => {
  const { rows } = await pool.query(
    `select status, driver_id, applied_usd from public.driver_commission_reservations where trip_id = $1`,
    [tripId]);
  return rows[0] ?? null;
};
const leerDuenoDelViaje = async (pool, tripId) => {
  const { rows } = await pool.query(
    `select payload->>'driverId' as driver_id from public.trips where id = $1`, [tripId]);
  return rows[0]?.driver_id ?? null;
};

async function altaConductor(a, dbA, extra = {}) {
  const id = `drv_v9_${sufijo()}`;
  const doc = conductor(id, extra);
  dbA.users.push(doc);
  assert.equal(await a.persistRecord('users', doc), true);
  await a.ensureDriverFinanceState({ driver: doc, maintenanceAnchorAt: Date.now(), activityAnchorAt: Date.now() });
  return { id, doc };
}

async function crearPasajero(a, dbA) {
  const id = `psg_v9_${sufijo()}`;
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
  deferred: ({ paid, balanceAfter, paidTotal }) => ({
    id: `transaction_deferred_${driverId}_${Math.round(Number(paidTotal) * 100)}`, userId: driverId,
    type: 'DRIVER_DEFERRED_COMMISSION_PAYMENT', amount: -paid,
    currency: 'USD', status: 'APPROVED', balanceAfter, createdAt: new Date().toISOString()
  })
});

// ==========================================================================
// A/B · un origen que no dice nada no es un origen
// ==========================================================================

test('§5 · un origen vacío o de solo espacios se rechaza, en las cinco formas', saltar, async () => {
  // La reproducción exacta de Codex. Cinco cadenas que pasan `not null` y no
  // identifican absolutamente nada.
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    for (const [etiqueta, vacio] of [
      ['cadena vacía', ''],
      ['un espacio', ' '],
      ['tres espacios', '   '],
      ['un tabulador', '\t'],
      ['un salto de línea', '\n']
    ]) {
      const r = await a.creditDriverWallet({
        driverId: id, creditUSD: 2, operationId: `topup:vacio-${sufijo()}`,
        sourceType: 'TOPUP', sourceId: vacio,
        policyEnabled: false, builders: CONSTRUCTORES(id)
      });
      assert.equal(r.outcome, 'OPERATION_ID_REQUIRED', `${etiqueta}: no identifica nada, se rechaza`);
      assert.equal(await leerEstado(pool, id), 1, `${etiqueta}: el saldo no se movió`);
      assert.equal(await contarTestigos(pool, id), 0, `${etiqueta}: no quedó ningún testigo`);
    }

    // Y el mismo rechazo para el TIPO de origen.
    const tipoVacio = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:tipo-${sufijo()}`,
      sourceType: '  ', sourceId: 'algo-real',
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(tipoVacio.outcome, 'OPERATION_ID_REQUIRED');

    // Y un débito, por el mismo camino.
    const debito = await a.debitDriverWallet({
      driverId: id, amountUSD: 1, operationId: `withdrawal:vacio-${sufijo()}`,
      sourceType: 'WITHDRAWAL', sourceId: '   '
    });
    assert.equal(debito.outcome, 'OPERATION_ID_REQUIRED');
    assert.equal(await leerEstado(pool, id), 1, 'no salió un céntimo');

    // Un origen REAL sigue funcionando exactamente igual.
    const bueno = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:bueno-${sufijo()}`,
      sourceType: 'TOPUP', sourceId: `solicitud-${sufijo()}`,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(bueno.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 3, 'la recarga de verdad sí entra');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§5 · dos espacios DISTINTOS no pueden mover el mismo dinero dos veces', saltar, async () => {
  // El escenario económico completo: Codex llegó a 5.00 con `' '` y `'   '`.
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));
    for (const vacio of [' ', '   ']) {
      await a.creditDriverWallet({
        driverId: id, creditUSD: 2, operationId: `topup:blanco-${sufijo()}`,
        sourceType: 'TOPUP', sourceId: vacio,
        policyEnabled: false, builders: CONSTRUCTORES(id)
      });
    }
    assert.equal(await leerEstado(pool, id), 1,
      'SALDO 1.00: ni 3.00 ni 5.00 — ninguna de las dos entró');
    assert.equal(await contarTestigos(pool, id), 0, 'y no hay un solo testigo sin procedencia');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§4 · el origen se canonicaliza: los espacios de los extremos se recortan', saltar, async () => {
  // Recortar es lo ÚNICO que se canonicaliza, y es deliberado: `source_id`
  // lleva identificadores externos y cambiarles mayúsculas o normalizarlos en
  // Unicode convertiría una identidad válida en otra distinta.
  const { pool, dbA, a } = await montar();
  let id = null;
  const solicitud = `solicitud-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    const primera = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:a-${solicitud}`,
      sourceType: 'TOPUP', sourceId: `  ${solicitud}  `,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(primera.outcome, 'CREDITED');

    const { rows } = await pool.query(
      `select source_id from public.driver_money_operations where driver_id = $1`, [id]);
    assert.equal(rows[0].source_id, solicitud, 'se guardó recortado, no con los espacios');

    // Y el MISMO origen sin espacios es el mismo hecho de negocio.
    const segunda = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:b-${solicitud}`,
      sourceType: 'TOPUP', sourceId: solicitud,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(segunda.outcome, 'ALREADY_APPLIED',
      'los espacios de los extremos no convierten una solicitud en otra');
    assert.equal(await leerEstado(pool, id), 3, 'y el dinero entró UNA vez');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// C · y la BASE lo rechaza sola
// ==========================================================================

test('§4 · la base rechaza un origen en blanco sin pasar por la aplicación', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA));
    for (const vacio of ['', ' ', '\t\n']) {
      await assert.rejects(
        () => pool.query(
          `insert into public.driver_money_operations
             (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
           values ($1, $2, 'CREDIT', 1, 1, 'TOPUP', $3)`,
          [`directo-${sufijo()}`, id, vacio]),
        error => {
          assert.match(error.message, /origen_no_vacio/,
            'la restricción de la base es la que tiene que pararlo');
          return true;
        }
      );
    }
    assert.equal(await contarTestigos(pool, id), 0);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// H/I · SETTLEMENT_PENDING también es propiedad financiera
// ==========================================================================

test('§14 · con la liquidación PENDIENTE, una escritura genérica no puede cambiar de dueño', saltar, async () => {
  // La reproducción de Codex: el guardia solo miraba `SETTLED`. Una carrera
  // HECHA cuyo dinero se debe todavía es una obligación recuperable CON DUEÑO.
  const { pool, dbA, a } = await montar();
  let idA = null;
  let idB = null;
  let pasajero = null;
  const viaje = `trip_v9_${sufijo()}`;
  try {
    ({ id: idA } = await altaConductor(a, dbA, { walletBalance: 5 }));
    ({ id: idB } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero, { status: 'COMPLETED', driverId: idA });
    await pool.query(
      `insert into public.driver_commission_reservations (trip_id, driver_id, reserved_usd, status)
       values ($1, $2, 0.60, 'SETTLEMENT_PENDING')`, [viaje, idA]);

    await assert.rejects(
      () => pool.query(
        `update public.trips set payload = jsonb_set(payload, '{driverId}', to_jsonb($2::text), true)
          where id = $1`, [viaje, idB]),
      error => {
        assert.match(error.message, /TRIP_OWNER_SETTLED/);
        return true;
      }
    );
    assert.equal(await leerDuenoDelViaje(pool, viaje), idA, 'la carrera sigue siendo de A');
    assert.equal((await leerReserva(pool, viaje)).driver_id, idA, 'y su deuda también');
  } finally {
    await limpiar(pool, [idA, idB, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

test('§15 · con la liquidación pendiente, la recuperación converge exactamente una vez', saltar, async () => {
  // El guardia nuevo no puede estorbar el rescate: la carrera sigue siendo de
  // A, y A es quien tiene que pagar su comisión.
  const { pool, dbA, a } = await montar();
  let id = null;
  let pasajero = null;
  const viaje = `trip_v9_${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero, { status: 'COMPLETED', driverId: id });
    await pool.query(
      `insert into public.driver_commission_reservations (trip_id, driver_id, reserved_usd, status)
       values ($1, $2, 0.60, 'SETTLEMENT_PENDING')`, [viaje, id]);

    const pendientes = await a.listPendingSettlements({ limit: 25 });
    assert.ok(pendientes.some(p => p.tripId === viaje && p.driverId === id),
      'el rescate la encuentra, con su dueño');

    const primera = await a.settleTripForDriver({
      tripId: viaje, driverId: id, commissionUSD: 0.6, creditUSD: 0,
      policyEnabled: true, builders: CONSTRUCTORES(id)
    });
    assert.equal(primera.outcome, 'SETTLED');
    assert.equal(await leerEstado(pool, id), 4.4, 'se cobró la comisión: 5.00 − 0.60');

    const segunda = await a.settleTripForDriver({
      tripId: viaje, driverId: id, commissionUSD: 0.6, creditUSD: 0,
      policyEnabled: true, builders: CONSTRUCTORES(id)
    });
    assert.equal(segunda.outcome, 'ALREADY_SETTLED', 'y no se cobra dos veces');
    assert.equal(await leerEstado(pool, id), 4.4);
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

test('§16 · una carrera RESERVADA y aún no hecha sí se puede reasignar', saltar, async () => {
  // El guardia no puede tener falsos positivos: mientras el dinero no haya
  // cambiado de manos, reasignar es legítimo y la reserva se libera.
  const { pool, dbA, a } = await montar();
  let idA = null;
  let idB = null;
  let pasajero = null;
  const viaje = `trip_v9_${sufijo()}`;
  try {
    ({ id: idA } = await altaConductor(a, dbA, { walletBalance: 5 }));
    ({ id: idB } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero, { status: 'DRIVER_ASSIGNED', driverId: idA });
    await pool.query(
      `insert into public.driver_commission_reservations (trip_id, driver_id, reserved_usd, status)
       values ($1, $2, 0.60, 'RESERVED')`, [viaje, idA]);

    const r = await a.reassignTripDriver({ tripId: viaje, fromDriverId: idA, toDriverId: idB });
    assert.equal(r.outcome, 'REASSIGNED');
    assert.equal(await leerDuenoDelViaje(pool, viaje), idB);
    assert.equal((await leerReserva(pool, viaje)).status, 'RELEASED');

    // Y la puerta consciente del dinero también se niega con la pendiente.
    const otro = `trip_v9_${sufijo()}`;
    await crearViaje(pool, otro, pasajero, { status: 'COMPLETED', driverId: idA });
    await pool.query(
      `insert into public.driver_commission_reservations (trip_id, driver_id, reserved_usd, status)
       values ($1, $2, 0.60, 'SETTLEMENT_PENDING')`, [otro, idA]);
    const negada = await a.reassignTripDriver({ tripId: otro, fromDriverId: idA, toDriverId: idB });
    assert.equal(negada.outcome, 'SETTLEMENT_PENDING');
    assert.equal(await leerDuenoDelViaje(pool, otro), idA);
    await limpiar(pool, [], [otro]);
  } finally {
    await limpiar(pool, [idA, idB, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});
