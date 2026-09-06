/**
 * El emisor compuesto: un `sender` para el servicio, varios transportes detrás.
 *
 *   pushNotificationService
 *   └── pushSender (esto)
 *       ├── webPushSender   navegadores, VAPID
 *       └── fcmSender       teléfonos, FCM V1
 *
 * POR QUÉ NO SE TOCA EL SERVICIO
 *
 * `pushNotificationService` sabe de suscripciones, de idempotencia, de listas
 * blancas y de dar de baja lo muerto. No sabe --ni debe-- que existen dos
 * proveedores. Le sigue llegando un único `sender`; que ese `sender` reparta
 * por transporte es asunto de este fichero y de nadie más.
 *
 * UN TRANSPORTE SIN EMISOR NO ES UN FALLO DEL DISPOSITIVO
 *
 * Si hay suscripciones de navegador pero VAPID no está configurado --o al
 * revés-- ese envío no se intenta y se dice por qué. Devolverlo como error lo
 * clasificaría transitorio y acabaría dando de baja dispositivos perfectamente
 * vivos por una carencia de configuración nuestra. Por eso vuelve como
 * `omitido`, que el servicio registra sin tocar el contador de fallos.
 */

export const TRANSPORTE = Object.freeze({
  WEB_PUSH: 'webpush',
  FCM: 'fcm'
});

/** Las filas antiguas no traen transporte: son de navegador. */
export function transporteDe(suscripcion) {
  return suscripcion?.transport === TRANSPORTE.FCM ? TRANSPORTE.FCM : TRANSPORTE.WEB_PUSH;
}

export function crearSenderCompuesto({ webpush = null, fcm = null } = {}) {
  const emisores = {
    [TRANSPORTE.WEB_PUSH]: typeof webpush === 'function' ? webpush : null,
    [TRANSPORTE.FCM]: typeof fcm === 'function' ? fcm : null
  };
  const transportes = Object.entries(emisores).filter(([, s]) => s).map(([t]) => t);

  const sender = async function enviar(suscripcion = {}) {
    const transporte = transporteDe(suscripcion);
    const emisor = emisores[transporte];
    if (!emisor) return { omitido: 'SIN_EMISOR_PARA_TRANSPORTE', transporte };
    return emisor(suscripcion);
  };

  return {
    sender: transportes.length ? sender : null,
    enabled: transportes.length > 0,
    transportes
  };
}
