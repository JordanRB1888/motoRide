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

test('el listado se pide siempre con un tamano de pagina explicito', () => {
  const fuente = leer(PANEL);
  const llamadas = fuente.match(/apiService\.get\(\s*['"`]\/support\/threads[^'"`]*['"`]/g) || [];
  assert.ok(llamadas.length > 0, 'el panel debe seguir pidiendo el listado');
  for (const llamada of llamadas) {
    assert.match(llamada, /limit=\d+/, `sin limite explicito: ${llamada}`);
  }
});

test('los mensajes se piden al endpoint del hilo, no al listado', () => {
  for (const archivo of [PANEL, MODAL]) {
    const fuente = leer(archivo);
    assert.match(
      fuente,
      /\/support\/threads\/\$\{encodeURIComponent\([^)]+\)\}\/messages\?limit=\d+/,
      `${archivo} debe pedir los mensajes del hilo con limite`
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
