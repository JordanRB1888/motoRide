import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RAIZ_MOBILE = path.resolve(__dirname, '..');

function leer(relativo) {
  return fs.readFileSync(path.join(RAIZ_MOBILE, relativo), 'utf8');
}

test('SuperficieDeCarrera no contiene colores hexadecimales literales', () => {
  const contenido = leer('conductor/SuperficieDeCarrera.tsx');
  const hex = /#[0-9a-fA-F]{3,8}\b/g;
  const coincidencias = contenido.match(hex);
  assert.equal(coincidencias, null);
});

test('PantallaDeCalificacion no contiene colores hexadecimales literales', () => {
  const contenido = leer('ui/PantallaDeCalificacion.tsx');
  const hex = /#[0-9a-fA-F]{3,8}\b/g;
  const coincidencias = contenido.match(hex);
  assert.equal(coincidencias, null);
});

test('PantallaDeCalificacion ofrece propinas y tags requeridos', () => {
  const contenido = leer('ui/PantallaDeCalificacion.tsx');
  assert.ok(contenido.includes('Sin propina'), 'Falta opción Sin propina');
  assert.ok(contenido.includes('Personalizado'), 'Falta opción Personalizado');
  assert.ok(contenido.includes('Transporte seguro'), 'Falta tag Transporte seguro');
  assert.ok(contenido.includes('Llegó rápido'), 'Falta tag Llegó rápido');
  assert.ok(contenido.includes('Muy amable'), 'Falta tag Muy amable');
  assert.ok(contenido.includes('Puntual en recogida'), 'Falta tag Puntual en recogida');
});

test('Las pantallas nuevas están registradas en el catálogo de preview', () => {
  const preview = leer('app/preview.tsx');
  assert.ok(preview.includes('driver-carrera-recoger'), 'Falta driver-carrera-recoger');
  assert.ok(preview.includes('driver-carrera-esperando'), 'Falta driver-carrera-esperando');
  assert.ok(preview.includes('driver-carrera-en-curso'), 'Falta driver-carrera-en-curso');
  assert.ok(preview.includes('pasajera-carrera-camino'), 'Falta pasajera-carrera-camino');
  assert.ok(preview.includes('pasajera-carrera-en-curso'), 'Falta pasajera-carrera-en-curso');
  assert.ok(preview.includes('calificacion-pasajera'), 'Falta calificacion-pasajera');
  assert.ok(preview.includes('calificacion-conductor'), 'Falta calificacion-conductor');
});
