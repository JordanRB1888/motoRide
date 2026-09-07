/**
 * La forma de un resultado de API.
 *
 * Vive en el dominio y no en `services/` por una razón concreta: los servicios
 * dependen de módulos nativos —`expo-secure-store`, `fetch` del dispositivo— y
 * cualquier decisión que se apoye en estos tipos quedaría atrapada detrás de
 * ellos, imposible de ejecutar fuera de un emulador.
 *
 * Aquí no hay nada de React Native. La dirección de dependencias es
 * `services/ → domain/`, nunca al revés.
 */

export const MOTIVOS_DE_ERROR = [
  'SIN_CONFIGURACION',
  'SIN_RED',
  'TIEMPO_AGOTADO',
  'NO_AUTENTICADO',
  'RESPUESTA_INVALIDA',
  'ERROR_DEL_SERVIDOR'
] as const;
export type MotivoDeError = (typeof MOTIVOS_DE_ERROR)[number];

export interface FalloDeApi {
  readonly ok: false;
  readonly motivo: MotivoDeError;
  /** El código del backend (`{ error: CÓDIGO }`), si vino. */
  readonly codigo: string | null;
  readonly mensaje: string;
  /**
   * El cuerpo del error, tal cual.
   *
   * Hace falta porque algunos errores traen DETALLE que el código solo no
   * lleva: `VALIDATION_FAILED` viene con `fields` diciendo qué campo falla y
   * por qué, y sin eso un formulario sólo puede decir «algo está mal».
   *
   * Se deja sin tipar a propósito: es la respuesta cruda de otro sistema, y
   * quien la lea tiene que comprobar su forma. Opcional, así que nada de lo
   * que ya existía cambia.
   */
  readonly detalle?: unknown;
  /**
   * El código HTTP, cuando hubo respuesta.
   *
   * `motivo` agrupa: un 429 y un 503 son los dos `ERROR_DEL_SERVIDOR`, y para
   * una pantalla eso basta —«el servidor no responde»—. Pero quien decide si
   * reintentar necesita distinguirlos: ante un 429 hay que esperar, y ante un
   * 503 la siguiente muestra puede intentarlo ya.
   *
   * `null` cuando no hubo respuesta: sin red, tiempo agotado o configuración
   * inválida. Opcional, así que nada de lo que ya lo lee cambia.
   */
  readonly estadoHttp?: number | null;
}

/**
 * Un resultado, no una excepción.
 *
 * En una interfaz móvil casi todos los errores son estados que hay que pintar
 * —sin red, sesión caducada, servidor caído— y envolverlos en `try/catch` por
 * toda la aplicación acaba en pantallas en blanco porque alguien olvidó uno.
 */
export type Resultado<T> = { readonly ok: true; readonly datos: T } | FalloDeApi;
