/**
 * Qué foto vale para un documento. Las reglas, sin el dispositivo.
 *
 * Es la parte de la captura que se puede probar en Node: qué tipos se
 * aceptan, cuánto puede pesar, cómo se llama el archivo y cómo se interpreta
 * lo que devuelve el selector. `media/captura.ts` es quien habla con la
 * cámara y usa esto para decidir.
 *
 * LOS TIPOS SON LOS DEL SERVIDOR
 *
 * JPEG, PNG y WebP: lo que `server/services/privateStorage.js` admite para
 * fotografías. El PDF se acepta allí para documentos, pero de una cámara o una
 * galería no sale un PDF, así que aquí no aparece. Ni SVG ni GIF: el primero
 * es contenido activo y el segundo no es una foto.
 */

/** Lo que el servidor acepta para una fotografía. Espejo del almacenamiento privado. */
export const TIPOS_ADMITIDOS = Object.freeze(['image/jpeg', 'image/png', 'image/webp'] as const);
export type TipoAdmitido = (typeof TIPOS_ADMITIDOS)[number];

/** El tope del servidor por archivo. */
export const TAMANO_MAXIMO_EN_BYTES = 5 * 1024 * 1024;

/**
 * La calidad de la compresión.
 *
 * 0,8 deja una cédula o una placa perfectamente legibles y baja una foto de
 * doce megapíxeles a dos o tres megas. Más abajo empiezan a perderse los
 * números pequeños de una licencia; más arriba se pasa del tope del servidor
 * con una cámara moderna.
 */
export const CALIDAD = 0.8;

export interface FotoCapturada {
  readonly uri: string;
  readonly mimeType: TipoAdmitido;
  readonly width: number;
  readonly height: number;
  /** Bytes, si el sistema lo dice. `null` si no. */
  readonly tamano: number | null;
}

export type MotivoDeCaptura =
  | 'PERMISO_DENEGADO'
  | 'CANCELADO'
  | 'TIPO_NO_ADMITIDO'
  | 'DEMASIADO_GRANDE'
  | 'NO_DISPONIBLE';

export type ResultadoDeCaptura =
  | { readonly ok: true; readonly foto: FotoCapturada }
  | { readonly ok: false; readonly motivo: MotivoDeCaptura };

/** Lo que devuelve el selector, en lo que aquí importa. */
export interface ActivoDelSelector {
  readonly uri?: string;
  readonly mimeType?: string | null;
  readonly width?: number;
  readonly height?: number;
  readonly fileSize?: number | null;
}

/** El tipo a partir de la extensión, cuando el selector no lo dice. */
export function tipoPorExtension(uri: string): string | null {
  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return null;
}

export function esTipoAdmitido(valor: string | null | undefined): valor is TipoAdmitido {
  return typeof valor === 'string' && (TIPOS_ADMITIDOS as readonly string[]).includes(valor);
}

/** Con qué nombre viaja el archivo. Nunca el nombre original del teléfono. */
export function nombreDeArchivo(tipoDeDocumento: string, mimeType: TipoAdmitido): string {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return `${tipoDeDocumento}.${extension}`;
}

/**
 * Convierte lo que devuelve el selector en una foto lista para subir, o dice
 * por qué no vale.
 */
export function interpretarActivo(activo: ActivoDelSelector): ResultadoDeCaptura {
  const uri = typeof activo.uri === 'string' ? activo.uri : '';
  if (!uri) return { ok: false, motivo: 'NO_DISPONIBLE' };

  const declarado = typeof activo.mimeType === 'string' ? activo.mimeType.toLowerCase() : null;
  const mimeType = esTipoAdmitido(declarado) ? declarado : tipoPorExtension(uri);
  if (!esTipoAdmitido(mimeType)) return { ok: false, motivo: 'TIPO_NO_ADMITIDO' };

  const tamano = typeof activo.fileSize === 'number' && Number.isFinite(activo.fileSize) ? activo.fileSize : null;
  if (tamano !== null && tamano > TAMANO_MAXIMO_EN_BYTES) return { ok: false, motivo: 'DEMASIADO_GRANDE' };

  return {
    ok: true,
    foto: {
      uri,
      mimeType,
      width: typeof activo.width === 'number' ? activo.width : 0,
      height: typeof activo.height === 'number' ? activo.height : 0,
      tamano
    }
  };
}

/** Lo que se le dice a la persona en cada caso. */
export const MENSAJES_DE_CAPTURA: Readonly<Record<MotivoDeCaptura, string>> = Object.freeze({
  PERMISO_DENEGADO: 'Sin permiso para usar la cámara no podemos tomar la foto. Puedes activarlo en los ajustes del teléfono.',
  CANCELADO: '',
  TIPO_NO_ADMITIDO: 'Ese archivo no es una foto. Usa JPG, PNG o WebP.',
  DEMASIADO_GRANDE: 'La foto pesa más de 5 MB. Vuelve a tomarla.',
  NO_DISPONIBLE: 'No pudimos abrir la cámara en este teléfono. Prueba con la galería.'
});
