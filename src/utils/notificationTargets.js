/**
 * A dónde lleva una notificación cuando se toca.
 *
 * La regla es una sola: el aviso concreto manda sobre su categoría. Un aviso
 * que no lleva a ninguna parte (un anuncio, un mensaje del sistema) devuelve
 * null y la tarjeta no promete navegación — ni chevron, ni cursor de enlace.
 *
 * Los destinos son los nombres de pestaña que YA usa cada app: el pasajero
 * navega con handleNavigation, el conductor con switchTab y la
 * administración con su propio switchTab.
 */

const DESTINO_POR_CATEGORIA = {
  passenger: {
    SAFE_TRANSPORT: 'transporte-seguro',
    FINANCE: 'wallet',
    TRIP: 'home'
  },
  driver: {
    SAFE_TRANSPORT: 'traslados-seguros',
    FINANCE: 'ganancias',
    TRIP: 'inicio'
  },
  admin: {
    FINANCE: 'finances',
    TRIP: 'dashboard',
    SUPPORT: 'support'
  }
};

const DESTINO_POR_EVENTO = {
  passenger: {
    // Sin saldo el plan se detiene: lo que la clienta necesita es recargar,
    // no volver a mirar su agenda.
    subscription_suspended_payment: 'wallet'
  }
};

/**
 * @param {{category?: string, event?: string}} notification
 * @param {string} role rol de quien la recibe (passenger | driver | admin)
 * @returns {string|null} pestaña de destino, o null si el aviso es informativo
 */
export function resolveNotificationTarget(notification, role) {
  if (!notification || !role) return null;
  const porEvento = DESTINO_POR_EVENTO[role]?.[notification.event];
  if (porEvento) return porEvento;
  return DESTINO_POR_CATEGORIA[role]?.[notification.category] ?? null;
}
