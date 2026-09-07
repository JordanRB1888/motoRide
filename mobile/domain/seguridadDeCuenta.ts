/**
 * Los métodos con los que se entra a una cuenta, y qué se puede hacer con
 * ellos. Puro: se prueba sin emulador.
 *
 * LA REGLA QUE MANDA
 *
 * Nadie puede quedarse sin puerta. Quitar el último método dejaría una cuenta
 * a la que sólo se podría volver recuperando la contraseña —y hoy no hay
 * ningún canal configurado para enviar el código—. La comprobación de verdad
 * vive en el servidor; esto es lo que permite que la pantalla lo explique
 * ANTES de que alguien lo intente, en vez de enseñarle un error.
 */

export type ProveedorSocial = 'GOOGLE' | 'APPLE';

/** Un proveedor tal y como lo cuenta el servidor. */
export interface MetodoSocial {
  readonly provider: ProveedorSocial;
  readonly linked: boolean;
  /** Si el servidor lo tiene configurado. Sin esto no se ofrece vincular. */
  readonly available: boolean;
}

export interface MetodosDeEntrada {
  readonly password: boolean;
  readonly providers: readonly MetodoSocial[];
  readonly total: number;
  readonly contacts: readonly { readonly type: 'EMAIL' | 'PHONE'; readonly verified: boolean }[];
}

/** Lo que la pantalla pinta para cada método. */
export type EstadoDelMetodo = 'VINCULADO' | 'NO_VINCULADO' | 'NO_DISPONIBLE';

export function estadoDelMetodo(metodo: MetodoSocial): EstadoDelMetodo {
  if (metodo.linked) return 'VINCULADO';
  return metodo.available ? 'NO_VINCULADO' : 'NO_DISPONIBLE';
}

export const TEXTO_DEL_ESTADO: Readonly<Record<EstadoDelMetodo, string>> = Object.freeze({
  VINCULADO: 'Vinculado',
  NO_VINCULADO: 'Sin vincular',
  NO_DISPONIBLE: 'No disponible'
});

/**
 * Si se puede quitar ese proveedor.
 *
 * Espejo de la regla del servidor, que es quien manda. Aquí sólo sirve para
 * decirlo antes: un botón que siempre falla es peor que un botón apagado con
 * su explicación.
 */
export function sePuedeDesvincular(metodos: MetodosDeEntrada, provider: ProveedorSocial): boolean {
  const metodo = metodos.providers.find(p => p.provider === provider);
  if (metodo === undefined || !metodo.linked) return false;
  return metodos.total > 1;
}

/** Por qué no se puede quitar, cuando no se puede. */
export const MOTIVO_ULTIMO_METODO =
  'Es tu única forma de entrar. Añade otra antes de quitar esta.';

/**
 * Qué prueba hace falta para borrar la cuenta.
 *
 * Con contraseña, la contraseña. Sin ella —una cuenta creada con Google— hace
 * falta un código, y hoy eso depende de que exista un canal configurado.
 */
export function pruebaParaBorrar(metodos: MetodosDeEntrada): 'CONTRASENA' | 'CODIGO' {
  return metodos.password ? 'CONTRASENA' : 'CODIGO';
}

/** Los estados de la pantalla de seguridad. Ninguno la deja en blanco. */
export const ESTADOS_DE_SEGURIDAD = [
  'CARGANDO',
  'LISTO',
  'SIN_CONEXION',
  'ERROR'
] as const;
export type EstadoDeSeguridad = (typeof ESTADOS_DE_SEGURIDAD)[number];

export interface FalloDeApiSeguridad {
  readonly ok: false;
  readonly motivo: string;
  readonly codigo: string | null;
}

function esFalloDeRed(motivo: string): boolean {
  return motivo === 'SIN_RED' || motivo === 'TIEMPO_AGOTADO' || motivo === 'SIN_CONFIGURACION';
}

export function interpretarMetodos(
  respuesta: { ok: true; datos: MetodosDeEntrada } | FalloDeApiSeguridad
): { estado: EstadoDeSeguridad; metodos?: MetodosDeEntrada; mensaje?: string } {
  if (respuesta.ok) return { estado: 'LISTO', metodos: respuesta.datos };
  if (esFalloDeRed(respuesta.motivo)) {
    return { estado: 'SIN_CONEXION', mensaje: 'No hay conexión. Revisa tus datos o el wifi.' };
  }
  return { estado: 'ERROR', mensaje: 'No pudimos cargar tus métodos de entrada.' };
}

/** Qué decir de cada respuesta al borrar la cuenta. */
export function interpretarBorrado(
  respuesta: { ok: true; datos: unknown } | FalloDeApiSeguridad
): { ok: boolean; mensaje?: string } {
  if (respuesta.ok) return { ok: true };
  if (esFalloDeRed(respuesta.motivo)) {
    return { ok: false, mensaje: 'No hay conexión. No se eliminó nada; inténtalo de nuevo.' };
  }
  if (respuesta.codigo === 'REAUTHENTICATION_REQUIRED') {
    return { ok: false, mensaje: 'La contraseña no es correcta.' };
  }
  if (respuesta.codigo === 'RATE_LIMITED') {
    return { ok: false, mensaje: 'Demasiados intentos. Inténtalo de nuevo en un rato.' };
  }
  return { ok: false, mensaje: 'No pudimos eliminar tu cuenta. Inténtalo de nuevo.' };
}

/** Qué decir al desvincular. */
export function interpretarDesvinculacion(
  respuesta: { ok: true; datos: unknown } | FalloDeApiSeguridad
): { ok: boolean; mensaje?: string } {
  if (respuesta.ok) return { ok: true };
  if (esFalloDeRed(respuesta.motivo)) {
    return { ok: false, mensaje: 'No hay conexión. No se quitó nada.' };
  }
  if (respuesta.codigo === 'LAST_AUTH_METHOD') return { ok: false, mensaje: MOTIVO_ULTIMO_METODO };
  return { ok: false, mensaje: 'No pudimos quitar ese método. Inténtalo de nuevo.' };
}

/**
 * Lo que se le advierte a alguien antes de borrar su cuenta.
 *
 * Sin patrones engañosos y sin letra pequeña: se dice lo que se pierde y lo
 * que se conserva, porque conservar el registro de los viajes es cierto y
 * enterarse después sería peor.
 */
export const CONSECUENCIAS_DEL_BORRADO: readonly string[] = Object.freeze([
  'No podrás volver a entrar con esta cuenta.',
  'Se eliminan tus datos personales, tus formas de entrar y tus documentos.',
  'El registro de tus viajes se conserva sin tu nombre, porque también es de las personas que viajaron contigo.',
  'Esto no se puede deshacer.'
]);
