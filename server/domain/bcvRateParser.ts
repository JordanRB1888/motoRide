/**
 * Lectura del tipo de cambio oficial USD/VES publicado por el BCV.
 *
 * Este módulo es PURO: recibe HTML y devuelve un resultado. No abre conexiones,
 * no lee variables de entorno y no toca la base de datos. Esa pureza es lo que
 * permite probarlo contra HTML capturado de verdad, incluidas las formas rotas,
 * sin depender de que el sitio del BCV esté disponible durante las pruebas.
 *
 * QUÉ PUBLICA EL BCV, LITERALMENTE
 *
 * En su portada, dentro de un bloque con `id="dolar"`:
 *
 *     <div id="dolar" ...>
 *       ... <span> USD</span> ...
 *       <strong class="strong-tb">794,99170000</strong>
 *     </div>
 *     <div class="pull-right dinpro center"> Fecha Valor:
 *       <span class="date-display-single" ...
 *             content="2026-08-31T00:00:00-04:00">Lunes, 31 Agosto 2026</span>
 *
 * Tres cosas que decidieron el diseño:
 *
 *  1. `id="dolar"` es un ancla SEMÁNTICA, no una clase visual. Es lo más
 *     estable que ofrece la página, así que es de donde se ancla la búsqueda.
 *     Las clases (`col-sm-6`, `textp`) cambian con cualquier retoque de estilo
 *     y no se usan para nada.
 *
 *  2. El valor viene en formato venezolano y con OCHO decimales.
 *
 *  3. La fecha valor viene también legible por máquina en el atributo
 *     `content`, en ISO 8601 y con el huso de Caracas (`-04:00`). Se usa esa y
 *     no el texto «Lunes, 31 Agosto 2026», que obligaría a traducir nombres de
 *     meses en español y se rompería con cualquier cambio de redacción.
 *
 * No se usa un parser de HTML completo (jsdom, cheerio) a propósito: sería una
 * dependencia pesada en la ruta del dinero para leer dos valores de un bloque
 * con identificador propio.
 */

import {
  decimalACadena,
  decimalDesdeFormatoVenezolano,
  esPositivo,
  type Decimal
} from './decimalMoney.ts';

/** Por qué no se pudo leer la tasa. Sirve para diagnosticar sin adivinar. */
export const MOTIVOS_DE_FALLO = [
  'HTML_VACIO',
  'BLOQUE_DOLAR_AUSENTE',
  'MONEDA_NO_CONFIRMADA',
  'VALOR_AUSENTE',
  'VALOR_ILEGIBLE',
  'VALOR_NO_POSITIVO',
  'VALOR_FUERA_DE_RANGO',
  'FECHA_VALOR_AUSENTE',
  'FECHA_VALOR_ILEGIBLE'
] as const;
export type MotivoDeFallo = (typeof MOTIVOS_DE_FALLO)[number];

export interface LecturaDelBcv {
  /** Bolívares por dólar, cadena decimal exacta con la precisión publicada. */
  readonly tasa: string;
  /** Fecha valor declarada por el BCV, `YYYY-MM-DD`. */
  readonly fechaValor: string;
}

export type ResultadoDeLectura =
  | { readonly ok: true; readonly lectura: LecturaDelBcv }
  | { readonly ok: false; readonly motivo: MotivoDeFallo; readonly detalle: string };

/**
 * Límites de cordura, deliberadamente ANCHOS.
 *
 * No son una predicción de la tasa ni un valor de respaldo: son un filtro de
 * basura. Sirven para descartar un `0`, un año colado por error o una página de
 * mantenimiento que casualmente contenga un número. Poner aquí un rango
 * estrecho sería inventar una opinión sobre el bolívar, que es justo lo que
 * este módulo no debe hacer.
 */
const TASA_MINIMA_PLAUSIBLE = 1n;
const TASA_MAXIMA_PLAUSIBLE = 100_000_000n;

const fallo = (motivo: MotivoDeFallo, detalle: string): ResultadoDeLectura =>
  ({ ok: false, motivo, detalle });

/**
 * Recorta el bloque del dólar.
 *
 * Se acota a una ventana desde el ancla en lugar de intentar equilibrar `<div>`
 * anidados: contar etiquetas a mano en HTML real es frágil, y lo único que hace
 * falta es no invadir el bloque de otra moneda. La ventana es suficientemente
 * corta para eso y suficientemente larga para contener el valor.
 */
const ANCHO_DEL_BLOQUE = 1200;

function bloqueDelDolar(html: string): string | null {
  const ancla = /id\s*=\s*["']dolar["']/i.exec(html);
  if (!ancla) return null;
  return html.slice(ancla.index, ancla.index + ANCHO_DEL_BLOQUE);
}

/** La fecha valor, del atributo legible por máquina. */
function leerFechaValor(html: string): ResultadoDeLectura | string {
  const ancla = /Fecha\s+Valor/i.exec(html);
  if (!ancla) return fallo('FECHA_VALOR_AUSENTE', 'no aparece la etiqueta «Fecha Valor»');

  const ventana = html.slice(ancla.index, ancla.index + 400);
  const atributo = /content\s*=\s*["'](\d{4})-(\d{2})-(\d{2})T[^"']*["']/.exec(ventana);
  if (!atributo) {
    return fallo('FECHA_VALOR_ILEGIBLE', 'la etiqueta no viene acompañada de una fecha ISO');
  }

  const [, anio, mes, dia] = atributo;
  const fecha = `${anio}-${mes}-${dia}`;

  // El atributo ya viene con el huso de Caracas, así que la parte de fecha se
  // toma TAL CUAL. Pasarla por `new Date()` y volver a formatearla en UTC la
  // correría un día — un error clásico, y aquí un día de diferencia es la tasa
  // equivocada.
  const comprobacion = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(comprobacion.getTime()) || !comprobacion.toISOString().startsWith(fecha)) {
    return fallo('FECHA_VALOR_ILEGIBLE', `fecha inexistente en el calendario: ${fecha}`);
  }
  return fecha;
}

/**
 * Lee la tasa oficial del dólar de la portada del BCV.
 *
 * Falla CERRADO: ante cualquier ambigüedad devuelve un error con su motivo, y
 * nunca un valor aproximado. Quien llama decide qué hacer, y lo que hace el
 * proveedor es conservar la última tasa buena conocida.
 */
export function leerTasaDelBcv(html: string): ResultadoDeLectura {
  if (typeof html !== 'string' || html.trim() === '') {
    return fallo('HTML_VACIO', 'no llegó documento que analizar');
  }

  const bloque = bloqueDelDolar(html);
  if (bloque === null) {
    return fallo('BLOQUE_DOLAR_AUSENTE', 'no existe el bloque id="dolar" en el documento');
  }

  // Que el bloque diga USD es la comprobación de que no se está leyendo el euro
  // por un cambio de maquetación. Sin esto, un reordenamiento de la página
  // podría hacernos cobrar en la moneda equivocada sin que nada fallara.
  if (!/>\s*USD\s*</i.test(bloque)) {
    return fallo('MONEDA_NO_CONFIRMADA', 'el bloque del dólar no declara la moneda USD');
  }

  const marcado = /<strong[^>]*>\s*([^<]+?)\s*<\/strong>/i.exec(bloque);
  if (!marcado) {
    return fallo('VALOR_AUSENTE', 'el bloque del dólar no contiene ningún valor destacado');
  }

  const crudo = marcado[1] ?? '';
  const valor: Decimal | null = decimalDesdeFormatoVenezolano(crudo);
  if (valor === null) {
    return fallo('VALOR_ILEGIBLE', `no es un decimal en formato venezolano: ${JSON.stringify(crudo)}`);
  }
  if (!esPositivo(valor)) {
    return fallo('VALOR_NO_POSITIVO', `una tasa no puede ser ${decimalACadena(valor)}`);
  }

  const entera = valor.unidades / 10n ** BigInt(valor.escala);
  if (entera < TASA_MINIMA_PLAUSIBLE || entera > TASA_MAXIMA_PLAUSIBLE) {
    return fallo('VALOR_FUERA_DE_RANGO', `${decimalACadena(valor)} no es una tasa creíble`);
  }

  const fechaValor = leerFechaValor(html);
  if (typeof fechaValor !== 'string') return fechaValor;

  return { ok: true, lectura: { tasa: decimalACadena(valor), fechaValor } };
}
