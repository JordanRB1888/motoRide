/**
 * Calidad de las muestras de ubicación — GPS-1.
 *
 * Una lectura de GPS es más que un par lat/lng: trae PRECISIÓN (metros de
 * incertidumbre) y MOMENTO (cuándo se midió). Este módulo normaliza cualquier
 * lectura a un contrato único y decide si una muestra nueva merece sustituir
 * a la vigente. Es puro: sin navegador, sin red, sin estado — la misma lógica
 * podrá alimentarse mañana desde Android (FusedLocation) o iOS (CoreLocation)
 * con solo normalizar sus lecturas a este contrato.
 *
 *   lectura de la plataforma → normalizeLocationSample → evaluateLocationSample
 *                                                        → ubicación de la app
 *
 * Reglas de diseño, en orden de prioridad:
 *
 *  1. JAMÁS se fabrica un valor: si la plataforma no dio accuracy, va null;
 *     el timestamp es el de la MEDICIÓN, nunca el del render ni el de una
 *     reconexión (contrato de GPS-0 extendido).
 *  2. Conservador con los rechazos: perder una muestra legítima de una moto
 *     en marcha es peor que aceptar una mediocre. Solo se rechaza con
 *     evidencia fuerte, y la incertidumbre (accuracy) siempre descuenta a
 *     favor de la muestra.
 *  3. El servidor no cambia: su regla de frescura (STALE_LOCATION, 120 s)
 *     sigue siendo la autoridad del despacho. Aquí solo se evita alimentarlo
 *     con muestras evidentemente viejas o imposibles.
 */

// ---------------------------------------------------------------------------
// Constantes con nombre. Cada número lleva su porqué.
// ---------------------------------------------------------------------------

/**
 * Una muestra más vieja que esto no puede entrar como «posición actual».
 * Los navegadores pueden servir lecturas de caché con timestamp antiguo;
 * 30 s es holgado para cualquier watchPosition vivo y queda muy por debajo
 * de los 120 s del servidor, al que esta regla no sustituye.
 */
export const MAX_SAMPLE_AGE_MS = 30_000;

/** Hasta aquí la lectura se considera buena de verdad (GPS con señal). */
export const GOOD_ACCURACY_METERS = 25;

/**
 * Peor que esto es una lectura de torre celular / IP, no de GPS. No se
 * descarta por sí sola —puede ser lo único que hay—, pero no puede pisar a
 * una lectura materialmente mejor y reciente.
 */
export const POOR_ACCURACY_METERS = 150;

/**
 * Una muestra pobre solo sustituye a una buena si la buena ya envejeció esto.
 * Mientras la buena sea reciente, el marcador no salta cientos de metros por
 * culpa de una lectura de wifi. Pasada la gracia, mejor algo que nada.
 */
export const POOR_REPLACEMENT_GRACE_MS = 15_000;

/**
 * Cuántas veces peor debe ser la precisión para considerarla «materialmente
 * peor». 3× evita que una oscilación normal (8 m → 20 m) cuente como
 * degradación.
 */
export const POOR_DEGRADATION_FACTOR = 3;

/**
 * Velocidad implícita por encima de la cual un desplazamiento es imposible
 * para una moto urbana. 150 km/h deja margen sobre cualquier tramo real de
 * Maracaibo; solo se aplica a la distancia que la incertidumbre de AMBAS
 * muestras no explica (sobre la distancia cruda castigaría lecturas ruidosas
 * legítimas).
 */
export const MAX_PLAUSIBLE_SPEED_KMH = 150;

/**
 * Por debajo de este intervalo la velocidad implícita se calcula sobre este
 * suelo: dos muestras casi simultáneas con ruido normal darían velocidades
 * absurdas por dividir entre milisegundos.
 */
export const MIN_ELAPSED_FOR_SPEED_MS = 1_000;

/** Categorías sanitizadas para telemetría. Nunca llevan coordenadas. */
export const LOCATION_QUALITY = Object.freeze({
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  POOR: 'POOR'
});

export const SAMPLE_REJECTION = Object.freeze({
  INVALID: 'INVALID',
  STALE_SAMPLE: 'STALE_SAMPLE',
  REJECTED_JUMP: 'REJECTED_JUMP',
  POOR_REPLACING_BETTER: 'POOR_REPLACING_BETTER'
});

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

const numeroFinito = valor => (Number.isFinite(Number(valor)) ? Number(valor) : null);

/**
 * Normaliza una lectura de la plataforma al contrato único.
 *
 * Acepta el `Position` del navegador ({coords, timestamp}) o un objeto plano
 * ({lat/latitude, lng/longitude, accuracy, timestamp}). No inventa nada: sin
 * accuracy queda null; sin timestamp queda null (y la aceptación lo tratará
 * como no fechable, no como fresco).
 */
export function normalizeLocationSample(lectura) {
  if (!lectura || typeof lectura !== 'object') return null;
  const coords = lectura.coords && typeof lectura.coords === 'object' ? lectura.coords : lectura;

  const lat = numeroFinito(coords.latitude ?? coords.lat);
  const lng = numeroFinito(coords.longitude ?? coords.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return {
    lat,
    lng,
    accuracy: numeroFinito(coords.accuracy),
    timestamp: numeroFinito(lectura.timestamp ?? coords.timestamp)
  };
}

// ---------------------------------------------------------------------------
// Distancia (semiverseno completo: aquí sí importan saltos grandes)
// ---------------------------------------------------------------------------

const RADIO_TERRESTRE_M = 6_371_000;
const RAD = Math.PI / 180;

export function distanceBetweenMeters(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TERRESTRE_M * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Etiqueta de calidad de UNA muestra. Sin accuracy no hay evidencia: FAIR. */
export function qualityOf(sample) {
  const accuracy = sample?.accuracy;
  if (!Number.isFinite(accuracy)) return LOCATION_QUALITY.FAIR;
  if (accuracy <= GOOD_ACCURACY_METERS) return LOCATION_QUALITY.GOOD;
  if (accuracy <= POOR_ACCURACY_METERS) return LOCATION_QUALITY.FAIR;
  return LOCATION_QUALITY.POOR;
}

// ---------------------------------------------------------------------------
// Aceptación
// ---------------------------------------------------------------------------

/**
 * ¿Debe esta muestra convertirse en la ubicación vigente?
 *
 * @param {object|null} candidate  muestra normalizada nueva
 * @param {object} [contexto]
 * @param {object|null} [contexto.previous]  última muestra ACEPTADA
 * @param {number} [contexto.now]
 * @returns {{accept: boolean, quality: string, reason: string}}
 */
export function evaluateLocationSample(candidate, { previous = null, now = Date.now() } = {}) {
  if (!candidate) {
    return { accept: false, quality: LOCATION_QUALITY.POOR, reason: SAMPLE_REJECTION.INVALID };
  }

  const quality = qualityOf(candidate);

  // Muestra vieja: una lectura de caché no puede presentarse como posición
  // actual por el mero hecho de acabar de llegar al código.
  if (Number.isFinite(candidate.timestamp) && now - candidate.timestamp > MAX_SAMPLE_AGE_MS) {
    return { accept: false, quality, reason: SAMPLE_REJECTION.STALE_SAMPLE };
  }

  if (previous && Number.isFinite(previous.lat) && Number.isFinite(previous.lng)) {
    const distancia = distanceBetweenMeters(previous, candidate);

    // Envolvente de incertidumbre: la parte del salto que la precisión de
    // ambas muestras puede explicar no cuenta como movimiento.
    const envolvente = (Number.isFinite(previous.accuracy) ? previous.accuracy : 0)
      + (Number.isFinite(candidate.accuracy) ? candidate.accuracy : 0);
    const movimientoReal = Math.max(0, distancia - envolvente);

    // Salto imposible: velocidad implícita sobre el movimiento NO explicado.
    const transcurrido = Number.isFinite(previous.timestamp) && Number.isFinite(candidate.timestamp)
      ? Math.max(MIN_ELAPSED_FOR_SPEED_MS, candidate.timestamp - previous.timestamp)
      : MIN_ELAPSED_FOR_SPEED_MS;
    const velocidadKmh = (movimientoReal / transcurrido) * 3600;
    if (velocidadKmh > MAX_PLAUSIBLE_SPEED_KMH) {
      return { accept: false, quality, reason: SAMPLE_REJECTION.REJECTED_JUMP };
    }

    // Lectura pobre pisando a una buena reciente: el marcador no salta
    // cientos de metros porque el wifi opinó después que el GPS.
    const previaEsMejor = Number.isFinite(previous.accuracy)
      && Number.isFinite(candidate.accuracy)
      && candidate.accuracy > POOR_ACCURACY_METERS
      && candidate.accuracy > previous.accuracy * POOR_DEGRADATION_FACTOR;
    const previaReciente = Number.isFinite(previous.timestamp)
      && now - previous.timestamp <= POOR_REPLACEMENT_GRACE_MS;
    if (previaEsMejor && previaReciente) {
      return { accept: false, quality, reason: SAMPLE_REJECTION.POOR_REPLACING_BETTER };
    }
  }

  return { accept: true, quality, reason: quality };
}
