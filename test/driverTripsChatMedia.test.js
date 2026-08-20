import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatImageSource } from '../src/utils/chatMedia.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fuente = fs.readFileSync(path.join(raiz, 'src/pages/driver/driverTrips.js'), 'utf8');

/**
 * El expediente de un viaje archivado muestra la conversacion y sus
 * comprobantes. Seguia mirando solo `message.image`, asi que desde 4C --cuando
 * la imagen dejo de viajar dentro del mensaje-- los comprobantes nuevos
 * desaparecian de la ficha y el contador decia cero. Es justo la funcion para
 * la que se hicieron los adjuntos.
 */

const UUID = '11111111-2222-4333-8444-555555555555';
const OTRO = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const LEGACY = 'data:image/png;base64,iVBORw0KGgo=';

const conRef = id => ({ id: 'm' + id, imageRef: { id, mimeType: 'image/png' } });
const conLegacy = n => ({ id: 'l' + n, image: LEGACY });
const sinImagen = n => ({ id: 't' + n, text: 'solo texto' });

/** Lo que hace la pantalla: normalizar y contar sobre el resultado. */
const normalizar = mensajes => mensajes.map(message => ({ message, media: chatImageSource(message) }));
const contar = mensajes => normalizar(mensajes).filter(item => item.media).length;

// ------------------------------------------- 1-4) el recuento

test('1) solo imageRef: cuenta y se resuelve como referencia', () => {
  const items = normalizar([conRef(UUID)]);
  assert.equal(items.filter(i => i.media).length, 1);
  assert.equal(items[0].media.kind, 'ref');
  assert.equal(items[0].media.id, UUID);
});

test('2) solo image heredada: sigue contando y mostrandose', () => {
  const items = normalizar([conLegacy(1)]);
  assert.equal(items.filter(i => i.media).length, 1);
  assert.equal(items[0].media.kind, 'legacy');
  assert.equal(items[0].media.dataUrl, LEGACY);
});

test('3) con ambos, imageRef gana y cuenta UNO', () => {
  const mensaje = { id: 'x', imageRef: { id: UUID, mimeType: 'image/png' }, image: LEGACY };
  const items = normalizar([mensaje]);
  assert.equal(items.filter(i => i.media).length, 1, 'un mensaje es como mucho un adjunto');
  assert.equal(items[0].media.kind, 'ref', 'nunca debe pintarse la heredada si hay referencia');
});

test('4) una mezcla da el recuento exacto', () => {
  const mensajes = [
    conRef(UUID), conLegacy(1), sinImagen(1),
    { id: 'ambos', imageRef: { id: OTRO, mimeType: 'image/png' }, image: LEGACY },
    sinImagen(2), conRef(OTRO)
  ];
  assert.equal(contar(mensajes), 4, 'cuatro mensajes llevan adjunto');
  assert.equal(mensajes.length, 6, 'y seis son mensajes');

  // El campo heredado por si solo dice otra cosa: es el error que habia.
  assert.equal(mensajes.filter(m => m.image).length, 2,
    'contar por `image` daria 2 en lugar de 4');
});

test('sin imagen no produce adjunto', () => {
  assert.equal(contar([sinImagen(1), sinImagen(2)]), 0);
});

// ------------------------------------ 5-6) el marcado y la hidratacion

test('5) la referencia se pinta con data-chat-media, no con src', () => {
  assert.match(fuente, /data-chat-media="\$\{esc\(media\.id\)\}"/,
    'el adjunto privado debe marcarse para hidratar');
  assert.match(fuente, /media\.kind === 'ref'/, 'y decidirse por el tipo de medio');
  // El privado no puede llevar `src` directo: el navegador no manda la sesión.
  assert.ok(!/src="\$\{esc\(media\.id\)/.test(fuente), 'el id nunca va en un src');
});

test('6) la ficha se hidrata despues de pintar', () => {
  assert.match(fuente, /hydrateChatMedia\(container, chatMedia\)/,
    'debe pedir los adjuntos privados tras pintar');
});

test('usa las abstracciones oficiales, no una implementacion paralela', () => {
  assert.match(fuente, /from '\.\.\/\.\.\/utils\/chatMedia\.js'/);
  for (const marca of ['chatImageSource', 'createChatMediaLoader', 'hydrateChatMedia']) {
    assert.ok(fuente.includes(marca), `debe usar ${marca}`);
  }
  // Y no puede quedar ninguna lectura directa del campo heredado.
  assert.ok(!/message\.image\b/.test(fuente),
    'no debe quedar ningún acceso directo a message.image');
});

// ------------------------------------------ 7-9) el ciclo de vida

test('7) volver al listado suelta las URLs de la ficha', () => {
  const inicio = fuente.indexOf("querySelector('.trip-detail-back')");
  assert.notEqual(inicio, -1, 'no se encontró el botón de volver');
  const bloque = fuente.slice(inicio, inicio + 320);
  assert.match(bloque, /chatMedia\.releaseAll\(\)/,
    'al abandonar la ficha deben liberarse sus object URLs');
  const posSuelta = bloque.indexOf('releaseAll');
  const posLista = bloque.indexOf('drawList()');
  assert.ok(posSuelta < posLista, 'se sueltan antes de repintar el listado');
});

test('8) salir de la pantalla destruye el cargador', () => {
  assert.match(fuente, /new MutationObserver/, 'debe usar el patrón de desmontaje del proyecto');
  const inicio = fuente.indexOf('new MutationObserver');
  const bloque = fuente.slice(inicio, inicio + 420);
  assert.match(bloque, /chatMedia\.destroy\(\)/, 'y destruir el cargador al desmontarse');
  assert.match(bloque, /observer\.disconnect\(\)/, 'y desconectar el observador');
  assert.match(bloque, /document\.body\.contains\(container\)/, 'comprobando que la pantalla se fue');
});

test('9) el cargador es de la pantalla, no del modulo', () => {
  const lineas = fuente.split(/\r?\n/);
  assert.deepEqual(
    lineas.filter(l => /^(const|let|var)\s+\w+\s*=\s*createChatMediaLoader/.test(l)), [],
    'un cargador de módulo sobrevive a la pantalla y muere con la primera navegación'
  );
  assert.ok(
    lineas.some(l => /^\s+const\s+chatMedia\s*=\s*createChatMediaLoader/.test(l)),
    'debe crearse dentro de renderDriverTrips'
  );
});
