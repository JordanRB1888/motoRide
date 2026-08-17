/**
 * Límite de conexiones simultáneas por cuenta.
 *
 * El tope de frecuencia por evento vive en cada socket, así que abrir muchas
 * conexiones con la misma sesión multiplica el cupo: cien sockets son cien
 * veces el techo del GPS. Este contador cierra esa vía.
 *
 * También acota la memoria: cada conexión de Socket.IO reserva sus propias
 * estructuras, y sin techo un solo usuario autenticado puede agotarlas.
 */

// Una persona usa a la vez el teléfono y, como mucho, una pestaña de navegador,
// más alguna reconexión aún sin cerrar. Cinco deja margen de sobra para el uso
// legítimo y sigue muy por debajo de lo que hace daño.
export const DEFAULT_MAX_CONNECTIONS_PER_USER = 5;

export function createConnectionLimiter({ maxPerUser = DEFAULT_MAX_CONNECTIONS_PER_USER } = {}) {
  if (!Number.isInteger(maxPerUser) || maxPerUser < 1) throw new Error('INVALID_MAX_CONNECTIONS');

  /** @type {Map<string, number>} */
  const abiertas = new Map();

  /**
   * Registra una conexión y dice si excede el techo.
   *
   * Siempre cuenta, incluso cuando excede, para que quien llama pueda liberar
   * de forma incondicional: emparejar `acquire` con `release` sin ramas es lo
   * que evita que el contador se desincronice y acabe cerrando la puerta a
   * una cuenta legítima.
   */
  function acquire(userId) {
    if (typeof userId !== 'string' || userId === '') return { allowed: false, open: 0, maxPerUser };
    const open = (abiertas.get(userId) || 0) + 1;
    abiertas.set(userId, open);
    return { allowed: open <= maxPerUser, open, maxPerUser };
  }

  function release(userId) {
    if (typeof userId !== 'string' || userId === '') return;
    const restantes = (abiertas.get(userId) || 0) - 1;
    // La entrada se borra al llegar a cero: si se dejara a 0, el mapa crecería
    // con una entrada por cada cuenta que se haya conectado alguna vez.
    if (restantes > 0) abiertas.set(userId, restantes);
    else abiertas.delete(userId);
  }

  const count = userId => abiertas.get(userId) || 0;
  const trackedUsers = () => abiertas.size;

  return { acquire, release, count, trackedUsers, maxPerUser };
}
