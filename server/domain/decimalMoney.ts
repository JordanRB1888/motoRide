/**
 * Aritmética decimal exacta con enteros.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 *
 * La tasa del BCV trae ocho decimales y los importes en bolívares se calculan
 * multiplicando por ella. Con `number` eso está roto desde el primer día:
 *
 *     0.1 + 0.2                  === 0.30000000000000004
 *     794.9917 * 3.5             === 2782.4709500000003
 *     Number('794.99170000')     pierde la representación exacta
 *
 * Un céntimo perdido por viaje, multiplicado por todos los viajes, es dinero
 * real de conductoras y conductores. Así que aquí no hay coma flotante: un
 * decimal es un `bigint` de unidades más una escala, y todas las operaciones
 * son enteras.
 *
 * No se usa ninguna librería externa a propósito — es poco código, se entiende
 * entero, y una dependencia más en la ruta del dinero es una dependencia más
 * que auditar.
 */

/**
 * Un número decimal exacto: `unidades / 10^escala`.
 *
 * `794.99170000` es `{ unidades: 79499170000n, escala: 8 }`.
 */
export interface Decimal {
  readonly unidades: bigint;
  readonly escala: number;
}

/** Cuántos decimales admitimos como máximo. Ocho es lo que publica el BCV. */
export const ESCALA_MAXIMA = 12;

/**
 * Forma canónica: la que usa PostgreSQL y la que guardamos.
 *
 * Punto decimal, sin separador de miles, sin signo positivo explícito. Se
 * rechaza cualquier otra cosa en vez de intentar adivinarla.
 */
const CANONICO = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Formato de publicación venezolano: punto para los miles, coma para los
 * decimales. `794,99170000` y `1.234,56789012`.
 *
 * Es DELIBERADAMENTE estricto. Si los grupos de miles no son de tres dígitos,
 * o el separador decimal no es una coma, se rechaza: preferimos fallar y que
 * alguien mire, antes que interpretar `1.234` como mil doscientos treinta y
 * cuatro cuando en realidad quería decir uno coma dos tres cuatro. Un error de
 * mil veces en una tasa de cambio no es un detalle.
 */
const VENEZOLANO = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,12})?$/;

/** Construye un decimal validando la escala. */
function crear(unidades: bigint, escala: number): Decimal {
  if (!Number.isInteger(escala) || escala < 0 || escala > ESCALA_MAXIMA) {
    throw new RangeError(`escala decimal fuera de rango: ${escala}`);
  }
  return { unidades, escala };
}

/**
 * Lee un decimal en forma canónica (`-1234.5678`).
 *
 * Devuelve `null` en vez de lanzar porque quien llama casi siempre está
 * validando entrada externa, y ahí un `null` se maneja mejor que una excepción.
 */
export function decimalDesdeCadena(texto: string): Decimal | null {
  if (typeof texto !== 'string') return null;
  const coincidencia = CANONICO.exec(texto.trim());
  if (!coincidencia) return null;

  const [, signo, entera, decimales = ''] = coincidencia;
  if (decimales.length > ESCALA_MAXIMA) return null;

  const digitos = `${entera}${decimales}`;
  const unidades = BigInt(digitos) * (signo === '-' ? -1n : 1n);
  return crear(unidades, decimales.length);
}

/**
 * Lee un decimal en el formato que publica el BCV (`1.234,56789012`).
 *
 * Nunca acepta valores negativos: una tasa de cambio negativa no existe, y
 * aceptarla sólo serviría para que un fallo de la fuente entrara al sistema.
 */
export function decimalDesdeFormatoVenezolano(texto: string): Decimal | null {
  if (typeof texto !== 'string') return null;
  const limpio = texto.trim();
  if (!VENEZOLANO.test(limpio)) return null;
  return decimalDesdeCadena(limpio.replace(/\./g, '').replace(',', '.'));
}

/** Escribe el decimal en forma canónica, conservando su escala. */
export function decimalACadena(valor: Decimal): string {
  const negativo = valor.unidades < 0n;
  const digitos = (negativo ? -valor.unidades : valor.unidades)
    .toString()
    .padStart(valor.escala + 1, '0');
  const corte = digitos.length - valor.escala;
  const entera = digitos.slice(0, corte);
  const decimales = digitos.slice(corte);
  const cuerpo = valor.escala === 0 ? entera : `${entera}.${decimales}`;
  return negativo ? `-${cuerpo}` : cuerpo;
}

/** Lleva un decimal a otra escala mayor sin perder nada. */
function reescalar(valor: Decimal, escala: number): Decimal {
  if (escala < valor.escala) throw new RangeError('reescalar no puede perder precisión');
  return crear(valor.unidades * 10n ** BigInt(escala - valor.escala), escala);
}

/** Compara dos decimales de escalas distintas. `-1`, `0` o `1`. */
export function compararDecimales(a: Decimal, b: Decimal): number {
  const escala = Math.max(a.escala, b.escala);
  const izquierda = reescalar(a, escala).unidades;
  const derecha = reescalar(b, escala).unidades;
  if (izquierda < derecha) return -1;
  return izquierda > derecha ? 1 : 0;
}

/** `true` si el decimal es estrictamente mayor que cero. */
export function esPositivo(valor: Decimal): boolean {
  return valor.unidades > 0n;
}

/**
 * Multiplica dos decimales sin perder un solo dígito.
 *
 * La escala del resultado es la suma de las escalas — que es exactamente lo
 * que exige la aritmética. El redondeo se hace después y por separado, para
 * que sea una decisión visible en vez de un efecto secundario.
 */
export function multiplicarDecimales(a: Decimal, b: Decimal): Decimal {
  const escala = a.escala + b.escala;
  if (escala > ESCALA_MAXIMA * 2) throw new RangeError('producto demasiado preciso');
  return { unidades: a.unidades * b.unidades, escala };
}

/**
 * Redondea a una escala, con redondeo comercial (medio hacia arriba en valor
 * absoluto): `2.345` a dos decimales da `2.35`, y `-2.345` da `-2.35`.
 *
 * Se eligió medio-arriba y no el «medio a par» de IEEE porque es lo que espera
 * cualquiera que mire una factura, y porque es lo que hace PostgreSQL al
 * redondear `numeric`. Que las dos mitades del sistema redondeen igual importa
 * más que cuál de los dos criterios sea teóricamente mejor.
 */
export function redondearDecimal(valor: Decimal, escala: number): Decimal {
  if (!Number.isInteger(escala) || escala < 0) throw new RangeError(`escala inválida: ${escala}`);
  if (escala >= valor.escala) return reescalar(valor, escala);

  const divisor = 10n ** BigInt(valor.escala - escala);
  const negativo = valor.unidades < 0n;
  const absoluto = negativo ? -valor.unidades : valor.unidades;

  const cociente = absoluto / divisor;
  const resto = absoluto % divisor;
  // `resto * 2 >= divisor` es «la mitad o más», sin dividir y sin flotantes.
  const redondeado = resto * 2n >= divisor ? cociente + 1n : cociente;

  return crear(negativo ? -redondeado : redondeado, escala);
}
