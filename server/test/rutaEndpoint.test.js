import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `GET /api/trips/:id/route` — quién puede pedirla y qué se responde sin
 * proveedor (ROUTE-1).
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que la ruta de una carrera sea de sus dos partes y de nadie más. Ni
 *    administración: `userCanAccessTrip` la autorizaría por herencia, y la
 *    exclusión aquí es explícita, igual que para los adjuntos del chat.
 * 2. Que sin credencial de Routes se responda «no hay geometría» con su motivo,
 *    y NUNCA una recta entre los dos extremos. Una recta sobre un mapa se lee
 *    como «por aquí se va», y por ahí puede no haber calle.
 * 3. Que el estado del viaje mande: al llegar y al terminar no hay ruta.
 *
 * El servidor arranca SIN `DISPATCH_ROUTES_API_KEY`, que es además el estado
 * real de esta máquina. Comprobar el camino con proveedor exige una credencial
 * de pago; ese camino se comprueba en `rutaDelViaje.test.js` con el cliente
 * aislado, que es donde vive la lógica.
 */

const procesos = [];
after(() => { for (const child of procesos) { try { child.kill(); } catch { /* ya terminado */ } } });

function arrancar(dataFile) {
  const port = 28900 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: dataFile,
      JWT_SECRET: 'ruta-test-secret',
      // Las pruebas no dependen de si la credencial REAL de Maps esta en el
      // disco de quien las corre: se apunta a una ruta que no existe, igual
      // que con la de FCM.
      GOOGLE_MAPS_SERVICE_ACCOUNT_FILE: './no-existe/maps-service-account.json',
      // Explícito: esta suite comprueba justo la degradación honesta.
      DISPATCH_ROUTES_API_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  procesos.push(child);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 15000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(`http://127.0.0.1:${port}`); }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
}

const asJson = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
});

async function registrar(url, { email, phone, role = 'passenger' }) {
  const r = await asJson(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({ email, phone, password: 'ClaveSegura123', role, firstName: 'Nombre', lastName: 'Apellido' })
  });
  // El cuerpo se lee UNA vez: pasarlo como mensaje del assert lo consumía antes
  // de poder devolverlo, y el fallo salía como «Body has already been read».
  const cuerpo = await r.text();
  assert.equal(r.status, 201, cuerpo);
  return JSON.parse(cuerpo);
}

const login = async (url, identifier, role) => {
  const r = await asJson(`${url}/api/auth/login`, null, {
    method: 'POST',
    body: JSON.stringify({ identifier, password: 'ClaveSegura123', role })
  });
  const cuerpo = await r.text();
  assert.equal(r.status, 200, cuerpo);
  return JSON.parse(cuerpo).token;
};

const RECOGIDA = { lat: 10.6667, lng: -71.6167 };
const DESTINO = { lat: 10.68, lng: -71.63 };

function sembrarViaje(dataFile, viaje) {
  const db = new DatabaseSync(dataFile);
  db.prepare('INSERT OR REPLACE INTO trips (id, payload) VALUES (?, ?)').run(viaje.id, JSON.stringify(viaje));
  db.close();
}

/**
 * Le pone posición a quien hace de conductor.
 *
 * Hace falta y no es decorado: con el conductor asignado el tramo va de la MOTO
 * a la recogida, así que sin su posición el servidor responde
 * `NO_ROUTE_COORDINATES` antes de mirar siquiera si hay proveedor —que es
 * correcto, y es lo que comprueba la prueba de coordenadas ausentes—.
 */
function sembrarPosicion(dataFile, userId, punto) {
  const db = new DatabaseSync(dataFile);
  const fila = db.prepare('SELECT payload FROM users WHERE id = ?').get(userId);
  const usuario = JSON.parse(fila.payload);
  usuario.location = { ...punto, updatedAt: Date.now() };
  db.prepare('UPDATE users SET payload = ? WHERE id = ?').run(JSON.stringify(usuario), userId);
  db.close();
}

/** Escenario único: arrancar un servidor por prueba hacía el archivo lento. */
let compartido = null;
const escenario = () => (compartido = compartido || construir());

async function construir() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'ruta-http-'));
  const dataDir = path.join(tempDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dataFile = path.join(dataDir, 'plus58express.sqlite');

  // Un primer arranque crea el esquema; después se siembra y se vuelve a
  // arrancar, que es exactamente lo que ocurre tras un reinicio.
  const primera = await arrancar(dataFile);
  const pasajera = await registrar(primera, { email: 'pas@ruta.test', phone: '+584140000101' });
  // El alta directa sólo crea cuentas de cliente —ser conductor exige documentos
  // y aprobación—, así que quien hace de conductor del viaje es una cuenta
  // normal puesta como `driverId`. Sirve igual: lo que este endpoint compara es
  // la IDENTIDAD contra las dos partes del viaje, no el rol.
  const conductor = await registrar(primera, { email: 'con@ruta.test', phone: '+584140000102' });
  const ajena = await registrar(primera, { email: 'otra@ruta.test', phone: '+584140000103' });

  const viaje = {
    id: 'trip_ruta_1',
    passengerId: pasajera.user.id,
    driverId: conductor.user.id,
    status: 'DRIVER_ASSIGNED',
    pickup: RECOGIDA,
    destination: DESTINO,
    createdAt: new Date().toISOString()
  };
  const llegado = { ...viaje, id: 'trip_ruta_llegado', status: 'ARRIVED' };
  const cerrado = { ...viaje, id: 'trip_ruta_cerrado', status: 'COMPLETED' };
  for (const t of [viaje, llegado, cerrado]) sembrarViaje(dataFile, t);
  sembrarPosicion(dataFile, conductor.user.id, { lat: 10.66, lng: -71.61 });

  const url = await arrancar(dataFile);
  return {
    url,
    viaje,
    llegado,
    cerrado,
    tokens: {
      pasajera: await login(url, 'pas@ruta.test', 'passenger'),
      conductor: await login(url, 'con@ruta.test', 'passenger'),
      ajena: await login(url, 'otra@ruta.test', 'passenger')
    }
  };
}

const pedirRuta = (url, id, token) => fetch(`${url}/api/trips/${id}/route`, {
  headers: token ? { authorization: `Bearer ${token}` } : {}
});

// ---------------------------------------------------------------------------

test('sin sesión no se ve la ruta de nadie', async () => {
  const { url, viaje } = await escenario();
  const r = await pedirRuta(url, viaje.id, null);
  assert.equal(r.status, 401);
});

test('una tercera persona no ve la ruta de una carrera ajena', async () => {
  const { url, viaje, tokens } = await escenario();
  const r = await pedirRuta(url, viaje.id, tokens.ajena);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'FORBIDDEN');
});

test('las dos partes SÍ pueden pedirla', async () => {
  const { url, viaje, tokens } = await escenario();
  for (const quien of ['pasajera', 'conductor']) {
    const r = await pedirRuta(url, viaje.id, tokens[quien]);
    assert.equal(r.status, 200, quien);
  }
});

test('un viaje que no existe no se distingue por el mensaje', async () => {
  const { url, tokens } = await escenario();
  const r = await pedirRuta(url, 'trip_que_no_existe', tokens.pasajera);
  assert.equal(r.status, 404);
});

test('sin credencial de Routes NO se devuelve geometría, y se dice por qué', async () => {
  // El corazón de la fase: la degradación es honesta y nombrada, no una recta
  // disfrazada de calle.
  const { url, viaje, tokens } = await escenario();
  const cuerpo = await (await pedirRuta(url, viaje.id, tokens.pasajera)).json();

  assert.equal(cuerpo.available, false);
  assert.equal(cuerpo.reason, 'ROUTE_PROVIDER_NOT_CONFIGURED');
  // El tramo sí viaja: la pantalla puede decir «ruta no disponible» sabiendo de
  // qué ruta habla, sin dibujar nada.
  assert.equal(cuerpo.leg, 'A_RECOGIDA');
  assert.equal(cuerpo.points, undefined, 'llegó geometría sin proveedor');
});

test('nunca viaja una recta entre los extremos', async () => {
  // Dos puntos exactos serían justo eso: el origen y el destino unidos. Que no
  // aparezcan es lo que impide que el mapa mienta.
  const { url, viaje, tokens } = await escenario();
  const texto = await (await pedirRuta(url, viaje.id, tokens.pasajera)).text();
  assert.ok(!texto.includes('"points"'), 'el cuerpo trae puntos sin proveedor');
  assert.ok(!/SERVER_GEODESIC|GEODESIC/.test(texto), 'la geodésica se coló como geometría');
});

test('al llegar no hay ruta, y el motivo es el estado', async () => {
  const { url, llegado, tokens } = await escenario();
  const cuerpo = await (await pedirRuta(url, llegado.id, tokens.pasajera)).json();
  assert.equal(cuerpo.available, false);
  assert.equal(cuerpo.reason, 'NO_ROUTE_FOR_STATE');
});

test('un viaje terminado no conserva ruta activa', async () => {
  const { url, cerrado, tokens } = await escenario();
  const cuerpo = await (await pedirRuta(url, cerrado.id, tokens.pasajera)).json();
  assert.equal(cuerpo.available, false);
  assert.equal(cuerpo.reason, 'NO_ROUTE_FOR_STATE');
});

test('la respuesta no publica la credencial ni la clave de almacenamiento', async () => {
  const { url, viaje, tokens } = await escenario();
  const texto = await (await pedirRuta(url, viaje.id, tokens.pasajera)).text();
  assert.ok(!/api[_-]?key/i.test(texto));
  assert.ok(!/DISPATCH_ROUTES/i.test(texto));
});
