import fs from 'node:fs';
import path from 'node:path';
import { createPrivateStorage, canonicalImageMimeType, hasValidSignature } from './privateStorage.js';

/**
 * Almacenamiento privado para los adjuntos de chat y soporte.
 *
 * Reutiliza `createPrivateStorage`: mismo mecanismo que fotografías y
 * documentos —firma binaria, nombres `randomUUID()`, `0700`/`0600` y guarda
 * contra path traversal—, con una raíz propia para poder medir, mover y
 * respaldar los adjuntos por separado.
 *
 * Este módulo añade lo que el volumen de Railway exige: comprobar que la raíz
 * está de verdad dentro del volumen persistente, y no aceptar un archivo que
 * dejaría al disco sin margen para que el SQLite pueda seguir escribiendo.
 */

/** Bytes reales, no del base64. Alineado con el corte del cliente. */
export const MAX_CHAT_MEDIA_BYTES = 750_000;

/** Margen que siempre debe quedar libre en el volumen tras guardar. */
export const MIN_FREE_BYTES = 50 * 1024 * 1024;

/** Solo raster del contrato de chat. El PDF no aplica; el SVG no tiene firma. */
const ALLOWED_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

function fail(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

/**
 * ¿`candidato` está contenido en `raiz`?
 *
 * Se compara con `path.relative` sobre rutas ya resueltas con `realpath`, no
 * por prefijo de texto: `startsWith('/data')` aceptaría `/data-falso` y no
 * vería un enlace simbólico que saliera del volumen.
 */
export function isContainedIn(raiz, candidato) {
  const relativa = path.relative(raiz, candidato);
  if (relativa === '') return false;                 // es la propia raíz
  if (path.isAbsolute(relativa)) return false;       // otro árbol
  // Por segmentos: `..foo` es un nombre válido, `..` es un ascenso.
  return !relativa.split(path.sep).includes('..');
}

/**
 * Resuelve y valida la raíz de medios.
 *
 * Devuelve la ruta real. Lanza `CHAT_MEDIA_STORAGE_UNAVAILABLE` ante cualquier
 * problema de configuración: es preferible que el servicio no arranque a que
 * acepte imágenes que va a perder en el siguiente despliegue.
 */
export function resolveChatMediaRoot({ dataFile, isProduction, env = process.env } = {}) {
  const configurado = env.CHAT_MEDIA_DIR;
  if (isProduction && !configurado) {
    // Sin variable, el valor por omisión caería en el disco efímero del
    // contenedor y los adjuntos desaparecerían en cada despliegue.
    throw fail('CHAT_MEDIA_STORAGE_UNAVAILABLE', 'CHAT_MEDIA_DIR es obligatoria en producción');
  }

  const dataDirectory = path.dirname(path.resolve(dataFile));
  const candidato = path.resolve(configurado || path.join(dataDirectory, 'chat-media'));

  // Se crea antes de resolver: `realpath` debe reflejar la ruta real, no la
  // nominal, para que un enlace simbólico quede al descubierto.
  try {
    fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
    fs.mkdirSync(candidato, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw fail('CHAT_MEDIA_STORAGE_UNAVAILABLE', `no se pudo crear el directorio: ${error.code || error.message}`);
  }

  let raizDatos;
  let raizMedios;
  try {
    raizDatos = fs.realpathSync(dataDirectory);
    raizMedios = fs.realpathSync(candidato);
  } catch (error) {
    throw fail('CHAT_MEDIA_STORAGE_UNAVAILABLE', `no se pudo resolver la ruta: ${error.code || error.message}`);
  }

  if (!isContainedIn(raizDatos, raizMedios)) {
    throw fail('CHAT_MEDIA_STORAGE_UNAVAILABLE', 'la raíz de medios no está dentro del volumen de datos');
  }

  // Escritura real, con un centinela sin contenido que se borra siempre.
  const centinela = path.join(raizMedios, `.write-check-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(centinela, '', { mode: 0o600 });
  } catch (error) {
    throw fail('CHAT_MEDIA_STORAGE_UNAVAILABLE', `directorio no escribible: ${error.code || error.message}`);
  } finally {
    try { fs.rmSync(centinela, { force: true }); } catch { /* el centinela nunca debe quedar */ }
  }

  return raizMedios;
}

/** Espacio libre del volumen que contiene `directorio`, en bytes. */
export function freeBytes(directorio) {
  const stats = fs.statfsSync(directorio);
  return Number(stats.bavail) * Number(stats.bsize);
}

export function createChatMediaStorage({ rootDirectory, minFreeBytes = MIN_FREE_BYTES, maxBytes = MAX_CHAT_MEDIA_BYTES } = {}) {
  const storage = createPrivateStorage({ rootDirectory });

  /**
   * Guarda un adjunto ya decodificado y devuelve su clave privada.
   *
   * `ownerId` solo agrupa archivos en subdirectorios; no concede acceso: la
   * autorización la decide siempre el mensaje que referencia la imagen.
   */
  function saveBuffer(buffer, mimeType, ownerId) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw fail('INVALID_FILE_TYPE', 'contenido vacío');
    }
    const canonical = canonicalImageMimeType(mimeType);
    if (!canonical || !ALLOWED_MIME_TYPES.includes(canonical)) {
      throw fail('INVALID_FILE_TYPE', 'tipo no admitido');
    }
    if (buffer.length > maxBytes) {
      throw fail('CHAT_MEDIA_TOO_LARGE', `${buffer.length} > ${maxBytes}`);
    }
    if (!hasValidSignature(buffer, canonical)) {
      // El MIME declarado no basta: el contenido debe empezar como ese formato.
      throw fail('INVALID_FILE_TYPE', 'la firma binaria no coincide');
    }
    // Quedarse sin disco dejaría al SQLite sin poder escribir y detendría toda
    // la aplicación, no solo el chat. Nunca se borra nada para hacer sitio.
    if (freeBytes(storage.root) - buffer.length < minFreeBytes) {
      throw fail('CHAT_MEDIA_STORAGE_FULL', 'sin reserva libre suficiente');
    }
    return storage.save({ buffer, mimetype: canonical }, ownerId);
  }

  return {
    root: storage.root,
    saveBuffer,
    /** Lectura con revalidación de firma y MIME, heredada del almacén privado. */
    readImage: storage.readImage,
    resolve: storage.resolve,
    remove: storage.remove
  };
}
