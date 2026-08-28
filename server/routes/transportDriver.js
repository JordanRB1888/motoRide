import express from 'express';
import { createIdentityLimiter, CUARTO_DE_HORA } from '../services/httpRateLimit.js';

/**
 * API del traslado seguro para el CONDUCTOR — SAFE-TRANSPORT-1D.
 *
 * Contrato:
 *  - Detrás de la MISMA bandera que el resto del traslado seguro: apagada,
 *    nada de esto existe (404).
 *  - Solo conductores APROBADOS y autenticados; la identidad sale del token.
 *  - El consentimiento es EXPLÍCITO: participar exige encender el opt-in, y
 *    cada compromiso nace de un accept del propio conductor. Nada aquí
 *    permite a un pasajero, a un administrador ni a un campo guardado forzar
 *    una asignación.
 *  - Antes de aceptar, la oferta NO lleva dirección exacta ni datos del
 *    pasajero; tras aceptar, la ruta operativa llega por su vía autenticada.
 *  - Sin tablón global: cada conductor ve SOLO sus ofertas y SUS compromisos.
 */

export function createTransportDriverRouter({
  safeTransport,
  requireAuth,
  requireApprovedDriver
} = {}) {
  if (!safeTransport) throw new Error('TRANSPORT_DRIVER_ROUTER_REQUIRES_SERVICE');
  if (typeof requireAuth !== 'function') throw new Error('TRANSPORT_DRIVER_ROUTER_REQUIRES_AUTH');
  if (typeof requireApprovedDriver !== 'function') throw new Error('TRANSPORT_DRIVER_ROUTER_REQUIRES_ROLE');

  const router = express.Router();

  router.use('/transport', (_req, res, next) => {
    if (!safeTransport.enabled) return res.status(404).json({ error: 'NOT_FOUND' });
    next();
  });

  const lecturas = createIdentityLimiter({ name: 'traslado-seguro-conductor', limit: 120, windowMs: CUARTO_DE_HORA });
  const escrituras = createIdentityLimiter({ name: 'traslado-seguro-conductor-escritura', limit: 60, windowMs: CUARTO_DE_HORA });

  // Piloto controlado (1G): segunda llave del servidor. Fuera del piloto, el
  // mismo 404 invisible: sin pistas de que exista un piloto ni de sus cuentas.
  const soloPiloto = (req, res, next) => {
    if (!safeTransport.hasPilotAccess(req.user)) return res.status(404).json({ error: 'NOT_FOUND' });
    next();
  };

  router.get('/transport/driver/preferences', requireAuth, requireApprovedDriver, soloPiloto, lecturas, (req, res) => {
    res.json({ preferences: safeTransport.getDriverPreferences(req.user) });
  });

  router.patch('/transport/driver/preferences', requireAuth, requireApprovedDriver, soloPiloto, escrituras, async (req, res) => {
    const resultado = await safeTransport.setDriverPreferences(req.user, req.body ?? {});
    if (!resultado.ok) return res.status(resultado.status).json({ error: resultado.code });
    res.json({ preferences: resultado.preferences });
  });

  router.get('/transport/driver/offers', requireAuth, requireApprovedDriver, soloPiloto, lecturas, (req, res) => {
    res.json({ offers: safeTransport.listDriverOffers(req.user) });
  });

  router.get('/transport/driver/commitments', requireAuth, requireApprovedDriver, soloPiloto, lecturas, (req, res) => {
    res.json({ commitments: safeTransport.listDriverCommitments(req.user) });
  });

  const accion = metodo => async (req, res) => {
    const resultado = await safeTransport[metodo](req.user, req.params.id);
    if (!resultado.ok) return res.status(resultado.status).json({ error: resultado.code });
    res.json(resultado.commitment ? { commitment: resultado.commitment } : { ok: true });
  };
  router.post('/transport/scheduled-rides/:id/accept', requireAuth, requireApprovedDriver, soloPiloto, escrituras, accion('acceptScheduledRide'));
  router.post('/transport/scheduled-rides/:id/decline', requireAuth, requireApprovedDriver, soloPiloto, escrituras, accion('declineScheduledRide'));
  router.post('/transport/scheduled-rides/:id/withdraw', requireAuth, requireApprovedDriver, soloPiloto, escrituras, accion('withdrawFromScheduledRide'));

  return router;
}
