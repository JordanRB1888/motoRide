/**
 * Controlador de navegación del conductor — MAPS-2C.
 *
 * Cose las piezas: fase del viaje → UNA ruta (Google, con respaldo OSRM) →
 * línea en el mapa → progresión local con cada muestra GPS aceptada →
 * banner de guía → recálculo SOLO cuando el fuera-de-ruta se confirma, con
 * cooldown y un único vuelo.
 *
 * Reglas que este controlador tiene prohibido romper:
 *  - las muestras entran YA aceptadas por GPS-1 (el evento del rastreador
 *    solo emite aceptadas); nada se sintetiza;
 *  - Google se llama al INICIAR una fase o al confirmar un desvío — jamás
 *    por tick de GPS ni por render;
 *  - llegar cerca del destino solo se INDICA: las transiciones del viaje
 *    siguen siendo gestos del conductor;
 *  - la tarifa y el despacho ni se enteran de que esto existe.
 */

import { getNavigationRouteService } from './navigationRoute.js';
import {
  OFF_ROUTE_STATE,
  createRerouteGovernor,
  createRouteProgressTracker
} from './routeProgress.js';

export const NAVIGATION_PHASE = Object.freeze({
  PICKUP: 'PICKUP',
  DESTINATION: 'DESTINATION'
});

export function createDriverNavigation({
  routeService = getNavigationRouteService(),
  map,
  banner,
  getCurrentPosition,
  logger = console
} = {}) {
  let phase = null;
  let target = null;
  let targetLabel = '';
  let tracker = null;
  let degraded = false;
  const governor = createRerouteGovernor();
  // Generación propia de fase: una ruta que llega tarde para una fase que ya
  // no existe no puede pintar nada (el routeService además invalida las
  // suyas, pero esta guarda cubre el cambio de fase).
  let phaseGeneration = 0;

  async function computeAndAdopt(origin, motivo) {
    const generacion = phaseGeneration;
    let resultado;
    try {
      resultado = await routeService.computeNavigationRoute({ origin, destination: target });
    } catch {
      resultado = { stale: false, route: null };
    }
    if (generacion !== phaseGeneration || resultado.stale) return null;
    const route = resultado.route;
    if (!route) {
      // Sin ruta nueva: si había una, sigue siendo útil; el estado degradado
      // solo se refleja en el banner.
      degraded = true;
      logger.log?.(`[+58express Nav] sin ruta (${motivo}); se conserva la vigente si existe`);
      return null;
    }
    degraded = route.provider !== 'google';
    tracker = createRouteProgressTracker(route);
    map?.drawNavigationRoute?.(route, { color: phase === NAVIGATION_PHASE.DESTINATION ? '#00E676' : '#FFC107' });
    return route;
  }

  return {
    get phase() { return phase; },
    get hasRoute() { return Boolean(tracker); },

    /**
     * Arranca (o cambia) la fase de navegación. Invalida la anterior por
     * completo: la ruta a la recogida jamás se reutiliza hacia el destino.
     */
    async startPhase(nuevaFase, nuevoTarget, { label = '' } = {}) {
      const destino = { lat: Number(nuevoTarget?.lat), lng: Number(nuevoTarget?.lng) };
      if (!Number.isFinite(destino.lat) || !Number.isFinite(destino.lng)) return false;
      // La misma fase con el mismo objetivo y una ruta viva no se recomputa:
      // repintar una vista (p. ej. al llegar a la recogida) no gasta red.
      if (nuevaFase === phase && tracker
        && target?.lat === destino.lat && target?.lng === destino.lng) {
        return true;
      }
      phaseGeneration += 1;
      phase = nuevaFase;
      target = destino;
      targetLabel = label;
      tracker = null;
      routeService.cancel?.();

      const origen = getCurrentPosition?.();
      if (!origen || !Number.isFinite(Number(origen.lat)) || !Number.isFinite(Number(origen.lng))) {
        // Sin posición aceptada todavía: la primera muestra que llegue
        // arrancará la ruta (onPositionSample).
        return false;
      }
      return Boolean(await computeAndAdopt({ lat: Number(origen.lat), lng: Number(origen.lng) }, 'inicio de fase'));
    },

    /**
     * UNA muestra GPS aceptada (GPS-1). Progresión local; recálculo solo con
     * fuera-de-ruta CONFIRMADO, sin vuelo previo y fuera del cooldown.
     */
    onPositionSample(sample) {
      if (!phase || !target) return null;
      const posicion = { lat: Number(sample?.lat ?? sample?.latitude), lng: Number(sample?.lng ?? sample?.longitude) };
      if (!Number.isFinite(posicion.lat) || !Number.isFinite(posicion.lng)) return null;

      if (!tracker) {
        // La fase arrancó sin posición: esta muestra la estrena. Fuego y
        // olvido: el próximo tick ya tendrá ruta.
        computeAndAdopt(posicion, 'primera muestra de la fase');
        return null;
      }

      const progreso = tracker.update({ ...posicion, accuracy: sample?.accuracy });
      if (!progreso) return null;

      banner?.update?.(progreso, { targetLabel, degraded });

      if (governor.shouldReroute(progreso.offRouteState)) {
        governor.begin();
        computeAndAdopt(posicion, 'desvio confirmado')
          .catch(() => {})
          .finally(() => governor.finish());
      }
      return progreso;
    },

    /** Apaga la guía (viaje cerrado/cancelado). */
    stop() {
      phaseGeneration += 1;
      phase = null;
      target = null;
      targetLabel = '';
      tracker = null;
      degraded = false;
      routeService.cancel?.();
      banner?.hide?.();
    },

    // Expuesto para las pruebas del contrato de recálculo.
    _governor: governor,
    _offRouteStates: OFF_ROUTE_STATE
  };
}
