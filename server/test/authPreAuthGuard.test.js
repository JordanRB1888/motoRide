import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import express from 'express';
import { addressKey, createIdentityLimiter, identityKey, MINUTO } from '../services/httpRateLimit.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'preauth-guard-admin';

/**
 * Los limitadores de `/api/auth/me` van detras de `requireAuth`, porque
 * necesitan `req.user` para contar por cuenta. El efecto colateral es que una
 * peticion sin token --o con uno invalido-- muere en el 401 y nunca llega a
 * contarse: quedaba sin ningun techo. Antes del hotfix si lo tenia, porque el
 * limitador global de `/api/auth` corria por delante de todo.
 *
 * La prueba que decia cubrir esto solo miraba peticiones AUTENTICADAS, asi que
 * daba una cobertura falsa justo del caso que se rompio. Aqui se mira el otro
 * lado: el trafico que nunca se autentica.
 *
 * El tope real son 1200 por minuto. Lanzarlas de verdad en cada prueba seria
 * absurdo, asi que se baja por entorno --`AUTH_ME_GUARD_LIMIT`-- y se ejercita
 * el mismo codigo con numeros pequenos.
 */

const arrancados = [];

async function levantarServidor(bloque, extra = {}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-preauth-'));
  const port = bloque + Math.floor(Math.random() * 190);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'preauth-guard-secret', ADMIN_PASSWORD,
      ...extra
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  arrancados.push(child);
  let traza = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`El servidor no inició: ${traza}`)), 20000);
    child.stdout.on('data', chunk => {
      traza += chunk.toString();
      if (traza.includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', chunk => { traza += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}: ${traza}`)));
  });
  return `http://127.0.0.1:${port}`;
}

test.after(() => {
  for (const child of arrancados) child.kill();
});

const pedir = (url, ruta, options = {}) => fetch(`${url}${ruta}`, options);

const iniciarSesionAdmin = async url => {
  const respuesta = await pedir(url, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@58express.com', password: ADMIN_PASSWORD, role: 'admin' })
  });
  assert.equal(respuesta.status, 200, 'el administrador de prueba debe poder entrar');
  return (await respuesta.json()).token;
};

let contador = 0;
async function registrarPasajero(url) {
  contador += 1;
  const cuerpo = {
    email: `preauth${contador}.${Date.now()}@ejemplo.com`,
    phone: `+58414${String(4000000 + contador).slice(0, 7)}`,
    password: 'ContrasenaValida1',
    role: 'passenger',
    firstName: `Preauth${contador}`,
    lastName: 'Prueba'
  };
  const respuesta = await pedir(url, '/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo)
  });
  assert.equal(respuesta.status, 201, 'el alta de la persona de prueba debe funcionar');
  return (await respuesta.json()).token;
}

/** Repite una petición hasta toparse con el techo; devuelve lo observado. */
async function hastaElTecho(url, ruta, options, maximo) {
  const estadosPrevios = [];
  for (let i = 0; i < maximo; i += 1) {
    const respuesta = await pedir(url, ruta, options);
    if (respuesta.status === 429) return { rechazo: respuesta, estadosPrevios };
    estadosPrevios.push(respuesta.status);
  }
  return { rechazo: null, estadosPrevios };
}

// ------------------------------- el trafico que nunca llega a autenticarse

test('A) GET /api/auth/me sin cabecera Authorization acaba limitado', async () => {
  const url = await levantarServidor(19500, { AUTH_ME_GUARD_LIMIT: '6' });

  const { rechazo, estadosPrevios } = await hastaElTecho(url, '/api/auth/me', {}, 20);
  assert.ok(rechazo, 'sin token la ruta se puede martillear sin ningún techo');
  assert.equal(estadosPrevios.length, 6, `el techo llegó tras ${estadosPrevios.length} peticiones, no 6`);
});

test('B) GET /api/auth/me con un token inválido acaba limitado', async () => {
  const url = await levantarServidor(19700, { AUTH_ME_GUARD_LIMIT: '6' });

  // Tres formas de token que `requireAuth` rechaza antes de mirar nada más.
  for (const autorizacion of ['Bearer token-invalido', 'Bearer a.b.c', 'Bearer ']) {
    const respuesta = await pedir(url, '/api/auth/me', { headers: { authorization: autorizacion } });
    assert.equal(respuesta.status, 401, `«${autorizacion}» debería seguir siendo 401`);
  }

  const { rechazo } = await hastaElTecho(url, '/api/auth/me',
    { headers: { authorization: 'Bearer token-invalido' } }, 20);
  assert.ok(rechazo, 'un token basura permitía repetir sin límite');
});

test('C) PATCH /api/auth/me sin token acaba limitado', async () => {
  const url = await levantarServidor(19900, { AUTH_ME_GUARD_LIMIT: '6' });

  const { rechazo, estadosPrevios } = await hastaElTecho(url, '/api/auth/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firstName: 'X' })
  }, 20);
  assert.ok(rechazo, 'la edición de perfil sin token no tenía techo');
  assert.ok(estadosPrevios.every(estado => estado === 401), `estados previos: ${estadosPrevios}`);
});

test('D) POST /api/auth/me/photo sin token acaba limitado, sin subir nada', async () => {
  const url = await levantarServidor(20100, { AUTH_ME_GUARD_LIMIT: '6' });

  // Sin cuerpo: `requireAuth` corta antes de que multer llegue a leer nada, y
  // el techo tiene que aplicarse igualmente.
  const { rechazo, estadosPrevios } = await hastaElTecho(url, '/api/auth/me/photo', { method: 'POST' }, 20);
  assert.ok(rechazo, 'la subida de foto sin token no tenía techo');
  assert.ok(estadosPrevios.every(estado => estado === 401), `estados previos: ${estadosPrevios}`);

  const cuerpo = await rechazo.json();
  // Confirma que quien corta es la guardia previa, no el limitador de subidas,
  // que vive detras de `requireAuth` y aqui no se alcanza.
  assert.equal(cuerpo.scope, 'sesion-previa');
});

// --------------------------------------------------- forma de la respuesta

test('E) antes del techo la respuesta sigue siendo 401, no un 429 prematuro', async () => {
  const url = await levantarServidor(20300, { AUTH_ME_GUARD_LIMIT: '10' });

  const estados = [];
  for (let i = 0; i < 10; i += 1) {
    estados.push((await pedir(url, '/api/auth/me')).status);
  }
  assert.deepEqual(
    [...new Set(estados)], [401],
    `dentro del cupo solo debe haber 401; se vio ${JSON.stringify(estados)}`
  );

  // Y la siguiente, ya fuera de cupo, si cambia.
  assert.equal((await pedir(url, '/api/auth/me')).status, 429);
});

test('F+G) el rechazo es JSON con RATE_LIMITED y un Retry-After válido', async () => {
  const url = await levantarServidor(20500, { AUTH_ME_GUARD_LIMIT: '4' });

  const { rechazo } = await hastaElTecho(url, '/api/auth/me', {}, 20);
  assert.ok(rechazo, 'no se alcanzó el techo');

  assert.match(rechazo.headers.get('content-type') || '', /application\/json/,
    'un HTML o un texto plano rompería al cliente');
  const cuerpo = await rechazo.json();
  assert.equal(cuerpo.error, 'RATE_LIMITED');
  assert.equal(cuerpo.scope, 'sesion-previa', 'debe decir qué techo se tocó');
  assert.ok(cuerpo.retryAfterMs > 0);

  const retryAfter = Number(rechazo.headers.get('retry-after'));
  assert.ok(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 60,
    `Retry-After fuera de la ventana de un minuto: ${retryAfter}`);
});

// ------------------------------- la capa de cuenta sigue intacta detras

test('H) una sesión válida conserva sus limitadores por cuenta', async () => {
  // Guardia amplia: lo que se mira aquí es la capa de detrás.
  const url = await levantarServidor(20700, { AUTH_ME_GUARD_LIMIT: '5000' });
  const token = await iniciarSesionAdmin(url);
  const conSesion = { authorization: `Bearer ${token}` };

  const lectura = await pedir(url, '/api/auth/me', { headers: conSesion });
  assert.equal(lectura.status, 200);
  assert.equal(Number(lectura.headers.get('ratelimit-limit')), 240,
    'GET /me debe seguir contando contra el limitador de sesión, no contra la guardia');

  const edicion = await pedir(url, '/api/auth/me', {
    method: 'PATCH',
    headers: { ...conSesion, 'content-type': 'application/json' },
    body: JSON.stringify({ firstName: 'Prueba' })
  });
  assert.equal(Number(edicion.headers.get('ratelimit-limit')), 60,
    'PATCH /me debe seguir contando contra el limitador de perfil');

  // La subida sin fichero falla por el fichero que falta, no por autorización:
  // basta para comprobar que el limitador que la cubre es el de subidas.
  const foto = await pedir(url, '/api/auth/me/photo', { method: 'POST', headers: conSesion });
  assert.notEqual(foto.status, 401, 'la sesión es válida');
  assert.equal(Number(foto.headers.get('ratelimit-limit')), 30,
    'POST /me/photo debe seguir contando contra el limitador de subidas');

  // Ninguno de los tres es la guardia: si lo fuera, todos dirían 5000.
  for (const respuesta of [lectura, edicion, foto]) {
    assert.notEqual(Number(respuesta.headers.get('ratelimit-limit')), 5000,
      'la guardia por dirección sustituyó al limitador por cuenta');
  }
});

test('I) dos cuentas tras la misma dirección no comparten el cupo por cuenta', async () => {
  const url = await levantarServidor(20900, { AUTH_ME_GUARD_LIMIT: '5000' });
  const primera = await registrarPasajero(url);
  const segunda = await registrarPasajero(url);

  // Las dos salen de 127.0.0.1: si el conteo fuera por dirección --que es lo
  // que pasaría montando los limitadores de cuenta antes de `requireAuth`--,
  // gastar con una descontaría de la otra.
  const restantes = async token => Number(
    (await pedir(url, '/api/auth/me', { headers: { authorization: `Bearer ${token}` } }))
      .headers.get('ratelimit-remaining')
  );

  const segundaAntes = await restantes(segunda);
  for (let i = 0; i < 10; i += 1) await restantes(primera);
  const segundaDespues = await restantes(segunda);

  assert.equal(
    segundaAntes - segundaDespues, 1,
    `diez peticiones de otra cuenta gastaron ${segundaAntes - segundaDespues - 1} de esta`
  );
});

// ------------------------------------------- independencia de credenciales

test('J) agotar la guardia no bloquea ni consume login ni registro', async () => {
  const url = await levantarServidor(21100, { AUTH_ME_GUARD_LIMIT: '5' });

  const { rechazo } = await hastaElTecho(url, '/api/auth/me', {}, 20);
  assert.ok(rechazo, 'no se alcanzó el techo de la guardia');

  // Con la guardia agotada, las dos rutas de credenciales siguen enteras.
  const login = await pedir(url, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@58express.com', password: ADMIN_PASSWORD, role: 'admin' })
  });
  assert.equal(login.status, 200, `el login quedó bloqueado por la guardia (HTTP ${login.status})`);
  assert.equal(Number(login.headers.get('ratelimit-limit')), 30, 'con su propio tope');
  assert.equal(Number(login.headers.get('ratelimit-remaining')), 29,
    'la guardia no debe haber consumido intentos de login');

  const registro = await registrarPasajero(url);
  assert.ok(registro, 'el registro quedó bloqueado por la guardia');

  // Y la guardia sigue cerrada: no es que se haya reiniciado sola.
  assert.equal((await pedir(url, '/api/auth/me')).status, 429);
});

// ------------------------------------- el mecanismo de la clave, por unidad

/**
 * Dos mutaciones sobrevivieron a las pruebas de arriba: quitar
 * `keyGenerator: addressKey` de la guardia, y hacer que el factory ignore el
 * parametro. Las dos son equivalentes HOY --antes de `requireAuth` no existe
 * `req.user`, asi que `identityKey` acaba igualmente en la direccion-- pero
 * dejarian de serlo en cuanto alguien cambiara el orden de los middlewares,
 * que es justo el error que este archivo existe para impedir.
 *
 * Asi que el mecanismo se prueba aparte del efecto observable.
 */

test('addressKey ignora la sesión; identityKey no', () => {
  const conSesion = { ip: '203.0.113.7', user: { id: 'u1' } };
  assert.equal(addressKey(conSesion), 'ip:203.0.113.7', 'debe contar por dirección aunque haya sesión');
  assert.equal(identityKey(conSesion), 'user:u1', 'el otro sí distingue la cuenta');
  assert.equal(addressKey({ ip: '203.0.113.7' }), identityKey({ ip: '203.0.113.7' }),
    'sin sesión los dos coinciden: por eso la mutación no se veía');
});

test('createIdentityLimiter respeta el keyGenerator que se le pasa', async () => {
  // Se agrupa por una cabecera para que la clave sea observable desde fuera.
  const app = express();
  app.get('/prueba', createIdentityLimiter({
    name: 'unidad', limit: 2, windowMs: MINUTO,
    keyGenerator: req => `prueba:${req.headers['x-grupo'] || 'sin'}`
  }), (_req, res) => res.json({ ok: true }));

  const servidor = app.listen(21300 + Math.floor(Math.random() * 190));
  await new Promise(resolve => servidor.once('listening', resolve));
  const url = `http://127.0.0.1:${servidor.address().port}/prueba`;
  const pedirComo = grupo => fetch(url, { headers: { 'x-grupo': grupo } });

  try {
    assert.equal((await pedirComo('a')).status, 200);
    assert.equal((await pedirComo('a')).status, 200);
    assert.equal((await pedirComo('a')).status, 429, 'el tercero del grupo «a» debe caer');
    // Otro grupo estrena cupo: la clave se está usando de verdad.
    assert.equal((await pedirComo('b')).status, 200,
      'el factory ignoró el keyGenerator y agrupó por otra cosa');
  } finally {
    servidor.close();
  }
});

test('la guardia declara su clave explícitamente', () => {
  // Lo unico que no se puede observar desde fuera: que la guardia NO dependa
  // de que `identityKey` recaiga por casualidad en la direccion.
  const fuente = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  const inicio = fuente.indexOf('const guardiaSesion = createIdentityLimiter({');
  assert.notEqual(inicio, -1, 'no se encontró la guardia');
  const declaracion = fuente.slice(inicio, fuente.indexOf('});', inicio));
  assert.match(declaracion, /keyGenerator:\s*addressKey/,
    'la guardia debe pedir la clave por dirección, no confiar en el valor por omisión');
});
