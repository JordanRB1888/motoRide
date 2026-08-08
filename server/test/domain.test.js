import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFare } from '../domain/pricingService.js';
import { canTransitionTrip, transitionTrip } from '../domain/tripStateMachine.js';

test('la máquina de estados acepta el flujo válido y rechaza saltos', () => {
  const trip = { status: 'SEARCHING' };
  transitionTrip(trip, 'ACCEPTED');
  assert.equal(trip.status, 'DRIVER_ASSIGNED');
  assert.equal(canTransitionTrip(trip.status, 'COMPLETED'), false);
  assert.throws(() => transitionTrip(trip, 'COMPLETED'), /INVALID_TRIP_TRANSITION/);
});

test('la tarifa conserva instantánea USD, VES y recargos', () => {
  const fare = calculateFare(
    { distanceKm: 5, durationMin: 12, requestedAt: '2026-08-08T22:00:00-04:00' },
    { bcvRate: 150, nightMultiplier: 1.2 }
  );
  assert.equal(fare.isNight, true);
  assert.equal(fare.fareVES, fare.fareUSD * 150);
  assert.ok(fare.fareUSD >= 2.5);
});

test('el automóvil usa una tarifa mayor que la moto para la misma ruta', () => {
  const route = { distanceKm: 6, durationMin: 15, requestedAt: '2026-08-08T14:00:00-04:00' };
  const moto = calculateFare({ ...route, rideType: 'MOTO' });
  const car = calculateFare({ ...route, rideType: 'CAR' });
  assert.equal(moto.rideType, 'MOTO');
  assert.equal(car.rideType, 'CAR');
  assert.ok(car.fareUSD > moto.fareUSD);
  assert.ok(car.fareUSD >= 3.5);
});
