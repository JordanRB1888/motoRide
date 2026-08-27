/**
 * Reemplazo transaccional de las diez tablas canónicas.
 *
 * El importador original (`migrateSqliteToPostgres`) es ADITIVO: inserta con
 * `on conflict do nothing` y lanza `CONFLICTING_EXISTING_ROW` en cuanto una
 * fila que ya existe difiere del origen. Eso servía para un destino vacío.
 *
 * Ya no lo es. El segundo cutover importó los datos correctamente antes de
 * revertirse, así que PostgreSQL Production conserva ese contenido, y SQLite
 * volvió a ser la fuente de verdad y ha seguido recibiendo escrituras. En el
 * próximo intento el destino NO está vacío y además difiere:
 *
 *   - filas cambiadas en SQLite  -> el importador aditivo abortaría;
 *   - filas borradas en SQLite   -> sobrevivirían en PostgreSQL como fantasmas;
 *   - filas nuevas en SQLite     -> se insertarían, mezclando dos épocas.
 *
 * Este módulo reemplaza en vez de fusionar: dentro de UNA transacción vacía
 * las diez tablas y las repuebla íntegramente desde la instantánea congelada.
 * O queda exactamente igual que la instantánea, o no queda nada: cualquier
 * error revierte la transacción entera y el destino conserva su contenido
 * anterior.
 *
 * Nunca se tocan `schema_migrations`, los esquemas de plataforma de Supabase,
 * su capa de autenticación ni ninguna tabla fuera de las trece canónicas.
 */

import { isDeepStrictEqual } from 'node:util';
import { PERSISTED_TABLES } from '../services/databasePersistence.js';
import { POSTGRES_TABLES } from '../services/postgresPersistence.js';
import { readSqliteCollections, preflightSqliteData } from './sqlitePostgresMigration.js';

/**
 * Orden de borrado: primero las hijas, al final las raíces. Se respeta aunque
 * las restricciones estén diferidas, para que el procedimiento siga siendo
 * correcto si algún día dejan de serlo.
 */
export const CANONICAL_DELETE_ORDER = Object.freeze([
  'adminActions',       // -> users, driverApplications, transactions
  'driverDocuments',    // -> driverApplications, users
  'messages',           // -> trips, users
  'supportMessages',    // -> users
  'notifications',      // -> users
  'pushSubscriptions',  // -> users
  'scheduledRides',     // -> transportSubscriptions, users
  'transactions',       // -> users, trips
  'trips',              // -> users
  'driverApplications', // -> users
  'transportSubscriptions', // -> users
  'settings',           // sin dependencias
  'users'               // raíz
]);

/** Inserción en el orden inverso: primero los padres. */
export const CANONICAL_INSERT_ORDER = Object.freeze([...CANONICAL_DELETE_ORDER].reverse());

function comprobarCobertura() {
  const ordenadas = [...CANONICAL_DELETE_ORDER].sort();
  const canonicas = [...PERSISTED_TABLES].sort();
  if (!isDeepStrictEqual(ordenadas, canonicas)) {
    throw new Error(`CANONICAL_TABLE_SET_MISMATCH:${ordenadas.join(',')}|${canonicas.join(',')}`);
  }
}

async function contar(ejecutor, tabla) {
  const fisica = POSTGRES_TABLES[tabla];
  const r = await ejecutor.query(`select count(*)::int as count from public.${fisica}`);
  return r.rows[0].count;
}

async function identificadores(ejecutor, tabla) {
  const fisica = POSTGRES_TABLES[tabla];
  const r = await ejecutor.query(`select id from public.${fisica} order by id`);
  return r.rows.map(fila => fila.id);
}

/**
 * @param {object} opciones
 * @param {string} [opciones.filename]  Instantánea SQLite congelada.
 * @param {object} [opciones.collections]  Alternativa a `filename`, ya leída.
 * @param {object} opciones.pool  Pool de PostgreSQL.
 * @param {object} [opciones.expectedCounts]  Recuentos exigidos; si se pasan y
 *   no cuadran con la instantánea, se aborta ANTES de abrir la transacción.
 * @param {boolean} [opciones.isDryRun]
 */
export async function replacePostgresFromSqlite({
  filename,
  collections: coleccionesDadas,
  pool,
  expectedCounts,
  isDryRun = false
} = {}) {
  comprobarCobertura();

  const collections = coleccionesDadas || readSqliteCollections(filename);
  const summary = Object.fromEntries(PERSISTED_TABLES.map(tabla => [tabla, {
    snapshot: collections[tabla].length,
    before: null,
    after: null,
    deleted: 0,
    inserted: 0
  }]));

  // 1. Validación del origen antes de tocar nada: huérfanos, IDs duplicados,
  //    desajuste entre id y payload, correos y teléfonos normalizados.
  const errors = preflightSqliteData(collections);

  // 2. La puerta de recuentos, si se exige, también antes de la transacción.
  if (expectedCounts && typeof expectedCounts === 'object') {
    for (const tabla of PERSISTED_TABLES) {
      const esperado = expectedCounts[tabla];
      if (esperado === undefined) continue;
      if (collections[tabla].length !== esperado) {
        errors.push(`SNAPSHOT_COUNT_MISMATCH:${tabla}:${esperado}->${collections[tabla].length}`);
      }
    }
  }

  if (errors.length) return { status: 'preflight_failed', dryRun: isDryRun, summary, errors };
  if (!pool) {
    if (isDryRun) return { status: 'dry_run_ok', dryRun: true, summary, errors: [] };
    throw new Error('DATABASE_URL_REQUIRED');
  }

  // 3. Estado previo del destino: es lo que hay que poder restituir si algo
  //    sale mal, y lo que demuestra que el destino no estaba vacío.
  for (const tabla of PERSISTED_TABLES) summary[tabla].before = await contar(pool, tabla);
  const targetWasEmpty = PERSISTED_TABLES.every(tabla => summary[tabla].before === 0);

  if (isDryRun) {
    return { status: 'dry_run_ok', dryRun: true, summary, targetWasEmpty, errors: [] };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    // Diferir permite repoblar sin pelearse con el orden dentro del lote; el
    // orden explícito de borrado e inserción se mantiene igualmente.
    await client.query('set constraints all deferred');

    for (const tabla of CANONICAL_DELETE_ORDER) {
      const fisica = POSTGRES_TABLES[tabla];
      const r = await client.query(`delete from public.${fisica}`);
      summary[tabla].deleted = r.rowCount ?? 0;
    }

    for (const tabla of CANONICAL_INSERT_ORDER) {
      const fisica = POSTGRES_TABLES[tabla];
      for (const fila of collections[tabla]) {
        await client.query(
          `insert into public.${fisica} (id, payload) values ($1, $2::jsonb)`,
          [fila.id, JSON.stringify(fila.payload)]
        );
        summary[tabla].inserted += 1;
      }
    }

    // 4. Validación DENTRO de la transacción: si algo no cuadra se revierte y
    //    el destino conserva intacto su contenido anterior.
    const fallos = [];
    for (const tabla of PERSISTED_TABLES) {
      const despues = await contar(client, tabla);
      summary[tabla].after = despues;
      if (despues !== collections[tabla].length) {
        fallos.push(`COUNT_MISMATCH:${tabla}:${collections[tabla].length}->${despues}`);
      }
      const idsDestino = await identificadores(client, tabla);
      const idsOrigen = collections[tabla].map(fila => fila.id).sort();
      if (!isDeepStrictEqual([...idsDestino].sort(), idsOrigen)) {
        fallos.push(`ID_SET_MISMATCH:${tabla}`);
      }
    }
    if (fallos.length) throw new Error(`VALIDATION_FAILED:${fallos.join('|')}`);

    // El `commit` es donde las claves foráneas diferidas se comprueban de
    // verdad: si hubiera un huérfano que el preflight no viera, aquí revienta
    // y la transacción se deshace entera.
    await client.query('commit');
    return { status: 'replaced', dryRun: false, summary, targetWasEmpty, errors: [] };
  } catch (error) {
    try { await client.query('rollback'); } catch { /* la conexión ya murió */ }
    throw error;
  } finally {
    client.release();
  }
}
