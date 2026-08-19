import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'nat-guard-admin';

/**
 * La guardia por direccion de /api/chat-media ya no cuenta los aciertos.
 *
 * La certificacion de 4B midio el problema: una pantalla de chat puede abrir
 * diez imagenes, y detras del NAT de un operador venezolano hay cientos de
 * personas haciendo lo mismo. Con 1200 por minuto contando todo, quinientas
 * personas pidiendo tres imagenes cada una --1500-- agotaban el cupo sin que
 * hubiera ningun abuso. Y como la respuesta viaja con `no-store`, cada
 * reapertura de la conversacion vuelve a pedirlas.
 *
 * `skipSuccessfulRequests` cambia lo que se cuenta, no cuanto: la peticion que
 * termina bien devuelve su permiso, y la que falla --401 sin sesion, 403 sin
 * acceso-- lo consume. Eso es exactamente lo que la guardia debe frenar. El uso
 * legitimo sigue acotado por `limitadores.archivos`, por cuenta, detras de
 * `requireAuth`.
 */

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'),
  Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), Buffer.from([0x1f, 0x15, 0xc4, 0x89])
]);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const UUID_AJENO = '11111111-2222-4333-8444-555555555555';

const arrancados = [];

async function levantarServidor(bloque, extra = {}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-nat-'));
  const port = bloque + Math.floor(Math.random() * 190);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'nat-guard-secret', ADMIN_PASSWORD,
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
  return { url: `http://127.0.0.1:${port}`, tempDir };
}

test.after(() => {
  for (const child of arrancados) child.kill();
});

let contador = 0;
async function registrarPasajero(url) {
  contador += 1;
  const respuesta = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `nat${contador}.${Date.now()}@ejemplo.com`,
      phone: `+58414${String(6000000 + contador).slice(0, 7)}`,
      password: 'ContrasenaValida1', role: 'passenger',
      firstName: `Nat${contador}`, lastName: 'Prueba'
    })
  });
  assert.equal(respuesta.status, 201);
  return respuesta.json();
}

/** Sube una imagen de soporte y devuelve su identificador público. */
async function subirAdjunto(url, token) {
  const respuesta = await fetch(`${url}/api/support/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: 'adjunto', image: PNG_URL })
  });
  assert.equal(respuesta.status, 201);
  return (await respuesta.json()).imageRef.id;
}

const medio = (url, id, token) => fetch(`${url}/api/chat-media/${id}/content`,
  token ? { headers: { authorization: `Bearer ${token}` } } : {});

// ------------------------------- los aciertos no consumen la guardia

test('cien descargas correctas no agotan una guardia de diez', async () => {
  // Con la guardia contando los aciertos, la undecima peticion seria un 429.
  const { url } = await levantarServidor(25900, { CHAT_MEDIA_GUARD_LIMIT: '10' });
  const { token } = await registrarPasajero(url);
  const id = await subirAdjunto(url, token);

  const estados = new Set();
  for (let i = 0; i < 100; i += 1) {
    estados.add((await medio(url, id, token)).status);
  }
  assert.deepEqual([...estados], [200],
    `cien lecturas legítimas debían devolver siempre 200; se vio ${[...estados]}`);
});

test('la guardia se mantiene intacta tras el uso legítimo', async () => {
  const { url } = await levantarServidor(26100, { CHAT_MEDIA_GUARD_LIMIT: '10' });
  const { token } = await registrarPasajero(url);
  const id = await subirAdjunto(url, token);

  for (let i = 0; i < 30; i += 1) await medio(url, id, token);

  // Y despues de todo eso, quien no tiene sesion sigue teniendo sus diez
  // intentos completos: los aciertos no le han robado cupo.
  const fallos = [];
  for (let i = 0; i < 20; i += 1) {
    const respuesta = await medio(url, id, null);
    fallos.push(respuesta.status);
    if (respuesta.status === 429) break;
  }
  const anteriores = fallos.filter(estado => estado === 401).length;
  assert.equal(anteriores, 10, `la guardia debía conservar sus diez, contó ${anteriores}`);
  assert.equal(fallos.at(-1), 429);
});

// ---------------------------------------- lo que falla sí consume

test('sin token, con token inválido y sin acceso: los tres consumen', async () => {
  for (const [etiqueta, bloque, hacer] of [
    ['sin token', 26300, (url, id) => medio(url, id, null)],
    ['token inválido', 26500, (url, id) => medio(url, id, 'basura.token.falso')],
    ['sin acceso (403)', 26700, (url) => medio(url, UUID_AJENO, null)]
  ]) {
    const { url } = await levantarServidor(bloque, { CHAT_MEDIA_GUARD_LIMIT: '5' });
    const { token } = await registrarPasajero(url);
    const id = await subirAdjunto(url, token);

    let rechazo = null;
    for (let i = 0; i < 15; i += 1) {
      const respuesta = await hacer(url, id);
      if (respuesta.status === 429) { rechazo = respuesta; break; }
    }
    assert.ok(rechazo, `«${etiqueta}» debía acabar limitado`);
    const cuerpo = await rechazo.json();
    assert.equal(cuerpo.scope, 'medios-previa', `«${etiqueta}» lo cortó otro limitador`);
  }
});

// -------------------------------- la capa por cuenta sigue en pie

test('el límite por cuenta sigue aplicándose a las descargas correctas', async () => {
  const { url } = await levantarServidor(26900, { CHAT_MEDIA_GUARD_LIMIT: '5000' });
  const { token } = await registrarPasajero(url);
  const id = await subirAdjunto(url, token);

  const respuesta = await medio(url, id, token);
  assert.equal(respuesta.status, 200);
  assert.equal(Number(respuesta.headers.get('ratelimit-limit')), 180,
    'debe seguir contando contra `archivos`');
  // Y consume de verdad: dos lecturas seguidas dejan menos margen que una.
  const primera = Number(respuesta.headers.get('ratelimit-remaining'));
  const segunda = Number((await medio(url, id, token)).headers.get('ratelimit-remaining'));
  assert.equal(primera - segunda, 1, 'el limitador por cuenta sí debe descontar los aciertos');
});

test('dos cuentas tras la misma dirección no comparten su cupo por cuenta', async () => {
  const { url } = await levantarServidor(27100, { CHAT_MEDIA_GUARD_LIMIT: '5000' });
  const primera = await registrarPasajero(url);
  const segunda = await registrarPasajero(url);
  const idPrimera = await subirAdjunto(url, primera.token);

  const restantes = async token => Number(
    (await medio(url, idPrimera, token)).headers.get('ratelimit-remaining')
  );

  const segundaAntes = await restantes(segunda.token);
  for (let i = 0; i < 10; i += 1) await restantes(primera.token);
  const segundaDespues = await restantes(segunda.token);

  assert.equal(segundaAntes - segundaDespues, 1,
    `diez lecturas de otra cuenta gastaron ${segundaAntes - segundaDespues - 1} de esta`);
});

// ------------------------------------- independencia de credenciales

test('agotar la guardia de medios no toca login, registro ni la de sesión', async () => {
  const { url } = await levantarServidor(27300, { CHAT_MEDIA_GUARD_LIMIT: '4' });
  const { token } = await registrarPasajero(url);

  // Se agota con peticiones que fallan.
  let rechazo = null;
  for (let i = 0; i < 15; i += 1) {
    const respuesta = await medio(url, UUID_AJENO, null);
    if (respuesta.status === 429) { rechazo = respuesta; break; }
  }
  assert.ok(rechazo, 'la guardia de medios debía cerrarse');

  const login = await fetch(`${url}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@58express.com', password: ADMIN_PASSWORD, role: 'admin' })
  });
  assert.equal(login.status, 200, 'el login quedó bloqueado por la guardia de medios');
  assert.equal(Number(login.headers.get('ratelimit-limit')), 30);

  const sesion = await fetch(`${url}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(sesion.status, 200, 'la lectura de sesión quedó bloqueada');
  assert.equal(Number(sesion.headers.get('ratelimit-limit')), 240);

  // Y la de medios sigue cerrada: no es que se haya reiniciado sola.
  assert.equal((await medio(url, UUID_AJENO, null)).status, 429);
});

// ------------------------------------------------ la opción, declarada

test('la guardia de medios declara que no cuenta los aciertos', () => {
  // Lo unico que no se puede observar desde fuera: que la opcion este puesta
  // en la guardia de medios y NO en la de sesion, donde el trafico legitimo es
  // una peticion por carga y no hace falta.
  const fuente = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');

  const medios = fuente.slice(fuente.indexOf('const guardiaMedios = createIdentityLimiter({'));
  assert.match(medios.slice(0, medios.indexOf('});')), /skipSuccessfulRequests:\s*true/,
    'la guardia de medios debe declararlo');

  const sesion = fuente.slice(fuente.indexOf('const guardiaSesion = createIdentityLimiter({'));
  assert.ok(!/skipSuccessfulRequests/.test(sesion.slice(0, sesion.indexOf('});'))),
    'la guardia de sesión no lo necesita y no debe copiarlo sin motivo');
});
