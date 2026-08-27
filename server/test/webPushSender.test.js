import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebPushSender,
  validateVapidConfig,
  WEB_PUSH_CONFIG_ERROR,
  PUSH_TTL_SEGUNDOS
} from '../services/webPushSender.js';

/**
 * Adaptador real de Web Push.
 *
 * NINGUNA prueba de este fichero toca la red. El cliente de `web-push` se
 * inyecta como doble en todos los casos salvo uno, que usa la libreria de
 * verdad para validar la configuracion --pura, sin red-- porque comprobar que
 * MI mock acepta mis claves no demuestra nada sobre la libreria real.
 *
 * Lo que mas se protege aqui es la normalizacion: `web-push` RECHAZA con
 * `WebPushError` para todo codigo que no sea 2xx, y ese error arrastra el
 * endpoint y el cuerpo de la respuesta. Sin traducirlo, un 410 se clasificaria
 * como transitorio --las suscripciones muertas no se retirarian nunca-- y el
 * endpoint acabaria en las trazas.
 */

// Marcadores, no material real. La privada es reconocible a simple vista para
// que cualquier fuga la delate.
const PUB = 'BClavePublicaFalsaDePruebas0123456789';
const PRIV = 'MARCADOR-PRIVADO-QUE-NO-DEBE-APARECER-JAMAS';
const SUBJECT = 'mailto:pruebas@ejemplo.local';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/TOKEN-SECRETO-DEL-DISPOSITIVO';
const KEYS = { p256dh: 'BClaveDelNavegador', auth: 'YXV0aC1zZWNyZXRv' };
const PAYLOAD = { v: 1, t: 'ride_request', tripId: 'trp_123' };

/** Doble del cliente de web-push, programable. */
function clienteFalso({ resuelveCon = { statusCode: 201 }, rechazaCon = null, vapidFalla = false } = {}) {
  const llamadas = { vapid: [], envios: [] };
  return {
    llamadas,
    setVapidDetails(subject, publicKey, privateKey) {
      llamadas.vapid.push({ subject, publicKey, privateKey });
      if (vapidFalla) throw new Error(`clave rechazada: ${privateKey}`);
    },
    async sendNotification(suscripcion, payload, opciones) {
      llamadas.envios.push({ suscripcion, payload, opciones });
      if (rechazaCon) throw rechazaCon;
      return resuelveCon;
    }
  };
}

/** Reproduce la forma exacta del WebPushError de la libreria. */
function errorDelProveedor(statusCode, { headers = {}, body = 'detalle del proveedor' } = {}) {
  const error = new Error(`Received unexpected response code ${statusCode}`);
  error.name = 'WebPushError';
  error.statusCode = statusCode;
  error.headers = headers;
  error.body = body;
  error.endpoint = ENDPOINT;
  return error;
}

const montar = (opciones = {}) => {
  const cliente = clienteFalso(opciones);
  const enviar = createWebPushSender({
    publicKey: PUB, privateKey: PRIV, subject: SUBJECT,
    webPushClient: cliente,
    logger: { warn: () => {} }
  });
  return { cliente, enviar };
};

// --------------------------------------------------------------------------
// Configuracion VAPID
// --------------------------------------------------------------------------

test('falta cualquiera de las tres piezas y falla con su codigo', () => {
  assert.throws(() => validateVapidConfig({ privateKey: PRIV, subject: SUBJECT }),
    new RegExp(WEB_PUSH_CONFIG_ERROR.PUBLIC_KEY_MISSING));
  assert.throws(() => validateVapidConfig({ publicKey: PUB, subject: SUBJECT }),
    new RegExp(WEB_PUSH_CONFIG_ERROR.PRIVATE_KEY_MISSING));
  assert.throws(() => validateVapidConfig({ publicKey: PUB, privateKey: PRIV }),
    new RegExp(WEB_PUSH_CONFIG_ERROR.SUBJECT_MISSING));
  // Cadenas vacias o de solo espacios cuentan como ausentes.
  assert.throws(() => validateVapidConfig({ publicKey: '   ', privateKey: PRIV, subject: SUBJECT }),
    new RegExp(WEB_PUSH_CONFIG_ERROR.PUBLIC_KEY_MISSING));
});

test('el asunto solo admite mailto: o https://', () => {
  const validos = ['mailto:soporte@ejemplo.com', 'https://ejemplo.com/contacto'];
  for (const subject of validos) {
    assert.ok(validateVapidConfig({ publicKey: PUB, privateKey: PRIV, subject }));
  }
  const invalidos = ['soporte@ejemplo.com', 'http://ejemplo.com', 'mailto:', 'tel:+58', 'ejemplo.com', 'https://'];
  for (const subject of invalidos) {
    assert.throws(() => validateVapidConfig({ publicKey: PUB, privateKey: PRIV, subject }),
      new RegExp(WEB_PUSH_CONFIG_ERROR.INVALID), subject);
  }
});

test('una clave que no es base64url se rechaza', () => {
  for (const publicKey of ['con espacios', 'con+mas/y', '¡acentos!', 'con.punto']) {
    assert.throws(() => validateVapidConfig({ publicKey, privateKey: PRIV, subject: SUBJECT }),
      new RegExp(WEB_PUSH_CONFIG_ERROR.INVALID), publicKey);
  }
});

test('ningun error de configuracion filtra material de clave', () => {
  const casos = [
    () => validateVapidConfig({ publicKey: '', privateKey: PRIV, subject: SUBJECT }),
    () => validateVapidConfig({ publicKey: PUB, privateKey: PRIV, subject: 'no-valido' }),
    () => validateVapidConfig({ publicKey: 'con espacios', privateKey: PRIV, subject: SUBJECT }),
    () => createWebPushSender({
      publicKey: PUB, privateKey: PRIV, subject: SUBJECT,
      webPushClient: clienteFalso({ vapidFalla: true })
    })
  ];
  for (const caso of casos) {
    let capturado = null;
    try { caso(); } catch (error) { capturado = error; }
    assert.ok(capturado, 'se esperaba un error');
    const texto = `${capturado.message} ${capturado.stack || ''}`;
    assert.ok(!texto.includes(PRIV), 'el error filtra la clave privada');
    assert.ok(!texto.includes(PUB), 'el error filtra la clave publica');
    // El mensaje es un codigo escueto, no una frase con datos dentro.
    assert.match(capturado.message, /^WEB_PUSH_VAPID_[A-Z_]+$/);
  }
});

test('la configuracion se aplica UNA sola vez, al construir', () => {
  const cliente = clienteFalso();
  createWebPushSender({ publicKey: PUB, privateKey: PRIV, subject: SUBJECT, webPushClient: cliente });
  assert.equal(cliente.llamadas.vapid.length, 1);
  assert.deepEqual(cliente.llamadas.vapid[0], { subject: SUBJECT, publicKey: PUB, privateKey: PRIV });
});

test('la libreria REAL acepta nuestra configuracion', async () => {
  // Comprobar que mi propio doble acepta mis claves no demuestra nada. Aqui se
  // usa `web-push` de verdad: `generateVAPIDKeys` y `setVapidDetails` son
  // criptografia y validacion locales, sin una sola peticion de red.
  const webpush = (await import('web-push')).default;
  const claves = webpush.generateVAPIDKeys();

  const enviar = createWebPushSender({
    publicKey: claves.publicKey,
    privateKey: claves.privateKey,
    subject: SUBJECT,
    webPushClient: webpush
  });
  assert.equal(typeof enviar, 'function');

  // Y que rechaza lo que no vale, con nuestro codigo y no con el suyo.
  assert.throws(
    () => createWebPushSender({
      publicKey: 'BDemasiadoCorta', privateKey: claves.privateKey, subject: SUBJECT, webPushClient: webpush
    }),
    new RegExp(WEB_PUSH_CONFIG_ERROR.INVALID)
  );
});

// --------------------------------------------------------------------------
// Traduccion y payload
// --------------------------------------------------------------------------

test('la suscripcion se traduce al formato de la libreria', async () => {
  const { cliente, enviar } = montar();
  await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD });

  const { suscripcion } = cliente.llamadas.envios[0];
  assert.deepEqual(Object.keys(suscripcion).sort(), ['endpoint', 'keys']);
  assert.equal(suscripcion.endpoint, ENDPOINT);
  assert.deepEqual(suscripcion.keys, { p256dh: KEYS.p256dh, auth: KEYS.auth });
});

test('el payload sale EXACTAMENTE como llego, sin anadir campos', async () => {
  const { cliente, enviar } = montar();
  await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD });

  const enviado = JSON.parse(cliente.llamadas.envios[0].payload);
  assert.deepEqual(enviado, { v: 1, t: 'ride_request', tripId: 'trp_123' });
  assert.deepEqual(Object.keys(enviado).sort(), ['t', 'tripId', 'v']);
  // Nada de titulo ni cuerpo: el texto visible lo pone el service worker.
  for (const prohibido of ['title', 'body', 'icon', 'badge', 'passengerName', 'pickupAddress']) {
    assert.ok(!(prohibido in enviado), `el adaptador anadio ${prohibido}`);
  }
});

test('se envia con caducidad corta y urgencia alta', async () => {
  const { cliente, enviar } = montar();
  await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD });

  const { opciones } = cliente.llamadas.envios[0];
  // La ventana de oferta son quince segundos: un aviso entregado horas despues
  // hablaria de una carrera que ya no existe.
  assert.equal(opciones.TTL, PUSH_TTL_SEGUNDOS);
  assert.equal(PUSH_TTL_SEGUNDOS, 60);
  assert.equal(opciones.urgency, 'high');
});

// --------------------------------------------------------------------------
// LA NORMALIZACION: el corazon del adaptador
// --------------------------------------------------------------------------

test('una respuesta correcta devuelve su codigo', async () => {
  for (const statusCode of [200, 201, 202, 204]) {
    const { enviar } = montar({ resuelveCon: { statusCode } });
    assert.deepEqual(await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD }), { statusCode });
  }
});

test('el rechazo del proveedor se DEVUELVE como codigo, no se lanza', async () => {
  // Si se dejara subir como excepcion, `pushNotificationService` lo veria como
  // `error` y lo clasificaria TRANSIENT: un 410 no daria de baja nunca la
  // suscripcion muerta.
  for (const statusCode of [400, 404, 410, 429, 500, 502, 503]) {
    const { enviar } = montar({ rechazaCon: errorDelProveedor(statusCode) });
    const resultado = await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD });
    assert.equal(resultado.statusCode, statusCode, `el ${statusCode} debia devolverse`);
  }
});

test('un 429 con Retry-After utilizable lo traduce a milisegundos', async () => {
  const { enviar } = montar({ rechazaCon: errorDelProveedor(429, { headers: { 'retry-after': '120' } }) });
  const resultado = await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD });
  assert.equal(resultado.statusCode, 429);
  assert.equal(resultado.retryAfterMs, 120000);
});

test('un Retry-After inutilizable no inventa un valor', async () => {
  for (const valor of ['Wed, 21 Oct 2026 07:28:00 GMT', 'pronto', '-5', undefined]) {
    const { enviar } = montar({ rechazaCon: errorDelProveedor(429, { headers: { 'retry-after': valor } }) });
    const resultado = await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD });
    assert.equal(resultado.retryAfterMs, null, String(valor));
  }
});

test('un fallo de red SI se lanza, con un codigo escueto', async () => {
  const red = new Error(`connect ECONNREFUSED al enviar a ${ENDPOINT}`);
  red.code = 'ECONNREFUSED';
  const { enviar } = montar({ rechazaCon: red });

  await assert.rejects(
    () => enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD }),
    (error) => {
      assert.equal(error.message, 'ECONNREFUSED');
      // El mensaje original citaba el endpoint entero: no puede sobrevivir.
      assert.ok(!error.message.includes(ENDPOINT));
      return true;
    }
  );
});

test('un timeout tambien se lanza como transitorio', async () => {
  const timeout = new Error('socket hang up');
  timeout.code = 'ETIMEDOUT';
  const { enviar } = montar({ rechazaCon: timeout });
  await assert.rejects(() => enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD }), /ETIMEDOUT/);
});

test('un fallo sin forma reconocible no rompe el adaptador', async () => {
  for (const raro of [new Error('sin codigo'), 'ni siquiera es un Error', null, undefined, 42, {}]) {
    const { enviar } = montar({ rechazaCon: raro || new Error('vacio') });
    let capturado = null;
    try {
      await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD });
    } catch (error) {
      capturado = error;
    }
    assert.ok(capturado instanceof Error, `entrada rara: ${String(raro)}`);
    assert.match(capturado.message, /^[A-Za-z_]+$/, 'el codigo debe ser escueto');
  }
});

// --------------------------------------------------------------------------
// Fugas
// --------------------------------------------------------------------------

test('ningun error de envio filtra endpoint, claves ni cuerpo del proveedor', async () => {
  const secretos = [ENDPOINT, KEYS.p256dh, KEYS.auth, PRIV, 'detalle del proveedor'];

  const conRed = new Error(`fallo hablando con ${ENDPOINT}`);
  conRed.code = 'ECONNRESET';
  const { enviar } = montar({ rechazaCon: conRed });

  let capturado = null;
  try { await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD }); } catch (e) { capturado = e; }
  const texto = `${capturado.message} ${capturado.stack || ''}`;
  for (const secreto of secretos) {
    assert.ok(!texto.includes(secreto), `el error filtra: ${secreto.slice(0, 30)}`);
  }
});

test('el resultado devuelto al servicio no lleva material sensible', async () => {
  const { enviar } = montar({ rechazaCon: errorDelProveedor(410, { body: 'endpoint gone: ' + ENDPOINT }) });
  const resultado = await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD });

  assert.deepEqual(Object.keys(resultado).sort(), ['retryAfterMs', 'statusCode']);
  const texto = JSON.stringify(resultado);
  for (const secreto of [ENDPOINT, KEYS.p256dh, KEYS.auth, PRIV]) {
    assert.ok(!texto.includes(secreto));
  }
});

test('las trazas del adaptador no citan el endpoint', async () => {
  const trazas = [];
  const red = new Error(`fallo a ${ENDPOINT}`);
  red.code = 'ECONNRESET';
  const enviar = createWebPushSender({
    publicKey: PUB, privateKey: PRIV, subject: SUBJECT,
    webPushClient: clienteFalso({ rechazaCon: red }),
    logger: { warn: (m) => trazas.push(String(m)) }
  });

  try { await enviar({ endpoint: ENDPOINT, keys: KEYS, payload: PAYLOAD }); } catch { /* esperado */ }

  const registro = trazas.join('\n');
  for (const secreto of [ENDPOINT, KEYS.p256dh, KEYS.auth, PRIV]) {
    assert.ok(!registro.includes(secreto), `la traza filtra: ${secreto.slice(0, 30)}`);
  }
});

test('el fuente del adaptador no contiene ninguna clave codificada', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fuente = fs.readFileSync(path.join(raiz, 'services/webPushSender.js'), 'utf8');

  // Una clave VAPID real son 87-88 caracteres base64url empezando por B.
  assert.ok(!/['"`]B[A-Za-z0-9_-]{80,}['"`]/.test(fuente), 'hay una clave codificada en el fuente');
  assert.ok(!/VITE_/.test(fuente), 'nada del adaptador puede viajar al bundle del navegador');
  // Ninguna identidad de contacto de produccion inventada.
  assert.ok(!/mailto:[^\s'"`]*58express/i.test(fuente), 'no se codifica un contacto de produccion');
});
