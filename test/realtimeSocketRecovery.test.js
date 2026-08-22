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
  assert.match(source, /apiService\.patch\('\/drivers\/location'[\s\S]*?socketClient\.notifyRestHealthy\(\)/);
});

test('el conductor queda ONLINE únicamente tras driver:connected y restaura su viaje', () => {
  const tracker = read('src/services/driverGpsTracker.js');
  const app = read('src/pages/driver/driverApp.js');
  assert.match(tracker, /on\('driver:connected',\s*this\._onDriverConnected\)/);
  assert.match(tracker, /_setRealtimeState\('CONNECTED',\s*'driver_registered'\)/);
  assert.match(tracker, /58express:driver-realtime-restored/);
  assert.match(app, /58express:driver-realtime-restored[\s\S]*?restoreActiveTrip\(\)/);
  assert.doesNotMatch(app, /58express:driver-realtime-restored[\s\S]{0,120}?if\s*\(!currentTrip\)/);
  assert.match(app, /if\s*\(!active\?\.trip[\s\S]*?if\s*\(currentTrip\)\s*clearCompletedTripUi\(\)/);
  assert.match(app, /state === 'CONNECTED'[\s\S]*?statusText\.textContent = 'En Línea'/);
  assert.match(app, /statusText\.textContent = 'Reconectando…'/);
  assert.match(app, /statusText\.textContent = 'Sin conexión'/);
  assert.match(app, /driver-realtime-label/);
  assert.match(app, /realtimeLifecycle\.addListener\(window, '58express:driver-realtime-state'/);
  assert.match(app, /realtimeLifecycle\.addListener\(window, '58express:driver-realtime-restored'/);
  assert.match(app, /realtimeLifecycle\.closeWhenDetached/);
});

test('el registro realtime usa un único juego estable de listeners', () => {
  const source = read('src/services/driverGpsTracker.js');
  assert.equal((source.match(/on\('connect',\s*this\._onSocketConnect\)/g) || []).length, 1);
  assert.equal((source.match(/on\('disconnect',\s*this\._onSocketDisconnect\)/g) || []).length, 1);
  assert.equal((source.match(/on\('driver:connected',\s*this\._onDriverConnected\)/g) || []).length, 1);
  assert.doesNotMatch(source, /startTracking[\s\S]*?socket\.on\('connect',\s*\(\)\s*=>/);
});
