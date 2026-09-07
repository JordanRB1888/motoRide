/**
 * Preguntar una vez aunque pregunten cinco.
 *
 * EL PROBLEMA
 *
 * Varias pantallas quieren el mismo dato al mismo tiempo. Si cada una llama por
 * su cuenta, al abrir la aplicación salen tres o cuatro peticiones idénticas en
 * el mismo segundo, por una red móvil que se paga por megas.
 *
 * DOS MECANISMOS, Y NO SON LO MISMO
 *
 *   1. Fundir lo que está en vuelo. Si ya hay una pregunta hecha y sin
 *      responder, quien llegue después espera esa misma respuesta. Esto no
 *      caduca ni se puede desactivar: dos peticiones simultáneas al mismo
 *      sitio son siempre una de más.
 *
 *   2. Un margen de gracia corto. Durante unos segundos, volver a preguntar
 *      devuelve lo último que respondió el servidor. Sirve para el montaje de
 *      varias pantallas seguidas, no para ahorrarse el siguiente minuto.
 *
 * LO QUE FALLA NO SE RECUERDA
 *
 * Quien usa esto decide qué respuestas merecen guardarse. Una caída de red no
 * puede quedarse en memoria haciéndose pasar por un dato: el siguiente que
 * pregunte tiene que volver a intentarlo.
 *
 * ESTO NO ES AUTORIDAD
 *
 * Es una optimización del teléfono. Nada de lo que se guarde aquí decide nada:
 * quien decide es el servidor, y por eso `forzar` salta el margen sin discusión.
 * Vive en la memoria de este proceso y se pierde al cerrar la aplicación, que
 * es exactamente lo que se quiere de algo que sólo ahorra peticiones.
 */

export interface OpcionesDeConsulta {
  /** Salta el margen de gracia. NO deja de fundirse con lo que ya vuela. */
  readonly forzar?: boolean;
}

export interface ConsultaCoalescida<T> {
  readonly consultar: (opciones?: OpcionesDeConsulta) => Promise<T>;
  /** Lo guardado deja de valer. La siguiente consulta pregunta de verdad. */
  readonly invalidar: () => void;
  /** Como recién creada: sin nada guardado y sin nada en vuelo. */
  readonly reiniciar: () => void;
}

export function crearConsultaCoalescida<T>({
  leer,
  seGuarda = () => true,
  ahora = () => Date.now(),
  graciaMs = 10_000
}: {
  readonly leer: () => Promise<T>;
  /** Qué respuestas merecen recordarse. Por omisión, todas. */
  readonly seGuarda?: (resultado: T) => boolean;
  readonly ahora?: () => number;
  readonly graciaMs?: number;
}): ConsultaCoalescida<T> {
  let enVuelo: Promise<T> | null = null;
  let ultima: { readonly resultado: T; readonly en: number } | null = null;

  const consultar = (opciones: OpcionesDeConsulta = {}): Promise<T> => {
    // Lo primero, siempre: si ya se está preguntando, esta es la misma pregunta.
    if (enVuelo !== null) return enVuelo;

    if (!opciones.forzar && ultima !== null && ahora() - ultima.en < graciaMs) {
      return Promise.resolve(ultima.resultado);
    }

    const peticion = leer()
      .then(resultado => {
        if (seGuarda(resultado)) ultima = { resultado, en: ahora() };
        return resultado;
      })
      .finally(() => {
        // Sólo el dueño de la petición la retira: si otra ya ocupó el hueco,
        // esta no puede borrarla al terminar tarde.
        if (enVuelo === peticion) enVuelo = null;
      });

    enVuelo = peticion;
    return peticion;
  };

  return {
    consultar,
    invalidar: () => { ultima = null; },
    reiniciar: () => { ultima = null; enVuelo = null; }
  };
}
