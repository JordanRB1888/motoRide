import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_CHAT_MEDIA_BYTES,
  MIN_FREE_BYTES,
  createChatMediaStorage,
  isContainedIn,
  resolveChatMediaRoot
} from '../services/chatMediaStorage.js';

/** Fixtures sintéticos: cabecera real del formato + relleno. Ninguna imagen real. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(120).fill(0x20)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(120).fill(0x20)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('WEBP'), Buffer.alloc(120, 0x20)
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
const TEXTO = Buffer.from('esto no es una imagen aunque lo diga la cabecera declarada');

function temporal(t, sufijo = '') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `chat-media-${sufijo}`));
  t.after(() => { try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* limpieza */ } });
  return base;
}

/** Estructura mínima de volumen: <base>/data/plus58express.sqlite */
function volumen(t, sufijo = '') {
  const base = temporal(t, sufijo);
  const dataDir = path.join(base, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return { base, dataDir, dataFile: path.join(dataDir, 'plus58express.sqlite') };
}

// ------------------------------------------------------- contención de rutas

test('isContainedIn acepta solo descendientes reales', () => {
  const raiz = path.resolve('/volumen/data');
  assert.equal(isContainedIn(raiz, path.resolve('/volumen/data/chat-media')), true);
  assert.equal(isContainedIn(raiz, path.resolve('/volumen/data/a/b/c')), true);

  // El propio directorio no cuenta como contenido.
  assert.equal(isContainedIn(raiz, raiz), false);
  // Hermano cuyo nombre empieza igual: lo que rompía `startsWith`.
  assert.equal(isContainedIn(raiz, path.resolve('/volumen/data-falso')), false);
  assert.equal(isContainedIn(raiz, path.resolve('/volumen/database')), false);
  // Ascensos y otros árboles.
  assert.equal(isContainedIn(raiz, path.resolve('/volumen')), false);
  assert.equal(isContainedIn(raiz, path.resolve('/otro/sitio')), false);
  // Un nombre que empieza por dos puntos no es un ascenso.
  assert.equal(isContainedIn(raiz, path.resolve('/volumen/data/..oculto')), true);
});

test('en producción sin CHAT_MEDIA_DIR el arranque falla', (t) => {
  const { dataFile } = volumen(t, 'prod-');
  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: {} }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );
});

test('fuera de producción el valor por omisión cuelga del directorio de datos', (t) => {
  const { dataDir, dataFile } = volumen(t, 'dev-');
  const raiz = resolveChatMediaRoot({ dataFile, isProduction: false, env: {} });
  assert.equal(raiz, fs.realpathSync(path.join(dataDir, 'chat-media')));
  assert.ok(fs.existsSync(raiz));
});

test('se rechaza un directorio hermano del volumen', (t) => {
  const { base, dataFile } = volumen(t, 'hermano-');
  // `/…/data-falso` supera una comparación por prefijo pero no la contención.
  const falso = path.join(base, 'data-falso');
  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: falso } }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );
});

test('se rechaza una ruta absoluta de otro árbol y el propio directorio de datos', (t) => {
  const { dataDir, dataFile } = volumen(t, 'ajena-');
  const otro = temporal(t, 'otro-');
  for (const candidato of [otro, dataDir]) {
    assert.throws(
      () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: candidato } }),
      error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE',
      `debía rechazarse: ${candidato}`
    );
  }
});

test('se rechaza un ascenso con .. aunque la ruta parezca interna', (t) => {
  const { dataDir, dataFile } = volumen(t, 'ascenso-');
  const escapa = path.join(dataDir, '..', 'fuera');
  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: escapa } }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );
});

test('un enlace simbólico que sale del volumen se rechaza', (t) => {
  const { dataDir, dataFile } = volumen(t, 'symlink-');
  const destinoFuera = temporal(t, 'destino-');
  const enlace = path.join(dataDir, 'chat-media');
  try {
    fs.symlinkSync(destinoFuera, enlace, 'junction');
  } catch {
    t.skip('el entorno no permite crear enlaces simbólicos');
    return;
  }
  // Resolver con realpath antes de comparar es lo que descubre el escape.
  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: enlace } }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );
});

test('el centinela de escritura no queda residual', (t) => {
  const { dataDir, dataFile } = volumen(t, 'centinela-');
  const destino = path.join(dataDir, 'chat-media');
  const raiz = resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: destino } });
  const restos = fs.readdirSync(raiz);
  assert.deepEqual(restos, [], `no debía quedar ningún archivo: ${restos.join(', ')}`);
});

// ------------------------------------------- cero efectos fuera de la raíz

test('una ruta externa rechazada no crea nada en el destino', (t) => {
  const { dataFile } = volumen(t, 'externo-');
  // Destino fuera del volumen que NO existe: debe seguir sin existir.
  const fuera = path.join(os.tmpdir(), `chat-media-nunca-${Date.now()}-${process.pid}`);
  assert.equal(fs.existsSync(fuera), false, 'precondición: no existe');

  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: fuera } }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );

  assert.equal(fs.existsSync(fuera), false, 'el rechazo no debe haberlo creado');
});

test('un hermano del volumen rechazado no queda creado', (t) => {
  const { base, dataFile } = volumen(t, 'hermano-limpio-');
  const falso = path.join(base, 'data-falso', 'chat-media');
  assert.equal(fs.existsSync(path.join(base, 'data-falso')), false);

  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: falso } }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );

  assert.equal(fs.existsSync(path.join(base, 'data-falso')), false, 'ni el padre debe crearse');
  assert.equal(fs.existsSync(falso), false);
});

test('un ascenso rechazado no crea el directorio de destino', (t) => {
  const { base, dataFile } = volumen(t, 'ascenso-limpio-');
  const escapa = path.join(base, 'data', '..', 'fuera');
  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: escapa } }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );
  assert.equal(fs.existsSync(path.join(base, 'fuera')), false);
});

test('un symlink que sale del volumen no deja nada dentro del destino', (t) => {
  const { dataDir, dataFile } = volumen(t, 'symlink-limpio-');
  const destinoFuera = temporal(t, 'destino-limpio-');
  const enlace = path.join(dataDir, 'chat-media');
  try {
    fs.symlinkSync(destinoFuera, enlace, 'junction');
  } catch {
    t.skip('el entorno no permite crear enlaces simbólicos');
    return;
  }
  const antes = fs.readdirSync(destinoFuera);

  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: enlace } }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );

  assert.deepEqual(fs.readdirSync(destinoFuera), antes, 'el destino externo queda intacto');
  assert.deepEqual(antes, [], 'y sigue vacío: ni centinela ni subdirectorios');
});

test('un ancestro intermedio que sale del volumen se rechaza sin escribir', (t) => {
  const { dataDir, dataFile } = volumen(t, 'intermedio-');
  const destinoFuera = temporal(t, 'intermedio-destino-');
  const puente = path.join(dataDir, 'puente');
  try {
    fs.symlinkSync(destinoFuera, puente, 'junction');
  } catch {
    t.skip('el entorno no permite crear enlaces simbólicos');
    return;
  }
  // La ruta es léxicamente interna, pero pasa por un enlace que sale.
  const candidato = path.join(puente, 'chat-media');

  assert.throws(
    () => resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: candidato } }),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE'
  );

  assert.deepEqual(fs.readdirSync(destinoFuera), [], 'nada se creó a través del enlace');
});

// ------------------------------------------------------------- saveBuffer

function almacen(t, opciones = {}) {
  const { dataDir, dataFile } = volumen(t, 'save-');
  const raiz = resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: path.join(dataDir, 'chat-media') } });
  return createChatMediaStorage({ rootDirectory: raiz, ...opciones });
}

test('saveBuffer acepta los tres formatos del contrato', (t) => {
  const storage = almacen(t);
  for (const [buffer, mime] of [[PNG, 'image/png'], [JPEG, 'image/jpeg'], [WEBP, 'image/webp']]) {
    const key = storage.saveBuffer(buffer, mime, 'user_1');
    assert.ok(key, `${mime} debía guardarse`);
    const leido = storage.readImage(key, mime);
    assert.ok(leido, 'y volver a leerse revalidando la firma');
    assert.equal(leido.mimeType, mime);
  }
});

test('la clave no revela nada y el archivo queda con permisos restrictivos', (t) => {
  const storage = almacen(t);
  const key = storage.saveBuffer(PNG, 'image/png', 'user_secreto');
  assert.ok(!key.includes('user_secreto') || key.startsWith('user_secreto/'), 'el propietario solo agrupa');
  const absoluta = storage.resolve(key);
  assert.ok(absoluta, 'la clave resuelve dentro de la raíz');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(absoluta).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(absoluta)).mode & 0o777, 0o700);
  }
});

test('un MIME de imagen con contenido que no lo es se rechaza', (t) => {
  const storage = almacen(t);
  assert.throws(() => storage.saveBuffer(TEXTO, 'image/png', 'u'), error => error.code === 'INVALID_FILE_TYPE');
  // Firma de otro formato bajo el MIME declarado: polyglot.
  assert.throws(() => storage.saveBuffer(JPEG, 'image/png', 'u'), error => error.code === 'INVALID_FILE_TYPE');
});

test('el SVG se rechaza por no tener firma binaria', (t) => {
  const storage = almacen(t);
  assert.throws(() => storage.saveBuffer(SVG, 'image/svg+xml', 'u'), error => error.code === 'INVALID_FILE_TYPE');
  assert.throws(() => storage.saveBuffer(SVG, 'image/png', 'u'), error => error.code === 'INVALID_FILE_TYPE');
});

test('los tipos fuera del contrato se rechazan', (t) => {
  const storage = almacen(t);
  for (const mime of ['image/gif', 'image/jpg', 'application/pdf', 'text/plain', '', null]) {
    assert.throws(() => storage.saveBuffer(PNG, mime, 'u'), error => error.code === 'INVALID_FILE_TYPE', `${mime}`);
  }
  assert.throws(() => storage.saveBuffer(Buffer.alloc(0), 'image/png', 'u'), error => error.code === 'INVALID_FILE_TYPE');
});

test('un archivo por encima del límite se rechaza', (t) => {
  const storage = almacen(t);
  const grande = Buffer.concat([PNG, Buffer.alloc(MAX_CHAT_MEDIA_BYTES, 0x20)]);
  assert.throws(() => storage.saveBuffer(grande, 'image/png', 'u'), error => error.code === 'CHAT_MEDIA_TOO_LARGE');
  assert.equal(MAX_CHAT_MEDIA_BYTES, 750_000);
});

test('un rechazo no deja el archivo a medias', (t) => {
  const storage = almacen(t);
  const antes = fs.readdirSync(storage.root);
  for (const intento of [[TEXTO, 'image/png'], [SVG, 'image/png'], [PNG, 'image/gif']]) {
    assert.throws(() => storage.saveBuffer(intento[0], intento[1], 'u'));
  }
  assert.deepEqual(fs.readdirSync(storage.root), antes, 'ningún archivo residual tras los rechazos');
});

// ----------------------------------------------------------------- espacio

test('sin la reserva mínima se rechaza con error tipado y no se borra nada', (t) => {
  // Reserva imposible de satisfacer: fuerza el camino de falta de espacio.
  const storage = almacen(t, { minFreeBytes: Number.MAX_SAFE_INTEGER });
  assert.throws(
    () => storage.saveBuffer(PNG, 'image/png', 'u'),
    error => error.code === 'CHAT_MEDIA_STORAGE_FULL'
  );
});

test('la falta de espacio no afecta a las lecturas existentes', (t) => {
  const { dataDir, dataFile } = volumen(t, 'lecturas-');
  const raiz = resolveChatMediaRoot({ dataFile, isProduction: true, env: { CHAT_MEDIA_DIR: path.join(dataDir, 'chat-media') } });

  const holgado = createChatMediaStorage({ rootDirectory: raiz });
  const key = holgado.saveBuffer(PNG, 'image/png', 'u');

  // Mismo almacén, ahora sin reserva: la escritura falla, la lectura no.
  const lleno = createChatMediaStorage({ rootDirectory: raiz, minFreeBytes: Number.MAX_SAFE_INTEGER });
  assert.throws(() => lleno.saveBuffer(JPEG, 'image/jpeg', 'u'), error => error.code === 'CHAT_MEDIA_STORAGE_FULL');

  const leido = lleno.readImage(key, 'image/png');
  assert.ok(leido, 'el archivo anterior se sigue sirviendo');
  assert.ok(fs.existsSync(holgado.resolve(key)), 'y no se ha borrado nada');
  assert.equal(MIN_FREE_BYTES, 50 * 1024 * 1024);
});

test('un archivo alterado en disco deja de leerse', (t) => {
  const storage = almacen(t);
  const key = storage.saveBuffer(PNG, 'image/png', 'u');
  fs.writeFileSync(storage.resolve(key), TEXTO);
  assert.equal(storage.readImage(key, 'image/png'), null, 'la firma se revalida al leer');
});

test('un fallo al consultar el espacio no se confunde con falta de reserva', (t) => {
  const storage = almacen(t);
  const original = fs.statfsSync;
  fs.statfsSync = () => { const e = new Error('EIO'); e.code = 'EIO'; throw e; };
  t.after(() => { fs.statfsSync = original; });

  assert.throws(
    () => storage.saveBuffer(PNG, 'image/png', 'u'),
    error => error.code === 'CHAT_MEDIA_STORAGE_UNAVAILABLE',
    'no saber cuánto queda no es lo mismo que no quedar sitio'
  );
});

test('CHAT_MEDIA_STORAGE_FULL se reserva para la falta real de reserva', (t) => {
  const storage = almacen(t, { minFreeBytes: Number.MAX_SAFE_INTEGER });
  assert.throws(
    () => storage.saveBuffer(PNG, 'image/png', 'u'),
    error => error.code === 'CHAT_MEDIA_STORAGE_FULL'
  );
});
