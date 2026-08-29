import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { createPostgresPersistence, createPostgresPool } from '../services/postgresPersistence.js';

/**
 * DRIVER-FINANCE-1 v3 — las garantías financieras contra PostgreSQL REAL.
 *
 * Por qué existe este fichero: la segunda auditoría demostró que SQLite no
 * puede probar nada de esto. Sus stubs conceden siempre la reserva y no
 * tienen actualizaciones condicionales, así que enmascaran justo los fallos
 * que importan. Estas pruebas solo dicen la verdad contra un PostgreSQL de
 * verdad.
 *
 * ESTADO: se ejecutan contra la base de PRUEBAS indicada en
 * `TEST_DATABASE_URL` (nunca producción: el destino se verifica antes). Sin
 * esa variable se saltan, y mientras se salten no puede afirmarse que las
 * garantías estén probadas.
 *
 * Nota de red: en el equipo donde se escribieron, el puerto 5432 del pooler
 * está bloqueado y solo responde el 6543.
 */

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };

const DIA_MS = 24 * 60 * 60 * 1000;
const sufijo = () => `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

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
  const a = await createPostgresPersistence({ pool, database: dbA, logger: { error() {}, warn() {}, log() {} } });
  const b = await createPostgresPersistence({ pool, database: dbB, logger: { error() {}, warn() {}, log() {} } });
  return { pool, dbA, dbB, a, b };
}

const leerSaldo = async (pool, id) => {
  const { rows } = await pool.query(`select (payload->>'walletBalance')::numeric as saldo from public.users where id = $1`, [id]);
  return rows.length ? Number(rows[0].saldo) : null;
};

// Lo comprometido vive en su TABLA propia: fuera del documento del conductor,
// que es justo lo que impide que una escritura obsoleta lo borre.
const leerComprometido = async (pool, id) => {
  const { rows } = await pool.query(
    `select committed_commission_usd as c from public.driver_finance_state where driver_id = $1`, [id]);
  return rows.length ? Number(rows[0].c) : 0;
};


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

const limpiar = async (pool, ids) => {
  // Las reservas referencian al conductor: se retiran primero o la clave
  // foranea impide borrar al usuario de prueba.
  await pool.query(`delete from public.driver_commission_reservations where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_finance_state where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.transactions where payload->>'userId' = any($1::text[])`, [ids]);
  await pool.query(`delete from public.users where id = any($1::text[])`, [ids]);
};

// --------------------------------------------------------------------------
// A · dos reservas de comisión concurrentes sobre el MISMO conductor
// --------------------------------------------------------------------------

test('A · dos reservas concurrentes no gastan dos veces la misma capacidad', saltar, async () => {
  const { pool, dbA, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  let pasajero = null;
  try {
    dbA.users.push(conductor(id, { walletBalance: -4.5 }));
    assert.equal(await a.persistRecord('users', dbA.users[0]), true);

    // Capacidad disponible: -4.50 → solo cabe $0.50 antes del suelo de -5.
    const [uno, dos] = await Promise.all([
      a.reserveDriverCommission(id, 0.4, -5),
      b.reserveDriverCommission(id, 0.4, -5)
    ]);
    assert.equal([uno, dos].filter(Boolean).length, 1, 'solo UNA reserva puede caber');
    assert.equal(await leerComprometido(pool, id), 0.4, 'y la base solo apuntó una');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// B · el mismo mes, cobrado por dos evaluadores a la vez
// --------------------------------------------------------------------------

test('B · el mismo periodo mensual se cobra UNA vez con dos evaluadores', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  let pasajero = null;
  try {
    const base = conductor(id, { walletBalance: 10, maintenance: { anchorAt: Date.now() - 31 * DIA_MS, lastChargedPeriod: 0, pendingPeriods: [] } });
    dbA.users.push(base);
    dbB.users.push({ ...base });
    await a.persistRecord('users', dbA.users[0]);

    const cobro = (persistencia, driver) => persistencia.chargeDriverMaintenance({
      transaction: {
        id: `transaction_maint_${id}_1`, userId: id, type: 'DRIVER_ACCOUNT_MAINTENANCE',
        maintenancePeriod: 1, amount: -1, description: 'Mantenimiento de cuenta',
        currency: 'USD', status: 'APPROVED', balanceAfter: 9, createdAt: new Date().toISOString()
      },
      driver: { ...driver, walletBalance: 9, maintenance: { ...driver.maintenance, lastChargedPeriod: 1 } }
    });

    const resultados = await Promise.all([cobro(a, dbA.users[0]), cobro(b, dbB.users[0])]);
    assert.equal(resultados.filter(r => r === 'CHARGED').length, 1, 'un solo cobro');
    assert.equal(resultados.filter(r => r === 'ALREADY_CHARGED').length, 1, 'el otro se retira');
    assert.equal(await leerSaldo(pool, id), 9, 'el saldo durable refleja UN débito');
    const { rows } = await pool.query(`select count(*)::int as n from public.transactions where id = $1`, [`transaction_maint_${id}_1`]);
    assert.equal(rows[0].n, 1, 'un solo apunte en el libro');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// C · la transacción se deshace entera si algo falla dentro
// --------------------------------------------------------------------------

test('C · un fallo dentro de la transaccion no deja ni apunte ni debito', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  let pasajero = null;
  try {
    dbA.users.push(conductor(id, { walletBalance: 10 }));
    await a.persistRecord('users', dbA.users[0]);

    // Un payload imposible de serializar revienta DENTRO de la transacción.
    const roto = { ...dbA.users[0], walletBalance: 9 };
    Object.defineProperty(roto, 'toJSON', { value() { throw new Error('payload roto'); } });
    const resultado = await a.chargeDriverMaintenance({
      transaction: {
        id: `transaction_maint_${id}_1`, userId: id, type: 'DRIVER_ACCOUNT_MAINTENANCE',
        maintenancePeriod: 1, amount: -1, currency: 'USD', status: 'APPROVED',
        createdAt: new Date().toISOString()
      },
      driver: roto
    });

    assert.equal(resultado, 'FAILED');
    assert.equal(await leerSaldo(pool, id), 10, 'el saldo no se movió');
    const { rows } = await pool.query(`select count(*)::int as n from public.transactions where id = $1`, [`transaction_maint_${id}_1`]);
    assert.equal(rows[0].n, 0, 'y no quedó apunte huérfano');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// D · reservar y liberar
// --------------------------------------------------------------------------

test('D · lo reservado se libera y la capacidad vuelve', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  let pasajero = null;
  try {
    dbA.users.push(conductor(id, { walletBalance: 0 }));
    await a.persistRecord('users', dbA.users[0]);

    assert.equal(await a.reserveDriverCommission(id, 1.5, -5), true);
    assert.equal(await leerComprometido(pool, id), 1.5);
    assert.equal(await a.releaseDriverCommission(id, 1.5), true);
    assert.equal(await leerComprometido(pool, id), 0, 'la capacidad vuelve entera');
    // Liberar de más nunca deja el apunte en negativo.
    await a.releaseDriverCommission(id, 5);
    assert.equal(await leerComprometido(pool, id), 0);
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// H · dos réplicas anclando el reloj a la vez
// --------------------------------------------------------------------------

test('H · dos replicas convergen en UN solo ancla de estreno', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  let pasajero = null;
  try {
    const base = conductor(id, { walletBalance: 5 });
    dbA.users.push(base);
    await a.persistRecord('users', dbA.users[0]);
    dbB.users.push({ ...base });

    const ahoraA = Date.now();
    const ahoraB = ahoraA + 5_000;
    await Promise.all([
      a.persistRecord('users', { ...base, maintenance: { anchorAt: ahoraA, lastChargedPeriod: 0, pendingPeriods: [] }, activityAnchorAt: ahoraA }),
      b.persistRecord('users', { ...base, maintenance: { anchorAt: ahoraB, lastChargedPeriod: 0, pendingPeriods: [] }, activityAnchorAt: ahoraB })
    ]);

    const { rows } = await pool.query(`select payload->'maintenance'->>'anchorAt' as ancla from public.users where id = $1`, [id]);
    assert.equal(rows.length, 1, 'una sola fila');
    assert.ok([String(ahoraA), String(ahoraB)].includes(rows[0].ancla),
      'el ancla durable es UNA de las dos, nunca una mezcla');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// La regresión que exige el encargo (§28): una escritura obsoleta del
// documento completo NO puede borrar lo que la base ya decidió.
// --------------------------------------------------------------------------

/**
 * La regresion del hallazgo critico de la segunda auditoria.
 *
 * Fallaba de verdad hasta el commit 977f262 (`actual: 0`): una replica
 * apuntaba la reserva y otra, con una copia vieja del documento, la borraba
 * al persistir. Desde que la reserva vive en su propia tabla, la escritura
 * del documento no tiene forma de tocarla.
 */
test('§28 · una escritura obsoleta del documento no puede borrar la reserva', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  let pasajero = null;
  try {
    const base = conductor(id, { walletBalance: 0 });
    dbA.users.push(base);
    await a.persistRecord('users', base);
    // La réplica B leyó al conductor ANTES de la reserva: su copia es vieja.
    dbB.users.push({ ...base });

    assert.equal(await a.reserveDriverCommission(id, 1.5, -5), true);
    assert.equal(await leerComprometido(pool, id), 1.5);

    // B escribe su documento obsoleto por la vía normal.
    await b.persistRecord('users', dbB.users[0]);

    // ESTA es la garantía que la auditoría echó en falta.
    assert.equal(await leerComprometido(pool, id), 1.5,
      'la reserva sobrevive a una escritura obsoleta del documento completo');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// §3 · dos VIAJES distintos, el mismo conductor, a la vez
// --------------------------------------------------------------------------

test('§3 · dos viajes concurrentes no pueden gastar la misma capacidad', saltar, async () => {
  const { pool, dbA, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  const viajeA = `trip_pg_${sufijo()}`;
  const viajeB = `trip_pg_${sufijo()}`;
  let pasajero = null;
  try {
    dbA.users.push(conductor(id, { walletBalance: -4.5 }));
    await a.persistRecord('users', dbA.users[0]);
    pasajero = await crearPasajero(pool, a, dbA);
    for (const t of [viajeA, viajeB]) {
      await pool.query(`insert into public.trips (id, payload) values ($1, $2::jsonb)`,
        [t, JSON.stringify({ id: t, status: 'SEARCHING', driverId: null, passengerId: pasajero, fareUSD: 3 })]);
    }

    // Capacidad real: -4.50 → solo cabe $0.50. Cada viaje pide $0.40.
    const [uno, dos] = await Promise.all([
      a.acceptTripWithReservation({ tripId: viajeA, driverId: id, commissionUSD: 0.4, floorUSD: -5, updatedAt: new Date().toISOString() }),
      b.acceptTripWithReservation({ tripId: viajeB, driverId: id, commissionUSD: 0.4, floorUSD: -5, updatedAt: new Date().toISOString() })
    ]);
    const aceptados = [uno, dos].filter(r => r === 'OK');
    assert.equal(aceptados.length, 1, 'solo UNA carrera cabe en su capacidad');
    assert.ok([uno, dos].includes('NO_CAPACITY'), 'la otra se rechaza por capacidad');

    // Y la rechazada no deja reserva viva.
    const { rows } = await pool.query(
      `select trip_id, status from public.driver_commission_reservations where driver_id = $1`, [id]);
    assert.equal(rows.length, 1, 'una sola reserva, con su viaje como dueño');
    assert.equal(rows[0].status, 'RESERVED');
  } finally {
    await pool.query(`delete from public.trips where id = any($1::text[])`, [[viajeA, viajeB]]);
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// §4 y §15 · la cancelación devuelve la capacidad, y solo una vez
// --------------------------------------------------------------------------

test('§15 · cancelar libera la reserva, y repetirlo no libera dos veces', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  const viaje = `trip_pg_${sufijo()}`;
  let pasajero = null;
  try {
    dbA.users.push(conductor(id, { walletBalance: 0 }));
    await a.persistRecord('users', dbA.users[0]);
    pasajero = await crearPasajero(pool, a, dbA);
    await pool.query(`insert into public.trips (id, payload) values ($1, $2::jsonb)`,
      [viaje, JSON.stringify({ id: viaje, status: 'SEARCHING', driverId: null, passengerId: pasajero })]);

    assert.equal(await a.acceptTripWithReservation({ tripId: viaje, driverId: id, commissionUSD: 1.2, floorUSD: -5, updatedAt: new Date().toISOString() }), 'OK');
    assert.equal(await a.readReservedCommission(id), 1.2, 'la capacidad está comprometida');

    assert.equal(await a.releaseTripReservation(viaje), true, 'se libera');
    assert.equal(await a.readReservedCommission(id), 0, 'y la capacidad vuelve entera');
    assert.equal(await a.releaseTripReservation(viaje), false, 'repetirlo no hace nada');
    assert.equal(await a.readReservedCommission(id), 0);
  } finally {
    await pool.query(`delete from public.trips where id = $1`, [viaje]);
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// §16 · el reconciliador repara lo que dejó un proceso muerto
// --------------------------------------------------------------------------

test('§16 · una reserva viva con el viaje ya cancelado se repara una sola vez', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  const viaje = `trip_pg_${sufijo()}`;
  let pasajero = null;
  try {
    dbA.users.push(conductor(id, { walletBalance: 0 }));
    await a.persistRecord('users', dbA.users[0]);
    pasajero = await crearPasajero(pool, a, dbA);
    await pool.query(`insert into public.trips (id, payload) values ($1, $2::jsonb)`,
      [viaje, JSON.stringify({ id: viaje, status: 'SEARCHING', driverId: null, passengerId: pasajero })]);
    await a.acceptTripWithReservation({ tripId: viaje, driverId: id, commissionUSD: 0.9, floorUSD: -5, updatedAt: new Date().toISOString() });

    // El proceso muere: el viaje se cancela pero la reserva queda viva.
    await pool.query(
      `update public.trips set payload = jsonb_set(payload, '{status}', to_jsonb('CANCELLED'::text), true) where id = $1`,
      [viaje]);
    assert.equal(await a.readReservedCommission(id), 0.9, 'la reserva quedó huérfana');

    const primera = await a.reconcileStaleReservations();
    assert.equal(primera.released, 1, 'el reconciliador la libera');
    assert.equal(await a.readReservedCommission(id), 0, 'y la capacidad vuelve');

    const segunda = await a.reconcileStaleReservations();
    assert.equal(segunda.released, 0, 'y no la libera dos veces');
  } finally {
    await pool.query(`delete from public.trips where id = $1`, [viaje]);
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// §17 · la liquidación cierra la reserva con lo aplicado y lo diferido
// --------------------------------------------------------------------------

test('§17 · al completar, la reserva guarda lo aplicado y lo que quedo a deber', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  const viaje = `trip_pg_${sufijo()}`;
  let pasajero = null;
  try {
    dbA.users.push(conductor(id, { walletBalance: -4.8 }));
    await a.persistRecord('users', dbA.users[0]);
    pasajero = await crearPasajero(pool, a, dbA);
    await pool.query(`insert into public.trips (id, payload) values ($1, $2::jsonb)`,
      [viaje, JSON.stringify({ id: viaje, status: 'SEARCHING', driverId: null, passengerId: pasajero })]);
    // -4.80 con comisión de 1.00: solo caben 0.20 antes del suelo.
    assert.equal(await a.acceptTripWithReservation({ tripId: viaje, driverId: id, commissionUSD: 0.2, floorUSD: -5, updatedAt: new Date().toISOString() }), 'OK');

    assert.equal(await a.settleTripReservation({ tripId: viaje, appliedUSD: 0.2, deferredUSD: 0.8 }), true);
    const { rows } = await pool.query(
      `select status, applied_usd, deferred_usd from public.driver_commission_reservations where trip_id = $1`, [viaje]);
    assert.equal(rows[0].status, 'SETTLED');
    assert.equal(Number(rows[0].applied_usd), 0.2, 'lo aplicado');
    assert.equal(Number(rows[0].deferred_usd), 0.8, 'y la deuda, CON DUEÑO: este viaje');
    assert.equal(await a.readReservedCommission(id), 0, 'ya no ocupa capacidad');
    // Liquidar dos veces no altera nada.
    assert.equal(await a.settleTripReservation({ tripId: viaje, appliedUSD: 99, deferredUSD: 99 }), false);
  } finally {
    await pool.query(`delete from public.trips where id = $1`, [viaje]);
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// §18 · el resultado del mes no lo puede revertir una escritura obsoleta
// --------------------------------------------------------------------------

test('§18 · una escritura obsoleta no revierte el cobro mensual ya hecho', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
  let pasajero = null;
  try {
    const base = conductor(id, { walletBalance: 10, maintenance: { anchorAt: Date.now() - 31 * DIA_MS, lastChargedPeriod: 0, pendingPeriods: [] } });
    dbA.users.push(base);
    await a.persistRecord('users', base);
    dbB.users.push({ ...base });   // la copia vieja de la otra réplica

    const cobrado = await a.chargeDriverMaintenance({
      transaction: {
        id: `transaction_maint_${id}_1`, userId: id, type: 'DRIVER_ACCOUNT_MAINTENANCE',
        maintenancePeriod: 1, amount: -1, currency: 'USD', status: 'APPROVED',
        createdAt: new Date().toISOString()
      },
      driver: { ...base, walletBalance: 9, maintenance: { ...base.maintenance, lastChargedPeriod: 1 } }
    });
    assert.equal(cobrado, 'CHARGED');
    assert.equal(await leerSaldo(pool, id), 9);

    // La réplica perdedora persiste su documento viejo.
    await b.persistRecord('users', dbB.users[0]);

    // El apunte del libro es único e imborrable por esa vía.
    const { rows } = await pool.query(
      `select count(*)::int as n from public.transactions where id = $1`, [`transaction_maint_${id}_1`]);
    assert.equal(rows[0].n, 1, 'un solo apunte, y sigue ahí');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean));
    await pool.end();
  }
});
