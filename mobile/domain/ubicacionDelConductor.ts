/**
 * Dónde está la moto que viene a buscarte.
 *
 * QUÉ DECIDE ESTE FICHERO
 *
 * Qué eventos de posición se creen y cuáles se tiran. Es puro: sin socket, sin
 * React, sin reloj propio. Todo lo que decide se puede probar.
 *
 * CUATRO FORMAS DE EQUIVOCARSE, Y CÓMO SE EVITAN
 *
 *  1. Pintar la moto de OTRO conductor. El servidor ya manda el evento sólo al
 *     pasajero del viaje, pero el cliente vuelve a comprobarlo: `driverId` y
 *     `tripId` tienen que cuadrar con el viaje que se está mirando. Es la misma
 *     defensa que lleva la aplicación web.
 *
 *  2. Hacerla retroceder. La red no garantiza el orden: un evento medido antes
 *     puede llegar después. Una muestra más vieja que la vigente se ignora.
 *
 *  3. Enseñarla donde estaba hace diez minutos. Si deja de llegar posición, la
 *     última deja de ser «dónde está» y pasa a ser «dónde estuvo». El umbral
 *     no se inventa: es el mismo que el despacho usa para descartar a un
 *     conductor por ubicación rancia.
 *
 *  4. Dejar una moto fantasma. Si cambia el conductor asignado o el viaje
 *     termina, la posición anterior deja de significar nada.
 */

import { esCoordenada, type Coordenada } from '../mapa/modelo';

/**
 * Cuándo una posición deja de valer como actual.
 *
 * Dos minutos, que es EXACTAMENTE lo que el servidor usa para descartar a un
 * conductor del despacho por ubicación rancia
 * (`server/domain/dispatchEligibility.js`, `maxLocationAgeMs`). Elegir aquí un
 * número distinto crearía dos verdades sobre el mismo dato: el servidor
 * diciendo que ese conductor ya no cuenta, y la pantalla enseñando su moto
 * como si siguiera llegando.
 *
 * Hay una prueba que compara los dos ficheros.
 */
export const EDAD_MAXIMA_MS = 120_000;

export interface PosicionDelConductor {
  readonly en: Coordenada;
  /** Grados. `null` cuando el conductor no lo sabe — no se inventa. */
  readonly rumbo: number | null;
  /** Cuándo se midió, según el servidor. */
  readonly momento: number;
  readonly conductorId: string;
  readonly viajeId: string | null;
}

/**
 * Lee un `driverLocationUpdated` del servidor.
 *
 * El servidor manda `{lat, lng, heading, updatedAt, driverId, userId, tripId}`.
 * Se aceptan también `latitude`/`longitude` porque `normalizeCoordinates`
 * admite las dos formas y otro emisor podría usar la otra.
 *
 * SOBRE EL RUMBO
 *
 * El servidor pone `heading: 0` cuando el cliente no lo mandó, así que un cero
 * no distingue «mirando al norte» de «no se sabe». Ante la duda se trata como
 * desconocido: una moto girada al norte por defecto sería información
 * inventada, y sobre un mapa la orientación se lee como un dato.
 */
export function leerUbicacionDelConductor(payload: unknown): PosicionDelConductor | null {
  if (payload === null || typeof payload !== 'object') return null;
  const crudo = payload as Record<string, unknown>;

  const lat = Number(crudo.lat ?? crudo.latitude);
  const lng = Number(crudo.lng ?? crudo.longitude);
  const en = { lat, lng };
  if (!esCoordenada(en)) return null;

  const conductorId = String(crudo.driverId ?? crudo.userId ?? '').trim();
  if (conductorId === '') return null;

  const rumboCrudo = Number(crudo.heading);
  const rumbo = Number.isFinite(rumboCrudo) && rumboCrudo !== 0
    ? ((rumboCrudo % 360) + 360) % 360
    : null;

  const momento = Number(crudo.updatedAt);
  const viajeId = String(crudo.tripId ?? '').trim();

  return {
    en,
    rumbo,
    // Sin hora del servidor se usa la de llegada: es lo único que hay, y
    // dejarla en cero la haría parecer rancia desde el primer momento.
    momento: Number.isFinite(momento) ? momento : Date.now(),
    conductorId,
    viajeId: viajeId === '' ? null : viajeId
  };
}

/**
 * ¿Esta posición sustituye a la vigente?
 *
 * `esperado` es el conductor y el viaje que la pantalla está mirando ahora
 * mismo. Si no hay conductor asignado, no hay nada que aceptar: una moto
 * apareciendo sin viaje sería la de otro.
 */
export function aceptarUbicacion(
  llegada: PosicionDelConductor | null,
  {
    vigente = null,
    esperado
  }: {
    vigente?: PosicionDelConductor | null;
    esperado: { conductorId: string | null; viajeId: string | null };
  }
): PosicionDelConductor | null {
  if (llegada === null) return vigente;

  // Sin conductor asignado no se pinta ninguna moto.
  if (esperado.conductorId === null || esperado.conductorId === '') return vigente;

  // De otro conductor: no es la moto que viene a buscarte.
  if (llegada.conductorId !== esperado.conductorId) return vigente;

  // De otro viaje. El servidor puede mandar `tripId: null` cuando el conductor
  // no tiene viaje activo; eso tampoco corresponde a esta pantalla.
  if (esperado.viajeId !== null && llegada.viajeId !== null
    && llegada.viajeId !== esperado.viajeId) return vigente;

  // Más vieja que la que ya se enseña: la red no garantiza el orden, y un
  // evento retrasado no puede hacer retroceder la moto.
  if (vigente !== null && llegada.momento < vigente.momento) return vigente;

  return llegada;
}

/**
 * Qué queda al cambiar de conductor o al terminar el viaje.
 *
 * Devuelve `null` —se borra la moto— cuando la posición guardada ya no
 * corresponde a lo que la pantalla está mirando. Una moto que se queda quieta
 * en el mapa después de terminar el viaje se lee como que sigue ahí.
 */
export function limpiarSiYaNoCorresponde(
  vigente: PosicionDelConductor | null,
  esperado: { conductorId: string | null; viajeId: string | null }
): PosicionDelConductor | null {
  if (vigente === null) return null;
  if (esperado.conductorId === null || esperado.conductorId === '') return null;
  if (vigente.conductorId !== esperado.conductorId) return null;
  if (esperado.viajeId !== null && vigente.viajeId !== null
    && vigente.viajeId !== esperado.viajeId) return null;
  return vigente;
}

/**
 * ¿La posición sigue valiendo como «dónde está»?
 *
 * Pasado el umbral deja de pintarse. Enseñar una posición de hace cinco
 * minutos como si fuera la actual manda a alguien a una esquina donde la moto
 * ya no está, y eso es peor que no enseñar nada.
 *
 * No se inventa ningún aviso nuevo en pantalla: simplemente deja de haber
 * moto, que es el comportamiento que ya tenía el mapa cuando no se sabía dónde
 * estaba el conductor.
 */
export function siguePresente(
  posicion: PosicionDelConductor | null,
  ahora: number = Date.now()
): boolean {
  if (posicion === null) return false;
  return ahora - posicion.momento <= EDAD_MAXIMA_MS;
}
