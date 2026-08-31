/**
 * La máquina de estados de la sesión.
 *
 * POR QUÉ UNA MÁQUINA Y NO CUATRO BOOLEANOS
 *
 * `isLoading` + `isLogged` + `hasUser` + `maybeToken` admite dieciséis
 * combinaciones, de las que sólo cinco tienen sentido. Las otras once son
 * errores que nadie escribió a propósito: «cargando y a la vez autenticado»,
 * «hay usuario pero no hay sesión». Aquí sólo existen los estados válidos.
 *
 * LA DISTINCIÓN QUE MÁS IMPORTA
 *
 *   AUTENTICADO           el backend confirmó la sesión ahora mismo
 *   SIN_VERIFICAR         hay un token guardado y NO se pudo preguntar
 *
 * Son cosas distintas y confundirlas hace daño en las dos direcciones:
 *
 * · tratar «sin red» como «sesión inválida» cierra la sesión de alguien que la
 *   tiene perfectamente válida, sólo porque iba en el metro;
 * · tratar «sin red» como «autenticado» deja pasar operaciones sensibles con
 *   una sesión que quizá el backend ya revocó.
 *
 * Por eso `SIN_VERIFICAR` existe, muestra la identidad que se conocía y **no
 * autoriza nada** que necesite autoridad fresca.
 */

import type { UserRole } from '../../shared/contracts/domain';

export const ESTADOS_DE_SESION = [
  'ARRANCANDO',
  'SIN_SESION',
  'AUTENTICANDO',
  'AUTENTICADO',
  'SIN_VERIFICAR'
] as const;
export type EstadoDeSesion = (typeof ESTADOS_DE_SESION)[number];

/**
 * La identidad tal como la devuelve el backend.
 *
 * Es un SUBCONJUNTO deliberado de `publicUser`: sólo lo que la aplicación
 * necesita para navegar y saludar. Guardar el objeto entero invitaría a tratarlo
 * como fuente de verdad permanente, y los datos que importan —el rol, el estado
 * de la cuenta, la aprobación— los decide el backend en cada petición.
 */
export interface IdentidadDeUsuario {
  readonly id: string;
  readonly role: UserRole;
  readonly firstName: string;
  readonly lastName: string;
  /** `true` sólo si el backend lo dice. Un conductor sin esto no opera. */
  readonly isVerified: boolean;
  readonly accountStatus: string;
}

export const MOTIVOS_DE_CIERRE = [
  'PETICION_DE_LA_PERSONA',
  'SESION_INVALIDA',
  'CUENTA_DESHABILITADA'
] as const;
export type MotivoDeCierre = (typeof MOTIVOS_DE_CIERRE)[number];

export type Sesion =
  | { readonly estado: 'ARRANCANDO' }
  | { readonly estado: 'SIN_SESION'; readonly motivo: MotivoDeCierre | null }
  | { readonly estado: 'AUTENTICANDO' }
  | { readonly estado: 'AUTENTICADO'; readonly usuario: IdentidadDeUsuario }
  | {
      readonly estado: 'SIN_VERIFICAR';
      /** Lo último que se supo. Sirve para saludar, no para autorizar. */
      readonly usuario: IdentidadDeUsuario | null;
    };

export const SESION_INICIAL: Sesion = { estado: 'ARRANCANDO' };

/**
 * `true` sólo cuando el backend confirmó la sesión.
 *
 * Es la única función que debe consultarse para permitir algo. `SIN_VERIFICAR`
 * da `false` a propósito: hay un token, pero nadie ha comprobado que siga
 * valiendo.
 */
export function tieneAutoridadFresca(sesion: Sesion): boolean {
  return sesion.estado === 'AUTENTICADO';
}

/** El usuario conocido, esté verificado o no. Para pintar, nunca para permitir. */
export function usuarioConocido(sesion: Sesion): IdentidadDeUsuario | null {
  if (sesion.estado === 'AUTENTICADO') return sesion.usuario;
  if (sesion.estado === 'SIN_VERIFICAR') return sesion.usuario;
  return null;
}

/**
 * Si un conductor puede operar.
 *
 * Exige TRES cosas a la vez, y ninguna la decide el cliente:
 *
 *  1. sesión confirmada por el backend ahora mismo;
 *  2. que el backend diga que su rol es `driver`;
 *  3. que el backend lo dé por verificado.
 *
 * Que el JWT lleve `role: 'driver'` no basta: el backend exige además la
 * aprobación, y el token se firmó en el pasado. Alguien suspendido después de
 * entrar sigue teniendo un token con ese claim.
 */
export function puedeOperarComoConductor(sesion: Sesion): boolean {
  if (sesion.estado !== 'AUTENTICADO') return false;
  const { usuario } = sesion;
  return usuario.role === 'driver'
    && usuario.isVerified === true
    && usuario.accountStatus !== 'DISABLED';
}

/**
 * Qué experiencia corresponde a la identidad REAL.
 *
 * No la que la persona eligió en el selector: la que dice el backend. El
 * selector decide qué pantalla de acceso se enseña; esto decide a dónde se va
 * después de entrar.
 */
export function experienciaDeLaIdentidad(usuario: IdentidadDeUsuario): 'passenger' | 'driver' {
  return usuario.role === 'driver' ? 'driver' : 'passenger';
}

/**
 * Traduce lo que devuelve el backend a la identidad que usa la aplicación.
 *
 * Devuelve `null` si falta algo esencial, en vez de rellenar huecos con valores
 * por defecto: una identidad a medias es peor que ninguna, porque parece válida.
 */
export function leerIdentidad(cuerpo: unknown): IdentidadDeUsuario | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const dato = cuerpo as Record<string, unknown>;

  const id = typeof dato.id === 'string' ? dato.id : '';
  const role = typeof dato.role === 'string' ? dato.role : '';
  if (id === '' || (role !== 'passenger' && role !== 'driver' && role !== 'admin')) return null;

  return {
    id,
    role,
    firstName: typeof dato.firstName === 'string' ? dato.firstName : '',
    lastName: typeof dato.lastName === 'string' ? dato.lastName : '',
    // Sólo el `true` explícito cuenta. Cualquier otra cosa —ausente, `'yes'`,
    // `1`— se lee como no verificado, que es el lado seguro.
    isVerified: dato.isVerified === true,
    accountStatus: typeof dato.accountStatus === 'string' ? dato.accountStatus : 'ACTIVE'
  };
}
