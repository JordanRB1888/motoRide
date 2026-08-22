import pg from 'pg';
import { PERSISTED_TABLES } from './databasePersistence.js';

const { Pool } = pg;

export const POSTGRES_TABLES = Object.freeze({
  users: 'users',
  trips: 'trips',
  notifications: 'notifications',
  messages: 'messages',
  supportMessages: 'support_messages',
  settings: 'settings',
  transactions: 'transactions',
  driverApplications: 'driver_applications',
  driverDocuments: 'driver_documents',
  adminActions: 'admin_actions'
});

const SSL_TRUE = new Set(['1', 'true', 'require', 'required']);
const SSL_FALSE = new Set(['0', 'false', 'disable', 'disabled']);

export function resolvePostgresSsl(value = process.env.DATABASE_SSL) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (SSL_TRUE.has(normalized)) return { rejectUnauthorized: true };
  if (normalized === 'no-verify') return { rejectUnauthorized: false };
  if (SSL_FALSE.has(normalized)) return false;
  throw new Error('INVALID_DATABASE_SSL');
}

export function createPostgresPool({ connectionString, ssl, max = 10 } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  return new Pool({
    connectionString,
    ssl: ssl === undefined ? resolvePostgresSsl() : ssl,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: false
  });
}

function serializeRecord(table, item) {
  if (!POSTGRES_TABLES[table]) throw new Error(`UNKNOWN_TABLE:${table}`);
  if (typeof item?.id !== 'string' || item.id === '') throw new Error(`INVALID_RECORD_ID:${table}`);
  return JSON.stringify(item);
}

export async function loadPostgresDatabase(pool) {
  const database = {};
  for (const table of PERSISTED_TABLES) {
    const physical = POSTGRES_TABLES[table];
    const result = await pool.query(`select payload from public.${physical} order by id`);
    database[table] = result.rows.map(row => row.payload);
  }
  return database;
}

export async function createPostgresPersistence({ pool, database, logger = console } = {}) {
  if (!pool) throw new Error('PERSISTENCE_REQUIRES_POSTGRES_POOL');
  if (!database) throw new Error('PERSISTENCE_REQUIRES_DATABASE');

  const shadow = new Map();
  for (const table of PERSISTED_TABLES) {
    const physical = POSTGRES_TABLES[table];
    const result = await pool.query(`select id, payload from public.${physical}`);
    shadow.set(table, new Map(result.rows.map(row => [row.id, JSON.stringify(row.payload)])));
  }

  let writeQueue = Promise.resolve(true);

  function collectChanges(table) {
    const collection = database[table];
    if (!Array.isArray(collection)) throw new Error(`MISSING_COLLECTION:${table}`);
    const previous = shadow.get(table);
    const present = new Set();
    const upserts = [];
    for (const item of collection) {
      const payload = serializeRecord(table, item);
      if (present.has(item.id)) throw new Error(`DUPLICATE_RECORD_ID:${table}:${item.id}`);
      present.add(item.id);
      if (previous.get(item.id) !== payload) upserts.push({ id: item.id, payload });
    }
    return {
      table,
      upserts,
      deletes: [...previous.keys()].filter(id => !present.has(id))
    };
  }

  async function executePlan(plan) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set constraints all deferred');
      for (const { table, upserts, deletes } of plan) {
        const physical = POSTGRES_TABLES[table];
        for (const row of upserts) {
          await client.query(
            `insert into public.${physical} (id, payload) values ($1, $2::jsonb)
             on conflict (id) do update set payload = excluded.payload`,
            [row.id, row.payload]
          );
        }
        if (deletes.length) {
          await client.query(`delete from public.${physical} where id = any($1::text[])`, [deletes]);
        }
      }
      await client.query('commit');
      for (const { table, upserts, deletes } of plan) {
        const previous = shadow.get(table);
        for (const row of upserts) previous.set(row.id, row.payload);
        for (const id of deletes) previous.delete(id);
      }
      return true;
    } catch (error) {
      try { await client.query('rollback'); } catch {}
      logger.error('[+58express Database] No se pudo guardar PostgreSQL:', error.message);
      return false;
    } finally {
      client.release();
    }
  }

  function enqueue(work) {
    const next = writeQueue.then(work, work);
    writeQueue = next.catch(() => false);
    return next;
  }

  function persist() {
    return enqueue(async () => {
      let plan;
      try {
        plan = PERSISTED_TABLES.map(collectChanges);
      } catch (error) {
        logger.error('[+58express Database] No se pudo preparar PostgreSQL:', error.message);
        return false;
      }
      if (!plan.some(change => change.upserts.length || change.deletes.length)) return true;
      return executePlan(plan);
    });
  }

  function persistRecord(table, item) {
    return enqueue(async () => {
      let payload;
      try { payload = serializeRecord(table, item); }
      catch (error) {
        logger.error('[+58express Database] No se pudo preparar PostgreSQL:', error.message);
        return false;
      }
      if (shadow.get(table)?.get(item.id) === payload) return true;
      return executePlan([{ table, upserts: [{ id: item.id, payload }], deletes: [] }]);
    });
  }

  function reserveTripAssignment(tripId, driverId, updatedAt) {
    return enqueue(async () => {
      const result = await pool.query(
        `update public.trips
           set payload = jsonb_set(
             jsonb_set(
               jsonb_set(payload, '{driverId}', to_jsonb($2::text), true),
               '{status}', to_jsonb('DRIVER_ASSIGNED'::text), true
             ),
             '{updatedAt}', to_jsonb($3::text), true
           )
         where id = $1
           and status = 'SEARCHING'
           and driver_id is null
         returning payload`,
        [tripId, driverId, updatedAt]
      );
      if (result.rowCount !== 1) return false;
      shadow.get('trips').set(tripId, JSON.stringify(result.rows[0].payload));
      return true;
    });
  }

  return {
    kind: 'postgres',
    persist,
    persistRecord,
    reserveTripAssignment,
    flush: () => writeQueue,
    shadowSize: table => shadow.get(table)?.size ?? 0,
    close: () => pool.end(),
    tables: PERSISTED_TABLES
  };
}
