/**
 * La tarea completa: pedir la tasa al BCV, revisarla, guardarla y refrescar la
 * caché.
 *
 * Es la composición de las piezas, y vive aparte de ellas para que cada una
 * siga siendo probable por su cuenta: el proveedor sin base de datos, el
 * almacén sin red, el filtro de cordura sin ninguna de las dos.
 */

import { revisarVariacion } from '../domain/fxSanity.ts';
import {
  obtenerTasaOficial,
  type OpcionesDelProveedor,
  type ResultadoDelProveedor,
  type TasaObtenida
} from './bcvRateProvider.ts';
import {
  guardarTasa,
  leerTasaVigente,
  type EjecutorSql,
  type ResultadoDeGuardado
} from './fxRateStore.ts';

export type ResultadoDeActualizacion =
  | {
      readonly ok: true;
      readonly valor: TasaObtenida;
      readonly guardado: ResultadoDeGuardado;
      readonly revision: number;
    }
  | {
      readonly ok: false;
      readonly motivo: string;
      readonly detalle: string;
    };

export interface OpcionesDeActualizacion {
  readonly sql: EjecutorSql;
  /** Se invalida tras guardar, para que la siguiente lectura vea la tasa nueva. */
  readonly invalidarCache?: () => void;
  readonly registrar?: (mensaje: string) => void;
  readonly proveedor?: (opciones?: OpcionesDelProveedor) => Promise<ResultadoDelProveedor>;
  readonly opcionesDelProveedor?: OpcionesDelProveedor;
  /**
   * Acepta una variación que el filtro de cordura marcó como sospechosa.
   *
   * Existe para el caso legítimo —el bolívar SÍ puede moverse mucho— pero exige
   * una decisión humana explícita. Nunca se activa sola, y nunca por defecto:
   * un salto automático por encima del umbral es justo lo que hay que impedir.
   */
  readonly aceptarVariacionInusual?: boolean;
}

/**
 * Ejecuta una actualización.
 *
 * Si el BCV no responde, si su página cambió de forma, o si la tasa no supera
 * el filtro de cordura, NO se escribe nada: la última tasa buena conocida se
 * queda donde está y el sistema la sigue sirviendo marcada como vieja. Escribir
 * algo dudoso sería peor que no escribir nada.
 */
export async function actualizarTasaOficial(
  opciones: OpcionesDeActualizacion
): Promise<ResultadoDeActualizacion> {
  const registrar = opciones.registrar ?? (() => {});
  const pedir = opciones.proveedor ?? obtenerTasaOficial;

  const obtenida = await pedir(opciones.opcionesDelProveedor);
  if (!obtenida.ok) {
    registrar(`FX_BCV_FALLO motivo=${obtenida.motivo}`);
    return { ok: false, motivo: obtenida.motivo, detalle: obtenida.detalle };
  }

  const vigente = await leerTasaVigente(opciones.sql);
  const revision = revisarVariacion(obtenida.valor.tasa, vigente?.rate ?? null);

  if (revision.veredicto === 'VARIACION_SOSPECHOSA' && !opciones.aceptarVariacionInusual) {
    // No se guarda, no se ajusta y no se aproxima. Se avisa y se conserva lo
    // que había: una tasa vieja pero cierta es mejor que una nueva dudosa.
    registrar(`FX_BCV_VARIACION_RECHAZADA detalle=${revision.detalle}`);
    return { ok: false, motivo: 'VARIACION_SOSPECHOSA', detalle: revision.detalle };
  }

  if (revision.veredicto === 'VARIACION_SOSPECHOSA') {
    registrar(`FX_BCV_VARIACION_ACEPTADA_A_MANO detalle=${revision.detalle}`);
  }

  const { resultado: guardado, revision: numeroDeRevision } = await guardarTasa(
    opciones.sql,
    obtenida.valor
  );

  if (guardado === 'CORREGIDA') {
    // Se registra aparte porque no es rutina: el BCV cambió una tasa que ya
    // teníamos, y puede haber cobros hechos con la anterior.
    registrar(
      `FX_BCV_CORREGIDA fecha_valor=${obtenida.valor.fechaValor} revision=${numeroDeRevision}`
    );
  } else if (guardado === 'INSERTADA') {
    registrar(`FX_BCV_ACTUALIZADA fecha_valor=${obtenida.valor.fechaValor}`);
  }

  opciones.invalidarCache?.();
  return { ok: true, valor: obtenida.valor, guardado, revision: numeroDeRevision };
}
