/**
 * A qué dirección llega el backend según dónde corra la aplicación.
 *
 * POR QUÉ ESTÁ EN `domain/` Y NO EN `config/`
 *
 * Porque es una decisión pura y hay que poder comprobarla sin emulador.
 * `config/environment.ts` importa `Platform` de React Native, y cualquier cosa
 * que viva ahí queda atrapada detrás de un módulo nativo. Aquí no hay nada de
 * React Native: entra una URL y dos booleanos, sale una URL.
 */

/**
 * El alias con el que el emulador de Android llama a la máquina que lo aloja.
 *
 * Dentro del emulador, `localhost` es el propio emulador: un backend que corre
 * en el ordenador no está ahí. Android publica `10.0.2.2` para eso, y es la vía
 * documentada desde siempre.
 */
export const ANFITRION_DEL_EMULADOR_ANDROID = '10.0.2.2';

/**
 * Traduce `localhost` cuando quien pregunta es el emulador de Android.
 *
 * POR QUÉ HACE FALTA
 *
 * Apuntar el `.env` a la IP de la red local funciona con un teléfono de verdad
 * conectado al mismo wifi, pero el emulador no siempre alcanza esa red —con una
 * VPN activa en el ordenador, por ejemplo, no la alcanza— y entonces la
 * aplicación dice «no hay conexión» aunque el backend esté perfectamente vivo.
 * Costó una sesión entera descubrirlo.
 *
 * Con esto basta poner `http://127.0.0.1:4000` en el `.env` y funciona en los
 * dos sitios: el emulador lo traduce y todo lo demás lo usa tal cual. **No se
 * escribe ninguna IP personal en el código**: la máquina de cada quien sigue
 * viniendo del `.env`, que git ignora.
 *
 * Sólo en desarrollo. En cualquier otro entorno la URL se respeta intacta,
 * porque ahí no hay emulador que valga.
 */
export function urlParaEstaPlataforma(
  url: string,
  { esAndroid, enDesarrollo }: { readonly esAndroid: boolean; readonly enDesarrollo: boolean }
): string {
  if (!esAndroid || !enDesarrollo) return url;
  try {
    const analizada = new URL(url);
    if (analizada.hostname !== 'localhost' && analizada.hostname !== '127.0.0.1') return url;
    analizada.hostname = ANFITRION_DEL_EMULADOR_ANDROID;
    return analizada.toString().replace(/\/+$/, '');
  } catch {
    // Una URL ilegible la rechaza `resolverConfiguracion` con su propio
    // mensaje; aquí no se inventa nada.
    return url;
  }
}
