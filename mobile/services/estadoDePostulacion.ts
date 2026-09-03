/**
 * El estado del expediente, pedido una sola vez aunque lo pregunten cinco.
 *
 * El mecanismo genérico está en `consultaCoalescida`. Aquí sólo se decide qué
 * se pregunta, cuánto dura el margen de gracia y qué respuestas merecen
 * recordarse.
 *
 * POR QUÉ EL MARGEN ES TAN CORTO
 *
 * Lo que se guarda aquí caduca cuando administración toca un botón, y eso puede
 * pasar en cualquier momento. Diez segundos es lo que dura abrir una pantalla;
 * más que eso sería arriesgarse a que alguien mire su teléfono, vea «en
 * revisión» y se vaya, cuando su solicitud ya estaba aprobada.
 *
 * QUIEN MANDA SIGUE SIENDO EL SERVIDOR
 *
 * Nada de lo que hay aquí decide si alguien puede conducir: eso se pregunta y
 * se obedece. Volver la aplicación al primer plano, volver al inicio o terminar
 * cualquier cambio del expediente saltan el margen y preguntan de nuevo.
 */

import { crearConsultaCoalescida, type ConsultaCoalescida } from './consultaCoalescida';
import { alCambiarElExpediente } from './expedienteCambiado';
import { leerMiPostulacion, type LecturaDeSolicitud } from './postulacion';

/** El margen de gracia. Corto a propósito: ver arriba. */
export const GRACIA_DEL_ESTADO_MS = 10_000;

/** La que usa la aplicación. Una por proceso, como el servidor al que pregunta. */
export const estadoDePostulacion: ConsultaCoalescida<LecturaDeSolicitud> = crearConsultaCoalescida({
  leer: leerMiPostulacion,
  // Un fallo no se guarda: sería convertir una red caída en una respuesta, y
  // «no tienes solicitud» es una respuesta muy distinta de «no pude preguntar».
  seGuarda: resultado => resultado.ok,
  graciaMs: GRACIA_DEL_ESTADO_MS
});

// Terminar cualquier cambio del expediente deja lo guardado sin valor.
alCambiarElExpediente(() => { estadoDePostulacion.invalidar(); });

export const consultarEstadoDePostulacion = estadoDePostulacion.consultar;
export const invalidarEstadoDePostulacion = estadoDePostulacion.invalidar;
