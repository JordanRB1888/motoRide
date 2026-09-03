import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov'
});

/**
 * Los tipos de video que se admiten, y por que estos dos.
 *
 * MP4 es lo que graba Android y lo que reproduce todo. QuickTime es lo que
 * graba iOS cuando no se le pide otra cosa, y comparte contenedor con MP4
 * --ISO-BMFF, la misma firma-- asi que validarlo cuesta lo mismo.
 *
 * WEBM QUEDA FUERA, y no por descuido: Safari no lo reproduce, ni en Mac ni en
 * iPhone. Un video que administracion no puede ver desde un Mac es un video
 * que no sirve para revisar a nadie, y aceptarlo seria crear expedientes que
 * dependen de con que navegador se abran.
 */
const VIDEO_MIME_TYPES = Object.freeze(['video/mp4', 'video/quicktime']);

/** MIME canonico para un video, o null si el valor no es admisible. */
export function canonicalVideoMimeType(value) {
  const normalized = String(value || '').trim().toLowerCase().split(';')[0];
  return VIDEO_MIME_TYPES.includes(normalized) ? normalized : null;
}

/**
 * Cuanto hace falta leer para saber si unos bytes son el video que dicen ser.
 *
 * La firma de ISO-BMFF vive en los doce primeros bytes; la duracion, dentro
 * del box `moov`, que puede estar al principio o al final del fichero. Este
 * tope acota lo que se lee para BUSCARLA sin recorrer cincuenta megas.
 */
const CABECERA_DE_VIDEO = 64 * 1024;

/**
 * Tipos que puede tener una fotografía de perfil. El PDF queda fuera a
 * propósito: sirve para documentos, no para imágenes. El SVG no aparece en
 * ninguna lista porque no tiene firma binaria y es contenido activo.
 */
const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

/** MIME canónico para una fotografía, o null si el valor no es admisible. */
export function canonicalImageMimeType(value) {
  const normalized = String(value || '').trim().toLowerCase().split(';')[0];
  return IMAGE_MIME_TYPES.includes(normalized) ? normalized : null;
}

export function hasValidSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  // MP4 y MOV son el mismo contenedor: una sucesion de cajas donde la primera
  // suele ser `ftyp`. Se comprueba la etiqueta en su sitio --bytes 4 a 8-- y
  // que el tamano declarado de esa caja sea creible; un fichero de texto con
  // el nombre cambiado no pasa ninguna de las dos.
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
    if (buffer.subarray(4, 8).toString('latin1') !== 'ftyp') return false;
    const tamanoDeLaPrimeraCaja = buffer.readUInt32BE(0);
    return tamanoDeLaPrimeraCaja >= 8 && tamanoDeLaPrimeraCaja <= buffer.length + CABECERA_DE_VIDEO;
  }
  return false;
}

/**
 * Cuanto dura el video, en segundos, leido del propio fichero.
 *
 * El cliente dice una duracion; esta funcion la comprueba. Recorre las cajas
 * de nivel superior buscando `moov`, y dentro de ella `mvhd`, que lleva la
 * escala de tiempo y la duracion. Es lo minimo del formato para no creerse un
 * numero que cualquiera puede escribir.
 *
 * Devuelve `null` cuando no puede saberlo --un `moov` mas alla de lo leido, un
 * fichero fragmentado--. Eso NO es un rechazo: no poder medir no es lo mismo
 * que medir mal, y para el tamano ya hay un tope aparte.
 */
export function videoDurationSeconds(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;

  const buscarMvhd = (desde, hasta) => {
    let posicion = desde;
    while (posicion + 8 <= hasta) {
      const tamano = buffer.readUInt32BE(posicion);
      const tipo = buffer.subarray(posicion + 4, posicion + 8).toString('latin1');
      // Tamano 0 significa «hasta el final»; 1, que el real va en 64 bits.
      const salto = tamano === 0 ? hasta - posicion : tamano === 1 ? Number(buffer.readBigUInt64BE(posicion + 8)) : tamano;
      if (!Number.isFinite(salto) || salto < 8) return null;

      if (tipo === 'moov') {
        const finDeMoov = Math.min(posicion + salto, hasta);
        return buscarMvhd(posicion + 8, finDeMoov);
      }
      if (tipo === 'mvhd') {
        const version = buffer[posicion + 8];
        // Tras la version y sus banderas: creacion, modificacion, escala y
        // duracion. En la version 1 los tiempos son de 64 bits.
        const base = posicion + 12;
        if (version === 1) {
          if (base + 28 > hasta) return null;
          const escala = buffer.readUInt32BE(base + 16);
          const duracion = Number(buffer.readBigUInt64BE(base + 20));
          return escala > 0 ? duracion / escala : null;
        }
        if (base + 16 > hasta) return null;
        const escala = buffer.readUInt32BE(base + 8);
        const duracion = buffer.readUInt32BE(base + 12);
        return escala > 0 ? duracion / escala : null;
      }
      posicion += salto;
    }
    return null;
  };

  try { return buscarMvhd(0, buffer.length); }
  catch { return null; }
}

export function createPrivateStorage({ rootDirectory }) {
  const root = path.resolve(rootDirectory);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  function save(file, ownerId) {
    if (!file?.buffer || !MIME_EXTENSIONS[file.mimetype] || !hasValidSignature(file.buffer, file.mimetype)) {
      const error = new Error('INVALID_FILE_TYPE');
      error.code = 'INVALID_FILE_TYPE';
      throw error;
    }
    const ownerDirectory = path.join(root, String(ownerId).replace(/[^a-zA-Z0-9_-]/g, '_'));
    fs.mkdirSync(ownerDirectory, { recursive: true, mode: 0o700 });
    const filename = `${crypto.randomUUID()}${MIME_EXTENSIONS[file.mimetype]}`;
    const absolutePath = path.join(ownerDirectory, filename);
    fs.writeFileSync(absolutePath, file.buffer, { mode: 0o600 });
    return path.relative(root, absolutePath).split(path.sep).join('/');
  }

  function resolve(storageKey) {
    const absolutePath = path.resolve(root, String(storageKey || ''));
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) return null;
    return fs.existsSync(absolutePath) ? absolutePath : null;
  }

  function remove(storageKey) {
    const absolutePath = resolve(storageKey);
    if (absolutePath) fs.rmSync(absolutePath, { force: true });
  }

  function clone(storageKey, ownerId) {
    const source = resolve(storageKey);
    if (!source) return null;
    const extension = path.extname(source).toLowerCase();
    const ownerDirectory = path.join(root, String(ownerId).replace(/[^a-zA-Z0-9_-]/g, '_'));
    fs.mkdirSync(ownerDirectory, { recursive: true, mode: 0o700 });
    const absolutePath = path.join(ownerDirectory, `${crypto.randomUUID()}${extension}`);
    fs.copyFileSync(source, absolutePath);
    fs.chmodSync(absolutePath, 0o600);
    return path.relative(root, absolutePath).split(path.sep).join('/');
  }

  /**
   * Lee una imagen ya almacenada comprobando de nuevo su firma binaria.
   *
   * La validación en la subida no basta: el MIME que acompaña al registro
   * podría haberse alterado, y servir bytes cuyo contenido real no coincide con
   * la cabecera declarada abre la puerta al sniffing y a los polyglots.
   * Devuelve null ante cualquier discrepancia, sin distinguir la causa.
   */
  function readImage(storageKey, declaredMimeType) {
    const mimeType = canonicalImageMimeType(declaredMimeType);
    if (!mimeType) return null;
    const absolutePath = resolve(storageKey);
    if (!absolutePath) return null;
    let buffer;
    try { buffer = fs.readFileSync(absolutePath); }
    catch { return null; }
    if (!hasValidSignature(buffer, mimeType)) return null;
    return { buffer, mimeType };
  }

  /**
   * Abre un fichero guardado para servirlo por tramos, comprobando primero que
   * sus bytes siguen siendo lo que el registro dice.
   *
   * Lee solo la cabecera para validar la firma; el resto se sirve en flujo. Sin
   * esto habria que cargar el video entero en memoria para comprobarlo, que es
   * justo lo que se quiere evitar al reproducir por tramos.
   *
   * Devuelve el tamano real en disco --no el que dice el registro-- porque es
   * el que manda al calcular un rango.
   */
  function abrirParaServir(storageKey, declaredMimeType) {
    const mimeType = String(declaredMimeType || '').trim().toLowerCase().split(';')[0];
    if (!MIME_EXTENSIONS[mimeType]) return null;
    const absolutePath = resolve(storageKey);
    if (!absolutePath) return null;

    let descriptor;
    try {
      descriptor = fs.openSync(absolutePath, 'r');
      const cabecera = Buffer.alloc(Math.min(CABECERA_DE_VIDEO, fs.fstatSync(descriptor).size));
      fs.readSync(descriptor, cabecera, 0, cabecera.length, 0);
      if (!hasValidSignature(cabecera, mimeType)) return null;
      const size = fs.fstatSync(descriptor).size;
      return {
        mimeType,
        size,
        /** Un flujo del tramo pedido. Sin argumentos, el fichero entero. */
        crear: (desde = 0, hasta = size - 1) => fs.createReadStream(absolutePath, { start: desde, end: hasta })
      };
    } catch {
      return null;
    } finally {
      if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch { /* ya cerrado */ } }
    }
  }

  return { root, save, resolve, remove, clone, readImage, abrirParaServir };
}
