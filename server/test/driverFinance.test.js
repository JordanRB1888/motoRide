import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVER_DEBT_LIMIT_USD,
  DRIVER_INACTIVITY_SUSPENSION_DAYS,
  DRIVER_MAINTENANCE_FEE_USD,
  DRIVER_MAINTENANCE_INTERVAL_DAYS,
  DRIVER_MAINTENANCE_TRANSACTION_TYPE,
  amountToRegainEligibility,
  canTakeNewWork,
  isDebtBlocked,
  maintenanceCharge,
  maintenanceDue,
  meetsReactivationBalance,
  wouldBreachFloor
} from '../domain/driverFinance.js';
import { createDriverFinanceService } from '../services/driverFinance.js';
import { DISPATCH_REJECTION, evaluateDriverEligibility } from '../domain/dispatchEligibility.js';

/**
 * DRIVER-FINANCE-1 — la economía de la CUENTA del conductor.
 *
 * Tres reglas del dueño que estas pruebas custodian palabra por palabra:
 *  · se puede deber hasta −$5.00 exactos, ni un céntimo más;
 *  · para volver a rodar hay que quedar en POSITIVO ($0.00 no basta);
 *  · TODO conductor paga $1 cada 30 días, ruede mucho, poco o nada — y pagar
 *    ese dólar NO le salva de la suspensión por 30 días sin carreras.
 */

const silencioso = { log: () => {}, warn: () => {}, error: () => {} };
const DIA = 24 * 60 * 60 * 1000;
const HOY = Date.parse('2026-08-28T12:00:00.000Z');
// La politica solo aplica con la funcionalidad encendida: desde la ronda 2
// los predicados lo exigen explicitamente, y apagada son inertes.
const ACTIVO = { enabled: true };

const conductor = (extra = {}) => ({
  id: 'drv_1', role: 'driver', isVerified: true, status: 'AVAILABLE',
  accountStatus: 'ACTIVE', vehicleType: 'MOTO', walletBalance: 0, ...extra
});

function crearEntorno({ drivers = [conductor()], nowMs = HOY } = {}) {
  const database = { users: [...drivers], transactions: [], notifications: [] };
  const reloj = { ms: nowMs };
  const avisos = [];
  const servicio = createDriverFinanceService({
    database,
    persistRecord: async () => true,
    // v4: el adaptador CONFIRMA la entrega. Solo `true` cuenta como
    // entregado; cualquier otra cosa es un aviso que hay que reintentar.
    notify: async (userId, event, title, message) => { avisos.push({ userId, event, title, message }); return true; },
    enabled: true,
    now: () => reloj.ms,
    logger: silencioso
  });
  return { database, servicio, reloj, avisos };
}

const avisosDe = (avisos, event) => avisos.filter(a => a.event === event);

// --------------------------------------------------------------------------
// §36 · El límite de deuda, céntimo a céntimo
// --------------------------------------------------------------------------

test('el limite de deuda es EXACTAMENTE -$5.00 y bloquea por igualdad', () => {
  assert.equal(DRIVER_DEBT_LIMIT_USD, 5);
  const casos = [
    [10, false], [0.01, false], [0, false], [-4.99, false],
    [-5, true], [-5.01, true], [-12, true]
  ];
  for (const [saldo, bloqueado] of casos) {
    assert.equal(isDebtBlocked(conductor({ walletBalance: saldo }), ACTIVO), bloqueado, `saldo ${saldo}`);
    assert.equal(canTakeNewWork(conductor({ walletBalance: saldo }), ACTIVO), !bloqueado, `trabajo con ${saldo}`);
  }
});

test('§37 · para volver a rodar hay que quedar en POSITIVO: $0.00 no basta', () => {
  // Quien fue bloqueado arrastra la marca hasta quedar por encima de cero.
  const bloqueado = saldo => conductor({ walletBalance: saldo, financialBlock: { active: true } });
  assert.equal(canTakeNewWork(bloqueado(-0.01), ACTIVO), false, '-5.00 + 4.99 sigue bloqueado');
  assert.equal(canTakeNewWork(bloqueado(0), ACTIVO), false, '-5.00 + 5.00 = 0.00 SIGUE bloqueado');
  assert.equal(canTakeNewWork(bloqueado(0.01), ACTIVO), true, '-5.00 + 5.01 vuelve a rodar');
  assert.equal(meetsReactivationBalance(conductor({ walletBalance: 0 })), false);
  assert.equal(meetsReactivationBalance(conductor({ walletBalance: 0.01 })), true);
  // Y se le puede decir el número exacto que le falta.
  assert.equal(amountToRegainEligibility(conductor({ walletBalance: -5 })), 5.01);
  assert.equal(amountToRegainEligibility(conductor({ walletBalance: 0 })), 0.01);
  assert.equal(amountToRegainEligibility(conductor({ walletBalance: 3 })), 0);
});

test('un conductor NUEVO con saldo 0.00 puede trabajar: nunca estuvo bloqueado', () => {
  assert.equal(canTakeNewWork(conductor({ walletBalance: 0 }), ACTIVO), true);
});

test('§10 · la comision PROYECTADA impide empezar lo que hundiria bajo el suelo', () => {
  const casi = conductor({ walletBalance: -4.6 });
  assert.equal(wouldBreachFloor(casi, 0.7, ACTIVO), true, '-4.60 - 0.70 = -5.30 → no');
  assert.equal(wouldBreachFloor(casi, 0.4, ACTIVO), false, '-4.60 - 0.40 = -5.00 → cabe justo');
  assert.equal(wouldBreachFloor(conductor({ walletBalance: 20 }), 3, ACTIVO), false);
  // Y llega hasta el despacho real, como una frontera más.
  const evaluar = (driver, comision) => evaluateDriverEligibility({
    driver, trip: { rideType: 'MOTO' }, pickup: { lat: 10.6, lng: -71.6 },
    hasSocket: true, calculateDistance: () => 1, maxRadiusKm: 15, maxLocationAgeMs: 120_000,
    projectedCommissionUSD: comision, driverFinanceEnabled: true, now: HOY
  });
  const conGps = extra => conductor({ location: { lat: 10.6, lng: -71.6, updatedAt: HOY }, ...extra });
  assert.equal(evaluar(conGps({ walletBalance: 5 }), 0.7).eligible, true);
  assert.equal(evaluar(conGps({ walletBalance: -5 }), 0).reason, DISPATCH_REJECTION.FINANCIAL_BALANCE_BLOCK);
  assert.equal(evaluar(conGps({ walletBalance: -4.6 }), 0.7).reason, DISPATCH_REJECTION.FINANCIAL_BALANCE_BLOCK);
});

// --------------------------------------------------------------------------
// §38–§41 · Mantenimiento mensual
// --------------------------------------------------------------------------

test('§38/§39 · TODO conductor paga $1, ruede mucho o nada', async () => {
  for (const [etiqueta, extra] of [
    ['con carreras ayer', { lastQualifyingTripAt: HOY - DIA }],
    ['sin carreras hace 20 dias', { lastQualifyingTripAt: HOY - 20 * DIA }]
  ]) {
    const entorno = crearEntorno({ drivers: [conductor({ walletBalance: 10, ...extra })] });
    await entorno.servicio.runDriverFinancePass();          // ancla el reloj hoy
    entorno.reloj.ms = HOY + DRIVER_MAINTENANCE_INTERVAL_DAYS * DIA;
    const resumen = await entorno.servicio.runDriverFinancePass();

    assert.equal(resumen.maintenanceCharged, 1, etiqueta);
    assert.equal(entorno.database.users[0].walletBalance, 9, `${etiqueta}: 10 − 1`);
    const tx = entorno.database.transactions.filter(t => t.type === DRIVER_MAINTENANCE_TRANSACTION_TYPE);
    assert.equal(tx.length, 1);
    assert.equal(tx[0].amount, -1);
    assert.equal(tx[0].description, 'Mantenimiento de cuenta');
    assert.doesNotMatch(tx[0].description, /comisi[oó]n/i, 'jamás se llama comisión de viaje');
  }
});

test('§40 · exactamente UNA vez por periodo, aunque el planificador corra cinco veces', async () => {
  const entorno = crearEntorno({ drivers: [conductor({ walletBalance: 10 })] });
  await entorno.servicio.runDriverFinancePass();
  entorno.reloj.ms = HOY + 30 * DIA;
  for (let i = 0; i < 5; i += 1) await entorno.servicio.runDriverFinancePass();

  assert.equal(entorno.database.transactions.length, 1, 'un solo cobro');
  assert.equal(entorno.database.users[0].walletBalance, 9);
  assert.equal(avisosDe(entorno.avisos, 'driver_maintenance_charged').length, 1, 'un solo aviso');

  // El periodo siguiente sí vuelve a cobrar, una vez.
  entorno.reloj.ms = HOY + 60 * DIA;
  await entorno.servicio.runDriverFinancePass();
  await entorno.servicio.runDriverFinancePass();
  assert.equal(entorno.database.transactions.length, 2);
  assert.equal(entorno.database.users[0].walletBalance, 8);
});

test('§41 · el mantenimiento respeta el suelo: nunca debita a -5.50', async () => {
  // -4.00 → cabe justo hasta -5.00
  const cabe = crearEntorno({ drivers: [conductor({ walletBalance: -4 })] });
  await cabe.servicio.runDriverFinancePass();
  cabe.reloj.ms = HOY + 30 * DIA;
  await cabe.servicio.runDriverFinancePass();
  assert.equal(cabe.database.users[0].walletBalance, -5, '-4.00 − 1 = -5.00 exacto');
  assert.equal(avisosDe(cabe.avisos, 'driver_financial_block').length, 1, 'y queda bloqueado');

  // -4.50 → NO cabe: queda pendiente, sin tocar el saldo ni perdonar la deuda
  const noCabe = crearEntorno({ drivers: [conductor({ walletBalance: -4.5 })] });
  await noCabe.servicio.runDriverFinancePass();
  noCabe.reloj.ms = HOY + 30 * DIA;
  const resumen = await noCabe.servicio.runDriverFinancePass();
  assert.equal(noCabe.database.users[0].walletBalance, -4.5, 'el saldo NO se mueve');
  assert.equal(resumen.maintenancePending, 1);
  assert.deepEqual(noCabe.database.users[0].maintenance.pendingPeriods, [1], 'queda anotado');
  assert.equal(noCabe.database.transactions.length, 0, 'sin cobro parcial');
  const aviso = avisosDe(noCabe.avisos, 'driver_maintenance_pending');
  assert.equal(aviso.length, 1);
  assert.match(aviso[0].message, /pendiente.*Recarga/i);
  // Y no se repite el aviso en cada pasada.
  await noCabe.servicio.runDriverFinancePass();
  assert.equal(avisosDe(noCabe.avisos, 'driver_maintenance_pending').length, 1);
});

test('lo pendiente se concilia cuando entra dinero, y solo una vez', async () => {
  const entorno = crearEntorno({ drivers: [conductor({ walletBalance: -4.5 })] });
  await entorno.servicio.runDriverFinancePass();
  entorno.reloj.ms = HOY + 30 * DIA;
  await entorno.servicio.runDriverFinancePass();          // queda pendiente
  entorno.database.users[0].walletBalance = 10;           // recargó
  await entorno.servicio.runDriverFinancePass();

  assert.equal(entorno.database.users[0].walletBalance, 9, 'se cobró el dólar que debía');
  assert.deepEqual(entorno.database.users[0].maintenance.pendingPeriods, []);
  await entorno.servicio.runDriverFinancePass();
  assert.equal(entorno.database.transactions.filter(t => t.maintenancePeriod === 1).length, 1,
    'jamás dos veces el mismo periodo');
});

test('§29 · estrenar la politica NO cobra meses viejos', async () => {
  // Una cuenta registrada hace un año: al primer paso no debe nada.
  const entorno = crearEntorno({ drivers: [conductor({ walletBalance: 3, createdAt: new Date(HOY - 365 * DIA).toISOString() })] });
  const resumen = await entorno.servicio.runDriverFinancePass();
  assert.equal(resumen.maintenanceCharged, 0, 'cero cargos retroactivos');
  assert.equal(entorno.database.users[0].walletBalance, 3);
  assert.equal(entorno.database.users[0].maintenance.anchorAt, HOY, 'el reloj arranca HOY');
  assert.equal(maintenanceDue(entorno.database.users[0], HOY + 29 * DIA), null, 'y el primer cobro es a los 30 días');
});

// --------------------------------------------------------------------------
// §42–§44 · Inactividad
// --------------------------------------------------------------------------

test('§42 · a los 30 dias sin carreras, suspension; a los 29, no', async () => {
  // Anclado desde antes: la gracia de estreno ya se consumio.
  const casi = crearEntorno({ drivers: [conductor({ lastQualifyingTripAt: HOY - 29 * DIA, activityAnchorAt: HOY - 60 * DIA })] });
  await casi.servicio.runDriverFinancePass();
  assert.notEqual(casi.database.users[0].status, 'SUSPENDED', 'a los 29 días sigue trabajando');

  const vencido = crearEntorno({ drivers: [conductor({ lastQualifyingTripAt: HOY - 30 * DIA, activityAnchorAt: HOY - 60 * DIA })] });
  const resumen = await vencido.servicio.runDriverFinancePass();
  assert.equal(resumen.inactivitySuspensions, 1);
  assert.equal(vencido.database.users[0].status, 'SUSPENDED');
  assert.equal(vencido.database.users[0].suspensionReason, 'DRIVER_INACTIVITY_30_DAYS');
  const aviso = avisosDe(vencido.avisos, 'driver_inactivity_suspended');
  assert.equal(aviso.length, 1);
  assert.match(aviso[0].message, /30 días sin carreras completadas/);
  // Y no se suspende dos veces.
  await vencido.servicio.runDriverFinancePass();
  assert.equal(avisosDe(vencido.avisos, 'driver_inactivity_suspended').length, 1);
});

test('§21 CRÍTICO · pagar el mantenimiento NO salva de la suspension por inactividad', async () => {
  const entorno = crearEntorno({ drivers: [conductor({ walletBalance: 10, lastQualifyingTripAt: HOY, activityAnchorAt: HOY })] });
  await entorno.servicio.runDriverFinancePass();
  // Pasan 30 días: se le cobra el dólar Y se le suspende por no haber rodado.
  entorno.reloj.ms = HOY + 30 * DIA;
  const resumen = await entorno.servicio.runDriverFinancePass();
  assert.equal(resumen.maintenanceCharged, 1, 'pagó su mantenimiento');
  assert.equal(entorno.database.users[0].walletBalance, 9);
  assert.equal(resumen.inactivitySuspensions, 1, 'y aun así queda suspendido');
  assert.equal(entorno.database.users[0].status, 'SUSPENDED');
});

test('§43 · completar una carrera reinicia la inactividad y NO mueve el mantenimiento', async () => {
  const entorno = crearEntorno({ drivers: [conductor({ walletBalance: 10, lastQualifyingTripAt: HOY - 29 * DIA, activityAnchorAt: HOY - 60 * DIA })] });
  await entorno.servicio.runDriverFinancePass();
  const antes = { ...entorno.database.users[0].maintenance };

  entorno.reloj.ms = HOY + DIA;
  await entorno.servicio.registerQualifyingTrip(entorno.database.users[0], entorno.reloj.ms);
  entorno.reloj.ms = HOY + 2 * DIA;                       // día 31 desde su última carrera vieja
  const resumen = await entorno.servicio.runDriverFinancePass();

  assert.equal(resumen.inactivitySuspensions, 0, 'la carrera lo salvó');
  assert.notEqual(entorno.database.users[0].status, 'SUSPENDED');
  assert.equal(entorno.database.users[0].maintenance.anchorAt, antes.anchorAt,
    'el reloj del mantenimiento no se movió ni un milisegundo');
});

test('§44 · la actividad FALSA no reinicia nada', async () => {
  const entorno = crearEntorno({ drivers: [conductor({ lastQualifyingTripAt: HOY - 29 * DIA, activityAnchorAt: HOY - 60 * DIA })] });
  await entorno.servicio.runDriverFinancePass();
  const driver = entorno.database.users[0];
  // Todo esto NO es actividad: abrir la app, ponerse disponible, GPS, aceptar
  // una oferta sin completarla, pagar el mantenimiento.
  driver.status = 'AVAILABLE';
  driver.location = { lat: 10.6, lng: -71.6, updatedAt: entorno.reloj.ms };
  driver.lastSeenAt = entorno.reloj.ms;
  entorno.reloj.ms = HOY + DIA;
  const resumen = await entorno.servicio.runDriverFinancePass();
  assert.equal(resumen.inactivitySuspensions, 1, 'ninguna de esas cosas cuenta como carrera');
  assert.equal(driver.status, 'SUSPENDED');
});

test('los avisos previos llegan una vez cada uno, sin spam diario', async () => {
  const entorno = crearEntorno({ drivers: [conductor({ lastQualifyingTripAt: HOY - 23 * DIA, activityAnchorAt: HOY - 60 * DIA })] });
  await entorno.servicio.runDriverFinancePass();          // faltan 7 días → avisa
  await entorno.servicio.runDriverFinancePass();          // mismo día → calla
  assert.equal(avisosDe(entorno.avisos, 'driver_inactivity_warning').length, 1);

  entorno.reloj.ms = HOY + 4 * DIA;                       // faltan 3 → avisa de nuevo
  await entorno.servicio.runDriverFinancePass();
  assert.equal(avisosDe(entorno.avisos, 'driver_inactivity_warning').length, 2);
  entorno.reloj.ms = HOY + 5 * DIA;
  await entorno.servicio.runDriverFinancePass();
  assert.equal(avisosDe(entorno.avisos, 'driver_inactivity_warning').length, 2, 'no repite el mismo umbral');
});

// --------------------------------------------------------------------------
// Estado del bloqueo y suspensión temporal
// --------------------------------------------------------------------------

test('§14 · el bloqueo por deuda NO es una suspension de cuenta', async () => {
  const entorno = crearEntorno({ drivers: [conductor({ walletBalance: -5 })] });
  await entorno.servicio.runDriverFinancePass();
  const driver = entorno.database.users[0];
  assert.equal(driver.financialBlock.active, true);
  assert.equal(driver.financialBlock.reason, 'FINANCIAL_BALANCE_BLOCK');
  // Sigue siendo una cuenta viva: puede entrar, ver su deuda y recargar.
  assert.notEqual(driver.status, 'SUSPENDED');
  assert.equal(driver.accountStatus, 'ACTIVE');
  assert.equal(driver.isVerified, true);
  // Lo único que no puede es tomar trabajo nuevo.
  assert.equal(canTakeNewWork(driver, ACTIVO), false);

  // Recarga hasta 0.00: sigue bloqueado. Un céntimo más: libre.
  driver.walletBalance = 0;
  await entorno.servicio.runDriverFinancePass();
  assert.equal(driver.financialBlock.active, true, '$0.00 no basta');
  driver.walletBalance = 0.01;
  await entorno.servicio.runDriverFinancePass();
  assert.equal(driver.financialBlock.active, false);
  assert.equal(avisosDe(entorno.avisos, 'driver_financial_unblock').length, 1);
});

test('§27 · la suspension temporal NO frena el mantenimiento; la cuenta cerrada sí', async () => {
  const suspendido = crearEntorno({ drivers: [conductor({ walletBalance: 10, status: 'SUSPENDED' })] });
  await suspendido.servicio.runDriverFinancePass();
  suspendido.reloj.ms = HOY + 30 * DIA;
  await suspendido.servicio.runDriverFinancePass();
  assert.equal(suspendido.database.users[0].walletBalance, 9, 'sigue devengando su mantenimiento');

  const cerrada = crearEntorno({ drivers: [conductor({ walletBalance: 10, accountStatus: 'DISABLED' })] });
  await cerrada.servicio.runDriverFinancePass();
  cerrada.reloj.ms = HOY + 30 * DIA;
  await cerrada.servicio.runDriverFinancePass();
  assert.equal(cerrada.database.users[0].walletBalance, 10, 'una cuenta cerrada ya no devenga');
});

test('un conductor roto no tumba la pasada de los demas', async () => {
  const roto = { id: 'drv_roto', role: 'driver', accountStatus: 'ACTIVE' };
  Object.defineProperty(roto, 'walletBalance', { get() { throw new Error('documento corrupto'); } });
  const entorno = crearEntorno({ drivers: [roto, conductor({ id: 'drv_ok', walletBalance: 10 })] });
  const resumen = await entorno.servicio.runDriverFinancePass();
  assert.equal(resumen.errors, 1);
  assert.equal(resumen.driversSeen, 2);
  assert.ok(entorno.database.users[1].maintenance?.anchorAt, 'el sano se evaluó igual');
});

test('las constantes son las del dueno y viven en un solo sitio', () => {
  assert.equal(DRIVER_DEBT_LIMIT_USD, 5);
  assert.equal(DRIVER_MAINTENANCE_FEE_USD, 1);
  assert.equal(DRIVER_MAINTENANCE_INTERVAL_DAYS, 30);
  assert.equal(DRIVER_INACTIVITY_SUSPENSION_DAYS, 30);
  // Y el cobro nunca puede dejar a nadie por debajo del suelo.
  for (const saldo of [-4.99, -4.5, -4.01, -4, 0, 5]) {
    const { balanceAfter } = maintenanceCharge(conductor({ walletBalance: saldo }));
    assert.ok(balanceAfter >= -DRIVER_DEBT_LIMIT_USD, `saldo ${saldo} → ${balanceAfter}`);
  }
});
