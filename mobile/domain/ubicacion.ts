/**
 * En qué punto está la ubicación del dispositivo.
 *
 * ESTADOS TÉCNICOS, NO ESTADOS DEL VIAJE
 *
 * Aquí sólo se habla del GPS: si hay permiso, si el sistema lo tiene
 * encendido, si ya llegó una lectura. El viaje tiene su propia máquina en
 * `domain/viajeActivo.ts` y las dos no se mezclan: un viaje puede estar en
 * curso con el GPS denegado, y puede haber GPS perfecto sin ningún viaje.
 *
 * Mezclarlas obligaría a cada pantalla a saber de las dos para entender
 * cualquiera de ellas.
 *
 * ESTAR FUERA DE MARACAIBO NO ES UN FALLO DEL GPS
 *
 * Es la distinción que más cuesta y la que más se agradece. Un GPS que
 * funciona perfectamente puede decir que estás en Caracas. Eso no es un error:
 * es una respuesta correcta a la que la aplicación tiene que reaccionar
 * distinto —«no damos servicio ahí» y no «no encontramos tu ubicación»—.
 *
 * Por eso `fueraDelArea` viaja aparte del estado, y nunca lo convierte en
 * `ERROR`.
 */

import { dentroDelArea } from '../mapa/modelo';
import type { MuestraDeUbicacion } from './calidadDeUbicacion';

/**
 * DESCONOCIDA      todavía no se preguntó nada
 * PIDIENDO_PERMISO el sistema está enseñando su diálogo
 * DENEGADA         dijo que no; no se vuelve a insistir solo
 * SIN_SERVICIO     dio permiso pero la ubicación del teléfono está apagada
 * BUSCANDO         hay permiso y se espera la primera lectura
 * LISTA            hay una posición aceptada
 * ERROR            el sistema falló al entregarla
 */
export type FaseDeUbicacion =
  | 'DESCONOCIDA'
  | 'PIDIENDO_PERMISO'
  | 'DENEGADA'
  | 'SIN_SERVICIO'
  | 'BUSCANDO'
  | 'LISTA'
  | 'ERROR';

export interface EstadoDeUbicacion {
  readonly fase: FaseDeUbicacion;
  /** La última posición aceptada. Sobrevive a un fallo posterior. */
  readonly posicion: MuestraDeUbicacion | null;
  /**
   * Si la última posición cae fuera de la zona de servicio.
   *
   * `null` mientras no hay posición. NO es un error: el GPS acertó.
   */
  readonly fueraDelArea: boolean | null;
  /** Para diagnóstico. Nunca lleva coordenadas. */
  readonly motivo: string | null;
}

export const UBICACION_INICIAL: EstadoDeUbicacion = Object.freeze({
  fase: 'DESCONOCIDA',
  posicion: null,
  fueraDelArea: null,
  motivo: null
});

/**
 * El estado tras aceptar una posición.
 *
 * Se calcula aquí y no en el componente para que la regla de «fuera del área
 * no es un error» viva en un solo sitio y se pueda probar sin montar React.
 */
export function conPosicion(posicion: MuestraDeUbicacion): EstadoDeUbicacion {
  return {
    fase: 'LISTA',
    posicion,
    fueraDelArea: !dentroDelArea({ lat: posicion.lat, lng: posicion.lng }),
    motivo: null
  };
}

/**
 * El estado tras un fallo, CONSERVANDO la última posición conocida.
 *
 * Si el GPS pierde señal en un túnel, el punto no debe desaparecer del mapa:
 * la última posición sigue siendo la mejor respuesta que hay a «dónde estás».
 * Lo mismo que hace el viaje activo cuando falla una resincronización.
 */
export function alFallar(
  estado: EstadoDeUbicacion,
  fase: 'DENEGADA' | 'SIN_SERVICIO' | 'ERROR',
  motivo: string
): EstadoDeUbicacion {
  return {
    fase,
    posicion: estado.posicion,
    fueraDelArea: estado.fueraDelArea,
    motivo
  };
}

/**
 * ¿Merece la pena volver a preguntar por el permiso?
 *
 * Sólo cuando nunca se preguntó. Si el usuario dijo que no, insistir en cada
 * arranque es acoso: el sistema además deja de enseñar el diálogo y el
 * segundo intento no pregunta a nadie, sólo vuelve a decir que no.
 */
export function puedePedirPermiso(estado: EstadoDeUbicacion): boolean {
  return estado.fase === 'DESCONOCIDA';
}

/**
 * ¿Hay algo que enseñar en el mapa?
 *
 * Basta con tener posición: aunque el estado sea `ERROR` porque la última
 * lectura falló, la anterior sigue diciendo dónde estabas.
 */
export function hayPosicion(estado: EstadoDeUbicacion): boolean {
  return estado.posicion !== null;
}
