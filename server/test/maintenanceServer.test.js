import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { cuerpoDeSalud, manejar, HOST, RUTA_SALUD, PUERTO_POR_DEFECTO } from '../maintenance.js';

const directorioPruebas = path.dirname(fileURLToPath(import.meta.url));
const directorioServidor = path.resolve(directorioPruebas, '..');
const archivoMantenimiento = path.join(directorioServidor, 'maintenance.js');

const PUERTO = 18100 + Math.floor(Math.random() * 399);

const temporales = [];
const procesos = [];

test.after(() => {
  for (const proceso of procesos) {
    if (proceso.exitCode === null && proceso.signalCode === null) proceso.kill('SIGKILL');
  }
  for (const dir of temporales) fs.rmSync(dir, { recursive: true, force: true });
});

function dirTemporal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantenimiento-'));
  temporales.push(dir);
  return dir;
}

/**
 * Levanta maintenance.js como proceso hijo real, igual que lo hace Railway con
 * el `startCommand`. Importarlo dentro de la prueba comprobaria el modulo pero
 * no el arranque, y el arranque es justo lo que fallo en el tercer cutover.
 */
async function arrancarMantenimiento({ puerto, datosEn }) {
  const proceso = spawn(process.execPath, [archivoMantenimiento], {
    cwd: directorioServidor,
    env: {
      ...process.env,
      PORT: String(puerto),
      // Se le da una ruta plausible a proposito: si el proceso decidiera abrir
      // la base de datos, dejaria el archivo aqui y la prueba lo veria.
      DATA_FILE: path.join(datosEn, 'plus58express.sqlite')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  procesos.push(proceso);

  let salida = '';
  proceso.stdout.on('data', trozo => { salida += trozo; });
  proceso.stderr.on('data', trozo => { salida += trozo; });

  const limite = Date.now() + 15000;
  for (;;) {
    if (proceso.exitCode !== null) {
      throw new Error(`maintenance.js murio con codigo ${proceso.exitCode}: ${salida}`);
    }
    try {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}${RUTA_SALUD}`);
      if (respuesta.ok) return { proceso, salida: () => salida };
    } catch {
      // Todavia no escucha.
    }
    if (Date.now() > limite) throw new Error(`maintenance.js no respondio a tiempo: ${salida}`);
    await new Promise(listo => setTimeout(listo, 100));
  }
}

// --------------------------------------------------------------------------
// Lo que el healthcheck de Railway ve
// --------------------------------------------------------------------------

test('el proceso arranca y responde 200 en /api/health', async () => {
  const datos = dirTemporal();
  await arrancarMantenimiento({ puerto: PUERTO, datosEn: datos });

  const respuesta = await fetch(`http://127.0.0.1:${PUERTO}/api/health`);
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { ok: true, maintenance: true, databaseWriters: 0 });
});

test('escucha en el puerto que le pasa el entorno, no en uno fijo', async () => {
  const otroPuerto = PUERTO + 1;
  const datos = dirTemporal();
  await arrancarMantenimiento({ puerto: otroPuerto, datosEn: datos });

  const respuesta = await fetch(`http://127.0.0.1:${otroPuerto}/api/health`);
  assert.equal(respuesta.status, 200);

  // Y el puerto por defecto no se queda ocupado de rebote.
  assert.notEqual(otroPuerto, PUERTO_POR_DEFECTO);
});

test('se ata a 0.0.0.0 y no al bucle local', () => {
  // Un servidor atado a 127.0.0.1 pasa todas las pruebas locales y falla la
  // sonda real, porque Railway enruta desde fuera del contenedor. La constante
  // se comprueba aqui para que nadie la "simplifique" a localhost.
  assert.equal(HOST, '0.0.0.0');

  const fuente = fs.readFileSync(archivoMantenimiento, 'utf8');
  assert.ok(!/['"]localhost['"]/.test(fuente), 'maintenance.js no debe atarse a localhost');
  assert.ok(!/['"]127\.0\.0\.1['"]/.test(fuente), 'maintenance.js no debe atarse a 127.0.0.1');
});

test('anuncia el modo mantenimiento en el registro de arranque', async () => {
  const datos = dirTemporal();
  const { salida } = await arrancarMantenimiento({ puerto: PUERTO + 2, datosEn: datos });
  assert.match(salida(), /\[\+58express Maintenance\]/);
});

// --------------------------------------------------------------------------
// Lo que NO hace, que es la razon de existir del archivo
// --------------------------------------------------------------------------

/**
 * Extrae todos los especificadores que el modulo puede cargar: imports
 * estaticos, imports dinamicos y require. Como los imports de ESM son
 * estaticos, si el conjunto se reduce a `node:http` el grafo entero esta
 * cerrado y el proceso no puede inicializar SQLite, PostgreSQL ni Socket.IO,
 * por mucho que cambie el cuerpo de las funciones.
 */
function especificadores(fuente) {
  const encontrados = new Set();
  for (const [, nombre] of fuente.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) encontrados.add(nombre);
  for (const [, nombre] of fuente.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) encontrados.add(nombre);
  for (const [, nombre] of fuente.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) encontrados.add(nombre);
  for (const [, nombre] of fuente.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g)) encontrados.add(nombre);
  return encontrados;
}

test('el grafo de modulos se reduce a node:http', () => {
  const fuente = fs.readFileSync(archivoMantenimiento, 'utf8');
  assert.deepEqual([...especificadores(fuente)].sort(), ['node:http']);

  // Un import dinamico construido --import(variable)-- se escaparia del
  // analisis anterior, asi que se prohibe cualquier forma de import dinamico.
  assert.ok(
    !/\bimport\s*\(/.test(fuente.replace(/\bimport\s*\(\s*['"]node:http['"]/g, '')),
    'maintenance.js no debe usar import dinamico'
  );
});

test('no inicializa SQLite, PostgreSQL ni Socket.IO', () => {
  const fuente = fs.readFileSync(archivoMantenimiento, 'utf8');
  const cargados = especificadores(fuente);
  for (const prohibido of ['node:sqlite', 'pg', 'socket.io', './services/databaseBackend.js', './index.js']) {
    assert.ok(!cargados.has(prohibido), `maintenance.js no debe cargar ${prohibido}`);
  }
});

test('no crea ni toca archivos de base de datos', async () => {
  const datos = dirTemporal();
  await arrancarMantenimiento({ puerto: PUERTO + 3, datosEn: datos });

  // Se le da margen por si algo escribiera de forma diferida.
  await new Promise(listo => setTimeout(listo, 750));

  assert.deepEqual(
    fs.readdirSync(datos), [],
    'el directorio de DATA_FILE debe seguir vacio: mantenimiento no abre la base'
  );
});

test('no deja escritores de fondo trabajando', async () => {
  const datos = dirTemporal();
  await arrancarMantenimiento({ puerto: PUERTO + 4, datosEn: datos });

  // Un escritor periodico --persistencia diferida, jobs, limpieza-- se
  // delataria creando algo en el intervalo. Se mide dos veces separadas para
  // no depender de la fase del temporizador.
  const primera = fs.readdirSync(datos);
  await new Promise(listo => setTimeout(listo, 1200));
  const segunda = fs.readdirSync(datos);

  assert.deepEqual(primera, []);
  assert.deepEqual(segunda, []);

  // Y el invariante queda declarado en la propia respuesta.
  assert.equal(cuerpoDeSalud().databaseWriters, 0);
});

test('no atiende el handshake de Socket.IO', async () => {
  const datos = dirTemporal();
  await arrancarMantenimiento({ puerto: PUERTO + 5, datosEn: datos });

  const respuesta = await fetch(`http://127.0.0.1:${PUERTO + 5}/socket.io/?EIO=4&transport=polling`);
  assert.equal(respuesta.status, 503);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, 'MAINTENANCE_MODE');
});

// --------------------------------------------------------------------------
// El resto de la superficie
// --------------------------------------------------------------------------

test('cualquier otra ruta responde 503, no 404', async () => {
  const datos = dirTemporal();
  await arrancarMantenimiento({ puerto: PUERTO + 6, datosEn: datos });
  const base = `http://127.0.0.1:${PUERTO + 6}`;

  for (const ruta of ['/', '/api/users', '/api/trips', '/api/auth/login']) {
    const respuesta = await fetch(base + ruta);
    assert.equal(respuesta.status, 503, `${ruta} deberia responder 503`);
    assert.equal(respuesta.headers.get('retry-after'), '60');
  }
});

test('la salud no se cachea', async () => {
  const datos = dirTemporal();
  await arrancarMantenimiento({ puerto: PUERTO + 7, datosEn: datos });
  const respuesta = await fetch(`http://127.0.0.1:${PUERTO + 7}/api/health`);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
});

test('la respuesta de salud no filtra configuracion', () => {
  // Se compara el conjunto exacto de claves: si alguien añade la rama, el
  // commit o una variable de entorno, esta prueba lo caza.
  assert.deepEqual(Object.keys(cuerpoDeSalud()).sort(), ['databaseWriters', 'maintenance', 'ok']);

  const fuente = fs.readFileSync(archivoMantenimiento, 'utf8');
  for (const secreto of ['JWT_SECRET', 'ADMIN_PASSWORD', 'DATABASE_URL', 'DRIVER_PASSWORD', 'PASSENGER_PASSWORD']) {
    assert.ok(!fuente.includes(secreto), `maintenance.js no debe mencionar ${secreto}`);
  }
});

test('el modo mantenimiento se distingue del servidor normal', () => {
  // Durante el cutover hay que poder afirmar, mirando solo /api/health, en que
  // modo esta el contenedor. Si el servidor normal empezara a devolver
  // `maintenance`, la distincion se perderia sin que nadie lo notara.
  const fuenteIndex = fs.readFileSync(path.join(directorioServidor, 'index.js'), 'utf8');
  const salud = fuenteIndex.slice(fuenteIndex.indexOf("app.get('/api/health'"));
  assert.ok(salud.length > 0, 'index.js debe seguir teniendo /api/health');
  assert.ok(
    !salud.slice(0, 600).includes('maintenance'),
    'la salud del servidor normal no debe incluir la clave maintenance'
  );

  assert.equal(cuerpoDeSalud().maintenance, true);
});

test('manejar() responde sin necesidad de socket, para poder razonar sobre el', () => {
  // Prueba de unidad del enrutado, independiente del arranque.
  const respuestas = [];
  function respuestaFalsa() {
    return {
      cabeceras: {},
      setHeader(nombre, valor) { this.cabeceras[nombre] = valor; },
      writeHead(codigo, cabeceras) { this.codigo = codigo; Object.assign(this.cabeceras, cabeceras); },
      end(cuerpo) { this.cuerpo = cuerpo; respuestas.push(this); }
    };
  }

  const salud = respuestaFalsa();
  manejar({ method: 'GET', url: '/api/health?t=1' }, salud);
  assert.equal(salud.codigo, 200);
  assert.deepEqual(JSON.parse(salud.cuerpo), { ok: true, maintenance: true, databaseWriters: 0 });

  const otra = respuestaFalsa();
  manejar({ method: 'GET', url: '/api/users' }, otra);
  assert.equal(otra.codigo, 503);

  // Un POST a la ruta de salud no debe colarse como sano.
  const post = respuestaFalsa();
  manejar({ method: 'POST', url: '/api/health' }, post);
  assert.equal(post.codigo, 503);
});
