import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativa => fs.readFileSync(path.join(raiz, relativa), 'utf8');

const PANEL = 'src/pages/admin/adminSupport.js';
const MODAL = 'src/components/adminSupportChat.js';

/**
 * `/api/support/threads` devolvia el historial completo de todos los hilos con
 * las imagenes en base64 incrustadas: 149 MB en una sola respuesta con el
 * volumen de seis meses, medido contra el servidor real. Ahora devuelve un
 * sobre paginado con solo el resumen del ultimo mensaje.
 *
 * Estas comprobaciones existen para que ningun cambio posterior vuelva a
 * pedir el historial entero desde el listado.
 */

test('ningun consumidor espera ya la coleccion de mensajes dentro del hilo', () => {
  for (const archivo of [PANEL, MODAL]) {
    const fuente = leer(archivo);
    assert.ok(
      !/thread\.messages|\.messages\s*\?\.\s*at\(-1\)/.test(fuente),
      `${archivo} sigue leyendo el historial desde el listado`
    );
  }
});

/**
 * Maximos que impone el servidor (server/index.js, SUPPORT_*_PAGE). Lo que
 * pida la pantalla tiene que caber por debajo, o la peticion se rechaza con
 * LIMIT_TOO_LARGE y el panel se queda en blanco.
 */
const MAX_HILOS_SERVIDOR = 100;
const MAX_MENSAJES_SERVIDOR = 50;

/** Tramos de texto que siguen a cada peticion de soporte, con su archivo. */
function peticionesDeSoporte() {
  const encontradas = [];
  for (const archivo of [PANEL, MODAL]) {
    const fuente = leer(archivo);
    for (const m of fuente.matchAll(/\/support\/threads/g)) {
      const tramo = fuente.slice(m.index, m.index + 200);
      // `/read` marca un hilo como leido: no es un listado y no debe llevar
      // tamano de pagina.
      if (/^\/support\/threads\/\$\{[^`]*\/read/.test(tramo)) continue;
      encontradas.push({ archivo, tramo });
    }
  }
  return encontradas;
}

/** Valor de una constante numerica declarada en el archivo. */
function constante(archivo, nombre) {
  const m = leer(archivo).match(new RegExp(`const ${nombre}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

test('toda peticion de soporte lleva un tamano de pagina acotado', () => {
  const peticiones = peticionesDeSoporte();
  assert.ok(peticiones.length >= 3, `se esperaban varias peticiones, hay ${peticiones.length}`);
  for (const { archivo, tramo } of peticiones) {
    // El limite puede ser literal, una constante interpolada, o venir de un
    // constructor de parametros; lo que no vale es pedir sin acotar.
    const acotado = /limit=(\d+|\$\{)/.test(tramo) || /\$\{parametros\.toString\(\)\}/.test(tramo);
    assert.ok(acotado, `${archivo} pide sin limite: ${tramo.slice(0, 80)}`);
  }
});

test('el constructor de la consulta de hilos fija siempre el limite', () => {
  // Es el unico sitio desde el que se pide el listado, asi que su tamano de
  // pagina no puede ser opcional.
  const panel = leer(PANEL);
  const constructor = panel.match(/const consultaHilos = [\s\S]{0,400}?\n  \};/);
  assert.ok(constructor, 'debe existir el constructor de la consulta');
  assert.match(constructor[0], /limit: String\(THREADS_PAGE\)/, 'el limite debe fijarse siempre');
  assert.match(constructor[0], /parametros\.set\('search'/, 'y el texto buscado viajar al servidor');
});

test('los tamanos de pagina caben por debajo del maximo del servidor', () => {
  const hilos = constante(PANEL, 'THREADS_PAGE');
  const mensajesPanel = constante(PANEL, 'MESSAGES_PAGE');
  const mensajesModal = constante(MODAL, 'PAGINA');

  assert.ok(hilos, 'el panel debe declarar el tamano de pagina de hilos');
  assert.ok(mensajesPanel, 'y el de mensajes');
  assert.ok(mensajesModal, 'el modal tambien');

  // Pasarse del maximo devuelve LIMIT_TOO_LARGE y la pantalla se queda vacia.
  assert.ok(hilos > 0 && hilos <= MAX_HILOS_SERVIDOR, `hilos: ${hilos}`);
  assert.ok(mensajesPanel > 0 && mensajesPanel <= MAX_MENSAJES_SERVIDOR, `mensajes: ${mensajesPanel}`);
  assert.ok(mensajesModal > 0 && mensajesModal <= MAX_MENSAJES_SERVIDOR, `modal: ${mensajesModal}`);
});

test('lo que no cabe en la primera pagina se alcanza con el cursor', () => {
  // Sin consumir nextCursor, subir el limite solo correria el problema mas
  // lejos: a partir del tope del servidor habria hilos y mensajes
  // inalcanzables desde la interfaz.
  const panel = leer(PANEL);
  assert.match(panel, /threadsCursor/, 'el panel debe guardar el cursor de hilos');
  assert.match(panel, /messagesCursor/, 'y el de mensajes');
  assert.match(panel, /support-more-threads/, 'con un control para continuar la lista');
  assert.match(panel, /support-older-messages/, 'y otro para los mensajes anteriores');

  const modal = leer(MODAL);
  assert.match(modal, /olderCursor/, 'el modal tambien continua hacia atras');
});

test('los mensajes se piden al endpoint del hilo, no al listado', () => {
  for (const archivo of [PANEL, MODAL]) {
    const fuente = leer(archivo);
    assert.match(
      fuente,
      /\/support\/threads\/\$\{encodeURIComponent\(.*?\)\}\/messages/,
      `${archivo} debe pedir los mensajes al endpoint del hilo`
    );
  }
});

test('el identificador del hilo se escapa siempre en la ruta', () => {
  for (const archivo of [PANEL, MODAL]) {
    const fuente = leer(archivo);
    const rutas = fuente.match(/\/support\/threads\/\$\{[^}]+\}/g) || [];
    assert.ok(rutas.length > 0, `${archivo} debe componer alguna ruta de hilo`);
    for (const ruta of rutas) {
      assert.match(ruta, /encodeURIComponent/, `identificador sin escapar: ${ruta}`);
    }
  }
});

test('el sobre paginado se lee por items, no como arreglo suelto', () => {
  const fuente = leer(PANEL);
  // Si se tratara la respuesta como arreglo, `threads` quedaria vacio y el
  // panel apareceria sin conversaciones sin dar ningun error.
  assert.match(fuente, /Array\.isArray\(threadData\?\.items\)/);
  assert.match(fuente, /threadData\?\.total/, 'el contador debe usar el total del servidor');
});

test('la metrica de tiempo de respuesta ya no se calcula en el navegador', () => {
  const fuente = leer(PANEL);
  // Calcularla en el cliente exigia recibir el historial completo.
  assert.ok(!/function averageResponseTime/.test(fuente), 'el calculo debe estar en el servidor');
  assert.match(fuente, /formatResponseTime\(averageResponseMs\)/);
});

test('la busqueda ya no se resuelve en el navegador', () => {
  const panel = leer(PANEL);
  // Filtrar aqui solo miraba los hilos ya descargados: una conversacion que
  // estuviera mas atras no aparecia nunca.
  assert.ok(
    !/haystack/.test(panel),
    'el filtro local por texto debe haber desaparecido'
  );
  assert.match(panel, /buscarDiferido\(\)/, 'escribir debe pedir al servidor');
  assert.match(panel, /setTimeout\(\(\) => \{ temporizadorBusqueda = null; loadThreads\(\); \}, \d+\)/,
    'y agrupar las pulsaciones');
});
