/**
 * El vídeo de presentación: qué se acepta y por qué.
 *
 * MISMA IDEA QUE LA FOTO, OTRAS MEDIDAS
 *
 * Un vídeo pesa diez veces más que una cédula fotografiada y, a diferencia de
 * ella, tiene duración. Por eso vive aquí y no en `fotoDeDocumento`: mezclar
 * los dos habría significado un solo tope de tamaño para ambos, y entonces una
 * foto de cuarenta megas pasaría sin que nadie lo hubiera decidido.
 *
 * ESTAS REGLAS SON UNA CORTESÍA
 *
 * Comprobar aquí la duración y el peso evita que alguien suba cincuenta megas
 * por una red móvil para que el servidor los rechace al final. Pero la palabra
 * la tiene el servidor, que además lee los bytes: el teléfono dice lo que el
 * sistema le cuenta, y eso se puede falsear. Cada regla de aquí es un espejo
 * de `server/domain/driverApplicationModel.js`, y hay pruebas que las comparan.
 */

/**
 * Lo que admite el almacén privado.
 *
 * MP4 es lo que graba Android; QuickTime, lo que graba iOS. WebM no está, y no
 * es un olvido: Safari no lo reproduce, así que administración no podría ver
 * desde un Mac un vídeo que la aplicación hubiera dejado subir.
 */
export const TIPOS_DE_VIDEO = Object.freeze(['video/mp4', 'video/quicktime'] as const);
export type TipoDeVideo = (typeof TIPOS_DE_VIDEO)[number];

/** Medio minuto: una presentación, no una entrevista. */
export const DURACION_MAXIMA_EN_SEGUNDOS = 30;

/** Cincuenta megas. El techo técnico; el que se nota es la duración. */
export const TAMANO_MAXIMO_DE_VIDEO = 50 * 1024 * 1024;

/**
 * La calidad que se le pide a la cámara.
 *
 * 720p es lo que hace falta para ver una cara con claridad, y deja medio
 * minuto en unos pocos megas. En 1080p el mismo vídeo se va a cuatro veces
 * más, y quien lo sube paga esos megas de su plan de datos.
 */
export const CALIDAD_DE_VIDEO = 0.5;

export interface VideoCapturado {
  readonly uri: string;
  readonly mimeType: TipoDeVideo;
  /** Segundos, si el sistema lo dice. `null` si no. */
  readonly duracion: number | null;
  /** Bytes, si el sistema lo dice. `null` si no. */
  readonly tamano: number | null;
  readonly width: number;
  readonly height: number;
}

export type MotivoDeVideo =
  | 'PERMISO_DENEGADO'
  | 'CANCELADO'
  | 'TIPO_NO_ADMITIDO'
  | 'DEMASIADO_LARGO'
  | 'DEMASIADO_GRANDE'
  | 'NO_DISPONIBLE';

export type ResultadoDeVideo =
  | { readonly ok: true; readonly video: VideoCapturado }
  | { readonly ok: false; readonly motivo: MotivoDeVideo };

/** Lo que devuelve el selector, en lo que aquí importa. */
export interface ActivoDeVideo {
  readonly uri?: string;
  readonly mimeType?: string | null;
  /**
   * Cuánto dura, en la unidad que use la plataforma.
   *
   * En Android e iOS el selector la da en MILISEGUNDOS. En web la calcula con
   * un elemento de vídeo, y ahí `duration` son SEGUNDOS, como en toda la API
   * del navegador. Dar por hecha una de las dos convierte un vídeo de dos
   * minutos en uno de 0,12 segundos, que pasaría el filtro local para que el
   * servidor lo rechace después de subirlo.
   */
  readonly duration?: number | null;
  readonly fileSize?: number | null;
  readonly width?: number;
  readonly height?: number;
}

export function esTipoDeVideo(valor: string | null | undefined): valor is TipoDeVideo {
  return typeof valor === 'string' && (TIPOS_DE_VIDEO as readonly string[]).includes(valor);
}

/**
 * El tipo por la extensión, cuando el selector no lo dice.
 *
 * `.mov` es QuickTime y `.mp4` es MP4; cualquier otra cosa no se adivina, se
 * rechaza. Adivinar un tipo es la forma corta de subir algo que el servidor va
 * a tirar.
 */
export function tipoDeVideoPorExtension(uri: string): TipoDeVideo | null {
  const limpia = (uri.split('?')[0] ?? '').toLowerCase();
  if (limpia.endsWith('.mp4') || limpia.endsWith('.m4v')) return 'video/mp4';
  if (limpia.endsWith('.mov') || limpia.endsWith('.qt')) return 'video/quicktime';
  return null;
}

/** Cómo se llama el fichero que se sube. Sin datos de la persona en el nombre. */
export function nombreDelVideo(mimeType: TipoDeVideo): string {
  return `presentacion${mimeType === 'video/quicktime' ? '.mov' : '.mp4'}`;
}

/**
 * Traduce lo que devuelve el selector, comprobando lo que se puede comprobar.
 *
 * Una décima de margen en la duración: una grabación de treinta segundos suele
 * declararse como 30,04, y rechazarla por eso sería incomprensible para quien
 * acaba de contar hasta treinta.
 */
export type UnidadDeDuracion = 'MILISEGUNDOS' | 'SEGUNDOS';

export function interpretarVideo(
  activo: ActivoDeVideo,
  unidad: UnidadDeDuracion = 'MILISEGUNDOS'
): ResultadoDeVideo {
  const uri = typeof activo.uri === 'string' ? activo.uri : '';
  if (!uri) return { ok: false, motivo: 'NO_DISPONIBLE' };

  const declarado = typeof activo.mimeType === 'string' ? (activo.mimeType.toLowerCase().split(';')[0] ?? null) : null;
  const mimeType = esTipoDeVideo(declarado) ? declarado : tipoDeVideoPorExtension(uri);
  if (!esTipoDeVideo(mimeType)) return { ok: false, motivo: 'TIPO_NO_ADMITIDO' };

  // Aquí se trabaja siempre en segundos, venga como venga.
  const duracion = typeof activo.duration === 'number' && Number.isFinite(activo.duration)
    ? activo.duration / (unidad === 'SEGUNDOS' ? 1 : 1000)
    : null;
  if (duracion !== null && duracion > DURACION_MAXIMA_EN_SEGUNDOS + 0.5) {
    return { ok: false, motivo: 'DEMASIADO_LARGO' };
  }

  const tamano = typeof activo.fileSize === 'number' && Number.isFinite(activo.fileSize) ? activo.fileSize : null;
  if (tamano !== null && tamano > TAMANO_MAXIMO_DE_VIDEO) return { ok: false, motivo: 'DEMASIADO_GRANDE' };

  return {
    ok: true,
    video: {
      uri,
      mimeType,
      duracion,
      tamano,
      width: typeof activo.width === 'number' ? activo.width : 0,
      height: typeof activo.height === 'number' ? activo.height : 0
    }
  };
}

/** Lo que se le dice a la persona cuando algo no sale. */
export const MENSAJES_DE_VIDEO: Readonly<Record<MotivoDeVideo, string>> = Object.freeze({
  PERMISO_DENEGADO: 'Sin permiso para usar la cámara no podemos grabar. Puedes activarlo en los ajustes del teléfono.',
  CANCELADO: '',
  TIPO_NO_ADMITIDO: 'Ese archivo no es un vídeo que podamos usar. Graba uno con la cámara o elige un MP4.',
  DEMASIADO_LARGO: `El vídeo dura más de ${DURACION_MAXIMA_EN_SEGUNDOS} segundos. Grábalo más corto.`,
  DEMASIADO_GRANDE: 'El vídeo pesa demasiado. Grábalo más corto y vuelve a intentarlo.',
  NO_DISPONIBLE: 'No pudimos abrir la cámara en este teléfono. Prueba a elegir un vídeo de la galería.'
});
