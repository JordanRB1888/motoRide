import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const css = () => read('src/styles/design-v2.css');
const maqueta = () => read('src/pages/designV2Preview.js');

/* Contratos de la maqueta de concepto V2.
   No fijan píxeles: fijan las decisiones que motivaron el rediseño. */

test('la hoja se ancla al dispositivo y no puede salirse por los lados', () => {
  // Este era el defecto observado: la ventana de destino salía hacia la
  // derecha porque se anclaba al viewport de escritorio, no al teléfono.
  const bloque = css().match(/\.v2-sheet\s*\{[^}]*\}/);
  assert.ok(bloque, 'falta la hoja inferior');

  assert.doesNotMatch(bloque[0], /position:\s*(fixed|absolute)/,
    'una hoja posicionada se ancla al viewport, no al dispositivo');
  assert.match(bloque[0], /margin:\s*auto 0 0/,
    'la hoja debe empujarse al borde inferior sin margen lateral');
  assert.match(bloque[0], /border-radius:\s*var\(--v2-r-sheet\) var\(--v2-r-sheet\) 0 0/,
    'radio solo arriba: abajo va pegada al borde');

  const dispositivo = css().match(/\.v2-device\s*\{[^}]*\}/);
  assert.match(dispositivo[0], /overflow:\s*hidden/,
    'el dispositivo recorta: nada puede escaparse de su marco');
});

test('el sistema V2 usa un solo acento de marca', () => {
  const c = css();
  // Un único amarillo declarado, en su rampa. Cero cian y cero azul decorativo.
  assert.doesNotMatch(c, /#[0-9a-f]*(?:cyan)/i);
  for (const prohibido of ['#23c7e8', '#00c8ff', '#16c8ea', '#63c9ff', '#0b6fa8']) {
    assert.ok(!c.includes(prohibido), `${prohibido} es un acento decorativo, no un estado`);
  }
  // El color semántico existe, pero solo como estado.
  assert.match(c, /--v2-ok:/);
  assert.match(c, /--v2-bad:/);
});

test('el radio tiene tres valores, no una escala arbitraria', () => {
  const c = css();
  const declarados = [...c.matchAll(/--v2-r-[a-z]+:\s*([0-9]+)px/g)].map(m => Number(m[1]));
  assert.deepEqual(declarados.sort((a, b) => a - b), [13, 20, 26],
    'control, tarjeta y hoja: tres valores y ninguno suelto');
});

test('la jerarquía sale del espacio y la tipografía, no de tarjetas anidadas', () => {
  const m = maqueta();
  // Las métricas son una tira con filetes, no tres tarjetas de colores.
  assert.ok(m.includes('v2-metrics'), 'faltan las métricas tipográficas');
  assert.match(css(), /\.v2-metrics > div \{[^}]*border-left:\s*1px solid var\(--v2-line\)/,
    'las métricas se separan con filete, no con tarjeta propia');

  // Las secciones se separan con filete superior, no envolviendo en tarjeta.
  assert.match(css(), /\.v2-section \{[^}]*border-top:\s*1px solid var\(--v2-line\)/);
});

test('el modo claro es marfil cálido, no el oscuro invertido', () => {
  const claro = css().slice(css().indexOf('.v2.v2-light'));
  assert.match(claro, /--v2-ground:\s*#efece5/, 'el suelo claro debe ser cálido');
  // Estados propios y más profundos: un verde brillante no contrasta sobre claro.
  assert.match(claro, /--v2-ok:\s*#0d7a52/);
  assert.match(claro, /--v2-bad:\s*#c02a3c/);
});

test('la maqueta no toca lógica de negocio', () => {
  const m = maqueta();
  for (const prohibido of ['apiService', 'authService', 'socket', 'fetch(', 'localStorage']) {
    assert.ok(!m.includes(prohibido),
      `la maqueta usa ${prohibido}: debe ser puramente visual con datos simulados`);
  }
  assert.match(m, /NO ES PRODUCCIÓN/, 'la maqueta debe declararse como concepto');
});
