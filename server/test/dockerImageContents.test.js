import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * El Dockerfile del servidor no copia el directorio entero: lleva una lista
 * explicita de COPY. Eso esta bien --la imagen queda pequeña-- pero convierte
 * cada archivo nuevo en algo que hay que acordarse de añadir, y olvidarlo no se
 * nota hasta que el contenedor arranca en produccion.
 *
 * Paso exactamente por ahi. El primer intento de modo mantenimiento en vivo
 * fallo con `Cannot find module '/app/maintenance.js'`: el archivo estaba en el
 * commit, estaba en la instantanea que subio el CLI, y aun asi no estaba en la
 * imagen, porque ninguna linea del Dockerfile lo copiaba. Siete minutos de
 * caida por una linea que faltaba.
 *
 * Estas pruebas cierran el hueco: comprueban que todo lo que el runtime o los
 * procedimientos de operacion necesitan llega de verdad a la imagen.
 */

const directorioServidor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rutaDockerfile = path.join(directorioServidor, 'Dockerfile');

function origenesCopiados() {
  const fuente = fs.readFileSync(rutaDockerfile, 'utf8');
  const origenes = new Set();
  for (const linea of fuente.split(/\r?\n/)) {
    const copia = linea.match(/^\s*COPY\s+(.+)$/i);
    if (!copia) continue;
    // El ultimo argumento es el destino; el resto son origenes.
    const partes = copia[1].trim().split(/\s+/);
    for (const origen of partes.slice(0, -1)) origenes.add(origen);
  }
  return origenes;
}

/** Resuelve `package*.json` y demas comodines contra lo que hay en disco. */
function cubre(origenes, objetivo) {
  for (const origen of origenes) {
    if (origen === objetivo) return true;
    if (origen.includes('*')) {
      const patron = new RegExp('^' + origen.split('*').map(t => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      if (patron.test(objetivo)) return true;
    }
  }
  return false;
}

test('la imagen incluye los dos puntos de entrada', () => {
  const origenes = origenesCopiados();
  for (const entrada of ['index.js', 'maintenance.js']) {
    assert.ok(
      fs.existsSync(path.join(directorioServidor, entrada)),
      `${entrada} deberia existir en server/`
    );
    assert.ok(
      cubre(origenes, entrada),
      `el Dockerfile no copia ${entrada}: el contenedor fallaria con MODULE_NOT_FOUND al arrancarlo`
    );
  }
});

test('la imagen incluye las herramientas de operacion del cutover', () => {
  // El importador transaccional y el vigilante de reinicio se ejecutan DENTRO
  // del contenedor durante el cutover. Si no estan en la imagen, hay que
  // subirlos a mano por SSH en plena ventana, que es justo cuando no conviene
  // improvisar.
  const origenes = origenesCopiados();
  assert.ok(cubre(origenes, 'scripts'), 'el Dockerfile no copia scripts/');

  for (const herramienta of ['postgresReplacementImport.js', 'restartPersistenceWatcher.js']) {
    assert.ok(
      fs.existsSync(path.join(directorioServidor, 'scripts', herramienta)),
      `scripts/${herramienta} deberia existir`
    );
  }
});

test('la imagen incluye todo lo que index.js importa por ruta relativa', () => {
  // Comprobacion general, no una lista a mano: se leen los imports relativos de
  // index.js y se exige que su primer segmento de directorio este copiado.
  const fuente = fs.readFileSync(path.join(directorioServidor, 'index.js'), 'utf8');
  const origenes = origenesCopiados();

  const directorios = new Set();
  for (const [, especificador] of fuente.matchAll(/\bfrom\s*['"](\.\/[^'"]+)['"]/g)) {
    const relativo = especificador.slice(2);
    if (relativo.includes('/')) directorios.add(relativo.split('/')[0]);
    else directorios.add(relativo);
  }

  assert.ok(directorios.size > 0, 'se esperaban imports relativos en index.js');
  for (const objetivo of directorios) {
    assert.ok(
      cubre(origenes, objetivo),
      `el Dockerfile no copia ${objetivo}, que index.js importa`
    );
  }
});

test('el comando por defecto de la imagen es el servidor normal', () => {
  // Railway sobreescribe esto con su startCommand, pero un CMD que apuntara al
  // mantenimiento dejaria una trampa para cualquier arranque sin configuracion.
  const fuente = fs.readFileSync(rutaDockerfile, 'utf8');
  const cmd = fuente.match(/^\s*CMD\s+(.+)$/mi);
  assert.ok(cmd, 'el Dockerfile debe declarar un CMD');
  assert.match(cmd[1], /index\.js/);
  assert.ok(!cmd[1].includes('maintenance'), 'el CMD por defecto no debe ser el modo mantenimiento');
});
