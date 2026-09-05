/**
 * Qué imagen vale para el chat del viaje, y cómo se convierte en lo que viaja.
 *
 * Función pura, sin dispositivo: se prueba en aislamiento. La captura nativa
 * vive en `media/captura.ts` —la única puerta a `expo-image-picker`— y le pasa
 * a `interpretarImagenDeChat` lo que devolvió el selector.
 *
 * QUÉ SALE DE AQUÍ Y QUÉ NO
 *
 * Sólo una data URL de los tres formatos raster del contrato de chat —JPEG,
 * PNG, WEBP—. Es el MISMO contrato que aplica el servidor, escrito aquí para
 * poder avisar antes de mandar; la barrera definitiva la pone el servidor, que
 * vuelve a comprobar la firma binaria de los bytes ya decodificados. Nada de
 * SVG, GIF, `http`/`https`, `blob:`, `data:text/html` ni rutas arbitrarias: sólo
 * lo que el carrete o la cámara devuelven, con un tipo de la lista.
 *
 * POR QUÉ UN TOPE PROPIO, MÁS BAJO QUE EL DEL SERVIDOR
 *
 * El único camino para mandar un mensaje del chat es el socket, y Socket.IO
 * corta cualquier paquete de más de 1 MB antes de que llegue al servidor. El
 * tope del servidor para la data URL es justo 1 000 000 de caracteres, que con
 * el sobre del evento ya roza ese corte. Aquí se acota por debajo: una imagen
 * que no quepa se rechaza con un aviso claro en vez de desaparecer sin respuesta.
 */

/** Los tres formatos del contrato de chat. Cualquier otro se rechaza. */
export const FORMATOS_DE_CHAT = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Tope de la data URL, por debajo del corte de 1 MB de Socket.IO para dejar
 * sitio al sobre del evento. El servidor recorta a 1 000 000; aquí, menos.
 */
export const LIMITE_DATA_URL = 900_000;

export interface ImagenDeChat {
  /** `file://` local, sólo para la vista previa mientras se sube. */
  readonly uri: string;
  /** La data URL que viaja al servidor. */
  readonly dataUrl: string;
  readonly mimeType: string;
}

export type MotivoDelPicker = 'PERMISO' | 'CANCELADO' | 'FORMATO' | 'TAMANO' | 'ERROR';

export type ResultadoDelPicker =
  | { readonly ok: true; readonly imagen: ImagenDeChat }
  | { readonly ok: false; readonly motivo: MotivoDelPicker };

/** Lo mínimo que hace falta del activo que devuelve el selector. */
export interface ActivoElegido {
  readonly uri?: string;
  readonly mimeType?: string;
  readonly base64?: string | null;
}

/** De un MIME o de la extensión del fichero al subtipo del contrato, o `null`. */
function formatoAdmisible(mimeType: string | undefined, uri: string): string | null {
  const declarado = (mimeType ?? '').toLowerCase();
  if ((FORMATOS_DE_CHAT as readonly string[]).includes(declarado)) return declarado;
  // Sin MIME fiable, se mira la extensión. No es la última palabra —el servidor
  // comprueba los bytes— pero evita construir una data URL con un tipo mentiroso.
  const sinConsulta = uri.toLowerCase().split('?')[0] ?? '';
  const ext = sinConsulta.split('.').pop() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

/** Del activo del selector a lo que se manda, o al motivo por el que no. */
export function interpretarImagenDeChat(activo: ActivoElegido | null | undefined): ResultadoDelPicker {
  if (!activo || typeof activo.base64 !== 'string' || activo.base64 === '') {
    return { ok: false, motivo: 'ERROR' };
  }
  const uri = typeof activo.uri === 'string' ? activo.uri : '';
  const mimeType = formatoAdmisible(activo.mimeType, uri);
  if (mimeType === null) return { ok: false, motivo: 'FORMATO' };

  const dataUrl = `data:${mimeType};base64,${activo.base64}`;
  if (dataUrl.length > LIMITE_DATA_URL) return { ok: false, motivo: 'TAMANO' };

  return { ok: true, imagen: { uri, dataUrl, mimeType } };
}

/** Lo que se le dice a quien elige, según por qué no salió la imagen. */
export function motivoDelPickerEnPantalla(motivo: MotivoDelPicker): string {
  switch (motivo) {
    case 'PERMISO': return 'Necesito permiso para acceder a tus fotos o cámara.';
    case 'FORMATO': return 'Sólo se pueden enviar imágenes JPEG, PNG o WEBP.';
    case 'TAMANO': return 'La imagen es muy grande. Elige una más ligera.';
    case 'CANCELADO': return '';
    case 'ERROR': return 'No se pudo leer la imagen. Inténtalo otra vez.';
  }
}
