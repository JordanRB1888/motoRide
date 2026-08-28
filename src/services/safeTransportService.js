import { apiService } from './apiService.js';

/**
 * Cliente del Transporte Seguro — SAFE-TRANSPORT-1F.
 *
 * Consume la API de SAFE-1C/1D tal cual (apiService: misma autenticación,
 * mismos errores, misma cola). El frontend JAMÁS es autoridad de nada:
 * passengerId, estados de cobertura, asignaciones y handoff los decide el
 * servidor; aquí solo se pide y se pinta. Nada de esto se guarda en
 * localStorage ni en cachés: estado transitorio de pantalla, siempre.
 */

// --- Pasajero -------------------------------------------------------------

export const crearSuscripcion = body => apiService.post('/transport/subscriptions', body);
export const listarSuscripciones = () => apiService.get('/transport/subscriptions');
export const editarSuscripcion = (id, body) => apiService.patch(`/transport/subscriptions/${encodeURIComponent(id)}`, body);
export const pausarSuscripcion = id => apiService.post(`/transport/subscriptions/${encodeURIComponent(id)}/pause`, {});
export const reanudarSuscripcion = id => apiService.post(`/transport/subscriptions/${encodeURIComponent(id)}/resume`, {});
export const cancelarSuscripcion = id => apiService.post(`/transport/subscriptions/${encodeURIComponent(id)}/cancel`, {});
export const listarTrasladosProgramados = () => apiService.get('/transport/scheduled-rides');

// --- Conductor ------------------------------------------------------------

export const leerPreferenciasConductor = () => apiService.get('/transport/driver/preferences');
export const guardarPreferenciasConductor = body => apiService.patch('/transport/driver/preferences', body);
export const listarOfertasConductor = () => apiService.get('/transport/driver/offers');
export const listarCompromisosConductor = () => apiService.get('/transport/driver/commitments');
export const aceptarTraslado = rideId => apiService.post(`/transport/scheduled-rides/${encodeURIComponent(rideId)}/accept`, {});
export const rechazarTraslado = rideId => apiService.post(`/transport/scheduled-rides/${encodeURIComponent(rideId)}/decline`, {});
export const retirarseDeTraslado = rideId => apiService.post(`/transport/scheduled-rides/${encodeURIComponent(rideId)}/withdraw`, {});

// --- Lenguaje humano de estados (jamás enums crudos en pantalla) ----------

/**
 * Estados de cobertura, en honesto: sin «garantizado», sin prometer lo que
 * el producto todavía no define.
 */
export function estadoDeCoberturaEnHumano(ride) {
  const servicio = String(ride?.serviceStatus ?? '');
  if (servicio === 'ACTIVE') return { texto: 'Viaje en curso', tono: 'activo' };
  if (servicio === 'COMPLETED') return { texto: 'Completado', tono: 'completado' };
  if (/^CANCELLED_/.test(servicio)) return { texto: 'Cancelado', tono: 'cancelado' };
  if (/^NO_SHOW_/.test(servicio)) return { texto: 'No realizado', tono: 'cancelado' };
  switch (ride?.assignmentStatus) {
    case 'OFFERED_PREFERRED':
      return { texto: 'Esperando confirmación de tu conductor preferido', tono: 'buscando' };
    case 'ASSIGNING':
      return { texto: 'Buscando conductor de respaldo', tono: 'buscando' };
    case 'DRIVER_CONFIRMED':
    case 'COVERAGE_CONFIRMED':
      return { texto: 'Conductor confirmado', tono: 'confirmado' };
    case 'AT_RISK':
      return { texto: 'Estamos buscando una solución para este traslado', tono: 'atencion' };
    case 'BACKUP_REQUIRED':
    case 'UNASSIGNED':
    default:
      return { texto: 'Buscando cobertura', tono: 'buscando' };
  }
}

export const ESTADOS_SUSCRIPCION = Object.freeze({
  ACTIVE: 'Activo',
  PAUSED: 'En pausa',
  CANCELLED: 'Cancelado',
  SUSPENDED_PAYMENT: 'Suspendido',
  EXPIRED: 'Vencido'
});

export const DIAS_SEMANA = Object.freeze([
  { valor: 1, letra: 'L', nombre: 'Lunes' },
  { valor: 2, letra: 'M', nombre: 'Martes' },
  { valor: 3, letra: 'M', nombre: 'Miércoles' },
  { valor: 4, letra: 'J', nombre: 'Jueves' },
  { valor: 5, letra: 'V', nombre: 'Viernes' },
  { valor: 6, letra: 'S', nombre: 'Sábado' },
  { valor: 7, letra: 'D', nombre: 'Domingo' }
]);

/** Errores del backend traducidos a texto humano. Jamás cadenas técnicas. */
const MENSAJES = Object.freeze({
  SUBSCRIPTION_LIMIT: 'Ya tienes un plan de traslados activo. Cancélalo antes de crear otro.',
  INVALID_ROUTE: 'Revisa las direcciones de casa y trabajo.',
  INVALID_WEEKDAYS: 'Elige al menos un día de la semana.',
  INVALID_TIME: 'Revisa las horas de ida y regreso.',
  INVALID_SCHEDULE: 'Ese horario no es válido. Revisa los datos.',
  INVALID_EFFECTIVE_FROM: 'La fecha de inicio no es válida.',
  SUBSCRIPTION_CANCELLED: 'Este plan ya fue cancelado.',
  SUBSCRIPTION_NOT_FOUND: 'No encontramos ese plan de traslados.',
  INVALID_STATUS_TRANSITION: 'Esa acción no está disponible en el estado actual.',
  RIDE_ALREADY_COVERED: 'Este traslado ya fue tomado por otro conductor.',
  NO_ACTIVE_OFFER: 'Esta oferta ya no está disponible.',
  OFFER_EXPIRED: 'La oferta venció. Si sigue disponible volverá a aparecer.',
  SCHEDULE_CONFLICT: 'Ya tienes un traslado comprometido en ese horario.',
  NOT_OPTED_IN: 'Activa «Recibir traslados programados» para participar.',
  COMMITMENT_NOT_FOUND: 'No encontramos ese compromiso.',
  COMMITMENT_ALREADY_DUE: 'Este traslado ya está por comenzar; no es posible retirarse.',
  SCHEDULED_RIDE_NOT_FOUND: 'Ese traslado ya no existe.',
  DATABASE_WRITE_FAILED: 'No pudimos guardar los cambios. Intenta de nuevo.',
  RATE_LIMITED: 'Demasiadas solicitudes seguidas. Espera un momento.',
  NETWORK_ERROR: 'Sin conexión. Revisa tu internet e intenta de nuevo.'
});

export function mensajeDeError(porDefecto = 'No se pudo completar la acción. Intenta de nuevo.') {
  const ultimo = apiService.lastError;
  if (!ultimo) return porDefecto;
  if (ultimo.status === 404) return 'Esta función no está disponible por ahora.';
  if (ultimo.status === 401 || ultimo.status === 403) return 'Tu sesión no tiene acceso a esta función.';
  return MENSAJES[ultimo.error] ?? porDefecto;
}
