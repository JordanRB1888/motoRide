import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatImageSource, chatMediaEndpoint, isChatMediaId, createChatMediaLoader } from '../src/utils/chatMedia.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Consumo de adjuntos privados en el cliente.
 *
 * Desde 4C el mensaje nuevo trae `imageRef` y el contenido se descarga
 * autenticado; los mensajes anteriores siguen trayendo la data URL en `image`.
 * Los dos formatos conviven, y el primero manda: si un registro trajera ambos,
 * la imagen no puede pintarse dos veces.
 */

const UUID = '11111111-2222-4333-8444-555555555555';
const OTRO_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const LEGACY = 'data:image/png;base64,iVBORw0KGgo=';

// ------------------------------------------------- eleccion del formato

test('A) un mensaje con imageRef se resuelve por el endpoint autenticado', () => {
  const origen = chatImageSource({ imageRef: { id: UUID, mimeType: 'image/png' } });
  assert.deepEqual(origen, { kind: 'ref', id: UUID });
  assert.equal(chatMediaEndpoint(UUID), `/api/chat-media/${UUID}/content`);
});

test('B) un mensaje heredado sigue mostrándose', () => {
  const origen = chatImageSource({ image: LEGACY });
  assert.deepEqual(origen, { kind: 'legacy', dataUrl: LEGACY });
});

test('C) con los dos formatos, imageRef gana', () => {
  const origen = chatImageSource({ imageRef: { id: UUID, mimeType: 'image/png' }, image: LEGACY });
  assert.equal(origen.kind, 'ref', 'nunca debe pintarse la data URL si hay referencia');
  assert.equal(origen.id, UUID);
});

test('un mensaje sin imagen no produce origen', () => {
  for (const mensaje of [{}, { image: '' }, { imageRef: {} }, { imageRef: { id: 'no-uuid' } }, null]) {
    assert.equal(chatImageSource(mensaje), null, `no debía haber imagen en ${JSON.stringify(mensaje)}`);
  }
});

test('el filtro de la data URL heredada se respeta si se pasa', () => {
  // El chat de viaje aplica su propia higiene de 2B-2-3; si esa dice que no,
  // aqui tampoco.
  const mensaje = { image: 'javascript:alert(1)' };
  assert.equal(chatImageSource(mensaje, { isLegacyDataUrl: () => false }), null);
});

test('M) un identificador que no sea UUID v4 nunca produce endpoint', () => {
  for (const malo of [
    'no-uuid', '../../etc/passwd', '', null, 42,
    '11111111-2222-1333-8444-555555555555',   // v1
    '11111111-2222-4333-c444-555555555555'    // variante invalida
  ]) {
    assert.equal(isChatMediaId(malo), false, `no debía aceptarse: ${String(malo)}`);
    assert.equal(chatMediaEndpoint(malo), null);
  }
});

// ------------------------------ descarga, deduplicacion y propiedad

/** Cargador con descarga y revocación instrumentadas. */
function cargadorDePrueba({ resolver } = {}) {
  const peticiones = [];
  const revocadas = [];
  let siguiente = 0;
  const loader = createChatMediaLoader({
    loadUrl: async (endpoint) => {
      peticiones.push(endpoint);
      if (resolver) return resolver(endpoint);
      siguiente += 1;
      return `blob:objeto-${siguiente}`;
    },
    revokeUrl: url => revocadas.push(url)
  });
  return { loader, peticiones, revocadas };
}

test('D) la descarga pasa por el cliente autenticado, no por un src directo', async () => {
  const { loader, peticiones } = cargadorDePrueba();
  await loader.load(UUID);
  assert.deepEqual(peticiones, [`/api/chat-media/${UUID}/content`],
    'debe pedirse la ruta del endpoint, que apiService firma con la sesión');
});

test('F) dos renders del mismo adjunto no provocan dos descargas', async () => {
  const { loader, peticiones } = cargadorDePrueba();
  const primera = await loader.load(UUID);
  const segunda = await loader.load(UUID);

  assert.equal(primera, segunda, 'debe reutilizarse la misma object URL');
  assert.equal(peticiones.length, 1, `se descargó ${peticiones.length} veces`);
});

test('G) dos peticiones simultáneas del mismo adjunto se deduplican', async () => {
  // Cada descarga queda pendiente hasta que se sueltan todas a la vez. Si la
  // deduplicacion desapareciera habria dos, y la prueba debe fallar por el
  // recuento --no quedarse colgada esperando una que nadie resuelve--.
  const sueltas = [];
  const { loader, peticiones } = cargadorDePrueba({
    resolver: () => new Promise(resolve => sueltas.push(resolve))
  });

  const a = loader.load(UUID);
  const b = loader.load(UUID);
  assert.equal(peticiones.length, 1, `se lanzaron ${peticiones.length} descargas en paralelo`);

  for (const soltar of sueltas) soltar('blob:unico');
  assert.equal(await a, 'blob:unico');
  assert.equal(await b, 'blob:unico');
});

test('adjuntos distintos sí se descargan por separado', async () => {
  const { loader, peticiones } = cargadorDePrueba();
  await loader.load(UUID);
  await loader.load(OTRO_UUID);
  assert.equal(peticiones.length, 2);
});

test('H) la object URL se libera al soltar el adjunto', async () => {
  const { loader, revocadas } = cargadorDePrueba();
  const url = await loader.load(UUID);

  loader.release(UUID);
  assert.deepEqual(revocadas, [url], 'debía revocarse exactamente esa URL');

  // Y no se revoca dos veces.
  loader.release(UUID);
  assert.equal(revocadas.length, 1, 'no debe haber doble revocación');
});

test('I) cerrar la conversación libera todo lo abierto', async () => {
  const { loader, revocadas } = cargadorDePrueba();
  await loader.load(UUID);
  await loader.load(OTRO_UUID);
  assert.equal(loader.openCount, 2);

  loader.destroy();
  assert.equal(revocadas.length, 2, 'las dos URLs debían liberarse');
  assert.equal(loader.openCount, 0);
  assert.equal(loader.destroyed, true);
  // Y ya no se descarga nada mas.
  assert.equal(await loader.load(UUID), null);
});

test('una respuesta que llega tarde no deja una URL sin dueño', async () => {
  let resolverPendiente;
  const { loader, revocadas } = cargadorDePrueba({
    resolver: () => new Promise(resolve => { resolverPendiente = resolve; })
  });

  const pendiente = loader.load(UUID);
  loader.destroy();              // la conversacion se cierra antes de que llegue
  resolverPendiente('blob:tardia');

  assert.equal(await pendiente, null, 'no debe usarse una respuesta de una vista cerrada');
  assert.ok(revocadas.includes('blob:tardia'), 'y su object URL debe revocarse igualmente');
});

// ------------------------------------------- fallos que no rompen nada

test('J+K+L) un fallo de una imagen no rompe la conversación', async () => {
  // El cargador traduce cualquier fallo --429, 403, 401, blob ilegible-- al
  // mismo resultado: no hay imagen. El hilo se pinta igual.
  for (const fallo of [
    () => Promise.resolve(null),                       // 401/403/404/429: apiService devuelve null
    () => Promise.reject(new Error('red caida')),      // la descarga revienta
    () => Promise.reject(new TypeError('blob invalido'))
  ]) {
    const { loader } = cargadorDePrueba({ resolver: fallo });
    assert.equal(await loader.load(UUID), null, 'un fallo debe resolverse a null, no lanzar');
    assert.equal(loader.destroyed, false, 'y el cargador debe seguir vivo');
  }
});

// --------------------------------------- los consumidores, por su fuente

test('los tres consumidores usan el cargador y sueltan lo suyo', () => {
  const consumidores = [
    ['src/components/chatModal.js', 'chatMedia.destroy()'],
    ['src/components/adminSupportChat.js', 'chatMedia.releaseAll()'],
    ['src/pages/admin/adminSupport.js', 'hydrateChatMedia']
  ];
  for (const [archivo, marca] of consumidores) {
    const fuente = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    assert.match(fuente, /createChatMediaLoader|chatMedia/, `${archivo} debe usar el cargador`);
    assert.ok(fuente.includes(marca), `${archivo} debe incluir ${marca}`);
    assert.match(fuente, /chatImageSource|hydrateChatMedia/, `${archivo} debe elegir el formato`);
  }
});

test('E) ningún consumidor menciona la clave privada del almacén', () => {
  for (const archivo of [
    'src/components/chatModal.js', 'src/components/adminSupportChat.js',
    'src/pages/admin/adminSupport.js', 'src/utils/chatMedia.js', 'src/services/apiService.js'
  ]) {
    const fuente = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    assert.ok(!fuente.includes('imageStorageKey'),
      `${archivo} no debe conocer la clave privada del almacén`);
    assert.ok(!fuente.includes('chat-media/') || fuente.includes('/api/chat-media/'),
      `${archivo} no debe componer rutas del almacén`);
  }
});
