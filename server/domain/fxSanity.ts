/**
 * El último filtro antes de guardar una tasa.
 *
 * POR QUÉ HACE FALTA ADEMÁS DEL PARSER
 *
 * El parser comprueba la FORMA, y hay fallos que tienen forma perfecta. Si el
 * BCV reordena su portada y el bloque `id="dolar"` pasa a contener el valor de
 * la lira, el resultado es un decimal impecable —16,47982495— que el parser no
 * tiene forma de rechazar. Con esa tasa se cobraría cincuenta veces menos de lo
 * debido, y nada daría error.
 *
 * Lo que sí delata ese fallo es la comparación con lo que ya sabíamos: una tasa
 * de cambio no salta de 794 a 16 en un día.
 *
 * ESTO NO ES UNA PREDICCIÓN DEL BOLÍVAR
 *
 * El umbral es ancho a propósito. No pretende decir cuánto «debería» variar la
 * tasa —eso no es asunto nuestro— sino separar una variación económica, por
 * brusca que sea, de un error de lectura. En un país que ha tenido
 * hiperinflación, un umbral estrecho daría falsas alarmas constantes y acabaría
 * ignorándose, que es la peor forma de tener una alarma.
 *
 * Y cuando salta, NO se corrige ni se ajusta nada: se rechaza la tasa, se
 * conserva la anterior y se pide que lo mire una persona.
 */

import { compararDecimales, decimalDesdeCadena, multiplicarDecimales, type Decimal } from './decimalMoney.ts';

/**
 * Cuánto puede variar la tasa de un día para otro sin levantar sospecha.
 *
 * Un factor de 2 significa: se admite desde la mitad hasta el doble. Atrapa de
 * sobra los errores realistas —confundir de moneda (×50), leer mal el separador
 * de miles (×1000), colar un año (×2,5)— sin estorbar a un movimiento cambiario
 * real, por fuerte que sea.
 */
export const FACTOR_MAXIMO_DE_VARIACION = 2n;

export const VEREDICTOS = ['ACEPTABLE', 'SIN_REFERENCIA', 'VARIACION_SOSPECHOSA'] as const;
export type Veredicto = (typeof VEREDICTOS)[number];

export interface RevisionDeCordura {
  readonly veredicto: Veredicto;
  readonly detalle: string;
}

/**
 * Compara la tasa nueva con la última conocida.
 *
 * La primera tasa de todas no tiene con qué compararse y se acepta
 * (`SIN_REFERENCIA`): rechazarla dejaría el sistema sin poder arrancar nunca.
 */
export function revisarVariacion(
  tasaNueva: string,
  tasaAnterior: string | null
): RevisionDeCordura {
  const nueva = decimalDesdeCadena(tasaNueva);
  if (nueva === null || nueva.unidades <= 0n) {
    return { veredicto: 'VARIACION_SOSPECHOSA', detalle: 'la tasa nueva no es un decimal positivo' };
  }

  if (tasaAnterior === null) {
    return { veredicto: 'SIN_REFERENCIA', detalle: 'es la primera tasa registrada' };
  }

  const anterior = decimalDesdeCadena(tasaAnterior);
  if (anterior === null || anterior.unidades <= 0n) {
    return { veredicto: 'SIN_REFERENCIA', detalle: 'la tasa anterior no es utilizable como referencia' };
  }

  // Se comparan productos cruzados en lugar de dividir: una división obligaría
  // a elegir una precisión y a redondear, y aquí no hace falta ninguna de las
  // dos cosas. `nueva > anterior * factor` y `nueva * factor < anterior`.
  const factor: Decimal = { unidades: FACTOR_MAXIMO_DE_VARIACION, escala: 0 };

  if (compararDecimales(nueva, multiplicarDecimales(anterior, factor)) > 0) {
    return {
      veredicto: 'VARIACION_SOSPECHOSA',
      detalle: `${tasaNueva} supera el doble de la última conocida (${tasaAnterior})`
    };
  }
  if (compararDecimales(multiplicarDecimales(nueva, factor), anterior) < 0) {
    return {
      veredicto: 'VARIACION_SOSPECHOSA',
      detalle: `${tasaNueva} no llega a la mitad de la última conocida (${tasaAnterior})`
    };
  }

  return { veredicto: 'ACEPTABLE', detalle: 'la variación está dentro de lo esperable' };
}
