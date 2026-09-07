/**
 * Qué tramo cubre la ruta en cada momento del viaje.
 *
 * Función pura: entra el viaje y dónde está el conductor, sale de dónde a dónde
 * hay que trazar —o que no hay que trazar nada—. Sin red, sin estado, sin reloj.
 *
 * LOS CUATRO MOMENTOS, Y POR QUÉ CADA UNO ES DISTINTO
 *
 *   DRIVER_ASSIGNED  La moto viene. El tramo es CONDUCTOR → RECOGIDA, y es el
 *                    único que le importa a las dos partes: la pasajera quiere
 *                    saber cuánto falta para que llegue y el conductor por
 *                    dónde ir a buscarla.
 *
 *   ARRIVED          Ya está abajo. Aquí NO hay tramo, y es deliberado: la
 *                    ruta hasta la recogida ya no significa nada —la moto está
 *                    en la puerta— y la ruta hasta el destino todavía no ha
 *                    empezado. Dibujar cualquiera de las dos sería decir algo
 *                    que no está pasando. El mapa conserva los marcadores.
 *
 *   IN_PROGRESS      Van en camino. El tramo es CONDUCTOR → DESTINO, y se traza
 *                    desde donde está la moto, no desde la recogida: a mitad de
 *                    carrera lo que falta es lo que falta, no el trayecto
 *                    entero. Sin posición del conductor cae a RECOGIDA →
 *                    DESTINO, que es la ruta del viaje y no una invención.
 *
 *   COMPLETED        Se acabó. Sin tramo. Un viaje cerrado no tiene ruta activa
 *   CANCELLED        que enseñar, y dejarla puesta haría creer que sigue vivo.
 *
 * LO QUE FALTA NO SE RELLENA
 *
 * Un viaje puede no traer coordenadas —quien lo pidió escribió la dirección a
 * mano— y la posición del conductor puede no haber llegado todavía. En los dos
 * casos se devuelve «sin tramo» en vez de inventar un extremo. Es la misma
 * regla que ya sigue el mapa del móvil.
 */

import { normalizeTripStatus, TRIP_STATUS } from './tripStateMachine.js';

/** Por qué no hay ruta, cuando no la hay. Para que la pantalla pueda decirlo. */
export const SIN_RUTA = Object.freeze({
  /** El estado del viaje no tiene tramo que enseñar (ARRIVED, terminal…). */
  ESTADO: 'NO_ROUTE_FOR_STATE',
  /** Falta una coordenada: la recogida, el destino o la moto. */
  SIN_COORDENADAS: 'NO_ROUTE_COORDINATES'
});

/** Una coordenada utilizable de verdad. `0,0` es el Golfo de Guinea, no un dato. */
export function esCoordenada(punto) {
  return Boolean(punto)
    && Number.isFinite(punto.lat) && Number.isFinite(punto.lng)
    && punto.lat >= -90 && punto.lat <= 90
    && punto.lng >= -180 && punto.lng <= 180
    && !(punto.lat === 0 && punto.lng === 0);
}

/**
 * El tramo que hay que trazar, o el motivo de que no haya ninguno.
 *
 * @param {object} viaje  el Trip del servidor
 * @param {{lat:number,lng:number}|null} conductorEn  última posición aceptada
 * @returns {{ok:true, tramo:'A_RECOGIDA'|'A_DESTINO', origen, destino}
 *          |{ok:false, motivo:string}}
 */
export function tramoDeLaRuta(viaje, conductorEn = null) {
  const estado = normalizeTripStatus(viaje?.status);

  const recogida = puntoDe(viaje?.pickup ?? viaje?.origin);
  const destino = puntoDe(viaje?.destination ?? viaje?.dropoff);
  const moto = esCoordenada(conductorEn) ? conductorEn : null;

  if (estado === TRIP_STATUS.DRIVER_ASSIGNED) {
    if (moto === null || recogida === null) return { ok: false, motivo: SIN_RUTA.SIN_COORDENADAS };
    return { ok: true, tramo: 'A_RECOGIDA', origen: moto, destino: recogida };
  }

  if (estado === TRIP_STATUS.IN_PROGRESS) {
    // Desde donde está la moto si se sabe; si no, desde la recogida. Las dos
    // son ciertas: la segunda es la ruta del viaje, no una posición inventada.
    const desde = moto ?? recogida;
    if (desde === null || destino === null) return { ok: false, motivo: SIN_RUTA.SIN_COORDENADAS };
    return { ok: true, tramo: 'A_DESTINO', origen: desde, destino };
  }

  // ARRIVED y los terminales. Ninguno tiene tramo, por las razones de arriba.
  return { ok: false, motivo: SIN_RUTA.ESTADO };
}

function puntoDe(bruto) {
  if (!bruto) return null;
  const punto = { lat: Number(bruto.lat ?? bruto.latitude), lng: Number(bruto.lng ?? bruto.longitude) };
  return esCoordenada(punto) ? punto : null;
}

/**
 * Cuánto tiene que moverse el conductor para que valga la pena pedir otra ruta.
 *
 * DOSCIENTOS METROS, Y POR QUÉ
 *
 * El GPS del conductor llega cada pocos segundos. Pedir una ruta nueva con cada
 * uno serían cientos de llamadas de pago por carrera para redibujar lo mismo:
 * mientras la moto avanza POR la ruta que ya tiene, esa ruta sigue siendo
 * correcta —sólo sobra el trozo que ya recorrió, y ese trozo se ve igual con la
 * moto encima—.
 *
 * Doscientos metros es la distancia a la que un desvío deja de ser ruido del
 * GPS y pasa a ser otra calle. Por debajo, en ciudad, sigues en la misma vía.
 *
 * El umbral se mide contra el punto DESDE EL QUE SE TRAZÓ la ruta vigente, no
 * contra la ruta entera: es un cálculo de una resta, no de una proyección sobre
 * cuatrocientos segmentos, y responde a la misma pregunta.
 */
export const UMBRAL_DE_RECALCULO_METROS = 200;

/**
 * ¿Hay que volver a pedir la ruta?
 *
 * Se pide de nuevo cuando cambia el tramo —de ir a buscarla a llevarla—, cuando
 * el destino del tramo cambia, o cuando el origen se ha alejado más del umbral.
 * En cualquier otro caso la ruta vigente sirve, y no se llama.
 */
export function hayQueRecalcular(vigente, tramo, umbralMetros = UMBRAL_DE_RECALCULO_METROS) {
  if (!vigente) return true;
  if (vigente.tramo !== tramo.tramo) return true;
  if (metrosEntre(vigente.destino, tramo.destino) > umbralMetros) return true;
  return metrosEntre(vigente.origen, tramo.origen) > umbralMetros;
}

/** Haversine. La misma regla que ya usa `tripMetrics`, sin duplicar su factor. */
export function metrosEntre(a, b) {
  if (!esCoordenada(a) || !esCoordenada(b)) return Infinity;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
