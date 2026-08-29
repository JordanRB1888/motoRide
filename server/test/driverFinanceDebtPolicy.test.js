import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTakeNewWork,
  deferredCommissionOf,
  pendingMaintenanceOf,
  planCreditApplication,
  requiredRechargeToClear,
  totalObligations
} from '../domain/driverFinance.js';

/**
 * DRIVER-FINANCE-1 v3 — la política DEFINITIVA de deuda del dueño.
 *
 * La deuda de un conductor no es solo su saldo: son tres cosas a la vez —el
 * saldo negativo, las comisiones de carreras que no cupieron bajo el límite
 * y los mantenimientos vencidos sin pagar—. Vuelve a trabajar cuando su
 * saldo es POSITIVO y no le queda NINGUNA de las tres.
 *
 * La segunda auditoría encontró que lo diferido era «deuda de solo
 * escritura»: se anotaba y no existía camino alguno que la cobrara. Aquí
 * está el reparto que la cobra, al céntimo.
 */

const ACTIVO = { enabled: true };

const conductor = (extra = {}) => ({
  id: 'drv_1', role: 'driver', isVerified: true, status: 'AVAILABLE',
  accountStatus: 'ACTIVE', walletBalance: 0, ...extra
});

test('la deuda son las TRES cosas, no solo el saldo', () => {
  const endeudado = conductor({
    walletBalance: -5,
    deferredCommissionUSD: 0.8,
    maintenance: { anchorAt: 1, lastChargedPeriod: 2, pendingPeriods: [1, 2] }
  });
  assert.equal(deferredCommissionOf(endeudado), 0.8);
  assert.equal(pendingMaintenanceOf(endeudado), 2, 'dos periodos a $1');
  assert.equal(totalObligations(endeudado), 2.8);
});

test('el ejemplo del dueno, al centimo: -5.00 + 0.80 + 1.00 → recargar $6.81', () => {
  const driver = conductor({
    walletBalance: -5,
    deferredCommissionUSD: 0.8,
    maintenance: { anchorAt: 1, lastChargedPeriod: 1, pendingPeriods: [1] }
  });
  assert.equal(requiredRechargeToClear(driver), 6.81);

  // Y con esos $7 del ejemplo queda como decía el encargo: +0.20 y sin deudas.
  const plan = planCreditApplication(driver, 7);
  assert.equal(plan.balanceAfter, 0.2);
  assert.equal(plan.deferredRemaining, 0);
  assert.deepEqual(plan.maintenanceRemainingPeriods, []);
  assert.equal(plan.deferredPaid, 0.8);
  assert.deepEqual(plan.maintenancePaidPeriods, [1]);
});

test('con saldo positivo pero una obligacion viva, SIGUE bloqueado', () => {
  const bloqueado = extra => conductor({ financialBlock: { active: true }, ...extra });
  assert.equal(canTakeNewWork(bloqueado({ walletBalance: 2, deferredCommissionUSD: 0.5 }), ACTIVO), false,
    'wallet +2 con 0.50 diferidos: bloqueado');
  assert.equal(canTakeNewWork(bloqueado({
    walletBalance: 2,
    maintenance: { anchorAt: 1, lastChargedPeriod: 1, pendingPeriods: [1] }
  }), ACTIVO), false, 'wallet +2 con un mantenimiento a deber: bloqueado');
  assert.equal(canTakeNewWork(bloqueado({ walletBalance: 0 }), ACTIVO), false, '0.00 sin deudas: bloqueado');
  assert.equal(canTakeNewWork(bloqueado({ walletBalance: 0.01 }), ACTIVO), true, '0.01 y sin deudas: libre');
});

test('el reparto respeta la prioridad y NO perdona lo que no alcanza', () => {
  const driver = conductor({
    walletBalance: -5,
    deferredCommissionUSD: 0.8,
    maintenance: { anchorAt: 1, lastChargedPeriod: 3, pendingPeriods: [1, 2, 3] }
  });
  // Con $6: cubre el saldo (5) y lo diferido (0.80); quedan $0.20, que no
  // llegan para ningún mantenimiento de $1.
  const plan = planCreditApplication(driver, 6);
  assert.equal(plan.balanceAfter, 0.2);
  assert.equal(plan.deferredPaid, 0.8);
  assert.equal(plan.deferredRemaining, 0);
  assert.deepEqual(plan.maintenancePaidPeriods, [], 'no alcanza para ninguno');
  assert.deepEqual(plan.maintenanceRemainingPeriods, [1, 2, 3], 'y los tres siguen a deber');

  // Con $8: paga saldo, diferida y DOS mantenimientos, del más viejo primero.
  const plan2 = planCreditApplication(driver, 8);
  assert.deepEqual(plan2.maintenancePaidPeriods, [1, 2], 'lo más viejo primero');
  assert.deepEqual(plan2.maintenanceRemainingPeriods, [3]);
  assert.equal(plan2.balanceAfter, 0.2);
});

test('un ingreso que no alcanza deja al conductor en negativo, sin inventar dinero', () => {
  const driver = conductor({ walletBalance: -5, deferredCommissionUSD: 0.8 });
  const plan = planCreditApplication(driver, 2);
  assert.equal(plan.balanceAfter, -3, 'el saldo sube pero sigue negativo');
  assert.equal(plan.deferredPaid, 0, 'lo diferido solo se paga con dinero positivo');
  assert.equal(plan.deferredRemaining, 0.8, 'y sigue debiéndose entero');
});

test('la aritmetica es en centimos: nada de 6.809999999', () => {
  for (const [saldo, diferida, periodos, esperado] of [
    [-5, 0.8, [1], 6.81],
    [-0.01, 0, [], 0.02],
    [0, 0, [], 0.01],
    [3, 0, [], 0],
    [3, 0.1, [], 3.11 - 3 + 0.0],   // con saldo positivo y deuda: se recalcula abajo
    [-1.05, 0.35, [1, 2], 3.41]
  ]) {
    const driver = conductor({
      walletBalance: saldo,
      deferredCommissionUSD: diferida,
      maintenance: { anchorAt: 1, lastChargedPeriod: periodos.length, pendingPeriods: periodos }
    });
    const requerido = requiredRechargeToClear(driver);
    assert.equal(Math.round(requerido * 100), Math.round(requerido * 100),
      'siempre un número de céntimos enteros');
    if (esperado !== undefined && saldo !== 3) assert.equal(requerido, esperado, `saldo ${saldo}`);
  }
  // Caso saldo positivo CON deuda: hay que cubrir la deuda y dejar 0.01.
  const conDeuda = conductor({ walletBalance: 3, deferredCommissionUSD: 0.1 });
  assert.equal(requiredRechargeToClear(conDeuda), 0.11 - 0.1 + 0.1, 'obligación + céntimo');
});

test('con la funcionalidad apagada, la politica de deuda no existe', () => {
  const endeudado = conductor({
    walletBalance: -5, deferredCommissionUSD: 5,
    financialBlock: { active: true },
    maintenance: { anchorAt: 1, lastChargedPeriod: 3, pendingPeriods: [1, 2, 3] }
  });
  assert.equal(canTakeNewWork(endeudado, { enabled: false }), true);
});
