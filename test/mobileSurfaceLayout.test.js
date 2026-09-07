import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeBottomSheetTransform } from '../src/components/bottomSheet.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('el bottom sheet conserva el centrado horizontal durante todo el arrastre', () => {
  assert.equal(composeBottomSheetTransform(), 'translate(-50%, 0px)');
  assert.equal(composeBottomSheetTransform(42), 'translate(-50%, 42px)');
  assert.equal(composeBottomSheetTransform('35vh'), 'translate(-50%, 35vh)');

  const source = read('src/components/bottomSheet.js');
  assert.doesNotMatch(source, /style\.transform\s*=\s*`translateY\(/,
    'un translateY aislado vuelve a desplazar la hoja hacia la derecha');
});

test('el login móvil ocupa el viewport completo y conserva el diseño de escritorio', () => {
  const css = read('src/styles/modern-yellow-lab.css');
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*?\.landing-container\.cyber-moto-experience[\s\S]*?min-height:\s*100dvh/);
  assert.match(css, /\.cyber-auth-card[\s\S]*?max-width:\s*none\s*!important[\s\S]*?border-radius:\s*0\s*!important/);
  assert.match(css, /theme-light\s+\.cyber-auth-card[\s\S]*?linear-gradient\(160deg, rgba\(255,255,255/,
    'el login debe tener una superficie clara real, no solo texto oscuro');
});

test('las vistas y modales del pasajero usan el contrato visual compartido', () => {
  const css = read('src/styles/um-motion-preview.css');
  for (const selector of [
    '.fare-confirm-card',
    '.assigned-driver-card',
    '.searching-ride-card',
    '.wallet-real-history',
    '.passenger-history-card',
    '.real-profile-card',
    '.payment-modal',
    '.passenger-rating-card',
    '.receipt-card',
    '.chat-modal'
  ]) {
    assert.ok(css.includes(selector), `${selector} debe pertenecer al contrato visual`);
  }
  assert.match(css, /--um-passenger-surface:/);
  assert.match(css, /\.um-motion-preview\.theme-light\s*\{[\s\S]*?--um-passenger-surface:/,
    'el contrato debe tener una variante clara explícita');
});

test('las hojas móviles quedan centradas y limitadas al viewport del teléfono', () => {
  const css = read('src/styles/um-motion-preview.css');
  assert.match(css, /body\s*>\s*\.bottom-sheet[\s\S]*?width:\s*min\(calc\(100% - 16px\), 460px\)/);
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*?body\s*>\s*\.bottom-sheet[\s\S]*?left:\s*50%\s*!important/);
  assert.match(css, /max-height:\s*calc\(100dvh - 94px - env\(safe-area-inset-top\)\)/);
});
