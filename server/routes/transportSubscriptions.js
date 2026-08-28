import express from 'express';
import { createIdentityLimiter, CUARTO_DE_HORA } from '../services/httpRateLimit.js';
import { PaginationError, parseLimit, paginate } from '../domain/pagination.js';

/**
 * API del traslado seguro para el PASAJERO — SAFE-TRANSPORT-1C.
 *
 * Contrato:
 *  - Detrás de la bandera SAFE_TRANSPORT_ENABLED: apagada, la API entera
 *    responde 404 y no revela su existencia.
 *  - Solo pasajeros autenticados; el dueño sale del token. El mismo 404 cubre
 *    «no existe» y «no es tuya»: no se sondean suscripciones ajenas.
 *  - Los conductores NO tienen nada aquí (SAFE-1D les dará lo suyo).
 *  - Toda lista es acotada: rango temporal máximo y paginación con techo.
 */

export function createTransportSubscriptionsRouter({
  safeTransport,
  requireAuth,
  requirePassenger
} = {}) {
  if (!safeTransport) throw new Error('TRANSPORT_ROUTER_REQUIRES_SERVICE');
  if (typeof requireAuth !== 'function') throw new Error('TRANSPORT_ROUTER_REQUIRES_AUTH');
  if (typeof requirePassenger !== 'function') throw new Error('TRANSPORT_ROUTER_REQUIRES_ROLE');

  const router = express.Router();

  // Apagada, la funcionalidad no existe: ni para sondear su presencia.
  router.use('/transport', (_req, res, next) => {
    if (!safeTransport.enabled) return res.status(404).json({ error: 'NOT_FOUND' });
    next();
  });

  const lecturas = createIdentityLimiter({ name: 'traslado-seguro', limit: 120, windowMs: CUARTO_DE_HORA });
  const escrituras = createIdentityLimiter({ name: 'traslado-seguro-escritura', limit: 30, windowMs: CUARTO_DE_HORA });

  const responder = (res, resultado, status = 200) => resultado.ok
    ? res.status(status).json({ subscription: resultado.subscription })
    : res.status(resultado.status).json({ error: resultado.code });

  router.post('/transport/subscriptions', requireAuth, requirePassenger, escrituras, async (req, res) => {
    responder(res, await safeTransport.createSubscription(req.user, req.body ?? {}), 201);
  });

  router.get('/transport/subscriptions', requireAuth, requirePassenger, lecturas, (req, res) => {
    res.json({ subscriptions: safeTransport.listSubscriptions(req.user) });
  });

  router.get('/transport/subscriptions/:id', requireAuth, requirePassenger, lecturas, (req, res) => {
    const suscripcion = safeTransport.getSubscription(req.user, req.params.id);
    if (!suscripcion) return res.status(404).json({ error: 'SUBSCRIPTION_NOT_FOUND' });
    res.json({ subscription: suscripcion });
  });

  router.patch('/transport/subscriptions/:id', requireAuth, requirePassenger, escrituras, async (req, res) => {
    responder(res, await safeTransport.updateSubscription(req.user, req.params.id, req.body ?? {}));
  });

  // Ciclo de vida explícito. La cancelación es LÓGICA: el documento queda con
  // status=CANCELLED (el borrado físico pertenece a la política de retención
  // y borrado de cuenta, documentada aparte).
  const transicion = destino => async (req, res) => {
    responder(res, await safeTransport.setSubscriptionStatus(req.user, req.params.id, destino));
  };
  router.post('/transport/subscriptions/:id/pause', requireAuth, requirePassenger, escrituras, transicion('PAUSED'));
  router.post('/transport/subscriptions/:id/resume', requireAuth, requirePassenger, escrituras, transicion('ACTIVE'));
  router.post('/transport/subscriptions/:id/cancel', requireAuth, requirePassenger, escrituras, transicion('CANCELLED'));

  router.get('/transport/scheduled-rides', requireAuth, requirePassenger, lecturas, (req, res) => {
    let limite;
    try {
      limite = parseLimit(req.query.limit, { defaultLimit: 20, maxLimit: 50 });
    } catch (error) {
      if (error instanceof PaginationError) return res.status(400).json({ error: error.code });
      throw error;
    }

    const parsearInstante = valor => {
      if (valor === undefined || valor === '') return undefined;
      const ms = Date.parse(String(valor));
      return Number.isFinite(ms) ? ms : null;
    };
    const fromMs = parsearInstante(req.query.from);
    const toMs = parsearInstante(req.query.to);
    if (fromMs === null || toMs === null) return res.status(400).json({ error: 'INVALID_RANGE' });

    const lista = safeTransport.listScheduledRides(req.user, { fromMs, toMs });
    if (lista === null) return res.status(400).json({ error: 'INVALID_RANGE' });

    let pagina;
    try {
      pagina = paginate(lista, {
        limit: limite,
        cursor: typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : undefined,
        sortKeyOf: ride => ride.scheduledPickupAt
      });
    } catch (error) {
      if (error instanceof PaginationError) return res.status(400).json({ error: error.code });
      throw error;
    }
    // SAFE-1D: el pasajero ve su agenda y la identidad SEGURA del conductor
    // confirmado (lista blanca sin teléfono); la contabilidad de ofertas no.
    res.json({
      scheduledRides: pagina.items.map(ride => safeTransport.projectRideForPassenger(ride)),
      nextCursor: pagina.nextCursor,
      total: pagina.total
    });
  });

  return router;
}
