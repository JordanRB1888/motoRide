/**
 * Las decisiones de entrar con Google o con Apple.
 *
 * PURO A PROPÓSITO
 *
 * Aquí no hay React ni nada nativo: sólo qué significa cada respuesta y en qué
 * estado deja la pantalla. Por eso se prueba entero sin emulador, que es donde
 * estos caminos —cancelar, quedarse sin red, un token rechazado— son casi
 * imposibles de reproducir a mano.
 *
 * GOOGLE Y APPLE DEMUESTRAN QUIÉN ERES; NO TE DAN UN ROL
 *
 * Lo que vuelve del servidor es una sesión de +58Express normal, con el rol que
 * el servidor decide. La intención elegida en la bienvenida —pasajero o
 * conductor— cambia a DÓNDE se va después, nunca lo que la persona es.
 */

import type { IdentidadDeUsuario } from './authState';

export type ProveedorSocial = 'GOOGLE' | 'APPLE';

/**
 * Todos los estados de la entrada social. No hay ninguno más: lo que no encaje
 * cae en `ERROR_DEL_SERVIDOR`, que tiene su propia frase. Nunca queda en blanco.
 */
export const ESTADOS_SOCIALES = [
  'REPOSO',
  'ABRIENDO_PROVEEDOR',
  'ESPERANDO_PROVEEDOR',
  'VERIFICANDO_CON_SERVIDOR',
  'ENTRADO',
  'CANCELADO',
  'SIN_CONEXION',
  'FALLO_DEL_PROVEEDOR',
  'TOKEN_RECHAZADO',
  'HACE_FALTA_VINCULAR',
  'IDENTIDAD_OCUPADA',
  'ERROR_DEL_SERVIDOR'
] as const;
export type EstadoSocial = (typeof ESTADOS_SOCIALES)[number];

/** Los estados con una operación en curso: el botón se protege. */
export const ESTADOS_SOCIALES_OCUPADOS: readonly EstadoSocial[] = [
  'ABRIENDO_PROVEEDOR',
  'ESPERANDO_PROVEEDOR',
  'VERIFICANDO_CON_SERVIDOR'
];

export function socialOcupado(estado: EstadoSocial): boolean {
  return ESTADOS_SOCIALES_OCUPADOS.includes(estado);
}

/**
 * Cancelar NO es un error.
 *
 * Se separa a propósito: la pantalla vuelve en silencio, sin aviso rojo, sin
 * contarlo como fallo y sin haber creado ninguna cuenta. Enseñar un error por
 * algo que la persona hizo a propósito la haría dudar de si rompió algo.
 */
export function esFalloQueSeAvisa(estado: EstadoSocial): boolean {
  return (
    estado === 'SIN_CONEXION' ||
    estado === 'FALLO_DEL_PROVEEDOR' ||
    estado === 'TOKEN_RECHAZADO' ||
    estado === 'HACE_FALTA_VINCULAR' ||
    estado === 'IDENTIDAD_OCUPADA' ||
    estado === 'ERROR_DEL_SERVIDOR'
  );
}

/** El nombre con el que se habla de cada proveedor a las personas. */
export const NOMBRE_DEL_PROVEEDOR: Record<ProveedorSocial, string> = {
  GOOGLE: 'Google',
  APPLE: 'Apple'
};

/** Un proveedor tal y como lo cuenta el servidor. */
export interface ProveedorDisponible {
  readonly provider: ProveedorSocial;
  readonly available: boolean;
}

/**
 * Un proveedor se ofrece cuando el SERVIDOR lo tiene configurado **y** esta
 * plataforma lo soporta. Las dos condiciones: sin la primera el servidor
 * devolvería 503; sin la segunda no hay forma de abrir el selector.
 */
export function proveedoresOfrecibles(
  delServidor: readonly ProveedorDisponible[],
  soportadoAqui: (proveedor: ProveedorSocial) => boolean
): ProveedorSocial[] {
  return delServidor
    .filter(entrada => entrada.available && soportadoAqui(entrada.provider))
    .map(entrada => entrada.provider);
}

export interface FalloDeApiSocial {
  readonly ok: false;
  readonly motivo: string;
  readonly codigo: string | null;
  readonly mensaje?: string;
  readonly detalle?: unknown;
  readonly estadoHttp?: number | null;
}

export interface RespuestaSocial {
  readonly status?: string;
  readonly user?: IdentidadDeUsuario;
  readonly token?: string;
}

export interface ResultadoSocial {
  readonly estado: EstadoSocial;
  readonly mensaje?: string;
  readonly usuario?: IdentidadDeUsuario;
  readonly token?: string;
  /** El proveedor cuya identidad ya pertenece a otra cuenta, si aplica. */
  readonly proveedor?: ProveedorSocial;
}

function esFalloDeRed(motivo: string): boolean {
  return motivo === 'SIN_RED' || motivo === 'TIEMPO_AGOTADO' || motivo === 'SIN_CONFIGURACION';
}

/**
 * Qué hacer con la respuesta del servidor a un token social.
 *
 * Cada error tiene su estado y su frase. «Algo salió mal» no aparece en
 * ninguna rama: quien no puede entrar necesita saber si es su conexión, si esa
 * cuenta ya existe con contraseña, o si su cuenta de Google ya está en otro
 * usuario.
 */
export function interpretarEntradaSocial(
  respuesta: { ok: true; datos: RespuestaSocial } | FalloDeApiSocial,
  proveedor: ProveedorSocial
): ResultadoSocial {
  if (respuesta.ok) {
    return {
      estado: 'ENTRADO',
      usuario: respuesta.datos.user,
      token: respuesta.datos.token,
      proveedor
    };
  }

  if (esFalloDeRed(respuesta.motivo)) {
    return {
      estado: 'SIN_CONEXION',
      proveedor,
      mensaje: 'No hay conexión. Revisa tus datos o el wifi y vuelve a intentarlo.'
    };
  }

  const nombre = NOMBRE_DEL_PROVEEDOR[proveedor];

  switch (respuesta.codigo) {
    case 'INVALID_PROVIDER_TOKEN':
      return {
        estado: 'TOKEN_RECHAZADO',
        proveedor,
        mensaje: `No pudimos comprobar tu cuenta de ${nombre}. Inténtalo de nuevo.`
      };
    case 'SOCIAL_PROVIDER_NOT_CONFIGURED':
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        proveedor,
        mensaje: `Entrar con ${nombre} no está disponible ahora mismo.`
      };
    case 'ACCOUNT_LINK_REQUIRED':
      // No se fusiona por correo: hay que demostrar el control de la cuenta
      // que ya existe. Es la política, no una limitación técnica.
      return {
        estado: 'HACE_FALTA_VINCULAR',
        proveedor,
        mensaje: `Ya hay una cuenta con ese correo. Entra con tu contraseña y después podrás vincular ${nombre}.`
      };
    case 'IDENTITY_TAKEN':
      return {
        estado: 'IDENTIDAD_OCUPADA',
        proveedor,
        mensaje: `Esa cuenta de ${nombre} ya está vinculada a otro usuario de +58Express.`
      };
    case 'ACCOUNT_DISABLED':
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        proveedor,
        mensaje: 'Esta cuenta está desactivada. Escríbenos si crees que es un error.'
      };
    default:
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        proveedor,
        mensaje: `No pudimos entrar con ${nombre}. Inténtalo de nuevo en un momento.`
      };
  }
}

/**
 * Qué hacer con lo que devuelve el selector del proveedor, antes de hablar con
 * el servidor.
 */
export function interpretarResultadoDelProveedor(
  resultado: { readonly estado: string },
  proveedor: ProveedorSocial
): ResultadoSocial | null {
  if (resultado.estado === 'TOKEN') return null; // sigue: toca preguntar al servidor
  if (resultado.estado === 'CANCELADO') return { estado: 'CANCELADO', proveedor };
  if (resultado.estado === 'NO_DISPONIBLE') {
    return {
      estado: 'ERROR_DEL_SERVIDOR',
      proveedor,
      mensaje: `Entrar con ${NOMBRE_DEL_PROVEEDOR[proveedor]} no está disponible en este dispositivo.`
    };
  }
  return {
    estado: 'FALLO_DEL_PROVEEDOR',
    proveedor,
    mensaje: `No pudimos entrar con ${NOMBRE_DEL_PROVEEDOR[proveedor]}. Inténtalo de nuevo.`
  };
}

/**
 * A dónde se va después de entrar con un proveedor.
 *
 * **No hay regla nueva**: se reutiliza `destinoTrasEntrar`, la misma que
 * decide tras entrar con contraseña. Manda el rol que devuelve el servidor y
 * la intención sólo elige puerta para quien todavía es pasajero. Escribir aquí
 * una segunda versión sería crear un sitio donde la regla pudiera divergir —y
 * el día que divergiera, una entrada con Google concedería algo que la entrada
 * con contraseña no concede.
 */
export { destinoTrasEntrar } from './entrada';
