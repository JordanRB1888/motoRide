import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('el contenido admin sigue fluido y el menú expandido conserva texto', () => {
  const css = read('src/styles/admin-control-center.css');
  assert.match(css, /\.cc-app \.admin-content \{[^}]*width: 100%;[^}]*max-width: none;/);
  assert.match(css, /admin-sidebar:not\(\.collapsed\) \.nav-text \{ display:inline;/);
  assert.match(css, /cc-system-page > \.cc-metric-strip \{ grid-template-columns:repeat\(3/);
});

test('comercial inicia sin campañas ni aliados inventados', () => {
  assert.match(read('src/components/adminControlCenter/adsCms.js'), /const INITIAL_CAMPAIGNS = \[\];/);
  assert.match(read('src/components/adminControlCenter/partnersManagement.js'), /const INITIAL_PARTNERS = \[\];/);
  assert.match(read('src/components/adminControlCenter/adsCms.js'), /metric\('Interacciones', '—', 'No disponible'\)/);
});

test('la matriz no presenta asignaciones de plantilla como usuarios reales', () => {
  const source = read('src/components/adminControlCenter/rbacMatrix.js');
  assert.match(source, /metric\('Miembros asignados', '—', 'No disponible'\)/);
  assert.match(source, /Plantilla · sin asignación real/);
});

test('Enter en command search evita reactivar el botón que recupera el foco', () => {
  const source = read('src/components/adminControlCenter/ui.js');
  assert.match(source, /if \(e.key === 'Enter'\) \{\s*e.preventDefault\(\);\s*e.stopPropagation\(\);/);
});
