/**
 * El perfil de quien entró: leerlo, editarlo y cambiar la fotografía.
 *
 * NO ES UNA SEGUNDA SESIÓN
 *
 * Usa el mismo cliente (`api.ts`), el mismo token de SecureStore y los mismos
 * endpoints que la autenticación. No guarda estado de sesión, no decide si
 * alguien puede entrar y no toca `AuthContext`. Es una lectura de datos para
 * pintar y una escritura de los campos que el backend acepta.
 *
 * Quien manda sigue siendo el backend: la respuesta de `PATCH` trae el usuario
 * ya guardado, y eso —no lo que el formulario creía— es lo que se pinta.
 *
 * LA MISMA RESPUESTA, DOS LECTURAS
 *
 * `GET /api/auth/me` devuelve `publicUser`. `AuthContext` saca de ahí la
 * IDENTIDAD —lo que autoriza— y esto saca el PERFIL —lo que se enseña—. Son
 * dos proyecciones de la misma respuesta, no dos fuentes de verdad.
 */

import { leerPerfil, type BorradorDePerfil, type PerfilDeUsuario } from '../domain/perfil';
import type { Resultado } from '../domain/apiResult';
import { llamar } from './api';
import { leerToken } from './session';

/** El perfil completo de quien tiene la sesión abierta. */
export async function pedirPerfil(): Promise<Resultado<PerfilDeUsuario>> {
  const respuesta = await llamar<unknown>('/api/auth/me');
  if (!respuesta.ok) return respuesta;

  const perfil = leerPerfil(respuesta.datos);
  if (perfil === null) {
    return {
      ok: false,
      motivo: 'RESPUESTA_INVALIDA',
      codigo: null,
      mensaje: 'El servidor devolvió un perfil que no se puede leer.'
    };
  }
  return { ok: true, datos: perfil };
}

/**
 * Guarda los cambios.
 *
 * Recibe SÓLO lo que cambió. Mandar el resto no aporta nada y hace que el
 * servidor valide campos que nadie tocó.
 *
 * Devuelve el perfil tal como quedó GUARDADO, no el borrador: si el servidor
 * recortó un espacio o pasó una placa a mayúsculas, eso es lo que hay que
 * pintar.
 */
export async function guardarPerfil(cambios: BorradorDePerfil): Promise<Resultado<PerfilDeUsuario>> {
  const respuesta = await llamar<unknown>('/api/auth/me', { metodo: 'PATCH', cuerpo: cambios });
  if (!respuesta.ok) return respuesta;

  const perfil = leerPerfil(respuesta.datos);
  if (perfil === null) {
    return {
      ok: false,
      motivo: 'RESPUESTA_INVALIDA',
      codigo: null,
      mensaje: 'El servidor guardó pero devolvió algo que no se puede leer.'
    };
  }
  return { ok: true, datos: perfil };
}

/**
 * Lo que el servidor acepta como fotografía de perfil.
 *
 * Copiado de `profilePhotoUpload` en `server/index.js`. Se comprueba aquí para
 * avisar antes de subir cinco megas por una red móvil y que el servidor los
 * rechace igual — pero la decisión sigue siendo suya: `fileFilter` y `limits`
 * están en el servidor y no se pueden saltar desde el teléfono.
 */
export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const TAMANO_MAXIMO_DE_FOTO = 5 * 1024 * 1024;

export interface FotoElegida {
  readonly uri: string;
  readonly nombre: string;
  readonly tipo: string;
  /** En bytes, si el selector lo sabe. */
  readonly tamano?: number;
}

/**
 * Cambia la fotografía de perfil.
 *
 * SIGUE SIENDO PRIVADA. El servidor la guarda en `privateStorage`, la sirve
 * sólo por `GET /api/users/:id/photo` con sesión y control de acceso, y borra
 * la anterior. Aquí no se toca nada de eso: se manda el fichero y ya.
 *
 * El campo se llama `file` porque así lo espera `multer`.
 */
export async function cambiarFoto(foto: FotoElegida): Promise<Resultado<PerfilDeUsuario>> {
  if (!TIPOS_DE_FOTO.includes(foto.tipo as (typeof TIPOS_DE_FOTO)[number])) {
    return {
      ok: false,
      motivo: 'ERROR_DEL_SERVIDOR',
      codigo: 'INVALID_PROFILE_PHOTO',
      mensaje: 'Esa imagen no vale. Tiene que ser JPG, PNG o WEBP.'
    };
  }
  if (foto.tamano !== undefined && foto.tamano > TAMANO_MAXIMO_DE_FOTO) {
    return {
      ok: false,
      motivo: 'ERROR_DEL_SERVIDOR',
      codigo: 'FILE_TOO_LARGE',
      mensaje: 'La imagen pesa más de 5 MB.'
    };
  }

  const formulario = new FormData();
  // React Native manda ficheros con esta forma; no es un `Blob` del navegador.
  formulario.append('file', {
    uri: foto.uri,
    name: foto.nombre,
    type: foto.tipo
  } as unknown as Blob);

  const respuesta = await llamar<unknown>('/api/auth/me/photo', {
    metodo: 'POST',
    cuerpo: formulario,
    // Una fotografía por una red móvil venezolana tarda más que una petición
    // normal. Con el tope de quince segundos se cancelaba sola.
    tiempoMaximoMs: 60_000
  });
  if (!respuesta.ok) return respuesta;

  const perfil = leerPerfil(respuesta.datos);
  if (perfil === null) {
    return {
      ok: false,
      motivo: 'RESPUESTA_INVALIDA',
      codigo: null,
      mensaje: 'La foto se subió pero el servidor devolvió algo que no se puede leer.'
    };
  }
  return { ok: true, datos: perfil };
}

/**
 * Cómo pedir la fotografía privada.
 *
 * `GET /api/users/:id/photo` EXIGE sesión: sin la cabecera devuelve 403 igual
 * que si la persona no existiera. Por eso una `<Image>` con la URL a secas no
 * la carga nunca — hay que darle la cabecera.
 *
 * Devuelve `null` si no hay foto o no hay token, para que quien la pinte
 * enseñe las iniciales en vez de un hueco roto.
 */
export async function fuenteDeFoto(
  perfil: PerfilDeUsuario
): Promise<{ readonly uri: string; readonly headers: Record<string, string> } | null> {
  if (perfil.photoUrl === null) return null;
  const token = await leerToken();
  if (!token) return null;

  const { configuracion } = await import('../config/environment');
  if (!configuracion.ok) return null;

  return {
    uri: `${configuracion.urlBase}${perfil.photoUrl}`,
    headers: { authorization: `Bearer ${token}` }
  };
}
