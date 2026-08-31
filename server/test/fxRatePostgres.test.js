import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  guardarTasa,
  identidadDeTasa,
  leerHistorial,
  leerTasaDeFecha,
  leerTasaVigente
} from '../services/fxRateStore.ts';

/**
 * FX-BCV-1 — la tasa contra PostgreSQL de verdad.
 *
 * SOLO se ejecuta contra `TEST_DATABASE_URL`, y sólo después de PROBAR que ese
 * destino no es producción. Sin esa variable, la suite se salta entera: no hay
 * ninguna ruta por la que estas escrituras puedan acabar en la base real.
 *
 * Ni la URI, ni el usuario, ni la contraseña se imprimen en ningún caso.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RUTA_MIGRACION = path.resolve(
  aqui,
  '../../supabase/migrations/20260830120000_fx_exchange_rates.sql'
);

/**
 * Fechas valor de un futuro imposible.
 *
 * Así estas filas no pueden confundirse con datos reales ni interferir con la
 * consulta de «tasa vigente» de nadie más, y se borran al terminar.
 */
const FECHA_A = '2999-01-01';
const FECHA_B = '2999-01-02';
const FECHA_C = '2999-01-03';
const FECHAS = [FECHA_A, FECHA_B, FECHA_C];

const uriDePrueba = process.env.TEST_DATABASE_URL || '';

/**
 * Conecta al PostgreSQL de pruebas.
 *
 * El puerto 6543 (el pooler en modo transacción) se usa como alternativa porque
 * en algunas redes el 5432 no es accesible; se intenta primero el que venga
 * configurado y sólo se cae al otro si no responde.
 */
async function abrirPool() {
  if (!uriDePrueba) return null;
  const configurado = Number(new URL(uriDePrueba).port || 5432);
  for (const puerto of [...new Set([configurado, 6543])]) {
    const uri = new URL(uriDePrueba);
    uri.port = String(puerto);
    const pool = new pg.Pool({
      connectionString: uri.toString(),
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 15000
    });
    try {
      await pool.query('select 1');
      return pool;
    } catch {
      try { await pool.end(); } catch { /* el pool ya está inservible */ }
    }
  }
  return null;
}

/**
 * Comprueba que el destino NO es producción antes de escribir una sola fila.
 *
 * La base real de +58express tiene usuarios reales; la de pruebas no. Es una
 * comprobación sobre el CONTENIDO, así que no depende de que la configuración
 * esté bien puesta — que es justo lo que podría estar mal.
 */
async function esDestinoDePruebas(pool) {
  const { rows } = await pool.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = 'users'`
  );
  if (rows[0].n === 0) return true;
  const { rows: usuarios } = await pool.query('select count(*)::int as n from public.users');
  return usuarios[0].n <= 50;
}

const pool = await abrirPool();
let apto = false;
if (pool) {
  apto = await esDestinoDePruebas(pool);
  if (apto) await pool.query(fs.readFileSync(RUTA_MIGRACION, 'utf8'));
}

const saltar = {
  skip: !uriDePrueba
    ? 'requiere TEST_DATABASE_URL (PostgreSQL de pruebas)'
    : !pool
      ? 'no se pudo conectar al PostgreSQL de pruebas'
      : !apto
        ? 'el destino no se pudo verificar como NO productivo'
        : false
};

async function limpiar() {
  if (!pool || !apto) return;
  await pool.query('delete from public.exchange_rates where value_date = any($1::date[])', [FECHAS]);
}

test.after(async () => {
  await limpiar();
  if (pool) await pool.end();
});

// ---------------------------------------------------------------------------
// La migración: no basta con que la tabla exista
// ---------------------------------------------------------------------------

test('la tabla se crea con la precisión declarada', saltar, async () => {
  const { rows } = await pool.query(
    `select column_name, data_type, numeric_precision, numeric_scale, is_nullable
       from information_schema.columns
      where table_schema = 'public' and table_name = 'exchange_rates'
      order by column_name`
  );
  const columnas = Object.fromEntries(rows.map(r => [r.column_name, r]));

  // Lo que importa de verdad: NUMERIC con ocho decimales, nunca coma flotante.
  assert.equal(columnas.rate.data_type, 'numeric');
  assert.equal(columnas.rate.numeric_precision, 18);
  assert.equal(columnas.rate.numeric_scale, 8);
  assert.equal(columnas.rate.is_nullable, 'NO');

  assert.equal(columnas.value_date.data_type, 'date');
  assert.equal(columnas.fetched_at.data_type, 'timestamp with time zone');
});

test('las restricciones existen Y dicen lo que deben decir', saltar, async () => {
  // Comprobar sólo el NOMBRE dejaría pasar una restricción renombrada que no
  // restringe nada. Se mira su definición.
  const { rows } = await pool.query(
    `select con.conname as nombre, pg_get_constraintdef(con.oid) as definicion
       from pg_constraint con
       join pg_class cls on cls.oid = con.conrelid
       join pg_namespace nsp on nsp.oid = cls.relnamespace
      where nsp.nspname = 'public' and cls.relname = 'exchange_rates'`
  );
  const porNombre = Object.fromEntries(rows.map(r => [r.nombre, r.definicion]));

  assert.match(porNombre.exchange_rates_rate_positive, /rate > \(?0/);
  assert.match(porNombre.exchange_rates_base_is_usd, /base_currency = 'USD'/);
  assert.match(porNombre.exchange_rates_quote_is_ves, /quote_currency = 'VES'/);
  assert.match(porNombre.exchange_rates_source_is_bcv, /source = 'BCV'/);
  assert.match(porNombre.exchange_rates_revision_positive, /revision >= 1/);
  assert.ok(porNombre.exchange_rates_id_matches, 'la identidad tiene que estar declarada');
});

test('el índice único de identidad está y cubre lo correcto', saltar, async () => {
  const { rows } = await pool.query(
    `select indexdef from pg_indexes
      where schemaname = 'public' and tablename = 'exchange_rates'
        and indexname = 'exchange_rates_identity'`
  );
  assert.equal(rows.length, 1, 'el índice de identidad tiene que existir');
  assert.match(rows[0].indexdef, /UNIQUE/);
  for (const columna of ['base_currency', 'quote_currency', 'source', 'value_date']) {
    assert.match(rows[0].indexdef, new RegExp(columna));
  }
});

test('la migración se puede aplicar dos veces sin romperse', saltar, async () => {
  // Es lo que hace que un despliegue repetido sea seguro.
  await pool.query(fs.readFileSync(RUTA_MIGRACION, 'utf8'));
  const { rows } = await pool.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = 'exchange_rates'`
  );
  assert.equal(rows[0].n, 1);
});

// ---------------------------------------------------------------------------
// Escritura: precisión e idempotencia
// ---------------------------------------------------------------------------

test('los ocho decimales sobreviven al viaje de ida y vuelta', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, {
    tasa: '794.99170000',
    fechaValor: FECHA_A,
    obtenidaEn: '2026-08-30T21:30:00.000Z'
  });

  const leida = await leerTasaDeFecha(pool, FECHA_A);
  assert.equal(leida.rate, '794.99170000', 'ni un dígito de más ni de menos');
  // Y sigue siendo una CADENA: `pg` devuelve `numeric` como texto, y aquí no se
  // convierte. En cuanto pasara por `Number` dejaría de ser exacto.
  assert.equal(typeof leida.rate, 'string');
  assert.equal(leida.valueDate, FECHA_A);
  assert.equal(leida.source, 'BCV');
  assert.equal(leida.base, 'USD');
  assert.equal(leida.quote, 'VES');
});

test('guardar dos veces la misma tasa no duplica ni cuenta revisiones', saltar, async () => {
  await limpiar();
  const tasa = { tasa: '794.99170000', fechaValor: FECHA_A, obtenidaEn: '2026-08-30T21:30:00.000Z' };

  const primera = await guardarTasa(pool, tasa);
  assert.equal(primera.resultado, 'INSERTADA');
  assert.equal(primera.revision, 1);

  const segunda = await guardarTasa(pool, tasa);
  assert.equal(segunda.resultado, 'SIN_CAMBIOS', 'una tasa idéntica no vuelve a escribirse');
  assert.equal(segunda.revision, 1, 'y no inventa una revisión');

  const tercera = await guardarTasa(pool, { ...tasa, obtenidaEn: '2026-08-30T23:00:00.000Z' });
  assert.equal(tercera.resultado, 'SIN_CAMBIOS', 'obtenerla otra vez tampoco cuenta como cambio');

  const { rows } = await pool.query(
    'select count(*)::int as n from public.exchange_rates where value_date = $1::date',
    [FECHA_A]
  );
  assert.equal(rows[0].n, 1, 'una sola fila para una sola fecha valor');
});

test('una corrección del BCV se guarda y queda registrada', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, { tasa: '794.99170000', fechaValor: FECHA_A, obtenidaEn: '2026-08-30T21:30:00.000Z' });

  const corregida = await guardarTasa(pool, {
    tasa: '795.10000000',
    fechaValor: FECHA_A,
    obtenidaEn: '2026-08-30T23:45:00.000Z'
  });

  assert.equal(corregida.resultado, 'CORREGIDA');
  assert.equal(corregida.revision, 2, 'queda rastro de que hubo una corrección');

  const leida = await leerTasaDeFecha(pool, FECHA_A);
  assert.equal(leida.rate, '795.10000000');
  assert.equal(leida.revision, 2);
});

test('la identidad determinista impide dos tasas para el mismo día', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, { tasa: '794.99170000', fechaValor: FECHA_A, obtenidaEn: '2026-08-30T21:30:00.000Z' });

  // Un intento de insertar la misma identidad de negocio con OTRO id: es el
  // fallo que el índice único existe para atrapar, porque la clave primaria
  // sola no lo vería.
  await assert.rejects(
    () => pool.query(
      `insert into public.exchange_rates
         (id, base_currency, quote_currency, rate, value_date, source, fetched_at)
       values ($1, 'USD', 'VES', 1.5, $2::date, 'BCV', now())`,
      ['un-id-cualquiera', FECHA_A]
    ),
    /exchange_rates_id_matches|duplicate key/,
    'o lo frena la identidad, o lo frena el índice único: alguna de las dos'
  );
});

test('el motor rechaza lo que no debe entrar', saltar, async () => {
  const casos = [
    ['una tasa negativa', ['USD-VES-BCV-2999-01-09', 'USD', 'VES', '-1', '2999-01-09', 'BCV']],
    ['una tasa de cero', ['USD-VES-BCV-2999-01-10', 'USD', 'VES', '0', '2999-01-10', 'BCV']],
    ['otra fuente', ['USD-VES-BINANCE-2999-01-11', 'USD', 'VES', '1', '2999-01-11', 'BINANCE']],
    ['otra moneda base', ['EUR-VES-BCV-2999-01-12', 'EUR', 'VES', '1', '2999-01-12', 'BCV']],
    ['otra moneda cotizada', ['USD-COP-BCV-2999-01-13', 'USD', 'COP', '1', '2999-01-13', 'BCV']]
  ];

  for (const [descripcion, valores] of casos) {
    await assert.rejects(
      () => pool.query(
        `insert into public.exchange_rates
           (id, base_currency, quote_currency, rate, value_date, source, fetched_at)
         values ($1, $2, $3, $4::numeric, $5::date, $6, now())`,
        valores
      ),
      /violates check constraint/,
      `debería rechazar: ${descripcion}`
    );
  }
});

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

test('la tasa vigente es la de fecha valor más reciente', saltar, async () => {
  await limpiar();
  // A propósito en desorden: lo que manda es la fecha valor, no el orden de
  // inserción ni el momento en que se descargó.
  await guardarTasa(pool, { tasa: '700.00000000', fechaValor: FECHA_B, obtenidaEn: '2026-08-30T21:30:00.000Z' });
  await guardarTasa(pool, { tasa: '900.00000000', fechaValor: FECHA_C, obtenidaEn: '2026-08-29T21:30:00.000Z' });
  await guardarTasa(pool, { tasa: '800.00000000', fechaValor: FECHA_A, obtenidaEn: '2026-08-31T21:30:00.000Z' });

  const vigente = await leerTasaVigente(pool);
  assert.equal(vigente.valueDate, FECHA_C);
  assert.equal(vigente.rate, '900.00000000');
});

test('el historial llega ordenado de la más nueva a la más vieja', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, { tasa: '700.00000000', fechaValor: FECHA_A, obtenidaEn: '2026-08-30T21:30:00.000Z' });
  await guardarTasa(pool, { tasa: '800.00000000', fechaValor: FECHA_B, obtenidaEn: '2026-08-30T21:30:00.000Z' });
  await guardarTasa(pool, { tasa: '900.00000000', fechaValor: FECHA_C, obtenidaEn: '2026-08-30T21:30:00.000Z' });

  const historial = await leerHistorial(pool, 3);
  assert.deepEqual(historial.map(t => t.valueDate), [FECHA_C, FECHA_B, FECHA_A]);
  assert.deepEqual(historial.map(t => t.rate), ['900.00000000', '800.00000000', '700.00000000']);
});

test('la fecha valor no se corre un día al leerla', saltar, async () => {
  // `pg` devuelve `date` como `Date` a medianoche. Formatearla con métodos
  // locales en un huso al oeste de UTC —Caracas lo es— la devolvería al día
  // anterior, y esa tasa sería la del día equivocado.
  await limpiar();
  await guardarTasa(pool, { tasa: '794.99170000', fechaValor: FECHA_A, obtenidaEn: '2026-08-30T21:30:00.000Z' });
  const leida = await leerTasaDeFecha(pool, FECHA_A);
  assert.equal(leida.valueDate, FECHA_A);
  assert.equal(identidadDeTasa('USD', 'VES', 'BCV', leida.valueDate), `USD-VES-BCV-${FECHA_A}`);
});
