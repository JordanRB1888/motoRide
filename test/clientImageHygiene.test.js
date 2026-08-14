import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOwnedObjectUrl,
  createPrivatePhotoLoader,
  disposeAllPrivatePhotos,
  hydratePrivatePhotos,
  revokeOwnedObjectUrl
} from '../src/utils/privatePhoto.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => fs.readFileSync(path.join(raiz, r), 'utf8');

/**
 * `safeImageSrc` vive dentro del closure de chatModal, que no es importable
 * bajo Node. Se extrae su cuerpo del fuente y se evalúa: así se prueba la
 * función real, no una copia que podría divergir.
 */
function cargarSafeImageSrc() {
  const fuente = leer('src/components/chatModal.js');
  const i = fuente.indexOf('const CHAT_IMAGE_DATA_URL');
  const fin = fuente.indexOf('\n    }', fuente.indexOf('function safeImageSrc')) + 6;
  assert.ok(i !== -1 && fin > i, 'debe existir la validación de imágenes del chat');
  // eslint-disable-next-line no-new-func
  return new Function(`${fuente.slice(i, fin)}\nreturn safeImageSrc;`)();
}

const safeImageSrc = cargarSafeImageSrc();

// ------------------------------------------------------------------- SVG

test('se rechaza el SVG en todas sus variantes', () => {
  const variantes = [
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    'data:image/svg+xml,<svg/onload=alert(1)>',
    'data:image/svg+xml;charset=utf-8,<svg></svg>',
    'data:image/SVG+XML;base64,PHN2Zz48L3N2Zz4=',
    'data:image/svg+xml ; charset=utf-8 ,<svg></svg>',
    '  data:image/svg+xml,<svg></svg>  ',
    'data:image/svg+xml;charset=utf-8;foo=bar,<svg></svg>',
    'https://ejemplo.test/imagen.svg',
    'https://ejemplo.test/a.png?next=.svg'
  ];
  for (const valor of variantes) {
    assert.equal(safeImageSrc(valor), '', `debía rechazarse: ${valor.slice(0, 50)}`);
  }
});

test('se rechazan esquemas activos y HTML disfrazado', () => {
  const peligrosos = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:image/png,<script>alert(1)</script>',
    'data:image/png;base64,<script>',
    'http://ejemplo.test/a.png',
    '//ejemplo.test/a.png',
    'file:///etc/passwd'
  ];
  for (const valor of peligrosos) {
    assert.equal(safeImageSrc(valor), '', `debía rechazarse: ${valor.slice(0, 45)}`);
  }
});

test('solo se aceptan JPEG, PNG y WebP en base64, el contrato del servidor', () => {
  for (const tipo of ['jpeg', 'png', 'webp']) {
    const valor = `data:image/${tipo};base64,iVBORw0KGgo=`;
    assert.equal(safeImageSrc(valor), valor, `${tipo} debía aceptarse`);
  }
});

test('se rechaza lo que el servidor no acepta: GIF e image/jpg', () => {
  for (const tipo of ['gif', 'jpg', 'bmp', 'avif', 'tiff']) {
    const valor = `data:image/${tipo};base64,iVBORw0KGgo=`;
    assert.equal(safeImageSrc(valor), '', `${tipo} no forma parte del contrato`);
  }
  // Ni un MIME con parámetros añadidos.
  assert.equal(safeImageSrc('data:image/png;charset=utf-8;base64,iVBORw0KGgo='), '');
  assert.equal(safeImageSrc('data:image/png;base64;foo=bar,iVBORw0KGgo='), '');
  // Ni base64 malformado.
  assert.equal(safeImageSrc('data:image/png;base64,no válido!'), '');
  assert.equal(safeImageSrc('data:image/png,sin-base64'), '');
});

test('ninguna URL remota es aceptable, ni siquiera https con apariencia de imagen', () => {
  const remotas = [
    'https://ejemplo.test/foto.png',
    'https://ejemplo.test/foto.jpeg',
    'https://ejemplo.test/foto.webp',
    'https://ejemplo.test/sin-extension',
    'https://ejemplo.test/redirige?to=https://otro.test/x.svg',
    'https://ejemplo.test/r/301',
    'https://ejemplo.test:8443/a.png',
    'https://usuario:clave@ejemplo.test/a.png',
    'http://ejemplo.test/a.png',
    'blob:https://ejemplo.test/9c1f-uuid',
    '/assets/a.png',
    './a.png',
    '../a.png',
    '//ejemplo.test/a.png'
  ];
  for (const valor of remotas) {
    assert.equal(safeImageSrc(valor), '', `no debía aceptarse: ${valor}`);
  }
});

test('un valor inválido produce un hueco vacío, no rompe el chat', () => {
  for (const valor of [null, undefined, 42, {}, '', '   ', 'cualquier cosa']) {
    assert.equal(safeImageSrc(valor), '', 'el fallback es una cadena vacía');
  }
});

test('el comprobante interno ya no genera SVG', () => {
  const fuente = leer('src/components/chatModal.js');
  assert.ok(!fuente.includes('createSampleReceipt()'), 'la versión SVG debe desaparecer');
  assert.ok(fuente.includes('createSampleReceiptText'), 'y ser sustituida por texto');
  // Ningún SVG en el código del chat, ni construido ni aceptado.
  assert.ok(!/<svg|image\/svg/i.test(fuente), 'el chat no puede construir ni admitir SVG');
});

// ------------------------------------------------------- object URLs sueltas

test('una object URL con dueño se revoca una sola vez', () => {
  const revocadas = [];
  const original = globalThis.URL.revokeObjectURL;
  const originalCreate = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = () => 'blob:suelta-1';
  globalThis.URL.revokeObjectURL = url => revocadas.push(url);
  try {
    const url = createOwnedObjectUrl({});
    assert.equal(url, 'blob:suelta-1');
    assert.equal(revokeOwnedObjectUrl(url), true, 'la primera revocación surte efecto');
    assert.equal(revokeOwnedObjectUrl(url), false, 'la segunda no hace nada');
    assert.deepEqual(revocadas, ['blob:suelta-1'], 'nunca se revoca dos veces');
    assert.equal(revokeOwnedObjectUrl('blob:ajena'), false, 'ni una URL que no es suya');
  } finally {
    globalThis.URL.revokeObjectURL = original;
    globalThis.URL.createObjectURL = originalCreate;
  }
});

test('el cierre global alcanza las object URLs sueltas', () => {
  const revocadas = [];
  const original = globalThis.URL.revokeObjectURL;
  const originalCreate = globalThis.URL.createObjectURL;
  let n = 0;
  globalThis.URL.createObjectURL = () => `blob:suelta-${++n}`;
  globalThis.URL.revokeObjectURL = url => revocadas.push(url);
  try {
    createOwnedObjectUrl({});
    createOwnedObjectUrl({});
    disposeAllPrivatePhotos();
    assert.deepEqual(revocadas.sort(), ['blob:suelta-1', 'blob:suelta-2']);
  } finally {
    globalThis.URL.revokeObjectURL = original;
    globalThis.URL.createObjectURL = originalCreate;
  }
});

test('el formulario de documentos cubre reemplazo, cierre y envío', () => {
  const fuente = leer('src/components/driverRegistrationModal.js');
  assert.ok(fuente.includes('createOwnedObjectUrl('), 'las vistas previas tienen dueño');
  assert.ok(!fuente.includes('URL.createObjectURL('), 'no quedan creaciones sueltas');
  // Tres puntos de liberación: reemplazo, cierre del modal y envío correcto.
  assert.equal((fuente.match(/revokeOwnedObjectUrl\(/g) || []).length, 3);
});

test('ninguna pantalla crea object URLs sin dueño', () => {
  const ofensores = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(completo); continue; }
      if (!e.name.endsWith('.js')) continue;
      const relativo = path.relative(raiz, completo).split(path.sep).join('/');
      // Los dueños legítimos: el cargador, el visor de documentos y apiService.
      if (['src/utils/privatePhoto.js', 'src/pages/admin/privateDocumentViewer.js', 'src/services/apiService.js'].includes(relativo)) continue;
      if (/URL\.createObjectURL\(/.test(fs.readFileSync(completo, 'utf8'))) ofensores.push(relativo);
    }
  };
  recorrer(path.join(raiz, 'src'));
  assert.deepEqual(ofensores, []);
});

// ------------------------------------------- carrera de release(key)

function makeSlot(photoPath) {
  const local = { hidden: false, dataset: { localAvatar: '' } };
  const img = {
    hidden: true,
    src: '',
    isConnected: true,
    dataset: { privatePhoto: photoPath },
    removeAttribute(n) { if (n === 'src') this.src = ''; }
  };
  img.parentElement = { querySelector: sel => (sel === '[data-local-avatar]' ? local : null) };
  return { local, img, container: { querySelectorAll: () => [img] } };
}

function arnes(responder) {
  const revoked = [];
  const requested = [];
  const loader = createPrivatePhotoLoader({
    loadUrl: async endpoint => { requested.push(endpoint); return responder(endpoint); },
    revokeUrl: u => revoked.push(u)
  });
  return { loader, revoked, requested };
}

const diferido = () => { let r; const p = new Promise(x => { r = x; }); return { promise: p, resolve: r }; };

test('release(key) invalida la petición pendiente de esa clave', async () => {
  const espera = diferido();
  const { loader, revoked } = arnes(() => espera.promise);
  const s = makeSlot('/api/users/driver_1/photo');

  const enVuelo = hydratePrivatePhotos(s.container, loader);
  loader.release('/api/users/driver_1/photo');
  espera.resolve('blob:tardia');
  await enVuelo;

  assert.deepEqual(revoked, ['blob:tardia'], 'la respuesta tardía se revoca');
  assert.equal(loader.openCount, 0, 'no queda ninguna URL viva');
  assert.equal(s.img.src, '', 'no se pinta nada');
  assert.equal(s.img.hidden, true);
  assert.equal(s.local.hidden, false, 'el avatar local permanece visible');
});

test('liberar una clave no cancela la descarga de otra', async () => {
  const esperas = { uno: diferido(), dos: diferido() };
  const { loader, revoked } = arnes(endpoint => (endpoint.includes('driver_1') ? esperas.uno.promise : esperas.dos.promise));
  const uno = makeSlot('/api/users/driver_1/photo');
  const dos = makeSlot('/api/users/driver_2/photo');

  const a = hydratePrivatePhotos(uno.container, loader);
  const b = hydratePrivatePhotos(dos.container, loader);

  loader.release('/api/users/driver_1/photo');
  esperas.uno.resolve('blob:uno');
  esperas.dos.resolve('blob:dos');
  await Promise.all([a, b]);

  assert.deepEqual(revoked, ['blob:uno'], 'solo muere la clave liberada');
  assert.equal(dos.img.src, 'blob:dos', 'la otra llega y se pinta');
  assert.equal(dos.local.hidden, true);
  assert.equal(uno.img.src, '', 'y la liberada sigue neutra');
  assert.equal(loader.openCount, 1);
});

test('tras liberar puede iniciarse una carga nueva con la misma clave', async () => {
  let n = 0;
  const { loader, requested } = arnes(async () => `blob:v${++n}`);
  const s = makeSlot('/api/users/driver_1/photo');

  await hydratePrivatePhotos(s.container, loader);
  loader.release('/api/users/driver_1/photo');
  await hydratePrivatePhotos(s.container, loader);

  assert.equal(requested.length, 2, 'la segunda descarga sí ocurre');
  assert.equal(s.img.src, 'blob:v2', 'y se aplica la nueva');
  assert.equal(loader.openCount, 1, 'con una única URL viva');
});

test('la respuesta antigua se revoca y la nueva se aplica', async () => {
  const primera = diferido();
  let n = 0;
  const { loader, revoked } = arnes(() => (n++ === 0 ? primera.promise : Promise.resolve('blob:nueva')));
  const s = makeSlot('/api/users/driver_1/photo');

  const vieja = hydratePrivatePhotos(s.container, loader);
  loader.release('/api/users/driver_1/photo');
  const nueva = hydratePrivatePhotos(s.container, loader);
  primera.resolve('blob:vieja');
  await Promise.all([vieja, nueva]);

  assert.ok(revoked.includes('blob:vieja'), 'la antigua muere');
  assert.equal(s.img.src, 'blob:nueva', 'y queda la nueva');
  assert.equal(loader.openCount, 1);
});

test('releaseAll y destroy conservan su comportamiento', async () => {
  const { loader, revoked } = arnes(async () => 'blob:x');
  const s = makeSlot('/api/users/driver_1/photo');
  await hydratePrivatePhotos(s.container, loader);

  loader.releaseAll();
  assert.deepEqual(revoked, ['blob:x']);
  assert.equal(s.local.hidden, false);
  assert.equal(loader.openCount, 0);

  loader.destroy();
  assert.equal(loader.destroyed, true);
  assert.equal(loader.openCount, 0, 'cero blobs vivos al cerrar');
});

// --------------------------------------------------------- no regresiones

test('avatares locales, diseño y ausencia de terceros se conservan', () => {
  assert.ok(fs.existsSync(path.join(raiz, 'src/utils/localAvatar.js')));
  assert.ok(fs.existsSync(path.join(raiz, 'src/styles/local-avatar.css')));
  assert.ok(fs.existsSync(path.join(raiz, 'src/components/notificationCenterModal.js')));
  const main = leer('src/main.js');
  assert.ok(main.includes("import('./styles/um-motion-preview.css')"));
  assert.ok(main.includes("import './styles/local-avatar.css'"));

  const ofensores = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const c = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(c); continue; }
      if (!/\.(js|css)$/.test(e.name)) continue;
      if (/dicebear|ui-avatars/i.test(fs.readFileSync(c, 'utf8'))) ofensores.push(path.relative(raiz, c));
    }
  };
  recorrer(path.join(raiz, 'src'));
  assert.deepEqual(ofensores, []);
});
