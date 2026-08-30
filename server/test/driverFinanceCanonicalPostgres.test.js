import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPostgresPersistence, createPostgresPool } from '../services/postgresPersistence.js';

/**
 * DRIVER-FINANCE-1 v10 — una sola forma canonica, y la base la exige.
 *
 * La novena auditoria encontro que `~ '\S'` NO es equivalente al `trim` de
 * JavaScript, y saco dos consecuencias del mismo hueco:
 *
 *   1. PostgreSQL acepto un `source_id` compuesto solo por un BOM (U+FEFF),
 *      que para la aplicacion es la cadena vacia;
 *   2. un testigo de v8 guardado como `'  topup-id  '` pasaba la migracion, y
 *      un reintento con `'topup-id'` no lo encontraba en el indice unico y
 *      volvia a acreditar. Saldo 1.00 -> 3.00 -> 5.00, con el indice puesto.
 *
 * La regla que cierra las dos puertas es una sola: el valor GUARDADO tiene que
 * ser identico a su forma canonica.
 *
 * En este fichero los caracteres invisibles se escriben SIEMPRE por su punto
 * de codigo. Un espacio duro o un BOM literales en el fuente son indistinguibles
 * de un espacio normal al leerlos, y estas pruebas tratan justo de eso.
 *
 * Todo contra la base indicada en `TEST_DATABASE_URL` (nunca produccion).
 */

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };

const sufijo = () => `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
const silencioso = { error() {}, warn() {}, log() {} };

/**
 * Los 25 caracteres que recorta `String.prototype.trim` de ECMAScript, que son
 * exactamente los que enumera la restriccion de la base.
 *
 * U+200B (espacio de ancho cero) NO esta, y es deliberado: JavaScript tampoco
 * lo recorta. Ahi es contenido, no relleno.
 */
const PUNTOS_BLANCOS = [
  0x0009, 0x000A, 0x000B, 0x000C, 0x000D, 0x0020, 0x00A0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF
];
const BLANCO_ECMASCRIPT = PUNTOS_BLANCOS.map(cp => String.fromCodePoint(cp)).join('');
const ch = cp => String.fromCodePoint(cp);

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
const contarTestigos = async (pool, id) => {
  const { rows } = await pool.query(
    `select count(*)::int as n from public.driver_money_operations where driver_id = $1`, [id]);
  return rows[0].n;
};

async function altaConductor(a, dbA, extra = {}) {
  const id = `drv_v10_${sufijo()}`;
  const doc = conductor(id, extra);
  dbA.users.push(doc);
  assert.equal(await a.persistRecord('users', doc), true);
  await a.ensureDriverFinanceState({ driver: doc, maintenanceAnchorAt: Date.now(), activityAnchorAt: Date.now() });
  return { id, doc };
}

const limpiar = async (pool, ids) => {
  await pool.query(`delete from public.driver_money_operations where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_inactivity_warnings where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_maintenance_obligations where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_commission_reservations where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.driver_finance_state where driver_id = any($1::text[])`, [ids]);
  await pool.query(`delete from public.transactions where payload->>'userId' = any($1::text[])`, [ids]);
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
// A/B · JavaScript y PostgreSQL tienen que recortar EXACTAMENTE lo mismo
// ==========================================================================

test('§3 · el trim de JavaScript y el de la base coinciden, caracter a caracter', saltar, async () => {
  // No se supone la equivalencia: se comprueba sobre todo el rango donde
  // ECMAScript define espacio en blanco, mas los casos que suelen colarse.
  // Una sola consulta, porque son doce mil comparaciones.
  const pool = createPostgresPool({ connectionString });
  try {
    const puntos = [];
    for (let cp = 1; cp <= 0x3010; cp++) puntos.push(cp);
    puntos.push(0xFEFF, 0x200B, 0x180E, 0xFFFD);
    const muestras = puntos.map(cp => `${ch(cp)}x${ch(cp)}`);

    const { rows } = await pool.query(
      `select btrim(m, $2) as pg, ord from unnest($1::text[]) with ordinality as u(m, ord)`,
      [muestras, BLANCO_ECMASCRIPT]);
    assert.equal(rows.length, puntos.length, 'se comparo todo el rango, no una muestra');

    const desacuerdos = rows
      .filter(fila => muestras[Number(fila.ord) - 1].trim() !== fila.pg)
      .map(fila => `U+${puntos[Number(fila.ord) - 1].toString(16).toUpperCase().padStart(4, '0')}`);
    assert.deepEqual(desacuerdos, [],
      'la aplicacion y la base tienen que entender lo mismo por «forma canonica»');

    // Y las dos exclusiones que importan, dichas explicitamente.
    const zwsp = ch(0x200B);
    assert.equal(`${zwsp}x${zwsp}`.trim(), `${zwsp}x${zwsp}`,
      'U+200B es CONTENIDO: ni JavaScript ni la base lo recortan');
    assert.equal(`${ch(0xFEFF)}x`.trim(), 'x', 'U+FEFF si es relleno');
  } finally {
    await pool.end();
  }
});

// ==========================================================================
// A/B · BOM, NBSP y companía: rechazados por los dos lados
// ==========================================================================

test('§3 · un origen de solo BOM, NBSP u otro blanco Unicode se rechaza', saltar, async () => {
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    const rellenos = [
      ['BOM U+FEFF', ch(0xFEFF)],
      ['NBSP U+00A0', ch(0x00A0)],
      ['espacio fino U+2009', ch(0x2009)],
      ['separador de linea U+2028', ch(0x2028)],
      ['espacio ideografico U+3000', ch(0x3000)],
      ['CRLF', '\r\n'],
      ['mezcla', `${ch(0xFEFF)}${ch(0x00A0)}\t${ch(0x3000)}\n`]
    ];

    for (const [etiqueta, relleno] of rellenos) {
      const r = await a.creditDriverWallet({
        driverId: id, creditUSD: 2, operationId: `topup:vacio-${sufijo()}`,
        sourceType: 'TOPUP', sourceId: relleno,
        policyEnabled: false, builders: CONSTRUCTORES(id)
      });
      assert.equal(r.outcome, 'OPERATION_ID_REQUIRED', `${etiqueta}: no identifica nada`);
      assert.equal(await leerEstado(pool, id), 1, `${etiqueta}: el saldo no se movio`);
      assert.equal(await contarTestigos(pool, id), 0, `${etiqueta}: ningun testigo`);
    }

    // Y la base tambien, sin pasar por la aplicacion.
    for (const cp of [0xFEFF, 0x00A0, 0x3000]) {
      await assert.rejects(
        () => pool.query(
          `insert into public.driver_money_operations
             (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
           values ($1, $2, 'CREDIT', 1, 1, 'TOPUP', $3)`,
          [`directo-${sufijo()}`, id, ch(cp)]),
        error => {
          assert.match(error.message, /origen_no_vacio/,
            `U+${cp.toString(16).toUpperCase()} tiene que rechazarlo la BASE`);
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
// C · lo GUARDADO tiene que estar ya en forma canonica
// ==========================================================================

test('§4 · la base rechaza un origen con relleno en los bordes', saltar, async () => {
  // Es lo que abre la puerta economica: si `'  topup-id  '` puede guardarse,
  // el indice unico no lo relaciona con `'topup-id'`.
  const { pool, dbA, a } = await montar();
  let id = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    const noCanonicos = [
      ['espacios alrededor', '  request-123  '],
      ['espacio al final', 'request-123 '],
      ['tabulador delante', '\trequest-123'],
      ['BOM delante', `${ch(0xFEFF)}request-123`],
      ['NBSP al final', `request-123${ch(0x00A0)}`]
    ];

    for (const [etiqueta, valor] of noCanonicos) {
      await assert.rejects(
        () => pool.query(
          `insert into public.driver_money_operations
             (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
           values ($1, $2, 'CREDIT', 1, 1, 'TOPUP', $3)`,
          [`directo-${sufijo()}`, id, valor]),
        error => {
          assert.match(error.message, /origen_no_vacio/, `${etiqueta}: no esta en forma canonica`);
          return true;
        }
      );
    }

    // Y el tipo de origen, igual — aunque ahi choque antes con el juego cerrado.
    await assert.rejects(
      () => pool.query(
        `insert into public.driver_money_operations
           (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
         values ($1, $2, 'CREDIT', 1, 1, ' TOPUP ', 'algo-real')`,
        [`directo-${sufijo()}`, id]),
      () => true
    );

    assert.equal(await contarTestigos(pool, id), 0, 'nada entro');

    // Lo canonico si entra, por supuesto.
    const bueno = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:ok-${sufijo()}`,
      sourceType: 'TOPUP', sourceId: `request-${sufijo()}`,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(bueno.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 3);
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

// ==========================================================================
// D/F · la reproduccion economica exacta
// ==========================================================================

test('§7 · con relleno y sin relleno son el MISMO hecho: 1.00 -> 3.00, nunca 5.00', saltar, async () => {
  // La reproduccion de Codex, importe por importe. La aplicacion acepta el
  // valor con relleno y lo canonicaliza ANTES de mover el dinero, asi que el
  // reintento sin relleno encuentra el mismo origen.
  const { pool, dbA, a } = await montar();
  let id = null;
  const solicitud = `topup-id-${sufijo()}`;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));

    const conRelleno = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:a-${solicitud}`,
      sourceType: ' TOPUP ', sourceId: `  ${solicitud}  `,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(conRelleno.outcome, 'CREDITED');
    assert.equal(await leerEstado(pool, id), 3, '1.00 + 2.00');

    const { rows } = await pool.query(
      `select source_type, source_id from public.driver_money_operations where driver_id = $1`, [id]);
    assert.equal(rows[0].source_id, solicitud, 'se guardo en forma canonica');
    assert.equal(rows[0].source_type, 'TOPUP');

    const sinRelleno = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:b-${solicitud}`,
      sourceType: 'TOPUP', sourceId: solicitud,
      policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(sinRelleno.outcome, 'ALREADY_APPLIED',
      'el relleno de los bordes no convierte una solicitud en otra');
    assert.equal(await leerEstado(pool, id), 3, 'SALDO 3.00, NO 5.00');
    assert.equal(await contarTestigos(pool, id), 1, 'y un solo testigo');
  } finally {
    await limpiar(pool, [id].filter(Boolean));
    await pool.end();
  }
});

test('§8 · las garantias de origen de las rondas anteriores siguen en pie', saltar, async () => {
  const { pool, dbA, a } = await montar();
  const otra = createPostgresPool({ connectionString });
  const dbB = baseVacia();
  const b = await createPostgresPersistence({ pool: otra, database: dbB, logger: silencioso });
  let id = null;
  let otroId = null;
  try {
    ({ id } = await altaConductor(a, dbA, { walletBalance: 1 }));
    ({ id: otroId } = await altaConductor(a, dbA, { walletBalance: 4 }));

    // Mismo origen, otra identidad de operacion -> un solo efecto.
    const uno = `request-uno-${sufijo()}`;
    await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:x-${uno}`,
      sourceType: 'TOPUP', sourceId: uno, policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    const repetida = await a.creditDriverWallet({
      driverId: id, creditUSD: 2, operationId: `topup:y-${uno}`,
      sourceType: 'TOPUP', sourceId: uno, policyEnabled: false, builders: CONSTRUCTORES(id)
    });
    assert.equal(repetida.outcome, 'ALREADY_APPLIED');
    assert.equal(await leerEstado(pool, id), 3);

    // Mismo origen, OTRO conductor -> conflicto, sin mover a ninguno.
    const conflicto = await a.creditDriverWallet({
      driverId: otroId, creditUSD: 2, operationId: `topup:z-${uno}`,
      sourceType: 'TOPUP', sourceId: uno, policyEnabled: false, builders: CONSTRUCTORES(otroId)
    });
    assert.equal(conflicto.outcome, 'SOURCE_IDENTITY_CONFLICT');
    assert.equal(await leerEstado(pool, otroId), 4);

    // Dos procesos SIMULTANEOS con el mismo origen -> un solo efecto.
    const dos = `request-dos-${sufijo()}`;
    const [p, q] = await Promise.all([
      a.creditDriverWallet({
        driverId: otroId, creditUSD: 2, operationId: `topup:p-${dos}`,
        sourceType: 'TOPUP', sourceId: dos, policyEnabled: false, builders: CONSTRUCTORES(otroId)
      }),
      b.creditDriverWallet({
        driverId: otroId, creditUSD: 2, operationId: `topup:q-${dos}`,
        sourceType: 'TOPUP', sourceId: dos, policyEnabled: false, builders: CONSTRUCTORES(otroId)
      })
    ]);
    assert.deepEqual([p.outcome, q.outcome].sort(), ['ALREADY_APPLIED', 'CREDITED']);
    assert.equal(await leerEstado(pool, otroId), 6, 'el dinero entro una vez');

    // Y el primitivo de los retiros que vienen sigue listo.
    const retiro = `retiro-${sufijo()}`;
    const salida = await a.debitDriverWallet({
      driverId: otroId, amountUSD: 2, operationId: `withdrawal:${retiro}`,
      sourceType: 'WITHDRAWAL', sourceId: retiro
    });
    assert.equal(salida.outcome, 'DEBITED');
    const regenerado = await a.debitDriverWallet({
      driverId: otroId, amountUSD: 2, operationId: `withdrawal:otro-${retiro}`,
      sourceType: 'WITHDRAWAL', sourceId: retiro
    });
    assert.equal(regenerado.outcome, 'ALREADY_APPLIED', 'otro nombre no vuelve a sacar dinero');
    assert.equal(await leerEstado(pool, otroId), 4);
  } finally {
    await limpiar(pool, [id, otroId].filter(Boolean));
    await otra.end();
    await pool.end();
  }
});
