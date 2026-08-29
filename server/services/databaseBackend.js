import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabasePersistence, PERSISTED_TABLES } from './databasePersistence.js';
import {
  createPostgresPersistence,
  createPostgresPool,
  loadPostgresDatabase
} from './postgresPersistence.js';
import { runStartupWithRetry } from './startupRetry.js';

export async function openDatabaseBackend({
  dataFile,
  migrationsDirectory,
  logger = console,
  // Inyectables SOLO para pruebas: producción usa los reales.
  postgres = { createPool: createPostgresPool, load: loadPostgresDatabase, createPersistence: createPostgresPersistence },
  retryOptions = {}
} = {}) {
  if (process.env.DATABASE_URL) {
    // DB-STARTUP-RESILIENCE-1: un corte transitorio del pooler (el incidente
    // real: Supavisor sin upstream unos minutos) ya no mata el arranque al
    // primer golpe. CADA intento es completo y autocontenido: crea SU pool
    // y, si falla, lo cierra antes de reintentar — jamás sobreviven dos
    // pools. El fail-closed sigue intacto: errores permanentes (auth, TLS,
    // configuración) fallan rápido, y la ventana de reintentos es finita.
    return runStartupWithRetry({
      logger,
      ...retryOptions,
      attempt: async () => {
        const pool = postgres.createPool({
          connectionString: process.env.DATABASE_URL,
          max: Number(process.env.DATABASE_POOL_MAX || 10)
        });
        try {
          await pool.query('select 1 as ready');
          const database = await postgres.load(pool);
          const persistence = await postgres.createPersistence({ pool, database, logger });
          return { kind: 'postgres', database, persistence, close: () => persistence.close() };
        } catch (error) {
          await pool.end?.().catch?.(() => {});
          throw error;
        }
      }
    });
  }

  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const sqlite = new DatabaseSync(dataFile);
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    ${PERSISTED_TABLES.map(table => `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL);`).join('\n')}
    CREATE TABLE IF NOT EXISTS schemaMigrations (id TEXT PRIMARY KEY, appliedAt TEXT NOT NULL);
  `);

  if (fs.existsSync(migrationsDirectory)) {
    for (const filename of fs.readdirSync(migrationsDirectory).filter(name => name.endsWith('.sql')).sort()) {
      if (sqlite.prepare('SELECT id FROM schemaMigrations WHERE id = ?').get(filename)) continue;
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        sqlite.exec(fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8'));
        sqlite.prepare('INSERT INTO schemaMigrations (id, appliedAt) VALUES (?, ?)').run(filename, new Date().toISOString());
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw new Error(`MIGRATION_FAILED:${filename}:${error.message}`);
      }
    }
  }

  const database = Object.fromEntries(PERSISTED_TABLES.map(table => [
    table,
    sqlite.prepare(`SELECT payload FROM ${table}`).all().map(row => JSON.parse(row.payload))
  ]));
  const persistence = createDatabasePersistence({ sqlite, database, logger });
  return {
    kind: 'sqlite',
    database,
    persistence: {
      ...persistence,
      kind: 'sqlite',
      reserveTripAssignment: async () => true,
      // DRIVER-FINANCE-1: en SQLite (desarrollo y pruebas) no hay concurrencia
      // entre replicas, asi que la reserva se concede y el cobro se escribe
      // por la via normal. La garantia ATOMICA real vive en PostgreSQL, que
      // es lo que corre en produccion; aqui basta con no mentir sobre el
      // resultado. Mismo criterio que `reserveTripAssignment`.
      reserveDriverCommission: async () => true,
      releaseDriverCommission: async () => true,
      chargeDriverMaintenance: async ({ transaction, driver }) => {
        // La clave primaria de `transactions` sigue siendo la que decide.
        const yaExiste = sqlite.prepare('SELECT 1 FROM transactions WHERE id = ?').get(transaction.id);
        if (yaExiste) return 'ALREADY_CHARGED';
        const escrito = await persistence.persistRecord('transactions', transaction)
          && await persistence.persistRecord('users', driver);
        return escrito ? 'CHARGED' : 'FAILED';
      },
      flush: async () => true
    },
    close: async () => sqlite.close()
  };
}
