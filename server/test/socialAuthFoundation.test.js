import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createAuthRouter } from '../routes/auth.js';
import { createAuthIdentityStore } from '../services/authIdentityStore.js';
import { createVerificationService } from '../services/verificationChallenges.js';
import { crearProveedores } from '../services/verificationProviders.js';
import { crearVerificadorSocial } from '../services/socialTokenVerifier.js';
import { AUTO_MERGE_BY_EMAIL, DECISION, ROL_DE_USUARIO_SOCIAL_NUEVO, decidirVinculacion } from '../domain/accountLinking.js';
import { CONTRATOS, RECHAZO, validarClaims } from '../domain/socialToken.js';

/**
 * El router REAL montado en un express de pruebas, con el verificador REAL
 * apuntando a un JWKS generado aqui. Lo unico simulado es quien emitio la
 * clave: la verificacion de firma, emisor, audiencia y vencimiento es la que
 * correra en produccion.
 */
const JWT_SECRET = 'secreto-de-sesion-para-pruebas-sociales-0123456789';
const GOOGLE_AUD = 'plus58express-google-client-id';
const APPLE_AUD = 'com.plus58express.app';

const claves = {
  google: generateKeyPairSync('rsa', { modulusLength: 2048 }),
  apple: generateKeyPairSync('rsa', { modulusLength: 2048 }),
  ajena: generateKeyPairSync('rsa', { modulusLength: 2048 })
};
const jwk = (par, kid) => ({ ...par.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });
const JWKS = {
  GOOGLE: { keys: [jwk(claves.google, 'google-k1')] },
  APPLE: { keys: [jwk(claves.apple, 'apple-k1')] }
};

function tokenDeGoogle({ sub, email, emailVerified = true, aud = GOOGLE_AUD, iss = 'https://accounts.google.com', key = claves.google.privateKey, kid = 'google-k1', expiresIn = '5m', algorithm = 'RS256' } = {}) {
  const claims = { sub, ...(email ? { email, email_verified: emailVerified } : {}) };
  return jwt.sign(claims, key, { algorithm, keyid: kid, issuer: iss, audience: aud, expiresIn });
}

function tokenDeApple({ sub, email, aud = APPLE_AUD, key = claves.apple.privateKey, kid = 'apple-k1', expiresIn = '5m' } = {}) {
  const claims = { sub, ...(email ? { email, email_verified: 'true' } : {}) };
  return jwt.sign(claims, key, { algorithm: 'RS256', keyid: kid, issuer: 'https://appleid.apple.com', audience: aud, expiresIn });
}

async function montar(t, { audiencias = { GOOGLE_OAUTH_CLIENT_IDS: GOOGLE_AUD, APPLE_SIGN_IN_AUDIENCES: APPLE_AUD } } = {}) {
  const database = { users: [], authIdentities: [], verifiedContacts: [], authChallenges: [] };
  const identidad = createAuthIdentityStore({ database });
  const proveedores = crearProveedores({ env: {} });
  const verificacion = createVerificationService({ database, secreto: JWT_SECRET, proveedores });
  const verificadorSocial = crearVerificadorSocial({ env: audiencias, obtenerJwks: async provider => JWKS[provider] });
  const signToken = user => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  const publicUser = user => { const { passwordHash, ...resto } = user; return resto; };
  const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = database.users.find(u => u.id === payload.sub);
      if (!user) return res.status(401).json({ error: 'INVALID_SESSION' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'INVALID_SESSION' });
    }
  };
  const sesionOpcional = (req, _res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = database.users.find(u => u.id === payload.sub);
        if (user && user.accountStatus !== 'DISABLED') req.user = user;
      } catch { /* visitante */ }
    }
    next();
  };
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
  const port = 26500 + Math.floor(Math.random() * 399);
  const server = await new Promise(resolve => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const api = `http://127.0.0.1:${port}/api`;
  const json = async (ruta, { method = 'POST', body, token } = {}) => {
    const r = await fetch(`${api}${ruta}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: r.status, cuerpo: await r.json().catch(() => null) };
  };
  const crearUsuarioConContrasena = async ({ email, phone = '04141234567', password = 'ClaveSegura123' }) => {
    const user = {
      id: `passenger_${database.users.length + 1}`,
      role: 'passenger',
      firstName: 'Ana',
      lastName: 'Prueba',
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 4),
      accountStatus: 'ACTIVE'
    };
    database.users.push(user);
    identidad.identidades.asegurarDeContrasena(user);
    return { user, token: signToken(user) };
  };
  return { database, identidad, json, signToken, crearUsuarioConContrasena };
}

// ---------------------------------------------------------------------------
// La politica, en puro
// ---------------------------------------------------------------------------

test('AUTO_MERGE_BY_EMAIL = NO, y la decision de vinculacion lo cumple', () => {
  assert.equal(AUTO_MERGE_BY_EMAIL, false);
  assert.equal(ROL_DE_USUARIO_SOCIAL_NUEVO, 'passenger');
  const existente = { userId: 'u1' };
  assert.equal(decidirVinculacion({ identidadExistente: existente, usuarioDeSesion: null, usuarioPorCorreo: null }).decision, DECISION.LOGIN_EXISTING);
  assert.equal(decidirVinculacion({ identidadExistente: existente, usuarioDeSesion: { id: 'u1' }, usuarioPorCorreo: null }).decision, DECISION.LOGIN_EXISTING);
  assert.equal(decidirVinculacion({ identidadExistente: existente, usuarioDeSesion: { id: 'u2' }, usuarioPorCorreo: null }).decision, DECISION.CONFLICT);
  assert.equal(decidirVinculacion({ identidadExistente: null, usuarioDeSesion: { id: 'u2' }, usuarioPorCorreo: { id: 'u9' } }).decision, DECISION.LINK_TO_SESSION, 'la sesion es la prueba');
  assert.equal(decidirVinculacion({ identidadExistente: null, usuarioDeSesion: null, usuarioPorCorreo: { id: 'u9' } }).decision, DECISION.LINK_REQUIRES_PROOF, 'sin sesion, el correo no basta');
  assert.equal(decidirVinculacion({ identidadExistente: null, usuarioDeSesion: null, usuarioPorCorreo: null }).decision, DECISION.CREATE_USER);
});

test('los claims se validan contra el contrato de cada proveedor', () => {
  const ahora = new Date('2026-09-04T12:00:00Z');
  const exp = Math.floor(ahora.getTime() / 1000) + 60;
  const ok = validarClaims({ provider: 'GOOGLE', claims: { iss: 'accounts.google.com', aud: [GOOGLE_AUD], exp, sub: '1', email: ' A@B.CO ' }, audiencias: [GOOGLE_AUD], now: ahora });
  assert.deepEqual(ok, { ok: true, subject: '1', email: 'a@b.co', emailVerified: false });
  const con = claims => validarClaims({ provider: 'APPLE', claims, audiencias: [APPLE_AUD], now: ahora }).motivo;
  assert.equal(con({ iss: 'https://accounts.google.com', aud: APPLE_AUD, exp, sub: '1' }), RECHAZO.EMISOR);
  assert.equal(con({ iss: 'https://appleid.apple.com', aud: 'otra-app', exp, sub: '1' }), RECHAZO.AUDIENCIA);
  assert.equal(con({ iss: 'https://appleid.apple.com', aud: APPLE_AUD, exp: exp - 120, sub: '1' }), RECHAZO.VENCIDO);
  assert.equal(con({ iss: 'https://appleid.apple.com', aud: APPLE_AUD, exp, sub: '' }), RECHAZO.SIN_SUBJECT);
  assert.equal(con(null), RECHAZO.MAL_FORMADO);
  assert.deepEqual([...CONTRATOS.GOOGLE.configuracion, ...CONTRATOS.APPLE.configuracion], ['GOOGLE_OAUTH_CLIENT_IDS', 'APPLE_SIGN_IN_AUDIENCES']);
});

// ---------------------------------------------------------------------------
// El router con el verificador real
// ---------------------------------------------------------------------------

test('new Google user role passenger: nace pasajero, con identidad GOOGLE y el correo del token como contacto SIN verificar', async t => {
  const { database, json } = await montar(t);
  const r = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-1', email: 'Nueva@Gmail.com' }), firstName: 'Nueva', lastName: 'Persona' } });
  assert.equal(r.status, 201);
  assert.equal(r.cuerpo.status, 'created');
  assert.equal(r.cuerpo.user.role, 'passenger');
  assert.equal(r.cuerpo.user.email, 'nueva@gmail.com');
  assert.ok(!('passwordHash' in r.cuerpo.user));
  assert.equal(database.authIdentities.filter(i => i.provider === 'GOOGLE' && i.providerSubject === 'g-1').length, 1);
  assert.deepEqual(database.verifiedContacts.map(c => [c.type, c.valueNormalized, c.verifiedAt]), [['EMAIL', 'nueva@gmail.com', null]]);
  const lista = await json('/auth/identities', { method: 'GET', token: r.cuerpo.token });
  assert.deepEqual(lista.cuerpo.identities.map(i => i.provider), ['GOOGLE']);
  assert.deepEqual(lista.cuerpo.contacts, [{ type: 'EMAIL', verified: false, verifiedAt: null }]);
});

test('new Apple user role passenger: aunque Apple oculte el correo, nace pasajero', async t => {
  const { database, json } = await montar(t);
  const r = await json('/auth/social/apple', { body: { identityToken: tokenDeApple({ sub: 'a-1' }) } });
  assert.equal(r.status, 201);
  assert.equal(r.cuerpo.user.role, 'passenger');
  assert.equal(r.cuerpo.user.email, null);
  assert.equal(database.authIdentities[0].provider, 'APPLE');
  assert.equal(database.verifiedContacts.length, 0);
});

test('Driver intent never authority: role, driverIntent y provider del cuerpo no cambian nada', async t => {
  const { database, json } = await montar(t);
  const r = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-2' }), role: 'driver', driverIntent: true, provider: 'google', email: 'otro@x.co', name: 'Impostor' } });
  assert.equal(r.status, 201);
  assert.equal(r.cuerpo.user.role, 'passenger');
  assert.equal(database.users[0].role, 'passenger');
  assert.equal(database.users[0].email, null, 'el correo del cuerpo no vale: solo el del token');
});

test('same Google subject → same identity: entrar dos veces no crea otro User ni otra identidad', async t => {
  const { database, json } = await montar(t);
  const primera = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-3', email: 'g3@x.co' }) } });
  assert.equal(primera.status, 201);
  const antes = database.authIdentities[0].lastUsedAt;
  await new Promise(resolve => setTimeout(resolve, 5));
  const segunda = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-3', email: 'cambiado@x.co' }) } });
  assert.equal(segunda.status, 200);
  assert.equal(segunda.cuerpo.status, 'success');
  assert.equal(segunda.cuerpo.user.id, primera.cuerpo.user.id);
  assert.equal(database.users.length, 1);
  assert.equal(database.authIdentities.length, 1);
  assert.notEqual(database.authIdentities[0].lastUsedAt, antes);
  assert.equal(database.users[0].email, 'g3@x.co', 'el correo cambiado en Google no reescribe la cuenta');
});

test('same Apple subject → same identity', async t => {
  const { database, json } = await montar(t);
  const primera = await json('/auth/social/apple', { body: { token: tokenDeApple({ sub: 'a-3', email: 'relay@privaterelay.appleid.com' }) } });
  const segunda = await json('/auth/social/apple', { body: { token: tokenDeApple({ sub: 'a-3' }) } });
  assert.equal(segunda.status, 200);
  assert.equal(segunda.cuerpo.user.id, primera.cuerpo.user.id);
  assert.equal(database.users.length, 1);
});

test('no auto-merge by email: la cuenta con contrasena y ese correo no se entrega al token de Google', async t => {
  const { database, json, crearUsuarioConContrasena } = await montar(t);
  await crearUsuarioConContrasena({ email: 'ana@x.co' });
  const r = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-4', email: 'ANA@x.co', emailVerified: true }) } });
  assert.equal(r.status, 409);
  assert.equal(r.cuerpo.error, 'ACCOUNT_LINK_REQUIRED');
  assert.ok(!('token' in r.cuerpo));
  assert.equal(database.users.length, 1, 'no se creo otro User');
  assert.equal(database.authIdentities.filter(i => i.provider === 'GOOGLE').length, 0, 'no se vinculo nada');
});

test('account linking needs proof: sin sesion 401; con sesion se vincula y desde entonces Google entra en ESA cuenta', async t => {
  const { database, json, crearUsuarioConContrasena } = await montar(t);
  const { user, token } = await crearUsuarioConContrasena({ email: 'ana@x.co' });
  const tokenGoogle = tokenDeGoogle({ sub: 'g-5', email: 'ana@x.co' });
  assert.equal((await json('/auth/identities/link/google', { body: { token: tokenGoogle } })).status, 401);
  const vinculo = await json('/auth/identities/link/google', { body: { token: tokenGoogle }, token });
  assert.equal(vinculo.status, 200);
  assert.equal(vinculo.cuerpo.status, 'linked');
  assert.deepEqual(vinculo.cuerpo.identities.map(i => i.provider).sort(), ['GOOGLE', 'PASSWORD']);
  const entrada = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-5' }) } });
  assert.equal(entrada.status, 200);
  assert.equal(entrada.cuerpo.user.id, user.id);
  assert.equal(database.users.length, 1);
});

test('duplicate provider subject impossible: otra cuenta con sesion no puede vincular una identidad ajena, ni robarla entrando', async t => {
  const { database, identidad, json, crearUsuarioConContrasena } = await montar(t);
  const duena = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-6' }) } });
  assert.equal(duena.status, 201);
  const { token: tokenDeOtra } = await crearUsuarioConContrasena({ email: 'otra@x.co' });
  const robo = await json('/auth/identities/link/google', { body: { token: tokenDeGoogle({ sub: 'g-6' }) }, token: tokenDeOtra });
  assert.equal(robo.status, 409);
  assert.equal(robo.cuerpo.error, 'IDENTITY_TAKEN');
  const conSesionAjena = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-6' }) }, token: tokenDeOtra });
  assert.equal(conSesionAjena.status, 409);
  assert.equal(database.authIdentities.filter(i => i.providerSubject === 'g-6').length, 1);
  assert.throws(() => identidad.identidades.crear({ userId: 'cualquiera', provider: 'GOOGLE', providerSubject: 'g-6' }), { code: 'IDENTITY_TAKEN' });
});

test('un token invalido nunca crea nada: firma ajena, audiencia, emisor, vencido, algoritmo, sin token', async t => {
  const { database, json } = await montar(t);
  const casos = {
    'firma ajena': tokenDeGoogle({ sub: 'x', key: claves.ajena.privateKey }),
    'audiencia de otra app': tokenDeGoogle({ sub: 'x', aud: 'otra-app' }),
    'emisor falso': tokenDeGoogle({ sub: 'x', iss: 'https://accounts.google.com.evil' }),
    vencido: tokenDeGoogle({ sub: 'x', expiresIn: '-1m' }),
    'kid desconocido': tokenDeGoogle({ sub: 'x', kid: 'no-existe' }),
    'HS256 con secreto': jwt.sign({ sub: 'x' }, 'secreto', { algorithm: 'HS256', keyid: 'google-k1', issuer: 'https://accounts.google.com', audience: GOOGLE_AUD, expiresIn: '5m' }),
    'sin subject': tokenDeGoogle({ sub: undefined }),
    'token de Apple en la ruta de Google': tokenDeApple({ sub: 'x' }),
    basura: 'no.es.jwt'
  };
  for (const [nombre, token] of Object.entries(casos)) {
    const r = await json('/auth/social/google', { body: { token } });
    assert.equal(r.status, 401, nombre);
    assert.deepEqual(r.cuerpo, { error: 'INVALID_PROVIDER_TOKEN' }, `${nombre}: sin detalle`);
  }
  const sinToken = await json('/auth/social/google', { body: { email: 'x@y.co', name: 'X', provider: 'google', sub: 'g-99' } });
  assert.equal(sinToken.status, 401);
  assert.equal(database.users.length, 0);
  assert.equal(database.authIdentities.length, 0);
});

test('la lista de proveedores dice la verdad, y no habla de ninguna cuenta', async t => {
  const todos = await montar(t);
  const listado = await todos.json('/auth/social/providers', { method: 'GET' });
  assert.equal(listado.status, 200);
  assert.deepEqual(listado.cuerpo, {
    providers: [
      { provider: 'GOOGLE', available: true },
      { provider: 'APPLE', available: true }
    ]
  });

  // Sin audiencia configurada, ese proveedor NO se ofrece: la aplicación no
  // debe pintar un botón que sólo puede acabar en 503.
  const soloGoogle = await montar(t, { audiencias: { GOOGLE_OAUTH_CLIENT_IDS: GOOGLE_AUD } });
  const parcial = await soloGoogle.json('/auth/social/providers', { method: 'GET' });
  assert.deepEqual(parcial.cuerpo.providers, [
    { provider: 'GOOGLE', available: true },
    { provider: 'APPLE', available: false }
  ]);

  const ninguno = await montar(t, { audiencias: {} });
  const vacio = await ninguno.json('/auth/social/providers', { method: 'GET' });
  assert.ok(vacio.cuerpo.providers.every(p => p.available === false));
  // Es la lista de lo configurado: ni correos, ni identidades, ni usuarios.
  assert.ok(!/email|userId|sub|identit/i.test(JSON.stringify(vacio.cuerpo)));
});

test('proveedor sin audiencia configurada → 503, aunque el token sea perfecto', async t => {
  const { json } = await montar(t, { audiencias: { GOOGLE_OAUTH_CLIENT_IDS: GOOGLE_AUD } });
  assert.equal((await json('/auth/social/apple', { body: { token: tokenDeApple({ sub: 'a-9' }) } })).status, 503);
  assert.equal((await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-9' }) } })).status, 201);
});

test('una cuenta desactivada no entra por Google', async t => {
  const { database, json } = await montar(t);
  const alta = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-10' }) } });
  database.users.find(u => u.id === alta.cuerpo.user.id).accountStatus = 'DISABLED';
  const r = await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'g-10' }) } });
  assert.equal(r.status, 403);
  assert.equal(r.cuerpo.error, 'ACCOUNT_DISABLED');
});

test('double social callback safe: dos peticiones simultaneas con el mismo token → un User, una identidad', async t => {
  const { database, json } = await montar(t);
  const token = tokenDeGoogle({ sub: 'g-11', email: 'doble@x.co' });
  const [a, b] = await Promise.all([json('/auth/social/google', { body: { token } }), json('/auth/social/google', { body: { token } })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.cuerpo.user.id, b.cuerpo.user.id);
  assert.equal(database.users.length, 1);
  assert.equal(database.authIdentities.length, 1);
  assert.equal(database.verifiedContacts.length, 1);
});

test('double account link safe: dos vinculaciones simultaneas → una identidad', async t => {
  const { database, json, crearUsuarioConContrasena } = await montar(t);
  const { token } = await crearUsuarioConContrasena({ email: 'ana@x.co' });
  const tokenGoogle = tokenDeGoogle({ sub: 'g-12' });
  const [a, b] = await Promise.all([
    json('/auth/identities/link/google', { body: { token: tokenGoogle }, token }),
    json('/auth/identities/link/google', { body: { token: tokenGoogle }, token })
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(database.authIdentities.filter(i => i.provider === 'GOOGLE').length, 1);
});

test('no provider token logs: nada de lo que pasa por el router llega a la consola', async t => {
  const salidas = [];
  const originales = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originales[nivel] = console[nivel];
    console[nivel] = (...args) => salidas.push(args.map(String).join(' '));
  }
  try {
    const { json } = await montar(t);
    const token = tokenDeGoogle({ sub: 'g-13-subject-secreto', email: 'log@x.co' });
    await json('/auth/social/google', { body: { token } });
    await json('/auth/social/google', { body: { token: tokenDeGoogle({ sub: 'x', key: claves.ajena.privateKey }) } });
    const todo = salidas.join('\n');
    assert.ok(!todo.includes(token));
    assert.ok(!todo.includes('g-13-subject-secreto'));
    assert.ok(!/Bearer /.test(todo));
  } finally {
    for (const nivel of Object.keys(originales)) console[nivel] = originales[nivel];
  }
});
