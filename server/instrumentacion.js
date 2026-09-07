/**
 * El arranque de la observabilidad, en su propio módulo y con un propósito
 * concreto: correr ANTES que todo lo demás.
 *
 * POR QUÉ NO VALE LLAMARLO DESDE `index.js`
 *
 * En módulos ES, todos los `import` de un fichero se evalúan antes que la
 * primera línea de su cuerpo. Da igual dónde se escriba la llamada dentro de
 * `index.js`: para cuando se ejecute, Express, `http` y Socket.IO ya están
 * cargados. El SDK instrumenta envolviendo esos módulos al inicializarse, así
 * que tiene que ganarles la carrera, y la única forma de conseguirlo es que la
 * inicialización viva en el cuerpo de un módulo IMPORTADO EL PRIMERO.
 *
 * Es el mismo patrón que documenta Sentry como `instrument.js`.
 *
 * NO EXPORTA FUNCIONES
 *
 * Sólo el resultado, para que el arranque pueda anunciarlo. Las funciones para
 * capturar viven en `services/observabilidad.js`, que se puede importar desde
 * donde haga falta sin volver a inicializar nada.
 */

import { iniciarObservabilidad } from './services/observabilidad.js';

export const observabilidad = iniciarObservabilidad();
