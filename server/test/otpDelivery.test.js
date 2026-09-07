import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLITICA, RESULTADO } from '../domain/otpChallenge.js';
import { createVerificationService } from '../services/verificationChallenges.js';
import { crearProveedores } from '../services/verificationProviders.js';
import {
  RESULTADO_DE_ENVIO,
  TIMEOUT_POR_OMISION_MS,
  clasificarRespuesta,
  crearTransporteHttp,
  motivoDeEstado
} from '../services/verificationTransport.js';
import { enmascararContacto, enmascararCorreo, enmascararTelefono } from '../domain/contactos.js';

/**
 * AUTH-FINAL-2: la entrega real. El transporte se prueba con un `fetch`
 * inyectado, asi que lo que se comprueba es la CLASIFICACION --que es donde
 * estan las decisiones-- y no la red.
 */
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRETO = 'secreto-de-pruebas-de-entrega-0123456789';
const ENV_COMPLETO = {
  WHATSAPP_CLOUD_ACCESS_TOKEN: 'token-secreto-de-meta',
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: '1000',
  WHATSAPP_OTP_TEMPLATE_NAME: 'otp',
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: 'es',
  TWILIO_ACCOUNT_SID: 'AC-de-prueba',
  TWILIO_AUTH_TOKEN: 'token-secreto-de-twilio',
  TWILIO_SMS_FROM: '+15550001111',
  RESEND_API_KEY: 'clave-secreta-de-resend',
  EMAIL_FROM: 'no-reply@58express.com'
};

/**
 * @param respuestaPorCanal  que devuelve el transporte para cada canal; puede
 *                           ser un objeto de resultado o una funcion.
 */
function montar({ env = ENV_COMPLETO, respuestaPorCanal = {}, registrar } = {}) {
  let ahora = new Date('2026-09-04T12:00:00.000Z');
  const now = () => ahora;
  const avanzar = ms => { ahora = new Date(ahora.getTime() + ms); };
  const enviados = [];
  const registros = [];
  const proveedores = crearProveedores({
    env,
    transporte: async (canal, peticion) => {
      const respuesta = respuestaPorCanal[canal] ?? { resultado: RESULTADO_DE_ENVIO.ENTREGADO, motivo: null, latenciaMs: 10 };
      const resuelta = typeof respuesta === 'function' ? await respuesta(peticion) : respuesta;
      const codigo = canal === 'WHATSAPP'
        ? peticion.body?.template?.components?.[0]?.parameters?.[0]?.text
        : canal === 'SMS'
          ? peticion.form?.Body?.match(/\d{6}/)?.[0]
          : peticion.body?.text?.match(/\d{6}/)?.[0];
      enviados.push({ canal, codigo, peticion });
      return resuelta;
    }
  });
  const database = { users: [], authChallenges: [] };
  const servicio = createVerificationService({
    database,
    secreto: SECRETO,
    proveedores,
    now,
    registrar: registrar ?? (metadata => registros.push(metadata))
  });
  return { database, servicio, enviados, registros, avanzar, now };
}

const LOGIN = { channel: 'WHATSAPP', destination: '0414 123 4567', purpose: 'LOGIN' };

// ---------------------------------------------------------------------------
// Transporte: clasificacion y timeout
// ---------------------------------------------------------------------------

test('clasificacion HTTP: 2xx entrega, 4xx rechaza definitivamente, 5xx y 429 son ambiguos', () => {
  for (const status of [200, 201, 202]) assert.equal(clasificarRespuesta(status), RESULTADO_DE_ENVIO.ENTREGADO);
  for (const status of [400, 401, 403, 404, 422]) assert.equal(clasificarRespuesta(status), RESULTADO_DE_ENVIO.RECHAZADO);
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(clasificarRespuesta(status), RESULTADO_DE_ENVIO.AMBIGUO);
  assert.equal(motivoDeEstado(401), 'PROVIDER_UNAUTHORIZED');
  assert.equal(motivoDeEstado(429), 'PROVIDER_THROTTLED');
  assert.equal(motivoDeEstado(503), 'PROVIDER_UNAVAILABLE');
  assert.equal(motivoDeEstado(422), 'PROVIDER_REJECTED');
});

test('provider timeout: el transporte aborta y lo llama ambiguo, no fracaso', async () => {
  let recibioSenal = null;
  const transporte = await crearTransporteHttp({
    timeoutMs: 40,
    fetchImpl: (_url, opciones) => new Promise((_resolve, reject) => {
      recibioSenal = opciones.signal;
      opciones.signal.addEventListener('abort', () => {
        const error = new Error('abortado');
        error.name = 'TimeoutError';
        reject(error);
      });
    })
  });
  const resultado = await transporte('WHATSAPP', { url: 'https://ejemplo.invalid', headers: {}, body: {} });
  assert.equal(resultado.resultado, RESULTADO_DE_ENVIO.AMBIGUO);
  assert.equal(resultado.motivo, 'PROVIDER_TIMEOUT');
  assert.ok(recibioSenal, 'la peticion lleva senal de aborto');
  assert.ok(resultado.latenciaMs >= 0);
});

test('el transporte pone un timeout siempre, y el servidor puede ajustarlo', async () => {
  assert.equal(TIMEOUT_POR_OMISION_MS, 10_000);
  let opcionesVistas = null;
  const transporte = await crearTransporteHttp({
    timeoutMs: 1234,
    fetchImpl: async (_url, opciones) => { opcionesVistas = opciones; return { status: 200 }; }
  });
  await transporte('SMS', { url: 'https://ejemplo.invalid', headers: {}, form: { A: 'b c' } });
  assert.ok(opcionesVistas.signal instanceof AbortSignal);
  assert.equal(opcionesVistas.body, 'A=b+c', 'el formulario se codifica, no se manda como JSON');
});

test('un fallo de red no es un rechazo: no se sabe si el mensaje salio', async () => {
  const transporte = await crearTransporteHttp({ fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  const resultado = await transporte('EMAIL', { url: 'https://ejemplo.invalid', headers: {}, body: {} });
  assert.equal(resultado.resultado, RESULTADO_DE_ENVIO.AMBIGUO);
  assert.equal(resultado.motivo, 'PROVIDER_NETWORK_ERROR');
});

// ---------------------------------------------------------------------------
// Los tres canales entregan
// ---------------------------------------------------------------------------

test('successful WhatsApp send: el codigo llega a Meta en la plantilla y el desafio queda confirmado', async () => {
  const { servicio, enviados, database } = montar();
  const r = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(r.ok, true);
  assert.equal(r.deliveryConfirmed, true);
  assert.equal(enviados[0].canal, 'WHATSAPP');
  assert.match(enviados[0].codigo, /^\d{6}$/);
  assert.equal(enviados[0].peticion.url, 'https://graph.facebook.com/v20.0/1000/messages');
  assert.equal(database.authChallenges[0].deliveryConfirmed, true);
  assert.equal(servicio.verifyChallenge({ challengeId: r.desafio.challengeId, code: enviados[0].codigo, esperado: { purpose: 'LOGIN' } }).ok, true);
});

test('successful SMS send: el codigo llega a Twilio como formulario y verifica', async () => {
  const { servicio, enviados } = montar();
  const r = await servicio.sendVerification({ ...LOGIN, channel: 'SMS', origen: 'ip:1' });
  assert.equal(r.ok, true);
  assert.equal(enviados[0].canal, 'SMS');
  assert.equal(enviados[0].peticion.form.To, '+584141234567');
  assert.equal(servicio.verifyChallenge({ challengeId: r.desafio.challengeId, code: enviados[0].codigo, esperado: { purpose: 'LOGIN' } }).ok, true);
});

test('successful email send: el codigo llega al proveedor de correo y verifica', async () => {
  const { servicio, enviados } = montar();
  const r = await servicio.sendVerification({ channel: 'EMAIL', destination: ' Ana@X.CO ', purpose: 'LOGIN', origen: 'ip:1' });
  assert.equal(r.ok, true);
  assert.deepEqual(enviados[0].peticion.body.to, ['ana@x.co'], 'el correo se normaliza antes de enviarse');
  assert.equal(servicio.verifyChallenge({ challengeId: r.desafio.challengeId, code: enviados[0].codigo, esperado: { purpose: 'LOGIN' } }).ok, true);
});

// ---------------------------------------------------------------------------
// Fallo del proveedor
// ---------------------------------------------------------------------------

test('provider rejected delivery: no se guarda desafio, no se gasta enfriamiento, el fallback es inmediato', async () => {
  const { servicio, database, enviados } = montar({
    respuestaPorCanal: { WHATSAPP: { resultado: RESULTADO_DE_ENVIO.RECHAZADO, motivo: 'PROVIDER_REJECTED' } }
  });
  const fallo = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(fallo.ok, false);
  assert.equal(fallo.error, 'VERIFICATION_SEND_FAILED');
  assert.equal(fallo.reason, 'PROVIDER_REJECTED');
  assert.equal(fallo.channel, 'WHATSAPP');
  assert.equal(database.authChallenges.length, 0, 'un mensaje que no salio no deja desafio');

  // Sin esperar nada: el usuario cae a SMS y funciona.
  const porSms = await servicio.sendVerification({ ...LOGIN, channel: 'SMS', origen: 'ip:1' });
  assert.equal(porSms.ok, true, 'el fallback no espera enfriamiento porque no hubo entrega');
  assert.equal(enviados.length, 2);
});

test('provider unavailable: un 503 del proveedor es ambiguo y el desafio se conserva', async () => {
  const transporte = await crearTransporteHttp({ fetchImpl: async () => ({ status: 503 }) });
  const proveedores = crearProveedores({ env: ENV_COMPLETO, transporte });
  const database = { users: [], authChallenges: [] };
  const servicio = createVerificationService({ database, secreto: SECRETO, proveedores });
  const r = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(r.ok, true);
  assert.equal(r.deliveryConfirmed, false);
  assert.equal(r.warning, 'DELIVERY_UNCONFIRMED');
  assert.equal(r.reason, 'PROVIDER_UNAVAILABLE');
  assert.equal(database.authChallenges.length, 1);
});

test('entrega ambigua: el desafio vale, el codigo sirve y se puede reenviar SIN esperar el enfriamiento', async () => {
  const { servicio, enviados, database } = montar({
    respuestaPorCanal: { WHATSAPP: { resultado: RESULTADO_DE_ENVIO.AMBIGUO, motivo: 'PROVIDER_TIMEOUT' } }
  });
  const primero = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(primero.ok, true);
  assert.equal(primero.desafio.resendAvailableInSeconds, 0, 'sin confirmacion no hay cuenta atras');
  assert.equal(enviados.length, 1, 'y NUNCA se reintenta solo');

  // Si el mensaje si habia llegado, el codigo funciona.
  const copia = { ...database.authChallenges[0] };
  assert.equal(servicio.verifyChallenge({ challengeId: copia.id, code: enviados[0].codigo, esperado: { purpose: 'LOGIN' } }).ok, true);

  // Y si no llego, se puede pedir otro en el acto, sin los sesenta segundos.
  const { servicio: s2, enviados: e2 } = montar({
    respuestaPorCanal: { WHATSAPP: { resultado: RESULTADO_DE_ENVIO.AMBIGUO, motivo: 'PROVIDER_TIMEOUT' } }
  });
  await s2.sendVerification({ ...LOGIN, origen: 'ip:2' });
  const segundo = await s2.sendVerification({ ...LOGIN, origen: 'ip:2' });
  assert.equal(segundo.ok, true, 'reenviar tras una entrega no confirmada no espera');
  assert.equal(e2.length, 2);
});

test('una entrega confirmada SI enfria: el reintento inmediato espera sesenta segundos', async () => {
  const { servicio } = montar();
  await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  const pronto = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(pronto.error, 'RESEND_COOLDOWN');
  assert.equal(pronto.retryAfterMs, POLITICA.COOLDOWN_DE_REENVIO_MS);
});

// ---------------------------------------------------------------------------
// Doble envio y cambio de canal
// ---------------------------------------------------------------------------

test('double send protection: dos toques simultaneos mandan UN solo mensaje', async () => {
  const { servicio, enviados, database } = montar({
    // Un proveedor lento, como lo es una llamada real: es justo la ventana en
    // la que antes se colaba el segundo envio.
    respuestaPorCanal: {
      WHATSAPP: async () => {
        await new Promise(resolve => setTimeout(resolve, 40));
        return { resultado: RESULTADO_DE_ENVIO.ENTREGADO, motivo: null, latenciaMs: 40 };
      }
    }
  });
  const peticion = { ...LOGIN, origen: 'ip:1' };
  const [a, b] = await Promise.all([servicio.sendVerification(peticion), servicio.sendVerification(peticion)]);
  const respuestas = [a, b];
  assert.equal(respuestas.filter(r => r.ok).length, 1, 'solo una prospera');
  assert.equal(respuestas.find(r => !r.ok).error, 'SEND_IN_PROGRESS');
  assert.equal(enviados.length, 1, 'UN mensaje, no dos');
  assert.equal(database.authChallenges.length, 1);
});

test('la guardia se libera aunque el proveedor falle: el siguiente intento no queda bloqueado', async () => {
  const { servicio } = montar({
    respuestaPorCanal: { WHATSAPP: { resultado: RESULTADO_DE_ENVIO.RECHAZADO, motivo: 'PROVIDER_REJECTED' } }
  });
  assert.equal((await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' })).error, 'VERIFICATION_SEND_FAILED');
  const segundo = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(segundo.error, 'VERIFICATION_SEND_FAILED', 'llego al proveedor otra vez, no a la guardia');
});

test('dos destinos distintos a la vez no se estorban: la guardia es por atadura', async () => {
  const { servicio, enviados } = montar({
    respuestaPorCanal: {
      WHATSAPP: async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return { resultado: RESULTADO_DE_ENVIO.ENTREGADO };
      }
    }
  });
  const [a, b] = await Promise.all([
    servicio.sendVerification({ ...LOGIN, destination: '04141111111', origen: 'ip:1' }),
    servicio.sendVerification({ ...LOGIN, destination: '04142222222', origen: 'ip:1' })
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(enviados.length, 2);
});

test('channel switching: cambiar de canal invalida el codigo anterior y crea uno nuevo', async () => {
  const { servicio, enviados, database, avanzar } = montar();
  const porWhatsapp = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  const codigoViejo = enviados[0].codigo;

  avanzar(POLITICA.COOLDOWN_DE_REENVIO_MS + 1);
  const porSms = await servicio.sendVerification({ ...LOGIN, channel: 'SMS', origen: 'ip:1' });
  assert.equal(porSms.ok, true);
  assert.notEqual(porSms.desafio.challengeId, porWhatsapp.desafio.challengeId);

  const viejo = servicio.verifyChallenge({ challengeId: porWhatsapp.desafio.challengeId, code: codigoViejo, esperado: { purpose: 'LOGIN' } });
  assert.equal(viejo.resultado, RESULTADO.INVALIDADO, 'el codigo del canal anterior ya no vale');
  const nuevo = servicio.verifyChallenge({ challengeId: porSms.desafio.challengeId, code: enviados[1].codigo, esperado: { purpose: 'LOGIN' } });
  assert.equal(nuevo.ok, true);
  assert.equal(database.authChallenges.filter(d => !d.invalidatedAt && !d.consumedAt).length, 0, 'no quedan dos codigos vivos');
});

test('cambiar de canal NO esquiva el enfriamiento: la atadura ignora el canal', async () => {
  const { servicio, enviados } = montar();
  assert.equal((await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' })).ok, true);
  const porSms = await servicio.sendVerification({ ...LOGIN, channel: 'SMS', origen: 'ip:1' });
  assert.equal(porSms.error, 'RESEND_COOLDOWN', 'encadenar canales no es un atajo');
  const porCorreo = await servicio.sendVerification({ channel: 'EMAIL', destination: 'ana@x.co', purpose: 'LOGIN', origen: 'ip:1' });
  assert.equal(porCorreo.ok, true, 'otro destino es otra atadura y si puede');
  assert.equal(enviados.length, 2);
});

// ---------------------------------------------------------------------------
// Canales disponibles
// ---------------------------------------------------------------------------

test('channel unavailable: un canal sin configurar no se ofrece como disponible', async () => {
  const soloWhatsapp = montar({
    env: {
      WHATSAPP_CLOUD_ACCESS_TOKEN: 't',
      WHATSAPP_CLOUD_PHONE_NUMBER_ID: '1',
      WHATSAPP_OTP_TEMPLATE_NAME: 'otp',
      WHATSAPP_OTP_TEMPLATE_LANGUAGE: 'es'
    }
  });
  assert.deepEqual(soloWhatsapp.servicio.canalesDisponibles(), [
    { channel: 'WHATSAPP', contactType: 'PHONE', available: true },
    { channel: 'SMS', contactType: 'PHONE', available: false },
    { channel: 'EMAIL', contactType: 'EMAIL', available: false }
  ]);
  const sms = await soloWhatsapp.servicio.sendVerification({ ...LOGIN, channel: 'SMS', origen: 'ip:1' });
  assert.equal(sms.error, 'VERIFICATION_PROVIDER_NOT_CONFIGURED');
  assert.equal(sms.channel, 'SMS', 'la interfaz sabe QUE canal no esta');
  assert.equal(soloWhatsapp.database.authChallenges.length, 0);

  const todos = montar();
  assert.ok(todos.servicio.canalesDisponibles().every(c => c.available));
});

// ---------------------------------------------------------------------------
// Diagnostico
// ---------------------------------------------------------------------------

test('el enmascarado deja reconocer el contacto sin revelarlo', () => {
  assert.equal(enmascararTelefono('0414 123 4567'), '+58••••••••67');
  assert.equal(enmascararTelefono('04141234567'), enmascararTelefono('+58 414 1234567'), 'el mismo numero, la misma mascara');
  assert.notEqual(enmascararTelefono('04141234567'), enmascararTelefono('04149999999'), 'dos numeros distintos se distinguen');
  assert.equal(enmascararCorreo('ana@ejemplo.com'), 'a•••a@ejemplo.com');
  assert.equal(enmascararCorreo('j@correo.com'), 'j•••@correo.com');
  assert.equal(enmascararContacto('PHONE', '04141234567'), '+58••••••••67');
  for (const mascara of [enmascararTelefono('04141234567'), enmascararCorreo('ana@ejemplo.com')]) {
    assert.ok(mascara.includes('•'));
  }
});

test('no OTP logging: el diagnostico lleva metadata segura y JAMAS el codigo ni el destino completo', async () => {
  const { servicio, enviados, registros } = montar();
  const envio = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  servicio.verifyChallenge({ challengeId: envio.desafio.challengeId, code: '000000', esperado: { purpose: 'LOGIN' } });
  servicio.verifyChallenge({ challengeId: envio.desafio.challengeId, code: enviados[0].codigo, esperado: { purpose: 'LOGIN' } });

  assert.equal(registros.length, 3);
  assert.deepEqual(registros[0], {
    evento: 'otp.send',
    channel: 'WHATSAPP',
    purpose: 'LOGIN',
    destino: '+58••••••••67',
    resultado: 'delivered',
    motivo: null,
    latenciaMs: 10
  });
  assert.equal(registros[1].evento, 'otp.verify');
  assert.equal(registros[1].resultado, RESULTADO.CODIGO_INCORRECTO);
  assert.equal(registros[2].resultado, RESULTADO.OK);

  const todo = JSON.stringify(registros);
  assert.ok(!todo.includes(enviados[0].codigo), 'ni el codigo');
  assert.ok(!todo.includes('584141234567'), 'ni el destino completo');
  assert.ok(!todo.includes('codeHash'), 'ni el hash');
});

test('no provider-secret logging: ninguna credencial del proveedor sale por el diagnostico', async () => {
  const { servicio, registros } = montar();
  await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  await servicio.sendVerification({ channel: 'EMAIL', destination: 'ana@x.co', purpose: 'LOGIN', origen: 'ip:1' });
  const todo = JSON.stringify(registros);
  for (const secreto of ['token-secreto-de-meta', 'token-secreto-de-twilio', 'clave-secreta-de-resend', 'Bearer', 'Basic']) {
    assert.ok(!todo.includes(secreto), `${secreto} no debe aparecer`);
  }
});

test('el transporte y los adaptadores no escriben en consola por su cuenta', () => {
  for (const fichero of ['services/verificationTransport.js', 'services/verificationProviders.js', 'services/verificationChallenges.js']) {
    const fuente = fs.readFileSync(path.join(serverDir, fichero), 'utf8');
    assert.ok(!/console\./.test(fuente), `${fichero} debe registrar por el inyectado, no por consola`);
  }
  // El servidor si registra, y lo hace con la metadata segura del servicio.
  const index = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  assert.match(index, /registrar: metadata => console\.log/);
  assert.match(index, /crearTransporteHttp/, 'el transporte real esta cableado en el arranque');
});

test('el arranque cablea el transporte HTTP real con timeout configurable', () => {
  const index = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  assert.match(index, /timeoutMs: Number\(process\.env\.VERIFICATION_TIMEOUT_MS\) \|\| TIMEOUT_POR_OMISION_MS/);
  assert.match(index, /crearProveedores\(\{ env: process\.env, transporte: transporteDeVerificacion \}\)/);
});
