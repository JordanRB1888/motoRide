import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rutaConductor = path.join(raiz, 'src/pages/driver/driverApp.js');
const fuente = fs.readFileSync(rutaConductor, 'utf8');

/** Todas las fuentes del frontend: un id puede pintarlo un modulo hijo. */
const todasLasFuentes = (function recoger(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entrada => {
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return recoger(completa);
    return entrada.isFile() && entrada.name.endsWith('.js')
      ? [fs.readFileSync(completa, 'utf8')] : [];
  });
})(path.join(raiz, 'src'));

/**
 * Al mover el control de disponibilidad al centro de la barra quite del
 * cuerpo el interruptor de la cabecera y su declaracion
 * `const toggle = container.querySelector('#online-toggle')`. Se me escapo un
 * uso: `renderRealtimeState` terminaba en `toggle.checked = true`.
 *
 * El resultado no fue un error visible sino algo peor: `renderDriverApp`
 * reventaba a media ejecucion, DESPUES de pintar la plantilla y ANTES de
 * enganchar los oyentes de las pestanas. La pantalla se veia perfecta y los
 * cuatro botones de abajo no hacian absolutamente nada. `node --check` no lo
 * caza --la sintaxis es valida-- y la construccion tampoco.
 *
 * Estas comprobaciones cierran esa clase de fallo: una referencia a un control
 * que ya no existe.
 */

// Identificadores que el navegador aporta y que no se declaran en el archivo.
const GLOBALES = new Set([
  'window', 'document', 'location', 'navigator', 'console', 'localStorage',
  'sessionStorage', 'history', 'screen', 'performance', 'globalThis', 'self',
  'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise',
  'Date', 'Map', 'Set', 'WeakMap', 'URL', 'Intl', 'CustomEvent', 'Event',
  'Number', 'Image', 'FormData', 'AbortController'
]);

/** Nombres declarados en el archivo: const/let/var, funciones, parametros e imports. */
function declarados(texto) {
  const nombres = new Set();
  const anadir = n => { if (n) nombres.add(n); };

  for (const [, n] of texto.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) anadir(n);
  for (const [, n] of texto.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) anadir(n);
  for (const [, n] of texto.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) anadir(n);
  // Desestructuracion: const { a, b: c } = ... y const [a, b] = ...
  for (const [, cuerpo] of texto.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
    for (const trozo of cuerpo.split(',')) {
      const m = trozo.match(/([A-Za-z_$][\w$]*)\s*$/) || trozo.match(/([A-Za-z_$][\w$]*)/);
      if (m) anadir(m[1]);
    }
  }
  // Parametros de funcion y de flecha.
  for (const [, lista] of texto.matchAll(/\bfunction\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) {
    for (const trozo of lista.split(',')) anadir((trozo.match(/([A-Za-z_$][\w$]*)/) || [])[1]);
  }
  for (const [, lista] of texto.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const trozo of lista.split(',')) anadir((trozo.match(/([A-Za-z_$][\w$]*)/) || [])[1]);
  }
  for (const [, n] of texto.matchAll(/(?:^|[\s(,[])([A-Za-z_$][\w$]*)\s*=>/gm)) anadir(n);
  for (const [, n] of texto.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) anadir(n);
  for (const [, n] of texto.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) anadir(n);
  // Imports.
  for (const [, cuerpo] of texto.matchAll(/import\s+([^;]+?)\s+from/g)) {
    for (const trozo of cuerpo.replace(/[{}]/g, ' ').split(',')) {
      const m = trozo.match(/([A-Za-z_$][\w$]*)\s*$/);
      if (m) anadir(m[1]);
    }
  }
  // Propiedades abreviadas de objeto y etiquetas de objeto literal.
  for (const [, n] of texto.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) anadir(n);
  return nombres;
}

/**
 * Receptores de un acceso a miembro tipico del DOM. La mirada atras descarta
 * las cadenas --en `a.b.classList` el receptor real es `a`, no `b`-- y con
 * `\??\.` se cubre tambien el encadenamiento opcional.
 */
function receptoresDom(texto) {
  const patron = /(?<![.\w$'"`])([a-z][\w$]*)\s*\??\.\s*(?:checked|classList|textContent|innerHTML|addEventListener|removeEventListener|setAttribute|getAttribute|querySelector|querySelectorAll|closest|focus|blur|scrollIntoView)\b/g;
  return [...texto.matchAll(patron)].map(m => m[1]);
}

test('la pantalla del conductor no referencia controles que ya no existen', () => {
  const conocidos = declarados(fuente);
  const huerfanos = [...new Set(receptoresDom(fuente))]
    .filter(nombre => !conocidos.has(nombre) && !GLOBALES.has(nombre));

  assert.deepEqual(
    huerfanos, [],
    `driverApp.js usa identificadores que no declara: ${huerfanos.join(', ')}. ` +
    'Al quitar un control hay que quitar TODOS sus usos: si queda uno, la ' +
    'pantalla se pinta y luego revienta antes de enganchar los oyentes.'
  );
});

test('buscar un id inexistente exige comprobar el resultado', () => {
  // No se prohibe consultar un id que la plantilla propia no pinta: hay
  // controles que los modulos hijos montan en el overlay. Lo que no puede
  // pasar es usar el resultado sin comprobarlo, porque ahi es donde una
  // busqueda fallida tumba el resto del arranque.
  const consultas = [...fuente.matchAll(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*container\.querySelector\(\s*['"]#([\w-]+)['"]/g
  )];
  assert.ok(consultas.length > 5, 'se esperaban varias busquedas por id');

  const sinGuarda = [];
  for (const [, variable, id] of consultas) {
    const enAlgunaPlantilla = todasLasFuentes.some(texto => texto.includes(`id="${id}"`));
    if (enAlgunaPlantilla) continue;
    const protegido = new RegExp(`if\\s*\\(\\s*${variable}\\s*\\)|\\b${variable}\\?\\.`).test(fuente);
    if (!protegido) sinGuarda.push(`${variable} (#${id})`);
  }

  assert.deepEqual(
    sinGuarda, [],
    `se usan sin comprobar, y su id no lo pinta ninguna plantilla: ${sinGuarda.join(', ')}`
  );
});

test('los controles retirados no dejan rastro', () => {
  // Los tres que desaparecieron al centrar la disponibilidad en la barra.
  for (const retirado of ['#online-toggle', '#offline-overlay', '#btn-connect-overlay']) {
    assert.ok(
      !fuente.includes(retirado),
      `driverApp.js todavia menciona ${retirado}, que ya no se pinta`
    );
  }
});

test('el boton de disponibilidad vive dentro de la barra inferior', () => {
  // Si volviera a la cabecera, la maquetacion aprobada se perderia sin que
  // ninguna otra prueba se enterase.
  const barra = fuente.slice(fuente.indexOf('<div class="driver-nav-tabs">'));
  const cierre = barra.indexOf('</div>');
  const dentro = barra.slice(0, cierre);
  assert.ok(dentro.includes('id="driver-online-fab"'), 'el boton central no esta en la barra');
  assert.ok(
    dentro.indexOf('data-tab="ganancias"') < dentro.indexOf('id="driver-online-fab"'),
    'el boton central debe ir despues de Ganancias'
  );
  assert.ok(
    dentro.indexOf('id="driver-online-fab"') < dentro.indexOf('data-tab="viajes"'),
    'el boton central debe ir antes de Viajes'
  );
});
