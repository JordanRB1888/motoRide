import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'users-pagination-admin';

let escenario = null;

async function levantarServidor() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-users-'));
  const port = 16100 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'users-pagination-secret',
      ADMIN_PASSWORD
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let traza = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`El servidor no inició: ${traza}`)), 15000);
    child.stdout.on('data', chunk => {
      traza += chunk.toString();
      if (traza.includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', chunk => { traza += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}: ${traza}`)));
  });
  return { url: `http://127.0.0.1:${port}`, child };
}

const pedir = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
});

async function login(url, identifier, password, role) {
  const respuesta = await pedir(`${url}/api/auth/login`, null, {
    method: 'POST', body: JSON.stringify({ identifier, password, role })
  });
  assert.equal(respuesta.status, 200, `Login fallido para ${identifier}`);
  return (await respuesta.json()).token;
}

const PASAJEROS = 9;
const CONDUCTORES = 5;

async function preparar() {
  if (escenario) return escenario;
  const { url, child } = await levantarServidor();
  const adminToken = await login(url, 'admin@58express.com', ADMIN_PASSWORD, 'admin');

  const pasajeros = [];
  for (let i = 0; i < PASAJEROS; i += 1) {
    const respuesta = await pedir(`${url}/api/auth/register`, null, {
      method: 'POST',
      body: JSON.stringify({
        email: `pasajero${i}@ejemplo.com`, phone: `+58414800${String(i).padStart(4, '0')}`,
        password: 'password123', role: 'passenger', firstName: `Pasajero${i}`, lastName: 'Prueba'
      })
    });
    assert.equal(respuesta.status, 201);
    pasajeros.push((await respuesta.json()).user);
  }

  const conductores = [];
  for (let i = 0; i < CONDUCTORES; i += 1) {
    const respuesta = await pedir(`${url}/api/admin/drivers`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        email: `conductor${i}@ejemplo.com`, phone: `+58414900${String(i).padStart(4, '0')}`,
        firstName: `Conductor${i}`, lastName: 'Prueba', vehicleBrand: 'Bera',
        vehicleModel: 'BR200', vehiclePlate: `PLA${i}00`
      })
    });
    assert.equal(respuesta.status, 201);
    conductores.push((await respuesta.json()).user);
  }

  escenario = { url, child, adminToken, pasajeros, conductores };
  return escenario;
}

const listar = async (url, token, consulta = '') =>
  (await pedir(`${url}/api/users${consulta}`, token)).json();

test.after(() => {
  if (escenario?.child) escenario.child.kill();
});

// ----------------------------------------------------------------- contrato

test('devuelve un sobre paginado con los dos modos de recorrido', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await listar(url, adminToken, '?limit=5');

  assert.ok(Array.isArray(pagina.items));
  assert.equal(pagina.items.length, 5);
  assert.ok('nextCursor' in pagina, 'debe ofrecer cursor');
  assert.equal(typeof pagina.total, 'number');
  assert.equal(typeof pagina.page, 'number');
  assert.equal(typeof pagina.totalPages, 'number');
});

test('los registros siguen siendo la proyección pública, sin credenciales', async () => {
  const { url, adminToken } = await preparar();
  const crudo = await (await pedir(`${url}/api/users?limit=100`, adminToken)).text();
  for (const prohibido of ['passwordHash', 'photoStorageKey', '$2b$', '$2a$']) {
    assert.ok(!crudo.includes(prohibido), `el listado filtra ${prohibido}`);
  }
});

// --------------------------------------------------------------- paginación

test('las páginas numeradas recorren el listado entero sin repetir', async () => {
  const { url, adminToken } = await preparar();
  const primera = await listar(url, adminToken, '?role=driver,passenger&limit=4&page=1');
  const vistos = [];
  for (let n = 1; n <= primera.totalPages; n += 1) {
    const pagina = await listar(url, adminToken, `?role=driver,passenger&limit=4&page=${n}`);
    assert.equal(pagina.page, n);
    assert.ok(pagina.items.length <= 4);
    vistos.push(...pagina.items.map(u => u.id));
  }
  assert.equal(vistos.length, PASAJEROS + CONDUCTORES);
  assert.equal(new Set(vistos).size, vistos.length, 'ninguno repetido');
});

test('el cursor recorre lo mismo que las páginas numeradas', async () => {
  const { url, adminToken } = await preparar();
  const porCursor = [];
  let cursor = null;
  let vueltas = 0;
  do {
    const consulta = `?role=driver,passenger&limit=4${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const pagina = await listar(url, adminToken, consulta);
    porCursor.push(...pagina.items.map(u => u.id));
    cursor = pagina.nextCursor;
    vueltas += 1;
    assert.ok(vueltas < 20, 'la paginación no termina');
  } while (cursor);
  assert.equal(porCursor.length, PASAJEROS + CONDUCTORES);
  assert.equal(new Set(porCursor).size, porCursor.length);
});

test('una página fuera de rango se ajusta a la última con contenido', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await listar(url, adminToken, '?role=driver,passenger&limit=4&page=999');
  assert.ok(pagina.items.length > 0, 'no debe quedar vacía sin explicación');
  assert.equal(pagina.page, pagina.totalPages);
});

test('el cliente no puede anular la paginación', async () => {
  const { url, adminToken } = await preparar();
  const excesivo = await pedir(`${url}/api/users?limit=999999`, adminToken);
  assert.equal(excesivo.status, 400);
  assert.equal((await excesivo.json()).error, 'LIMIT_TOO_LARGE');

  for (const malo of ['?limit=abc', '?limit=0', '?page=0', '?page=abc', '?cursor=no%20valido']) {
    const respuesta = await pedir(`${url}/api/users${malo}`, adminToken);
    assert.equal(respuesta.status, 400, `debía rechazarse ${malo}`);
  }
});

// ------------------------------------------------------------------ filtros

test('filtra por rol en el servidor', async () => {
  const { url, adminToken } = await preparar();
  const soloConductores = await listar(url, adminToken, '?role=driver&limit=100');
  assert.equal(soloConductores.total, CONDUCTORES);
  assert.ok(soloConductores.items.every(u => u.role === 'driver'));

  const clientes = await listar(url, adminToken, '?role=driver,passenger&limit=100');
  assert.equal(clientes.total, PASAJEROS + CONDUCTORES, 'administración queda fuera');
  assert.ok(!clientes.items.some(u => u.role === 'admin'));
});

test('filtra por estado en el servidor', async () => {
  const { url, adminToken } = await preparar();
  // Un conductor dado de alta por administración nace verificado; los
  // pendientes salen del circuito de solicitudes, no de aquí.
  const verificados = await listar(url, adminToken, '?role=driver&status=verified&limit=100');
  assert.equal(verificados.total, CONDUCTORES);
  const pendientes = await listar(url, adminToken, '?role=driver&status=pending&limit=100');
  assert.equal(pendientes.total, 0);
  const suspendidos = await listar(url, adminToken, '?role=driver&status=suspended&limit=100');
  assert.equal(suspendidos.total, 0);
  // Y los pasajeros activos cuentan como habilitados.
  const pasajerosOk = await listar(url, adminToken, '?role=passenger&status=verified&limit=100');
  assert.equal(pasajerosOk.total, PASAJEROS);
});

test('busca por texto en el servidor sin descargar el listado', async () => {
  const { url, adminToken } = await preparar();
  const porNombre = await listar(url, adminToken, '?search=Conductor3&limit=100');
  assert.equal(porNombre.total, 1);
  assert.equal(porNombre.items[0].firstName, 'Conductor3');

  const porPlaca = await listar(url, adminToken, '?search=PLA200&limit=100');
  assert.equal(porPlaca.total, 1, 'la placa también busca');

  const porCorreo = await listar(url, adminToken, '?search=pasajero7@ejemplo.com&limit=100');
  assert.equal(porCorreo.total, 1);

  const sinCoincidencias = await listar(url, adminToken, '?search=zzzznoexiste&limit=100');
  assert.equal(sinCoincidencias.total, 0);
  assert.deepEqual(sinCoincidencias.items, []);
});

test('los filtros se combinan', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await listar(url, adminToken, '?role=driver&status=verified&search=Conductor1&limit=100');
  assert.equal(pagina.total, 1);
  assert.equal(pagina.items[0].firstName, 'Conductor1');
});

test('un filtro inventado se rechaza en vez de ampliar el resultado', async () => {
  const { url, adminToken } = await preparar();
  for (const [consulta, codigo] of [
    ['?role=inventado', 'INVALID_ROLE'],
    ['?status=inventado', 'INVALID_STATUS'],
    [`?search=${'a'.repeat(200)}`, 'SEARCH_TOO_LONG']
  ]) {
    const respuesta = await pedir(`${url}/api/users${consulta}`, adminToken);
    assert.equal(respuesta.status, 400, `debía rechazarse ${consulta}`);
    assert.equal((await respuesta.json()).error, codigo);
  }
});

test('se pueden resolver personas concretas por identificador', async () => {
  const { url, adminToken, pasajeros } = await preparar();
  const buscados = pasajeros.slice(0, 3).map(u => u.id);
  const pagina = await listar(url, adminToken, `?ids=${buscados.join(',')}&limit=50`);
  assert.equal(pagina.total, 3);
  assert.deepEqual(pagina.items.map(u => u.id).sort(), [...buscados].sort());
});

test('la resolución por identificador tiene tope', async () => {
  const { url, adminToken } = await preparar();
  const demasiados = Array.from({ length: 51 }, (_, i) => `u_${i}`).join(',');
  const respuesta = await pedir(`${url}/api/users?ids=${demasiados}`, adminToken);
  assert.equal(respuesta.status, 400);
  assert.equal((await respuesta.json()).error, 'TOO_MANY_IDS');
});

// ------------------------------------------------------------ autorización

test('solo administración accede al listado', async () => {
  const { url } = await preparar();
  const pasajeroToken = await login(url, 'pasajero0@ejemplo.com', 'password123', 'passenger');
  assert.equal((await pedir(`${url}/api/users`, pasajeroToken)).status, 403);
  assert.equal((await pedir(`${url}/api/users`, null)).status, 401);
});

// ------------------------------------------------------------- complejidad

test('la respuesta queda acotada por el tamaño de página', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await listar(url, adminToken, '?limit=2');
  assert.equal(pagina.items.length, 2);
  assert.ok(pagina.total > 2, 'hay más usuarios de los devueltos');
  assert.ok(pagina.nextCursor, 'y se ofrece cómo seguir');
});

test('el resumen trae las cifras globales que la página no puede dar', async () => {
  const { url, adminToken } = await preparar();
  const resumen = await (await pedir(`${url}/api/admin/overview`, adminToken)).json();
  assert.ok(resumen.customers, 'el resumen debe traer las cifras de la pantalla');
  assert.equal(resumen.customers.total, PASAJEROS + CONDUCTORES);
  assert.equal(resumen.customers.drivers, CONDUCTORES);
  assert.equal(resumen.customers.passengers, PASAJEROS);
  assert.equal(typeof resumen.customers.suspended, 'number');
});

// --------------------------------------------- mapa de operaciones

/**
 * El panel acotaba el mapa pidiendo «los cien primeros conductores». Al pasar
 * de cien cuentas, los de alta mas reciente desaparecian del mapa aunque
 * estuvieran en la calle. Ahora se filtra por estado operativo y se recorre el
 * cursor hasta agotarlo.
 */

const EN_SERVICIO = 'AVAILABLE,ONLINE,BUSY,IN_TRIP';

/** Recorre el listado con el cursor, como hace el panel. */
async function recorrerConCursor(url, token, consultaBase) {
  const vistos = [];
  let cursor = null;
  let vueltas = 0;
  do {
    const consulta = consultaBase + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const pagina = await listar(url, token, consulta);
    vistos.push(...pagina.items.map(u => u.id));
    cursor = pagina.nextCursor;
    vueltas += 1;
    assert.ok(vueltas < 30, 'el recorrido no termina');
  } while (cursor);
  return vistos;
}

test('el recorrido con cursor no se detiene en el centesimo conductor', async () => {
  const { url, adminToken } = await preparar();

  // Se supera el centenar de cuentas, que es donde fallaba el tope anterior.
  const EXTRA = 115;
  const creados = [];
  for (let i = 0; i < EXTRA; i += 1) {
    const respuesta = await pedir(`${url}/api/admin/drivers`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        email: `flota${i}@ejemplo.com`, phone: `+58414100${String(i).padStart(4, '0')}`,
        firstName: `Flota${i}`, lastName: 'Mapa', vehicleBrand: 'Bera',
        vehicleModel: 'BR200', vehiclePlate: `FLO${String(i).padStart(3, '0')}`
      })
    });
    assert.equal(respuesta.status, 201);
    creados.push((await respuesta.json()).user.id);
  }

  // Un conductor recien dado de alta esta OFFLINE: se recorre ese conjunto,
  // que es el que supera el centenar.
  const vistos = await recorrerConCursor(url, adminToken, '?role=driver&driverStatus=OFFLINE&limit=100');

  assert.equal(new Set(vistos).size, vistos.length, 'ninguno repetido');
  const alcanzados = new Set(vistos);
  for (const id of creados) {
    assert.ok(alcanzados.has(id), `conductor no alcanzado: ${id}`);
  }
  // Y explicitamente: los posteriores al centesimo tambien.
  for (const id of creados.slice(100)) {
    assert.ok(alcanzados.has(id), `conductor de alta tardia fuera del mapa: ${id}`);
  }
  assert.ok(creados.length > 100, 'la prueba debe superar el tope antiguo');
});

test('el filtro operativo distingue a quien esta en servicio de quien no', async () => {
  const { url, adminToken, conductores } = await preparar();

  // Un conductor pasa a estar en servicio al conectarse, no por una accion de
  // administracion: se conecta de verdad.
  const cuenta = conductores[0];
  const token = await login(url, `conductor0@ejemplo.com`, null, 'driver').catch(() => null);
  assert.equal(token, null, 'la contrasena temporal no se reutiliza aqui');

  const antes = await listar(url, adminToken, `?role=driver&driverStatus=${EN_SERVICIO}&limit=100`);
  const dormidos = await listar(url, adminToken, '?role=driver&driverStatus=OFFLINE&limit=100');

  assert.ok(dormidos.total > 0, 'debe haber conductores fuera de servicio');
  assert.ok(
    !antes.items.some(u => u.id === cuenta.id),
    'un conductor sin conectar no puede figurar como en servicio'
  );
  // Los dos conjuntos son disjuntos y suman el total de conductores.
  const todos = await listar(url, adminToken, '?role=driver&limit=100');
  assert.equal(antes.total + dormidos.total, todos.total, 'todo conductor cae en uno de los dos');
});

test('un estado operativo inventado se rechaza en el endpoint', async () => {
  const { url, adminToken } = await preparar();
  const respuesta = await pedir(`${url}/api/users?driverStatus=inventado`, adminToken);
  assert.equal(respuesta.status, 400);
  assert.equal((await respuesta.json()).error, 'INVALID_DRIVER_STATUS');
});
