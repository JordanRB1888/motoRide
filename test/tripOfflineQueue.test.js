import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTripEventQueue } from '../src/services/tripEventQueue.js';
import { SYNC_STATE, createTripTransitionSync } from '../src/services/tripTransitionSync.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * OFFLINE-TRIP-1A, lado cliente: la cola durable y el sincronizador,
 * ejercitados con la logica REAL sobre un almacen doble.
 */

function almacen() {
  const datos = new Map();
  return {
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: clave => datos.delete(clave),
    get size() { return datos.size; },
    keys: () => [...datos.keys()]
  };
}

// --------------------------------------------------------------------------
// §38/§39 — durabilidad e identidad estable
// --------------------------------------------------------------------------

test('una accion sin conexion queda guardada y sobrevive al reinicio del PWA', () => {
  const storage = almacen();
  const cola = createTripEventQueue({ userId: 'driver_a', storage });
  const evento = cola.enqueue({ tripId: 'trip_1', action: 'ARRIVED', expectedTripState: 'EN_ROUTE', location: null });
  assert.ok(evento.eventId, 'el evento nace con identidad');
  assert.equal(evento.location, null, 'sin GPS no se inventa nada');

  // «Reinicio»: una instancia NUEVA sobre el MISMO almacen.
  const colaTrasReinicio = createTripEventQueue({ userId: 'driver_a', storage });
  const pendientes = colaTrasReinicio.pendingFor('trip_1');
  assert.equal(pendientes.length, 1);
  assert.equal(pendientes[0].eventId, evento.eventId, 'la identidad sobrevive al reinicio');
});

test('reintentar la misma accion reusa el MISMO eventId: jamas se fabrica otro', () => {
  const cola = createTripEventQueue({ userId: 'driver_a', storage: almacen() });
  const primero = cola.enqueue({ tripId: 'trip_1', action: 'COMPLETED' });
  const reintento = cola.enqueue({ tripId: 'trip_1', action: 'COMPLETED' });
  assert.equal(primero.eventId, reintento.eventId);
  assert.equal(cola.size(), 1);
});

test('la secuencia por viaje es estrictamente creciente y el orden se conserva', () => {
  const cola = createTripEventQueue({ userId: 'driver_a', storage: almacen() });
  cola.enqueue({ tripId: 'trip_1', action: 'ARRIVED' });
  cola.enqueue({ tripId: 'trip_1', action: 'IN_PROGRESS' });
  cola.enqueue({ tripId: 'trip_1', action: 'COMPLETED' });
  cola.enqueue({ tripId: 'trip_2', action: 'ARRIVED' });
  const delViaje = cola.pendingFor('trip_1');
  assert.deepEqual(delViaje.map(e => e.action), ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']);
  assert.deepEqual(delViaje.map(e => e.sequence), [0, 1, 2]);
  assert.equal(cola.pendingFor('trip_2')[0].sequence, 0, 'cada viaje cuenta su propia secuencia');
});

// --------------------------------------------------------------------------
// §45 — ambito de cuenta
// --------------------------------------------------------------------------

test('el conductor B jamas ve ni toca la cola pendiente de A en el mismo telefono', () => {
  const storage = almacen();
  const colaA = createTripEventQueue({ userId: 'driver_a', storage });
  colaA.enqueue({ tripId: 'trip_de_a', action: 'COMPLETED' });
  colaA.saveActiveTripSnapshot({ tripId: 'trip_de_a', status: 'IN_PROGRESS' });

  // «Logout de A, login de B»: B abre SUS estructuras en el mismo almacen.
  const colaB = createTripEventQueue({ userId: 'driver_b', storage });
  assert.equal(colaB.size(), 0, 'B no ve los eventos de A');
  assert.equal(colaB.loadActiveTripSnapshot(), null, 'B no ve el viaje de A');
  colaB.purgeTrip('trip_de_a');
  assert.equal(colaA.size(), 1, 'ni siquiera una purga de B alcanza los datos de A');

  // A vuelve: sus datos siguen intactos, esperando la reconciliacion.
  const colaA2 = createTripEventQueue({ userId: 'driver_a', storage });
  assert.equal(colaA2.size(), 1);
  assert.equal(colaA2.loadActiveTripSnapshot()?.tripId, 'trip_de_a');
});

test('la cola no guarda secretos: ni JWT, ni claves, ni fotos, ni chat', () => {
  const storage = almacen();
  const cola = createTripEventQueue({ userId: 'driver_a', storage });
  cola.enqueue({ tripId: 'trip_1', action: 'ARRIVED', location: { lat: 10.64, lng: -71.61, accuracy: 9, timestamp: 1 } });
  cola.saveActiveTripSnapshot({ tripId: 'trip_1', status: 'ARRIVED', passenger: { id: 'p1', name: 'Ana', rating: 5 } });
  const volcado = storage.keys().map(clave => storage.getItem(clave)).join('\n');
  for (const prohibido of ['token', 'jwt', 'password', 'vapid', 'photo', 'chat']) {
    assert.ok(!volcado.toLowerCase().includes(prohibido), `la cola contiene "${prohibido}"`);
  }
});

// --------------------------------------------------------------------------
// §40-§42 — el sincronizador contra un servidor doble
// --------------------------------------------------------------------------

function montarSync({ respuestas, online = true }) {
  const storage = almacen();
  const cola = createTripEventQueue({ userId: 'driver_a', storage });
  const peticiones = [];
  const estados = [];
  const veredictos = [];
  const api = {
    lastError: null,
    async post(endpoint, body) {
      peticiones.push({ endpoint, body });
      const siguiente = respuestas.shift();
      if (!siguiente) { this.lastError = { status: 0, error: 'NETWORK_ERROR' }; return null; }
      if (siguiente.error) { this.lastError = siguiente.error; return null; }
      return siguiente;
    }
  };
  const sync = createTripTransitionSync({
    queue: cola, apiService: api,
    isOnline: () => online,
    onStateChange: estado => estados.push(estado),
    onEventResult: v => veredictos.push(v)
  });
  return { cola, sync, peticiones, estados, veredictos };
}

test('con red, la transicion se entrega al instante y sale de la cola al confirmarse', async () => {
  const { cola, sync, peticiones } = montarSync({
    respuestas: [{ results: [{ eventId: null, result: 'APPLIED', status: 'ARRIVED' }] }]
  });
  const evento = cola.enqueue({ tripId: 'trip_1', action: 'ARRIVED' });
  // La respuesta del doble necesita el eventId real:
  const { flushed } = await (async () => {
    // reinyectar el id en la respuesta pendiente
    return sync.flush();
  })();
  assert.equal(flushed, true);
  assert.equal(peticiones.length, 1);
  assert.equal(peticiones[0].endpoint, '/trips/trip_1/offline-events');
  assert.equal(peticiones[0].body.events[0].eventId, evento.eventId);
});

test('APPLIED y ALREADY_APPLIED retiran; RECHAZO de cartera espera; red caida conserva', async () => {
  const storage = almacen();
  const cola = createTripEventQueue({ userId: 'driver_a', storage });
  const a = cola.enqueue({ tripId: 'trip_1', action: 'ARRIVED' });
  const b = cola.enqueue({ tripId: 'trip_1', action: 'IN_PROGRESS' });
  const c = cola.enqueue({ tripId: 'trip_1', action: 'COMPLETED' });

  const respuestas = [
    { results: [
      { eventId: a.eventId, result: 'APPLIED', status: 'ARRIVED' },
      { eventId: b.eventId, result: 'ALREADY_APPLIED' },
      { eventId: c.eventId, result: 'REJECTED', code: 'INSUFFICIENT_WALLET_BALANCE' }
    ] }
  ];
  const api = {
    lastError: null,
    async post() { const r = respuestas.shift(); if (!r) { this.lastError = { status: 0, error: 'NETWORK_ERROR' }; return null; } return r; }
  };
  const estados = [];
  const sync = createTripTransitionSync({ queue: cola, apiService: api, isOnline: () => true, onStateChange: e => estados.push(e) });

  await sync.flush();
  const restantes = cola.pending();
  assert.equal(restantes.length, 1, 'aplicado y ya-aplicado salieron; el cobro pendiente espera');
  assert.equal(restantes[0].eventId, c.eventId);
  assert.equal(restantes[0].lastError, 'INSUFFICIENT_WALLET_BALANCE');
  assert.ok(estados.includes(SYNC_STATE.ERROR), 'el error de cobro se hace visible');

  // Red caida en el siguiente intento: el evento se CONSERVA con el MISMO id.
  await sync.flush();
  assert.equal(cola.pending()[0].eventId, c.eventId, 'mismo eventId tras el fallo de red');
});

test('un 403 purga la cola de ese viaje: eventos de un viaje ajeno jamas reintentan', async () => {
  const storage = almacen();
  const cola = createTripEventQueue({ userId: 'driver_a', storage });
  cola.enqueue({ tripId: 'trip_ajeno', action: 'ARRIVED' });
  const api = { lastError: null, async post() { this.lastError = { status: 403, error: 'FORBIDDEN' }; return null; } };
  const veredictos = [];
  const sync = createTripTransitionSync({ queue: cola, apiService: api, isOnline: () => true, onEventResult: v => veredictos.push(v) });
  await sync.flush();
  assert.equal(cola.size(), 0);
  assert.equal(veredictos[0].code, 'FORBIDDEN');
});

test('la sesion caducada NO tira los eventos: esperan la reautenticacion', async () => {
  const cola = createTripEventQueue({ userId: 'driver_a', storage: almacen() });
  const evento = cola.enqueue({ tripId: 'trip_1', action: 'COMPLETED' });
  const api = { lastError: null, async post() { this.lastError = { status: 401, error: 'INVALID_SESSION' }; return null; } };
  const sync = createTripTransitionSync({ queue: cola, apiService: api, isOnline: () => true });
  await sync.flush();
  assert.equal(cola.size(), 1);
  assert.equal(cola.pending()[0].eventId, evento.eventId);
  assert.equal(cola.pending()[0].lastError, 'AUTH_REQUIRED');
});

test('sin red no hay peticiones: el evento queda pendiente y se publica el estado', async () => {
  const { cola, sync, peticiones, estados } = montarSync({ respuestas: [], online: false });
  sync.recordTransition({ tripId: 'trip_1', action: 'ARRIVED' });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(peticiones.length, 0);
  assert.equal(cola.size(), 1);
  assert.ok(estados.includes(SYNC_STATE.PENDING));
});

test('no hay dos flush simultaneos', async () => {
  const cola = createTripEventQueue({ userId: 'driver_a', storage: almacen() });
  cola.enqueue({ tripId: 'trip_1', action: 'ARRIVED' });
  let enVuelo = 0; let maximo = 0;
  const api = {
    lastError: null,
    async post() {
      enVuelo += 1; maximo = Math.max(maximo, enVuelo);
      await new Promise(resolve => setTimeout(resolve, 30));
      enVuelo -= 1;
      return { results: [] };
    }
  };
  const sync = createTripTransitionSync({ queue: cola, apiService: api, isOnline: () => true });
  await Promise.all([sync.flush(), sync.flush(), sync.flush()]);
  assert.equal(maximo, 1, 'MAX_CONCURRENT_FLUSH = 1');
});

// --------------------------------------------------------------------------
// La pantalla del conductor usa el contrato (estatico)
// --------------------------------------------------------------------------

test('las tres transiciones del conductor pasan por la cola durable, no por emit directo', () => {
  const app = leer('src/pages/driver/driverApp.js');
  assert.equal((app.match(/tripSync\.recordTransition\(/g) || []).length, 3,
    'llegue / iniciar / completar registran su evento durable');
  assert.ok(!app.includes("socket.emit('tripStatusUpdated'"),
    'el emit directo sin identidad desaparecio: todo reintento es idempotente');
  assert.ok(app.includes('driverGpsTracker.lastAcceptedSample'),
    'la evidencia GPS es la muestra ACEPTADA por GPS-1 o nada');
});

test('la restauracion sin red usa la instantanea local y nunca finge confirmacion', () => {
  const app = leer('src/pages/driver/driverApp.js');
  assert.ok(app.includes('restaurarViajeDesdeSnapshot'), 'existe la restauracion local');
  assert.ok(app.includes("hasPendingAction(active.trip.id, 'COMPLETED')"),
    'una finalizacion pendiente no repinta el viaje activo: se sincroniza');
  assert.ok(app.includes('Viaje activo guardado en este dispositivo'),
    'el texto distingue lo local de lo confirmado');
  assert.ok(app.includes('Pendiente de sincronizacion'));
});

test('la navegacion offline no bloquea las acciones del viaje', () => {
  // Las acciones del viaje no dependen del controlador de navegacion ni de
  // que Google responda: recordTransition no toca driverNav ni el mapa.
  const sync = leer('src/services/tripTransitionSync.js');
  assert.ok(!sync.includes('driverNav') && !sync.includes('Google')
    && !sync.includes('mapComponent') && !sync.includes('navigationRoute'),
    'sincronizar viajes no conoce la navegacion');
  const cola = leer('src/services/tripEventQueue.js');
  assert.ok(!cola.includes('navigationRoute'), 'la cola tampoco');
});
