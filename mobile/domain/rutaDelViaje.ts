/**
 * Lo que el servidor dice de la ruta, traducido.
 *
 * PURO, Y POR ESO SEPARADO DEL SERVICIO
 *
 * Aquí sólo se interpreta un cuerpo de respuesta: no hay red, ni sesión, ni
 * nada de React Native. `services/ruta.ts` es quien llama; esto es quien
 * entiende lo que vuelve.
 *
 * La separación no es ceremonia. Traducir mal esta respuesta no lanza ningún
 * error: dibuja una línea a medias, o dibuja una donde no debería haberla, y
 * eso sólo se ve mirando el mapa. Con la lógica aquí se comprueba sin emulador.
 *
 * EL TELÉFONO NO DECIDE POR DÓNDE VA LA RUTA
 *
 * Quién va a dónde en cada momento —y por qué calles— lo decide el servidor.
 * Este fichero no calcula geometría: la lee. Si el servidor no manda ninguna,
 * aquí no aparece una recta entre los extremos, porque una recta sobre un mapa
 * se lee como «por aquí se va» y por ahí puede no haber calle.
 */

/** Un punto de la geometría. La misma forma que usa el modelo del mapa. */
export interface PuntoDeRuta {
  readonly lat: number;
  readonly lng: number;
}

/** Qué tramo cubre la ruta: ir a buscarla, o llevarla. */
export type TramoDeRuta = 'A_RECOGIDA' | 'A_DESTINO';

export interface RutaDisponible {
  readonly disponible: true;
  readonly tramo: TramoDeRuta;
  readonly puntos: readonly PuntoDeRuta[];
  /** Metros y milisegundos del PROVEEDOR. `null` si no los publicó. */
  readonly metros: number | null;
  readonly duracionMs: number | null;
}

export interface RutaAusente {
  readonly disponible: false;
  /**
   * Por qué no hay ruta, tal cual lo dijo el servidor.
   *
   *   NO_ROUTE_FOR_STATE            al llegar y al terminar no hay tramo
   *   NO_ROUTE_COORDINATES          falta la recogida, el destino o la moto
   *   ROUTE_PROVIDER_NOT_CONFIGURED no hay credencial de Routes
   *   ROUTE_PROVIDER_UNAVAILABLE    el proveedor falló o tardó demasiado
   */
  readonly motivo: string;
  readonly tramo: TramoDeRuta | null;
}

export type RespuestaDeRuta = RutaDisponible | RutaAusente;

/**
 * Traduce el cuerpo del servidor.
 *
 * Un cuerpo que no se entiende se lee como «no hay ruta», nunca como una ruta a
 * medias: media geometría dibuja una línea que se corta en el aire.
 */
export function leerRuta(cuerpo: unknown): RespuestaDeRuta {
  const dato = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;
  const tramo = dato.leg === 'A_RECOGIDA' || dato.leg === 'A_DESTINO' ? dato.leg : null;

  if (dato.available !== true) {
    return {
      disponible: false,
      motivo: typeof dato.reason === 'string' && dato.reason !== '' ? dato.reason : 'ROUTE_UNAVAILABLE',
      tramo
    };
  }

  const puntos = Array.isArray(dato.points) ? dato.points.filter(esPunto) : [];
  // Menos de dos puntos no es una línea. Se degrada a ausente en vez de pintar
  // una mancha donde debería haber un recorrido.
  if (puntos.length < 2 || tramo === null) {
    return { disponible: false, motivo: 'ROUTE_UNAVAILABLE', tramo };
  }

  return {
    disponible: true,
    tramo,
    puntos,
    metros: numeroONulo(dato.distanceMeters),
    duracionMs: numeroONulo(dato.durationMillis)
  };
}

/**
 * Qué tramo le toca a este estado, visto desde el cliente.
 *
 * Es un ESPEJO de `server/domain/rutaDelViaje.js`, y sirve sólo para decidir si
 * merece la pena llamar: quien manda sigue siendo el servidor, que responde con
 * su propio `leg`. Sin este espejo habría que llamar también en ARRIVED y en
 * COMPLETED para que nos contestaran que no hay ruta — una petición por cada
 * estado que no tiene ninguna.
 */
export function tramoDelEstado(estado: string): TramoDeRuta | null {
  if (estado === 'DRIVER_ASSIGNED' || estado === 'ACCEPTED' || estado === 'EN_ROUTE' || estado === 'DRIVER_ARRIVING') {
    return 'A_RECOGIDA';
  }
  if (estado === 'IN_PROGRESS' || estado === 'IN_TRIP') return 'A_DESTINO';
  return null;
}

function esPunto(valor: unknown): valor is PuntoDeRuta {
  if (typeof valor !== 'object' || valor === null) return false;
  const punto = valor as Record<string, unknown>;
  return Number.isFinite(punto.lat) && Number.isFinite(punto.lng);
}

function numeroONulo(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}
