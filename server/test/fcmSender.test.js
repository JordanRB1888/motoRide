import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import {
  FCM_CONFIG_ERROR,
  CANAL_ANDROID,
  construirMensajeFcm,
  createFcmSender,
  normalizarRespuestaFcm,
  validarCuentaDeServicio
} from '../services/fcmSender.js';
import { PUSH_TYPE, TEXTO_DE_AVISO } from '../services/pushNotificationService.js';

/**
 * EL EMISOR DE FCM V1 (PUSH-1 · Firebase)
 *
 * Ninguna prueba contacta con Google ni necesita la cuenta real: la cuenta de
 * servicio se GENERA en memoria con una clave RSA de usar y tirar, y la red se
 * inyecta. Lo que se protege:
 *
 *   1. Que el OAuth se firme como Google exige (RS256, emisor, alcance,
 *      audiencia) y que el token se reutilice hasta que caduque.
 *   2. Que la respuesta del proveedor se traduzca a la clase correcta. Aquí
 *      las consecuencias son opuestas: un token muerto tomado por transitorio
 *      se reintenta para siempre; un fallo NUESTRO tomado por token muerto va
 *      borrando dispositivos válidos.
 *   3. Que el mensaje lleve SÓLO tipo, identificador y las constantes de la
 *      tabla. Ni dirección, ni nombre, ni texto de chat.
 *   4. Que ni la clave privada ni el token de un dispositivo acaben en un
 *      registro.
 */

const PAR = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CUENTA = Object.freeze({
  type: 'service_account',
  project_id: 'proyecto-de-prueba',
  client_email: 'push@proyecto-de-prueba.iam.gserviceaccount.com',
  private_key: PAR.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token'
});

/** Una red de mentira que responde al OAuth y al envío, y recuerda lo que vio. */
function redFalsa({ envio = { status: 200, cuerpo: { name: 'projects/x/messages/1' } }, oauth = { status: 200 } } = {}) {
  const llamadas = [];
  const fetchImpl = async (url, opciones) => {
    llamadas.push({ url: String(url), opciones });
    if (String(url) === CUENTA.token_uri) {
      return {
        ok: oauth.status < 300,
        status: oauth.status,
        json: async () => ({ access_token: 'token-de-acceso-de-prueba', expires_in: 3600 })
      };
    }
    return { ok: envio.status < 300, status: envio.status, json: async () => envio.cuerpo };
  };
  return { fetchImpl, llamadas };
}

// ---------------------------------------------------------------------------
// La cuenta de servicio
// ---------------------------------------------------------------------------

test('una cuenta de servicio incompleta se rechaza con un código, nunca con el valor', () => {
  for (const rota of [
    null,
    { ...CUENTA, type: 'user' },
    { ...CUENTA, private_key: 'no-es-una-clave' },
    { ...CUENTA, token_uri: 'http://inseguro' },
    { ...CUENTA, client_email: '' }
  ]) {
    assert.throws(() => validarCuentaDeServicio(rota), new RegExp(FCM_CONFIG_ERROR.INVALID));
  }
  assert.throws(() => createFcmSender({ rutaDeLaCuenta: '/no/existe.json' }), new RegExp(FCM_CONFIG_ERROR.FILE_MISSING));
});

// ---------------------------------------------------------------------------
// El OAuth
// ---------------------------------------------------------------------------

test('la aserción se firma con RS256 y los reclamos que Google exige', async () => {
  const { fetchImpl, llamadas } = redFalsa();
  const enviar = createFcmSender({ cuenta: CUENTA, fetchImpl, logger: { log() {}, warn() {}, error() {} } });

  await enviar({ endpoint: 'token-del-telefono', payload: { v: 1, t: PUSH_TYPE.TRIP_ARRIVED, tripId: 'trip_1' } });

  const oauth = llamadas.find(l => l.url === CUENTA.token_uri);
  assert.ok(oauth, 'no pidió el token de acceso');
  const cuerpo = new URLSearchParams(oauth.opciones.body);
  assert.equal(cuerpo.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');

  const decodificado = jwt.verify(cuerpo.get('assertion'), PAR.publicKey.export({ type: 'spki', format: 'pem' }), { algorithms: ['RS256'] });
  assert.equal(decodificado.iss, CUENTA.client_email);
  assert.equal(decodificado.aud, CUENTA.token_uri);
  assert.equal(decodificado.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.ok(decodificado.exp - decodificado.iat <= 3600);
});

test('el token de acceso se reutiliza y se renueva antes de caducar', async () => {
  let reloj = 1_000_000;
  const { fetchImpl, llamadas } = redFalsa();
  const enviar = createFcmSender({ cuenta: CUENTA, fetchImpl, now: () => reloj, logger: { log() {}, warn() {}, error() {} } });
  const payload = { v: 1, t: PUSH_TYPE.TRIP_STARTED, tripId: 'trip_1' };

  await enviar({ endpoint: 'tok', payload });
  await enviar({ endpoint: 'tok', payload });
  assert.equal(llamadas.filter(l => l.url === CUENTA.token_uri).length, 1, 'pidió dos tokens en un minuto');

  // A un minuto de caducar, se renueva.
  reloj += 3600 * 1000 - 30_000;
  await enviar({ endpoint: 'tok', payload });
  assert.equal(llamadas.filter(l => l.url === CUENTA.token_uri).length, 2, 'no renovó antes de caducar');
});

test('si Google rechaza NUESTRA credencial, el dispositivo no paga por ello', async () => {
  // Cinco fallos transitorios darían de baja la suscripción. Un 401 no dice
  // nada del teléfono: se devuelve como límite, que el clasificador no penaliza.
  const { fetchImpl } = redFalsa({ oauth: { status: 401 } });
  const errores = [];
  const enviar = createFcmSender({ cuenta: CUENTA, fetchImpl, logger: { log() {}, warn() {}, error: m => errores.push(m) } });

  const resultado = await enviar({ endpoint: 'tok', payload: { v: 1, t: PUSH_TYPE.TRIP_ARRIVED, tripId: 'trip_1' } });
  assert.equal(resultado.statusCode, 429);
  assert.equal(resultado.credencial, true);
  assert.ok(errores.length > 0, 'un fallo de credencial tiene que registrarse con estruendo');
});

// ---------------------------------------------------------------------------
// El mensaje
// ---------------------------------------------------------------------------

test('el mensaje es data-only, con la forma que espera expo-notifications, y lleva sólo tipo, viaje y las constantes de la tabla', () => {
  const mensaje = construirMensajeFcm({ token: 'tok', payload: { v: 1, t: PUSH_TYPE.CHAT_MESSAGE, tripId: 'trip_9' } });
  assert.equal(mensaje.message.token, 'tok');
  assert.equal(mensaje.message.notification, undefined, 'no debe llevar bloque notification: presenta la app con SU tabla');
  // La forma de expo-notifications en Android: `title` y `message` se
  // muestran, `channelId` elige el canal, y `body` es lo que la aplicación
  // recibe como `content.data`. Se aprendió en el laboratorio: con `body` de
  // texto el aviso llegaba sin cuerpo y sin datos para el enlace profundo.
  assert.deepEqual(Object.keys(mensaje.message.data).sort(), ['body', 'channelId', 'message', 'title']);
  assert.equal(mensaje.message.data.title, TEXTO_DE_AVISO.chat_message.title);
  assert.equal(mensaje.message.data.message, TEXTO_DE_AVISO.chat_message.body);
  assert.equal(mensaje.message.data.channelId, CANAL_ANDROID);
  assert.deepEqual(JSON.parse(mensaje.message.data.body), { v: 1, t: PUSH_TYPE.CHAT_MESSAGE, tripId: 'trip_9' });
  // FCM V1 exige cadenas en `data`.
  for (const valor of Object.values(mensaje.message.data)) assert.equal(typeof valor, 'string');
  // iOS lee sus datos de `body` junto a `aps`.
  assert.deepEqual(mensaje.message.apns.payload.body, { v: 1, t: PUSH_TYPE.CHAT_MESSAGE, tripId: 'trip_9' });
  // Prioridad alta y TTL de un minuto: una oferta entregada horas después
  // habla de un viaje que ya no existe.
  assert.equal(mensaje.message.android.priority, 'high');
  assert.equal(mensaje.message.android.ttl, '60s');
  // iOS: arquitectura lista, sin declarar runtime.
  assert.equal(mensaje.message.apns.headers['apns-priority'], '10');
});

test('la tabla de textos son CONSTANTES: ni plantillas, ni funciones, ni PII', () => {
  for (const [tipo, texto] of Object.entries(TEXTO_DE_AVISO)) {
    assert.equal(typeof texto.title, 'string', tipo);
    assert.equal(typeof texto.body, 'string', tipo);
    for (const cadena of [texto.title, texto.body]) {
      assert.equal(cadena.includes('${'), false, `${tipo} lleva una plantilla`);
      assert.equal(/\{\w+\}/.test(cadena), false, `${tipo} lleva un marcador`);
    }
  }
  // Cada tipo de aviso tiene texto. Uno sin texto caería a «por omisión» y se
  // notaría, pero mejor notarlo aquí.
  for (const tipo of Object.values(PUSH_TYPE)) assert.ok(TEXTO_DE_AVISO[tipo], `sin texto para ${tipo}`);
});

// ---------------------------------------------------------------------------
// La respuesta del proveedor
// ---------------------------------------------------------------------------

const error = (status, errorCode, message = '') => normalizarRespuestaFcm(status, {
  error: { status: errorCode, message, details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] }
});

test('un token desinstalado da de baja; uno de otro proyecto también', () => {
  assert.equal(error(404, 'UNREGISTERED').statusCode, 410);
  assert.equal(error(403, 'SENDER_ID_MISMATCH').statusCode, 404);
});

test('INVALID_ARGUMENT distingue entre token inválido y payload NUESTRO', () => {
  // Del token: se da de baja. Del payload: 400, sin penalizar al dispositivo.
  assert.equal(error(400, 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token').statusCode, 404);
  assert.equal(error(400, 'INVALID_ARGUMENT', 'Invalid value at message.data').statusCode, 400);
});

test('cuota, credencial y caída se distinguen', () => {
  assert.equal(error(429, 'QUOTA_EXCEEDED').statusCode, 429);
  assert.equal(error(401, '').statusCode, 429, 'credencial nuestra: no penaliza');
  assert.equal(error(401, '').credencial, true);
  assert.equal(error(503, 'UNAVAILABLE').statusCode, 503);
  assert.equal(error(500, 'INTERNAL').statusCode, 500);
  assert.equal(normalizarRespuestaFcm(200, {}).statusCode, 200);
});

test('ni la clave privada ni el token del dispositivo aparecen en ningún registro', async () => {
  const registros = [];
  const logger = { log: m => registros.push(String(m)), warn: m => registros.push(String(m)), error: m => registros.push(String(m)) };
  const { fetchImpl } = redFalsa({ envio: { status: 404, cuerpo: { error: { status: 'NOT_FOUND', message: 'x', details: [{ errorCode: 'UNREGISTERED' }] } } } });
  const enviar = createFcmSender({ cuenta: CUENTA, fetchImpl, logger });

  await enviar({ endpoint: 'TOKEN-SECRETO-DEL-TELEFONO', payload: { v: 1, t: PUSH_TYPE.TRIP_ARRIVED, tripId: 'trip_1' } });

  const todo = registros.join('\n');
  assert.equal(todo.includes('TOKEN-SECRETO-DEL-TELEFONO'), false, 'el token del dispositivo acabó en un registro');
  assert.equal(todo.includes('PRIVATE KEY'), false, 'la clave privada acabó en un registro');
  assert.equal(todo.includes(CUENTA.client_email), false, 'el correo de la cuenta acabó en un registro');
});

test('un fallo de red lanza con un código escueto, como Web Push', async () => {
  const enviar = createFcmSender({
    cuenta: CUENTA,
    fetchImpl: async url => {
      if (String(url) === CUENTA.token_uri) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) };
      throw Object.assign(new Error('ECONNRESET at https://fcm.googleapis.com/secret'), { name: 'FetchError' });
    },
    logger: { log() {}, warn() {}, error() {} }
  });
  await assert.rejects(
    () => enviar({ endpoint: 'tok', payload: { v: 1, t: PUSH_TYPE.TRIP_ARRIVED, tripId: 'trip_1' } }),
    /^Error: FCM_NETWORK$/
  );
});
