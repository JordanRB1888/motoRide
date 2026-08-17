import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arrancados = [];

async function levantar(t, env) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-proxy-'));
  const port = 6950 + Math.floor(Math.random() * 700);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'trust-proxy-test-secret-long-enough-for-production',
      ADMIN_PASSWORD: 'trust-proxy-admin-password',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  arrancados.push(child);
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
  return { url: `http://127.0.0.1:${port}`, traza };
}

/** Intenta iniciar sesión `veces` veces declarando venir de `ip`. */
async function intentarLogin(url, veces, ipDe) {
  let limitadas = 0;
  for (let i = 0; i < veces; i += 1) {
    const respuesta = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ipDe(i) },
      body: JSON.stringify({ identifier: `desconocido${i}@ejemplo.com`, password: 'x', role: 'passenger' })
    });
    if (respuesta.status === 429) limitadas += 1;
  }
  return limitadas;
}

test.after(() => {
  for (const child of arrancados) child.kill();
});

test('en producción cada cliente tiene su propio cupo de autenticación', async (t) => {
  const { url, traza } = await levantar(t, { NODE_ENV: 'production' });
  assert.match(traza, /trust proxy = 1/, 'debe confiar en un salto de proxy');

  // El limitador es de 30 cada 15 minutos. Treinta y cinco intentos desde
  // treinta y cinco direcciones distintas son treinta y cinco clientes
  // distintos, no uno que insiste.
  const limitadas = await intentarLogin(url, 35, i => `203.0.113.${i + 1}`);
  assert.equal(
    limitadas, 0,
    'ninguna debía limitarse: si se limitan, el cupo es global y un solo ' +
    'atacante deja sin inicio de sesión a toda la plataforma'
  );
});

test('en producción un mismo cliente insistente sí se corta', async (t) => {
  const { url } = await levantar(t, { NODE_ENV: 'production' });
  // La otra mitad de la prueba: confiar en el proxy no puede desactivar el
  // limitador, solo repartirlo bien.
  const limitadas = await intentarLogin(url, 35, () => '198.51.100.77');
  assert.ok(limitadas > 0, 'quien insiste desde la misma dirección debe recibir 429');
});

test('sin proxy delante no se hace caso a la cabecera del cliente', async (t) => {
  const { url, traza } = await levantar(t, { NODE_ENV: 'development' });
  assert.match(traza, /trust proxy = false/);

  // En desarrollo --y en cualquier despliegue sin proxy-- X-Forwarded-For lo
  // escribe el propio cliente. Hacerle caso permitiría estrenar cupo en cada
  // peticion con una direccion inventada.
  const limitadas = await intentarLogin(url, 35, i => `203.0.113.${i + 1}`);
  assert.ok(limitadas > 0, 'la cabecera del cliente no debe otorgar cupo nuevo');
});
