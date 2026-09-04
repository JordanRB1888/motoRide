import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createAuthRouter } from '../routes/auth.js';
import { createAuthIdentityStore } from '../services/authIdentityStore.js';
import { createVerificationService } from '../services/verificationChallenges.js';
import { crearProveedores } from '../services/verificationProviders.js';
import { crearVerificadorSocial } from '../services/socialTokenVerifier.js';
import { POLITICA } from '../domain/otpChallenge.js';

/**
 * Las rutas de codigos con el router REAL y un proveedor de WhatsApp que, en
 * vez de enviar, captura. Es lo que hara un transporte de verdad: recibir el
 * codigo en claro una vez y no volver a verlo.
 */
const JWT_SECRET = 'secreto-de-sesion-para-pruebas-de-codigos-0123456789';
const WHATSAPP_ENV = {
  WHATSAPP_CLOUD_ACCESS_TOKEN: 'token-de-prueba',
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: '1000',
  WHATSAPP_OTP_TEMPLATE_NAME: 'otp',
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: 'es',
  SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASSWORD: 'p', EMAIL_FROM: 'no-reply@58express.com'
};

async function montar(t) {
  let ahora = new Date('2026-09-04T12:00:00.000Z');
  const now = () => ahora;
  const avanzar = ms => { ahora = new Date(ahora.getTime() + ms); };
  const entregados = [];
  const database = { users: [], authIdentities: [], verifiedContacts: [], authChallenges: [] };
  const identidad = createAuthIdentityStore({ database, now });
  const proveedores = crearProveedores({
    env: WHATSAPP_ENV,
    transporte: async (canal, peticion) => {
      const codigo = canal === 'WHATSAPP'
        ? peticion.body.template.components[0].parameters[0].text
        : peticion.message.text.match(/\d{6}/)[0];
      entregados.push({ canal, destino: canal === 'WHATSAPP' ? `+${peticion.body.to}` : peticion.message.to, codigo });
      return { delivered: true };
    }
  });
  const verificacion = createVerificationService({ database, secreto: JWT_SECRET, proveedores, now });
  const verificadorSocial = crearVerificadorSocial({ env: {}, obtenerJwks: async () => ({ keys: [] }) });
  const signToken = user => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  const publicUser = user => { const { passwordHash, ...resto } = user; return resto; };
  const sesionOpcional = (req, _res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        const user = database.users.find(u => u.id === jwt.verify(token, JWT_SECRET).sub);
        if (user && user.accountStatus !== 'DISABLED') req.user = user;
      } catch { /* visitante */ }
    }
    next();
  };
  const requireAuth = (req, res, next) => sesionOpcional(req, res, () => (req.user ? next() : res.status(401).json({ error: 'AUTH_REQUIRED' })));
  const pasa = (_req, _res, next) => next();
  const app = express();
  app.use(express.json());
  app.use('/api', createAuthRouter({
    database,
    persistDatabase: async () => true,
    publicUser,
    signToken,
    requireAuth,
    sesionOpcional,
    identidad,
    verificacion,
    verificadorSocial,
    limitadores: { desafio: pasa, verificacion: pasa, social: pasa, identidades: pasa },
    bcrypt,
    sanitizeText: (valor, max) => String(valor ?? '').trim().slice(0, max)
  }));
  const port = 26900 + Math.floor(Math.random() * 399);
  const server = await new Promise(resolve => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const api = `http://127.0.0.1:${port}/api`;
  const json = async (ruta, { method = 'POST', body, token } = {}) => {
    const r = await fetch(`${api}${ruta}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: r.status, cuerpo: await r.json().catch(() => null), retryAfter: r.headers.get('retry-after') };
  };
  const crearUsuario = async ({ email = null, phone = null, password = 'ClaveSegura123', accountStatus = 'ACTIVE' } = {}) => {
    const user = { id: `passenger_${database.users.length + 1}`, role: 'passenger', firstName: 'Ana', lastName: 'Prueba', email, phone, passwordHash: await bcrypt.hash(password, 4), accountStatus };
    database.users.push(user);
    identidad.identidades.asegurarDeContrasena(user);
    return { user, token: signToken(user) };
  };
  const pedir = (body, token) => json('/auth/verification/send', { body, token });
  const verificar = (body, token) => json('/auth/verification/verify', { body, token });
  const ultimoCodigo = () => entregados.at(-1).codigo;
  return { database, json, pedir, verificar, ultimoCodigo, entregados, avanzar, crearUsuario };
}

test('pedir un codigo responde 202 con la cuenta atras, sin el codigo ni el hash, y el proveedor lo recibe una vez', async t => {
  const { database, pedir, entregados } = await montar(t);
  const r = await pedir({ channel: 'WHATSAPP', destination: '0414 123 4567', purpose: 'SIGNUP' });
  assert.equal(r.status, 202);
  assert.equal(r.cuerpo.status, 'sent');
  assert.deepEqual(Object.keys(r.cuerpo).sort(), ['attemptsLeft', 'challengeId', 'channel', 'expiresInSeconds', 'purpose', 'resendAvailableInSeconds', 'status']);
  assert.equal(r.cuerpo.expiresInSeconds, 300);
  assert.equal(entregados.length, 1);
  assert.equal(entregados[0].destino, '+584141234567');
  assert.ok(!JSON.stringify(r.cuerpo).includes(entregados[0].codigo));
  assert.ok(!JSON.stringify(r.cuerpo).includes(database.authChallenges[0].codeHash));
});

test('SIGNUP: el codigo bueno demuestra posesion y no crea ninguna cuenta', async t => {
  const { database, pedir, verificar, ultimoCodigo } = await montar(t);
  const envio = await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'SIGNUP' });
  const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'SIGNUP' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo, { status: 'verified', purpose: 'SIGNUP', channel: 'WHATSAPP' });
  assert.equal(database.users.length, 0);
  assert.equal(database.verifiedContacts.length, 0, 'sin User no hay a quien atribuir el contacto');
});

test('un codigo equivocado descuenta intentos, el quinto agota, y el vencido dice que vencio', async t => {
  const { pedir, verificar, ultimoCodigo, avanzar } = await montar(t);
  const envio = await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'SIGNUP' });
  const malo = ultimoCodigo() === '000000' ? '000001' : '000000';
  for (let i = 1; i < POLITICA.INTENTOS_MAXIMOS; i += 1) {
    const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: malo, purpose: 'SIGNUP' });
    assert.equal(r.status, 400);
    assert.deepEqual(r.cuerpo, { error: 'INVALID_CODE', attemptsLeft: POLITICA.INTENTOS_MAXIMOS - i });
  }
  const agotado = await verificar({ challengeId: envio.cuerpo.challengeId, code: malo, purpose: 'SIGNUP' });
  assert.deepEqual(agotado.cuerpo, { error: 'CODE_EXHAUSTED' });
  assert.deepEqual((await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'SIGNUP' })).cuerpo, { error: 'INVALID_CODE' });

  avanzar(POLITICA.COOLDOWN_DE_REENVIO_MS + 1);
  const otro = await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'SIGNUP' });
  avanzar(POLITICA.TTL_MS);
  assert.deepEqual((await verificar({ challengeId: otro.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'SIGNUP' })).cuerpo, { error: 'CODE_EXPIRED' });
});

test('el enfriamiento de reenvio y el limite por destino llegan como 429 con Retry-After', async t => {
  const { pedir, avanzar } = await montar(t);
  assert.equal((await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'LOGIN' })).status, 202);
  const pronto = await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'LOGIN' });
  assert.equal(pronto.status, 429);
  assert.equal(pronto.cuerpo.error, 'RESEND_COOLDOWN');
  assert.equal(pronto.retryAfter, '60');
  for (let i = 0; i < 4; i += 1) {
    avanzar(POLITICA.COOLDOWN_DE_REENVIO_MS + 1);
    assert.equal((await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'LOGIN' })).status, 202);
  }
  avanzar(POLITICA.COOLDOWN_DE_REENVIO_MS + 1);
  const tope = await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'LOGIN' });
  assert.equal(tope.status, 429);
  assert.equal(tope.cuerpo.error, 'RATE_LIMITED');
});

test('LOGIN por codigo: con posesion demostrada entra la cuenta del telefono, y el contacto queda verificado', async t => {
  const { database, pedir, verificar, ultimoCodigo, crearUsuario } = await montar(t);
  const { user } = await crearUsuario({ phone: '0414-123-4567', email: 'ana@x.co' });
  const envio = await pedir({ channel: 'WHATSAPP', destination: '+58 414 1234567', purpose: 'LOGIN' });
  const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'LOGIN' });
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.status, 'success');
  assert.equal(r.cuerpo.user.id, user.id);
  assert.ok(!('passwordHash' in r.cuerpo.user));
  assert.equal(jwt.verify(r.cuerpo.token, JWT_SECRET).sub, user.id);
  assert.equal(user.phoneVerified, true);
  const contacto = database.verifiedContacts.find(c => c.userId === user.id && c.type === 'PHONE');
  assert.equal(contacto.valueNormalized, '+584141234567');
  assert.ok(contacto.verifiedAt);
});

test('LOGIN por codigo a un telefono sin cuenta: solo DESPUES del codigo se dice que no hay cuenta', async t => {
  const { pedir, verificar, ultimoCodigo } = await montar(t);
  const envio = await pedir({ channel: 'WHATSAPP', destination: '04140000000', purpose: 'LOGIN' });
  assert.equal(envio.status, 202, 'antes del codigo, responde como si existiera');
  const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'LOGIN' });
  assert.equal(r.status, 404);
  assert.equal(r.cuerpo.error, 'ACCOUNT_NOT_FOUND');
});

test('OTP purpose isolation por HTTP: un codigo de SIGNUP no entra como LOGIN', async t => {
  const { pedir, verificar, ultimoCodigo, crearUsuario } = await montar(t);
  await crearUsuario({ phone: '04141234567' });
  const envio = await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'SIGNUP' });
  const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'LOGIN' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.cuerpo, { error: 'INVALID_CODE' });
});

test('PASSWORD_RESET: la contrasena nueva se exige ANTES de gastar el codigo, y despues la vieja ya no vale', async t => {
  const { database, pedir, verificar, ultimoCodigo, crearUsuario } = await montar(t);
  const { user } = await crearUsuario({ email: 'ana@x.co', password: 'LaVieja12345' });
  const envio = await pedir({ channel: 'EMAIL', destination: 'ANA@x.co', purpose: 'PASSWORD_RESET' });
  assert.equal(envio.status, 202);
  const corta = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'PASSWORD_RESET', newPassword: 'corta' });
  assert.equal(corta.status, 400);
  assert.equal(corta.cuerpo.error, 'VALIDATION_FAILED');
  assert.equal(database.authChallenges[0].consumedAt, null, 'la peticion invalida no gasto el codigo');
  const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'PASSWORD_RESET', newPassword: 'LaNueva12345' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo, { status: 'password_reset' });
  assert.ok(await bcrypt.compare('LaNueva12345', user.passwordHash));
  assert.ok(!await bcrypt.compare('LaVieja12345', user.passwordHash));
  assert.equal(user.emailVerified, true);
  assert.equal(database.authIdentities.filter(i => i.provider === 'PASSWORD' && i.userId === user.id).length, 1, 'sigue habiendo una sola identidad PASSWORD');
});

test('CHANGE_PHONE: el numero nuevo se verifica primero; el cambio se aplica solo con el codigo bueno y con sesion', async t => {
  const { database, pedir, verificar, ultimoCodigo, crearUsuario } = await montar(t);
  const { user, token } = await crearUsuario({ phone: '04141111111' });
  assert.equal((await pedir({ channel: 'WHATSAPP', destination: '04142222222', purpose: 'CHANGE_PHONE' })).status, 401);
  const envio = await pedir({ channel: 'WHATSAPP', destination: '04142222222', purpose: 'CHANGE_PHONE' }, token);
  assert.equal(envio.status, 202);
  assert.equal(user.phone, '04141111111', 'pedir el codigo no cambia nada');
  const sinSesion = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'CHANGE_PHONE' });
  assert.equal(sinSesion.status, 401);
  const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'CHANGE_PHONE' }, token);
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.user.phone, '+584142222222');
  assert.equal(user.phoneVerified, true);
  assert.ok(database.verifiedContacts.find(c => c.userId === user.id && c.valueNormalized === '+584142222222').verifiedAt);
});

test('CHANGE_PHONE con sesion ajena: el desafio esta atado al User que lo pidio', async t => {
  const { pedir, verificar, ultimoCodigo, crearUsuario } = await montar(t);
  const { token: tokenA } = await crearUsuario({ phone: '04141111111' });
  const { token: tokenB } = await crearUsuario({ phone: '04143333333' });
  const envio = await pedir({ channel: 'WHATSAPP', destination: '04142222222', purpose: 'CHANGE_PHONE' }, tokenA);
  const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'CHANGE_PHONE' }, tokenB);
  assert.equal(r.status, 400);
  assert.deepEqual(r.cuerpo, { error: 'INVALID_CODE' });
});

test('CONTACT_TAKEN: un telefono verificado por otra cuenta no se reasigna con un codigo', async t => {
  const { pedir, verificar, ultimoCodigo, crearUsuario } = await montar(t);
  const { user: duena, token: tokenDuena } = await crearUsuario({ phone: '04141111111' });
  const primero = await pedir({ channel: 'WHATSAPP', destination: '04141111111', purpose: 'SENSITIVE_ACTION' }, tokenDuena);
  assert.equal((await verificar({ challengeId: primero.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'SENSITIVE_ACTION' }, tokenDuena)).status, 200);
  assert.equal(duena.phoneVerified, true);
  const { token: tokenOtra } = await crearUsuario({ phone: '04143333333' });
  const segundo = await pedir({ channel: 'WHATSAPP', destination: '04141111111', purpose: 'CHANGE_PHONE' }, tokenOtra);
  const r = await verificar({ challengeId: segundo.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'CHANGE_PHONE' }, tokenOtra);
  assert.equal(r.status, 409);
  assert.equal(r.cuerpo.error, 'CONTACT_TAKEN');
});

test('una cuenta desactivada no entra por codigo', async t => {
  const { pedir, verificar, ultimoCodigo, crearUsuario } = await montar(t);
  await crearUsuario({ phone: '04141234567', accountStatus: 'DISABLED' });
  const envio = await pedir({ channel: 'WHATSAPP', destination: '04141234567', purpose: 'LOGIN' });
  const r = await verificar({ challengeId: envio.cuerpo.challengeId, code: ultimoCodigo(), purpose: 'LOGIN' });
  assert.equal(r.status, 403);
  assert.equal(r.cuerpo.error, 'ACCOUNT_DISABLED');
});
