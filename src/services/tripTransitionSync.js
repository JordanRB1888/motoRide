/**
 * Sincronizador de transiciones del viaje del conductor — OFFLINE-TRIP-1A.
 *
 * TODAS las transiciones del conductor (llegué / iniciar / completar) pasan
 * por aquí, con y sin conexión: primero se hace DURABLE el evento (la cola
 * sobrevive a recargas) y después se intenta entregar. Con red, la entrega
 * es inmediata y el comportamiento visible es el de siempre; sin red, el
 * evento espera y los disparadores de reconexión lo llevan al servidor.
 *
 * El problema del ACK perdido queda resuelto de raíz: la entrega usa el
 * endpoint idempotente con el MISMO eventId en cada reintento — si el
 * servidor ya lo había aplicado, responde ALREADY_APPLIED y no hay doble
 * efecto (ni doble liquidación).
 *
 * El estado LOCAL nunca se disfraza de confirmación: quien pinta la interfaz
 * recibe los veredictos por `onStateChange` y distingue «guardado en este
 * dispositivo» de «confirmado por el servidor».
 */

export const SYNC_STATE = Object.freeze({
  IDLE: 'IDLE',
  PENDING: 'PENDING',            // hay eventos guardados sin veredicto
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',              // todo confirmado por el servidor
  ERROR: 'ERROR'                 // error que merece atención (no red caída)
});

export function createTripTransitionSync({
  queue,
  apiService,
  isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  onStateChange = () => {},
  onEventResult = () => {}
} = {}) {
  if (!queue) throw new Error('TRIP_SYNC_REQUIRES_QUEUE');
  if (!apiService) throw new Error('TRIP_SYNC_REQUIRES_API');

  let flushing = false;

  const publicar = (estado, detalle = {}) => {
    try { onStateChange(estado, { pending: queue.size(), ...detalle }); } catch {}
  };

  async function flush() {
    if (flushing) return { flushed: false, reason: 'IN_FLIGHT' };
    if (!isOnline()) {
      publicar(queue.size() ? SYNC_STATE.PENDING : SYNC_STATE.IDLE);
      return { flushed: false, reason: 'OFFLINE' };
    }
    const pendientes = queue.pending();
    if (!pendientes.length) {
      publicar(SYNC_STATE.IDLE);
      return { flushed: true, applied: 0 };
    }

    flushing = true;
    publicar(SYNC_STATE.SYNCING);
    let aplicados = 0;
    let huboErrorPermanente = false;
    let huboFalloDeRed = false;

    try {
      const porViaje = new Map();
      for (const evento of pendientes) {
        if (!porViaje.has(evento.tripId)) porViaje.set(evento.tripId, []);
        porViaje.get(evento.tripId).push(evento);
      }

      for (const [tripId, eventos] of porViaje) {
        const cuerpo = {
          events: eventos.map(({ eventId, action, deviceTimestamp, location, sequence, expectedTripState }) =>
            ({ eventId, action, deviceTimestamp, location, sequence, expectedTripState }))
        };
        const respuesta = await apiService.post(`/trips/${encodeURIComponent(tripId)}/offline-events`, cuerpo);

        if (!respuesta?.results) {
          const estado = apiService.lastError?.status ?? 0;
          if (estado === 403) {
            // El viaje no es de esta cuenta: esos eventos jamás se aplicarán.
            queue.purgeTrip(tripId);
            onEventResult({ tripId, result: 'REJECTED', code: 'FORBIDDEN' });
            huboErrorPermanente = true;
          } else if (estado === 401) {
            // Sesión caducada: los eventos ESPERAN a la reautenticación.
            queue.markAttempt(eventos.map(e => e.eventId), 'AUTH_REQUIRED');
            huboFalloDeRed = true;
          } else {
            // Red caída o error transitorio del servidor: reintento en el
            // próximo disparador. Sin bucles calientes.
            queue.markAttempt(eventos.map(e => e.eventId), apiService.lastError?.error ?? 'NETWORK_ERROR');
            huboFalloDeRed = true;
          }
          continue;
        }

        for (const resultado of respuesta.results) {
          onEventResult({ tripId, ...resultado });
          if (resultado.result === 'APPLIED' || resultado.result === 'ALREADY_APPLIED') {
            queue.resolve([resultado.eventId]);
            aplicados += 1;
          } else if (resultado.result === 'REJECTED' && resultado.code === 'INSUFFICIENT_WALLET_BALANCE') {
            // Caso de soporte: el cobro no cabe todavía. El evento se
            // CONSERVA (se reintentará en próximos disparadores) y el error
            // se muestra — nunca un bucle caliente.
            queue.markAttempt([resultado.eventId], resultado.code);
            huboErrorPermanente = true;
          } else if (resultado.result === 'REJECTED' || resultado.result === 'INVALID_EVENT') {
            // Veredicto definitivo: conservarlo solo repetiría el rechazo.
            queue.resolve([resultado.eventId]);
            huboErrorPermanente = true;
          } else {
            // NOT_ATTEMPTED / RETRYABLE_ERROR: esperan al próximo intento.
            queue.markAttempt([resultado.eventId], resultado.code ?? resultado.result);
            huboFalloDeRed = true;
          }
        }
      }
    } finally {
      flushing = false;
    }

    const restantes = queue.size();
    if (huboErrorPermanente) publicar(SYNC_STATE.ERROR);
    else if (restantes) publicar(huboFalloDeRed ? SYNC_STATE.PENDING : SYNC_STATE.PENDING);
    else publicar(aplicados ? SYNC_STATE.SYNCED : SYNC_STATE.IDLE);
    return { flushed: true, applied: aplicados, remaining: restantes };
  }

  return {
    /**
     * Registra una transición del conductor. SIEMPRE durable primero; la
     * entrega inmediata solo ocurre si hay red. Devuelve el evento encolado.
     */
    recordTransition({ tripId, action, expectedTripState = null, location = null }) {
      const evento = queue.enqueue({ tripId, action, expectedTripState, location });
      if (!evento) return null;
      if (isOnline()) {
        flush().catch(() => {});
      } else {
        publicar(SYNC_STATE.PENDING, { savedOffline: true });
      }
      return evento;
    },

    flush,
    get pendingCount() { return queue.size(); }
  };
}
