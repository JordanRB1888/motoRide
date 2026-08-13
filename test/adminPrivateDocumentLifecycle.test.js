import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cableado del cierre del visor de documentos protegidos.
 *
 * La semántica del visor (qué se revoca y cuándo) se comprueba de verdad en
 * privateDocumentViewer.test.js. Lo que falta por fijar es dónde se invoca ese
 * cierre, y eso vive en módulos que Vite transforma: adminApp.js y main.js
 * dependen de `import.meta.env`, así que no se pueden importar bajo Node. Estas
 * comprobaciones son, por tanto, sobre el código fuente, y afirman orden
 * exacto, no mera presencia.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

const adminApp = leer('src/pages/admin/adminApp.js');
const main = leer('src/main.js');
const pantalla = leer('src/pages/admin/driverApplicationsManagement.js');

/** Índice de la primera aparición, exigiendo que exista. */
function posicion(fuente, fragmento, contexto) {
  const indice = fuente.indexOf(fragmento);
  assert.notEqual(indice, -1, `${contexto}: no se encontró «${fragmento}»`);
  return indice;
}

test('el logout destruye el visor antes de borrar la sesión y de navegar', () => {
  const manejador = adminApp.slice(
    posicion(adminApp, "querySelector('#logout').onclick", 'manejador de salida'),
    posicion(adminApp, "querySelector('#logout').onclick", 'manejador de salida') + 220
  );

  const cierre = posicion(manejador, 'disposeDriverApplicationsManagement(content)', 'salida');
  const sesion = posicion(manejador, 'authService.logout()', 'salida');
  const navegacion = posicion(manejador, 'navigateTo', 'salida');

  assert.ok(cierre < sesion, 'el visor se cierra antes de borrar la sesión');
  assert.ok(cierre < navegacion, 'y antes de navegar fuera del panel');
});

test('cambiar de pestaña destruye el visor antes de vaciar el contenido', () => {
  const inicio = posicion(adminApp, 'const switchTab=', 'cambio de pestaña');
  const cuerpo = adminApp.slice(inicio, adminApp.indexOf('\n', inicio));

  const cierre = posicion(cuerpo, 'disposeDriverApplicationsManagement(content)', 'switchTab');
  const vaciado = posicion(cuerpo, "content.innerHTML=''", 'switchTab');
  assert.ok(cierre < vaciado, 'vaciar el DOM no revoca por sí solo las Blob URLs');
});

test('toda salida interna de la SPA pasa por el cierre global', () => {
  // El enrutador vacía #app en cada cambio de ruta: logout, navegación por hash
  // y cualquier redirección. Es el único punto que las cubre todas.
  assert.ok(
    main.includes("import { disposeAllPrivateDocumentViewers } from './pages/admin/driverApplicationsManagement.js'"),
    'main.js debe importar el cierre global'
  );

  const inicio = posicion(main, 'function clearApp()', 'enrutador');
  const cuerpo = main.slice(inicio, main.indexOf('\n}', inicio));
  const cierre = posicion(cuerpo, 'disposeAllPrivateDocumentViewers()', 'clearApp');
  const vaciado = posicion(cuerpo, "appContainer.innerHTML = ''", 'clearApp');
  assert.ok(cierre < vaciado, 'se cierra antes de desconectar el DOM');

  // Y clearApp se ejecuta al principio del enrutador, antes de decidir la ruta.
  const router = main.slice(posicion(main, 'async function router()', 'enrutador'));
  assert.ok(
    posicion(router, 'clearApp()', 'enrutador') < posicion(router, 'window.location.hash', 'enrutador'),
    'clearApp corre antes de resolver la ruta nueva'
  );
});

test('remontar el panel no acumula listeners globales duplicados', () => {
  const registros = pantalla.match(/window\.addEventListener\(/g) || [];
  assert.equal(registros.length, 1, 'un único registro global en todo el módulo');

  const inicio = posicion(pantalla, 'function hookUnloadOnce()', 'guarda de registro');
  const cuerpo = pantalla.slice(inicio, pantalla.indexOf('\n}', inicio));
  // El registro vive dentro de la guarda, y la guarda se cierra antes de registrar.
  assert.ok(cuerpo.includes("window.addEventListener('pagehide'"), 'el listener está dentro de la guarda');
  assert.ok(
    posicion(cuerpo, 'unloadHooked = true', 'guarda') < posicion(cuerpo, 'window.addEventListener', 'guarda'),
    'la bandera se marca antes de registrar, no después'
  );
  assert.ok(cuerpo.includes('if (unloadHooked'), 'y una segunda llamada no vuelve a registrar');
});

test('el cierre global destruye todas las instancias vivas y vacía el registro', () => {
  const inicio = posicion(pantalla, 'export function disposeAllPrivateDocumentViewers()', 'cierre global');
  const cuerpo = pantalla.slice(inicio, pantalla.indexOf('\n}', inicio));

  // Se itera sobre una copia: destroy() modifica el conjunto durante el bucle.
  assert.ok(cuerpo.includes('[...liveViewers]'), 'debe iterarse sobre una copia del conjunto');
  assert.ok(cuerpo.includes('viewer.destroy()'), 'cada instancia se destruye');
  assert.ok(cuerpo.includes('liveViewers.clear()'), 'y el registro queda vacío');
});

test('montar la pantalla cierra siempre la instancia anterior del contenedor', () => {
  const inicio = posicion(pantalla, 'export function renderDriverApplicationsManagement(', 'montaje');
  const cuerpo = pantalla.slice(inicio, inicio + 400);
  const cierre = posicion(cuerpo, 'disposeDriverApplicationsManagement(container)', 'montaje');
  const registro = posicion(cuerpo, 'createPrivateDocumentViewer', 'montaje');
  assert.ok(cierre < registro, 'un remontaje por Socket.IO no abandona la instancia previa');
});
