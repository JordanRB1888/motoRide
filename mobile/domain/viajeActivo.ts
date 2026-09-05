/**
 * El viaje activo: el modelo, sin React ni red.
 *
 * DOS MÁQUINAS DE ESTADOS QUE NO SE MEZCLAN
 *
 * La del NEGOCIO vive en el servidor (`server/domain/tripStateMachine.js`) y se
 * lee tal cual: SEARCHING → DRIVER_ASSIGNED → ARRIVED → IN_PROGRESS →
 * COMPLETED/CANCELLED. Aquí no se replica, no se valida y no se adelanta.
 *
 * La de este fichero es otra cosa: en qué punto está la CARGA. Si todavía no se
 * ha preguntado, si no hay viaje, si hay uno, si se está volviendo a preguntar
 * o si falló. Confundir las dos —y meter «BUSCANDO_CONDUCTOR» aquí— sería
 * crear una segunda autoridad del negocio en el teléfono.
 *
 * EL SERVIDOR DECIDE CUÁNDO UN VIAJE DEJA DE SER ACTIVO
 *
 * `GET /api/trips/active/me` tiene una ventana propia: un `SEARCHING` deja de
 * devolverse a los TRES MINUTOS, y el resto a las DOCE HORAS. Un viaje puede
 * seguir abierto en la base y ya no salir por aquí. Eso no se replica: si el
 * servidor deja de darlo, aquí deja de haberlo.
 */

import type { DetalleReal } from './viajes';

/**
 * En qué punto está la carga.
 *
 * `RESINCRONIZANDO` existe separado de `ARRANCANDO` porque no es lo mismo: al
 * arrancar no hay nada que enseñar; al resincronizar sí, y se sigue enseñando
 * mientras llega la respuesta. Fundirlos haría parpadear la pantalla en cada
 * reconexión.
 */
export const FASES = [
  'ARRANCANDO',
  'SIN_VIAJE',
  'CON_VIAJE',
  'RESINCRONIZANDO',
  'ERROR'
] as const;
export type FaseDelViaje = (typeof FASES)[number];

export type EstadoDelViajeActivo =
  | { readonly fase: 'ARRANCANDO' }
  | { readonly fase: 'SIN_VIAJE' }
  | { readonly fase: 'CON_VIAJE'; readonly viaje: DetalleReal }
  | {
      readonly fase: 'RESINCRONIZANDO';
      /** Lo último que se supo. Puede ser `null` si nunca hubo viaje. */
      readonly viaje: DetalleReal | null;
    }
  | {
      readonly fase: 'ERROR';
      /**
       * Lo último que se supo, CONSERVADO.
       *
       * Es la decisión más importante del fichero: un fallo de red no puede
       * hacer desaparecer un viaje en curso. Quien va montado en la moto sigue
       * yendo montado aunque el teléfono pierda cobertura, y una pantalla que
       * dice «no tienes ningún viaje» en ese momento es peor que una que dice
       * «no pude comprobarlo».
       */
      readonly viaje: DetalleReal | null;
      readonly mensaje: string;
    };

export const ESTADO_INICIAL: EstadoDelViajeActivo = { fase: 'ARRANCANDO' };

/** El viaje que se conoce ahora mismo, esté fresco o no. Para pintar. */
export function viajeConocido(estado: EstadoDelViajeActivo): DetalleReal | null {
  if (estado.fase === 'CON_VIAJE') return estado.viaje;
  if (estado.fase === 'RESINCRONIZANDO' || estado.fase === 'ERROR') return estado.viaje;
  return null;
}

/**
 * `true` cuando lo que se enseña puede estar viejo.
 *
 * Sirve para que una pantalla pueda decirlo si algún día quiere. Hoy nadie lo
 * pinta —el diseño no tiene sitio para ese aviso— pero el dato existe en vez de
 * fingir que todo está fresco.
 */
export function puedeEstarViejo(estado: EstadoDelViajeActivo): boolean {
  return estado.fase === 'RESINCRONIZANDO' || estado.fase === 'ERROR';
}

// ---------------------------------------------------------------------------
// Las transiciones de la CARGA
// ---------------------------------------------------------------------------

/** Empieza una consulta. Conserva lo que hubiera para no parpadear. */
export function alEmpezarAPreguntar(estado: EstadoDelViajeActivo): EstadoDelViajeActivo {
  return { fase: 'RESINCRONIZANDO', viaje: viajeConocido(estado) };
}

/**
 * El servidor respondió con un viaje.
 *
 * No se comprueba si la transición es «válida»: el servidor ya lo hizo al
 * escribirla. Un cliente que rechazara un estado por parecerle imposible
 * dejaría de enseñar la verdad.
 */
export function alRecibirViaje(viaje: DetalleReal): EstadoDelViajeActivo {
  return { fase: 'CON_VIAJE', viaje };
}

/**
 * El servidor respondió 204: no hay viaje activo.
 *
 * Esto SÍ limpia, y es lo correcto: es la autoridad diciendo que no hay,
 * no una suposición del teléfono.
 */
export function alNoHaberViaje(): EstadoDelViajeActivo {
  return { fase: 'SIN_VIAJE' };
}

/** Falló la consulta. Se conserva lo último conocido. */
export function alFallar(estado: EstadoDelViajeActivo, mensaje: string): EstadoDelViajeActivo {
  return { fase: 'ERROR', viaje: viajeConocido(estado), mensaje };
}

/** Cierre de sesión, o cambio de cuenta. No se hereda nada. */
export function alCerrarSesion(): EstadoDelViajeActivo {
  return { fase: 'ARRANCANDO' };
}

// ---------------------------------------------------------------------------
// Qué superficie le toca a cada estado del NEGOCIO
// ---------------------------------------------------------------------------

/**
 * Las pantallas que ya existen.
 *
 * `ARRIVED` estuvo un tiempo en `null` —el hueco declarado— porque mandarlo a
 * `viaje` habría enseñado «tu conductor está en camino» cuando ya estaba abajo
 * esperando, y eso es peor que no enseñar nada.
 *
 * Ya no hace falta el hueco: `superficieDelViaje` resuelve el titular por
 * estado, y para `ARRIVED` dice «Tu conductor llegó · Ya está en el punto de
 * recogida». Mismo layout, otro texto, que era exactamente lo que faltaba. Con
 * el copy resuelto, dejarlo en `null` haría lo contrario de lo que se buscaba:
 * sacar a la pasajera de la pantalla del viaje justo en el momento en el que
 * más mira el teléfono.
 */
export const SUPERFICIE_DEL_ESTADO: Readonly<Record<string, string | null>> = Object.freeze({
  SEARCHING: 'buscando',
  DRIVER_ASSIGNED: 'viaje',
  ARRIVED: 'viaje',
  IN_PROGRESS: 'viaje',
  // Terminales: ya no son un viaje activo, son historial.
  COMPLETED: null,
  CANCELLED: null
});

/** Los que el servidor considera cerrados. No se fabrican en el cliente. */
export const ESTADOS_TERMINALES = ['COMPLETED', 'CANCELLED'] as const;

export function esTerminal(estado: string): boolean {
  return (ESTADOS_TERMINALES as readonly string[]).includes(estado);
}

/**
 * La pantalla que le toca a un viaje, o `null` si no hay ninguna.
 *
 * `null` significa dos cosas distintas y las dos correctas: o el estado es
 * terminal —y entonces no hay viaje activo que enseñar— o es `ARRIVED`, que
 * todavía no tiene diseño.
 */
export function superficieDe(viaje: DetalleReal | null): string | null {
  if (viaje === null) return null;
  return SUPERFICIE_DEL_ESTADO[viaje.estado] ?? null;
}

// ---------------------------------------------------------------------------
// El reparto de las recargas
// ---------------------------------------------------------------------------

/** Lo mínimo que se espera antes de recargar, para agrupar eventos seguidos. */
export const ESPERA_BASE_MS = 200;

/**
 * Cuánto se reparte una difusión.
 *
 * POR QUÉ UNA ESPERA FIJA NO SERVÍA
 *
 * La primera versión esperaba 400 ms y recargaba. Eso no reparte el pico: lo
 * MUEVE. Si diez mil teléfonos reciben la misma difusión en el mismo
 * milisegundo, todos esperan lo mismo y todos preguntan 400 ms después. El
 * servidor recibe exactamente el mismo golpe, sólo que más tarde.
 *
 * Con un reparto aleatorio, esos diez mil se extienden sobre una ventana y el
 * servidor ve una pendiente en vez de una pared.
 *
 * Tres segundos es el equilibrio: bastante para repartir de verdad, y poco para
 * que un aviso nuevo se sienta inmediato — la campana no es una pantalla que se
 * mire fijamente esperando.
 */
export const REPARTO_MAXIMO_MS = 3_000;

/**
 * Cuánto espera ESTE teléfono antes de recargar.
 *
 * `aleatorio` entra por parámetro para poder probarlo: con 0 da el mínimo, con
 * 1 el máximo, y con `Math.random` reparte. Sin inyectarlo, la única forma de
 * probar el reparto sería ejecutarlo mil veces y mirar la distribución.
 *
 * `repartir` distingue los dos casos que el encargo separa: una difusión se
 * reparte; un cambio de MI viaje no, porque soy uno solo y estoy esperando.
 */
export function retrasoDeRecarga(aleatorio: number, repartir: boolean): number {
  if (!repartir) return ESPERA_BASE_MS;
  const acotado = Math.min(1, Math.max(0, aleatorio));
  return ESPERA_BASE_MS + Math.round(acotado * REPARTO_MAXIMO_MS);
}
