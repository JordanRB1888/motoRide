import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { PERSISTED_TABLES } from '../services/databasePersistence.js';
import { resolvePostgresSsl } from '../services/postgresPersistence.js';
import {
  migrateSqliteToPostgres,
  preflightSqliteData,
  readSqliteCollections
} from '../scripts/sqlitePostgresMigration.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.resolve(serverDir, '..', 'supabase', 'migrations', '20260822045339_postgres_persistence_schema.sql');

async function sqliteFixture(rows = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'plus58-pg-migration-'));
  const filename = path.join(directory, 'source.sqlite');
  const sqlite = new DatabaseSync(filename);
  for (const table of PERSISTED_TABLES) {
    sqlite.exec(`create table ${table} (id text primary key, payload text not null)`);
    const insert = sqlite.prepare(`insert into ${table} (id, payload) values (?, ?)`);
    for (const item of rows[table] || []) insert.run(item.id, JSON.stringify(item));
  }
  sqlite.close();
  return filename;
}

test('el dry-run lee las diez tablas, preserva IDs y no exige PostgreSQL', async () => {
  const filename = await sqliteFixture({
    users: [{ id: 'u1', email: 'ana@example.com', phone: '+58 414-123-4567' }],
    trips: [{ id: 't1', passengerId: 'u1', status: 'SEARCHING' }]
  });
  const result = await migrateSqliteToPostgres({ filename, pool: null, isDryRun: true });
  assert.equal(result.status, 'dry_run_ok');
  assert.equal(result.summary.users.sqlite, 1);
  assert.equal(result.summary.trips.sqlite, 1);
  assert.equal(result.summary.users.inserted, 0);
});

test('el preflight detecta huérfanos antes de abrir una transacción', async () => {
  const filename = await sqliteFixture({ trips: [{ id: 't1', passengerId: 'missing' }] });
  const result = preflightSqliteData(readSqliteCollections(filename));
  assert.ok(result.includes('ORPHAN:trips:t1:passengerId:missing'));
});

test('el preflight detecta email y teléfono duplicados normalizados', async () => {
  const filename = await sqliteFixture({ users: [
    { id: 'u1', email: 'ANA@example.com', phone: '+58 414-123-4567' },
    { id: 'u2', email: ' ana@example.com ', phone: '584141234567' }
  ] });
  const errors = preflightSqliteData(readSqliteCollections(filename));
  assert.ok(errors.some(error => error.startsWith('DUPLICATE_EMAIL:')));
  assert.ok(errors.some(error => error.startsWith('DUPLICATE_PHONE:')));
});

test('DATABASE_SSL solo acepta modos explícitos y seguros', () => {
  assert.deepEqual(resolvePostgresSsl('require'), { rejectUnauthorized: true });
  assert.deepEqual(resolvePostgresSsl('no-verify'), { rejectUnauthorized: false });
  assert.equal(resolvePostgresSsl('disable'), false);
  assert.throws(() => resolvePostgresSsl('quizas'), /INVALID_DATABASE_SSL/);
});

test('la migración PostgreSQL contiene constraints, RLS e índices de concurrencia', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /users_email_key_unique/);
  assert.match(sql, /users_phone_key_unique/);
  assert.match(sql, /foreign key \(passenger_id\)/);
  assert.match(sql, /transactions_one_pending_payout_per_user/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all on all tables in schema public from anon, authenticated/);
});

test('la reserva de viaje usa un UPDATE condicional, no un cerrojo solo en memoria', () => {
  const source = fs.readFileSync(path.join(serverDir, 'services', 'postgresPersistence.js'), 'utf8');
  assert.match(source, /update public\.trips/);
  assert.match(source, /status = 'SEARCHING'/);
  assert.match(source, /driver_id is null/);
  assert.match(source, /rowCount !== 1/);
});

test('todas las escrituras del servidor esperan confirmación de persistencia', () => {
  const sources = [
    path.join(serverDir, 'index.js'),
    path.join(serverDir, 'routes', 'driverApplications.js')
  ].map(filename => fs.readFileSync(filename, 'utf8')).join('\n');
  const unawaited = sources.split(/\r?\n/).filter(line =>
    /\bpersist(?:Database|Record)\(/.test(line) &&
    !/async function persist(?:Database|Record)/.test(line) &&
    !/return await persistence\.persistRecord/.test(line) &&
    !/await persist(?:Database|Record)\(/.test(line)
  );
  assert.deepEqual(unawaited, []);
});

test('chat y soporte compensan también rechazos asíncronos de persistencia', () => {
  const server = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  const pipeline = fs.readFileSync(path.join(serverDir, 'services', 'chatMediaPipeline.js'), 'utf8');
  assert.equal((server.match(/chatMediaPipeline\.withStoredImageAsync\(/g) || []).length, 2);
  assert.match(pipeline, /async function withStoredImageAsync/);
  assert.match(pipeline, /return await persistir\(media\)/);
});
