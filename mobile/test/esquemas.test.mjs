/**
 * Los dos esquemas: que existan, que sean distintos y que se lean.
 *
 * EL CONTRASTE SE MIDE, NO SE OPINA
 *
 * Estas pruebas calculan la relación de contraste con la fórmula de WCAG y
 * comprueban los mínimos. Un tema claro «que se ve bien» en el monitor del que
 * lo hizo es exactamente cómo se cuela un gris ilegible al sol.
 *
 * Los umbrales son los de la norma: 4,5:1 para texto normal y 3:1 para texto
 * grande y para elementos de interfaz que hay que distinguir.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contraste, luminancia, medido } from './ayudas.mjs';

import {
  ESQUEMA_CLARO,
  ESQUEMA_OSCURO,
  OPACIDAD_DE_CALLE_POR_ESQUEMA,
  SOMBRA_POR_ESQUEMA
} from '../theme/esquemas.ts';

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// La fórmula
// ---------------------------------------------------------------------------

// La fórmula está en `ayudas.mjs`: la comparten esta prueba y la del dibujo de
// revisión, y con dos copias una podría quedarse atrás sin que nadie lo note.

// ---------------------------------------------------------------------------
// La fórmula funciona
// ---------------------------------------------------------------------------

test('la fórmula de contraste da los valores conocidos', () => {
  // Comprobar la herramienta antes de usarla: si la fórmula estuviera mal,
  // todas las pruebas de abajo pasarían midiendo cualquier cosa.
  assert.equal(medido('#000000', '#ffffff'), 21, 'negro sobre blanco es 21:1');
  assert.equal(medido('#ffffff', '#ffffff'), 1, 'un color contra sí mismo es 1:1');
});

// ---------------------------------------------------------------------------
// Texto sobre su fondo
// ---------------------------------------------------------------------------

const ESQUEMAS = [
  ['claro', ESQUEMA_CLARO],
  ['oscuro', ESQUEMA_OSCURO]
];

test('el texto principal se lee sobre las tres superficies', () => {
  for (const [nombre, esquema] of ESQUEMAS) {
    for (const superficie of ['fondo', 'superficie', 'superficieElevada']) {
      const relacion = medido(esquema.textoPrimario, esquema[superficie]);
      assert.ok(relacion >= 4.5,
        `${nombre}: texto principal sobre ${superficie} da ${relacion}:1`);
    }
  }
});

test('el texto secundario se lee sobre las tres superficies', () => {
  for (const [nombre, esquema] of ESQUEMAS) {
    for (const superficie of ['fondo', 'superficie', 'superficieElevada']) {
      const relacion = medido(esquema.textoSecundario, esquema[superficie]);
      assert.ok(relacion >= 4.5,
        `${nombre}: texto secundario sobre ${superficie} da ${relacion}:1`);
    }
  }
});

test('el texto atenuado llega al mínimo de texto grande', () => {
  // El atenuado se usa en pies y etiquetas pequeñas. No baja de 3:1 en ningún
  // sitio, que es el suelo por debajo del cual deja de verse al sol.
  for (const [nombre, esquema] of ESQUEMAS) {
    for (const superficie of ['fondo', 'superficie', 'superficieElevada']) {
      const relacion = medido(esquema.textoTenue, esquema[superficie]);
      assert.ok(relacion >= 3,
        `${nombre}: texto atenuado sobre ${superficie} da ${relacion}:1`);
    }
  }
});

// ---------------------------------------------------------------------------
// El amarillo, que es el caso delicado
// ---------------------------------------------------------------------------

test('la tinta sobre el amarillo se lee', () => {
  // El botón principal: amarillo de marca con tinta oscura encima. Es el mismo
  // en los dos esquemas y tiene que funcionar en los dos.
  for (const [nombre, esquema] of ESQUEMAS) {
    const relacion = medido(esquema.sobreAcento, esquema.acento);
    assert.ok(relacion >= 4.5, `${nombre}: la tinta sobre el amarillo da ${relacion}:1`);
  }
});

test('el amarillo de TEXTO se lee sobre las superficies', () => {
  // Es la razón de que `acentoTexto` exista. En claro, el amarillo de marca
  // como texto da 1,27:1 sobre marfil; el ámbar profundo pasa de 4,5.
  for (const [nombre, esquema] of ESQUEMAS) {
    for (const superficie of ['fondo', 'superficie', 'superficieElevada']) {
      const relacion = medido(esquema.acentoTexto, esquema[superficie]);
      assert.ok(relacion >= 4.5,
        `${nombre}: el amarillo de texto sobre ${superficie} da ${relacion}:1`);
    }
  }
});

test('en claro, el amarillo de marca NO vale como texto', () => {
  // Lo contrario de una prueba normal: comprueba que el problema que motivó
  // `acentoTexto` es real. Si algún día el amarillo de marca cambiara y sí se
  // leyera, esta prueba fallaría y habría que revisar si los dos tokens siguen
  // haciendo falta.
  const relacion = medido(ESQUEMA_CLARO.acento, ESQUEMA_CLARO.fondo);
  assert.ok(relacion < 4.5,
    `el amarillo de marca sobre marfil da ${relacion}:1: si pasara de 4,5, ` +
    '`acentoTexto` dejaría de tener sentido');
});

// ---------------------------------------------------------------------------
// Los estados
// ---------------------------------------------------------------------------

test('los estados se leen sobre las superficies', () => {
  for (const [nombre, esquema] of ESQUEMAS) {
    for (const estado of ['exito', 'aviso', 'peligro', 'informacion']) {
      for (const superficie of ['fondo', 'superficie']) {
        const relacion = medido(esquema[estado], esquema[superficie]);
        assert.ok(relacion >= 3,
          `${nombre}: ${estado} sobre ${superficie} da ${relacion}:1`);
      }
    }
  }
});

test('el color NO es lo único que distingue un estado', () => {
  // Dos versiones de esta prueba se equivocaron antes de dar con lo que había
  // que comprobar.
  //
  // La primera exigía que el peligro tuviera MÁS contraste que el aviso, dando
  // por hecho que más contraste es más urgencia. No lo es: en oscuro el naranja
  // da 10,18:1 y el rojo 7,07:1, y aun así nadie confunde un rojo con una
  // advertencia. La urgencia la lleva el tono.
  //
  // La segunda exigía separación de luminancia entre los dos, y ahí salió algo
  // de verdad: en claro, `#c62839` y `#a35c00` están a 1,09:1. En escala de
  // grises son el mismo color. Pero la respuesta no es cambiarlos —vienen del
  // sistema de la web, auditados uno a uno contra el fondo— sino no depender
  // del color para decir qué pasa.
  //
  // Así que lo que se comprueba es eso: que cada estado llegue con un icono o
  // una palabra al lado. Es lo que hace que la pantalla funcione para quien no
  // separa el rojo del naranja, que es aproximadamente uno de cada doce
  // hombres.
  const emergencia = fs.readFileSync(
    path.join(raizMovil, 'preview/pantallasC2Secciones.tsx'), 'utf8'
  );
  const bloque = emergencia.slice(emergencia.indexOf('C2ViajeSeguro'));
  assert.match(bloque, /Emergencia/, 'el aviso rojo lleva su palabra');
  assert.match(bloque, /nombre="escudo"/, 'y su icono');

  const saldo = fs.readFileSync(
    path.join(raizMovil, 'preview/pantallaSaldoConductor.tsx'), 'utf8'
  );
  assert.match(saldo, /SALDO DEUDOR CON \+58EXPRESS/,
    'el saldo en negativo cambia el rótulo, no sólo el color');
  assert.match(saldo, /Recarga para volver a recibir viajes/,
    'y dice qué hacer');
});

// ---------------------------------------------------------------------------
// Los dos esquemas son de verdad distintos
// ---------------------------------------------------------------------------

test('claro y oscuro no comparten fondo ni texto', () => {
  assert.notEqual(ESQUEMA_CLARO.fondo, ESQUEMA_OSCURO.fondo);
  assert.notEqual(ESQUEMA_CLARO.textoPrimario, ESQUEMA_OSCURO.textoPrimario);
});

test('en claro el fondo es claro y en oscuro es oscuro', () => {
  assert.ok(luminancia(ESQUEMA_CLARO.fondo) > 0.7, 'el fondo claro es claro');
  assert.ok(luminancia(ESQUEMA_OSCURO.fondo) < 0.05, 'el fondo oscuro es oscuro');
});

test('el fondo claro NO es blanco puro', () => {
  // Marfil cálido, no #ffffff. Un blanco puro de fondo hace que las superficies
  // blancas encima dejen de distinguirse y quita toda la jerarquía.
  assert.notEqual(ESQUEMA_CLARO.fondo.toLowerCase(), '#ffffff');
  assert.ok(luminancia(ESQUEMA_CLARO.fondo) < luminancia(ESQUEMA_CLARO.superficieElevada),
    'el fondo es un escalón por debajo de la superficie elevada');
});

test('las superficies se escalonan en los dos esquemas', () => {
  // En oscuro suben hacia la luz; en claro, hacia el blanco. En los dos casos
  // tienen que ser tres tonos distintos o no hay profundidad.
  for (const [nombre, esquema] of ESQUEMAS) {
    const tonos = new Set([esquema.fondo, esquema.superficie, esquema.superficieElevada]);
    assert.equal(tonos.size, 3, `${nombre}: las superficies no se distinguen`);
  }
});

test('el mapa tiene su propia superficie y contrasta con sus calles', () => {
  // En claro las calles van blancas: si el mapa fuera del mismo tono que la
  // superficie, no se verían.
  const calleClara = '#ffffff';
  const relacion = medido(calleClara, ESQUEMA_CLARO.fondoDelMapa);
  assert.ok(relacion > 1.1, `el mapa claro y sus calles dan ${relacion}:1`);
  assert.notEqual(ESQUEMA_CLARO.fondoDelMapa, ESQUEMA_CLARO.superficie);
});

// ---------------------------------------------------------------------------
// Lo que acompaña al color
// ---------------------------------------------------------------------------

test('cada esquema tiene su sombra y su tratamiento de calles', () => {
  for (const esquema of ['claro', 'oscuro']) {
    assert.ok(SOMBRA_POR_ESQUEMA[esquema], `falta la sombra de ${esquema}`);
    assert.ok(OPACIDAD_DE_CALLE_POR_ESQUEMA[esquema] > 0, `falta la calle de ${esquema}`);
  }

  // En claro la sombra es más suave y más abierta: sobre marfil, una sombra
  // dura se ve como suciedad.
  assert.ok(SOMBRA_POR_ESQUEMA.claro.shadowOpacity < SOMBRA_POR_ESQUEMA.oscuro.shadowOpacity);
  assert.ok(SOMBRA_POR_ESQUEMA.claro.shadowRadius > SOMBRA_POR_ESQUEMA.oscuro.shadowRadius);
});

test('los dos esquemas declaran exactamente los mismos tokens', () => {
  // Si a uno le faltara uno, ese sitio quedaría con `undefined` y en React
  // Native eso es un color transparente: un texto invisible, no un error.
  assert.deepEqual(
    Object.keys(ESQUEMA_CLARO).sort(),
    Object.keys(ESQUEMA_OSCURO).sort()
  );
});
