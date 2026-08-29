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
 * ⚠ ESTADO: sin ejecutar todavía. Requieren `TEST_DATABASE_URL` apuntando a
 * una base NO productiva (la convención que ya usa
 * `postgresFinalValidation.test.js`). En el entorno donde se escribieron no
 * había ninguna disponible —ni servidor local, ni Docker, ni base de CI— y
 * NUNCA se usa producción para escribir. Sin esa variable se saltan, y
 * mientras se salten no puede afirmarse que las garantías estén probadas.
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

const leerComprometido = async (pool, id) => {
  const { rows } = await pool.query(`select coalesce((payload->>'committedCommission')::numeric, 0) as c from public.users where id = $1`, [id]);
  return rows.length ? Number(rows[0].c) : null;
};

const limpiar = async (pool, ids) => {
  await pool.query(`delete from public.transactions where payload->>'userId' = any($1::text[])`, [ids]);
  await pool.query(`delete from public.users where id = any($1::text[])`, [ids]);
};

// --------------------------------------------------------------------------
// A · dos reservas de comisión concurrentes sobre el MISMO conductor
// --------------------------------------------------------------------------

test('A · dos reservas concurrentes no gastan dos veces la misma capacidad', saltar, async () => {
  const { pool, dbA, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
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
    await limpiar(pool, [id]);
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// B · el mismo mes, cobrado por dos evaluadores a la vez
// --------------------------------------------------------------------------

test('B · el mismo periodo mensual se cobra UNA vez con dos evaluadores', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
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
    await limpiar(pool, [id]);
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// C · la transacción se deshace entera si algo falla dentro
// --------------------------------------------------------------------------

test('C · un fallo dentro de la transaccion no deja ni apunte ni debito', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
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
    await limpiar(pool, [id]);
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// D · reservar y liberar
// --------------------------------------------------------------------------

test('D · lo reservado se libera y la capacidad vuelve', saltar, async () => {
  const { pool, dbA, a } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
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
    await limpiar(pool, [id]);
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// H · dos réplicas anclando el reloj a la vez
// --------------------------------------------------------------------------

test('H · dos replicas convergen en UN solo ancla de estreno', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
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
    await limpiar(pool, [id]);
    await pool.end();
  }
});

// --------------------------------------------------------------------------
// La regresión que exige el encargo (§28): una escritura obsoleta del
// documento completo NO puede borrar lo que la base ya decidió.
// --------------------------------------------------------------------------

/**
 * ⚠ ESTA PRUEBA ESTA ESCRITA PARA FALLAR CON EL CODIGO ACTUAL.
 *
 * Es la demostracion ejecutable del hallazgo critico de la segunda
 * auditoria: `persistRecord` hace un UPSERT del documento COMPLETO, asi que
 * una replica con una copia vieja del conductor borra la reserva que otra
 * acababa de apuntar en la base. Arreglarlo exige mover el estado financiero
 * fuera del documento (ver la migracion propuesta en
 * `migrations/proposals/`), y eso no se implementa a ciegas: sin un
 * PostgreSQL de pruebas no habria forma de comprobar que el arreglo funciona
 * ni de que no rompe el dinero que ya circula.
 *
 * Cuando exista TEST_DATABASE_URL, esta prueba en rojo es el punto de
 * partida del arreglo; en verde, su certificado.
 */
test('§28 · una escritura obsoleta del documento no puede borrar la reserva', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await dosReplicas();
  const id = `drv_pg_${sufijo()}`;
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
    await limpiar(pool, [id]);
    await pool.end();
  }
});
