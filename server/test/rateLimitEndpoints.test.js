import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'rate-limit-admin';

let escenario = null;

async function levantarServidor() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-ratelimit-http-'));
  const port = 17300 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'rate-limit-http-secret', ADMIN_PASSWORD
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let traza = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`El servidor no inició: ${traza}`)), 15000);
    child.stdout.on('data', chunk => {
      traza += chunk.toString();
      if (traza.includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', chunk => { traza += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}: ${traza}`)));
  });
  return { url: `http://127.0.0.1:${port}`, child };
}

const pedir = (url, token, ruta, options = {}) => fetch(`${url}${ruta}`, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
});

async function login(url, identifier, password, role) {
  const respuesta = await pedir(url, null, '/api/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier, password, role })
  });
  assert.equal(respuesta.status, 200, `Login fallido para ${identifier}`);
  return (await respuesta.json()).token;
}

async function preparar() {
  if (escenario) return escenario;
  const { url, child } = await levantarServidor();
  const adminToken = await login(url, 'admin@58express.com', ADMIN_PASSWORD, 'admin');

  // Dos pasajeros distintos, que en las pruebas salen de la misma direccion:
  // es justo el caso del NAT del operador.
  const pasajeros = [];
  for (const i of [0, 1]) {
    const respuesta = await pedir(url, null, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `limite${i}@ejemplo.com`, phone: `+58414990${String(i).padStart(4, '0')}`,
        password: 'password123', role: 'passenger', firstName: `Limite${i}`, lastName: 'Prueba'
      })
    });
    assert.equal(respuesta.status, 201);
    pasajeros.push(await respuesta.json());
  }

  escenario = { url, child, adminToken, pasajeros };
  return escenario;
}

/** Repite una peticion hasta agotarse, devolviendo cuantas pasaron. */
async function agotar(url, token, ruta, intentos) {
  let aceptadas = 0;
  let primerRechazo = null;
  for (let i = 0; i < intentos; i += 1) {
    const respuesta = await pedir(url, token, ruta);
    if (respuesta.status === 429) {
      if (!primerRechazo) primerRechazo = await respuesta.json();
      continue;
    }
    aceptadas += 1;
  }
  return { aceptadas, primerRechazo };
}

test.after(() => {
  if (escenario?.child) escenario.child.kill();
});

test('el cupo es por cuenta, no por direccion compartida', async () => {
  const { url, pasajeros } = await preparar();
  const [ana, luis] = pasajeros;

  // Ana agota su cupo de recargas, que es de veinte por cuarto de hora.
  let rechazada = false;
  for (let i = 0; i < 26; i += 1) {
    const respuesta = await pedir(url, ana.token, '/api/wallet/topups', {
      method: 'POST', body: JSON.stringify({ amountUSD: 1, reference: `r_${i}` })
    });
    if (respuesta.status === 429) { rechazada = true; break; }
  }
  assert.ok(rechazada, 'Ana debia acabar limitada');

  // Luis sale de la misma direccion y no debe verse afectado. Es el caso del
  // NAT del operador: un limitador por IP lo habria dejado fuera tambien.
  const respuesta = await pedir(url, luis.token, '/api/wallet/topups', {
    method: 'POST', body: JSON.stringify({ amountUSD: 1, reference: 'luis_1' })
  });
  assert.notEqual(respuesta.status, 429, 'Luis no comparte cupo con Ana');
});

test('la respuesta de rechazo es JSON y dice que limite se toco', async () => {
  const { url, pasajeros } = await preparar();
  const [ana] = pasajeros;
  // Ana ya esta limitada en cartera por la prueba anterior.
  const respuesta = await pedir(url, ana.token, '/api/wallet/topups', {
    method: 'POST', body: JSON.stringify({ amountUSD: 1, reference: 'otra' })
  });
  assert.equal(respuesta.status, 429);
  assert.match(respuesta.headers.get('content-type') || '', /application\/json/);

  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error, 'RATE_LIMITED');
  assert.equal(cuerpo.scope, 'cartera', 'debe decir que limite se toco');
  assert.ok(cuerpo.retryAfterMs > 0);
});

test('agotar un limite no cierra los demas', async () => {
  const { url, pasajeros } = await preparar();
  const [ana] = pasajeros;
  // La cartera esta agotada, pero leer notificaciones o su propio perfil no.
  for (const ruta of ['/api/auth/me', '/api/notifications/me', '/api/wallet/me']) {
    const respuesta = await pedir(url, ana.token, ruta);
    assert.notEqual(respuesta.status, 429, `${ruta} no deberia estar limitada`);
  }
});

test('los limites de lectura dejan trabajar con holgura', async () => {
  const { url, adminToken } = await preparar();
  // Doscientas lecturas seguidas del listado: muy por encima de lo que hace el
  // panel, y aun asi no debe cortarse.
  const { aceptadas } = await agotar(url, adminToken, '/api/trips?limit=8', 200);
  assert.equal(aceptadas, 200, `se cortaron ${200 - aceptadas} peticiones legitimas`);
});

test('la difusion, que escribe a toda la plataforma, es la mas estricta', async () => {
  const { url, adminToken } = await preparar();
  let rechazado = false;
  for (let i = 0; i < 14; i += 1) {
    const respuesta = await pedir(url, adminToken, '/api/admin/broadcasts', {
      method: 'POST', body: JSON.stringify({ title: `Aviso ${i}`, message: 'Prueba de limite' })
    });
    if (respuesta.status === 429) {
      rechazado = true;
      assert.equal((await respuesta.json()).scope, 'difusion');
      break;
    }
  }
  assert.ok(rechazado, 'un comunicado escribe una notificacion por persona: debe estar acotado');
});

test('las rutas anonimas se siguen contando por direccion', async () => {
  const { url } = await preparar();
  // Sin sesion no hay otra identidad a la que agarrarse. El limitador de
  // autenticacion ya existia; se comprueba que sigue en pie.
  let limitada = false;
  for (let i = 0; i < 40; i += 1) {
    const respuesta = await pedir(url, null, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `nadie${i}@ejemplo.com`, password: 'x', role: 'passenger' })
    });
    if (respuesta.status === 429) { limitada = true; break; }
  }
  assert.ok(limitada, 'el acceso anonimo debe seguir acotado por direccion');
});

test('no existe ningun limitador global aplicado a todas las rutas', async () => {
  const { url, adminToken } = await preparar();
  // Tras haber agotado varios limites concretos, una ruta de nivel 4 sigue
  // respondiendo: no hay un cubo comun que se vacie para todo.
  const respuesta = await pedir(url, adminToken, '/api/users?limit=5');
  assert.equal(respuesta.status, 200, 'las rutas sin limitador propio no deben verse arrastradas');
});
