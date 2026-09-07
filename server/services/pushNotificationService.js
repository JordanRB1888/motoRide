/**
 * Entrega de Web Push. Cimientos de PUSH-1.
 *
 * En esta fase NO hay proveedor real: el `sender` se inyecta, y sin uno el
 * servicio no envía nada. Eso no es una limitación de las pruebas, es el
 * contrato: PUSH-1 instala la maquinaria y PUSH-4 conecta el adaptador real.
 *
 * La propiedad más importante de este módulo no es enviar, es NO ROMPER A
 * QUIEN LO LLAMA. Push es entrega auxiliar de mejor esfuerzo; el despacho de
 * carreras funciona hoy sin él y debe seguir funcionando igual aunque el
 * proveedor esté caído, tarde treinta segundos o lance. Por eso toda la
 * superficie pública resuelve con un resultado estructurado y jamás rechaza.
 *
 * En PUSH-1 nada del despacho llama aquí todavía. Esa conexión es PUSH-3a.
 */

import crypto from 'node:crypto';
import {
  DELIVERY_RESULT,
  activeSubscriptionsFor,
  applyDeliveryOutcome,
  endpointHost
} from '../domain/pushSubscription.js';
import {
  anotarEntrega,
  claveDeMensaje,
  claveDeViaje,
  convieneAvisar,
  yaSeEntrego
} from '../domain/entregaDePush.js';

/**
 * Interpreta la bandera del entorno.
 *
 * Explícito y por lista: `Boolean('false')` es `true`, y esa clase de error
 * activaría en producción una funcionalidad que se creía apagada. Cualquier
 * valor que no esté en la lista --incluida la ausencia de la variable-- es
 * falso.
 */
const VALORES_VERDADEROS = new Set(['1', 'true', 'yes', 'on']);

export function isWebPushEnabled(value = process.env.WEB_PUSH_ENABLED) {
  return VALORES_VERDADEROS.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Contenido de las notificaciones.
 *
 * El payload lleva un TIPO, no texto. El service worker traduce ese tipo a
 * título y cuerpo con una tabla fija suya (PUSH-2). Así ninguna cadena que
 * venga del servidor puede acabar pintada en una pantalla de bloqueo: no
 * existe el camino por el que una dirección de recogida o un nombre lleguen
 * ahí, ni siquiera por error de programación.
 */
export const PUSH_TYPE = Object.freeze({
  RIDE_REQUEST: 'ride_request',
  // Transporte Seguro: los tres avisos que EXIGEN que el teléfono suene,
  // porque hay algo que hacer o que dejar de hacer.
  SCHEDULED_OFFER: 'scheduled_offer',
  SCHEDULED_PICKUP_DUE: 'scheduled_pickup_due',
  SCHEDULED_CANCELLED: 'scheduled_cancelled',

  // PUSH-1 · El ciclo de vida del viaje, para la pasajera.
  //
  // Son los momentos en los que algo cambia PARA ELLA y puede tener el teléfono
  // guardado: la moto ya viene, ya está abajo, arrancaron, se acabó. No entra
  // ningún estado intermedio del despacho: eso es ruido para quien espera.
  TRIP_ACCEPTED: 'trip_accepted',
  TRIP_ARRIVED: 'trip_arrived',
  TRIP_STARTED: 'trip_started',
  TRIP_COMPLETED: 'trip_completed',
  TRIP_CANCELLED: 'trip_cancelled',

  // PUSH-1 · Un mensaje nuevo del chat del viaje, para cualquiera de los dos.
  // El TIPO no dice quién escribió ni qué: eso se resuelve al abrir.
  CHAT_MESSAGE: 'chat_message'
});

const PAYLOAD_VERSION = 1;

/**
 * Lo que se lee en la pantalla de bloqueo, por TIPO.
 *
 * CONSTANTES, y sólo constantes. Aquí no entra ninguna función ni ninguna
 * plantilla: el emisor que use esta tabla no tiene acceso al viaje, al mensaje
 * ni a la persona, así que no existe el camino por el que una dirección de
 * recogida o el texto de un chat acaben aquí. Hay una prueba que lo vigila.
 *
 * Es la MISMA tabla que traduce el teléfono. Vive en el servidor porque FCM,
 * con la aplicación cerrada, presenta lo que le llega; y en el teléfono porque
 * en primer plano lo presenta la aplicación. Si se cambia una, se cambia la
 * otra --la prueba del móvil compara las dos.
 */
export const TEXTO_DE_AVISO = Object.freeze({
  ride_request: { title: 'Nueva carrera', body: 'Tienes una solicitud cerca de ti. Respóndela antes de que se agote.' },
  scheduled_offer: { title: 'Transporte Seguro', body: 'Te proponen un traslado programado.' },
  scheduled_pickup_due: { title: 'Transporte Seguro', body: 'Es hora de ir a buscar tu traslado programado.' },
  scheduled_cancelled: { title: 'Transporte Seguro', body: 'Un traslado programado se canceló.' },
  trip_accepted: { title: 'Tu moto viene', body: 'Un conductor aceptó tu viaje.' },
  trip_arrived: { title: 'Tu conductor llegó', body: 'Te está esperando en el punto de recogida.' },
  trip_started: { title: 'Viaje en marcha', body: 'Ya vas en camino a tu destino.' },
  trip_completed: { title: 'Viaje terminado', body: 'Llegaste. Gracias por viajar con +58Express.' },
  trip_cancelled: { title: 'Viaje cancelado', body: 'Tu viaje se canceló. Puedes pedir otro cuando quieras.' },
  chat_message: { title: 'Nuevo mensaje', body: 'Tienes un mensaje en el chat de tu viaje.' },
  por_omision: { title: '+58Express', body: 'Tienes una novedad en tu viaje.' }
});

/** Solo el identificador de enrutado. Nada más cabe aquí. */
export function buildRideOfferPayload(tripId) {
  return { v: PAYLOAD_VERSION, t: PUSH_TYPE.RIDE_REQUEST, tripId };
}

/** Igual de austero para los avisos del plan: tipo y, si acaso, el viaje. */
export function buildScheduledPayload(type, tripId = null) {
  const payload = { v: PAYLOAD_VERSION, t: type };
  if (tripId) payload.tripId = tripId;
  return payload;
}

/**
 * El ciclo de vida del viaje, y el chat. Tipo e identificador, y nada más.
 *
 * NI EL NOMBRE, NI LA DIRECCIÓN, NI EL TEXTO DEL MENSAJE
 *
 * Es la misma regla que ya gobernaba la oferta de carrera, y aquí importa más:
 * un mensaje de chat es la clase de contenido que apetece meter en el cuerpo
 * de la notificación —«Ana: voy llegando»— y eso lo pinta la pantalla de
 * bloqueo de un teléfono que puede estar sobre una mesa. El teléfono traduce el
 * tipo a un texto fijo suyo —«Nuevo mensaje de tu conductor»— y para leer el
 * mensaje hay que abrir la aplicación y autenticarse.
 *
 * El `tripId` sí viaja porque es lo único que permite abrir la pantalla
 * correcta, y por sí solo no dice nada de nadie: sin sesión no abre nada.
 */
export function buildTripPayload(type, tripId) {
  return { v: PAYLOAD_VERSION, t: type, tripId };
}

export function createPushNotificationService({
  database,
  persistRecord,
  sender = null,
  logger = console,
  enabled = isWebPushEnabled(),
  now = () => new Date().toISOString(),
  /**
   * Cuántos sockets vivos tiene esa persona AHORA.
   *
   * Se inyecta porque el servicio no debe conocer Socket.IO, y porque así la
   * supresión se puede comprobar sin levantar un servidor. Por omisión devuelve
   * cero: sin señal, se avisa — que es el lado seguro del error.
   */
  contarConexiones = async () => 0,
  ahoraEnMilisegundos = () => Date.now()
} = {}) {
  if (!database) throw new Error('PUSH_SERVICE_REQUIRES_DATABASE');
  if (typeof persistRecord !== 'function') throw new Error('PUSH_SERVICE_REQUIRES_PERSIST_RECORD');

  const collection = () => {
    if (!Array.isArray(database.pushSubscriptions)) database.pushSubscriptions = [];
    return database.pushSubscriptions;
  };

  /** Lo ya avisado, para que no salga dos veces. Ver `domain/entregaDePush`. */
  const entregas = () => {
    if (!Array.isArray(database.pushDeliveries)) database.pushDeliveries = [];
    return database.pushDeliveries;
  };

  /**
   * Traza estructurada, con lista de campos permitidos.
   *
   * Nunca sale de aquí el endpoint completo, ni `p256dh`, ni `auth`, ni un
   * dato del viaje más allá del identificador. El host sí: identifica al
   * proveedor --útil para diagnosticar-- y no a la persona.
   */
  const registrar = (event, campos = {}) => {
    logger.log(`[+58express Push] ${JSON.stringify({ event, ...campos })}`);
  };

  /**
   * Envía a UNA suscripción y aplica el desenlace.
   *
   * Captura todo. Un `sender` que lance es un fallo transitorio como
   * cualquier otro, no una excepción que deba subir.
   */
  async function enviarA(subscription, payload, contexto) {
    const host = endpointHost(subscription.endpoint, subscription.transport);
    registrar('push_attempt', { subscriptionId: subscription.id, userId: subscription.userId, host, ...contexto });

    let statusCode;
    let error;
    try {
      const respuesta = await sender({
        transport: subscription.transport,
        platform: subscription.platform,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        payload
      });
      // Un transporte sin emisor configurado no es un fallo del dispositivo:
      // no se toca su contador, y se dice por qué. Ver `pushSender.js`.
      if (respuesta?.omitido) {
        registrar('push_omitido_sin_emisor', { subscriptionId: subscription.id, transporte: respuesta.transporte });
        return { subscriptionId: subscription.id, result: 'SKIPPED', disabled: false };
      }
      statusCode = respuesta?.statusCode;
    } catch (fallo) {
      // Solo se conserva la clase del fallo. El mensaje de un error de red
      // puede arrastrar la URL completa, y esa URL es el endpoint.
      error = fallo?.code || fallo?.name || 'SENDER_THREW';
    }

    const { result, disabled } = applyDeliveryOutcome(subscription, { statusCode, error, now: now() });

    if (result === DELIVERY_RESULT.SUCCESS) {
      registrar('push_success', { subscriptionId: subscription.id, host, statusCode });
    } else if (result === DELIVERY_RESULT.EXPIRED) {
      registrar('push_expired_subscription', { subscriptionId: subscription.id, host, statusCode });
    } else if (result === DELIVERY_RESULT.RATE_LIMITED) {
      registrar('push_rate_limited', { subscriptionId: subscription.id, host, statusCode });
    } else if (result === DELIVERY_RESULT.BAD_REQUEST) {
      // Defecto propio de payload o cabeceras: no se reintenta y se marca
      // fuerte, porque lo arregla un cambio de código, no un reintento.
      registrar('push_bad_request', { subscriptionId: subscription.id, host, statusCode });
    } else {
      registrar('push_transient_failure', {
        subscriptionId: subscription.id, host, statusCode, error, failureCount: subscription.failureCount
      });
    }

    if (disabled) {
      registrar('push_subscription_disabled', {
        subscriptionId: subscription.id, reason: subscription.disabledReason
      });
    }

    // La escritura tampoco puede tumbar a nadie: si el disco falla, el estado
    // en memoria ya es correcto y el siguiente envío lo reintenta.
    try {
      await persistRecord('pushSubscriptions', subscription);
    } catch {
      registrar('push_persist_failed', { subscriptionId: subscription.id });
    }

    return { subscriptionId: subscription.id, result, disabled };
  }

  /**
   * Envía a todos los dispositivos vivos de un usuario.
   *
   * NUNCA rechaza. El fallo de un dispositivo no aborta los demás: cada envío
   * se resuelve por separado.
   */
  async function notifyUser(userId, payload, contexto = {}) {
    try {
      if (!enabled) {
        registrar('push_disabled_by_config', {});
        return { sent: 0, skipped: true, results: [] };
      }
      if (typeof sender !== 'function') {
        // PUSH-1 termina aquí: no hay adaptador real todavía.
        registrar('push_no_sender_configured', {});
        return { sent: 0, skipped: true, results: [] };
      }

      const destinos = activeSubscriptionsFor(collection(), userId);
      if (!destinos.length) {
        registrar('push_no_active_subscriptions', { userId, ...contexto });
        return { sent: 0, skipped: false, results: [] };
      }

      const results = [];
      for (const subscription of destinos) {
        results.push(await enviarA(subscription, payload, contexto));
      }
      return {
        sent: results.filter(item => item.result === DELIVERY_RESULT.SUCCESS).length,
        skipped: false,
        results
      };
    } catch (fallo) {
      // Red de última instancia. Si algo imprevisto rompe aquí dentro, la
      // lógica de negocio no puede enterarse.
      registrar('push_unexpected_error', { error: fallo?.name || 'UNKNOWN' });
      return { sent: 0, skipped: true, results: [], failed: true };
    }
  }

  /**
   * Aviso de oferta de carrera a un conductor.
   *
   * Desde PUSH-3A lo invoca `offerNext` en el despacho, sin `await`: es un
   * aviso de atencion que acompana a la oferta de Socket.IO ya emitida al
   * MISMO conductor, y un proveedor lento no puede robar segundos de la
   * ventana de quince. Como todo el servicio, nunca rechaza.
   */
  async function notifyRideOffer(trip, driverId, contexto = {}) {
    const tripId = trip?.id;
    if (!tripId || !driverId) return { sent: 0, skipped: true, results: [] };
    return notifyUser(driverId, buildRideOfferPayload(tripId), { tripId, ...contexto });
  }

  /**
   * Aviso del Transporte Seguro (oferta programada, hora de recogida,
   * cancelación). Igual que `notifyRideOffer`, es una operación SEMÁNTICA con
   * su lista blanca: el resto del servidor no toca el transporte genérico, y
   * un tipo que no esté aquí no puede salir a ningún teléfono.
   */
  const TIPOS_PROGRAMADOS = new Set([
    PUSH_TYPE.SCHEDULED_OFFER, PUSH_TYPE.SCHEDULED_PICKUP_DUE, PUSH_TYPE.SCHEDULED_CANCELLED
  ]);

  async function notifyScheduledEvent(userId, type, tripId = null, contexto = {}) {
    if (!userId || !TIPOS_PROGRAMADOS.has(type)) {
      registrar('push_scheduled_type_rejected', {});
      return { sent: 0, skipped: true, results: [] };
    }
    return notifyUser(userId, buildScheduledPayload(type, tripId), { ...contexto });
  }

  /**
   * Un aviso que sale UNA vez, y solo si hace falta.
   *
   * Es la puerta por la que pasan los avisos nuevos de PUSH-1. Hace tres cosas
   * que `notifyUser` no hace, y las tres son de producto y no de transporte:
   *
   *   1. IDEMPOTENCIA. Si el hecho ya se avisó, no vuelve a salir. La clave es
   *      del hecho, no del intento — ver `domain/entregaDePush`.
   *   2. SUPRESIÓN. Si el aviso es de los que se pueden perder y esa persona
   *      tiene un socket vivo, se calla. Nunca se suprime una oferta ni un
   *      cambio de estado.
   *   3. ANOTACIÓN DURABLE. Se apunta ANTES de enviar, no después: si el
   *      proveedor tarda y alguien reintenta mientras tanto, el segundo intento
   *      encuentra la marca y no duplica. Un aviso perdido por un fallo del
   *      proveedor es mejor que tres avisos por lo mismo — y el socket, que es
   *      el canal principal, ya llevó la información.
   */
  async function avisarUnaVez(userId, payload, { clave, tipoSuprimible = false, contexto = {} }) {
    if (!userId || !clave) return { sent: 0, skipped: true, results: [] };

    const ahora = ahoraEnMilisegundos();
    if (yaSeEntrego(entregas(), clave, ahora)) {
      registrar('push_duplicado_evitado', { clave, ...contexto });
      return { sent: 0, skipped: true, duplicado: true, results: [] };
    }

    if (tipoSuprimible) {
      let vivas = 0;
      try {
        vivas = await contarConexiones(userId);
      } catch {
        // Sin señal se avisa: es el lado seguro del error.
        vivas = 0;
      }
      if (!convieneAvisar({ tipoSuprimible, conexionesVivas: vivas })) {
        registrar('push_suprimido_por_presencia', { clave, ...contexto });
        return { sent: 0, skipped: true, suprimido: true, results: [] };
      }
    }

    const { entrada } = anotarEntrega(entregas(), clave, ahora);
    if (entrada) {
      try {
        await persistRecord('pushDeliveries', entrada);
      } catch {
        // Si el disco falla, la marca en memoria ya evita el duplicado de esta
        // ejecución. Tras un reinicio se podría repetir una vez, y eso es
        // preferible a no avisar.
        registrar('push_entrega_no_persistida', { clave });
      }
    }

    return notifyUser(userId, payload, contexto);
  }

  /**
   * Los cambios del viaje que la pasajera tiene que saber aunque no mire.
   *
   * Lista blanca, igual que los avisos del plan: un tipo que no esté aquí no
   * puede salir a ningún teléfono, ni siquiera por un error de programación en
   * otro sitio.
   *
   * NO se suprimen por presencia. Que alguien tenga un socket vivo no significa
   * que esté mirando —la aplicación en segundo plano lo conserva un rato— y
   * enterarse tarde de que la moto ya está abajo es peor que un aviso de más.
   */
  const TIPOS_DE_VIAJE = new Set([
    PUSH_TYPE.TRIP_ACCEPTED, PUSH_TYPE.TRIP_ARRIVED, PUSH_TYPE.TRIP_STARTED,
    PUSH_TYPE.TRIP_COMPLETED, PUSH_TYPE.TRIP_CANCELLED
  ]);

  async function notifyTripLifecycle(trip, type, userId, contexto = {}) {
    const tripId = trip?.id;
    if (!tripId || !userId || !TIPOS_DE_VIAJE.has(type)) {
      registrar('push_tipo_de_viaje_rechazado', {});
      return { sent: 0, skipped: true, results: [] };
    }
    return avisarUnaVez(userId, buildTripPayload(type, tripId), {
      clave: claveDeViaje(tripId, type),
      tipoSuprimible: false,
      contexto: { tripId, ...contexto }
    });
  }

  /**
   * Un mensaje nuevo del chat del viaje.
   *
   * ESTE SÍ se suprime cuando quien lo recibiría tiene la aplicación conectada:
   * el mensaje ya le llegó por el socket y lo está viendo aparecer en la
   * conversación. Sonar encima solo molesta, y enseña en la pantalla de bloqueo
   * algo que ya estaba leyendo.
   *
   * Es el único aviso que se puede permitir perder: si la supresión se equivoca
   * —socket vivo pero pantalla apagada— el mensaje sigue ahí al abrir, con su
   * historial. Perder una oferta de carrera, en cambio, cuesta una carrera.
   */
  async function notifyChatMessage({ tripId, messageId, userId }, contexto = {}) {
    if (!tripId || !messageId || !userId) {
      registrar('push_mensaje_rechazado', {});
      return { sent: 0, skipped: true, results: [] };
    }
    return avisarUnaVez(userId, buildTripPayload(PUSH_TYPE.CHAT_MESSAGE, tripId), {
      clave: claveDeMensaje(messageId),
      tipoSuprimible: true,
      contexto: { tripId, ...contexto }
    });
  }

  return {
    enabled,
    notifyUser,
    notifyRideOffer,
    notifyScheduledEvent,
    notifyTripLifecycle,
    notifyChatMessage,
    newSubscriptionId: () => `sub_${crypto.randomUUID()}`
  };
}
