import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabasePersistence, PERSISTED_TABLES } from '../services/databasePersistence.js';

const temporales = [];
const conexiones = [];

function abrirBase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-test-'));
  temporales.push(dir);
  const sqlite = new DatabaseSync(path.join(dir, 'datos.sqlite'));
  conexiones.push(sqlite);
  for (const tabla of PERSISTED_TABLES) {
    sqlite.exec(`CREATE TABLE ${tabla} (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`);
  }
  return sqlite;
}

/**
 * Envuelve la conexión para contar cuántas filas se escriben de verdad y
 * cuántas transacciones se abren. Es lo que distingue la escritura incremental
 * de la reescritura completa: ambas dejan el mismo resultado final.
 */
function contar(sqlite) {
  const cuenta = { inserts: 0, deletes: 0, transacciones: 0, sentencias: [] };
  return {
    cuenta,
    conexion: {
      exec(sql) {
        if (sql.startsWith('BEGIN')) cuenta.transacciones += 1;
        return sqlite.exec(sql);
      },
      prepare(sql) {
        cuenta.sentencias.push(sql);
        const real = sqlite.prepare(sql);
        return {
          all: (...args) => real.all(...args),
          get: (...args) => real.get(...args),
          run: (...args) => {
            if (/^\s*INSERT/i.test(sql)) cuenta.inserts += 1;
            if (/^\s*DELETE/i.test(sql)) cuenta.deletes += 1;
            return real.run(...args);
          }
        };
      }
    }
  };
}

function baseVacia() {
  return Object.fromEntries(PERSISTED_TABLES.map(tabla => [tabla, []]));
}

function leer(sqlite, tabla) {
  return sqlite.prepare(`SELECT id, payload FROM ${tabla} ORDER BY id`).all();
}

test.after(() => {
  // En Windows el archivo sigue bloqueado mientras la conexión esté abierta.
  for (const sqlite of conexiones) {
    try { sqlite.close(); } catch {}
  }
  for (const dir of temporales) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

// ------------------------------------------------------- coste incremental

test('solo se escribe la fila que cambió, no la colección entera', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.trips = Array.from({ length: 500 }, (_, i) => ({ id: `trip_${i}`, status: 'COMPLETED' }));
  const { cuenta, conexion } = contar(sqlite);
  const persistencia = createDatabasePersistence({ sqlite: conexion, database });

  // Primera escritura: no había nada en disco, entran las 500.
  assert.equal(persistencia.persist(), true);
  assert.equal(cuenta.inserts, 500);

  // Se mueve un solo viaje. Con reescritura completa esto costaría otras 500
  // inserciones; aquí tiene que costar exactamente una.
  cuenta.inserts = 0;
  cuenta.deletes = 0;
  database.trips[42].status = 'CANCELLED';
  assert.equal(persistencia.persist(), true);
  assert.equal(cuenta.inserts, 1, 'una modificación debe costar una escritura');
  assert.equal(cuenta.deletes, 0, 'no se borra nada para modificar');

  const guardado = sqlite.prepare('SELECT payload FROM trips WHERE id = ?').get('trip_42');
  assert.equal(JSON.parse(guardado.payload).status, 'CANCELLED');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM trips').get().n, 500);
});

test('sin cambios no se abre transacción ni se toca el disco', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.users = [{ id: 'u_1', firstName: 'Ana' }];
  const { cuenta, conexion } = contar(sqlite);
  const persistencia = createDatabasePersistence({ sqlite: conexion, database });

  assert.equal(persistencia.persist(), true);
  const trasPrimera = cuenta.transacciones;

  // Muchas llamadas del servidor persisten tras operaciones que no cambiaron
  // nada. Ninguna debe llegar al disco.
  for (let i = 0; i < 10; i += 1) assert.equal(persistencia.persist(), true);
  assert.equal(cuenta.transacciones, trasPrimera, 'no debe abrirse ninguna transacción más');
  assert.equal(cuenta.inserts, 1, 'no debe reescribirse la fila intacta');
});

test('nunca se emite DELETE sin WHERE: la tabla completa no se vacía', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.trips = [{ id: 't_1' }, { id: 't_2' }];
  const { cuenta, conexion } = contar(sqlite);
  const persistencia = createDatabasePersistence({ sqlite: conexion, database });
  persistencia.persist();
  database.trips.push({ id: 't_3' });
  persistencia.persist();

  for (const sql of cuenta.sentencias) {
    if (/DELETE/i.test(sql)) {
      assert.match(sql, /WHERE\s+id\s*=\s*\?/i, `borrado sin filtro: ${sql}`);
    }
  }
});

// --------------------------------------------------- equivalencia de estado

test('el resultado coincide con el de una reescritura completa', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  const persistencia = createDatabasePersistence({ sqlite, database });

  database.users = [{ id: 'u_1', nombre: 'Ana' }, { id: 'u_2', nombre: 'Luis' }];
  database.trips = [{ id: 't_1', status: 'SEARCHING' }];
  persistencia.persist();

  // Alta, modificación y baja en la misma escritura.
  database.users[0].nombre = 'Ana María';
  database.users.push({ id: 'u_3', nombre: 'Carmen' });
  database.trips = [];
  persistencia.persist();

  assert.deepEqual(
    leer(sqlite, 'users').map(f => JSON.parse(f.payload)),
    [{ id: 'u_1', nombre: 'Ana María' }, { id: 'u_2', nombre: 'Luis' }, { id: 'u_3', nombre: 'Carmen' }]
  );
  assert.deepEqual(leer(sqlite, 'trips'), [], 'la baja debe llegar al disco');
});

test('un registro eliminado en memoria desaparece del disco', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.notifications = [{ id: 'n_1' }, { id: 'n_2' }, { id: 'n_3' }];
  const persistencia = createDatabasePersistence({ sqlite, database });
  persistencia.persist();

  database.notifications = database.notifications.filter(item => item.id !== 'n_2');
  persistencia.persist();
  assert.deepEqual(leer(sqlite, 'notifications').map(f => f.id), ['n_1', 'n_3']);
});

test('la sombra se siembra del disco: reabrir no reescribe lo ya guardado', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.settings = [{ id: 'pricing', value: { base: 1 } }];
  createDatabasePersistence({ sqlite, database }).persist();

  // Segundo arranque sobre la misma base, con las colecciones cargadas del
  // disco tal y como hace el servidor.
  const recargada = baseVacia();
  recargada.settings = sqlite.prepare('SELECT payload FROM settings').all().map(f => JSON.parse(f.payload));
  const { cuenta, conexion } = contar(sqlite);
  const persistencia = createDatabasePersistence({ sqlite: conexion, database: recargada });

  assert.equal(persistencia.persist(), true);
  assert.equal(cuenta.inserts, 0, 'nada cambió: no debe escribirse');
  assert.equal(cuenta.transacciones, 0);
  assert.equal(persistencia.shadowSize('settings'), 1, 'la sombra conoce lo que ya había en disco');
});

// ------------------------------------------------------------- fallos duros

test('si el COMMIT falla la sombra no avanza y el siguiente intento reescribe', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.users = [{ id: 'u_1', nombre: 'Ana' }];
  const errores = [];
  let romper = false;
  const conexion = {
    exec(sql) {
      if (romper && sql.startsWith('COMMIT')) throw new Error('DISCO_LLENO');
      return sqlite.exec(sql);
    },
    prepare: sql => sqlite.prepare(sql)
  };
  const persistencia = createDatabasePersistence({
    sqlite: conexion,
    database,
    logger: { error: (...args) => errores.push(args.join(' ')) }
  });

  romper = true;
  assert.equal(persistencia.persist(), false, 'un COMMIT fallido se reporta como fallo');
  assert.equal(leer(sqlite, 'users').length, 0, 'el rollback dejó el disco vacío');
  assert.match(errores.join('\n'), /DISCO_LLENO/);

  // Éste es el punto crítico: si la sombra se hubiera actualizado antes del
  // COMMIT, creería que la fila ya está en disco y no volvería a escribirla,
  // perdiendo el dato para siempre.
  romper = false;
  assert.equal(persistencia.persist(), true);
  assert.deepEqual(leer(sqlite, 'users').map(f => JSON.parse(f.payload).nombre), ['Ana']);
});

test('un registro sin identificador aborta la escritura y no corrompe el disco', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.users = [{ id: 'u_1', nombre: 'Ana' }];
  const errores = [];
  const persistencia = createDatabasePersistence({
    sqlite, database, logger: { error: (...args) => errores.push(args.join(' ')) }
  });
  persistencia.persist();

  for (const invalido of [{ nombre: 'sin id' }, { id: '', nombre: 'vacío' }, { id: 42 }, { id: null }]) {
    errores.length = 0;
    database.users = [{ id: 'u_1', nombre: 'Ana' }, invalido];
    assert.equal(persistencia.persist(), false, `debía rechazarse: ${JSON.stringify(invalido)}`);
    assert.match(errores.join('\n'), /INVALID_RECORD_ID:users/);
  }
  // Lo que ya estaba guardado sigue intacto.
  assert.deepEqual(leer(sqlite, 'users').map(f => f.id), ['u_1']);
});

test('dos registros con el mismo identificador abortan la escritura', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.trips = [{ id: 't_1', status: 'SEARCHING' }];
  const errores = [];
  const persistencia = createDatabasePersistence({
    sqlite, database, logger: { error: (...args) => errores.push(args.join(' ')) }
  });
  persistencia.persist();

  // Sin esta comprobación el upsert colapsaría los duplicados en silencio,
  // mientras que la reescritura completa fallaba por clave primaria.
  database.trips = [{ id: 't_1', status: 'IN_PROGRESS' }, { id: 't_1', status: 'COMPLETED' }];
  assert.equal(persistencia.persist(), false);
  assert.match(errores.join('\n'), /DUPLICATE_RECORD_ID:trips:t_1/);
  assert.equal(JSON.parse(leer(sqlite, 'trips')[0].payload).status, 'SEARCHING', 'el disco no cambió');
});

test('una colección ausente aborta la escritura en lugar de vaciar la tabla', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.trips = [{ id: 't_1' }, { id: 't_2' }];
  const errores = [];
  const persistencia = createDatabasePersistence({
    sqlite, database, logger: { error: (...args) => errores.push(args.join(' ')) }
  });
  persistencia.persist();

  // Un fallo de carga no puede traducirse en un borrado masivo.
  for (const roto of [undefined, null, {}, 'texto']) {
    database.trips = roto;
    assert.equal(persistencia.persist(), false);
    assert.match(errores.join('\n'), /MISSING_COLLECTION:trips/);
    assert.equal(leer(sqlite, 'trips').length, 2, 'los viajes siguen en disco');
  }
});

test('el fallo de una tabla no deja a las demás a medias', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.users = [{ id: 'u_1' }];
  database.trips = [{ id: 't_1' }];
  const persistencia = createDatabasePersistence({ sqlite, database, logger: { error() {} } });

  // `users` es válida y va antes que `trips` en el orden de tablas; el
  // registro inválido de `trips` debe impedir también la escritura de `users`.
  database.trips = [{ sin: 'id' }];
  assert.equal(persistencia.persist(), false);
  assert.equal(leer(sqlite, 'users').length, 0, 'ninguna tabla se escribió');
});

// --------------------------------------------------- escritura de un registro

test('persistRecord escribe una fila sin recorrer lo acumulado', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.users = Array.from({ length: 300 }, (_, i) => ({ id: `u_${i}`, lat: 0 }));
  database.trips = Array.from({ length: 300 }, (_, i) => ({ id: `t_${i}` }));
  const { cuenta, conexion } = contar(sqlite);
  const persistencia = createDatabasePersistence({ sqlite: conexion, database });
  persistencia.persist();

  cuenta.inserts = 0;
  cuenta.transacciones = 0;
  database.users[7].lat = 10.64;
  assert.equal(persistencia.persistRecord('users', database.users[7]), true);

  assert.equal(cuenta.inserts, 1, 'debe escribirse exactamente una fila');
  assert.equal(cuenta.transacciones, 0, 'una sola sentencia no necesita transacción explícita');
  assert.equal(JSON.parse(sqlite.prepare('SELECT payload FROM users WHERE id = ?').get('u_7').payload).lat, 10.64);
});

test('persistRecord no reescribe si el registro no cambió', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.users = [{ id: 'u_1', lat: 1 }];
  const { cuenta, conexion } = contar(sqlite);
  const persistencia = createDatabasePersistence({ sqlite: conexion, database });
  persistencia.persist();

  cuenta.inserts = 0;
  for (let i = 0; i < 5; i += 1) assert.equal(persistencia.persistRecord('users', database.users[0]), true);
  assert.equal(cuenta.inserts, 0, 'un GPS que repite coordenada no debe llegar al disco');
});

test('persistRecord deja la sombra coherente con persist()', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.users = [{ id: 'u_1', lat: 1 }, { id: 'u_2', lat: 2 }];
  const { cuenta, conexion } = contar(sqlite);
  const persistencia = createDatabasePersistence({ sqlite: conexion, database });
  persistencia.persist();

  database.users[0].lat = 99;
  persistencia.persistRecord('users', database.users[0]);

  // Tras la escritura puntual, una escritura completa no debe repetir la fila:
  // si la sombra no se hubiera actualizado, aquí habría un insert de más.
  cuenta.inserts = 0;
  assert.equal(persistencia.persist(), true);
  assert.equal(cuenta.inserts, 0, 'persist() no debe reescribir lo que ya guardó persistRecord');
  assert.equal(JSON.parse(leer(sqlite, 'users')[0].payload).lat, 99);
});

test('persistRecord rechaza tabla desconocida e identificador inválido', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  const errores = [];
  const persistencia = createDatabasePersistence({
    sqlite, database, logger: { error: (...args) => errores.push(args.join(' ')) }
  });

  assert.equal(persistencia.persistRecord('inventada', { id: 'x' }), false);
  assert.match(errores.join('\n'), /UNKNOWN_TABLE:inventada/);

  for (const invalido of [{ sin: 'id' }, { id: '' }, { id: 7 }, null, undefined]) {
    errores.length = 0;
    assert.equal(persistencia.persistRecord('users', invalido), false, `debía rechazarse: ${JSON.stringify(invalido)}`);
    assert.match(errores.join('\n'), /INVALID_RECORD_ID:users/);
  }
  assert.equal(leer(sqlite, 'users').length, 0);
});

test('un fallo de persistRecord no adelanta la sombra', () => {
  const sqlite = abrirBase();
  const database = baseVacia();
  database.users = [{ id: 'u_1', lat: 1 }];
  let romper = false;
  const conexion = {
    exec: sql => sqlite.exec(sql),
    prepare(sql) {
      const real = sqlite.prepare(sql);
      return {
        all: (...a) => real.all(...a),
        get: (...a) => real.get(...a),
        run: (...a) => { if (romper) throw new Error('DISCO_LLENO'); return real.run(...a); }
      };
    }
  };
  const persistencia = createDatabasePersistence({ sqlite: conexion, database, logger: { error() {} } });
  persistencia.persist();

  database.users[0].lat = 42;
  romper = true;
  assert.equal(persistencia.persistRecord('users', database.users[0]), false);
  assert.equal(JSON.parse(leer(sqlite, 'users')[0].payload).lat, 1, 'el disco no cambió');

  // La siguiente escritura completa debe recuperar el cambio perdido.
  romper = false;
  assert.equal(persistencia.persist(), true);
  assert.equal(JSON.parse(leer(sqlite, 'users')[0].payload).lat, 42);
});

// ------------------------------------------------------------ construcción

test('no se admiten nombres de tabla que no sean identificadores simples', () => {
  const sqlite = abrirBase();
  for (const malo of ['users; DROP TABLE users', 'users--', '', 'user s', '1users', 'users)']) {
    assert.throws(
      () => createDatabasePersistence({ sqlite, database: baseVacia(), tables: [malo] }),
      /INVALID_TABLE_NAME/,
      `no debía admitirse: ${malo}`
    );
  }
});

test('la persistencia exige conexión y colecciones', () => {
  assert.throws(() => createDatabasePersistence({}), /PERSISTENCE_REQUIRES_SQLITE/);
  assert.throws(() => createDatabasePersistence({ sqlite: abrirBase() }), /PERSISTENCE_REQUIRES_DATABASE/);
});

test('se cubren las once colecciones del servidor', () => {
  assert.equal(PERSISTED_TABLES.length, 11);
  const sqlite = abrirBase();
  const database = baseVacia();
  const persistencia = createDatabasePersistence({ sqlite, database });
  // Cada tabla declarada tiene que persistir de verdad.
  for (const tabla of PERSISTED_TABLES) database[tabla] = [{ id: `${tabla}_1` }];
  assert.equal(persistencia.persist(), true);
  for (const tabla of PERSISTED_TABLES) {
    assert.deepEqual(leer(sqlite, tabla).map(f => f.id), [`${tabla}_1`], `${tabla} no se persistió`);
  }
});
