/**
 * Composición de URLs de la API.
 *
 * `baseUrl` ya incluye el prefijo `/api`, y la mayoría de los endpoints se
 * escriben sin él (`/trips`, `/driver-documents/:id/content`). Pero la ruta
 * canónica de una fotografía privada la publica el servidor completa
 * —`/api/users/:id/photo`— porque el frontend la recibe como dato y debe poder
 * usarla tal cual. Concatenar sin más produce `/api/api/users/...`.
 *
 * Esta función es el único lugar donde se decide cómo se unen las dos partes,
 * para que ninguna pantalla tenga que saberlo.
 */

const API_SEGMENT = '/api';

/** Quita la barra final: `https://host/api/` y `https://host/api` son lo mismo. */
export function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

/**
 * Une base y endpoint sin duplicar ni perder el prefijo `/api`.
 *
 * - base `…/api` + `/api/users/x/photo` -> `…/api/users/x/photo`
 * - base `…/api` + `/users/x/photo`     -> `…/api/users/x/photo`
 * - base `…/api` + `/trips`             -> `…/api/trips`
 * - base sin `/api` + `/api/users/...`  -> se conserva el único prefijo
 * - una URL absoluta se devuelve intacta
 */
export function composeApiUrl(baseUrl, endpoint) {
  const path = String(endpoint ?? '');
  if (/^https?:\/\//i.test(path)) return path;

  const base = normalizeBaseUrl(baseUrl);
  const withSlash = path && !path.startsWith('/') ? `/${path}` : path;

  // Solo se retira el prefijo del endpoint cuando la base ya lo aporta: así
  // nunca se elimina el único `/api` que hace llegar la petición al backend.
  const baseHasApi = base.endsWith(API_SEGMENT);
  const pathHasApi = withSlash === API_SEGMENT || withSlash.startsWith(`${API_SEGMENT}/`);
  if (baseHasApi && pathHasApi) return `${base}${withSlash.slice(API_SEGMENT.length)}`;

  return `${base}${withSlash}`;
}
