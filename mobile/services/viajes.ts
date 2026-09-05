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

/**
 * El viaje activo de quien tiene la sesión abierta, o `null` si no hay ninguno.
 *
 * EL 204 ES UNA RESPUESTA, NO UN FALLO
 *
 * `GET /api/trips/active/me` responde 204 SIN CUERPO cuando no hay viaje. Eso
 * no es un error: es la autoridad diciendo que no hay. Se traduce a `null`, que
 * sí limpia el estado, a diferencia de un fallo de red.
 *
 * Y OJO CON LA VENTANA DEL SERVIDOR
 *
 * El endpoint no devuelve cualquier viaje abierto: un `SEARCHING` deja de
 * salir a los TRES MINUTOS de crearse, y el resto a las DOCE HORAS. Un viaje
 * puede seguir vivo en la base y ya no contar como activo. Esa regla es del
 * servidor y aquí no se replica.
 */
export async function pedirViajeActivo(): Promise<Resultado<DetalleReal | null>> {
  const respuesta = await llamar<unknown>('/api/trips/active/me');
  if (!respuesta.ok) return respuesta;

  // 204: el cliente devuelve `undefined` como datos.
  if (respuesta.datos === undefined || respuesta.datos === null) {
    return { ok: true, datos: null };
  }

  const detalle = leerDetalle(respuesta.datos);
  if (detalle === null) {
    return {
      ok: false,
      motivo: 'RESPUESTA_INVALIDA',
      codigo: null,
      mensaje: 'El servidor devolvió un viaje activo que no se puede leer.'
    };
  }
  return { ok: true, datos: detalle };
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
 * Cómo traer la imagen de un adjunto.
 *
 * `GET /api/chat-media/:id/content` EXIGE sesión y comprueba que quien pide
 * participó en ese viaje. Un identificador inexistente, uno malformado y uno
 * ajeno responden exactamente igual, así que desde fuera no se puede averiguar
 * nada.
 *
 * SE TRAEN LOS BYTES CON LA SESIÓN, NO SE LE DA UNA URL A `<Image>`.
 *
 * Antes se devolvía la URL con la cabecera para que `<Image source>` la
 * pidiera por su cuenta. En el dispositivo esa carga fallaba: la imagen llegaba
 * en blanco o como «no se pudo cargar» aunque el servidor la sirviera bien.
 * Depender de que el cargador nativo de imágenes reenvíe cabeceras propias es
 * frágil —cambia con la arquitectura y la versión—. Así que se pide con el
 * mismo `fetch` que usa toda la API (ése SÍ lleva el token, siempre) y se
 * entrega como data URI, que `<Image>` pinta sin pedir nada a nadie.
 *
 * Lo que vuelve vive en memoria de la pantalla que lo pidió y muere con ella:
 * no hay URL pública, ni permanente, ni nada en disco. El identificador que se
 * manda es el público —el mismo que vino en el mensaje— y la clave del almacén
 * nunca sale del servidor.
 */
export async function fuenteDeAdjunto(
  adjuntoId: string
): Promise<{ readonly uri: string; readonly headers?: Record<string, string> } | null> {
  if (adjuntoId === '') return null;
  const token = await leerToken();
  if (!token) return null;

  const { configuracion } = await import('../config/environment');
  if (!configuracion.ok) return null;

  try {
    const respuesta = await fetch(
      `${configuracion.urlBase}/api/chat-media/${encodeURIComponent(adjuntoId)}/content`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (!respuesta.ok) return null;
    const blob = await respuesta.blob();
    const dataUri = await new Promise<string | null>(resolve => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(typeof lector.result === 'string' ? lector.result : null);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    });
    return dataUri === null ? null : { uri: dataUri };
  } catch {
    return null;
  }
}
