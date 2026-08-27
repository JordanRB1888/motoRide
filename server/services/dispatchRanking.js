/**
 * Orquestador del ranking por ETA de carretera — DISPATCH-2A.
 *
 * DORMIDO por defecto y a prueba de fallos por construccion:
 *
 *  - `DISPATCH_ROUTE_MATRIX_ENABLED` interpreta por lista explicita (como
 *    WEB_PUSH_ENABLED); apagado o ausente → el despacho actual, byte a byte,
 *    sin UNA sola llamada a Google.
 *  - Encendido sin credencial → sigue apagado (fail closed, un aviso escueto
 *    al construir, jamas un secreto ni una caida de arranque).
 *  - Encendido y configurado → UNA llamada acotada de matriz por ciclo de
 *    ranking, con lista corta configurable y timeout duro propio. Cualquier
 *    fallo (timeout, auth, cuota, red, respuesta rara, cero elementos) →
 *    el ORDEN ACTUAL, y el despacho ni se entera.
 *
 * Google solo puede REORDENAR a los ya elegibles. La elegibilidad, el radio,
 * la frescura, la ventana de 15 s y PUSH-3A viven donde siempre.
 */

import { createRouteMatrixClient } from './routeMatrixClient.js';
import { rankCandidatesByRoadEta } from '../domain/candidateRanking.js';

const VALORES_VERDADEROS = new Set(['1', 'true', 'yes', 'on']);

export function isDispatchRouteMatrixEnabled(value = process.env.DISPATCH_ROUTE_MATRIX_ENABLED) {
  return VALORES_VERDADEROS.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Cuantos candidatos entran a la matriz. La flota real produce hoy puñados
 * de elegibles (el log dispatch_eligibility lo muestra); 5 cubre la practica
 * con coste y latencia minimos. Configurable para crecer con la flota.
 */
export const DEFAULT_MATRIX_MAX_CANDIDATES = 5;

/**
 * Presupuesto duro del proveedor ANTES de la primera oferta. No toca la
 * ventana de oferta de 15000 ms: son relojes distintos. Vencido el
 * presupuesto, la oferta sale con el orden actual.
 */
export const DEFAULT_MATRIX_TIMEOUT_MS = 1_500;

export function createDispatchRanker({
  enabled = isDispatchRouteMatrixEnabled(),
  matrixClient = null,
  maxCandidates = Number(process.env.DISPATCH_MATRIX_MAX_CANDIDATES) || DEFAULT_MATRIX_MAX_CANDIDATES,
  timeoutMs = Number(process.env.DISPATCH_MATRIX_TIMEOUT_MS) || DEFAULT_MATRIX_TIMEOUT_MS,
  logger = console
} = {}) {
  let client = matrixClient;
  let activo = Boolean(enabled);

  if (activo && !client) {
    client = createRouteMatrixClient({ timeoutMs, logger });
  }
  if (activo && !client.isConfigured()) {
    // Fail closed: la bandera sin credencial no puede tumbar ni degradar el
    // despacho. El codigo es escueto: jamas un valor.
    logger.warn?.('[+58express Dispatch] DISPATCH_ROUTE_MATRIX_ENABLED sin credencial de servidor. Ranking por ETA queda DESACTIVADO.');
    activo = false;
  }

  const registrar = (event, campos = {}) => {
    logger.log?.(`[+58express Dispatch] ${JSON.stringify({ event, ...campos })}`);
  };

  return {
    get enabled() { return activo; },

    /**
     * Reordena candidatos YA elegibles por ETA real a la recogida.
     *
     * SIEMPRE devuelve el MISMO conjunto (ni uno mas, ni uno menos). Con el
     * ranking apagado o cualquier fallo, el orden es el actual.
     *
     * @param {{pickup: {lat,lng}, candidates: Array}} entrada
     * @returns {Promise<{candidates: Array, source: 'google'|'fallback'}>}
     */
    async rank({ pickup, candidates } = {}) {
      const originales = Array.isArray(candidates) ? candidates : [];
      if (!activo || originales.length <= 1 || !pickup) {
        return { candidates: originales, source: 'fallback' };
      }

      // Lista corta: los primeros N del ORDEN GEOGRAFICO ACTUAL (nada se
      // descarta al azar); los demas conservan su posicion detras.
      const lista = originales.slice(0, maxCandidates);
      const resto = originales.slice(maxCandidates);
      const inicio = Date.now();

      let resultados;
      try {
        resultados = await client.computeToPickup(
          lista.map(candidato => ({
            lat: candidato.driver.location.lat,
            lng: candidato.driver.location.lng
          })),
          { lat: pickup.lat, lng: pickup.lng }
        );
      } catch (fallo) {
        registrar('dispatch_matrix_fallback', {
          reason: fallo?.message || 'UNKNOWN',
          candidateCount: originales.length,
          latencyMs: Date.now() - inicio
        });
        return { candidates: originales, source: 'fallback' };
      }

      if (!resultados.length) {
        registrar('dispatch_matrix_fallback', {
          reason: 'ZERO_VALID_ELEMENTS',
          candidateCount: originales.length,
          latencyMs: Date.now() - inicio
        });
        return { candidates: originales, source: 'fallback' };
      }

      const { ordered, rankedCount } = rankCandidatesByRoadEta(lista, resultados);
      registrar(rankedCount === lista.length ? 'dispatch_matrix_success' : 'dispatch_matrix_partial', {
        candidateCount: originales.length,
        matrixCandidateCount: lista.length,
        rankedCount,
        latencyMs: Date.now() - inicio
      });
      return { candidates: [...ordered, ...resto], source: 'google' };
    }
  };
}
