/**
 * Sentry en el servidor: qué se envía, con qué etiquetas, y cuándo no se envía.
 *
 * PARA QUÉ ESTÁ
 *
 * Para que un fallo en el teléfono de alguien que prueba la beta llegue aquí
 * con lo suficiente para entenderlo. Sin esto, la única señal de que algo se
 * rompió es que la persona se acuerde de contarlo, y lo que cuente será «no me
 * dejó pedir el viaje».
 *
 * SI NO HAY DSN, NO PASA NADA
 *
 * Ni excepción al arrancar, ni intento de conectar, ni cola de eventos en
 * memoria. El servidor tiene que arrancar igual en el portátil de quien
 * programa, donde no hay ni debe haber DSN. Se dice en el arranque y se sigue.
 *
 * EL ENTORNO SE DECLARA, NO SE ADIVINA
 *
 * `SENTRY_ENVIRONMENT` manda. Si falta, se deriva del nombre del entorno de
 * Railway. Nunca se supone «production» por defecto: mezclar los errores de la
 * beta con los de producción hace inútiles los dos.
 *
 * LO QUE SALE ESTÁ FILTRADO EN EL DOMINIO
 *
 * `domain/scrubDeDiagnostico.js`, que se prueba sin red. Aquí sólo se conecta.
 */

import * as Sentry from '@sentry/node';

import { limpiarEvento } from '../domain/scrubDeDiagnostico.js';

let encendido = false;

/**
 * De dónde sale la versión que se etiqueta en cada evento.
 *
 * Railway expone el SHA del commit cuando despliega desde Git. Con `railway up`
 * desde el portátil no hay ninguno, así que se admite darlo a mano: sin
 * versión, dos despliegues distintos se ven iguales en Sentry y no se puede
 * decir si un fallo ya estaba arreglado.
 */
export function versionDelServidor(entorno = process.env) {
  const explicita = entorno.SENTRY_RELEASE || entorno.APP_RELEASE;
  if (typeof explicita === 'string' && explicita.trim() !== '') return explicita.trim();
  const commit = entorno.RAILWAY_GIT_COMMIT_SHA;
  if (typeof commit === 'string' && commit.trim() !== '') return `plus58express-server@${commit.trim().slice(0, 7)}`;
  return undefined;
}

/** El entorno declarado, o el de Railway, o `development`. Nunca producción por descarte. */
export function entornoDeclarado(entorno = process.env) {
  const explicito = entorno.SENTRY_ENVIRONMENT;
  if (typeof explicito === 'string' && explicito.trim() !== '') return explicito.trim();
  const railway = entorno.RAILWAY_ENVIRONMENT_NAME;
  if (typeof railway === 'string' && railway.trim() !== '') return railway.trim();
  return 'development';
}

/**
 * Enciende Sentry si hay DSN. Devuelve qué se hizo, para poder anunciarlo.
 *
 * @returns {{ activo: boolean, entorno: string, version: string|undefined, motivo?: string }}
 */
export function iniciarObservabilidad(entorno = process.env) {
  const dsn = entorno.SENTRY_DSN;
  const ambiente = entornoDeclarado(entorno);
  const version = versionDelServidor(entorno);

  if (typeof dsn !== 'string' || dsn.trim() === '') {
    return { activo: false, entorno: ambiente, version, motivo: 'sin SENTRY_DSN' };
  }

  Sentry.init({
    dsn: dsn.trim(),
    environment: ambiente,
    release: version,
    // Sin trazas de rendimiento en esta fase: lo que se busca son errores, y
    // el muestreo de trazas es lo que consume la cuota gratuita.
    tracesSampleRate: 0,
    // NUNCA. Es lo que mete cabeceras, cookies y cuerpos de petición en el
    // evento; aquí se añade a mano lo poco que se permite.
    sendDefaultPii: false,
    beforeSend(evento) {
      try {
        return limpiarEvento(evento);
      } catch {
        // Si el filtro falla, no se envía. Es preferible perder un evento a
        // publicar uno sin limpiar.
        return null;
      }
    },
    beforeBreadcrumb(miga) {
      // Las migas de consola repiten lo que ya se ve en los registros de
      // Railway y son la vía más fácil de que un `console.log` con datos
      // acabe en Sentry.
      if (miga?.category === 'console') return null;
      return miga;
    }
  });

  encendido = true;
  return { activo: true, entorno: ambiente, version };
}

/** `true` si hay un cliente vivo al que mandar. */
export function observabilidadActiva() {
  return encendido;
}

/**
 * Manda una excepción con su contexto.
 *
 * El contexto pasa por el mismo filtro que todo lo demás: quien llama no tiene
 * que acordarse de limpiar.
 */
export function capturarExcepcion(error, contexto = {}) {
  if (!encendido) return;
  Sentry.withScope(alcance => {
    const { usuario, etiquetas, extra } = contexto;
    if (usuario?.id) alcance.setUser({ id: usuario.id, role: usuario.role });
    if (etiquetas) for (const [clave, valor] of Object.entries(etiquetas)) alcance.setTag(clave, String(valor));
    if (extra) alcance.setExtras(extra);
    Sentry.captureException(error);
  });
}

/**
 * Un fallo del tiempo real.
 *
 * Va aparte porque su contexto es otro --el evento del socket, el rol, si había
 * viaje-- y porque conviene poder filtrarlos en Sentry por la etiqueta
 * `area: realtime`: cuando un tester dice «se quedó pensando», es aquí donde
 * hay que mirar primero.
 */
export function capturarFalloDeSocket(error, { evento, usuario, extra } = {}) {
  capturarExcepcion(error, {
    usuario,
    etiquetas: { area: 'realtime', evento: evento ?? 'desconocido' },
    extra
  });
}

/** Espera a que salga lo pendiente. Para el apagado ordenado. */
export async function vaciarObservabilidad(msMaximos = 2000) {
  if (!encendido) return true;
  return Sentry.flush(msMaximos);
}

export { Sentry };
