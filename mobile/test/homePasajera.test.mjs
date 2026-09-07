import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { ESQUEMA_CLARO, ESQUEMA_OSCURO } from '../theme/esquemas.ts';
import {
  ACCESOS_RAPIDOS,
  REJILLA_DEL_INICIO,
  SERVICIO_DESTACADO,
  SERVICIOS_DE_INICIO
} from '../preview/fixtures.ts';
import { DESTINO_DE_SERVICIO } from '../navegacion/rutas.ts';
import { NOMBRES_DE_ICONO } from '../ui/Icono.tsx';

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

// ---------------------------------------------------------------------------
// Los datos de la referencia
// ---------------------------------------------------------------------------

test('la rejilla del inicio enseña los siete servicios de la referencia, en su orden', () => {
  const titulos = REJILLA_DEL_INICIO.map(clave => SERVICIOS_DE_INICIO.find(s => s.clave === clave)?.titulo);
  assert.deepEqual(titulos, ['Moto', 'Delivery', 'Comida', 'Envíos', 'Mercado', 'Comercios', 'Compra y venta']);
});

test('Transporte Seguro no está en la rejilla del inicio, pero sigue existiendo', () => {
  // La referencia no lo lleva. Tiene pestaña propia en la barra y sigue en la
  // hoja «¿Qué necesitas hoy?»: no se pierde, se saca de la rejilla.
  assert.ok(!REJILLA_DEL_INICIO.includes('seguro'));
  assert.ok(SERVICIOS_DE_INICIO.some(s => s.clave === 'seguro' && s.listo));
});

test('lo que la referencia promete y no existe lleva a «pronto»', () => {
  assert.equal(DESTINO_DE_SERVICIO.delivery, 'pronto');
  assert.equal(DESTINO_DE_SERVICIO[SERVICIO_DESTACADO.clave], 'pronto');
  assert.equal(SERVICIO_DESTACADO.listo, false);
  assert.equal(SERVICIO_DESTACADO.titulo, '+58Moto Plus');
});

test('los accesos rápidos son los cuatro de la referencia', () => {
  assert.deepEqual(ACCESOS_RAPIDOS.map(a => a.nombre), ['Casa', 'Trabajo', 'Lugares favoritos', 'Recientes']);
});

// ---------------------------------------------------------------------------
// La familia de iconos
// ---------------------------------------------------------------------------

test('la familia de iconos tiene lo que el inicio nuevo necesita', () => {
  for (const nombre of ['chevron-derecha', 'ubicacion', 'corona', 'billetera', 'estrella', 'reloj']) {
    assert.ok(NOMBRES_DE_ICONO.includes(nombre), `falta el icono «${nombre}»`);
  }
});
