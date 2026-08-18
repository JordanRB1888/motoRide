import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'auth-separation-admin';

/**
 * Habia un solo limitador montado sobre todo `/api/auth`, asi que login,
 * registro y la lectura de sesion compartian los mismos treinta intentos por
 * cuarto de hora. Como el cliente pide `GET /api/auth/me` en cada carga de la
 * aplicacion, bastaba con recargar unas cuantas veces para quedarse sin poder
 * entrar ni registrarse.
 *
 * Cada prueba que agota un cubo necesita su propio servidor: el contador vive
 * en memoria del proceso y las peticiones salen todas de la misma direccion.
 */

const LOGIN_LIMITE = 30;
const REGISTRO_LIMITE = 20;

const arrancados = [];

async function levantarServidor(bloque) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-authsep-'));
  const port = bloque + Math.floor(Math.random() * 190);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'auth-separation-secret', ADMIN_PASSWORD
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

const pedir = (url, ruta, options = {}) => fetch(`${url}${ruta}`, {
  ...options,
  headers: { 'content-type': 'application/json', ...(options.headers || {}) }
});

let contador = 0;
const identidadNueva = () => {
  contador += 1;
  return {
    email: `separacion${contador}.${Date.now()}@ejemplo.com`,
    phone: `+58414${String(3000000 + contador).slice(0, 7)}`,
    password: 'ContrasenaValida1',
    role: 'passenger',
    firstName: `Separacion${contador}`,
    lastName: 'Prueba'
  };
};

const intentarLogin = (url, sufijo = '') => pedir(url, '/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ identifier: `nadie${sufijo}@ejemplo.com`, password: 'x', role: 'passenger' })
});

const intentarRegistro = url => pedir(url, '/api/auth/register', {
  method: 'POST', body: JSON.stringify(identidadNueva())
});

test.after(() => {
  for (const child of arrancados) child.kill();
});

// ------------------------------------------------- separacion de los cubos

test('agotar el login no impide registrarse', async () => {
  const url = await levantarServidor(18100);

  let limitado = false;
  for (let i = 0; i < LOGIN_LIMITE + 3; i += 1) {
    const respuesta = await intentarLogin(url, i);
    if (respuesta.status === 429) { limitado = true; break; }
  }
  assert.ok(limitado, 'el login debia acabar limitado');

  // Con el cubo de credenciales agotado, crear una cuenta debe seguir siendo
  // posible: son finalidades distintas.
  const registro = await intentarRegistro(url);
  assert.equal(registro.status, 201, `el registro quedó bloqueado por el login (HTTP ${registro.status})`);
});

test('agotar el registro no impide iniciar sesión', async () => {
  const url = await levantarServidor(18300);

  let limitado = false;
  for (let i = 0; i < REGISTRO_LIMITE + 3; i += 1) {
    const respuesta = await intentarRegistro(url);
    if (respuesta.status === 429) { limitado = true; break; }
  }
  assert.ok(limitado, 'el registro debia acabar limitado');

  // Y quien ya tiene cuenta debe poder entrar.
  const login = await pedir(url, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'admin@58express.com', password: ADMIN_PASSWORD, role: 'admin' })
  });
  assert.equal(login.status, 200, `el login quedó bloqueado por el registro (HTTP ${login.status})`);
});

// --------------------------------------- la lectura de sesión no gasta cupo

test('GET /api/auth/me no consume el cupo de login ni el de registro', async () => {
  const url = await levantarServidor(18500);

  const login = await pedir(url, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'admin@58express.com', password: ADMIN_PASSWORD, role: 'admin' })
  });
  assert.equal(login.status, 200);
  const token = (await login.json()).token;

  const restantes = async (ruta, options) => {
    const respuesta = await pedir(url, ruta, options);
    return Number(respuesta.headers.get('ratelimit-remaining'));
  };

  // Estado de cada cubo antes: se mide sin consumir el otro.
  const loginAntes = Number((await intentarLogin(url, 'antes')).headers.get('ratelimit-remaining'));

  // Veinte lecturas de sesión, que es lo que hace recargar la aplicación
  // veinte veces. Antes bastaban para acercarse al tope compartido.
  for (let i = 0; i < 20; i += 1) {
    const respuesta = await pedir(url, '/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(respuesta.status, 200, 'la lectura de sesión debe seguir funcionando');
  }

  const loginDespues = Number((await intentarLogin(url, 'despues')).headers.get('ratelimit-remaining'));
  // Solo deben haberse gastado los dos intentos de login de esta prueba.
  assert.equal(
    loginAntes - loginDespues, 1,
    `veinte lecturas de sesión consumieron ${loginAntes - loginDespues - 1} intentos de login de más`
  );

  // Y el registro tampoco se ve afectado.
  const registro = await intentarRegistro(url);
  assert.equal(registro.status, 201);
  assert.equal(
    Number(registro.headers.get('ratelimit-limit')), REGISTRO_LIMITE,
    'el registro debe contar contra su propio tope'
  );
});

test('cada cubo declara su propio tope', async () => {
  const url = await levantarServidor(18700);

  const login = await intentarLogin(url, 'topes');
  const registro = await intentarRegistro(url);

  assert.equal(Number(login.headers.get('ratelimit-limit')), LOGIN_LIMITE);
  assert.equal(Number(registro.headers.get('ratelimit-limit')), REGISTRO_LIMITE);
  // Que los topes difieran ya demuestra que no son el mismo contador.
  assert.notEqual(LOGIN_LIMITE, REGISTRO_LIMITE);
});

// ------------------------------------------------------- forma del rechazo

test('el 429 del login es JSON, no texto plano', async () => {
  const url = await levantarServidor(18900);

  let rechazo = null;
  for (let i = 0; i < LOGIN_LIMITE + 3; i += 1) {
    const respuesta = await intentarLogin(url, i);
    if (respuesta.status === 429) { rechazo = respuesta; break; }
  }
  assert.ok(rechazo, 'el login debia acabar limitado');

  assert.match(rechazo.headers.get('content-type') || '', /application\/json/,
    'un texto plano rompe al cliente, que espera JSON');
  const cuerpo = await rechazo.json();
  assert.equal(cuerpo.error, 'RATE_LIMITED');
  assert.equal(cuerpo.scope, 'login', 'debe decir qué límite se tocó');
  assert.ok(cuerpo.retryAfterMs > 0);

  // Cabecera estándar de reintento.
  const retryAfter = Number(rechazo.headers.get('retry-after'));
  assert.ok(Number.isInteger(retryAfter) && retryAfter > 0, `Retry-After inválido: ${retryAfter}`);
  // Y las cabeceras estándar del limitador siguen presentes.
  assert.equal(Number(rechazo.headers.get('ratelimit-remaining')), 0);
  assert.ok(rechazo.headers.get('ratelimit-policy'));
});

test('el 429 del registro es JSON, no texto plano', async () => {
  const url = await levantarServidor(19100);

  let rechazo = null;
  for (let i = 0; i < REGISTRO_LIMITE + 3; i += 1) {
    const respuesta = await intentarRegistro(url);
    if (respuesta.status === 429) { rechazo = respuesta; break; }
  }
  assert.ok(rechazo, 'el registro debia acabar limitado');

  assert.match(rechazo.headers.get('content-type') || '', /application\/json/);
  const cuerpo = await rechazo.json();
  assert.equal(cuerpo.error, 'RATE_LIMITED');
  assert.equal(cuerpo.scope, 'registro');
  assert.ok(Number(rechazo.headers.get('retry-after')) > 0);
});

test('ninguna ruta de /api/auth queda sin protección tras retirar el limitador global', async () => {
  const url = await levantarServidor(19300);
  const login = await pedir(url, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'admin@58express.com', password: ADMIN_PASSWORD, role: 'admin' })
  });
  const token = (await login.json()).token;

  // Al quitar `app.use('/api/auth', ...)` estas dos podrían haberse quedado
  // sin ningún techo.
  const lectura = await pedir(url, '/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
  assert.ok(lectura.headers.get('ratelimit-limit'), 'GET /auth/me debe seguir teniendo tope propio');

  const edicion = await pedir(url, '/api/auth/me', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ firstName: 'Prueba' })
  });
  assert.ok(edicion.headers.get('ratelimit-limit'), 'PATCH /auth/me debe seguir teniendo tope propio');

  // Y sus topes son distintos de los de credenciales: no comparten cubo.
  assert.notEqual(Number(lectura.headers.get('ratelimit-limit')), LOGIN_LIMITE);
});
