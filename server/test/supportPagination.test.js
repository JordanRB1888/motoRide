import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'support-pagination-admin';

let escenario = null;

async function levantarServidor() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-support-'));
  const port = 13700 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'support-pagination-secret',
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
    method: 'POST',
    body: JSON.stringify({ identifier, password, role })
  });
  assert.equal(respuesta.status, 200, `Login fallido para ${identifier}`);
  return (await respuesta.json()).token;
}

async function registrarPasajero(url, { email, phone, firstName }) {
  const respuesta = await pedir(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({ email, phone, password: 'password123', role: 'passenger', firstName, lastName: 'Prueba' })
  });
  assert.equal(respuesta.status, 201, `No se pudo registrar ${email}`);
  const cuerpo = await respuesta.json();
  return { ...cuerpo, token: cuerpo.token || await login(url, email, 'password123', 'passenger') };
}

// Un PNG mínimo válido en base64, para comprobar que la imagen NO sale en el
// listado. No es contenido real: son cuatro bytes de cabecera.
const IMAGEN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const MENSAJES_POR_HILO = 8;
const HILOS = 6;

async function preparar() {
  if (escenario) return escenario;
  const { url, child } = await levantarServidor();
  const adminToken = await login(url, 'admin@58express.com', ADMIN_PASSWORD, 'admin');

  const pasajeros = [];
  for (let i = 0; i < HILOS; i += 1) {
    const pasajero = await registrarPasajero(url, {
      email: `soporte${i}@ejemplo.com`,
      phone: `+58414700${String(i).padStart(4, '0')}`,
      firstName: `Persona${i}`
    });
    pasajeros.push(pasajero);
    for (let j = 0; j < MENSAJES_POR_HILO; j += 1) {
      const respuesta = await pedir(`${url}/api/support/messages`, pasajero.token, {
        method: 'POST',
        body: JSON.stringify({
          text: `Mensaje ${j} del hilo ${i}`,
          ...(j === 0 ? { image: IMAGEN } : {})
        })
      });
      assert.equal(respuesta.status, 201, `No se pudo enviar el mensaje ${j} del hilo ${i}`);
    }
  }

  escenario = { url, child, adminToken, pasajeros };
  return escenario;
}

test.after(() => {
  if (escenario?.child) escenario.child.kill();
});

// ------------------------------------------------------------ forma y fugas

test('el listado devuelve un sobre paginado, no un arreglo suelto', async () => {
  const { url, adminToken } = await preparar();
  const pagina = await (await pedir(`${url}/api/support/threads`, adminToken)).json();

  assert.ok(Array.isArray(pagina.items), 'items debe ser un arreglo');
  assert.ok('nextCursor' in pagina, 'debe informar del cursor siguiente');
  assert.equal(typeof pagina.total, 'number');
  assert.equal(pagina.total, HILOS);
});

test('el listado no lleva el historial ni las imágenes de ningún hilo', async () => {
  const { url, adminToken } = await preparar();
  const respuesta = await pedir(`${url}/api/support/threads`, adminToken);
  const crudo = await respuesta.text();

  // Esta es la razón de ser del cambio: devolver el historial completo con las
  // imágenes incrustadas producía 149 MB en una sola respuesta.
  assert.ok(!crudo.includes('base64'), 'ninguna imagen debe viajar en el listado');
  assert.ok(!crudo.includes('iVBORw0KGgo'), 'ni siquiera un fragmento del PNG');

  const pagina = JSON.parse(crudo);
  for (const hilo of pagina.items) {
    assert.ok(!('messages' in hilo), 'el hilo no debe traer la colección de mensajes');
    assert.ok(hilo.lastMessage, 'debe traer el resumen del último mensaje');
    assert.ok(!('image' in hilo.lastMessage), 'el resumen no lleva la imagen');
    assert.equal(typeof hilo.lastMessage.hasImage, 'boolean', 'pero sí indica si la hay');
    assert.equal(typeof hilo.messageCount, 'number');
  }
});

test('el resumen indica que hay imagen sin transportarla', async () => {
  const { url, pasajeros } = await preparar();
  const propio = pasajeros[0];
  // El primer mensaje del hilo llevaba imagen; el último no.
  const mensajes = await (await pedir(
    `${url}/api/support/threads/${propio.user.id}/messages?limit=50`, propio.token
  )).json();
  const conImagen = mensajes.items.filter(item => item.image);
  assert.equal(conImagen.length, 1, 'el hilo tiene exactamente un mensaje con imagen');

  const hilos = await (await pedir(`${url}/api/support/threads`, propio.token)).json();
  assert.equal(hilos.items[0].lastMessage.hasImage, false, 'el último mensaje no tenía imagen');
});

// -------------------------------------------------------------- paginación

test('el listado se recorre entero sin repetir ni saltarse hilos', async () => {
  const { url, adminToken } = await preparar();
  const vistos = [];
  let cursor = null;
  let vueltas = 0;
  do {
    const consulta = `${url}/api/support/threads?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const pagina = await (await pedir(consulta, adminToken)).json();
    assert.ok(pagina.items.length <= 2, 'no debe exceder el tamaño pedido');
    vistos.push(...pagina.items.map(item => item.userId));
    cursor = pagina.nextCursor;
    vueltas += 1;
    assert.ok(vueltas < 20, 'la paginación no termina');
  } while (cursor);

  assert.equal(vistos.length, HILOS, 'se recorren todos los hilos');
  assert.equal(new Set(vistos).size, HILOS, 'ninguno repetido');
});

test('los mensajes de un hilo se recorren enteros y del más reciente al más antiguo', async () => {
  const { url, adminToken, pasajeros } = await preparar();
  const objetivo = pasajeros[1].user.id;

  const vistos = [];
  let cursor = null;
  let vueltas = 0;
  do {
    const consulta = `${url}/api/support/threads/${objetivo}/messages?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const pagina = await (await pedir(consulta, adminToken)).json();
    vistos.push(...pagina.items);
    cursor = pagina.nextCursor;
    vueltas += 1;
    assert.ok(vueltas < 20, 'la paginación no termina');
  } while (cursor);

  assert.equal(vistos.length, MENSAJES_POR_HILO);
  assert.equal(new Set(vistos.map(item => item.id)).size, MENSAJES_POR_HILO, 'ninguno repetido');

  // La primera página debe ser la conversación actual, no la de hace meses.
  const fechas = vistos.map(item => new Date(item.createdAt).getTime());
  const ordenadas = [...fechas].sort((a, b) => b - a);
  assert.deepEqual(fechas, ordenadas, 'del más reciente al más antiguo');
});

test('el tamaño de página tiene tope y el cliente no puede anularlo', async () => {
  const { url, adminToken } = await preparar();

  const excesivo = await pedir(`${url}/api/support/threads?limit=999999`, adminToken);
  assert.equal(excesivo.status, 400);
  assert.equal((await excesivo.json()).error, 'LIMIT_TOO_LARGE');

  const mensajes = await pedir(`${url}/api/support/threads/x/messages?limit=51`, adminToken);
  assert.equal(mensajes.status, 400, 'el tope de mensajes es más estrecho');

  for (const malo of ['abc', '0', '-1', '10abc']) {
    const respuesta = await pedir(`${url}/api/support/threads?limit=${encodeURIComponent(malo)}`, adminToken);
    assert.equal(respuesta.status, 400, `debía rechazarse limit=${malo}`);
  }
});

test('un cursor manipulado se rechaza en vez de interpretarse', async () => {
  const { url, adminToken } = await preparar();
  for (const malo of ['../../etc/passwd', 'no base64!', 'AAAA===', 'a b c']) {
    const respuesta = await pedir(`${url}/api/support/threads?cursor=${encodeURIComponent(malo)}`, adminToken);
    assert.equal(respuesta.status, 400, `debía rechazarse el cursor ${malo}`);
    assert.match((await respuesta.json()).error, /CURSOR/);
  }
});

// ------------------------------------------------------------ autorización

test('cada persona solo ve su propio hilo en el listado', async () => {
  const { url, pasajeros } = await preparar();
  const propio = pasajeros[2];
  const pagina = await (await pedir(`${url}/api/support/threads`, propio.token)).json();

  assert.equal(pagina.items.length, 1, 'solo su hilo');
  assert.equal(pagina.items[0].userId, propio.user.id);
  assert.equal(pagina.total, 1, 'el total tampoco revela cuántos hilos hay');
});

test('nadie puede leer los mensajes del hilo de otra persona', async () => {
  const { url, pasajeros } = await preparar();
  const ajeno = pasajeros[3];
  const victima = pasajeros[4];

  const respuesta = await pedir(`${url}/api/support/threads/${victima.user.id}/messages`, ajeno.token);
  assert.equal(respuesta.status, 403);
  assert.equal((await respuesta.json()).error, 'SUPPORT_THREAD_FORBIDDEN');

  // Y el propio sí.
  const propio = await pedir(`${url}/api/support/threads/${ajeno.user.id}/messages`, ajeno.token);
  assert.equal(propio.status, 200);
});

test('administración sí accede a cualquier hilo', async () => {
  const { url, adminToken, pasajeros } = await preparar();
  const respuesta = await pedir(`${url}/api/support/threads/${pasajeros[5].user.id}/messages`, adminToken);
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).items.length, MENSAJES_POR_HILO);
});

test('sin sesión no se accede a ninguno de los dos', async () => {
  const { url, pasajeros } = await preparar();
  assert.equal((await pedir(`${url}/api/support/threads`, null)).status, 401);
  assert.equal((await pedir(`${url}/api/support/threads/${pasajeros[0].user.id}/messages`, null)).status, 401);
});

// -------------------------------------------------------------- complejidad

test('la respuesta queda acotada por el tamaño de página, no por lo acumulado', async () => {
  const { url, adminToken } = await preparar();
  // La garantía que sustituye a los 149 MB: pase lo que pase con el volumen,
  // una petición devuelve como mucho una página.
  const pagina = await (await pedir(`${url}/api/support/threads?limit=2`, adminToken)).json();
  assert.equal(pagina.items.length, 2);
  assert.ok(pagina.total > 2, 'hay más hilos de los devueltos');
  assert.ok(pagina.nextCursor, 'y se ofrece cómo seguir');
});
