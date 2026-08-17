/**
 * Actualización puntual del panel de administración.
 *
 * Cada evento de Socket.IO —cambio de estado de viaje, conductor actualizado,
 * movimiento de saldo— volvía a descargar la lista completa de usuarios y de
 * viajes. Medido contra el servidor real, `/api/users` son 7 MB con el volumen
 * de seis meses, y en hora punta llegan varios eventos por segundo.
 *
 * La mayoría de esos eventos ya traen consigo el registro que cambió, así que
 * no hace falta pedir nada: basta con aplicarlo sobre la colección que ya está
 * en memoria. Lo único que sigue necesitando el servidor son las cifras
 * agregadas, que son un objeto pequeño y se piden de forma agrupada.
 */

/**
 * Inserta o actualiza un registro dentro de una colección, por identificador.
 *
 * Se fusiona en lugar de sustituir porque muchos eventos son parciales: el
 * cambio de estado de un viaje trae el estado y la fecha, no la ruta ni la
 * tarifa. Sustituir dejaría el registro mutilado.
 *
 * Devuelve una colección nueva; no modifica la recibida.
 */
export function mergeById(items, patch, idOf = item => item?.id) {
  const coleccion = Array.isArray(items) ? items : [];
  const id = idOf(patch);
  // Sin identificador no se puede colocar el registro en ningún sitio, y
  // añadirlo al final crearía duplicados en cada evento.
  if (id === undefined || id === null || id === '') return coleccion;

  const posicion = coleccion.findIndex(item => idOf(item) === id);
  if (posicion < 0) return [...coleccion, { ...patch }];

  const copia = [...coleccion];
  copia[posicion] = { ...copia[posicion], ...patch };
  return copia;
}

/**
 * Agrupa llamadas repetidas en una sola.
 *
 * La primera se ejecuta de inmediato, para que el panel reaccione al instante.
 * Las que lleguen dentro del intervalo se funden en una única ejecución al
 * final del mismo: así una ráfaga de cincuenta eventos produce dos peticiones,
 * no cincuenta, y el ritmo queda acotado pase lo que pase.
 */
export function createCoalescer(fn, {
  intervalMs = 1000,
  now = () => Date.now(),
  schedule = (callback, ms) => setTimeout(callback, ms),
  cancel = id => clearTimeout(id)
} = {}) {
  let ultimaEjecucion = null;
  let pendiente = null;

  function trigger() {
    // Ya hay una ejecución programada: este evento queda absorbido por ella.
    if (pendiente !== null) return;

    const espera = ultimaEjecucion === null
      ? 0
      : Math.max(0, intervalMs - (now() - ultimaEjecucion));

    if (espera === 0) {
      ultimaEjecucion = now();
      fn();
      return;
    }

    pendiente = schedule(() => {
      pendiente = null;
      ultimaEjecucion = now();
      fn();
    }, espera);
  }

  trigger.dispose = () => {
    if (pendiente !== null) cancel(pendiente);
    pendiente = null;
  };

  return trigger;
}
