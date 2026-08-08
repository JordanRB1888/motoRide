export const TRIP_STATUS = Object.freeze({
  SEARCHING: 'SEARCHING',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
});

const aliases = Object.freeze({
  PENDING: TRIP_STATUS.SEARCHING,
  ACCEPTED: TRIP_STATUS.DRIVER_ASSIGNED,
  EN_ROUTE: TRIP_STATUS.DRIVER_ASSIGNED,
  DRIVER_ARRIVING: TRIP_STATUS.DRIVER_ASSIGNED,
  DRIVER_ARRIVED: TRIP_STATUS.ARRIVED,
  IN_TRIP: TRIP_STATUS.IN_PROGRESS
});

const transitions = Object.freeze({
  [TRIP_STATUS.SEARCHING]: new Set([TRIP_STATUS.DRIVER_ASSIGNED, TRIP_STATUS.CANCELLED]),
  [TRIP_STATUS.DRIVER_ASSIGNED]: new Set([TRIP_STATUS.ARRIVED, TRIP_STATUS.CANCELLED]),
  [TRIP_STATUS.ARRIVED]: new Set([TRIP_STATUS.IN_PROGRESS, TRIP_STATUS.CANCELLED]),
  [TRIP_STATUS.IN_PROGRESS]: new Set([TRIP_STATUS.COMPLETED, TRIP_STATUS.CANCELLED]),
  [TRIP_STATUS.COMPLETED]: new Set(),
  [TRIP_STATUS.CANCELLED]: new Set()
});

export function normalizeTripStatus(status) {
  return aliases[status] || status;
}

export function canTransitionTrip(from, to) {
  const normalizedFrom = normalizeTripStatus(from);
  const normalizedTo = normalizeTripStatus(to);
  return normalizedFrom === normalizedTo || Boolean(transitions[normalizedFrom]?.has(normalizedTo));
}

export function transitionTrip(trip, nextStatus, metadata = {}) {
  const normalizedNext = normalizeTripStatus(nextStatus);
  if (!canTransitionTrip(trip.status, normalizedNext)) {
    const error = new Error(`INVALID_TRIP_TRANSITION:${trip.status}->${normalizedNext}`);
    error.code = 'INVALID_TRIP_TRANSITION';
    throw error;
  }
  const now = new Date().toISOString();
  trip.status = normalizedNext;
  trip.updatedAt = now;
  trip.statusHistory = [...(trip.statusHistory || []), { status: normalizedNext, at: now, ...metadata }];
  if (normalizedNext === TRIP_STATUS.DRIVER_ASSIGNED) trip.acceptedAt ||= now;
  if (normalizedNext === TRIP_STATUS.IN_PROGRESS) trip.startedAt ||= now;
  if ([TRIP_STATUS.COMPLETED, TRIP_STATUS.CANCELLED].includes(normalizedNext)) trip.closedAt ||= now;
  return trip;
}
