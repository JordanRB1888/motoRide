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
 *   POST /api/auth/login   { identifier, password }
 *                          (`role` existe en el backend y NO se manda: es
 *                          una comprobación contra la cuenta que convertía
 *                          la elección de pantalla en «contraseña
 *                          incorrecta». AUTH-ENTRY-EXPERIENCE-1.)
 *                          200 → { status, user, token }
 *                          401 INVALID_CREDENTIALS
 *                          403 ACCOUNT_DISABLED
 *                          403 DRIVER_APPLICATION_NOT_APPROVED (+ applicationStatus)
 *                          429 por el limitador de credenciales
 *
 *   GET  /api/auth/me      requireAuth → publicUser
 *                          401 AUTH_REQUIRED | INVALID_SESSION
 *                          403 ACCOUNT_DISABLED
 *
 *   POST /api/auth/register { firstName, lastName, email, phone, password }
 *                          201 → { status, user, token }
 *                          400 VALIDATION_FAILED (+ fields)
 *                          409 USER_EXISTS
 *                          429 por el limitador propio del registro
 *
 *                          `role` NO se manda. El servidor rechaza cualquier
 *                          valor distinto de `passenger`, y por eso la
 *                          intención de la bienvenida no viaja: no es un
 *                          permiso, es una preferencia de navegación.
 */

import { llamar } from './api';
import {
  decidirValidacion,
  interpretarLogin,
  traducirFalloDeLogin,
  traducirFalloDeRegistro,
  type CuerpoDeLogin,
  type IdentidadDeUsuario,
  type ResultadoDeLogin,
  type ValidacionDeSesion
} from '../domain/authDecisions';

import type { DatosDeRegistro, ErroresDeRegistro, MotivoDeRegistro } from '../domain/registro';

export type { ResultadoDeLogin, ValidacionDeSesion };
export { MOTIVOS_DE_LOGIN, type MotivoDeLogin } from '../domain/authDecisions';

export interface CredencialesDeAcceso {
  /** Correo o teléfono. El backend acepta cualquiera de los dos. */
  readonly identificador: string;
  readonly contrasena: string;
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
      password: credenciales.contrasena
    }
  });

  return respuesta.ok ? interpretarLogin(respuesta.datos) : traducirFalloDeLogin(respuesta);
}

export type ResultadoDeRegistro =
  | { readonly ok: true; readonly token: string; readonly usuario: IdentidadDeUsuario }
  | { readonly ok: false; readonly motivo: MotivoDeRegistro; readonly campos?: ErroresDeRegistro };

/**
 * Crea una cuenta nueva.
 *
 * NO LLEVA ROL, Y NO ES UN DESCUIDO
 *
 * El servidor rechaza cualquier `role` que no sea `passenger`, así que mandarlo
 * sólo serviría para que alguien creyera que se puede pedir. Una cuenta nueva
 * nace como pasajera SIEMPRE, incluso cuando se crea para postularse a
 * conductora: el rol lo concede la aprobación del expediente, no este
 * formulario.
 *
 * Tampoco lleva sesión: es lo que la crea. La contraseña viaja una vez y no se
 * guarda en ningún sitio del teléfono.
 */
export async function crearCuenta(datos: DatosDeRegistro): Promise<ResultadoDeRegistro> {
  const respuesta = await llamar<CuerpoDeLogin>('/api/auth/register', {
    metodo: 'POST',
    conSesion: false,
    cuerpo: {
      firstName: datos.nombre.trim(),
      lastName: datos.apellido.trim(),
      email: datos.correo.trim().toLowerCase(),
      phone: datos.telefono.trim(),
      password: datos.contrasena
    }
  });

  if (!respuesta.ok) return traducirFalloDeRegistro(respuesta);

  // La respuesta trae usuario y token, igual que el login: se lee con el mismo
  // lector, que ya sabe rechazar una respuesta que no venga completa.
  const leida = interpretarLogin(respuesta.datos);
  return leida.ok ? leida : { ok: false, motivo: 'ERROR_DEL_SERVIDOR' };
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
