import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  VARIABLE_DE_TEST,
  evaluarIdentidadDeBaseDeDatos,
  identidadesDeProduccionDelEntorno
} from '../domain/databaseIdentity.ts';
import {
  guardarTasa,
  identidadDeObservacion,
  identidadDeTasa,
  leerHistorial,
  leerObservaciones,
  leerTasaDeFecha,
  leerTasaVigente
} from '../services/fxRateStore.ts';

/**
 * FX-BCV-1 / 1A — la tasa contra PostgreSQL de verdad.
 *
 * EL GUARD DE IDENTIDAD VA PRIMERO
 *
 * Antes de conectar, antes de aplicar ninguna migración y antes de escribir una
 * sola fila, se exige identidad POSITIVA del proyecto de Test:
 * `FX_TEST_DB_PROJECT_REF` tiene que declarar cuál es, y el destino tiene que
 * ser exactamente ese.
 *
 * La versión anterior miraba el contenido —«si `users` tiene pocas filas, será
 * Test»— y eso no identifica nada: Producción también puede tener pocas filas.
 * El conteo sigue aquí, pero como señal SECUNDARIA que nunca autoriza por sí
 * misma.
 *
 * Ni la URI, ni el usuario, ni la contraseña se imprimen en ningún caso.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = [
  '../../supabase/migrations/20260830120000_fx_exchange_rates.sql',
  '../../supabase/migrations/20260830140000_fx_exchange_rate_observations.sql'
].map(relativa => path.resolve(aqui, relativa));

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

const TASA_ORIGINAL = '794.99170000';
const TASA_CORREGIDA = '795.10000000';

const uriDePrueba = process.env.TEST_DATABASE_URL || '';

// ---------------------------------------------------------------------------
// PASO 1 — identidad. Sin esto no se abre ni una conexión.
// ---------------------------------------------------------------------------

const identidad = uriDePrueba
  ? evaluarIdentidadDeBaseDeDatos({
      uriObservada: uriDePrueba,
      refTestDeclarado: process.env[VARIABLE_DE_TEST],
      refsDeProduccion: identidadesDeProduccionDelEntorno()
    })
  : null;

/**
 * Conecta al PostgreSQL de pruebas.
 *
 * El puerto 6543 (el pooler en modo transacción) se usa como alternativa porque
 * en algunas redes el 5432 no es accesible; se intenta primero el que venga
 * configurado y sólo se cae al otro si no responde.
 */
async function abrirPool() {
  const configurado = Number(new URL(uriDePrueba).port || 5432);
  for (const puerto of [...new Set([configurado, 6543])]) {
    const uri = new URL(uriDePrueba);
    uri.port = String(puerto);
    const pool = new pg.Pool({
      connectionString: uri.toString(),
      ssl: { rejectUnauthorized: false },
      max: 4,
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

// La conexión SOLO ocurre si la identidad quedó confirmada.
const pool = identidad?.puedeEscribir ? await abrirPool() : null;

if (pool) {
  // Señal SECUNDARIA, para diagnosticar. No autoriza nada: la autorización ya
  // la dio la identidad declarada. Si esto contradijera al guard, querríamos
  // verlo en el registro antes que ignorarlo.
  const { rows } = await pool.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = 'users'`
  );
  if (rows[0].n > 0) {
    const { rows: usuarios } = await pool.query('select count(*)::int as n from public.users');
    if (usuarios[0].n > 50) {
      console.warn(`[FX] aviso: el destino declarado como Test tiene ${usuarios[0].n} usuarios`);
    }
  }
  for (const migracion of MIGRACIONES) {
    await pool.query(fs.readFileSync(migracion, 'utf8'));
  }
}

const saltar = {
  skip: !uriDePrueba
    ? 'requiere TEST_DATABASE_URL (PostgreSQL de pruebas)'
    : !identidad?.puedeEscribir
      // El motivo real, no un consejo genérico: si el veredicto es
      // RECHAZO_ES_PRODUCCION, decirle a alguien que «declare la variable»
      // le estaría sugiriendo justo lo que no debe hacer.
      ? `${identidad?.veredicto} — ${identidad?.detalle}` +
        (identidad?.veredicto === 'RECHAZO_SIN_DECLARACION' ? ` (${VARIABLE_DE_TEST})` : '')
      : !pool
        ? 'no se pudo conectar al PostgreSQL de pruebas'
        : false
};

/**
 * Borra las filas de prueba.
 *
 * `exchange_rate_observations` es append-only por disparador, así que hay que
 * desactivarlo a propósito para limpiar. Es deliberado y visible: la protección
 * se levanta aquí, sólo para los datos del año 2999 de esta suite, y se vuelve a
 * poner enseguida. Hay una prueba aparte que comprueba que el disparador rechaza
 * de verdad cualquier modificación.
 */
async function limpiar() {
  if (!pool || !identidad?.puedeEscribir) return;
  await pool.query(
    'alter table public.exchange_rate_observations disable trigger exchange_rate_observations_sin_modificar'
  );
  try {
    await pool.query(
      'delete from public.exchange_rate_observations where value_date = any($1::date[])',
      [FECHAS]
    );
  } finally {
    await pool.query(
      'alter table public.exchange_rate_observations enable trigger exchange_rate_observations_sin_modificar'
    );
  }
  await pool.query('delete from public.exchange_rates where value_date = any($1::date[])', [FECHAS]);
}

test.after(async () => {
  await limpiar();
  if (pool) await pool.end();
});

const observacion = (fecha, obtenidaEn = '2026-08-30T21:30:00.000Z', tasa = TASA_ORIGINAL) =>
  ({ tasa, fechaValor: fecha, obtenidaEn });

// ---------------------------------------------------------------------------
// El guard, comprobado sobre la configuración REAL de esta ejecución
// ---------------------------------------------------------------------------

test('no se abrió ninguna conexión antes de confirmar la identidad', () => {
  // Se evalúa siempre, incluso sin base de datos: comprueba el ORDEN del
  // fichero. `pool` sólo puede existir si el guard autorizó, así que si esto
  // falla es que se conectó antes de preguntar.
  if (pool !== null) {
    assert.equal(identidad?.puedeEscribir, true, 'hay conexión sin identidad confirmada');
  }
  assert.ok(
    identidad === null || typeof identidad.veredicto === 'string',
    'la identidad tiene que estar evaluada antes de cualquier conexión'
  );
});

test('la identidad de esta ejecución quedó confirmada positivamente', saltar, () => {
  assert.equal(identidad.veredicto, 'APTO_PARA_ESCRITURA');
  // Y el detalle no filtra nada.
  assert.equal(identidad.detalle.includes(uriDePrueba), false);
  assert.equal(identidad.detalle.includes('@'), false);
});

// ---------------------------------------------------------------------------
// La migración: no basta con que las tablas existan
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

test('la tabla de observaciones tiene la MISMA precisión', saltar, async () => {
  // Si el historial guardara con menos precisión que la tasa vigente, auditar
  // un cobro daría un número distinto del que se cobró.
  const { rows } = await pool.query(
    `select column_name, data_type, numeric_precision, numeric_scale
       from information_schema.columns
      where table_schema = 'public' and table_name = 'exchange_rate_observations'
      order by column_name`
  );
  const columnas = Object.fromEntries(rows.map(r => [r.column_name, r]));
  assert.equal(columnas.rate.data_type, 'numeric');
  assert.equal(columnas.rate.numeric_precision, 18);
  assert.equal(columnas.rate.numeric_scale, 8);
  assert.equal(columnas.recorded_at.data_type, 'timestamp with time zone');
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
      where nsp.nspname = 'public'
        and cls.relname in ('exchange_rates', 'exchange_rate_observations')`
  );
  const porNombre = Object.fromEntries(rows.map(r => [r.nombre, r.definicion]));

  assert.match(porNombre.exchange_rates_rate_positive, /rate > \(?0/);
  assert.match(porNombre.exchange_rates_base_is_usd, /base_currency = 'USD'/);
  assert.match(porNombre.exchange_rates_quote_is_ves, /quote_currency = 'VES'/);
  assert.match(porNombre.exchange_rates_source_is_bcv, /source = 'BCV'/);
  assert.match(porNombre.exchange_rates_revision_positive, /revision >= 1/);
  assert.ok(porNombre.exchange_rates_id_matches, 'la identidad tiene que estar declarada');

  assert.match(porNombre.exchange_rate_observations_rate_positive, /rate > \(?0/);
  assert.match(porNombre.exchange_rate_observations_source_is_bcv, /source = 'BCV'/);
  assert.ok(porNombre.exchange_rate_observations_id_matches);
});

test('los índices únicos de identidad están y cubren lo correcto', saltar, async () => {
  const { rows } = await pool.query(
    `select indexname, indexdef from pg_indexes
      where schemaname = 'public'
        and indexname in ('exchange_rates_identity', 'exchange_rate_observations_identity')`
  );
  const porNombre = Object.fromEntries(rows.map(r => [r.indexname, r.indexdef]));

  assert.match(porNombre.exchange_rates_identity, /UNIQUE/);
  for (const columna of ['base_currency', 'quote_currency', 'source', 'value_date']) {
    assert.match(porNombre.exchange_rates_identity, new RegExp(columna));
  }

  // El del historial lleva ADEMÁS la revisión: es lo que permite muchas
  // observaciones por fecha y a la vez impide dos con el mismo número.
  assert.match(porNombre.exchange_rate_observations_identity, /UNIQUE/);
  assert.match(porNombre.exchange_rate_observations_identity, /revision/);
});

test('las migraciones se pueden aplicar dos veces sin romperse', saltar, async () => {
  // Es lo que hace que un despliegue repetido sea seguro.
  for (const migracion of MIGRACIONES) {
    await pool.query(fs.readFileSync(migracion, 'utf8'));
  }
  const { rows } = await pool.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public'
        and table_name in ('exchange_rates', 'exchange_rate_observations')`
  );
  assert.equal(rows[0].n, 2);
});

// ---------------------------------------------------------------------------
// Append-only, impuesto por el motor
// ---------------------------------------------------------------------------

test('el historial NO se puede modificar ni borrar', saltar, async () => {
  // Una tabla de auditoría que se puede editar no es una tabla de auditoría.
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A));

  await assert.rejects(
    () => pool.query(
      'update public.exchange_rate_observations set rate = 1 where value_date = $1::date',
      [FECHA_A]
    ),
    /append-only/,
    'un UPDATE tiene que rebotar'
  );

  await assert.rejects(
    () => pool.query(
      'delete from public.exchange_rate_observations where value_date = $1::date',
      [FECHA_A]
    ),
    /append-only/,
    'un DELETE tiene que rebotar'
  );

  // Y el valor sigue intacto tras los dos intentos.
  const historia = await leerObservaciones(pool, FECHA_A);
  assert.equal(historia.length, 1);
  assert.equal(historia[0].rate, TASA_ORIGINAL);
});

// ---------------------------------------------------------------------------
// Escritura: precisión e idempotencia
// ---------------------------------------------------------------------------

test('los ocho decimales sobreviven al viaje de ida y vuelta', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A));

  const leida = await leerTasaDeFecha(pool, FECHA_A);
  assert.equal(leida.rate, TASA_ORIGINAL, 'ni un dígito de más ni de menos');
  // Y sigue siendo una CADENA: `pg` devuelve `numeric` como texto, y aquí no se
  // convierte. En cuanto pasara por `Number` dejaría de ser exacto.
  assert.equal(typeof leida.rate, 'string');
  assert.equal(leida.valueDate, FECHA_A);
  assert.equal(leida.source, 'BCV');
  assert.equal(leida.base, 'USD');
  assert.equal(leida.quote, 'VES');
});

test('la misma tasa diez veces produce UNA sola observación', saltar, async () => {
  await limpiar();
  for (let i = 0; i < 10; i += 1) {
    // Cambia el instante de descarga en cada vuelta: lo que decide si hay
    // corrección es el VALOR, no cuándo se descargó.
    const resultado = await guardarTasa(
      pool,
      observacion(FECHA_A, `2026-08-30T${String(10 + i).padStart(2, '0')}:00:00.000Z`)
    );
    assert.equal(resultado.resultado, i === 0 ? 'INSERTADA' : 'SIN_CAMBIOS');
    assert.equal(resultado.revision, 1);
  }

  const historia = await leerObservaciones(pool, FECHA_A);
  assert.equal(historia.length, 1, 'diez descargas idénticas, una sola observación');
  assert.equal(historia[0].revision, 1);
  assert.equal(historia[0].rate, TASA_ORIGINAL);
});

test('una corrección conserva el valor anterior Y el nuevo', saltar, async () => {
  // El punto de todo FX-BCV-1A: `revision + 1` no basta si el valor viejo
  // desaparece. Un cobro hecho con la tasa anterior tiene que poder auditarse.
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A, '2026-08-30T21:30:00.000Z'));
  const corregida = await guardarTasa(
    pool,
    observacion(FECHA_A, '2026-08-30T23:45:00.000Z', TASA_CORREGIDA)
  );

  assert.equal(corregida.resultado, 'CORREGIDA');
  assert.equal(corregida.revision, 2);

  const historia = await leerObservaciones(pool, FECHA_A);
  assert.equal(historia.length, 2, 'las dos observaciones existen');

  // Reconstrucción completa: valor, orden, cuándo lo publicó el BCV y cuándo lo
  // supimos nosotros.
  assert.deepEqual(historia.map(o => o.rate), [TASA_ORIGINAL, TASA_CORREGIDA]);
  assert.deepEqual(historia.map(o => o.revision), [1, 2]);
  assert.deepEqual(historia.map(o => o.valueDate), [FECHA_A, FECHA_A]);
  assert.deepEqual(historia.map(o => o.source), ['BCV', 'BCV']);
  assert.equal(historia[0].fetchedAt.startsWith('2026-08-30T21:30'), true);
  assert.equal(historia[1].fetchedAt.startsWith('2026-08-30T23:45'), true);
  for (const anotada of historia) {
    assert.ok(Date.parse(anotada.recordedAt) > 0, 'consta cuándo se anotó');
  }

  // La identidad de cada observación es determinista y distinta.
  assert.equal(
    identidadDeObservacion('USD', 'VES', 'BCV', FECHA_A, 1),
    `${identidadDeTasa('USD', 'VES', 'BCV', FECHA_A)}#1`
  );
});

test('la tasa vigente tras una corrección es la corregida', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A));
  await guardarTasa(pool, observacion(FECHA_A, '2026-08-30T23:45:00.000Z', TASA_CORREGIDA));

  const vigente = await leerTasaVigente(pool);
  assert.equal(vigente.rate, TASA_CORREGIDA);
  assert.equal(vigente.valueDate, FECHA_A);

  // Y el valor ORIGINAL sigue siendo consultable. Las dos cosas a la vez son el
  // requisito: la vigente resuelve a B, y A no desaparece.
  const historia = await leerObservaciones(pool, FECHA_A);
  assert.equal(historia[0].rate, TASA_ORIGINAL);
});

test('repetir la corrección no genera revisiones de más', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A));
  await guardarTasa(pool, observacion(FECHA_A, '2026-08-30T23:45:00.000Z', TASA_CORREGIDA));

  for (let i = 0; i < 3; i += 1) {
    const repetida = await guardarTasa(
      pool,
      observacion(FECHA_A, `2026-08-31T0${i}:00:00.000Z`, TASA_CORREGIDA)
    );
    assert.equal(repetida.resultado, 'SIN_CAMBIOS');
    assert.equal(repetida.revision, 2);
  }

  const historia = await leerObservaciones(pool, FECHA_A);
  assert.equal(historia.length, 2, 'sigue habiendo exactamente dos observaciones');
});

// ---------------------------------------------------------------------------
// Concurrencia
// ---------------------------------------------------------------------------

test('cuatro escrituras simultáneas de la MISMA tasa son deterministas', saltar, async () => {
  await limpiar();
  const resultados = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      guardarTasa(pool, observacion(FECHA_B, `2026-08-30T2${i}:00:00.000Z`))
    )
  );

  // Exactamente una inserta; las demás ven que el valor ya está y no escriben.
  const insertadas = resultados.filter(r => r.resultado === 'INSERTADA');
  assert.equal(insertadas.length, 1, 'una sola inserción gana');
  assert.equal(resultados.every(r => r.revision === 1), true);

  const historia = await leerObservaciones(pool, FECHA_B);
  assert.equal(historia.length, 1, 'una sola observación pese a la concurrencia');
});

test('cuatro correcciones simultáneas producen UNA sola revisión', saltar, async () => {
  // La fila de `exchange_rates` serializa: la segunda transacción espera, vuelve
  // a evaluar contra la fila ya corregida y no escribe. Sin eso, cuatro
  // correcciones simultáneas dejarían el historial con revisiones fantasma.
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_B));

  const resultados = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      guardarTasa(pool, observacion(FECHA_B, `2026-08-31T0${i}:00:00.000Z`, TASA_CORREGIDA))
    )
  );

  const corregidas = resultados.filter(r => r.resultado === 'CORREGIDA');
  assert.equal(corregidas.length, 1, 'una sola corrección gana');
  assert.equal(resultados.every(r => r.revision === 2), true);

  const historia = await leerObservaciones(pool, FECHA_B);
  assert.equal(historia.length, 2);
  assert.deepEqual(historia.map(o => o.rate), [TASA_ORIGINAL, TASA_CORREGIDA]);
});

test('la tasa vigente y su observación nunca divergen', saltar, async () => {
  // Van en el MISMO statement precisamente para esto: no puede quedar una tasa
  // vigente sin la observación que la respalda.
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_C));
  await guardarTasa(pool, observacion(FECHA_C, '2026-08-31T02:00:00.000Z', TASA_CORREGIDA));

  const vigente = await leerTasaDeFecha(pool, FECHA_C);
  const historia = await leerObservaciones(pool, FECHA_C);
  const ultima = historia[historia.length - 1];

  assert.equal(historia.length, vigente.revision,
    'hay tantas observaciones como revisiones cuenta la tasa vigente');
  assert.equal(ultima.rate, vigente.rate);
  assert.equal(ultima.revision, vigente.revision);
});

// ---------------------------------------------------------------------------
// Instantáneas futuras (sin implementar Wallet Payouts)
// ---------------------------------------------------------------------------

test('una instantánea financiera sobrevive a una corrección posterior', saltar, async () => {
  // No se implementa nada de pagos: se comprueba que los cuatro campos que un
  // cobro necesitaría copiar bastan para quedar congelados e independientes.
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A));

  const alCobrar = await leerTasaDeFecha(pool, FECHA_A);
  const instantanea = Object.freeze({
    rate: alCobrar.rate,
    effectiveDate: alCobrar.valueDate,
    fetchedAt: alCobrar.fetchedAt,
    source: alCobrar.source
  });

  // El BCV corrige DESPUÉS del cobro.
  await guardarTasa(pool, observacion(FECHA_A, '2026-08-31T03:00:00.000Z', TASA_CORREGIDA));

  assert.equal(instantanea.rate, TASA_ORIGINAL, 'la instantánea no se mueve');
  assert.equal((await leerTasaVigente(pool)).rate, TASA_CORREGIDA, 'la vigente sí');

  // Y la instantánea es verificable contra el historial: se puede demostrar que
  // esa tasa existió de verdad y no es un número inventado en un recibo.
  const historia = await leerObservaciones(pool, FECHA_A);
  const respaldo = historia.find(o => o.rate === instantanea.rate);
  assert.ok(respaldo, 'la tasa de la instantánea consta en el historial');
  assert.equal(respaldo.fetchedAt, instantanea.fetchedAt);
  assert.equal(respaldo.source, instantanea.source);
  assert.equal(respaldo.revision, 1);
});

// ---------------------------------------------------------------------------
// Lo que el motor rechaza
// ---------------------------------------------------------------------------

test('la identidad determinista impide dos tasas para el mismo día', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A));

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
  await guardarTasa(pool, observacion(FECHA_B, '2026-08-30T21:30:00.000Z', '700.00000000'));
  await guardarTasa(pool, observacion(FECHA_C, '2026-08-29T21:30:00.000Z', '900.00000000'));
  await guardarTasa(pool, observacion(FECHA_A, '2026-08-31T21:30:00.000Z', '800.00000000'));

  const vigente = await leerTasaVigente(pool);
  assert.equal(vigente.valueDate, FECHA_C);
  assert.equal(vigente.rate, '900.00000000');
});

test('el historial llega ordenado de la más nueva a la más vieja', saltar, async () => {
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A, '2026-08-30T21:30:00.000Z', '700.00000000'));
  await guardarTasa(pool, observacion(FECHA_B, '2026-08-30T21:30:00.000Z', '800.00000000'));
  await guardarTasa(pool, observacion(FECHA_C, '2026-08-30T21:30:00.000Z', '900.00000000'));

  const historial = await leerHistorial(pool, 3);
  assert.deepEqual(historial.map(t => t.valueDate), [FECHA_C, FECHA_B, FECHA_A]);
  assert.deepEqual(historial.map(t => t.rate), ['900.00000000', '800.00000000', '700.00000000']);
});

test('la fecha valor no se corre un día al leerla', saltar, async () => {
  // `pg` devuelve `date` como `Date` a medianoche. Formatearla con métodos
  // locales en un huso al oeste de UTC —Caracas lo es— la devolvería al día
  // anterior, y esa tasa sería la del día equivocado.
  await limpiar();
  await guardarTasa(pool, observacion(FECHA_A));
  const leida = await leerTasaDeFecha(pool, FECHA_A);
  assert.equal(leida.valueDate, FECHA_A);
  assert.equal(identidadDeTasa('USD', 'VES', 'BCV', leida.valueDate), `USD-VES-BCV-${FECHA_A}`);

  const historia = await leerObservaciones(pool, FECHA_A);
  assert.equal(historia[0].valueDate, FECHA_A, 'tampoco en el historial');
});
