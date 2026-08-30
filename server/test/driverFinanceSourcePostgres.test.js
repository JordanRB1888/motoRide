import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPostgresPersistence, createPostgresPool } from '../services/postgresPersistence.js';

/**
 * DRIVER-FINANCE-1 v8 — el ORIGEN DE NEGOCIO también es una identidad.
 *
 * La séptima auditoría movió el mismo dinero dos veces sin romper ninguna
 * regla. `operation_id` era único, sí — pero le puso DOS identidades al MISMO
 * hecho de negocio:
 *
 *   op-A · TOPUP / request-123 · +2.00   saldo 1.00 → 3.00
 *   op-B · TOPUP / request-123 · +2.00   saldo 3.00 → 5.00
 *
 * Una recarga es UN hecho, y un hecho mueve dinero una sola vez, se le llame
 * como se le llame. Este fichero cubre eso, el rechazo de `LEGACY_UNKNOWN` en
 * operaciones nuevas, la propiedad de una carrera ya liquidada frente a una
 * reasignación concurrente, y el apunte que le faltaba a la conciliación de
 * crédito cero.
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
const contarPorOrigen = async (pool, sourceType, sourceId) => {
  const { rows } = await pool.query(
    `select count(*)::int as n from public.driver_money_operations
      where source_type = $1 and source_id = $2`, [sourceType, sourceId]);
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
  const id = `drv_v8_${sufijo()}`;
  const doc = conductor(id, extra);
  dbA.users.push(doc);
  assert.equal(await a.persistRecord('users', doc), true);
  await a.ensureDriverFinanceState({ driver: doc, maintenanceAnchorAt: Date.now(), activityAnchorAt: Date.now() });
  return { id, doc };
}

async function crearPasajero(a, dbA) {
  const id = `psg_v8_${sufijo()}`;
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
  // La identidad determinista de v8: el total acumulado que el conductor lleva
  // pagado de deuda. Solo crece, así que dos pagos distintos nunca coinciden y
  // repetir el mismo pago reproduce el mismo identificador.
  deferred: ({ paid, balanceAfter, paidTotal }) => ({
    id: `transaction_deferred_${driverId}_${Math.round(Number(paidTotal) * 100)}`, userId: driverId,
    type: 'DRIVER_DEFERRED_COMMISSION_PAYMENT', amount: -paid,
    currency: 'USD', status: 'APPROVED', balanceAfter, createdAt: new Date().toISOString()
  })
});

// ==========================================================================
// A · el mismo ORIGEN bajo otra identidad no vuelve a mover dinero
// ==========================================================================

test('§4 · la misma recarga con otro operation_id NO se acredita dos veces', saltar, async () => {
  // La reproducción exacta de Codex, importe por importe.
  const { pool, dbA, a } = await montar();
  let id = null;
  const solicitud = `request-${sufijo()}`;
  const origen = { sourceType: 'TOPUP', sourceId: solicitud };
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    const primera = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:op-A-${solicitud}`, ...origen,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(primera.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 3, 'la recarga entra: 1.00 + 2.00');

    // La MISMA solicitud de negocio, con otro nombre de operación.
    const segunda = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:op-B-${solicitud}`, ...origen,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });

    assert.equal(segunda.outcome, 'ALREADY_APPLIED',
      'el hecho de negocio ya ocurrió: cambiarle el nombre no lo convierte en otro');
    assert.equal(segunda.balanceAfter, 3);
    assert.equal(await leerEstado(pool, id), 3, 'SALDO 3.00, NO 5.00');
    assert.equal(await contarPorOrigen(pool, 'TOPUP', solicitud), 1, 'un solo efecto financiero');
    assert.equal(segunda.canonicalOperationId, `topup:op-A-${solicitud}`,
      'y se responde con la operación canónica, la que de verdad movió el dinero');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§6 · dos procesos SIMULTÁNEOS con el mismo origen: un solo efecto', saltar, async () => {
  // La comprobación previa de la aplicación no basta: dos procesos pueden
  // hacerla a la vez y los dos encontrarla limpia. Quien lo impide es la base.
  const { pool, dbA, a } = await montar();
  const otra = createPostgresPool({ connectionString });
  const dbB = baseVacia();
  const b = await createPostgresPersistence({ pool: otra, database: dbB, logger: silencioso });
  let id = null;
  const solicitud = `request-concurrente-${sufijo()}`;
  const origen = { sourceType: 'TOPUP', sourceId: solicitud };
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    const [uno, dos] = await Promise.all([
      a.creditDriverWallet({
        driverId: id, creditUSD: 2, operationId: `topup:op-A-${solicitud}`, ...origen,
        policyEnabled: false, builders: CONSTRUCTORES(id)
      }),
      b.creditDriverWallet({
        driverId: id, creditUSD: 2, operationId: `topup:op-B-${solicitud}`, ...origen,
        policyEnabled: false, builders: CONSTRUCTORES(id)
      })
    ]);

    const desenlaces = [uno.outcome, dos.outcome].sort();
    assert.deepEqual(desenlaces, ['ALREADY_APPLIED', 'CREDITED'],
      'uno acredita y el otro reconoce; pase lo que pase con el orden');
    assert.equal(await leerEstado(pool, id), 3, 'el dinero entró UNA vez');
    assert.equal(await contarPorOrigen(pool, 'TOPUP', solicitud), 1, 'y hay un solo testigo');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await otra.end();
    await pool.end();
  }
});

// ==========================================================================
// C/D/E · el mismo origen con OTRA semántica falla cerrado
// ==========================================================================

for (const caso of [
  { nombre: '§5 · otro IMPORTE', cambio: { creditUSD: 7 } },
  { nombre: '§5 · otra DIRECCIÓN', cambio: { debito: true } },
  { nombre: '§5 · otro CONDUCTOR', cambio: { otroConductor: true } }
]) {
  test(`${caso.nombre} bajo el mismo origen: conflicto, sin mover un céntimo`, saltar, async () => {
    const { pool, dbA, a } = await montar();
    let id = null;
    let otro = null;
    const solicitud = `request-colision-${sufijo()}`;
    const origen = { sourceType: 'TOPUP', sourceId: solicitud };
    try {
      ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));
      if (caso.cambio.otroConductor) ({ id: otro } = await altaConductor(a, dbA, { walletBalance: 4 }));

      const primera = await a.creditDriverWallet({
        driverId: id, creditUSD: 2, operationId: `topup:op-A-${solicitud}`, ...origen,
        policyEnabled: false, builders: CONSTRUCTORES(id)
      });
      assert.equal(primera.outcome, 'CREDITED');
      assert.equal(await leerEstado(pool, id), 3);

      const peticion = {
        driverId: caso.cambio.otroConductor ? otro : id,
        operationId: `topup:op-B-${solicitud}`, ...origen
      };
      const segunda = caso.cambio.debito
        ? await a.debitDriverWallet({ ...peticion, amountUSD: 2 })
        : await a.creditDriverWallet({
          ...peticion, creditUSD: caso.cambio.creditUSD ?? 2,
          policyEnabled: false, builders: CONSTRUCTORES(peticion.driverId)
        });

      assert.equal(segunda.outcome, 'SOURCE_IDENTITY_CONFLICT',
        'el mismo origen con otra semántica no es una repetición: es un conflicto');
      assert.equal(await leerEstado(pool, id), 3, 'el primero no se movió');
      if (otro) assert.equal(await leerEstado(pool, otro), 4, 'y el segundo tampoco');
      assert.equal(await contarPorOrigen(pool, 'TOPUP', solicitud), 1, 'sigue habiendo un solo testigo');
    } finally {
      await limpiar(pool, [id, otro].filter(Boolean));
      await pool.end();
    }
  });
}

// ==========================================================================
// F · `LEGACY_UNKNOWN` describe el pasado; no autoriza el futuro
// ==========================================================================

test('§10 · una operación NUEVA con origen LEGACY_UNKNOWN se rechaza', saltar, async () => {
  // Codex comprobó que entraba la primera vez y después quedaba atrapada: su
  // reintento exacto no podía probar nada y fallaba cerrado para siempre. Es
  // dinero que se mueve una vez y no se puede reconciliar nunca.
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));
    const credito = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:legado-${sufijo()}`,
      sourceType: 'LEGACY_UNKNOWN', sourceId: 'lo-que-sea',
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(credito.outcome, 'LEGACY_SOURCE_NOT_ALLOWED');
    assert.equal(await leerEstado(pool, id), 1, 'no entró un céntimo');

    const debito = await a.debitDriverWallet({
      driverId: id, amountUSD: 1, operationId: `withdrawal:legado-${sufijo()}`,
      sourceType: 'LEGACY_UNKNOWN', sourceId: 'lo-que-sea'
    });
    assert.equal(debito.outcome, 'LEGACY_SOURCE_NOT_ALLOWED');
    assert.equal(await leerEstado(pool, id), 1, 'ni salió');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§9 · y la BASE lo rechaza también, sin pasar por la aplicación', saltar, async () => {
  // La aplicación no puede ser el último guardián de una tabla de dinero.
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA));
    await assert.rejects(
      () => pool.query(
        `insert into public.driver_money_operations
           (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
         values ($1, $2, 'CREDIT', 1, 1, 'LEGACY_UNKNOWN', 'inventado')`,
        [`directo-${sufijo()}`, id]),
      error => {
        assert.match(error.message, /LEGACY_SOURCE_NOT_ALLOWED/);
        return true;
      }
    );
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// §7 · la primitiva que necesitarán los retiros
// ==========================================================================

test('§7 · un retiro con dos identidades para la misma solicitud NO debita dos veces', saltar, async () => {
  // WALLET-PAYOUTS-1 no se implementa aquí. Lo que se prueba es que la
  // primitiva ya lo aguanta: si mañana un fallo genera otro `operation_id`
  // para la misma solicitud de retiro, el dinero no sale dos veces.
  const { pool, dbA, a } = await montar();
  let id = null;
  const solicitud = `retiro-${sufijo()}`;
  const origen = { sourceType: 'WITHDRAWAL', sourceId: solicitud };
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 10 }));

    const primero = await a.debitDriverWallet({
      driverId: id, amountUSD: 4, operationId: `withdrawal:${solicitud}`, ...origen
    });
    assert.equal(primero.outcome, 'DEBITED');
    assert.equal(await leerEstado(pool, id), 6);

    const repetido = await a.debitDriverWallet({
      driverId: id, amountUSD: 4, operationId: `withdrawal:${solicitud}`, ...origen
    });
    assert.equal(repetido.outcome, 'ALREADY_APPLIED', 'el reintento exacto reconoce');

    const otroNombre = await a.debitDriverWallet({
      driverId: id, amountUSD: 4, operationId: `withdrawal:regenerado-${solicitud}`, ...origen
    });
    assert.equal(otroNombre.outcome, 'ALREADY_APPLIED',
      'y otro nombre para la MISMA solicitud tampoco vuelve a sacar dinero');
    assert.equal(await leerEstado(pool, id), 6, 'salieron 4.00 en total, no 8.00 ni 12.00');
    assert.equal(await contarPorOrigen(pool, 'WITHDRAWAL', solicitud), 1);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// K/L · el dueño de una carrera liquidada ya no cambia
// ==========================================================================

test('§24 · una reasignación esperando detrás de la liquidación NO puede entrar después', saltar, async () => {
  // La reproducción de Codex, con su mismo entrelazado: la reasignación se
  // lanza mientras la liquidación tiene el viaje bloqueado, espera su turno y
  // entra en cuanto la liquidación confirma. Antes dejaba
  //   reserva SETTLED -> A     y     viaje asignado -> B
  const { pool, dbA, a } = await montar();
  const otraConexion = createPostgresPool({ connectionString });
  let idA = null;
  let idB = null;
  let pasajero = null;
  const viaje = `trip_v8_${sufijo()}`;
  try {
    ({ id: idA } = await altaConductor(a, dbA, { walletBalance: 5 }));
    ({ id: idB } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero, { status: 'COMPLETED', driverId: idA });
    await pool.query(
      `insert into public.driver_commission_reservations (trip_id, driver_id, reserved_usd, status)
       values ($1, $2, 0.60, 'RESERVED')`, [viaje, idA]);

    // La reasignación genérica: una escritura del documento del viaje, que es
    // exactamente lo que hace `persistRecord` y lo que haría cualquier
    // reasignación futura que no pasara por la puerta financiera.
    const reasignar = (async () => {
      // El entrelazado es DETERMINISTA: no se espera un tiempo fijo —contra una
      // base remota la liquidación tarda segundos en llegar a bloquear el
      // viaje, y la reasignación se le colaba delante— sino a VER el cerrojo
      // tomado. `for update nowait` falla al instante si otro lo tiene, y eso
      // es exactamente la señal que hace falta.
      const cliente = await otraConexion.connect();
      try {
        const hasta = Date.now() + 30_000;
        let liquidacionTieneElViaje = false;
        while (Date.now() < hasta && !liquidacionTieneElViaje) {
          try {
            await cliente.query('begin');
            await cliente.query(`select 1 from public.trips where id = $1 for update nowait`, [viaje]);
            await cliente.query('rollback');
            await new Promise(r => setTimeout(r, 100));
          } catch {
            await cliente.query('rollback').catch(() => {});
            liquidacionTieneElViaje = true;
          }
        }
        if (!liquidacionTieneElViaje) return 'LA_LIQUIDACION_NUNCA_BLOQUEO_EL_VIAJE';

        // Ahora sí: la reasignación se queda esperando detrás del cerrojo y
        // entra en cuanto la liquidación confirma. Ese es el defecto.
        await cliente.query('begin');
        await cliente.query(
          `update public.trips
              set payload = jsonb_set(payload, '{driverId}', to_jsonb($2::text), true)
            where id = $1`, [viaje, idB]);
        await cliente.query('commit');
        return 'REASIGNADO';
      } catch (error) {
        await cliente.query('rollback').catch(() => {});
        return error.message;
      } finally {
        cliente.release();
      }
    })();

    const liquidacion = await a.settleTripForDriver({
      tripId: viaje, driverId: idA, commissionUSD: 0.6, creditUSD: 0,
      policyEnabled: true, builders: CONSTRUCTORES(idA)
    });
    const resultadoReasignacion = await reasignar;

    assert.equal(liquidacion.outcome, 'SETTLED', 'la liquidación del dueño legítimo entra');
    assert.match(resultadoReasignacion, /TRIP_OWNER_SETTLED/,
      'y la reasignación que esperaba detrás se rechaza: la comisión ya está cobrada');

    const reserva = await leerReserva(pool, viaje);
    assert.equal(reserva.status, 'SETTLED');
    assert.equal(reserva.driver_id, idA);
    assert.equal(await leerDuenoDelViaje(pool, viaje), idA,
      'FINAL_FINANCIAL_OWNER_MATCH: la reserva liquidada y el viaje son del MISMO conductor');
    assert.equal(await leerEstado(pool, idB), 5, 'y a B no se le tocó nada');
  } finally {
    await otraConexion.end();
    await limpiar(pool, [idA, idB, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

test('§25 · si la reasignación gana primero, la liquidación del dueño anterior se rechaza', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let idA = null;
  let idB = null;
  let pasajero = null;
  const viaje = `trip_v8_${sufijo()}`;
  try {
    ({ id: idA } = await altaConductor(a, dbA, { walletBalance: 5 }));
    ({ id: idB } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero, { status: 'COMPLETED', driverId: idA });
    await pool.query(
      `insert into public.driver_commission_reservations (trip_id, driver_id, reserved_usd, status)
       values ($1, $2, 0.60, 'RESERVED')`, [viaje, idA]);

    // Reasignar ANTES de liquidar sí es legítimo: nada se ha cobrado todavía.
    await pool.query(
      `update public.trips set payload = jsonb_set(payload, '{driverId}', to_jsonb($2::text), true)
        where id = $1`, [viaje, idB]);

    const tardia = await a.settleTripForDriver({
      tripId: viaje, driverId: idA, commissionUSD: 0.6, creditUSD: 0,
      policyEnabled: true, builders: CONSTRUCTORES(idA)
    });
    assert.equal(tardia.outcome, 'OWNERSHIP_MISMATCH',
      'la carrera ya no es de A: su liquidación no puede cobrarse');
    assert.equal(await leerEstado(pool, idA), 5, 'y a A no se le cobró nada');
    assert.equal((await leerReserva(pool, viaje)).status, 'RESERVED');
  } finally {
    await limpiar(pool, [idA, idB, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

test('§22 · la puerta de reasignación conoce el dinero', saltar, async () => {
  // Hoy el producto no reasigna: la única asignación que existe es la de una
  // carrera SEARCHING, y esa pasa por `acceptTripWithReservation`. Esta
  // primitiva existe para que, cuando haya una reasignación de verdad, tenga
  // UNA sola puerta y esa puerta sepa de dinero.
  const { pool, dbA, a } = await montar();
  let idA = null;
  let idB = null;
  let pasajero = null;
  const vivo = `trip_v8_${sufijo()}`;
  const liquidado = `trip_v8_${sufijo()}`;
  try {
    ({ id: idA } = await altaConductor(a, dbA, { walletBalance: 5 }));
    ({ id: idB } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);

    // A) una carrera aún no liquidada: se reasigna, y la reserva de A se libera.
    await crearViaje(pool, vivo, pasajero, { status: 'DRIVER_ASSIGNED', driverId: idA });
    await pool.query(
      `insert into public.driver_commission_reservations (trip_id, driver_id, reserved_usd, status)
       values ($1, $2, 0.60, 'RESERVED')`, [vivo, idA]);
    const ok = await a.reassignTripDriver({ tripId: vivo, fromDriverId: idA, toDriverId: idB });
    assert.equal(ok.outcome, 'REASSIGNED');
    assert.equal(await leerDuenoDelViaje(pool, vivo), idB);
    assert.equal((await leerReserva(pool, vivo)).status, 'RELEASED',
      'y A recupera su capacidad: no se queda con dinero comprometido de una carrera que ya no hace');

    // B) una carrera YA liquidada: no se reasigna.
    await crearViaje(pool, liquidado, pasajero, { status: 'COMPLETED', driverId: idA });
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, status, resolved_at)
       values ($1, $2, 0.60, 0.60, 'SETTLED', now())`, [liquidado, idA]);
    const no = await a.reassignTripDriver({ tripId: liquidado, fromDriverId: idA, toDriverId: idB });
    assert.equal(no.outcome, 'ALREADY_SETTLED');
    assert.equal(await leerDuenoDelViaje(pool, liquidado), idA, 'el dueño no se movió');

    // C) y quien pide la reasignación no decide de quién era la carrera.
    const ajena = await a.reassignTripDriver({ tripId: vivo, fromDriverId: idA, toDriverId: idA });
    assert.equal(ajena.outcome, 'OWNERSHIP_MISMATCH');
  } finally {
    await limpiar(pool, [idA, idB, pasajero].filter(Boolean), [vivo, liquidado]);
    await pool.end();
  }
});

// ==========================================================================
// P/Q · la deuda saldada deja apunte, y uno solo
// ==========================================================================

test('§34 · la conciliación de crédito CERO deja su apunte en el historial', saltar, async () => {
  // Codex lo midió: saldaba 1.00 de deuda, bajaba el saldo de 5.00 a 4.00 y no
  // creaba ningún apunte. La aritmética era correcta y el historial mentía.
  const { pool, dbA, a } = await montar();
  let id = null;
  let pasajero = null;
  const viaje = `trip_v8_${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero, { status: 'COMPLETED', driverId: id });
    // Una carrera ya liquidada que dejó 1.00 a deber.
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 1, 0, 1, 'SETTLED', now())`, [viaje, id]);
    await pool.query(
      `update public.driver_finance_state set wallet_balance_usd = 5, deferred_commission_usd = 1
        where driver_id = $1`, [id]);

    const r = await a.creditDriverWallet({
      driverId: id, creditUSD: 0, policyEnabled: true, builders: CONSTRUCTORES(id)
    });

    assert.equal(r.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 4, 'se cobró 1.00 de deuda: 5.00 → 4.00');
    const { rows } = await pool.query(
      `select id, (payload->>'amount')::numeric as importe,
              (payload->>'balanceAfter')::numeric as saldo
         from public.transactions
        where user_id = $1 and transaction_type = 'DRIVER_DEFERRED_COMMISSION_PAYMENT'`, [id]);
    assert.equal(rows.length, 1, 'Y EXISTE EL APUNTE: antes no se creaba ninguno');
    assert.equal(Number(rows[0].importe), -1, 'con el importe que de verdad se cobró');
    assert.equal(Number(rows[0].saldo), 4, 'y el saldo que dejó');

    // Replay: el mismo crédito de cero, otra vez. Ya no queda deuda que cobrar.
    const replay = await a.creditDriverWallet({
      driverId: id, creditUSD: 0, policyEnabled: true, builders: CONSTRUCTORES(id)
    });
    assert.equal(replay.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 4, 'el saldo sigue en 4.00');
    const { rows: despues } = await pool.query(
      `select count(*)::int as n from public.transactions
        where user_id = $1 and transaction_type = 'DRIVER_DEFERRED_COMMISSION_PAYMENT'`, [id]);
    assert.equal(despues[0].n, 1, 'y sigue habiendo UN solo apunte');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

test('§33 · dos conciliaciones SIMULTÁNEAS no duplican el apunte de la deuda', saltar, async () => {
  const { pool, dbA, a } = await montar();
  const otra = createPostgresPool({ connectionString });
  const dbB = baseVacia();
  const b = await createPostgresPersistence({ pool: otra, database: dbB, logger: silencioso });
  let id = null;
  let pasajero = null;
  const viaje = `trip_v8_${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero, { status: 'COMPLETED', driverId: id });
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 1, 0, 1, 'SETTLED', now())`, [viaje, id]);
    await pool.query(
      `update public.driver_finance_state set wallet_balance_usd = 5, deferred_commission_usd = 1
        where driver_id = $1`, [id]);

    await Promise.all([
      a.creditDriverWallet({ driverId: id, creditUSD: 0, policyEnabled: true, builders: CONSTRUCTORES(id) }),
      b.creditDriverWallet({ driverId: id, creditUSD: 0, policyEnabled: true, builders: CONSTRUCTORES(id) })
    ]);

    assert.equal(await leerEstado(pool, id), 4, 'la deuda se cobró UNA vez');
    const { rows } = await pool.query(
      `select count(*)::int as n from public.transactions
        where user_id = $1 and transaction_type = 'DRIVER_DEFERRED_COMMISSION_PAYMENT'`, [id]);
    assert.equal(rows[0].n, 1, 'y quedó UN apunte, no dos');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await otra.end();
    await pool.end();
  }
});

// ==========================================================================
// El resolutor del COMMIT incierto pregunta por SU identidad, no por el origen
// ==========================================================================

test('§3 · un COMMIT que NO entró no se da por bueno porque el hecho exista con otro nombre', saltar, async () => {
  // Un veredicto de «entró» devuelve el resultado que esa transacción calculó
  // y publica su sombra en memoria. Eso solo es cierto si fue ELLA la que
  // entró. Si otra movió el mismo hecho bajo otro nombre, esta NO entró, y dar
  // su resultado por bueno sería inventarse un saldo y unos apuntes que la
  // base nunca vio.
  //
  // Así que se responde «no entró» —que es la verdad— y la verdad definitiva
  // la dice el reintento, que resuelve las dos identidades antes de tocar nada.
  const { pool, dbA, a } = await montar();
  const rival = createPostgresPool({ connectionString });
  let id = null;
  const solicitud = `request-resolutor-${sufijo()}`;
  const origen = { sourceType: 'TOPUP', sourceId: solicitud };
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    // Un pozo cuyo PRIMER commit se deshace de verdad y, justo antes, deja que
    // OTRO proceso anote el mismo hecho de negocio con otro nombre.
    let saboteado = false;
    const pozoSaboteado = {
      connect: async () => {
        const cliente = await pool.connect();
        const original = cliente.query.bind(cliente);
        cliente.query = async (texto, valores) => {
          if (!saboteado && typeof texto === 'string' && texto.trim().toLowerCase() === 'commit') {
            saboteado = true;
            await original('rollback');
            // El rival entra AHORA, con otra identidad y el mismo origen.
            await rival.query(
              `insert into public.driver_money_operations
                 (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
               values ($1, $2, 'CREDIT', 2, 3, 'TOPUP', $3)`,
              [`topup:rival-${solicitud}`, id, solicitud]);
            await rival.query(
              `update public.driver_finance_state set wallet_balance_usd = 3 where driver_id = $1`, [id]);
            throw new Error('conexión perdida al confirmar');
          }
          return original(texto, valores);
        };
        const soltar = cliente.release.bind(cliente);
        cliente.release = (...args) => { delete cliente.query; return soltar(...args); };
        return cliente;
      },
      query: (...args) => pool.query(...args),
      end: async () => {}
    };
    const dbC = baseVacia();
    const c = await createPostgresPersistence({ pool: pozoSaboteado, database: dbC, logger: silencioso });

    const incierto = await c.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:propio-${solicitud}`, ...origen,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.notEqual(incierto.outcome, 'CREDITED',
      'NO se dio por bueno un movimiento que esta transacción nunca llegó a hacer');
    assert.notEqual(incierto.outcome, 'ALREADY_APPLIED');

    // Y el reintento, ya sin sabotaje, dice la verdad completa.
    const reintento = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:propio-${solicitud}`, ...origen,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(reintento.outcome, 'ALREADY_APPLIED', 'el hecho ya estaba: no se vuelve a acreditar');
    assert.equal(await leerEstado(pool, id), 3, 'saldo 3.00: el dinero entró UNA vez');
    assert.equal(await contarPorOrigen(pool, 'TOPUP', solicitud), 1, 'y hay un solo testigo');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await rival.end();
    await pool.end();
  }
});
