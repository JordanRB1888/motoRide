/**
 * Qué dinero puede salir de la aplicación y qué dinero no.
 *
 * LA PREGUNTA QUE ESTE MÓDULO NO RESPONDE
 *
 * El producto **no tiene hoy** créditos promocionales, bonificaciones ni
 * referidos: se buscaron en todo el código y no existen. Por eso no hay ninguna
 * política que descubrir aquí, y tampoco es asunto de esta fase inventarla —
 * decidir que un crédito promocional se puede convertir en una transferencia
 * bancaria es una decisión comercial con consecuencias de dinero real.
 *
 * Lo que sí se hace es dejar el modelo preparado para las dos respuestas, y
 * marcar explícitamente lo que está sin decidir.
 *
 * FALLAR CERRADO NO ES INVENTAR POLÍTICA
 *
 * `UNDECIDED` se trata como NO retirable. No es una decisión comercial
 * disfrazada: es negarse a asumir. Si mañana el dueño decide que las promos son
 * retirables, se cambia una línea de esta tabla y las pruebas lo confirman. Al
 * revés —tratarlas como retirables por defecto y descubrirlo tarde— el dinero
 * ya salió.
 */

import type { FundClass, Withdrawability } from '../../shared/contracts/wallet.ts';

/**
 * La retirabilidad declarada de cada clase de fondos.
 *
 * Las dos primeras son las únicas que el producto usa de verdad hoy:
 *
 * · `EARNED` es lo que un conductor ganó trabajando. Que sea retirable no es
 *   una política nueva: es el retiro que el producto YA ofrece.
 * · `DEPOSITED` es dinero que la persona metió por una recarga verificada.
 *
 * El resto son clases que el modelo soporta y el producto todavía no emite.
 * Quedan `UNDECIDED` a propósito, y por tanto no retirables.
 */
export const RETIRABILIDAD: Readonly<Record<FundClass, Withdrawability>> = Object.freeze({
  EARNED: 'WITHDRAWABLE',
  DEPOSITED: 'WITHDRAWABLE',

  // Devolver un cobro puede ser reponer dinero real o compensar con crédito, y
  // el producto no distingue todavía entre las dos cosas.
  REFUND: 'UNDECIDED',

  // Sin decidir, y por eso mismo sin poder salir de la aplicación. Tratarlas
  // como retirables convertiría cada campaña de marketing en una vía de
  // extracción de efectivo.
  PROMO: 'UNDECIDED',
  BONUS: 'UNDECIDED',
  REFERRAL: 'UNDECIDED',

  // Un ajuste manual puede ser cualquier cosa; quien lo hace tiene que decir
  // qué es, no heredar un permiso por omisión.
  ADJUSTMENT: 'UNDECIDED'
});

/**
 * Las clases cuya política sigue sin decidirse.
 *
 * Se exporta para que el informe y la documentación puedan enumerarlas sin
 * copiarlas a mano y quedarse desactualizados.
 */
export const CLASES_SIN_DECIDIR: readonly FundClass[] = Object.freeze(
  (Object.keys(RETIRABILIDAD) as FundClass[]).filter(
    clase => RETIRABILIDAD[clase] === 'UNDECIDED'
  )
);

/**
 * `true` sólo si la clase está declarada explícitamente como retirable.
 *
 * Cualquier otra cosa —`NON_WITHDRAWABLE`, `UNDECIDED`, o una clase que no
 * existe— da `false`. La ausencia de permiso es la ausencia de permiso.
 */
export function esRetirable(clase: FundClass): boolean {
  return RETIRABILIDAD[clase] === 'WITHDRAWABLE';
}

/** La retirabilidad declarada, o `UNDECIDED` para lo desconocido. */
export function retirabilidadDe(clase: string): Withdrawability {
  const declarada = RETIRABILIDAD[clase as FundClass];
  return declarada ?? 'UNDECIDED';
}
