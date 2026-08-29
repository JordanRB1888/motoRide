import {
  DRIVER_FINANCE_REASON,
  DRIVER_MAINTENANCE_FEE_USD,
  DRIVER_MAINTENANCE_LABEL,
  DRIVER_MAINTENANCE_TRANSACTION_TYPE,
  INACTIVITY_LIMIT_MS,
  balanceOf,
  isDebtBlocked,
  isDriverFinanceEnabled,
  maintenanceCharge,
  maintenanceDuePeriods,
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
 * Cuatro decisiones de fondo, y las tres últimas nacieron de una auditoría
 * independiente que encontró exactamente estos agujeros:
 *
 *  1. Un paso DIARIO acotado, no un barrido cada pocos segundos: la política
 *     se mide en meses, no en latidos.
 *  2. El cobro mensual se apoya en la BASE DE DATOS, no en una lectura
 *     previa: identificador determinista + clave primaria + una sola
 *     transacción para el apunte y el débito. Dos procesos no pueden cobrar
 *     el mismo mes, y no existe el estado «apuntado pero no cobrado».
 *  3. Nada se da por hecho en memoria: si la escritura falla, el estado en
 *     memoria vuelve atrás y la obligación sigue viva para la próxima pasada.
 *  4. Al estrenar la política NADIE recibe un cargo retroactivo NI una
 *     suspensión: todos los conductores existentes estrenan 30 días de
 *     gracia. Es la única forma honesta de introducir una regla nueva sobre
 *     cuentas vivas.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export function resolveDriverFinanceIntervalMs(value = process.env.DRIVER_FINANCE_INTERVAL_MS) {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero <= 0) return DIA_MS;
  return Math.max(60_000, Math.floor(numero));
}

export { isDriverFinanceEnabled };

export function createDriverFinanceService({
  database,
  persistRecord,
  // Operaciones ATÓMICAS de la capa de persistencia. Sin ellas el servicio
  // sigue funcionando (desarrollo, pruebas puras), pero entonces la unicidad
  // del cobro se apoya solo en la cola de escritura de este proceso.
  persistence = null,
  notify = null,
  enabled = isDriverFinanceEnabled(),
  intervalMs = resolveDriverFinanceIntervalMs(),
  now = () => Date.now(),
  logger = console
} = {}) {
  if (!database) throw new Error('DRIVER_FINANCE_REQUIRES_DATABASE');
  if (typeof persistRecord !== 'function') throw new Error('DRIVER_FINANCE_REQUIRES_PERSIST');

  const opciones = { enabled };
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

  /** Entrega el aviso y dice si llegó. Un aviso que no se entrega no se marca
   *  como dado: así el próximo paso lo reintenta en vez de perderlo. */
  async function avisar(userId, event, title, message) {
    if (typeof notify !== 'function') return true;
    try { await notify(userId, event, title, message); return true; }
    catch (error) {
      logger.warn(`[+58express DriverFinance] aviso ${event} no entregado: ${error?.message ?? '?'}`);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Anclas: se fijan HACIA DELANTE y solo cuentan si se pudieron guardar
  // -------------------------------------------------------------------------

  /**
   * Da al conductor sus dos relojes si no los tiene. Nunca mira al pasado: el
   * mantenimiento arranca hoy y la inactividad también, de modo que estrenar
   * la política no cobra meses viejos ni suspende a nadie por carreras que
   * dejó de hacer cuando esta regla ni existía.
   *
   * Si la escritura falla, el documento vuelve a su estado anterior y se
   * devuelve `false`: el evaluador NO puede tratar como establecido un ancla
   * que no llegó al disco, porque un reinicio la movería y con ella el primer
   * cobro de alguien.
   */
  async function asegurarAnclas(driver, ahora) {
    const faltaMantenimiento = !Number.isFinite(Number(driver.maintenance?.anchorAt));
    const faltaActividad = !Number.isFinite(Number(driver.activityAnchorAt));
    if (!faltaMantenimiento && !faltaActividad) return true;

    const previo = {
      maintenance: driver.maintenance ? { ...driver.maintenance } : undefined,
      activityAnchorAt: driver.activityAnchorAt
    };
    if (faltaMantenimiento) {
      driver.maintenance = {
        pendingPeriods: [],
        ...(driver.maintenance ?? {}),
        anchorAt: ahora,
        lastChargedPeriod: Number(driver.maintenance?.lastChargedPeriod ?? 0)
      };
    }
    if (faltaActividad) driver.activityAnchorAt = ahora;

    if (await guardar('users', driver)) return true;
    // Vuelta atrás: sin ancla durable no hay política que aplicar todavía.
    if (previo.maintenance === undefined) delete driver.maintenance;
    else driver.maintenance = previo.maintenance;
    if (previo.activityAnchorAt === undefined) delete driver.activityAnchorAt;
    else driver.activityAnchorAt = previo.activityAnchorAt;
    return false;
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
    if (!enabled) return null;
    const bloqueadoAhora = driver.financialBlock?.active === true;
    if (!bloqueadoAhora && isDebtBlocked(driver, opciones)) {
      const previo = driver.financialBlock;
      driver.financialBlock = {
        active: true,
        reason: DRIVER_FINANCE_REASON.FINANCIAL_BALANCE_BLOCK,
        since: new Date(ahora).toISOString(),
        balanceAtBlock: balanceOf(driver)
      };
      if (!await guardar('users', driver)) { driver.financialBlock = previo; return null; }
      await avisar(driver.id, 'driver_financial_block',
        'Saldo pendiente',
        'Tu saldo llegó al límite. Debes pagar tu deuda y dejar tu saldo en positivo para volver a realizar carreras.');
      return 'blocked';
    }
    // Se levanta SOLO en positivo: saldar hasta 0.00 no basta.
    if (bloqueadoAhora && meetsReactivationBalance(driver)) {
      const previo = driver.financialBlock;
      driver.financialBlock = { active: false, clearedAt: new Date(ahora).toISOString() };
      if (!await guardar('users', driver)) { driver.financialBlock = previo; return null; }
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

  /** Identificador DETERMINISTA: es la clave primaria de la transacción, y por
   *  tanto la que impide dos cobros del mismo mes al mismo conductor. */
  const idDeCobro = (driverId, periodo) => `transaction_maint_${driverId}_${periodo}`;

  const cobroRegistrado = (driverId, periodo) => {
    const id = idDeCobro(driverId, periodo);
    return transactions().some(t => t.id === id);
  };

  function construirTransaccion(driver, periodo, importe, saldoDespues, ahora) {
    return {
      id: idDeCobro(driver.id, periodo),
      userId: driver.id,
      type: DRIVER_MAINTENANCE_TRANSACTION_TYPE,
      idempotencyKey: maintenanceIdempotencyKey(driver.id, periodo),
      maintenancePeriod: periodo,
      amount: -importe,
      description: DRIVER_MAINTENANCE_LABEL,
      currency: 'USD',
      status: 'APPROVED',
      balanceAfter: saldoDespues,
      createdAt: new Date(ahora).toISOString()
    };
  }

  /**
   * Cobra UN periodo. El apunte y el débito viajan juntos: o entran los dos o
   * no entra ninguno. Devuelve qué pasó, para que quien llama decida.
   */
  async function cobrarPeriodo(driver, periodo, ahora) {
    const { chargeable, pending, balanceAfter } = maintenanceCharge(driver);
    if (pending > 0) return 'FLOOR';

    const transaccion = construirTransaccion(driver, periodo, chargeable, balanceAfter, ahora);
    const saldoPrevio = driver.walletBalance;
    const periodoPrevio = driver.maintenance.lastChargedPeriod;
    driver.walletBalance = balanceAfter;
    driver.maintenance.lastChargedPeriod = Math.max(Number(periodoPrevio ?? 0), periodo);

    let resultado;
    if (typeof persistence?.chargeDriverMaintenance === 'function') {
      resultado = await persistence.chargeDriverMaintenance({ transaction: transaccion, driver });
    } else {
      // Sin operación atómica disponible: el apunte primero y el estado
      // después, con la misma vuelta atrás en memoria.
      const ok = await guardar('transactions', transaccion) && await guardar('users', driver);
      resultado = ok ? 'CHARGED' : 'FAILED';
    }

    if (resultado === 'CHARGED') {
      transactions().push(transaccion);
      return 'CHARGED';
    }
    // Ni cobrado ni apuntado: se deshace lo de memoria y se reintentará.
    driver.walletBalance = saldoPrevio;
    driver.maintenance.lastChargedPeriod = periodoPrevio;
    if (resultado === 'ALREADY_CHARGED') {
      // Otro proceso ya lo cobró: aquí solo se pone al día el contador.
      if (Number(driver.maintenance.lastChargedPeriod ?? 0) < periodo) {
        driver.maintenance.lastChargedPeriod = periodo;
        await guardar('users', driver);
      }
      return 'ALREADY_CHARGED';
    }
    return 'FAILED';
  }

  /** Anota el periodo como pendiente (no cabe bajo el suelo) y avisa una vez. */
  async function anotarPendiente(driver, periodo, resumen) {
    const pendientes = new Set((driver.maintenance.pendingPeriods ?? []).map(Number));
    if (pendientes.has(periodo)) return;
    pendientes.add(periodo);
    const previo = driver.maintenance.pendingPeriods;
    driver.maintenance.pendingPeriods = [...pendientes].sort((a, b) => a - b);
    // El contador avanza igual: el periodo queda registrado como obligación,
    // no como algo por evaluar de nuevo.
    const periodoPrevio = driver.maintenance.lastChargedPeriod;
    driver.maintenance.lastChargedPeriod = Math.max(Number(periodoPrevio ?? 0), periodo);
    if (!await guardar('users', driver)) {
      driver.maintenance.pendingPeriods = previo;
      driver.maintenance.lastChargedPeriod = periodoPrevio;
      resumen.persistFailures += 1;
      return;
    }
    resumen.maintenancePending += 1;
    await avisar(driver.id, 'driver_maintenance_pending',
      'Mantenimiento pendiente',
      `Tu mantenimiento mensual de $${DRIVER_MAINTENANCE_FEE_USD.toFixed(2)} está pendiente. Recarga tu saldo.`);
  }

  /**
   * Todos los periodos vencidos, del más viejo al más nuevo. Un servicio que
   * estuvo dormido tres meses debe TRES obligaciones, no una.
   */
  async function cobrarMantenimiento(driver, ahora, resumen) {
    for (const periodo of maintenanceDuePeriods(driver, ahora)) {
      if (cobroRegistrado(driver.id, periodo)) {
        if (Number(driver.maintenance.lastChargedPeriod ?? 0) < periodo) {
          driver.maintenance.lastChargedPeriod = periodo;
          await guardar('users', driver);
        }
        resumen.maintenanceAlreadyCharged += 1;
        continue;
      }
      const resultado = await cobrarPeriodo(driver, periodo, ahora);
      if (resultado === 'CHARGED') {
        resumen.maintenanceCharged += 1;
        await avisar(driver.id, 'driver_maintenance_charged',
          DRIVER_MAINTENANCE_LABEL,
          `Se descontó $${DRIVER_MAINTENANCE_FEE_USD.toFixed(2)} por el mantenimiento mensual de tu cuenta.`);
        await sincronizarBloqueo(driver, ahora);
      } else if (resultado === 'ALREADY_CHARGED') {
        resumen.maintenanceAlreadyCharged += 1;
      } else if (resultado === 'FLOOR') {
        await anotarPendiente(driver, periodo, resumen);
      } else {
        resumen.persistFailures += 1;
        return; // se reintenta entero en la próxima pasada
      }
    }
  }

  /**
   * Cuando entra dinero, lo pendiente se pone al día: un cobro por cada
   * periodo que quedó a deber, del más viejo primero, y nunca dos veces.
   */
  async function conciliarPendientes(driver, ahora, resumen) {
    const pendientes = [...(driver.maintenance?.pendingPeriods ?? [])].map(Number).sort((a, b) => a - b);
    if (!pendientes.length) return;
    const quedan = [];
    for (const periodo of pendientes) {
      if (cobroRegistrado(driver.id, periodo)) continue;
      const resultado = await cobrarPeriodo(driver, periodo, ahora);
      if (resultado === 'CHARGED') resumen.maintenanceReconciled += 1;
      else if (resultado === 'ALREADY_CHARGED') continue;
      else quedan.push(periodo);
    }
    if (quedan.length === pendientes.length) return; // nada cambió
    const previo = driver.maintenance.pendingPeriods;
    driver.maintenance.pendingPeriods = quedan;
    if (!await guardar('users', driver)) {
      driver.maintenance.pendingPeriods = previo;
      resumen.persistFailures += 1;
    }
  }

  // -------------------------------------------------------------------------
  // Inactividad
  // -------------------------------------------------------------------------

  async function evaluarInactividad(driver, ahora, resumen) {
    if (!enabled) return;
    const aviso = pendingInactivityWarning(driver, ahora);
    if (aviso) {
      // Se entrega PRIMERO y solo entonces se marca: un aviso que no llegó
      // debe reintentarse, no darse por dado.
      const entregado = await avisar(driver.id, 'driver_inactivity_warning',
        'Tu cuenta lleva días sin actividad',
        `Completa una carrera antes del ${new Date(ahora + aviso.daysLeft * DIA_MS)
          .toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: 'numeric', month: 'long' })} para evitar la suspensión por inactividad.`);
      if (!entregado) return;
      const previo = driver.inactivityWarnedThreshold;
      driver.inactivityWarnedThreshold = aviso.threshold;
      if (await guardar('users', driver)) resumen.inactivityWarnings += 1;
      else driver.inactivityWarnedThreshold = previo;
      return;
    }
    if (!shouldSuspendForInactivity(driver, ahora, opciones)) return;
    // Se usa la MISMA maquinaria de suspensión de siempre: no hay un segundo
    // sistema de cuentas suspendidas.
    const previo = { status: driver.status, suspensionReason: driver.suspensionReason, suspendedAt: driver.suspendedAt };
    driver.status = 'SUSPENDED';
    driver.suspensionReason = DRIVER_FINANCE_REASON.DRIVER_INACTIVITY_30_DAYS;
    driver.suspendedAt = new Date(ahora).toISOString();
    if (!await guardar('users', driver)) {
      Object.assign(driver, previo);
      resumen.persistFailures += 1;
      return;
    }
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
    const resumen = resumenVacio();
    // Con la funcionalidad apagada la pasada no toca NADA: ni cobra, ni
    // suspende, ni ancla relojes que luego condicionarían el estreno.
    if (!enabled) return resumen;
    const ahora = now();
    for (const driver of [...conductores()]) {
      resumen.driversSeen += 1;
      try {
        // Una cuenta cerrada de verdad deja de devengar: la política es para
        // cuentas vivas, aunque estén temporalmente suspendidas.
        if (driver.accountStatus === 'DISABLED') continue;
        const anclado = await asegurarAnclas(driver, ahora);
        if (!anclado) { resumen.persistFailures += 1; continue; }
        if (!Number.isFinite(Number(driver.maintenance?.anchorAt))) continue;
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

  /**
   * Reactivación administrativa desde una suspensión por INACTIVIDAD: la
   * cuenta estrena una ventana nueva de 30 días. Sin esto, el paso siguiente
   * la volvía a suspender contra el mismo plazo ya vencido y el administrador
   * quedaba atrapado en un bucle.
   *
   * NO toca el calendario del mantenimiento (son relojes independientes) ni
   * levanta el bloqueo por deuda: quien debe sigue sin poder trabajar hasta
   * quedar en positivo.
   */
  async function grantInactivityGrace(driver, atMs = now()) {
    if (!driver || driver.role !== 'driver') return false;
    driver.activityAnchorAt = atMs;
    driver.inactivityWarnedThreshold = null;
    if (driver.suspensionReason === DRIVER_FINANCE_REASON.DRIVER_INACTIVITY_30_DAYS) {
      driver.suspensionReason = null;
    }
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
    grantInactivityGrace,
    syncFinancialBlock: sincronizarBloqueo,
    ensureAnchors: asegurarAnclas,
    start,
    stop,
    skippedPasses: () => pasadasSaltadas
  };
}

export { INACTIVITY_LIMIT_MS, roundMoney };
