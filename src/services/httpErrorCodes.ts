/**
 * Código de error de una respuesta fallida.
 *
 * Un 429 llegaba a la pantalla como «Credenciales incorrectas». El limitador
 * antiguo respondía texto plano; el cliente intentaba leerlo como JSON,
 * fallaba, y guardaba `REQUEST_FAILED` perdiendo el único dato fiable que
 * tenía: el estado HTTP. En el formulario ese código desconocido caía en la
 * rama por defecto, que dice que la contraseña está mal —y entonces se
 * reintenta, que es justo lo peor con el cupo agotado.
 *
 * El cuerpo del servidor manda cuando existe. Cuando no, el estado se traduce
 * a un código conocido en lugar de descartarse.
 *
 * TYPESCRIPT-1: migrado sin cambiar el comportamiento. La forma que devuelve
 * es la que declara `ApiError` en los contratos compartidos, así que el tipo y
 * el código no pueden separarse sin que el compilador lo diga.
 */

import type { ApiError, ApiErrorCode } from '../../shared/contracts/api.ts';

const POR_ESTADO: Readonly<Record<number, ApiErrorCode>> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED'
};

export function errorCodeForStatus(status: unknown): ApiErrorCode {
  // Se indexa con el número tal cual, igual que antes: un estado que no esté
  // en el mapa cae en los dos casos de reserva de abajo.
  const conocido = POR_ESTADO[Number(status)];
  if (conocido) return conocido;
  if (Number(status) >= 500) return 'SERVER_ERROR';
  return 'REQUEST_FAILED';
}

/**
 * Compone el error que se guarda tras una respuesta no correcta.
 *
 * @param status estado HTTP de la respuesta.
 * @param payload cuerpo ya interpretado, o null si no era JSON.
 */
export function buildRequestError(status: number, payload: unknown): ApiError {
  const cuerpo = payload && typeof payload === 'object' ? payload : null;
  // El estado va siempre, y nunca lo sobrescribe el cuerpo: es lo único que se
  // conoce con certeza.
  return { ...(cuerpo || { error: errorCodeForStatus(status) }), status };
}
