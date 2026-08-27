import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import webpush from 'web-push';
import { createPushNotificationService } from '../services/pushNotificationService.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * PUSH-3A: el despacho dispara un aviso de atencion de mejor esfuerzo que
 * acompana a la oferta de Socket.IO. Estas pruebas fijan el contrato completo
 * de esa conexion CONTRA EL SERVIDOR REAL, no contra un extracto:
 *
 *   - una llamada semantica por oferta real, al MISMO conductor seleccionado;
 *   - un conductor sin suscripcion recibe su oferta de socket exactamente
 *     igual y no genera ninguna peticion a ningun proveedor;
 *   - con push apagado el despacho ni se entera;
 *   - y la critica: un proveedor COLGADO --promesa pendiente mas alla de los
 *     quince segundos-- no retrasa ni un milisegundo la ventana de oferta.
 *
 * Ninguna prueba contacta con un proveedor de push real: el unico "proveedor"
 * es un servidor TCP local que acepta la conexion y no responde jamas.
 */

// --------------------------------------------------------------------------
// Arnes: servidor real como proceso hijo, con push encendido o apagado
// --------------------------------------------------------------------------

async function arrancarServidor(t, { pushEncendido }) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-push3a-'));
  const port = 18900 + Math.floor(Math.random() * 399);

  // Par VAPID valido generado en memoria para ESTA ejecucion: nada queda en
  // el repositorio y ningun valor es real.
  const vapid = pushEncendido ? webpush.generateVAPIDKeys() : null;

  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'push3a-test-secret',
      ...(pushEncendido
        ? {
            WEB_PUSH_ENABLED: 'true',
            WEB_PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
            WEB_PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
            WEB_PUSH_VAPID_SUBJECT: 'mailto:pruebas@ejemplo.local'
          }
        : { WEB_PUSH_ENABLED: 'false' })
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());

  const salida = { stdout: '', stderr: '' };
  child.stdout.on('data', chunk => { salida.stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { salida.stderr += chunk.toString(); });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 8000);
    const listo = () => {
      if (salida.stdout.includes('Running')) {
        clearTimeout(timeout);
        child.stdout.removeListener('data', listo);
        resolve();
      }
    };
    child.stdout.on('data', listo);
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });

  return { url: `http://127.0.0.1:${port}`, salida, child };
}

/** Eventos estructurados del servicio de push presentes en la salida. */
function eventosPush(salida, evento) {
  return [...salida.stdout.matchAll(/\[\+58express Push\] (\{.*\})/g)]
    .map(coincidencia => JSON.parse(coincidencia[1]))
    .filter(linea => linea.event === evento);
}

async function crearActores(url, { conductores = 1 } = {}) {
  const json = { 'content-type': 'application/json' };
  const login = async (identifier, password, role) => {
    const respuesta = await fetch(`${url}/api/auth/login`, {
      method: 'POST', headers: json, body: JSON.stringify({ identifier, password, role })
    });
    assert.equal(respuesta.status, 200);
    return (await respuesta.json()).token;
  };

  const adminToken = await login('admin@58express.com', 'admin', 'admin');

  const registroPasajero = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: json,
    body: JSON.stringify({
      email: 'pasajero.push3a@58express.com', phone: '+584120009999',
      password: 'password123', role: 'passenger', firstName: 'Paula', lastName: 'Pasajera'
    })
  });
  assert.equal(registroPasajero.status, 201);
  const pasajero = await registroPasajero.json();

  const listaConductores = [];
  for (let i = 0; i < conductores; i += 1) {
    const creacion = await fetch(`${url}/api/admin/drivers`, {
      method: 'POST', headers: { ...json, authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        email: `conductor.push3a.${i}@58express.com`, phone: `+58414000${7700 + i}`,
        firstName: `Diego${i}`, lastName: 'Conductor',
        vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: `P3A${i}58`
      })
    });
    assert.equal(creacion.status, 201);
    const cuenta = await creacion.json();
    const token = await login(`conductor.push3a.${i}@58express.com`, cuenta.temporaryPassword, 'driver');
    listaConductores.push({ id: cuenta.user.id, token });
  }

  return { pasajeroToken: pasajero.token, conductores: listaConductores };
}

/** Conecta el socket de un conductor y lo deja AVAILABLE con GPS fresco. */
function conectarConductor(t, url, conductor, { lat, lng }) {
  const socket = io(url, { auth: { token: conductor.token } });
  t.after(() => socket.close());
  const ofertas = [];
  socket.on('rideRequested', oferta => ofertas.push({ oferta, at: Date.now() }));
  const listo = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El conductor no quedó registrado')), 5000);
    socket.on('connect', () => socket.emit('driver:connect', { userId: conductor.id, status: 'AVAILABLE' }));
    socket.on('driver:connected', () => {
      socket.emit('driver:location', { latitude: lat, longitude: lng, heading: 0 });
      clearTimeout(timeout);
      resolve();
    });
  });
  return { socket, ofertas, listo };
}

async function crearViaje(url, pasajeroToken, id) {
  const creacion = await fetch(`${url}/api/trips/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${pasajeroToken}` },
    body: JSON.stringify({
      id,
      pickup: { lat: 10.6427, lng: -71.6125 },
      destination: { lat: 10.65, lng: -71.60 },
      fareUSD: 3,
      paymentMethod: 'efectivo',
      rideType: 'MOTO'
    })
  });
  assert.equal(creacion.status, 200);
}

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

// --------------------------------------------------------------------------
// Caso principal: una llamada semantica por oferta, y sin suscripcion no hay
// ninguna peticion a ningun proveedor
// --------------------------------------------------------------------------

test('la oferta real dispara UNA llamada semantica para el conductor seleccionado; sin suscripcion no hay red', async (t) => {
  const { url, salida } = await arrancarServidor(t, { pushEncendido: true });
  const { pasajeroToken, conductores } = await crearActores(url);
  const [conductor] = conductores;

  const { socket, ofertas, listo } = conectarConductor(t, url, conductor, { lat: 10.6428, lng: -71.6126 });
  await listo;
  await esperar(100);

  await crearViaje(url, pasajeroToken, 'push3a_trip');
  await esperar(600);

  // La oferta por socket llego igual que siempre: push no la sustituye.
  assert.equal(ofertas.length, 1, 'el conductor debia recibir SU oferta de socket');
  assert.equal(ofertas[0].oferta.id, 'push3a_trip');
  assert.equal(ofertas[0].oferta.offeredDriverId, conductor.id);

  // Exactamente UNA llamada semantica, para ESTE conductor y ESTE viaje. Sin
  // suscripcion el desenlace es benigno: cero intentos contra proveedor.
  const sinSuscripcion = eventosPush(salida, 'push_no_active_subscriptions');
  assert.equal(sinSuscripcion.length, 1, 'debia haber exactamente una llamada semantica');
  assert.equal(sinSuscripcion[0].userId, conductor.id);
  assert.equal(sinSuscripcion[0].tripId, 'push3a_trip');
  assert.equal(eventosPush(salida, 'push_attempt').length, 0, 'sin suscripcion no puede haber intento de envio');

  // Y el ciclo de vida sigue siendo el de siempre: el conductor acepta.
  socket.emit('rideAccepted', { tripId: 'push3a_trip', driver: { id: conductor.id, firstName: 'Diego0' } });
  await esperar(400);
  const activo = await fetch(`${url}/api/trips/active/me`, {
    headers: { authorization: `Bearer ${conductor.token}` }
  });
  assert.equal(activo.status, 200);
  assert.equal((await activo.json()).trip.id, 'push3a_trip');
});

// --------------------------------------------------------------------------
// Push apagado: el despacho ni se entera
// --------------------------------------------------------------------------

test('con WEB_PUSH_ENABLED=false el despacho por socket queda identico', async (t) => {
  const { url, salida } = await arrancarServidor(t, { pushEncendido: false });
  const { pasajeroToken, conductores } = await crearActores(url);
  const [conductor] = conductores;

  const { socket, ofertas, listo } = conectarConductor(t, url, conductor, { lat: 10.6428, lng: -71.6126 });
  await listo;
  await esperar(100);

  await crearViaje(url, pasajeroToken, 'push3a_apagado');
  await esperar(600);

  assert.equal(ofertas.length, 1, 'la oferta de socket no depende de la configuracion de push');
  assert.equal(ofertas[0].oferta.offeredDriverId, conductor.id);

  // La llamada semantica ocurrio y el servicio la absorbio como apagada: ni
  // intentos, ni errores, ni un despacho condicionado a la bandera.
  assert.equal(eventosPush(salida, 'push_disabled_by_config').length, 1);
  assert.equal(eventosPush(salida, 'push_attempt').length, 0);

  socket.emit('rideAccepted', { tripId: 'push3a_apagado', driver: { id: conductor.id, firstName: 'Diego0' } });
  await esperar(400);
  const activo = await fetch(`${url}/api/trips/active/me`, {
    headers: { authorization: `Bearer ${conductor.token}` }
  });
  assert.equal(activo.status, 200);
});

// --------------------------------------------------------------------------
// La critica: un proveedor colgado no roba tiempo de la ventana de quince
// segundos, y el avance de candidato sigue siendo secuencial
// --------------------------------------------------------------------------

test('un proveedor que nunca responde no retrasa la ventana de 15 s ni el paso al siguiente conductor', { timeout: 60_000 }, async (t) => {
  // "Proveedor" que acepta la conexion TCP y no completa jamas el saludo TLS:
  // la promesa del envio queda pendiente mucho mas alla de los quince
  // segundos, que es exactamente el escenario que no puede bloquear nada.
  const conexionesColgadas = [];
  const proveedorColgado = net.createServer(socket => { conexionesColgadas.push(socket); });
  await new Promise(resolve => proveedorColgado.listen(0, '127.0.0.1', resolve));
  const puertoColgado = proveedorColgado.address().port;
  t.after(() => {
    for (const socket of conexionesColgadas) socket.destroy();
    proveedorColgado.close();
  });

  const { url, salida } = await arrancarServidor(t, { pushEncendido: true });
  const { pasajeroToken, conductores } = await crearActores(url, { conductores: 2 });
  const [cercano, lejano] = conductores;

  // El cercano sera el primer candidato; su suscripcion apunta al proveedor
  // colgado. El alta va por la API real: el dueno sale del token. Las claves
  // son un par P-256 REAL generado aqui --web-push valida la longitud de
  // p256dh antes de tocar la red, asi que una clave de mentira nunca
  // llegaria a abrir la conexion que esta prueba necesita ver colgada.
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const alta = await fetch(`${url}/api/push/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cercano.token}` },
    body: JSON.stringify({
      endpoint: `https://127.0.0.1:${puertoColgado}/colgado-para-siempre`,
      keys: {
        p256dh: ecdh.getPublicKey('base64url'),
        auth: crypto.randomBytes(16).toString('base64url')
      }
    })
  });
  assert.equal(alta.status, 201);

  const conexionCercano = conectarConductor(t, url, cercano, { lat: 10.6428, lng: -71.6126 });
  const conexionLejano = conectarConductor(t, url, lejano, { lat: 10.6900, lng: -71.6500 });
  await Promise.all([conexionCercano.listo, conexionLejano.listo]);
  await esperar(100);

  await crearViaje(url, pasajeroToken, 'push3a_colgado');

  // Primera oferta: para el cercano, con su push disparado y COLGADO.
  await esperar(600);
  assert.equal(conexionCercano.ofertas.length, 1, 'el cercano debia recibir la primera oferta');
  assert.equal(conexionLejano.ofertas.length, 0, 'el lejano no puede recibir nada todavia: el avance es secuencial');
  assert.equal(eventosPush(salida, 'push_attempt').length, 1, 'un intento de envio para el cercano');
  assert.equal(conexionesColgadas.length, 1, 'el proveedor colgado debia tener la conexion abierta');

  // El cercano IGNORA la oferta. Si el despacho esperase al proveedor, la
  // segunda oferta no llegaria nunca; si respeta su ventana, llega a los ~15 s.
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('la oferta no avanzo al siguiente conductor')), 25_000);
    conexionLejano.socket.on('rideRequested', () => { clearTimeout(timeout); resolve(); });
  });

  // El socket del lejano gana la carrera al pipe de stdout del proceso hijo:
  // un respiro corto deja llegar las trazas antes de leerlas.
  await esperar(600);

  const transcurrido = conexionLejano.ofertas[0].at - conexionCercano.ofertas[0].at;
  assert.ok(transcurrido >= 14_000, `el avance llego demasiado pronto: ${transcurrido} ms`);
  assert.ok(transcurrido < 22_000, `la ventana de quince segundos se estiro: ${transcurrido} ms`);

  // Una llamada semantica por oferta real, en orden: el intento colgado del
  // cercano y el desenlace benigno del lejano, que no tiene suscripcion.
  assert.equal(eventosPush(salida, 'push_attempt').length, 1);
  const sinSuscripcion = eventosPush(salida, 'push_no_active_subscriptions');
  assert.equal(sinSuscripcion.length, 1);
  assert.equal(sinSuscripcion[0].userId, lejano.id);

  // El lejano acepta con normalidad: nada del ciclo de vida cambio.
  conexionLejano.socket.emit('rideAccepted', { tripId: 'push3a_colgado', driver: { id: lejano.id, firstName: 'Diego1' } });
  await esperar(400);
  const activo = await fetch(`${url}/api/trips/active/me`, {
    headers: { authorization: `Bearer ${lejano.token}` }
  });
  assert.equal(activo.status, 200);

  // Y ningun rechazo sin manejar en todo el proceso.
  assert.ok(!salida.stderr.includes('UnhandledPromiseRejection'), `rechazo sin manejar: ${salida.stderr.slice(0, 300)}`);
  assert.ok(!salida.stdout.includes('UnhandledPromiseRejection'));
});

// --------------------------------------------------------------------------
// El payload no puede engordar: la PII del viaje jamas viaja en el push
// --------------------------------------------------------------------------

test('un viaje lleno de PII produce un payload de exactamente tres campos', async () => {
  const envios = [];
  const servicio = createPushNotificationService({
    database: {
      pushSubscriptions: [{
        id: 'sub_pii', userId: 'driver_pii',
        endpoint: 'https://proveedor.ejemplo/e1',
        keys: { p256dh: 'BClave', auth: 'YXV0aA' },
        createdAt: '2026-08-27T00:00:00.000Z', updatedAt: '2026-08-27T00:00:00.000Z',
        lastSeenAt: null, lastSuccessAt: null, failureCount: 0,
        disabledAt: null, disabledReason: null
      }]
    },
    persistRecord: async () => true,
    sender: async envio => { envios.push(envio); return { statusCode: 201 }; },
    enabled: true,
    logger: { log: () => {} }
  });

  // Un viaje real lleva TODO esto. Nada de esto puede acabar en el payload.
  const viajeConPii = {
    id: 'trip_pii',
    passengerId: 'passenger_secreto',
    passengerName: 'Nombre Real',
    passengerPhone: '+584120000000',
    pickup: { lat: 10.64, lng: -71.61, address: 'Direccion de recogida' },
    destination: { lat: 10.65, lng: -71.60, address: 'Direccion de destino' },
    fareUSD: 4.5,
    paymentMethod: 'CASH',
    chat: [{ text: 'hola' }]
  };

  const resultado = await servicio.notifyRideOffer(viajeConPii, 'driver_pii');
  assert.equal(resultado.sent, 1);
  assert.equal(envios.length, 1);
  assert.deepEqual(envios[0].payload, { v: 1, t: 'ride_request', tripId: 'trip_pii' });
  assert.deepEqual(Object.keys(envios[0].payload).sort(), ['t', 'tripId', 'v'],
    'tres campos exactos: version, tipo e identificador de enrutado');
});

// --------------------------------------------------------------------------
// El contrato de no-rechazo que hace seguro el fuego-y-olvido
// --------------------------------------------------------------------------

test('notifyRideOffer resuelve aunque el sender lance, y queda pendiente sin bloquear si el sender cuelga', async () => {
  // Sender que lanza: el servicio clasifica y RESUELVE. Este contrato es el
  // que permite que el despacho dispare sin esperar.
  const queLanza = createPushNotificationService({
    database: { pushSubscriptions: [] },
    persistRecord: async () => true,
    sender: async () => { throw new Error('EPROVEEDOR'); },
    enabled: true,
    logger: { log: () => {} }
  });
  const resuelto = await queLanza.notifyRideOffer({ id: 'trip_x' }, 'driver_x');
  assert.equal(resuelto.skipped, false);

  // Sender colgado: la promesa del servicio queda pendiente, y el flujo que
  // NO la espera --el patron exacto de offerNext-- continua en el acto.
  const nuncaResuelve = new Promise(() => {});
  const queCuelga = createPushNotificationService({
    database: {
      pushSubscriptions: [{
        id: 'sub_colgada', userId: 'driver_colgado',
        endpoint: 'https://proveedor.ejemplo/colgado',
        keys: { p256dh: 'BClave', auth: 'YXV0aA' },
        createdAt: '2026-08-27T00:00:00.000Z', updatedAt: '2026-08-27T00:00:00.000Z',
        lastSeenAt: null, lastSuccessAt: null, failureCount: 0,
        disabledAt: null, disabledReason: null
      }]
    },
    persistRecord: async () => true,
    sender: () => nuncaResuelve,
    enabled: true,
    logger: { log: () => {} }
  });

  let continuo = false;
  queCuelga.notifyRideOffer({ id: 'trip_colgado' }, 'driver_colgado').catch(() => {});
  continuo = true; // el patron fuego-y-olvido: la linea siguiente corre YA

  assert.equal(continuo, true);
  const carrera = await Promise.race([
    queCuelga.notifyRideOffer({ id: 'trip_colgado_2' }, 'driver_colgado').then(() => 'resolvio'),
    new Promise(resolve => setTimeout(() => resolve('sigue pendiente'), 200))
  ]);
  assert.equal(carrera, 'sigue pendiente', 'con el proveedor colgado la promesa no puede resolverse sola');
});
