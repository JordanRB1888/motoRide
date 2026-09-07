/**
 * Aplica las migraciones de FX y de la cartera en el PostgreSQL de PRUEBAS.
 *
 * POR QUÉ ESTO ES UN SCRIPT Y NO PARTE DE LAS PRUEBAS
 *
 * Antes cada suite aplicaba las migraciones al arrancar. Node ejecuta los
 * ficheros de prueba en paralelo, así que cinco procesos lanzaban el mismo DDL
 * a la vez —`create table if not exists`, `drop trigger` + `create trigger`,
 * `create or replace function`— y se bloqueaban entre ellos: primero
 * `deadlock detected`, y con cerrojos, esperas hasta agotar el tiempo.
 *
 * La lección no es «hacía falta un cerrojo mejor»: es que una prueba no debería
 * cambiar el esquema como efecto secundario. Migrar es una operación explícita.
 * Las suites sólo comprueban que las tablas están, y si no están se saltan
 * diciendo qué ejecutar.
 *
 * SEGURIDAD
 *
 * Reutiliza el guard fuerte de FX-BCV-1A: identidad POSITIVA del proyecto de
 * Test, Producción denegada explícitamente, fallo cerrado si no se puede
 * determinar. Sin eso no se abre ni una conexión.
 *
 * No imprime la URI, ni el usuario, ni la contraseña.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  VARIABLE_DE_TEST,
  evaluarIdentidadDeBaseDeDatos,
  identidadesDeProduccionDelEntorno
} from '../domain/databaseIdentity.ts';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizRepo = path.resolve(aqui, '../..');

const MIGRACIONES = [
  'supabase/migrations/20260830120000_fx_exchange_rates.sql',
  'supabase/migrations/20260830140000_fx_exchange_rate_observations.sql',
  'supabase/migrations/20260831090000_wallet_payouts_foundation.sql'
].map(relativa => path.join(raizRepo, relativa));

const uri = process.env.TEST_DATABASE_URL || '';
if (!uri) {
  console.error('Falta TEST_DATABASE_URL.');
  process.exit(1);
}

const identidad = evaluarIdentidadDeBaseDeDatos({
  uriObservada: uri,
  refTestDeclarado: process.env[VARIABLE_DE_TEST],
  refsDeProduccion: identidadesDeProduccionDelEntorno()
});

if (!identidad.puedeEscribir) {
  console.error(`RECHAZADO — ${identidad.veredicto}: ${identidad.detalle}`);
  if (identidad.veredicto === 'RECHAZO_SIN_DECLARACION') {
    console.error(`Declare ${VARIABLE_DE_TEST} con el proyecto de Test.`);
  }
  process.exit(1);
}

console.log(`Identidad de Test confirmada — ${identidad.detalle}`);

async function abrir() {
  const configurado = Number(new URL(uri).port || 5432);
  for (const puerto of [...new Set([configurado, 6543])]) {
    const destino = new URL(uri);
    destino.port = String(puerto);
    const pool = new pg.Pool({
      connectionString: destino.toString(),
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 15000
    });
    try {
      await pool.query('select 1');
      console.log(`Conectado por el puerto ${puerto}.`);
      return pool;
    } catch {
      try { await pool.end(); } catch { /* pool inservible */ }
    }
  }
  return null;
}

const pool = await abrir();
if (!pool) {
  console.error('No se pudo conectar al PostgreSQL de pruebas.');
  process.exit(1);
}

try {
  for (const migracion of MIGRACIONES) {
    await pool.query(fs.readFileSync(migracion, 'utf8'));
    console.log(`  aplicada  ${path.basename(migracion)}`);
  }

  const { rows } = await pool.query(
    `select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('exchange_rates', 'exchange_rate_observations', 'wallets',
                           'wallet_ledger_entries', 'payment_methods',
                           'withdrawal_requests', 'withdrawal_audit_events')
      order by table_name`
  );
  console.log(`Tablas presentes: ${rows.map(r => r.table_name).join(', ')}`);
  console.log('Listo.');
} finally {
  await pool.end();
}
