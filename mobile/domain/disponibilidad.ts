/**
 * Si el conductor está en servicio.
 *
 * QUIÉN MANDA
 *
 * El servidor. Siempre. El interruptor de la pantalla no cambia el estado: lo
 * PIDE, y el estado que se enseña es el que el servidor confirma. Si se pintara
 * el deseo del usuario en vez de la respuesta, un conductor podría verse «en
 * línea» mientras el servidor lo tiene fuera —y quedarse esperando viajes que
 * nunca van a llegar—.
 *
 * CUATRO ESTADOS, Y SÓLO DOS SE TOCAN A MANO
 *
 *   AVAILABLE   en servicio, puede recibir viajes
 *   BUSY        ocupado por decisión suya o del sistema
 *   IN_TRIP     con un viaje en curso
 *   OFFLINE     fuera de servicio
 *
 * El interruptor alterna entre `AVAILABLE` y `OFFLINE`, que son los dos que
 * significan «quiero trabajar» y «no quiero». `BUSY` e `IN_TRIP` los pone el
 * flujo del viaje, no un botón: mientras alguien va montado en la moto, el
 * conductor no puede declararse disponible.
 *
 * LO QUE EL CONDUCTOR NO PUEDE ASIGNARSE
 *
 * `SUSPENDED` y `PENDING_APPROVAL` son de administración. El servidor los
 * rechaza —`normalizeDriverStatus` sólo admite los cuatro de arriba— y aquí ni
 * se nombran como opción: nadie debe poder auto-suspenderse ni, sobre todo,
 * auto-reactivarse.
 */

/** Los cuatro que el propio conductor puede pedir. Los mismos del servidor. */
export const ESTADOS_DEL_CONDUCTOR = ['AVAILABLE', 'BUSY', 'IN_TRIP', 'OFFLINE'] as const;
export type EstadoDelConductor = (typeof ESTADOS_DEL_CONDUCTOR)[number];

/**
 * Los que el servidor manda pero el conductor NO puede pedir.
 *
 * Se nombran para poder prohibirlos y para poder leerlos cuando llegan: un
 * conductor suspendido tiene que ver su situación, no una pantalla a medias.
 */
export const ESTADOS_DE_ADMINISTRACION = ['SUSPENDED', 'PENDING_APPROVAL'] as const;

/**
 * Cómo se llama lo que llega, en canónico.
 *
 * El servidor acepta alias históricos —`ONLINE` por `AVAILABLE`, y los
 * castellanos— y los normaliza antes de guardarlos. Un cliente viejo o un
 * registro antiguo pueden traerlos, así que aquí se leen igual en vez de
 * rechazarlos: rechazar dejaría a ese conductor sin estado en pantalla.
 */
const ALIAS: Record<string, EstadoDelConductor> = {
  ONLINE: 'AVAILABLE',
  DISPONIBLE: 'AVAILABLE',
  OCUPADO: 'BUSY',
  EN_VIAJE: 'IN_TRIP',
  DESCONECTADO: 'OFFLINE'
};

/** Lee un estado del servidor. `null` si no es ninguno conocido. */
export function leerEstadoDelConductor(valor: unknown): EstadoDelConductor | null {
  const crudo = String(valor ?? '').trim().toUpperCase().replaceAll(' ', '_');
  if (crudo === '') return null;

  const canonico = ALIAS[crudo] ?? crudo;
  return (ESTADOS_DEL_CONDUCTOR as readonly string[]).includes(canonico)
    ? (canonico as EstadoDelConductor)
    : null;
}

/**
 * ¿Está en servicio?
 *
 * `IN_TRIP` cuenta: quien lleva a alguien está trabajando, y el disco de la
 * barra debe seguir encendido. `BUSY` también — es una pausa, no una salida.
 */
export function enServicio(estado: EstadoDelConductor | null): boolean {
  return estado === 'AVAILABLE' || estado === 'BUSY' || estado === 'IN_TRIP';
}

/**
 * Qué se pide al tocar el interruptor.
 *
 * Sólo alterna entre trabajar y no trabajar. Desde `IN_TRIP` devuelve `null`:
 * no se puede salir de servicio con alguien montado en la moto, y el botón no
 * debe fingir que sí. Quien quiera terminar la jornada, termina el viaje
 * primero.
 */
export function alTocarElInterruptor(estado: EstadoDelConductor | null): EstadoDelConductor | null {
  if (estado === 'IN_TRIP') return null;
  return enServicio(estado) ? 'OFFLINE' : 'AVAILABLE';
}

/**
 * Las fases de la conexión del conductor.
 *
 * DESCONOCIDA  todavía no se sabe qué dice el servidor
 * PIDIENDO     se mandó una petición y se espera confirmación
 * CONFIRMADA   el servidor dijo cuál es el estado
 * RECHAZADA    el servidor no aceptó el cambio
 */
export type FaseDeDisponibilidad = 'DESCONOCIDA' | 'PIDIENDO' | 'CONFIRMADA' | 'RECHAZADA';

export interface Disponibilidad {
  readonly fase: FaseDeDisponibilidad;
  /** Lo que el SERVIDOR dice. Nunca lo que el usuario pulsó. */
  readonly estado: EstadoDelConductor | null;
  /** Motivo del último rechazo, para diagnóstico. Texto corto del servidor. */
  readonly motivo: string | null;
}

export const DISPONIBILIDAD_INICIAL: Disponibilidad = Object.freeze({
  fase: 'DESCONOCIDA',
  estado: null,
  motivo: null
});

/** El estado que confirma el servidor. */
export function confirmada(estado: EstadoDelConductor): Disponibilidad {
  return { fase: 'CONFIRMADA', estado, motivo: null };
}

/**
 * Un rechazo, CONSERVANDO el último estado conocido.
 *
 * Si el servidor rechaza un cambio, el conductor sigue estando donde estaba.
 * Borrar el estado dejaría el disco apagado y le haría creer que salió de
 * servicio cuando no ha salido.
 */
export function rechazada(previa: Disponibilidad, motivo: string): Disponibilidad {
  return { fase: 'RECHAZADA', estado: previa.estado, motivo };
}

/** Se pidió un cambio y se espera respuesta. El estado sigue siendo el viejo. */
export function pidiendo(previa: Disponibilidad): Disponibilidad {
  return { fase: 'PIDIENDO', estado: previa.estado, motivo: null };
}

/**
 * ¿Debe emitirse la ubicación de este conductor?
 *
 * Fuera de servicio, no. Su GPS sigue midiendo para su propio mapa —ver dónde
 * está no depende de estar trabajando— pero mandarlo al servidor gasta datos y
 * batería que paga él, y no sirve para nada: el despacho no le va a ofrecer
 * viajes estando fuera.
 */
export function debeEmitirUbicacion(estado: EstadoDelConductor | null): boolean {
  return enServicio(estado);
}
