/**
 * Métrica de tiempo de respuesta de soporte.
 *
 * Se calculaba en el navegador recorriendo el historial completo de todos los
 * hilos, que es justo lo que el listado ha dejado de enviar. El cálculo se
 * mueve aquí sin cambiar su definición: por cada mensaje de administración se
 * mide lo que tardó desde el último mensaje de la otra parte que lo precede, y
 * se promedian todas esas esperas.
 */

const instante = mensaje => {
  const valor = new Date(mensaje?.createdAt || 0).getTime();
  return Number.isFinite(valor) ? valor : 0;
};

/**
 * @param {Array} messages mensajes de soporte, en cualquier orden.
 * @returns {number|null} media en milisegundos, o null si no hay ninguna
 *   respuesta de administración que medir.
 */
export function averageAdminResponseMs(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const porHilo = new Map();
  for (const mensaje of messages) {
    const id = mensaje?.conversationUserId;
    if (!id) continue;
    if (!porHilo.has(id)) porHilo.set(id, []);
    porHilo.get(id).push(mensaje);
  }

  const muestras = [];
  for (const hilo of porHilo.values()) {
    hilo.sort((a, b) => instante(a) - instante(b));
    // Se recorre una sola vez recordando el último mensaje de la otra parte,
    // en lugar de rebuscar hacia atrás por cada respuesta: aquello era
    // cuadrático dentro de cada hilo.
    let ultimoAjeno = null;
    for (const mensaje of hilo) {
      if (mensaje?.senderRole === 'admin') {
        // Se mide contra el último mensaje de la otra parte, aunque entre
        // medias haya otras respuestas de administración: dos respuestas
        // seguidas producen dos muestras desde el mismo mensaje original.
        if (ultimoAjeno) muestras.push(Math.max(0, instante(mensaje) - instante(ultimoAjeno)));
      } else {
        ultimoAjeno = mensaje;
      }
    }
  }

  if (!muestras.length) return null;
  return Math.round(muestras.reduce((suma, valor) => suma + valor, 0) / muestras.length);
}
