/**
 * Contratos de tipo de cambio USD/VES.
 *
 * Se comparten entre frontend y backend a propósito: la tasa oficial es un
 * dato que las dos mitades muestran y usan, y duplicar su forma es la manera
 * más fácil de que se desincronicen.
 *
 * REGLA QUE NO SE NEGOCIA: la tasa viaja como CADENA DECIMAL, nunca como
 * `number`. El BCV publica ocho decimales y un `double` de JavaScript no puede
 * representarlos con exactitud — 794,99170000 deja de ser 794,99170000 en
 * cuanto pasa por un float. Todo el dinero de este sistema se calcula con
 * enteros sobre esa cadena.
 */

/** Las monedas que este sistema conoce. La base es siempre el dólar. */
export const FX_BASE_CURRENCY = 'USD' as const;
export const FX_QUOTE_CURRENCY = 'VES' as const;

/**
 * De dónde salió una tasa.
 *
 * `BCV` es la única fuente admitida para la tasa oficial. El literal existe
 * para que la base de datos pueda distinguir orígenes en el futuro sin cambiar
 * el esquema, NO para abrir la puerta a fuentes paralelas: el proveedor sólo
 * escribe `BCV`, y hay una prueba que lo vigila.
 */
export const FX_RATE_SOURCES = ['BCV'] as const;
export type FxRateSource = (typeof FX_RATE_SOURCES)[number];

/**
 * Una tasa oficial publicada, tal y como se guarda y se sirve.
 *
 * `valueDate` es la FECHA VALOR que declara el propio BCV (el día para el que
 * la tasa rige), no el día en que nosotros la descargamos. Son cosas distintas
 * y confundirlas es un error contable: el BCV publica por la tarde la tasa que
 * regirá el día siguiente.
 */
export interface FxRate {
  /** Código ISO de la moneda base. Siempre `USD`. */
  readonly base: typeof FX_BASE_CURRENCY;
  /** Código ISO de la moneda cotizada. Siempre `VES`. */
  readonly quote: typeof FX_QUOTE_CURRENCY;
  /** Cuántos bolívares vale un dólar, como cadena decimal exacta. */
  readonly rate: string;
  /** Fecha valor declarada por el BCV, en formato `YYYY-MM-DD`. */
  readonly valueDate: string;
  /** Quién publicó la tasa. */
  readonly source: FxRateSource;
  /** Cuándo la obtuvimos nosotros, en ISO 8601 con zona. */
  readonly fetchedAt: string;
}

/**
 * Qué tan fresca es la tasa que se está sirviendo.
 *
 * Existe porque la alternativa —servir una tasa vieja sin decirlo— es la forma
 * silenciosa de cobrar mal. Quien consume la tasa tiene derecho a saber si
 * está mirando la de hoy o la última que se pudo conseguir.
 */
export const FX_FRESHNESS = ['FRESH', 'STALE'] as const;
export type FxFreshness = (typeof FX_FRESHNESS)[number];

/** La tasa vigente, acompañada de su frescura. */
export interface FxRateReading {
  readonly rate: FxRate;
  readonly freshness: FxFreshness;
  /** Días completos transcurridos desde la fecha valor. `0` el mismo día. */
  readonly ageInDays: number;
}
