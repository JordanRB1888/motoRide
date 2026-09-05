import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** PNG mínimo con firma válida: el almacén comprueba los bytes, no el MIME. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'),
  Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), Buffer.from([0x1f, 0x15, 0xc4, 0x89])
]);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
// Un SVG con el MIME de un PNG: pasa el filtro del MIME pero NO la firma binaria.
const SVG_COMO_PNG = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;

/**
 * CHAT-PASSENGER-DRIVER-1: la conversacion del viaje, por socket, contra el
 * servidor real.
 *
 * LO QUE SE PROTEGE
 *
 * Que solo hablen los dos del viaje --ni otra pasajera, ni otro conductor, ni
 * nadie sin sesion, ni nadie escribiendo un `senderId` ajeno--; que un
 * reintento no duplique; que el historial sea el mismo tras reabrir y en el
 * mismo orden; que el mensaje llegue a los dos en el acto; y que un viaje
 * terminado siga leyendose pero deje de admitir mensajes, que es la politica
 * que el servidor ya tenia para el telefono.
 */

async function arrancarServidor(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-chat-'));
  const port = 28500 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'database.json'), JWT_SECRET: 'chat-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 8000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return `http://127.0.0.1:${port}`;
}

const json = { 'content-type': 'application/json' };
const respirar = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms));

async function login(url, identifier, password, role) {
  const r = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ identifier, password, role }) });
  assert.equal(r.status, 200);
  return (await r.json()).token;
}

async function registrarPasajera(url, n) {
  const r = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ email: `p.chat${n}@58express.com`, phone: `+58412000${8800 + n}`, password: 'password123', role: 'passenger', firstName: `Ana${n}`, lastName: 'Chat' })
  });
  const cuerpo = await r.json();
  return { id: cuerpo.user.id, token: cuerpo.token };
}

async function crearConductor(url, adminToken, n) {
  const r = await fetch(`${url}/api/admin/drivers`, {
    method: 'POST', headers: { ...json, authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ email: `d.chat${n}@58express.com`, phone: `+58414000${8800 + n}`, firstName: `Cho${n}`, lastName: 'Fer', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: `CH${n}A58` })
  });
  const cuenta = await r.json();
  const token = await login(url, `d.chat${n}@58express.com`, cuenta.temporaryPassword, 'driver');
  return { id: cuenta.user.id, token };
}

function abrirSocket(t, url, token) {
  const s = io(url, { auth: { token } });
  t.after(() => s.close());
  return new Promise(resolve => s.on('connect', () => resolve(s)));
}

/** Un viaje real, aceptado en linea, con los sockets de los dos abiertos. */
async function montarViaje(t, url) {
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const pasajera = await registrarPasajera(url, 1);
  const conductor = await crearConductor(url, adminToken, 1);

  const socketConductor = await abrirSocket(t, url, conductor.token);
  await new Promise(resolve => {
    socketConductor.on('driver:connected', () => {
      socketConductor.emit('driver:location', { latitude: 10.6428, longitude: -71.6126, heading: 0 });
      resolve();
    });
    socketConductor.emit('driver:connect', { userId: conductor.id, status: 'AVAILABLE' });
  });
  const socketPasajera = await abrirSocket(t, url, pasajera.token);

  const aceptado = new Promise(resolve => {
    socketConductor.on('rideRequested', oferta => { socketConductor.emit('rideAccepted', { tripId: oferta.id }); resolve(oferta.id); });
  });
  await respirar(120);
  const creacion = await fetch(`${url}/api/trips/create`, {
    method: 'POST', headers: { ...json, authorization: `Bearer ${pasajera.token}` },
    body: JSON.stringify({ id: 'chat_trip_1', pickup: { lat: 10.6427, lng: -71.6125 }, destination: { lat: 10.65, lng: -71.60 }, paymentMethod: 'efectivo', rideType: 'MOTO' })
  });
  assert.equal(creacion.status, 200);
  const tripId = await aceptado;
  await respirar();
  return { url, adminToken, pasajera, conductor, tripId, socketPasajera, socketConductor };
}

const historial = async (url, token, tripId) => {
  const r = await fetch(`${url}/api/trips/${tripId}/messages`, { headers: { authorization: `Bearer ${token}` } });
  return { status: r.status, cuerpo: r.status === 200 ? await r.json() : null };
};

const esperarMensaje = (socket, ms = 1500) => new Promise(resolve => {
  const corte = setTimeout(() => resolve(null), ms);
  socket.once('chat:message', m => { clearTimeout(corte); resolve(m); });
});
const esperarError = (socket, ms = 1500) => new Promise(resolve => {
  const corte = setTimeout(() => resolve(null), ms);
  socket.once('chat:error', e => { clearTimeout(corte); resolve(e); });
});

test('la pasajera escribe, el conductor lo ve en el acto, y al reves', async (t) => {
  const url = await arrancarServidor(t);
  const { pasajera, conductor, tripId, socketPasajera, socketConductor } = await montarViaje(t, url);

  const loVeElConductor = esperarMensaje(socketConductor);
  const acuse = esperarMensaje(socketPasajera);
  socketPasajera.emit('chat:send_message', { tripId, text: 'Ya estoy en la entrada', clientId: 'p-1' });

  const recibido = await loVeElConductor;
  assert.ok(recibido, 'al conductor no le llego nada');
  assert.equal(recibido.text, 'Ya estoy en la entrada');
  assert.equal(recibido.senderId, pasajera.id, 'la identidad tiene que ser la del token');
  assert.equal(recibido.clientId, 'p-1', 'la clave del intento vuelve, para casar el pendiente');
  assert.equal((await acuse)?.id, recibido.id, 'quien escribe recibe el mismo mensaje como acuse');
  assert.equal('imageStorageKey' in recibido, false, 'nada privado del almacen sale al cliente');

  const loVeLaPasajera = esperarMensaje(socketPasajera);
  socketConductor.emit('chat:send_message', { tripId, text: 'Voy llegando', clientId: 'd-1' });
  const respuesta = await loVeLaPasajera;
  assert.equal(respuesta?.text, 'Voy llegando');
  assert.equal(respuesta?.senderId, conductor.id);
});

test('el historial es el mismo para los dos, persiste y viene en orden', async (t) => {
  const url = await arrancarServidor(t);
  const { pasajera, conductor, tripId, socketPasajera, socketConductor } = await montarViaje(t, url);

  for (const [socket, text, clientId] of [[socketPasajera, 'uno', 'a'], [socketConductor, 'dos', 'b'], [socketPasajera, 'tres', 'c']]) {
    const llego = esperarMensaje(socketConductor);
    socket.emit('chat:send_message', { tripId, text, clientId });
    await llego;
  }

  const suyo = await historial(url, pasajera.token, tripId);
  const delOtro = await historial(url, conductor.token, tripId);
  assert.equal(suyo.status, 200);
  assert.deepEqual(suyo.cuerpo.map(m => m.text), ['uno', 'dos', 'tres'], 'el orden es el de la conversacion');
  assert.deepEqual(delOtro.cuerpo.map(m => m.id), suyo.cuerpo.map(m => m.id), 'los dos leen exactamente lo mismo');
  for (const m of suyo.cuerpo) assert.equal('imageStorageKey' in m, false);
});

test('un reintento con la misma clave NO duplica: vuelve el mismo mensaje', async (t) => {
  const url = await arrancarServidor(t);
  const { pasajera, tripId, socketPasajera, socketConductor } = await montarViaje(t, url);

  const primero = esperarMensaje(socketConductor);
  socketPasajera.emit('chat:send_message', { tripId, text: 'Ya estoy en la entrada', clientId: 'reintento-1' });
  const original = await primero;

  // El reintento de verdad: el mismo payload, como tras un corte.
  const segundo = esperarMensaje(socketConductor);
  socketPasajera.emit('chat:send_message', { tripId, text: 'Ya estoy en la entrada', clientId: 'reintento-1' });
  const repetido = await segundo;
  assert.equal(repetido?.id, original.id, 'el reintento tiene que devolver EL MISMO mensaje');

  const { cuerpo } = await historial(url, pasajera.token, tripId);
  assert.equal(cuerpo.filter(m => m.text === 'Ya estoy en la entrada').length, 1, 'se guardo dos veces');
});

test('sin clave, dos envios son dos mensajes: la clave es lo que reconoce el reintento', async (t) => {
  const url = await arrancarServidor(t);
  const { pasajera, tripId, socketPasajera, socketConductor } = await montarViaje(t, url);
  for (let i = 0; i < 2; i += 1) {
    const llego = esperarMensaje(socketConductor);
    socketPasajera.emit('chat:send_message', { tripId, text: 'hola' });
    await llego;
  }
  const { cuerpo } = await historial(url, pasajera.token, tripId);
  assert.equal(cuerpo.length, 2);
});

test('nadie ajeno al viaje escribe ni lee, y el senderId del payload se ignora', async (t) => {
  const url = await arrancarServidor(t);
  const { adminToken, pasajera, conductor, tripId, socketPasajera, socketConductor } = await montarViaje(t, url);

  const otraPasajera = await registrarPasajera(url, 2);
  const otroConductor = await crearConductor(url, adminToken, 2);
  const socketOtra = await abrirSocket(t, url, otraPasajera.token);
  const socketOtro = await abrirSocket(t, url, otroConductor.token);

  for (const [socket, quien] of [[socketOtra, 'otra pasajera'], [socketOtro, 'otro conductor']]) {
    const seColo = esperarMensaje(socketConductor, 600);
    const negativa = esperarError(socket);
    socket.emit('chat:send_message', { tripId, text: 'me colo', clientId: 'x' });
    assert.equal((await negativa)?.error, 'FORBIDDEN', `${quien} no recibio FORBIDDEN`);
    assert.equal(await seColo, null, `${quien} consiguio escribir en un viaje ajeno`);
  }

  // Escribir un `senderId` ajeno no cambia quien firma: sale del token.
  const llego = esperarMensaje(socketConductor);
  socketPasajera.emit('chat:send_message', { tripId, text: 'soy yo', clientId: 's', senderId: conductor.id });
  assert.equal((await llego)?.senderId, pasajera.id, 'el payload suplanto la identidad');

  // Ni leer: 403 para los ajenos, 401 sin sesion, 404 con un id inventado.
  assert.equal((await historial(url, otraPasajera.token, tripId)).status, 403);
  assert.equal((await historial(url, otroConductor.token, tripId)).status, 403);
  assert.equal((await fetch(`${url}/api/trips/${tripId}/messages`)).status, 401);
  assert.equal((await historial(url, pasajera.token, 'trip_que_no_existe')).status, 404);

  // Un tripId manipulado por socket tampoco pasa.
  const negativa = esperarError(socketPasajera);
  socketPasajera.emit('chat:send_message', { tripId: 'trip_que_no_existe', text: 'hola', clientId: 'y' });
  assert.equal((await negativa)?.error, 'FORBIDDEN');
});

test('vacio se rechaza con motivo y el texto se recorta al tope', async (t) => {
  const url = await arrancarServidor(t);
  const { tripId, socketPasajera, socketConductor } = await montarViaje(t, url);

  const negativa = esperarError(socketPasajera);
  socketPasajera.emit('chat:send_message', { tripId, text: '   ', clientId: 'v' });
  assert.equal((await negativa)?.error, 'EMPTY_MESSAGE', 'el vacio se tragaba en silencio');

  const llego = esperarMensaje(socketConductor);
  socketPasajera.emit('chat:send_message', { tripId, text: 'x'.repeat(5000), clientId: 'largo' });
  assert.equal((await llego)?.text.length, 1000, 'el tope del servidor son mil caracteres');
});

test('con el viaje terminado el historial se lee, pero ya no se escribe', async (t) => {
  const url = await arrancarServidor(t);
  const { pasajera, tripId, socketPasajera, socketConductor } = await montarViaje(t, url);

  const llego = esperarMensaje(socketConductor);
  socketPasajera.emit('chat:send_message', { tripId, text: 'antes de terminar', clientId: 'a' });
  await llego;

  for (const estado of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    socketConductor.emit('tripStatusUpdated', { tripId, status: estado });
    await respirar(300);
  }

  // Se sigue leyendo: es el registro del viaje.
  const { status, cuerpo } = await historial(url, pasajera.token, tripId);
  assert.equal(status, 200);
  assert.deepEqual(cuerpo.map(m => m.text), ['antes de terminar']);

  // Pero ya no se escribe: la misma politica que el telefono del conductor.
  const seColo = esperarMensaje(socketConductor, 600);
  const negativa = esperarError(socketPasajera);
  socketPasajera.emit('chat:send_message', { tripId, text: 'tarde', clientId: 'z' });
  assert.equal((await negativa)?.error, 'CHAT_CLOSED');
  assert.equal(await seColo, null, 'entro un mensaje en un viaje terminado');
});

// ---------------------------------------------------------------------------
// CHAT-2: imágenes privadas del viaje
// ---------------------------------------------------------------------------

const contenido = (url, mediaId, token) =>
  fetch(`${url}/api/chat-media/${mediaId}/content`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

test('una imagen del chat es privada del viaje: la ven los dos, nadie más, y la clave del almacén no sale', async (t) => {
  const url = await arrancarServidor(t);
  const { pasajera, conductor, tripId, socketPasajera, socketConductor } = await montarViaje(t, url);
  const otra = await registrarPasajera(url, 2);

  const loVe = esperarMensaje(socketConductor);
  socketPasajera.emit('chat:send_message', { tripId, image: PNG_URL, clientId: 'img-1' });
  const recibido = await loVe;
  assert.ok(recibido, 'la imagen no le llegó al conductor');
  assert.ok(recibido.imageRef && typeof recibido.imageRef.id === 'string', 'falta la referencia pública');
  assert.equal(recibido.imageRef.mimeType, 'image/png');
  assert.deepEqual(Object.keys(recibido.imageRef).sort(), ['id', 'mimeType'], 'la referencia trae más de lo debido');
  assert.equal('imageStorageKey' in recibido, false, 'la clave del almacén salió al cliente');

  const mediaId = recibido.imageRef.id;
  // Los dos del viaje la ven.
  assert.equal((await contenido(url, mediaId, pasajera.token)).status, 200);
  assert.equal((await contenido(url, mediaId, conductor.token)).status, 200);
  // Nadie más: ajena, sin sesión y clave inventada responden sin filtrar nada.
  assert.equal((await contenido(url, mediaId, otra.token)).status, 403);
  assert.equal((await contenido(url, mediaId, null)).status, 401);
  assert.equal((await contenido(url, 'media_inventado', pasajera.token)).status, 403);

  // Reabrir: la imagen sigue en el historial, con su referencia y sin la clave.
  const { cuerpo } = await historial(url, pasajera.token, tripId);
  const conImagen = cuerpo.find(m => m.imageRef);
  assert.ok(conImagen, 'la imagen no quedó en el historial');
  assert.equal('imageStorageKey' in conImagen, false);
});

test('el formato de la imagen lo decide el contenido: un SVG disfrazado de PNG se rechaza', async (t) => {
  const url = await arrancarServidor(t);
  const { tripId, socketPasajera, socketConductor } = await montarViaje(t, url);

  const seColo = esperarMensaje(socketConductor, 800);
  const negativa = esperarError(socketPasajera);
  socketPasajera.emit('chat:send_message', { tripId, image: SVG_COMO_PNG, clientId: 'svg-1' });
  const e = await negativa;
  assert.ok(e && ['INVALID_CHAT_IMAGE', 'INVALID_FILE_TYPE'].includes(e.error), `motivo inesperado: ${e && e.error}`);
  assert.equal(await seColo, null, 'un SVG disfrazado llegó a la contraparte');
});

test('con el viaje terminado la imagen de antes se sigue viendo, pero no entran nuevas', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId, socketPasajera, socketConductor } = await montarViaje(t, url);

  const loVe = esperarMensaje(socketConductor);
  socketPasajera.emit('chat:send_message', { tripId, image: PNG_URL, clientId: 'img-2' });
  const mediaId = (await loVe).imageRef.id;

  for (const estado of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    socketConductor.emit('tripStatusUpdated', { tripId, status: estado });
    await respirar(300);
  }

  // La imagen de antes sigue siendo legible para los participantes: es el registro.
  assert.equal((await contenido(url, mediaId, conductor.token)).status, 200);
  // Pero no se suben nuevas: misma política que el texto.
  const negativa = esperarError(socketPasajera);
  socketPasajera.emit('chat:send_message', { tripId, image: PNG_URL, clientId: 'img-3' });
  assert.equal((await negativa)?.error, 'CHAT_CLOSED');
});
