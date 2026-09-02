/**
 * Dónde opera +58Express.
 *
 * POR QUÉ ES UNA LISTA CERRADA
 *
 * El servidor guarda la ciudad y la región como texto libre. Con un campo
 * abierto llegan «mcbo», «Maracaibo Zulia», «maracaibo.» y una docena más de
 * variantes de la misma ciudad, y entonces administración no puede filtrar las
 * solicitudes por zona ni saber cuántos conductores hay en cada sitio.
 *
 * Con dos municipios, ofrecer una lista y mandar el valor exacto cuesta lo
 * mismo y evita ese problema desde el primer día.
 *
 * Cuando se abra otra ciudad, se añade aquí y aparece sola en la postulación.
 */

export interface RegionCubierta {
  readonly region: string;
  readonly ciudades: readonly string[];
}

/** Maracaibo y el municipio Mara, en el Zulia. Confirmado por el dueño. */
export const REGIONES_Y_CIUDADES: readonly RegionCubierta[] = Object.freeze([
  Object.freeze({ region: 'Zulia', ciudades: Object.freeze(['Maracaibo', 'Mara']) })
] as const);
