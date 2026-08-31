/**
 * La compuerta del flujo ANTIGUO de retiros.
 *
 * QUÉ ESTÁ APAGANDO ESTO
 *
 * `server/index.js` tiene un retiro que funciona así:
 *
 *   1. `POST /api/wallet/payouts` crea una transaccion PAYOUT en PENDING y NO
 *      toca el saldo;
 *   2. `PATCH /api/admin/transactions/:id` con APPROVED lee el saldo, comprueba
 *      que alcanza y lo resta.
 *
 * Entre 1 y 2 el dinero sigue disponible y se puede gastar en viajes, asi que
 * la solicitud puede quedar sin fondos que la respalden. Y el paso 2 es un
 * leer-comprobar-escribir sin cerrojo: dos aprobaciones simultaneas pueden
 * pasar las dos. Ademas, APPROVED se comporta como «pagado» --descuenta y
 * notifica «Liquidacion pagada»-- sin que exista ninguna transferencia real ni
 * referencia bancaria que lo demuestre.
 *
 * WALLET-PAYOUTS-1 construyo la fundacion correcta al lado, y sigue apagada.
 * Mientras tanto este flujo es alcanzable, y por eso se apaga: es la unica
 * medida que reduce el riesgo HOY sin reescribir nada.
 *
 * FALLA CERRADO
 *
 * Apagado por defecto. Solo el literal `'1'` lo enciende: ni `'true'`, ni
 * `'yes'`, ni cualquier valor con pinta de verdadero. Un unico valor aceptado
 * significa que encenderlo es un acto deliberado y que nadie lo hace por
 * accidente escribiendo cualquier cosa en una variable.
 *
 * LO QUE ESTA COMPUERTA NO ES
 *
 * No es autenticacion ni autorizacion. `requireAuth`, `requireRole` y las
 * validaciones siguen exactamente donde estaban y se ejecutan igual. Esto solo
 * decide si una funcionalidad esta abierta; encenderla no convierte a nadie en
 * administrador ni relaja ninguna comprobacion.
 *
 * Y NO HAY PUENTE AL SISTEMA NUEVO
 *
 * Con el flujo antiguo apagado, una peticion no se redirige, no se convierte y
 * no se intenta «hacer que funcione» con la fundacion nueva. Se rechaza. Un
 * puente automatico entre dos sistemas de dinero, montado sin que nadie lo
 * pida, es peor que la ruta que se estaba apagando.
 */

/** La variable que gobierna el flujo antiguo. Separada de la fundacion nueva. */
export const BANDERA_RETIROS_ANTIGUOS = 'LEGACY_PAYOUTS_ENABLED';

/** El codigo de error, estable, en la convencion del backend: `{ error: CODIGO }`. */
export const ERROR_RETIROS_ANTIGUOS_APAGADOS = 'LEGACY_PAYOUTS_DISABLED';

/**
 * 403 y no 503.
 *
 * No es una indisponibilidad temporal que vaya a resolverse sola reintentando:
 * es una decision de configuracion. Un 503 invitaria a que el cliente lo
 * reintente en bucle.
 */
export const ESTADO_RETIROS_ANTIGUOS_APAGADOS = 403;

/**
 * Si el flujo antiguo esta encendido.
 *
 * Deliberadamente NO mira `NODE_ENV`, ni `CI`, ni `WALLET_PAYOUTS_ENABLED`. La
 * fundacion nueva y el flujo antiguo tienen controles separados: encender uno
 * jamas debe encender el otro.
 */
export function retirosAntiguosHabilitados(entorno = process.env) {
  return String(entorno[BANDERA_RETIROS_ANTIGUOS] ?? '').trim() === '1';
}

/**
 * Si una operacion de administracion sobre una transaccion movería dinero por
 * el flujo antiguo.
 *
 * Es deliberadamente estrecha, y esa estrechez es el punto:
 *
 *  · sólo `PAYOUT`. `TOP_UP`, `RIDE_PAYMENT` y cualquier otro tipo siguen
 *    funcionando exactamente igual; apagar el retiro no puede bloquear una
 *    recarga;
 *  · sólo `APPROVED`, que es la unica rama que resta del saldo. `REJECTED` no
 *    toca dinero, y dejarlo pasar es lo que permite RESOLVER de forma segura
 *    los retiros que quedaran pendientes: bloquear tambien el rechazo los
 *    dejaria atascados sin ninguna salida que no sea tocar la base a mano.
 */
export function esAprobacionDeRetiroAntiguo(tipoDeTransaccion, estadoSolicitado) {
  return tipoDeTransaccion === 'PAYOUT' && estadoSolicitado === 'APPROVED';
}

/**
 * El veredicto para una peticion del flujo antiguo.
 *
 * Devuelve `null` cuando puede seguir adelante, y el error listo para responder
 * cuando no. Quien llama solo tiene que mirar si hay algo.
 */
export function bloquearSiApagado(entorno = process.env) {
  if (retirosAntiguosHabilitados(entorno)) return null;
  return {
    estado: ESTADO_RETIROS_ANTIGUOS_APAGADOS,
    cuerpo: { error: ERROR_RETIROS_ANTIGUOS_APAGADOS }
  };
}
