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

  /**
   * Un viaje cambió de estado.
   *
   * Fuente: cinco sitios distintos de `server/index.js`, y ahí está el
   * problema — el payload NO es el mismo en los cinco:
   *
   *   transición del conductor   { tripId, status, canonicalStatus, updatedAt }
   *   traspaso de Safe Transport { … + driver }
   *   edición de administración  { tripId, status }              ← sin canonical
   *   sin conductores            { tripId, status, reason }      ← sin canonical
   *   aceptación del conductor   { … + driver }
   *
   * Y `status` a veces trae el ALIAS —`EN_ROUTE`— mientras el estado real viaja
   * en `canonicalStatus`. Por eso el payload NO sustituye a la autoridad: se
   * usa para saber QUE algo cambió, y el estado se vuelve a pedir por HTTP.
   */
  'tripStatusUpdated',

  /**
   * Un viaje se canceló.
   *
   * Fuente: `audience.emit('rideCancelled', { tripId })`. Sólo el
   * identificador: por sí solo no dice ni quién canceló ni cuándo.
   */
  'rideCancelled',

  /**
   * La cancelacion NO se acepto.
   *
   * Fuente: `socket.emit('rideCancellationRejected', { tripId, error, status })`
   * con `TRIP_NOT_FOUND`, `FORBIDDEN`, `TRIP_NOT_CANCELLABLE` o
   * `DATABASE_WRITE_FAILED`.
   *
   * Importa escucharlo: sin esto una cancelacion rechazada se veria igual
   * que una aceptada que tarda, y la pantalla esperaria por un viaje que
   * sigue vivo. El viaje NO se limpia hasta que el servidor lo confirme.
   */
  'rideCancellationRejected',

  /**
   * El despacho se quedó sin conductores.
   *
   * Fuente: `emit('dispatch:no_drivers', { tripId })`, justo antes de la
   * cancelación automática. Llega ANTES que el `tripStatusUpdated` de esa
   * cancelación, así que sirve para dejar de esperar cuanto antes.
   */
  'dispatch:no_drivers',

  /**
   * El conductor se movió.
   *
   * Fuente: `emitDriverLocation()` en `server/index.js`, que lo manda a
   * administración, al propio conductor y —sólo si tiene viaje activo— al
   * pasajero de ESE viaje.
   *
   * Payload: `{lat, lng, heading, updatedAt, driverId, userId, tripId}`. El
   * `heading` siempre viene: el servidor pone cero cuando el cliente no lo
   * mandó, así que un cero no distingue «al norte» de «no se sabe».
   */
  'driverLocationUpdated',

  /**
   * La pasajera se movió.
   *
   * Fuente: el manejador de `passenger:location_update`, que lo manda al
   * conductor del viaje y a administración. Este cliente lo declara para tener
   * el inventario completo; hoy no lo consume nadie en el móvil.
   */
  'passengerLocationUpdated',

  /**
   * El servidor no aceptó una posición.
   *
   * Fuente: `driver:location_rejected` con `INVALID_COORDINATES` o
   * `DATABASE_WRITE_FAILED`; `passenger:location_rejected` sólo con el
   * segundo. Ninguno lleva coordenadas.
   */
  'driver:location_rejected',
  'passenger:location_rejected',

  /**
   * El conductor entró en servicio.
   *
   * Fuente: el manejador de `driver:connect`, que responde
   * `{success, socketId, driver}` con el usuario completo. Confirma que el
   * servidor lo registró en la flota.
   */
  'driver:connected',

  /**
   * El estado del conductor cambió.
   *
   * Fuente: `emitDriverPresence()`, que lo manda al propio conductor, a
   * administración y —si tiene viaje— al pasajero. Payload:
   * `{driverId, userId, status}`.
   *
   * Es la AUTORIDAD sobre el estado: llega tanto cuando el cambio lo pidió el
   * conductor como cuando lo decidió el servidor o administración.
   */
  'driverStatusChanged',

  /**
   * El servidor no aceptó un cambio de estado.
   *
   * Fuente: `driver:status_rejected` con `INVALID_DRIVER_STATUS` —el conductor
   * pidió uno que no puede asignarse, como `SUSPENDED`— o
   * `DATABASE_WRITE_FAILED`.
   */
  'driver:status_rejected',

  /** El socket rechaza algo. Fuente: el limitador de conexiones y el envoltorio de eventos. */
  'socket:error',
  /** Demasiados eventos en poco tiempo. Se avisa UNA vez por ventana. */
  'socket:rate_limited',
  /** Rol insuficiente para lo que se pidió. Fuente: `allowSocketRole`. */
  'authorization:error',

  /**
   * Una carrera ofrecida a ESTE conductor.
   *
   * Fuente: `io.to(socketId).emit('rideRequested', offer)` en
   * `dispatchTripToDrivers`. Llega el viaje entero mas `offeredDriverId`,
   * `distanceToPickupKm`, `candidatesCount` y `offerExpiresAt`.
   *
   * El despacho ofrece de UNO EN UNO y espera quince segundos: no llegan dos a
   * la vez para la misma persona. `offerExpiresAt` es la marca de vencimiento
   * que calculo el servidor, y es contra ella contra la que cuenta la pantalla
   * --no contando quince hacia atras, que prometeria mas tiempo del que hay.
   */
  'rideRequested',

  /**
   * El servidor NO aplicó el cambio de estado que pidió el conductor.
   *
   * Fuente: `socket.emit('tripStatusRejected', { tripId, status, error })` en
   * el handler de `tripStatusUpdated` entrante. `error` es
   * `INVALID_TRIP_TRANSITION` cuando el salto no es legal desde el estado
   * actual, `INVALID_TRIP_STATUS` si el estado no venía, o
   * `DATABASE_WRITE_FAILED` si no se pudo guardar.
   *
   * IMPORTA ESCUCHARLO. Sin esto, un «Llegué» rechazado deja el botón girando
   * para siempre: quien conduce no sabe si salió, y la única salida es cerrar
   * la aplicación. Salió de los pendientes en TRIP-LIFECYCLE-ACTIONS-1, que es
   * cuando las acciones del conductor tuvieron pantalla.
   */
  'tripStatusRejected',

  /**
   * El servidor NO aceptó la aceptación de una carrera.
   *
   * Fuente: `socket.emit('rideAcceptanceFailed', { tripId, reason })` en el
   * handler de `rideAccepted`. `reason` dice por qué: `NO_ACTIVE_OFFER` cuando
   * la sesión de despacho ya pasó al siguiente candidato, `NOT_CURRENT_OFFER`
   * si se le está ofreciendo a otro, `ALREADY_ACCEPTED` si alguien llegó antes,
   * `TRIP_NOT_SEARCHING` si el viaje ya no busca conductor.
   *
   * ESTE ES EL QUE CIERRA EL «ACEPTANDO…» ETERNO. El servidor lo mandaba desde
   * siempre y este cliente no lo escuchaba, así que aceptar en el último segundo
   * —cuando el viaje ya se había cancelado— dejaba la pantalla girando sin más
   * salida que cerrar la aplicación.
   */
  'rideAcceptanceFailed',

  /**
   * Un mensaje de la conversación del viaje, para los DOS participantes.
   *
   * Fuente: `io.to(user:pasajera).to(user:conductor).emit('chat:message', …)`
   * en el handler de `chat:send_message`. Llega ya proyectado —sin la clave
   * privada del almacén de imágenes— con `id`, `tripId`, `senderId`,
   * `senderName`, `text`, `timestamp` y, si el remitente la mandó, `clientId`.
   *
   * También le llega a quien lo escribió: es su acuse. Un mensaje no se da por
   * enviado hasta que vuelve por aquí, y `clientId` es lo que casa el pendiente
   * con el durable para que no aparezca dos veces.
   */
  'chat:message',

  /**
   * El servidor no aceptó un mensaje.
   *
   * Fuente: `socket.emit('chat:error', { error, tripId })`. `FORBIDDEN` si no
   * es un participante, `CHAT_CLOSED` si el viaje ya terminó, `EMPTY_MESSAGE`
   * si no traía nada, `CHAT_MESSAGE_FAILED` si no se pudo guardar, y los
   * códigos de imagen del pipeline de media.
   */
  'chat:error'
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
  // Despacho — lo que todavía no tiene pantalla.
  //
  // `rideRequested` SALIÓ de aquí en DISPATCH-DRIVER-SURFACES-1: ya tiene
  // superficie y se escucha de verdad.
  //
  // OJO: `rideAccepted` NO está aquí ni entre los escuchados, y es a propósito:
  // el servidor NO lo emite. Es sólo cliente→servidor. Lo que el conductor
  // recibe al aceptar es un `tripStatusUpdated`.
  // `tripStatusRejected` SALIÓ de aquí en TRIP-LIFECYCLE-ACTIONS-1: el botón
  // del conductor necesita saber que el servidor dijo que no.
  // `rideAcceptanceFailed` SALIÓ de aquí en el cierre de los casos de borde:
  // sin escucharlo, aceptar en el último segundo dejaba la pantalla del
  // conductor girando para siempre.
  'rideRequestFailed',
  // Conductor — los tres de presencia salieron en DRIVER-AVAILABILITY-1.
  // No queda ninguno pendiente de esta familia.
  // Chat en vivo — `chat:message` y `chat:error` SALIERON de aquí en
  // CHAT-PASSENGER-DRIVER-1: la conversación del viaje ya tiene pantalla.
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
