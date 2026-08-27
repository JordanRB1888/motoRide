import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPushNotificationService, isWebPushEnabled } from '../services/pushNotificationService.js';
import { createWebPushSender } from '../services/webPushSender.js';
import { PUSH_DISABLED_REASON, MAX_CONSECUTIVE_FAILURES } from '../domain/pushSubscription.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Servicio y adaptador real trabajando juntos, y el contrato de arranque.
 *
 * Ninguna prueba contacta con un proveedor: el cliente de `web-push` se inyecta
 * siempre como doble, y las cuentas de arranque usan SQLite temporal.
 *
 * Lo que se fija aqui es la propiedad que hace seguro desplegar esto con push
 * apagado, que es exactamente como llegara a produccion: con la bandera en
 * falso no se lee ninguna variable VAPID, no se construye el adaptador y no
 * existe camino alguno hacia un proveedor.
 */

const PUB = 'BClavePublicaFalsaDePruebas0123456789';
const PRIV = 'MARCADOR-PRIVADO-QUE-NO-DEBE-APARECER-JAMAS';
const SUBJECT = 'mailto:pruebas@ejemplo.local';

function suscripcion(id, endpoint) {
  return {
    id,
    userId: 'driver_1',
    endpoint,
    keys: { p256dh: 'BClaveNavegador', auth: 'YXV0aA' },
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    lastSeenAt: '2026-08-27T00:00:00.000Z',
    lastSuccessAt: null,
    failureCount: 0,
    disabledAt: null,
    disabledReason: null
  };
}

/** Servicio real + adaptador real + cliente de web-push falso. */
function montarPila({ enabled = true, respuestas = [], suscripciones = [] } = {}) {
  const trazas = [];
  const envios = [];
  let indice = 0;

  const webPushClient = {
    setVapidDetails: () => {},
    async sendNotification(sub, payload, opciones) {
      envios.push({ sub, payload, opciones });
      const siguiente = respuestas[Math.min(indice, respuestas.length - 1)];
      indice += 1;
      if (siguiente instanceof Error) throw siguiente;
      return siguiente ?? { statusCode: 201 };
    }
  };

  const sender = enabled
    ? createWebPushSender({ publicKey: PUB, privateKey: PRIV, subject: SUBJECT, webPushClient, logger: { warn: () => {} } })
    : null;

  const database = { pushSubscriptions: [...suscripciones] };
  const servicio = createPushNotificationService({
    database,
    persistRecord: async () => true,
    sender,
    enabled,
    logger: { log: (linea) => trazas.push(String(linea)) }
  });

  return { servicio, database, envios, trazas, webPushClient };
}

const errorProveedor = (statusCode) => {
  const e = new Error(`Received unexpected response code ${statusCode}`);
  e.name = 'WebPushError';
  e.statusCode = statusCode;
  e.headers = {};
  e.body = 'cuerpo del proveedor';
  e.endpoint = 'https://fcm.googleapis.com/fcm/send/SECRETO';
  return e;
};

// --------------------------------------------------------------------------
// La bandera
// --------------------------------------------------------------------------

test('la bandera solo se enciende con las formas aceptadas', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' true ']) assert.equal(isWebPushEnabled(v), true, v);
  for (const v of ['false', '0', 'off', 'no', '', '   ', undefined, null, 'quizas']) {
    assert.equal(isWebPushEnabled(v), false, String(v));
  }
});

test('con la funcionalidad apagada el proveedor NO se contacta', async () => {
  const { servicio, envios } = montarPila({
    enabled: false,
    suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a')]
  });

  const r = await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');

  assert.equal(envios.length, 0, 'no puede salir ni una peticion');
  assert.equal(r.sent, 0);
  assert.equal(r.skipped, true);
});

test('con la bandera apagada el adaptador ni siquiera se construye', () => {
  const index = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  const bloque = index.slice(
    index.indexOf('function construirPushSender'),
    index.indexOf('const pushService = createPushNotificationService')
  );
  // El primer gesto es rendirse si la bandera esta apagada, ANTES de leer
  // ninguna variable VAPID.
  const posGuarda = bloque.indexOf('if (!isWebPushEnabled()) return');
  const posClave = bloque.indexOf('WEB_PUSH_VAPID_PUBLIC_KEY');
  assert.ok(posGuarda >= 0, 'debe existir la guarda de la bandera');
  assert.ok(posGuarda < posClave, 'la guarda debe ir antes de leer las claves');
});

// --------------------------------------------------------------------------
// Envio real a traves de la pila completa
// --------------------------------------------------------------------------

test('encendido: llega exactamente un mensaje minimo al proveedor', async () => {
  const { servicio, envios } = montarPila({
    suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a')]
  });

  const r = await servicio.notifyRideOffer({ id: 'trp_777' }, 'driver_1');

  assert.equal(r.sent, 1);
  assert.equal(envios.length, 1);
  assert.deepEqual(JSON.parse(envios[0].payload), { v: 1, t: 'ride_request', tripId: 'trp_777' });
});

test('el viaje entero NO viaja: solo el identificador de enrutado', async () => {
  const { servicio, envios } = montarPila({
    suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a')]
  });

  const viaje = {
    id: 'trp_privado',
    passengerName: 'Nombre Apellido',
    passengerPhone: '+58 414-1234567',
    pickup: { address: 'Calle 72 con Avenida 15, Maracaibo' },
    destination: { address: 'Centro Sambil' },
    fareUSD: 4.5,
    paymentMethod: 'PAGO_MOVIL'
  };
  await servicio.notifyRideOffer(viaje, 'driver_1');

  const enviado = envios[0].payload;
  for (const secreto of ['Nombre Apellido', '+58 414-1234567', 'Calle 72', 'Sambil', '4.5', 'PAGO_MOVIL']) {
    assert.ok(!enviado.includes(secreto), `el payload filtra: ${secreto}`);
  }
});

test('un dispositivo por suscripcion, y un fallo no cancela los demas', async () => {
  const { servicio, envios, database } = montarPila({
    respuestas: [{ statusCode: 201 }, errorProveedor(500), { statusCode: 201 }],
    suscripciones: [
      suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a'),
      suscripcion('sub_2', 'https://fcm.googleapis.com/fcm/send/b'),
      suscripcion('sub_3', 'https://fcm.googleapis.com/fcm/send/c')
    ]
  });

  const r = await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');

  assert.equal(envios.length, 3, 'los tres debian intentarse');
  assert.equal(r.sent, 2, 'dos correctos pese al fallo del segundo');
  assert.equal(database.pushSubscriptions[1].failureCount, 1);
  assert.equal(database.pushSubscriptions[1].disabledAt, null, 'un 5xx no mata la suscripcion');
});

// --------------------------------------------------------------------------
// La clasificacion de PUSH-1 sigue mandando a traves del adaptador real
// --------------------------------------------------------------------------

test('404 y 410 del proveedor dan de baja la suscripcion', async () => {
  // Es la prueba que justifica toda la normalizacion del adaptador: `web-push`
  // RECHAZA con estos codigos, y sin traducirlos el servicio los veria como
  // fallo transitorio y no retiraria nunca el dispositivo desaparecido.
  for (const [codigo, motivo] of [[404, PUSH_DISABLED_REASON.EXPIRED_404], [410, PUSH_DISABLED_REASON.EXPIRED_410]]) {
    const { servicio, database } = montarPila({
      respuestas: [errorProveedor(codigo)],
      suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a')]
    });

    await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');

    const registro = database.pushSubscriptions[0];
    assert.ok(registro.disabledAt, `${codigo} debia dar de baja`);
    assert.equal(registro.disabledReason, motivo);
  }
});

test('un 429 del proveedor no penaliza la suscripcion', async () => {
  const { servicio, database } = montarPila({
    respuestas: [errorProveedor(429)],
    suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a')]
  });

  await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');

  assert.equal(database.pushSubscriptions[0].disabledAt, null);
  assert.equal(database.pushSubscriptions[0].failureCount, 0);
});

test('un 400 se trata como defecto propio, no como dispositivo invalido', async () => {
  const { servicio, database, trazas } = montarPila({
    respuestas: [errorProveedor(400)],
    suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a')]
  });

  await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');

  assert.equal(database.pushSubscriptions[0].disabledAt, null);
  assert.equal(database.pushSubscriptions[0].failureCount, 0);
  assert.ok(trazas.some(t => t.includes('push_bad_request')));
});

test('los fallos de red repetidos acaban dando de baja, no antes', async () => {
  const red = new Error('sin conexion');
  red.code = 'ECONNRESET';
  const { servicio, database } = montarPila({
    respuestas: [red],
    suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a')]
  });

  for (let i = 1; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
    await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');
    assert.equal(database.pushSubscriptions[0].disabledAt, null, `intento ${i}`);
  }
  await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');

  assert.ok(database.pushSubscriptions[0].disabledAt);
  assert.equal(database.pushSubscriptions[0].disabledReason, PUSH_DISABLED_REASON.TOO_MANY_FAILURES);
});

// --------------------------------------------------------------------------
// El servicio sigue sin rechazar hacia fuera
// --------------------------------------------------------------------------

test('con el adaptador real el servicio sigue sin rechazar nunca', async () => {
  const catastroficos = [
    errorProveedor(500),
    Object.assign(new Error('red caida'), { code: 'ENOTFOUND' }),
    new Error('sin codigo ni estado')
  ];

  for (const fallo of catastroficos) {
    const { servicio } = montarPila({
      respuestas: [fallo],
      suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/a')]
    });
    const r = await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');
    assert.ok(r && typeof r === 'object', 'siempre un resultado estructurado');
  }
});

test('ninguna traza del servicio filtra endpoint ni claves', async () => {
  const { servicio, trazas } = montarPila({
    respuestas: [errorProveedor(410)],
    suscripciones: [suscripcion('sub_1', 'https://fcm.googleapis.com/fcm/send/TOKEN-SECRETO')]
  });

  await servicio.notifyRideOffer({ id: 'trp_1' }, 'driver_1');

  const registro = trazas.join('\n');
  for (const secreto of ['TOKEN-SECRETO', 'BClaveNavegador', 'YXV0aA', PRIV]) {
    assert.ok(!registro.includes(secreto), `la traza filtra: ${secreto}`);
  }
  // El host si aparece: identifica al proveedor, no a la persona.
  assert.ok(registro.includes('fcm.googleapis.com'));
});

// --------------------------------------------------------------------------
// Contrato de arranque: lo que hace seguro desplegar esto
// --------------------------------------------------------------------------

let puerto = 12400;

async function arrancar(t, env = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'push4a-'));
  const port = puerto++;
  const hijo = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(dir, 'db.sqlite'), JWT_SECRET: 'push4a', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const salida = new Promise(resolve => hijo.once('exit', resolve));
  t.after(async () => { hijo.kill(); await salida; });

  let registro = '';
  const arrancado = await new Promise((resolve) => {
    const limite = setTimeout(() => resolve(false), 15000);
    hijo.stdout.on('data', (c) => {
      registro += c.toString();
      if (registro.includes('Running')) { clearTimeout(limite); resolve(true); }
    });
    hijo.stderr.on('data', (c) => { registro += c.toString(); });
    hijo.once('exit', () => { clearTimeout(limite); resolve(false); });
  });
  return { arrancado, registro, url: `http://127.0.0.1:${port}` };
}

test('sin la variable y sin VAPID el servidor arranca con normalidad', async (t) => {
  const { arrancado, registro } = await arrancar(t);
  assert.equal(arrancado, true, 'push dormido no puede ser un requisito de arranque');
  assert.ok(!registro.includes('VAPID'), 'ni siquiera se menciona la configuracion ausente');
});

test('con la bandera en falso y sin VAPID el servidor arranca con normalidad', async (t) => {
  const { arrancado, registro } = await arrancar(t, { WEB_PUSH_ENABLED: 'false' });
  assert.equal(arrancado, true);
  assert.ok(!registro.includes('VAPID'));
});

test('con la bandera encendida y sin claves arranca, pero push queda apagado', async (t) => {
  // Falla cerrado sin tumbar el servicio: push es entrega auxiliar, y dejar sin
  // despacho a toda la plataforma por una clave de notificaciones seria
  // desproporcionado.
  const { arrancado, registro } = await arrancar(t, { WEB_PUSH_ENABLED: 'true' });

  assert.equal(arrancado, true, 'el servidor debe seguir sirviendo viajes');
  assert.ok(registro.includes('WEB_PUSH_VAPID_PUBLIC_KEY_MISSING'), 'y decirlo alto');
  assert.ok(registro.includes('DESACTIVADO'));
});

test('con la bandera encendida y claves invalidas tampoco se activa push', async (t) => {
  const { arrancado, registro } = await arrancar(t, {
    WEB_PUSH_ENABLED: 'true',
    WEB_PUSH_VAPID_PUBLIC_KEY: PUB,
    WEB_PUSH_VAPID_PRIVATE_KEY: PRIV,
    WEB_PUSH_VAPID_SUBJECT: 'no-es-un-asunto-valido'
  });

  assert.equal(arrancado, true);
  assert.ok(registro.includes('WEB_PUSH_VAPID_INVALID'));
  assert.ok(registro.includes('DESACTIVADO'));
});

test('con configuracion incompleta el alta de suscripciones tambien se rechaza', async (t) => {
  // Aceptar endpoints para una funcionalidad que no puede entregar seria
  // acumular material sensible a cambio de nada.
  const { arrancado, url } = await arrancar(t, { WEB_PUSH_ENABLED: 'true' });
  assert.equal(arrancado, true);

  const registro = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Persona', lastName: 'Prueba',
      email: `push4a${Date.now()}@ejemplo.com`, phone: `+58 414${String(Date.now()).slice(-7)}`,
      password: 'password123'
    })
  });
  const { token } = await registro.json();

  const clave = await fetch(`${url}/api/push/public-key`, { headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual(await clave.json(), { enabled: false, publicKey: null });

  const alta = await fetch(`${url}/api/push/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'B1', auth: 'A1' } })
  });
  assert.equal(alta.status, 503);
  assert.equal((await alta.json()).error, 'PUSH_DISABLED');
});

test('con configuracion valida la clave publica SI se publica, y la privada nunca', async (t) => {
  const webpush = (await import('web-push')).default;
  const claves = webpush.generateVAPIDKeys();   // criptografia local, sin red

  const { arrancado, url } = await arrancar(t, {
    WEB_PUSH_ENABLED: 'true',
    WEB_PUSH_VAPID_PUBLIC_KEY: claves.publicKey,
    WEB_PUSH_VAPID_PRIVATE_KEY: claves.privateKey,
    WEB_PUSH_VAPID_SUBJECT: SUBJECT
  });
  assert.equal(arrancado, true);

  const registro = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Persona', lastName: 'Prueba',
      email: `push4b${Date.now()}@ejemplo.com`, phone: `+58 424${String(Date.now()).slice(-7)}`,
      password: 'password123'
    })
  });
  const { token } = await registro.json();

  const respuesta = await fetch(`${url}/api/push/public-key`, { headers: { authorization: `Bearer ${token}` } });
  const texto = await respuesta.text();

  assert.ok(!texto.includes(claves.privateKey), 'la clave privada NO puede salir jamas');
  const cuerpo = JSON.parse(texto);
  assert.deepEqual(Object.keys(cuerpo).sort(), ['enabled', 'publicKey']);
  assert.equal(cuerpo.enabled, true);
  assert.equal(cuerpo.publicKey, claves.publicKey);
});
