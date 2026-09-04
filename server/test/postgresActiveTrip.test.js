import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from 'pg';

const { Pool } = pkg;

/**
 * La invariante de «un viaje activo» contra PostgreSQL DE VERDAD.
 *
 * POR QUE NO SE USA `TEST_DATABASE_URL`
 *
 * En la maquina donde se escribio esto, `TEST_DATABASE_URL` y
 * `PRODUCTION_DATABASE_URL` apuntaban al MISMO host y la MISMA base de
 * Supabase. La documentacion del propio proyecto lo prohibe --«nunca una URL
 * de produccion en tests»-- y una prueba de concurrencia escribe cientos de
 * viajes. Asi que se levanta un PostgreSQL propio y desechable.
 *
 * Se salta sola si `embedded-postgres` no esta instalado, para no romperle la
 * suite a nadie:
 *
 *     npm install --no-save embedded-postgres && node --test test/postgresActiveTrip.test.js
 *
 * QUE DEMUESTRA
 *
 * Que `insert ... where not exists` NO basta, y que el cerrojo consultivo si.
 * No es una opinion sobre el aislamiento de PostgreSQL: son las dos variantes
 * corriendo una al lado de la otra sobre la misma base.
 */

const CARRERAS = Number(process.env.PG_CARRERAS || 50);

/** Los estados que ocupan a una pasajera, alias historicos incluidos. */
const ACTIVOS = [
  'SEARCHING', 'DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS',
  'PENDING', 'ACCEPTED', 'EN_ROUTE', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_TRIP'
];

/** El esquema de `trips`, copiado de la migracion real. */
const DDL = `
create table if not exists public.users (id text primary key, payload jsonb not null);
create table if not exists public.trips (
  id text primary key,
  payload jsonb not null,
  passenger_id text generated always as (payload ->> 'passengerId') stored,
  driver_id text generated always as (payload ->> 'driverId') stored,
  assigned_driver_id text generated always as (payload ->> 'assignedDriverId') stored,
  status text generated always as (payload ->> 'status') stored,
  constraint trips_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint trips_payload_id_matches check ((payload ->> 'id') is not distinct from id)
);
create index if not exists trips_passenger_idx on public.trips (passenger_id);
create index if not exists trips_status_idx on public.trips (status);
-- El indice que esta fase anade: la reserva filtra por los dos a la vez.
create index if not exists trips_passenger_status_idx on public.trips (passenger_id, status);
`;

async function intentarLevantar() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  } catch {
    return null;
  }
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;

  const directorio = await mkdtemp(path.join(tmpdir(), 'plus58-pg-'));
  const puerto = 55400 + Math.floor(Math.random() * 90);
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(directorio, 'data'),
    user: 'plus58', password: 'plus58', port: puerto, persistent: false
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('plus58test');
  return {
    connectionString: `postgresql://plus58:plus58@127.0.0.1:${puerto}/plus58test`,
    async cerrar() {
      try { await pg.stop(); } catch { /* ya parado */ }
      await rm(directorio, { recursive: true, force: true }).catch(() => {});
    }
  };
}

/**
 * UNA sola base para todo el fichero.
 *
 * Levantar PostgreSQL cuesta unos segundos, y arrancar dos a la vez mientras el
 * resto de la suite corre en paralelo llega a agotar el tiempo de espera. Se
 * comparte, y se apaga cuando termina el ultimo test.
 */
let compartida = null;
async function base() {
  if (compartida === undefined) return null;
  if (compartida !== null) return compartida;
  compartida = await intentarLevantar();
  if (compartida === null) {
    compartida = undefined;   // no hay `embedded-postgres`: no reintentar
    return null;
  }
  compartida.pool = new Pool({ connectionString: compartida.connectionString, max: 10 });
  await compartida.pool.query(DDL);
  return compartida;
}

test.after(async () => {
  if (compartida === null || compartida === undefined) return;
  await compartida.pool.end().catch(() => {});
  await compartida.cerrar();
});

const viaje = (id, passengerId) => JSON.stringify({
  id, passengerId, status: 'SEARCHING', driverId: null, assignedDriverId: null
});

const INSERCION = `
  insert into public.trips (id, payload)
  select $1, $2::jsonb
   where not exists (
         select 1 from public.trips
          where passenger_id = $3 and status = any($4::text[])
       )
  returning id`;

/** Sin cerrojo: lo que parecia bastar. */
async function sinCerrojo(pool, id, passengerId) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const r = await cliente.query(INSERCION, [id, viaje(id, passengerId), passengerId, ACTIVOS]);
    await cliente.query('commit');
    return r.rowCount === 1;
  } catch {
    try { await cliente.query('rollback'); } catch { /* conexion perdida */ }
    return false;
  } finally {
    cliente.release();
  }
}

/** Con cerrojo por pasajera: lo que se implementa en `postgresPersistence.js`. */
async function conCerrojo(pool, id, passengerId) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query('select pg_advisory_xact_lock(hashtext($1))', [passengerId]);
    const r = await cliente.query(INSERCION, [id, viaje(id, passengerId), passengerId, ACTIVOS]);
    await cliente.query('commit');
    return r.rowCount === 1;
  } catch {
    try { await cliente.query('rollback'); } catch { /* conexion perdida */ }
    return false;
  } finally {
    cliente.release();
  }
}

async function carreras(pool, etiqueta, crear) {
  let dobles = 0;
  let ceros = 0;
  let aceptadas = 0;

  for (let i = 0; i < CARRERAS; i += 1) {
    const passengerId = `${etiqueta}_p${i}`;
    await pool.query(
      'insert into public.users (id, payload) values ($1, $2::jsonb) on conflict do nothing',
      [passengerId, JSON.stringify({ id: passengerId, role: 'passenger' })]
    );

    // DOS conexiones independientes, a la vez, ids distintos, misma pasajera:
    // como dos peticiones HTTP atendidas por dos instancias del servidor.
    const [a, b] = await Promise.all([
      crear(pool, `${etiqueta}_t${i}_a`, passengerId),
      crear(pool, `${etiqueta}_t${i}_b`, passengerId)
    ]);
    aceptadas += [a, b].filter(Boolean).length;

    const { rows } = await pool.query(
      'select count(*)::int as n from public.trips where passenger_id = $1 and status = any($2::text[])',
      [passengerId, ACTIVOS]
    );
    if (rows[0].n > 1) dobles += 1;
    if (rows[0].n === 0) ceros += 1;
  }
  return { dobles, ceros, aceptadas };
}

test('un solo viaje activo por pasajera, con PostgreSQL real y concurrencia real', async t => {
  const activa = await base();
  if (activa === null) {
    t.skip('sin `embedded-postgres`: npm install --no-save embedded-postgres');
    return;
  }
  const { pool } = activa;

  // 1. La version sin cerrojo, para que quede escrito POR QUE hace falta.
  const suelto = await carreras(pool, 'suelto', sinCerrojo);
  t.diagnostic(`sin cerrojo: ${suelto.dobles}/${CARRERAS} carreras con doble viaje, ${suelto.aceptadas} inserciones`);
  assert.ok(
    suelto.dobles > 0,
    'si esto deja de fallar, PostgreSQL cambio de comportamiento y hay que revisar la premisa del cerrojo'
  );

  // 2. La que se implementa de verdad.
  const seguro = await carreras(pool, 'seguro', conCerrojo);
  t.diagnostic(`con cerrojo: ${seguro.dobles}/${CARRERAS} carreras con doble viaje, ${seguro.aceptadas} inserciones`);

  assert.equal(seguro.dobles, 0, `${seguro.dobles} pasajeras acabaron con dos viajes activos`);
  assert.equal(seguro.ceros, 0, `${seguro.ceros} pasajeras se quedaron sin ningun viaje`);
  assert.equal(seguro.aceptadas, CARRERAS, 'de cada par debe prosperar exactamente uno');
});

test('el cerrojo es POR PASAJERA: dos personas distintas no se estorban', async t => {
  const activa = await base();
  if (activa === null) {
    t.skip('sin `embedded-postgres`');
    return;
  }
  const { pool } = activa;

  for (const id of ['ana_aparte', 'beto_aparte']) {
    await pool.query('insert into public.users (id, payload) values ($1, $2::jsonb) on conflict do nothing',
      [id, JSON.stringify({ id, role: 'passenger' })]);
  }

  const [a, b] = await Promise.all([
    conCerrojo(pool, 'trip_ana_aparte', 'ana_aparte'),
    conCerrojo(pool, 'trip_beto_aparte', 'beto_aparte')
  ]);
  assert.deepEqual([a, b], [true, true], 'la invariante es por pasajera, no global');
});

test('el índice que la reserva necesita existe en la migración', async () => {
  const fs = await import('node:fs');
  const path = (await import('node:path')).default;
  const { fileURLToPath } = await import('node:url');

  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const directorio = path.join(raiz, 'supabase/migrations');
  const migraciones = fs.readdirSync(directorio)
    .map(nombre => fs.readFileSync(path.join(directorio, nombre), 'utf8'))
    .join('\n');

  // La reserva filtra por passenger_id Y status a la vez. Con los indices
  // sueltos que ya habia, PostgreSQL puede elegir uno y descartar por el otro;
  // el compuesto resuelve la comprobacion sin tocar la tabla.
  assert.match(
    migraciones,
    /create index[^;]*trips\s*\(\s*passenger_id\s*,\s*status\s*\)/i,
    'falta el índice compuesto (passenger_id, status)'
  );
});
