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
 * Estuvo apagada por una razón puramente técnica: Web Analytics hay que
 * activarla en los ajustes del proyecto, y mientras no lo estaba,
 * `/_vercel/insights/script.js` devolvía un 404 con tipo `text/plain` que
 * `nosniff` —bien— se negaba a ejecutar. Eso dejaba un error en la consola de
 * cada visitante a cambio de nada.
 *
 * Ya está activada en el proyecto: ese mismo endpoint devuelve ahora 200 con
 * `application/javascript`. Por eso esto pasa a `true`.
 *
 * No hace falta tocar la CSP: tanto el script como la baliza de eventos viven en
 * el propio dominio —`/_vercel/insights/…`—, así que `script-src 'self'` y
 * `connect-src 'self'` ya los cubren. No se abre ni un dominio externo.
 */
export const ANALYTICS_ENABLED = true;
