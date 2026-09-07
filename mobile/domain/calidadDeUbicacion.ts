/**
 * Qué lectura de GPS merece creerse.
 *
 * DE DÓNDE SALE ESTO
 *
 * No es nuevo. La aplicación web ya lleva estas reglas en
 * `src/utils/locationQuality.js`, escritas y probadas contra el GPS de
 * verdad, y aquel fichero ya decía que la misma lógica podría alimentarse
 * desde Android o iOS «con sólo normalizar sus lecturas a este contrato».
 * Esto es exactamente eso: el mismo contrato, en TypeScript.
 *
 * No se copió a ojo. Hay una prueba que lee el fichero de la web y compara
 * los números uno a uno: si alguien afina un umbral allí y no aquí, salta.
 * Dos reglas distintas para el mismo GPS serían dos aplicaciones distintas.
 *
 * QUÉ RESUELVE
 *
 * El sistema operativo entrega coordenadas constantemente y no todas dicen la
 * verdad. Llegan lecturas de caché con hora vieja, lecturas de antena de
 * telefonía con cientos de metros de error, y saltos imposibles. Aceptarlas
 * todas hace que el punto del usuario baile por el mapa y que la moto parezca
 * teletransportarse.
 *
 *   lectura del sistema → normalizar → evaluar → ubicación de la aplicación
 *
 * TRES REGLAS, EN ESTE ORDEN
 *
 *  1. No se fabrica nada. Sin precisión, `null`; sin hora, `null`. Un valor
 *     inventado es peor que la ausencia, porque parece un dato.
 *  2. Se rechaza poco. Perder una lectura buena de una moto en marcha es peor
 *     que aceptar una mediocre, así que sólo se descarta con evidencia clara.
 *  3. La incertidumbre siempre juega a favor de la muestra: la parte del salto
 *     que la precisión explica no cuenta como movimiento.
 */

/** Una lectura ya normalizada. Lo que el resto de la aplicación consume. */
export interface MuestraDeUbicacion {
  readonly lat: number;
  readonly lng: number;
  /** Metros de incertidumbre, o `null` si el sistema no lo dijo. */
  readonly precision: number | null;
  /** Cuándo se MIDIÓ, no cuándo llegó al código. `null` si no vino. */
  readonly momento: number | null;
}

/**
 * Más vieja que esto no puede pasar por «dónde estás ahora».
 *
 * El sistema puede servir una lectura de caché con hora antigua. Treinta
 * segundos es holgado para cualquier observación viva y queda muy por debajo
 * de los ciento veinte que el servidor considera rancios para el despacho —a
 * los que esta regla no sustituye.
 */
export const EDAD_MAXIMA_MS = 30_000;

/** Hasta aquí la lectura es buena de verdad: GPS con señal. */
export const PRECISION_BUENA_M = 25;

/**
 * Peor que esto no es GPS: es una antena o la dirección de red. No se descarta
 * por sí sola —puede ser lo único que hay— pero no puede pisar a una lectura
 * mucho mejor y reciente.
 */
export const PRECISION_POBRE_M = 150;

/** Una pobre sólo sustituye a una buena cuando la buena ya envejeció esto. */
export const GRACIA_DE_LA_POBRE_MS = 15_000;

/** Cuántas veces peor tiene que ser para contar como degradación de verdad. */
export const FACTOR_DE_DEGRADACION = 3;

/**
 * Por encima de esto el desplazamiento es imposible para una moto urbana.
 *
 * Se aplica sólo a la distancia que la incertidumbre NO explica: sobre la
 * distancia cruda castigaría lecturas ruidosas que son legítimas.
 */
export const VELOCIDAD_MAXIMA_KMH = 150;

/** Suelo de tiempo: dos muestras casi simultáneas darían velocidades absurdas. */
export const INTERVALO_MINIMO_MS = 1_000;

export const CALIDAD = Object.freeze({
  BUENA: 'BUENA',
  ACEPTABLE: 'ACEPTABLE',
  POBRE: 'POBRE'
} as const);

export type Calidad = (typeof CALIDAD)[keyof typeof CALIDAD];

export const RECHAZO = Object.freeze({
  INVALIDA: 'INVALIDA',
  VIEJA: 'VIEJA',
  SALTO_IMPOSIBLE: 'SALTO_IMPOSIBLE',
  POBRE_PISANDO_BUENA: 'POBRE_PISANDO_BUENA'
} as const);

export type Rechazo = (typeof RECHAZO)[keyof typeof RECHAZO];

const finito = (valor: unknown): number | null =>
  Number.isFinite(Number(valor)) ? Number(valor) : null;

/**
 * Pasa una lectura del sistema al contrato único.
 *
 * Acepta la forma de `expo-location` (`{coords, timestamp}`) y también un
 * objeto plano, que es lo que llega del navegador y lo que usan las pruebas.
 * Devuelve `null` cuando no hay una coordenada creíble: fuera de rango, no
 * numérica, o el (0,0) —que en la práctica es un campo sin rellenar, no el
 * golfo de Guinea—.
 */
export function normalizarUbicacion(lectura: unknown): MuestraDeUbicacion | null {
  if (lectura === null || typeof lectura !== 'object') return null;
  const cruda = lectura as Record<string, unknown>;
  const coords = (cruda.coords !== null && typeof cruda.coords === 'object'
    ? cruda.coords
    : cruda) as Record<string, unknown>;

  const lat = finito(coords.latitude ?? coords.lat);
  const lng = finito(coords.longitude ?? coords.lng);
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return {
    lat,
    lng,
    precision: finito(coords.accuracy),
    momento: finito(cruda.timestamp ?? coords.timestamp)
  };
}

const RADIO_TERRESTRE_M = 6_371_000;
const RAD = Math.PI / 180;

/** Distancia en metros. Semiverseno completo: aquí importan los saltos grandes. */
export function metrosEntre(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TERRESTRE_M * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Qué tal es UNA muestra. Sin precisión no hay evidencia: aceptable. */
export function calidadDe(muestra: MuestraDeUbicacion | null): Calidad {
  const precision = muestra?.precision;
  if (precision === null || precision === undefined || !Number.isFinite(precision)) {
    return CALIDAD.ACEPTABLE;
  }
  if (precision <= PRECISION_BUENA_M) return CALIDAD.BUENA;
  if (precision <= PRECISION_POBRE_M) return CALIDAD.ACEPTABLE;
  return CALIDAD.POBRE;
}

export interface Veredicto {
  readonly aceptar: boolean;
  readonly calidad: Calidad;
  readonly motivo: Calidad | Rechazo;
}

/**
 * ¿Esta muestra pasa a ser la ubicación vigente?
 *
 * `anterior` es la última ACEPTADA, no la última recibida: si no, una racha de
 * lecturas malas se iría validando entre ellas.
 */
export function evaluarUbicacion(
  candidata: MuestraDeUbicacion | null,
  { anterior = null, ahora = Date.now() }: {
    anterior?: MuestraDeUbicacion | null;
    ahora?: number;
  } = {}
): Veredicto {
  if (candidata === null) {
    return { aceptar: false, calidad: CALIDAD.POBRE, motivo: RECHAZO.INVALIDA };
  }

  const calidad = calidadDe(candidata);

  // Una lectura de caché no puede presentarse como posición actual sólo
  // porque acabe de llegar al código.
  if (candidata.momento !== null && ahora - candidata.momento > EDAD_MAXIMA_MS) {
    return { aceptar: false, calidad, motivo: RECHAZO.VIEJA };
  }

  if (anterior !== null) {
    const distancia = metrosEntre(anterior, candidata);

    // La parte del salto que la precisión de las dos muestras puede explicar
    // no cuenta como movimiento.
    const envolvente = (anterior.precision ?? 0) + (candidata.precision ?? 0);
    const movimientoReal = Math.max(0, distancia - envolvente);

    const transcurrido = anterior.momento !== null && candidata.momento !== null
      ? Math.max(INTERVALO_MINIMO_MS, candidata.momento - anterior.momento)
      : INTERVALO_MINIMO_MS;

    if ((movimientoReal / transcurrido) * 3600 > VELOCIDAD_MAXIMA_KMH) {
      return { aceptar: false, calidad, motivo: RECHAZO.SALTO_IMPOSIBLE };
    }

    // Que el wifi opine después que el GPS no puede mover el punto cientos de
    // metros mientras la lectura buena siga siendo reciente.
    const degradaMucho = anterior.precision !== null
      && candidata.precision !== null
      && candidata.precision > PRECISION_POBRE_M
      && candidata.precision > anterior.precision * FACTOR_DE_DEGRADACION;
    const anteriorReciente = anterior.momento !== null
      && ahora - anterior.momento <= GRACIA_DE_LA_POBRE_MS;

    if (degradaMucho && anteriorReciente) {
      return { aceptar: false, calidad, motivo: RECHAZO.POBRE_PISANDO_BUENA };
    }
  }

  return { aceptar: true, calidad, motivo: calidad };
}
