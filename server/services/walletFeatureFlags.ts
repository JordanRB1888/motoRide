/**
 * Qué parte de la cartera está encendida.
 *
 * TODO APAGADO POR DEFECTO
 *
 * WALLET-PAYOUTS-1 construye la maquinaria y no la enciende. Una fundación
 * financiera que se activa sola al desplegar es una fundación que nadie decidió
 * poner en producción.
 *
 * LO QUE UNA BANDERA NO PUEDE HACER
 *
 * Estas banderas controlan **disponibilidad de funcionalidad**, y nada más. No
 * saltan la autenticación, no saltan la comprobación de propiedad, no saltan
 * las invariantes de la base de datos y no permiten retirar más de lo que hay.
 * Encender una bandera abre una puerta; no convierte a nadie en administrador
 * ni hace aparecer dinero. Hay pruebas que lo comprueban.
 */

/** Habilita la fundación de retiros en su conjunto. */
export const BANDERA_RETIROS = 'WALLET_PAYOUTS_ENABLED';

/**
 * Habilita los retiros de CONDUCTOR, aparte del resto.
 *
 * Está separada porque el saldo de un conductor depende de la liquidación de
 * comisiones, y ese trabajo —DRIVER-FINANCE-1— está PAUSADO sin resolver. Un
 * retiro de conductor construido sobre un saldo cuya corrección está en
 * revisión pagaría cifras que nadie ha validado.
 *
 * No se enciende hasta que Driver Finance se resuelva explícitamente.
 */
export const BANDERA_RETIROS_DE_CONDUCTOR = 'DRIVER_WITHDRAWALS_ENABLED';

const encendida = (valor: string | undefined): boolean => String(valor ?? '').trim() === '1';

export interface EstadoDeBanderas {
  readonly retirosHabilitados: boolean;
  readonly retirosDeConductorHabilitados: boolean;
}

/**
 * Lee las banderas del entorno.
 *
 * Sólo el literal `'1'` enciende. Ni `'true'`, ni `'yes'`, ni `'si'`: un único
 * valor aceptado significa que encender es un acto deliberado y que nadie lo
 * hace por accidente escribiendo cualquier cosa en una variable.
 */
export function leerBanderas(
  entorno: Record<string, string | undefined> = process.env
): EstadoDeBanderas {
  return {
    retirosHabilitados: encendida(entorno[BANDERA_RETIROS]),
    retirosDeConductorHabilitados: encendida(entorno[BANDERA_RETIROS_DE_CONDUCTOR])
  };
}

export const MOTIVOS_DE_INDISPONIBILIDAD = [
  'RETIROS_DESHABILITADOS',
  'RETIROS_DE_CONDUCTOR_DESHABILITADOS'
] as const;
export type MotivoDeIndisponibilidad = (typeof MOTIVOS_DE_INDISPONIBILIDAD)[number];

export type DisponibilidadDeRetiro =
  | { readonly disponible: true }
  | { readonly disponible: false; readonly motivo: MotivoDeIndisponibilidad; readonly detalle: string };

/**
 * Si el retiro está disponible para este rol.
 *
 * Un conductor necesita las DOS banderas: la general y la suya. No basta con
 * encender la general, precisamente para que activar los retiros de pasajera no
 * active de rebote los de conductor mientras Driver Finance siga pausado.
 */
export function evaluarDisponibilidad(
  rol: string,
  banderas: EstadoDeBanderas = leerBanderas()
): DisponibilidadDeRetiro {
  if (!banderas.retirosHabilitados) {
    return {
      disponible: false,
      motivo: 'RETIROS_DESHABILITADOS',
      detalle: `la fundación de retiros está apagada (${BANDERA_RETIROS})`
    };
  }

  if (String(rol).toLowerCase() === 'driver' && !banderas.retirosDeConductorHabilitados) {
    return {
      disponible: false,
      motivo: 'RETIROS_DE_CONDUCTOR_DESHABILITADOS',
      detalle: 'los retiros de conductor siguen bloqueados mientras DRIVER-FINANCE-1 esté pausado'
    };
  }

  return { disponible: true };
}
