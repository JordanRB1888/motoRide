import crypto from 'node:crypto';
import {
  DRIVER_FINANCE_REASON,
  DRIVER_MAINTENANCE_FEE_USD,
  DRIVER_MAINTENANCE_LABEL,
  DRIVER_MAINTENANCE_TRANSACTION_TYPE,
  INACTIVITY_LIMIT_MS,
  balanceOf,
  isDebtBlocked,
  maintenanceCharge,
  maintenanceDue,
  maintenanceIdempotencyKey,
  meetsReactivationBalance,
  pendingInactivityWarning,
  roundMoney,
  shouldSuspendForInactivity
} from '../domain/driverFinance.js';

/**
 * DRIVER-FINANCE-1 — el servicio que EJECUTA la política de cuenta del
 * conductor: cobra el mantenimiento, marca el bloqueo por deuda y suspende
 * por inactividad.
 *
 * Tres decisiones de fondo:
 *
 *  1. Un paso DIARIO acotado, no un barrido cada pocos segundos: la política
 *     se mide en meses, no en latidos.
 *  2. El fallo de un conductor no puede tumbar la pasada ni el servidor: cada
 *     uno se evalúa dentro de su propio try.
 *  3. Al estrenar la política NADIE recibe un cargo retroactivo. Un conductor
 *     sin ancla no «debe» los meses que lleva registrado: se le ancla HOY y
 *     su primer cobro llega dentro de 30 días. Lo mismo con la inactividad:
 *     el reloj empieza a correr al entrar en vigor, no hacia atrás. Es la
 *     única forma honesta de introducir una regla nueva sobre cuentas vivas.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export function resolveDriverFinanceIntervalMs(value = process.env.DRIVER_FINANCE_INTERVAL_MS) {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero <= 0) return DIA_MS;
  return Math.max(60_000, Math.floor(numero));
}

export function isDriverFinanceEnabled(value = process.env.DRIVER_FINANCE_ENABLED) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

export function createDriverFinanceService({
  database,
  persistRecord,
  notify = null,
  enabled = isDriverFinanceEnabled(),
  intervalMs = resolveDriverFinanceIntervalMs(),
  now = () => Date.now(),
  logger = console
} = {}) {
  if (!database) throw new Error('DRIVER_FINANCE_REQUIRES_DATABASE');
  if (typeof persistRecord !== 'function') throw new Error('DRIVER_FINANCE_REQUIRES_PERSIST');

  const users = () => database.users;
  const transactions = () => {
    if (!Array.isArray(database.transactions)) database.transactions = [];
    return database.transactions;
  };
  const conductores = () => users().filter(u => u?.role === 'driver');

  let timer = null;
  let corriendo = false;
  let pasadasSaltadas = 0;

  async function guardar(coleccion, doc) {
    try {
      return await persistRecord(coleccion, doc) !== false;
    } catch (error) {
      logger.error(`[+58express DriverFinance] no se pudo persistir ${coleccion}: ${error.message}`);
      return false;
    }
  }

  const avisar = async (userId, event, title, message) => {
    if (typeof notify !== 'function') return;
    try { await notify(userId, event, title, message); }
    catch (error) { logger.warn(`[+58express DriverFinance] aviso ${event} no entregado: ${error?.message ?? '?'}`); }
  };

  // -------------------------------------------------------------------------
  // Anclas: se fijan HACIA DELANTE la primera vez que se ve al conductor
  // -------------------------------------------------------------------------

  /**
   * Da al conductor sus dos relojes si no los tiene. Nunca mira al pasado:
   * el mantenimiento arranca hoy y la inactividad también, de modo que
   * estrenar la política no cobra meses viejos ni suspende a nadie de golpe.
   * Un conductor que YA venía completando carreras conserva su última carrera
   * como ancla de actividad si es posterior.
   */
  async function asegurarAnclas(driver, ahora) {
    let cambiado = false;
    if (!Number.isFinite(Number(driver.maintenance?.anchorAt))) {
      driver.maintenance = {
        anchorAt: ahora,
        lastChargedPeriod: 0,
        pendingPeriods: [],
        ...(driver.maintenance ?? {})
      };
      driver.maintenance.anchorAt = ahora;
      cambiado = true;
    }
    if (!Number.isFinite(Number(driver.activityAnchorAt))) {
      driver.activityAnchorAt = ahora;
      cambiado = true;
    }
    if (cambiado) await guardar('users', driver);
    return cambiado;
  }

  // -------------------------------------------------------------------------
  // Bloqueo por deuda
  // -------------------------------------------------------------------------

  /**
   * Sincroniza la marca de bloqueo con el saldo real. Es un estado propio,
   * NO una suspensión de cuenta: quien está bloqueado sigue entrando a la
   * app, viendo su deuda, su historial y su recarga — lo único que no puede
   * es tomar trabajo nuevo.
   */
  async function sincronizarBloqueo(driver, ahora = now()) {
    const bloqueadoAhora = driver.financialBlock?.active === true;
    if (!bloqueadoAhora && isDebtBlocked(driver)) {
      driver.financialBlock = {
        active: true,
        reason: DRIVER_FINANCE_REASON.FINANCIAL_BALANCE_BLOCK,
        since: new Date(ahora).toISOString(),
        balanceAtBlock: balanceOf(driver)
      };
      await guardar('users', driver);
      await avisar(driver.id, 'driver_financial_block',
        'Saldo pendiente',
        'Tu saldo llegó al límite. Debes pagar tu deuda y dejar tu saldo en positivo para volver a realizar carreras.');
      return 'blocked';
    }
    // Se levanta SOLO en positivo: saldar hasta 0.00 no basta.
    if (bloqueadoAhora && meetsReactivationBalance(driver)) {
      driver.financialBlock = { active: false, clearedAt: new Date(ahora).toISOString() };
      await guardar('users', driver);
      await avisar(driver.id, 'driver_financial_unblock',
        'Saldo al día',
        'Tu saldo volvió a positivo. Ya puedes recibir carreras otra vez.');
      return 'cleared';
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Mantenimiento mensual
  // -------------------------------------------------------------------------

  const yaCobrado = clave =>
    transactions().some(t => t.type === DRIVER_MAINTENANCE_TRANSACTION_TYPE && t.idempotencyKey === clave);

  /**
   * Cobra el mantenimiento del periodo vencido, si lo hay.
   *
   * Exactamente una vez por conductor y periodo: la clave durable vive EN la
   * transacción, así que un reinicio, un tick repetido o dos procesos a la
   * vez encuentran el cobro ya hecho y no lo repiten.
   *
   * Respeta el suelo de −$5: si el dólar no cabe entero, no se cobra y queda
   * anotado como pendiente (jamás se perdona ni se cobra a medias).
   */
  async function cobrarMantenimiento(driver, ahora, resumen) {
    const periodo = maintenanceDue(driver, ahora);
    if (periodo === null) return;
    const clave = maintenanceIdempotencyKey(driver.id, periodo);
    if (yaCobrado(clave)) {
      // Ya estaba cobrado por otra pasada: solo se pone al día el contador.
      if (Number(driver.maintenance.lastChargedPeriod ?? 0) < periodo) {
        driver.maintenance.lastChargedPeriod = periodo;
        await guardar('users', driver);
      }
      resumen.maintenanceAlreadyCharged += 1;
      return;
    }

    const { chargeable, pending, balanceAfter } = maintenanceCharge(driver);
    if (pending > 0) {
      const pendientes = new Set(driver.maintenance.pendingPeriods ?? []);
      if (pendientes.has(periodo)) return; // ya anotado y avisado
      pendientes.add(periodo);
      driver.maintenance.pendingPeriods = [...pendientes];
      if (!await guardar('users', driver)) return;
      resumen.maintenancePending += 1;
      await avisar(driver.id, 'driver_maintenance_pending',
        'Mantenimiento pendiente',
        `Tu mantenimiento mensual de $${DRIVER_MAINTENANCE_FEE_USD.toFixed(2)} está pendiente. Recarga tu saldo.`);
      return;
    }

    const anterior = balanceOf(driver);
    driver.walletBalance = balanceAfter;
    driver.maintenance.lastChargedPeriod = periodo;
    const transaccion = {
      id: `transaction_${crypto.randomUUID()}`,
      userId: driver.id,
      type: DRIVER_MAINTENANCE_TRANSACTION_TYPE,
      idempotencyKey: clave,
      maintenancePeriod: periodo,
      amount: -chargeable,
      description: DRIVER_MAINTENANCE_LABEL,
      currency: 'USD',
      status: 'APPROVED',
      balanceAfter,
      createdAt: new Date(ahora).toISOString()
    };
    transactions().push(transaccion);
    if (!await guardar('transactions', transaccion) || !await guardar('users', driver)) {
      // Vuelta atrás completa: ni saldo tocado ni transacción huérfana.
      driver.walletBalance = anterior;
      driver.maintenance.lastChargedPeriod = periodo - 1;
      const i = transactions().indexOf(transaccion);
      if (i >= 0) transactions().splice(i, 1);
      resumen.persistFailures += 1;
      return;
    }
    resumen.maintenanceCharged += 1;
    await avisar(driver.id, 'driver_maintenance_charged',
      DRIVER_MAINTENANCE_LABEL,
      `Se descontó $${chargeable.toFixed(2)} por el mantenimiento mensual de tu cuenta.`);
    await sincronizarBloqueo(driver, ahora);
  }

  /**
   * Cuando entra dinero, lo pendiente se pone al día: un solo cobro por cada
   * periodo que quedó a deber, y nunca dos veces el mismo.
   */
  async function conciliarPendientes(driver, ahora, resumen) {
    const pendientes = [...(driver.maintenance?.pendingPeriods ?? [])].sort((a, b) => a - b);
    if (!pendientes.length) return;
    const quedan = [];
    for (const periodo of pendientes) {
      const clave = maintenanceIdempotencyKey(driver.id, periodo);
      if (yaCobrado(clave)) continue;
      const { chargeable, pending, balanceAfter } = maintenanceCharge(driver);
      if (pending > 0) { quedan.push(periodo); continue; }
      const anterior = balanceOf(driver);
      driver.walletBalance = balanceAfter;
      const transaccion = {
        id: `transaction_${crypto.randomUUID()}`,
        userId: driver.id,
        type: DRIVER_MAINTENANCE_TRANSACTION_TYPE,
        idempotencyKey: clave,
        maintenancePeriod: periodo,
        amount: -chargeable,
        description: DRIVER_MAINTENANCE_LABEL,
        currency: 'USD',
        status: 'APPROVED',
        balanceAfter,
        createdAt: new Date(ahora).toISOString()
      };
      transactions().push(transaccion);
      if (!await guardar('transactions', transaccion)) {
        driver.walletBalance = anterior;
        transactions().splice(transactions().indexOf(transaccion), 1);
        quedan.push(periodo);
        resumen.persistFailures += 1;
        continue;
      }
      resumen.maintenanceReconciled += 1;
    }
    driver.maintenance.pendingPeriods = quedan;
    await guardar('users', driver);
  }

  // -------------------------------------------------------------------------
  // Inactividad
  // -------------------------------------------------------------------------

  async function evaluarInactividad(driver, ahora, resumen) {
    const aviso = pendingInactivityWarning(driver, ahora);
    if (aviso) {
      driver.inactivityWarnedThreshold = aviso.threshold;
      if (await guardar('users', driver)) {
        resumen.inactivityWarnings += 1;
        const limite = new Date(ahora + aviso.daysLeft * DIA_MS)
          .toLocaleDateString('es-VE', { day: 'numeric', month: 'long' });
        await avisar(driver.id, 'driver_inactivity_warning',
          'Tu cuenta lleva días sin actividad',
          `Completa una carrera antes del ${limite} para evitar la suspensión por inactividad.`);
      }
      return;
    }
    if (!shouldSuspendForInactivity(driver, ahora)) return;
    // Se usa la MISMA maquinaria de suspensión de siempre: no hay un segundo
    // sistema de cuentas suspendidas.
    driver.status = 'SUSPENDED';
    driver.suspensionReason = DRIVER_FINANCE_REASON.DRIVER_INACTIVITY_30_DAYS;
    driver.suspendedAt = new Date(ahora).toISOString();
    if (!await guardar('users', driver)) { resumen.persistFailures += 1; return; }
    resumen.inactivitySuspensions += 1;
    await avisar(driver.id, 'driver_inactivity_suspended',
      'Cuenta suspendida por inactividad',
      'Tu cuenta fue suspendida por 30 días sin carreras completadas. Contacta a soporte para reactivarla.');
  }

  // -------------------------------------------------------------------------
  // La pasada
  // -------------------------------------------------------------------------

  const resumenVacio = () => ({
    driversSeen: 0,
    anchorsCreated: 0,
    maintenanceCharged: 0,
    maintenancePending: 0,
    maintenanceReconciled: 0,
    maintenanceAlreadyCharged: 0,
    inactivityWarnings: 0,
    inactivitySuspensions: 0,
    blocksApplied: 0,
    blocksCleared: 0,
    persistFailures: 0,
    errors: 0
  });

  async function runDriverFinancePass() {
    const ahora = now();
    const resumen = resumenVacio();
    for (const driver of [...conductores()]) {
      resumen.driversSeen += 1;
      try {
        // Una cuenta cerrada de verdad deja de devengar: la política es para
        // cuentas vivas, aunque estén temporalmente suspendidas.
        if (driver.accountStatus === 'DISABLED') continue;
        if (await asegurarAnclas(driver, ahora)) resumen.anchorsCreated += 1;
        await conciliarPendientes(driver, ahora, resumen);
        await cobrarMantenimiento(driver, ahora, resumen);
        const cambio = await sincronizarBloqueo(driver, ahora);
        if (cambio === 'blocked') resumen.blocksApplied += 1;
        if (cambio === 'cleared') resumen.blocksCleared += 1;
        await evaluarInactividad(driver, ahora, resumen);
      } catch (error) {
        resumen.errors += 1;
        logger.error(`[+58express DriverFinance] fallo evaluando un conductor: ${error.message}`);
      }
    }
    return resumen;
  }

  /**
   * Marca la carrera COMPLETADA como actividad. Es el ÚNICO camino que
   * reinicia el reloj de inactividad — y no toca el del mantenimiento, que
   * corre por su cuenta.
   */
  async function registerQualifyingTrip(driver, atMs = now()) {
    if (!driver || driver.role !== 'driver') return false;
    driver.lastQualifyingTripAt = atMs;
    driver.inactivityWarnedThreshold = null;
    return guardar('users', driver);
  }

  function start() {
    if (!enabled || timer) return false;
    timer = setInterval(() => {
      if (corriendo) { pasadasSaltadas += 1; return; }
      corriendo = true;
      runDriverFinancePass()
        .catch(error => logger.error(`[+58express DriverFinance] pasada fallida: ${error.message}`))
        .finally(() => { corriendo = false; });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    logger.log(`[+58express DriverFinance] evaluación armada cada ${Math.round(intervalMs / 1000)}s`);
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    enabled,
    intervalMs,
    runDriverFinancePass,
    registerQualifyingTrip,
    syncFinancialBlock: sincronizarBloqueo,
    ensureAnchors: asegurarAnclas,
    start,
    stop,
    skippedPasses: () => pasadasSaltadas
  };
}

export { INACTIVITY_LIMIT_MS, roundMoney };
