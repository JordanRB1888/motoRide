/**
 * Banner de guía del conductor — MAPS-2C.
 *
 * Compacto, anclado arriba del mapa (donde vivía el banner anterior), sin
 * tapar la tarjeta del viaje, los botones de acción, la barra inferior ni la
 * atribución de Google (que vive abajo). Solo PINTA lo que el motor de
 * progresión calcula: aquí no hay geometría ni decisiones.
 *
 * Toda la información del proveedor entra como TEXTO (textContent): ninguna
 * instrucción de navegación se interpreta como HTML.
 */

import { formatDistance, formatDuration } from '../utils/navFormat.js';
import { icon } from '../utils/icons.js';
import { maneuverIconName } from '../services/routeProgress.js';

export function createNavigationBanner(host) {
  if (!host) return null;

  const raiz = document.createElement('div');
  raiz.className = 'driver-nav-banner';
  raiz.hidden = true;
  raiz.innerHTML = `
    <div class="driver-nav-main">
      <span class="driver-nav-glyph" aria-hidden="true">${icon('navStraight', 20)}</span>
      <div class="driver-nav-texts">
        <strong class="driver-nav-instruction"></strong>
        <span class="driver-nav-maneuver-distance"></span>
      </div>
    </div>
    <div class="driver-nav-footer">
      <span class="driver-nav-eta"></span>
      <span class="driver-nav-remaining"></span>
      <span class="driver-nav-target"></span>
    </div>`;
  host.appendChild(raiz);

  const glifo = raiz.querySelector('.driver-nav-glyph');
  const instruccion = raiz.querySelector('.driver-nav-instruction');
  const distanciaManiobra = raiz.querySelector('.driver-nav-maneuver-distance');
  const eta = raiz.querySelector('.driver-nav-eta');
  const restante = raiz.querySelector('.driver-nav-remaining');
  const objetivo = raiz.querySelector('.driver-nav-target');

  return {
    element: raiz,

    /**
     * @param {object} progreso  estado del rastreador de progreso
     * @param {object} [contexto] { targetLabel, degraded }
     */
    update(progreso, { targetLabel = '', degraded = false } = {}) {
      if (!progreso) return;
      raiz.hidden = false;
      raiz.classList.toggle('is-degraded', Boolean(degraded));

      // El icono es markup PROPIO de la familia oficial (icons.js); las
      // instrucciones del proveedor entran SIEMPRE por textContent.
      const paso = progreso.activeStep;
      if (progreso.arrived) {
        glifo.innerHTML = icon(maneuverIconName('DESTINATION'), 20);
        instruccion.textContent = 'Has llegado';
        distanciaManiobra.textContent = '';
      } else if (paso?.instruction) {
        glifo.innerHTML = icon(maneuverIconName(paso.maneuver), 20);
        instruccion.textContent = paso.instruction;
        distanciaManiobra.textContent = formatDistance(progreso.distanceToNextManeuverMeters);
      } else {
        // Respaldo sin pasos (OSRM): guía degradada honesta, sin maniobras
        // inventadas.
        glifo.innerHTML = icon(maneuverIconName('STRAIGHT'), 20);
        instruccion.textContent = 'Sigue la ruta marcada';
        distanciaManiobra.textContent = '';
      }

      eta.textContent = Number.isFinite(progreso.remainingDurationMillis)
        ? formatDuration(progreso.remainingDurationMillis) : '';
      restante.textContent = formatDistance(progreso.remainingDistanceMeters);
      objetivo.textContent = targetLabel || '';
    },

    hide() { raiz.hidden = true; },

    destroy() { raiz.remove(); }
  };
}
