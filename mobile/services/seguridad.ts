/**
 * Los métodos de entrada y el borrado de cuenta, contra el backend REAL.
 *
 * ESTE FICHERO SÓLO TRANSPORTA. Las decisiones viven en
 * `domain/seguridadDeCuenta.ts`, sin nada nativo.
 *
 * CONTRATOS OBSERVADOS, de leer `server/routes/auth.js`:
 *
 *   GET    /api/auth/methods                 → { password, providers, total, contacts }
 *   DELETE /api/auth/identities/:provider    → 200 | 404 IDENTITY_NOT_LINKED
 *                                                  | 409 LAST_AUTH_METHOD
 *   POST   /api/auth/account/delete { password }  → 200 { status, removed }
 *                                                  | 401 REAUTHENTICATION_REQUIRED
 *
 * NADA SENSIBLE EN LOS REGISTROS: ni la contraseña, ni el token, ni lo que
 * devuelve el borrado.
 */

import { llamar } from './api';
import {
  interpretarBorrado,
  interpretarDesvinculacion,
  interpretarMetodos,
  type MetodosDeEntrada,
  type ProveedorSocial
} from '../domain/seguridadDeCuenta';

/** Con qué puede entrar esta persona. Exige sesión. */
export async function consultarMetodos() {
  return interpretarMetodos(await llamar<MetodosDeEntrada>('/auth/methods', { conSesion: true }));
}

/**
 * Quita un proveedor. El servidor comprueba que quede al menos otro método:
 * la misma regla está en el dominio para poder decirlo antes, pero quien manda
 * es él.
 */
export async function desvincular(proveedor: ProveedorSocial) {
  const ruta = proveedor === 'GOOGLE' ? 'google' : 'apple';
  return interpretarDesvinculacion(
    await llamar<unknown>(`/auth/identities/${ruta}`, { metodo: 'DELETE', conSesion: true })
  );
}

/**
 * Elimina la cuenta. Exige la contraseña actual: una sesión de siete días no
 * basta para algo irreversible.
 */
export async function eliminarCuenta(contrasena: string) {
  return interpretarBorrado(
    await llamar<unknown>('/auth/account/delete', {
      metodo: 'POST',
      cuerpo: { password: contrasena },
      conSesion: true
    })
  );
}
