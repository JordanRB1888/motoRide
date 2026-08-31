/**
 * Solicitudes de retiro: reserva atómica, transiciones y liquidación.
 *
 * EL DEFECTO QUE ESTE MÓDULO EXISTE PARA NO REPETIR
 *
 * El retiro que el producto ofrece hoy hace esto:
 *
 *   1. al solicitar, NO toca el saldo;
 *   2. al aprobar, lee el saldo, comprueba que alcanza y lo resta.
 *
 * Entre 1 y 2 el dinero sigue disponible y se puede gastar en viajes, así que
 * la solicitud puede quedar sin fondos que la respalden. Y el paso 2 es un
 * leer-comprobar-escribir sin cerrojo: dos aprobaciones a la vez pueden pasar
 * las dos.
 *
 * Aquí la reserva ocurre AL SOLICITAR y en un `update` condicional: la
 * comprobación de saldo y el descuento son la misma operación, así que no hay
 * ventana entre una y otro.
 *
 * TODO O NADA
 *
 * Reservar los fondos, crear la solicitud y anotar el movimiento van en UNA
 * transacción. Si el proceso muere en medio, no queda ni dinero reservado sin
 * solicitud ni solicitud sin reserva.
 */

import crypto from 'node:crypto';

import {
  ESTADO_INICIAL,
  evaluarTransicion,
  requiereReferenciaDePago,
  type EfectoSobreFondos
} from '../domain/withdrawalStateMachine.ts';
import { convertirConTasa } from './fxRateService.ts';
import { enTransaccion, normalizarImporteUsd, type ClienteSql, type EjecutorSql, type PoolSql } from './walletStore.ts';
import { evaluarDisponibilidad, type EstadoDeBanderas } from './walletFeatureFlags.ts';
import type {
  FxSnapshot,
  PaymentMethodSummary,
  WithdrawalRequest,
  WithdrawalStatus
} from '../../shared/contracts/wallet.ts';
import type { FxRateReading } from '../../shared/contracts/fx.ts';
import { aResumen } from './paymentMethodStore.ts';

export const MOTIVOS_DE_FALLO = [
  'RETIROS_DESHABILITADOS',
  'RETIROS_DE_CONDUCTOR_DESHABILITADOS',
  'IMPORTE_INVALIDO',
  'METODO_NO_ENCONTRADO',
  'METODO_DESHABILITADO',
  'FONDOS_INSUFICIENTES',
  'SIN_TASA_DE_CAMBIO',
  'RETIRO_NO_ENCONTRADO',
  'TRANSICION_INVALIDA',
  'REFERENCIA_DE_PAGO_REQUERIDA'
] as const;
export type MotivoDeFallo = (typeof MOTIVOS_DE_FALLO)[number];

/**
 * La forma de un fallo, compartida por todas las operaciones.
 *
 * Va aparte de las uniones de resultado a propósito: un ayudante tipado con la
 * unión completa sirve para una operación y no para la siguiente, y acaba
 * duplicado.
 */
export interface FalloDeRetiro {
  readonly ok: false;
  readonly motivo: MotivoDeFallo;
  readonly detalle: string;
}

export type ResultadoDeSolicitud =
  | { readonly ok: true; readonly retiro: WithdrawalRequest; readonly yaExistia: boolean }
  | FalloDeRetiro;

const fallo = (motivo: MotivoDeFallo, detalle: string): FalloDeRetiro =>
  ({ ok: false, motivo, detalle });

interface FilaDeRetiro {
  readonly id: string;
  readonly user_id: string;
  readonly status: WithdrawalStatus;
  readonly amount_usd: string;
  readonly payment_method_id: string;
  readonly method_type: string;
  readonly method_snapshot: Record<string, unknown>;
  readonly fx_rate: string | null;
  readonly fx_effective_date: Date | string | null;
  readonly fx_fetched_at: Date | string | null;
  readonly fx_source: string | null;
  readonly amount_ves: string | null;
  readonly payment_reference: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

const instante = (valor: Date | string): string =>
  typeof valor === 'string' ? valor : valor.toISOString();

const fechaIso = (valor: Date | string): string => {
  if (typeof valor === 'string') return valor.slice(0, 10);
  // UTC y no local: `pg` construye la fecha a medianoche, y leerla en un huso
  // al oeste —Caracas lo es— la devolvería al día anterior.
  return `${valor.getUTCFullYear()}-${String(valor.getUTCMonth() + 1).padStart(2, '0')}-${String(valor.getUTCDate()).padStart(2, '0')}`;
};

/**
 * Convierte la fila en el retiro que se le devuelve a su dueño.
 *
 * El método viaja ENMASCARADO, reconstruido desde la instantánea. Los datos
 * completos no salen por aquí ni siquiera para el propio dueño: no le hacen
 * falta para reconocer su cuenta.
 */
function aRetiro(fila: FilaDeRetiro): WithdrawalRequest {
  const instantanea = fila.method_snapshot;
  const metodo: PaymentMethodSummary = aResumen({
    id: fila.payment_method_id,
    user_id: fila.user_id,
    method_type: fila.method_type as PaymentMethodSummary['type'],
    status: 'ACTIVE',
    bank_code: String(instantanea.bankCode ?? ''),
    bank_name: String(instantanea.bankName ?? ''),
    account_type: instantanea.accountType == null ? null : String(instantanea.accountType),
    account_number: instantanea.accountNumber == null ? null : String(instantanea.accountNumber),
    phone: instantanea.phone == null ? null : String(instantanea.phone),
    holder_name: String(instantanea.holderName ?? ''),
    holder_document_type: String(instantanea.holderDocumentType ?? 'V'),
    holder_document_number: String(instantanea.holderDocumentNumber ?? ''),
    created_at: fila.created_at
  });

  const fx: FxSnapshot | null =
    fila.fx_rate && fila.fx_effective_date && fila.fx_fetched_at && fila.fx_source
      ? {
          rate: fila.fx_rate,
          effectiveDate: fechaIso(fila.fx_effective_date),
          fetchedAt: instante(fila.fx_fetched_at),
          source: fila.fx_source
        }
      : null;

  return {
    id: fila.id,
    status: fila.status,
    amount: fila.amount_usd,
    currency: 'USD',
    method: metodo,
    fx,
    amountVes: fila.amount_ves,
    createdAt: instante(fila.created_at),
    updatedAt: instante(fila.updated_at),
    paymentReference: fila.payment_reference
  };
}

export interface EntradaDeSolicitud {
  /** DERIVADO DE LA AUTENTICACIÓN, nunca del cuerpo de la petición. */
  readonly userId: string;
  readonly rol: string;
  readonly metodoId: string;
  readonly monto: string;
  readonly claveDeIdempotencia: string;
  /** Si se quiere fijar el equivalente en bolívares al solicitar. */
  readonly incluirEquivalenteEnVes?: boolean;
  /** La tasa vigente. Se inyecta para no acoplar este servicio al almacén de FX. */
  readonly proveedorDeTasa?: () => Promise<FxRateReading | null>;
  readonly banderas?: EstadoDeBanderas;
}

/**
 * Solicita un retiro y reserva los fondos, atómicamente.
 *
 * Idempotente por `claveDeIdempotencia`: repetir la misma solicitud devuelve la
 * que ya existe sin reservar dos veces, ni siquiera con dos peticiones a la vez.
 */
export async function solicitarRetiro(
  pool: PoolSql,
  entrada: EntradaDeSolicitud
): Promise<ResultadoDeSolicitud> {
  // La bandera se mira ANTES de tocar nada. Y no salta ninguna comprobación
  // posterior: sólo decide si esta funcionalidad está abierta.
  const disponibilidad = evaluarDisponibilidad(entrada.rol, entrada.banderas);
  if (!disponibilidad.disponible) {
    return fallo(disponibilidad.motivo, disponibilidad.detalle);
  }

  const monto = normalizarImporteUsd(entrada.monto);
  if (monto === null || Number(monto) <= 0) {
    return fallo('IMPORTE_INVALIDO', 'el importe debe ser positivo y con dos decimales como mucho');
  }

  // La instantánea del cambio se resuelve FUERA de la transacción: pedir una
  // tasa mientras se tiene bloqueada la fila de la cartera mantendría el
  // cerrojo abierto durante una consulta que no depende de él.
  let fx: FxSnapshot | null = null;
  let montoVes: string | null = null;
  if (entrada.incluirEquivalenteEnVes) {
    const lectura = entrada.proveedorDeTasa ? await entrada.proveedorDeTasa() : null;
    // FALLA CERRADO. Sin tasa oficial no se inventa una: ni 1, ni 0, ni la
    // constante heredada de 874,50, ni una tasa de mercado paralelo.
    if (!lectura) {
      return fallo('SIN_TASA_DE_CAMBIO', 'no hay tasa oficial del BCV disponible');
    }
    fx = {
      rate: lectura.rate.rate,
      effectiveDate: lectura.rate.valueDate,
      fetchedAt: lectura.rate.fetchedAt,
      source: lectura.rate.source
    };
    montoVes = convertirConTasa(monto, lectura.rate.rate);
  }

  try {
    return await intentarSolicitud(pool, entrada, monto, fx, montoVes);
  } catch (error) {
    // CARRERA CON LA MISMA CLAVE DE IDEMPOTENCIA.
    //
    // El `select` de comprobacion no ve la fila que otra transaccion todavia no
    // ha confirmado, asi que dos peticiones simultaneas con la misma clave
    // llegan las dos al `insert` y una pierde contra el indice unico.
    //
    // Perder esa carrera NO es un error para quien llama: significa que su
    // solicitud ya existe. El `rollback` de la transaccion ya deshizo la reserva
    // que esta rama habia hecho, asi que basta con leer la que gano.
    if (esViolacionDeIdempotencia(error)) {
      const existente = await pool.query(
        `select * from public.withdrawal_requests where idempotency_key = $1`,
        [entrada.claveDeIdempotencia]
      );
      const fila = existente.rows[0] as FilaDeRetiro | undefined;
      if (fila) return { ok: true as const, retiro: aRetiro(fila), yaExistia: true };
    }
    throw error;
  }
}

/** El codigo de PostgreSQL para una violacion de unicidad. */
function esViolacionDeIdempotencia(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const detalle = error as { code?: unknown; constraint?: unknown };
  return detalle.code === '23505' && detalle.constraint === 'withdrawals_idempotencia';
}

/** El intento de solicitud propiamente dicho, dentro de una transaccion. */
function intentarSolicitud(
  pool: PoolSql,
  entrada: EntradaDeSolicitud,
  monto: string,
  fx: FxSnapshot | null,
  montoVes: string | null
): Promise<ResultadoDeSolicitud> {
  return enTransaccion(pool, async cliente => {
    // Idempotencia primero: si esta clave ya produjo un retiro, se devuelve
    // aquel y no se reserva nada.
    const existente = await cliente.query(
      `select * from public.withdrawal_requests where idempotency_key = $1`,
      [entrada.claveDeIdempotencia]
    );
    if (existente.rows.length > 0) {
      return { ok: true as const, retiro: aRetiro(existente.rows[0] as FilaDeRetiro), yaExistia: true };
    }

    // El método, con el dueño EN LA CONSULTA. El de otra persona no aparece.
    const metodo = await cliente.query(
      `select * from public.payment_methods where id = $1 and user_id = $2`,
      [entrada.metodoId, entrada.userId]
    );
    const filaMetodo = metodo.rows[0] as Record<string, unknown> | undefined;
    if (!filaMetodo) {
      return fallo('METODO_NO_ENCONTRADO', 'el método no existe o no es de esta persona');
    }
    if (filaMetodo.status !== 'ACTIVE') {
      return fallo('METODO_DESHABILITADO', 'el método está desactivado');
    }

    // LA RESERVA ATÓMICA. La comprobación de saldo vive en el `where`, así que
    // comprobar y descontar son la misma operación y no hay ventana entre las
    // dos. Se descuenta de lo retirable Y de lo disponible: el dinero
    // comprometido en un retiro tampoco puede gastarse en un viaje.
    const reserva = await cliente.query(
      `update public.wallets
          set available_usd = available_usd - $2::numeric,
              withdrawable_available_usd = withdrawable_available_usd - $2::numeric,
              reserved_usd = reserved_usd + $2::numeric,
              updated_at = now()
        where user_id = $1
          and withdrawable_available_usd >= $2::numeric
        returning id, available_usd, reserved_usd`,
      [entrada.userId, monto]
    );
    const cartera = reserva.rows[0] as { id: string; available_usd: string; reserved_usd: string } | undefined;
    if (!cartera) {
      return fallo('FONDOS_INSUFICIENTES', 'no hay saldo retirable suficiente');
    }

    const id = `wd_${crypto.randomUUID()}`;
    const instantanea = {
      bankCode: filaMetodo.bank_code,
      bankName: filaMetodo.bank_name,
      accountType: filaMetodo.account_type,
      accountNumber: filaMetodo.account_number,
      phone: filaMetodo.phone,
      holderName: filaMetodo.holder_name,
      holderDocumentType: filaMetodo.holder_document_type,
      holderDocumentNumber: filaMetodo.holder_document_number
    };

    const creado = await cliente.query(
      `insert into public.withdrawal_requests
         (id, user_id, wallet_id, amount_usd, currency, status, payment_method_id,
          method_type, method_snapshot,
          fx_rate, fx_effective_date, fx_fetched_at, fx_source, amount_ves,
          idempotency_key)
       values ($1, $2, $3, $4::numeric, 'USD', $5, $6, $7, $8::jsonb,
               $9::numeric, $10::date, $11::timestamptz, $12, $13::numeric, $14)
       returning *`,
      [
        id, entrada.userId, cartera.id, monto, ESTADO_INICIAL, entrada.metodoId,
        filaMetodo.method_type, JSON.stringify(instantanea),
        fx?.rate ?? null, fx?.effectiveDate ?? null, fx?.fetchedAt ?? null,
        fx?.source ?? null, montoVes,
        entrada.claveDeIdempotencia
      ]
    );

    await anotarMovimiento(cliente, {
      carteraId: cartera.id,
      userId: entrada.userId,
      monto,
      direccion: 'DEBIT',
      tipo: 'WITHDRAWAL_RESERVE',
      retiroId: id,
      clave: `wd-reserve-${id}`,
      disponible: cartera.available_usd,
      reservado: cartera.reserved_usd
    });

    await anotarAuditoria(cliente, {
      retiroId: id,
      actorId: entrada.userId,
      actorRol: entrada.rol,
      accion: 'REQUEST',
      desde: null,
      hacia: ESTADO_INICIAL,
      motivo: null
    });

    return { ok: true as const, retiro: aRetiro(creado.rows[0] as FilaDeRetiro), yaExistia: false };
  });
}

interface EntradaDeMovimiento {
  readonly carteraId: string;
  readonly userId: string;
  readonly monto: string;
  readonly direccion: 'CREDIT' | 'DEBIT';
  readonly tipo: string;
  readonly retiroId: string;
  readonly clave: string;
  readonly disponible: string;
  readonly reservado: string;
}

/**
 * Anota un movimiento del libro.
 *
 * La clave de idempotencia se compone del retiro y del momento del ciclo
 * (`wd-reserve-…`, `wd-release-…`, `wd-settle-…`), así que un mismo retiro no
 * puede generar dos reservas ni dos liberaciones aunque la operación se repita.
 */
async function anotarMovimiento(cliente: ClienteSql, entrada: EntradaDeMovimiento): Promise<void> {
  await cliente.query(
    `insert into public.wallet_ledger_entries
       (id, wallet_id, user_id, amount_usd, currency, direction, entry_type, fund_class,
        reference_type, reference_id, idempotency_key,
        available_after_usd, reserved_after_usd)
     values ($1, $2, $3, $4::numeric, 'USD', $5, $6, 'EARNED',
             'WITHDRAWAL', $7, $8, $9::numeric, $10::numeric)
     on conflict (idempotency_key) do nothing`,
    [
      `ledger-${entrada.clave}`, entrada.carteraId, entrada.userId, entrada.monto,
      entrada.direccion, entrada.tipo, entrada.retiroId, entrada.clave,
      entrada.disponible, entrada.reservado
    ]
  );
}

interface EntradaDeAuditoria {
  readonly retiroId: string;
  readonly actorId: string;
  readonly actorRol: string;
  readonly accion: string;
  readonly desde: WithdrawalStatus | null;
  readonly hacia: WithdrawalStatus;
  readonly motivo: string | null;
}

/** Deja constancia de quién hizo qué. Sin secretos: sólo identificadores y estados. */
async function anotarAuditoria(cliente: ClienteSql, entrada: EntradaDeAuditoria): Promise<void> {
  await cliente.query(
    `insert into public.withdrawal_audit_events
       (id, withdrawal_id, actor_user_id, actor_role, action, from_status, to_status, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      `wae_${crypto.randomUUID()}`, entrada.retiroId, entrada.actorId, entrada.actorRol,
      entrada.accion, entrada.desde, entrada.hacia,
      entrada.motivo === null ? null : String(entrada.motivo).slice(0, 500)
    ]
  );
}

export type ResultadoDeTransicion =
  | { readonly ok: true; readonly retiro: WithdrawalRequest; readonly sinCambios: boolean }
  | FalloDeRetiro;

export interface EntradaDeCambioDeEstado {
  readonly retiroId: string;
  readonly nuevoEstado: WithdrawalStatus;
  /** Quién lo hace. Para administración, el identificador de la persona administradora. */
  readonly actorId: string;
  readonly actorRol: string;
  /** Sólo para el dueño: restringe la operación a sus propios retiros. */
  readonly restringirAUsuario?: string;
  readonly motivo?: string | null;
  readonly referenciaDePago?: string | null;
}

/**
 * Cambia el estado de un retiro y mueve el dinero según corresponda.
 *
 * IDEMPOTENTE: pedir el estado en el que ya está no vuelve a mover fondos y se
 * informa con `sinCambios`. Marcar PAID tres veces paga una vez.
 *
 * SERIALIZADO: la fila se toma con `for update`, así que dos administradores
 * que aprueben y rechacen a la vez no pueden aplicar los dos efectos — el
 * segundo encuentra el estado ya cambiado y su transición se evalúa contra el
 * estado real.
 */
export async function cambiarEstado(
  pool: PoolSql,
  entrada: EntradaDeCambioDeEstado
): Promise<ResultadoDeTransicion> {
  if (requiereReferenciaDePago(entrada.nuevoEstado)) {
    const referencia = String(entrada.referenciaDePago ?? '').trim();
    // No se genera una referencia automática: una referencia inventada por el
    // sistema no demuestra que el banco movió nada, que es justo para lo que
    // sirve este campo.
    if (referencia === '') {
      return fallo('REFERENCIA_DE_PAGO_REQUERIDA', 'marcar como pagado exige la referencia de la operación');
    }
  }

  return enTransaccion(pool, async cliente => {
    const condicionDeDueno = entrada.restringirAUsuario ? 'and user_id = $2' : '';
    const parametros = entrada.restringirAUsuario
      ? [entrada.retiroId, entrada.restringirAUsuario]
      : [entrada.retiroId];

    const actual = await cliente.query(
      `select * from public.withdrawal_requests
        where id = $1 ${condicionDeDueno}
        for update`,
      parametros
    );
    const fila = actual.rows[0] as FilaDeRetiro | undefined;
    if (!fila) {
      return fallo('RETIRO_NO_ENCONTRADO', 'el retiro no existe o no es de esta persona');
    }

    const transicion = evaluarTransicion(fila.status, entrada.nuevoEstado);
    if (!transicion.permitida) {
      // Pedir el estado en el que ya está es un reintento, no un error.
      if (transicion.motivo === 'YA_ESTA_EN_ESE_ESTADO') {
        return { ok: true as const, retiro: aRetiro(fila), sinCambios: true };
      }
      return fallo('TRANSICION_INVALIDA', transicion.motivo);
    }

    const saldos = await aplicarEfecto(cliente, {
      efecto: transicion.efecto,
      userId: fila.user_id,
      monto: fila.amount_usd,
      retiroId: fila.id
    });

    const actualizado = await cliente.query(
      `update public.withdrawal_requests
          set status = $2,
              payment_reference = coalesce($3, payment_reference),
              updated_at = now()
        where id = $1
        returning *`,
      [fila.id, entrada.nuevoEstado, entrada.referenciaDePago ?? null]
    );

    if (saldos) {
      await anotarMovimiento(cliente, {
        carteraId: saldos.carteraId,
        userId: fila.user_id,
        monto: fila.amount_usd,
        direccion: transicion.efecto === 'LIBERAR' ? 'CREDIT' : 'DEBIT',
        tipo: transicion.efecto === 'LIBERAR' ? 'WITHDRAWAL_RELEASE' : 'WITHDRAWAL_SETTLE',
        retiroId: fila.id,
        clave: `wd-${transicion.efecto === 'LIBERAR' ? 'release' : 'settle'}-${fila.id}`,
        disponible: saldos.disponible,
        reservado: saldos.reservado
      });
    }

    await anotarAuditoria(cliente, {
      retiroId: fila.id,
      actorId: entrada.actorId,
      actorRol: entrada.actorRol,
      accion: entrada.nuevoEstado,
      desde: fila.status,
      hacia: entrada.nuevoEstado,
      motivo: entrada.motivo ?? null
    });

    return { ok: true as const, retiro: aRetiro(actualizado.rows[0] as FilaDeRetiro), sinCambios: false };
  });
}

interface EntradaDeEfecto {
  readonly efecto: EfectoSobreFondos;
  readonly userId: string;
  readonly monto: string;
  readonly retiroId: string;
}

/**
 * Mueve el dinero según el efecto de la transición.
 *
 * LIBERAR devuelve lo reservado a disponible **y** a retirable: volvió a ser
 * dinero que se puede sacar. CONSUMIR lo quita de reservado y no lo devuelve a
 * ningún sitio: se pagó, salió del sistema.
 *
 * Devuelve `null` cuando no hay que mover nada, y en ese caso tampoco se anota
 * movimiento: avanzar de REQUESTED a APPROVED no es un hecho contable.
 */
async function aplicarEfecto(
  cliente: ClienteSql,
  entrada: EntradaDeEfecto
): Promise<{ readonly carteraId: string; readonly disponible: string; readonly reservado: string } | null> {
  if (entrada.efecto === 'NINGUNO') return null;

  const devolver = entrada.efecto === 'LIBERAR';
  const { rows } = await cliente.query(
    devolver
      ? `update public.wallets
            set reserved_usd = reserved_usd - $2::numeric,
                available_usd = available_usd + $2::numeric,
                withdrawable_available_usd = withdrawable_available_usd + $2::numeric,
                updated_at = now()
          where user_id = $1 and reserved_usd >= $2::numeric
          returning id, available_usd, reserved_usd`
      : `update public.wallets
            set reserved_usd = reserved_usd - $2::numeric,
                updated_at = now()
          where user_id = $1 and reserved_usd >= $2::numeric
          returning id, available_usd, reserved_usd`,
    [entrada.userId, entrada.monto]
  );

  const cartera = rows[0] as { id: string; available_usd: string; reserved_usd: string } | undefined;
  if (!cartera) {
    // No debería ocurrir: cada retiro vivo tiene su reserva. Si ocurre, hay una
    // incoherencia contable y lo correcto es abortar la transacción entera, no
    // seguir adelante con el estado cambiado y el dinero sin mover.
    throw new Error('RESERVA_INCOHERENTE');
  }
  return { carteraId: cartera.id, disponible: cartera.available_usd, reservado: cartera.reserved_usd };
}

/** Un retiro concreto de un usuario concreto. El dueño va en la consulta. */
export async function leerRetiroDeUsuario(
  sql: EjecutorSql,
  userId: string,
  retiroId: string
): Promise<WithdrawalRequest | null> {
  const { rows } = await sql.query(
    `select * from public.withdrawal_requests where id = $1 and user_id = $2`,
    [retiroId, userId]
  );
  const fila = rows[0] as FilaDeRetiro | undefined;
  return fila ? aRetiro(fila) : null;
}

/** Los retiros de un usuario, del más nuevo al más viejo. */
export async function listarRetirosDeUsuario(
  sql: EjecutorSql,
  userId: string,
  limite = 50
): Promise<readonly WithdrawalRequest[]> {
  const tope = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 200) : 50;
  const { rows } = await sql.query(
    `select * from public.withdrawal_requests
      where user_id = $1 order by created_at desc limit $2`,
    [userId, tope]
  );
  return (rows as FilaDeRetiro[]).map(aRetiro);
}

/** El historial de auditoría de un retiro, en orden. */
export async function leerAuditoria(
  sql: EjecutorSql,
  retiroId: string
): Promise<readonly Record<string, unknown>[]> {
  const { rows } = await sql.query(
    `select id, actor_user_id, actor_role, action, from_status, to_status, reason, created_at
       from public.withdrawal_audit_events
      where withdrawal_id = $1 order by created_at asc, id asc`,
    [retiroId]
  );
  return rows as Record<string, unknown>[];
}
