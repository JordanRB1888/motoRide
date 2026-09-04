/**
 * Que hacer cuando llega una identidad social verificada: la politica de
 * vinculacion de cuentas, escrita como una funcion pura.
 *
 * LA REGLA QUE MANDA: NO SE FUSIONA POR CORREO
 *
 * Que el token de Google traiga el mismo correo que una cuenta creada con
 * contrasena no demuestra que sean la misma persona. El correo pudo cambiar
 * de manos; el de Apple puede ser un alias; y `email_verified` lo afirma el
 * proveedor sobre SU cuenta, no sobre la nuestra. Fusionar por correo es
 * regalar la cuenta de alguien a quien controle una cuenta de Google con su
 * correo antiguo.
 *
 * Por eso, cuando hay una cuenta con ese correo y ninguna identidad social
 * conocida, la respuesta es `LINK_REQUIRES_PROOF`: hay que entrar en esa
 * cuenta por su propio medio (contrasena, o un codigo al contacto verificado)
 * y, ya con sesion, vincular.
 *
 * LAS DECISIONES
 *
 *   LOGIN_EXISTING      -- la identidad (provider, subject) ya esta vinculada
 *                          a un User: es esa persona, entra.
 *   LINK_TO_SESSION     -- hay sesion y la identidad es nueva: se vincula al
 *                          User de la sesion. La sesion ES la prueba.
 *   CREATE_USER         -- ni identidad conocida, ni sesion, ni cuenta con ese
 *                          correo: nace un User nuevo, siempre pasajero.
 *   LINK_REQUIRES_PROOF -- identidad nueva, sin sesion, pero ya hay un User
 *                          con ese correo: no se crea otro ni se fusiona.
 *   CONFLICT            -- hay sesion y la identidad pertenece a OTRO User:
 *                          no se roba.
 */

export const DECISION = Object.freeze({
  LOGIN_EXISTING: 'LOGIN_EXISTING',
  LINK_TO_SESSION: 'LINK_TO_SESSION',
  CREATE_USER: 'CREATE_USER',
  LINK_REQUIRES_PROOF: 'LINK_REQUIRES_PROOF',
  CONFLICT: 'CONFLICT'
});

/** Se deja escrito para que una prueba lo lea: nunca se fusiona por correo. */
export const AUTO_MERGE_BY_EMAIL = false;

/**
 * @param identidadExistente  la identidad `(provider, subject)` si ya esta
 *                            guardada, o null
 * @param usuarioDeSesion     el User autenticado que hace la peticion, o null
 * @param usuarioPorCorreo    un User cuyo correo coincide con el del token,
 *                            o null. Solo sirve para NEGARSE a crear otro.
 */
export function decidirVinculacion({ identidadExistente, usuarioDeSesion, usuarioPorCorreo }) {
  if (identidadExistente) {
    if (usuarioDeSesion && usuarioDeSesion.id !== identidadExistente.userId) {
      return { decision: DECISION.CONFLICT, userId: identidadExistente.userId };
    }
    return { decision: DECISION.LOGIN_EXISTING, userId: identidadExistente.userId };
  }
  if (usuarioDeSesion) return { decision: DECISION.LINK_TO_SESSION, userId: usuarioDeSesion.id };
  if (usuarioPorCorreo) return { decision: DECISION.LINK_REQUIRES_PROOF, userId: null };
  return { decision: DECISION.CREATE_USER, userId: null };
}

/**
 * El rol con el que nace un User creado desde una identidad social. Es una
 * constante, no un parametro: no hay forma de pedir otro.
 */
export const ROL_DE_USUARIO_SOCIAL_NUEVO = 'passenger';
