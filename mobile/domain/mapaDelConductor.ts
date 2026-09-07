/**
 * Qué enseña el mapa del conductor. Puro, y por eso probable sin emulador.
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * El mapa del conductor no era un mapa: era un dibujo. `LienzoDeMapa` pinta la
 * cuadrícula del recorrido de diseño cuando no recibe `modelo`, y la pantalla
 * del conductor nunca se lo pasaba. Su «ubicación» era la constante
 * `{ x: 48, y: 30 }` —porcentaje de pantalla, no coordenadas— clavada al 48 %
 * del ancho pasara lo que pasara con el GPS.
 *
 * Aquí se traduce el estado real de la ubicación al modelo que Google Maps
 * entiende. No se inventa ninguna posición: sin lectura no hay marcador.
 *
 * LOCAL NO ES RED
 *
 * Esto decide lo que el conductor VE en su teléfono. Que su ubicación salga
 * hacia el servidor lo decide `UbicacionEnVivo`, con la política de siempre:
 * fuera de línea no se publica nada. Ver el marcador propio no publica nada, y
 * por eso funciona esté como esté su disponibilidad.
 */

import { EDAD_MAXIMA_MS, type MuestraDeUbicacion } from './calidadDeUbicacion';
import type { EstadoDeUbicacion, FaseDeUbicacion } from './ubicacion';
import {
  CAMARA_DE_MARACAIBO,
  ZOOM_DE_CIUDAD,
  type Camara,
  type Coordenada,
  type Marcador,
  type ModeloDelMapa
} from '../mapa/modelo';

/**
 * Lo cerca que se mira cuando ya se sabe dónde está.
 *
 * Más cerrado que el de ciudad: quien conduce necesita ver su calle, no la
 * mitad de Maracaibo. Sigue siendo un encuadre de barrio, no de navegación.
 */
export const ZOOM_DEL_CONDUCTOR = ZOOM_DE_CIUDAD / 5;

/**
 * Lo que la pantalla tiene que contarle a la persona sobre su ubicación.
 *
 * Cada uno tiene su mensaje y ninguno deja el mapa roto: el mapa se pinta
 * siempre, y esto es lo que se dice ENCIMA.
 */
export type AvisoDeUbicacion =
  | 'NINGUNO'
  | 'BUSCANDO'
  | 'DENEGADA'
  | 'SIN_SERVICIO'
  | 'ERROR'
  | 'RANCIA';

/** Si una lectura es demasiado vieja para pasar por «dónde estás ahora». */
export function estaRancia(posicion: MuestraDeUbicacion | null, ahora: number): boolean {
  if (posicion === null || posicion.momento === null) return false;
  return ahora - posicion.momento > EDAD_MAXIMA_MS;
}

/**
 * Qué avisar, según la fase.
 *
 * `RANCIA` sólo cuando HAY posición pero envejeció: enseñarla como si fuera
 * de ahora mismo sería mentir, y ocultarla sería peor —es lo único que se
 * sabe—. Se enseña, y se dice que puede no estar al día.
 */
export function avisoDeUbicacion(estado: EstadoDeUbicacion, ahora: number): AvisoDeUbicacion {
  if (estado.fase === 'DENEGADA') return 'DENEGADA';
  if (estado.fase === 'SIN_SERVICIO') return 'SIN_SERVICIO';
  if (estado.fase === 'ERROR') return 'ERROR';
  if (estado.posicion === null) {
    // Sin posición todavía: se está buscando, o aún no se ha preguntado.
    return estado.fase === 'LISTA' ? 'NINGUNO' : 'BUSCANDO';
  }
  return estaRancia(estado.posicion, ahora) ? 'RANCIA' : 'NINGUNO';
}

/** Si el aviso admite reintentar. Denegado no: eso se arregla en ajustes. */
export function sePuedeReintentar(aviso: AvisoDeUbicacion): boolean {
  return aviso === 'ERROR' || aviso === 'SIN_SERVICIO' || aviso === 'RANCIA';
}

export const MENSAJES_DE_UBICACION: Readonly<Record<AvisoDeUbicacion, string | null>> = Object.freeze({
  NINGUNO: null,
  BUSCANDO: 'Buscando tu ubicación…',
  DENEGADA: 'Necesitamos tu ubicación para que puedas trabajar como conductor.',
  SIN_SERVICIO: 'Activa la ubicación del teléfono para que podamos situarte.',
  ERROR: 'No pudimos obtener tu ubicación.',
  RANCIA: 'Tu ubicación puede no estar al día.'
});

/**
 * El marcador de «yo», o ninguno.
 *
 * Una sola clave, `yo`, siempre la misma: es lo que hace que el mapa MUEVA el
 * marcador en vez de añadir uno nuevo en cada lectura y dejar el rastro de los
 * anteriores.
 */
export function marcadorPropio(posicion: MuestraDeUbicacion | null): Marcador | null {
  if (posicion === null) return null;
  return {
    clave: 'yo',
    clase: 'usuario',
    en: { lat: posicion.lat, lng: posicion.lng },
    rumbo: null,
    destacado: true
  };
}

/**
 * La cámara del mapa.
 *
 * `yaCentro` es lo que impide pelearse con quien está mirando el mapa: la
 * primera posición manda una vez, y a partir de ahí la cámara se queda donde
 * la persona la dejó. `MapaDeMovilidad` no mueve nada si la cámara no cambia
 * de identidad, así que devolver la misma referencia es literalmente no
 * tocarla.
 */
export function camaraDelConductor({
  posicion,
  yaCentro,
  anterior
}: {
  readonly posicion: MuestraDeUbicacion | null;
  readonly yaCentro: boolean;
  readonly anterior: Camara;
}): Camara {
  if (posicion === null) return anterior;
  if (yaCentro) return anterior;
  return { centro: { lat: posicion.lat, lng: posicion.lng }, abarca: ZOOM_DEL_CONDUCTOR };
}

/** La cámara que centra AHORA sobre una posición. La del botón de recentrar. */
export function camaraCentradaEn(posicion: MuestraDeUbicacion): Camara {
  return { centro: { lat: posicion.lat, lng: posicion.lng }, abarca: ZOOM_DEL_CONDUCTOR };
}

/**
 * El modelo completo del mapa del conductor.
 *
 * Sin ruta —el trazado sigue pendiente— y sin retícula: el conductor no está
 * eligiendo un punto, está viendo dónde está.
 *
 * Y sin motos de ejemplo. Antes, al conectarse, aparecían dos «motos cerca»
 * inventadas: en una pantalla de trabajo eso es información falsa sobre la
 * competencia, y se retiró.
 */
export function modeloDelMapaDelConductor({
  posicion,
  camara,
  aireInferior = 0,
  ruta = []
}: {
  readonly posicion: MuestraDeUbicacion | null;
  readonly camara: Camara;
  readonly aireInferior?: number;
  /**
   * La geometría de la ruta, trazada por el SERVIDOR. Vacía si no hay.
   *
   * El conductor ve exactamente la misma línea que la pasajera y por el mismo
   * camino: los dos la piden a `/api/trips/:id/route` y el servidor decide el
   * tramo. Dos trazados calculados por separado se habrían separado a la
   * primera corrección.
   */
  readonly ruta?: readonly Coordenada[];
}): ModeloDelMapa {
  const marcador = marcadorPropio(posicion);
  return {
    camara,
    marcadores: marcador === null ? [] : [marcador],
    ruta,
    eligiendoPunto: false,
    aireInferior
  };
}

/** La cámara de partida mientras no se sabe dónde está: la ciudad. */
export const CAMARA_INICIAL_DEL_CONDUCTOR: Camara = CAMARA_DE_MARACAIBO;

/** Las fases en las que todavía se está resolviendo dónde está. */
export function estaBuscando(fase: FaseDeUbicacion): boolean {
  return fase === 'DESCONOCIDA' || fase === 'PIDIENDO_PERMISO' || fase === 'BUSCANDO';
}
