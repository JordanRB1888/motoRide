import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRestartPersistence,
  selectRuntimeStartupLine,
  POSTGRES_BACKEND_LINE,
  SQLITE_BACKEND_LINE
} from '../scripts/restartPersistenceWatcher.js';

const PEDIDO = '2026-08-23T10:10:00.000Z';
const ARRANQUE = '2026-08-23T10:10:42.000Z';
const SALUD = '2026-08-23T10:10:55.000Z';

const RECUENTOS = Object.freeze({
  users: 19, trips: 82, notifications: 26, messages: 34, supportMessages: 11,
  settings: 1, transactions: 22, driverApplications: 2, driverDocuments: 16, adminActions: 7
});

/** Evidencia de un reinicio sano; cada prueba altera solo lo que examina. */
function evidencia(cambios = {}) {
  return {
    restartRequestedAt: PEDIDO,
    deploymentIdBefore: '9ed1356d-9f55-4819-9154-67549c36611d',
    deploymentIdAfter: '9ed1356d-9f55-4819-9154-67549c36611d',
    runtimeStartedAt: ARRANQUE,
    runtimeBackendLine: POSTGRES_BACKEND_LINE,
    healthStatus: 200,
    healthCheckedAt: SALUD,
    postgresReachable: true,
    volumeMounted: true,
    postgresCounts: { ...RECUENTOS },
    expectedCounts: { ...RECUENTOS },
    socketReady: true,
    timedOut: false,
    ...cambios
  };
}

test('1 · identificador de despliegue nuevo con runtime sano: PASA', () => {
  const r = evaluateRestartPersistence(evidencia({
    deploymentIdAfter: '25b21202-35f2-4a4a-8f3a-cf985b7fcdd7'
  }));
  assert.deepEqual(r.reasons, []);
  assert.equal(r.status, 'PASS');
  assert.equal(r.case, 'A');
});

test('2 · mismo identificador con arranque PostgreSQL posterior: PASA', () => {
  // Este es exactamente el escenario que tumbó el segundo cutover.
  const r = evaluateRestartPersistence(evidencia());
  assert.deepEqual(r.reasons, []);
  assert.equal(r.status, 'PASS');
  assert.equal(r.case, 'B');
});

test('3 · mismo identificador pero solo logs anteriores al reinicio: FALLA', () => {
  const r = evaluateRestartPersistence(evidencia({
    runtimeStartedAt: '2026-08-23T10:00:58.230Z'   // anterior a la peticion
  }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.reasons.includes('STALE_RUNTIME_LOG'));
});

test('4 · sin runtime sano tras el reinicio: FALLA', () => {
  const r = evaluateRestartPersistence(evidencia({ healthStatus: 502 }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.reasons.includes('HEALTH_NOT_200'));
});

test('5 · el runtime arranca en SQLite: FALLA', () => {
  const r = evaluateRestartPersistence(evidencia({ runtimeBackendLine: SQLITE_BACKEND_LINE }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.reasons.includes('RUNTIME_STARTED_SQLITE'));
});

test('6 · PostgreSQL inalcanzable tras el reinicio: FALLA', () => {
  const r = evaluateRestartPersistence(evidencia({ postgresReachable: false }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.reasons.includes('POSTGRES_UNAVAILABLE'));
});

test('7 · los recuentos de PostgreSQL cambian tras el reinicio: FALLA', () => {
  const r = evaluateRestartPersistence(evidencia({
    postgresCounts: { ...RECUENTOS, trips: 81 }
  }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.reasons.some(m => m.startsWith('POSTGRES_COUNTS_MISMATCH')));
  assert.ok(r.reasons.some(m => m.includes('trips:82->81')));
});

test('8 · tiempo agotado de verdad: FALLA', () => {
  const r = evaluateRestartPersistence(evidencia({
    timedOut: true, runtimeStartedAt: null, deploymentIdAfter: ''
  }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.reasons.includes('TIMED_OUT'));
});

/* --------------------------------------------------------------------------
   La puerta es cerrada por defecto: lo que falta no se supone.
   -------------------------------------------------------------------------- */

test('sin momento de peticion de reinicio no se puede distinguir un log rancio', () => {
  const r = evaluateRestartPersistence(evidencia({ restartRequestedAt: null }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.reasons.includes('MISSING_RESTART_REQUESTED_AT'));
});

test('una evidencia vacia nunca pasa', () => {
  const r = evaluateRestartPersistence({});
  assert.equal(r.status, 'FAIL');
  assert.equal(r.case, null);
  assert.ok(r.reasons.length >= 5);
});

test('la salud medida antes del arranque nuevo no vale', () => {
  // El proceso viejo tambien responde 200: sin orden temporal no prueba nada.
  const r = evaluateRestartPersistence(evidencia({
    healthCheckedAt: '2026-08-23T10:10:10.000Z'   // posterior al pedido, anterior al arranque
  }));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.reasons.includes('HEALTH_CHECKED_BEFORE_RUNTIME'));
});

test('el volumen y el socket tambien son obligatorios', () => {
  assert.ok(evaluateRestartPersistence(evidencia({ volumeMounted: false })).reasons.includes('VOLUME_NOT_MOUNTED'));
  assert.ok(evaluateRestartPersistence(evidencia({ socketReady: false })).reasons.includes('SOCKET_NOT_READY'));
});

test('selectRuntimeStartupLine descarta los arranques anteriores al reinicio', () => {
  const lineas = [
    { timestamp: '2026-08-23T10:00:58.230Z', message: POSTGRES_BACKEND_LINE },
    { timestamp: '2026-08-23T10:10:42.000Z', message: POSTGRES_BACKEND_LINE }
  ];
  const elegida = selectRuntimeStartupLine(lineas, PEDIDO);
  assert.equal(elegida.timestamp, '2026-08-23T10:10:42.000Z');

  const soloRancias = selectRuntimeStartupLine([lineas[0]], PEDIDO);
  assert.equal(soloRancias, null);
});
