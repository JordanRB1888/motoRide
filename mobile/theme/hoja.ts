/**
 * Las medidas de la hoja inferior.
 *
 * Están aquí y no dentro del componente porque son una decisión del sistema de
 * diseño —cuánto mapa se ve mientras se pide un viaje—, no un detalle de cómo
 * se pinta. Separarlas tiene dos ventajas concretas: el generador de evidencia
 * puede leer los mismos números que usa el teléfono en lugar de repetirlos a
 * mano, y las pruebas pueden comprobarlos sin arrancar React Native.
 */

export const ESTADOS_DE_HOJA = ['baja', 'media', 'alta'] as const;
export type EstadoDeHoja = (typeof ESTADOS_DE_HOJA)[number];

/**
 * Cuánto alto de pantalla ocupa la hoja en cada estado.
 *
 * `alta` se queda en 0,62, y el número salió de mirarlo en pantalla. Estaba en
 * 0,72, que sobre el papel dejaba «casi un tercio de mapa»; en el teléfono no
 * es así, porque la barra de navegación se lleva otros 80 puntos por debajo. Lo
 * que quedaba era una franja donde ya no cabía ni el vehículo más cercano.
 *
 * Con 0,62 quedan unos 240 puntos de mapa con la hoja abierta del todo:
 * suficiente para ver dónde estás y qué se mueve alrededor, que es la razón de
 * que el mapa esté ahí.
 */
export const FRACCION_POR_ESTADO: Readonly<Record<EstadoDeHoja, number>> = Object.freeze({
  baja: 0.26,
  media: 0.46,
  alta: 0.62
});

/** El alto de la hoja en puntos, dado el alto de pantalla. */
export function altoDeHoja(estado: EstadoDeHoja, altoDePantalla: number): number {
  return Math.round(altoDePantalla * FRACCION_POR_ESTADO[estado]);
}

/** El siguiente estado al tocar el asa. Da la vuelta al llegar arriba. */
export function siguienteEstadoDeHoja(estado: EstadoDeHoja): EstadoDeHoja {
  return estado === 'baja' ? 'media' : estado === 'media' ? 'alta' : 'baja';
}
