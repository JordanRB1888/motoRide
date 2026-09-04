import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomInt } from 'node:crypto';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JWT_SECRET = 'integration-test-secret-auth-final-1-0123456789';

/**
 * Arranca el servidor sobre una base propia. `dataFile` permite arrancar dos
 * veces sobre la MISMA base, que es lo que hace real la prueba del relleno.
 */
async function startServer(t, { dataFile } = {}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-auth-final-'));
  const port = 26100 + Math.floor(Math.random() * 399);
  const fichero = dataFile ?? path.join(tempDir, 'database.json');
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: fichero, JWT_SECRET },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let salida = '';
  child.stdout.on('data', chunk => { salida += chunk; });
  child.stderr.on('data', chunk => { salida += chunk; });
  // En Windows un proceso matado sale con `signal` y `exitCode` null, asi que
  // «ya termino» se recuerda aqui: `parar()` se llama dos veces (a mano y en
  // el `after`) y la segunda no puede esperar un `exit` que ya paso.
  let termino = false;
  child.once('exit', () => { termino = true; });
  const parar = () => new Promise(resolve => {
    if (termino) return resolve();
    child.once('exit', () => resolve());
    child.kill();
  });
  t.after(parar);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 8000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}: ${salida}`)));
  });
  return { api: `http://127.0.0.1:${port}/api`, dataFile: fichero, salida: () => salida, parar };
}

const json = async (url, { method = 'GET', body, token } = {}) => {
  const respuesta = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: respuesta.status, cuerpo: await respuesta.json().catch(() => null) };
};

let contador = 0;
const nueva = (extra = {}) => {
  contador += 1;
  return {
    firstName: 'Rosa',
    lastName: 'Prueba',
    email: `rosa.${Date.now()}.${contador}@plus58.test`,
    // `randomInt` y no `Math.random`: el vigilante de bloques de puertos lee
    // la expresion `N + Math.floor(Math.random() * M)` y esto no es un puerto.
    phone: `0414${randomInt(1000000, 9999999)}`,
    password: 'ClaveSegura123',
    ...extra
  };
};

test('existing password login unchanged: registro, login por correo, telefono y mayusculas, y la misma forma de respuesta', async t => {
  const { api } = await startServer(t);
  const datos = nueva();
  const registro = await json(`${api}/auth/register`, { method: 'POST', body: datos });
  assert.equal(registro.status, 201);
  assert.equal(registro.cuerpo.status, 'created');

  const porCorreo = await json(`${api}/auth/login`, { method: 'POST', body: { identifier: datos.email, password: datos.password } });
  assert.equal(porCorreo.status, 200);
  assert.deepEqual(Object.keys(porCorreo.cuerpo).sort(), ['status', 'token', 'user']);
  assert.equal(porCorreo.cuerpo.status, 'success');
  assert.ok(!('passwordHash' in porCorreo.cuerpo.user));

  const porTelefono = await json(`${api}/auth/login`, { method: 'POST', body: { phone: datos.phone, password: datos.password } });
  assert.equal(porTelefono.status, 200);
  const enMayusculas = await json(`${api}/auth/login`, { method: 'POST', body: { email: datos.email.toUpperCase(), password: datos.password } });
  assert.equal(enMayusculas.status, 200);

  const mala = await json(`${api}/auth/login`, { method: 'POST', body: { identifier: datos.email, password: 'otra-cosa' } });
  assert.equal(mala.status, 401);
  assert.equal(mala.cuerpo.error, 'INVALID_CREDENTIALS');

  const yo = await json(`${api}/auth/me`, { token: porCorreo.cuerpo.token });
  assert.equal(yo.status, 200);
  assert.equal(yo.cuerpo.role, 'passenger');
});

test('new password User → passenger, con su identidad PASSWORD y sus dos contactos SIN verificar', async t => {
  const { api } = await startServer(t);
  const registro = await json(`${api}/auth/register`, { method: 'POST', body: nueva() });
  assert.equal(registro.cuerpo.user.role, 'passenger');
  const identidades = await json(`${api}/auth/identities`, { token: registro.cuerpo.token });
  assert.equal(identidades.status, 200);
  assert.deepEqual(identidades.cuerpo.identities.map(i => i.provider), ['PASSWORD']);
  assert.ok(!JSON.stringify(identidades.cuerpo).includes('providerSubject'), 'el subject no se expone');
  assert.deepEqual(
    identidades.cuerpo.contacts.map(c => [c.type, c.verified]).sort(),
    [['EMAIL', false], ['PHONE', false]]
  );
});

test('direct role driver registration → rejected, y el rol no se puede pedir por ningun campo', async t => {
  const { api } = await startServer(t);
  const conRol = await json(`${api}/auth/register`, { method: 'POST', body: nueva({ role: 'driver' }) });
  assert.equal(conRol.status, 400);
  assert.equal(conRol.cuerpo.error, 'VALIDATION_FAILED');
  assert.ok(conRol.cuerpo.fields.role);
  const conAdmin = await json(`${api}/auth/register`, { method: 'POST', body: nueva({ role: 'admin' }) });
  assert.equal(conAdmin.status, 400);
});

test('normalized email: el mismo correo con espacios y mayusculas es un duplicado', async t => {
  const { api } = await startServer(t);
  const datos = nueva();
  assert.equal((await json(`${api}/auth/register`, { method: 'POST', body: { ...datos, email: `  ${datos.email.toUpperCase()} ` } })).status, 201);
  const repetido = await json(`${api}/auth/register`, { method: 'POST', body: nueva({ email: datos.email }) });
  assert.equal(repetido.status, 409);
  assert.equal(repetido.cuerpo.error, 'USER_EXISTS');
});

test('normalized phone: el destino se normaliza antes de mirar al proveedor, y un telefono corto es invalido exista o no', async t => {
  const { api } = await startServer(t);
  const corto = await json(`${api}/auth/verification/send`, { method: 'POST', body: { channel: 'WHATSAPP', destination: '12', purpose: 'LOGIN' } });
  assert.equal(corto.status, 400);
  assert.equal(corto.cuerpo.error, 'INVALID_DESTINATION');
  const bueno = await json(`${api}/auth/verification/send`, { method: 'POST', body: { channel: 'WHATSAPP', destination: '0414-123.4567', purpose: 'LOGIN' } });
  assert.equal(bueno.status, 503, 'el destino era valido: llego hasta el proveedor, que no existe');
  assert.equal(bueno.cuerpo.error, 'VERIFICATION_PROVIDER_NOT_CONFIGURED');
});

test('no account enumeration: pedir un codigo responde IGUAL para un destino registrado y para uno que no existe', async t => {
  const { api } = await startServer(t);
  const datos = nueva();
  assert.equal((await json(`${api}/auth/register`, { method: 'POST', body: datos })).status, 201);
  const pedir = destination => json(`${api}/auth/verification/send`, { method: 'POST', body: { channel: 'WHATSAPP', destination, purpose: 'PASSWORD_RESET' } });
  const registrado = await pedir(datos.phone);
  const desconocido = await pedir('04140000001');
  assert.equal(registrado.status, desconocido.status);
  assert.deepEqual(registrado.cuerpo, desconocido.cuerpo);
  const porCorreo = await json(`${api}/auth/verification/send`, { method: 'POST', body: { channel: 'EMAIL', destination: datos.email, purpose: 'LOGIN' } });
  const porCorreoAjeno = await json(`${api}/auth/verification/send`, { method: 'POST', body: { channel: 'EMAIL', destination: 'nadie@plus58.test', purpose: 'LOGIN' } });
  assert.deepEqual(porCorreo, porCorreoAjeno);
});

test('los propositos con sesion exigen sesion, y un codigo desconocido no cuenta nada', async t => {
  const { api } = await startServer(t);
  for (const purpose of ['CHANGE_PHONE', 'CHANGE_EMAIL', 'ACCOUNT_LINK', 'SENSITIVE_ACTION']) {
    const sin = await json(`${api}/auth/verification/send`, { method: 'POST', body: { channel: 'WHATSAPP', destination: '04141234567', purpose } });
    assert.equal(sin.status, 401, purpose);
    assert.equal(sin.cuerpo.error, 'AUTH_REQUIRED');
  }
  const desconocido = await json(`${api}/auth/verification/verify`, { method: 'POST', body: { challengeId: 'chal_nada', code: '123456', purpose: 'LOGIN' } });
  assert.equal(desconocido.status, 400);
  assert.deepEqual(desconocido.cuerpo, { error: 'INVALID_CODE' });
  const proposito = await json(`${api}/auth/verification/verify`, { method: 'POST', body: { challengeId: 'chal_nada', code: '123456', purpose: 'ROBAR' } });
  assert.equal(proposito.status, 400);
  assert.equal(proposito.cuerpo.error, 'INVALID_PURPOSE');
});

test('Google y Apple responden 503 sin audiencia configurada, nunca aceptan un token, y vincular exige sesion', async t => {
  const { api } = await startServer(t);
  for (const proveedor of ['google', 'apple']) {
    const r = await json(`${api}/auth/social/${proveedor}`, { method: 'POST', body: { token: 'cualquier-cosa', email: 'x@y.co', provider: proveedor } });
    assert.equal(r.status, 503, proveedor);
    assert.equal(r.cuerpo.error, 'SOCIAL_PROVIDER_NOT_CONFIGURED');
  }
  assert.equal((await json(`${api}/auth/social/facebook`, { method: 'POST', body: { token: 'x' } })).status, 404);
  const vincular = await json(`${api}/auth/identities/link/google`, { method: 'POST', body: { token: 'x' } });
  assert.equal(vincular.status, 401);
  assert.equal((await json(`${api}/auth/identities`)).status, 401);
});

test('backfill PASSWORD: idempotente entre arranques, una identidad por User, y el motor rechaza el duplicado', async t => {
  const primero = await startServer(t);
  const datos = nueva();
  const registro = await json(`${primero.api}/auth/register`, { method: 'POST', body: datos });
  assert.equal(registro.status, 201);
  assert.match(primero.salida(), /identidades PASSWORD creadas al arrancar: 1/, 'la cuenta admin sembrada recibe la suya');
  await primero.parar();

  const segundo = await startServer(t, { dataFile: primero.dataFile });
  assert.ok(!/creadas al arrancar/.test(segundo.salida()), 'la segunda vez no crea ninguna');
  const login = await json(`${segundo.api}/auth/login`, { method: 'POST', body: { identifier: datos.email, password: datos.password } });
  assert.equal(login.status, 200, 'la cuenta sobrevive al reinicio y entra igual');
  const identidades = await json(`${segundo.api}/auth/identities`, { token: login.cuerpo.token });
  assert.deepEqual(identidades.cuerpo.identities.map(i => i.provider), ['PASSWORD']);
  await segundo.parar();

  const sqlite = new DatabaseSync(primero.dataFile);
  t.after(() => sqlite.close());
  assert.ok(sqlite.prepare("SELECT id FROM schemaMigrations WHERE id = '002_auth_identity_foundation.sql'").get(), 'la migracion se aplico');
  const filas = sqlite.prepare("SELECT payload FROM authIdentities").all().map(f => JSON.parse(f.payload));
  assert.equal(filas.filter(f => f.userId === registro.cuerpo.user.id).length, 1);
  assert.ok(filas.every(f => !('passwordHash' in f)), 'el hash no se duplica en la identidad');
  const existente = filas[0];
  assert.throws(
    () => sqlite.prepare('INSERT INTO authIdentities (id, payload) VALUES (?, ?)').run('authid_duplicado', JSON.stringify({ ...existente, id: 'authid_duplicado' })),
    /UNIQUE constraint failed/
  );
  const indices = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('authIdentities_provider_subject_unique', 'verifiedContacts_verified_owner_unique')").all();
  assert.equal(indices.length, 2);
});

test('no secret logs: ni el secreto de sesion, ni tokens, ni contrasenas aparecen en la salida del servidor', async t => {
  const servidor = await startServer(t);
  const datos = nueva();
  const registro = await json(`${servidor.api}/auth/register`, { method: 'POST', body: datos });
  await json(`${servidor.api}/auth/login`, { method: 'POST', body: { identifier: datos.email, password: datos.password } });
  await json(`${servidor.api}/auth/identities`, { token: registro.cuerpo.token });
  const salida = servidor.salida();
  assert.ok(!salida.includes(JWT_SECRET));
  assert.ok(!salida.includes(registro.cuerpo.token));
  assert.ok(!salida.includes(datos.password));
  assert.ok(!/Bearer /.test(salida));
  // AUTH-FINAL-2 cambió el contrato de correo de SMTP (cinco variables) a API
  // HTTP (dos: la clave y el remitente). El arranque sigue contando por NOMBRE
  // de variable, nunca por valor.
  assert.match(salida, /\[\+58express Auth\] verificacion: WHATSAPP=faltan 4, SMS=faltan 3, EMAIL=faltan 2; social: GOOGLE=sin audiencia, APPLE=sin audiencia/);
});
