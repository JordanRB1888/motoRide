/**
 * Avatares neutrales locales.
 *
 * El estado de respaldo de cualquier avatar era una llamada a un tercero con el
 * nombre real de la persona en la query, que además llevaba su IP y el Referer.
 * Aquí no sale nada del navegador: se pintan iniciales dentro de un elemento
 * local y el color procede de una paleta fija.
 *
 * No se usan URLs, `data:`, base64, SVG generados ni canvas. Nada que pueda
 * transportar un dato personal fuera de la aplicación.
 */

/** Clase base del avatar local; el estilo vive en styles/local-avatar.css. */
export const LOCAL_AVATAR_CLASS = 'local-avatar';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ESCAPES[char]);

/** Inicial genérica cuando no hay nombre utilizable. */
const FALLBACK_INITIAL = '·';

/**
 * Hasta dos iniciales del nombre, en mayúsculas.
 *
 * Tolera espacios repetidos, nombres de una sola palabra y alfabetos no
 * latinos. Devuelve texto plano: quien lo inserte en HTML debe escaparlo, y
 * `localAvatarHtml` ya lo hace.
 */
export function avatarInitials(name) {
  const partes = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!partes.length) return FALLBACK_INITIAL;
  // `[...palabra]` recorre puntos de código, no unidades UTF-16: así una
  // inicial fuera del plano básico no se parte por la mitad.
  const iniciales = partes.slice(0, 2).map(palabra => [...palabra][0] || '').join('');
  return (iniciales || FALLBACK_INITIAL).toLocaleUpperCase('es-VE');
}

/** Paleta local: depende solo del rol, nunca de datos personales. */
export function avatarTone(role) {
  const normalizado = String(role ?? '').toLowerCase();
  if (normalizado === 'driver' || normalizado === 'conductor') return 'driver';
  if (normalizado === 'admin' || normalizado === 'administrador') return 'admin';
  return 'passenger';
}

/**
 * Marcado del avatar local, listo para interpolar.
 *
 * `className` y `style` permiten conservar exactamente las clases, dimensiones
 * y bordes del diseño aprobado en el sitio donde antes había un `<img>`.
 */
export function localAvatarHtml({ name = '', role = '', className = '', style = '', label = '' } = {}) {
  const clases = [LOCAL_AVATAR_CLASS, `${LOCAL_AVATAR_CLASS}--${avatarTone(role)}`, className]
    .filter(Boolean)
    .join(' ');
  const atributoEstilo = style ? ` style="${escapeHtml(style)}"` : '';
  const accesible = label ? ` aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
  return `<span class="${escapeHtml(clases)}" data-local-avatar${atributoEstilo}${accesible}>${escapeHtml(avatarInitials(name))}</span>`;
}

/** Versión para elementos ya existentes: asigna por `textContent`, sin HTML. */
export function applyLocalAvatar(element, { name = '', role = '' } = {}) {
  if (!element) return null;
  element.textContent = avatarInitials(name);
  element.classList?.add?.(LOCAL_AVATAR_CLASS, `${LOCAL_AVATAR_CLASS}--${avatarTone(role)}`);
  return element;
}
