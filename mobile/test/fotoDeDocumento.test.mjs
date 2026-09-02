import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  CALIDAD,
  MENSAJES_DE_CAPTURA,
  TAMANO_MAXIMO_EN_BYTES,
  TIPOS_ADMITIDOS,
  interpretarActivo,
  nombreDeArchivo,
  tipoPorExtension
} from '../domain/fotoDeDocumento.ts';

/**
 * La captura de documentos: lo que se acepta y lo que no, y que nada
 * sensible se quede en el teléfono ni en un registro.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

// ---------------------------------------------------------------------------
// Los tipos y el tamaño son los del servidor
// ---------------------------------------------------------------------------

test('los tipos admitidos son los del almacenamiento privado del servidor, sin PDF', () => {
  const servidor = fs.readFileSync(path.resolve(raizMovil, '..', 'server', 'services', 'privateStorage.js'), 'utf8');
  const imagenes = servidor.match(/IMAGE_MIME_TYPES = Object\.freeze\(\[([^\]]*)\]\)/);
  assert.ok(imagenes, 'no encuentro los tipos de imagen del servidor');
  const delServidor = [...imagenes[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
  assert.deepEqual([...TIPOS_ADMITIDOS].sort(), delServidor.sort());
  // Ni SVG ni GIF, nunca.
  assert.equal(TIPOS_ADMITIDOS.some(tipo => /svg|gif/.test(tipo)), false);
});

test('el tope de tamaño es el del servidor: cinco megas', () => {
  const rutas = fs.readFileSync(path.resolve(raizMovil, '..', 'server', 'routes', 'driverApplications.js'), 'utf8');
  assert.match(rutas, /fileSize: 5 \* 1024 \* 1024/);
  assert.equal(TAMANO_MAXIMO_EN_BYTES, 5 * 1024 * 1024);
});

test('la calidad no destruye una cédula ni revienta el tope', () => {
  assert.ok(CALIDAD >= 0.7 && CALIDAD <= 0.9, `calidad ${CALIDAD}`);
});

// ---------------------------------------------------------------------------
// Interpretar lo que devuelve el selector
// ---------------------------------------------------------------------------

test('una foto normal pasa tal cual', () => {
  const resultado = interpretarActivo({ uri: 'file:///cache/ImagePicker/a.jpg', mimeType: 'image/jpeg', width: 3000, height: 4000, fileSize: 1_200_000 });
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.foto.mimeType, 'image/jpeg');
    assert.equal(resultado.foto.tamano, 1_200_000);
    assert.equal(resultado.foto.width, 3000);
  }
});

test('si el selector no dice el tipo, se deduce de la extensión', () => {
  assert.equal(tipoPorExtension('file:///a/b/c.PNG'), 'image/png');
  assert.equal(tipoPorExtension('content://media/1234.webp?x=1'), 'image/webp');
  assert.equal(tipoPorExtension('file:///a/b/c.heic'), null);
  const resultado = interpretarActivo({ uri: 'file:///x/y.jpeg', mimeType: null, fileSize: 10 });
  assert.equal(resultado.ok, true);
});

test('un tipo que no es foto se rechaza con su motivo', () => {
  for (const mimeType of ['image/gif', 'image/svg+xml', 'application/pdf', 'video/mp4']) {
    const resultado = interpretarActivo({ uri: `file:///x/y.${mimeType.split('/')[1]}`, mimeType, fileSize: 10 });
    assert.equal(resultado.ok, false, mimeType);
    if (!resultado.ok) assert.equal(resultado.motivo, 'TIPO_NO_ADMITIDO');
  }
});

test('una foto por encima del tope se rechaza antes de intentar subirla', () => {
  const resultado = interpretarActivo({ uri: 'file:///x/y.jpg', mimeType: 'image/jpeg', fileSize: TAMANO_MAXIMO_EN_BYTES + 1 });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) assert.equal(resultado.motivo, 'DEMASIADO_GRANDE');
  // Sin tamaño conocido no se rechaza: lo dirá el servidor.
  assert.equal(interpretarActivo({ uri: 'file:///x/y.jpg', mimeType: 'image/jpeg' }).ok, true);
});

test('sin ruta no hay foto', () => {
  const resultado = interpretarActivo({ mimeType: 'image/jpeg' });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) assert.equal(resultado.motivo, 'NO_DISPONIBLE');
});

test('el archivo viaja con el nombre del documento, no con el del teléfono', () => {
  assert.equal(nombreDeArchivo('identity_front', 'image/jpeg'), 'identity_front.jpg');
  assert.equal(nombreDeArchivo('driver_selfie', 'image/png'), 'driver_selfie.png');
  assert.equal(nombreDeArchivo('plate_photo', 'image/webp'), 'plate_photo.webp');
});

test('cada motivo tiene su mensaje, y cancelar no regaña', () => {
  for (const motivo of ['PERMISO_DENEGADO', 'TIPO_NO_ADMITIDO', 'DEMASIADO_GRANDE', 'NO_DISPONIBLE']) {
    assert.ok(MENSAJES_DE_CAPTURA[motivo].length > 10, motivo);
  }
  assert.equal(MENSAJES_DE_CAPTURA.CANCELADO, '');
});

// ---------------------------------------------------------------------------
// La puerta al módulo nativo: permiso al pulsar, nada persistido, nada en logs
// ---------------------------------------------------------------------------

test('expo-image-picker solo se importa desde la puerta única', () => {
  const carpetas = ['app', 'ui', 'domain', 'services', 'context', 'components', 'media', 'preview'];
  const importan = [];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      if (/expo-image-picker/.test(despojarComentarios(fs.readFileSync(completa, 'utf8')))) {
        importan.push(path.relative(raizMovil, completa).replace(/\\/g, '/'));
      }
    }
  }
  assert.deepEqual(importan, ['media/captura.ts'], `lo importan también: ${importan.join(', ')}`);
});

test('el permiso de cámara se pide al tomar la foto, y la galería solo lo pide donde hace falta', () => {
  const captura = sinComentarios('media/captura.ts');
  assert.match(captura, /if \(modo === 'TAKE_PHOTO'\) \{\s*const permiso = await ImagePicker\.requestCameraPermissionsAsync\(\);/);
  assert.match(captura, /Platform\.OS === 'android' && Number\(Platform\.Version\) < 33/);
  // Y no se pide en ningún efecto al montar.
  assert.equal(/useEffect/.test(captura), false);
});

test('sin EXIF, sin base64, sin edición, una sola foto', () => {
  const captura = sinComentarios('media/captura.ts');
  assert.match(captura, /exif: false/);
  assert.match(captura, /base64: false/);
  assert.match(captura, /allowsEditing: false/);
  assert.match(captura, /allowsMultipleSelection: false/);
  assert.match(captura, /mediaTypes: \['images'\]/);
});

test('la captura nunca lanza y nunca registra lo que lleva', () => {
  const captura = sinComentarios('media/captura.ts');
  assert.match(captura, /catch \{\s*return \{ ok: false, motivo: 'NO_DISPONIBLE' \};/);
  for (const fichero of ['media/captura.ts', 'domain/fotoDeDocumento.ts', 'services/postulacion.ts']) {
    const codigo = sinComentarios(fichero);
    assert.equal(/console\.(log|warn|error|info)/.test(codigo), false, `${fichero} escribe en el registro`);
    assert.equal(/AsyncStorage|SecureStore|FileSystem\.(write|copy|move)|Sentry/.test(codigo), false, `${fichero} persiste o reporta el documento`);
  }
});

test('el servicio manda el archivo por multipart al endpoint privado, sin base64', () => {
  const servicio = sinComentarios('services/postulacion.ts');
  assert.match(servicio, /new FormData\(\)/);
  assert.match(servicio, /\/api\/driver-applications\/me\/documents\//);
  assert.equal(/base64/.test(servicio), false);
});
