import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'trips-pagination-admin';

/**
 * `GET /api/trips` devolvia la coleccion entera. Estas pruebas usan un conjunto
 * grande porque el defecto solo se nota con volumen: con veinte viajes,
 * devolverlos todos y devolver una pagina se parecen demasiado.
 *
 * Se siembra directamente en SQLite: crear miles de viajes por la API tardaria
 * minutos y agotaria los limitadores.
 */

const VIAJES = 5000;
// Mas de una pagina de carreras en curso, y entre las mas antiguas: con orden
// por recencia caen al final del recorrido, que es justo lo que el tope fijo
// de cien dejaba fuera del mapa.
const ACTIVOS_ANTIGUOS = 130;
const PERSONAS = 40;
const ACTIVOS = ['SEARCHING', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'];

let escenario = null;

function sembrar(archivo) {
  const db = new DatabaseSync(archivo);
  db.exec('PRAGMA journal_mode = WAL;');
  for (const tabla of ['users', 'trips', 'notifications', 'messages', 'supportMessages',
    'settings', 'transactions', 'driverApplications', 'driverDocuments', 'adminActions']) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${tabla} (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`);
  }
  db.exec('CREATE TABLE IF NOT EXISTS schemaMigrations (id TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)');

  const insUser = db.prepare('INSERT OR REPLACE INTO users (id, payload) VALUES (?, ?)');
  const insTrip = db.prepare('INSERT OR REPLACE INTO trips (id, payload) VALUES (?, ?)');
  db.exec('BEGIN IMMEDIATE');

  for (let i = 0; i < PERSONAS; i += 1) {
    const id = `p_${i}`;
    insUser.run(id, JSON.stringify({
      id, role: i % 4 === 0 ? 'driver' : 'passenger',
      firstName: `Persona${i}`, lastName: 'Viajes',
      email: `viajes${i}@ejemplo.com`, phone: `+58414120${String(i).padStart(4, '0')}`,
      accountStatus: 'ACTIVE', status: 'OFFLINE', rating: 5, totalTrips: 0
    }));
  }

  const inicio = Date.parse('2026-01-01T00:00:00.000Z');
  let activos = 0;
  for (let i = 0; i < VIAJES; i += 1) {
    // Uno de cada quinientos queda en curso: los activos son pocos por
    // definicion, que es justo lo que el mapa de flota necesita.
    const enCurso = i < ACTIVOS_ANTIGUOS || i % 500 === 0;
    if (enCurso) activos += 1;
    const status = enCurso ? ACTIVOS[i % ACTIVOS.length] : (i % 7 === 0 ? 'CANCELLED' : 'COMPLETED');
    const cuando = new Date(inicio + i * 60000).toISOString();
    insTrip.run(`t_${String(i).padStart(5, '0')}`, JSON.stringify({
      id: `t_${String(i).padStart(5, '0')}`,
      passengerId: `p_${i % PERSONAS}`,
      driverId: `p_${(i * 7) % PERSONAS}`,
      status,
      pickup: { lat: 10.64, lng: -71.61, address: `Origen ${i}` },
      destination: { lat: 10.68, lng: -71.63, address: `Destino ${i}` },
      fareUSD: 3.5, createdAt: cuando, updatedAt: cuando,
      ...(status === 'COMPLETED' ? { completedAt: cuando } : {})
    }));
  }
  db.exec('COMMIT');
  db.close();
  return { activos };
}

async function preparar() {
  if (escenario) return escenario;
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-trips-'));
  const archivo = path.join(tempDir, 'database.sqlite');
  const { activos } = sembrar(archivo);

  const port = 16900 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port), DATA_FILE: archivo,
      JWT_SECRET: 'trips-pagination-secret', ADMIN_PASSWORD
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let traza = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`El servidor no inició: ${traza}`)), 30000);
    child.stdout.on('data', chunk => {
      traza += chunk.toString();
      if (traza.includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', chunk => { traza += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}: ${traza}`)));
  });

  const url = `http://127.0.0.1:${port}`;
  const login = await fetch(`${url}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@58express.com', password: ADMIN_PASSWORD, role: 'admin' })
  });
  assert.equal(login.status, 200);
  escenario = { url, child, tempDir, adminToken: (await login.json()).token, activos };
  return escenario;
}

const pedir = (url, token, ruta) => fetch(`${url}${ruta}`, {
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
});
const listar = async (url, token, ruta) => (await pedir(url, token, ruta)).json();

test.after(() => {
  if (escenario?.child) escenario.child.kill();
  if (escenario?.tempDir) { try { fs.rmSync(escenario.tempDir, { recursive: true, force: true }); } catch {} }
});

// ----------------------------------------------------------------- contrato

test('devuelve un sobre paginado, no la coleccion entera', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await listar(url, adminToken, '/api/trips?limit=25');

  assert.ok(Array.isArray(pagina.items));
  assert.equal(pagina.items.length, 25, `se esperaban 25, llegaron ${pagina.items.length}`);
  assert.equal(pagina.total, VIAJES, 'el total debe ser el real');
  assert.ok('nextCursor' in pagina);
  assert.equal(typeof pagina.totalPages, 'number');
});

test('la respuesta queda acotada aunque haya miles de viajes', async () => {
  const { url, adminToken } = await preparar();
  const respuesta = await pedir(url, adminToken, '/api/trips?limit=25');
  const bytes = (await respuesta.arrayBuffer()).byteLength;
  // Antes se devolvian los 5 000; una pagina de 25 no puede acercarse a eso.
  assert.ok(bytes < 60_000, `la pagina pesa ${bytes} bytes, demasiado para 25 viajes`);
});

test('el cliente no puede anular la paginacion', async () => {
  const { url, adminToken } = await preparar();
  const excesivo = await pedir(url, adminToken, '/api/trips?limit=999999');
  assert.equal(excesivo.status, 400);
  assert.equal((await excesivo.json()).error, 'LIMIT_TOO_LARGE');

  for (const malo of ['?limit=abc', '?limit=0', '?page=0', '?status=inventado', '?cursor=no%20valido']) {
    const respuesta = await pedir(url, adminToken, `/api/trips${malo}`);
    assert.equal(respuesta.status, 400, `debia rechazarse ${malo}`);
  }
});

test('solo administracion accede al listado', async () => {
  const { url } = await preparar();
  assert.equal((await pedir(url, null, '/api/trips')).status, 401);
});

// --------------------------------------------------------------- ordenacion

test('los mas recientes van primero, que es lo que pinta el panel', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await listar(url, adminToken, '/api/trips?limit=8');
  const fechas = pagina.items.map(t => new Date(t.completedAt || t.updatedAt || t.createdAt).getTime());
  assert.deepEqual(fechas, [...fechas].sort((a, b) => b - a), 'deben venir en orden descendente');
  // El ultimo sembrado es el mas reciente.
  assert.equal(pagina.items[0].id, `t_${String(VIAJES - 1).padStart(5, '0')}`);
});

// ------------------------------------------------------------------ filtros

test('los viajes activos son pocos y se piden aparte', async () => {
  const { url, adminToken, activos } = await preparar();
  const pagina = await listar(url, adminToken, '/api/trips?status=active&limit=100');
  assert.equal(pagina.total, activos, `se esperaban ${activos} activos`);
  assert.ok(pagina.total < VIAJES / 10, 'los activos deben ser una fraccion del historico');
  for (const trip of pagina.items) {
    assert.ok(ACTIVOS.includes(trip.status), `estado inesperado: ${trip.status}`);
  }
});

test('se piden los viajes de una sola persona sin traer los demas', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await listar(url, adminToken, '/api/trips?userId=p_3&limit=20');
  assert.ok(pagina.total > 0 && pagina.total < VIAJES, `total inesperado: ${pagina.total}`);
  for (const trip of pagina.items) {
    const participa = [trip.passengerId, trip.driverId, trip.assignedDriverId].includes('p_3');
    assert.ok(participa, `viaje ajeno en el resultado: ${trip.id}`);
  }
});

test('el ultimo viaje de una persona se obtiene con una sola peticion', async () => {
  const { url, adminToken } = await preparar();
  // Es lo que necesita la ficha de contexto de soporte.
  const pagina = await listar(url, adminToken, '/api/trips?userId=p_5&limit=1');
  assert.equal(pagina.items.length, 1);
  const completo = await listar(url, adminToken, '/api/trips?userId=p_5&limit=100');
  assert.equal(pagina.items[0].id, completo.items[0].id, 'debe ser el mas reciente');
});

// ------------------------------------------------------------- recorrido

test('el cursor recorre un resultado grande sin repetir ni saltarse nada', async () => {
  const { url, adminToken } = await preparar();
  const vistos = [];
  let cursor = null;
  let vueltas = 0;
  do {
    const ruta = `/api/trips?userId=p_7&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const pagina = await listar(url, adminToken, ruta);
    vistos.push(...pagina.items.map(t => t.id));
    cursor = pagina.nextCursor;
    vueltas += 1;
    assert.ok(vueltas < 60, 'el recorrido no termina');
  } while (cursor);

  const referencia = await listar(url, adminToken, '/api/trips?userId=p_7&limit=1');
  assert.equal(vistos.length, referencia.total, 'el recorrido cubre el total declarado');
  assert.equal(new Set(vistos).size, vistos.length, 'ninguno repetido');
  assert.ok(vueltas > 1, 'el resultado debe ocupar varias paginas');
});

// -------------------------------------------------------------- recuento

test('el recuento por persona no devuelve ni un viaje', async () => {
  const { url, adminToken } = await preparar();
  const ids = Array.from({ length: 8 }, (_, i) => `p_${i}`).join(',');
  const respuesta = await pedir(url, adminToken, `/api/trips/summary?userId=${ids}`);
  const crudo = await respuesta.text();

  assert.equal(respuesta.status, 200);
  // Traer los viajes para contarlos seria descargar la coleccion con otro
  // nombre: la respuesta debe ser diminuta y sin rutas ni tarifas.
  assert.ok(crudo.length < 2000, `el recuento pesa ${crudo.length} bytes`);
  assert.ok(!crudo.includes('pickup'), 'no debe viajar ningun viaje');
  assert.ok(!crudo.includes('fareUSD'));

  const resumen = JSON.parse(crudo);
  assert.equal(resumen.items.length, 8);
  for (const fila of resumen.items) {
    assert.equal(typeof fila.total, 'number');
    assert.equal(typeof fila.completed, 'number');
    assert.ok(fila.completed <= fila.total);
  }
});

test('el recuento coincide con lo que devuelve el listado filtrado', async () => {
  const { url, adminToken } = await preparar();
  const resumen = await listar(url, adminToken, '/api/trips/summary?userId=p_11');
  const fila = resumen.items[0];
  const listado = await listar(url, adminToken, '/api/trips?userId=p_11&limit=1');
  assert.equal(fila.total, listado.total, 'el recuento debe cuadrar con el total del listado');

  const completados = await listar(url, adminToken, '/api/trips?userId=p_11&status=completed&limit=1');
  assert.equal(fila.completed, completados.total);
});

test('el recuento acota cuantas personas admite', async () => {
  const { url, adminToken } = await preparar();
  const demasiados = Array.from({ length: 51 }, (_, i) => `p_${i}`).join(',');
  const respuesta = await pedir(url, adminToken, `/api/trips/summary?userId=${demasiados}`);
  assert.equal(respuesta.status, 400);
  assert.equal((await respuesta.json()).error, 'TOO_MANY_USER_IDS');

  const vacio = await pedir(url, adminToken, '/api/trips/summary');
  assert.equal(vacio.status, 400);
});

test('el recuento es exclusivo de administracion', async () => {
  const { url } = await preparar();
  assert.equal((await pedir(url, null, '/api/trips/summary?userId=p_1')).status, 401);
});

// ------------------------------------------------------------ complejidad

test('el coste de una pagina no crece con el volumen acumulado', async () => {
  const { url, adminToken } = await preparar();
  // Con 5 000 viajes sembrados, pedir ocho tiene que seguir siendo inmediato.
  const inicio = process.hrtime.bigint();
  const pagina = await listar(url, adminToken, '/api/trips?limit=8');
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  assert.equal(pagina.items.length, 8);
  assert.ok(ms < 1500, `la peticion tardo ${ms.toFixed(0)} ms`);
});

// ------------------------------------------- mapa de flota con muchas carreras

/**
 * El mapa pedia `?status=active&limit=100` y se quedaba ahi. Con mas de cien
 * carreras simultaneas, las siguientes dejaban de pintarse sin ningun aviso.
 * Ahora recorre el cursor hasta agotarlo.
 */
test('los viajes activos posteriores al centesimo siguen alcanzandose', async () => {
  const { url, adminToken, activos } = await preparar();

  // Los activos ya se sembraron: los ACTIVOS_ANTIGUOS primeros, que son los
  // de fecha mas remota y por tanto los ultimos del recorrido por recencia.
  const puestos = Array.from({ length: ACTIVOS_ANTIGUOS }, (_, i) => `t_${String(i).padStart(5, '0')}`);
  assert.ok(puestos.length > 100, `hacen falta mas de cien en curso, hay ${puestos.length}`);
  assert.ok(activos > 100, `el escenario debe tener mas de cien activos, tiene ${activos}`);

  // Recorrido tal y como lo hace el mapa: paginas de cien hasta agotar cursor.
  const vistos = [];
  let cursor = null;
  let vueltas = 0;
  do {
    const ruta = `/api/trips?status=active&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const pagina = await listar(url, adminToken, ruta);
    vistos.push(...pagina.items.map(t => t.id));
    cursor = pagina.nextCursor;
    vueltas += 1;
    assert.ok(vueltas < 60, 'el recorrido no termina');
  } while (cursor);

  assert.ok(vueltas > 1, 'con mas de cien activos hace falta mas de una pagina');
  assert.equal(new Set(vistos).size, vistos.length, 'ninguno repetido');

  const alcanzados = new Set(vistos);
  for (const id of puestos) {
    assert.ok(alcanzados.has(id), `viaje activo no alcanzado por el mapa: ${id}`);
  }
  // Y el recorrido cubre exactamente el total declarado por el servidor.
  const referencia = await listar(url, adminToken, '/api/trips?status=active&limit=1');
  assert.equal(vistos.length, referencia.total, 'el recorrido cubre todos los activos');
});

test('el recorrido de activos no arrastra historico', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await listar(url, adminToken, '/api/trips?status=active&limit=100');
  for (const trip of pagina.items) {
    assert.ok(!['COMPLETED', 'CANCELLED'].includes(trip.status), `estado terminal en el mapa: ${trip.status}`);
  }
  // Y sigue siendo una fraccion del total.
  const todos = await listar(url, adminToken, '/api/trips?limit=1');
  assert.ok(pagina.total < todos.total / 10, 'los activos deben ser una fraccion del historico');
});
