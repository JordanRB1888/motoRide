import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POLITICA,
  RESULTADO,
  crearDesafio,
  desafioPublico,
  generarCodigo,
  hashDelCodigo,
  verificarCodigo
} from '../domain/otpChallenge.js';
import { LIMITES, createVerificationService } from '../services/verificationChallenges.js';
import { CONTRATOS_DE_PROVEEDOR, construirPeticion, crearProveedores, describirConfiguracion } from '../services/verificationProviders.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRETO = 'secreto-de-pruebas-para-codigos-0123456789';
const WHATSAPP_ENV = {
  WHATSAPP_CLOUD_ACCESS_TOKEN: 'token-de-prueba',
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: '1000',
  WHATSAPP_OTP_TEMPLATE_NAME: 'otp',
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: 'es'
};

/** Un reloj controlado, un proveedor que captura, y el servicio encima. */
function montar({ env = WHATSAPP_ENV, transporte } = {}) {
  let ahora = new Date('2026-09-04T12:00:00.000Z');
  const now = () => ahora;
  const avanzar = ms => { ahora = new Date(ahora.getTime() + ms); };
  const entregados = [];
  const proveedores = crearProveedores({
    env,
    transporte: transporte ?? (async (canal, peticion) => {
      entregados.push({ canal, peticion });
      return { resultado: 'delivered', motivo: null, latenciaMs: 12 };
    })
  });
  const database = { users: [], authChallenges: [] };
  const servicio = createVerificationService({ database, secreto: SECRETO, proveedores, now });
  const codigoEntregado = () => {
    const ultima = entregados.at(-1);
    if (ultima.canal === 'WHATSAPP') return ultima.peticion.body.template.components[0].parameters[0].text;
    if (ultima.canal === 'SMS') return ultima.peticion.form.Body.match(/\d{6}/)[0];
    return ultima.peticion.body.text.match(/\d{6}/)[0];
  };
  return { database, servicio, entregados, codigoEntregado, avanzar, now };
}

const LOGIN = { channel: 'WHATSAPP', destination: '0414 123 4567', purpose: 'LOGIN' };

// ---------------------------------------------------------------------------
// El dominio
// ---------------------------------------------------------------------------

test('el codigo tiene seis cifras, siempre, tambien cuando empieza por cero', () => {
  for (let i = 0; i < 500; i += 1) assert.match(generarCodigo(), /^\d{6}$/);
  assert.equal(POLITICA.DIGITOS, 6);
});

test('OTP stored hashed: el registro guarda un HMAC, no el codigo, y la sal es el id', () => {
  const { registro, codigo } = crearDesafio({ id: 'chal_a', secreto: SECRETO, ...LOGIN, destination: '+584141234567' });
  assert.match(registro.codeHash, /^[0-9a-f]{64}$/);
  assert.ok(!('code' in registro), 'no hay campo en claro');
  assert.ok(!JSON.stringify(registro).includes(codigo), 'el codigo no aparece serializado');
  const otro = crearDesafio({ id: 'chal_b', secreto: SECRETO, ...LOGIN, destination: '+584141234567', codigo });
  assert.notEqual(otro.registro.codeHash, registro.codeHash, 'mismo codigo, distinto desafio, distinto hash');
  assert.throws(() => hashDelCodigo({ secreto: 'corto', challengeId: 'x', codigo: '1' }), /16 caracteres/);
});

test('OTP TTL: cinco minutos exactos, y al cumplirse el codigo ya no vale', () => {
  const creado = new Date('2026-09-04T12:00:00.000Z');
  const { registro, codigo } = crearDesafio({ id: 'c', secreto: SECRETO, ...LOGIN, destination: '+584141234567', now: creado });
  assert.equal(new Date(registro.expiresAt) - new Date(registro.createdAt), 5 * 60 * 1000);
  assert.equal(POLITICA.TTL_MS, 5 * 60 * 1000);
  const casi = new Date(creado.getTime() + 5 * 60 * 1000 - 1);
  const justo = new Date(creado.getTime() + 5 * 60 * 1000);
  assert.equal(verificarCodigo({ desafio: registro, codigo, secreto: SECRETO, now: casi }).resultado, RESULTADO.OK);
  assert.equal(verificarCodigo({ desafio: registro, codigo, secreto: SECRETO, now: justo }).resultado, RESULTADO.VENCIDO);
});

test('OTP single-use: el mismo codigo no vale dos veces', () => {
  const { registro, codigo } = crearDesafio({ id: 'c', secreto: SECRETO, ...LOGIN, destination: '+584141234567' });
  const primera = verificarCodigo({ desafio: registro, codigo, secreto: SECRETO });
  assert.equal(primera.resultado, RESULTADO.OK);
  assert.ok(primera.desafio.consumedAt);
  assert.equal(verificarCodigo({ desafio: primera.desafio, codigo, secreto: SECRETO }).resultado, RESULTADO.YA_USADO);
  assert.equal(registro.consumedAt, null, 'el original no se muta');
});

test('OTP wrong-attempt limit: al quinto fallo el desafio muere y ni el codigo bueno lo resucita', () => {
  const { registro, codigo } = crearDesafio({ id: 'c', secreto: SECRETO, ...LOGIN, destination: '+584141234567' });
  const malo = codigo === '000000' ? '000001' : '000000';
  let actual = registro;
  for (let intento = 1; intento < POLITICA.INTENTOS_MAXIMOS; intento += 1) {
    const r = verificarCodigo({ desafio: actual, codigo: malo, secreto: SECRETO });
    assert.equal(r.resultado, RESULTADO.CODIGO_INCORRECTO);
    assert.equal(r.desafio.attempts, intento);
    actual = r.desafio;
  }
  const ultimo = verificarCodigo({ desafio: actual, codigo: malo, secreto: SECRETO });
  assert.equal(ultimo.resultado, RESULTADO.AGOTADO);
  assert.ok(ultimo.desafio.invalidatedAt);
  assert.equal(verificarCodigo({ desafio: ultimo.desafio, codigo, secreto: SECRETO }).resultado, RESULTADO.INVALIDADO);
});

test('OTP purpose isolation: un codigo de LOGIN no sirve para CHANGE_PHONE, y no gasta intento', () => {
  const { registro, codigo } = crearDesafio({ id: 'c', secreto: SECRETO, ...LOGIN, destination: '+584141234567' });
  const cruzado = verificarCodigo({ desafio: registro, codigo, secreto: SECRETO, esperado: { purpose: 'CHANGE_PHONE' } });
  assert.equal(cruzado.resultado, RESULTADO.NO_COINCIDE);
  assert.equal(cruzado.desafio.attempts, 0);
  assert.equal(cruzado.desafio.consumedAt, null);
  assert.equal(verificarCodigo({ desafio: registro, codigo, secreto: SECRETO, esperado: { purpose: 'LOGIN' } }).resultado, RESULTADO.OK);
});

test('el desafio queda atado al destino, al canal y al usuario', () => {
  const { registro, codigo } = crearDesafio({ id: 'c', secreto: SECRETO, ...LOGIN, destination: '+584141234567', userId: 'u1' });
  const con = esperado => verificarCodigo({ desafio: registro, codigo, secreto: SECRETO, esperado }).resultado;
  assert.equal(con({ purpose: 'LOGIN', userId: 'u2' }), RESULTADO.NO_COINCIDE);
  assert.equal(con({ purpose: 'LOGIN', destination: '+584140000000' }), RESULTADO.NO_COINCIDE);
  assert.equal(con({ purpose: 'LOGIN', channel: 'SMS' }), RESULTADO.NO_COINCIDE);
  assert.equal(con({ purpose: 'LOGIN', userId: 'u1', destination: '+584141234567', channel: 'WHATSAPP' }), RESULTADO.OK);
});

test('la vista publica no lleva ni el hash ni el destino', () => {
  const { registro } = crearDesafio({ id: 'c', secreto: SECRETO, ...LOGIN, destination: '+584141234567' });
  const publico = desafioPublico(registro, new Date(registro.createdAt));
  assert.deepEqual(Object.keys(publico).sort(), ['attemptsLeft', 'challengeId', 'channel', 'expiresInSeconds', 'purpose', 'resendAvailableInSeconds']);
  assert.equal(publico.expiresInSeconds, 300);
  // Recien creado, la entrega aun no esta confirmada: no hay enfriamiento que
  // esperar. Solo un envio que el proveedor acepto activa los sesenta segundos.
  assert.equal(publico.resendAvailableInSeconds, 0);
  const confirmado = { ...registro, deliveryConfirmed: true };
  assert.equal(desafioPublico(confirmado, new Date(registro.createdAt)).resendAvailableInSeconds, 60);
});

// ---------------------------------------------------------------------------
// El servicio
// ---------------------------------------------------------------------------

test('sendVerification normaliza el destino a E.164 y el proveedor lo recibe como Meta lo quiere', async () => {
  const { database, servicio, entregados } = montar();
  const r = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(r.ok, true);
  assert.equal(database.authChallenges[0].destination, '+584141234567');
  assert.equal(entregados[0].peticion.body.to, '584141234567', 'Meta quiere el numero sin +');
  assert.equal(entregados[0].peticion.body.template.name, 'otp');
});

test('el ciclo completo: enviar, verificar, y el codigo no vuelve a valer', async () => {
  const { servicio, codigoEntregado } = montar();
  const envio = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  const codigo = codigoEntregado();
  const mal = servicio.verifyChallenge({ challengeId: envio.desafio.challengeId, code: codigo === '000000' ? '000001' : '000000', esperado: { purpose: 'LOGIN' } });
  assert.equal(mal.resultado, RESULTADO.CODIGO_INCORRECTO);
  assert.equal(mal.desafio.attempts, 1, 'el intento fallido se guarda en el registro');
  const bien = servicio.verifyChallenge({ challengeId: envio.desafio.challengeId, code: codigo, esperado: { purpose: 'LOGIN' } });
  assert.equal(bien.ok, true);
  assert.equal(servicio.verifyChallenge({ challengeId: envio.desafio.challengeId, code: codigo, esperado: { purpose: 'LOGIN' } }).resultado, RESULTADO.YA_USADO);
  assert.equal(servicio.verifyChallenge({ challengeId: 'chal_inexistente', code: codigo, esperado: { purpose: 'LOGIN' } }).resultado, RESULTADO.NO_EXISTE);
});

test('OTP resend cooldown: sesenta segundos; despues nace un desafio nuevo y el anterior muere', async () => {
  const { database, servicio, avanzar, codigoEntregado } = montar();
  const primero = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  const codigoPrimero = codigoEntregado();
  const pronto = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(pronto.error, 'RESEND_COOLDOWN');
  assert.equal(pronto.retryAfterMs, POLITICA.COOLDOWN_DE_REENVIO_MS);
  assert.equal(database.authChallenges.length, 1, 'el reintento temprano no crea nada');

  avanzar(POLITICA.COOLDOWN_DE_REENVIO_MS + 1);
  const segundo = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(segundo.ok, true);
  assert.notEqual(segundo.desafio.challengeId, primero.desafio.challengeId);
  const viejo = database.authChallenges.find(d => d.id === primero.desafio.challengeId);
  assert.ok(viejo.invalidatedAt, 'el anterior queda invalidado');
  assert.equal(servicio.verifyChallenge({ challengeId: primero.desafio.challengeId, code: codigoPrimero, esperado: { purpose: 'LOGIN' } }).resultado, RESULTADO.INVALIDADO);
  assert.equal(servicio.verifyChallenge({ challengeId: segundo.desafio.challengeId, code: codigoEntregado(), esperado: { purpose: 'LOGIN' } }).ok, true);
});

test('el mismo destino con otro proposito es otro desafio vivo, sin enfriamiento cruzado', async () => {
  const { database, servicio } = montar();
  assert.equal((await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' })).ok, true);
  assert.equal((await servicio.sendVerification({ ...LOGIN, purpose: 'PASSWORD_RESET', origen: 'ip:1' })).ok, true);
  assert.equal(database.authChallenges.length, 2);
});

test('sin proveedor configurado no se crea ningun desafio, y un envio fallido tampoco deja rastro', async () => {
  const sinSms = montar();
  const r = await sinSms.servicio.sendVerification({ ...LOGIN, channel: 'SMS', origen: 'ip:1' });
  assert.equal(r.error, 'VERIFICATION_PROVIDER_NOT_CONFIGURED');
  assert.equal(sinSms.database.authChallenges.length, 0);

  const fallando = montar({ transporte: async () => ({ resultado: 'rejected', motivo: 'PROVIDER_REJECTED' }) });
  const f = await fallando.servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(f.error, 'VERIFICATION_SEND_FAILED');
  assert.equal(f.reason, 'PROVIDER_REJECTED');
  assert.equal(fallando.database.authChallenges.length, 0);
});

test('un transporte que revienta es AMBIGUO: el mensaje pudo salir, asi que el desafio vale', async () => {
  const explotando = montar({ transporte: async () => { throw new Error('secreto-que-no-debe-salir'); } });
  const e = await explotando.servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  assert.equal(e.ok, true, 'no se descarta un codigo que quiza llego');
  assert.equal(e.deliveryConfirmed, false);
  assert.equal(e.warning, 'DELIVERY_UNCONFIRMED');
  assert.equal(e.reason, 'PROVIDER_TRANSPORT_ERROR', 'el error del transporte no se propaga');
  assert.equal(explotando.database.authChallenges.length, 1);
});

test('un destino invalido, un canal o un proposito desconocidos se rechazan antes de tocar al proveedor', async () => {
  const { servicio, entregados } = montar();
  assert.equal((await servicio.sendVerification({ ...LOGIN, destination: '12' })).error, 'INVALID_DESTINATION');
  assert.equal((await servicio.sendVerification({ ...LOGIN, channel: 'EMAIL', destination: '04141234567' })).error, 'INVALID_DESTINATION');
  assert.equal((await servicio.sendVerification({ ...LOGIN, channel: 'PALOMA' })).error, 'INVALID_CHANNEL');
  assert.equal((await servicio.sendVerification({ ...LOGIN, purpose: 'ROBAR' })).error, 'INVALID_PURPOSE');
  assert.equal(entregados.length, 0);
});

test('limite por destino: cinco envios por cuarto de hora, venga de donde venga', async () => {
  const { servicio, avanzar } = montar();
  for (let i = 0; i < LIMITES.POR_DESTINO; i += 1) {
    assert.equal((await servicio.sendVerification({ ...LOGIN, origen: `ip:${i}` })).ok, true, `envio ${i + 1}`);
    avanzar(POLITICA.COOLDOWN_DE_REENVIO_MS + 1);
  }
  const sexto = await servicio.sendVerification({ ...LOGIN, origen: 'ip:otra' });
  assert.equal(sexto.error, 'RATE_LIMITED');
  assert.equal(sexto.scope, 'destination');
  avanzar(LIMITES.VENTANA_MS);
  assert.equal((await servicio.sendVerification({ ...LOGIN, origen: 'ip:otra' })).ok, true, 'pasada la ventana vuelve a caber');
});

test('limite por origen: diez destinos distintos desde el mismo sitio y el siguiente espera', async () => {
  const { servicio } = montar();
  for (let i = 0; i < LIMITES.POR_ORIGEN; i += 1) {
    const destination = `0414${String(1000000 + i).padStart(7, '0')}`;
    assert.equal((await servicio.sendVerification({ ...LOGIN, destination, origen: 'user:u1' })).ok, true, `destino ${i + 1}`);
  }
  const otro = await servicio.sendVerification({ ...LOGIN, destination: '04149999999', origen: 'user:u1' });
  assert.equal(otro.error, 'RATE_LIMITED');
  assert.equal(otro.scope, 'origin');
});

test('el barrido quita los desafios muertos hace mas de una hora y respeta los recientes', async () => {
  const { database, servicio, avanzar } = montar();
  await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
  avanzar(POLITICA.TTL_MS + LIMITES.RETENCION_TRAS_VENCER_MS - 1000);
  await servicio.sendVerification({ ...LOGIN, destination: '04140000000', origen: 'ip:1' });
  assert.equal(database.authChallenges.length, 2, 'todavia no toca');
  avanzar(2000);
  assert.equal(servicio.barrer(), 1);
  assert.equal(database.authChallenges.length, 1);
});

test('no OTP logs: ni el servicio ni el dominio ni el router escriben en consola, y el codigo no sale por ella', async () => {
  for (const fichero of [
    'domain/otpChallenge.js',
    'services/verificationChallenges.js',
    'services/verificationProviders.js',
    'services/socialTokenVerifier.js',
    'routes/auth.js'
  ]) {
    const fuente = fs.readFileSync(path.join(serverDir, fichero), 'utf8');
    assert.ok(!/console\./.test(fuente), `${fichero} no debe usar console`);
  }
  const salidas = [];
  const originales = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originales[nivel] = console[nivel];
    console[nivel] = (...args) => salidas.push(args.map(String).join(' '));
  }
  try {
    const { servicio, codigoEntregado } = montar();
    const envio = await servicio.sendVerification({ ...LOGIN, origen: 'ip:1' });
    const codigo = codigoEntregado();
    servicio.verifyChallenge({ challengeId: envio.desafio.challengeId, code: '000000', esperado: { purpose: 'LOGIN' } });
    servicio.verifyChallenge({ challengeId: envio.desafio.challengeId, code: codigo, esperado: { purpose: 'LOGIN' } });
    assert.equal(salidas.length, 0, 'nada en consola');
  } finally {
    for (const nivel of Object.keys(originales)) console[nivel] = originales[nivel];
  }
});

test('los contratos de proveedor nombran variables, nunca valores, y todos siguen sin configurar por omision', () => {
  const descripcion = describirConfiguracion({});
  for (const canal of ['WHATSAPP', 'SMS', 'EMAIL']) {
    assert.equal(descripcion[canal].configurado, false);
    for (const falta of descripcion[canal].faltan) assert.ok(typeof falta === 'string' && falta === falta.toUpperCase());
  }
  assert.deepEqual(descripcion.WHATSAPP.faltan, [...CONTRATOS_DE_PROVEEDOR.WHATSAPP.variables]);
  // `EMAIL_PROVIDER` tiene valor por omision (Resend): no falta, se elige.
  assert.deepEqual(descripcion.EMAIL.faltan, ['RESEND_API_KEY', 'EMAIL_FROM']);
  assert.deepEqual(describirConfiguracion({ EMAIL_PROVIDER: 'sendgrid' }).EMAIL.faltan, ['SENDGRID_API_KEY', 'EMAIL_FROM']);
  const parcial = describirConfiguracion({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok' });
  assert.deepEqual(parcial.SMS.faltan, ['TWILIO_SMS_FROM']);
  assert.ok(!JSON.stringify(parcial).includes('tok'), 'el valor del secreto no aparece');
});

test('configurado pero sin transporte cableado no envia: PROVIDER_TRANSPORT_NOT_WIRED', async () => {
  const proveedores = crearProveedores({ env: WHATSAPP_ENV });
  assert.equal(proveedores.WHATSAPP.configurado(), true);
  const sinCablear = await proveedores.WHATSAPP.enviar({ destination: '+584141234567', codigo: '123456' });
  assert.equal(sinCablear.resultado, 'rejected');
  assert.equal(sinCablear.motivo, 'PROVIDER_TRANSPORT_NOT_WIRED');
  const sinConfigurar = await proveedores.SMS.enviar({ destination: '+584141234567', codigo: '123456' });
  assert.equal(sinConfigurar.resultado, 'rejected');
  assert.equal(sinConfigurar.motivo, 'PROVIDER_NOT_CONFIGURED');
  assert.deepEqual(await proveedores.SMS.healthCheck(), { ok: false, motivo: 'PROVIDER_NOT_CONFIGURED' });
});

test('la peticion de cada proveedor lleva el codigo donde toca y el destino en su formato', () => {
  const env = {
    ...WHATSAPP_ENV,
    TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_SMS_FROM: '+15550001111',
    RESEND_API_KEY: 'clave-secreta', EMAIL_FROM: 'no-reply@58express.com'
  };
  const sms = construirPeticion('SMS', { env, destination: '+584141234567', codigo: '123456' });
  assert.equal(sms.form.To, '+584141234567', 'Twilio recibe formulario, no JSON');
  assert.match(sms.form.Body, /123456/);
  assert.match(sms.headers.authorization, /^Basic /);

  const correo = construirPeticion('EMAIL', { env, destination: 'ana@x.co', codigo: '123456' });
  assert.equal(correo.url, 'https://api.resend.com/emails');
  assert.deepEqual(correo.body.to, ['ana@x.co']);
  assert.match(correo.body.text, /123456/);
  assert.ok(!/https?:\/\//.test(correo.body.text), 'un correo de codigo no lleva enlaces');

  const conSendgrid = construirPeticion('EMAIL', { env: { ...env, EMAIL_PROVIDER: 'sendgrid', SENDGRID_API_KEY: 'sg' }, destination: 'ana@x.co', codigo: '123456' });
  assert.equal(conSendgrid.url, 'https://api.sendgrid.com/v3/mail/send');
  assert.equal(conSendgrid.body.personalizations[0].to[0].email, 'ana@x.co');
  assert.throws(() => construirPeticion('PALOMA', { env, destination: 'x', codigo: '1' }));
});

test('el mensaje lleva la marca, el codigo y nada mas: ni PII, ni contrasenas, ni enlaces', () => {
  const env = { ...WHATSAPP_ENV, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_SMS_FROM: '+1', RESEND_API_KEY: 'k', EMAIL_FROM: 'no-reply@58express.com' };
  const sms = construirPeticion('SMS', { env, destination: '+584141234567', codigo: '123456' }).form.Body;
  const correo = construirPeticion('EMAIL', { env, destination: 'ana@x.co', codigo: '123456' }).body.text;
  for (const texto of [sms, correo]) {
    assert.match(texto, /\+58Express/);
    assert.match(texto, /123456/);
    assert.match(texto, /No lo compartas/i);
    assert.ok(!/contrase|password|token|cedula/i.test(texto));
    assert.ok(!texto.includes('+584141234567') && !texto.includes('ana@x.co'), 'el destino no se repite dentro del texto');
  }
});
