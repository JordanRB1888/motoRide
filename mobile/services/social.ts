/**
 * Entrar con Google o Apple contra el backend REAL.
 *
 * ESTE FICHERO SÓLO TRANSPORTA
 *
 * Qué significa cada respuesta vive en `domain/entradaSocial.ts`, sin nada
 * nativo. Abrir el selector del proveedor vive en `social/proveedores.ts`.
 * Aquí sólo se manda el token y se devuelve lo que dijo el servidor.
 *
 * LO ÚNICO QUE VIAJA COMO PRUEBA ES EL TOKEN
 *
 * Ni el correo, ni el nombre, ni el identificador de la cuenta del proveedor.
 * El servidor los rechazaría como prueba —y así está probado—: verifica la
 * firma del token contra las claves públicas de Google o de Apple. El nombre
 * viaja aparte y sólo como sugerencia para rellenar la ficha; el servidor lo
 * sanea igual que en el registro y no lo cree.
 *
 * CONTRATOS OBSERVADOS, NO SUPUESTOS
 *
 * De leer `server/routes/auth.js`:
 *
 *   GET  /api/auth/social/providers
 *                          200 → { providers: [{ provider, available }] }
 *
 *   POST /api/auth/social/:provider   { token, firstName?, lastName? }
 *                          200 → { status: 'success', user, token }   (ya existía)
 *                          201 → { status: 'created', user, token }   (nueva, passenger)
 *                          401 INVALID_PROVIDER_TOKEN
 *                          403 ACCOUNT_DISABLED
 *                          409 ACCOUNT_LINK_REQUIRED | IDENTITY_TAKEN
 *                          503 SOCIAL_PROVIDER_NOT_CONFIGURED
 *
 *   POST /api/auth/identities/link/:provider   (requiere sesión)
 *                          200 → { status: 'linked', provider, identities }
 *
 * NADA SENSIBLE EN LOS REGISTROS: ni el token del proveedor ni el de sesión.
 */

import { llamar } from './api';
import {
  interpretarEntradaSocial,
  type ProveedorDisponible,
  type ProveedorSocial,
  type RespuestaSocial,
  type ResultadoSocial
} from '../domain/entradaSocial';

const RUTA_DEL_PROVEEDOR: Record<ProveedorSocial, string> = {
  GOOGLE: 'google',
  APPLE: 'apple'
};

/**
 * Qué proveedores sabe verificar el servidor. Sin sesión: es la lista de lo
 * que está configurado, no dice nada de ninguna cuenta.
 *
 * Devuelve si la consulta salió bien, aparte de la lista: «no hay ninguno» y
 * «no pude preguntar» son cosas distintas, y confundirlas deja la pantalla
 * esperando una respuesta que ya falló.
 */
export async function consultarProveedores(): Promise<{
  ok: boolean;
  proveedores: ProveedorDisponible[];
}> {
  const respuesta = await llamar<{ providers: ProveedorDisponible[] }>('/api/auth/social/providers', {
    conSesion: false
  });
  if (!respuesta.ok) return { ok: false, proveedores: [] };
  return { ok: true, proveedores: respuesta.datos.providers ?? [] };
}

/**
 * Entrega el token del proveedor al servidor. Sin sesión: es la entrada.
 *
 * `conSesion: false` a propósito. Con un token de sesión adjunto el servidor
 * VINCULARÍA la identidad a esa cuenta en vez de entrar, y eso es otra acción
 * con otro botón.
 */
export async function entrarConProveedor(peticion: {
  proveedor: ProveedorSocial;
  token: string;
  nombre?: string;
  apellido?: string;
}): Promise<ResultadoSocial> {
  const respuesta = await llamar<RespuestaSocial>(
    `/api/auth/social/${RUTA_DEL_PROVEEDOR[peticion.proveedor]}`,
    {
      metodo: 'POST',
      cuerpo: {
        token: peticion.token,
        ...(peticion.nombre ? { firstName: peticion.nombre } : {}),
        ...(peticion.apellido ? { lastName: peticion.apellido } : {})
      },
      conSesion: false
    }
  );
  return interpretarEntradaSocial(respuesta, peticion.proveedor);
}

/**
 * Vincula el proveedor a la cuenta de la sesión. Aquí la sesión SÍ viaja: es
 * justamente la prueba de que quien vincula controla esa cuenta.
 */
export async function vincularProveedor(peticion: {
  proveedor: ProveedorSocial;
  token: string;
}): Promise<ResultadoSocial> {
  const respuesta = await llamar<RespuestaSocial>(
    `/api/auth/identities/link/${RUTA_DEL_PROVEEDOR[peticion.proveedor]}`,
    { metodo: 'POST', cuerpo: { token: peticion.token }, conSesion: true }
  );
  return interpretarEntradaSocial(respuesta, peticion.proveedor);
}
