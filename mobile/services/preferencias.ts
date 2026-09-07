/**
 * Las preferencias visuales de este teléfono.
 *
 * DE ESTE TELÉFONO, NO DE ESTA CUENTA
 *
 * La apariencia se queda en el aparato. Alguien que entra con su cuenta en el
 * móvil de un amigo no le cambia el tema, y quien tiene dos teléfonos puede
 * llevar uno en claro y otro en oscuro. Sincronizarla con la cuenta exigiría un
 * campo en el servidor que no existe, y no se inventa.
 *
 * POR QUÉ EN EL MISMO ALMACÉN QUE LA SESIÓN
 *
 * Porque es el que hay. `services/session.ts` ya guarda ahí el último rol
 * elegido, que es exactamente esto: una preferencia, no un secreto. Meter una
 * dependencia nueva para guardar una palabra de tres letras sería peor.
 *
 * Van con clave propia y no se mezclan con el token: esto no es autoridad de
 * nada, y borrar la sesión no tiene por qué cambiarle el tema a nadie.
 */

import * as SecureStore from 'expo-secure-store';

import { APARIENCIAS, type Apariencia } from '../theme/horaVenezuela';

const CLAVE_APARIENCIA = 'plus58express.preferencias.apariencia';

/** `true` si el texto guardado es una de las tres apariencias. */
function esApariencia(valor: string | null): valor is Apariencia {
  return valor !== null && (APARIENCIAS as readonly string[]).includes(valor);
}

/**
 * Lo que se guardó, o `null`.
 *
 * Devuelve `null` —y no «auto»— cuando no hay nada, para que quien llama pueda
 * distinguir «nunca eligió» de «eligió automático». Hoy hacen lo mismo, pero
 * confundirlos cerraría la puerta a, por ejemplo, preguntar la primera vez.
 *
 * Un valor que no reconoce se trata como si no hubiera nada. Puede pasar si una
 * versión futura añade apariencias y alguien vuelve a una anterior: mejor caer
 * en automático que quedarse con una que esta versión no sabe pintar.
 */
export async function leerApariencia(): Promise<Apariencia | null> {
  try {
    const guardada = await SecureStore.getItemAsync(CLAVE_APARIENCIA);
    return esApariencia(guardada) ? guardada : null;
  } catch {
    // Sin almacén disponible se sigue en automático. Que no se pueda recordar
    // el tema no es motivo para que la aplicación no arranque.
    return null;
  }
}

/** Guarda la elección. Si falla, no pasa nada: se pierde al cerrar. */
export async function guardarApariencia(apariencia: Apariencia): Promise<void> {
  try {
    await SecureStore.setItemAsync(CLAVE_APARIENCIA, apariencia);
  } catch {
    /* la preferencia se pierde al cerrar, y eso es todo lo que pasa */
  }
}
