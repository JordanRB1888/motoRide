import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { FINANCE_TABLES } from '../services/driverFinanceStore.js';

/**
 * DRIVER-FINANCE-1 v4 — el contrato de la migración del libro contable.
 *
 * La tercera auditoría encontró un defecto de despliegue, no de código: el
 * esquema vivía en `supabase/migrations/proposals/`, y el migrador de
 * producción solo enumera los `.sql` del directorio padre. Desplegar por el
 * procedimiento normal NO habría instalado las tablas, y el código habría
 * arrancado contra un esquema que no existe.
 *
 * Estas pruebas cierran ese agujero por delante (el fichero está donde el
 * migrador mira) y por detrás (aplicarlo dos veces es seguro, y aplicarlo
 * sobre un esquema incompatible FALLA CLARO en vez de seguir en silencio).
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directorio = path.join(raiz, 'supabase', 'migrations');
const NOMBRE = '20260829180000_driver_finance_ledger.sql';
const sql = fs.readFileSync(path.join(directorio, NOMBRE), 'utf8');

// La MISMA regla que usa `runPostgresMigrations`: readdir + filtro .sql, sin
// recursión. Si el fichero no aparece aquí, producción no lo aplicaría.
const enumeradosPorElMigrador = fs.readdirSync(directorio)
  .filter(nombre => nombre.endsWith('.sql')).sort();

test('la migración del libro contable ESTÁ donde el migrador de producción mira', () => {
  assert.ok(enumeradosPorElMigrador.includes(NOMBRE),
    'el migrador solo enumera el directorio padre: una subcarpeta no se aplicaría nunca');
  assert.ok(!fs.existsSync(path.join(directorio, 'proposals')),
    'no puede quedar una propuesta paralela: dos esquemas distintos confunden a quien despliega');
  // Y es la última: se aplica después de las tablas a las que referencia.
  assert.equal(enumeradosPorElMigrador.at(-1), NOMBRE);
});

test('la migración crea las cuatro tablas del libro y el disparador de proyección', () => {
  const minusculas = sql.toLowerCase();
  for (const tabla of FINANCE_TABLES) {
    assert.ok(minusculas.includes(`create table if not exists public.${tabla}`), `falta ${tabla}`);
    assert.ok(minusculas.includes(`alter table public.${tabla} enable row level security`), `sin RLS: ${tabla}`);
    assert.ok(minusculas.includes(`revoke all on public.${tabla} from anon, authenticated`), `sin revoke: ${tabla}`);
  }
  assert.ok(minusculas.includes('create trigger driver_finance_project_trg'),
    'sin el disparador, `users.payload` seguiría siendo autoridad financiera');
});

test('la migración declara la identidad de cada operación de dinero', () => {
  const minusculas = sql.toLowerCase();
  assert.ok(minusculas.includes('create table if not exists public.driver_money_operations'),
    'sin identidad durable, un reintento vuelve a mover el dinero');
  assert.ok(minusculas.includes('operation_id text primary key'),
    'y la clave primaria es la que lo impide');
  assert.ok(minusculas.includes("check (kind in ('credit', 'debit'))"));
});

test('la migración declara el suelo de deuda y el estado que salva una carrera hecha', () => {
  const minusculas = sql.toLowerCase();
  assert.ok(minusculas.includes('driver_finance_state_suelo'),
    'el suelo de −$5 tiene que estar también en la base: defensa en profundidad');
  assert.ok(minusculas.includes("check (floor_exempt or wallet_balance_usd >= -5.00)"),
    'con la exención para quien ya venía por debajo antes de la política');
  assert.ok(minusculas.includes("'settlement_pending'"),
    'una carrera completada sin cobrar necesita un estado propio: liberarla borraría el dinero de alguien');
  assert.ok(minusculas.includes('driver_maintenance_obligations_transaction_fk'),
    'una obligación pagada tiene que apuntar a un apunte que EXISTE');
});

test('la migración NO mueve dinero: solo crea estructura', () => {
  const cuerpo = sql.toLowerCase()
    // Los comentarios explican el problema y citan importes; no son ejecución.
    .split('\n').filter(linea => !linea.trim().startsWith('--')).join('\n');
  for (const prohibido of ['update public.users', 'update public.transactions', 'insert into public.users']) {
    assert.ok(!cuerpo.includes(prohibido), `la migración no puede tocar datos existentes: ${prohibido}`);
  }
});

// ---------------------------------------------------------------------------
// Contra PostgreSQL real
// ---------------------------------------------------------------------------

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };

test('aplicarla sobre una base YA migrada vuelve a salir bien', saltar, async () => {
  const cliente = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    // La base de pruebas ya la tiene aplicada: repetirla no puede romper nada
    // ni duplicar restricciones.
    await cliente.query('begin');
    await cliente.query(sql);
    await cliente.query('commit');

    const { rows } = await cliente.query(
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'public' and table_name = any($1::text[])`, [FINANCE_TABLES]);
    assert.equal(rows[0].n, FINANCE_TABLES.length, 'las cuatro tablas siguen ahí');
    const { rows: disparador } = await cliente.query(
      `select count(*)::int as n from pg_trigger where tgname = 'driver_finance_project_trg'`);
    assert.equal(disparador.rows?.[0]?.n ?? disparador[0].n, 1, 'y un solo disparador');
  } finally {
    await cliente.end();
  }
});

test('un TIPO incompatible se rechaza ANTES de tocar nada', saltar, async () => {
  // El hallazgo de la cuarta auditoría: la comprobación miraba solo los
  // NOMBRES de las columnas. Codex recreó `threshold_days` como `text`
  // conservándolos todos, y la migración lo aceptó — el código habría
  // escrito dinero contra un esquema que no es el que espera.
  const cliente = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    await cliente.query('begin');
    await cliente.query('drop table public.driver_inactivity_warnings cascade');
    await cliente.query(`create table public.driver_inactivity_warnings (
      driver_id text not null,
      anchor_at bigint not null,
      threshold_days text not null,
      claimed_at timestamptz not null default now(),
      delivered_at timestamptz,
      constraint driver_inactivity_warnings_pk primary key (driver_id, anchor_at, threshold_days),
      constraint driver_inactivity_warnings_driver_fk
        foreign key (driver_id) references public.users(id) on delete cascade)`);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_INCOMPATIBLE/,
          'todas las columnas están: lo que falla es el TIPO, y hay que decirlo');
        assert.match(error.message, /threshold_days/);
        assert.match(error.message, /es text, se espera integer/);
        return true;
      }
    );
  } finally {
    await cliente.query('rollback').catch(() => {});
    await cliente.end();
  }
});

test('una precisión de dinero equivocada también se rechaza', saltar, async () => {
  // `numeric(10,0)` guardaría el saldo SIN céntimos: cada cobro se redondearía
  // a dólares enteros. Es exactamente la clase de deriva silenciosa que no
  // puede pasar desapercibida.
  const cliente = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    await cliente.query('begin');
    await cliente.query('alter table public.driver_finance_state alter column wallet_balance_usd type numeric(10,0)');
    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_INCOMPATIBLE/);
        assert.match(error.message, /wallet_balance_usd/);
        return true;
      }
    );
  } finally {
    await cliente.query('rollback').catch(() => {});
    await cliente.end();
  }
});

test('sobre un esquema INCOMPATIBLE falla claro, no sigue en silencio', saltar, async () => {
  const cliente = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    // Todo esto ocurre dentro de una transacción que se deshace: la base de
    // pruebas queda exactamente como estaba.
    await cliente.query('begin');
    await cliente.query('drop table public.driver_inactivity_warnings cascade');
    // La forma VIEJA: sin `anchor_at` ni `threshold_days`, que es justo lo que
    // `create table if not exists` aceptaría sin rechistar.
    await cliente.query(`create table public.driver_inactivity_warnings (
      driver_id text not null,
      claimed_at timestamptz not null default now(),
      constraint driver_inactivity_warnings_pk primary key (driver_id),
      constraint driver_inactivity_warnings_driver_fk
        foreign key (driver_id) references public.users(id) on delete cascade)`);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_INCOMPATIBLE/,
          'el migrador debe decir QUÉ falta, no arrancar contra un esquema ajeno');
        assert.match(error.message, /anchor_at/);
        return true;
      }
    );
  } finally {
    await cliente.query('rollback').catch(() => {});
    await cliente.end();
  }
});

// ---------------------------------------------------------------------------
// v6 · los CAMINOS de actualización, contra PostgreSQL real
// ---------------------------------------------------------------------------
//
// La quinta auditoría encontró que la comprobación previa exigía columnas que
// la propia migración iba a crear unas líneas después: actualizar desde el
// esquema anterior era imposible. La prueba oficial arrancaba desde un esquema
// ya actualizado y por eso no lo veía.
//
// Todo lo que sigue ocurre dentro de una transacción que se deshace: la base
// de pruebas queda exactamente como estaba.

const TABLAS_DEL_LIBRO = [
  'driver_money_operations',
  'driver_inactivity_warnings',
  'driver_maintenance_obligations',
  'driver_commission_reservations',
  'driver_finance_state'
];

/** El esquema ANTERIOR, tal y como quedó en la ronda pasada: sin
 *  `floor_exempt`, sin `SETTLEMENT_PENDING` y sin la tabla de operaciones. */
const ESQUEMA_ANTERIOR = `
  create table public.driver_commission_reservations (
    trip_id text primary key,
    driver_id text not null,
    reserved_usd numeric(10, 2) not null check (reserved_usd >= 0),
    applied_usd numeric(10, 2) not null default 0 check (applied_usd >= 0),
    deferred_usd numeric(10, 2) not null default 0 check (deferred_usd >= 0),
    deferred_paid_usd numeric(10, 2) not null default 0 check (deferred_paid_usd >= 0),
    status text not null default 'RESERVED'
      check (status in ('RESERVED', 'SETTLED', 'RELEASED')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    constraint driver_commission_reservations_driver_fk
      foreign key (driver_id) references public.users(id)
      on delete no action deferrable initially deferred
  );
  create table public.driver_maintenance_obligations (
    id text primary key,
    driver_id text not null,
    period integer not null check (period >= 1),
    amount_usd numeric(10, 2) not null check (amount_usd > 0),
    status text not null default 'DUE' check (status in ('DUE', 'PAID')),
    transaction_id text,
    created_at timestamptz not null default now(),
    paid_at timestamptz,
    constraint driver_maintenance_obligations_unico unique (driver_id, period),
    constraint driver_maintenance_obligations_driver_fk
      foreign key (driver_id) references public.users(id)
      on delete no action deferrable initially deferred
  );
  create table public.driver_finance_state (
    driver_id text primary key,
    wallet_balance_usd numeric(12, 2) not null default 0,
    deferred_commission_usd numeric(12, 2) not null default 0,
    maintenance_anchor_at bigint,
    last_charged_period integer not null default 0,
    activity_anchor_at bigint,
    last_qualifying_trip_at bigint,
    inactivity_warned_threshold integer,
    block_active boolean not null default false,
    block_reason text,
    block_since timestamptz,
    block_cleared_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint driver_finance_state_driver_fk
      foreign key (driver_id) references public.users(id)
      on delete no action deferrable initially deferred
  );
  create table public.driver_inactivity_warnings (
    driver_id text not null,
    anchor_at bigint not null,
    threshold_days integer not null check (threshold_days > 0),
    claimed_at timestamptz not null default now(),
    delivered_at timestamptz,
    constraint driver_inactivity_warnings_pk primary key (driver_id, anchor_at, threshold_days),
    constraint driver_inactivity_warnings_driver_fk
      foreign key (driver_id) references public.users(id) on delete cascade
  );
`;

const columnaExiste = async (cliente, tabla, columna) => {
  const { rows } = await cliente.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = $2`, [tabla, columna]);
  return rows.length === 1;
};

const tablaExiste = async (cliente, tabla) => {
  const { rows } = await cliente.query(`select to_regclass('public.' || $1) as t`, [tabla]);
  return rows[0].t !== null;
};

async function enTransaccionDeshecha(cuerpo) {
  const cliente = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    await cliente.query('begin');
    await cuerpo(cliente);
  } finally {
    await cliente.query('rollback').catch(() => {});
    await cliente.end();
  }
}

test('v6 · desde el esquema ANTERIOR, la migración actualiza sin quejarse', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    for (const tabla of TABLAS_DEL_LIBRO) {
      await cliente.query(`drop table if exists public.${tabla} cascade`);
    }
    await cliente.query(ESQUEMA_ANTERIOR);

    // Y con datos dentro, incluido un conductor que YA venía por debajo del
    // suelo. Rechazar su actualización por una deuda que la plataforma ya le
    // había permitido sería absurdo.
    const { rows: [alguien] } = await cliente.query(`select id from public.users limit 1`);
    if (alguien) {
      await cliente.query(
        `insert into public.driver_finance_state (driver_id, wallet_balance_usd) values ($1, -8.00)`,
        [alguien.id]);
      // Dentro de UNA transaccion, una clave foranea diferida deja eventos de
      // disparador pendientes y PostgreSQL no deja alterar la tabla. Se
      // resuelven aqui: es un detalle de esta prueba, no del despliegue real,
      // donde la migracion corre sola.
      await cliente.query('set constraints all immediate');
    }

    await cliente.query(sql);   // ← lo que antes fallaba en la comprobación previa

    assert.ok(await columnaExiste(cliente, 'driver_finance_state', 'floor_exempt'),
      'la columna nueva se añade, no se exige de antemano');
    assert.ok(await tablaExiste(cliente, 'driver_money_operations'),
      'y la tabla de identidades de operación aparece');

    if (alguien) {
      const { rows } = await cliente.query(
        `select wallet_balance_usd, floor_exempt from public.driver_finance_state where driver_id = $1`,
        [alguien.id]);
      assert.equal(Number(rows[0].wallet_balance_usd), -8, 'SIN tocarle el saldo');
      assert.equal(rows[0].floor_exempt, true, 'y reconociéndolo como exento del suelo');
    }

    // El estado que salva una carrera hecha ya se admite.
    await cliente.query(
      `insert into public.driver_commission_reservations (trip_id, driver_id, reserved_usd, status)
       select 'zz_prueba_v6', id, 0.10, 'SETTLEMENT_PENDING' from public.users limit 1`);
  });
});

test('v6 · desde un esquema PARCIAL (le falta solo lo último) también converge', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    // El esquema de la ronda pasada, completo salvo la tabla más nueva.
    await cliente.query('drop table if exists public.driver_money_operations cascade');
    assert.equal(await tablaExiste(cliente, 'driver_money_operations'), false);

    await cliente.query(sql);

    assert.ok(await tablaExiste(cliente, 'driver_money_operations'), 'se crea lo que faltaba');
    assert.ok(await columnaExiste(cliente, 'driver_finance_state', 'floor_exempt'),
      'y lo que ya estaba sigue estando');
  });
});

test('v6 · sobre un esquema VACÍO instala el libro entero', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    for (const tabla of TABLAS_DEL_LIBRO) {
      await cliente.query(`drop table if exists public.${tabla} cascade`);
    }
    await cliente.query('drop trigger if exists driver_finance_project_trg on public.users');
    await cliente.query('drop function if exists public.driver_finance_project()');

    await cliente.query(sql);

    for (const tabla of FINANCE_TABLES) {
      assert.ok(await tablaExiste(cliente, tabla), `falta ${tabla}`);
      const { rows } = await cliente.query(
        `select relrowsecurity from pg_class where oid = to_regclass('public.' || $1)`, [tabla]);
      assert.equal(rows[0].relrowsecurity, true, `sin RLS: ${tabla}`);
    }
    const { rows: disparador } = await cliente.query(
      `select count(*)::int as n from pg_trigger where tgname = 'driver_finance_project_trg'`);
    assert.equal(disparador[0].n, 1, 'con su disparador de proyección');

    // Y ni un céntimo movido: las tablas nacen vacías.
    const { rows: vacias } = await cliente.query(
      `select (select count(*) from public.driver_finance_state)::int a,
              (select count(*) from public.driver_money_operations)::int b`);
    assert.equal(vacias[0].a, 0);
    assert.equal(vacias[0].b, 0);
  });
});
