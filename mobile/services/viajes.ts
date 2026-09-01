/**
 * Los viajes: el historial, el registro de uno y su conversación.
 *
 * LA AUTORIZACIÓN ES DEL SERVIDOR, SIEMPRE
 *
 * Aquí no se comprueba si alguien puede ver un viaje. El servidor lo hace en
 * cada ruta (`userCanAccessTrip`) y responde 403 si no. Repetir esa
 * comprobación en el teléfono no añadiría seguridad —se desmonta la
 * aplicación y desaparece— y sí añadiría una segunda regla que puede
 * discrepar de la de verdad.
 *
 * Lo que sí se hace es NO PEDIR lo que no hace falta: la conversación se pide
 * sólo al abrir el detalle de un viaje concreto, no al listar el historial.
 */

import {
  leerDetalle,
  leerHistorial,
  leerMensajes,
  type DetalleReal,
  type MensajeReal,
  type ViajeDeHistorial
} from '../domain/viajes';
import type { Resultado } from '../domain/apiResult';
import { llamar } from './api';
import { leerToken } from './session';

/**
 * El historial de quien tiene la sesión abierta.
 *
 * El mismo endpoint sirve a la pasajera y al conductor: el servidor filtra por
 * `passengerId` o por `driverId` según el rol. No hacen falta dos llamadas ni
 * dos implementaciones.
 */
export async function pedirHistorial(): Promise<Resultado<readonly ViajeDeHistorial[]>> {
  const respuesta = await llamar<unknown>('/api/trips/me/history');
  if (!respuesta.ok) return respuesta;
  // El servidor ya los ordena por fecha de cierre descendente.
  return { ok: true, datos: leerHistorial(respuesta.datos) };
}

/** El registro completo de un viaje. 403 si quien pregunta no participó. */
export async function pedirViaje(id: string): Promise<Resultado<DetalleReal>> {
  const respuesta = await llamar<unknown>(`/api/trips/${encodeURIComponent(id)}`);
  if (!respuesta.ok) return respuesta;

  const detalle = leerDetalle(respuesta.datos);
  if (detalle === null) {
    return {
      ok: false,
      motivo: 'RESPUESTA_INVALIDA',
      codigo: null,
      mensaje: 'El servidor devolvió un viaje que no se puede leer.'
    };
  }
  return { ok: true, datos: detalle };
}

/**
 * La conversación archivada de un viaje.
 *
 * Es una llamada aparte a propósito: el detalle se puede pintar sin ella, y un
 * fallo al traer los mensajes no debe dejar la pantalla en blanco.
 */
export async function pedirMensajes(id: string): Promise<Resultado<readonly MensajeReal[]>> {
  const respuesta = await llamar<unknown>(`/api/trips/${encodeURIComponent(id)}/messages`);
  if (!respuesta.ok) return respuesta;
  return { ok: true, datos: leerMensajes(respuesta.datos) };
}

/**
 * Cómo pedir la imagen de un adjunto.
 *
 * `GET /api/chat-media/:id/content` EXIGE sesión y comprueba que quien pide
 * participó en ese viaje. Un identificador inexistente, uno malformado y uno
 * ajeno responden exactamente igual, así que desde fuera no se puede averiguar
 * nada.
 *
 * Aquí no se amplía nada de eso: se manda el identificador público —el mismo
 * que vino en el mensaje— con la cabecera de la sesión. La clave del almacén
 * nunca sale del servidor.
 */
export async function fuenteDeAdjunto(
  adjuntoId: string
): Promise<{ readonly uri: string; readonly headers: Record<string, string> } | null> {
  if (adjuntoId === '') return null;
  const token = await leerToken();
  if (!token) return null;

  const { configuracion } = await import('../config/environment');
  if (!configuracion.ok) return null;

  return {
    uri: `${configuracion.urlBase}/api/chat-media/${encodeURIComponent(adjuntoId)}/content`,
    headers: { authorization: `Bearer ${token}` }
  };
}
