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
  RIDE_REQUEST: 'ride_request'
});

const PAYLOAD_VERSION = 1;

/** Solo el identificador de enrutado. Nada más cabe aquí. */
export function buildRideOfferPayload(tripId) {
  return { v: PAYLOAD_VERSION, t: PUSH_TYPE.RIDE_REQUEST, tripId };
}

export function createPushNotificationService({
  database,
  persistRecord,
  sender = null,
  logger = console,
  enabled = isWebPushEnabled(),
  now = () => new Date().toISOString()
} = {}) {
  if (!database) throw new Error('PUSH_SERVICE_REQUIRES_DATABASE');
  if (typeof persistRecord !== 'function') throw new Error('PUSH_SERVICE_REQUIRES_PERSIST_RECORD');

  const collection = () => {
    if (!Array.isArray(database.pushSubscriptions)) database.pushSubscriptions = [];
    return database.pushSubscriptions;
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
    const host = endpointHost(subscription.endpoint);
    registrar('push_attempt', { subscriptionId: subscription.id, userId: subscription.userId, host, ...contexto });

    let statusCode;
    let error;
    try {
      const respuesta = await sender({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        payload
      });
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
   * PUSH-1 lo deja instalado y probado, pero NADIE lo llama: el despacho no
   * se toca en esta fase. Conectarlo dentro de `offerNext` es PUSH-3a, y
   * cuando se haga será sin `await`, para que un proveedor lento no pueda
   * robar segundos de la ventana de quince.
   */
  async function notifyRideOffer(trip, driverId, contexto = {}) {
    const tripId = trip?.id;
    if (!tripId || !driverId) return { sent: 0, skipped: true, results: [] };
    return notifyUser(driverId, buildRideOfferPayload(tripId), { tripId, ...contexto });
  }

  return {
    enabled,
    notifyUser,
    notifyRideOffer,
    newSubscriptionId: () => `sub_${crypto.randomUUID()}`
  };
}
