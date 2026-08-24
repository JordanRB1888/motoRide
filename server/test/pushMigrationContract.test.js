import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSISTED_TABLES } from '../services/databasePersistence.js';
import { POSTGRES_TABLES } from '../services/postgresPersistence.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directorioMigraciones = path.join(raiz, 'supabase', 'migrations');

const ficheros = fs.readdirSync(directorioMigraciones).filter(nombre => nombre.endsWith('.sql')).sort();
const sqlCompleto = ficheros
  .map(nombre => fs.readFileSync(path.join(directorioMigraciones, nombre), 'utf8'))
  .join('\n')
  .toLowerCase();

const migracionPush = fs.readFileSync(
  path.join(directorioMigraciones, ficheros.find(nombre => nombre.includes('push_subscriptions'))),
  'utf8'
).toLowerCase();

/**
 * Contrato entre las colecciones que el servidor carga al arrancar y el
 * esquema que existe en PostgreSQL.
 *
 * Esta es la prueba que mas valor tiene de todo PUSH-1, y no cubre push: cubre
 * el ORDEN de despliegue.
 *
 * `loadPostgresDatabase` recorre PERSISTED_TABLES y ejecuta un `select` por
 * cada coleccion. Si se anade una coleccion y se despliega ANTES de que su
 * tabla exista, la consulta falla, `openDatabaseBackend` revienta y produccion
 * NO ARRANCA. Es la misma forma del incidente de DATABASE_SSL=require sin CA:
 * falla cerrado, en el arranque, con el servicio caido.
 *
 * Ademas, las migraciones de PostgreSQL NO se aplican solas: `runPostgresMigrations`
 * solo se invoca desde `npm run db:migrate`, y el contenedor de produccion ni
 * siquiera incluye supabase/migrations. Aplicarla es una operacion deliberada
 * desde estacion de trabajo, y tiene que ir SIEMPRE antes del despliegue.
 */

test('toda coleccion persistida tiene tabla fisica declarada en una migracion', () => {
  const sinTabla = [];
  for (const coleccion of PERSISTED_TABLES) {
    const fisica = POSTGRES_TABLES[coleccion];
    assert.ok(fisica, `la coleccion ${coleccion} no tiene nombre fisico en POSTGRES_TABLES`);
    const declarada = new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?public\\.${fisica}\\b`).test(sqlCompleto);
    if (!declarada) sinTabla.push(`${coleccion} -> public.${fisica}`);
  }
  assert.deepEqual(
    sinTabla, [],
    'hay colecciones que el arranque intentara leer y cuya tabla no existe en ninguna migracion; ' +
    'desplegar asi deja produccion sin arrancar'
  );
});

test('no sobra ningun nombre fisico sin coleccion que lo use', () => {
  const huerfanos = Object.keys(POSTGRES_TABLES).filter(clave => !PERSISTED_TABLES.includes(clave));
  assert.deepEqual(huerfanos, [], 'POSTGRES_TABLES declara tablas que nadie carga');
});

test('la coleccion de suscripciones esta registrada en las tres listas', () => {
  assert.ok(PERSISTED_TABLES.includes('pushSubscriptions'));
  assert.equal(POSTGRES_TABLES.pushSubscriptions, 'push_subscriptions');
});

// --------------------------------------------------------------------------
// La migracion en si
// --------------------------------------------------------------------------

test('la migracion crea la tabla siguiendo la convencion del esquema', () => {
  assert.match(migracionPush, /create table if not exists public\.push_subscriptions/);
  assert.match(migracionPush, /id text primary key/);
  assert.match(migracionPush, /payload jsonb not null/);
  // Columnas generadas: la convencion de la casa para poder indexar y declarar
  // integridad sobre un documento jsonb.
  assert.match(migracionPush, /user_id text generated always as \(payload ->> 'userid'\) stored/);
  assert.match(migracionPush, /endpoint_key text generated always as/);
  assert.match(migracionPush, /disabled_at text generated always as \(payload ->> 'disabledat'\) stored/);
});

test('la migracion declara integridad referencial real contra users', () => {
  // Mi propio informe de arquitectura afirmo que no se podia poner una clave
  // foranea porque el userId vive dentro del jsonb. Era incorrecto: el esquema
  // ya resuelve eso con columnas generadas, y `notifications_user_fk` es el
  // precedente exacto. Aqui queda la version correcta.
  assert.match(
    migracionPush,
    /constraint push_subscriptions_user_fk foreign key \(user_id\) references public\.users\(id\) deferrable initially deferred/
  );
});

test('la migracion protege las invariantes del documento', () => {
  assert.match(migracionPush, /check \(jsonb_typeof\(payload\) = 'object'\)/);
  assert.match(migracionPush, /check \(\(payload ->> 'id'\) is not distinct from id\)/);
});

test('la unicidad del endpoint es global y no parcial por estado', () => {
  const indice = migracionPush.match(/create unique index if not exists push_subscriptions_endpoint_key[\s\S]*?;/);
  assert.ok(indice, 'debe existir el indice unico del endpoint');
  const texto = indice[0];
  assert.match(texto, /on public\.push_subscriptions \(endpoint_key\)/);
  // Solo excluye los nulos. Si excluyera tambien las revocadas, un endpoint
  // dado de baja podria volver a darse de alta como fila nueva y acabarian dos
  // filas con el mismo endpoint: justo lo que impide que un telefono
  // reutilizado siga recibiendo los avisos de la cuenta anterior.
  assert.match(texto, /where endpoint_key is not null/);
  assert.ok(!texto.includes('disabled_at'), 'la unicidad no puede depender del estado de baja');
});

test('existen los indices de consulta por usuario, uno de ellos parcial', () => {
  assert.match(migracionPush, /create index if not exists push_subscriptions_user_idx\s+on public\.push_subscriptions \(user_id\)/);
  const activo = migracionPush.match(/create index if not exists push_subscriptions_active_idx[\s\S]*?;/);
  assert.ok(activo, 'debe existir el indice parcial de suscripciones vivas');
  assert.match(activo[0], /where disabled_at is null/);
});

test('la tabla queda cerrada al acceso publico, como el resto del esquema', () => {
  assert.match(migracionPush, /revoke all on public\.push_subscriptions from anon, authenticated/);
  assert.match(migracionPush, /alter table public\.push_subscriptions enable row level security/);
});

test('la migracion es idempotente en cada sentencia', () => {
  // El runner ya lleva registro en schema_migrations, pero una migracion que se
  // pueda repetir sin dano permite recuperarse a mano de una aplicacion a
  // medias sin editar SQL bajo presion.
  for (const sentencia of migracionPush.split(';')) {
    const limpia = sentencia.replace(/--[^\n]*\n/g, '').trim();
    if (limpia.startsWith('create table')) assert.match(limpia, /if not exists/);
    if (limpia.startsWith('create unique index') || limpia.startsWith('create index')) {
      assert.match(limpia, /if not exists/);
    }
  }
});

test('la migracion no se aplica sola en el arranque', () => {
  // AUTO_MIGRATIONS_ON_STARTUP: prohibido. Un servicio con replica unica y
  // healthcheck no debe migrar mientras arranca.
  const arranque = fs.readFileSync(path.join(raiz, 'server', 'services', 'databaseBackend.js'), 'utf8');
  assert.ok(
    !arranque.includes('runPostgresMigrations'),
    'el arranque no puede aplicar migraciones de PostgreSQL'
  );
});

// --------------------------------------------------------------------------
// Borrado de cuenta
// --------------------------------------------------------------------------

test('la foranea obliga a purgar las suscripciones al borrar una cuenta', () => {
  // No hay ON DELETE CASCADE, y es deliberado: sin el, borrar un usuario con
  // suscripciones vivas FALLA en vez de dejar filas huerfanas en silencio. El
  // futuro borrado/anonimizacion de cuenta --el que exigen App Store y Play
  // Store-- tendra que purgar pushSubscriptions de forma explicita.
  assert.ok(!/on delete cascade/.test(migracionPush), 'no debe haber cascada implicita');
  assert.match(migracionPush, /references public\.users\(id\)/);
});
