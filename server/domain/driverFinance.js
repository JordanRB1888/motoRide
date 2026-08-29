/**
 * DRIVER-FINANCE-1 — economía de la CUENTA del conductor: hasta dónde puede
 * endeudarse, qué le cuesta mantener la cuenta abierta y cuándo se le
 * considera inactivo.
 *
 * Este módulo es PURO a propósito: decide, no muta ni escribe. El servicio
 * que lo usa es quien cobra, suspende y avisa. Así las reglas de dinero se
 * pueden razonar y probar sin base de datos, sin reloj y sin red.
 *
 * Las cuatro constantes viven aquí y solo aquí: ningún módulo puede tener su
 * propia idea de cuánto se cobra ni de cuándo se bloquea a alguien.
 */

/**
 * La bandera de la funcionalidad vive en el modulo PURO, no solo en el
 * planificador. Antes solo apagaba el paso periodico: los filtros del
 * despacho y del Transporte Seguro seguian aplicando la politica con la
 * bandera en falso, asi que un dato viejo de saldo podia rechazar carreras
 * de un sistema que se creia intacto. Con esto, apagada = inerte de verdad.
 */
export function isDriverFinanceEnabled(value = process.env.DRIVER_FINANCE_ENABLED) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

export const DRIVER_DEBT_LIMIT_USD = 5;
export const DRIVER_MAINTENANCE_FEE_USD = 1;
export const DRIVER_MAINTENANCE_INTERVAL_DAYS = 30;
export const DRIVER_INACTIVITY_SUSPENSION_DAYS = 30;

export const DRIVER_FINANCE_REASON = Object.freeze({
  FINANCIAL_BALANCE_BLOCK: 'FINANCIAL_BALANCE_BLOCK',
  DRIVER_INACTIVITY_30_DAYS: 'DRIVER_INACTIVITY_30_DAYS'
});

/** Tipo semántico de la transacción. JAMÁS se etiqueta como comisión de viaje:
 *  es lo que cuesta tener la cuenta abierta, no lo que cuesta una carrera. */
export const DRIVER_MAINTENANCE_TRANSACTION_TYPE = 'DRIVER_ACCOUNT_MAINTENANCE';
export const DRIVER_MAINTENANCE_LABEL = 'Mantenimiento de cuenta';

const DIA_MS = 24 * 60 * 60 * 1000;
export const MAINTENANCE_INTERVAL_MS = DRIVER_MAINTENANCE_INTERVAL_DAYS * DIA_MS;
export const INACTIVITY_LIMIT_MS = DRIVER_INACTIVITY_SUSPENSION_DAYS * DIA_MS;

/** El dinero se compara y se guarda en centavos redondeados: nada de sumar
 *  flotantes y descubrir un -5.000000001 que bloquee a alguien por un error
 *  de representación. */
export const roundMoney = value =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const balanceOf = driver => roundMoney(Number(driver?.walletBalance ?? 0));

/**
 * ¿Está bloqueado por deuda? El límite es DURO y por igualdad: exactamente
 * −$5.00 ya bloquea (el encargo lo fija así: «at balance <= -5.00»).
 */
export function isDebtBlocked(driver, { enabled = isDriverFinanceEnabled() } = {}) {
  if (!enabled) return false;
  return balanceOf(driver) <= -DRIVER_DEBT_LIMIT_USD;
}

/**
 * Para volver a trabajar no basta con saldar la deuda: hay que quedar en
 * POSITIVO. $0.00 exacto NO alcanza — es la regla del dueño, y es la que
 * separa «ya no debo» de «puedo empezar a rodar».
 */
export function meetsReactivationBalance(driver) {
  return balanceOf(driver) > 0;
}

/**
 * ¿Puede tomar trabajo NUEVO? Combina las dos puertas:
 *  · quien está bloqueado sigue bloqueado hasta quedar en positivo;
 *  · quien nunca lo estuvo solo necesita no haber tocado el límite.
 * Un saldo de $0.00 es normal para quien jamás se bloqueó (un conductor
 * recién aprobado empieza justo ahí) y sigue siendo bloqueo para quien
 * arrastra la marca.
 */
export function canTakeNewWork(driver, { enabled = isDriverFinanceEnabled() } = {}) {
  // Con la funcionalidad apagada nadie queda fuera por dinero: el sistema se
  // comporta exactamente como antes de DRIVER-FINANCE-1.
  if (!enabled) return true;
  if (driver?.financialBlock?.active === true) return meetsReactivationBalance(driver);
  return !isDebtBlocked(driver, { enabled });
}

/** Lo que le falta para volver a ser elegible: el primer céntimo por encima
 *  de cero. Sirve para decírselo con un número exacto, no con un «recarga». */
export function amountToRegainEligibility(driver) {
  const saldo = balanceOf(driver);
  if (saldo > 0) return 0;
  return roundMoney(-saldo + 0.01);
}

/**
 * Puerta de la comisión PROYECTADA (encargo §10): antes de dejarle empezar
 * una carrera en efectivo se mira dónde quedaría su saldo DESPUÉS de pagar
 * la comisión de esa carrera. Si el resultado cruza el suelo, no empieza.
 * Así el sistema no fabrica deuda que él no podría haber previsto.
 */
export function wouldBreachFloor(driver, projectedCommissionUSD, { enabled = isDriverFinanceEnabled() } = {}) {
  if (!enabled) return false;
  const comision = roundMoney(Math.max(0, Number(projectedCommissionUSD) || 0));
  if (comision === 0) return false;
  // Lo ya COMPROMETIDO cuenta: son comisiones de carreras aceptadas que aun
  // no se han liquidado, y el suelo debe mirarlas o dos carreras simultaneas
  // se apoyarian las dos en el mismo saldo.
  return roundMoney(availableBalance(driver) - comision) < -DRIVER_DEBT_LIMIT_USD;
}

/** Comision de carreras ya aceptadas y todavia sin liquidar. */
export const committedCommissionOf = driver =>
  roundMoney(Math.max(0, Number(driver?.committedCommission ?? 0)));

/** El saldo del que se puede disponer de verdad. */
export const availableBalance = driver =>
  roundMoney(balanceOf(driver) - committedCommissionOf(driver));

/**
 * Cuanto se puede debitar sin cruzar el suelo, y cuanto queda a deber.
 * La liquidacion NUNCA escribe por debajo de -5: si la comision no cabe
 * entera, se aplica hasta el suelo y el resto queda como obligacion
 * auditable de la plataforma sobre ese conductor.
 */
export function commissionWithinFloor(driver, commissionUSD) {
  const comision = roundMoney(Math.max(0, Number(commissionUSD) || 0));
  const margen = roundMoney(balanceOf(driver) + DRIVER_DEBT_LIMIT_USD);
  const aplicable = roundMoney(Math.max(0, Math.min(comision, margen)));
  return { applied: aplicable, deferred: roundMoney(comision - aplicable) };
}

// ---------------------------------------------------------------------------
// Mantenimiento mensual
// ---------------------------------------------------------------------------

/**
 * El periodo de mantenimiento al que pertenece un instante, contado en
 * ventanas de 30 días desde el ancla del conductor. Es un entero: sirve de
 * clave de idempotencia («este conductor, este periodo, una sola vez»).
 */
export function maintenancePeriodAt(anchorMs, atMs) {
  if (!Number.isFinite(anchorMs) || !Number.isFinite(atMs)) return null;
  if (atMs < anchorMs) return 0;
  return Math.floor((atMs - anchorMs) / MAINTENANCE_INTERVAL_MS);
}

/** Clave durable del cobro. No viaja al cliente: vive en la transacción. */
export const maintenanceIdempotencyKey = (driverId, period) =>
  `driver-maintenance:${driverId}:${period}`;

/**
 * ¿Le toca pagar? Solo cuando ha cerrado al menos una ventana completa desde
 * el ancla Y ese periodo no está ya cobrado. Nunca cobra el periodo 0: el
 * primer cobro llega a los 30 días de tener la cuenta anclada, jamás el
 * mismo día en que se pone en marcha la política.
 */
export function maintenanceDue(driver, nowMs) {
  const [primero] = maintenanceDuePeriods(driver, nowMs);
  return primero ?? null;
}

/**
 * TODOS los periodos vencidos y sin cobrar, del mas viejo al mas nuevo.
 *
 * Antes se devolvia solo el periodo actual y el contador saltaba hasta el:
 * si el servicio pasaba 95 dias sin evaluar, dos meses de mantenimiento se
 * perdian en silencio. Una obligacion no se olvida porque el planificador
 * estuviera dormido.
 */
export function maintenanceDuePeriods(driver, nowMs) {
  const anchor = Number(driver?.maintenance?.anchorAt);
  if (!Number.isFinite(anchor)) return [];
  const actual = maintenancePeriodAt(anchor, nowMs);
  if (actual === null || actual < 1) return [];
  const ultimo = Number(driver?.maintenance?.lastChargedPeriod ?? 0);
  const desde = Number.isFinite(ultimo) ? Math.max(0, ultimo) : 0;
  if (desde >= actual) return [];
  const pendientes = new Set((driver?.maintenance?.pendingPeriods ?? []).map(Number));
  const periodos = [];
  for (let periodo = desde + 1; periodo <= actual; periodo += 1) {
    if (!pendientes.has(periodo)) periodos.push(periodo);
  }
  return periodos;
}

/**
 * Cuánto se puede cobrar sin romper el suelo de −$5.
 *
 * Devuelve el importe cobrable y si queda deuda pendiente. Es todo o nada a
 * propósito: un cobro parcial de $0.37 sería incomprensible en el historial
 * de alguien. Si no cabe entero, no se cobra y la obligación queda anotada
 * como pendiente — nunca se perdona en silencio.
 */
export function maintenanceCharge(driver) {
  const saldo = balanceOf(driver);
  const cabe = roundMoney(saldo - DRIVER_MAINTENANCE_FEE_USD) >= -DRIVER_DEBT_LIMIT_USD;
  return cabe
    ? { chargeable: DRIVER_MAINTENANCE_FEE_USD, pending: 0, balanceAfter: roundMoney(saldo - DRIVER_MAINTENANCE_FEE_USD) }
    : { chargeable: 0, pending: DRIVER_MAINTENANCE_FEE_USD, balanceAfter: saldo };
}

/** Cuándo le toca el próximo mantenimiento (para contárselo, no para cobrar). */
export function nextMaintenanceAt(driver) {
  const anchor = Number(driver?.maintenance?.anchorAt);
  if (!Number.isFinite(anchor)) return null;
  const cobrados = Number(driver?.maintenance?.lastChargedPeriod ?? 0);
  return anchor + (Math.max(0, cobrados) + 1) * MAINTENANCE_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Inactividad
// ---------------------------------------------------------------------------

/**
 * El reloj de la inactividad. Solo lo reinicia una carrera COMPLETADA de
 * verdad: ni abrir la app, ni ponerse en línea, ni aceptar una oferta, ni
 * pagar el mantenimiento. Y por eso vive en su propio campo, separado del
 * mantenimiento: son dos relojes que nunca se tocan.
 */
export function inactivityAnchorOf(driver) {
  const ultimo = Number(driver?.lastQualifyingTripAt);
  const alta = Number(driver?.activityAnchorAt);
  const candidatos = [ultimo, alta].filter(Number.isFinite);
  if (!candidatos.length) return null;
  // El MAS RECIENTE de los dos, no el ultimo viaje a secas. Asi la gracia de
  // estreno (y la que concede una reactivacion administrativa) manda sobre un
  // historial viejo: nadie se suspende el dia que la politica entra en vigor
  // por carreras que dejo de hacer cuando esta regla ni existia.
  return Math.max(...candidatos);
}

export function inactivityDeadline(driver) {
  const ancla = inactivityAnchorOf(driver);
  return ancla === null ? null : ancla + INACTIVITY_LIMIT_MS;
}

/** Días enteros que le quedan antes de la suspensión (para los avisos). */
export function daysUntilInactivitySuspension(driver, nowMs) {
  const limite = inactivityDeadline(driver);
  if (limite === null) return null;
  return Math.ceil((limite - nowMs) / DIA_MS);
}

/**
 * ¿Debe suspenderse ya? A los 30 días CUMPLIDOS sin carrera completada. Una
 * cuenta ya suspendida o deshabilitada no se vuelve a suspender.
 */
export function shouldSuspendForInactivity(driver, nowMs, { enabled = isDriverFinanceEnabled() } = {}) {
  if (!enabled) return false;
  if (driver?.role !== 'driver') return false;
  if (driver.accountStatus === 'DISABLED' || driver.status === 'SUSPENDED') return false;
  const limite = inactivityDeadline(driver);
  return limite !== null && nowMs >= limite;
}

/**
 * Los avisos previos, en días restantes. Se dan UNA vez cada uno: el umbral
 * ya avisado queda anotado, así que el paso diario no repite el mismo aviso
 * ni convierte la advertencia en spam.
 */
/**
 * Concede una ventana NUEVA de inactividad. La usan las dos rutas por las que
 * una administracion puede reactivar a un conductor: sin esto, el paso
 * siguiente lo volveria a suspender contra el mismo plazo ya vencido.
 *
 * No toca el calendario del mantenimiento (relojes independientes) ni levanta
 * el bloqueo por deuda: quien debe sigue sin trabajar hasta quedar positivo.
 */
export function applyInactivityGrace(driver, atMs) {
  if (!driver || driver.role !== 'driver' || !Number.isFinite(Number(atMs))) return false;
  driver.activityAnchorAt = Number(atMs);
  driver.inactivityWarnedThreshold = null;
  if (driver.suspensionReason === DRIVER_FINANCE_REASON.DRIVER_INACTIVITY_30_DAYS) {
    driver.suspensionReason = null;
  }
  return true;
}

export const INACTIVITY_WARNING_DAYS = Object.freeze([7, 3, 1]);

export function pendingInactivityWarning(driver, nowMs) {
  const restantes = daysUntilInactivitySuspension(driver, nowMs);
  if (restantes === null || restantes <= 0) return null;
  // El umbral MÁS ajustado que ya se cumple: con 3 días restantes toca el
  // aviso de «3», no el de «7» que también encajaría. La lista va de mayor a
  // menor, así que el último que cumple es el más urgente.
  const umbral = INACTIVITY_WARNING_DAYS.findLast(dias => restantes <= dias);
  if (umbral === undefined) return null;
  const avisado = Number(driver?.inactivityWarnedThreshold);
  // Los umbrales bajan (7 → 3 → 1): solo avisa si este es MÁS urgente que el
  // último ya avisado.
  if (Number.isFinite(avisado) && avisado <= umbral) return null;
  return { threshold: umbral, daysLeft: restantes };
}
