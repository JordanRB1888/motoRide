/**
 * Filtros del listado de usuarios.
 *
 * Estaban en el navegador, aplicados sobre la colección completa: para buscar
 * a una persona por su placa había que descargar antes los 25 000 usuarios,
 * 7 MB medidos contra el servidor real. Aquí se replican con la misma
 * definición para poder aplicarlos antes de responder.
 *
 * Las reglas de estado son las que ya usaba la pantalla y conviene no
 * reinterpretarlas: «verificado» significa cosas distintas para un pasajero y
 * para un conductor, y en ambos casos la suspensión manda por encima.
 */

import { PaginationError } from './pagination.js';

export const ROLES_PERMITIDOS = Object.freeze(['driver', 'passenger', 'admin']);
export const ESTADOS_PERMITIDOS = Object.freeze(['all', 'suspended', 'verified', 'pending']);

// Un texto de búsqueda desmesurado no aporta nada y obliga a recorrer la
// colección comparando cadenas larguísimas.
export const MAX_SEARCH_LENGTH = 120;

// El panel resuelve los nombres de los ocho viajes más recientes, o sea
// dieciséis personas como mucho. El tope deja margen holgado y evita que este
// filtro se convierta en una forma de pedir el listado entero de una vez.
export const MAX_IDS = 50;

export const isSuspended = user => user?.status === 'SUSPENDED' || user?.accountStatus === 'DISABLED';

export const isVerified = user => user?.role === 'passenger'
  ? user?.accountStatus !== 'DISABLED'
  : Boolean(user?.isVerified);

const fullName = user => `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

/**
 * Interpreta los parámetros de la consulta.
 *
 * `role` admite varios valores separados por coma, porque la pantalla de
 * usuarios pide conductores y pasajeros a la vez pero nunca administradores.
 */
export function parseUserFilters(query = {}) {
  const { role, status, search, ids } = query;

  let roles = null;
  if (role !== undefined && role !== null && role !== '' && role !== 'all') {
    roles = String(role).split(',').map(valor => valor.trim()).filter(Boolean);
    if (!roles.length) throw new PaginationError('INVALID_ROLE');
    for (const valor of roles) {
      if (!ROLES_PERMITIDOS.includes(valor)) throw new PaginationError('INVALID_ROLE');
    }
  }

  let estado = 'all';
  if (status !== undefined && status !== null && status !== '') {
    estado = String(status);
    if (!ESTADOS_PERMITIDOS.includes(estado)) throw new PaginationError('INVALID_STATUS');
  }

  let texto = '';
  if (search !== undefined && search !== null) {
    texto = String(search).trim();
    if (texto.length > MAX_SEARCH_LENGTH) throw new PaginationError('SEARCH_TOO_LONG');
  }

  // Resolver personas concretas por identificador. Es lo que necesita el panel
  // para poner nombre a los viajes recientes sin descargar el listado.
  let identificadores = null;
  if (ids !== undefined && ids !== null && ids !== '') {
    const lista = String(ids).split(',').map(valor => valor.trim()).filter(Boolean);
    if (!lista.length) throw new PaginationError('INVALID_IDS');
    if (lista.length > MAX_IDS) throw new PaginationError('TOO_MANY_IDS');
    identificadores = new Set(lista);
  }

  return { roles, status: estado, search: texto.toLowerCase(), ids: identificadores };
}

export function matchesUserFilters(user, { roles, status, search, ids } = {}) {
  if (!user) return false;
  if (ids && !ids.has(user.id)) return false;
  if (roles && !roles.includes(user.role)) return false;

  if (status && status !== 'all') {
    const suspendido = isSuspended(user);
    if (status === 'suspended') {
      if (!suspendido) return false;
    } else if (status === 'verified') {
      if (!isVerified(user) || suspendido) return false;
    } else if (status === 'pending') {
      if (isVerified(user) || suspendido) return false;
    }
  }

  if (search) {
    // Mismo conjunto de campos que buscaba la pantalla: nombre, correo,
    // teléfono, identificador y placa.
    const heno = `${fullName(user)} ${user.email || ''} ${user.phone || ''} ${user.id || ''} ${user.vehiclePlate || ''}`.toLowerCase();
    if (!heno.includes(search)) return false;
  }

  return true;
}

/**
 * Filtra conservando el orden de la colección recibida, que es el de alta.
 * Reordenar aquí cambiaría lo que ve quien ya usa la pantalla.
 */
export function filterUsers(users, filters) {
  if (!Array.isArray(users)) return [];
  return users.filter(user => matchesUserFilters(user, filters));
}
