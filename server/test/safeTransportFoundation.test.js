import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MATERIALIZATION_HORIZON_MS,
  DEFAULT_TIMEZONE,
  OCCURRENCE_DIRECTION,
  buildOccurrenceKey,
  generateOccurrences,
  isValidOccurrenceKey,
  localTimeToUtc,
  localWeekday,
  utcToLocalDate,
  validateScheduledRidePayload,
  validateSubscriptionPayload
} from '../domain/scheduleCalendar.js';
import { openDatabaseBackend } from '../services/databaseBackend.js';
import { PERSISTED_TABLES } from '../services/databasePersistence.js';
import { POSTGRES_TABLES } from '../services/postgresPersistence.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raiz = path.resolve(serverDir, '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * SAFE-TRANSPORT-1B: fundacion de datos, DORMIDA.
 *
 * Aqui se fija: el calendario puro (recurrencia, zonas, pausas, excepciones,
 * claves deterministas), los validadores de forma, el contrato del SQL de la
 * migracion, el registro de persistencia y — tan importante como lo demas —
 * que NADA de comportamiento se activo: sin scheduler, sin API, sin handoff,
 * sin consumo de creditos.
 */

const SUB = Object.freeze({
  id: 'sub_prueba',
  passengerId: 'p1',
  status: 'ACTIVE',
  plan: { type: 'WEEKLY', ridesIncluded: 10, ridesUsed: 0, renewsAt: null, graceUntil: null },
  route: {
    home: { lat: 10.64, lng: -71.61, address: 'Casa' },
    worksite: { lat: 10.69, lng: -71.63, address: 'Centro comercial' }
  },
  pattern: {
    weekdays: [1, 2, 3, 4, 5],
    outbound: { time: '07:00' },
    return: { time: '17:00' },
    timezone: 'America/Caracas'
  },
  effectiveFrom: '2026-08-01',
  pauses: [],
  exceptions: []
});

// 2026-08-31 es LUNES. Horizonte: lunes 00:00 a jueves 00:00 Caracas (72 h).
const desde = localTimeToUtc('2026-08-31', '00:00', 'America/Caracas');
const hasta = desde + DEFAULT_MATERIALIZATION_HORIZON_MS;

// --------------------------------------------------------------------------
// Zona horaria
// --------------------------------------------------------------------------

test('Caracas: 07:00 local es 11:00 UTC (UTC-4), sin depender de la maquina', () => {
  const utc = localTimeToUtc('2026-08-31', '07:00', 'America/Caracas');
  assert.equal(new Date(utc).toISOString(), '2026-08-31T11:00:00.000Z');
  assert.equal(utcToLocalDate(utc, 'America/Caracas'), '2026-08-31');
  assert.equal(localWeekday('2026-08-31', 'America/Caracas'), 1, 'lunes');
  assert.equal(localWeekday('2026-09-05', 'America/Caracas'), 6, 'sabado');
});

test('portabilidad DST: New York convierte distinto en verano y en invierno', () => {
  // El MVP usa Caracas (sin DST), pero el modulo no puede asumirlo.
  const verano = localTimeToUtc('2026-07-01', '07:00', 'America/New_York');
  const invierno = localTimeToUtc('2026-01-15', '07:00', 'America/New_York');
  assert.equal(new Date(verano).toISOString(), '2026-07-01T11:00:00.000Z', 'EDT = UTC-4');
  assert.equal(new Date(invierno).toISOString(), '2026-01-15T12:00:00.000Z', 'EST = UTC-5');
  // Borde de DST (2026-03-08, 02:30 no existe en NY): resolucion DETERMINISTA
  // e independiente del sistema — el valor exacto queda fijado aqui.
  const inexistente = localTimeToUtc('2026-03-08', '02:30', 'America/New_York');
  assert.equal(new Date(inexistente).toISOString(), '2026-03-08T06:30:00.000Z',
    'la hora inexistente se resuelve con el desfase posterior al salto');
});

test('fechas, horas y zonas invalidas fallan rapido con codigo', () => {
  assert.throws(() => localTimeToUtc('2026-13-40', '07:00'), /INVALID_LOCAL_DATE/);
  assert.throws(() => localTimeToUtc('2026-08-31', '25:99'), /INVALID_LOCAL_TIME/);
  assert.throws(() => localTimeToUtc('2026-08-31', '07:00', 'Marte/Colonia'));
});

// --------------------------------------------------------------------------
// Recurrencia semanal
// --------------------------------------------------------------------------

test('lunes-viernes con ida y vuelta genera 6 ocurrencias en 72 h (lun+mar+mie)', () => {
  const ocurrencias = generateOccurrences({ subscription: SUB, fromUtcMs: desde, toUtcMs: hasta });
  assert.equal(ocurrencias.length, 6);
  assert.deepEqual(ocurrencias.map(o => `${o.localDate}:${o.direction}`), [
    '2026-08-31:OUTBOUND', '2026-08-31:RETURN',
    '2026-09-01:OUTBOUND', '2026-09-01:RETURN',
    '2026-09-02:OUTBOUND', '2026-09-02:RETURN'
  ]);
  assert.ok(ocurrencias.every(o => o.scheduledPickupAtUtcMs >= desde && o.scheduledPickupAtUtcMs < hasta));
});

test('el fin de semana queda excluido por el patron', () => {
  // Horizonte viernes→lunes: solo viernes (ida+vuelta) y lunes (ida+vuelta).
  const viernes = localTimeToUtc('2026-09-04', '00:00', 'America/Caracas');
  const lunes = viernes + 72 * 3600 * 1000; // hasta lunes 00:00 exclusivo
  const ocurrencias = generateOccurrences({ subscription: SUB, fromUtcMs: viernes, toUtcMs: lunes });
  assert.deepEqual([...new Set(ocurrencias.map(o => o.localDate))], ['2026-09-04'],
    'sabado y domingo no generan nada');
});

test('una pausa (vacaciones) apaga los dias que cubre', () => {
  const conPausa = { ...SUB, pauses: [{ from: '2026-09-01', to: '2026-09-02', reason: 'vacaciones' }] };
  const ocurrencias = generateOccurrences({ subscription: conPausa, fromUtcMs: desde, toUtcMs: hasta });
  assert.deepEqual([...new Set(ocurrencias.map(o => o.localDate))], ['2026-08-31']);
});

test('la excepcion skip salta UN dia; los override cambian UNA hora', () => {
  const conExcepciones = {
    ...SUB,
    exceptions: [
      { date: '2026-09-01', skip: true },
      { date: '2026-09-02', outboundTime: '06:00', returnTime: '21:30' }
    ]
  };
  const ocurrencias = generateOccurrences({ subscription: conExcepciones, fromUtcMs: desde, toUtcMs: hasta });
  assert.ok(!ocurrencias.some(o => o.localDate === '2026-09-01'), 'el dia saltado no existe');
  const miercolesIda = ocurrencias.find(o => o.localDate === '2026-09-02' && o.direction === 'OUTBOUND');
  const miercolesVuelta = ocurrencias.find(o => o.localDate === '2026-09-02' && o.direction === 'RETURN');
  assert.equal(miercolesIda.localTime, '06:00');
  assert.equal(miercolesVuelta.localTime, '21:30');
  // Y el lunes conserva sus horas normales.
  assert.equal(ocurrencias.find(o => o.localDate === '2026-08-31' && o.direction === 'OUTBOUND').localTime, '07:00');
});

test('effectiveFrom impide ocurrencias anteriores a la activacion', () => {
  const futura = { ...SUB, effectiveFrom: '2026-09-02' };
  const ocurrencias = generateOccurrences({ subscription: futura, fromUtcMs: desde, toUtcMs: hasta });
  assert.deepEqual([...new Set(ocurrencias.map(o => o.localDate))], ['2026-09-02']);
});

test('el limite del horizonte es exacto: fuera de [from, to) no entra nada', () => {
  // Horizonte que corta a las 12:00 del lunes: la vuelta de las 17:00 queda fuera.
  const mediodia = localTimeToUtc('2026-08-31', '12:00', 'America/Caracas');
  const ocurrencias = generateOccurrences({ subscription: SUB, fromUtcMs: desde, toUtcMs: mediodia });
  assert.deepEqual(ocurrencias.map(o => o.direction), ['OUTBOUND']);
  assert.equal(DEFAULT_MATERIALIZATION_HORIZON_MS, 72 * 3600 * 1000, 'el horizonte aprobado es 72 h');
});

// --------------------------------------------------------------------------
// La clave de ocurrencia
// --------------------------------------------------------------------------

test('la clave es determinista, direccional y sin azar', () => {
  const a = buildOccurrenceKey('sub_x', '2026-09-01', OCCURRENCE_DIRECTION.OUTBOUND);
  const b = buildOccurrenceKey('sub_x', '2026-09-01', OCCURRENCE_DIRECTION.OUTBOUND);
  assert.equal(a, b, 'misma entrada, misma clave, SIEMPRE');
  assert.equal(a, 'sub_x:2026-09-01:OUTBOUND');
  assert.notEqual(a, buildOccurrenceKey('sub_x', '2026-09-01', OCCURRENCE_DIRECTION.RETURN),
    'la direccion es parte de la identidad');
  assert.ok(isValidOccurrenceKey(a));
  assert.ok(!isValidOccurrenceKey('sub_x:ayer:IDA'));
  assert.throws(() => buildOccurrenceKey('sub_x', '2026-09-01', 'IDA'), /INVALID_OCCURRENCE_KEY_INPUT/);
});

// --------------------------------------------------------------------------
// Validadores de forma
// --------------------------------------------------------------------------

test('los validadores rechazan lo obviamente invalido y aceptan lo aprobado', () => {
  assert.equal(validateSubscriptionPayload(SUB), null, 'la suscripcion modelo es valida');
  const casos = [
    [{ ...SUB, status: 'ETERNA' }, 'INVALID_STATUS'],
    [{ ...SUB, plan: { ...SUB.plan, ridesIncluded: -1 } }, 'INVALID_PLAN_COUNTERS'],
    [{ ...SUB, plan: { ...SUB.plan, ridesUsed: 99 } }, 'INVALID_PLAN_COUNTERS'],
    [{ ...SUB, pattern: { ...SUB.pattern, weekdays: [0, 8] } }, 'INVALID_WEEKDAYS'],
    [{ ...SUB, pattern: { ...SUB.pattern, outbound: { time: '25:00' } } }, 'INVALID_TIME'],
    [{ ...SUB, pattern: { ...SUB.pattern, timezone: 'Marte/Colonia' } }, 'INVALID_TIMEZONE'],
    [{ ...SUB, route: { ...SUB.route, home: { lat: 999, lng: 0, address: 'x' } } }, 'INVALID_ROUTE']
  ];
  for (const [doc, codigo] of casos) {
    assert.equal(validateSubscriptionPayload(doc), codigo);
  }

  const ride = {
    id: 'sride_1', subscriptionId: 'sub_prueba', passengerId: 'p1',
    occurrenceKey: 'sub_prueba:2026-08-31:OUTBOUND',
    assignmentStatus: 'UNASSIGNED', serviceStatus: 'PLANNED',
    pickup: SUB.route.home, destination: SUB.route.worksite,
    scheduledPickupAt: '2026-08-31T11:00:00.000Z', timeline: []
  };
  assert.equal(validateScheduledRidePayload(ride), null);
  assert.equal(validateScheduledRidePayload({ ...ride, occurrenceKey: 'x' }), 'INVALID_OCCURRENCE_KEY');
  assert.equal(validateScheduledRidePayload({ ...ride, assignmentStatus: 'MAGIA' }), 'INVALID_ASSIGNMENT_STATUS');
  assert.equal(validateScheduledRidePayload({ ...ride, serviceStatus: 'CANCELLED_' }), 'INVALID_SERVICE_STATUS');
});

// --------------------------------------------------------------------------
// El contrato del SQL de la migracion
// --------------------------------------------------------------------------

test('la migracion declara las DOS tablas con la convencion documental de la casa', () => {
  const sql = leer('supabase/migrations/20260827230000_safe_transport_foundation.sql');
  for (const tabla of ['public.transport_subscriptions', 'public.scheduled_rides']) {
    assert.ok(sql.includes(`create table if not exists ${tabla}`), tabla);
  }
  // Documental: id + payload jsonb + checks de objeto e id.
  assert.equal((sql.match(/payload jsonb not null/g) || []).length, 2);
  assert.equal((sql.match(/jsonb_typeof\(payload\) = 'object'/g) || []).length, 2);
  assert.equal((sql.match(/payload ->> 'id'\) is not distinct from id/g) || []).length, 2);
  // EL candado: unicidad de la ocurrencia EN LA BASE DE DATOS.
  assert.match(sql, /create unique index if not exists scheduled_rides_occurrence_key/);
  assert.match(sql, /on public\.scheduled_rides \(occurrence_key\)/);
  // FKs reales, diferibles como el resto del esquema.
  assert.match(sql, /transport_subscriptions_passenger_fk foreign key \(passenger_id\) references public\.users\(id\) deferrable/);
  assert.match(sql, /scheduled_rides_subscription_fk foreign key \(subscription_id\) references public\.transport_subscriptions\(id\) deferrable/);
  assert.match(sql, /scheduled_rides_passenger_fk foreign key \(passenger_id\) references public\.users\(id\) deferrable/);
  // Indices operativos, y NINGUNO sobre direcciones/coordenadas (privacidad).
  for (const indice of ['transport_subscriptions_passenger_idx', 'transport_subscriptions_status_idx',
    'scheduled_rides_subscription_idx', 'scheduled_rides_pickup_at_idx', 'scheduled_rides_assignment_idx']) {
    assert.ok(sql.includes(indice), indice);
  }
  assert.ok(!/address|->> 'home'|->> 'worksite'|lat|lng/.test(sql.replace(/--[^\n]*/g, '')),
    'ninguna columna generada ni indice expone direcciones o coordenadas');
  // Blindaje de acceso identico al resto del esquema.
  assert.equal((sql.match(/revoke all on public\.\w+ from anon, authenticated/g) || []).length, 2);
  assert.equal((sql.match(/enable row level security/g) || []).length, 2);
  // Y nada destructivo.
  assert.ok(!/drop |truncate |delete from|alter table public\.(users|trips)/i.test(sql));
});

// --------------------------------------------------------------------------
// Registro de persistencia y roundtrip real (backend local)
// --------------------------------------------------------------------------

test('las colecciones estan registradas en los dos mapas de persistencia', () => {
  assert.ok(PERSISTED_TABLES.includes('transportSubscriptions'));
  assert.ok(PERSISTED_TABLES.includes('scheduledRides'));
  assert.equal(POSTGRES_TABLES.transportSubscriptions, 'transport_subscriptions');
  assert.equal(POSTGRES_TABLES.scheduledRides, 'scheduled_rides');
});

test('roundtrip: guardar y recargar una suscripcion y una ocurrencia', async (t) => {
  const previo = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL; // backend local
  t.after(() => { if (previo !== undefined) process.env.DATABASE_URL = previo; });

  const dir = await mkdtemp(path.join(tmpdir(), 'plus58express-safe1b-'));
  const dataFile = path.join(dir, 'database.json');
  const abrir = () => openDatabaseBackend({
    dataFile, migrationsDirectory: path.join(dir, 'no-migrations'),
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  });

  const backend = await abrir();
  const sub = structuredClone(SUB);
  const ride = {
    id: 'sride_1', subscriptionId: sub.id, passengerId: sub.passengerId,
    occurrenceKey: buildOccurrenceKey(sub.id, '2026-08-31', 'OUTBOUND'),
    assignmentStatus: 'UNASSIGNED', serviceStatus: 'PLANNED',
    pickup: sub.route.home, destination: sub.route.worksite,
    scheduledPickupAt: '2026-08-31T11:00:00.000Z', timeline: []
  };
  backend.database.transportSubscriptions.push(sub);
  backend.database.scheduledRides.push(ride);
  assert.equal(await backend.persistence.persistRecord('transportSubscriptions', sub), true);
  assert.equal(await backend.persistence.persistRecord('scheduledRides', ride), true);
  await backend.close();

  const recargado = await abrir();
  assert.deepEqual(recargado.database.transportSubscriptions, [sub], 'la suscripcion sobrevive');
  assert.deepEqual(recargado.database.scheduledRides, [ride], 'la ocurrencia sobrevive');
  await recargado.close();
});

// --------------------------------------------------------------------------
// DORMIDO: nada de comportamiento se activo
// --------------------------------------------------------------------------

test('la funcionalidad esta DORMIDA: sin scheduler, sin API, sin handoff, sin creditos', () => {
  const indice = leer('server/index.js').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');
  assert.ok(!indice.includes('generateOccurrences'), 'ningun materializador registrado');
  assert.ok(!indice.includes('scheduleCalendar'), 'index.js ni importa el calendario');
  assert.ok(!/transportSubscriptions(?!: \[\])/.test(indice.replace('transportSubscriptions: []', '')),
    'ninguna logica de negocio toca las suscripciones');
  assert.ok(!indice.includes('scheduled_ride') && !indice.includes('scheduledRideHandoff'),
    'ningun handoff de viaje programado');
  // Y ninguna ruta nueva de API de suscripciones.
  const rutas = fs.readdirSync(path.join(serverDir, 'routes'));
  assert.ok(!rutas.some(nombre => /transport|subscription|scheduled/i.test(nombre)),
    'sin endpoints de suscripciones en SAFE-1B');
});
