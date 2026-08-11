// Fuente única de verdad del tema. main.js, initThemeToggle() y el mapa deben
// resolver el tema por aquí para que no existan reglas divergentes.

export const THEME_STORAGE_KEY = '58express_theme';
export const DEFAULT_THEME = 'dark';
export const LIGHT_THEME_CLASS = 'theme-light';
export const MODERN_EXPERIENCE_CLASS = 'modern-yellow-lab';

/** Devuelve 'dark' o 'light' si el valor es un tema conocido; null si no lo es. */
export function normalizeTheme(value) {
  if (typeof value !== 'string') return null;
  const theme = value.trim().toLowerCase();
  return theme === 'dark' || theme === 'light' ? theme : null;
}

/**
 * Tema efectivo a partir de lo que hubiera guardado. Sin preferencia válida
 * (primera visita o valor corrupto) la aplicación arranca en oscuro.
 */
export function resolveTheme(storedValue) {
  return normalizeTheme(storedValue) ?? DEFAULT_THEME;
}

/** true si existe una preferencia válida: sirve para no pisarla al arrancar. */
export function hasStoredThemePreference(storedValue) {
  return normalizeTheme(storedValue) !== null;
}

/** Lectura tolerante: un localStorage bloqueado no debe romper el arranque. */
export function readStoredTheme(storage) {
  try {
    return storage?.getItem?.(THEME_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function persistTheme(theme, storage) {
  const normalized = resolveTheme(theme);
  try {
    storage?.setItem?.(THEME_STORAGE_KEY, normalized);
  } catch {
    // Modo privado o almacenamiento lleno: el tema sigue aplicado en memoria.
  }
  return normalized;
}

/**
 * Tema con el que debe arrancar la aplicación. `?light=1` fuerza el modo claro
 * solo para esa carga, sin tocar la preferencia guardada.
 */
export function resolveInitialTheme({ storedValue = null, search = '' } = {}) {
  const params = new URLSearchParams(search);
  if (params.get('light') === '1') return 'light';
  return resolveTheme(storedValue);
}

/** La experiencia moderna está activa salvo que se pida `?classic=1`. */
export function isModernExperienceEnabled(search = '') {
  return new URLSearchParams(search).get('classic') !== '1';
}

/** Aplica el tema al elemento raíz y devuelve el tema aplicado. */
export function applyTheme(theme, root) {
  const normalized = resolveTheme(theme);
  root?.classList?.toggle?.(LIGHT_THEME_CLASS, normalized === 'light');
  return normalized;
}

/** Tema actualmente pintado, leído del DOM en vez de suponerlo. */
export function readAppliedTheme(root) {
  return root?.classList?.contains?.(LIGHT_THEME_CLASS) ? 'light' : 'dark';
}

export function oppositeTheme(theme) {
  return resolveTheme(theme) === 'light' ? 'dark' : 'light';
}
