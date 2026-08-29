import {
  DRIVER_FINANCE_REASON,
  DRIVER_MAINTENANCE_FEE_USD,
  DRIVER_MAINTENANCE_LABEL,
  DRIVER_MAINTENANCE_TRANSACTION_TYPE,
  INACTIVITY_LIMIT_MS,
  balanceOf,
  canTakeNewWork,
  financeStateDefect,
  inactivityAnchorOf,
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
 * DÓNDE VIVE LA VERDAD (v4)
 * -------------------------
 * Cuando la persistencia ofrece el libro contable (`financeReady`), este
 * servicio NO decide sobre el documento del conductor: pide su instantánea
 * autoritativa a PostgreSQL, decide con ella y escribe por operaciones que
 * bloquean la fila del conductor. El documento se actualiza después, como
 * proyección para las pantallas.
 *
 * Sin ese libro —desarrollo, pruebas puras, respaldo en fichero— el proceso
 * es único y su documento en memoria SÍ es la autoridad: se conserva el
 * camino de siempre, y se dice claramente que la garantía entre réplicas solo
 * existe con PostgreSQL detrás.
 *
 * Cuatro decisiones de fondo, todas nacidas de auditorías independientes:
 *
 *  1. Un paso DIARIO acotado, no un barrido cada pocos segundos: la política
 *     se mide en meses, no en latidos.
 *  2. Cada obligación mensual es una FILA única por conductor y periodo. Dos
 *     evaluadores simultáneos no pueden cobrarla dos veces, y ninguna
 *     escritura posterior del documento puede revertir el débito.
 *  3. Nada se da por hecho: un aviso que no se entrega se des-reclama, y una
 *     escritura que falla deja la obligación viva para la próxima pasada.
 *  4. Al estrenar la política NADIE recibe un cargo retroactivo NI una
 *     suspensión: todos los conductores estrenan 30 días de gracia.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export function resolveDriverFinanceIntervalMs(value = process.env.DRIVER_FINANCE_INTERVAL_MS) {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero <= 0) return DIA_MS;
  return Math.max(60_000, Math.floor(numero));
}

/**
 * Cada cuánto se reparan las reservas que dejó un proceso muerto. Es un lote
 * ACOTADO sobre un índice parcial, no un barrido: por defecto cada cinco
 * minutos, porque una reserva huérfana le merma capacidad real al conductor y
 * esperar al paso diario sería demasiado.
 */
export function resolveReconcileIntervalMs(value = process.env.DRIVER_FINANCE_RECONCILE_INTERVAL_MS) {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero <= 0) return 5 * 60_000;
  return Math.max(30_000, Math.floor(numero));
}

export { isDriverFinanceEnabled };

export function createDriverFinanceService({
  database,
  persistRecord,
  // El libro contable de PostgreSQL. Sin él el servicio sigue funcionando,
  // pero la unicidad se apoya solo en que haya un único proceso.
  persistence = null,
  notify = null,
  enabled = isDriverFinanceEnabled(),
  intervalMs = resolveDriverFinanceIntervalMs(),
  reconcileIntervalMs = resolveReconcileIntervalMs(),
  reconcileBatch = 50,
  now = () => Date.now(),
  logger = console
} = {}) {
  if (!database) throw new Error('DRIVER_FINANCE_REQUIRES_DATABASE');
  if (typeof persistRecord !== 'function') throw new Error('DRIVER_FINANCE_REQUIRES_PERSIST');

  const opciones = { enabled };
  const libro = persistence?.financeReady === true ? persistence : null;
  const users = () => database.users;
  const transactions = () => {
    if (!Array.isArray(database.transactions)) database.transactions = [];
    return database.transactions;
  };
  const conductores = () => users().filter(u => u?.role === 'driver');

  let timer = null;
  let temporizadorReconciliacion = null;
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

  /**
   * Entrega el aviso y dice si llegó DE VERDAD.
   *
   * La tercera auditoría encontró que el adaptador podía terminar sin
   * excepción aunque su escritura hubiera fallado, y el servicio marcaba el
   * aviso como dado. Ahora el éxito es EXPLÍCITO: solo `true` cuenta. Todo lo
   * demás —una excepción, un `false`, un `undefined`— es un aviso no
   * entregado, y un aviso no entregado se reintenta.
   */
  async function avisar(userId, event, title, message) {
    if (typeof notify !== 'function') return true;
    try {
      const resultado = await notify(userId, event, title, message);
      if (resultado === true) return true;
      logger.warn(`[+58express DriverFinance] aviso ${event} no confirmado por el adaptador`);
      return false;
    } catch (error) {
      logger.warn(`[+58express DriverFinance] aviso ${event} no entregado: ${error?.message ?? '?'}`);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Puente entre la instantánea autoritativa y el documento en memoria
  // -------------------------------------------------------------------------

  /**
   * Copia el estado autoritativo sobre el documento del conductor. El
   * documento es una PROYECCIÓN: sirve a las pantallas, a los sockets y a los
   * informes, pero nunca decide. Refrescarlo aquí evita que la aplicación
   * enseñe una cifra distinta de la que acaba de escribirse.
   */
  function aplicarInstantanea(driver, snapshot) {
    if (!driver || !snapshot) return driver;
    driver.walletBalance = snapshot.walletBalance;
    driver.deferredCommissionUSD = snapshot.deferredCommissionUSD;
    driver.committedCommission = snapshot.committedCommission;
    driver.maintenance = {
      ...(driver.maintenance ?? {}),
      anchorAt: snapshot.maintenance.anchorAt,
      lastChargedPeriod: snapshot.maintenance.lastChargedPeriod,
      pendingPeriods: snapshot.maintenance.pendingPeriods
    };
    if (snapshot.activityAnchorAt !== null) driver.activityAnchorAt = snapshot.activityAnchorAt;
    if (snapshot.lastQualifyingTripAt !== null) driver.lastQualifyingTripAt = snapshot.lastQualifyingTripAt;
    driver.inactivityWarnedThreshold = snapshot.inactivityWarnedThreshold;
    if (snapshot.financialBlock !== undefined) driver.financialBlock = snapshot.financialBlock;
    return driver;
  }

  /**
   * Asegura que el conductor tenga su fila en el libro y devuelve su
   * instantánea. Las anclas se fijan SI FALTAN, nunca se pisan: dos réplicas
   * que estrenan la política el mismo día convergen en una sola cronología en
   * vez de dejar que gane la última escritura.
   */
  async function asegurarEstado(driver, ahora = now()) {
    if (!enabled || !libro || driver?.role !== 'driver') return null;
    const snapshot = await libro.ensureDriverFinanceState({
      driver,
      maintenanceAnchorAt: ahora,
      activityAnchorAt: ahora
    });
    if (snapshot) aplicarInstantanea(driver, snapshot);
    return snapshot;
  }

  // -------------------------------------------------------------------------
  // Anclas sin libro contable (proceso único)
  // -------------------------------------------------------------------------

  /**
   * Da al conductor sus dos relojes si no los tiene. Nunca mira al pasado: el
   * mantenimiento arranca hoy y la inactividad también, de modo que estrenar
   * la política no cobra meses viejos ni suspende a nadie.
   *
   * Si la escritura falla, el documento vuelve atrás: un ancla que no llegó al
   * disco no puede tratarse como establecida, porque un reinicio la movería y
   * con ella el primer cobro de alguien.
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
      if (libro) {
        const r = await libro.setFinancialBlock({
          driverId: driver.id, active: true,
          reason: DRIVER_FINANCE_REASON.FINANCIAL_BALANCE_BLOCK
        });
        if (r.outcome !== 'BLOCKED') return null;
        aplicarInstantanea(driver, await libro.readDriverFinance(driver.id));
      } else {
        const previo = driver.financialBlock;
        driver.financialBlock = {
          active: true,
          reason: DRIVER_FINANCE_REASON.FINANCIAL_BALANCE_BLOCK,
          since: new Date(ahora).toISOString(),
          balanceAtBlock: balanceOf(driver)
        };
        if (!await guardar('users', driver)) { driver.financialBlock = previo; return null; }
      }
      await avisar(driver.id, 'driver_financial_block',
        'Saldo pendiente',
        'Tu saldo llegó al límite. Debes pagar tu deuda y dejar tu saldo en positivo para volver a realizar carreras.');
      return 'blocked';
    }

    // Se levanta SOLO estando al día: saldar hasta 0.00 no basta, y las
    // obligaciones cuentan tanto como el saldo.
    if (bloqueadoAhora && meetsReactivationBalance(driver) && canTakeNewWork(driver, opciones)) {
      if (libro) {
        const r = await libro.setFinancialBlock({ driverId: driver.id, active: false });
        if (r.outcome !== 'CLEARED') return null;
        aplicarInstantanea(driver, await libro.readDriverFinance(driver.id));
      } else {
        const previo = driver.financialBlock;
        driver.financialBlock = { active: false, clearedAt: new Date(ahora).toISOString() };
        if (!await guardar('users', driver)) { driver.financialBlock = previo; return null; }
      }
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

  /** Identificador DETERMINISTA: es la clave primaria del apunte, y por tanto
   *  la que impide dos cobros del mismo mes al mismo conductor. */
  const idDeCobro = (driverId, periodo) => `transaction_maint_${driverId}_${periodo}`;

  const cobroRegistrado = (driverId, periodo) => {
    const id = idDeCobro(driverId, periodo);
    return transactions().some(t => t.id === id);
  };

  /**
   * Cobros en vuelo, para el camino SIN libro contable. Ahí el proceso es
   * único y la concurrencia que existe es la de dos evaluaciones solapadas
   * dentro de él: sin esta marca, ambas verían el libro en memoria todavía
   * vacío y cobrarían el mismo mes dos veces. Con PostgreSQL detrás el árbitro
   * es la fila de la obligación, no esta lista.
   */
  const cobrosEnCurso = new Set();

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

  /** Añade el apunte al libro en memoria sin duplicarlo. */
  function registrarEnMemoria(transaccion) {
    if (!transaccion) return;
    if (!transactions().some(t => t.id === transaccion.id)) transactions().push(transaccion);
  }

  /**
   * Cobra UN periodo. Con libro contable la obligación es una fila única y el
   * débito viaja con ella; sin él, el apunte y el saldo van juntos por la cola
   * de escritura del proceso.
   */
  async function cobrarPeriodo(driver, periodo, ahora) {
    if (libro) {
      const r = await libro.chargeMaintenanceObligation({
        driverId: driver.id,
        period: periodo,
        buildTransaction: ({ amount, balanceAfter }) =>
          construirTransaccion(driver, periodo, amount, balanceAfter, ahora)
      });
      if (r.outcome === 'CHARGED') {
        registrarEnMemoria(r.transaction);
        aplicarInstantanea(driver, await libro.readDriverFinance(driver.id));
        return 'CHARGED';
      }
      if (r.outcome === 'ALREADY_CHARGED' || r.outcome === 'FLOOR') {
        aplicarInstantanea(driver, await libro.readDriverFinance(driver.id));
        return r.outcome === 'FLOOR' ? 'FLOOR' : 'ALREADY_CHARGED';
      }
      return 'FAILED';
    }

    const { chargeable, pending, balanceAfter } = maintenanceCharge(driver);
    if (pending > 0) return 'FLOOR';

    const clave = idDeCobro(driver.id, periodo);
    if (cobrosEnCurso.has(clave)) return 'ALREADY_CHARGED';
    cobrosEnCurso.add(clave);
    const transaccion = construirTransaccion(driver, periodo, chargeable, balanceAfter, ahora);
    const saldoPrevio = driver.walletBalance;
    const periodoPrevio = driver.maintenance.lastChargedPeriod;
    driver.walletBalance = balanceAfter;
    driver.maintenance.lastChargedPeriod = Math.max(Number(periodoPrevio ?? 0), periodo);

    try {
      const ok = await guardar('transactions', transaccion) && await guardar('users', driver);
      if (ok) {
        registrarEnMemoria(transaccion);
        return 'CHARGED';
      }
      // Ni cobrado ni apuntado: se deshace lo de memoria y se reintentará.
      driver.walletBalance = saldoPrevio;
      driver.maintenance.lastChargedPeriod = periodoPrevio;
      return 'FAILED';
    } finally {
      cobrosEnCurso.delete(clave);
    }
  }

  /** Anota el periodo como pendiente (no cabe bajo el suelo) y avisa una vez. */
  async function anotarPendiente(driver, periodo, resumen) {
    if (libro) {
      // La fila DUE ya la creó el intento de cobro: aquí solo queda contarlo
      // y avisar. La obligación no vive en una lista del documento, así que
      // ninguna escritura posterior puede borrarla.
      resumen.maintenancePending += 1;
      await avisar(driver.id, 'driver_maintenance_pending',
        'Mantenimiento pendiente',
        `Tu mantenimiento mensual de $${DRIVER_MAINTENANCE_FEE_USD.toFixed(2)} está pendiente. Recarga tu saldo.`);
      return;
    }
    const pendientes = new Set((driver.maintenance.pendingPeriods ?? []).map(Number));
    if (pendientes.has(periodo)) return;
    pendientes.add(periodo);
    const previo = driver.maintenance.pendingPeriods;
    driver.maintenance.pendingPeriods = [...pendientes].sort((a, b) => a - b);
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
      if (!libro && cobroRegistrado(driver.id, periodo)) {
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
   * Pone al día lo que quedó a deber cuando hay saldo para ello.
   *
   * Con libro contable es LA MISMA puerta por la que entra cualquier ingreso:
   * un crédito de cero recorre las obligaciones vivas y cobra las que quepan,
   * fila a fila, de la más vieja a la más nueva. Así no existe una segunda
   * lógica de cobranza que pueda discrepar de la principal.
   */
  async function conciliarPendientes(driver, ahora, resumen) {
    if (libro) {
      const pendientes = (driver.maintenance?.pendingPeriods ?? []).length;
      const deuda = Number(driver.deferredCommissionUSD ?? 0);
      if (pendientes === 0 && deuda <= 0) return;
      if (roundMoney(Number(driver.walletBalance ?? 0)) <= 0) return;
      const r = await libro.creditDriverWallet({
        driverId: driver.id,
        creditUSD: 0,
        at: new Date(ahora).toISOString(),
        builders: {
          maintenance: ({ period, balanceAfter }) =>
            construirTransaccion(driver, period, DRIVER_MAINTENANCE_FEE_USD, balanceAfter, ahora)
        }
      });
      if (r.outcome !== 'CREDITED') return;
      r.transactions.forEach(registrarEnMemoria);
      resumen.maintenanceReconciled += r.maintenancePaidPeriods.length;
      aplicarInstantanea(driver, await libro.readDriverFinance(driver.id));
      return;
    }

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
    if (quedan.length === pendientes.length) return;
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

  /**
   * El aviso se RECLAMA antes de mandarse. La identidad del reclamo es
   * semántica —conductor, ancla y umbral—, así que dos réplicas que calculan
   * el mismo recordatorio chocan en la base y solo una lo entrega. Si la
   * entrega falla, el reclamo se retira: un recordatorio perdido se reintenta,
   * nunca se da por dado.
   */
  async function avisarInactividad(driver, aviso, ahora, resumen) {
    const ancla = inactivityAnchorOf(driver);
    const texto = `Completa una carrera antes del ${new Date(ahora + aviso.daysLeft * DIA_MS)
      .toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: 'numeric', month: 'long' })} para evitar la suspensión por inactividad.`;

    if (libro && ancla !== null) {
      const reclamo = await libro.claimInactivityWarning({
        driverId: driver.id, anchorAt: ancla, threshold: aviso.threshold
      });
      if (reclamo !== 'CLAIMED') {
        if (reclamo === 'ALREADY_CLAIMED') resumen.inactivityWarningsAlreadyClaimed += 1;
        return;
      }
      const entregado = await avisar(driver.id, 'driver_inactivity_warning',
        'Tu cuenta lleva días sin actividad', texto);
      if (!entregado) {
        await libro.releaseInactivityWarning({
          driverId: driver.id, anchorAt: ancla, threshold: aviso.threshold
        });
        return;
      }
      await libro.confirmInactivityWarning({
        driverId: driver.id, anchorAt: ancla, threshold: aviso.threshold
      });
      aplicarInstantanea(driver, await libro.readDriverFinance(driver.id));
      resumen.inactivityWarnings += 1;
      return;
    }

    const entregado = await avisar(driver.id, 'driver_inactivity_warning',
      'Tu cuenta lleva días sin actividad', texto);
    if (!entregado) return;
    const previo = driver.inactivityWarnedThreshold;
    driver.inactivityWarnedThreshold = aviso.threshold;
    if (await guardar('users', driver)) resumen.inactivityWarnings += 1;
    else driver.inactivityWarnedThreshold = previo;
  }

  async function evaluarInactividad(driver, ahora, resumen) {
    if (!enabled) return;
    const aviso = pendingInactivityWarning(driver, ahora);
    if (aviso) {
      await avisarInactividad(driver, aviso, ahora, resumen);
      return;
    }
    if (!shouldSuspendForInactivity(driver, ahora, opciones)) return;
    // Se usa la MISMA maquinaria de suspensión de siempre: no hay un segundo
    // sistema de cuentas suspendidas. El estado de la cuenta no es dinero, así
    // que vive donde siempre vivió — en el documento.
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
  // Reparación de reservas huérfanas
  // -------------------------------------------------------------------------

  /**
   * Un lote ACOTADO sobre el índice parcial de reservas vivas. Es idempotente,
   * seguro tras un reinicio y no puede inventar dinero: cuando el viaje no
   * existe, o completó sin dejar apunte, se deja constancia sanitizada en vez
   * de fabricar un desenlace.
   */
  async function runReservationReconciler() {
    if (!enabled || !libro) return null;
    try {
      return await libro.reconcileStaleReservations({ limit: reconcileBatch });
    } catch (error) {
      logger.error(`[+58express DriverFinance] reconciliación fallida: ${error.message}`);
      return null;
    }
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
    inactivityWarningsAlreadyClaimed: 0,
    inactivitySuspensions: 0,
    blocksApplied: 0,
    blocksCleared: 0,
    malformedState: 0,
    persistFailures: 0,
    reservationsReconciled: 0,
    errors: 0
  });

  async function runDriverFinancePass() {
    const resumen = resumenVacio();
    // Con la funcionalidad apagada la pasada no toca NADA: ni cobra, ni
    // suspende, ni ancla relojes que luego condicionarían el estreno.
    if (!enabled) return resumen;
    const ahora = now();

    const reparacion = await runReservationReconciler();
    if (reparacion) resumen.reservationsReconciled = reparacion.released + reparacion.settled;

    for (const driver of [...conductores()]) {
      resumen.driversSeen += 1;
      try {
        // Una cuenta cerrada de verdad deja de devengar: la política es para
        // cuentas vivas, aunque estén temporalmente suspendidas.
        if (driver.accountStatus === 'DISABLED') continue;
        // Metadatos financieros corruptos: NO se inventa una cronología nueva.
        // Se registra el defecto (sin datos personales) y se deja a este
        // conductor en paz: ni se le cobra, ni se le suspende, ni se le
        // reescribe el reloj. Un dato ilegible no puede costarle dinero.
        const defecto = financeStateDefect(driver);
        if (defecto) {
          resumen.malformedState += 1;
          logger.warn(`[+58express DriverFinance] estado financiero ilegible (${defecto}): conductor omitido`);
          continue;
        }

        if (libro) {
          if (!await asegurarEstado(driver, ahora)) { resumen.persistFailures += 1; continue; }
        } else if (!await asegurarAnclas(driver, ahora)) {
          resumen.persistFailures += 1;
          continue;
        }
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
    if (libro) {
      const r = await libro.setActivityAnchor({ driverId: driver.id, lastQualifyingTripAt: atMs });
      if (r.outcome === 'UPDATED') {
        aplicarInstantanea(driver, await libro.readDriverFinance(driver.id));
        return true;
      }
      if (r.outcome !== 'NO_FINANCE_STATE') return false;
    }
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
   * quedar al día.
   */
  async function grantInactivityGrace(driver, atMs = now()) {
    if (!driver || driver.role !== 'driver') return false;
    if (driver.suspensionReason === DRIVER_FINANCE_REASON.DRIVER_INACTIVITY_30_DAYS) {
      driver.suspensionReason = null;
    }
    if (libro) {
      const r = await libro.setActivityAnchor({ driverId: driver.id, activityAnchorAt: atMs });
      if (r.outcome === 'UPDATED') {
        aplicarInstantanea(driver, await libro.readDriverFinance(driver.id));
        return guardar('users', driver);
      }
      if (r.outcome !== 'NO_FINANCE_STATE') return false;
    }
    driver.activityAnchorAt = atMs;
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

    // La reparación de reservas corre por su cuenta y mucho más a menudo: una
    // reserva huérfana le quita capacidad REAL al conductor, y esperar al paso
    // mensual sería castigarlo por un fallo de la plataforma.
    if (libro && !temporizadorReconciliacion) {
      runReservationReconciler().catch(() => {});
      temporizadorReconciliacion = setInterval(() => {
        runReservationReconciler().catch(() => {});
      }, reconcileIntervalMs);
      if (typeof temporizadorReconciliacion.unref === 'function') temporizadorReconciliacion.unref();
    }

    logger.log(`[+58express DriverFinance] evaluación armada cada ${Math.round(intervalMs / 1000)}s`);
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (temporizadorReconciliacion) clearInterval(temporizadorReconciliacion);
    temporizadorReconciliacion = null;
  }

  return {
    enabled,
    intervalMs,
    reconcileIntervalMs,
    ledgerReady: Boolean(libro),
    runDriverFinancePass,
    runReservationReconciler,
    registerQualifyingTrip,
    grantInactivityGrace,
    ensureState: asegurarEstado,
    applySnapshot: aplicarInstantanea,
    syncFinancialBlock: sincronizarBloqueo,
    ensureAnchors: asegurarAnclas,
    start,
    stop,
    skippedPasses: () => pasadasSaltadas
  };
}

export { INACTIVITY_LIMIT_MS, roundMoney };
