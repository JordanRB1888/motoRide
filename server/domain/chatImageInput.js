/**
 * Contrato de entrada de una imagen de chat.
 *
 * Es el mismo que aplica el cliente en `chatModal.js` --`CHAT_IMAGE_DATA_URL`--
 * escrito aquí de forma independiente y algo más estricta: el navegador puede
 * mentir, así que esta es la validación que cuenta. Y todavía no es la última:
 * el almacén vuelve a comprobar la firma binaria de los bytes ya decodificados,
 * porque un MIME declarado no dice nada sobre el contenido.
 *
 * Función pura, sin sistema de archivos ni dependencias del servidor, para
 * poder probar el contrato en aislamiento del transporte.
 */

/**
 * Data URL admisible: solo los tres formatos raster del contrato de chat.
 *
 * Queda fuera todo lo demás y de forma deliberada: `image/svg+xml` es contenido
 * activo y no tiene firma binaria; `gif`, `avif`, `bmp` y `tiff` no se
 * admiten porque nada los produce; `image/jpg` no es un MIME real; `http:`,
 * `https:`, `blob:`, las rutas relativas, `javascript:` y `data:text/html` ni
 * siquiera empiezan por el prefijo exigido. Tampoco se aceptan parámetros
 * adicionales en el MIME (`data:image/png;charset=utf-8;base64,`), que serían
 * una vía para colar un tipo distinto del que se declara.
 */
const CHAT_IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Tope de la cadena base64. Cuatro caracteres codifican tres bytes. */
export const MAX_DATA_URL_LENGTH = 1_000_000;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

/** ¿Es una data URL de imagen de chat admisible? Sin decodificar nada. */
export function isChatImageDataUrl(value) {
  return typeof value === 'string'
    && value.length <= MAX_DATA_URL_LENGTH
    && CHAT_IMAGE_DATA_URL.test(value);
}

/**
 * Convierte la data URL en bytes, una sola vez.
 *
 * @returns {{ mimeType: string, buffer: Buffer }}
 * @throws  error con `code = 'INVALID_CHAT_IMAGE'`
 */
export function decodeChatImageDataUrl(value) {
  if (typeof value !== 'string') throw fail('INVALID_CHAT_IMAGE');
  // El tope se mide antes de tocar la cadena: no se decodifica para descubrir
  // que era demasiado grande.
  if (value.length > MAX_DATA_URL_LENGTH) throw fail('CHAT_IMAGE_TOO_LARGE');

  const coincidencia = CHAT_IMAGE_DATA_URL.exec(value);
  if (!coincidencia) throw fail('INVALID_CHAT_IMAGE');

  const [, subtipo, base64] = coincidencia;
  // El relleno es obligatorio en base64 canónico: una longitud que no sea
  // múltiplo de cuatro significa que la cadena está truncada. `Buffer.from`
  // no se queja --descarta lo que sobra-- y guardaría una imagen a medias.
  if (base64.length % 4 !== 0) throw fail('INVALID_CHAT_IMAGE');

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) throw fail('INVALID_CHAT_IMAGE');
  // Ida y vuelta: si `Buffer.from` tuvo que ignorar algo, la recodificación no
  // coincide. Es la forma barata de detectar un base64 corrupto que la
  // expresión regular sí acepta.
  if (buffer.toString('base64') !== base64) throw fail('INVALID_CHAT_IMAGE');

  return { mimeType: `image/${subtipo}`, buffer };
}
