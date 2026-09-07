import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { ESQUEMA_CLARO, ESQUEMA_OSCURO } from '../theme/esquemas.ts';

/**
 * El inicio de la pasajera según la referencia visual del dueño.
 *
 * Lo que aquí se custodia no es un dibujo: son las decisiones que, al
 * romperse, no dan ningún error. Que el texto sobre una fotografía tenga su
 * propio token en vez de un blanco a mano; que la rejilla enseñe exactamente
 * los siete servicios de la referencia y diga cuáles no existen; que el saldo
 * no invente una cifra; que las piezas nuevas no fijen tintas que en el modo
 * día desaparecen.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

// ---------------------------------------------------------------------------
// La tinta sobre imagen
// ---------------------------------------------------------------------------

/** Luminancia relativa (WCAG), para medir y no opinar. */
function luminancia(hex) {
  const canal = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * canal(((n >> 16) & 255) / 255)
    + 0.7152 * canal(((n >> 8) & 255) / 255)
    + 0.0722 * canal((n & 255) / 255);
}
const contraste = (a, b) => {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (bajo + 0.05);
};

// El velo que va sobre las fotografías del inicio (hero y promociones). Es el
// mismo de día que de noche porque lo que hay debajo es una imagen, no una
// superficie del tema.
const VELO_SOBRE_FOTO = '#1f1c17';

test('los dos esquemas declaran la tinta sobre imagen, y se lee sobre el velo', () => {
  for (const [nombre, esquema] of [['claro', ESQUEMA_CLARO], ['oscuro', ESQUEMA_OSCURO]]) {
    assert.equal(typeof esquema.sobreImagen, 'string', `${nombre}: falta sobreImagen`);
    const relacion = contraste(esquema.sobreImagen, VELO_SOBRE_FOTO);
    assert.ok(relacion >= 4.5, `${nombre}: sobreImagen da ${relacion.toFixed(2)}:1 sobre el velo`);
  }
});
