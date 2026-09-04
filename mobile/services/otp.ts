/**
 * Las llamadas de verificación por código, contra el backend REAL.
 *
 * ESTE FICHERO SÓLO TRANSPORTA
 *
 * Qué significa cada respuesta vive en `domain/verificacionOtp.ts`, sin nada
 * nativo, para poder probarlo sin emulador. Aquí sólo se manda y se devuelve.
 *
 * EL CLIENTE NO VALIDA NADA
 *
 * No hay ninguna función que diga si un código es correcto: eso sólo lo sabe
 * el servidor, que guarda el hash, cuenta los intentos y controla el
 * vencimiento. Lo único que sale de aquí es `challengeId` y `code`.
 *
 * CONTRATOS OBSERVADOS, NO SUPUESTOS
 *
 * Todo lo de abajo sale de leer `server/routes/auth.js`:
 *
 *   GET  /api/auth/verification/channels
 *                          200 → { channels: [{ channel, contactType, available }] }
 *
 *   POST /api/auth/verification/send   { channel, destination, purpose }
 *                          202 → { status, challengeId, channel, purpose,
 *                                  expiresInSeconds, resendAvailableInSeconds,
 *                                  attemptsLeft, maskedDestination,
 *                                  deliveryConfirmed, warning? }
 *                          400 INVALID_DESTINATION | INVALID_CHANNEL | INVALID_PURPOSE
 *                          401 AUTH_REQUIRED (propósitos con sesión)
 *                          409 SEND_IN_PROGRESS
 *                          429 RESEND_COOLDOWN | RATE_LIMITED (+ retryAfterMs)
 *                          503 VERIFICATION_PROVIDER_NOT_CONFIGURED (+ channel)
 *                          503 VERIFICATION_SEND_FAILED (+ channel)
 *
 *   POST /api/auth/verification/verify { challengeId, code, purpose, newPassword? }
 *                          200 → según el propósito
 *                          400 INVALID_CODE (+ attemptsLeft) | CODE_EXPIRED | CODE_EXHAUSTED
 *                          403 ACCOUNT_DISABLED
 *                          404 ACCOUNT_NOT_FOUND
 *                          409 CONTACT_TAKEN
 *
 * NADA SENSIBLE EN LOS REGISTROS
 *
 * El código no se registra, no se guarda y no se conserva más allá de lo que
 * la persona tiene escrito en pantalla.
 */

import { llamar } from './api';
import {
  interpretarEnvio,
  interpretarVerificacion,
  type CanalDeVerificacion,
  type CanalDisponible,
  type DesafioEnviado,
  type PropositoDeVerificacion,
  type ResultadoDeEnvio,
  type ResultadoDeVerificacion
} from '../domain/verificacionOtp';

/**
 * Qué canales sabe enviar el servidor. Sin sesión: no habla de cuentas.
 *
 * Devuelve si la consulta SALIÓ BIEN, aparte de la lista. No es lo mismo «el
 * servidor dice que no hay ninguno» que «no pude preguntar»: confundirlos deja
 * la pantalla esperando para siempre a una respuesta que ya falló.
 */
export async function consultarCanales(): Promise<{
  ok: boolean;
  /** `true` sólo cuando la petición ni siquiera salió del teléfono. */
  sinRed: boolean;
  canales: CanalDisponible[];
}> {
  const respuesta = await llamar<{ channels: CanalDisponible[] }>('/auth/verification/channels', {
    conSesion: false
  });
  if (!respuesta.ok) {
    // Que no haya red y que el servidor conteste mal son problemas distintos,
    // y la persona hace cosas distintas con cada uno: mirar su wifi, o esperar.
    const sinRed = ['SIN_RED', 'TIEMPO_AGOTADO', 'SIN_CONFIGURACION'].includes(respuesta.motivo);
    return { ok: false, sinRed, canales: [] };
  }
  return { ok: true, sinRed: false, canales: respuesta.datos.channels ?? [] };
}

/**
 * Pide un código.
 *
 * `conSesion` va en `true` para los propósitos que la exigen (cambiar de
 * teléfono o de correo, vincular, acción sensible) y en `false` para los que
 * son públicos —entrar, registrarse, recuperar la contraseña—, donde adjuntar
 * un token no aportaría nada.
 */
export async function pedirCodigo(peticion: {
  canal: CanalDeVerificacion;
  destino: string;
  proposito: PropositoDeVerificacion;
  conSesion?: boolean;
}): Promise<ResultadoDeEnvio> {
  const respuesta = await llamar<DesafioEnviado>('/auth/verification/send', {
    metodo: 'POST',
    cuerpo: { channel: peticion.canal, destination: peticion.destino, purpose: peticion.proposito },
    conSesion: peticion.conSesion === true
  });
  return interpretarEnvio(respuesta);
}

/**
 * Comprueba un código.
 *
 * `contrasenaNueva` sólo viaja con `PASSWORD_RESET`, que es el único propósito
 * que la necesita; el servidor la valida ANTES de gastar el código.
 */
export async function comprobarCodigo(peticion: {
  challengeId: string;
  codigo: string;
  proposito: PropositoDeVerificacion;
  contrasenaNueva?: string;
  conSesion?: boolean;
}): Promise<ResultadoDeVerificacion> {
  const respuesta = await llamar<unknown>('/auth/verification/verify', {
    metodo: 'POST',
    cuerpo: {
      challengeId: peticion.challengeId,
      code: peticion.codigo,
      purpose: peticion.proposito,
      ...(peticion.contrasenaNueva ? { newPassword: peticion.contrasenaNueva } : {})
    },
    conSesion: peticion.conSesion === true
  });
  return interpretarVerificacion(respuesta);
}
