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
 * En qué punto está el permiso de segundo plano.
 *
 * `DENEGADO` y `BLOQUEADO` son distintos y hay que tratarlos distinto: del
 * primero se sale volviendo a preguntar, del segundo sólo desde los ajustes del
 * teléfono. Confundirlos produce o bien insistir con un diálogo que el sistema
 * ya no muestra, o bien mandar a los ajustes a quien sólo hacía falta preguntar.
 */
export type PermisoDeFondo =
  /** Todavía no se ha mirado qué dice el sistema. */
  | 'DESCONOCIDO'
  /** Puede seguir midiendo con la aplicación cerrada. */
  | 'CONCEDIDO'
  /** Dijo que no, pero el sistema todavía deja preguntar. */
  | 'DENEGADO'
  /** El sistema ya no pregunta: sólo se arregla desde los ajustes. */
  | 'BLOQUEADO'
  /** La plataforma no ofrece este permiso — el navegador, sin ir más lejos. */
  | 'NO_DISPONIBLE';

/**
 * PONERSE EN SERVICIO EXIGE EL PERMISO. ANTES, NO DESPUÉS.
 *
 * Decisión del dueño: en +58Express un conductor no pasa de `OFFLINE` a
 * `AVAILABLE` sin lo que hace falta para mantener su ubicación con el teléfono
 * guardado.
 *
 * El orden importa y es lo que esta función protege. Pedir el estado primero y
 * el permiso después deja una ventana —corta, pero real— en la que el sistema
 * cree que hay un conductor trabajando cuando todavía no se sabe si podrá
 * decir dónde está. Y si acaba diciendo que no, hay que deshacer algo que ya se
 * anunció al despacho.
 *
 * Así que: permiso, y sólo entonces se le pide al servidor el cambio.
 */
export type PuertaDeEntrada =
  /** Ya se puede pedir `AVAILABLE` al servidor. */
  | 'ADELANTE'
  /** Hay que preguntar al sistema. */
  | 'PEDIR'
  /** El sistema ya no pregunta: hay que ofrecer los ajustes del teléfono. */
  | 'AJUSTES'
  /** No hay permiso que pedir en esta plataforma. */
  | 'SIN_PERMISO_QUE_PEDIR';

export function puertaParaEntrarEnServicio(permiso: PermisoDeFondo): PuertaDeEntrada {
  if (permiso === 'CONCEDIDO') return 'ADELANTE';
  if (permiso === 'BLOQUEADO') return 'AJUSTES';

  // En el navegador no existe seguimiento en segundo plano NI permiso que
  // conceder. Exigir aquí uno que la plataforma no ofrece dejaría al conductor
  // encerrado fuera de servicio sin nada que pueda hacer para salir, que no es
  // lo que la regla pretende: la regla habla del teléfono, que es donde hay algo
  // que conceder.
  if (permiso === 'NO_DISPONIBLE') return 'SIN_PERMISO_QUE_PEDIR';

  // `DESCONOCIDO` y `DENEGADO`: se pregunta. Del segundo se sale volviendo a
  // preguntar, y volver a pulsar el botón es esa acción explícita — no se
  // insiste solo.
  return 'PEDIR';
}

/**
 * QUÉ HACER CUANDO EL SERVIDOR DICE QUE TRABAJA Y EL TELÉFONO DICE QUE NO PUEDE
 *
 * Pasa de verdad: el conductor se puso en servicio ayer con el permiso dado, y
 * hoy lo ha quitado desde los ajustes del teléfono. O reinstaló. O cambió de
 * teléfono. El servidor sigue diciendo `AVAILABLE` y la aplicación ya no puede
 * cumplir lo que ese estado promete.
 *
 * Fingir que trabaja normalmente sería lo peor: el despacho le ofrecería viajes
 * a alguien cuya posición va a envejecer hasta desaparecer, y quien espera en la
 * calle vería una moto que no se mueve.
 *
 * Pero hay una excepción que NO se toca. Si tiene un viaje en marcha, sacarlo de
 * servicio por su cuenta rompería un viaje real con una persona subida a la
 * moto. Eso es mucho peor que la falta de permiso. El viaje sigue, y la falta de
 * permiso se cuenta como lo que es: algo urgente que arreglar.
 */
export type Reconciliacion =
  /** Todo coherente, o todavía no se sabe lo suficiente para decidir. */
  | 'NADA'
  /** Pedir al SERVIDOR que lo ponga fuera de servicio. */
  | 'SACAR_DE_SERVICIO'
  /** Hay un viaje en marcha: no se toca, pero hay que avisar. */
  | 'AVISAR_SIN_TOCAR_EL_VIAJE';

export function reconciliarSinPermiso({
  estado,
  permiso,
  hayViajeActivo
}: {
  readonly estado: EstadoDelConductor | null;
  readonly permiso: PermisoDeFondo;
  readonly hayViajeActivo: boolean;
}): Reconciliacion {
  // Con el permiso dado no hay nada que reconciliar. Y donde no existe el
  // permiso tampoco: no se puede echar a nadie por no tener algo que la
  // plataforma no ofrece.
  if (permiso === 'CONCEDIDO' || permiso === 'NO_DISPONIBLE') return 'NADA';

  // Todavía no se ha mirado qué dice el sistema. Decidir aquí sacaría de
  // servicio a todo el mundo durante el arranque, antes de saber nada.
  if (permiso === 'DESCONOCIDO') return 'NADA';

  // Fuera de servicio no hay incoherencia que arreglar.
  if (!enServicio(estado)) return 'NADA';

  // El viaje manda. Se comprueban las dos cosas —el estado del servidor y si
  // hay viaje en curso— porque cualquiera de las dos basta para no tocar nada.
  if (hayViajeActivo || estado === 'BUSY' || estado === 'IN_TRIP') {
    return 'AVISAR_SIN_TOCAR_EL_VIAJE';
  }

  return 'SACAR_DE_SERVICIO';
}

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
