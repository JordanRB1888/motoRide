import express from 'express';
import { createIdentityLimiter, CUARTO_DE_HORA } from '../services/httpRateLimit.js';
import {
  PUSH_DISABLED_REASON,
  isActive,
  publicSubscriptionView,
  registerSubscription,
  revokeSubscription,
  validateSubscriptionInput
} from '../domain/pushSubscription.js';

/**
 * API de suscripciones de Web Push.
 *
 * Regla que gobierna el módulo entero: el propietario de una suscripción sale
 * SIEMPRE de `req.user.id`. No hay ninguna ruta que acepte un propietario en
 * el cuerpo. Si el cliente manda un `userId`, se descarta sin mirarlo: no se
 * compara con el del token, porque validarlo daría a entender que existe algún
 * caso en el que se acepta, y no lo hay.
 */

const limitadores = {
  // Un alta ocurre una vez por dispositivo y por reinstalación, no ciento
  // veinte veces por minuto: `notificaciones` sería demasiado holgado aquí.
  // Veinte cada cuarto de hora deja margen de sobra para reintentos legítimos.
  suscripciones: createIdentityLimiter({ name: 'suscripciones', limit: 20, windowMs: CUARTO_DE_HORA })
};

export function createPushRouter({
  database,
  persistHttp,
  requireAuth,
  pushService,
  publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || null
} = {}) {
  if (!database) throw new Error('PUSH_ROUTER_REQUIRES_DATABASE');
  if (typeof persistHttp !== 'function') throw new Error('PUSH_ROUTER_REQUIRES_PERSIST');
  if (typeof requireAuth !== 'function') throw new Error('PUSH_ROUTER_REQUIRES_AUTH');
  if (!pushService) throw new Error('PUSH_ROUTER_REQUIRES_SERVICE');

  const router = express.Router();
  const coleccion = () => {
    if (!Array.isArray(database.pushSubscriptions)) database.pushSubscriptions = [];
    return database.pushSubscriptions;
  };

  /**
   * Estado de la configuración y clave pública.
   *
   * Detrás de `requireAuth` aunque la clave sea pública por definición: solo
   * la necesita quien va a suscribirse, y eso exige sesión. Exponerla en
   * abierto no gana nada y regala un identificador del despliegue.
   *
   * Devolver `enabled` junto a la clave permite al cliente saber con UNA sola
   * petición que push está apagado, sin inventar un endpoint de banderas ni
   * interpretar un error como si fuera configuración.
   */
  router.get('/push/public-key', requireAuth, limitadores.suscripciones, (_req, res) => {
    const enabled = Boolean(pushService.enabled);
    res.json({ enabled, publicKey: enabled ? (publicKey || null) : null });
  });

  /**
   * Alta o actualización de una suscripción.
   *
   * Con la funcionalidad apagada se rechaza con 503 en vez de guardar. Un
   * endpoint almacenado sin nadie que envíe no aporta nada y sí acumula
   * material sensible; negarse es la opción que respeta la privacidad.
   */
  router.post('/push/subscriptions', requireAuth, limitadores.suscripciones, async (req, res) => {
    if (!pushService.enabled) return res.status(503).json({ error: 'PUSH_DISABLED' });

    const validacion = validateSubscriptionInput(req.body);
    if (!validacion.ok) return res.status(400).json({ error: 'INVALID_SUBSCRIPTION' });

    const coleccionActual = coleccion();
    const previo = coleccionActual.find(item => item.endpoint === validacion.value.endpoint);
    const instantanea = previo ? structuredClone(previo) : null;

    const { record, created } = registerSubscription(coleccionActual, {
      // El propietario viene del token. `req.body.userId`, si llega, ni se lee.
      userId: req.user.id,
      endpoint: validacion.value.endpoint,
      keys: validacion.value.keys,
      id: pushService.newSubscriptionId(),
      now: new Date().toISOString()
    });

    if (!await persistHttp(res)) {
      // Deshacer con exactitud: si la fila ya existía se restaura tal cual
      // estaba, y si es nueva se retira. Dejar a medias una suscripción
      // reasignada haría que el dueño en memoria no fuera el del disco.
      if (created) coleccionActual.splice(coleccionActual.indexOf(record), 1);
      else Object.assign(record, instantanea);
      return;
    }

    res.status(created ? 201 : 200).json(publicSubscriptionView(record));
  });

  /**
   * Baja de una suscripción propia.
   *
   * Deliberadamente NO se comprueba la bandera: revocar tiene que funcionar
   * siempre. Si apagar la funcionalidad impidiera darse de baja, alguien que
   * quisiera retirar su consentimiento no podría hacerlo justo cuando el
   * sistema está en mantenimiento.
   *
   * Baja lógica, no física: la fila se conserva con su motivo. Y el mismo 404
   * cubre «no existe» y «no es tuya», porque distinguirlos permitiría sondear
   * qué identificadores existen.
   */
  router.delete('/push/subscriptions/:id', requireAuth, limitadores.suscripciones, async (req, res) => {
    const registro = coleccion().find(item => item.id === req.params.id);
    if (!registro || registro.userId !== req.user.id || !isActive(registro)) {
      return res.status(404).json({ error: 'SUBSCRIPTION_NOT_FOUND' });
    }

    const instantanea = structuredClone(registro);
    revokeSubscription(registro, {
      now: new Date().toISOString(),
      reason: PUSH_DISABLED_REASON.USER_REVOKED
    });

    if (!await persistHttp(res)) {
      Object.assign(registro, instantanea);
      return;
    }

    res.status(204).end();
  });

  return router;
}
