/**
 * Adaptador real de Web Push.
 *
 * Es la unica pieza del proyecto que habla con un proveedor de push. Su
 * responsabilidad es estrecha a proposito: configurar VAPID, traducir nuestro
 * documento de suscripcion al formato de la libreria, enviar el payload ya
 * minimizado y NORMALIZAR la respuesta. Ninguna decision de negocio vive aqui:
 * ni elegibilidad, ni viajes, ni cuando dar de baja una suscripcion. Eso lo
 * sigue decidiendo `pushNotificationService` con su clasificacion de siempre.
 *
 * ---------------------------------------------------------------------------
 * Por que la normalizacion no es un detalle
 * ---------------------------------------------------------------------------
 *
 * `web-push` resuelve con `{ statusCode }` solo en 2xx. Para CUALQUIER otro
 * codigo --404, 410, 429, 400, 500-- RECHAZA con un `WebPushError`.
 *
 * Si ese rechazo se dejara subir tal cual, `pushNotificationService` lo veria
 * como `error` y lo clasificaria TRANSIENT, porque asi trata cualquier fallo
 * lanzado. Consecuencia: un 410 --la unica senal fiable de que el dispositivo
 * desaparecio-- no daria de baja la suscripcion nunca, y las filas muertas se
 * acumularian reintentandose hasta agotar el umbral.
 *
 * Ademas `WebPushError` arrastra `endpoint`, `headers` y `body`: material
 * sensible que no puede acabar en una traza.
 *
 * Por eso aqui el rechazo del proveedor se convierte en `{ statusCode }`, que
 * es exactamente lo que el clasificador existente sabe interpretar. Solo los
 * fallos de red de verdad --sin codigo de estado-- siguen lanzando, y lo hacen
 * con un codigo escueto.
 */

import webpush from 'web-push';

/**
 * Cuanto tiempo debe guardar el proveedor un aviso que no se pudo entregar.
 *
 * La ventana de oferta del despacho es de quince segundos: pasado ese tiempo la
 * carrera ya se ofrecio a otro. Un aviso entregado horas despues diria «tienes
 * una nueva solicitud» sobre un viaje que hace mucho que no existe. Un minuto
 * da margen a un telefono que estuvo un momento sin cobertura y deja morir lo
 * que llegaria tarde.
 */
export const PUSH_TTL_SEGUNDOS = 60;

const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

/** Los codigos son escuetos: nunca llevan material de clave dentro. */
export const WEB_PUSH_CONFIG_ERROR = Object.freeze({
  PUBLIC_KEY_MISSING: 'WEB_PUSH_VAPID_PUBLIC_KEY_MISSING',
  PRIVATE_KEY_MISSING: 'WEB_PUSH_VAPID_PRIVATE_KEY_MISSING',
  SUBJECT_MISSING: 'WEB_PUSH_VAPID_SUBJECT_MISSING',
  INVALID: 'WEB_PUSH_VAPID_INVALID'
});

/**
 * Comprueba la configuracion VAPID sin tocar la red.
 *
 * Falla cerrado y con un codigo, nunca con el valor: un mensaje de error que
 * incluyera la clave privada acabaria en los registros de Railway.
 */
export function validateVapidConfig({ publicKey, privateKey, subject } = {}) {
  const limpio = (valor) => (typeof valor === 'string' ? valor.trim() : '');

  const publica = limpio(publicKey);
  const privada = limpio(privateKey);
  const asunto = limpio(subject);

  if (!publica) throw new Error(WEB_PUSH_CONFIG_ERROR.PUBLIC_KEY_MISSING);
  if (!privada) throw new Error(WEB_PUSH_CONFIG_ERROR.PRIVATE_KEY_MISSING);
  if (!asunto) throw new Error(WEB_PUSH_CONFIG_ERROR.SUBJECT_MISSING);

  if (!BASE64URL.test(publica) || !BASE64URL.test(privada)) {
    throw new Error(WEB_PUSH_CONFIG_ERROR.INVALID);
  }

  // La especificacion de VAPID exige que el asunto identifique a quien envia,
  // y `web-push` solo admite estas dos formas.
  const asuntoValido = asunto.startsWith('mailto:')
    ? asunto.length > 'mailto:'.length
    : /^https:\/\/[^\s]+$/.test(asunto);
  if (!asuntoValido) throw new Error(WEB_PUSH_CONFIG_ERROR.INVALID);

  return { publicKey: publica, privateKey: privada, subject: asunto };
}

/** Segundos de `Retry-After`, si el proveedor los mando de forma utilizable. */
function leerRetryAfterMs(cabeceras) {
  const valor = cabeceras?.['retry-after'] ?? cabeceras?.['Retry-After'];
  const segundos = Number(valor);
  if (!Number.isFinite(segundos) || segundos < 0) return null;
  return Math.round(segundos * 1000);
}

/**
 * Codigo seguro de un fallo de red.
 *
 * Solo `code` o `name`. El `message` de un error de red puede arrastrar la URL
 * completa, y esa URL ES el endpoint.
 */
function codigoSeguro(fallo) {
  const codigo = fallo?.code || fallo?.name;
  return typeof codigo === 'string' && codigo !== '' ? codigo : 'WEB_PUSH_SEND_FAILED';
}

/**
 * @param {object} opciones
 * @param {string} opciones.publicKey
 * @param {string} opciones.privateKey  NUNCA sale de aqui
 * @param {string} opciones.subject
 * @param {object} [opciones.webPushClient]  inyectable para las pruebas
 * @param {object} [opciones.logger]
 * @returns {(envio: {endpoint: string, keys: object, payload: object}) => Promise<{statusCode: number, retryAfterMs?: number|null}>}
 */
export function createWebPushSender({
  publicKey,
  privateKey,
  subject,
  webPushClient = webpush,
  logger = console,
  ttlSegundos = PUSH_TTL_SEGUNDOS
} = {}) {
  const config = validateVapidConfig({ publicKey, privateKey, subject });

  // Se configura UNA vez, al construir. Si la libreria se queja, se traduce a
  // un codigo propio: su mensaje podria citar el valor rechazado.
  try {
    webPushClient.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch {
    throw new Error(WEB_PUSH_CONFIG_ERROR.INVALID);
  }

  return async function enviar({ endpoint, keys, payload } = {}) {
    const suscripcion = {
      endpoint,
      keys: { p256dh: keys?.p256dh, auth: keys?.auth }
    };

    try {
      const respuesta = await webPushClient.sendNotification(
        suscripcion,
        // El payload llega ya minimizado desde el servicio: version, tipo e
        // identificador de enrutado. Aqui solo se serializa; este modulo no
        // anade ni un campo.
        JSON.stringify(payload),
        { TTL: ttlSegundos, urgency: 'high' }
      );
      return { statusCode: Number(respuesta?.statusCode) };
    } catch (fallo) {
      const estado = Number(fallo?.statusCode);

      // El proveedor SI respondio, con un codigo que no es 2xx. Se devuelve
      // como resultado --no como excepcion-- para que la clasificacion de
      // siempre haga su trabajo: 404 y 410 dan de baja, 429 no penaliza, 4xx
      // es defecto propio y 5xx es transitorio.
      if (Number.isFinite(estado)) {
        return { statusCode: estado, retryAfterMs: leerRetryAfterMs(fallo?.headers) };
      }

      // Fallo de red de verdad. Se relanza con un codigo escueto: ni el
      // endpoint, ni el cuerpo de la respuesta, ni la traza original.
      logger.warn?.('[+58express Push] fallo de red al enviar');
      throw new Error(codigoSeguro(fallo));
    }
  };
}
