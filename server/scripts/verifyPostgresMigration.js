import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSISTED_TABLES } from '../services/databasePersistence.js';
import { createPostgresPool, POSTGRES_TABLES } from '../services/postgresPersistence.js';
import { readSqliteCollections } from './sqlitePostgresMigration.js';

export async function verifyMigration({ filename, pool } = {}) {
  const sqlite = readSqliteCollections(filename);
  const tables = {};
  const errors = [];
  for (const table of PERSISTED_TABLES) {
    const physical = POSTGRES_TABLES[table];
    const result = await pool.query(`select id from public.${physical} order by id`);
    const sqliteIds = sqlite[table].map(row => row.id).sort();
    const postgresIds = result.rows.map(row => row.id).sort();
    const missing = sqliteIds.filter(id => !postgresIds.includes(id));
    const extra = postgresIds.filter(id => !sqliteIds.includes(id));
    tables[table] = { sqlite: sqliteIds.length, postgres: postgresIds.length, missing, extra };
    if (missing.length || extra.length) errors.push(`ID_MISMATCH:${table}`);
  }
  const orphanQueries = {
    trips_passenger: 'select count(*)::int as count from public.trips t left join public.users u on u.id=t.passenger_id where t.passenger_id is not null and u.id is null',
    trips_driver: 'select count(*)::int as count from public.trips t left join public.users u on u.id=t.driver_id where t.driver_id is not null and u.id is null',
    messages_trip: 'select count(*)::int as count from public.messages m left join public.trips t on t.id=m.trip_id where m.trip_id is not null and t.id is null',
    documents_application: 'select count(*)::int as count from public.driver_documents d left join public.driver_applications a on a.id=d.application_id where d.application_id is not null and a.id is null'
  };
  const orphans = {};
  for (const [name, sql] of Object.entries(orphanQueries)) {
    const result = await pool.query(sql);
    orphans[name] = result.rows[0].count;
    if (orphans[name]) errors.push(`ORPHANS:${name}:${orphans[name]}`);
  }
  const aggregates = {
    completedTrips: Number((await pool.query("select count(*) from public.trips where status='COMPLETED'")).rows[0].count),
    walletTransactions: Number((await pool.query("select count(*) from public.transactions where transaction_type in ('TOP_UP','PAYOUT','RIDE_PAYMENT','DRIVER_EARNING','PLATFORM_COMMISSION')")).rows[0].count),
    supportMessages: tables.supportMessages.postgres
  };
  return { ok: errors.length === 0, tables, orphans, aggregates, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--sqlite');
  const filename = path.resolve(index >= 0 ? args[index + 1] : process.env.DATA_FILE || 'data/plus58express.sqlite');
  const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await verifyMigration({ filename, pool });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
