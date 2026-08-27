/**
 * Reordenacion de candidatos por ETA real de carretera — DISPATCH-2A.
 *
 * PURO: sin red, sin Google, sin estado. Recibe los candidatos YA ELEGIBLES
 * (los 12 filtros de dispatchEligibility ya corrieron) y los resultados
 * normalizados de la matriz, y devuelve EXACTAMENTE el mismo conjunto en un
 * orden mejor. Dos invariantes que este modulo tiene prohibido romper:
 *
 *  1. JAMAS añade un candidato: quien no entro elegible, no existe aqui.
 *  2. JAMAS elimina un candidato: que Google no encuentre ruta para alguien
 *     lo manda al FINAL en su orden geografico de siempre, nunca fuera.
 *
 * Orden determinista: ETA de carretera ascendente; empate → distancia
 * geografica actual ascendente; empate → posicion original estable. Nada de
 * azar.
 */

/**
 * @param {Array} candidates  [{driver, dist}] en el orden geografico actual
 * @param {Array} matrixResults  [{originIndex, etaMillis, roadDistanceMeters}]
 *   donde originIndex refiere a la posicion del candidato en `candidates`
 * @returns {{ordered: Array, rankedCount: number}}
 */
export function rankCandidatesByRoadEta(candidates, matrixResults) {
  if (!Array.isArray(candidates) || candidates.length <= 1) {
    return { ordered: Array.isArray(candidates) ? [...candidates] : [], rankedCount: 0 };
  }

  const etaPorIndice = new Map();
  for (const resultado of Array.isArray(matrixResults) ? matrixResults : []) {
    if (Number.isInteger(resultado?.originIndex)
      && resultado.originIndex >= 0
      && resultado.originIndex < candidates.length
      && Number.isFinite(resultado?.etaMillis)) {
      // Ante un duplicado se conserva el primero: determinista.
      if (!etaPorIndice.has(resultado.originIndex)) {
        etaPorIndice.set(resultado.originIndex, resultado);
      }
    }
  }

  const conEta = [];
  const sinEta = [];
  candidates.forEach((candidato, indice) => {
    const resultado = etaPorIndice.get(indice);
    if (resultado) {
      conEta.push({
        candidato,
        indice,
        etaMillis: resultado.etaMillis,
        roadDistanceMeters: resultado.roadDistanceMeters ?? null
      });
    } else {
      sinEta.push({ candidato, indice });
    }
  });

  conEta.sort((a, b) =>
    a.etaMillis - b.etaMillis
    || (a.candidato.dist ?? 0) - (b.candidato.dist ?? 0)
    || a.indice - b.indice);
  // Los sin-ruta van DETRAS, en su orden geografico original (estable).
  sinEta.sort((a, b) => a.indice - b.indice);

  return {
    ordered: [...conEta.map(x => x.candidato), ...sinEta.map(x => x.candidato)],
    rankedCount: conEta.length
  };
}
