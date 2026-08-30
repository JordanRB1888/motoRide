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
  // Y el ORIGEN, que es lo que permite distinguir una repetición legítima de
  // la misma identidad reutilizada con otra semántica.
  assert.ok(minusculas.includes('source_type text not null'));
  assert.ok(minusculas.includes('source_id text not null'));
  assert.ok(minusculas.includes('legacy_unknown'),
    'lo que existiera antes se marca como no verificable, no se le inventa un origen');
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

// ---------------------------------------------------------------------------
// v7 · las DEFINICIONES, no los nombres
// ---------------------------------------------------------------------------
//
// La sexta auditoría construyó una tabla de operaciones con los nombres
// exactos que la comprobación esperaba —incluido `driver_money_operations_pkey`—
// pero con la clave primaria sobre `driver_id`, sin comprobación de dirección
// y sin clave foránea al conductor. La migración la aceptó.
//
// Con esa forma, dos recargas del mismo conductor chocarían entre sí y una
// identidad repetida pasaría desapercibida: exactamente lo que el libro existe
// para impedir.

test('v7 · una clave primaria con el nombre correcto sobre la COLUMNA equivocada se rechaza', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    await cliente.query('drop table if exists public.driver_money_operations cascade');
    await cliente.query(`create table public.driver_money_operations (
      operation_id text not null,
      driver_id text not null,
      kind text not null,
      amount_usd numeric(12, 2) not null,
      balance_after_usd numeric(12, 2) not null,
      source_type text not null,
      source_id text not null,
      applied_at timestamptz not null default now(),
      constraint driver_money_operations_pkey primary key (driver_id))`);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_INCOMPATIBLE/,
          'el nombre coincide; lo que no coincide es la columna, y eso es lo que importa');
        assert.match(error.message, /primaria de driver_money_operations/);
        assert.match(error.message, /operation_id/);
        return true;
      }
    );
  });
});

test('v7 · sin la comprobación de dirección ni la clave foránea, también se rechaza', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    await cliente.query('drop table if exists public.driver_money_operations cascade');
    // Clave primaria correcta esta vez, pero sin las dos restricciones que dan
    // sentido al dinero.
    await cliente.query(`create table public.driver_money_operations (
      operation_id text primary key,
      driver_id text not null,
      kind text not null,
      amount_usd numeric(12, 2) not null,
      balance_after_usd numeric(12, 2) not null,
      source_type text not null,
      source_id text not null,
      applied_at timestamptz not null default now())`);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_INCOMPATIBLE/);
        assert.match(error.message, /direccion|clave foranea/);
        return true;
      }
    );
  });
});

test('v7 · una clave ÚNICA con el nombre esperado sobre otras columnas se rechaza', saltar, async () => {
  // El mismo engaño en la tabla de mantenimientos: si la unicidad no es
  // (conductor, periodo), dos procesos podrían cobrar el mismo mes.
  await enTransaccionDeshecha(async cliente => {
    await cliente.query('alter table public.driver_maintenance_obligations drop constraint driver_maintenance_obligations_unico');
    await cliente.query(`alter table public.driver_maintenance_obligations
      add constraint driver_maintenance_obligations_unico unique (id)`);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_INCOMPATIBLE/);
        assert.match(error.message, /driver_id,period/);
        return true;
      }
    );
  });
});

test('v7 · desde la forma ANTERIOR de la tabla de operaciones, se actualiza sin perder testigos', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    await cliente.query('drop table if exists public.driver_money_operations cascade');
    // La forma de la ronda pasada: sin `source_type` ni `source_id`.
    await cliente.query(`create table public.driver_money_operations (
      operation_id text primary key,
      driver_id text not null,
      kind text not null check (kind in ('CREDIT', 'DEBIT')),
      amount_usd numeric(12, 2) not null check (amount_usd >= 0),
      balance_after_usd numeric(12, 2) not null,
      applied_at timestamptz not null default now(),
      constraint driver_money_operations_driver_fk
        foreign key (driver_id) references public.users(id)
        on delete no action deferrable initially deferred)`);
    const { rows: [alguien] } = await cliente.query(`select id from public.users limit 1`);
    if (alguien) {
      await cliente.query(
        `insert into public.driver_money_operations
           (operation_id, driver_id, kind, amount_usd, balance_after_usd)
         values ('zz_legado_v7', $1, 'CREDIT', 2, 5)`, [alguien.id]);
      await cliente.query('set constraints all immediate');
    }

    await cliente.query(sql);

    assert.ok(await columnaExiste(cliente, 'driver_money_operations', 'source_type'));
    assert.ok(await columnaExiste(cliente, 'driver_money_operations', 'source_id'));
    if (alguien) {
      const { rows } = await cliente.query(
        `select source_type, source_id, amount_usd from public.driver_money_operations
          where operation_id = 'zz_legado_v7'`);
      assert.equal(rows.length, 1, 'el testigo que ya existía NO se pierde');
      assert.equal(rows[0].source_type, 'LEGACY_UNKNOWN',
        'y su origen se marca como desconocido en vez de inventarle uno');
      assert.equal(rows[0].source_id, 'zz_legado_v7');
      assert.equal(Number(rows[0].amount_usd), 2, 'sin tocarle el importe');
    }
  });
});

// ---------------------------------------------------------------------------
// v8 · que la restriccion EXISTA no prueba que SIRVA
// ---------------------------------------------------------------------------
//
// La septima auditoria demostro que buscar palabras en la definicion de una
// restriccion no establece su semantica. Construyo una tabla de operaciones
// con nombres convincentes y esto dentro:
//
//   check (kind = 'CREDIT')          -> prohibe un DEBIT perfectamente valido
//   check (amount_usd >= -999999)    -> permite dinero negativo
//   foreign key (source_id) -> users -> contiene «REFERENCES users» y no
//                                       restringe al conductor en absoluto
//
// La migracion la acepto. Ahora se le pregunta a la BASE, con inserciones que
// siempre se deshacen, y se validan las claves foraneas por sus columnas.

const OPERACIONES_DEBILES = `
create table public.driver_money_operations (
  operation_id text not null,
  driver_id text not null,
  kind text not null,
  amount_usd numeric(12, 2) not null,
  balance_after_usd numeric(12, 2) not null,
  source_type text not null,
  source_id text not null,
  applied_at timestamptz not null default now(),
  constraint driver_money_operations_pkey primary key (operation_id),
  constraint driver_money_operations_kind_check check (kind = 'CREDIT'),
  constraint driver_money_operations_amount_check check (amount_usd >= -999999),
  constraint driver_money_operations_driver_fk
    foreign key (source_id) references public.users(id)
    on delete no action deferrable initially deferred
);
`;

test('v8 · una comprobación de dirección que prohíbe DEBIT se rechaza', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    await cliente.query('drop table if exists public.driver_money_operations cascade');
    await cliente.query(OPERACIONES_DEBILES);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        // Basta con que la migración se pare antes de tocar nada durable: da
        // igual cuál de las tres debilidades acuse primero.
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_(INEFFECTIVE|INCOMPATIBLE)/,
          'los nombres eran los correctos; lo que no servía era lo que hacían');
        return true;
      }
    );
  });
});

test('v8 · una clave foránea sobre la columna equivocada se rechaza', saltar, async () => {
  // `source_id -> users(id)` contiene «REFERENCES users» y pasaba el patrón,
  // mientras `driver_id` —la columna que dice de QUIÉN es el dinero— quedaba
  // sin restringir.
  await enTransaccionDeshecha(async cliente => {
    await cliente.query('drop table if exists public.driver_money_operations cascade');
    // Con las dos comprobaciones CORRECTAS, para que la única debilidad que
    // quede sea la clave foránea.
    await cliente.query(`create table public.driver_money_operations (
      operation_id text primary key,
      driver_id text not null,
      kind text not null check (kind in ('CREDIT', 'DEBIT')),
      amount_usd numeric(12, 2) not null check (amount_usd >= 0),
      balance_after_usd numeric(12, 2) not null,
      source_type text not null,
      source_id text not null,
      applied_at timestamptz not null default now(),
      constraint driver_money_operations_driver_fk
        foreign key (source_id) references public.users(id)
        on delete no action deferrable initially deferred)`);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_(INEFFECTIVE|INCOMPATIBLE)/);
        assert.match(error.message, /driver_id|conductor que no existe/);
        return true;
      }
    );
  });
});

test('v8 · una columna crítica que admite NULL se rechaza', saltar, async () => {
  // Se podría anotar dinero sin dueño, o una reserva sin estado.
  await enTransaccionDeshecha(async cliente => {
    await cliente.query('alter table public.driver_money_operations alter column driver_id drop not null');

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SCHEMA_INCOMPATIBLE/);
        assert.match(error.message, /driver_money_operations\.driver_id admite NULL/);
        return true;
      }
    );
  });
});

test('v8 · dos operaciones con el MISMO origen paran la migración: no se borra ninguna', saltar, async () => {
  // La unicidad del origen no se puede declarar sobre datos que ya la violan.
  // Y la salida correcta NO es fusionar ni borrar testigos de dinero: es
  // pararse y que lo mire una persona.
  await enTransaccionDeshecha(async cliente => {
    const { rows: [alguien] } = await cliente.query(`select id from public.users limit 1`);
    if (!alguien) return;
    await cliente.query('drop index if exists public.driver_money_operations_origen_unico');
    await cliente.query(
      `insert into public.driver_money_operations
         (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
       values ('dup_a_v8', $1, 'CREDIT', 2, 3, 'TOPUP', 'origen-repetido-v8'),
              ('dup_b_v8', $1, 'CREDIT', 2, 5, 'TOPUP', 'origen-repetido-v8')`,
      [alguien.id]);
    await cliente.query('set constraints all immediate');

    // Un punto de retorno: la migracion va a fallar a proposito, y sin el la
    // transaccion quedaria abortada y no se podria comprobar lo que importa,
    // que es que los testigos siguen intactos.
    await cliente.query('savepoint antes_de_migrar');
    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_DUPLICATE_SOURCE/);
        assert.match(error.message, /origen-repetido-v8/);
        return true;
      }
    );
    await cliente.query('rollback to savepoint antes_de_migrar');

    // Y ninguno de los dos testigos se ha tocado.
    const { rows } = await cliente.query(
      `select count(*)::int as n from public.driver_money_operations
        where source_id = 'origen-repetido-v8'`);
    assert.equal(rows[0].n, 2, 'los dos siguen ahí: revisarlos es cosa de una persona');
  });
});

test('v8 · la migración declara la unicidad del origen y el rechazo del legado', saltar, () => {
  const minusculas = sql.toLowerCase();
  assert.ok(minusculas.includes('create unique index if not exists driver_money_operations_origen_unico'),
    'sin unicidad del origen, el mismo hecho de negocio mueve dinero dos veces');
  assert.ok(minusculas.includes("where source_type <> 'legacy_unknown'"),
    'y los testigos migrados quedan fuera: no tienen un origen real que pueda ser único');
  assert.ok(minusculas.includes('driver_finance_legacy_source_not_allowed'),
    'una operación nueva no puede nacer sin origen conocido');
  assert.ok(minusculas.includes('driver_finance_trip_owner_settled'),
    'ni una carrera ya liquidada puede cambiar de dueño');
});

// ---------------------------------------------------------------------------
// v9 · el indice del ORIGEN, por su FORMA y no por su nombre
// ---------------------------------------------------------------------------
//
// `create unique index if not exists` mira el NOMBRE y nada mas. La octava
// auditoria creo un indice con el nombre exacto que se esperaba pero sobre
// `(operation_id, source_id)`: el `if not exists` no hizo nada, la migracion
// paso, y la unicidad del origen -lo unico que impide que el mismo hecho de
// negocio mueva dinero dos veces- simplemente no existia.

const rehacerIndiceDeOrigen = async (cliente, definicion) => {
  await cliente.query('drop index if exists public.driver_money_operations_origen_unico');
  await cliente.query(definicion);
};

test('v9 · un indice de origen con el nombre correcto sobre otras columnas se rechaza', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    await rehacerIndiceDeOrigen(cliente, `create unique index driver_money_operations_origen_unico
      on public.driver_money_operations (operation_id, source_id)
      where source_type <> 'LEGACY_UNKNOWN'`);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SOURCE_INDEX_INVALID/,
          'el nombre coincidia; lo que no coincidia eran las columnas');
        assert.match(error.message, /source_type,source_id/);
        return true;
      }
    );
  });
});

test('v9 · un indice de origen con el PREDICADO equivocado se rechaza', saltar, async () => {
  // Mismas columnas, misma unicidad, mismo nombre — y un predicado que deja
  // fuera justo lo que tiene que proteger.
  for (const predicado of [
    "where source_type <> 'TOPUP'",
    "where source_type is not null",
    ''
  ]) {
    await enTransaccionDeshecha(async cliente => {
      await rehacerIndiceDeOrigen(cliente, `create unique index driver_money_operations_origen_unico
        on public.driver_money_operations (source_type, source_id) ${predicado}`);

      await assert.rejects(
        () => cliente.query(sql),
        error => {
          assert.match(error.message, /DRIVER_FINANCE_SOURCE_INDEX_INVALID/);
          assert.match(error.message, /predicado/);
          return true;
        }
      );
    });
  }
});

test('v9 · un indice de origen que NO es unico se rechaza', saltar, async () => {
  await enTransaccionDeshecha(async cliente => {
    await rehacerIndiceDeOrigen(cliente, `create index driver_money_operations_origen_unico
      on public.driver_money_operations (source_type, source_id)
      where source_type <> 'LEGACY_UNKNOWN'`);

    await assert.rejects(
      () => cliente.query(sql),
      error => {
        assert.match(error.message, /DRIVER_FINANCE_SOURCE_INDEX_INVALID/);
        assert.match(error.message, /UNICO/);
        return true;
      }
    );
  });
});

test('v9 · el indice de origen CORRECTO se acepta y la migracion converge', saltar, async () => {
  // El contrapeso de los tres anteriores: sin el, «rechaza todo» pasaria por
  // «valida bien».
  await enTransaccionDeshecha(async cliente => {
    await rehacerIndiceDeOrigen(cliente, `create unique index driver_money_operations_origen_unico
      on public.driver_money_operations (source_type, source_id)
      where source_type <> 'LEGACY_UNKNOWN'`);
    await cliente.query(sql);
    const { rows } = await cliente.query(
      `select indisunique, pg_get_expr(indpred, indrelid) as predicado
         from pg_index where indexrelid = 'public.driver_money_operations_origen_unico'::regclass`);
    assert.equal(rows[0].indisunique, true);
    assert.equal(rows[0].predicado, "(source_type <> 'LEGACY_UNKNOWN'::text)");
  });
});

// ---------------------------------------------------------------------------
// v9 · el origen tiene que decir algo, y las filas que ya estan se miran antes
// ---------------------------------------------------------------------------

test('v9 · una operacion con el origen en blanco para la migracion: no se repara sola', saltar, async () => {
  // Arreglar a ciegas un hecho financiero sin procedencia seria inventarle una.
  for (const enBlanco of ['', ' ', '\t']) {
    await enTransaccionDeshecha(async cliente => {
      const { rows: [alguien] } = await cliente.query(`select id from public.users limit 1`);
      if (!alguien) return;
      await cliente.query('alter table public.driver_money_operations drop constraint if exists driver_money_operations_origen_no_vacio');
      await cliente.query(
        `insert into public.driver_money_operations
           (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
         values ('sin_origen_v9', $1, 'CREDIT', 2, 3, 'TOPUP', $2)`, [alguien.id, enBlanco]);
      await cliente.query('set constraints all immediate');

      await cliente.query('savepoint antes_de_migrar');
      await assert.rejects(
        () => cliente.query(sql),
        error => {
          assert.match(error.message, /DRIVER_FINANCE_BLANK_SOURCE/);
          return true;
        }
      );
      await cliente.query('rollback to savepoint antes_de_migrar');

      const { rows } = await cliente.query(
        `select source_id from public.driver_money_operations where operation_id = 'sin_origen_v9'`);
      assert.equal(rows.length, 1, 'el testigo sigue ahi: no se borra');
      assert.equal(rows[0].source_id, enBlanco, 'y no se le recorta ni se le inventa un origen');
    });
  }
});

test('v9 · la migracion declara lo que v9 anade', saltar, () => {
  const minusculas = sql.toLowerCase();
  assert.ok(minusculas.includes('driver_money_operations_origen_no_vacio'),
    'un origen en blanco no identifica nada, y la base tiene que decirlo');
  assert.ok(minusculas.includes('driver_finance_source_index_invalid'),
    'el indice del origen se valida por su forma, no por su nombre');
  assert.ok(minusculas.includes('driver_finance_blank_source'),
    'y las filas que ya estuvieran en blanco paran la migracion');
  assert.ok(minusculas.includes("'settled', 'settlement_pending'"),
    'la propiedad tambien es vinculante mientras el dinero se debe');
});

// ---------------------------------------------------------------------------
// v10 · un testigo que ya estuviera SIN forma canonica para la migracion
// ---------------------------------------------------------------------------
//
// La novena auditoria encontro la puerta economica: un testigo de v8 guardado
// como `'  topup-id  '` pasaba la migracion de v9, y despues un reintento con
// `'topup-id'` no lo encontraba en el indice unico y volvia a acreditar.
// Saldo 1.00 -> 3.00 -> 5.00, con el indice puesto.
//
// La migracion no puede recortarlo por su cuenta: eso seria DECIDIR, sin
// saberlo, que los dos son el mismo hecho financiero — que es justo lo que hay
// que probar, no suponer.

const CH = cp => String.fromCodePoint(cp);

test('v10 · un origen con relleno que ya existiera para la migracion: no se recorta solo', saltar, async () => {
  const rellenos = [
    ['espacios alrededor', '  topup-id  '],
    ['tabulador delante', '\ttopup-id'],
    ['BOM delante', `${CH(0xFEFF)}topup-id`],
    ['NBSP al final', `topup-id${CH(0x00A0)}`],
    ['solo un BOM', CH(0xFEFF)]
  ];

  for (const [etiqueta, valor] of rellenos) {
    await enTransaccionDeshecha(async cliente => {
      const { rows: [alguien] } = await cliente.query(`select id from public.users limit 1`);
      if (!alguien) return;
      await cliente.query(
        'alter table public.driver_money_operations drop constraint if exists driver_money_operations_origen_no_vacio');
      await cliente.query(
        `insert into public.driver_money_operations
           (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
         values ('sin_canonizar_v10', $1, 'CREDIT', 2, 3, 'TOPUP', $2)`, [alguien.id, valor]);
      await cliente.query('set constraints all immediate');

      await cliente.query('savepoint antes_de_migrar');
      await assert.rejects(
        () => cliente.query(sql),
        error => {
          assert.match(error.message, /DRIVER_FINANCE_BLANK_SOURCE/, etiqueta);
          return true;
        }
      );
      await cliente.query('rollback to savepoint antes_de_migrar');

      const { rows } = await cliente.query(
        `select source_id from public.driver_money_operations where operation_id = 'sin_canonizar_v10'`);
      assert.equal(rows.length, 1, `${etiqueta}: el testigo sigue ahi`);
      assert.equal(rows[0].source_id, valor,
        `${etiqueta}: ni se recorta, ni se fusiona, ni se le inventa nada`);
    });
  }
});

test('v10 · un origen YA canonico no estorba a la migracion', saltar, async () => {
  // El contrapeso: sin el, «rechaza siempre» pasaria por «valida bien».
  await enTransaccionDeshecha(async cliente => {
    const { rows: [alguien] } = await cliente.query(`select id from public.users limit 1`);
    if (!alguien) return;
    await cliente.query(
      `insert into public.driver_money_operations
         (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
       values ('canonico_v10', $1, 'CREDIT', 2, 3, 'TOPUP', 'topup-id-canonico-v10')`, [alguien.id]);
    await cliente.query('set constraints all immediate');

    await cliente.query(sql);

    const { rows } = await cliente.query(
      `select source_id from public.driver_money_operations where operation_id = 'canonico_v10'`);
    assert.equal(rows[0].source_id, 'topup-id-canonico-v10', 'intacto y aceptado');
  });
});

test('v10 · la migracion declara la forma canonica del origen', saltar, () => {
  const minusculas = sql.toLowerCase();
  assert.ok(minusculas.includes('btrim(source_id'),
    'lo guardado tiene que ser identico a su forma canonica, no solo «no vacio»');
  assert.ok(sql.includes('\\u00A0') || sql.includes('\\u00a0'),
    'el conjunto de blancos tiene que incluir NBSP: `\\s` de PostgreSQL no lo cubre');
  assert.ok(sql.includes('\\uFEFF') || sql.includes('\\ufeff'),
    'y el BOM, que fue exactamente lo que se colo');
  assert.ok(!minusculas.includes("source_id ~ '\\s'"),
    'la comprobacion vieja no puede seguir ahi: no era equivalente al trim de JavaScript');
});
