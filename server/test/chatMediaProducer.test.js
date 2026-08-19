import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createChatMediaPipeline } from '../services/chatMediaPipeline.js';
import { decodeChatImageDataUrl, isChatImageDataUrl } from '../domain/chatImageInput.js';
import { publicChatMessage, PRIVATE_MESSAGE_FIELDS } from '../domain/chatMessageProjection.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'producer-admin';

/**
 * Desde 4C una imagen de chat ya no vive dentro de la fila: se escribe en el
 * almacen privado y el mensaje se queda con la referencia publica.
 *
 * Lo que se comprueba aqui es el alta: que los dos canales --soporte por HTTP y
 * viaje por socket-- producen el mismo formato, que no queda base64 nuevo, que
 * la clave privada no sale al cliente y que un fallo a mitad no deja rastro.
 */

// ------------------------------------------------------------ fixtures

/** PNG minimo con firma valida. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'),
  Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), Buffer.from([0x1f, 0x15, 0xc4, 0x89])
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 7)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(12, 3)
]);

const dataUrl = (buffer, tipo) => `data:image/${tipo};base64,${buffer.toString('base64')}`;
const PNG_URL = dataUrl(PNG, 'png');
const JPEG_URL = dataUrl(JPEG, 'jpeg');
const WEBP_URL = dataUrl(WEBP, 'webp');

// -------------------------------------------------- servidor de pruebas

const arrancados = [];

async function levantarServidor(bloque) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-producer-'));
  const port = bloque + Math.floor(Math.random() * 190);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'producer-secret', ADMIN_PASSWORD
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  arrancados.push(child);
  let traza = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`El servidor no inició: ${traza}`)), 20000);
    child.stdout.on('data', chunk => {
      traza += chunk.toString();
      if (traza.includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', chunk => { traza += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}: ${traza}`)));
  });
  return { url: `http://127.0.0.1:${port}`, tempDir, mediaDir: path.join(tempDir, 'chat-media') };
}

test.after(() => {
  for (const child of arrancados) child.kill();
});

let contador = 0;
async function registrarPasajero(url) {
  contador += 1;
  const respuesta = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `productor${contador}.${Date.now()}@ejemplo.com`,
      phone: `+58414${String(5000000 + contador).slice(0, 7)}`,
      password: 'ContrasenaValida1', role: 'passenger',
      firstName: `Productor${contador}`, lastName: 'Prueba'
    })
  });
  assert.equal(respuesta.status, 201);
  return respuesta.json();
}

const enviarSoporte = (url, token, cuerpo) => fetch(`${url}/api/support/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify(cuerpo)
});

/** Filas tal y como quedaron persistidas. El archivo es SQLite, no JSON. */
function filasDe(tempDir, tabla) {
  const db = new DatabaseSync(path.join(tempDir, 'database.json'));
  try {
    return db.prepare(`SELECT payload FROM ${tabla}`).all().map(fila => JSON.parse(fila.payload));
  } finally {
    db.close();
  }
}

/** Archivos realmente escritos en el almacén privado. */
const archivosDe = mediaDir => (fs.existsSync(mediaDir)
  ? fs.readdirSync(mediaDir, { recursive: true }).map(String).filter(f => /\.(png|jpg|webp)$/.test(f))
  : []);

// --------------------------------------------------- A) sin imagen

test('A) un mensaje sin imagen sigue funcionando igual', async () => {
  const { url, mediaDir } = await levantarServidor(24300);
  const { token } = await registrarPasajero(url);

  const respuesta = await enviarSoporte(url, token, { text: 'solo texto' });
  assert.equal(respuesta.status, 201);
  const mensaje = await respuesta.json();
  assert.equal(mensaje.text, 'solo texto');
  assert.ok(!('imageRef' in mensaje), 'sin imagen no debe haber referencia');
  assert.equal(archivosDe(mediaDir).length, 0, 'no debía escribirse ningún archivo');
});

// ------------------------------------- B/C/D) los tres formatos raster

test('B+C+D) JPEG, PNG y WEBP producen archivo y referencia', async () => {
  const { url, mediaDir } = await levantarServidor(24500);
  const { token } = await registrarPasajero(url);

  const vistos = new Set();
  for (const [tipo, urlDatos] of [['jpeg', JPEG_URL], ['png', PNG_URL], ['webp', WEBP_URL]]) {
    const respuesta = await enviarSoporte(url, token, { text: tipo, image: urlDatos });
    assert.equal(respuesta.status, 201, `${tipo} debía aceptarse`);
    const mensaje = await respuesta.json();
    assert.equal(mensaje.imageRef?.mimeType, `image/${tipo}`);
    assert.match(mensaje.imageRef?.id || '', /^[0-9a-f-]{36}$/i);
    vistos.add(mensaje.imageRef.id);
  }

  assert.equal(vistos.size, 3, 'cada imagen debe tener su propio identificador');
  assert.equal(archivosDe(mediaDir).length, 3, 'debía escribirse un archivo por imagen');
});

// --------------------------------------------- E/F) el payload público

test('E+F) el mensaje no lleva base64 nuevo ni la clave del almacén', async () => {
  const { url, tempDir } = await levantarServidor(24700);
  const { token } = await registrarPasajero(url);

  const mensaje = await (await enviarSoporte(url, token, { text: 'x', image: PNG_URL })).json();
  assert.ok(!('image' in mensaje), 'no debe persistirse base64 nuevo');
  assert.ok(!('imageStorageKey' in mensaje), 'la clave privada no puede salir');

  const serializado = JSON.stringify(mensaje);
  assert.ok(!serializado.includes('base64'), 'ni rastro de base64 en el payload');
  assert.ok(!serializado.includes('chat-media'), 'ni de la ruta del almacén');

  // La fila persistida SÍ guarda la clave: es lo que permite volver a leerla.
  const filas = filasDe(tempDir, 'supportMessages');
  assert.equal(filas.length, 1);
  assert.ok(filas[0].imageStorageKey, 'la fila debe conservar la clave privada');
  assert.ok(!('image' in filas[0]), 'pero no debe guardar la data URL');
  assert.ok(!JSON.stringify(filas[0]).includes('data:image/'), 'ni rastro de base64 en disco');
});

test('F) tampoco la filtran el listado ni el evento en tiempo real', async () => {
  const { url } = await levantarServidor(24900);
  const { token, user } = await registrarPasajero(url);
  await enviarSoporte(url, token, { text: 'x', image: PNG_URL });

  const pagina = await (await fetch(`${url}/api/support/threads/${user.id}/messages?limit=10`, {
    headers: { authorization: `Bearer ${token}` }
  })).json();
  const serializado = JSON.stringify(pagina);
  assert.ok(serializado.includes('imageRef'), 'el listado debe traer la referencia');
  assert.ok(!serializado.includes('imageStorageKey'), 'pero nunca la clave privada');
});

// ------------------------------------------- G/H/I/J) entradas inválidas

test('G+H+I+J) SVG, MIME falso, base64 corrupto y exceso se rechazan', async () => {
  const { url, mediaDir } = await levantarServidor(25100);
  const { token } = await registrarPasajero(url);

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
  const casos = [
    ['SVG declarado como tal', `data:image/svg+xml;base64,${svg.toString('base64')}`],
    ['SVG disfrazado de PNG', `data:image/png;base64,${svg.toString('base64')}`],
    ['GIF', `data:image/gif;base64,${PNG.toString('base64')}`],
    ['MIME con parámetro', `data:image/png;charset=utf-8;base64,${PNG.toString('base64')}`],
    ['base64 truncado', `data:image/png;base64,${PNG.toString('base64').slice(0, -3)}`],
    ['base64 con basura', 'data:image/png;base64,no-es-base64-valido!!'],
    ['http', 'https://ejemplo.com/foto.png'],
    ['blob', 'blob:http://localhost/abc'],
    ['ruta relativa', '/uploads/foto.png'],
    ['javascript', 'javascript:alert(1)'],
    ['data:text/html', 'data:text/html;base64,PHNjcmlwdD4x'],
    ['excede el tope', `data:image/png;base64,${'A'.repeat(1_000_001)}`]
  ];

  for (const [etiqueta, entrada] of casos) {
    const respuesta = await enviarSoporte(url, token, { image: entrada });
    assert.ok(respuesta.status >= 400, `«${etiqueta}» debía rechazarse; devolvió ${respuesta.status}`);
    const cuerpo = await respuesta.json();
    assert.ok(!JSON.stringify(cuerpo).includes('chat-media'), `«${etiqueta}» filtró la ruta del almacén`);
  }

  assert.equal(archivosDe(mediaDir).length, 0, 'ningún rechazo debía escribir un archivo');
});

// -------------------------------------- K/L/M) fallos e inyección de fallos

test('K) si el almacén falla, no se crea ningún mensaje', () => {
  const storage = {
    saveBuffer() { const e = new Error('CHAT_MEDIA_STORAGE_FULL'); e.code = 'CHAT_MEDIA_STORAGE_FULL'; throw e; },
    remove() { throw new Error('no debería llegar aquí'); }
  };
  const pipeline = createChatMediaPipeline({ storage });

  let persistido = false;
  assert.throws(
    () => pipeline.withStoredImage(PNG_URL, 'u1', () => { persistido = true; }),
    error => error.code === 'CHAT_MEDIA_STORAGE_FULL'
  );
  assert.equal(persistido, false, 'la persistencia no debe llegar a ejecutarse');
});

test('L) si la base falla después de guardar, el archivo se borra', () => {
  const borrados = [];
  const storage = {
    saveBuffer: () => 'owner/abcd.png',
    remove: clave => borrados.push(clave)
  };
  const pipeline = createChatMediaPipeline({ storage });

  assert.throws(
    () => pipeline.withStoredImage(PNG_URL, 'u1', () => { throw new Error('DB_CAIDA'); }),
    /DB_CAIDA/
  );
  assert.deepEqual(borrados, ['owner/abcd.png'], 'el archivo huérfano debía compensarse');
});

test('M) si la compensación falla, se avisa y se propaga el error original', () => {
  const avisos = [];
  const storage = {
    saveBuffer: () => 'owner/abcd.png',
    remove() { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; }
  };
  const pipeline = createChatMediaPipeline({ storage, onCompensationError: d => avisos.push(d) });

  assert.throws(
    () => pipeline.withStoredImage(PNG_URL, 'u1', () => { throw new Error('DB_CAIDA'); }),
    // El error que se propaga es el de la base, no el de la limpieza: es el que
    // explica por que no hay mensaje.
    /DB_CAIDA/
  );
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].reason, 'EACCES');
  assert.equal(avisos[0].mimeType, 'image/png');
  assert.ok(avisos[0].bytes > 0);
  // El aviso no puede llevar la clave ni la ruta.
  const serializado = JSON.stringify(avisos[0]);
  assert.ok(!serializado.includes('owner/'), 'el aviso no debe incluir la clave privada');
});

// ------------------------------------------------ N) los dos canales

test('N) socket y HTTP producen exactamente el mismo formato', async () => {
  const { url } = await levantarServidor(25300);
  const { token } = await registrarPasajero(url);

  const porHttp = await (await enviarSoporte(url, token, { text: 'x', image: PNG_URL })).json();

  // El productor de socket comparte pipeline: se comprueba sobre la fuente que
  // ambos llaman al mismo `withStoredImage` y componen `...media` igual.
  const fuente = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  const llamadas = fuente.match(/chatMediaPipeline\.withStoredImage\(/g) || [];
  assert.equal(llamadas.length, 2, `se esperaban los dos productores, hay ${llamadas.length}`);
  assert.equal((fuente.match(/\.\.\.\(media \|\| \{\}\)/g) || []).length, 2,
    'los dos deben componer el mensaje con el mismo bloque de medios');

  assert.deepEqual(Object.keys(porHttp.imageRef).sort(), ['id', 'mimeType']);
});

// -------------------------------------------- O/P) identificadores

test('O) dos imágenes distintas dan identificadores y claves distintos', async () => {
  const { url, mediaDir } = await levantarServidor(25500);
  const { token } = await registrarPasajero(url);

  const primero = await (await enviarSoporte(url, token, { text: 'a', image: PNG_URL })).json();
  const segundo = await (await enviarSoporte(url, token, { text: 'b', image: PNG_URL })).json();

  assert.notEqual(primero.imageRef.id, segundo.imageRef.id);
  // Misma imagen byte a byte, archivos distintos: no se deduplica por contenido
  // a proposito, porque compartir archivo entre dos mensajes obligaria a contar
  // referencias antes de poder borrar ninguno.
  assert.equal(archivosDe(mediaDir).length, 2);
});

test('P) el identificador público no es la clave del almacén', async () => {
  const { url, tempDir } = await levantarServidor(25700);
  const { token } = await registrarPasajero(url);

  const mensaje = await (await enviarSoporte(url, token, { text: 'x', image: PNG_URL })).json();
  const fila = filasDe(tempDir, 'supportMessages').find(m => m.imageRef?.id === mensaje.imageRef.id);

  assert.ok(fila, 'la fila debe existir');
  assert.ok(fila.imageStorageKey, 'y conservar su clave privada');
  assert.ok(!fila.imageStorageKey.includes(mensaje.imageRef.id),
    'la clave no puede derivarse del identificador público');
  assert.ok(!mensaje.imageRef.id.includes('/'), 'el identificador nunca es una ruta');
});

// ------------------------------------------------- unidades del contrato

test('el contrato de entrada acepta solo los tres formatos raster', () => {
  assert.ok(isChatImageDataUrl(PNG_URL));
  assert.ok(isChatImageDataUrl(JPEG_URL));
  assert.ok(isChatImageDataUrl(WEBP_URL));
  for (const malo of [
    `data:image/svg+xml;base64,${PNG.toString('base64')}`,
    `data:image/gif;base64,${PNG.toString('base64')}`,
    `data:image/avif;base64,${PNG.toString('base64')}`,
    `data:image/bmp;base64,${PNG.toString('base64')}`,
    `data:image/tiff;base64,${PNG.toString('base64')}`,
    `data:image/jpg;base64,${PNG.toString('base64')}`,
    'https://ejemplo.com/a.png', 'blob:x', '/relativa.png', 'javascript:1',
    'data:text/html;base64,PHA+', null, undefined, 42
  ]) {
    assert.ok(!isChatImageDataUrl(malo), `no debía aceptarse: ${String(malo).slice(0, 40)}`);
  }
});

test('la decodificación ocurre una sola vez y detecta base64 corrupto', () => {
  const { mimeType, buffer } = decodeChatImageDataUrl(PNG_URL);
  assert.equal(mimeType, 'image/png');
  assert.ok(buffer.equals(PNG), 'los bytes deben ser exactamente los originales');

  for (const malo of [
    `data:image/png;base64,${PNG.toString('base64').slice(0, -3)}`,
    'data:image/png;base64,====',
    'data:image/png;base64,'
  ]) {
    assert.throws(() => decodeChatImageDataUrl(malo), error => error.code === 'INVALID_CHAT_IMAGE');
  }
  assert.throws(
    () => decodeChatImageDataUrl(`data:image/png;base64,${'A'.repeat(1_000_001)}`),
    error => error.code === 'CHAT_IMAGE_TOO_LARGE'
  );
});

test('la proyección pública quita la clave y nada más', () => {
  const mensaje = { id: 'm1', text: 'hola', imageRef: { id: 'a', mimeType: 'image/png' }, imageStorageKey: 'o/x.png' };
  const publico = publicChatMessage(mensaje);

  assert.ok(!('imageStorageKey' in publico));
  assert.deepEqual(publico.imageRef, mensaje.imageRef);
  assert.equal(publico.text, 'hola');
  assert.equal(mensaje.imageStorageKey, 'o/x.png', 'no debe mutar el original');
  assert.deepEqual(PRIVATE_MESSAGE_FIELDS, ['imageStorageKey']);
});
