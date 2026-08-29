import fs from 'node:fs';
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
  adminActions: 'admin_actions',
  pushSubscriptions: 'push_subscriptions',
  transportSubscriptions: 'transport_subscriptions',
  scheduledRides: 'scheduled_rides'
});

const SSL_TRUE = new Set(['1', 'true', 'require', 'required']);
const SSL_FALSE = new Set(['0', 'false', 'disable', 'disabled']);

/**
 * Lee el certificado raiz con el que validar al servidor.
 *
 * Falla cerrado a proposito. Si la ruta esta configurada pero el fichero no se
 * puede leer, o su contenido no parece material PEM, se lanza en vez de seguir:
 * un `ca` vacio haria que Node cayera al almacen por defecto y volveria el
 * SELF_SIGNED_CERT_IN_CHAIN del cuarto cutover, pero disfrazado de exito de
 * configuracion. Ninguna rama de error activa `rejectUnauthorized: false`.
 *
 * El error solo lleva un codigo: ni el contenido del certificado, ni la cadena
 * de conexion, ni el error nativo de `fs` --que arrastraria rutas y
 * descriptores-- llegan a la telemetria.
 */
function leerCertificadoRaiz(ruta) {
  let contenido;
  try {
    contenido = fs.readFileSync(ruta, 'utf8');
  } catch {
    throw new Error('DATABASE_SSL_CA_UNREADABLE');
  }
  if (!contenido.trim() || !contenido.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('DATABASE_SSL_CA_INVALID');
  }
  return contenido;
}

export function resolvePostgresSsl(
  value = process.env.DATABASE_SSL,
  caFile = process.env.DATABASE_SSL_CA_FILE
) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (SSL_TRUE.has(normalized)) {
    const ruta = String(caFile ?? '').trim();
    // Sin CA configurada se conserva el comportamiento de siempre: verificar
    // contra el almacen por defecto de Node.
    if (!ruta) return { rejectUnauthorized: true };
    return { rejectUnauthorized: true, ca: leerCertificadoRaiz(ruta) };
  }
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


  /**
   * DRIVER-FINANCE-1 - reserva ATOMICA de la comision que una carrera nueva
   * le costara al conductor.
   *
   * El suelo de deuda no puede depender de una lectura previa: entre mirar el
   * saldo y aceptar la carrera cabe otra aceptacion. Aqui la condicion y el
   * apunte ocurren en la MISMA sentencia, asi que dos aceptaciones simultaneas
   * no pueden apoyarse las dos en el mismo saldo viejo. Lo comprometido se
   * resta junto al saldo para decidir: es dinero ya prometido a la plataforma
   * aunque todavia no se haya cobrado.
   */
  function reserveDriverCommission(driverId, amount, floorUSD) {
    return enqueue(async () => {
      // La reserva vive en SU PROPIA TABLA, no dentro del documento del
      // conductor. Esa es la diferencia que importa: una prueba contra
      // PostgreSQL real demostro que, guardandola en `users.payload`, la
      // siguiente escritura del documento completo --hecha por otra replica
      // con una copia vieja-- la borraba. En una fila aparte, ninguna
      // escritura de `users` puede tocarla.
      //
      // La condicion y el apunte siguen ocurriendo en la MISMA sentencia, asi
      // que dos aceptaciones simultaneas tampoco pueden gastar la misma
      // capacidad: la capacidad se lee del saldo menos lo ya comprometido.
      await pool.query(
        `insert into public.driver_finance_state (driver_id) values ($1)
         on conflict (driver_id) do nothing`,
        [driverId]
      );
      const result = await pool.query(
        `update public.driver_finance_state f
            set committed_commission_usd = round((f.committed_commission_usd + $2::numeric)::numeric, 2),
                updated_at = now()
           from public.users u
          where f.driver_id = $1
            and u.id = f.driver_id
            and coalesce((u.payload->>'walletBalance')::numeric, 0)
                - f.committed_commission_usd
                - $2::numeric >= $3::numeric
          returning f.committed_commission_usd`,
        [driverId, amount, floorUSD]
      );
      return result.rowCount === 1;
    });
  }

  /** Lo comprometido HOY, leido de su tabla autoritativa. */
  function readCommittedCommission(driverId) {
    return pool.query(
      `select committed_commission_usd from public.driver_finance_state where driver_id = $1`,
      [driverId]
    ).then(r => (r.rowCount ? Number(r.rows[0].committed_commission_usd) : 0));
  }

  /** Devuelve lo reservado: la carrera se liquido, se cancelo o no llego a
   *  nacer. Nunca baja de cero. */
  function releaseDriverCommission(driverId, amount) {
    return enqueue(async () => {
      const result = await pool.query(
        `update public.driver_finance_state
            set committed_commission_usd = greatest(0, round((committed_commission_usd - $2::numeric)::numeric, 2)),
                updated_at = now()
          where driver_id = $1
          returning committed_commission_usd`,
        [driverId, amount]
      );
      return result.rowCount === 1;
    });
  }

  /**
   * DRIVER-FINANCE-1 - el cobro mensual, exactamente una vez, garantizado por
   * la BASE y no por una lectura previa.
   *
   * La transaccion lleva un identificador DETERMINISTA por conductor y
   * periodo, y la clave primaria de la tabla es la que decide: el segundo
   * proceso que intente el mismo cobro inserta cero filas y se retira. El
   * apunte y el debito del saldo viajan en la MISMA transaccion de base de
   * datos, asi que no existe el estado intermedio de <<transaccion escrita,
   * saldo sin tocar>> que dejaria el cobro perdido tras un reinicio.
   */
  function chargeDriverMaintenance({ transaction, driver }) {
    return enqueue(async () => {
      const client = await pool.connect();
      try {
        const payloadTransaccion = serializeRecord('transactions', transaction);
        const payloadConductor = serializeRecord('users', driver);
        await client.query('begin');
        const insert = await client.query(
          `insert into public.transactions (id, payload) values ($1, $2::jsonb)
           on conflict (id) do nothing`,
          [transaction.id, payloadTransaccion]
        );
        if (insert.rowCount !== 1) {
          await client.query('rollback');
          return 'ALREADY_CHARGED';
        }
        await client.query(
          `insert into public.users (id, payload) values ($1, $2::jsonb)
           on conflict (id) do update set payload = excluded.payload`,
          [driver.id, payloadConductor]
        );
        await client.query('commit');
        shadow.get('transactions').set(transaction.id, payloadTransaccion);
        shadow.get('users').set(driver.id, payloadConductor);
        return 'CHARGED';
      } catch (error) {
        try { await client.query('rollback'); } catch {}
        logger.error('[+58express Database] cobro de mantenimiento fallido:', error.message);
        return 'FAILED';
      } finally {
        client.release();
      }
    });
  }

  return {
    kind: 'postgres',
    persist,
    persistRecord,
    reserveTripAssignment,
    reserveDriverCommission,
    releaseDriverCommission,
    readCommittedCommission,
    chargeDriverMaintenance,
    flush: () => writeQueue,
    shadowSize: table => shadow.get(table)?.size ?? 0,
    close: () => pool.end(),
    tables: PERSISTED_TABLES
  };
}
