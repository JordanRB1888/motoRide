/**
 * Cartera y libro mayor.
 *
 * No crea el pool ni lee `DATABASE_URL`: lo recibe. El mismo código sirve al
 * backend real y a las pruebas contra PostgreSQL de Test, y no hay forma de que
 * este módulo abra por su cuenta una conexión a producción.
 *
 * SOBRE LA PRECISIÓN
 *
 * `pg` devuelve `numeric` como CADENA, y aquí NUNCA se convierte a `number`. Es
 * la misma regla de FX-BCV-1, y en esta fase importa todavía más: el saldo que
 * el producto tiene hoy es un `number` redondeado en JavaScript, y sustituirlo
 * por otro `number` no habría arreglado nada.
 */

import { decimalACadena, decimalDesdeCadena, redondearDecimal } from '../domain/decimalMoney.ts';
import type {
  FundClass,
  LedgerDirection,
  LedgerEntry,
  LedgerEntryType,
  WalletBalances
} from '../../shared/contracts/wallet.ts';
import { esRetirable } from '../domain/fundClasses.ts';

/** Los importes en dólares se llevan a céntimos. */
export const DECIMALES_USD = 2;

export interface ResultadoSql {
  readonly rows: unknown[];
  readonly rowCount?: number | null;
}

/** Lo mínimo que hace falta de un cliente de `pg`. */
export interface EjecutorSql {
  query(texto: string, valores?: readonly unknown[]): Promise<ResultadoSql>;
}

/** Un cliente dedicado, que es lo que permite abrir una transacción. */
export interface ClienteSql extends EjecutorSql {
  release(): void;
}

export interface PoolSql extends EjecutorSql {
  connect(): Promise<ClienteSql>;
}

/**
 * Ejecuta un bloque dentro de una transacción.
 *
 * Con un cliente DEDICADO, no con el pool: en el pool cada consulta puede salir
 * por una conexión distinta, y entonces `BEGIN` y `COMMIT` no envuelven nada.
 * Es un error que no da síntomas hasta que hay concurrencia y dinero.
 */
export async function enTransaccion<T>(
  pool: PoolSql,
  trabajo: (cliente: ClienteSql) => Promise<T>
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const resultado = await trabajo(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (error) {
    // Si el `rollback` también falla, la conexión está rota: importa el error
    // original, que es el que explica qué pasó.
    try { await cliente.query('rollback'); } catch { /* conexión perdida */ }
    throw error;
  } finally {
    cliente.release();
  }
}

/** Normaliza un importe en dólares a céntimos exactos, o `null` si no es utilizable. */
export function normalizarImporteUsd(valor: string): string | null {
  const decimal = decimalDesdeCadena(valor);
  if (decimal === null) return null;
  // Se rechaza el exceso de precisión en vez de redondearlo en silencio: quien
  // pide retirar 10.999 debe recibir un error, no diez con noventa y nueve.
  if (decimal.escala > DECIMALES_USD) return null;
  return decimalACadena(redondearDecimal(decimal, DECIMALES_USD));
}

export function identidadDeCartera(userId: string): string {
  return `wallet-${userId}`;
}

interface FilaDeCartera {
  readonly available_usd: string;
  readonly reserved_usd: string;
  readonly withdrawable_available_usd: string;
}

const aSaldos = (fila: FilaDeCartera): WalletBalances => ({
  currency: 'USD',
  available: fila.available_usd,
  reserved: fila.reserved_usd,
  withdrawableAvailable: fila.withdrawable_available_usd
});

/**
 * Crea la cartera si no existe y devuelve sus saldos.
 *
 * Idempotente: llamarla mil veces deja una sola cartera, porque la identidad es
 * determinista y el `on conflict` no hace nada.
 */
export async function asegurarCartera(sql: EjecutorSql, userId: string): Promise<WalletBalances> {
  const { rows } = await sql.query(
    `insert into public.wallets (id, user_id, currency)
     values ($1, $2, 'USD')
     on conflict (id) do update set updated_at = public.wallets.updated_at
     returning available_usd, reserved_usd, withdrawable_available_usd`,
    [identidadDeCartera(userId), userId]
  );
  return aSaldos(rows[0] as FilaDeCartera);
}

/** Los saldos de una cartera, o `null` si nunca se creó. */
export async function leerCartera(sql: EjecutorSql, userId: string): Promise<WalletBalances | null> {
  const { rows } = await sql.query(
    `select available_usd, reserved_usd, withdrawable_available_usd
       from public.wallets where user_id = $1`,
    [userId]
  );
  const fila = rows[0] as FilaDeCartera | undefined;
  return fila ? aSaldos(fila) : null;
}

export interface EntradaDeAbono {
  readonly userId: string;
  readonly monto: string;
  readonly claseDeFondos: FundClass;
  readonly claveDeIdempotencia: string;
  readonly tipoDeReferencia?: string | null;
  readonly idDeReferencia?: string | null;
}

export const RESULTADOS_DE_ABONO = ['ACREDITADO', 'YA_APLICADO', 'IMPORTE_INVALIDO'] as const;
export type ResultadoDeAbono = (typeof RESULTADOS_DE_ABONO)[number];

/**
 * Abona dinero a una cartera.
 *
 * Es la operación que alimenta la cartera para que haya algo que retirar. Se
 * incluye porque sin ella la fundación no se puede probar de punta a punta,
 * pero **no reemplaza** el cobro ni la liquidación actuales: esos siguen
 * intactos en `server/index.js`.
 *
 * La clase de fondos decide si el dinero es retirable, y esa decisión se toma
 * AQUÍ, al entrar. Después ya no se puede distinguir un dólar de otro.
 *
 * Es idempotente por `claveDeIdempotencia`: repetir el mismo abono no acredita
 * dos veces, ni siquiera si dos procesos lo intentan a la vez.
 */
export async function abonar(
  cliente: ClienteSql,
  entrada: EntradaDeAbono
): Promise<{ readonly resultado: ResultadoDeAbono; readonly saldos: WalletBalances | null }> {
  const monto = normalizarImporteUsd(entrada.monto);
  if (monto === null || Number(monto) <= 0) {
    return { resultado: 'IMPORTE_INVALIDO', saldos: null };
  }

  // Se reserva primero la clave de idempotencia. Si otra transacción ya la
  // tomó, esta no escribe nada — y como todo va dentro de una transacción, el
  // saldo tampoco se mueve.
  const yaExiste = await cliente.query(
    `select 1 from public.wallet_ledger_entries where idempotency_key = $1`,
    [entrada.claveDeIdempotencia]
  );
  if (yaExiste.rows.length > 0) {
    return { resultado: 'YA_APLICADO', saldos: await leerCartera(cliente, entrada.userId) };
  }

  const retirable = esRetirable(entrada.claseDeFondos);
  const { rows } = await cliente.query(
    `update public.wallets
        set available_usd = available_usd + $2::numeric,
            withdrawable_available_usd = withdrawable_available_usd + $3::numeric,
            updated_at = now()
      where user_id = $1
      returning id, available_usd, reserved_usd, withdrawable_available_usd`,
    [entrada.userId, monto, retirable ? monto : '0']
  );
  const cartera = rows[0] as (FilaDeCartera & { id: string }) | undefined;
  if (!cartera) return { resultado: 'IMPORTE_INVALIDO', saldos: null };

  await cliente.query(
    `insert into public.wallet_ledger_entries
       (id, wallet_id, user_id, amount_usd, currency, direction, entry_type, fund_class,
        reference_type, reference_id, idempotency_key,
        available_after_usd, reserved_after_usd)
     values ($1, $2, $3, $4::numeric, 'USD', 'CREDIT', 'WALLET_CREDIT', $5,
             $6, $7, $8, $9::numeric, $10::numeric)`,
    [
      `ledger-${entrada.claveDeIdempotencia}`,
      cartera.id,
      entrada.userId,
      monto,
      entrada.claseDeFondos,
      entrada.tipoDeReferencia ?? null,
      entrada.idDeReferencia ?? null,
      entrada.claveDeIdempotencia,
      cartera.available_usd,
      cartera.reserved_usd
    ]
  );

  return { resultado: 'ACREDITADO', saldos: aSaldos(cartera) };
}

interface FilaDeMovimiento {
  readonly id: string;
  readonly direction: LedgerDirection;
  readonly amount_usd: string;
  readonly entry_type: LedgerEntryType;
  readonly fund_class: FundClass;
  readonly reference_type: string | null;
  readonly reference_id: string | null;
  readonly created_at: Date | string;
  readonly available_after_usd: string;
  readonly reserved_after_usd: string;
}

/** Los movimientos de una cartera, del más nuevo al más viejo. */
export async function leerMovimientos(
  sql: EjecutorSql,
  userId: string,
  limite = 100
): Promise<readonly LedgerEntry[]> {
  const tope = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 500) : 100;
  const { rows } = await sql.query(
    `select id, direction, amount_usd, entry_type, fund_class,
            reference_type, reference_id, created_at,
            available_after_usd, reserved_after_usd
       from public.wallet_ledger_entries
      where user_id = $1
      order by created_at desc, id desc
      limit $2`,
    [userId, tope]
  );

  return (rows as FilaDeMovimiento[]).map(fila => ({
    id: fila.id,
    direction: fila.direction,
    amount: fila.amount_usd,
    currency: 'USD' as const,
    type: fila.entry_type,
    fundClass: fila.fund_class,
    referenceType: fila.reference_type,
    referenceId: fila.reference_id,
    createdAt: typeof fila.created_at === 'string' ? fila.created_at : fila.created_at.toISOString(),
    availableAfter: fila.available_after_usd,
    reservedAfter: fila.reserved_after_usd
  }));
}
