/**
 * Sentry en el teléfono: qué se envía y cuándo no se envía nada.
 *
 * PARA QUÉ
 *
 * Para que cuando alguien que prueba la beta diga «se cerró sola» o «se quedó
 * pensando», exista un evento con la pila, la versión y qué estaba pasando.
 * Sin esto, la única fuente es lo que la persona recuerde, y lo que recuerde
 * será que no funcionó.
 *
 * El precedente está a mano: la beta anterior se cerraba al abrirla por una
 * cadena `'cubic-bezier(...)'` que Reanimated no acepta. Se diagnosticó
 * conectando el teléfono por cable y leyendo `logcat`. Con un tester a
 * distancia eso no es posible.
 *
 * SI NO HAY DSN, NO SE ENCIENDE
 *
 * Ni cola en memoria, ni reintentos, ni un aviso en pantalla. Quien programa no
 * tiene DSN y no debe tenerlo: sus errores ya los ve en la consola de Metro, y
 * mezclarlos con los de la beta llena el proyecto de ruido.
 *
 * NO SE ENCIENDE EN DESARROLLO
 *
 * Aunque hubiera DSN. Un recargado en caliente produce errores que no son
 * fallos, y cada guardado mandaría eventos.
 *
 * QUÉ SALE, Y QUÉ NO
 *
 * El filtro vive en `domain/scrubDeDiagnostico.ts`, sin dependencias y con sus
 * propias pruebas. Aquí sólo se conecta. Nunca salen contraseñas, tokens,
 * códigos, documentos, ni el correo o el teléfono completos; la ubicación va
 * redondeada.
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { limpiarEvento, limpiarValor, type EventoDeDiagnostico } from '../domain/scrubDeDiagnostico';
import { configuracion } from '../config/environment';

/** `true` sólo cuando Metro sirve la aplicación. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

export const VARIABLE_DSN = 'EXPO_PUBLIC_SENTRY_DSN';

/**
 * El DSN, LEÍDO DE FORMA ESTÁTICA. No es un detalle de estilo.
 *
 * Expo sustituye `process.env.EXPO_PUBLIC_ALGO` por su valor en tiempo de
 * compilación, y sólo reconoce esa forma exacta. Un acceso dinámico
 * --`entorno[VARIABLE_DSN]`, que es como estaba escrito la primera vez-- no se
 * sustituye: compila, arranca, y en el teléfono llega `undefined`. El
 * diagnóstico quedaba apagado en el APK sin que nada lo dijera, y sólo se vio
 * al abrir la pantalla de diagnóstico en el dispositivo.
 *
 * La misma trampa está documentada en `config/environment.ts`, que la evita
 * igual. Cualquier variable pública nueva tiene que leerse así.
 */
const DSN_DEL_PAQUETE = process.env.EXPO_PUBLIC_SENTRY_DSN;

let encendido = false;

/**
 * La versión que se etiqueta en cada evento.
 *
 * Sale del manifiesto de Expo, que es lo que de verdad describe al paquete
 * instalado. Sin esto, dos APK distintas se ven iguales en Sentry y no hay
 * forma de decir si un fallo ya estaba corregido en la que tiene la persona.
 */
export function versionDeLaAplicacion(manifiesto = Constants.expoConfig): string | undefined {
  const version = manifiesto?.version;
  if (typeof version !== 'string' || version.trim() === '') return undefined;
  return `plus58express-mobile@${version.trim()}`;
}

export interface ResultadoDeArranque {
  readonly activo: boolean;
  readonly entorno: string;
  readonly version: string | undefined;
  readonly motivo?: string;
}

/**
 * Enciende el diagnóstico si procede. Devuelve qué se hizo, para poder decirlo.
 *
 * Se llama una sola vez, lo más arriba posible, antes de montar la aplicación.
 */
export function iniciarObservabilidad(
  /** Sólo las pruebas pasan otro: en la aplicación manda el valor incrustado. */
  dsnInyectado: string | undefined = DSN_DEL_PAQUETE
): ResultadoDeArranque {
  const dsn = dsnInyectado;
  const ambiente = configuracion.ok ? configuracion.entorno : 'development';
  const version = versionDeLaAplicacion();

  if (EN_DESARROLLO) return { activo: false, entorno: ambiente, version, motivo: 'en desarrollo' };
  if (typeof dsn !== 'string' || dsn.trim() === '') {
    return { activo: false, entorno: ambiente, version, motivo: `sin ${VARIABLE_DSN}` };
  }

  Sentry.init({
    dsn: dsn.trim(),
    environment: ambiente,
    release: version,
    // Errores, no rendimiento. Las trazas son lo que consume la cuota, y en
    // esta fase lo que se busca es por qué se rompió algo.
    tracesSampleRate: 0,
    // NUNCA. Es lo que adjunta la dirección IP y los datos del dispositivo que
    // identifican a una persona.
    sendDefaultPii: false,
    // El nombre de la pantalla, el toque y la petición: es lo que reconstruye
    // «qué estaba haciendo cuando falló». La consola NO, que es por donde se
    // colaría un `console.log` con datos dentro.
    enableCaptureFailedRequests: true,
    beforeSend(evento) {
      try {
        return limpiarEvento(evento as unknown as EventoDeDiagnostico) as never;
      } catch {
        // Si el filtro falla, no se manda. Antes perder un evento que publicar
        // uno sin limpiar.
        return null;
      }
    },
    beforeBreadcrumb(miga) {
      if (miga?.category === 'console') return null;
      try {
        return {
          ...miga,
          message: typeof miga?.message === 'string' ? (limpiarTextoDeMiga(miga.message)) : miga?.message,
          data: miga?.data === undefined ? undefined : (limpiarValor(miga.data) as Record<string, unknown>)
        };
      } catch {
        return null;
      }
    }
  });

  encendido = true;
  return { activo: true, entorno: ambiente, version };
}

function limpiarTextoDeMiga(texto: string): string {
  const limpio = limpiarValor(texto);
  return typeof limpio === 'string' ? limpio : texto;
}

export function observabilidadActiva(): boolean {
  return encendido;
}

/**
 * Quién es quien produce los eventos, sin decir quién es.
 *
 * Sólo el identificador y el rol. Con eso se ve que doce eventos son de la
 * misma persona --que es lo que hace falta para entender un fallo-- sin
 * publicar su correo.
 */
export function identificarUsuario(usuario: { readonly id: string; readonly role: string } | null): void {
  if (!encendido) return;
  Sentry.setUser(usuario === null ? null : { id: usuario.id, role: usuario.role });
}

/** En qué pantalla está. Es la miga que más se mira al abrir un evento. */
export function anotarPantalla(nombre: string): void {
  if (!encendido) return;
  Sentry.addBreadcrumb({ category: 'navigation', level: 'info', message: nombre });
}

/**
 * Una llamada a la API que falló.
 *
 * NO se manda todo: un 401 al abrir la aplicación es la sesión caducada, y un
 * 404 de expediente es que no hay expediente. Ninguno de los dos es un fallo.
 * Lo que interesa es el 5xx --el servidor se rompió-- y la falta de red
 * repetida, que es lo que la persona vive como «no carga».
 */
export function anotarFalloDeApi(datos: {
  readonly ruta: string;
  readonly metodo: string;
  readonly estadoHttp: number | null;
  readonly codigo: string | null;
}): void {
  if (!encendido) return;
  Sentry.addBreadcrumb({
    category: 'http',
    level: 'warning',
    message: `${datos.metodo} ${datos.ruta.split('?')[0]}`,
    data: { estado: datos.estadoHttp ?? 'sin respuesta', codigo: datos.codigo ?? '' }
  });
}

/** Un fallo que merece un evento, con su contexto ya limpio. */
export function capturarExcepcion(error: unknown, contexto: {
  readonly etiquetas?: Record<string, string>;
  readonly extra?: Record<string, unknown>;
} = {}): void {
  if (!encendido) return;
  Sentry.withScope(alcance => {
    if (contexto.etiquetas) {
      for (const [clave, valor] of Object.entries(contexto.etiquetas)) alcance.setTag(clave, String(valor));
    }
    if (contexto.extra) alcance.setExtras(limpiarValor(contexto.extra) as Record<string, unknown>);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

/** Un fallo del tiempo real, etiquetado para poder filtrarlo aparte. */
export function capturarFalloDeSocket(error: unknown, evento: string, extra?: Record<string, unknown>): void {
  capturarExcepcion(error, { etiquetas: { area: 'realtime', evento }, extra });
}

export { Sentry };
