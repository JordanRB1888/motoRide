import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { PERSISTED_TABLES } from '../services/databasePersistence.js';
import { POSTGRES_TABLES } from '../services/postgresPersistence.js';
import {
  replacePostgresFromSqlite,
  CANONICAL_DELETE_ORDER,
  CANONICAL_INSERT_ORDER
} from '../scripts/postgresReplacementImport.js';

/* --------------------------------------------------------------------------
   Doble de PostgreSQL en memoria.

   No pretende ser un motor SQL: reconoce exactamente las sentencias que emite
   el importador y modela lo unico que estas pruebas necesitan demostrar, que
   es la semantica transaccional. Los cambios se acumulan aparte y solo se
   vuelcan al almacen real en el `commit`; un `rollback` los descarta, que es
   como se comprueba que un fallo deja el destino intacto.
   -------------------------------------------------------------------------- */
function crearPostgresFalso(inicial = {}) {
  const almacen = new Map();
  for (const tabla of PERSISTED_TABLES) {
    const fisica = POSTGRES_TABLES[tabla];
    almacen.set(fisica, new Map((inicial[tabla] || []).map(f => [f.id, f.payload])));
  }

  const estado = { commits: 0, rollbacks: 0, transaccionAbierta: false, released: 0, constraintsDeferred: false };
  let fallarEn = null;   // subcadena que hace estallar la consulta

  const ejecutar = (destino, sql, params) => {
    const texto = sql.trim().toLowerCase();
    if (fallarEn && texto.includes(fallarEn)) throw new Error('FORCED_IMPORTER_FAILURE');

    let m;
    if ((m = texto.match(/^select count\(\*\)::int as count from public\.(\w+)$/))) {
      return { rows: [{ count: destino.get(m[1]).size }] };
    }
    if ((m = texto.match(/^select id from public\.(\w+) order by id$/))) {
      return { rows: [...destino.get(m[1]).keys()].sort().map(id => ({ id })) };
    }
    if ((m = texto.match(/^delete from public\.(\w+)$/))) {
      const t = destino.get(m[1]); const n = t.size; t.clear();
      return { rowCount: n };
    }
    if ((m = texto.match(/^insert into public\.(\w+) \(id, payload\)/))) {
      const t = destino.get(m[1]);
      if (t.has(params[0])) throw new Error(`DUPLICATE_KEY:${m[1]}:${params[0]}`);
      t.set(params[0], JSON.parse(params[1]));
      return { rowCount: 1 };
    }
    throw new Error(`SQL_NO_RECONOCIDO: ${sql}`);
  };

  const clonar = origen => new Map([...origen].map(([k, v]) => [k, new Map(v)]));

  const pool = {
    estado,
    forzarFalloEn(subcadena) { fallarEn = subcadena; },
    // Fuera de transaccion se lee del almacen confirmado.
    async query(sql, params) { return ejecutar(almacen, sql, params); },
    async connect() {
      let borrador = null;
      return {
        async query(sql, params) {
          const texto = sql.trim().toLowerCase();
          if (texto === 'begin') { borrador = clonar(almacen); estado.transaccionAbierta = true; return { rows: [] }; }
          if (texto === 'set constraints all deferred') { estado.constraintsDeferred = true; return { rows: [] }; }
          if (texto === 'commit') {
            for (const [k, v] of borrador) almacen.set(k, v);
            borrador = null; estado.transaccionAbierta = false; estado.commits += 1; return { rows: [] };
          }
          if (texto === 'rollback') {
            borrador = null; estado.transaccionAbierta = false; estado.rollbacks += 1; return { rows: [] };
          }
          return ejecutar(borrador ?? almacen, sql, params);
        },
        release() { estado.released += 1; }
      };
    },
    // Utilidades de comprobacion
    contenido(tabla) { return almacen.get(POSTGRES_TABLES[tabla]); },
    recuentos() {
      return Object.fromEntries(PERSISTED_TABLES.map(t => [t, almacen.get(POSTGRES_TABLES[t]).size]));
    }
  };
  return pool;
}

/** Instantanea SQLite congelada, con IDs y cargas utiles coherentes. */
async function instantanea(filas = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'plus58-pg-replace-'));
  const filename = path.join(dir, 'frozen.sqlite');
  const sqlite = new DatabaseSync(filename);
  for (const tabla of PERSISTED_TABLES) {
    sqlite.exec(`create table ${tabla} (id text primary key, payload text not null)`);
    const ins = sqlite.prepare(`insert into ${tabla} (id, payload) values (?, ?)`);
    for (const item of filas[tabla] || []) ins.run(item.id, JSON.stringify(item));
  }
  sqlite.close();
  return filename;
}

const BASE = {
  users: [
    { id: 'u1', email: 'ana@example.com', phone: '+58 414-111-0000' },
    { id: 'u2', email: 'luis@example.com', phone: '+58 414-111-2222' }
  ],
  trips: [{ id: 't1', passengerId: 'u1', driverId: 'u2', status: 'COMPLETED' }],
  transactions: [{ id: 'x1', userId: 'u1', tripId: 't1', amount: 3 }]
};

const comoDestino = filas => Object.fromEntries(
  PERSISTED_TABLES.map(t => [t, (filas[t] || []).map(f => ({ id: f.id, payload: f }))])
);

/* ========================================================================= */

test('el orden de borrado cubre las diez tablas y va de hijas a raices', () => {
  assert.equal(CANONICAL_DELETE_ORDER.length, 10);
  assert.deepEqual([...CANONICAL_DELETE_ORDER].sort(), [...PERSISTED_TABLES].sort());
  assert.deepEqual(CANONICAL_INSERT_ORDER, [...CANONICAL_DELETE_ORDER].reverse());
  // Cada hija se borra antes que su padre.
  const posicion = t => CANONICAL_DELETE_ORDER.indexOf(t);
  for (const [hija, padre] of [['adminActions', 'transactions'], ['driverDocuments', 'driverApplications'],
                               ['messages', 'trips'], ['transactions', 'trips'], ['trips', 'users']]) {
    assert.ok(posicion(hija) < posicion(padre), `${hija} debe borrarse antes que ${padre}`);
  }
});

test('destino vacio: PASA', async () => {
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso();
  const r = await replacePostgresFromSqlite({ filename, pool });
  assert.equal(r.status, 'replaced');
  assert.equal(r.targetWasEmpty, true);
  assert.equal(pool.recuentos().users, 2);
  assert.equal(pool.estado.commits, 1);
  assert.equal(pool.estado.rollbacks, 0);
});

test('destino con la importacion anterior exacta: el reemplazo PASA', async () => {
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso(comoDestino(BASE));
  const r = await replacePostgresFromSqlite({ filename, pool });
  assert.equal(r.status, 'replaced');
  assert.equal(r.targetWasEmpty, false);
  assert.equal(r.summary.users.before, 2);
  assert.equal(r.summary.users.deleted, 2);
  assert.equal(r.summary.users.after, 2);
});

test('destino con una instantanea anterior rancia: el reemplazo PASA y no deja fantasmas', async () => {
  // El destino trae un usuario que SQLite ya no tiene y un viaje con otra
  // carga util: fusionar dejaria basura, reemplazar la elimina.
  const rancio = comoDestino({
    users: [...BASE.users, { id: 'u9', email: 'fantasma@example.com', phone: '+58 414-999-9999' }],
    trips: [{ id: 't1', passengerId: 'u1', driverId: 'u2', status: 'SEARCHING' }],
    transactions: BASE.transactions
  });
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso(rancio);

  const r = await replacePostgresFromSqlite({ filename, pool });
  assert.equal(r.status, 'replaced');
  assert.equal(r.summary.users.before, 3);
  assert.equal(pool.recuentos().users, 2);
  assert.equal(pool.contenido('users').has('u9'), false, 'el usuario fantasma debe desaparecer');
  assert.equal(pool.contenido('trips').get('t1').status, 'COMPLETED', 'la carga util debe ser la de la instantanea');
});

test('fallo forzado del importador: el rollback restituye el destino anterior', async () => {
  const previo = comoDestino({ users: [{ id: 'u9', email: 'previo@example.com', phone: '+58 414-999-9999' }] });
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso(previo);

  pool.forzarFalloEn('insert into public.trips');
  await assert.rejects(replacePostgresFromSqlite({ filename, pool }), /FORCED_IMPORTER_FAILURE/);

  assert.equal(pool.estado.rollbacks, 1);
  assert.equal(pool.estado.commits, 0);
  assert.equal(pool.recuentos().users, 1);
  assert.equal(pool.contenido('users').has('u9'), true, 'el contenido anterior sigue intacto');
});

test('desajuste de validacion: revierte', async () => {
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso();
  // Se sabotea el recuento: la lectura de comprobacion devuelve de menos.
  const connectOriginal = pool.connect.bind(pool);
  pool.connect = async () => {
    const c = await connectOriginal();
    const queryOriginal = c.query.bind(c);
    c.query = async (sql, params) => {
      const r = await queryOriginal(sql, params);
      if (/count\(\*\)::int as count from public\.users/i.test(sql) && r.rows?.[0]?.count === 2) {
        return { rows: [{ count: 1 }] };
      }
      return r;
    };
    return c;
  };
  await assert.rejects(replacePostgresFromSqlite({ filename, pool }), /VALIDATION_FAILED.*COUNT_MISMATCH:users/);
  assert.equal(pool.estado.rollbacks, 1);
  assert.equal(pool.estado.commits, 0);
});

test('huerfano de clave foranea: se aborta antes de abrir la transaccion', async () => {
  const filename = await instantanea({ users: BASE.users, trips: [{ id: 't1', passengerId: 'inexistente' }] });
  const pool = crearPostgresFalso();
  const r = await replacePostgresFromSqlite({ filename, pool });
  assert.equal(r.status, 'preflight_failed');
  assert.ok(r.errors.some(e => e.startsWith('ORPHAN:trips:t1:passengerId')));
  assert.equal(pool.estado.commits, 0);
  assert.equal(pool.estado.transaccionAbierta, false);
});

test('correo normalizado duplicado: se aborta', async () => {
  const filename = await instantanea({
    users: [{ id: 'u1', email: 'Ana@Example.com' }, { id: 'u2', email: ' ana@example.com ' }]
  });
  const pool = crearPostgresFalso();
  const r = await replacePostgresFromSqlite({ filename, pool });
  assert.equal(r.status, 'preflight_failed');
  assert.ok(r.errors.some(e => e.startsWith('DUPLICATE_EMAIL:')));
  assert.equal(pool.estado.commits, 0);
});

test('telefono normalizado duplicado: se aborta', async () => {
  // La normalizacion retira todo lo que no sea digito, asi que estas dos
  // grafias del mismo numero colisionan y deben abortar la importacion.
  const filename = await instantanea({
    users: [{ id: 'u1', phone: '+58 414-111-0000' }, { id: 'u2', phone: '+584141110000' }]
  });
  const pool = crearPostgresFalso();
  const r = await replacePostgresFromSqlite({ filename, pool });
  assert.equal(r.status, 'preflight_failed');
  assert.ok(r.errors.some(e => e.startsWith('DUPLICATE_PHONE:')));
  assert.equal(pool.estado.commits, 0);
});

test('LIMITE CONOCIDO: la normalizacion de telefono no equipara 0414 con +58414', async () => {
  // `preflightSqliteData` normaliza quitando los no digitos, sin canonizar el
  // prefijo del pais. `04141110000` y `+584141110000` son el MISMO abonado en
  // Venezuela y aqui NO se detectan como duplicado.
  //
  // Esta prueba fija el comportamiento real en vez de suponer otro: si algun
  // dia se canoniza el prefijo, fallara y obligara a revisarlo a conciencia.
  // No se corrige aqui porque endurecerlo podria rechazar datos que hoy estan
  // en produccion, y eso excede el alcance del preflight del cutover.
  const filename = await instantanea({
    users: [{ id: 'u1', phone: '04141110000' }, { id: 'u2', phone: '+584141110000' }]
  });
  const pool = crearPostgresFalso();
  const r = await replacePostgresFromSqlite({ filename, pool });
  assert.equal(r.status, 'replaced', 'hoy pasa: queda documentado como limite conocido');
  assert.equal(pool.recuentos().users, 2);
});

test('reintento correcto: el destino queda igual a la instantanea, ID a ID', async () => {
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso(comoDestino({ users: [{ id: 'viejo', email: 'v@example.com' }] }));
  const r = await replacePostgresFromSqlite({ filename, pool });
  assert.equal(r.status, 'replaced');
  for (const tabla of PERSISTED_TABLES) {
    const esperados = (BASE[tabla] || []).map(f => f.id).sort();
    assert.deepEqual([...pool.contenido(tabla).keys()].sort(), esperados, `tabla ${tabla}`);
  }
  assert.deepEqual(pool.contenido('trips').get('t1'), BASE.trips[0]);
});

test('la puerta de recuentos esperados aborta antes de tocar el destino', async () => {
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso();
  const r = await replacePostgresFromSqlite({ filename, pool, expectedCounts: { users: 19 } });
  assert.equal(r.status, 'preflight_failed');
  assert.ok(r.errors.includes('SNAPSHOT_COUNT_MISMATCH:users:19->2'));
  assert.equal(pool.estado.commits, 0);
});

test('la simulacion en seco informa del destino sin modificarlo', async () => {
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso(comoDestino(BASE));
  const r = await replacePostgresFromSqlite({ filename, pool, isDryRun: true });
  assert.equal(r.status, 'dry_run_ok');
  assert.equal(r.targetWasEmpty, false);
  assert.equal(r.summary.users.before, 2);
  assert.equal(pool.estado.commits, 0);
  assert.equal(pool.estado.transaccionAbierta, false);
  assert.equal(pool.recuentos().users, 2);
});

test('la conexion se libera tambien cuando la transaccion falla', async () => {
  const filename = await instantanea(BASE);
  const pool = crearPostgresFalso();
  pool.forzarFalloEn('delete from public.users');
  await assert.rejects(replacePostgresFromSqlite({ filename, pool }));
  assert.equal(pool.estado.released, 1);
});
