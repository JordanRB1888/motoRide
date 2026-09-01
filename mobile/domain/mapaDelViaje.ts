/**
 * Qué se pinta en el mapa de un viaje.
 *
 * Traduce el viaje del servidor al modelo del mapa. Ninguna pantalla construye
 * marcadores: los recibe hechos.
 *
 * LO QUE NO HAY, NO SE PINTA
 *
 * Tres ausencias reales, y ninguna se rellena:
 *
 *   · Un viaje puede no traer coordenadas —quien lo pidió escribió la
 *     dirección a mano—. Ese marcador no se pinta. NO se geocodifica desde el
 *     teléfono: inventaría una posición y el usuario la creería.
 *
 *   · La posición del conductor NO viaja en `/api/trips/active/me`.
 *     `driverPublicProfile` publica nombre, vehículo y valoración, y ninguna
 *     coordenada. Llega por el evento `driverLocationUpdated`, que todavía no
 *     está conectado. Hasta entonces, no hay moto en el mapa — y es preferible
 *     a poner una donde no está.
 *
 *   · No hay geometría de ruta. El servidor calcula distancias para el
 *     despacho pero no publica el trazado, y pedírselo a Google desde el
 *     teléfono exigiría otra clave y otro coste sólo para dibujar una línea.
 */

import {
  camaraQueAbarca,
  CAMARA_DE_MARACAIBO,
  type Coordenada,
  type Marcador,
  type ModeloDelMapa
} from '../mapa/modelo';
import type { DetalleReal } from './viajes';

/**
 * Cuánto hay que dejar libre abajo.
 *
 * La hoja inferior tapa la parte de abajo del mapa, y ahí es donde Google pone
 * su logotipo, que es obligatorio y no se puede ocultar. Este relleno lo
 * empuja hacia arriba.
 */
export const AIRE_BAJO_LA_HOJA = 220;

/**
 * El mapa de un viaje.
 *
 * `conductorEn` entra aparte porque no viene del viaje: cuando el evento de
 * ubicación se conecte, se pasará por aquí sin tocar nada más.
 */
export function mapaDelViaje(
  viaje: DetalleReal | null,
  opciones: {
    readonly conductorEn?: Coordenada | null;
    readonly rumboDelConductor?: number | null;
    readonly eligiendoPunto?: boolean;
    readonly aireInferior?: number;
  } = {}
): ModeloDelMapa {
  const marcadores: Marcador[] = [];
  const puntos: Coordenada[] = [];

  if (viaje !== null) {
    if (viaje.origenEn !== null) {
      marcadores.push({
        clave: 'origen',
        clase: 'origen',
        en: viaje.origenEn,
        rumbo: null,
        etiqueta: viaje.origen
      });
      puntos.push(viaje.origenEn);
    }
    if (viaje.destinoEn !== null) {
      marcadores.push({
        clave: 'destino',
        clase: 'destino',
        en: viaje.destinoEn,
        rumbo: null,
        etiqueta: viaje.destino
      });
      puntos.push(viaje.destinoEn);
    }
  }

  // El conductor, sólo si de verdad se sabe dónde está.
  const conductorEn = opciones.conductorEn ?? null;
  if (conductorEn !== null) {
    marcadores.push({
      clave: 'conductor',
      clase: viaje?.tipoDeVehiculo === 'CAR' ? 'auto' : 'moto',
      en: conductorEn,
      // Sin rumbo real no se inventa uno: sobre un mapa, la orientación de la
      // moto se lee como información.
      rumbo: opciones.rumboDelConductor ?? null,
      destacado: true
    });
    puntos.push(conductorEn);
  }

  return {
    // Sin ningún punto válido, la ciudad. Nunca una vista del océano.
    camara: puntos.length === 0 ? CAMARA_DE_MARACAIBO : camaraQueAbarca(puntos),
    marcadores,
    // Pendiente: el servidor no publica geometría de ruta.
    ruta: [],
    eligiendoPunto: opciones.eligiendoPunto === true,
    aireInferior: opciones.aireInferior ?? AIRE_BAJO_LA_HOJA
  };
}
