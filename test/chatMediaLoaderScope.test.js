import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatMediaLoader } from '../src/utils/chatMedia.js';
import { disposeAllPrivatePhotos } from '../src/utils/privatePhoto.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * El ciclo que faltaba probar: usar, navegar fuera, volver.
 *
 * `disposeAllPrivatePhotos()` corre en cada cambio de ruta y destruye todos los
 * cargadores vivos; `destroy()` es irreversible a proposito, porque una vista
 * cerrada no debe poder pintar nada mas. Con un cargador de modulo eso dejaba
 * un objeto muerto que la siguiente visita reutilizaba: las imagenes no volvian
 * hasta recargar la pagina entera.
 *
 * Ninguna prueba lo detectaba porque todas estrenaban cargador en cada caso.
 */

const UUID = '11111111-2222-4333-8444-555555555555';

/** Lo que hace una pantalla: nace con su cargador y lo destruye al irse. */
function abrirPantalla({ resolver } = {}) {
  const peticiones = [];
  const revocadas = [];
  let siguiente = 0;
  const loader = createChatMediaLoader({
    loadUrl: async (endpoint) => {
      peticiones.push(endpoint);
      if (resolver) return resolver(endpoint);
      siguiente += 1;
      return `blob:${siguiente}`;
    },
    revokeUrl: url => revocadas.push(url)
  });
  return { loader, peticiones, revocadas };
}

test('tras navegar fuera y volver, la pantalla nueva vuelve a cargar', async () => {
  // Primera visita.
  const primera = abrirPantalla();
  const url = await primera.loader.load(UUID);
  assert.equal(url, 'blob:1', 'la primera visita debe obtener su imagen');

  // Cambio de ruta: el enrutador destruye todo lo vivo.
  disposeAllPrivatePhotos();
  assert.equal(primera.loader.destroyed, true, 'el cargador de la visita anterior debe quedar destruido');
  assert.equal(await primera.loader.load(UUID), null, 'y no debe servir para nada mas');
  assert.deepEqual(primera.revocadas, [url], 'su object URL debe haberse liberado');

  // Se vuelve a la pantalla: instancia nueva, cargador nuevo.
  const segunda = abrirPantalla();
  assert.notEqual(segunda.loader, primera.loader, 'no puede reutilizarse el cargador muerto');
  assert.equal(segunda.loader.destroyed, false);

  const urlNueva = await segunda.loader.load(UUID);
  assert.ok(urlNueva, 'la visita nueva debe volver a cargar la imagen');
  assert.equal(segunda.peticiones.length, 1, 'y pedirla de verdad');

  segunda.loader.destroy();
});

test('destruir dos veces no revoca dos veces', async () => {
  const { loader, revocadas } = abrirPantalla();
  await loader.load(UUID);

  loader.destroy();
  const trasPrimera = revocadas.length;
  disposeAllPrivatePhotos();   // el enrutador pasa despues por encima
  loader.destroy();

  assert.equal(revocadas.length, trasPrimera, 'no debe haber doble revocación');
  assert.equal(trasPrimera, 1);
});

test('una respuesta tardía de la pantalla anterior no revive su URL', async () => {
  let soltar;
  const primera = abrirPantalla({ resolver: () => new Promise(res => { soltar = res; }) });

  const pendiente = primera.loader.load(UUID);
  disposeAllPrivatePhotos();        // se navega antes de que llegue
  soltar('blob:tardia');

  assert.equal(await pendiente, null, 'no debe aplicarse a una pantalla ya cerrada');
  assert.ok(primera.revocadas.includes('blob:tardia'), 'y su object URL debe revocarse igualmente');

  // Y la pantalla nueva no hereda nada de aquello.
  const segunda = abrirPantalla();
  assert.equal(await segunda.loader.load(UUID), 'blob:1');
  segunda.loader.destroy();
});

// ------------------------------------- el alcance, por la fuente

/**
 * Consumidores que muestran imagenes de mensajes y su fichero.
 *
 * Cada uno debe crear su cargador DENTRO de su funcion de pantalla o
 * instancia. Uno a nivel de modulo sobrevive al modulo, no a la pantalla, y
 * ahi es donde estaba el fallo.
 */
const CONSUMIDORES_CON_CARGADOR = [
  'src/components/chatModal.js',
  'src/components/adminSupportChat.js',
  'src/pages/admin/adminSupport.js',
  'src/pages/driver/driverTrips.js'
];

test('ningún consumidor crea el cargador a nivel de módulo', () => {
  for (const archivo of CONSUMIDORES_CON_CARGADOR) {
    const fuente = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    const lineas = fuente.split(/\r?\n/);
    const enModulo = lineas.filter(linea => /^(const|let|var)\s+\w+\s*=\s*createChatMediaLoader/.test(linea));
    assert.deepEqual(
      enModulo, [],
      `${archivo} crea el cargador a nivel de módulo: ${enModulo.join(' | ')}`
    );
    assert.match(fuente, /createChatMediaLoader\(/, `${archivo} debe crear un cargador`);
    // Y debe estar indentado, es decir, dentro de algo.
    assert.ok(
      lineas.some(linea => /^\s+(const|let)\s+\w+\s*=\s*createChatMediaLoader/.test(linea)),
      `${archivo} debe crear el cargador dentro de su función de pantalla`
    );
  }
});

test('cada consumidor suelta lo suyo al desaparecer', () => {
  for (const archivo of CONSUMIDORES_CON_CARGADOR) {
    const fuente = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    assert.match(
      fuente, /chatMedia\.destroy\(\)/,
      `${archivo} debe destruir su cargador cuando la pantalla desaparece`
    );
  }
});
