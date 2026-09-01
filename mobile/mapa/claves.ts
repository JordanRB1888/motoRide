/**
 * Las claves de Google, y cuál va en cada sitio.
 *
 * TRES CLAVES DISTINTAS, TRES RESPONSABILIDADES
 *
 *   navegador  Maps JavaScript API, restringida por referente HTTP
 *   Android    Maps SDK for Android, restringida por paquete + SHA-1
 *   iOS        Maps SDK for iOS, restringida por identificador de paquete
 *
 * No son intercambiables. Una clave de navegador puesta en Android no funciona
 * —la restricción por referente no aplica— y, si alguien la abriera para que
 * funcionara, quedaría abierta también para cualquier página del mundo.
 *
 * LA CUARTA CLAVE NO ESTÁ AQUÍ, Y NO PUEDE ESTARLO
 *
 * `DISPATCH_ROUTES_API_KEY` es la del servidor, para calcular rutas en el
 * despacho. Vive sólo en el backend y JAMÁS viaja al cliente: una clave sin
 * restricción de referente publicada en una aplicación es una factura abierta.
 * Hay una prueba que comprueba que ese nombre no aparece en todo `mobile/`.
 *
 * TODO `EXPO_PUBLIC_*` ES PÚBLICO
 *
 * Lo de aquí acaba dentro del paquete que se instala en el teléfono y se puede
 * leer descompilándolo. Eso es inherente a Google Maps —el navegador descarga
 * el script con la clave en la URL— y por eso su protección real no es el
 * secreto sino las restricciones de Google Cloud.
 *
 * SIN CLAVE NO SE INVENTA NINGUNA
 *
 * Nada de caer a la clave de producción ni a la del navegador. Sin la que toca,
 * el mapa se declara no disponible y la pantalla sigue funcionando sin él.
 */

/** Los nombres de las variables. Estables, para que las pruebas los vigilen. */
export const VARIABLE_CLAVE_WEB = 'EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY';
export const VARIABLE_CLAVE_ANDROID = 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY';
export const VARIABLE_CLAVE_IOS = 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY';

/** La del servidor. Se nombra SÓLO para poder prohibirla. */
export const VARIABLE_PROHIBIDA_DEL_SERVIDOR = 'DISPATCH_ROUTES_API_KEY';

const texto = (valor: unknown): string => String(valor ?? '').trim();

/**
 * La clave del navegador.
 *
 * `process.env.EXPO_PUBLIC_*` lo sustituye Expo al compilar, así que hay que
 * escribir el nombre completo y literal: una lectura dinámica se quedaría sin
 * sustituir y devolvería siempre vacío.
 */
export function claveDelNavegador(): string {
  return texto(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY);
}

export function hayClaveDelNavegador(): boolean {
  return claveDelNavegador() !== '';
}

/**
 * Qué falta, dicho para quien lo tenga que arreglar.
 *
 * Se enseña en el hueco del mapa cuando no hay clave, sólo en desarrollo. En
 * una versión publicada no se cuenta al usuario qué variable falta: eso es
 * información de dentro y no le sirve de nada.
 */
export function faltaLaClave(): string {
  return `Falta ${VARIABLE_CLAVE_WEB}. El mapa necesita una clave del Maps `
    + 'JavaScript API restringida a localhost para desarrollo. No se usa la de '
    + 'producción.';
}
