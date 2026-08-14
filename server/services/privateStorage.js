import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
});

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
  return false;
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

  return { root, save, resolve, remove, clone, readImage };
}
