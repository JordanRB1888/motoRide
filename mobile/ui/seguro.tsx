/**
 * El aire que hay que dejarle al sistema.
 *
 * EL PROBLEMA
 *
 * La aplicación dibuja de borde a borde: ocupa la pantalla entera, incluido el
 * sitio donde el teléfono pinta la hora, la batería y el wifi. Sin dejarle ese
 * aire, la cabecera se mete DEBAJO de esos iconos y no se ve ni una cosa ni la
 * otra.
 *
 * No es opcional ni es una decisión de estilo: Android lo impone desde Expo 54
 * y en iOS es la muesca de siempre. Lo que cambia de un teléfono a otro es
 * CUÁNTO, y por eso no vale un número escrito a mano —24 puntos sobran en uno
 * y se quedan cortos en otro con isla dinámica—.
 *
 * POR QUÉ AQUÍ Y NO EN CADA PANTALLA
 *
 * Estaba resuelto abajo y olvidado arriba: la barra de navegación ya pedía su
 * franja para no quedar bajo el indicador de gestos, pero ninguna cabecera
 * pedía la suya. Un hook con nombre es más difícil de olvidar que acordarse de
 * sumar un inset en cada pantalla nueva.
 *
 * EN EL NAVEGADOR VALE CERO
 *
 * Y está bien: una pestaña del navegador no tiene barra de estado que respetar.
 * Eso significa que este arreglo NO se ve en el recorrido de diseño; se ve en
 * el teléfono.
 */

import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Lo que ocupan la hora, la batería y el wifi en la parte de arriba. */
export function useAireDeArriba(): number {
  return useSafeAreaInsets().top;
}
