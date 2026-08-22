import crypto from 'node:crypto';
import { decodeChatImageDataUrl } from '../domain/chatImageInput.js';

/**
 * Alta de una imagen de chat: archivo primero, registro después.
 *
 * El sistema de archivos y SQLite no son un único sistema transaccional, así
 * que no hay forma de escribir en los dos de manera atómica. Lo que sí se
 * puede elegir es el orden y qué se hace cuando el segundo paso falla:
 *
 *   1. Se guarda el archivo. Si esto falla, no hay mensaje: nada que deshacer.
 *   2. Se persiste el mensaje. Si esto falla, el archivo ya escrito se borra.
 *
 * El orden inverso --registro primero-- dejaría filas apuntando a archivos que
 * no existen, y eso no se puede reparar: la imagen se ha perdido. Al revés, lo
 * peor que queda es un archivo huérfano, que ocupa sitio pero no rompe nada y
 * es recuperable con un barrido.
 *
 * Los dos productores --el de soporte por HTTP y el de viaje por socket-- pasan
 * por aquí. Tenerlo en un solo sitio no es solo evitar duplicar: es que la
 * compensación no se pueda olvidar en uno de los dos.
 */

/**
 * @param {object} opciones
 * @param {object} opciones.storage almacén privado de adjuntos.
 * @param {(detalle: object) => void} [opciones.onCompensationError] aviso de
 *   que un archivo quedó huérfano. Recibe solo metadatos seguros.
 */
export function createChatMediaPipeline({ storage, onCompensationError = () => {} } = {}) {
  if (!storage?.saveBuffer || !storage?.remove) throw new Error('CHAT_MEDIA_PIPELINE_REQUIRES_STORAGE');

  /**
   * Guarda la imagen y persiste el mensaje que la referencia.
   *
   * `persistir` recibe los datos públicos y privados del adjunto y debe hacer
   * el alta del mensaje. Si lanza, el archivo se borra antes de propagar el
   * error: quien llama no tiene que acordarse de compensar.
   *
   * @param {string} dataUrl data URL ya recibida del cliente, sin validar.
   * @param {string} ownerId solo agrupa archivos en subdirectorios; no concede
   *   acceso, que lo decide siempre el mensaje que referencia la imagen.
   * @param {(media: {imageRef: {id: string, mimeType: string}, imageStorageKey: string}) => T} persistir
   * @returns {T} lo que devuelva `persistir`.
   */
  function withStoredImage(dataUrl, ownerId, persistir) {
    // Validación y decodificación: una sola vez, antes de tocar el disco.
    const { mimeType, buffer } = decodeChatImageDataUrl(dataUrl);

    // Paso 1. El almacén revalida la firma binaria, comprueba el tope y exige
    // reserva libre en el volumen. Si falla, no se ha creado ningún mensaje.
    const imageStorageKey = storage.saveBuffer(buffer, mimeType, ownerId);

    // El identificador público es independiente de la clave privada: no se
    // deriva de ella ni permite reconstruirla. Es lo único que viaja al cliente.
    const media = {
      imageRef: { id: crypto.randomUUID(), mimeType },
      imageStorageKey
    };

    // Paso 2. Si el alta del mensaje falla, el archivo no debe sobrevivirle.
    try {
      return persistir(media);
    } catch (error) {
      try {
        storage.remove(imageStorageKey);
      } catch (fallo) {
        // La compensación falló: queda un huérfano. Se avisa con metadatos
        // seguros --nunca la clave ni la ruta-- y se propaga el error
        // ORIGINAL, que es el que explica por qué no hay mensaje. Enmascararlo
        // con el de la limpieza escondería la causa real.
        onCompensationError({ reason: fallo?.code || 'REMOVE_FAILED', mimeType, bytes: buffer.length });
      }
      throw error;
    }
  }

  async function withStoredImageAsync(dataUrl, ownerId, persistir) {
    const { mimeType, buffer } = decodeChatImageDataUrl(dataUrl);
    const imageStorageKey = storage.saveBuffer(buffer, mimeType, ownerId);
    const media = {
      imageRef: { id: crypto.randomUUID(), mimeType },
      imageStorageKey
    };
    try {
      return await persistir(media);
    } catch (error) {
      try {
        storage.remove(imageStorageKey);
      } catch (fallo) {
        onCompensationError({ reason: fallo?.code || 'REMOVE_FAILED', mimeType, bytes: buffer.length });
      }
      throw error;
    }
  }

  return { withStoredImage, withStoredImageAsync };
}
