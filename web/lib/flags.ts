/**
 * Interruptores de la web pública.
 *
 * Viven aquí, juntos y en un solo sitio, porque la regla del proyecto es que
 * ninguna superficie que pida datos personales se publique antes de que exista
 * una política de privacidad válida. Un interruptor disperso por los componentes
 * acabaría encendido por descuido.
 *
 * Mientras un interruptor esté en `false`:
 *   · el componente NO se pinta — nada de campos apagados ni de formularios
 *     decorativos: un formulario que no puede cumplir lo que promete engaña;
 *   · su ruta de API responde 404, como si no existiera. No 503: no es que el
 *     servicio esté caído, es que todavía no hay servicio.
 *
 * Encenderlos es cambiar `false` por `true` aquí y desplegar. Nada más.
 */

/**
 * Lista de espera del lanzamiento.
 *
 * Requisitos para encenderla, todos: política de privacidad publicada con
 * responsable identificado · almacén provisionado · claves de Turnstile ·
 * clave de Resend en el proyecto web.
 */
export const WAITLIST_ENABLED = false;

/**
 * Captación de comercios aliados.
 *
 * Mismos requisitos. Mientras esté apagada, `/aliados` sigue ofreciendo la
 * conversación por WhatsApp, que es una puerta real y no promete un alta
 * automática que no existe.
 */
export const PARTNER_LEADS_ENABLED = false;

/**
 * Analítica de producto.
 *
 * Separada de las dos anteriores a propósito: no recoge ningún dato personal ni
 * usa cookies, así que no depende de la política de privacidad.
 *
 * Apagada por otra razón, puramente técnica: Vercel Web Analytics hay que
 * activarla en los ajustes del proyecto, y mientras no lo esté,
 * `/_vercel/insights/script.js` devuelve un 404 con tipo `text/plain` que
 * `nosniff` —bien— se niega a ejecutar. Eso deja un error en la consola de cada
 * visitante a cambio de nada.
 *
 * El código está entero y probado. Encenderlo es: activar Web Analytics en el
 * panel del proyecto y poner esto en `true`.
 */
export const ANALYTICS_ENABLED = false;
