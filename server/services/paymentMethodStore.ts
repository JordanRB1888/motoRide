/**
 * Métodos de retiro: alta, consulta y desactivación.
 *
 * LA PROPIEDAD SE COMPRUEBA EN LA CONSULTA, NO DESPUÉS
 *
 * Todas las lecturas de un método llevan el `user_id` en el `where`. No se lee
 * primero y se compara el dueño después: ese patrón funciona hasta que alguien
 * añade una ruta que se olvida de comparar, y entonces cualquiera puede leer la
 * cuenta bancaria de cualquiera. Aquí un método de otra persona sencillamente
 * no aparece.
 *
 * ENMASCARADO POR DEFECTO
 *
 * La forma normal de un método es la ENMASCARADA. Los datos completos sólo
 * salen por una función que se llama distinto y que existe para un único
 * propósito: que quien va a ejecutar la transferencia pueda ejecutarla.
 */

import crypto from 'node:crypto';

import {
  enmascararDocumento,
  enmascararIdentificador,
  validarMetodoDePago,
  type DatosDeMetodo,
  type MotivoDeRechazo
} from '../domain/venezuelanPaymentMethods.ts';
import type {
  PaymentMethodStatus,
  PaymentMethodSummary,
  PaymentMethodType
} from '../../shared/contracts/wallet.ts';
import type { EjecutorSql } from './walletStore.ts';

interface FilaDeMetodo {
  readonly id: string;
  readonly user_id: string;
  readonly method_type: PaymentMethodType;
  readonly status: PaymentMethodStatus;
  readonly bank_code: string;
  readonly bank_name: string;
  readonly account_type: string | null;
  readonly account_number: string | null;
  readonly phone: string | null;
  readonly holder_name: string;
  readonly holder_document_type: string;
  readonly holder_document_number: string;
  readonly created_at: Date | string;
}

const instante = (valor: Date | string): string =>
  typeof valor === 'string' ? valor : valor.toISOString();

/** Reconstruye los datos validados a partir de la fila. */
function datosDe(fila: FilaDeMetodo): DatosDeMetodo {
  const comunes = {
    bankCode: fila.bank_code,
    bankName: fila.bank_name,
    holderName: fila.holder_name,
    holderDocumentType: fila.holder_document_type as DatosDeMetodo['holderDocumentType'],
    holderDocumentNumber: fila.holder_document_number
  };
  if (fila.method_type === 'BANK_TRANSFER') {
    return {
      ...comunes,
      type: 'BANK_TRANSFER',
      accountType: (fila.account_type ?? 'CORRIENTE') as 'CORRIENTE' | 'AHORRO',
      accountNumber: fila.account_number ?? ''
    };
  }
  return { ...comunes, type: 'PAGO_MOVIL', phone: fila.phone ?? '' };
}

/** La forma enmascarada: lo que se le devuelve a su dueño. */
export function aResumen(fila: FilaDeMetodo): PaymentMethodSummary {
  return {
    id: fila.id,
    type: fila.method_type,
    status: fila.status,
    bankCode: fila.bank_code,
    bankName: fila.bank_name,
    maskedIdentifier: enmascararIdentificador(datosDe(fila)),
    holderName: fila.holder_name,
    createdAt: instante(fila.created_at)
  };
}

export type ResultadoDeAlta =
  | { readonly ok: true; readonly metodo: PaymentMethodSummary }
  | { readonly ok: false; readonly motivo: MotivoDeRechazo; readonly detalle: string };

/**
 * Da de alta un método para un usuario.
 *
 * El `userId` viene de quien llama —que debe haberlo derivado de la
 * autenticación, nunca del cuerpo de la petición— y es el que se guarda. No hay
 * ningún parámetro con el que pedir que el método sea de otra persona.
 */
export async function crearMetodo(
  sql: EjecutorSql,
  userId: string,
  tipo: string,
  entrada: Record<string, unknown>
): Promise<ResultadoDeAlta> {
  const validacion = validarMetodoDePago(tipo, entrada);
  if (!validacion.ok) return validacion;

  const datos = validacion.datos;
  const id = `pm_${crypto.randomUUID()}`;

  const { rows } = await sql.query(
    `insert into public.payment_methods
       (id, user_id, method_type, status, bank_code, bank_name,
        account_type, account_number, phone,
        holder_name, holder_document_type, holder_document_number)
     values ($1, $2, $3, 'ACTIVE', $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [
      id,
      userId,
      datos.type,
      datos.bankCode,
      datos.bankName,
      datos.type === 'BANK_TRANSFER' ? datos.accountType : null,
      datos.type === 'BANK_TRANSFER' ? datos.accountNumber : null,
      datos.type === 'PAGO_MOVIL' ? datos.phone : null,
      datos.holderName,
      datos.holderDocumentType,
      datos.holderDocumentNumber
    ]
  );

  return { ok: true, metodo: aResumen(rows[0] as FilaDeMetodo) };
}

/**
 * Un método concreto de un usuario concreto.
 *
 * El dueño va en el `where`. Pedir el método de otra persona devuelve `null`,
 * que es indistinguible de que no exista — y eso es deliberado: un «no
 * autorizado» confirmaría que ese identificador existe.
 */
export async function leerMetodoDeUsuario(
  sql: EjecutorSql,
  userId: string,
  metodoId: string
): Promise<PaymentMethodSummary | null> {
  const { rows } = await sql.query(
    `select * from public.payment_methods where id = $1 and user_id = $2`,
    [metodoId, userId]
  );
  const fila = rows[0] as FilaDeMetodo | undefined;
  return fila ? aResumen(fila) : null;
}

/** Los métodos de un usuario, enmascarados. */
export async function listarMetodos(
  sql: EjecutorSql,
  userId: string
): Promise<readonly PaymentMethodSummary[]> {
  const { rows } = await sql.query(
    `select * from public.payment_methods
      where user_id = $1 order by created_at desc`,
    [userId]
  );
  return (rows as FilaDeMetodo[]).map(aResumen);
}

/**
 * Desactiva un método. NO lo borra.
 *
 * Borrarlo haría desaparecer la evidencia de a dónde se mandó el dinero en los
 * retiros que lo usaron. La clave foránea de `withdrawal_requests` tampoco lo
 * permitiría, y esa redundancia es intencionada.
 */
export async function desactivarMetodo(
  sql: EjecutorSql,
  userId: string,
  metodoId: string
): Promise<boolean> {
  const resultado = await sql.query(
    `update public.payment_methods
        set status = 'DISABLED', updated_at = now()
      where id = $1 and user_id = $2 and status = 'ACTIVE'`,
    [metodoId, userId]
  );
  return (resultado.rowCount ?? 0) > 0;
}

/**
 * Los datos COMPLETOS de un método, para ejecutar una transferencia.
 *
 * Sólo debe llamarse desde el detalle autorizado de administración, y sólo
 * cuando alguien va a pagar de verdad. Está aparte y se llama distinto para que
 * usarla sea una decisión visible en el código, no algo que ocurre porque una
 * consulta devolvía todas las columnas.
 *
 * El listado general de administración NO usa esto: usa `aResumen`.
 */
export async function leerDetalleCompletoParaPago(
  sql: EjecutorSql,
  metodoId: string
): Promise<(DatosDeMetodo & { readonly id: string; readonly maskedDocument: string }) | null> {
  const { rows } = await sql.query(
    `select * from public.payment_methods where id = $1`,
    [metodoId]
  );
  const fila = rows[0] as FilaDeMetodo | undefined;
  if (!fila) return null;
  const datos = datosDe(fila);
  return {
    ...datos,
    id: fila.id,
    maskedDocument: enmascararDocumento(datos.holderDocumentType, datos.holderDocumentNumber)
  };
}
