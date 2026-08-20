import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Inventario de quien pinta imagenes de mensajes.
 *
 * `driverTrips.js` se quedo atras al pasar a 4C: seguia leyendo `message.image`
 * y por eso los comprobantes nuevos desaparecian de su pantalla. Nadie lo
 * detecto porque no habia ninguna prueba que preguntara «quien mas pinta
 * imagenes de mensajes».
 *
 * Esta la hace. Si aparece un quinto renderizador, la suite obliga a
 * clasificarlo y a usar las abstracciones oficiales en lugar de leer el campo
 * heredado por su cuenta.
 */

// -------------------------------------------------- el inventario

/** Pantallas que muestran la imagen de un mensaje. */
const RENDERIZADORES = [
  'src/components/chatModal.js',
  'src/components/adminSupportChat.js',
  'src/pages/admin/adminSupport.js',
  'src/pages/driver/driverTrips.js'
];

/**
 * Ficheros que tocan el campo de imagen SIN pintarla, y por que se admiten.
 *
 * Distinguirlos importa: exigirles el cargador seria absurdo --no pintan nada--
 * y prohibirles la palabra `image` los dejaria sin poder hacer su trabajo.
 */
const NO_RENDERIZADORES = {
  'src/utils/chatMedia.js': 'la abstraccion oficial; es quien decide entre los dos formatos',
  'src/components/chatModal.js': 'renderizador, listado aparte'
};

/** Cadenas que delatan que un fichero PINTA una imagen de mensaje. */
const PINTA_IMAGEN = [
  /<img[^>]*src="\$\{[^}]*\bimage\b/i,          // src directo del campo heredado
  /<img[^>]*data-chat-media=/i,                  // hueco para hidratar
  /<img[^>]*src="\$\{esc\(media\./i,             // marcado por medio normalizado
  /<img[^>]*src="\$\{[^}]*dataUrl/i
];

/** Lectura del campo heredado que NO es pintar: resumenes e indicadores. */
const SOLO_INDICADOR = [
  /hasImage/,                    // el resumen del hilo dice si hay, no la trae
  /\?\s*'Archivo adjunto'/,      // texto de reserva en un listado
  /Boolean\(/                    // conversion a bandera
];

function fuentesDe(dir, acumulado = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) fuentesDe(completa, acumulado);
    else if (entrada.isFile() && entrada.name.endsWith('.js')) acumulado.push(completa);
  }
  return acumulado;
}

const relativa = completa => path.relative(raiz, completa).split(path.sep).join('/');

// ------------------------------------------- el inventario se mantiene

test('los renderizadores de imágenes de mensaje son exactamente los del inventario', () => {
  const sospechosos = [];

  for (const completa of fuentesDe(path.join(raiz, 'src'))) {
    const archivo = relativa(completa);
    const fuente = fs.readFileSync(completa, 'utf8');

    // ¿Toca el campo de imagen de un mensaje?
    const tocaImagen = /\bmessage\.image\b|\bm\.image\b|\bmsg\.image\b|chatImageSource|imageRef/.test(fuente);
    if (!tocaImagen) continue;

    // ¿Lo pinta, o solo lo consulta?
    const pinta = PINTA_IMAGEN.some(patron => patron.test(fuente));
    if (!pinta) continue;

    // Los productores y los resúmenes no cuentan como renderizadores.
    const soloIndicador = SOLO_INDICADOR.some(patron => patron.test(fuente))
      && !/data-chat-media|chatImageSource/.test(fuente);
    if (soloIndicador) continue;

    if (!RENDERIZADORES.includes(archivo)) sospechosos.push(archivo);
  }

  assert.deepEqual(
    sospechosos, [],
    'renderizador de imágenes de mensaje fuera del inventario:\n  ' + sospechosos.join('\n  ')
      + '\n\nSi es legítimo, añádelo a RENDERIZADORES y haz que use chatImageSource,'
      + '\ncreateChatMediaLoader y hydrateChatMedia como los demás.'
  );
});

test('cada renderizador del inventario existe y usa la abstracción oficial', () => {
  for (const archivo of RENDERIZADORES) {
    const completa = path.join(raiz, archivo);
    assert.ok(fs.existsSync(completa), `${archivo} está en el inventario pero no existe`);
    const fuente = fs.readFileSync(completa, 'utf8');

    assert.match(fuente, /chatImageSource/,
      `${archivo} debe decidir el formato con chatImageSource, no leyendo campos a mano`);
    assert.ok(
      !/\bmessage\.image\b|\bm\.image\b|\bmsg\.image\b/.test(fuente),
      `${archivo} no debe leer el campo heredado directamente`
    );
  }
});

test('todo el que soporte adjuntos privados los carga y los suelta', () => {
  for (const archivo of RENDERIZADORES) {
    const fuente = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    if (!/data-chat-media/.test(fuente)) continue;   // solo heredado: no aplica

    assert.match(fuente, /createChatMediaLoader/, `${archivo} debe crear su cargador`);
    assert.match(fuente, /hydrateChatMedia/, `${archivo} debe hidratar tras pintar`);
    assert.match(fuente, /chatMedia\.destroy\(\)/, `${archivo} debe destruirlo al desaparecer`);
  }
});

// ------------------------------- productores y resumenes: no confundirlos

test('los productores no se confunden con renderizadores', () => {
  // `passengerApp.js` y `driverApp.js` envian imagenes y muestran indicadores,
  // pero no pintan el adjunto: no deben exigirse cargador.
  for (const archivo of ['src/pages/passenger/passengerApp.js', 'src/pages/driver/driverApp.js']) {
    const completa = path.join(raiz, archivo);
    if (!fs.existsSync(completa)) continue;
    assert.ok(
      !RENDERIZADORES.includes(archivo),
      `${archivo} no es un renderizador de adjuntos y no debe estar en el inventario`
    );
  }
});

test('el resumen del hilo reconoce los dos formatos', () => {
  // `hasImage` es un indicador, no un render, pero si mirara solo el campo
  // heredado el listado dejaria de senalar los adjuntos nuevos.
  const servidor = fs.readFileSync(path.join(raiz, 'server/index.js'), 'utf8');
  const inicio = servidor.indexOf('function summarizeSupportMessage');
  assert.notEqual(inicio, -1);
  const cuerpo = servidor.slice(inicio, servidor.indexOf('}', servidor.indexOf('hasImage', inicio)));
  assert.match(cuerpo, /message\.image \|\| message\.imageRef/,
    'hasImage debe contar tambien el formato nuevo');
});
