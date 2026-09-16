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
 * Lista de espera del lanzamiento. **ENCENDIDA el 15 de septiembre de 2026.**
 *
 * Los requisitos eran cinco, y no se encendió hasta cumplirlos todos:
 *
 *   1. política de privacidad publicada, con responsable identificado — v1.1,
 *      revisada por Fernando Atencio;
 *   2. almacén provisionado — Postgres de Supabase, con las tres tablas y el
 *      índice único sobre el correo;
 *   3. claves de Turnstile, las dos: la pública en el navegador y la secreta en
 *      el servidor, que es la que decide;
 *   4. clave de Resend en el proyecto web;
 *   5. **y la que faltaba hasta el final: la prueba de que un correo sale de
 *      producción y LLEGA a un buzón de verdad.** Se hizo el 15 de septiembre y
 *      el propietario confirmó la recepción. Un doble consentimiento por correo
 *      cuyo correo no llega no es un doble consentimiento: es una lista que
 *      nadie puede confirmar y de la que nadie puede salir.
 *
 * Encenderlo aquí hace cuatro cosas a la vez, y conviene tenerlas presentes:
 * pinta el formulario en `/#descargar`, abre las cuatro rutas de `/api/waitlist`
 * y, a través de `next.config.ts`, abre la CSP a `challenges.cloudflare.com`
 * —sólo a ese dominio, y sólo mientras algún formulario pueda pintarse—.
 */
export const WAITLIST_ENABLED = true;

/**
 * Captación de comercios aliados. **SIGUE APAGADA, y a propósito.**
 *
 * Cumple los mismos cinco requisitos que la lista de espera —comparte almacén,
 * Turnstile y Resend—, así que ya no está apagada por falta de nada: lo está
 * porque el propietario decidió encender una superficie cada vez y mirar cómo se
 * comporta antes de abrir la siguiente. Es una decisión, no un pendiente.
 *
 * Mientras esté apagada, `/aliados` sigue ofreciendo la conversación por
 * WhatsApp, que es una puerta real y no promete un alta automática que no
 * existe.
 *
 * Aviso para quien la encienda: este formulario **manda un aviso interno con los
 * siete campos** al buzón del equipo (`EMAIL_EQUIPO`, y si no existe, la
 * dirección de contacto). La política de privacidad ya lo declara; si eso
 * cambiara, hay que cambiar el texto antes de tocar esta línea.
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
