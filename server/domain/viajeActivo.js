import { ESTADOS_ACTIVOS } from './tripFilters.js';

/**
 * Que cuenta como «viaje activo». UNA sola respuesta, para todos.
 *
 * EL FALLO QUE ESTO CIERRA
 *
 * Habia dos criterios y no coincidian. El despacho consideraba ocupado a un
 * conductor con un viaje en DRIVER_ASSIGNED, ARRIVED o IN_PROGRESS, sin limite
 * de tiempo. `GET /api/trips/active/me` dejaba de devolver ese mismo viaje a
 * las doce horas.
 *
 * Pasadas esas doce horas el conductor seguia ocupado --no le llegaba ni una
 * carrera-- y su propia aplicacion ya no le enseniaba el viaje que le bloqueaba.
 * No podia cerrarlo porque no podia verlo. Dejaba de trabajar sin saber por que,
 * y desde fuera parecia que la aplicacion no le mandaba viajes.
 *
 * Paso de verdad: un viaje de una fase anterior tuvo que cancelarse desde
 * administracion para desbloquear al conductor de pruebas.
 *
 * LA REGLA
 *
 * Un viaje no terminal NO PUEDE estar ocupando a alguien y a la vez escondido de
 * quien lo ocupa. Asi que:
 *
 * - Buscando conductor: caduca a los tres minutos. No bloquea a nadie --todavia
 *   no hay conductor asignado-- y un `SEARCHING` viejo es basura de despacho que
 *   no debe reaparecer como si siguiera vivo.
 *
 * - Con conductor asignado: NO CADUCA. Mientras ocupe a alguien, se ve. Un viaje
 *   de hace tres dias sigue apareciendo, y eso es lo correcto: es justo el que
 *   hay que cerrar.
 *
 * LO QUE NO SE HACE AQUI
 *
 * No se completa ni se cancela nada solo. Un viaje viejo se marca --`obsoleto`--
 * y quien mira decide. Cerrar carreras por su cuenta seria mover dinero sin que
 * nadie lo pida.
 */

/** Lo que se espera a que alguien acepte, antes de darlo por muerto. */
export const VENTANA_BUSCANDO_MS = 3 * 60 * 1000;

/**
 * A partir de aqui un viaje con conductor huele mal.
 *
 * No lo apaga: lo marca. Doce horas es mas que cualquier carrera de ciudad, asi
 * que uno que siga abierto es casi seguro algo que se quedo a medias.
 */
export const EDAD_SOSPECHOSA_MS = 12 * 60 * 60 * 1000;

const SIN_CONDUCTOR = 'SEARCHING';

function edad(trip, ahora) {
  const creado = new Date(trip?.createdAt || 0).getTime();
  return Number.isFinite(creado) ? ahora - creado : 0;
}

/**
 * `true` si este viaje cuenta como activo ahora mismo.
 *
 * El mismo criterio que usa el despacho para decir que alguien esta ocupado y
 * el que usa la aplicacion para enseniar el viaje en curso. Si divergen, vuelve
 * el fallo de arriba.
 */
export function esViajeActivo(trip, ahora = Date.now()) {
  const estado = trip?.status;
  if (!ESTADOS_ACTIVOS.includes(estado)) return false;
  if (estado === SIN_CONDUCTOR) return edad(trip, ahora) < VENTANA_BUSCANDO_MS;
  return true;
}

/** `true` si lleva demasiado abierto. Es una seniial, no una sentencia. */
export function esViajeObsoleto(trip, ahora = Date.now()) {
  if (!esViajeActivo(trip, ahora)) return false;
  if (trip.status === SIN_CONDUCTOR) return false;
  return edad(trip, ahora) >= EDAD_SOSPECHOSA_MS;
}

/** El viaje activo de esta persona, sea pasajera o conductor. */
export function viajeActivoDe(trips, userId, ahora = Date.now()) {
  return trips.findLast(trip =>
    esViajeActivo(trip, ahora) &&
    (trip.passengerId === userId || trip.driverId === userId)
  ) ?? null;
}

/** El viaje que tiene ocupado a un conductor, o `null`. */
export function viajeQueOcupaAlConductor(trips, driverId, ahora = Date.now()) {
  return trips.findLast(trip =>
    trip.driverId === driverId &&
    trip.status !== SIN_CONDUCTOR &&
    esViajeActivo(trip, ahora)
  ) ?? null;
}
