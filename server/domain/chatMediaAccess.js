/**
 * Quién puede abrir el adjunto de un mensaje.
 *
 * La regla es una sola: **la imagen tiene exactamente la misma autorización
 * que el mensaje que la contiene**. No se declara aparte para que no puedan
 * divergir con el tiempo.
 *
 * Función pura, sin dependencias del servidor, para poder probar la política
 * en aislamiento del transporte.
 */

/** Identificador de adjunto admisible: UUID opaco, nunca una ruta. */
const REFERENCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isChatMediaId(value) {
  return typeof value === 'string' && REFERENCE_ID.test(value.trim());
}

/**
 * Localiza el mensaje que referencia ese adjunto.
 *
 * La búsqueda es por **igualdad exacta** de `imageRef.id` sobre las dos
 * colecciones. En ningún momento se compone una ruta a partir del
 * identificador: la clave real la aporta el registro encontrado.
 */
export function findMessageByMediaId({ id, messages = [], supportMessages = [] } = {}) {
  if (!isChatMediaId(id)) return null;
  const buscado = id.trim();

  const enViaje = (Array.isArray(messages) ? messages : []).find(item => item?.imageRef?.id === buscado);
  if (enViaje) return { message: enViaje, channel: 'trip' };

  const enSoporte = (Array.isArray(supportMessages) ? supportMessages : []).find(item => item?.imageRef?.id === buscado);
  if (enSoporte) return { message: enSoporte, channel: 'support' };

  return null;
}

/**
 * ¿Puede `viewer` abrir el adjunto de `message`?
 *
 * - Chat de viaje: solo el pasajero y el conductor de ese viaje, también con
 *   el viaje cerrado o cancelado. Administración **no**, de forma explícita:
 *   `userCanAccessTrip` la autorizaría por herencia, y aquí no debe.
 * - Soporte: el propietario del hilo y administración.
 */
export function canViewChatMedia({ viewer, message, channel, trips = [] } = {}) {
  if (!viewer?.id || !message) return false;

  if (channel === 'support') {
    if (viewer.role === 'admin') return true;
    return message.conversationUserId === viewer.id;
  }

  if (channel === 'trip') {
    // Exclusión explícita, no heredada.
    if (viewer.role === 'admin') return false;
    const trip = (Array.isArray(trips) ? trips : []).find(item => item?.id === message.tripId);
    if (!trip) return false;
    // El acceso no caduca: el historial de comprobantes debe seguir abriéndose.
    return trip.passengerId === viewer.id || trip.driverId === viewer.id;
  }

  return false;
}
