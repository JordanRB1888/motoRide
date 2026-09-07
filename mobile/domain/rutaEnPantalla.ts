/**
 * Cuándo volver a pedir la ruta, y qué enseñar mientras tanto.
 *
 * Función pura y sin reloj propio: el momento entra por parámetro. Es lo que
 * permite comprobar el ritmo de las peticiones sin esperar segundos de verdad.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * La posición del conductor llega por socket cada pocos segundos. Pedir la ruta
 * con cada una serían cientos de llamadas de pago por carrera para redibujar
 * exactamente lo mismo: mientras la moto avanza POR la ruta que ya tiene, esa
 * ruta sigue siendo correcta. Lo único que sobra es el trozo ya recorrido, y
 * ese se ve igual con la moto encima.
 *
 * TRES FRENOS, Y CADA UNO ATAJA UNA COSA DISTINTA
 *
 *   1. EL TRAMO. Si cambia de «voy a buscarla» a «la llevo», la ruta anterior
 *      ya no vale por cerca que esté la moto. Se pide siempre.
 *   2. LA DISTANCIA. Doscientos metros desde el punto donde se trazó. Por
 *      debajo, en ciudad, sigues en la misma vía: lo que se mueve es el
 *      marcador, no el recorrido.
 *   3. EL TIEMPO. Un mínimo entre llamadas, para que un GPS nervioso —o un
 *      conductor en una autopista— no dispare una petición por segundo aunque
 *      pase el filtro de la distancia.
 *
 * MIENTRAS LLEGA LA NUEVA, SE CONSERVA LA VIEJA
 *
 * `REFRESCANDO` no es «sin ruta». Una pantalla que se queda en blanco cada vez
 * que el conductor dobla una esquina es peor que una ruta con dos segundos de
 * retraso. Sólo se borra cuando el servidor dice que ya no hay tramo.
 */

import type { PuntoDeRuta, RespuestaDeRuta, TramoDeRuta } from './rutaDelViaje';

/** Doscientos metros: donde un desvío deja de ser ruido del GPS. */
export const UMBRAL_DE_RECALCULO_METROS = 200;

/**
 * Lo mínimo entre dos peticiones, aunque la distancia lo justifique.
 *
 * Ocho segundos. A cincuenta por hora son unos ciento diez metros, así que en
 * marcha normal manda la distancia y esto no estorba; lo que ataja es el caso
 * raro —GPS saltando, o velocidad de autopista— donde sin freno de tiempo
 * saldrían varias llamadas seguidas.
 */
export const ESPERA_MINIMA_MS = 8_000;

/** Cuándo una ruta deja de ser fresca y conviene decirlo, sin borrarla. */
export const CADUCIDAD_MS = 90_000;

export interface RutaVigente {
  readonly tramo: TramoDeRuta;
  readonly puntos: readonly PuntoDeRuta[];
  /** Desde dónde se trazó. Es contra esto que se mide el desvío. */
  readonly desde: PuntoDeRuta;
  readonly pedidaEn: number;
}

export type EstadoDeRuta =
  | { readonly clase: 'SIN_RUTA'; readonly motivo: string | null }
  | { readonly clase: 'TRAZADA'; readonly ruta: RutaVigente; readonly vieja: boolean }
  | { readonly clase: 'REFRESCANDO'; readonly ruta: RutaVigente };

/**
 * ¿Toca pedir la ruta otra vez?
 *
 * @param vigente     la que se está dibujando, o `null`
 * @param tramo       el tramo que toca ahora, o `null` si el estado no tiene
 * @param conductorEn dónde está la moto ahora, o `null` si no se sabe
 * @param ahora       milisegundos
 */
export function tocaPedirRuta(
  vigente: RutaVigente | null,
  tramo: TramoDeRuta | null,
  conductorEn: PuntoDeRuta | null,
  ahora: number
): boolean {
  // Sin tramo no hay nada que pedir: al llegar y al terminar no hay ruta.
  if (tramo === null) return false;
  if (vigente === null) return true;
  // Cambiar de tramo manda sobre todo lo demás, incluido el freno de tiempo:
  // al pulsar INICIAR la moto no se ha movido, pero hay que dibujar otra cosa.
  if (vigente.tramo !== tramo) return true;

  if (ahora - vigente.pedidaEn < ESPERA_MINIMA_MS) return false;
  if (conductorEn === null) return false;

  return metrosEntre(vigente.desde, conductorEn) > UMBRAL_DE_RECALCULO_METROS;
}

/**
 * Qué enseñar, dado lo que hay y lo que dijo el servidor.
 *
 * `respuesta` es `null` cuando la petición no llegó a contestar —sin red—. Ahí
 * se conserva la ruta anterior: es la mejor información que se tiene, y
 * borrarla castigaría a quien va en la moto por un bache de cobertura.
 */
export function estadoDeLaRuta(
  vigente: RutaVigente | null,
  respuesta: RespuestaDeRuta | null,
  ahora: number,
  pidiendo = false
): EstadoDeRuta {
  if (pidiendo && vigente !== null) return { clase: 'REFRESCANDO', ruta: vigente };

  // Sin respuesta: no se sabe nada nuevo. Se conserva lo que había.
  if (respuesta === null) {
    return vigente === null
      ? { clase: 'SIN_RUTA', motivo: null }
      : { clase: 'TRAZADA', ruta: vigente, vieja: ahora - vigente.pedidaEn > CADUCIDAD_MS };
  }

  // El servidor dice que no hay ruta: entonces NO hay, y se retira. Es la
  // diferencia con el caso de arriba: aquí sí se sabe algo nuevo.
  if (!respuesta.disponible) return { clase: 'SIN_RUTA', motivo: respuesta.motivo };

  const ruta: RutaVigente = {
    tramo: respuesta.tramo,
    puntos: respuesta.puntos,
    desde: respuesta.puntos[0]!,
    pedidaEn: ahora
  };
  return { clase: 'TRAZADA', ruta, vieja: false };
}

/** Los puntos que van al mapa. Vacío es «no dibujes nada». */
export function puntosParaElMapa(estado: EstadoDeRuta): readonly PuntoDeRuta[] {
  return estado.clase === 'SIN_RUTA' ? [] : estado.ruta.puntos;
}

/** Haversine. Igual que la del servidor, para que los dos umbrales coincidan. */
export function metrosEntre(a: PuntoDeRuta, b: PuntoDeRuta): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
