import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkRecoveryController } from '../src/services/networkRecoveryController.js';

class EventTargetFake {
  constructor() { this.listeners = new Map(); this.visibilityState = 'visible'; }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatch(name) { for (const fn of this.listeners.get(name) || []) fn({ type: name }); }
  count(name) { return this.listeners.get(name)?.size || 0; }
}

function harness({ connected = false, online = true } = {}) {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const win = new EventTargetFake();
  const doc = new EventTargetFake();
  const connection = new EventTargetFake();
  const navigatorRef = { onLine: online, connection };
  const recoveries = [];
  const states = [];
  const client = {
    authenticated: true,
    connected,
    opening: false,
    isAuthenticated() { return this.authenticated; },
    isConnected() { return this.connected; },
    isOpeningOrReconnecting() { return this.opening; },
    performRecovery(payload) { recoveries.push(payload); },
    publishState(state, trigger) { states.push({ state, trigger }); },
    logLifecycle() {}
  };
  const controller = new NetworkRecoveryController({
    client, windowRef: win, navigatorRef, documentRef: doc,
    clock: () => now,
    setTimer: fn => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimer: id => timers.delete(id),
    cooldownMs: 100,
    watchdogMs: 1000
  });
  return {
    controller, client, win, doc, connection, navigatorRef, recoveries, states,
    advance(ms) { now += ms; },
    fireTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    timerCount() { return timers.size; }
  };
}

test('A/B: tras perder y recuperar red se inicia una sola reconexión', () => {
  const h = harness({ connected: true });
  h.controller.start();
  h.client.connected = false;
  h.navigatorRef.onLine = false;
  h.win.dispatch('offline');
  h.controller.socketDisconnected();
  h.advance(200);
  h.navigatorRef.onLine = true;
  h.win.dispatch('online');
  assert.deepEqual(h.recoveries, [{ trigger: 'network_online', hardReset: true }]);
  assert.equal(h.states.at(-1).state, 'RECONNECTING');
});

test('C: watchdog reinicia un Manager atascado en CONNECTING una sola vez', () => {
  const h = harness();
  h.client.opening = true;
  h.controller.start();
  h.controller.socketDisconnected();
  h.advance(1000);
  h.fireTimers();
  assert.deepEqual(h.recoveries, [{ trigger: 'socket_watchdog', hardReset: true }]);
  assert.equal(h.timerCount(), 0);
});

test('D: REST GPS sano activa recuperación sin tormenta', () => {
  const h = harness();
  h.controller.start();
  h.controller.socketDisconnected();
  h.controller.restBecameHealthy();
  h.controller.restBecameHealthy();
  h.controller.restBecameHealthy();
  assert.equal(h.recoveries.length, 1);
  assert.equal(h.recoveries[0].trigger, 'gps_rest_healthy');
});

test('E: volver visible después del cambio recupera la conexión', () => {
  const h = harness();
  h.controller.start();
  h.controller.socketDisconnected();
  h.advance(200);
  h.doc.dispatch('visibilitychange');
  assert.equal(h.recoveries.length, 1);
  assert.equal(h.recoveries[0].trigger, 'visibility_visible');
});

test('F: eventos repetidos conservan un listener y una recuperación', () => {
  const h = harness();
  h.controller.start();
  h.controller.start();
  h.controller.socketDisconnected();
  h.win.dispatch('online');
  h.win.dispatch('focus');
  h.win.dispatch('pageshow');
  h.connection.dispatch('change');
  assert.equal(h.win.count('online'), 1);
  assert.equal(h.win.count('focus'), 1);
  assert.equal(h.recoveries.length, 1);
});

test('G/H: offline no reconecta y online solo queda RECONNECTING hasta confirmación', () => {
  const h = harness({ online: false });
  h.controller.start();
  h.controller.socketDisconnected();
  h.controller.restBecameHealthy();
  assert.equal(h.recoveries.length, 0);
  assert.equal(h.states.at(-1).state, 'OFFLINE');
  h.navigatorRef.onLine = true;
  h.advance(200);
  h.win.dispatch('online');
  assert.equal(h.states.at(-1).state, 'RECONNECTING');
  assert.notEqual(h.states.at(-1).state, 'CONNECTED');
});

test('J: conexión restaurada limpia watchdog y permite un nuevo ciclo', () => {
  const h = harness();
  h.controller.start();
  h.controller.socketDisconnected();
  assert.equal(h.timerCount(), 1);
  h.controller.socketConnected();
  assert.equal(h.timerCount(), 0);
  h.advance(200);
  h.client.connected = false;
  h.controller.socketDisconnected();
  h.controller.restBecameHealthy();
  assert.equal(h.recoveries.length, 1);
});
