/**
 * Los eventos del socket, tal como los usa el servidor de verdad.
 *
 * DE DÓNDE SALE CADA UNO
 *
 * Todos están leídos de `server/index.js`. Ninguno es una suposición, y por eso
 * cada bloque dice qué línea del servidor lo produce. Un evento que no esté
 * aquí es un evento que el servidor no manda —o que todavía no se ha
 * comprobado— y el cliente no debe esperarlo.
 *
 * LOS PAYLOADS SON DEFENSIVOS A PROPÓSITO
 *
 * Casi todo se declara opcional. No es dejadez: un evento es un mensaje de otro
 * proceso, puede llegar de una versión del servidor más vieja o más nueva que
 * la de este teléfono, y un campo que el tipo promete pero el mensaje no trae
 * es un fallo en tiempo de ejecución en medio de un viaje.
 *
 * Quien consume comprueba lo que necesita. `esObjeto` está aquí para eso.
 */

// ---------------------------------------------------------------------------
// Servidor → cliente
// ---------------------------------------------------------------------------

/**
 * Los que este cliente escucha HOY.
 *
 * La lista corta no es la lista completa del servidor —hay cuarenta y uno—:
 * son los que esta fase conecta. El despacho, la ubicación y el chat llegan en
 * sus fases, con sus consumidores.
 */
export const EVENTOS_DEL_SERVIDOR = [
  /**
   * Un aviso de la plataforma.
   *
   * Fuente: `io.to('drivers').to('passengers').emit('platform:notification', …)`
   * en `POST /api/admin/broadcasts`, y `io.to('user:…')` en la liquidación y en
   * Transporte Seguro.
   *
   * OJO: llega con DOS formas distintas. La difusión manda la notificación
   * entera —con `id` y `createdAt`, guardada en la base—; la liquidación manda
   * sólo `{title, message, category, icon}`, que NO está guardada. Por eso este
   * evento se trata como una señal, no como un registro. Ver `avisos.ts`.
   */
  'platform:notification',

  /** El socket rechaza algo. Fuente: el limitador de conexiones y el envoltorio de eventos. */
  'socket:error',
  /** Demasiados eventos en poco tiempo. Se avisa UNA vez por ventana. */
  'socket:rate_limited',
  /** Rol insuficiente para lo que se pidió. Fuente: `allowSocketRole`. */
  'authorization:error'
] as const;
export type EventoDelServidor = (typeof EVENTOS_DEL_SERVIDOR)[number];

/**
 * Los que el servidor manda y este cliente TODAVÍA no escucha.
 *
 * Están aquí por dos razones: para que el inventario sea honesto sobre lo que
 * falta, y para que una prueba pueda comprobar que ninguno se conecta antes de
 * su fase. Nombrarlos no los activa.
 */
export const EVENTOS_PENDIENTES = [
  // Despacho — REALTIME-INTEGRATION-2
  'rideRequested', 'rideAccepted', 'rideCancelled',
  'rideRequestFailed', 'rideAcceptanceFailed', 'rideCancellationRejected',
  'tripStatusUpdated', 'tripStatusRejected', 'dispatch:no_drivers',
  // Conductor — DRIVER-INTEGRATION
  'driver:connected', 'driver:status_rejected', 'driver:location_rejected',
  'driverLocationUpdated', 'driverStatusChanged',
  // Pasajera
  'passengerLocationUpdated', 'passenger:location_rejected',
  // Chat en vivo — CHAT-INTEGRATION
  'chat:message', 'chat:error',
  // Cartera y calificación
  'wallet:updated', 'tripRatingUpdated', 'tripRatingRejected'
] as const;

/**
 * Lo que el CLIENTE puede mandar.
 *
 * Ninguno se emite en esta fase. Están declarados para que el transporte tenga
 * su contrato completo y para que la prueba de «no hay despacho todavía» pueda
 * comprobar que no se llama a ninguno.
 *
 * `join:room` es el único que el servidor acepta sin más: y sólo admite las dos
 * salas que él mismo asignó (`${role}s` y `user:${userId}`). Pedir cualquier
 * otra no hace nada. La identidad NUNCA sale del payload.
 */
export const EVENTOS_DEL_CLIENTE = [
  'join:room',
  'driver:connect', 'driver:location', 'driver:status', 'driver:status_change',
  'passenger:location_update',
  'rideRequested', 'rideAccepted', 'rideRejected', 'rideCancelled',
  'tripStatusUpdated', 'tripRated',
  'chat:send_message'
] as const;
export type EventoDelCliente = (typeof EVENTOS_DEL_CLIENTE)[number];

// ---------------------------------------------------------------------------
// Las formas
// ---------------------------------------------------------------------------

/** Un aviso en vivo. Todo opcional: las dos formas del servidor caben aquí. */
export interface AvisoEnVivo {
  readonly id?: string;
  readonly title?: string;
  readonly message?: string;
  readonly category?: string;
  readonly icon?: string;
  readonly targetRole?: string;
  readonly createdAt?: string;
}

/** Lo que traen los eventos de error. Ninguno lleva nada sensible. */
export interface FalloDeSocket {
  readonly error?: string;
  readonly event?: string;
  readonly retryAfterMs?: number;
  readonly requiredRole?: string;
  readonly maxPerUser?: number;
}

/**
 * `true` si el payload es un objeto con el que se puede trabajar.
 *
 * El servidor ya normaliza los payloads que RECIBE —un `null` explícito llegó a
 * tumbar el proceso una vez— y el cliente hace lo mismo con los que recibe. Un
 * evento malformado tiene que ser un evento ignorado, nunca una aplicación
 * cerrada en medio de un viaje.
 */
export function esObjeto(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}
