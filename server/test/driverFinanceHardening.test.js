import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVER_DEBT_LIMIT_USD,
  applyInactivityGrace,
  canTakeNewWork,
  commissionWithinFloor,
  inactivityAnchorOf,
  maintenanceDuePeriods,
  shouldSuspendForInactivity,
  wouldBreachFloor
} from '../domain/driverFinance.js';
import { createDriverFinanceService } from '../services/driverFinance.js';
import { DISPATCH_REJECTION, evaluateDriverEligibility } from '../domain/dispatchEligibility.js';

/**
 * DRIVER-FINANCE-1 · ronda 2 — los agujeros que encontró la auditoría
 * independiente, cada uno con su prueba.
 *
 * Ninguno era teórico: el suelo de deuda se podía cruzar, el cobro mensual se
 * podía duplicar, la bandera apagada no apagaba nada, un administrador no
 * podía sacar a nadie de la suspensión y meses enteros de mantenimiento se
 * perdían si el servicio estaba dormido.
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };
const DIA = 24 * 60 * 60 * 1000;
const HOY = Date.parse('2026-08-28T12:00:00.000Z');

const conductor = (extra = {}) => ({
  id: 'drv_1', role: 'driver', isVerified: true, status: 'AVAILABLE',
  accountStatus: 'ACTIVE', vehicleType: 'MOTO', walletBalance: 0,
  location: { lat: 10.6, lng: -71.6, updatedAt: HOY }, ...extra
});

function crearEntorno({ drivers = [conductor()], nowMs = HOY, enabled = true, persistence = null, persistOk = true } = {}) {
  const database = { users: [...drivers], transactions: [], notifications: [] };
  const reloj = { ms: nowMs };
  const avisos = [];
  const servicio = createDriverFinanceService({
    database,
    persistRecord: async () => persistOk,
    persistence,
    notify: async (userId, event, title, message) => { avisos.push({ userId, event, title, message }); },
    enabled,
    now: () => reloj.ms,
    logger: silencioso
  });
  return { database, servicio, reloj, avisos };
}

/** Persistencia de mentira con la MISMA garantía que la real: la clave
 *  primaria decide, y el apunte y el saldo entran juntos o no entran. */
function persistenciaAtomica(database, { fallarEn = null } = {}) {
  const escritas = new Set();
  return {
    intentos: 0,
    async chargeDriverMaintenance({ transaction, driver }) {
      this.intentos += 1;
      if (fallarEn === this.intentos) return 'FAILED';
      if (escritas.has(transaction.id)) return 'ALREADY_CHARGED';
      escritas.add(transaction.id);
      return 'CHARGED';
    }
  };
}

// --------------------------------------------------------------------------
// CRÍTICO 1 · el suelo de −$5 como invariante, no como buena intención
// --------------------------------------------------------------------------

test('CRITICO-1 · la liquidacion en efectivo JAMAS escribe por debajo de -$5', () => {
  // El caso que rompía: la comisión se restaba sin mirar el suelo.
  const casos = [
    [0, 0.7, 0.7, 0],        // saldo sano: se aplica entera
    [-4.5, 0.7, 0.5, 0.2],   // solo cabe medio dólar: el resto queda a deber
    [-5, 0.7, 0, 0.7],       // ya en el suelo: no se le hunde más
    [-4.99, 0.7, 0.01, 0.69]
  ];
  for (const [saldo, comision, aplicado, diferido] of casos) {
    const { applied, deferred } = commissionWithinFloor(conductor({ walletBalance: saldo }), comision);
    assert.equal(applied, aplicado, `saldo ${saldo}`);
    assert.equal(deferred, diferido, `saldo ${saldo} diferido`);
    const resultante = Math.round((saldo - applied) * 100) / 100;
    assert.ok(resultante >= -DRIVER_DEBT_LIMIT_USD, `${saldo} → ${resultante} nunca bajo el suelo`);
  }
});

test('CRITICO-1 · lo ya COMPROMETIDO cuenta para el suelo', () => {
  // Dos carreras aceptadas seguidas no pueden apoyarse las dos en el mismo
  // saldo: la segunda ve la comisión de la primera todavía sin liquidar.
  const driver = conductor({ walletBalance: 0, committedCommission: 4.5 });
  assert.equal(wouldBreachFloor(driver, 0.7, { enabled: true }), true,
    '0 − 4.50 comprometido − 0.70 = −5.20 → no cabe');
  assert.equal(wouldBreachFloor(conductor({ walletBalance: 0 }), 0.7, { enabled: true }), false,
    'sin nada comprometido, la misma carrera sí cabe');
});

// --------------------------------------------------------------------------
// CRÍTICO 2 · el cobro mensual, exactamente una vez de verdad
// --------------------------------------------------------------------------

/** Entorno con la persistencia atómica de mentira ya enchufada. */
function entornoAtomico({ drivers, nowMs = HOY, fallarEn = null } = {}) {
  const entorno = crearEntorno({ drivers, nowMs });
  entorno.atomica = persistenciaAtomica(entorno.database, { fallarEn });
  const servicio = createDriverFinanceService({
    database: entorno.database,
    persistRecord: async () => true,
    persistence: entorno.atomica,
    notify: async (userId, event, title, message) => { entorno.avisos.push({ userId, event, title, message }); },
    enabled: true,
    now: () => entorno.reloj.ms,
    logger: silencioso
  });
  return { ...entorno, servicio };
}

test('CRITICO-2 · dos evaluadores CONCURRENTES cobran el mes una sola vez', async () => {
  const entorno = entornoAtomico({ drivers: [conductor({ walletBalance: 10 })] });
  await entorno.servicio.runDriverFinancePass();
  entorno.reloj.ms = HOY + 30 * DIA;

  // Dos pasadas a la vez sobre el MISMO conductor y el MISMO periodo.
  await Promise.all([
    entorno.servicio.runDriverFinancePass(),
    entorno.servicio.runDriverFinancePass()
  ]);

  const cobros = entorno.database.transactions.filter(t => t.type === 'DRIVER_ACCOUNT_MAINTENANCE');
  assert.equal(cobros.length, 1, 'un solo apunte');
  assert.equal(entorno.database.users[0].walletBalance, 9, 'un solo dolar descontado');
  assert.equal(cobros[0].id, `transaction_maint_${entorno.database.users[0].id}_1`,
    'el identificador es determinista: la clave primaria es la que decide');
});

test('CRITICO-2 · si la escritura falla, ni se cobra ni se apunta ni se avanza', async () => {
  const entorno = entornoAtomico({ drivers: [conductor({ walletBalance: 10 })], fallarEn: 1 });
  await entorno.servicio.runDriverFinancePass();
  entorno.reloj.ms = HOY + 30 * DIA;

  const resumen = await entorno.servicio.runDriverFinancePass();
  assert.equal(resumen.persistFailures, 1);
  assert.equal(entorno.database.users[0].walletBalance, 10, 'el saldo no se movio');
  assert.equal(entorno.database.transactions.length, 0, 'sin apunte huerfano');
  assert.equal(entorno.database.users[0].maintenance.lastChargedPeriod, 0, 'el contador no avanzo');

  // Y al reintentar, se cobra exactamente una vez.
  await entorno.servicio.runDriverFinancePass();
  assert.equal(entorno.database.users[0].walletBalance, 9);
  assert.equal(entorno.database.transactions.length, 1);
});

// --------------------------------------------------------------------------
// ALTO 5 · periodos vencidos que se perdian
// --------------------------------------------------------------------------

test('ALTO-5 · un servicio dormido 95 dias debe TRES meses, no uno', async () => {
  const conAncla = () => conductor({
    walletBalance: 10,
    maintenance: { anchorAt: HOY, lastChargedPeriod: 0, pendingPeriods: [] },
    activityAnchorAt: HOY
  });
  assert.deepEqual(maintenanceDuePeriods(conAncla(), HOY + 95 * DIA), [1, 2, 3],
    'los tres, del mas viejo primero');

  const entorno = entornoAtomico({ drivers: [conAncla()], nowMs: HOY + 95 * DIA });
  await entorno.servicio.runDriverFinancePass();

  assert.equal(entorno.database.transactions.length, 3, 'tres cobros');
  assert.equal(entorno.database.users[0].walletBalance, 7, '10 - 3');
  assert.deepEqual(entorno.database.transactions.map(t => t.maintenancePeriod), [1, 2, 3]);
});

test('ALTO-5 · con poco saldo, los meses que no caben quedan pendientes y ordenados', async () => {
  const entorno = entornoAtomico({
    drivers: [conductor({
      walletBalance: -3,
      maintenance: { anchorAt: HOY, lastChargedPeriod: 0, pendingPeriods: [] },
      activityAnchorAt: HOY
    })],
    nowMs: HOY + 95 * DIA
  });
  await entorno.servicio.runDriverFinancePass();

  const d = entorno.database.users[0];
  assert.equal(d.walletBalance, -5, 'se cobro hasta el suelo: -3 - 1 - 1 = -5');
  assert.deepEqual(d.maintenance.pendingPeriods, [3], 'el tercero queda a deber, no perdonado');
  assert.ok(d.walletBalance >= -DRIVER_DEBT_LIMIT_USD);
});

// --------------------------------------------------------------------------
// ALTO 1 · la bandera apagada apaga DE VERDAD
// --------------------------------------------------------------------------

test('ALTO-1 · con la funcionalidad apagada, nada de esto existe', async () => {
  const endeudado = conductor({ walletBalance: -5, financialBlock: { active: true } });
  // Predicados: apagada, nadie queda fuera por dinero.
  assert.equal(canTakeNewWork(endeudado, { enabled: false }), true);
  assert.equal(wouldBreachFloor(endeudado, 5, { enabled: false }), false);
  assert.equal(shouldSuspendForInactivity(
    conductor({ lastQualifyingTripAt: HOY - 90 * DIA }), HOY, { enabled: false }), false);

  // Despacho: sin la bandera no aparece la razón financiera.
  const resultado = evaluateDriverEligibility({
    driver: endeudado, trip: { rideType: 'MOTO' }, pickup: { lat: 10.6, lng: -71.6 },
    hasSocket: true, calculateDistance: () => 1, maxRadiusKm: 15, maxLocationAgeMs: 120_000,
    projectedCommissionUSD: 5, driverFinanceEnabled: false, now: HOY
  });
  assert.equal(resultado.eligible, true, 'el conductor endeudado sigue siendo candidato, como antes');
  assert.notEqual(resultado.reason, DISPATCH_REJECTION.FINANCIAL_BALANCE_BLOCK);

  // Y la pasada no cobra, no suspende, no ancla.
  const entorno = crearEntorno({ drivers: [conductor({ walletBalance: 10, lastQualifyingTripAt: HOY - 90 * DIA })], enabled: false });
  entorno.reloj.ms = HOY + 60 * DIA;
  const resumen = await entorno.servicio.runDriverFinancePass();
  assert.equal(resumen.driversSeen, 0, 'ni siquiera recorre la flota');
  assert.equal(entorno.database.users[0].walletBalance, 10);
  assert.equal(entorno.database.users[0].status, 'AVAILABLE');
  assert.equal(entorno.database.users[0].maintenance, undefined, 'no deja ni rastro');
  assert.equal(entorno.avisos.length, 0);
});

// --------------------------------------------------------------------------
// ALTO 2 · el estreno no suspende a nadie
// --------------------------------------------------------------------------

test('ALTO-2 · al estrenar, un conductor con 45 dias sin carreras NO se suspende', async () => {
  const veterano = conductor({ lastQualifyingTripAt: HOY - 45 * DIA });
  const entorno = crearEntorno({ drivers: [veterano] });
  const resumen = await entorno.servicio.runDriverFinancePass();

  assert.equal(resumen.inactivitySuspensions, 0, 'el día del estreno no se suspende a nadie');
  assert.notEqual(entorno.database.users[0].status, 'SUSPENDED');
  assert.equal(inactivityAnchorOf(entorno.database.users[0]), HOY, 'estrena 30 días de gracia');

  // Pero la gracia no es eterna: 30 días después sí se suspende.
  entorno.reloj.ms = HOY + 30 * DIA;
  const despues = await entorno.servicio.runDriverFinancePass();
  assert.equal(despues.inactivitySuspensions, 1);
});

// --------------------------------------------------------------------------
// ALTO 3 · el bucle de reactivación administrativa
// --------------------------------------------------------------------------

test('ALTO-3 · reactivar da ventana nueva; sin ella el bucle era infinito', async () => {
  const suspendido = conductor({
    status: 'SUSPENDED', suspensionReason: 'DRIVER_INACTIVITY_30_DAYS',
    lastQualifyingTripAt: HOY - 60 * DIA, activityAnchorAt: HOY - 60 * DIA,
    maintenance: { anchorAt: HOY - 10 * DIA, lastChargedPeriod: 0, pendingPeriods: [] }
  });
  const entorno = crearEntorno({ drivers: [suspendido] });
  const anclaMantenimiento = suspendido.maintenance.anchorAt;

  // La administración lo reactiva.
  suspendido.status = 'OFFLINE';
  await entorno.servicio.grantInactivityGrace(suspendido, HOY);

  const inmediato = await entorno.servicio.runDriverFinancePass();
  assert.equal(inmediato.inactivitySuspensions, 0, 'no vuelve a caer al día siguiente');
  assert.equal(suspendido.status, 'OFFLINE');
  assert.equal(suspendido.suspensionReason, null);
  assert.equal(suspendido.maintenance.anchorAt, anclaMantenimiento,
    'el calendario del mantenimiento NO se toca: son relojes distintos');

  // A los 29 días sigue activo; a los 30 sin carreras, se suspende otra vez.
  entorno.reloj.ms = HOY + 29 * DIA;
  assert.equal((await entorno.servicio.runDriverFinancePass()).inactivitySuspensions, 0);
  entorno.reloj.ms = HOY + 30 * DIA;
  assert.equal((await entorno.servicio.runDriverFinancePass()).inactivitySuspensions, 1);
});

test('ALTO-3 · reactivar NO levanta el bloqueo por deuda', () => {
  const driver = conductor({
    role: 'driver', walletBalance: -5, financialBlock: { active: true },
    suspensionReason: 'DRIVER_INACTIVITY_30_DAYS'
  });
  applyInactivityGrace(driver, HOY);
  assert.equal(driver.financialBlock.active, true, 'quien debe, sigue debiendo');
  assert.equal(canTakeNewWork(driver, { enabled: true }), false);
});

// --------------------------------------------------------------------------
// MEDIO 1 y 2 · anclas y avisos durables
// --------------------------------------------------------------------------

test('MEDIO-1 · un ancla que no se pudo guardar NO se da por puesta', async () => {
  const entorno = crearEntorno({ drivers: [conductor({ walletBalance: 10 })], persistOk: false });
  const resumen = await entorno.servicio.runDriverFinancePass();
  assert.equal(resumen.persistFailures, 1);
  assert.equal(entorno.database.users[0].maintenance, undefined,
    'sin escritura durable, el documento queda como estaba');
  assert.equal(entorno.database.users[0].activityAnchorAt, undefined);
});

test('MEDIO-2 · un aviso que no se entrega se reintenta, no se pierde', async () => {
  // Con anclas YA establecidas: si estrenara la politica, la gracia de
  // estreno le daria 30 dias y no habria aviso que dar.
  const driver = conductor({
    lastQualifyingTripAt: HOY - 23 * DIA,
    activityAnchorAt: HOY - 40 * DIA,
    maintenance: { anchorAt: HOY - 5 * DIA, lastChargedPeriod: 0, pendingPeriods: [] }
  });
  const database = { users: [driver], transactions: [], notifications: [] };
  const reloj = { ms: HOY };
  let falla = true;
  const entregados = [];
  const servicio = createDriverFinanceService({
    database,
    persistRecord: async () => true,
    notify: async (userId, event) => {
      if (event === 'driver_inactivity_warning' && falla) throw new Error('proveedor caido');
      entregados.push(event);
    },
    enabled: true, now: () => reloj.ms, logger: silencioso
  });

  await servicio.runDriverFinancePass();
  assert.equal(entregados.length, 0, 'no llegó');
  assert.ok(!driver.inactivityWarnedThreshold, 'y NO se marco como avisado');

  falla = false;
  await servicio.runDriverFinancePass();
  assert.deepEqual(entregados, ['driver_inactivity_warning'], 'se reintentó y llegó');
  assert.equal(driver.inactivityWarnedThreshold, 7, 'ahora sí queda marcado');

  await servicio.runDriverFinancePass();
  assert.equal(entregados.length, 1, 'y no se repite');
});
