/**
 * Las llamadas de autenticación, contra el backend REAL.
 *
 * EL BACKEND ES LA AUTORIDAD, Y NO SE DUPLICA
 *
 * Aquí no se verifica el JWT, no se leen sus claims para decidir nada y no se
 * asume que «hay token» equivalga a «sigue autorizado». `requireAuth` del
 * backend **recarga el usuario de la base de datos** en cada petición y
 * comprueba su estado: por eso validar la sesión es preguntar, no inspeccionar
 * el token.
 *
 * Un token firmado hace seis días sigue siendo criptográficamente válido aunque
 * a esa persona la hayan suspendido ayer. El claim `role` del JWT es un dato
 * histórico, no un permiso.
 *
 * ESTE FICHERO SÓLO TRANSPORTA
 *
 * Las decisiones —qué significa cada error, si se borra la sesión— viven en
 * `domain/authDecisions.ts`, sin dependencias nativas, para poder probarlas sin
 * un emulador.
 *
 * CONTRATOS OBSERVADOS, NO SUPUESTOS
 *
 * Todo lo de abajo sale de leer `server/index.js`:
 *
 *   POST /api/auth/login   { identifier, password, role? }
 *                          200 → { status, user, token }
 *                          401 INVALID_CREDENTIALS
 *                          403 ACCOUNT_DISABLED
 *                          403 DRIVER_APPLICATION_NOT_APPROVED (+ applicationStatus)
 *                          429 por el limitador de credenciales
 *
 *   GET  /api/auth/me      requireAuth → publicUser
 *                          401 AUTH_REQUIRED | INVALID_SESSION
 *                          403 ACCOUNT_DISABLED
 */

import { llamar } from './api';
import {
  decidirValidacion,
  interpretarLogin,
  traducirFalloDeLogin,
  type CuerpoDeLogin,
  type ResultadoDeLogin,
  type ValidacionDeSesion
} from '../domain/authDecisions';

export type { ResultadoDeLogin, ValidacionDeSesion };
export { MOTIVOS_DE_LOGIN, type MotivoDeLogin } from '../domain/authDecisions';

export interface CredencialesDeAcceso {
  /** Correo o teléfono. El backend acepta cualquiera de los dos. */
  readonly identificador: string;
  readonly contrasena: string;
  /**
   * La experiencia elegida en el selector.
   *
   * El backend la usa para comprobar que coincide con el rol REAL de la cuenta,
   * y responde 401 si no. No es una petición de privilegios: es una
   * comprobación más.
   */
  readonly rol?: 'passenger' | 'driver';
}

/** Inicia sesión contra el backend. */
export async function iniciarSesion(
  credenciales: CredencialesDeAcceso
): Promise<ResultadoDeLogin> {
  const respuesta = await llamar<CuerpoDeLogin>('/api/auth/login', {
    metodo: 'POST',
    // El login no lleva sesión: es lo que la crea.
    conSesion: false,
    cuerpo: {
      identifier: credenciales.identificador.trim(),
      password: credenciales.contrasena,
      ...(credenciales.rol ? { role: credenciales.rol } : {})
    }
  });

  return respuesta.ok ? interpretarLogin(respuesta.datos) : traducirFalloDeLogin(respuesta);
}

/** Pregunta al backend si la sesión guardada sigue valiendo. */
export async function validarSesion(): Promise<ValidacionDeSesion> {
  return decidirValidacion(await llamar<unknown>('/api/auth/me'));
}

/**
 * El backend NO tiene endpoint de cierre de sesión ni revocación.
 *
 * Se comprobó leyendo `server/index.js`: los JWT son sin estado, con siete días
 * de validez, y no hay lista de revocados. Cerrar sesión es, por tanto, una
 * operación LOCAL: se borra el token del dispositivo.
 *
 * Está escrito aquí porque es donde alguien lo buscará, y hay una prueba que
 * comprueba que no nos hemos inventado un endpoint que no existe. La
 * consecuencia real —un token robado sigue valiendo hasta que caduque— es una
 * limitación del backend actual, y corresponde a una fase de servidor.
 */
export const BACKEND_TIENE_CIERRE_DE_SESION = false;
