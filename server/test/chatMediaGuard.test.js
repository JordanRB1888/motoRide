import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_PASSWORD = 'chat-media-guard-admin';

/**
 * Adaptacion de la infraestructura de adjuntos al master actual.
 *
 * El endpoint llegaba de una rama anterior a Phase 3A: con `requireAuth` pero
 * sin ningun limitador. Aqui se comprueban las dos capas que se le anadieron,
 * que son las mismas que protegen a `/api/auth/me` desde el hotfix:
 *
 *   guardia por direccion  ->  requireAuth  ->  limitador por cuenta  ->  ruta
 *
 * La de arriba existe porque la de abajo vive detras de `requireAuth` y por
 * tanto no ve el trafico que nunca llega a autenticarse. Es exactamente la
 * regresion que se encontro en `/api/auth/me`, y no se repite aqui.
 */

const arrancados = [];

async function levantarServidor(bloque, extra = {}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-media-'));
  const port = bloque + Math.floor(Math.random() * 190);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env, PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'chat-media-guard-secret', ADMIN_PASSWORD,
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

const UUID = '11111111-2222-4333-8444-555555555555';
const pedir = (url, ruta, options = {}) => fetch(`${url}${ruta}`, options);
const medio = (url, id = UUID, options = {}) => pedir(url, `/api/chat-media/${id}/content`, options);

const iniciarSesionAdmin = async url => {
  const respuesta = await pedir(url, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@58express.com', password: ADMIN_PASSWORD, role: 'admin' })
  });
  assert.equal(respuesta.status, 200);
  return (await respuesta.json()).token;
};

// ------------------------------------------- el trafico que no se autentica

test('sin token la ruta acaba limitada, no ilimitada', async () => {
  const { url } = await levantarServidor(21500, { CHAT_MEDIA_GUARD_LIMIT: '6' });

  const estados = [];
  let rechazo = null;
  for (let i = 0; i < 20; i += 1) {
    const respuesta = await medio(url);
    if (respuesta.status === 429) { rechazo = respuesta; break; }
    estados.push(respuesta.status);
  }
  assert.ok(rechazo, 'sin token la ruta se podía martillear sin techo');
  assert.equal(estados.length, 6, `el techo llegó tras ${estados.length} peticiones, no 6`);
  assert.deepEqual([...new Set(estados)], [401], 'dentro del cupo debe seguir siendo 401');
});

test('un token inválido tampoco escapa del techo', async () => {
  const { url } = await levantarServidor(21700, { CHAT_MEDIA_GUARD_LIMIT: '6' });

  for (const autorizacion of ['Bearer basura', 'Bearer a.b.c', 'Bearer ']) {
    const respuesta = await medio(url, UUID, { headers: { authorization: autorizacion } });
    assert.equal(respuesta.status, 401, `«${autorizacion}» debería ser 401`);
  }

  let rechazo = null;
  for (let i = 0; i < 20; i += 1) {
    const respuesta = await medio(url, UUID, { headers: { authorization: 'Bearer basura' } });
    if (respuesta.status === 429) { rechazo = respuesta; break; }
  }
  assert.ok(rechazo, 'un token basura permitía repetir sin límite');
  const cuerpo = await rechazo.json();
  assert.equal(cuerpo.error, 'RATE_LIMITED');
  assert.equal(cuerpo.scope, 'medios-previa', 'quien corta debe ser la guardia previa');
  const retryAfter = Number(rechazo.headers.get('retry-after'));
  assert.ok(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 60, `Retry-After: ${retryAfter}`);
  assert.match(rechazo.headers.get('content-type') || '', /application\/json/);
});

// --------------------------------------------------- la capa por cuenta

test('con sesión válida cuenta el limitador de archivos, no la guardia', async () => {
  const { url } = await levantarServidor(21900, { CHAT_MEDIA_GUARD_LIMIT: '5000' });
  const token = await iniciarSesionAdmin(url);

  const respuesta = await medio(url, UUID, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(
    Number(respuesta.headers.get('ratelimit-limit')), 180,
    'debe contar contra `archivos`, la misma categoría que la foto de perfil'
  );
  assert.notEqual(Number(respuesta.headers.get('ratelimit-limit')), 5000,
    'la guardia por dirección sustituyó al limitador por cuenta');
});

test('la foto de perfil y el adjunto comparten categoría de limitador', async () => {
  // Las dos leen de disco en cada peticion: si una cambia de categoria y la
  // otra no, el criterio se ha roto.
  const { url } = await levantarServidor(22100, { CHAT_MEDIA_GUARD_LIMIT: '5000' });
  const token = await iniciarSesionAdmin(url);
  const cabeceras = { authorization: `Bearer ${token}` };

  const foto = await pedir(url, '/api/users/cualquiera/photo', { headers: cabeceras });
  const adjunto = await medio(url, UUID, { headers: cabeceras });
  assert.equal(
    foto.headers.get('ratelimit-limit'), adjunto.headers.get('ratelimit-limit'),
    'ambas descargas privadas deben compartir tope'
  );
});

// ------------------------------------------------------- no filtrar nada

test('la respuesta no distingue inexistente, malformado ni ajeno', async () => {
  const { url } = await levantarServidor(22300, { CHAT_MEDIA_GUARD_LIMIT: '5000' });
  const token = await iniciarSesionAdmin(url);
  const cabeceras = { authorization: `Bearer ${token}` };

  const respuestas = [];
  for (const id of [
    UUID,                                        // bien formado, inexistente
    'no-es-un-uuid',                             // malformado
    '../../../etc/passwd',                       // intento de ascenso
    '11111111-2222-1333-8444-555555555555',      // UUID v1, no v4
    '11111111-2222-4333-c444-555555555555'       // variante incorrecta
  ]) {
    const respuesta = await medio(url, encodeURIComponent(id), { headers: cabeceras });
    respuestas.push({ id, status: respuesta.status, cuerpo: await respuesta.json().catch(() => null) });
  }

  const estados = [...new Set(respuestas.map(r => r.status))];
  assert.deepEqual(estados, [403], `deben ser todas iguales; se vio ${JSON.stringify(respuestas.map(r => [r.id, r.status]))}`);
  const codigos = [...new Set(respuestas.map(r => r.cuerpo?.error))];
  assert.deepEqual(codigos, ['CHAT_MEDIA_FORBIDDEN'], 'el cuerpo tampoco debe distinguir');
});

test('el identificador no se convierte en ruta', async () => {
  const { url } = await levantarServidor(22500, { CHAT_MEDIA_GUARD_LIMIT: '5000' });
  const token = await iniciarSesionAdmin(url);
  const cabeceras = { authorization: `Bearer ${token}` };

  // Si el id se usara para componer una ruta, alguno de estos daría algo
  // distinto de 403 --un 404 del sistema de archivos, un 500, o contenido--.
  for (const intento of [
    '..%2F..%2F..%2Fetc%2Fpasswd',
    '%2Fetc%2Fpasswd',
    '..%5C..%5Cwindows%5Csystem32%5Cdrivers%5Cetc%5Chosts',
    '%00',
    'a'.repeat(500)
  ]) {
    const respuesta = await medio(url, intento, { headers: cabeceras });
    assert.equal(respuesta.status, 403, `«${intento.slice(0, 40)}» no devolvió 403 sino ${respuesta.status}`);
  }
});

// ------------------------------------------------ arranque sin la variable

test('el servidor arranca sin CHAT_MEDIA_DIR y deriva la raíz del volumen', async () => {
  // La rama original exigía la variable en producción: olvidarla impedía
  // arrancar. Aquí se comprueba que ya no, y que el directorio derivado queda
  // junto a la base de datos, es decir, dentro del volumen.
  const { url, tempDir } = await levantarServidor(22700, { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) });

  const salud = await pedir(url, '/api/health');
  assert.equal(salud.status, 200, 'el servidor debe arrancar sin la variable');

  const fs = await import('node:fs');
  assert.ok(
    fs.existsSync(path.join(tempDir, 'chat-media')),
    'la raíz derivada debe colgar del directorio de DATA_FILE'
  );
});
