import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresPool } from '../services/postgresPersistence.js';
import { readSqliteCollections, preflightSqliteData } from './sqlitePostgresMigration.js';

const TEST_PROJECT_REF = 'qljsvainubfjeiyqlgll';

export function inspectProductionTarget(value) {
  if (!value) throw new Error('PRODUCTION_DATABASE_URL_MISSING');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PRODUCTION_DATABASE_SCHEME_INVALID');
  const identity = `${url.hostname} ${url.username}`.toLowerCase();
  if (identity.includes(TEST_PROJECT_REF)) throw new Error('TEST_DATABASE_FORBIDDEN_AS_PRODUCTION');
  if (url.port === '6543') throw new Error('TRANSACTION_POOLER_FORBIDDEN_FOR_PERSISTENT_BACKEND');
  return { scheme: url.protocol.slice(0, -1), host: url.hostname, port: url.port || '5432' };
}

async function directoryReady(directory) {
  const stat = await fs.stat(directory);
  await fs.access(directory, fs.constants.R_OK | fs.constants.W_OK);
  return stat.isDirectory();
}

export async function runProductionCutoverPreflight({ env = process.env } = {}) {
  const checks = {};
  const fail = (name, reason) => { checks[name] = { ok: false, reason }; };
  const pass = (name, detail = true) => { checks[name] = { ok: true, detail }; };
  try {
    const stat = await fs.stat(env.DATA_FILE);
    const collections = readSqliteCollections(env.DATA_FILE);
    const errors = preflightSqliteData(collections);
    if (!stat.isFile() || !stat.size || errors.length) throw new Error(errors.join(',') || 'INVALID_SQLITE');
    pass('productionSqlite', { bytes: stat.size, rows: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length])) });
  } catch (error) { fail('productionSqlite', error.message); }
  try { pass('backupDestination', await directoryReady(env.CUTOVER_BACKUP_DIR)); }
  catch (error) { fail('backupDestination', error.message); }
  try { pass('targetIdentity', inspectProductionTarget(env.PRODUCTION_DATABASE_URL)); }
  catch (error) { fail('targetIdentity', error.message); }
  if (String(env.RAILWAY_REPLICAS) === '1') pass('railwayReplicas', 1);
  else fail('railwayReplicas', 'RAILWAY_REPLICAS_MUST_EQUAL_1');
  try { pass('railwayVolume', await directoryReady(env.RAILWAY_VOLUME_MOUNT_PATH)); }
  catch (error) { fail('railwayVolume', error.message); }
  for (const [name, directory] of [
    ['driverDocuments', env.UPLOAD_DIR || path.join(path.dirname(env.DATA_FILE || ''), 'private-uploads')],
    ['chatMedia', env.CHAT_MEDIA_DIR || path.join(path.dirname(env.DATA_FILE || ''), 'chat-media')]
  ]) {
    try { pass(name, await directoryReady(directory)); }
    catch (error) { fail(name, error.message); }
  }
  try {
    const response = await fetch(env.HEALTH_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    pass('healthEndpoint', env.HEALTH_URL);
  } catch (error) { fail('healthEndpoint', error.message); }
  if (checks.targetIdentity?.ok) {
    const pool = createPostgresPool({ connectionString: env.PRODUCTION_DATABASE_URL });
    try {
      const identity = await pool.query("select current_database() database, current_user username, to_regclass('public.schema_migrations') schema_migrations");
      const tables = await pool.query("select count(*)::int count from pg_tables where schemaname='public' and tablename in ('users','trips','notifications','messages','support_messages','settings','transactions','driver_applications','driver_documents','admin_actions')");
      const tableCount = tables.rows[0].count;
      if (![0, 10].includes(tableCount)) throw new Error(`INCOMPATIBLE_SCHEMA_TABLE_COUNT:${tableCount}`);
      pass('postgresReachable', { database: identity.rows[0].database, username: identity.rows[0].username, applicationTables: tableCount });
    } catch (error) { fail('postgresReachable', error.message); }
    finally { await pool.end(); }
  } else fail('postgresReachable', 'TARGET_IDENTITY_NOT_VALIDATED');
  const failed = Object.entries(checks).filter(([, result]) => !result.ok).map(([name]) => name);
  return { ok: failed.length === 0, failed, checks };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runProductionCutoverPreflight();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
