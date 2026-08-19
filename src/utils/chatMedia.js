import { createPrivatePhotoLoader } from './privatePhoto.js';

/**
 * Carga de adjuntos privados de chat.
 *
 * Desde 4C, una imagen de chat ya no viaja dentro del mensaje: el mensaje lleva
 * `imageRef { id, mimeType }` y el contenido se pide autenticado. El navegador
 * no manda la cabecera de sesión al resolver un `<img src>`, así que hay que
 * descargarla con `fetch` y convertirla en object URL.
 *
 * La maquinaria --propiedad de cada URL, deduplicación de peticiones en vuelo,
 * generaciones para descartar respuestas tardías, liberación al cerrar-- es la
 * misma que ya se certificó para las fotografías privadas, y se reutiliza tal
 * cual en lugar de escribirla dos veces. Lo único propio es qué ruta se pide.
 *
 * La caché es de sesión y vive en memoria, dentro del cargador. No se guarda en
 * `localStorage`, ni en IndexedDB, ni en la Cache API, ni en el service worker:
 * el contenido es privado y la respuesta viaja con `no-store` justamente para
 * que no quede en ningún almacén del navegador. Reutilizarlo mientras la
 * conversación está abierta no contradice eso; persistirlo sí.
 */

/** Identificador de adjunto admisible: el mismo UUID v4 que valida el servidor. */
const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isChatMediaId(value) {
  return typeof value === 'string' && MEDIA_ID.test(value.trim());
}

/** Ruta autenticada del contenido de un adjunto, o null si el id no vale. */
export function chatMediaEndpoint(value) {
  if (!isChatMediaId(value)) return null;
  return `/api/chat-media/${encodeURIComponent(value.trim())}/content`;
}

/**
 * ¿De dónde sale la imagen de este mensaje?
 *
 * Los dos formatos conviven durante la transición: los mensajes creados desde
 * 4C llevan `imageRef`, y los anteriores siguen con la data URL en `image`.
 * **`imageRef` manda**: si un registro trajera los dos por error, se pide el
 * privado y se ignora el heredado, de modo que nunca se pinta dos veces.
 *
 * @returns {{kind: 'ref', id: string} | {kind: 'legacy', dataUrl: string} | null}
 */
export function chatImageSource(message, { isLegacyDataUrl } = {}) {
  const id = message?.imageRef?.id;
  if (isChatMediaId(id)) return { kind: 'ref', id: id.trim() };

  const legacy = message?.image;
  if (typeof legacy === 'string' && legacy && (!isLegacyDataUrl || isLegacyDataUrl(legacy))) {
    return { kind: 'legacy', dataUrl: legacy };
  }
  return null;
}

/**
 * Cargador de adjuntos de chat.
 *
 * La clave es el identificador público del adjunto, no el mensaje: si la misma
 * imagen apareciera en dos sitios de la conversación, se descarga una vez.
 */
export function createChatMediaLoader({ loadUrl, revokeUrl } = {}) {
  return createPrivatePhotoLoader({
    loadUrl,
    ...(revokeUrl ? { revokeUrl } : {}),
    resolveEndpoint: chatMediaEndpoint
  });
}

/**
 * Rellena los huecos de imagen de un contenedor ya pintado.
 *
 * El marcado se pinta sin la imagen y solo después se piden las que
 * correspondan. Si una falla --sesión caducada, acceso denegado, archivo
 * ausente, cupo agotado o contenido ilegible-- el hueco se queda como está y la
 * conversación sigue funcionando: una imagen rota no puede llevarse por delante
 * el resto del hilo.
 */
export function hydrateChatMedia(container, loader) {
  if (!container || !loader || loader.destroyed) return Promise.resolve();
  const elementos = [...container.querySelectorAll('[data-chat-media]')];
  return Promise.all(elementos.map(elemento => {
    const id = elemento.dataset.chatMedia;
    return id ? loader.applyTo(elemento, id, { key: id }) : null;
  }));
}
