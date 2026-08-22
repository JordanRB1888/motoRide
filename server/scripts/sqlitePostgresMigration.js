import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { PERSISTED_TABLES } from '../services/databasePersistence.js';
import { createPostgresPool, POSTGRES_TABLES } from '../services/postgresPersistence.js';
import { runPostgresMigrations } from './postgresMigrate.js';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const dryRun = args.includes('--dry-run');
const sqlitePath = path.resolve(option('--sqlite') || process.env.DATA_FILE || 'data/plus58express.sqlite');

export function readSqliteCollections(filename) {
  const sqlite = new DatabaseSync(filename, { readOnly: true });
  try {
    return Object.fromEntries(PERSISTED_TABLES.map(table => [
      table,
      sqlite.prepare(`select id, payload from ${table} order by id`).all().map(row => ({
        id: row.id,
        payload: JSON.parse(row.payload)
      }))
    ]));
  } finally {
    sqlite.close();
  }
}

export function preflightSqliteData(collections) {
  const errors = [];
  const ids = Object.fromEntries(PERSISTED_TABLES.map(table => [table, new Set()]));
  for (const table of PERSISTED_TABLES) {
    for (const row of collections[table]) {
      if (ids[table].has(row.id)) errors.push(`DUPLICATE_ID:${table}:${row.id}`);
      ids[table].add(row.id);
      if (row.payload?.id !== row.id) errors.push(`PAYLOAD_ID_MISMATCH:${table}:${row.id}`);
    }
  }
  const foreignKeys = [
    ['trips', 'passengerId', 'users'], ['trips', 'driverId', 'users'],
    ['trips', 'assignedDriverId', 'users'], ['notifications', 'userId', 'users'],
    ['messages', 'tripId', 'trips'], ['messages', 'senderId', 'users'],
    ['supportMessages', 'conversationUserId', 'users'], ['supportMessages', 'senderId', 'users'],
    ['transactions', 'userId', 'users'], ['transactions', 'tripId', 'trips'],
    ['driverApplications', 'userId', 'users'], ['driverDocuments', 'applicationId', 'driverApplications'],
    ['driverDocuments', 'userId', 'users'], ['adminActions', 'adminId', 'users'],
    ['adminActions', 'targetUserId', 'users'], ['adminActions', 'applicationId', 'driverApplications'],
    ['adminActions', 'transactionId', 'transactions']
  ];
  for (const [table, field, target] of foreignKeys) {
    for (const row of collections[table]) {
      const value = row.payload?.[field];
      if (value && !ids[target].has(value)) errors.push(`ORPHAN:${table}:${row.id}:${field}:${value}`);
    }
  }
  for (const field of ['email', 'phone']) {
    const seen = new Map();
    for (const row of collections.users) {
      const raw = row.payload?.[field];
      const key = field === 'email'
        ? String(raw || '').trim().toLowerCase()
        : String(raw || '').replace(/\D/g, '');
      if (!key) continue;
      if (seen.has(key)) errors.push(`DUPLICATE_${field.toUpperCase()}:${seen.get(key)}:${row.id}`);
      seen.set(key, row.id);
    }
  }
  return errors;
}

export async function migrateSqliteToPostgres({ filename, pool, isDryRun = false } = {}) {
  const collections = readSqliteCollections(filename);
  const errors = preflightSqliteData(collections);
  const summary = Object.fromEntries(PERSISTED_TABLES.map(table => [table, {
    sqlite: collections[table].length,
    postgres: null,
    inserted: 0,
    skipped: 0,
    failed: 0
  }]));
  if (errors.length) return { status: 'preflight_failed', dryRun: isDryRun, summary, errors };
  if (isDryRun && !pool) return { status: 'dry_run_ok', dryRun: true, summary, errors: [] };

  if (!pool) throw new Error('DATABASE_URL_REQUIRED');
  await runPostgresMigrations({ pool });
  for (const table of PERSISTED_TABLES) {
    const count = await pool.query(`select count(*)::int as count from public.${POSTGRES_TABLES[table]}`);
    summary[table].postgres = count.rows[0].count;
  }
  if (isDryRun) return { status: 'dry_run_ok', dryRun: true, summary, errors: [] };

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set constraints all deferred');
    for (const table of PERSISTED_TABLES) {
      const physical = POSTGRES_TABLES[table];
      for (const row of collections[table]) {
        const result = await client.query(
          `insert into public.${physical} (id, payload) values ($1, $2::jsonb)
           on conflict (id) do nothing`,
          [row.id, JSON.stringify(row.payload)]
        );
        if (result.rowCount === 1) summary[table].inserted += 1;
        else {
          const existing = await client.query(`select payload from public.${physical} where id = $1`, [row.id]);
          if (!isDeepStrictEqual(existing.rows[0]?.payload, row.payload)) {
            throw new Error(`CONFLICTING_EXISTING_ROW:${table}:${row.id}`);
          }
          summary[table].skipped += 1;
        }
      }
    }
    await client.query('commit');
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    throw error;
  } finally {
    client.release();
  }
  for (const table of PERSISTED_TABLES) {
    const count = await pool.query(`select count(*)::int as count from public.${POSTGRES_TABLES[table]}`);
    summary[table].postgres = count.rows[0].count;
  }
  return { status: 'migrated', dryRun: false, summary, errors: [] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = dryRun && !process.env.DATABASE_URL
    ? null
    : createPostgresPool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await migrateSqliteToPostgres({ filename: sqlitePath, pool, isDryRun: dryRun });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}
