import {
  DRIVER_DEBT_LIMIT_USD,
  DRIVER_FINANCE_REASON,
  DRIVER_MAINTENANCE_FEE_USD,
  roundMoney
} from '../domain/driverFinance.js';

/**
 * DRIVER-FINANCE-1 — el dinero del conductor, con la BASE DE DATOS como
 * autoridad.
 *
 * POR QUE EXISTE ESTE MODULO
 * --------------------------
 * El proyecto guarda cada entidad como un documento que se reescribe entero.
 * Tres auditorias independientes demostraron lo mismo por caminos distintos:
 * mientras el saldo, la deuda, las obligaciones y el bloqueo vivan dentro de
 * `users.payload`, cualquier replica con una copia vieja del documento puede
 * deshacer un cobro correcto al persistir. No es un fallo de SQL: es el
 * modelo de escritura que lo rodea.
 *
 * Aqui el dinero vive en filas propias y `users.payload` pasa a ser una
 * PROYECCION — una cache para las pantallas, nunca una fuente de verdad.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN
 * ------------------------------
 * 1. ORDEN DE CERROJOS. Toda operacion empieza bloqueando la fila del
 *    conductor en `driver_finance_state` y solo despues toca reservas,
 *    obligaciones, viajes, apuntes y por ultimo el documento. Un orden unico
 *    para todos los caminos es lo que impide los interbloqueos.
 *
 * 2. LA MEMORIA NO SE ADELANTA AL COMMIT. Las proyecciones que esta capa
 *    devuelve al proceso se acumulan en un buffer y se aplican SOLO cuando
 *    PostgreSQL confirma. La cuarta auditoria encontro lo contrario: memoria
 *    afirmando filas que la base nunca llego a guardar.
 *
 * 3. NADA SE TERMINALIZA SIN LIQUIDAR. Una carrera completada cuyo dinero no
 *    llego a cobrarse queda en `SETTLEMENT_PENDING`, visible y reintentable.
 *    Jamas se libera: liberarla borraria para siempre la comision y la
 *    ganancia de una carrera que la persona ya hizo.
 */

const CENT = valor => Math.round((Number(valor) || 0) * 100);
const USD = centavos => centavos / 100;

const FLOOR_USD = -DRIVER_DEBT_LIMIT_USD;
const FEE_CENT = CENT(DRIVER_MAINTENANCE_FEE_USD);

/** Los estados en los que una reserva sigue ocupando capacidad del conductor:
 *  o la carrera esta viva, o esta hecha y su dinero aun no se cobro. */
const OCUPAN_CAPACIDAD = "('RESERVED', 'SETTLEMENT_PENDING')";

/** Las cuatro tablas del libro contable. Si falta alguna, el almacen se
 *  declara NO disponible y la aplicacion sigue con su comportamiento de
 *  siempre: el codigo puede desplegarse antes que la migracion. */
export const FINANCE_TABLES = Object.freeze([
  'driver_finance_state',
  'driver_commission_reservations',
  'driver_maintenance_obligations',
  'driver_inactivity_warnings'
]);

export async function financeSchemaReady(pool) {
  const { rows } = await pool.query(
    `select count(*)::int as n
       from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])`,
    [FINANCE_TABLES]
  );
  return rows[0].n === FINANCE_TABLES.length;
}

/**
 * Instantanea autoritativa del conductor, con la forma que esperan las
 * funciones puras del dominio. Se construye desde las filas, nunca desde el
 * documento: es lo que permite decidir elegibilidad con datos que no pueden
 * estar obsoletos.
 */
function instantanea(fila, extras) {
  return {
    id: fila.driver_id,
    role: 'driver',
    walletBalance: Number(fila.wallet_balance_usd),
    deferredCommissionUSD: Number(extras.deferredUSD),
    committedCommission: Number(extras.reservedUSD),
    maintenance: {
      anchorAt: fila.maintenance_anchor_at === null ? null : Number(fila.maintenance_anchor_at),
      lastChargedPeriod: Number(fila.last_charged_period),
      pendingPeriods: extras.pendingPeriods
    },
    activityAnchorAt: fila.activity_anchor_at === null ? null : Number(fila.activity_anchor_at),
    lastQualifyingTripAt: fila.last_qualifying_trip_at === null ? null : Number(fila.last_qualifying_trip_at),
    inactivityWarnedThreshold: fila.inactivity_warned_threshold,
    financialBlock: fila.block_active
      ? { active: true, reason: fila.block_reason ?? DRIVER_FINANCE_REASON.FINANCIAL_BALANCE_BLOCK }
      : { active: false }
  };
}

export function createDriverFinanceStore({
  pool, logger = console, syncShadow = () => {},
  lockTimeoutMs = Number(process.env.DRIVER_FINANCE_LOCK_TIMEOUT_MS) || 8000,
  statementTimeoutMs = Number(process.env.DRIVER_FINANCE_STATEMENT_TIMEOUT_MS) || 15000
} = {}) {
  if (!pool) throw new Error('FINANCE_STORE_REQUIRES_POOL');

  // -------------------------------------------------------------------------
  // La proyeccion que la memoria del proceso recibira... DESPUES del commit
  // -------------------------------------------------------------------------

  /**
   * Un buffer por transaccion, atado a su conexion. Nada de lo que se anote
   * aqui llega a la memoria del proceso hasta que PostgreSQL confirma.
   *
   * La cuarta auditoria reprodujo lo contrario: `syncShadow` se llamaba dentro
   * de la transaccion, y un commit fallido dejaba al proceso creyendo en
   * filas fantasma que la base nunca guardo. Esa creencia luego SUPRIME
   * escrituras posteriores, porque el espejo dice «esto ya esta».
   */
  const buffers = new WeakMap();
  const anotar = (client, tabla, id, payload) => {
    const buffer = buffers.get(client);
    if (buffer) buffer.push([tabla, id, payload]);
  };

  // -------------------------------------------------------------------------
  // Lecturas auxiliares dentro de una transaccion ya abierta
  // -------------------------------------------------------------------------

  /** Bloquea la fila del conductor y devuelve su instantanea completa.
   *  SIEMPRE es el primer cerrojo de cualquier operacion de dinero. */
  async function bloquearEstado(client, driverId) {
    const estado = await client.query(
      `select * from public.driver_finance_state where driver_id = $1 for update`,
      [driverId]
    );
    if (estado.rowCount !== 1) return null;
    return { fila: estado.rows[0], snapshot: await componerInstantanea(client, estado.rows[0]) };
  }

  async function componerInstantanea(client, fila) {
    const driverId = fila.driver_id;
    const reservado = await client.query(
      `select coalesce(sum(reserved_usd), 0) as total
         from public.driver_commission_reservations
        where driver_id = $1 and status in ${OCUPAN_CAPACIDAD}`,
      [driverId]
    );
    const deuda = await client.query(
      `select coalesce(sum(deferred_usd - deferred_paid_usd), 0) as total
         from public.driver_commission_reservations
        where driver_id = $1 and status = 'SETTLED' and deferred_usd > deferred_paid_usd`,
      [driverId]
    );
    const pendientes = await client.query(
      `select period from public.driver_maintenance_obligations
        where driver_id = $1 and status = 'DUE' order by period`,
      [driverId]
    );
    return instantanea(fila, {
      reservedUSD: Number(reservado.rows[0].total),
      deferredUSD: Number(deuda.rows[0].total),
      pendingPeriods: pendientes.rows.map(r => Number(r.period))
    });
  }

  /**
   * Reestampa el documento del conductor desde las tablas. La escritura es un
   * no-op aparente (`set payload = payload`) porque quien pone los valores es
   * el disparador: asi la proyeccion se genera SIEMPRE en un unico sitio y no
   * hay dos versiones de la verdad que puedan discrepar.
   *
   * Es el ULTIMO cerrojo del orden: `users` va despues de todo lo demas.
   */
  async function proyectar(client, driverId) {
    const { rows, rowCount } = await client.query(
      `update public.users set payload = payload where id = $1 returning payload`,
      [driverId]
    );
    if (rowCount !== 1) return null;
    const payload = rows[0].payload;
    anotar(client, 'users', driverId, JSON.stringify(payload));
    return payload;
  }

  /**
   * Ejecuta el cuerpo dentro de UNA transaccion sobre UNA conexion.
   *
   * `abortar(resultado)` deshace todo y devuelve ese resultado: es la unica
   * forma de salir sin escribir. Un `return` normal confirma.
   *
   * Y el commit tiene TRES desenlaces, no dos. Si la conexion se pierde
   * justo al confirmar, no se sabe si la transaccion entro. Suponer que fallo
   * seria tan peligroso como suponer que entro: por eso existe
   * `resolverCommit`, que lee la BASE para averiguar la verdad. Cuando ni eso
   * se puede, se devuelve AMBIGUO y quien llama no toca la memoria.
   */
  async function enTransaccion(etiqueta, cuerpo, alFallar, { resolverCommit = null } = {}) {
    const client = await pool.connect();
    buffers.set(client, []);
    const abortar = resultado => {
      const corte = new Error('TRANSACCION_ABORTADA');
      corte.abortada = true;
      corte.resultado = resultado;
      throw corte;
    };
    const volcar = () => {
      for (const [tabla, id, payload] of buffers.get(client) ?? []) syncShadow(tabla, id, payload);
    };
    try {
      await client.query('begin');
      // Tres relojes, y ninguno es decorativo. Una operacion de dinero que no
      // consigue su cerrojo, que se eterniza o que se queda muda con la
      // transaccion abierta bloquearia al conductor y, con el, su carrera.
      // Prefiere fallar cerrado y reintentar: lo que no se escribio, no se
      // escribio, y la reserva sigue teniendo dueno.
      await client.query(`set local lock_timeout = '${lockTimeoutMs}ms'`);
      await client.query(`set local statement_timeout = '${statementTimeoutMs}ms'`);
      await client.query(`set local idle_in_transaction_session_timeout = '${statementTimeoutMs}ms'`);
      const resultado = await cuerpo(client, abortar);

      try {
        await client.query('commit');
      } catch (errorDeCommit) {
        logger.error(`[+58express DriverFinance] ${etiqueta}: commit incierto (${errorDeCommit.message})`);
        // Lo PRIMERO es no devolver al pozo una conexion con la transaccion
        // abierta: la siguiente consulta que la reutilice leeria datos sin
        // confirmar y creeria que existen. Si el commit si llego a entrar,
        // este rollback no encuentra nada que deshacer y es inofensivo.
        try { await client.query('rollback'); } catch {}
        let veredicto = null;
        if (resolverCommit) {
          try { veredicto = await resolverCommit(); } catch { veredicto = null; }
        }
        if (veredicto === 'COMMITTED') { volcar(); return resultado; }
        if (veredicto === 'NOT_COMMITTED') return alFallar;
        return { ...(alFallar ?? {}), outcome: 'AMBIGUOUS' };
      }

      // Y SOLO ahora la memoria del proceso se entera.
      volcar();
      return resultado;
    } catch (error) {
      try { await client.query('rollback'); } catch {}
      if (error?.abortada) return error.resultado;
      // El diagnostico jamas lleva identidades ni importes.
      logger.error(`[+58express DriverFinance] ${etiqueta} fallida: ${error.message}`);
      return alFallar;
    } finally {
      buffers.delete(client);
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Alta y lectura del estado autoritativo
  // -------------------------------------------------------------------------

  /**
   * Crea la fila del conductor si no existe, sembrandola con lo que hoy dice
   * su documento, y fija las anclas SI FALTAN.
   *
   * El «si faltan» es lo importante: `coalesce(columna, $nuevo)` es un
   * set-if-absent que hace converger a dos replicas en UNA sola ancla en vez
   * de dejar que gane la ultima escritura.
   *
   * Y si el conductor YA venia por debajo del suelo de deuda, la fila nace
   * exenta: el suelo existe para que nadie se hunda mas, no para rechazar una
   * deuda que la plataforma ya le habia permitido acumular.
   */
  function ensureDriverFinanceState({ driver, maintenanceAnchorAt = null, activityAnchorAt = null }) {
    return enTransaccion('alta de estado financiero', async client => {
      const saldoSembrado = roundMoney(Number(driver.walletBalance ?? 0));
      await client.query(
        `insert into public.driver_finance_state
           (driver_id, wallet_balance_usd, deferred_commission_usd,
            maintenance_anchor_at, last_charged_period, activity_anchor_at,
            last_qualifying_trip_at, inactivity_warned_threshold,
            block_active, block_reason, block_since, floor_exempt)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (driver_id) do nothing`,
        [
          driver.id,
          saldoSembrado,
          roundMoney(Math.max(0, Number(driver.deferredCommissionUSD ?? 0))),
          Number.isFinite(Number(driver.maintenance?.anchorAt)) ? Number(driver.maintenance.anchorAt) : maintenanceAnchorAt,
          Math.max(0, Number(driver.maintenance?.lastChargedPeriod ?? 0) || 0),
          Number.isFinite(Number(driver.activityAnchorAt)) ? Number(driver.activityAnchorAt) : activityAnchorAt,
          Number.isFinite(Number(driver.lastQualifyingTripAt)) ? Number(driver.lastQualifyingTripAt) : null,
          Number.isFinite(Number(driver.inactivityWarnedThreshold)) ? Number(driver.inactivityWarnedThreshold) : null,
          driver.financialBlock?.active === true,
          driver.financialBlock?.active === true
            ? (driver.financialBlock.reason ?? DRIVER_FINANCE_REASON.FINANCIAL_BALANCE_BLOCK)
            : null,
          driver.financialBlock?.active === true ? new Date().toISOString() : null,
          saldoSembrado < FLOOR_USD
        ]
      );
      // Las anclas que falten, y SOLO las que falten.
      if (maintenanceAnchorAt !== null || activityAnchorAt !== null) {
        await client.query(
          `update public.driver_finance_state
              set maintenance_anchor_at = coalesce(maintenance_anchor_at, $2),
                  activity_anchor_at = coalesce(activity_anchor_at, $3),
                  updated_at = now()
            where driver_id = $1`,
          [driver.id, maintenanceAnchorAt, activityAnchorAt]
        );
      }
      // Las obligaciones pendientes que ya arrastraba el documento pasan a ser
      // filas: no se pierde deuda al migrar de modelo.
      for (const periodo of (driver.maintenance?.pendingPeriods ?? []).map(Number).filter(Number.isInteger)) {
        if (periodo < 1) continue;
        await client.query(
          `insert into public.driver_maintenance_obligations
             (id, driver_id, period, amount_usd, status)
           values ($1, $2, $3, $4, 'DUE')
           on conflict (driver_id, period) do nothing`,
          [`driver-maintenance:${driver.id}:${periodo}`, driver.id, periodo, DRIVER_MAINTENANCE_FEE_USD]
        );
      }
      const bloqueado = await bloquearEstado(client, driver.id);
      await proyectar(client, driver.id);
      return bloqueado?.snapshot ?? null;
    }, null);
  }

  /** Instantanea autoritativa, sin bloquear: para pantallas e informes. */
  async function readDriverFinance(driverId) {
    const { rows } = await pool.query(
      `select f.*,
              coalesce((select sum(r.reserved_usd) from public.driver_commission_reservations r
                         where r.driver_id = f.driver_id and r.status in ${OCUPAN_CAPACIDAD}), 0) as reservado,
              coalesce((select sum(r.deferred_usd - r.deferred_paid_usd) from public.driver_commission_reservations r
                         where r.driver_id = f.driver_id and r.status = 'SETTLED'
                           and r.deferred_usd > r.deferred_paid_usd), 0) as deuda,
              coalesce((select array_agg(o.period order by o.period) from public.driver_maintenance_obligations o
                         where o.driver_id = f.driver_id and o.status = 'DUE'), '{}') as periodos
         from public.driver_finance_state f
        where f.driver_id = $1`,
      [driverId]
    );
    if (!rows.length) return null;
    const fila = rows[0];
    return instantanea(fila, {
      reservedUSD: Number(fila.reservado),
      deferredUSD: Number(fila.deuda),
      pendingPeriods: (fila.periodos ?? []).map(Number)
    });
  }

  /**
   * Instantanea autoritativa CON LA FILA BLOQUEADA. La usa quien va a tomar
   * una decision de reparto de trabajo sin mover dinero todavia —el
   * Transporte Seguro al confirmar un compromiso—: bloquear y leer deja la
   * decision pegada al estado durable en vez de a la foto del proceso.
   */
  function readEligibilityLocked(driverId) {
    return enTransaccion('lectura bloqueada de elegibilidad', async client => {
      const bloqueado = await bloquearEstado(client, driverId);
      // `found:false` es «este conductor no esta en el libro», que es distinto
      // de «no se pudo leer». Quien decide con esto tiene que poder
      // distinguirlos: lo primero permite seguir con el documento, lo segundo
      // obliga a no arriesgarse.
      return { ok: true, found: Boolean(bloqueado), snapshot: bloqueado?.snapshot ?? null };
    }, { ok: false, found: false, snapshot: null });
  }

  // -------------------------------------------------------------------------
  // La cobranza, compartida por todo lo que acredita dinero
  // -------------------------------------------------------------------------

  /**
   * El orden que fijo el dueno, en CENTIMOS ENTEROS:
   *
   *   1. el saldo negativo se cubre primero (llega implicito en `disponible`),
   *   2. comisiones diferidas, de la carrera mas vieja a la mas nueva,
   *   3. mantenimientos vencidos, del periodo mas viejo al mas nuevo,
   *   4. y solo lo que sobre queda como saldo libre.
   *
   * Cada obligacion se marca saldada en la MISMA transaccion en la que se
   * cobra: no hay un total acumulado del que nadie sepa de donde viene, y una
   * cobranza no puede repetirse.
   *
   * Con la POLITICA APAGADA no se cobra nada: el dinero entra entero al saldo
   * y las obligaciones esperan. Apagar la politica nunca puede costarle
   * dinero a nadie, ni al conductor ni a la plataforma.
   */
  async function cobrarObligaciones(client, driverId, disponibleInicial, builders, sourceId, policyEnabled) {
    let disponible = disponibleInicial;
    const apuntes = [];
    if (!policyEnabled) {
      return { disponible, deferredPaidCent: 0, maintenancePaidPeriods: [], apuntes };
    }

    // 2) Comisiones diferidas, de la mas vieja a la mas nueva.
    const deudas = await client.query(
      `select trip_id, deferred_usd, deferred_paid_usd
         from public.driver_commission_reservations
        where driver_id = $1 and status = 'SETTLED' and deferred_usd > deferred_paid_usd
        order by resolved_at, trip_id
        for update`,
      [driverId]
    );
    let diferidaPagadaCent = 0;
    for (const fila of deudas.rows) {
      if (disponible <= 0) break;
      const pendiente = CENT(fila.deferred_usd) - CENT(fila.deferred_paid_usd);
      const pago = Math.min(pendiente, disponible);
      if (pago <= 0) continue;
      disponible -= pago;
      diferidaPagadaCent += pago;
      await client.query(
        `update public.driver_commission_reservations
            set deferred_paid_usd = round(deferred_paid_usd + $2::numeric, 2)
          where trip_id = $1`,
        [fila.trip_id, USD(pago)]
      );
    }

    // 3) Mantenimientos vencidos, del periodo mas viejo al mas nuevo.
    const obligaciones = await client.query(
      `select id, period from public.driver_maintenance_obligations
        where driver_id = $1 and status = 'DUE'
        order by period
        for update`,
      [driverId]
    );
    const periodosPagados = [];
    for (const fila of obligaciones.rows) {
      if (disponible < FEE_CENT) break;
      const apunte = builders?.maintenance?.({
        period: Number(fila.period),
        balanceAfter: USD(disponible - FEE_CENT),
        sourceId
      });
      if (!apunte) break;
      disponible -= FEE_CENT;
      // El apunte va PRIMERO: la obligacion lo referencia por clave foranea.
      await client.query(
        `insert into public.transactions (id, payload) values ($1, $2::jsonb)
         on conflict (id) do nothing`,
        [apunte.id, JSON.stringify(apunte)]
      );
      await client.query(
        `update public.driver_maintenance_obligations
            set status = 'PAID', paid_at = now(), transaction_id = $2
          where id = $1 and status = 'DUE'`,
        [fila.id, apunte.id]
      );
      anotar(client, 'transactions', apunte.id, JSON.stringify(apunte));
      periodosPagados.push(Number(fila.period));
      apuntes.push(apunte);
    }

    if (diferidaPagadaCent > 0) {
      const apunte = builders?.deferred?.({
        paid: USD(diferidaPagadaCent),
        balanceAfter: USD(disponible),
        sourceId
      });
      if (apunte) {
        await client.query(
          `insert into public.transactions (id, payload) values ($1, $2::jsonb)
           on conflict (id) do nothing`,
          [apunte.id, JSON.stringify(apunte)]
        );
        anotar(client, 'transactions', apunte.id, JSON.stringify(apunte));
        apuntes.push(apunte);
      }
    }

    return { disponible, deferredPaidCent: diferidaPagadaCent, maintenancePaidPeriods: periodosPagados, apuntes };
  }

  /** Deuda y obligaciones que SIGUEN vivas, leidas tras la cobranza. */
  async function obligacionesRestantes(client, driverId) {
    const deuda = await client.query(
      `select coalesce(sum(deferred_usd - deferred_paid_usd), 0) as total
         from public.driver_commission_reservations
        where driver_id = $1 and status = 'SETTLED' and deferred_usd > deferred_paid_usd`,
      [driverId]
    );
    const pendientes = await client.query(
      `select count(*)::int as n from public.driver_maintenance_obligations
        where driver_id = $1 and status = 'DUE'`,
      [driverId]
    );
    return { deferredUSD: roundMoney(Number(deuda.rows[0].total)), pendingPeriods: pendientes.rows[0].n };
  }

  /**
   * Escribe el saldo autoritativo. La exencion del suelo se retira sola en
   * cuanto el conductor vuelve a estar por encima de el: a partir de ahi la
   * base misma le impide volver a hundirse.
   */
  const GUARDAR_SALDO = `
    update public.driver_finance_state
       set wallet_balance_usd = $2,
           floor_exempt = case when $2::numeric >= ${FLOOR_USD} then false else floor_exempt end,
           deferred_commission_usd = $3,
           block_active = case when $4 then false else block_active end,
           block_reason = case when $4 then null else block_reason end,
           block_cleared_at = case when $4 then now() else block_cleared_at end,
           updated_at = now()
     where driver_id = $1`;

  // -------------------------------------------------------------------------
  // Aceptacion de una carrera: elegibilidad DURABLE, reserva y asignacion
  // -------------------------------------------------------------------------

  /**
   * Todo lo que decide si un conductor puede empezar una carrera ocurre DENTRO
   * de esta transaccion, sobre la fila que acaba de bloquearse:
   *
   *   bloqueo financiero · deuda diferida · mantenimientos vencidos ·
   *   regla de reactivacion en positivo · capacidad frente al suelo ·
   *   reserva con dueno · asignacion del viaje
   *
   * @param assignment 'SEARCHING' para una carrera en vivo, 'SCHEDULED' para
   *        la reclamacion de un traslado programado. La condicion de
   *        asignacion cambia; la puerta financiera es EXACTAMENTE la misma.
   */
  function acceptTripWithReservation({
    tripId, driverId, commissionUSD = 0, floorUSD = FLOOR_USD,
    updatedAt, assignment = 'SEARCHING', enforceEligibility = true, policy
  }) {
    return enTransaccion('aceptacion atomica', async (client, abortar) => {
      const bloqueado = await bloquearEstado(client, driverId);
      if (enforceEligibility && !bloqueado) abortar({ outcome: 'NO_FINANCE_STATE' });

      if (bloqueado && enforceEligibility && !policy.canTakeNewWork(bloqueado.snapshot)) {
        abortar({ outcome: 'FINANCIAL_BALANCE_BLOCK' });
      }

      const comision = roundMoney(Math.max(0, Number(commissionUSD) || 0));
      if (comision > 0) {
        if (!bloqueado) abortar({ outcome: 'NO_FINANCE_STATE' });
        // La capacidad se mide con el saldo AUTORITATIVO menos lo ya
        // comprometido en reservas vivas: dos carreras simultaneas no pueden
        // apoyarse las dos en el mismo dinero.
        const saldo = bloqueado.snapshot.walletBalance;
        const comprometido = bloqueado.snapshot.committedCommission;
        if (roundMoney(saldo - comprometido - comision) < Number(floorUSD)) {
          abortar({ outcome: 'NO_CAPACITY' });
        }
        const reserva = await client.query(
          `insert into public.driver_commission_reservations
             (trip_id, driver_id, reserved_usd, status)
           values ($1, $2, $3, 'RESERVED')
           on conflict (trip_id) do nothing`,
          [tripId, driverId, comision]
        );
        if (reserva.rowCount !== 1) abortar({ outcome: 'ALREADY_RESERVED' });
      }

      const asignado = assignment === 'SCHEDULED'
        ? await client.query(
          `update public.trips
             set payload = payload || jsonb_build_object(
               'assignedDriverId', $2::text, 'driverId', $2::text, 'updatedAt', $3::text)
           where id = $1 and status = 'SCHEDULED'
             and (assigned_driver_id is null or assigned_driver_id = $2)
           returning payload`,
          [tripId, driverId, updatedAt]
        )
        : await client.query(
          `update public.trips
             set payload = payload || jsonb_build_object(
               'driverId', $2::text, 'status', 'DRIVER_ASSIGNED', 'updatedAt', $3::text)
           where id = $1 and status = 'SEARCHING' and driver_id is null
           returning payload`,
          [tripId, driverId, updatedAt]
        );
      if (asignado.rowCount !== 1) abortar({ outcome: 'TRIP_TAKEN' });

      anotar(client, 'trips', tripId, JSON.stringify(asignado.rows[0].payload));
      return { outcome: 'OK', trip: asignado.rows[0].payload, reservedUSD: comision };
    }, { outcome: 'FAILED' }, {
      // Si el commit quedo en el aire, la verdad la dice el viaje: o esta
      // asignado a este conductor o no lo esta.
      resolverCommit: async () => {
        const { rows } = await pool.query(`select driver_id, status from public.trips where id = $1`, [tripId]);
        if (!rows.length) return null;
        const asignado = rows[0].driver_id === driverId;
        return asignado ? 'COMMITTED' : 'NOT_COMMITTED';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Liquidacion de la carrera completada
  // -------------------------------------------------------------------------

  /**
   * Cierra el dinero de una carrera COMPLETADA en UNA sola transaccion: el
   * testigo de exactamente-una-vez, la cobranza de lo que se debia, el
   * debito o el credito del saldo y los apuntes del libro entran juntos o no
   * entra ninguno.
   *
   * La fila de la reserva es el TESTIGO, y admite dos puntos de partida:
   * `RESERVED` (el camino normal) y `SETTLEMENT_PENDING` (una carrera que se
   * completo y cuyo dinero no llego a cobrarse, rescatada por el
   * reconciliador). Desde SETTLED o RELEASED no se vuelve a cobrar.
   */
  function settleTripForDriver({
    tripId, driverId, commissionUSD = 0, creditUSD = 0, floorUSD = FLOOR_USD,
    policyEnabled = true, builders = {}
  }) {
    return enTransaccion('liquidacion de carrera', async client => {
      const bloqueado = await bloquearEstado(client, driverId);
      if (!bloqueado) return { outcome: 'NO_FINANCE_STATE' };

      const saldo = bloqueado.snapshot.walletBalance;
      const comision = roundMoney(Math.max(0, Number(commissionUSD) || 0));
      // El suelo de deuda es DURO, y lo es SIEMPRE: es una propiedad del
      // almacen, no de la politica. Lo que no cabe no se perdona, queda
      // anotado en ESTA fila y por tanto con dueno.
      const margen = roundMoney(saldo - Number(floorUSD));
      const aplicado = roundMoney(Math.max(0, Math.min(comision, margen)));
      const diferido = roundMoney(comision - aplicado);

      const transicion = await client.query(
        `update public.driver_commission_reservations
            set status = 'SETTLED', reserved_usd = $2, applied_usd = $3,
                deferred_usd = $4, resolved_at = now()
          where trip_id = $1 and status in ${OCUPAN_CAPACIDAD}
          returning trip_id`,
        [tripId, comision, aplicado, diferido]
      );
      if (transicion.rowCount !== 1) {
        // Las carreras cobradas por la plataforma no reservaron nada: su fila
        // nace aqui, ya liquidada. Sirve igual de testigo.
        const nueva = await client.query(
          `insert into public.driver_commission_reservations
             (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
           values ($1, $2, $3, $4, $5, 'SETTLED', now())
           on conflict (trip_id) do nothing`,
          [tripId, driverId, comision, aplicado, diferido]
        );
        if (nueva.rowCount !== 1) return { outcome: 'ALREADY_SETTLED' };
      }

      // El debito de la comision ocurre ANTES de repartir el ingreso: la deuda
      // que esta carrera acaba de generar debe poder cobrarse con lo que esta
      // misma carrera acaba de pagar.
      let disponibleCent = CENT(saldo) - CENT(aplicado) + Math.max(0, CENT(creditUSD));
      const cobranza = await cobrarObligaciones(client, driverId, disponibleCent, builders, tripId, policyEnabled);
      disponibleCent = cobranza.disponible;
      const saldoNuevo = roundMoney(USD(disponibleCent));

      const restante = await obligacionesRestantes(client, driverId);
      const alDia = policyEnabled && saldoNuevo > 0
        && restante.deferredUSD === 0 && restante.pendingPeriods === 0;
      const estabaBloqueado = bloqueado.fila.block_active;
      // `restante` ya se leyo DESPUES de escribir el diferido de esta carrera:
      // el espejo del documento refleja la deuda total real, sin sumarla dos veces.
      await client.query(GUARDAR_SALDO, [driverId, saldoNuevo, restante.deferredUSD, estabaBloqueado && alDia]);

      const transaccion = builders.settlement
        ? builders.settlement({ applied: aplicado, deferred: diferido, balanceAfter: saldoNuevo })
        : null;
      if (transaccion) {
        await client.query(
          `insert into public.transactions (id, payload) values ($1, $2::jsonb)
           on conflict (id) do nothing`,
          [transaccion.id, JSON.stringify(transaccion)]
        );
        anotar(client, 'transactions', transaccion.id, JSON.stringify(transaccion));
      }
      await proyectar(client, driverId);
      return {
        outcome: 'SETTLED',
        applied: aplicado,
        deferred: diferido,
        balanceAfter: saldoNuevo,
        deferredPaid: USD(cobranza.deferredPaidCent),
        maintenancePaidPeriods: cobranza.maintenancePaidPeriods,
        blockCleared: estabaBloqueado && alDia,
        transaction: transaccion,
        transactions: cobranza.apuntes
      };
    }, { outcome: 'FAILED' }, {
      // La verdad la dice el testigo: si la reserva quedo SETTLED, entro.
      resolverCommit: async () => {
        const { rows } = await pool.query(
          `select status from public.driver_commission_reservations where trip_id = $1`, [tripId]);
        if (!rows.length) return 'NOT_COMMITTED';
        return rows[0].status === 'SETTLED' ? 'COMMITTED' : 'NOT_COMMITTED';
      }
    });
  }

  // -------------------------------------------------------------------------
  // LA puerta unica del dinero que ENTRA
  // -------------------------------------------------------------------------

  /**
   * Todo ingreso del conductor pasa por aqui: recarga aprobada, ganancia de
   * una carrera cobrada por la plataforma, pago del Transporte Seguro o
   * credito administrativo.
   *
   * Y pasa por aqui TAMBIEN con la politica apagada. Esa es la leccion de la
   * cuarta auditoria: una vez que el conductor tiene fila en el libro, su
   * saldo vive ahi para siempre. Devolver la autoridad al documento al apagar
   * la bandera hacia que el disparador borrase el ingreso al instante — el
   * conductor cobraba cero y nadie se enteraba. Apagada, la politica no cobra
   * ni bloquea; el dinero sigue entrando donde debe.
   */
  function creditDriverWallet({
    driverId, creditUSD, sourceId = null, at = new Date().toISOString(),
    policyEnabled = true, builders = {}
  }) {
    return enTransaccion('credito con cobranza', async client => {
      const bloqueado = await bloquearEstado(client, driverId);
      if (!bloqueado) return { outcome: 'NO_FINANCE_STATE' };

      const disponibleInicial = CENT(bloqueado.snapshot.walletBalance) + Math.max(0, CENT(creditUSD));
      const cobranza = await cobrarObligaciones(client, driverId, disponibleInicial, builders, sourceId, policyEnabled);
      const saldoNuevo = roundMoney(USD(cobranza.disponible));

      const restante = await obligacionesRestantes(client, driverId);
      // El bloqueo se levanta en el MISMO acto que lo hace posible: saldo
      // positivo y CERO obligaciones. Quien ya esta al dia no espera a la
      // pasada de mañana para volver a trabajar.
      const alDia = policyEnabled && saldoNuevo > 0
        && restante.deferredUSD === 0 && restante.pendingPeriods === 0;
      const estabaBloqueado = bloqueado.fila.block_active;
      await client.query(GUARDAR_SALDO, [driverId, saldoNuevo, restante.deferredUSD, estabaBloqueado && alDia]);

      await proyectar(client, driverId);
      return {
        outcome: 'CREDITED',
        balanceAfter: saldoNuevo,
        deferredPaid: USD(cobranza.deferredPaidCent),
        deferredRemaining: restante.deferredUSD,
        maintenancePaidPeriods: cobranza.maintenancePaidPeriods,
        blockCleared: estabaBloqueado && alDia,
        transactions: cobranza.apuntes,
        at
      };
    }, { outcome: 'FAILED' });
  }

  /** Retiro aprobado: sale dinero de verdad, y jamas por debajo de lo que hay. */
  function debitDriverWallet({ driverId, amountUSD }) {
    return enTransaccion('debito de liquidacion', async client => {
      const bloqueado = await bloquearEstado(client, driverId);
      if (!bloqueado) return { outcome: 'NO_FINANCE_STATE' };
      const importe = roundMoney(Math.max(0, Number(amountUSD) || 0));
      if (roundMoney(bloqueado.snapshot.walletBalance - importe) < 0) {
        return { outcome: 'INSUFFICIENT_BALANCE', balanceAfter: bloqueado.snapshot.walletBalance };
      }
      const saldoNuevo = roundMoney(bloqueado.snapshot.walletBalance - importe);
      await client.query(
        `update public.driver_finance_state set wallet_balance_usd = $2, updated_at = now() where driver_id = $1`,
        [driverId, saldoNuevo]
      );
      await proyectar(client, driverId);
      return { outcome: 'DEBITED', balanceAfter: saldoNuevo };
    }, { outcome: 'FAILED' });
  }

  // -------------------------------------------------------------------------
  // Mantenimiento mensual: la obligacion es una FILA, no un elemento de lista
  // -------------------------------------------------------------------------

  /**
   * Cobra un periodo. La unicidad `(conductor, periodo)` la declara la base,
   * y la fila del estado serializa a los evaluadores: dos replicas que
   * evaluan el mismo mes producen un solo cobro y un solo apunte, y ninguna
   * escritura posterior del documento puede revertir el debito.
   */
  function chargeMaintenanceObligation({ driverId, period, feeUSD = DRIVER_MAINTENANCE_FEE_USD, floorUSD = FLOOR_USD, buildTransaction }) {
    return enTransaccion('cobro de mantenimiento', async client => {
      const bloqueado = await bloquearEstado(client, driverId);
      if (!bloqueado) return { outcome: 'NO_FINANCE_STATE' };

      const obligacionId = `driver-maintenance:${driverId}:${period}`;
      await client.query(
        `insert into public.driver_maintenance_obligations (id, driver_id, period, amount_usd, status)
         values ($1, $2, $3, $4, 'DUE')
         on conflict (driver_id, period) do nothing`,
        [obligacionId, driverId, period, feeUSD]
      );
      const actual = await client.query(
        `select id, status from public.driver_maintenance_obligations
          where driver_id = $1 and period = $2 for update`,
        [driverId, period]
      );
      const fila = actual.rows[0];

      // El contador avanza pase lo que pase: el periodo queda registrado como
      // evaluado, y lo que decide si se debe es la FILA, no el contador.
      const avanzar = `update public.driver_finance_state
            set last_charged_period = greatest(last_charged_period, $2), updated_at = now()
          where driver_id = $1`;

      if (fila.status === 'PAID') {
        await client.query(avanzar, [driverId, period]);
        await proyectar(client, driverId);
        return { outcome: 'ALREADY_CHARGED' };
      }

      const saldo = bloqueado.snapshot.walletBalance;
      const importe = roundMoney(feeUSD);
      // Todo o nada: un cobro parcial de $0.37 seria incomprensible en el
      // historial de alguien. Lo que no cabe queda DUE, nunca perdonado.
      if (roundMoney(saldo - importe) < Number(floorUSD)) {
        await client.query(avanzar, [driverId, period]);
        await proyectar(client, driverId);
        return { outcome: 'FLOOR' };
      }

      const saldoNuevo = roundMoney(saldo - importe);
      const transaccion = buildTransaction({ period, amount: importe, balanceAfter: saldoNuevo });
      await client.query(
        `insert into public.transactions (id, payload) values ($1, $2::jsonb)
         on conflict (id) do nothing`,
        [transaccion.id, JSON.stringify(transaccion)]
      );
      await client.query(
        `update public.driver_maintenance_obligations
            set status = 'PAID', paid_at = now(), transaction_id = $2
          where id = $1 and status = 'DUE'`,
        [fila.id, transaccion.id]
      );
      await client.query(
        `update public.driver_finance_state
            set wallet_balance_usd = $2,
                floor_exempt = case when $2::numeric >= ${FLOOR_USD} then false else floor_exempt end,
                last_charged_period = greatest(last_charged_period, $3), updated_at = now()
          where driver_id = $1`,
        [driverId, saldoNuevo, period]
      );
      anotar(client, 'transactions', transaccion.id, JSON.stringify(transaccion));
      await proyectar(client, driverId);
      return { outcome: 'CHARGED', balanceAfter: saldoNuevo, transaction: transaccion };
    }, { outcome: 'FAILED' }, {
      resolverCommit: async () => {
        const { rows } = await pool.query(
          `select status from public.driver_maintenance_obligations where driver_id = $1 and period = $2`,
          [driverId, period]);
        if (!rows.length) return 'NOT_COMMITTED';
        return rows[0].status === 'PAID' ? 'COMMITTED' : 'NOT_COMMITTED';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Bloqueo por deuda, anclas y avisos
  // -------------------------------------------------------------------------

  function setFinancialBlock({ driverId, active, reason = DRIVER_FINANCE_REASON.FINANCIAL_BALANCE_BLOCK }) {
    return enTransaccion('marca de bloqueo', async client => {
      const r = await client.query(
        `update public.driver_finance_state
            set block_active = $2,
                block_reason = case when $2 then $3::text else null end,
                block_since = case when $2 then now() else block_since end,
                block_cleared_at = case when $2 then block_cleared_at else now() end,
                updated_at = now()
          where driver_id = $1 and block_active is distinct from $2`,
        [driverId, active, reason]
      );
      if (r.rowCount !== 1) return { outcome: 'UNCHANGED' };
      await proyectar(client, driverId);
      return { outcome: active ? 'BLOCKED' : 'CLEARED' };
    }, { outcome: 'FAILED' });
  }

  /** Reinicia el reloj de la inactividad. Solo lo mueve una carrera COMPLETADA
   *  o un acto administrativo explicito; nunca se retrocede. */
  function setActivityAnchor({ driverId, activityAnchorAt = null, lastQualifyingTripAt = null, clearWarning = true }) {
    return enTransaccion('ancla de actividad', async client => {
      const r = await client.query(
        `update public.driver_finance_state
            set activity_anchor_at = case when $2::bigint is null then activity_anchor_at
                                          else greatest(coalesce(activity_anchor_at, 0), $2::bigint) end,
                last_qualifying_trip_at = case when $3::bigint is null then last_qualifying_trip_at
                                               else greatest(coalesce(last_qualifying_trip_at, 0), $3::bigint) end,
                inactivity_warned_threshold = case when $4 then null else inactivity_warned_threshold end,
                updated_at = now()
          where driver_id = $1`,
        [driverId, activityAnchorAt, lastQualifyingTripAt, clearWarning]
      );
      if (r.rowCount !== 1) return { outcome: 'NO_FINANCE_STATE' };
      if (clearWarning) {
        await client.query(
          `delete from public.driver_inactivity_warnings where driver_id = $1 and delivered_at is null`,
          [driverId]
        );
      }
      await proyectar(client, driverId);
      return { outcome: 'UPDATED' };
    }, { outcome: 'FAILED' });
  }

  /**
   * Reclama el aviso ANTES de entregarlo. La identidad es semantica
   * —conductor, ancla y umbral—, asi que dos replicas que calculan el mismo
   * recordatorio chocan en la clave primaria y solo una lo manda.
   */
  async function claimInactivityWarning({ driverId, anchorAt, threshold }) {
    try {
      const r = await pool.query(
        `insert into public.driver_inactivity_warnings (driver_id, anchor_at, threshold_days)
         values ($1, $2, $3)
         on conflict (driver_id, anchor_at, threshold_days) do nothing`,
        [driverId, anchorAt, threshold]
      );
      return r.rowCount === 1 ? 'CLAIMED' : 'ALREADY_CLAIMED';
    } catch (error) {
      logger.error(`[+58express DriverFinance] reclamo de aviso fallido: ${error.message}`);
      return 'FAILED';
    }
  }

  /** El aviso LLEGO: se sella la entrega y se anota el umbral. */
  function confirmInactivityWarning({ driverId, anchorAt, threshold }) {
    return enTransaccion('entrega de aviso', async client => {
      await client.query(
        `update public.driver_inactivity_warnings set delivered_at = now()
          where driver_id = $1 and anchor_at = $2 and threshold_days = $3 and delivered_at is null`,
        [driverId, anchorAt, threshold]
      );
      await client.query(
        `update public.driver_finance_state
            set inactivity_warned_threshold = least(coalesce(inactivity_warned_threshold, $2), $2), updated_at = now()
          where driver_id = $1`,
        [driverId, threshold]
      );
      await proyectar(client, driverId);
      return { outcome: 'DELIVERED' };
    }, { outcome: 'FAILED' });
  }

  /** El aviso NO llego: se retira el reclamo para que se reintente. Un
   *  recordatorio perdido no puede darse por dado. */
  async function releaseInactivityWarning({ driverId, anchorAt, threshold }) {
    try {
      await pool.query(
        `delete from public.driver_inactivity_warnings
          where driver_id = $1 and anchor_at = $2 and threshold_days = $3 and delivered_at is null`,
        [driverId, anchorAt, threshold]
      );
      return true;
    } catch (error) {
      logger.error(`[+58express DriverFinance] retirada de reclamo fallida: ${error.message}`);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Reservas: liberacion y reconciliacion
  // -------------------------------------------------------------------------

  /** La carrera murio sin completarse: el dinero vuelve a estar disponible.
   *  Solo desde RESERVED — una carrera hecha JAMAS se libera, se liquida. */
  async function releaseTripReservation(tripId) {
    try {
      const r = await pool.query(
        `update public.driver_commission_reservations
            set status = 'RELEASED', resolved_at = now()
          where trip_id = $1 and status = 'RESERVED'
          returning driver_id`,
        [tripId]
      );
      return r.rowCount === 1;
    } catch (error) {
      logger.error(`[+58express DriverFinance] liberacion fallida: ${error.message}`);
      return false;
    }
  }

  async function readReservedCommission(driverId) {
    const r = await pool.query(
      `select coalesce(sum(reserved_usd), 0) as total
         from public.driver_commission_reservations
        where driver_id = $1 and status in ${OCUPAN_CAPACIDAD}`,
      [driverId]
    );
    return Number(r.rows[0].total);
  }

  /** Las carreras hechas cuyo dinero sigue sin cobrarse. Quien las liquida es
   *  la aplicacion, que conoce la tarifa y la comision; aqui solo se listan. */
  async function listPendingSettlements({ limit = 25 } = {}) {
    const { rows } = await pool.query(
      `select trip_id, driver_id from public.driver_commission_reservations
        where status = 'SETTLEMENT_PENDING'
        order by created_at
        limit $1`,
      [limit]
    );
    return rows.map(r => ({ tripId: r.trip_id, driverId: r.driver_id }));
  }

  /**
   * Reconciliador ACOTADO: repara lo que dejo un proceso muerto.
   *
   * Los candidatos se buscan SIN cerrojos y cada uno se resuelve en su propia
   * transaccion, que toma los cerrojos en el orden global —primero la fila del
   * conductor, despues la reserva—. La version anterior bloqueaba reservas
   * antes que el estado, al reves que todos los demas caminos: ese era el
   * orden invertido que podia trabar una liquidacion en curso.
   *
   * Cada desenlace es el suyo:
   *   · viaje CANCELLED  -> se libera, exactamente una vez.
   *   · viaje COMPLETED con apunte en el libro -> se cierra con los importes
   *     REALES de ese apunte. No se inventa nada: se copia lo que ya se cobro.
   *   · viaje COMPLETED SIN apunte -> el dinero nunca se liquido. NO se
   *     libera: pasa a SETTLEMENT_PENDING, donde sigue ocupando capacidad y
   *     puede reintentarse. Liberarla borraria para siempre la comision y la
   *     ganancia de una carrera que la persona ya hizo.
   *   · traslado programado reclamado cuya hora paso hace mas de un dia sin
   *     llegar a ser carrera -> se suelta la capacidad.
   *   · viaje inexistente -> se cuenta y se registra, sin datos personales y
   *     sin conclusiones de dinero.
   */
  async function reconcileStaleReservations({ limit = 25, staleScheduledHours = 24 } = {}) {
    const resumen = { seen: 0, released: 0, settled: 0, pendingSettlements: 0, orphans: 0, staleScheduled: 0 };
    let candidatos;
    try {
      const { rows } = await pool.query(
        `select r.trip_id, r.driver_id, t.status as trip_status,
                (t.status = 'SCHEDULED'
                 and (t.payload->>'scheduledAt') is not null
                 and (t.payload->>'scheduledAt')::timestamptz < now() - ($2 || ' hours')::interval) as programado_vencido
           from public.driver_commission_reservations r
           left join public.trips t on t.id = r.trip_id
          where r.status = 'RESERVED'
            and (t.id is null
                 or t.status in ('CANCELLED', 'COMPLETED')
                 or (t.status = 'SCHEDULED'
                     and (t.payload->>'scheduledAt') is not null
                     and (t.payload->>'scheduledAt')::timestamptz < now() - ($2 || ' hours')::interval))
          order by r.created_at
          limit $1`,
        [limit, String(staleScheduledHours)]
      );
      candidatos = rows;
    } catch (error) {
      logger.error(`[+58express DriverFinance] busqueda de reservas sin resolver fallida: ${error.message}`);
      return { ...resumen, failed: true };
    }
    resumen.seen = candidatos.length;

    for (const fila of candidatos) {
      if (fila.trip_status === null) { resumen.orphans += 1; continue; }
      const desenlace = await enTransaccion('reconciliacion de una reserva', async client => {
        // ORDEN GLOBAL DE CERROJOS: el conductor primero, siempre.
        await client.query(
          `select 1 from public.driver_finance_state where driver_id = $1 for update`, [fila.driver_id]);
        const viva = await client.query(
          `select status from public.driver_commission_reservations
            where trip_id = $1 and status = 'RESERVED' for update`, [fila.trip_id]);
        if (viva.rowCount !== 1) return 'YA_RESUELTA';

        if (fila.trip_status === 'CANCELLED' || fila.programado_vencido) {
          await client.query(
            `update public.driver_commission_reservations
                set status = 'RELEASED', resolved_at = now()
              where trip_id = $1 and status = 'RESERVED'`,
            [fila.trip_id]);
          return fila.programado_vencido ? 'PROGRAMADO_VENCIDO' : 'LIBERADA';
        }

        // COMPLETED: la verdad la dice el libro.
        const apunte = await client.query(
          `select payload from public.transactions
            where trip_id = $1 and transaction_type in ('PLATFORM_COMMISSION', 'DRIVER_EARNING')
            limit 1`,
          [fila.trip_id]);
        if (apunte.rowCount === 1) {
          const doc = apunte.rows[0].payload;
          const aplicado = roundMoney(Math.max(0, Number(doc.commissionApplied ?? 0)));
          const diferido = roundMoney(Math.max(0, Number(doc.commissionDeferred ?? 0)));
          await client.query(
            `update public.driver_commission_reservations
                set status = 'SETTLED', reserved_usd = $2, applied_usd = $3, deferred_usd = $4,
                    resolved_at = now()
              where trip_id = $1 and status = 'RESERVED'`,
            [fila.trip_id, roundMoney(aplicado + diferido), aplicado, diferido]);
          return 'LIQUIDADA';
        }

        // Completado sin apunte: el dinero NUNCA se cobro. Se marca para
        // reintento, no se tira.
        await client.query(
          `update public.driver_commission_reservations
              set status = 'SETTLEMENT_PENDING'
            where trip_id = $1 and status = 'RESERVED'`,
          [fila.trip_id]);
        return 'PENDIENTE_DE_LIQUIDAR';
      }, 'FALLIDA');

      if (desenlace === 'LIBERADA') resumen.released += 1;
      else if (desenlace === 'PROGRAMADO_VENCIDO') { resumen.released += 1; resumen.staleScheduled += 1; }
      else if (desenlace === 'LIQUIDADA') resumen.settled += 1;
      else if (desenlace === 'PENDIENTE_DE_LIQUIDAR') resumen.pendingSettlements += 1;
    }

    if (resumen.orphans) {
      logger.warn(`[+58express DriverFinance] reservas sin viaje: ${resumen.orphans}`);
    }
    if (resumen.pendingSettlements) {
      logger.warn(`[+58express DriverFinance] carreras hechas pendientes de liquidar: ${resumen.pendingSettlements}`);
    }
    if (resumen.staleScheduled) {
      logger.warn(`[+58express DriverFinance] traslados programados vencidos sin ocurrir: ${resumen.staleScheduled}`);
    }
    return resumen;
  }

  return {
    ensureDriverFinanceState,
    readDriverFinance,
    readEligibilityLocked,
    acceptTripWithReservation,
    settleTripForDriver,
    creditDriverWallet,
    debitDriverWallet,
    chargeMaintenanceObligation,
    setFinancialBlock,
    setActivityAnchor,
    claimInactivityWarning,
    confirmInactivityWarning,
    releaseInactivityWarning,
    releaseTripReservation,
    readReservedCommission,
    listPendingSettlements,
    reconcileStaleReservations
  };
}
