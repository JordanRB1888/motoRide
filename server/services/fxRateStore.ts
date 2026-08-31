/**
 * Persistencia de las tasas oficiales.
 *
 * No crea el pool ni lee `DATABASE_URL`: lo recibe. Así el mismo código sirve
 * al backend real y a las pruebas contra PostgreSQL de Test, y no hay forma de
 * que este módulo abra por su cuenta una conexión a producción.
 *
 * SOBRE LA PRECISIÓN AL LEER
 *
 * El driver `pg` devuelve `numeric` como CADENA, no como `number`, y eso es
 * exactamente lo que se quiere: convertirlo a `number` rompería la precisión
 * que la columna `numeric(18,8)` existe para proteger. Aquí no se convierte
 * nunca, y hay una prueba que lo comprueba.
 */

import type { FxRate } from '../../shared/contracts/fx.ts';

/** Lo mínimo que este módulo necesita de un pool de `pg`. */
export interface EjecutorSql {
  query(texto: string, valores?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

export const TABLA_DE_TASAS = 'public.exchange_rates';
/** El nombre sin esquema, que es como hay que referirse a la tabla dentro de un `on conflict`. */
const TABLA_SIN_ESQUEMA = 'exchange_rates';

/** Construye la identidad determinista de una tasa. */
export function identidadDeTasa(
  base: string,
  quote: string,
  fuente: string,
  fechaValor: string
): string {
  return `${base}-${quote}-${fuente}-${fechaValor}`;
}

/** Qué ocurrió al guardar. Distinguirlo importa para el registro y la auditoría. */
export const RESULTADOS_DE_GUARDADO = ['INSERTADA', 'CORREGIDA', 'SIN_CAMBIOS'] as const;
export type ResultadoDeGuardado = (typeof RESULTADOS_DE_GUARDADO)[number];

interface FilaDeTasa {
  readonly rate: string;
  readonly value_date: Date | string;
  readonly source: string;
  readonly fetched_at: Date | string;
  readonly revision: number;
}

/** `date` de PostgreSQL a `YYYY-MM-DD`, sin que el huso local desplace el día. */
function aFechaIso(valor: Date | string): string {
  if (typeof valor === 'string') return valor.slice(0, 10);
  // `getUTCFullYear` y no `getFullYear`: `pg` construye la fecha a medianoche, y
  // leerla en un huso al oeste la devolvería al día anterior.
  const anio = valor.getUTCFullYear();
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(valor.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function aInstanteIso(valor: Date | string): string {
  return typeof valor === 'string' ? valor : valor.toISOString();
}

function aFxRate(fila: FilaDeTasa): FxRate {
  return {
    base: 'USD',
    quote: 'VES',
    rate: fila.rate,
    valueDate: aFechaIso(fila.value_date),
    source: 'BCV',
    fetchedAt: aInstanteIso(fila.fetched_at)
  };
}

/**
 * Guarda una tasa. Es IDEMPOTENTE por (moneda, moneda, fuente, fecha valor).
 *
 * Ejecutar la tarea dos veces el mismo día no duplica nada ni cuenta una
 * revisión de más: el `where` del `do update` hace que una tasa idéntica no
 * escriba absolutamente nada.
 *
 * Si el BCV CORRIGE la tasa de una fecha ya guardada, se actualiza y se
 * incrementa `revision`. No se guarda en silencio: quien llama recibe
 * `CORREGIDA` y puede registrarlo, porque una corrección sobre un día con el
 * que ya se cobró es algo que alguien debería mirar.
 */
export async function guardarTasa(
  sql: EjecutorSql,
  tasa: { readonly tasa: string; readonly fechaValor: string; readonly obtenidaEn: string }
): Promise<{ readonly resultado: ResultadoDeGuardado; readonly revision: number }> {
  const id = identidadDeTasa('USD', 'VES', 'BCV', tasa.fechaValor);

  // La tasa entra como TEXTO y se convierte en el motor con `::numeric`. Si
  // viajara como número de JavaScript ya habría perdido precisión antes de
  // llegar aquí, y la columna `numeric` no podría salvarla.
  const { rows } = await sql.query(
    `insert into ${TABLA_DE_TASAS}
       (id, base_currency, quote_currency, rate, value_date, source, fetched_at, revision)
     values ($1, 'USD', 'VES', $2::numeric, $3::date, 'BCV', $4::timestamptz, 1)
     on conflict (id) do update
        set rate = excluded.rate,
            fetched_at = excluded.fetched_at,
            revision = ${TABLA_SIN_ESQUEMA}.revision + 1
      where ${TABLA_SIN_ESQUEMA}.rate is distinct from excluded.rate
     returning revision, (xmax = 0) as insertada`,
    [id, tasa.tasa, tasa.fechaValor, tasa.obtenidaEn]
  );

  // Sin fila devuelta significa que el `where` filtró la actualización: la tasa
  // ya estaba guardada y es idéntica.
  const fila = rows[0] as { revision: number; insertada: boolean } | undefined;
  if (!fila) {
    const actual = await leerTasaDeFecha(sql, tasa.fechaValor);
    return { resultado: 'SIN_CAMBIOS', revision: actual?.revision ?? 1 };
  }

  return {
    resultado: fila.insertada ? 'INSERTADA' : 'CORREGIDA',
    revision: fila.revision
  };
}

/** La tasa guardada para una fecha valor concreta, si existe. */
export async function leerTasaDeFecha(
  sql: EjecutorSql,
  fechaValor: string
): Promise<(FxRate & { readonly revision: number }) | null> {
  const { rows } = await sql.query(
    `select rate, value_date, source, fetched_at, revision
       from ${TABLA_DE_TASAS}
      where base_currency = 'USD' and quote_currency = 'VES'
        and source = 'BCV' and value_date = $1::date`,
    [fechaValor]
  );
  const fila = rows[0] as FilaDeTasa | undefined;
  return fila ? { ...aFxRate(fila), revision: fila.revision } : null;
}

/**
 * La tasa vigente: la de fecha valor más reciente.
 *
 * Devuelve `null` cuando todavía no hay ninguna. Ese `null` es importante y no
 * se disimula con un valor por defecto — un sistema sin tasa tiene que saber
 * que no la tiene, no creer que vale algo.
 */
export async function leerTasaVigente(sql: EjecutorSql): Promise<FxRate | null> {
  const { rows } = await sql.query(
    `select rate, value_date, source, fetched_at, revision
       from ${TABLA_DE_TASAS}
      where base_currency = 'USD' and quote_currency = 'VES' and source = 'BCV'
      order by value_date desc
      limit 1`
  );
  const fila = rows[0] as FilaDeTasa | undefined;
  return fila ? aFxRate(fila) : null;
}

/** Historial reciente, de la más nueva a la más vieja. Para el panel y auditoría. */
export async function leerHistorial(sql: EjecutorSql, limite = 30): Promise<readonly FxRate[]> {
  const tope = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 365) : 30;
  const { rows } = await sql.query(
    `select rate, value_date, source, fetched_at, revision
       from ${TABLA_DE_TASAS}
      where base_currency = 'USD' and quote_currency = 'VES' and source = 'BCV'
      order by value_date desc
      limit $1`,
    [tope]
  );
  return (rows as FilaDeTasa[]).map(aFxRate);
}
