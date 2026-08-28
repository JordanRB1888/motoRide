import test from 'node:test';
import assert from 'node:assert/strict';
import { localTimeToUtc } from '../domain/scheduleCalendar.js';
import {
  COVERAGE_WINDOWS,
  classifyCoverageTiming,
  createSafeTransportService,
  isSafeTransportEnabled,
  resolveMaterializerIntervalMs
} from '../services/safeTransport.js';

/**
 * SAFE-TRANSPORT-1C — el materializador y el ciclo de vida, con el servicio
 * REAL y sin red: base en memoria, persistencia falsa y reloj inyectado.
 *
 * La propiedad que estas pruebas custodian: materializar es IDEMPOTENTE y
 * reconciliador — repetir, solapar o duplicar la invocación converge siempre
 * al mismo conjunto de ocurrencias, y ninguna ocurrencia comprometida se toca.
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };

// Lunes 2026-08-31 a las 00:00 de Caracas. Horizonte de 72 h: lun+mar+mié.
const LUNES = localTimeToUtc('2026-08-31', '00:00', 'America/Caracas');

const PASAJERO = Object.freeze({ id: 'p1', role: 'passenger' });

const cuerpoValido = () => ({
  route: {
    home: { lat: 10.64, lng: -71.61, address: 'Casa' },
    worksite: { lat: 10.69, lng: -71.63, address: 'Centro comercial' }
  },
  pattern: {
    weekdays: [1, 2, 3, 4, 5],
    outbound: { time: '07:00' },
    return: { time: '17:00' },
    timezone: 'America/Caracas'
  }
});

function crearEntorno({ nowMs = LUNES, persistImpl } = {}) {
  const database = { transportSubscriptions: [], scheduledRides: [] };
  const reloj = { ms: nowMs };
  const escrituras = [];
  const servicio = createSafeTransportService({
    database,
    persistRecord: persistImpl ?? (async (tabla, doc) => { escrituras.push(`${tabla}:${doc.id}`); return true; }),
    enabled: true,
    now: () => reloj.ms,
    logger: silencioso
  });
  return { database, servicio, reloj, escrituras };
}

const clavesDe = database => database.scheduledRides.map(r => r.occurrenceKey).sort();

// --------------------------------------------------------------------------
// Materialización básica
// --------------------------------------------------------------------------

test('base vacia: la pasada no crea nada y no falla', async () => {
  const { servicio, database } = crearEntorno();
  const resumen = await servicio.runSafeTransportMaterialization();
  assert.deepEqual(database.scheduledRides, []);
  assert.equal(resumen.subscriptionsSeen, 0);
  assert.equal(resumen.created + resumen.errors + resumen.invalidSubscriptions, 0);
});

test('una suscripcion L-V genera sus 6 ocurrencias de 72 h al crearse', async () => {
  const { servicio, database } = crearEntorno();
  const alta = await servicio.createSubscription(PASAJERO, cuerpoValido());
  assert.equal(alta.ok, true);
  const sub = alta.subscription;
  assert.equal(sub.passengerId, 'p1');
  assert.equal(sub.status, 'ACTIVE');
  assert.equal(database.scheduledRides.length, 6);
  assert.deepEqual(clavesDe(database), [
    `${sub.id}:2026-08-31:OUTBOUND`, `${sub.id}:2026-08-31:RETURN`,
    `${sub.id}:2026-09-01:OUTBOUND`, `${sub.id}:2026-09-01:RETURN`,
    `${sub.id}:2026-09-02:OUTBOUND`, `${sub.id}:2026-09-02:RETURN`
  ].sort());
  const lunes = database.scheduledRides.find(r => r.occurrenceKey.endsWith('2026-08-31:OUTBOUND'));
  assert.equal(lunes.scheduledPickupAt, '2026-08-31T11:00:00.000Z', '07:00 Caracas = 11:00 UTC');
  assert.equal(lunes.assignmentStatus, 'UNASSIGNED');
  assert.equal(lunes.serviceStatus, 'PLANNED');
  assert.equal(lunes.tripId, null);
  assert.equal(lunes.timeline[0].event, 'MATERIALIZED');
});

test('la ida va casa→trabajo y la vuelta trabajo→casa', async () => {
  const { servicio, database } = crearEntorno();
  await servicio.createSubscription(PASAJERO, cuerpoValido());
  const ida = database.scheduledRides.find(r => r.direction === 'OUTBOUND');
  const vuelta = database.scheduledRides.find(r => r.direction === 'RETURN');
  assert.equal(ida.pickup.address, 'Casa');
  assert.equal(ida.destination.address, 'Centro comercial');
  assert.equal(vuelta.pickup.address, 'Centro comercial');
  assert.equal(vuelta.destination.address, 'Casa');
});

test('IDEMPOTENCIA: correr dos veces mas — cero duplicados, cero cambios', async () => {
  const { servicio, database } = crearEntorno();
  await servicio.createSubscription(PASAJERO, cuerpoValido());
  const antes = clavesDe(database);
  const r1 = await servicio.runSafeTransportMaterialization();
  const r2 = await servicio.runSafeTransportMaterialization();
  assert.equal(r1.created + r2.created, 0);
  assert.equal(r1.rescheduled + r2.rescheduled, 0);
  assert.deepEqual(clavesDe(database), antes);
});

test('IDEMPOTENCIA: la doble invocacion «paralela» converge (cola en serie)', async () => {
  const { servicio, database } = crearEntorno();
  const cuerpo = cuerpoValido();
  const [alta, pasada] = await Promise.all([
    servicio.createSubscription(PASAJERO, cuerpo),
    servicio.runSafeTransportMaterialization()
  ]);
  assert.equal(alta.ok, true);
  assert.ok(pasada);
  const [r1, r2] = await Promise.all([
    servicio.runSafeTransportMaterialization(),
    servicio.runSafeTransportMaterialization()
  ]);
  assert.equal(database.scheduledRides.length, 6, 'ni una ocurrencia duplicada');
  assert.equal(r1.created + r2.created, 0);
  const claves = database.scheduledRides.map(r => r.occurrenceKey);
  assert.equal(new Set(claves).size, claves.length);
});

test('el candado FINAL es la base: si la escritura la rechaza, la memoria se revierte', async () => {
  // Simula al «otro proceso» ganando la carrera del UNIQUE de occurrence_key:
  // la persistencia devuelve false y el documento no puede quedarse en memoria.
  let rechazarRides = true;
  const { servicio, database } = crearEntorno({
    persistImpl: async tabla => !(tabla === 'scheduledRides' && rechazarRides)
  });
  const alta = await servicio.createSubscription(PASAJERO, cuerpoValido());
  assert.equal(alta.ok, true, 'la suscripcion si se guarda');
  assert.equal(database.scheduledRides.length, 0, 'ningun fantasma en memoria');

  rechazarRides = false;
  const resumen = await servicio.runSafeTransportMaterialization();
  assert.equal(resumen.created, 6, 'la siguiente pasada converge');
  assert.equal(database.scheduledRides.length, 6);
});

test('una persistencia que LANZA no tumba la pasada: cuenta el fallo y sigue', async () => {
  let explotar = true;
  const { servicio, database } = crearEntorno({
    persistImpl: async tabla => {
      if (tabla === 'scheduledRides' && explotar) throw new Error('boom');
      return true;
    }
  });
  await servicio.createSubscription(PASAJERO, cuerpoValido());
  assert.equal(database.scheduledRides.length, 0);
  explotar = false;
  const resumen = await servicio.runSafeTransportMaterialization();
  assert.equal(resumen.created, 6);
});

test('el solapamiento del intervalo se SALTA, no se encola', async () => {
  const { servicio } = crearEntorno();
  await servicio.createSubscription(PASAJERO, cuerpoValido());
  const [a, b] = await Promise.all([servicio.tick(), servicio.tick()]);
  // Una de las dos pasadas corre; la otra devuelve null por solapamiento.
  assert.equal([a, b].filter(x => x === null).length, 1);
  assert.equal(servicio.skippedOverlaps(), 1);
});

// --------------------------------------------------------------------------
// Pausas, excepciones y ediciones de agenda (reconciliación)
// --------------------------------------------------------------------------

test('una pausa cancela LOGICAMENTE los dias cubiertos; quitarla los revive', async () => {
  const { servicio, database } = crearEntorno();
  const { subscription } = await servicio.createSubscription(PASAJERO, cuerpoValido());

  const edicion = await servicio.updateSubscription(PASAJERO, subscription.id, {
    pauses: [{ from: '2026-09-01', to: '2026-09-02', reason: 'vacaciones' }]
  });
  assert.equal(edicion.ok, true);
  const canceladas = database.scheduledRides.filter(r => r.serviceStatus === 'CANCELLED_SCHEDULE_CHANGE');
  assert.equal(canceladas.length, 4, 'martes y miercoles, ida y vuelta');
  assert.ok(canceladas.every(r => r.localDate !== '2026-08-31'));
  assert.equal(database.scheduledRides.length, 6, 'cancelar es un estado, no un borrado');

  await servicio.updateSubscription(PASAJERO, subscription.id, { pauses: [] });
  assert.equal(database.scheduledRides.filter(r => r.serviceStatus === 'PLANNED').length, 6);
  assert.equal(database.scheduledRides.length, 6, 'revividas con la MISMA clave: cero duplicados');
  const revivida = database.scheduledRides.find(r => r.localDate === '2026-09-01');
  assert.ok(revivida.timeline.some(e => e.event === 'REVIVED'));
});

test('la excepcion skip retira UN dia', async () => {
  const { servicio, database } = crearEntorno();
  const { subscription } = await servicio.createSubscription(PASAJERO, cuerpoValido());
  await servicio.updateSubscription(PASAJERO, subscription.id, {
    exceptions: [{ date: '2026-09-01', skip: true }]
  });
  const delMartes = database.scheduledRides.filter(r => r.localDate === '2026-09-01');
  assert.equal(delMartes.length, 2);
  assert.ok(delMartes.every(r => r.serviceStatus === 'CANCELLED_SCHEDULE_CHANGE'));
});

test('cambiar la hora conserva la MISMA occurrenceKey: reprograma, no duplica', async () => {
  const { servicio, database } = crearEntorno();
  const { subscription } = await servicio.createSubscription(PASAJERO, cuerpoValido());
  const clave = `${subscription.id}:2026-09-01:OUTBOUND`;
  const antes = database.scheduledRides.find(r => r.occurrenceKey === clave);
  assert.equal(antes.scheduledPickupAt, '2026-09-01T11:00:00.000Z');

  await servicio.updateSubscription(PASAJERO, subscription.id, {
    exceptions: [{ date: '2026-09-01', outboundTime: '08:30' }]
  });

  const despues = database.scheduledRides.filter(r => r.occurrenceKey === clave);
  assert.equal(despues.length, 1, 'la clave es identidad: jamas dos documentos');
  assert.equal(despues[0].id, antes.id, 'es EL MISMO documento');
  assert.equal(despues[0].scheduledPickupAt, '2026-09-01T12:30:00.000Z');
  assert.equal(despues[0].localTime, '08:30');
  assert.ok(despues[0].timeline.some(e => e.event === 'RESCHEDULED'));
  assert.equal(database.scheduledRides.length, 6);
});

test('editar los weekdays cancela lo que sobra del futuro PLANNED', async () => {
  const { servicio, database } = crearEntorno();
  const { subscription } = await servicio.createSubscription(PASAJERO, cuerpoValido());
  await servicio.updateSubscription(PASAJERO, subscription.id, {
    pattern: { weekdays: [1] } // solo lunes; hora y zona se conservan
  });
  const planned = database.scheduledRides.filter(r => r.serviceStatus === 'PLANNED');
  assert.deepEqual([...new Set(planned.map(r => r.localDate))], ['2026-08-31']);
  assert.equal(database.scheduledRides.filter(r => r.serviceStatus === 'CANCELLED_SCHEDULE_CHANGE').length, 4);
});

test('una ocurrencia COMPROMETIDA es intocable para la reconciliacion', async () => {
  const { servicio, database } = crearEntorno();
  const { subscription } = await servicio.createSubscription(PASAJERO, cuerpoValido());
  const comprometida = database.scheduledRides.find(r => r.localDate === '2026-09-01' && r.direction === 'OUTBOUND');
  // SAFE-1D existira algun dia: simula un conductor ya confirmado.
  comprometida.assignmentStatus = 'DRIVER_CONFIRMED';

  await servicio.updateSubscription(PASAJERO, subscription.id, { pattern: { weekdays: [1] } });
  assert.equal(comprometida.serviceStatus, 'PLANNED', 'ni cancelada…');
  assert.equal(comprometida.assignmentStatus, 'DRIVER_CONFIRMED', '…ni tocada');

  await servicio.updateSubscription(PASAJERO, subscription.id, {
    pattern: { weekdays: [1, 2] },
    exceptions: [{ date: '2026-09-01', outboundTime: '09:45' }]
  });
  assert.equal(comprometida.scheduledPickupAt, '2026-09-01T11:00:00.000Z', 'tampoco se reprograma');
});

test('effectiveFrom se respeta al materializar', async () => {
  const { servicio, database } = crearEntorno();
  const cuerpo = { ...cuerpoValido(), effectiveFrom: '2026-09-02' };
  const alta = await servicio.createSubscription(PASAJERO, cuerpo);
  assert.equal(alta.ok, true);
  assert.deepEqual([...new Set(database.scheduledRides.map(r => r.localDate))], ['2026-09-02']);
});

// --------------------------------------------------------------------------
// Ciclo de vida de la suscripción
// --------------------------------------------------------------------------

test('PAUSED no materializa nada nuevo y retira lo futuro libre; reanudar revive', async () => {
  const { servicio, database } = crearEntorno();
  const { subscription } = await servicio.createSubscription(PASAJERO, cuerpoValido());

  const pausa = await servicio.setSubscriptionStatus(PASAJERO, subscription.id, 'PAUSED');
  assert.equal(pausa.ok, true);
  assert.ok(database.scheduledRides.every(r => r.serviceStatus === 'CANCELLED_SUBSCRIPTION_PAUSED'));
  const resumen = await servicio.runSafeTransportMaterialization();
  assert.equal(resumen.created + resumen.revived, 0);

  const reanudar = await servicio.setSubscriptionStatus(PASAJERO, subscription.id, 'ACTIVE');
  assert.equal(reanudar.ok, true);
  assert.equal(database.scheduledRides.filter(r => r.serviceStatus === 'PLANNED').length, 6);
  assert.equal(database.scheduledRides.length, 6, 'revividas, no duplicadas');
});

test('CANCELLED no materializa nada y la suscripcion queda (borrado logico)', async () => {
  const { servicio, database } = crearEntorno();
  const { subscription } = await servicio.createSubscription(PASAJERO, cuerpoValido());
  const baja = await servicio.setSubscriptionStatus(PASAJERO, subscription.id, 'CANCELLED');
  assert.equal(baja.ok, true);
  assert.ok(database.scheduledRides.every(r => r.serviceStatus === 'CANCELLED_SUBSCRIPTION_INACTIVE'));
  assert.equal((await servicio.runSafeTransportMaterialization()).created, 0);
  assert.equal(database.transportSubscriptions.length, 1, 'el documento no se borra en 1C');
  // Y sobre una cancelada no se edita ni se transiciona.
  assert.equal((await servicio.updateSubscription(PASAJERO, subscription.id, { pauses: [] })).code, 'SUBSCRIPTION_CANCELLED');
  assert.equal((await servicio.setSubscriptionStatus(PASAJERO, subscription.id, 'ACTIVE')).code, 'INVALID_STATUS_TRANSITION');
});

test('una suscripcion invalida se ignora y se cuenta: no crea, no cancela, no tumba', async () => {
  const { servicio, database } = crearEntorno();
  await servicio.createSubscription(PASAJERO, cuerpoValido());
  database.transportSubscriptions.push({ id: 'tsub_rota', passengerId: 'p9', status: 'ACTIVE' });
  const resumen = await servicio.runSafeTransportMaterialization();
  assert.equal(resumen.invalidSubscriptions, 1);
  assert.equal(resumen.errors, 0);
  assert.equal(database.scheduledRides.length, 6, 'la sana sigue integra');
});

// --------------------------------------------------------------------------
// Autoridad del servidor y techo del MVP
// --------------------------------------------------------------------------

test('el cuerpo NO decide passengerId, status ni contadores del plan', async () => {
  const { servicio } = crearEntorno();
  const cuerpo = {
    ...cuerpoValido(),
    passengerId: 'p_victima',
    status: 'EXPIRED',
    plan: { type: 'WEEKLY', ridesIncluded: 999999, ridesUsed: -5 }
  };
  const alta = await servicio.createSubscription(PASAJERO, cuerpo);
  assert.equal(alta.ok, true);
  assert.equal(alta.subscription.passengerId, 'p1', 'del token, SIEMPRE');
  assert.equal(alta.subscription.status, 'ACTIVE', 'el servidor decide');
  assert.equal(alta.subscription.plan.ridesUsed, 0);
  assert.equal(alta.subscription.plan.ridesIncluded, 10, '5 dias x 2 tramos, no lo que pida el cliente');
});

test('PATCH rechaza los campos del servidor y los desconocidos', async () => {
  const { servicio } = crearEntorno();
  const { subscription } = await servicio.createSubscription(PASAJERO, cuerpoValido());
  for (const cuerpo of [{ status: 'ACTIVE' }, { passengerId: 'p2' }, { plan: {} }, { route: {} }, { createdAt: 'x' }]) {
    assert.equal((await servicio.updateSubscription(PASAJERO, subscription.id, cuerpo)).code, 'SERVER_OWNED_FIELD');
  }
  assert.equal((await servicio.updateSubscription(PASAJERO, subscription.id, { turbo: true })).code, 'UNKNOWN_FIELD');
});

test('UNA suscripcion viva por pasajero; cancelar libera el cupo', async () => {
  const { servicio } = crearEntorno();
  const primera = await servicio.createSubscription(PASAJERO, cuerpoValido());
  assert.equal((await servicio.createSubscription(PASAJERO, cuerpoValido())).code, 'SUBSCRIPTION_LIMIT');
  await servicio.setSubscriptionStatus(PASAJERO, primera.subscription.id, 'CANCELLED');
  assert.equal((await servicio.createSubscription(PASAJERO, cuerpoValido())).ok, true);
});

test('entradas invalidas caen con su codigo: zona, ruta, weekdays, hora', async () => {
  const { servicio } = crearEntorno();
  const conPatron = patron => ({ ...cuerpoValido(), pattern: { ...cuerpoValido().pattern, ...patron } });
  assert.equal((await servicio.createSubscription(PASAJERO, conPatron({ timezone: 'Marte/Colonia' }))).code, 'INVALID_TIMEZONE');
  assert.equal((await servicio.createSubscription(PASAJERO, conPatron({ weekdays: [0, 8] }))).code, 'INVALID_WEEKDAYS');
  assert.equal((await servicio.createSubscription(PASAJERO, conPatron({ outbound: { time: '25:00' } }))).code, 'INVALID_TIME');
  const malaRuta = { ...cuerpoValido(), route: { home: { lat: 999, lng: 0, address: 'x' }, worksite: cuerpoValido().route.worksite } };
  assert.equal((await servicio.createSubscription(PASAJERO, malaRuta)).code, 'INVALID_ROUTE');
  assert.equal((await servicio.createSubscription(PASAJERO, { ...cuerpoValido(), pauses: [{ from: '2026-09-05', to: '2026-09-01' }] })).code, 'INVALID_PAUSES');
  assert.equal((await servicio.createSubscription(PASAJERO, { ...cuerpoValido(), exceptions: [{ date: '2026-13-40', skip: true }] })).code, 'INVALID_EXCEPTIONS');
  assert.equal((await servicio.createSubscription(PASAJERO, { ...cuerpoValido(), effectiveFrom: '2026-02-30' })).code, 'INVALID_EFFECTIVE_FROM');
});

// --------------------------------------------------------------------------
// Lectura acotada y fundacion de tiempos de cobertura (para SAFE-1D)
// --------------------------------------------------------------------------

test('la lectura de ocurrencias es del dueno, ordenada y con rango acotado', async () => {
  const { servicio, database } = crearEntorno();
  await servicio.createSubscription(PASAJERO, cuerpoValido());
  database.scheduledRides.push({
    id: 'sride_ajena', subscriptionId: 'tsub_ajena', passengerId: 'p2',
    occurrenceKey: 'tsub_ajena:2026-09-01:OUTBOUND', assignmentStatus: 'UNASSIGNED',
    serviceStatus: 'PLANNED', tripId: null,
    pickup: { lat: 1, lng: 1, address: 'a' }, destination: { lat: 2, lng: 2, address: 'b' },
    scheduledPickupAt: '2026-09-01T11:00:00.000Z', timeline: []
  });
  const lista = servicio.listScheduledRides(PASAJERO, {});
  assert.equal(lista.length, 6, 'solo lo propio');
  assert.ok(lista.every(r => r.passengerId === 'p1'));
  const tiempos = lista.map(r => Date.parse(r.scheduledPickupAt));
  assert.deepEqual(tiempos, [...tiempos].sort((a, b) => a - b), 'orden cronologico');
  // Rango invalido o desmedido: null (el router lo convierte en 400).
  assert.equal(servicio.listScheduledRides(PASAJERO, { fromMs: 10, toMs: 5 }), null);
  assert.equal(servicio.listScheduledRides(PASAJERO, { fromMs: 0, toMs: 365 * 24 * 3600 * 1000 }), null);
});

test('las ventanas de cobertura clasifican tiempo PURO (fundacion de SAFE-1D)', () => {
  const t = LUNES;
  const en = minutos => ({ scheduledPickupAtUtcMs: t + minutos * 60_000, nowMs: t });
  assert.equal(classifyCoverageTiming(en(120)), 'BEFORE_CONFIRMATION_WINDOW');
  assert.equal(classifyCoverageTiming(en(45)), 'PRIMARY_CONFIRMATION_WINDOW');
  assert.equal(classifyCoverageTiming(en(20)), 'BACKUP_WINDOW');
  assert.equal(classifyCoverageTiming(en(-1)), 'PAST_DUE');
  assert.equal(COVERAGE_WINDOWS.materializationHorizonMs, 72 * 3600 * 1000);
  assert.throws(() => classifyCoverageTiming({ scheduledPickupAtUtcMs: NaN, nowMs: t }), /INVALID_COVERAGE_INPUT/);
});

test('bandera y cadencia: apagado por defecto; el intervalo tiene suelo', () => {
  assert.equal(isSafeTransportEnabled(undefined), false);
  assert.equal(isSafeTransportEnabled('true'), true);
  assert.equal(resolveMaterializerIntervalMs(undefined), 5 * 60_000);
  assert.equal(resolveMaterializerIntervalMs('1'), 5 * 60_000, 'un intervalo absurdo cae al valor por defecto');
  assert.equal(resolveMaterializerIntervalMs('60000'), 60_000);
});

test('con la bandera APAGADA el materializador no arranca', () => {
  const database = { transportSubscriptions: [], scheduledRides: [] };
  const servicio = createSafeTransportService({
    database, persistRecord: async () => true, enabled: false, logger: silencioso
  });
  assert.equal(servicio.startMaterializer(), false);
  servicio.stopMaterializer();
});
