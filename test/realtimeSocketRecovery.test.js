import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('el socket del conductor no abandona la reconexión por un límite finito', () => {
  const source = read('src/services/socketClient.js');
  assert.match(source, /reconnectionAttempts:\s*Infinity/);
  assert.doesNotMatch(source, /reconnectionAttempts:\s*[1-9]\d*/);
});

test('la telemetría regulada reactiva Socket.IO si REST sigue vivo', () => {
  const source = read('src/services/driverGpsTracker.js');
  assert.match(source, /if\s*\(socket\s*&&\s*socket\.connected\)[\s\S]*?driver:location_update[\s\S]*?else\s*\{[\s\S]*?socketClient\.connect\(\)/);
});
