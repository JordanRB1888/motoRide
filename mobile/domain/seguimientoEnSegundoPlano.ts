/**
 * Cuándo el teléfono del conductor sigue diciendo dónde está con la pantalla
 * apagada — y cuándo no.
 *
 * POR QUÉ EXISTE ESTO
 *
 * Un conductor en servicio guarda el teléfono en el bolsillo. Sin seguimiento
 * en segundo plano, su última posición envejece, a los dos minutos el despacho
 * lo descarta por rancia, y deja de existir para el sistema aunque él se vea
 * «en línea». Es el problema que esta fase resuelve.
 *
 * LA REGLA QUE GOBIERNA TODO
 *
 * Seguir a alguien con la aplicación cerrada es lo más invasivo que hace esta
 * aplicación, así que sólo puede ocurrir mientras haya una razón operativa de
 * verdad: **estar en servicio**, confirmado por el servidor.
 *
 *   abrir la aplicación como conductor   ≠  seguimiento
 *   tener cuenta de conductor            ≠  seguimiento
 *   tener permiso de GPS                 ≠  seguimiento
 *
 * En cuanto sale de servicio, o cierra sesión, o el servidor deja de decir que
 * está trabajando, el seguimiento se para. No hay ningún camino por el que un
 * conductor fuera de servicio siga siendo seguido.
 */

import { enServicio, type EstadoDelConductor } from './disponibilidad';

/** El nombre de la tarea. Uno solo en toda la aplicación. */
export const TAREA_DE_UBICACION = 'plus58express-ubicacion-del-conductor';

/**
 * Las condiciones para que el seguimiento exista.
 *
 * Se comprueban juntas y en un sitio: repartidas por la aplicación, cualquiera
 * podría olvidarse de una y dejar el seguimiento vivo donde no debe.
 */
export interface CondicionesDelSeguimiento {
  /** Sesión confirmada por el backend, no un token guardado. */
  readonly haySesion: boolean;
  readonly esConductor: boolean;
  /** Lo que el SERVIDOR dice que es su estado. */
  readonly estado: EstadoDelConductor | null;
  /** Si el sistema concedió seguir midiendo con la aplicación al fondo. */
  readonly permisoDeSegundoPlano: boolean;
}

/**
 * ¿Debe estar corriendo el seguimiento?
 *
 * Las cuatro condiciones son necesarias. Falta una y se apaga.
 */
export function debeSeguirEnSegundoPlano(condiciones: CondicionesDelSeguimiento): boolean {
  if (!condiciones.haySesion) return false;
  if (!condiciones.esConductor) return false;
  if (!condiciones.permisoDeSegundoPlano) return false;
  // `AVAILABLE`, `BUSY` e `IN_TRIP` son estar trabajando. `OFFLINE` no, y
  // `SUSPENDED` o `PENDING_APPROVAL` ni siquiera se leen como estado válido.
  return enServicio(condiciones.estado);
}

/**
 * LA CADENCIA DE SEGUNDO PLANO
 *
 * No es telemetría de carreras. El objetivo es que la posición nunca se acerque
 * a los ciento veinte segundos con que el despacho la da por rancia, sin
 * quemar la batería de quien está trabajando ocho horas.
 *
 * Quince segundos deja ocho veces de margen sobre ese límite: aunque se pierdan
 * varias lecturas seguidas por un túnel o un edificio, la posición sigue
 * estando muy lejos de caducar.
 *
 * Veinticinco metros, y no diez como en primer plano, porque en segundo plano
 * cada lectura cuesta una petición HTTP y no un mensaje por un socket ya
 * abierto. Parado en un semáforo no se manda nada; en marcha, de sobra.
 *
 * `Balanced` y no `High`: en segundo plano el GPS a plena potencia con la
 * pantalla apagada es lo que vacía una batería en media jornada. Cien metros
 * de precisión bastan para que el despacho sepa en qué zona está una moto — el
 * portal exacto se afina en primer plano, cuando alguien mira la pantalla.
 */
export const CADA_MS_EN_SEGUNDO_PLANO = 15_000;
export const CADA_METROS_EN_SEGUNDO_PLANO = 25;

/**
 * Cuánto puede el sistema agrupar lecturas antes de despertarnos.
 *
 * Android e iOS ahorran batería acumulando lecturas y entregándolas juntas.
 * Se acepta hasta medio minuto: sigue muy por debajo de los ciento veinte
 * segundos, y a cambio el teléfono despierta la mitad de veces.
 */
export const AGRUPAR_HASTA_MS = 30_000;
export const AGRUPAR_HASTA_METROS = 50;

/**
 * Qué hacer cuando el servidor no acepta una posición.
 *
 * NUNCA se reintenta la misma muestra. El principio es que **la última
 * posición gana**: no hace falta reconstruir por dónde pasó el conductor, sino
 * saber dónde está ahora, y la siguiente lectura llega sola en quince
 * segundos. Reintentar sería gastar datos en contar el pasado.
 */
export type ReaccionAlFallo =
  /** Seguir como si nada: la siguiente muestra lo arreglará. */
  | 'SEGUIR'
  /** Parar el seguimiento: sin sesión válida no se manda nada. */
  | 'PARAR'
  /** Esperar antes de la siguiente: el servidor pide calma. */
  | 'ESPERAR';

/**
 * Traduce la respuesta del servidor a qué hacer.
 *
 * `401` y `403` paran el seguimiento. Una sesión caducada o revocada no se
 * arregla insistiendo, y un teléfono mandando posiciones que el servidor
 * rechaza cada quince segundos durante horas es exactamente el bucle que hay
 * que evitar.
 *
 * `429` es el servidor diciendo «demasiadas»: se espera. `400` es una
 * coordenada que no le gustó — se descarta esa muestra y ya está. Los `5xx` y
 * los cortes de red son transitorios: la siguiente lectura lo intentará.
 */
export function reaccionarAlFallo(codigo: number | null): ReaccionAlFallo {
  if (codigo === 401 || codigo === 403) return 'PARAR';
  if (codigo === 429) return 'ESPERAR';
  return 'SEGUIR';
}

/**
 * Cuánto esperar cuando el servidor pide calma.
 *
 * Un minuto: cuatro lecturas de las nuestras. Suficiente para que el limitador
 * se relaje sin que la posición llegue a caducar.
 */
export const ESPERA_TRAS_EXCESO_MS = 60_000;

/**
 * ¿Se manda esta muestra, o el envío anterior fue hace demasiado poco?
 *
 * Es el mismo principio que en primer plano —medir no es enviar— pero con el
 * ritmo de segundo plano. Se aplica sobre la muestra que el sistema entrega,
 * que ya viene espaciada por la propia configuración de la tarea.
 */
export function tocaEnviar(
  ultimoEnvio: number | null,
  ahora: number,
  esperandoHasta: number | null
): boolean {
  if (esperandoHasta !== null && ahora < esperandoHasta) return false;
  if (ultimoEnvio === null) return true;
  return ahora - ultimoEnvio >= CADA_MS_EN_SEGUNDO_PLANO;
}
