import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  distanceFromMaracaiboKm,
  isInsideMaracaiboServiceArea,
  MARACAIBO_SERVICE_CENTER
} from '../src/utils/operatingArea.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('el centro de Maracaibo pertenece al área operativa', () => {
  assert.equal(distanceFromMaracaiboKm(MARACAIBO_SERVICE_CENTER), 0);
  assert.equal(isInsideMaracaiboServiceArea(MARACAIBO_SERVICE_CENTER), true);
});

test('puntos reales de Maracaibo y San Francisco se admiten', () => {
  assert.equal(isInsideMaracaiboServiceArea({ lat: 10.67, lng: -71.62 }), true);
  assert.equal(isInsideMaracaiboServiceArea({ lat: 10.55, lng: -71.65 }), true);
});

test('una coordenada de Nueva York no puede convertirse en recogida de Maracaibo', () => {
  assert.equal(isInsideMaracaiboServiceArea({ lat: 40.72, lng: -74.00 }), false);
});

test('coordenadas ausentes o inválidas quedan fuera', () => {
  assert.equal(isInsideMaracaiboServiceArea(null), false);
  assert.equal(isInsideMaracaiboServiceArea({ lat: 'x', lng: -71.6 }), false);
});

test('PassengerApp valida destino y origen antes de crear la carrera', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/passenger/passengerApp.js'), 'utf8');
  assert.match(source, /isInsideMaracaiboServiceArea\(\{ lat, lng: lon \}\)/);
  assert.match(source, /isInsideMaracaiboServiceArea\(origin\)/);
  // Desde MAPS-2A el destino elegido es la ubicacion canonica `location`;
  // la guardia de re-centrado es la misma.
  assert.match(source, /beginManualPickupSelection\(location, \{ recenterToMaracaibo: true \}\)/);
});
