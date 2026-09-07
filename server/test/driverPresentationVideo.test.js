import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EL VÍDEO DE PRESENTACIÓN: PRIVADO, VALIDADO Y SERVIDO POR TRAMOS
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que la cara de una persona no acabe siendo pública. El vídeo se guarda en
 *    el almacén privado y sólo lo ven su dueño y administración; un tercero no
 *    puede ni confirmar que existe.
 * 2. Que lo que se guarda sea lo que dice ser. El tipo lo manda el cliente; la
 *    firma binaria se comprueba aquí, y la duración se lee del propio fichero.
 * 3. Que reproducirlo no exija tragarse cincuenta megas: se sirve por tramos,
 *    y cada tramo pasa por la misma autorización que el fichero entero.
 * 4. Que reemplazarlo no deje basura en el disco.
 */

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOTO_DOCS = ['identity_front', 'identity_back', 'rif', 'driver_license', 'medical_certificate', 'vehicle_registration', 'vehicle_front', 'vehicle_rear', 'plate_photo', 'driver_selfie', 'moto_helmets'];
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);

// --- Un MP4 de verdad, armado a mano ---------------------------------------
const caja = (tipo, cuerpo) => {
  const c = Buffer.concat([Buffer.alloc(4), Buffer.from(tipo, 'latin1'), cuerpo]);
  c.writeUInt32BE(c.length, 0);
  return c;
};
const mvhd = segundos => {
  const cuerpo = Buffer.alloc(100);
  cuerpo.writeUInt32BE(0, 0);          // versión 0 y banderas
  cuerpo.writeUInt32BE(600, 12);       // escala de tiempo
  cuerpo.writeUInt32BE(600 * segundos, 16);
  return caja('mvhd', cuerpo);
};
const mp4De = (segundos, relleno = 4096) => Buffer.concat([
  caja('ftyp', Buffer.from('isomiso2avc1mp41', 'latin1')),
  caja('moov', mvhd(segundos)),
  caja('mdat', Buffer.alloc(relleno, 7))
]);

// --- Ficheros con la firma correcta y la duración fuera de alcance ---------
//
// Los tres pasan la comprobación de firma --empiezan por un `ftyp` de verdad--
// pero no hay forma de saber cuánto duran. Un fichero así no se guarda.
const ftyp = caja('ftyp', Buffer.from('isomiso2avc1mp41', 'latin1'));
const mdat = (relleno = 4096) => caja('mdat', Buffer.alloc(relleno, 7));

/** Sin `moov`: sólo datos, sin ninguna cabecera que leer. */
const mp4SinMoov = () => Buffer.concat([ftyp, mdat()]);

/** Con `moov`, pero la duración de la película viene a cero. */
const mp4ConDuracionCero = () => Buffer.concat([ftyp, caja('moov', mvhd(0)), mdat()]);

/** Con `moov`, pero la duración está marcada como desconocida por el formato. */
const mp4ConDuracionDesconocida = () => {
  const cuerpo = Buffer.alloc(100);
  cuerpo.writeUInt32BE(0, 0);
  cuerpo.writeUInt32BE(600, 12);
  cuerpo.writeUInt32BE(0xffffffff, 16);
  return Buffer.concat([ftyp, caja('moov', caja('mvhd', cuerpo)), mdat()]);
};

const ficherosMp4 = uploads => fs.readdirSync(uploads, { recursive: true }).map(String).filter(nombre => nombre.endsWith('.mp4'));

async function start(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'plus58-video-'));
  // Bloque propio (21500-21898): testPortRanges.test.js vigila que no se solape.
  const port = 21500 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(dir, 'db.sqlite'), UPLOAD_DIR: path.join(dir, 'uploads'), JWT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server timeout')), 15000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timer); resolve(); } });
    child.once('exit', code => reject(new Error(`exit ${code}`)));
  });
  return { api: `http://127.0.0.1:${port}/api`, uploads: path.join(dir, 'uploads') };
}

const json = (token, body, method = 'POST') => ({ method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const auth = token => ({ headers: { authorization: `Bearer ${token}` } });

function applicantForm(overrides = {}) {
  const form = new FormData();
  Object.entries({
    servicesAppliedFor: 'PASSENGER_TRANSPORT',
    firstName: 'Nora', lastName: 'Aspirante', identityNumber: 'V-17.222.333', rif: 'V-17222333-4',
    birthDate: '1991-06-05', phone: '+584127779000', email: 'nora.video@example.com', password: 'ClaveSegura123',
    address: 'Avenida Bella Vista, Maracaibo', city: 'Maracaibo', region: 'Zulia',
    vehicleType: 'MOTO', vehicleBrand: 'Bera', vehicleModel: 'SBR', vehicleYear: '2023', vehicleColor: 'Negro', vehiclePlate: 'VID001',
    licenseGrade: '2', licenseExpiration: '2028-06-30',
    ...overrides
  }).forEach(([key, value]) => { if (value !== undefined) form.append(key, value); });
  return form;
}

async function subirVideo(api, token, { cuerpo = mp4De(12), mime = 'video/mp4', nombre = 'presentacion.mp4' } = {}) {
  const form = new FormData();
  form.append('file', new Blob([cuerpo], { type: mime }), nombre);
  return fetch(`${api}/driver-applications/me/video`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form });
}

async function crearPostulante(api, overrides = {}) {
  const respuesta = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm(overrides) });
  assert.equal(respuesta.status, 201);
  return respuesta.json();
}

const videoDe = solicitud => solicitud.documents.find(item => item.type === 'presentation_video');

// ---------------------------------------------------------------------------
// Lo que se acepta y lo que no
// ---------------------------------------------------------------------------

test('un MP4 de verdad se guarda, y lo que no lo es se rechaza sin tocar el disco', async t => {
  const { api, uploads } = await start(t);
  const { token } = await crearPostulante(api);

  // Un texto renombrado a `.mp4`: el tipo cuela por la puerta, los bytes no.
  const disfrazado = await subirVideo(api, token, { cuerpo: Buffer.from('esto no es un vídeo, es texto plano con relleno de sobra') });
  assert.equal(disfrazado.status, 415);
  assert.equal((await disfrazado.json()).error, 'INVALID_FILE_TYPE');

  // Un tipo que no admitimos, aunque el fichero sea válido.
  const webm = await subirVideo(api, token, { mime: 'video/webm', nombre: 'presentacion.webm' });
  assert.equal(webm.status, 415);
  assert.deepEqual((await webm.json()).accepted, ['video/mp4', 'video/quicktime']);

  // Una foto por la ruta del vídeo: tampoco.
  const foto = await subirVideo(api, token, { cuerpo: png, mime: 'image/png', nombre: 'foto.png' });
  assert.equal(foto.status, 415);

  // Más largo de lo permitido: se mide EN EL FICHERO, no en lo que diga nadie.
  const largo = await subirVideo(api, token, { cuerpo: mp4De(95) });
  assert.equal(largo.status, 400);
  const detalle = await largo.json();
  assert.equal(detalle.error, 'VIDEO_TOO_LONG');
  assert.equal(detalle.maxSeconds, 30);
  assert.equal(detalle.seconds, 95);

  // Nada de lo anterior dejó un solo fichero en el almacén.
  const enDisco = fs.existsSync(uploads) ? fs.readdirSync(uploads, { recursive: true }).map(String).filter(nombre => /\.(mp4|mov|png|webm)$/.test(nombre)) : [];
  assert.deepEqual(enDisco, [], 'un rechazo dejó basura en el disco');

  // Y el bueno sí entra.
  const bueno = await subirVideo(api, token);
  assert.equal(bueno.status, 200);
  const solicitud = await bueno.json();
  const video = videoDe(solicitud);
  assert.ok(video, 'el vídeo quedó en el expediente');
  assert.equal(video.type, 'presentation_video');
  assert.equal(solicitud.missingDocuments.includes('presentation_video'), false);
});

test('el vídeo cuenta como documento obligatorio en la versión 3, y no en las anteriores', async t => {
  const { api } = await start(t);
  const { token, application } = await crearPostulante(api);
  assert.equal(application.requirementsVersion, 3);
  assert.ok(application.missingDocuments.includes('presentation_video'));

  for (const type of MOTO_DOCS) {
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), `${type}.png`);
    assert.equal((await fetch(`${api}/driver-applications/me/documents/${type}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form })).status, 200, type);
  }

  // Con las once fotos pero sin vídeo, el envío no procede y dice qué falta.
  const sinVideo = await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) });
  assert.equal(sinVideo.status, 400);
  assert.deepEqual((await sinVideo.json()).missing, ['presentation_video']);

  assert.equal((await subirVideo(api, token)).status, 200);
  const enviado = await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) });
  assert.equal(enviado.status, 200);
  assert.equal((await enviado.json()).status, 'pending');
});

// ---------------------------------------------------------------------------
// Quién puede verlo
// ---------------------------------------------------------------------------

test('el vídeo es privado: anónimo 401, tercero 404, dueño y administración 200', async t => {
  const { api } = await start(t);
  const { token } = await crearPostulante(api);
  assert.equal((await subirVideo(api, token)).status, 200);
  const solicitud = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  const video = videoDe(solicitud);
  const ruta = `${api}/driver-documents/${video.id}/content`;

  const anonimo = await fetch(ruta);
  assert.equal(anonimo.status, 401);

  const otro = await (await fetch(`${api}/auth/register`, json(null, { email: 'curioso@example.com', phone: '+584120009999', password: 'ClaveSegura123', role: 'passenger', firstName: 'Curioso', lastName: 'Ajeno' }))).json();
  const ajeno = await fetch(ruta, auth(otro.token));
  // 404, no 403: un tercero no puede ni confirmar que el vídeo existe.
  assert.equal(ajeno.status, 404);

  const propio = await fetch(ruta, auth(token));
  assert.equal(propio.status, 200);
  assert.equal(propio.headers.get('content-type'), 'video/mp4');
  assert.equal(propio.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(propio.headers.get('accept-ranges'), 'bytes');
  assert.equal(propio.headers.get('x-content-type-options'), 'nosniff');

  const admin = await (await fetch(`${api}/auth/login`, json(null, { identifier: 'admin@58express.com', password: 'admin' }))).json();
  const deAdmin = await fetch(ruta, auth(admin.token));
  assert.equal(deAdmin.status, 200);
  assert.equal((await deAdmin.arrayBuffer()).byteLength, video.size);
});

// ---------------------------------------------------------------------------
// Reproducir por tramos
// ---------------------------------------------------------------------------

test('un tramo válido devuelve 206 con su Content-Range, y el contenido es el correcto', async t => {
  const { api } = await start(t);
  const { token } = await crearPostulante(api);
  const original = mp4De(12);
  assert.equal((await subirVideo(api, token, { cuerpo: original })).status, 200);
  const solicitud = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  const ruta = `${api}/driver-documents/${videoDe(solicitud).id}/content`;

  const primerTrozo = await fetch(ruta, { headers: { authorization: `Bearer ${token}`, range: 'bytes=0-99' } });
  assert.equal(primerTrozo.status, 206);
  assert.equal(primerTrozo.headers.get('content-range'), `bytes 0-99/${original.length}`);
  assert.equal(primerTrozo.headers.get('content-length'), '100');
  const bytes = Buffer.from(await primerTrozo.arrayBuffer());
  assert.equal(bytes.length, 100);
  assert.ok(bytes.equals(original.subarray(0, 100)), 'el tramo servido no coincide con el fichero');

  // Un rango abierto llega hasta el final.
  const desdeLaMitad = await fetch(ruta, { headers: { authorization: `Bearer ${token}`, range: 'bytes=100-' } });
  assert.equal(desdeLaMitad.status, 206);
  assert.equal(desdeLaMitad.headers.get('content-range'), `bytes 100-${original.length - 1}/${original.length}`);

  // Y los últimos bytes, que es como algunos reproductores buscan el índice.
  const ultimos = await fetch(ruta, { headers: { authorization: `Bearer ${token}`, range: 'bytes=-50' } });
  assert.equal(ultimos.status, 206);
  assert.equal(ultimos.headers.get('content-range'), `bytes ${original.length - 50}-${original.length - 1}/${original.length}`);
});

test('un rango imposible es 416, y uno que no se entiende sirve el fichero entero', async t => {
  const { api } = await start(t);
  const { token } = await crearPostulante(api);
  const original = mp4De(12);
  assert.equal((await subirVideo(api, token, { cuerpo: original })).status, 200);
  const solicitud = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  const ruta = `${api}/driver-documents/${videoDe(solicitud).id}/content`;

  const masAlla = await fetch(ruta, { headers: { authorization: `Bearer ${token}`, range: `bytes=${original.length + 1000}-` } });
  assert.equal(masAlla.status, 416);
  assert.equal(masAlla.headers.get('content-range'), `bytes */${original.length}`);

  const alReves = await fetch(ruta, { headers: { authorization: `Bearer ${token}`, range: 'bytes=500-100' } });
  assert.equal(alReves.status, 416);

  // Una cabecera con la que no se puede hacer nada se ignora: el estándar dice
  // que se sirva el recurso completo, no que se falle.
  for (const cabecera of ['pepinillos', 'bytes=abc-def', 'items=0-10', 'bytes=0-10, 20-30']) {
    const rara = await fetch(ruta, { headers: { authorization: `Bearer ${token}`, range: cabecera } });
    assert.equal(rara.status, 200, `«${cabecera}» debería servir el fichero entero`);
    assert.equal(rara.headers.get('content-length'), String(original.length));
  }
});

test('pedir un tramo no es una puerta de servicio: sigue exigiendo sesión', async t => {
  const { api } = await start(t);
  const { token } = await crearPostulante(api);
  assert.equal((await subirVideo(api, token)).status, 200);
  const solicitud = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  const ruta = `${api}/driver-documents/${videoDe(solicitud).id}/content`;

  const anonimoConRango = await fetch(ruta, { headers: { range: 'bytes=0-99' } });
  assert.equal(anonimoConRango.status, 401);
  assert.equal(anonimoConRango.headers.get('content-range'), null, 'una respuesta denegada no revela el tamaño');

  const otro = await (await fetch(`${api}/auth/register`, json(null, { email: 'otro.rango@example.com', phone: '+584120007777', password: 'ClaveSegura123', role: 'passenger', firstName: 'Otro', lastName: 'Rango' }))).json();
  const ajenoConRango = await fetch(ruta, { headers: { authorization: `Bearer ${otro.token}`, range: 'bytes=0-99' } });
  assert.equal(ajenoConRango.status, 404);
});

// ---------------------------------------------------------------------------
// Reemplazar y corregir
// ---------------------------------------------------------------------------

test('reemplazar el vídeo deja uno solo, y el anterior desaparece del disco', async t => {
  const { api, uploads } = await start(t);
  const { token } = await crearPostulante(api);
  assert.equal((await subirVideo(api, token, { cuerpo: mp4De(10, 2048) })).status, 200);

  const primero = videoDe(await (await fetch(`${api}/driver-applications/me`, auth(token))).json());
  const ficherosTrasElPrimero = fs.readdirSync(uploads, { recursive: true }).map(String).filter(nombre => nombre.endsWith('.mp4'));
  assert.equal(ficherosTrasElPrimero.length, 1);

  assert.equal((await subirVideo(api, token, { cuerpo: mp4De(20, 8192) })).status, 200);
  const solicitud = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  const videos = solicitud.documents.filter(item => item.type === 'presentation_video');
  assert.equal(videos.length, 1, 'reemplazar no duplica');
  assert.equal(videos[0].id, primero.id, 'sigue siendo el mismo documento del expediente');
  assert.notEqual(videos[0].size, primero.size, 'el nuevo es el que manda');

  const ficherosAlFinal = fs.readdirSync(uploads, { recursive: true }).map(String).filter(nombre => nombre.endsWith('.mp4'));
  assert.equal(ficherosAlFinal.length, 1, 'el vídeo viejo se quedó en el disco');
});

test('administración puede pedir que se repita el vídeo, con su motivo', async t => {
  const { api } = await start(t);
  const { token, application } = await crearPostulante(api);
  for (const type of MOTO_DOCS) {
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), `${type}.png`);
    assert.equal((await fetch(`${api}/driver-applications/me/documents/${type}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form })).status, 200);
  }
  assert.equal((await subirVideo(api, token)).status, 200);
  assert.equal((await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) })).status, 200);

  const admin = await (await fetch(`${api}/auth/login`, json(null, { identifier: 'admin@58express.com', password: 'admin' }))).json();
  const decision = await fetch(`${api}/admin/driver-applications/${application.id}/decision`, json(admin.token, {
    action: 'needs_changes',
    reason: 'Revisa tu presentación.',
    requestedChanges: [{ type: 'presentation_video', reason: 'No se te oye: grábalo en un sitio sin ruido.' }]
  }, 'PATCH'));
  assert.equal(decision.status, 200);

  // El titular ve QUÉ repetir y POR QUÉ, con el mismo sistema de siempre.
  const propia = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  assert.equal(propia.status, 'needs_changes');
  assert.deepEqual(propia.requestedChangeDetails, [
    { type: 'presentation_video', reason: 'No se te oye: grábalo en un sitio sin ruido.' }
  ]);

  // Y al volver a grabarlo, la corrección queda atendida.
  const repetido = await subirVideo(api, token, { cuerpo: mp4De(15) });
  assert.equal(repetido.status, 200);
  const tras = await repetido.json();
  assert.deepEqual(tras.requestedChangeDetails, []);
  assert.equal(tras.status, 'draft');
  assert.equal((await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) })).status, 200);
});

test('en revisión no se puede cambiar el vídeo', async t => {
  const { api } = await start(t);
  const { token } = await crearPostulante(api);
  for (const type of MOTO_DOCS) {
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), `${type}.png`);
    await fetch(`${api}/driver-applications/me/documents/${type}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form });
  }
  assert.equal((await subirVideo(api, token)).status, 200);
  assert.equal((await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) })).status, 200);

  const bloqueado = await subirVideo(api, token, { cuerpo: mp4De(20) });
  assert.equal(bloqueado.status, 409);
  assert.equal((await bloqueado.json()).error, 'APPLICATION_LOCKED');
});

test('sin expediente no hay dónde guardar un vídeo', async t => {
  const { api } = await start(t);
  const sola = await (await fetch(`${api}/auth/register`, json(null, { email: 'sinexpediente@example.com', phone: '+584120006666', password: 'ClaveSegura123', role: 'passenger', firstName: 'Sin', lastName: 'Expediente' }))).json();
  const respuesta = await subirVideo(api, sola.token);
  assert.equal(respuesta.status, 404);
  assert.equal((await respuesta.json()).error, 'APPLICATION_NOT_FOUND');
});

// ---------------------------------------------------------------------------
// La duración la certifica el servidor, o no se guarda
// ---------------------------------------------------------------------------

test('un vídeo que no se deja medir se rechaza, y no toca el disco', async t => {
  const { api, uploads } = await start(t);
  const { token } = await crearPostulante(api);

  // Los tres tienen la firma de un MP4 y ninguno dice cuánto dura.
  for (const [nombre, cuerpo] of [
    ['sin moov', mp4SinMoov()],
    ['duración cero', mp4ConDuracionCero()],
    ['duración desconocida', mp4ConDuracionDesconocida()]
  ]) {
    const respuesta = await subirVideo(api, token, { cuerpo });
    assert.equal(respuesta.status, 422, nombre);
    const detalle = await respuesta.json();
    assert.equal(detalle.error, 'VIDEO_DURATION_UNVERIFIABLE', nombre);
    assert.equal(detalle.maxSeconds, 30, nombre);
  }

  // Nada de eso llegó al almacén privado.
  assert.deepEqual(ficherosMp4(uploads), [], 'un rechazo no deja fichero en disco');
  const solicitud = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  assert.equal(solicitud.documents.filter(item => item.type === 'presentation_video').length, 0);
});

test('un fichero manipulado --cajas que se salen del final-- tampoco se mide', async t => {
  const { api, uploads } = await start(t);
  const { token } = await crearPostulante(api);

  // Un MP4 correcto al que se le infla el tamaño declarado del `moov` para que
  // se solape con lo que viene detrás. Dentro sigue habiendo un `mvhd` legible,
  // pero la estructura ya no cuadra y no sabemos a qué corresponde.
  const cuerpo = mp4De(10);
  const posicion = cuerpo.indexOf(Buffer.from('moov', 'latin1')) - 4;
  cuerpo.writeUInt32BE(cuerpo.readUInt32BE(posicion) * 4, posicion);

  const respuesta = await subirVideo(api, token, { cuerpo });
  assert.equal(respuesta.status, 422);
  assert.equal((await respuesta.json()).error, 'VIDEO_DURATION_UNVERIFIABLE');
  assert.deepEqual(ficherosMp4(uploads), []);
});

test('mandan los bytes, no lo que diga el cliente: ni para rechazar ni para aceptar', async t => {
  const { api } = await start(t);
  const { token } = await crearPostulante(api);

  // El cliente jura que son diez segundos; el fichero dice treinta y cinco.
  const largo = await fetch(`${api}/driver-applications/me/video`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: (() => {
      const form = new FormData();
      form.append('durationSeconds', '10');
      form.append('file', new Blob([mp4De(35)], { type: 'video/mp4' }), 'presentacion.mp4');
      return form;
    })()
  });
  assert.equal(largo.status, 400, 'la palabra del cliente no salva un vídeo largo');
  const detalle = await largo.json();
  assert.equal(detalle.error, 'VIDEO_TOO_LONG');
  assert.equal(detalle.seconds, 35, 'los segundos que se reportan son los del fichero');

  // Y al revés: el cliente dice sesenta, el fichero dice veinte. Se guarda.
  const corto = await fetch(`${api}/driver-applications/me/video`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: (() => {
      const form = new FormData();
      form.append('durationSeconds', '60');
      form.append('file', new Blob([mp4De(20)], { type: 'video/mp4' }), 'presentacion.mp4');
      return form;
    })()
  });
  assert.equal(corto.status, 200, 'un vídeo corto no se rechaza porque el cliente se equivoque');
  const guardado = videoDe(await corto.json());
  assert.equal(guardado.durationSeconds, 20, 'la duración guardada es la medida, no la declarada');
});

test('un reemplazo rechazado deja intacto el vídeo que ya estaba', async t => {
  const { api, uploads } = await start(t);
  const { token } = await crearPostulante(api);

  assert.equal((await subirVideo(api, token, { cuerpo: mp4De(12, 2048) })).status, 200);
  const bueno = videoDe(await (await fetch(`${api}/driver-applications/me`, auth(token))).json());
  const ficheros = ficherosMp4(uploads);
  assert.equal(ficheros.length, 1);

  // Dos intentos que el servidor no puede certificar.
  assert.equal((await subirVideo(api, token, { cuerpo: mp4SinMoov() })).status, 422);
  assert.equal((await subirVideo(api, token, { cuerpo: mp4De(95) })).status, 400);

  // El de antes sigue ahí, con su mismo fichero, y se puede seguir viendo.
  const despues = videoDe(await (await fetch(`${api}/driver-applications/me`, auth(token))).json());
  assert.equal(despues.id, bueno.id);
  assert.equal(despues.size, bueno.size);
  assert.equal(despues.durationSeconds, 12);
  assert.deepEqual(ficherosMp4(uploads), ficheros, 'ni se borró el bueno ni se coló uno nuevo');

  const contenido = await fetch(`${api}/driver-documents/${bueno.id}/content`, auth(token));
  assert.equal(contenido.status, 200);
});
