/**
 * Cobertura de traslados programados — SAFE-TRANSPORT-1D. PURO: sin base de
 * datos, sin red, sin reloj propio.
 *
 * Principio de producto que este módulo custodia: el pasajero SOLICITA un
 * conductor preferido; SOLO el consentimiento explícito del conductor crea el
 * compromiso. Nada aquí asigna: se decide quién es elegible, quién puede
 * recibir la siguiente oferta y si dos compromisos chocan en el tiempo.
 *
 * La elegibilidad para compromisos programados NO es la del despacho
 * inmediato: a 72 horas de la recogida no tiene sentido exigir socket vivo,
 * GPS fresco ni radio de 15 km. Aquí cuentan la aprobación, la cuenta activa,
 * el opt-in explícito, el vehículo y la ausencia de choque horario. Los 12
 * filtros de DISPATCH-2 quedan intactos para lo suyo.
 */

const VALORES_ENTEROS = (valor, porDefecto, minimo) => {
  const n = Number(String(valor ?? '').trim());
  if (!Number.isFinite(n) || n < minimo) return porDefecto;
  return Math.floor(n);
};

/**
 * Ventana de compromiso alrededor de la recogida. Conservadora y FIJA para el
 * MVP (sin estimar duraciones reales): quince minutos antes para llegar, una
 * hora después para servir el traslado.
 */
export function resolveCommitmentWindow(env = process.env) {
  return Object.freeze({
    beforeMs: VALORES_ENTEROS(env.SAFE_TRANSPORT_COMMITMENT_BEFORE_MS, 15 * 60_000, 60_000),
    afterMs: VALORES_ENTEROS(env.SAFE_TRANSPORT_COMMITMENT_AFTER_MS, 60 * 60_000, 60_000)
  });
}

/** TTL de cada oferta de respaldo y techo de ofertas por ocurrencia. */
export function resolveBackupOfferPolicy(env = process.env) {
  return Object.freeze({
    offerTtlMs: VALORES_ENTEROS(env.SAFE_TRANSPORT_BACKUP_OFFER_TTL_MS, 10 * 60_000, 60_000),
    maxOffers: VALORES_ENTEROS(env.SAFE_TRANSPORT_MAX_BACKUP_OFFERS, 5, 1),
    // DRIVER-FINANCE-1 v5: cuantos candidatos EN ORDEN se piden para poder
    // confirmar con la base cual puede de verdad. No cambia el ranking: solo
    // permite saltar a quien la autoridad rechaza, en vez de dejar que una
    // copia vieja del documento excluya a alguien valido para siempre.
    authoritativeCandidatePool: VALORES_ENTEROS(env.SAFE_TRANSPORT_BACKUP_CANDIDATE_POOL, 5, 1)
  });
}

/** [inicio, fin) del bloqueo horario que impone una recogida comprometida. */
export function commitmentSpan(pickupUtcMs, window) {
  return { startMs: pickupUtcMs - window.beforeMs, endMs: pickupUtcMs + window.afterMs };
}

export function spansOverlap(a, b) {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * ¿Chocan dos recogidas para el mismo conductor? Determinista y simétrico.
 */
export function commitmentsConflict(pickupA, pickupB, window) {
  return spansOverlap(commitmentSpan(pickupA, window), commitmentSpan(pickupB, window));
}

export const vehicleCompatible = (ride, driver) =>
  !ride.vehiclePreference || String(driver?.vehicleType || 'MOTO') === ride.vehiclePreference;

/**
 * Elegibilidad para PARTICIPAR en traslados programados. Devuelve un código
 * de rechazo o null. `committedPickupsMs` son las recogidas ya comprometidas
 * del conductor (solo futuras y PLANNED — las calcula quien llama).
 */
export function scheduledEligibilityDefect(driver, ride, { committedPickupsMs = [], window } = {}) {
  if (!driver || driver.role !== 'driver') return 'NOT_A_DRIVER';
  if (!driver.isVerified || driver.status === 'SUSPENDED') return 'DRIVER_NOT_APPROVED';
  if (driver.accountStatus === 'DISABLED') return 'ACCOUNT_DISABLED';
  if (driver.acceptsScheduledRides !== true) return 'NOT_OPTED_IN';
  if (!vehicleCompatible(ride, driver)) return 'VEHICLE_MISMATCH';
  const pickup = Date.parse(ride.scheduledPickupAt);
  if (!Number.isFinite(pickup)) return 'INVALID_PICKUP_AT';
  if (window && committedPickupsMs.some(otro => commitmentsConflict(pickup, otro, window))) {
    return 'SCHEDULE_CONFLICT';
  }
  return null;
}

/**
 * Candidatos de respaldo: acotados y DETERMINISTAS. Sin GPS y sin ranking por
 * cercanía a propósito — ordenar por proximidad exigiría acercar coordenadas
 * sensibles a un grupo amplio; el orden estable por identificador reparte las
 * ofertas de forma reproducible y no expone nada.
 */
export function selectBackupCandidates(drivers, ride, {
  excludedIds = [],
  committedPickupsByDriver = new Map(),
  window,
  limit = 10
} = {}) {
  const excluidos = new Set(excludedIds);
  return (Array.isArray(drivers) ? drivers : [])
    .filter(driver => driver?.id && !excluidos.has(driver.id))
    .filter(driver => scheduledEligibilityDefect(driver, ride, {
      committedPickupsMs: committedPickupsByDriver.get(driver.id) ?? [],
      window
    }) === null)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .slice(0, limit);
}

/**
 * Zona aproximada para la OFERTA (antes del consentimiento): la cuadrícula de
 * dos decimales (~1,1 km) orienta al conductor sin entregar la puerta de la
 * casa. La dirección exacta solo existe tras aceptar, por la vía autenticada.
 */
export function approximateZone(lugar) {
  if (!lugar || !Number.isFinite(Number(lugar.lat)) || !Number.isFinite(Number(lugar.lng))) return null;
  return {
    approxLat: Math.round(Number(lugar.lat) * 100) / 100,
    approxLng: Math.round(Number(lugar.lng) * 100) / 100
  };
}

/**
 * La oferta que VE el conductor antes de consentir: fecha, hora, dirección
 * del trayecto, vehículo y zonas aproximadas. JAMÁS dirección exacta,
 * coordenadas precisas, teléfono ni perfil del pasajero.
 */
export function offerViewForDriver(ride) {
  return {
    rideId: ride.id,
    direction: ride.direction,
    localDate: ride.localDate,
    localTime: ride.localTime,
    scheduledPickupAt: ride.scheduledPickupAt,
    vehiclePreference: ride.vehiclePreference ?? null,
    kind: ride.currentOffer?.kind ?? null,
    offeredAt: ride.currentOffer?.offeredAt ?? null,
    expiresAt: ride.currentOffer?.expiresAt ?? null,
    pickupZone: approximateZone(ride.pickup),
    destinationZone: approximateZone(ride.destination)
  };
}
