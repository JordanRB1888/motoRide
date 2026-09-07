/**
 * De lo que el backend dice a lo que la pantalla pinta.
 *
 * POR QUÉ ESTE FICHERO EXISTE
 *
 * Los componentes visuales no deben saber que existe `EN_ROUTE`, ni que
 * `IN_TRIP` es lo mismo que `IN_PROGRESS`, ni que el servidor llama `pickup` al
 * origen. Todo eso es historia del backend, y meterla dentro de una pantalla la
 * ata a esa historia para siempre.
 *
 * Aquí se traduce una vez: entra un viaje del servidor, sale lo que `C2Viaje`
 * necesita. La pantalla recibe textos ya decididos y no toma ninguna decisión
 * de negocio.
 *
 * LO QUE EL BACKEND NO DA, NO SE PINTA
 *
 * El diseño tiene sitio para «llega en 4 min». **El backend no calcula ningún
 * tiempo de llegada**: `durationMin` es lo que se estima que dure el viaje
 * entero, no lo que falta para que el conductor aparezca. Usarlo como ETA sería
 * enseñar un número que no significa lo que parece.
 *
 * Así que sin ETA, el hueco se queda vacío. Está declarado en el informe.
 */

import type { DetalleReal } from './viajes';

/** El tipo de vehículo, como lo entiende la pantalla de búsqueda. */
export type TipoParaLaPantalla = 'MOTO' | 'AUTO';

/**
 * Lo que `C2Viaje` necesita para pintarse.
 *
 * Plano y sin nada del backend: ni estados, ni alias, ni nombres de campos del
 * servidor. Todo son textos ya resueltos.
 */
export interface DatosDelViajeEnCurso {
  /** El titular: «En camino», «Tu conductor llegó», «Viaje en curso». */
  readonly estado: string;
  /**
   * Lo que va donde el diseño pone «llega en 4 min».
   *
   * `null` cuando no hay nada que decir ahí. Hoy es SIEMPRE `null` en camino
   * —el backend no da tiempo de llegada— y lleva texto en `ARRIVED`.
   */
  readonly aclaracion: string | null;
  readonly conductor: string;
  readonly iniciales: string;
  /** «Bera SBR · AB123CD», o sólo lo que haya. */
  readonly vehiculo: string;
  /** La valoración del conductor, o `null` si el servidor no la da. */
  readonly valoracion: string | null;
  readonly origen: string;
  readonly destino: string;
}

/**
 * El copy de cada estado.
 *
 * `ARRIVED` es la variante que faltaba, y se resuelve aquí: mismo layout, otro
 * texto. Lo que NO puede pasar es que diga «En camino» cuando el conductor ya
 * está esperando abajo.
 */
const TITULAR: Readonly<Record<string, string>> = Object.freeze({
  DRIVER_ASSIGNED: 'En camino',
  ARRIVED: 'Tu conductor llegó',
  IN_PROGRESS: 'Viaje en curso'
});

/**
 * La aclaración que acompaña al titular.
 *
 * Sólo `ARRIVED` la tiene. En los otros dos el hueco queda vacío porque no hay
 * nada verdadero que poner: el backend no da tiempo de llegada ni de trayecto
 * restante.
 */
const ACLARACION: Readonly<Record<string, string | null>> = Object.freeze({
  DRIVER_ASSIGNED: null,
  ARRIVED: 'Ya está en el punto de recogida',
  IN_PROGRESS: null
});

const inicialesDeNombre = (nombre: string): string =>
  nombre
    .split(' ')
    .map(parte => parte.trim().charAt(0).toUpperCase())
    .filter(letra => letra !== '')
    .slice(0, 2)
    .join('');

/**
 * Traduce el viaje activo a lo que pinta `C2Viaje`.
 *
 * Devuelve `null` cuando el estado no corresponde a esta pantalla —`SEARCHING`,
 * o un terminal— en vez de inventar un titular. Quien llama decide qué hacer
 * con ese `null`; aquí no se adivina.
 */
export function datosDelViaje(viaje: DetalleReal): DatosDelViajeEnCurso | null {
  const titular = TITULAR[viaje.estado];
  if (titular === undefined) return null;

  const conductor = viaje.conductor;
  const nombre = conductor?.nombre ?? '';

  return {
    estado: titular,
    aclaracion: ACLARACION[viaje.estado] ?? null,
    conductor: nombre,
    iniciales: inicialesDeNombre(nombre),
    // Marca, modelo y placa, con lo que haya. Sin conductor asignado no hay
    // vehículo que enseñar, y la línea se queda vacía en vez de decir «Moto ·».
    vehiculo: conductor === null
      ? ''
      : [conductor.vehiculo, conductor.placa].filter(parte => parte !== '').join(' · '),
    valoracion: conductor?.valoracion ?? null,
    origen: viaje.origen,
    destino: viaje.destino
  };
}

/**
 * Qué vehículo se está buscando.
 *
 * El servidor dice `MOTO` o `CAR`; la pantalla habla de `MOTO` y `AUTO`. La
 * traducción vive aquí y no en el componente.
 */
export function tipoQueSeBusca(viaje: DetalleReal): TipoParaLaPantalla {
  return viaje.tipoDeVehiculo === 'CAR' ? 'AUTO' : 'MOTO';
}

/**
 * `true` si este estado se pinta con `C2Viaje`.
 *
 * Los tres que comparten pantalla. `SEARCHING` tiene la suya y los terminales
 * ya no son un viaje activo.
 */
export function usaLaPantallaDelViaje(estado: string): boolean {
  return TITULAR[estado] !== undefined;
}
