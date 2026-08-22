export const DISPATCH_REJECTION = Object.freeze({
  OFFLINE: 'OFFLINE',
  NO_SOCKET: 'NO_SOCKET',
  NO_LOCATION: 'NO_LOCATION',
  OUT_OF_RADIUS: 'OUT_OF_RADIUS',
  NOT_APPROVED: 'NOT_APPROVED',
  BUSY: 'BUSY',
  ACTIVE_TRIP: 'ACTIVE_TRIP',
  INVALID_STATUS: 'INVALID_STATUS',
  STALE_LOCATION: 'STALE_LOCATION',
  ROLE_MISMATCH: 'ROLE_MISMATCH',
  VEHICLE_MISMATCH: 'VEHICLE_MISMATCH',
  EXCLUDED: 'EXCLUDED'
});

const KNOWN_STATUSES = new Set(['AVAILABLE', 'BUSY', 'IN_TRIP', 'OFFLINE']);

export function evaluateDriverEligibility({
  driver,
  trip,
  pickup,
  hasSocket,
  hasActiveTrip = false,
  calculateDistance,
  maxRadiusKm,
  maxLocationAgeMs,
  now = Date.now()
}) {
  if (driver?.role !== 'driver') return { eligible: false, reason: DISPATCH_REJECTION.ROLE_MISMATCH };
  if (driver.isVerified !== true || driver.accountStatus === 'DISABLED' || driver.status === 'SUSPENDED') {
    return { eligible: false, reason: DISPATCH_REJECTION.NOT_APPROVED };
  }
  if (!KNOWN_STATUSES.has(driver.status)) return { eligible: false, reason: DISPATCH_REJECTION.INVALID_STATUS };
  if (driver.status === 'OFFLINE') return { eligible: false, reason: DISPATCH_REJECTION.OFFLINE };
  if (driver.status === 'BUSY') return { eligible: false, reason: DISPATCH_REJECTION.BUSY };
  if (driver.status === 'IN_TRIP' || hasActiveTrip) return { eligible: false, reason: DISPATCH_REJECTION.ACTIVE_TRIP };
  if (!hasSocket) return { eligible: false, reason: DISPATCH_REJECTION.NO_SOCKET };
  if ((driver.vehicleType || 'MOTO') !== (trip.rideType || 'MOTO')) {
    return { eligible: false, reason: DISPATCH_REJECTION.VEHICLE_MISMATCH };
  }
  if ((trip.excludedDriverIds || []).includes(driver.id)) {
    return { eligible: false, reason: DISPATCH_REJECTION.EXCLUDED };
  }
  if (!Number.isFinite(driver.location?.lat) || !Number.isFinite(driver.location?.lng)) {
    return { eligible: false, reason: DISPATCH_REJECTION.NO_LOCATION };
  }
  const updatedAt = Number(driver.location.updatedAt);
  if (!Number.isFinite(updatedAt) || now - updatedAt > maxLocationAgeMs) {
    return { eligible: false, reason: DISPATCH_REJECTION.STALE_LOCATION };
  }
  const distanceKm = calculateDistance(pickup.lat, pickup.lng, driver.location.lat, driver.location.lng);
  if (!Number.isFinite(distanceKm) || distanceKm > maxRadiusKm) {
    return { eligible: false, reason: DISPATCH_REJECTION.OUT_OF_RADIUS };
  }
  return { eligible: true, distanceKm };
}

export function selectEligibleDrivers({
  drivers,
  trip,
  pickup,
  driverRegistry,
  activeTripForDriver,
  calculateDistance,
  maxRadiusKm = 15,
  maxLocationAgeMs = 120_000,
  now = Date.now()
}) {
  const candidates = [];
  const rejectionCounts = {};

  for (const driver of drivers) {
    const result = evaluateDriverEligibility({
      driver,
      trip,
      pickup,
      hasSocket: driverRegistry.has(driver.id),
      hasActiveTrip: Boolean(activeTripForDriver(driver.id)),
      calculateDistance,
      maxRadiusKm,
      maxLocationAgeMs,
      now
    });
    if (result.eligible) candidates.push({ driver, dist: result.distanceKm });
    else rejectionCounts[result.reason] = (rejectionCounts[result.reason] || 0) + 1;
  }

  candidates.sort((left, right) => left.dist - right.dist);
  return { candidates, rejectionCounts };
}
