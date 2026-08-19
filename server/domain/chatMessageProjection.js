/**
 * Qué se publica de un mensaje de chat.
 *
 * `imageStorageKey` es metadato privado del servidor: la ruta relativa dentro
 * del volumen. Con ella no se puede leer nada --el endpoint no la acepta, solo
 * acepta el identificador público-- pero describe la organización interna del
 * almacén, y eso no tiene por qué salir de aquí.
 *
 * Se resuelve quitando, no seleccionando: si mañana el mensaje gana un campo
 * nuevo, aparecerá en el payload sin que nadie tenga que acordarse de añadirlo,
 * que es el fallo que tendría la lista blanca. La contrapartida --que un campo
 * privado nuevo se publicaría por descuido-- se cubre con una prueba que exige
 * que esta lista crezca a la vez que los campos privados del mensaje.
 */

/** Campos que nunca viajan al cliente. */
export const PRIVATE_MESSAGE_FIELDS = Object.freeze(['imageStorageKey']);

/** Un mensaje listo para publicarse, sin los metadatos privados del almacén. */
export function publicChatMessage(message) {
  if (!message || typeof message !== 'object') return message;
  const publico = { ...message };
  for (const campo of PRIVATE_MESSAGE_FIELDS) delete publico[campo];
  return publico;
}

/** La versión para listados. Conserva el orden y tolera entradas vacías. */
export function publicChatMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map(publicChatMessage);
}
