/**
 * Vigilante de persistencia tras reinicio.
 *
 * El segundo cutover se revirtió por un falso negativo de esta comprobación:
 * el coordinador exigía que `railway restart` produjera un identificador de
 * despliegue NUEVO, y Railway reutilizó el que ya estaba activo. La espera
 * terminó en `DEPLOYMENT_TIMEOUT` sin que hubiera indicio alguno de fallo:
 * PostgreSQL había arrancado bien y todas las pruebas funcionales habían
 * pasado.
 *
 * La corrección no es relajar la puerta, sino dejar de confundir «hubo un
 * runtime nuevo» con «cambió el identificador». Se acepta el reinicio por dos
 * caminos:
 *
 *   CASO A  Railway emite un identificador de despliegue distinto.
 *   CASO B  Railway conserva el identificador, pero existe prueba temporal
 *           inequívoca de un arranque posterior a la petición de reinicio.
 *
 * En ambos casos se exige exactamente la misma evidencia de runtime sano. El
 * identificador solo decide de qué manera se demuestra que el proceso es otro;
 * nunca sustituye a la evidencia.
 *
 * La puerta es cerrada por defecto: cualquier dato que falte, no se pueda
 * interpretar o no encaje produce FAIL. Nada se da por bueno por omisión.
 */

import { isDeepStrictEqual } from 'node:util';

/** Marca que debe aparecer en el arranque para dar PostgreSQL por activo. */
export const POSTGRES_BACKEND_LINE = '[+58express Database] backend = postgres';
export const SQLITE_BACKEND_LINE = '[+58express Database] backend = sqlite';

/** Convierte a milisegundos, o null si el valor no es una fecha utilizable. */
function instante(valor) {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.getTime();
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const ms = Date.parse(valor);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * @param {object} evidencia
 * @param {string} evidencia.restartRequestedAt  Momento exacto en que se pidió
 *   el reinicio. Sin él no se puede distinguir un arranque nuevo de un log
 *   viejo, así que su ausencia es un fallo, no una advertencia.
 * @param {string} [evidencia.deploymentIdBefore]
 * @param {string} [evidencia.deploymentIdAfter]
 * @param {string} evidencia.runtimeStartedAt  Sello del arranque observado.
 * @param {string} evidencia.runtimeBackendLine  Línea de motor de datos.
 * @param {number} evidencia.healthStatus
 * @param {string} evidencia.healthCheckedAt
 * @param {boolean} evidencia.postgresReachable
 * @param {boolean} evidencia.volumeMounted
 * @param {object} evidencia.postgresCounts
 * @param {object} evidencia.expectedCounts
 * @param {boolean} evidencia.socketReady
 * @param {boolean} [evidencia.timedOut]  El coordinador agotó su espera.
 * @returns {{status:'PASS'|'FAIL', case:'A'|'B'|null, reasons:string[]}}
 */
export function evaluateRestartPersistence(evidencia = {}) {
  const {
    restartRequestedAt,
    deploymentIdBefore,
    deploymentIdAfter,
    runtimeStartedAt,
    runtimeBackendLine,
    healthStatus,
    healthCheckedAt,
    postgresReachable,
    volumeMounted,
    postgresCounts,
    expectedCounts,
    socketReady,
    timedOut = false
  } = evidencia;

  const reasons = [];
  const fallo = (motivo) => { reasons.push(motivo); };

  // Un tiempo agotado de verdad sigue siendo un fallo. Lo que se corrige es
  // que se agotara por esperar un identificador que nunca iba a cambiar.
  if (timedOut) fallo('TIMED_OUT');

  const pedido = instante(restartRequestedAt);
  if (pedido === null) fallo('MISSING_RESTART_REQUESTED_AT');

  // Qué camino demuestra que el proceso es otro.
  let caso = null;
  const antes = typeof deploymentIdBefore === 'string' ? deploymentIdBefore.trim() : '';
  const despues = typeof deploymentIdAfter === 'string' ? deploymentIdAfter.trim() : '';
  if (!despues) {
    fallo('MISSING_DEPLOYMENT_ID_AFTER');
  } else if (antes && despues !== antes) {
    caso = 'A';
  } else {
    caso = 'B';
  }

  // Evidencia temporal: el arranque tiene que ser POSTERIOR a la petición.
  // Aquí es donde se descartan los logs de antes del reinicio, que es el
  // único modo de que el mismo identificador no se convierta en un agujero.
  const arranque = instante(runtimeStartedAt);
  if (arranque === null) {
    fallo('MISSING_RUNTIME_STARTED_AT');
  } else if (pedido !== null && arranque <= pedido) {
    fallo('STALE_RUNTIME_LOG');
  }

  // El motor tiene que ser PostgreSQL. Si el runtime vuelve a SQLite, el
  // cutover no persistió y eso es exactamente lo que hay que detectar.
  if (typeof runtimeBackendLine !== 'string' || !runtimeBackendLine.includes(POSTGRES_BACKEND_LINE)) {
    fallo(typeof runtimeBackendLine === 'string' && runtimeBackendLine.includes(SQLITE_BACKEND_LINE)
      ? 'RUNTIME_STARTED_SQLITE'
      : 'MISSING_POSTGRES_BACKEND_LINE');
  }

  // Salud, y medida DESPUÉS del arranque nuevo. Que la salud nunca dejara de
  // responder 200 no prueba nada: el proceso viejo también responde 200.
  if (healthStatus !== 200) {
    fallo('HEALTH_NOT_200');
  } else {
    const medida = instante(healthCheckedAt);
    if (medida === null) fallo('MISSING_HEALTH_CHECKED_AT');
    else if (arranque !== null && medida < arranque) fallo('HEALTH_CHECKED_BEFORE_RUNTIME');
  }

  if (postgresReachable !== true) fallo('POSTGRES_UNAVAILABLE');
  if (volumeMounted !== true) fallo('VOLUME_NOT_MOUNTED');
  if (socketReady !== true) fallo('SOCKET_NOT_READY');

  // Los recuentos tienen que seguir siendo los esperados tras el reinicio.
  if (!postgresCounts || typeof postgresCounts !== 'object') {
    fallo('MISSING_POSTGRES_COUNTS');
  } else if (!expectedCounts || typeof expectedCounts !== 'object') {
    fallo('MISSING_EXPECTED_COUNTS');
  } else if (!isDeepStrictEqual({ ...postgresCounts }, { ...expectedCounts })) {
    const diferencias = Object.keys({ ...expectedCounts, ...postgresCounts })
      .filter(tabla => postgresCounts[tabla] !== expectedCounts[tabla])
      .map(tabla => `${tabla}:${expectedCounts[tabla]}->${postgresCounts[tabla]}`);
    fallo(`POSTGRES_COUNTS_MISMATCH:${diferencias.join(',')}`);
  }

  return {
    status: reasons.length === 0 ? 'PASS' : 'FAIL',
    case: reasons.length === 0 ? caso : null,
    reasons
  };
}

/**
 * Elige, de entre las líneas de arranque observadas, la primera posterior a la
 * petición de reinicio. Devuelve null si todas son anteriores: eso es un log
 * rancio y no vale como prueba.
 *
 * @param {Array<{timestamp:string, message:string}>} lineas
 * @param {string} restartRequestedAt
 */
export function selectRuntimeStartupLine(lineas, restartRequestedAt) {
  const pedido = instante(restartRequestedAt);
  if (pedido === null || !Array.isArray(lineas)) return null;
  const posteriores = lineas
    .map(linea => ({ ...linea, ms: instante(linea?.timestamp) }))
    .filter(linea => linea.ms !== null && linea.ms > pedido
      && typeof linea.message === 'string'
      && (linea.message.includes(POSTGRES_BACKEND_LINE) || linea.message.includes(SQLITE_BACKEND_LINE)))
    .sort((a, b) => a.ms - b.ms);
  return posteriores[0] || null;
}
