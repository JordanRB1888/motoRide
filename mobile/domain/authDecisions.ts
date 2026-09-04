/**
 * Las decisiones de la autenticación, sin tocar la red.
 *
 * Traducen lo que respondió el backend a lo que la aplicación debe hacer. Son
 * puras, así que se prueban de verdad: comprobar que un `ACCOUNT_DISABLED` se
 * cuenta distinto de unas credenciales malas no debería requerir un emulador.
 *
 * LA DECISIÓN MÁS DELICADA
 *
 * `decidirValidacion` determina si se BORRA la sesión guardada. Equivocarse
 * hace daño en las dos direcciones:
 *
 * · tratar «sin red» como «sesión inválida» cierra la sesión de alguien que la
 *   tiene perfectamente válida, sólo porque iba en el metro;
 * · tratar «sin red» como «sesión válida» deja pasar operaciones con una sesión
 *   que quizá el backend ya revocó.
 *
 * Por eso hay tres resultados y no dos.
 */

import type { FalloDeApi, Resultado } from './apiResult';
import { leerIdentidad, type IdentidadDeUsuario } from './authState';
export type { IdentidadDeUsuario };

// ---------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------

export const MOTIVOS_DE_LOGIN = [
  'CREDENCIALES_INVALIDAS',
  'CUENTA_DESHABILITADA',
  'CONDUCTOR_NO_APROBADO',
  'DEMASIADOS_INTENTOS',
  'SIN_CONEXION',
  'SIN_CONFIGURACION',
  'RESPUESTA_INESPERADA',
  'ERROR_DEL_SERVIDOR'
] as const;
export type MotivoDeLogin = (typeof MOTIVOS_DE_LOGIN)[number];

export type ResultadoDeLogin =
  | { readonly ok: true; readonly token: string; readonly usuario: IdentidadDeUsuario }
  | { readonly ok: false; readonly motivo: MotivoDeLogin };

/**
 * Traduce un fallo del transporte al vocabulario del acceso.
 *
 * Los códigos son los que devuelve `server/index.js`, leídos de su fuente:
 * `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `DRIVER_APPLICATION_NOT_APPROVED`.
 */
export function traducirFalloDeLogin(fallo: FalloDeApi): ResultadoDeLogin {
  switch (fallo.codigo) {
    case 'INVALID_CREDENTIALS':
      return { ok: false, motivo: 'CREDENCIALES_INVALIDAS' };
    case 'ACCOUNT_DISABLED':
      return { ok: false, motivo: 'CUENTA_DESHABILITADA' };
    case 'DRIVER_APPLICATION_NOT_APPROVED':
      return { ok: false, motivo: 'CONDUCTOR_NO_APROBADO' };
    default:
      break;
  }

  if (fallo.motivo === 'SIN_CONFIGURACION') return { ok: false, motivo: 'SIN_CONFIGURACION' };
  if (fallo.motivo === 'SIN_RED' || fallo.motivo === 'TIEMPO_AGOTADO') {
    return { ok: false, motivo: 'SIN_CONEXION' };
  }
  // El limitador de credenciales del backend: 30 intentos por cuarto de hora.
  if (fallo.codigo === 'RATE_LIMITED' || fallo.mensaje.includes('429')) {
    return { ok: false, motivo: 'DEMASIADOS_INTENTOS' };
  }
  // Un 401 sin código conocido, en el login, sólo puede ser credenciales.
  if (fallo.motivo === 'NO_AUTENTICADO') return { ok: false, motivo: 'CREDENCIALES_INVALIDAS' };

  return { ok: false, motivo: 'ERROR_DEL_SERVIDOR' };
}

/** Lo que el backend devuelve al entrar. */
export interface CuerpoDeLogin {
  readonly user?: unknown;
  readonly token?: string;
}

/**
 * Interpreta una respuesta correcta del login.
 *
 * Exige token **y** identidad legible. Antes que quedarse con media sesión,
 * ninguna: una sesión con token pero sin identidad parecería válida y fallaría
 * más tarde, en un sitio donde ya nadie relaciona la causa.
 */
export function interpretarLogin(cuerpo: CuerpoDeLogin): ResultadoDeLogin {
  const usuario = leerIdentidad(cuerpo.user);
  const token = cuerpo.token;
  if (typeof token !== 'string' || token === '' || usuario === null) {
    return { ok: false, motivo: 'RESPUESTA_INESPERADA' };
  }
  return { ok: true, token, usuario };
}

// ---------------------------------------------------------------------------
// Crear una cuenta
// ---------------------------------------------------------------------------

/**
 * Traduce un fallo del alta al vocabulario del registro.
 *
 * Lo mismo que en el login, con una diferencia importante: aquí el 409 es una
 * respuesta legítima y frecuente —alguien que ya tenía cuenta y no se acordaba—
 * y merece un camino de salida, no un mensaje de error a secas.
 *
 * El servidor no dice si el que ya existe es el correo o el teléfono, y está
 * bien que no lo diga: precisarlo permitiría averiguar qué correos hay
 * registrados probando uno a uno.
 */
export function traducirFalloDeRegistro(fallo: FalloDeApi): {
  readonly ok: false;
  readonly motivo: 'CUENTA_EXISTENTE' | 'DATOS_INVALIDOS' | 'DEMASIADOS_INTENTOS' | 'SIN_CONEXION' | 'ERROR_DEL_SERVIDOR';
  readonly campos?: Readonly<Record<string, string>>;
} {
  if (fallo.codigo === 'USER_EXISTS') return { ok: false, motivo: 'CUENTA_EXISTENTE' };

  if (fallo.codigo === 'VALIDATION_FAILED') {
    const datos = fallo.detalle as { fields?: unknown } | null | undefined;
    const campos = datos?.fields;
    const limpios: Record<string, string> = {};
    if (campos !== null && typeof campos === 'object') {
      for (const [campo, mensaje] of Object.entries(campos as Record<string, unknown>)) {
        if (typeof mensaje === 'string') limpios[campo] = mensaje;
      }
    }
    return Object.keys(limpios).length > 0
      ? { ok: false, motivo: 'DATOS_INVALIDOS', campos: limpios }
      : { ok: false, motivo: 'DATOS_INVALIDOS' };
  }

  if (fallo.motivo === 'SIN_RED' || fallo.motivo === 'TIEMPO_AGOTADO') return { ok: false, motivo: 'SIN_CONEXION' };
  // El registro tiene su propio limitador: veinte por cuarto de hora.
  if (fallo.codigo === 'RATE_LIMITED' || fallo.mensaje.includes('429')) return { ok: false, motivo: 'DEMASIADOS_INTENTOS' };

  return { ok: false, motivo: 'ERROR_DEL_SERVIDOR' };
}

// ---------------------------------------------------------------------------
// Validación de la sesión guardada
// ---------------------------------------------------------------------------

export type ValidacionDeSesion =
  | { readonly resultado: 'VALIDA'; readonly usuario: IdentidadDeUsuario }
  | { readonly resultado: 'INVALIDA' }
  | { readonly resultado: 'SIN_CONEXION' };

/**
 * Decide qué hacer con la sesión guardada.
 *
 *   VALIDA        el backend confirmó quién es
 *   INVALIDA      el backend dijo que no. Se borra el token.
 *   SIN_CONEXION  no se pudo preguntar. NO se borra nada.
 */
export function decidirValidacion(respuesta: Resultado<unknown>): ValidacionDeSesion {
  if (respuesta.ok) {
    const usuario = leerIdentidad(respuesta.datos);
    // Un 200 con un cuerpo que no se entiende no es una sesión válida: se trata
    // como inválida, que es el lado seguro.
    return usuario === null ? { resultado: 'INVALIDA' } : { resultado: 'VALIDA', usuario };
  }

  // Sin red o sin configuración NO se puede afirmar que la sesión sea mala.
  if (respuesta.motivo === 'SIN_RED'
    || respuesta.motivo === 'TIEMPO_AGOTADO'
    || respuesta.motivo === 'SIN_CONFIGURACION') {
    return { resultado: 'SIN_CONEXION' };
  }

  // 401 (AUTH_REQUIRED, INVALID_SESSION) y 403 (ACCOUNT_DISABLED) son respuestas
  // claras del backend: esa sesión ya no sirve.
  if (respuesta.motivo === 'NO_AUTENTICADO' || respuesta.codigo === 'ACCOUNT_DISABLED') {
    return { resultado: 'INVALIDA' };
  }

  // Un 500 no dice nada sobre la sesión. Un fallo temporal del servidor no puede
  // cerrarle la sesión a todo el mundo a la vez.
  return { resultado: 'SIN_CONEXION' };
}
