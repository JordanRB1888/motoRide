import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresPool } from '../services/postgresPersistence.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationsDirectory = path.join(root, 'supabase', 'migrations');

export async function runPostgresMigrations({ pool, directory = migrationsDirectory } = {}) {
  const files = (await fs.readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  const lockClient = await pool.connect();
  await lockClient.query('select pg_advisory_lock($1)', [58580001]);
  try {
    const exists = await lockClient.query("select to_regclass('public.schema_migrations') as table_name");
    const applied = new Set();
    if (exists.rows[0].table_name) {
      const result = await lockClient.query('select id from public.schema_migrations');
      result.rows.forEach(row => applied.add(row.id));
    }
    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = await fs.readFile(path.join(directory, filename), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into public.schema_migrations (id, applied_at) values ($1, now()) on conflict (id) do nothing',
          [filename]
        );
        await client.query('commit');
      } catch (error) {
        try { await client.query('rollback'); } catch {}
        throw new Error(`POSTGRES_MIGRATION_FAILED:${filename}:${error.message}`);
      } finally {
        client.release();
      }
    }
    return files;
  } finally {
    await lockClient.query('select pg_advisory_unlock($1)', [58580001]);
    lockClient.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
  try {
    const files = await runPostgresMigrations({ pool });
    console.log(JSON.stringify({ status: 'ok', migrations: files }, null, 2));
  } finally {
    await pool.end();
  }
}
