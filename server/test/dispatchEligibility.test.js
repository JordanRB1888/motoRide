import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPATCH_REJECTION,
  evaluateDriverEligibility,
  selectEligibleDrivers
} from '../domain/dispatchEligibility.js';

const NOW = 1_800_000_000_000;
const pickup = { lat: 10.6427, lng: -71.6125 };
const trip = { id: 'trip_dispatch', rideType: 'MOTO', excludedDriverIds: [] };
const distance = (a, b, c, d) => Math.hypot(a - c, b - d) * 100;

function driver(overrides = {}) {
  return {
    id: 'driver_1',
    role: 'driver',
    isVerified: true,
    accountStatus: 'ACTIVE',
    status: 'AVAILABLE',
    vehicleType: 'MOTO',
    location: { lat: 10.643, lng: -71.613, updatedAt: NOW - 1_000 },
    ...overrides
  };
}

function select(drivers, { registry = new Map(drivers.map(item => [item.id, `socket:${item.id}`])), active = new Set() } = {}) {
  return selectEligibleDrivers({
    drivers,
    trip,
    pickup,
    driverRegistry: registry,
    activeTripForDriver: id => active.has(id) ? { id: `active:${id}` } : null,
    calculateDistance: distance,
    maxRadiusKm: 15,
    maxLocationAgeMs: 120_000,
    now: NOW
  });
}

test('A: conductor conectado, disponible y con GPS válido es elegible', () => {
  const result = select([driver()]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].driver.id, 'driver_1');
});

test('B: conductor offline no recibe solicitudes', () => {
  const result = select([driver({ status: 'OFFLINE' })]);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejectionCounts[DISPATCH_REJECTION.OFFLINE], 1);
});

test('C: ubicación ausente, inválida o vencida produce rechazo determinista', () => {
  const base = {
    driver: driver(), trip, pickup, hasSocket: true, hasActiveTrip: false,
    calculateDistance: distance, maxRadiusKm: 15, maxLocationAgeMs: 120_000, now: NOW
  };
  assert.equal(evaluateDriverEligibility({ ...base, driver: driver({ location: null }) }).reason, DISPATCH_REJECTION.NO_LOCATION);
  assert.equal(evaluateDriverEligibility({ ...base, driver: driver({ location: { lat: NaN, lng: -71.61, updatedAt: NOW } }) }).reason, DISPATCH_REJECTION.NO_LOCATION);
  assert.equal(evaluateDriverEligibility({ ...base, driver: driver({ location: { lat: 10.64, lng: -71.61, updatedAt: NOW - 120_001 } }) }).reason, DISPATCH_REJECTION.STALE_LOCATION);
});

test('D: al restaurarse el registro socket, el mismo conductor vuelve a ser elegible', () => {
  const candidate = driver();
  assert.equal(select([candidate], { registry: new Map() }).rejectionCounts[DISPATCH_REJECTION.NO_SOCKET], 1);
  assert.equal(select([candidate], { registry: new Map([[candidate.id, 'socket:nuevo']]) }).candidates.length, 1);
});

test('E: dos conductores disponibles se ordenan del más cercano al más lejano', () => {
  const far = driver({ id: 'driver_far', location: { lat: 10.69, lng: -71.66, updatedAt: NOW } });
  const near = driver({ id: 'driver_near', location: { lat: 10.643, lng: -71.613, updatedAt: NOW } });
  const result = select([far, near]);
  assert.deepEqual(result.candidates.map(item => item.driver.id), ['driver_near', 'driver_far']);
});

test('F: un conductor busy o con viaje activo queda fuera del matching', () => {
  const busy = driver({ id: 'driver_busy', status: 'BUSY' });
  const active = driver({ id: 'driver_active' });
  const result = select([busy, active], { active: new Set([active.id]) });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejectionCounts[DISPATCH_REJECTION.BUSY], 1);
  assert.equal(result.rejectionCounts[DISPATCH_REJECTION.ACTIVE_TRIP], 1);
});

test('G: cero elegibles solo se informa cuando todos tienen una causa real de rechazo', () => {
  const result = select([
    driver({ id: 'offline', status: 'OFFLINE' }),
    driver({ id: 'far', location: { lat: 11.2, lng: -72.2, updatedAt: NOW } }),
    driver({ id: 'wrong-role', role: 'passenger' })
  ]);
  assert.equal(result.candidates.length, 0);
  assert.deepEqual(result.rejectionCounts, {
    OFFLINE: 1,
    OUT_OF_RADIUS: 1,
    ROLE_MISMATCH: 1
  });
});
