import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';

/**
 * EN UNA CARRERA REAL NO PUEDE SALIR NADIE INVENTADO
 *
 * DE DÓNDE SALE ESTO
 *
 * De recorrer una carrera entera contra staging con dos teléfonos. El conductor
 * aceptó, y la tarjeta de la carrera decía:
 *
 *     Ana Rondón · 4.98 (42 viajes) · .50 Efectivo
 *
 * La pasajera real era otra y la tarifa era 5,81. `SuperficieDeCarrera` traía
 * esos valores como VALOR POR OMISIÓN de sus props, y la pantalla que la monta
 * no le pasaba ni el pasajero ni la tarifa.
 *
 * Lo grave no es el nombre: es que un valor por omisión con pinta de dato real
 * hace que la falta de datos no se vea. Con la tarjeta vacía, el primer arranque
 * lo habría delatado.
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que el componente no traiga personas ni importes inventados.
 * 2. Que la pantalla le pase los datos del viaje de verdad.
 * 3. Que una calificación que no existe no se enseñe como un cinco redondo.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

test('la superficie de la carrera no trae ningún dato inventado', () => {
  const superficie = despojarComentarios(leer('conductor/SuperficieDeCarrera.tsx'));

  // Ni personas de ejemplo...
  assert.doesNotMatch(superficie, /nombre: 'Ana Rond/, 'vuelve a haber una pasajera inventada');
  assert.doesNotMatch(superficie, /iniciales: 'AR'/);
  assert.doesNotMatch(superficie, /calificacion: '4\.98'/);
  assert.doesNotMatch(superficie, /viajes: 42/);
  // ...ni una tarifa por omisión.
  assert.doesNotMatch(superficie, /tarifa = '/, 'la tarifa vuelve a tener un valor de ejemplo');
});

test('la pantalla del conductor le pasa el pasajero y la tarifa del viaje', () => {
  const pantalla = despojarComentarios(leer('app/conductor.tsx'));
  assert.match(pantalla, /nombre: enCurso\.viaje\.pasajero/);
  assert.match(pantalla, /tarifa=\{enCurso\.viaje\.importe/);
  assert.match(pantalla, /metodoPago=\{enCurso\.viaje\.metodoDePago/);
});

test('una calificación que no existe NO se enseña como un cinco', () => {
  // Un conductor decide con ese número si acepta o no. Un «5.0» de relleno
  // afirma que la persona es de fiar sin que nadie lo sepa; no enseñar nada
  // dice la verdad, que es que no hay dato.
  const superficie = despojarComentarios(leer('conductor/SuperficieDeCarrera.tsx'));
  assert.doesNotMatch(superficie, /calificacion \|\| '5\.0'/);
  assert.match(superficie, /pasajero\?\.calificacion \?/);
});
