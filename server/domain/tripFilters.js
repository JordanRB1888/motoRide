/**
 * Filtros del listado de viajes.
 *
 * `GET /api/trips` devolvía la colección entera. Cuatro pantallas la pedían y
 * ninguna la quería completa: el panel usa los ocho más recientes, el mapa de
 * flota solo los activos, soporte el último de una persona, y la gestión de
 * usuarios los de quien esté seleccionado. Se filtra aquí para que cada una
 * pida lo suyo en lugar de descargarlo todo y recortar en el navegador.
 */

import { PaginationError } from './pagination.js';

// Estados no terminales: un viaje en curso, en cualquiera de sus fases.
export const ESTADOS_ACTIVOS = Object.freeze([
  'SEARCHING', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'
]);

export const ESTADOS_CONSULTABLES = Object.freeze([
  'all', 'active', 'completed', 'cancelled', 'scheduled'
]);

// El panel resuelve los viajes de las ocho personas de la página. El tope deja
// margen y evita que este filtro sea otra forma de pedir la colección entera.
export const MAX_TRIP_USER_IDS = 50;

/**
 * Momento por el que se ordena. Se prefiere la última actualización porque un
 * viaje viejo que acaba de cambiar de estado es más relevante que uno recién
 * creado y quieto.
 */
export function tripRecency(trip) {
  const valor = new Date(
    trip?.completedAt || trip?.closedAt || trip?.updatedAt || trip?.createdAt || 0
  ).getTime();
  return Number.isFinite(valor) ? valor : 0;
}

export function parseTripFilters(query = {}) {
  const { status, userId } = query;

  let estado = 'all';
  if (status !== undefined && status !== null && status !== '') {
    estado = String(status);
    if (!ESTADOS_CONSULTABLES.includes(estado)) throw new PaginationError('INVALID_TRIP_STATUS');
  }

  let usuarios = null;
  if (userId !== undefined && userId !== null && userId !== '') {
    const lista = String(userId).split(',').map(valor => valor.trim()).filter(Boolean);
    if (!lista.length) throw new PaginationError('INVALID_USER_ID');
    if (lista.length > MAX_TRIP_USER_IDS) throw new PaginationError('TOO_MANY_USER_IDS');
    usuarios = new Set(lista);
  }

  return { status: estado, userIds: usuarios };
}

/** Quiénes participan en el viaje, en cualquiera de los tres papeles. */
const participantes = trip => [trip?.passengerId, trip?.driverId, trip?.assignedDriverId];

export function matchesTripFilters(trip, { status, userIds } = {}) {
  if (!trip) return false;

  if (userIds && !participantes(trip).some(id => id && userIds.has(id))) return false;

  if (status && status !== 'all') {
    const actual = String(trip.status || '').toUpperCase();
    if (status === 'active') return ESTADOS_ACTIVOS.includes(actual);
    if (status === 'completed') return actual === 'COMPLETED';
    if (status === 'cancelled') return actual === 'CANCELLED';
    if (status === 'scheduled') return actual === 'SCHEDULED';
  }

  return true;
}

/**
 * Filtra y ordena del más reciente al más antiguo, que es como lo mira toda
 * pantalla que los enseña. Antes cada una reordenaba por su cuenta después de
 * haberse descargado la colección completa.
 */
export function filterTrips(trips, filters) {
  if (!Array.isArray(trips)) return [];
  return trips
    .filter(trip => matchesTripFilters(trip, filters))
    .sort((a, b) => tripRecency(b) - tripRecency(a));
}

/**
 * Recuento por persona, para la columna «N viajes» del listado de usuarios.
 *
 * Se cuenta en una sola pasada sobre los viajes en lugar de devolverlos: la
 * pantalla solo enseña el número, y traer los viajes para contarlos sería
 * descargar la colección con otro nombre.
 */
export function summarizeTripsByUser(trips, userIds) {
  const resumen = new Map();
  for (const id of userIds || []) resumen.set(id, { userId: id, total: 0, completed: 0 });
  if (!Array.isArray(trips)) return [...resumen.values()];

  for (const trip of trips) {
    const completado = String(trip?.status || '').toUpperCase() === 'COMPLETED';
    // Un viaje cuenta una sola vez por persona aunque figure en dos papeles.
    const vistos = new Set();
    for (const id of participantes(trip)) {
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const fila = resumen.get(id);
      if (!fila) continue;
      fila.total += 1;
      if (completado) fila.completed += 1;
    }
  }
  return [...resumen.values()];
}
