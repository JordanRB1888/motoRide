import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPostgresPersistence, createPostgresPool } from '../services/postgresPersistence.js';
import { createDriverFinanceStore } from '../services/driverFinanceStore.js';
import { canTakeNewWork } from '../domain/driverFinance.js';

/**
 * DRIVER-FINANCE-1 v5 — las cinco formas de perder dinero que encontró la
 * CUARTA auditoría, cada una con su prueba contra PostgreSQL REAL.
 *
 * Ninguna era teórica. Codex las reprodujo todas:
 *
 *   · una carrera hecha cuyo dinero no se cobró terminaba LIBERADA, y con ella
 *     desaparecían para siempre la comisión y la ganancia del conductor;
 *   · apagar la política devolvía el saldo al documento mientras el disparador
 *     lo reestampaba desde la fila: el conductor cobraba cero;
 *   · la memoria del proceso se adelantaba al commit;
 *   · un bloqueo obsoleto inyectado en el documento sobrevivía a la
 *     proyección;
 *   · y la elegibilidad del Transporte Seguro salía de la copia en memoria.
 *
 * Se ejecutan contra la base indicada en `TEST_DATABASE_URL` (nunca
 * producción: el destino se verifica antes de escribir).
 */

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };

const sufijo = () => `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
const POLITICA = { canTakeNewWork: s => canTakeNewWork(s, { enabled: true }) };
const SUELO = -5;

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

const silencioso = { error() {}, warn() {}, log() {} };

async function montar() {
  const pool = createPostgresPool({ connectionString });
  const dbA = baseVacia();
  const dbB = baseVacia();
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
const leerReserva = async (pool, tripId) => {
  const { rows } = await pool.query(
    `select status, reserved_usd, applied_usd, deferred_usd
       from public.driver_commission_reservations where trip_id = $1`, [tripId]);
  return rows[0] ?? null;
};

async function altaConductor(a, dbA, extra = {}) {
  const id = `drv_v5_${sufijo()}`;
  const doc = conductor(id, extra);
  dbA.users.push(doc);
  assert.equal(await a.persistRecord('users', doc), true);
  await a.ensureDriverFinanceState({ driver: doc, maintenanceAnchorAt: Date.now(), activityAnchorAt: Date.now() });
  return { id, doc };
}

async function crearPasajero(a, dbA) {
  const id = `psg_v5_${sufijo()}`;
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
// §20 · CRÍTICO 1 — una carrera hecha JAMÁS se queda sin cobrar
// ==========================================================================

test('§20 · completada sin apunte: se marca pendiente, NO se libera, y se rescata', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null;
  const viaje = `trip_v5_${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero);
    assert.equal((await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 0.45, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    })).outcome, 'OK');

    // El proceso muere DESPUÉS de completar la carrera y ANTES de cobrarla.
    // No hay ningún apunte en el libro: el dinero nunca se movió.
    await pool.query(
      `update public.trips set payload = payload || '{"status":"COMPLETED"}'::jsonb where id = $1`, [viaje]);

    const reparacion = await a.reconcileStaleReservations({ limit: 50 });
    assert.equal(reparacion.pendingSettlements, 1, 'el reconciliador la reconoce');
    assert.equal(reparacion.released, 0, 'y NO la libera');

    const tras = await leerReserva(pool, viaje);
    assert.equal(tras.status, 'SETTLEMENT_PENDING',
      'la carrera está hecha: su dinero queda pendiente, no borrado');
    assert.equal(await a.readReservedCommission(id), 0.45,
      'y sigue ocupando capacidad, porque sigue debiéndose');

    // Repetir el reconciliador no la mueve.
    const segunda = await a.reconcileStaleReservations({ limit: 50 });
    assert.equal(segunda.pendingSettlements, 0, 'ya no es candidata: está identificada');
    assert.equal((await leerReserva(pool, viaje)).status, 'SETTLEMENT_PENDING');

    // Y aparece en la lista de rescate.
    const pendientes = await a.listPendingSettlements({ limit: 10 });
    assert.ok(pendientes.some(p => p.tripId === viaje), 'la aplicación sabe cuáles rescatar');

    // EL RESCATE: la liquidación normal la cierra, y exactamente una vez.
    const rescate = await a.settleTripForDriver({
      tripId: viaje, driverId: id, commissionUSD: 0.45, creditUSD: 0, builders: CONSTRUCTORES(id)
    });
    assert.equal(rescate.outcome, 'SETTLED', 'ANTES devolvía ALREADY_SETTLED y el dinero se perdía');
    assert.equal(rescate.applied, 0.45);
    assert.equal(await leerSaldo(pool, id), -0.45, 'la comisión se cobró de verdad');

    const repetido = await a.settleTripForDriver({
      tripId: viaje, driverId: id, commissionUSD: 0.45, creditUSD: 0, builders: CONSTRUCTORES(id)
    });
    assert.equal(repetido.outcome, 'ALREADY_SETTLED', 'y solo una vez');
    assert.equal(await leerSaldo(pool, id), -0.45);
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

test('§20b · una carrera hecha nunca se puede LIBERAR, solo liquidar', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null;
  const viaje = `trip_v5_${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero);
    await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 0.45, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    });
    await pool.query(
      `update public.driver_commission_reservations set status = 'SETTLEMENT_PENDING' where trip_id = $1`, [viaje]);

    assert.equal(await a.releaseTripReservation(viaje), false,
      'liberar una carrera ya hecha borraría el dinero de alguien');
    assert.equal((await leerReserva(pool, viaje)).status, 'SETTLEMENT_PENDING');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

// ==========================================================================
// §21 · CRÍTICO 2 — apagar la política no puede tragarse el dinero
// ==========================================================================

test('§21 · con la política APAGADA el conductor sigue cobrando lo suyo', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));
    assert.equal(await leerSaldo(pool, id), 1, 'punto de partida');

    // Exactamente la sonda de Codex: la política se apaga DESPUÉS de que este
    // conductor ya tiene fila. Antes, el crédito volvía al documento y el
    // disparador lo reestampaba: el conductor cobraba cero.
    const r = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(r.outcome, 'CREDITED');
    assert.equal(r.balanceAfter, 3, '1.00 + 2.00');
    assert.equal(await leerSaldo(pool, id), 3, 'Y EL SALDO DURABLE LO REFLEJA');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§21b · apagada, no se cobran obligaciones; el dinero entra entero y espera', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null;
  const viejo = `trip_v5_${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 0 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viejo, pasajero, { status: 'COMPLETED' });
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 0.80, 0, 0.80, 'SETTLED', now())`, [viejo, id]);
    await pool.query(
      `insert into public.driver_maintenance_obligations (id, driver_id, period, amount_usd, status)
       values ($1, $2, 1, 1, 'DUE')`, [`driver-maintenance:${id}:1`, id]);

    const r = await a.creditDriverWallet({
      driverId: id, creditUSD: 5, policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(r.balanceAfter, 5, 'entra entero: apagada, no se cobra nada');
    assert.equal(r.deferredPaid, 0);
    assert.deepEqual(r.maintenancePaidPeriods, []);

    // Y las obligaciones siguen ahí, esperando: nada se perdonó.
    const { rows } = await pool.query(
      `select count(*)::int as n from public.driver_maintenance_obligations
        where driver_id = $1 and status = 'DUE'`, [id]);
    assert.equal(rows[0].n, 1, 'la obligación espera, no desaparece');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viejo]);
    await pool.end();
  }
});

// ==========================================================================
// §22 · ALTO 2 — la memoria no se adelanta al commit
// ==========================================================================

test('§22 · un commit que falla NO deja al proceso creyendo lo que no se guardó', saltar, async () => {
  const pool = createPostgresPool({ connectionString });
  const dbA = baseVacia();
  const a = await createPostgresPersistence({ pool, database: dbA, logger: silencioso });
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 10 }));

    // Un pozo de conexiones IDÉNTICO al real, salvo que el `commit` revienta.
    // Todo lo demás es PostgreSQL de verdad: la transacción se abre, escribe
    // y solo el desenlace se rompe, que es exactamente el caso peligroso.
    const poolSaboteado = {
      connect: async () => {
        const client = await pool.connect();
        const original = client.query.bind(client);
        client.query = (texto, valores) => {
          if (typeof texto === 'string' && texto.trim().toLowerCase() === 'commit') {
            return Promise.reject(new Error('conexión perdida al confirmar'));
          }
          return original(texto, valores);
        };
        const soltar = client.release.bind(client);
        client.release = (...args) => { delete client.query; return soltar(...args); };
        return client;
      },
      query: (...args) => pool.query(...args)
    };

    const anotaciones = [];
    const almacen = createDriverFinanceStore({
      pool: poolSaboteado,
      logger: silencioso,
      syncShadow: (tabla, idFila, payload) => anotaciones.push([tabla, idFila, payload])
    });

    const r = await almacen.creditDriverWallet({
      driverId: id, creditUSD: 5, builders: CONSTRUCTORES(id)
    });

    assert.equal(r.outcome, 'AMBIGUOUS',
      'un commit perdido no es un fallo ni un éxito: es una incógnita, y se dice');
    assert.deepEqual(anotaciones, [],
      'LA MEMORIA NO SE MOVIÓ: antes ya afirmaba filas que la base nunca guardó');
    assert.equal(await leerSaldo(pool, id), 10, 'y el saldo durable sigue intacto');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§22b · si el commit se pierde pero SÍ entró, la base lo resuelve y la memoria se pone al día', saltar, async () => {
  const pool = createPostgresPool({ connectionString });
  const dbA = baseVacia();
  const a = await createPostgresPersistence({ pool, database: dbA, logger: silencioso });
  let id = null; let pasajero = null;
  const viaje = `trip_v5_${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 5 }));
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viaje, pasajero);
    await a.acceptTripWithReservation({
      tripId: viaje, driverId: id, commissionUSD: 0.45, floorUSD: SUELO,
      updatedAt: new Date().toISOString(), policy: POLITICA
    });

    // Aquí el `commit` SÍ se ejecuta y solo se pierde la respuesta: la
    // transacción entró, pero el cliente no llegó a enterarse. Es el caso más
    // difícil, y el único correcto es preguntarle a la base.
    const poolSaboteado = {
      connect: async () => {
        const client = await pool.connect();
        const original = client.query.bind(client);
        client.query = async (texto, valores) => {
          if (typeof texto === 'string' && texto.trim().toLowerCase() === 'commit') {
            await original('commit');
            throw new Error('respuesta perdida tras confirmar');
          }
          return original(texto, valores);
        };
        const soltar = client.release.bind(client);
        client.release = (...args) => { delete client.query; return soltar(...args); };
        return client;
      },
      query: (...args) => pool.query(...args)
    };
    const anotaciones = [];
    const almacen = createDriverFinanceStore({
      pool: poolSaboteado, logger: silencioso,
      syncShadow: (tabla, idFila, payload) => anotaciones.push([tabla, idFila, payload])
    });

    const r = await almacen.settleTripForDriver({
      tripId: viaje, driverId: id, commissionUSD: 0.45, creditUSD: 0, builders: CONSTRUCTORES(id)
    });
    assert.equal(r.outcome, 'SETTLED', 'la base dice que entró, y eso es lo que vale');
    assert.ok(anotaciones.length > 0, 'y solo entonces la memoria se pone al día');
    assert.equal((await leerReserva(pool, viaje)).status, 'SETTLED');
    assert.equal(await leerSaldo(pool, id), 4.55, '5.00 − 0.45');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viaje]);
    await pool.end();
  }
});

// ==========================================================================
// §25 · MEDIO 1 — un bloqueo obsoleto no sobrevive a la proyección
// ==========================================================================

test('§25 · un documento obsoleto no puede INYECTAR un bloqueo que la base no tiene', saltar, async () => {
  const { pool, dbA, dbB, a, b } = await montar();
  let id = null;
  try {
    const alta = await altaConductor(a, dbA, { walletBalance: 4 });
    id = alta.id;
    // La fila autoritativa NUNCA estuvo bloqueada: ni activa, ni levantada.
    const { rows } = await pool.query(
      `select block_active, block_cleared_at from public.driver_finance_state where driver_id = $1`, [id]);
    assert.equal(rows[0].block_active, false);
    assert.equal(rows[0].block_cleared_at, null, 'nunca bloqueada, nunca levantada');

    // Y llega un documento que afirma lo contrario.
    dbB.users.push({ ...alta.doc, financialBlock: { active: true, reason: 'FINANCIAL_BALANCE_BLOCK' } });
    await b.persistRecord('users', dbB.users[0]);

    const doc = await leerDocumento(pool, id);
    assert.equal(doc.financialBlock.active, false,
      'la proyección escribe el bloqueo en LOS DOS SENTIDOS: antes solo lo escribía si la fila decía algo, y un bloqueo inyectado pasaba intacto');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// §23 · ALTO 3 — la elegibilidad del reparto sale de la BASE
// ==========================================================================

test('§23 · la lectura bloqueada dice lo que dice la BASE, no lo que cree el proceso', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null; let pasajero = null;
  const viejo = `trip_v5_${sufijo()}`;
  try {
    const alta = await altaConductor(a, dbA, { walletBalance: 10 });
    id = alta.id;
    pasajero = await crearPasajero(a, dbA);
    await crearViaje(pool, viejo, pasajero, { status: 'COMPLETED' });
    // El documento en memoria de ESTE proceso sigue diciendo que puede.
    assert.equal(canTakeNewWork(alta.doc, { enabled: true }), true);

    // Otra réplica lo bloquea en la base y le deja una deuda CON DUEÑO. Hace
    // falta lo segundo: con saldo positivo y cero obligaciones el bloqueo se
    // levanta solo, que es exactamente la política del dueño.
    await pool.query(
      `insert into public.driver_commission_reservations
         (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
       values ($1, $2, 0.80, 0, 0.80, 'SETTLED', now())`, [viejo, id]);
    assert.equal((await a.setFinancialBlock({ driverId: id, active: true })).outcome, 'BLOCKED');

    const lectura = await a.readEligibilityLocked(id);
    assert.equal(lectura.ok, true);
    assert.equal(lectura.found, true);
    assert.equal(canTakeNewWork(lectura.snapshot, { enabled: true }), false,
      'la autoridad dice NO aunque la copia en memoria diga que sí');
  } finally {
    await limpiar(pool, [id, pasajero].filter(Boolean), [viejo]);
    await pool.end();
  }
});

test('§23b · quien NO está en el libro se distingue de quien no se pudo leer', saltar, async () => {
  const { pool, a } = await montar();
  try {
    const lectura = await a.readEligibilityLocked(`drv_inexistente_${sufijo()}`);
    assert.equal(lectura.ok, true, 'la lectura salió bien...');
    assert.equal(lectura.found, false, '...y dice que este conductor no está en el libro');
    assert.equal(lectura.snapshot, null);
  } finally {
    await pool.end();
  }
});

// ==========================================================================
// §17 · el suelo de deuda, declarado por la BASE
// ==========================================================================

test('§17 · la base RECHAZA por sí sola un saldo por debajo de −$5', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 0 }));
    await assert.rejects(
      () => pool.query(
        `update public.driver_finance_state set wallet_balance_usd = -5.01 where driver_id = $1`, [id]),
      error => {
        assert.match(error.message, /driver_finance_state_suelo/,
          'defensa en profundidad: aunque un camino nuevo se olvidara del suelo, la base no le deja hundir a nadie');
        return true;
      }
    );
    // Y exactamente −5.00 sí se admite: el suelo es el límite, no una barrera
    // que impida llegar a él.
    await pool.query(`update public.driver_finance_state set wallet_balance_usd = -5.00 where driver_id = $1`, [id]);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§17b · quien YA venía más abajo del suelo se siembra exento, y deja de estarlo al subir', saltar, async () => {
  const { pool, dbA, a } = await montar();
  const id = `drv_v5_${sufijo()}`;
  try {
    // Un conductor con deuda ANTERIOR a la política: −$8. Rechazarlo sería
    // impedir que entre al libro; el suelo protege de hundirse más, no sirve
    // para negar una deuda que la plataforma ya había permitido.
    const doc = conductor(id, { walletBalance: -8 });
    dbA.users.push(doc);
    await a.persistRecord('users', doc);
    const snapshot = await a.ensureDriverFinanceState({
      driver: doc, maintenanceAnchorAt: Date.now(), activityAnchorAt: Date.now()
    });
    assert.equal(snapshot.walletBalance, -8, 'entra tal cual, sin inventarle un saldo');
    const { rows } = await pool.query(
      `select floor_exempt from public.driver_finance_state where driver_id = $1`, [id]);
    assert.equal(rows[0].floor_exempt, true, 'y queda marcado como exento');

    // Recarga hasta positivo: la exención se retira sola.
    await a.creditDriverWallet({ driverId: id, creditUSD: 10, builders: CONSTRUCTORES(id) });
    const tras = await pool.query(
      `select wallet_balance_usd, floor_exempt from public.driver_finance_state where driver_id = $1`, [id]);
    assert.equal(Number(tras.rows[0].wallet_balance_usd), 2);
    assert.equal(tras.rows[0].floor_exempt, false, 'a partir de aquí el suelo lo protege como a todos');
  } finally {
    await limpiar(pool, [id]);
    await pool.end();
  }
});

// ==========================================================================
// §19 · el orden de cerrojos y su tope de espera
// ==========================================================================

test('§19 · un cerrojo ajeno no cuelga la operación: expira y no escribe nada', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  const almacenImpaciente = createDriverFinanceStore({
    pool, logger: silencioso, lockTimeoutMs: 700, statementTimeoutMs: 4000
  });
  const cliente = await pool.connect();
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 10 }));
    // Alguien retiene la fila del conductor sin soltarla.
    await cliente.query('begin');
    await cliente.query(`select 1 from public.driver_finance_state where driver_id = $1 for update`, [id]);

    const inicio = Date.now();
    const r = await almacenImpaciente.creditDriverWallet({
      driverId: id, creditUSD: 3, builders: CONSTRUCTORES(id)
    });
    const tardanza = Date.now() - inicio;

    assert.equal(r.outcome, 'FAILED', 'falla cerrado en vez de colgarse para siempre');
    assert.ok(tardanza < 12_000, `y falla pronto (tardó ${tardanza} ms)`);
    await cliente.query('rollback');
    assert.equal(await leerSaldo(pool, id), 10, 'sin escribir nada: lo que no entró, no entró');
  } finally {
    try { await cliente.query('rollback'); } catch {}
    cliente.release();
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});
