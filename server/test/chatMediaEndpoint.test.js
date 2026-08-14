import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createChatMediaStorage, resolveChatMediaRoot } from '../services/chatMediaStorage.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Fixtures sintéticos. Ninguna imagen real. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(120).fill(0x20)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(120).fill(0x20)]);

/**
 * Prepara un entorno completo: base temporal, raíz de medios y los adjuntos ya
 * guardados, y siembra los mensajes que los referencian directamente en el
 * archivo de datos. Así el servidor arranca leyéndolos, que es exactamente lo
 * que ocurriría tras un reinicio de Railway.
 */
async function prepararEntorno() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'chat-media-http-'));
  const dataDir = path.join(tempDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dataFile = path.join(dataDir, 'plus58express.sqlite');
  const chatMediaDir = path.join(dataDir, 'chat-media');
  const raiz = resolveChatMediaRoot({ dataFile, isProduction: false, env: { CHAT_MEDIA_DIR: chatMediaDir } });
  const storage = createChatMediaStorage({ rootDirectory: raiz });
  return { tempDir, dataFile, chatMediaDir, storage };
}

/** Procesos vivos del archivo; se cierran todos al terminar la suite. */
const procesos = [];
after(() => { for (const child of procesos) { try { child.kill(); } catch { /* ya terminado */ } } });

function arrancar({ dataFile, chatMediaDir }) {
  // Rango amplio: este archivo arranca dos servidores por prueba.
  const port = 10100 + Math.floor(Math.random() * 700);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: dataFile,
      CHAT_MEDIA_DIR: chatMediaDir,
      JWT_SECRET: 'chat-media-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  procesos.push(child);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(`http://127.0.0.1:${port}`); } });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
}

const asJson = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
});

async function registrar(url, { email, phone, firstName = 'Nombre' }) {
  const r = await asJson(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({ email, phone, password: 'ClaveSegura123', role: 'passenger', firstName, lastName: 'Apellido' })
  });
  assert.equal(r.status, 201);
  return r.json();
}

const login = async (url, identifier, password, role) => {
  const r = await asJson(`${url}/api/auth/login`, null, { method: 'POST', body: JSON.stringify({ identifier, password, role }) });
  assert.equal(r.status, 200);
  return (await r.json()).token;
};

const pedir = (url, id, token) => fetch(`${url}/api/chat-media/${id}/content`, {
  headers: token ? { authorization: `Bearer ${token}` } : {}
});

/**
 * Siembra mensajes con adjunto directamente en el archivo de datos, sin pasar
 * por la API: en esta fase todavía no existe ninguna entrada que los cree.
 */
function sembrar(dataFile, { messages = [], supportMessages = [], trips = [] }) {
  const db = new DatabaseSync(dataFile);
  for (const [tabla, filas] of [['messages', messages], ['supportMessages', supportMessages], ['trips', trips]]) {
    const insert = db.prepare(`INSERT OR REPLACE INTO ${tabla} (id, payload) VALUES (?, ?)`);
    for (const fila of filas) insert.run(fila.id, JSON.stringify(fila));
  }
  db.close();
}

/**
 * Escenario compartido por todo el archivo: dos personas, un viaje cerrado y
 * dos adjuntos. Se construye una sola vez —arrancar veinte servidores hacía
 * el archivo intermitente por colisión de puertos— y las pruebas solo leen.
 */
let compartido = null;
function escenario() {
  compartido = compartido || construirEscenario();
  return compartido;
}

async function construirEscenario() {
  const entorno = await prepararEntorno();

  // Servidor de siembra: crea el esquema y las cuentas.
  const urlSiembra = await arrancar(entorno);
  const pasajero = await registrar(urlSiembra, { email: 'p@ejemplo.test', phone: '+584141230001' });
  const conductorAcc = await registrar(urlSiembra, { email: 'c@ejemplo.test', phone: '+584141230002', firstName: 'Conductor' });
  const ajeno = await registrar(urlSiembra, { email: 'x@ejemplo.test', phone: '+584141230003' });
  const adminToken = await login(urlSiembra, 'admin@58express.com', 'admin', 'admin');
  await new Promise(r => setTimeout(r, 200));

  const claveViaje = entorno.storage.saveBuffer(PNG, 'image/png', pasajero.user.id);
  const claveSoporte = entorno.storage.saveBuffer(JPEG, 'image/jpeg', pasajero.user.id);
  const idViaje = crypto.randomUUID();
  const idSoporte = crypto.randomUUID();

  sembrar(entorno.dataFile, {
    trips: [{ id: 'trip_cerrado', status: 'COMPLETED', passengerId: pasajero.user.id, driverId: conductorAcc.user.id }],
    messages: [{
      id: 'msg_1', tripId: 'trip_cerrado', senderId: pasajero.user.id, text: 'hola',
      imageRef: { id: idViaje, mimeType: 'image/png', size: PNG.length, createdAt: new Date().toISOString() },
      imageStorageKey: claveViaje
    }],
    supportMessages: [{
      id: 'support_1', conversationUserId: pasajero.user.id, senderId: pasajero.user.id, senderRole: 'passenger', text: 'ayuda',
      imageRef: { id: idSoporte, mimeType: 'image/jpeg', size: JPEG.length, createdAt: new Date().toISOString() },
      imageStorageKey: claveSoporte
    }]
  });

  // Segundo arranque: reinicio real. El servidor relee todo del archivo.
  const url = await arrancar(entorno);
  return {
    url, entorno, idViaje, idSoporte, claveViaje,
    pasajero, conductor: { ...conductorAcc, token: conductorAcc.token }, ajeno, adminToken
  };
}

test('tras reiniciar, el adjunto se resuelve por imageStorageKey del registro', async () => {
  const e = await escenario();
  const respuesta = await pedir(e.url, e.idViaje, e.pasajero.token);

  assert.equal(respuesta.status, 200, 'el proceso nuevo encuentra el archivo');
  assert.equal(respuesta.headers.get('content-type'), 'image/png');
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  assert.ok(bytes.subarray(0, 8).equals(PNG.subarray(0, 8)));
});

test('la respuesta 200 lleva las cabeceras privadas y ninguna clave', async () => {
  const e = await escenario();
  const r = await pedir(e.url, e.idViaje, e.pasajero.token);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('content-disposition'), 'inline');

  const cabeceras = JSON.stringify([...r.headers]);
  for (const marca of ['imageStorageKey', 'chat-media', e.claveViaje, '.png', 'storageKey']) {
    assert.ok(!cabeceras.includes(marca), `las cabeceras no debían contener: ${marca}`);
  }
});

test('el conductor también abre el adjunto de un viaje ya cerrado', async () => {
  const e = await escenario();
  assert.equal((await pedir(e.url, e.idViaje, e.conductor.token)).status, 200);
});

test('administración recibe 403 en el chat de viaje', async () => {
  const e = await escenario();
  const r = await pedir(e.url, e.idViaje, e.adminToken);
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: 'CHAT_MEDIA_FORBIDDEN' });
});

test('un tercero recibe 403 en ambos canales', async () => {
  const e = await escenario();
  assert.equal((await pedir(e.url, e.idViaje, e.ajeno.token)).status, 403);
  assert.equal((await pedir(e.url, e.idSoporte, e.ajeno.token)).status, 403);
});

test('en soporte acceden el propietario del hilo y administración', async () => {
  const e = await escenario();
  assert.equal((await pedir(e.url, e.idSoporte, e.pasajero.token)).status, 200);
  assert.equal((await pedir(e.url, e.idSoporte, e.adminToken)).status, 200);
});

test('sin sesión y con token inválido se responde 401', async () => {
  const e = await escenario();
  assert.equal((await pedir(e.url, e.idViaje, null)).status, 401);
  assert.equal((await pedir(e.url, e.idViaje, 'token.invalido')).status, 401);
});

test('malformado, inexistente y ajeno son indistinguibles', async () => {
  const e = await escenario();
  const casos = {
    'ajeno': [e.idViaje, e.ajeno.token],
    'inexistente': ['00000000-0000-0000-0000-000000000000', e.pasajero.token],
    'malformado': ['no-es-uuid', e.pasajero.token],
    'con forma de ruta': [encodeURIComponent('../uuid.png'), e.pasajero.token],
    'vacío': ['%20', e.pasajero.token]
  };
  const vistas = {};
  for (const [nombre, [id, token]] of Object.entries(casos)) {
    const r = await pedir(e.url, id, token);
    vistas[nombre] = { status: r.status, body: await r.text(), tipo: r.headers.get('content-type') };
  }
  const ref = vistas['ajeno'];
  assert.equal(ref.status, 403);
  for (const [nombre, v] of Object.entries(vistas)) {
    assert.equal(v.status, ref.status, `${nombre}: mismo estado`);
    assert.equal(v.body, ref.body, `${nombre}: mismo cuerpo`);
    assert.equal(v.tipo, ref.tipo, `${nombre}: mismo tipo`);
  }
  assert.equal(Object.keys(JSON.parse(ref.body)).length, 1, 'solo el código de error');
});

test('un archivo ausente o alterado da 404 solo a quien está autorizado', async (t) => {
  const e = await escenario();
  // Se altera el contenido: la firma deja de coincidir al leer. El escenario es
  // compartido, así que se restaura después para no condicionar a las demás.
  const ruta = e.entorno.storage.resolve(e.claveViaje);
  const original = fs.readFileSync(ruta);
  t.after(() => fs.writeFileSync(ruta, original));
  fs.writeFileSync(ruta, Buffer.from('ya no es una imagen'));

  const autorizado = await pedir(e.url, e.idViaje, e.pasajero.token);
  assert.equal(autorizado.status, 404);
  assert.deepEqual(await autorizado.json(), { error: 'CHAT_MEDIA_NOT_FOUND' });

  // Quien no está autorizado sigue viendo 403: el 404 no le revela nada.
  assert.equal((await pedir(e.url, e.idViaje, e.ajeno.token)).status, 403);
});

test('ninguna respuesta filtra la clave privada ni rutas del sistema', async () => {
  const e = await escenario();
  const cuerpos = [];
  for (const [id, token] of [[e.idViaje, e.ajeno.token], [e.idViaje, null], ['no-uuid', e.pasajero.token]]) {
    cuerpos.push(await (await pedir(e.url, id, token)).text());
  }
  for (const cuerpo of cuerpos) {
    for (const marca of ['imageStorageKey', 'chat-media', e.claveViaje, 'plus58express.sqlite', '/data/', 'C:\\']) {
      assert.ok(!cuerpo.includes(marca), `no debía filtrarse: ${marca}`);
    }
  }
});
