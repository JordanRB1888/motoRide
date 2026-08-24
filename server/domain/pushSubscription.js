/**
 * Reglas puras de las suscripciones de Web Push.
 *
 * Aquí no hay red, ni base de datos, ni Express: solo decisiones. Eso permite
 * probar el contrato completo --validación, propiedad del endpoint,
 * clasificación de la respuesta del proveedor y umbral de fallos-- sin
 * levantar nada.
 *
 * Dos invariantes gobiernan todo el módulo:
 *
 *   1. El propietario NUNCA sale del cuerpo de la petición. Estas funciones
 *      reciben el userId ya resuelto por quien llama desde `req.user.id`, y no
 *      existe ninguna firma que acepte un propietario elegido por el cliente.
 *   2. El endpoint es material sensible. No se devuelve en ninguna proyección
 *      pública ni se emite en ninguna traza; solo su host, que identifica al
 *      proveedor y no a la persona.
 */

export const PUSH_DISABLED_REASON = Object.freeze({
  USER_REVOKED: 'USER_REVOKED',
  EXPIRED_404: 'EXPIRED_404',
  EXPIRED_410: 'EXPIRED_410',
  TOO_MANY_FAILURES: 'TOO_MANY_FAILURES'
});

export const DELIVERY_RESULT = Object.freeze({
  SUCCESS: 'SUCCESS',
  EXPIRED: 'EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  BAD_REQUEST: 'BAD_REQUEST',
  TRANSIENT: 'TRANSIENT'
});

/**
 * Fallos transitorios consecutivos que se toleran antes de dar por muerta una
 * suscripción.
 *
 * Conservador a propósito. Un 5xx aislado del proveedor es ruido de
 * infraestructura y no dice nada sobre si el dispositivo existe; dar de baja
 * por uno solo perdería suscripciones legítimas cada vez que un proveedor
 * tuviera un mal minuto. Solo la señal inequívoca --404 o 410-- da de baja de
 * inmediato.
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

const ENDPOINT_MAX = 2048;
const KEY_MAX = 255;
// base64url: lo que emiten los navegadores para p256dh y auth.
const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

/**
 * Comprueba una suscripción recibida del cliente.
 *
 * No se fijan longitudes exactas para las claves a pesar de que hoy p256dh
 * ocupa 65 bytes y auth 16. Un límite exacto convierte cualquier variación
 * futura de un navegador en un rechazo silencioso, y el coste de equivocarse
 * es peor que el de aceptar una clave rara: una clave inválida falla en el
 * envío y la suscripción se da de baja sola. Sí se acota el alfabeto y el
 * tamaño, que es lo que impide almacenar basura arbitraria.
 *
 * @returns {{ok: true, value: {endpoint: string, keys: {p256dh: string, auth: string}}} | {ok: false}}
 */
export function validateSubscriptionInput(input) {
  if (!input || typeof input !== 'object') return { ok: false };

  const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
  if (!endpoint || endpoint.length > ENDPOINT_MAX) return { ok: false };

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false };
  }
  // Los servicios de push son siempre https. Aceptar http permitiría apuntar a
  // un destino en claro, y aceptar otros esquemas abriría la puerta a que el
  // backend hiciera peticiones a donde no debe.
  if (url.protocol !== 'https:') return { ok: false };

  const keys = input.keys;
  if (!keys || typeof keys !== 'object') return { ok: false };
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  for (const key of [p256dh, auth]) {
    if (!key || key.length > KEY_MAX || !BASE64URL.test(key)) return { ok: false };
  }

  return { ok: true, value: { endpoint, keys: { p256dh, auth } } };
}

/** Host del endpoint: identifica al proveedor, nunca a la persona. */
export function endpointHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'desconocido';
  }
}

export function isActive(record) {
  return Boolean(record) && !record.disabledAt;
}

/** Suscripciones vivas de un usuario. */
export function activeSubscriptionsFor(collection, userId) {
  if (!Array.isArray(collection) || typeof userId !== 'string' || !userId) return [];
  return collection.filter(item => item.userId === userId && isActive(item));
}

/**
 * Alta o actualización de una suscripción.
 *
 * La deduplicación se hace aquí, EN MEMORIA y por endpoint, antes de que nada
 * llegue al disco. El índice único de PostgreSQL existe como red de seguridad
 * --convierte una corrupción silenciosa en un fallo ruidoso-- y no como
 * control de flujo: si el motor tuviera que rechazar una fila, abortaría la
 * transacción entera y se llevaría por delante escrituras no relacionadas del
 * mismo lote.
 *
 * Si el endpoint ya existe se REUTILIZA la fila, aunque su dueño fuera otro.
 * Un teléfono que cambia de manos --realista en una flota donde los aparatos
 * se prestan y se revenden-- no puede dejar dos filas vivas con el mismo
 * endpoint: el conductor nuevo recibiría las carreras del anterior.
 *
 * @returns {{record: object, created: boolean, ownerChanged: boolean}}
 */
export function registerSubscription(collection, { userId, endpoint, keys, id, now }) {
  const existing = collection.find(item => item.endpoint === endpoint);

  if (existing) {
    const ownerChanged = existing.userId !== userId;
    existing.userId = userId;
    existing.keys = { p256dh: keys.p256dh, auth: keys.auth };
    existing.updatedAt = now;
    existing.lastSeenAt = now;
    // Volver a registrarse resucita una suscripción revocada o caducada: el
    // navegador acaba de demostrar que sigue viva.
    existing.disabledAt = null;
    existing.disabledReason = null;
    existing.failureCount = 0;
    return { record: existing, created: false, ownerChanged };
  }

  const record = {
    id,
    userId,
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    lastSuccessAt: null,
    failureCount: 0,
    disabledAt: null,
    disabledReason: null
  };
  collection.push(record);
  return { record, created: true, ownerChanged: false };
}

/** Baja lógica: la fila se conserva, con su motivo. */
export function revokeSubscription(record, { now, reason = PUSH_DISABLED_REASON.USER_REVOKED }) {
  record.disabledAt = now;
  record.disabledReason = reason;
  record.updatedAt = now;
  return record;
}

/**
 * Traduce la respuesta del proveedor a una de las cinco clases.
 *
 * Un fallo lanzado (red caída, DNS, timeout) es transitorio: no dice nada
 * sobre si la suscripción existe.
 */
export function classifyDeliveryResult({ statusCode, error } = {}) {
  if (error) return DELIVERY_RESULT.TRANSIENT;
  const status = Number(statusCode);
  if (!Number.isFinite(status)) return DELIVERY_RESULT.TRANSIENT;
  if (status === 200 || status === 201 || status === 202 || status === 204) return DELIVERY_RESULT.SUCCESS;
  if (status === 404 || status === 410) return DELIVERY_RESULT.EXPIRED;
  if (status === 429) return DELIVERY_RESULT.RATE_LIMITED;
  if (status >= 400 && status < 500) return DELIVERY_RESULT.BAD_REQUEST;
  return DELIVERY_RESULT.TRANSIENT;
}

/**
 * Aplica el desenlace de un envío al registro.
 *
 * Solo los fallos transitorios cuentan para el umbral. Un 429 es un límite
 * NUESTRO con el proveedor y un 400 es un defecto NUESTRO de payload o
 * cabeceras: ninguno de los dos es evidencia de que el dispositivo haya
 * desaparecido, así que no deben acercar la suscripción a su baja. Contarlos
 * haría que un error de programación fuera borrando suscripciones válidas.
 *
 * @returns {{result: string, disabled: boolean}}
 */
export function applyDeliveryOutcome(record, { statusCode, error, now } = {}) {
  const result = classifyDeliveryResult({ statusCode, error });

  if (result === DELIVERY_RESULT.SUCCESS) {
    record.lastSuccessAt = now;
    record.failureCount = 0;
    record.updatedAt = now;
    return { result, disabled: false };
  }

  if (result === DELIVERY_RESULT.EXPIRED) {
    revokeSubscription(record, {
      now,
      reason: Number(statusCode) === 404
        ? PUSH_DISABLED_REASON.EXPIRED_404
        : PUSH_DISABLED_REASON.EXPIRED_410
    });
    return { result, disabled: true };
  }

  if (result === DELIVERY_RESULT.TRANSIENT) {
    record.failureCount = Number(record.failureCount || 0) + 1;
    record.updatedAt = now;
    if (record.failureCount >= MAX_CONSECUTIVE_FAILURES) {
      revokeSubscription(record, { now, reason: PUSH_DISABLED_REASON.TOO_MANY_FAILURES });
      return { result, disabled: true };
    }
    return { result, disabled: false };
  }

  // RATE_LIMITED y BAD_REQUEST: se registran, no se penaliza la suscripción.
  record.updatedAt = now;
  return { result, disabled: false };
}

/**
 * Lo único que puede salir por la API.
 *
 * Sin endpoint y sin claves, ni siquiera hacia su propietario: devolverlos no
 * le sirve de nada a una persona y multiplica los sitios desde los que pueden
 * escaparse.
 */
export function publicSubscriptionView(record) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSeenAt: record.lastSeenAt,
    active: isActive(record)
  };
}
