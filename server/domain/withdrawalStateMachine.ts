/**
 * La máquina de estados de un retiro, y qué le pasa al dinero en cada paso.
 *
 * APROBAR NO ES PAGAR
 *
 * Es la distinción que ordena todo este módulo. Aprobar es una decisión
 * administrativa —«sí, esta persona tiene derecho a este dinero»—; pagar es que
 * el dinero salió de una cuenta y entró en otra, con una referencia bancaria
 * que lo demuestra. Entre las dos cosas hay un banco, un horario y la
 * posibilidad de que la transferencia falle.
 *
 * El flujo actual del producto las confunde: al aprobar descuenta el saldo y
 * notifica «Liquidación pagada». Eso significa que el sistema cree haber pagado
 * cosas que quizá no ha pagado, y que una transferencia fallida no tiene forma
 * de volver atrás.
 *
 * ESTE MÓDULO ES PURO
 *
 * No toca base de datos ni conoce usuarios. Decide qué transiciones son
 * legales y qué efecto tienen sobre los fondos; ejecutarlo con las garantías
 * transaccionales es trabajo del servicio.
 */

import type { WithdrawalStatus } from '../../shared/contracts/wallet.ts';

/**
 * Qué le ocurre al dinero reservado en cada transición.
 *
 *   RESERVAR   sale de disponible y entra en reservado — al crear la solicitud
 *   LIBERAR    vuelve de reservado a disponible — el retiro no se hará
 *   CONSUMIR   sale de reservado y ya no vuelve — el dinero se pagó
 *   NINGUNO    la solicitud avanza pero el dinero no se mueve
 */
export const EFECTOS_SOBRE_FONDOS = ['RESERVAR', 'LIBERAR', 'CONSUMIR', 'NINGUNO'] as const;
export type EfectoSobreFondos = (typeof EFECTOS_SOBRE_FONDOS)[number];

/**
 * Las transiciones permitidas, con su efecto sobre los fondos.
 *
 * Todo lo que no esté aquí está prohibido. Es una lista blanca a propósito: con
 * una lista negra, cada estado nuevo entraría permitido por omisión.
 */
const TRANSICIONES: Readonly<Record<WithdrawalStatus, Readonly<Partial<Record<WithdrawalStatus, EfectoSobreFondos>>>>> =
  Object.freeze({
    REQUESTED: Object.freeze({
      UNDER_REVIEW: 'NINGUNO',
      APPROVED: 'NINGUNO',
      REJECTED: 'LIBERAR',
      CANCELLED: 'LIBERAR'
    }),

    UNDER_REVIEW: Object.freeze({
      APPROVED: 'NINGUNO',
      REJECTED: 'LIBERAR'
    }),

    // Aprobado NO es pagado: el dinero sigue reservado, esperando la
    // transferencia. Y todavía se puede rechazar, porque hasta que el banco no
    // confirma, nada es definitivo.
    APPROVED: Object.freeze({
      PROCESSING: 'NINGUNO',
      REJECTED: 'LIBERAR'
    }),

    // En proceso: la transferencia se está ejecutando. Puede acabar bien o mal,
    // y una transferencia rechazada por el banco tiene que devolver el dinero.
    PROCESSING: Object.freeze({
      PAID: 'CONSUMIR',
      REJECTED: 'LIBERAR'
    }),

    // Terminales. Nada sale de aquí sin un procedimiento explícito que esta
    // fase no define: revertir un pago ya hecho no es una transición de estado,
    // es una operación contable nueva con su propio rastro.
    PAID: Object.freeze({}),
    REJECTED: Object.freeze({}),
    CANCELLED: Object.freeze({})
  });

/** El estado en el que nace una solicitud, con el dinero ya reservado. */
export const ESTADO_INICIAL: WithdrawalStatus = 'REQUESTED';
export const EFECTO_AL_CREAR: EfectoSobreFondos = 'RESERVAR';

/** Estados desde los que ya no se sale. */
export function esTerminal(estado: WithdrawalStatus): boolean {
  return Object.keys(TRANSICIONES[estado] ?? {}).length === 0;
}

export interface TransicionPermitida {
  readonly permitida: true;
  readonly efecto: EfectoSobreFondos;
}

export interface TransicionRechazada {
  readonly permitida: false;
  readonly motivo: string;
}

export type ResultadoDeTransicion = TransicionPermitida | TransicionRechazada;

/**
 * Decide si un retiro puede pasar de un estado a otro.
 *
 * Repetir el estado actual NO es una transición válida: se rechaza con un
 * motivo propio para que quien llama pueda distinguir «esto ya está así»
 * —que ante un reintento es un éxito idempotente— de «esto es imposible».
 */
export function evaluarTransicion(
  desde: WithdrawalStatus,
  hacia: WithdrawalStatus
): ResultadoDeTransicion {
  if (!(desde in TRANSICIONES)) {
    return { permitida: false, motivo: `estado de origen desconocido: ${desde}` };
  }
  if (!(hacia in TRANSICIONES)) {
    return { permitida: false, motivo: `estado de destino desconocido: ${hacia}` };
  }
  if (desde === hacia) {
    return { permitida: false, motivo: 'YA_ESTA_EN_ESE_ESTADO' };
  }

  const efecto = TRANSICIONES[desde][hacia];
  if (efecto === undefined) {
    return { permitida: false, motivo: `transición prohibida: ${desde} → ${hacia}` };
  }
  return { permitida: true, efecto };
}

/** Los estados a los que se puede ir desde uno dado. Para el panel y las pruebas. */
export function transicionesDesde(estado: WithdrawalStatus): readonly WithdrawalStatus[] {
  return Object.keys(TRANSICIONES[estado] ?? {}) as WithdrawalStatus[];
}

/**
 * `true` si el estado mantiene dinero reservado.
 *
 * Sirve para una invariante que se comprueba en las pruebas: la suma de los
 * retiros en estos estados tiene que coincidir con el reservado de la cartera.
 * Si alguna vez no coincide, hay dinero perdido o duplicado.
 */
export function mantieneFondosReservados(estado: WithdrawalStatus): boolean {
  return ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING'].includes(estado);
}

/**
 * Marcar como pagado exige una referencia externa.
 *
 * No se genera automáticamente: una referencia inventada por el sistema no
 * demuestra que el banco movió nada, y el objetivo de este campo es
 * exactamente ese. Tiene que venir de la operación real.
 */
export function requiereReferenciaDePago(hacia: WithdrawalStatus): boolean {
  return hacia === 'PAID';
}
