/**
 * Búsqueda de conversaciones de soporte.
 *
 * Estaba en el navegador, aplicada sobre los hilos ya descargados. Mientras el
 * listado venía entero daba igual; con paginación dejó de darlo: buscar solo
 * miraba la primera página, así que una conversación que estuviera más atrás
 * no aparecía nunca y la pantalla decía «no hay conversaciones con este
 * filtro» sin que fuera cierto.
 *
 * Aquí se replica con los mismos campos que miraba la pantalla, para poder
 * filtrar todos los hilos antes de cortar la página.
 */

import { PaginationError } from './pagination.js';

// Un texto desmesurado no aporta nada y obliga a comparar cadenas larguísimas
// contra cada hilo.
export const MAX_SUPPORT_SEARCH_LENGTH = 120;

export function parseSupportSearch(value) {
  if (value === undefined || value === null) return '';
  const texto = String(value).trim();
  if (texto.length > MAX_SUPPORT_SEARCH_LENGTH) throw new PaginationError('SEARCH_TOO_LONG');
  return texto.toLowerCase();
}

/**
 * @param {{ user: object|null, lastMessage: object|null }} thread hilo ya resumido.
 * @param {string} search texto en minúsculas, tal como lo devuelve parseSupportSearch.
 */
export function matchesSupportThread(thread, search) {
  if (!search) return true;
  if (!thread) return false;

  const user = thread.user || {};
  // Mismo conjunto de campos que buscaba la pantalla: nombre y apellido,
  // correo, teléfono y el texto del último mensaje.
  const nombre = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const heno = `${nombre} ${user.email || ''} ${user.phone || ''} ${thread.lastMessage?.text || ''}`.toLowerCase();
  return heno.includes(search);
}

/** Filtra conservando el orden recibido, que ya es el de actividad reciente. */
export function filterSupportThreads(threads, search) {
  if (!Array.isArray(threads)) return [];
  if (!search) return threads;
  return threads.filter(thread => matchesSupportThread(thread, search));
}
