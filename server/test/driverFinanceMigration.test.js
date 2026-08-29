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
