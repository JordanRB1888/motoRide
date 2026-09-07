/**
 * Qué lecturas de GPS merecen viajar por la red.
 *
 * MEDIR NO ES ENVIAR
 *
 * Son dos ritmos distintos y conviene no confundirlos. El teléfono mide
 * seguido para que el punto del mapa vaya suave; la red no tiene por qué
 * enterarse de cada una. En una moto en marcha, mandarlas todas gasta la
 * batería y los datos del conductor —que los paga él— y choca contra el
 * limitador del servidor.
 *
 * DE DÓNDE SALE ESTO
 *
 * De `src/utils/locationThrottle.js`, que la aplicación web lleva usando
 * contra el GPS real. No se copió a ojo: hay una prueba que lee aquel fichero
 * y compara los tres números uno a uno. Dos ritmos distintos para el mismo
 * servidor serían dos aplicaciones distintas.
 *
 * TRES REGLAS
 *
 *  1. Nunca más de una cada `INTERVALO_MINIMO_MS`. Suelo duro: va antes que
 *     cualquier otra consideración, para que ninguna combinación de tiempo y
 *     movimiento pueda saltárselo.
 *  2. Por debajo de ese suelo, se envía si de verdad se ha movido.
 *  3. Parado, una señal de vida de vez en cuando, para que el servidor y quien
 *     espera sepan que sigue ahí.
 *
 * No guarda la muestra ni la transforma: sólo responde sí o no. Quien llama
 * conserva el control de lo que manda.
 */

/** El suelo duro entre envíos. */
export const INTERVALO_MINIMO_MS = 2000;

/** Parado, cada cuánto se manda una señal de vida. */
export const LATIDO_MS = 15_000;

/** Por debajo de esto se considera que no se ha movido. */
export const DISTANCIA_MINIMA_M = 10;

const RADIO_TERRESTRE_M = 6_371_000;
const RAD = Math.PI / 180;

/**
 * Distancia aproximada en metros.
 *
 * Aproximación equirectangular y no semiverseno: entre dos muestras
 * consecutivas de GPS el error es despreciable, y esto se ejecuta con cada
 * lectura. Las trigonométricas caras se dejan para donde importan de verdad,
 * que es detectar saltos imposibles.
 */
export function metrosAproximados(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null
): number {
  // Una coordenada ilegible no puede hacer pasar por «quieta» a una moto en
  // marcha: cuenta como distancia infinita, que siempre permite el envío.
  if (a === null || b === null) return Infinity;
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Infinity;

  const latMedia = ((a.lat + b.lat) / 2) * RAD;
  const x = (b.lng - a.lng) * RAD * Math.cos(latMedia);
  const y = (b.lat - a.lat) * RAD;
  return Math.sqrt(x * x + y * y) * RADIO_TERRESTRE_M;
}

export interface ReguladorDeEnvio {
  /** ¿Esta muestra debe salir a la red? */
  readonly debeEnviarse: (punto: { lat: number; lng: number }, ahora?: number) => boolean;
  /** Se llama SÓLO cuando el envío se hizo de verdad. */
  readonly seEnvio: (punto: { lat: number; lng: number }, ahora?: number) => void;
  /** Tras una reconexión conviene volver a mandar la primera muestra. */
  readonly reiniciar: () => void;
}

export function crearReguladorDeEnvio({
  intervaloMinimoMs = INTERVALO_MINIMO_MS,
  latidoMs = LATIDO_MS,
  distanciaMinimaM = DISTANCIA_MINIMA_M
}: {
  intervaloMinimoMs?: number;
  latidoMs?: number;
  distanciaMinimaM?: number;
} = {}): ReguladorDeEnvio {
  let ultimoEnvio: number | null = null;
  let ultimoPunto: { lat: number; lng: number } | null = null;

  return {
    debeEnviarse(punto, ahora = Date.now()) {
      if (punto === null || punto === undefined) return false;
      // La primera siempre viaja: es la que sitúa a quien se mueve.
      if (ultimoEnvio === null) return true;

      const transcurrido = ahora - ultimoEnvio;
      if (transcurrido < intervaloMinimoMs) return false;

      if (metrosAproximados(ultimoPunto, punto) >= distanciaMinimaM) return true;
      return transcurrido >= latidoMs;
    },

    seEnvio(punto, ahora = Date.now()) {
      ultimoEnvio = ahora;
      ultimoPunto = punto;
    },

    reiniciar() {
      ultimoEnvio = null;
      ultimoPunto = null;
    }
  };
}
