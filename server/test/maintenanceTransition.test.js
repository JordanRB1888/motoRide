import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Ensayo local de la transicion normal -> mantenimiento -> normal.
 *
 * Es el equivalente de laboratorio a lo que hara el cuarto cutover en Railway:
 * cambiar el `startCommand` a `node maintenance.js`, tomar la instantanea con
 * cero escritores, y volver a `node index.js`. Aqui no hay Railway, asi que la
 * transicion se simula parando y arrancando procesos sobre el MISMO archivo
 * SQLite, que es la parte que de verdad importa comprobar.
 *
 * La leccion del tercer cutover esta codificada en la ultima asercion: un 200
 * en /api/health NO basta como prueba de recuperacion. Durante la recuperacion
 * real el servicio respondio 200 perfectamente mientras servia una base vacia,
 * porque DATA_FILE apuntaba a una ruta equivocada. Por eso aqui, despues de
 * volver al modo normal, se comprueba CONTENIDO: que el usuario creado antes de
 * la ventana sigue pudiendo iniciar sesion.
 */

const directorioServidor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PUERTO = 18500 + Math.floor(Math.random() * 399);

const temporales = [];
const procesos = [];

test.after(() => {
  for (const proceso of procesos) {
    if (proceso.exitCode === null && proceso.signalCode === null) proceso.kill('SIGKILL');
  }
  for (const dir of temporales) fs.rmSync(dir, { recursive: true, force: true });
});

function arrancar(entrada, { puerto, archivoDatos, esperar }) {
  const proceso = spawn(process.execPath, [entrada], {
    cwd: directorioServidor,
    env: {
      ...process.env,
      PORT: String(puerto),
      DATA_FILE: archivoDatos,
      JWT_SECRET: 'maintenance-transition-secret',
      // Se elimina explicitamente: si estuviera heredada del entorno, el
      // servidor normal arrancaria contra PostgreSQL y el ensayo mediria otra
      // cosa. El cutover exige la misma garantia al volver del mantenimiento.
      DATABASE_URL: undefined
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  procesos.push(proceso);

  let salida = '';
  const listo = new Promise((resolver, rechazar) => {
    const plazo = setTimeout(() => rechazar(new Error(`${entrada} no arranco: ${salida}`)), 20000);
    const mirar = trozo => {
      salida += trozo;
      if (salida.includes(esperar)) { clearTimeout(plazo); resolver(); }
    };
    proceso.stdout.on('data', mirar);
    proceso.stderr.on('data', mirar);
    proceso.once('exit', codigo => {
      clearTimeout(plazo);
      rechazar(new Error(`${entrada} termino con codigo ${codigo}: ${salida}`));
    });
  });

  return { proceso, listo, salida: () => salida };
}

async function detener(proceso) {
  if (proceso.exitCode !== null) return;
  const terminado = new Promise(resolver => proceso.once('exit', resolver));
  proceso.kill();
  await terminado;
}

test('la transicion normal -> mantenimiento -> normal conserva los datos', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transicion-'));
  temporales.push(dir);
  const archivoDatos = path.join(dir, 'plus58express.sqlite');
  const base = `http://127.0.0.1:${PUERTO}`;

  // ---------------------------------------------------------------- normal
  const normal = arrancar('index.js', { puerto: PUERTO, archivoDatos, esperar: 'Running' });
  await normal.listo;

  assert.match(
    normal.salida(), /\[\+58express Database\] backend = sqlite/,
    'el ensayo debe correr sobre SQLite, no sobre PostgreSQL'
  );

  const credenciales = { email: 'ensayo-cutover@58express.com', password: 'ensayo12345' };
  const alta = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...credenciales,
      role: 'passenger',
      firstName: 'Ensayo',
      lastName: 'Cutover',
      phone: '+584121234567'
    })
  });
  assert.equal(alta.status, 201, await alta.text());

  const saludNormal = await (await fetch(`${base}/api/health`)).json();
  assert.equal(saludNormal.status, 'ok');
  assert.equal(saludNormal.maintenance, undefined, 'el servidor normal no debe declararse en mantenimiento');

  await detener(normal.proceso);

  // La huella del archivo justo antes de la ventana. Es lo que la instantanea
  // del cutover congelaria.
  const antes = fs.statSync(archivoDatos);

  // --------------------------------------------------------- mantenimiento
  const mantenimiento = arrancar('maintenance.js', {
    puerto: PUERTO, archivoDatos, esperar: '[+58express Maintenance]'
  });
  await mantenimiento.listo;

  const saludMantenimiento = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(saludMantenimiento, { ok: true, maintenance: true, databaseWriters: 0 });

  // La aplicacion queda fuera de servicio, no rota.
  assert.equal((await fetch(`${base}/api/trips`)).status, 503);

  // Cero escritores: el archivo no se toca durante toda la ventana.
  await new Promise(listo => setTimeout(listo, 1200));
  const durante = fs.statSync(archivoDatos);
  assert.equal(durante.size, antes.size, 'el archivo SQLite no debe cambiar de tamaño en mantenimiento');
  assert.equal(
    durante.mtimeMs, antes.mtimeMs,
    'el archivo SQLite no debe modificarse en mantenimiento'
  );

  await detener(mantenimiento.proceso);

  // ------------------------------------------------------------- rollback
  const vuelta = arrancar('index.js', { puerto: PUERTO, archivoDatos, esperar: 'Running' });
  await vuelta.listo;

  assert.match(vuelta.salida(), /\[\+58express Database\] backend = sqlite/);

  const saludVuelta = await (await fetch(`${base}/api/health`)).json();
  assert.equal(saludVuelta.status, 'ok');

  // Y aqui esta la asercion que el tercer cutover me enseño a escribir: 200 no
  // demuestra nada sobre los datos. Se comprueba contenido real.
  const sesion = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credenciales)
  });
  assert.equal(sesion.status, 200, 'el usuario creado antes de la ventana debe seguir existiendo');
  const datos = await sesion.json();
  assert.equal(datos.user.email, credenciales.email);

  await detener(vuelta.proceso);
});

test('un 200 en salud no distingue por si solo una base vacia', async () => {
  // Justificacion explicita de la asercion de contenido anterior: se arranca el
  // servidor normal contra un DATA_FILE nuevo --exactamente el sintoma que tuvo
  // produccion cuando Git Bash convirtio /data/... en otra ruta-- y se
  // comprueba que responde 200 igual de bien, con la base vacia.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vacia-'));
  temporales.push(dir);
  const puerto = PUERTO + 1;
  const base = `http://127.0.0.1:${puerto}`;

  const servidor = arrancar('index.js', {
    puerto, archivoDatos: path.join(dir, 'otra-ruta.sqlite'), esperar: 'Running'
  });
  await servidor.listo;

  const salud = await fetch(`${base}/api/health`);
  assert.equal(salud.status, 200, 'una base vacia tambien responde 200: por eso no basta');

  const sesion = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ensayo-cutover@58express.com', password: 'ensayo12345' })
  });
  assert.notEqual(sesion.status, 200, 'la base nueva no puede contener al usuario del ensayo anterior');

  await detener(servidor.proceso);
});
