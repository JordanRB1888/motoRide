/**
 * Motor de progresión sobre una ruta — MAPS-2C.
 *
 * Puro y sin plataforma: recibe la ruta NORMALIZADA (navigationRoute.js) y
 * muestras GPS YA ACEPTADAS por el filtro de calidad (GPS-1), y responde a
 * las preguntas de la guía:
 *
 *   ¿en qué paso voy? ¿cuánto falta para la maniobra? ¿cuánto queda de ruta
 *   y de tiempo? ¿me salí de la ruta de verdad? ¿toca recalcular YA o hay
 *   que esperar?
 *
 * Nada de aquí toca la tarifa, el despacho ni el estado del viaje: llegar
 * cerca del destino solo INDICA llegada — la transición del viaje sigue
 * siendo un gesto del conductor.
 *
 * La misma división vale para las apps nativas futuras:
 *   proveedor de ruta de la plataforma → ruta normalizada → ESTE motor → UI.
 */

// ---------------------------------------------------------------------------
// Constantes con nombre — cada número lleva su porqué
// ---------------------------------------------------------------------------

/**
 * A menos de esta distancia perpendicular de la ruta se está EN ruta. La
 * incertidumbre de la muestra (accuracy) se SUMA a este umbral: una lectura
 * de ±40 m a 60 m de la línea no es evidencia de desvío.
 */
export const OFF_ROUTE_BASE_THRESHOLD_M = 50;

/**
 * Una muestra con accuracy peor que esto no puede acusar un desvío: no es
 * evidencia creíble ni para sospechar.
 */
export const OFF_ROUTE_MAX_CREDIBLE_ACCURACY_M = 100;

/**
 * Desvíos creíbles CONSECUTIVOS necesarios para confirmar el fuera-de-ruta.
 * Una muestra ruidosa aislada jamás dispara un recálculo.
 */
export const OFF_ROUTE_CONFIRMATION_SAMPLES = 3;

/**
 * Tras un recálculo no se permite otro durante esta ventana: un tramo con
 * GPS malo no puede convertirse en una tormenta de peticiones a Google.
 */
export const REROUTE_COOLDOWN_MS = 30_000;

/** Nunca hay más de un recálculo en vuelo. */
export const MAX_CONCURRENT_REROUTES = 1;

/**
 * A esta distancia del final (más la incertidumbre de la muestra) la guía
 * INDICA llegada. Solo indicación: ningún estado de negocio cambia solo.
 */
export const ARRIVAL_THRESHOLD_M = 30;

/**
 * El avance a un paso posterior exige rebasar su inicio por más que la
 * incertidumbre; retroceder de paso está prohibido salvo ruta nueva: el
 * jitter del GPS no puede hacer oscilar la instrucción 5→4→5.
 */
export const STEP_ADVANCE_HYSTERESIS_M = 15;

export const OFF_ROUTE_STATE = Object.freeze({
  ON_ROUTE: 'ON_ROUTE',
  SUSPECTED: 'SUSPECTED_OFF_ROUTE',
  CONFIRMED: 'CONFIRMED_OFF_ROUTE'
});

// ---------------------------------------------------------------------------
// Geometría plana local (equirectangular): exacta de sobra a escala urbana
// ---------------------------------------------------------------------------

const RADIO_M = 6_371_000;
const RAD = Math.PI / 180;

function aMetros(origen, punto) {
  const x = (punto.lng - origen.lng) * RAD * Math.cos(origen.lat * RAD) * RADIO_M;
  const y = (punto.lat - origen.lat) * RAD * RADIO_M;
  return { x, y };
}

/**
 * Proyección de un punto sobre una polilínea.
 *
 * @returns {{segmentIndex, distanceFromRouteMeters, distanceAlongRouteMeters,
 *            projected: {lat, lng}} | null}
 */
export function projectOntoPath(path, point) {
  if (!Array.isArray(path) || path.length < 2 || !point) return null;
  const origen = path[0];
  const puntos = path.map(p => aMetros(origen, p));
  const p = aMetros(origen, point);

  let mejor = null;
  let acumulada = 0;
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const a = puntos[i];
    const b = puntos[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2));
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    const dist = Math.hypot(p.x - qx, p.y - qy);
    if (!mejor || dist < mejor.distanceFromRouteMeters) {
      mejor = {
        segmentIndex: i,
        distanceFromRouteMeters: dist,
        distanceAlongRouteMeters: acumulada + Math.sqrt(largo2) * t,
        projected: {
          lat: origen.lat + (qy / RADIO_M) / RAD,
          lng: origen.lng + (qx / (RADIO_M * Math.cos(origen.lat * RAD))) / RAD
        }
      };
    }
    acumulada += Math.sqrt(largo2);
  }
  if (mejor) mejor.totalPathMeters = acumulada;
  return mejor;
}

// ---------------------------------------------------------------------------
// El rastreador de progreso
// ---------------------------------------------------------------------------

/**
 * @param {object} route  ruta normalizada de navigationRoute.js
 * @param {object} [opciones] umbrales con los valores por defecto de arriba
 */
export function createRouteProgressTracker(route, {
  offRouteBaseThresholdM = OFF_ROUTE_BASE_THRESHOLD_M,
  offRouteMaxCredibleAccuracyM = OFF_ROUTE_MAX_CREDIBLE_ACCURACY_M,
  offRouteConfirmationSamples = OFF_ROUTE_CONFIRMATION_SAMPLES,
  arrivalThresholdM = ARRIVAL_THRESHOLD_M,
  stepAdvanceHysteresisM = STEP_ADVANCE_HYSTERESIS_M
} = {}) {
  if (!Array.isArray(route?.path) || route.path.length < 2) return null;

  // Inicio de cada paso medido SOBRE la ruta (por proyección de su extremo):
  // así la progresión y la distancia a la maniobra comparten la misma regla.
  const inicioDePaso = (route.steps ?? []).map(step => {
    const proyeccion = step.startLocation ? projectOntoPath(route.path, step.startLocation) : null;
    return proyeccion ? proyeccion.distanceAlongRouteMeters : null;
  });

  let currentStepIndex = 0;
  let desviosConsecutivos = 0;
  let offRouteState = OFF_ROUTE_STATE.ON_ROUTE;

  return {
    get route() { return route; },

    /**
     * Procesa UNA muestra aceptada. Devuelve el estado de guía o null si la
     * muestra no se puede proyectar.
     */
    update(sample) {
      const posicion = { lat: Number(sample?.lat), lng: Number(sample?.lng) };
      if (!Number.isFinite(posicion.lat) || !Number.isFinite(posicion.lng)) return null;
      const accuracy = Number.isFinite(Number(sample?.accuracy)) ? Number(sample.accuracy) : 0;

      const proyeccion = projectOntoPath(route.path, posicion);
      if (!proyeccion) return null;

      // ----- fuera de ruta, con la incertidumbre a favor del conductor -----
      const umbral = offRouteBaseThresholdM + accuracy;
      const credible = accuracy <= offRouteMaxCredibleAccuracyM;
      if (proyeccion.distanceFromRouteMeters > umbral && credible) {
        desviosConsecutivos += 1;
        offRouteState = desviosConsecutivos >= offRouteConfirmationSamples
          ? OFF_ROUTE_STATE.CONFIRMED
          : OFF_ROUTE_STATE.SUSPECTED;
      } else if (proyeccion.distanceFromRouteMeters <= umbral) {
        desviosConsecutivos = 0;
        offRouteState = OFF_ROUTE_STATE.ON_ROUTE;
      }
      // Muestra no creíble (accuracy pobre): no acusa ni absuelve — el estado
      // y el contador quedan como estaban.

      // ----- paso activo: solo hacia delante -----
      for (let i = inicioDePaso.length - 1; i > currentStepIndex; i -= 1) {
        if (inicioDePaso[i] !== null
          && proyeccion.distanceAlongRouteMeters >= inicioDePaso[i] + stepAdvanceHysteresisM) {
          currentStepIndex = i;
          break;
        }
      }

      // ----- restantes -----
      const total = proyeccion.totalPathMeters;
      const remainingDistanceMeters = Math.max(0, total - proyeccion.distanceAlongRouteMeters);

      // Tiempo restante: suma de los pasos por delante más la fracción del
      // actual; sin pasos (respaldo OSRM), prorrateo lineal de la duración.
      let remainingDurationMillis = null;
      const pasos = route.steps ?? [];
      if (pasos.length && pasos.every(p => Number.isFinite(p.durationMillis))) {
        let suma = 0;
        for (let i = currentStepIndex + 1; i < pasos.length; i += 1) suma += pasos[i].durationMillis;
        const inicioActual = inicioDePaso[currentStepIndex] ?? 0;
        const finActual = inicioDePaso[currentStepIndex + 1] ?? total;
        const largoActual = Math.max(1, finActual - inicioActual);
        const fraccionRestante = Math.max(0, Math.min(1,
          (finActual - proyeccion.distanceAlongRouteMeters) / largoActual));
        suma += pasos[currentStepIndex].durationMillis * fraccionRestante;
        remainingDurationMillis = Math.round(suma);
      } else if (Number.isFinite(route.durationMillis) && total > 0) {
        remainingDurationMillis = Math.round(route.durationMillis * (remainingDistanceMeters / total));
      }

      // ----- maniobra siguiente -----
      // La instrucción del paso actual guía HACIA su final (donde empieza la
      // siguiente); la distancia a la maniobra es hasta el inicio del paso
      // siguiente (o el final de la ruta en el último paso).
      const siguienteInicio = inicioDePaso[currentStepIndex + 1];
      const distanceToNextManeuverMeters = Math.max(0, Math.round(
        (siguienteInicio ?? total) - proyeccion.distanceAlongRouteMeters
      ));
      const nextStep = pasos[currentStepIndex + 1] ?? null;
      const activeStep = pasos[currentStepIndex] ?? null;

      return {
        currentStepIndex,
        activeStep,
        nextStep,
        distanceToNextManeuverMeters,
        remainingDistanceMeters: Math.round(remainingDistanceMeters),
        remainingDurationMillis,
        distanceFromRouteMeters: Math.round(proyeccion.distanceFromRouteMeters),
        offRouteState,
        // Solo indicación: el negocio no cambia por GPS.
        arrived: remainingDistanceMeters <= arrivalThresholdM + accuracy
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Gobernador de recálculos: cooldown + un solo vuelo
// ---------------------------------------------------------------------------

export function createRerouteGovernor({
  cooldownMs = REROUTE_COOLDOWN_MS,
  now = () => Date.now()
} = {}) {
  let lastRerouteAt = 0;
  let pending = false;

  return {
    /** ¿Se permite recalcular AHORA? (confirmado + sin vuelo + sin cooldown) */
    shouldReroute(offRouteState) {
      if (offRouteState !== OFF_ROUTE_STATE.CONFIRMED) return false;
      if (pending) return false;
      return now() - lastRerouteAt >= cooldownMs;
    },
    begin() { pending = true; },
    finish() { pending = false; lastRerouteAt = now(); },
    get pending() { return pending; }
  };
}

// ---------------------------------------------------------------------------
// Maniobra → icono de la familia oficial (icons.js; nada remoto, nada emoji)
// ---------------------------------------------------------------------------

const ICONO_POR_MANIOBRA = Object.freeze({
  TURN_LEFT: 'navTurnLeft',
  TURN_RIGHT: 'navTurnRight',
  TURN_SLIGHT_LEFT: 'navSlightLeft',
  TURN_SLIGHT_RIGHT: 'navSlightRight',
  TURN_SHARP_LEFT: 'navTurnLeft',
  TURN_SHARP_RIGHT: 'navTurnRight',
  STRAIGHT: 'navStraight',
  DEPART: 'navStraight',
  MERGE: 'navStraight',
  NAME_CHANGE: 'navStraight',
  UTURN_LEFT: 'navUturn',
  UTURN_RIGHT: 'navUturn',
  ROUNDABOUT_LEFT: 'navRoundabout',
  ROUNDABOUT_RIGHT: 'navRoundabout',
  RAMP_LEFT: 'navSlightLeft',
  RAMP_RIGHT: 'navSlightRight',
  FORK_LEFT: 'navSlightLeft',
  FORK_RIGHT: 'navSlightRight',
  DESTINATION: 'flag',
  DESTINATION_LEFT: 'flag',
  DESTINATION_RIGHT: 'flag'
});

/** Nombre del icono oficial para una maniobra; desconocida → flecha recta. */
export function maneuverIconName(maneuver) {
  return ICONO_POR_MANIOBRA[String(maneuver ?? '').toUpperCase()] ?? 'navStraight';
}
