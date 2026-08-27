/**
 * Formato local de distancias y tiempos de navegación — MAPS-2C.
 *
 * La superficie real de Routes puede devolver `localizedValues` en null
 * (verificado en producción), así que los textos visibles se derivan SIEMPRE
 * de los valores numéricos canónicos (metros / milisegundos), en español.
 *
 * Esto es SOLO presentación de navegación: aquí no vive ninguna semántica de
 * tarifa.
 */

/** "85 m" · "1,2 km" · "12 km" */
export function formatDistance(meters) {
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  // Bajo 10 km importa el decimal (coma española); arriba, el entero basta.
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`;
}

/** "8 min" · "1 h" · "1 h 12 min" */
export function formatDuration(millis) {
  const ms = Number(millis);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutos = Math.max(1, Math.round(ms / 60_000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
