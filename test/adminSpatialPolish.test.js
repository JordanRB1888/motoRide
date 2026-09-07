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

test('el fondo oscuro del Admin usa negros neutros y profundidad grafito', () => {
  const css = read('src/styles/admin-control-center.css');
  assert.match(css, /--cc-bg: #060606;/);
  assert.match(css, /--cc-surface: #111111;/);
  assert.match(css, /--cc-sidebar-background:[\s\S]*radial-gradient[\s\S]*linear-gradient/);
  assert.match(css, /--cc-shell-background:[\s\S]*radial-gradient[\s\S]*linear-gradient/);
  assert.match(css, /html\.theme-light \.cc-app \{[\s\S]*--cc-shell-background: #f4f5f5;/);
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

test('los mapas admin prefieren Google, conservan respaldo gratuito y se desmontan', () => {
  for (const file of ['src/pages/admin/adminApp.js', 'src/pages/admin/fleetMap.js']) {
    const source = read(file);
    assert.match(source, /createAdminGoogleMap/);
    assert.doesNotMatch(source, /\bL\.(map|tileLayer|marker|polyline)/);
    assert.match(source, /\.destroy\(\)/);
  }
  const loader = read('src/components/adminControlCenter/adminGoogleMap.js');
  assert.match(loader, /const loader = getGoogleMapsLoader\(\)/);
  assert.match(loader, /await loader\.load\(\)/);
  assert.match(loader, /createLeafletEngine/);
  assert.match(loader, /loader\.isConfigured\(\)/);
  assert.match(loader, /58express:theme-change/);
});
