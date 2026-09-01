/**
 * Qué se pinta en el mapa, sin decir con qué mapa.
 *
 * POR QUÉ ESTA CAPA EXISTE
 *
 * `react-native-maps` en el teléfono y la API de Google en el navegador son dos
 * bibliotecas distintas con dos formas distintas de nombrar lo mismo. Si cada
 * pantalla hablara con una de ellas, cambiar de proveedor —o arreglar el
 * navegador— obligaría a tocar todas.
 *
 * Aquí se declara QUÉ hay que enseñar: la cámara, los vehículos, el origen y el
 * destino. Cada adaptador lo traduce a su biblioteca, y ninguna pantalla sabe
 * cuál está debajo.
 *
 * NADA DE NEGOCIO
 *
 * En este fichero no hay estados de viaje, ni roles, ni decisiones. Sólo
 * coordenadas y comprobaciones de que son coordenadas. Quien decide qué viaje
 * se enseña es el store; quien decide qué pintar de él, la pantalla.
 */

/** Un punto de la Tierra. Grados decimales, como los guarda el backend. */
export interface Coordenada {
  readonly lat: number;
  readonly lng: number;
}

/**
 * El centro y el radio del área de servicio.
 *
 * Copiados EXACTOS de `src/utils/operatingArea.js`, que es donde vivían para la
 * aplicación web. No se importan de allí porque ese fichero es del proyecto
 * Vite y arrastrarlo aquí ataría los dos empaquetados; hay una prueba que
 * compara los dos valores y salta si alguien mueve uno sin el otro.
 */
export const CENTRO_DE_MARACAIBO: Coordenada = Object.freeze({ lat: 10.6427, lng: -71.6125 });
export const RADIO_DE_SERVICIO_KM = 60;

/**
 * Cuánto abarca la vista cuando no hay nada que encuadrar.
 *
 * Unos ocho kilómetros de lado: la ciudad se reconoce y las calles todavía se
 * leen. Con el radio de servicio entero —sesenta kilómetros— se vería el lago
 * y poco más.
 */
export const ZOOM_DE_CIUDAD = 0.075;

export interface Camara {
  readonly centro: Coordenada;
  /** Cuánta latitud y longitud abarca la vista. */
  readonly abarca: number;
}

/** La cámara por defecto: Maracaibo, sin encuadrar nada en concreto. */
export const CAMARA_DE_MARACAIBO: Camara = Object.freeze({
  centro: CENTRO_DE_MARACAIBO,
  abarca: ZOOM_DE_CIUDAD
});

export type ClaseDeMarcador = 'moto' | 'auto' | 'origen' | 'destino';

export interface Marcador {
  readonly clave: string;
  readonly clase: ClaseDeMarcador;
  readonly en: Coordenada;
  /** Grados de rumbo, para girar el vehículo. `null` si no se conoce. */
  readonly rumbo: number | null;
  /** El vehículo propio o el asignado se pinta más grande y con halo. */
  readonly destacado?: boolean;
  readonly etiqueta?: string;
}

export interface ModeloDelMapa {
  readonly camara: Camara;
  readonly marcadores: readonly Marcador[];
  /** La geometría de la ruta, cuando exista. Hoy siempre vacía: ver el informe. */
  readonly ruta: readonly Coordenada[];
  /** El retículo de «mueve el mapa, no el pin». */
  readonly eligiendoPunto: boolean;
  /** Cuánto hay que dejar libre abajo para que la hoja no tape los controles. */
  readonly aireInferior: number;
}

// ---------------------------------------------------------------------------
// Comprobar coordenadas
// ---------------------------------------------------------------------------

/**
 * `true` si es una coordenada con la que se puede pintar.
 *
 * El `(0, 0)` se rechaza a propósito: está en el golfo de Guinea y es lo que
 * sale cuando alguien deja un campo sin rellenar. Un marcador ahí no es un
 * error visible — es un mapa que se va a África sin explicación.
 */
export function esCoordenada(valor: unknown): valor is Coordenada {
  if (typeof valor !== 'object' || valor === null) return false;
  const dato = valor as Record<string, unknown>;

  const lat = dato.lat;
  const lng = dato.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return !(lat === 0 && lng === 0);
}

/** Lee una coordenada de lo que devuelve el backend, o `null`. */
export function leerCoordenada(valor: unknown): Coordenada | null {
  if (!esCoordenada(valor)) return null;
  return { lat: valor.lat, lng: valor.lng };
}

const RADIO_DE_LA_TIERRA_KM = 6371;
const grados = (valor: number): number => (valor * Math.PI) / 180;

/** Kilómetros entre dos puntos. La misma fórmula que usa el servidor. */
export function distanciaKm(desde: Coordenada, hasta: Coordenada): number {
  const dLat = grados(hasta.lat - desde.lat);
  const dLng = grados(hasta.lng - desde.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(grados(desde.lat)) * Math.cos(grados(hasta.lat)) * Math.sin(dLng / 2) ** 2;
  return RADIO_DE_LA_TIERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** `true` si el punto cae dentro del área donde +58express opera. */
export function dentroDelArea(punto: Coordenada): boolean {
  return distanciaKm(CENTRO_DE_MARACAIBO, punto) <= RADIO_DE_SERVICIO_KM;
}

// ---------------------------------------------------------------------------
// La cámara
// ---------------------------------------------------------------------------

/** Lo mínimo que puede abarcar la vista. Sin esto, dos puntos juntos la cierran hasta el absurdo. */
const ABARCA_MINIMO = 0.006;
/** Un margen alrededor de lo encuadrado, para que nada quede pegado al borde. */
const HOLGURA = 1.6;

/**
 * La cámara que encuadra todos estos puntos.
 *
 * Sin puntos válidos devuelve la de Maracaibo — nunca una vista del océano.
 * Con uno solo, lo centra sin cerrar el zoom hasta el detalle de la acera.
 */
export function camaraQueAbarca(puntos: readonly Coordenada[]): Camara {
  const validos = puntos.filter(punto => esCoordenada(punto));
  if (validos.length === 0) return CAMARA_DE_MARACAIBO;

  const latitudes = validos.map(punto => punto.lat);
  const longitudes = validos.map(punto => punto.lng);

  const centro: Coordenada = {
    lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2
  };

  const alto = Math.max(...latitudes) - Math.min(...latitudes);
  const ancho = Math.max(...longitudes) - Math.min(...longitudes);
  const abarca = Math.max(alto, ancho) * HOLGURA;

  return { centro, abarca: Math.max(abarca, ABARCA_MINIMO) };
}

/**
 * `true` si la cámara cambió lo bastante como para MOVERLA.
 *
 * El mapa es caro y una animación por cada repintado lo deja temblando. Esta
 * comparación es la que impide recentrar en cada render: sólo se mueve cuando
 * el destino está de verdad en otro sitio.
 *
 * El umbral es grueso a propósito —unos cincuenta metros de latitud— porque lo
 * que se persigue no es precisión, es no moverse por nada.
 */
const UMBRAL_DE_CENTRO = 0.0005;
const UMBRAL_DE_ZOOM = 0.002;

export function mereceMoverse(anterior: Camara | null, siguiente: Camara): boolean {
  if (anterior === null) return true;
  return Math.abs(anterior.centro.lat - siguiente.centro.lat) > UMBRAL_DE_CENTRO
    || Math.abs(anterior.centro.lng - siguiente.centro.lng) > UMBRAL_DE_CENTRO
    || Math.abs(anterior.abarca - siguiente.abarca) > UMBRAL_DE_ZOOM;
}
