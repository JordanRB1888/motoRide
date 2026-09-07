/**
 * El servicio de tipo de cambio: lo que el resto del sistema consume.
 *
 * Es la ÚNICA puerta por la que debe entrar una tasa a la aplicación. El
 * proveedor sabe hablar con el BCV y el almacén sabe hablar con PostgreSQL;
 * quien calcula un precio sólo debería conocer esto.
 *
 * TRES DECISIONES QUE IMPORTAN
 *
 * 1. **No existe tasa por defecto.** Si nunca se ha obtenido ninguna,
 *    `tasaVigente()` devuelve `null` y `convertirUsdAVes()` falla. Es
 *    deliberado y es incómodo a propósito: un valor de respaldo escrito a mano
 *    se queda viejo en silencio y cobra mal durante semanas sin que nadie se
 *    entere. Preferimos que se note.
 *
 * 2. **La última tasa buena conocida se sirve, pero MARCADA.** Si el BCV lleva
 *    días sin responder, se sigue devolviendo la última tasa real con
 *    `freshness: 'STALE'` y su edad en días. Nunca se inventa una nueva y nunca
 *    se disimula que es vieja.
 *
 * 3. **La tasa no pasa por `number` en ningún punto.** Entra como cadena desde
 *    el BCV, se guarda como `numeric`, vuelve como cadena y se multiplica con
 *    enteros.
 */

import {
  decimalACadena,
  decimalDesdeCadena,
  esPositivo,
  multiplicarDecimales,
  redondearDecimal
} from '../domain/decimalMoney.ts';
import type { FxRate, FxRateReading } from '../../shared/contracts/fx.ts';
import { leerHistorial, leerTasaVigente, type EjecutorSql } from './fxRateStore.ts';

/** El huso en el que el BCV declara sus fechas valor. */
export const ZONA_DE_CARACAS = 'America/Caracas';

/** Los bolívares se redondean a céntimos, como cualquier importe cobrable. */
export const DECIMALES_DE_VES = 2;

/**
 * Cuántos días puede tener una tasa y seguir considerándose fresca.
 *
 * Uno, no cero. El BCV publica de lunes a viernes la tasa que regirá el día
 * hábil siguiente, así que un sábado la tasa vigente legítima tiene fecha del
 * viernes. Con tolerancia cero, todos los fines de semana y todos los feriados
 * aparecerían como degradados y la señal dejaría de significar nada.
 */
export const TOLERANCIA_DE_FRESCURA_DIAS = 1;

/** Cuánto se reutiliza la tasa en memoria antes de volver a preguntar. */
const VIGENCIA_DE_CACHE_MS = 5 * 60 * 1000;

/** La fecha de hoy en Caracas, `YYYY-MM-DD`. */
export function hoyEnCaracas(instante: Date = new Date()): string {
  // `en-CA` produce exactamente `YYYY-MM-DD`, y `timeZone` hace el trabajo de
  // convertir sin construir fechas a mano ni sumar offsets.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_DE_CARACAS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(instante);
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Días completos entre dos fechas `YYYY-MM-DD`. Negativo si la segunda es futura. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError('fecha inválida');
  return Math.round((b - a) / UN_DIA_MS);
}

/**
 * Evalúa la frescura de una tasa respecto de hoy en Caracas.
 *
 * Una tasa con fecha valor FUTURA es fresca, no sospechosa: es el
 * funcionamiento normal del BCV, que publica por la tarde la del día siguiente.
 */
export function evaluarFrescura(tasa: FxRate, ahora: Date = new Date()): FxRateReading {
  const edad = diasEntre(tasa.valueDate, hoyEnCaracas(ahora));
  const ageInDays = Math.max(0, edad);
  return {
    rate: tasa,
    freshness: ageInDays <= TOLERANCIA_DE_FRESCURA_DIAS ? 'FRESH' : 'STALE',
    ageInDays
  };
}

/**
 * Convierte dólares a bolívares con la tasa dada.
 *
 * Las dos entradas son cadenas decimales, y el resultado sale redondeado a
 * céntimos con redondeo comercial. La multiplicación se hace a precisión
 * completa ANTES de redondear: redondear la tasa primero y multiplicar después
 * introduce un error que crece con el importe.
 */
export function convertirConTasa(montoUsd: string, tasa: string): string {
  const monto = decimalDesdeCadena(montoUsd);
  if (monto === null) throw new TypeError(`importe en dólares ilegible: ${montoUsd}`);
  if (monto.unidades < 0n) throw new RangeError('un importe a convertir no puede ser negativo');

  const cambio = decimalDesdeCadena(tasa);
  if (cambio === null) throw new TypeError('tasa de cambio ilegible');
  if (!esPositivo(cambio)) throw new RangeError('la tasa de cambio tiene que ser positiva');

  return decimalACadena(redondearDecimal(multiplicarDecimales(monto, cambio), DECIMALES_DE_VES));
}

/** Se lanza cuando se pide una conversión y el sistema todavía no tiene tasa. */
export class SinTasaDisponible extends Error {
  constructor() {
    super('FX_RATE_UNAVAILABLE');
    this.name = 'SinTasaDisponible';
  }
}

export interface OpcionesDelServicio {
  readonly sql: EjecutorSql;
  readonly ahora?: () => Date;
  readonly vigenciaDeCacheMs?: number;
}

export interface ServicioDeCambio {
  /** La tasa vigente con su frescura, o `null` si nunca se obtuvo ninguna. */
  tasaVigente(): Promise<FxRateReading | null>;
  /** Convierte usando la tasa vigente. Lanza `SinTasaDisponible` si no hay. */
  convertirUsdAVes(montoUsd: string): Promise<string>;
  /** Historial reciente, para el panel de administración y la auditoría. */
  historial(limite?: number): Promise<readonly FxRate[]>;
  /** Olvida lo cacheado. La tarea diaria lo llama tras guardar una tasa nueva. */
  invalidarCache(): void;
}

/**
 * Crea el servicio.
 *
 * La caché es sólo una optimización de lectura: evita una consulta por cada
 * cálculo de precio. Nunca sirve para tapar la ausencia de tasa —un `null` no
 * se cachea— ni para alargar la vida de una tasa vieja, porque la frescura se
 * recalcula en cada lectura contra el reloj, no contra el momento en que se
 * guardó en la caché.
 */
export function crearServicioDeCambio(opciones: OpcionesDelServicio): ServicioDeCambio {
  const { sql } = opciones;
  const ahora = opciones.ahora ?? (() => new Date());
  const vigencia = opciones.vigenciaDeCacheMs ?? VIGENCIA_DE_CACHE_MS;

  let cacheada: FxRate | null = null;
  let cacheadaEn = 0;

  async function obtenerTasa(): Promise<FxRate | null> {
    const instante = ahora().getTime();
    if (cacheada && instante - cacheadaEn < vigencia) return cacheada;

    const tasa = await leerTasaVigente(sql);
    if (tasa) {
      cacheada = tasa;
      cacheadaEn = instante;
    }
    return tasa;
  }

  return {
    async tasaVigente() {
      const tasa = await obtenerTasa();
      return tasa ? evaluarFrescura(tasa, ahora()) : null;
    },

    async convertirUsdAVes(montoUsd: string) {
      const tasa = await obtenerTasa();
      // Se falla en vez de devolver cero o un valor supuesto. Cobrar cero
      // bolívares es un error tan grave como cobrar de más, y silencioso.
      if (!tasa) throw new SinTasaDisponible();
      return convertirConTasa(montoUsd, tasa.rate);
    },

    historial(limite?: number) {
      return leerHistorial(sql, limite);
    },

    invalidarCache() {
      cacheada = null;
      cacheadaEn = 0;
    }
  };
}
