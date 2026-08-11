// Helpers puros para renderizar datos que no controla la aplicación
// (respuestas de Nominatim, perfiles de conductor, texto escrito por usuarios).
// Sin dependencias del DOM, de modo que puedan probarse en Node.

const HTML_ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
});

/**
 * Escapa los cinco caracteres que permiten salir de un texto o de un atributo
 * dentro de una plantilla HTML. `null` y `undefined` se vuelven cadena vacía
 * para no imprimir "null" en la interfaz.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

/** Rutas propias de la aplicación: absolutas de raíz o relativas al documento. */
function isApplicationPath(url) {
  // `//host` es un protocolo relativo, no una ruta local: hereda el esquema
  // de la página y puede apuntar a cualquier dominio.
  if (url.startsWith('//')) return false;
  return url.startsWith('/') || url.startsWith('./') || url.startsWith('../');
}

/**
 * Los caracteres de control permiten construir cosas como `java\tscript:` y
 * burlar los filtros que solo comparan el prefijo de la cadena.
 */
function hasControlCharacters(url) {
  for (let index = 0; index < url.length; index += 1) {
    const code = url.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;

/**
 * Devuelve una URL utilizable en `src`, o `fallback` si el valor no es seguro.
 *
 * Acepta rutas de la propia aplicación y los esquemas http y https. Rechaza
 * `javascript:`, `vbscript:`, `file:`, protocolos relativos y valores
 * malformados. Las imágenes `data:` quedan fuera salvo que se pidan de forma
 * explícita con `allowData`, porque el chat de soporte sí las necesita.
 */
export function safeImageUrl(value, fallback = '', { allowData = false } = {}) {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (!url) return fallback;
  if (hasControlCharacters(url)) return fallback;
  // Se descarta antes que nada: no lleva esquema, así que caería en la rama de
  // ruta relativa y acabaría aceptándose.
  if (url.startsWith('//')) return fallback;

  if (isApplicationPath(url)) return url;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  // Sin esquema es una ruta relativa simple del tipo `images/logo.png`.
  if (!scheme) return url;

  if (scheme === 'http' || scheme === 'https') {
    try {
      const parsed = new URL(url);
      return parsed.hostname ? url : fallback;
    } catch {
      return fallback;
    }
  }

  // `svg+xml` queda excluido a propósito: puede transportar scripts.
  if (allowData && scheme === 'data') {
    return DATA_IMAGE_PATTERN.test(url) ? url : fallback;
  }

  return fallback;
}

/** Número acotado para calificaciones y contadores que llegan del servidor. */
export function safeNumber(value, { fallback = 0, min = -Infinity, max = Infinity, decimals = null } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return decimals === null ? clamped : Number(clamped.toFixed(decimals));
}

/** Coordenada geográfica válida, o null si está fuera de rango o no es finita. */
export function safeCoordinate(value, kind = 'lat') {
  // `Number(null)`, `Number('')` y `Number([])` valen 0, que es una coordenada
  // válida: hay que descartar esos valores antes de convertir.
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const limit = kind === 'lng' ? 180 : 90;
  return parsed >= -limit && parsed <= limit ? parsed : null;
}
