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
    const payloadMismatch = await pool.query(`select count(*)::int count from public.${physical} where payload->>'id' is distinct from id`);
    tables[table].payloadIdMismatches = payloadMismatch.rows[0].count;
    if (tables[table].payloadIdMismatches) errors.push(`PAYLOAD_ID_MISMATCH:${table}`);
  }
  const orphanQueries = {
    trips_passenger: 'select count(*)::int as count from public.trips t left join public.users u on u.id=t.passenger_id where t.passenger_id is not null and u.id is null',
    trips_driver: 'select count(*)::int as count from public.trips t left join public.users u on u.id=t.driver_id where t.driver_id is not null and u.id is null',
    messages_trip: 'select count(*)::int as count from public.messages m left join public.trips t on t.id=m.trip_id where m.trip_id is not null and t.id is null',
    trips_assigned_driver: 'select count(*)::int as count from public.trips t left join public.users u on u.id=t.assigned_driver_id where t.assigned_driver_id is not null and u.id is null',
    notifications_user: 'select count(*)::int as count from public.notifications n left join public.users u on u.id=n.user_id where n.user_id is not null and u.id is null',
    messages_sender: 'select count(*)::int as count from public.messages m left join public.users u on u.id=m.sender_id where m.sender_id is not null and u.id is null',
    support_conversation_user: 'select count(*)::int as count from public.support_messages m left join public.users u on u.id=m.conversation_user_id where m.conversation_user_id is not null and u.id is null',
    support_sender: 'select count(*)::int as count from public.support_messages m left join public.users u on u.id=m.sender_id where m.sender_id is not null and u.id is null',
    transactions_user: 'select count(*)::int as count from public.transactions t left join public.users u on u.id=t.user_id where t.user_id is not null and u.id is null',
    transactions_trip: 'select count(*)::int as count from public.transactions x left join public.trips t on t.id=x.trip_id where x.trip_id is not null and t.id is null',
    applications_user: 'select count(*)::int as count from public.driver_applications a left join public.users u on u.id=a.user_id where a.user_id is not null and u.id is null',
    documents_application: 'select count(*)::int as count from public.driver_documents d left join public.driver_applications a on a.id=d.application_id where d.application_id is not null and a.id is null',
    documents_user: 'select count(*)::int as count from public.driver_documents d left join public.users u on u.id=d.user_id where d.user_id is not null and u.id is null',
    admin_admin: 'select count(*)::int as count from public.admin_actions a left join public.users u on u.id=a.admin_id where a.admin_id is not null and u.id is null',
    admin_target_user: 'select count(*)::int as count from public.admin_actions a left join public.users u on u.id=a.target_user_id where a.target_user_id is not null and u.id is null',
    admin_application: 'select count(*)::int as count from public.admin_actions x left join public.driver_applications a on a.id=x.application_id where x.application_id is not null and a.id is null',
    admin_transaction: 'select count(*)::int as count from public.admin_actions a left join public.transactions t on t.id=a.transaction_id where a.transaction_id is not null and t.id is null'
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
  const duplicates = {
    normalizedEmail: Number((await pool.query('select count(*) from (select email_key from public.users where email_key is not null group by email_key having count(*) > 1) duplicates')).rows[0].count),
    normalizedPhone: Number((await pool.query('select count(*) from (select phone_key from public.users where phone_key is not null group by phone_key having count(*) > 1) duplicates')).rows[0].count)
  };
  if (duplicates.normalizedEmail) errors.push(`DUPLICATE_NORMALIZED_EMAIL:${duplicates.normalizedEmail}`);
  if (duplicates.normalizedPhone) errors.push(`DUPLICATE_NORMALIZED_PHONE:${duplicates.normalizedPhone}`);
  return { ok: errors.length === 0, unexplainedDifferences: errors.length, tables, orphans, duplicates, aggregates, errors };
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
