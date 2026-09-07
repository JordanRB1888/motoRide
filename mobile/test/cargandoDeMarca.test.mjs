import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';

/**
 * LA ESPERA DE ARRANQUE LLEVA LA MARCA
 *
 * QUÉ SE PROTEGE
 *
 * 1. Que lo primero que se ve al abrir la aplicación no sea la rueda gris del
 *    sistema. Es la misma que enseña cualquier aplicación a medio hacer, y la
 *    web ya tenía su pantalla de marca desde hacía tiempo.
 *
 * 2. Que las duraciones sean las del original. Los dos anillos giran en 1,15 s
 *    y 1,8 s, el segundo al revés: eso es lo que hace que se lea como un
 *    mecanismo. Igualarlas —o hacerlas múltiplos— convierte el conjunto en una
 *    rueda y se ve el bucle.
 *
 * 3. Que respete el movimiento reducido. Una animación infinita es justo lo
 *    que molesta a quien lo activó, y aquí además no se puede saltar: sale
 *    cada vez que se abre la aplicación.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

test('el arranque enseña la marca, no la rueda del sistema', () => {
  const raiz = despojarComentarios(leer('app/index.tsx'));
  assert.match(raiz, /<CargandoDeMarca/, 'el arranque perdió la pantalla de marca');
  assert.doesNotMatch(raiz, /ActivityIndicator/, 'volvió la rueda gris del sistema');
});

test('los dos anillos giran en sentidos opuestos y a distinto ritmo', () => {
  const fuente = leer('ui/CargandoDeMarca.tsx');
  // Las duraciones del original, leídas de `index.html`.
  assert.match(fuente, /VUELTA_EXTERIOR_MS = 1150/);
  assert.match(fuente, /VUELTA_INTERIOR_MS = 1800/);
  // El segundo argumento de `girar` invierte el sentido: sin él, los dos aros
  // giran igual y el conjunto parece una rueda.
  assert.match(fuente, /girar\(VUELTA_INTERIOR_MS, true\)/, 'el anillo interior dejó de girar al revés');
});

test('el logo voltea, y no sólo gira en plano', () => {
  // `rotateY` es lo que da la vuelta al logo; `rotate` lo haría girar como una
  // rueda, que es otra cosa y se ve peor.
  const fuente = leer('ui/CargandoDeMarca.tsx');
  assert.match(fuente, /rotateY: '180deg'/);
  assert.match(fuente, /VOLTERETA_MS = 1350/);
});

test('con movimiento reducido nada gira, y la marca sigue ahí', () => {
  const fuente = despojarComentarios(leer('ui/CargandoDeMarca.tsx'));
  assert.match(fuente, /useReducedMotion\(\)/, 'no se consulta la preferencia del sistema');
  // Sin animación se devuelve `undefined`, no un objeto vacío: el estilo se
  // queda como está y la figura sigue completa.
  assert.match(fuente, /sinMovimiento \? undefined :/);
  // Y no se cae a la rueda del sistema como sustituto.
  assert.doesNotMatch(fuente, /ActivityIndicator/);
});

test('la espera dice QUÉ se está esperando', () => {
  // «Entrando» y «Preparando tu viaje» no son lo mismo: el primero es
  // restaurar una sesión guardada. Un texto único mentiría en uno de los dos.
  const raiz = despojarComentarios(leer('app/index.tsx'));
  assert.match(raiz, /'Entrando'/);
  assert.match(raiz, /'Preparando tu viaje'/);
});

test('se anuncia como una espera para quien no ve la pantalla', () => {
  const fuente = leer('ui/CargandoDeMarca.tsx');
  assert.match(fuente, /accessibilityRole="progressbar"/);
  assert.match(fuente, /accessibilityLabel=\{mensaje\}/);
});
