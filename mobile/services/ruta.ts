/**
 * La ruta del viaje, pedida al servidor.
 *
 * EL TELÉFONO NO DECIDE POR DÓNDE VA
 *
 * No manda origen, ni destino, ni la posición del conductor: manda el
 * identificador del viaje y recibe la geometría ya trazada. Quién va a dónde en
 * cada momento lo decide el servidor —`server/domain/rutaDelViaje.js`— y de
 * dónde sale la línea, también.
 *
 * Eso es lo que impide que una pantalla dibuje una ruta que se ha inventado, y
 * es la misma regla que ya rige la distancia y el precio: el cliente dice DÓNDE
 * está; nunca CUÁNTO ni POR DÓNDE.
 *
 * AQUÍ SÓLO ESTÁ LA LLAMADA
 *
 * Entender la respuesta es `domain/rutaDelViaje.ts`, que es puro y se puede
 * comprobar sin emulador. Este fichero es la parte que toca la red, y nada más.
 */

import { leerRuta, type RespuestaDeRuta } from '../domain/rutaDelViaje';
import { llamar } from './api';

export type {
  PuntoDeRuta,
  RespuestaDeRuta,
  RutaAusente,
  RutaDisponible,
  TramoDeRuta
} from '../domain/rutaDelViaje';

/**
 * Pide la ruta de un viaje.
 *
 * Devuelve `null` SÓLO cuando la petición no llegó a contestar —sin red, o el
 * servidor caído—. Es distinto de «contestó que no hay ruta»: lo primero
 * significa que la ruta que ya se tenía sigue siendo la mejor información
 * disponible, y lo segundo que hay que dejar de dibujarla.
 */
export async function pedirRutaDelViaje(viajeId: string): Promise<RespuestaDeRuta | null> {
  if (viajeId === '') return null;

  const respuesta = await llamar<Record<string, unknown>>(`/api/trips/${encodeURIComponent(viajeId)}/route`);
  if (!respuesta.ok) return null;

  return leerRuta(respuesta.datos);
}
