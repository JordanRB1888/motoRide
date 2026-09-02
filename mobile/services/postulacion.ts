/**
 * La postulación de conductor, contra el backend REAL.
 *
 * QUIÉN DECIDE
 *
 * El servidor. Aquí sólo se transporta: se manda lo que la persona rellenó y
 * se lee lo que el backend responde. La aplicación no marca una solicitud como
 * aprobada, no adivina el estado mientras espera y no guarda una copia que
 * pueda quedarse vieja. Cada vez que hace falta saber cómo va, se pregunta.
 *
 * CONTRATOS OBSERVADOS, NO SUPUESTOS
 *
 * Todo lo de abajo sale de leer `server/routes/driverApplications.js` y
 * `server/domain/driverApplicationModel.js`:
 *
 *   POST  /api/driver-applications              multipart; crea cuenta y expediente
 *                                               201 → { user, token, application }
 *                                               400 VALIDATION_FAILED (+ fields)
 *                                               400 MISSING_DOCUMENTS (+ missing)
 *                                               409 USER_EXISTS
 *                                               409 DRIVER_APPLICATION_EXISTS
 *                                               401 EXISTING_ACCOUNT_AUTH_REQUIRED
 *
 *   GET   /api/driver-applications/me           404 APPLICATION_NOT_FOUND si no hay
 *   PATCH /api/driver-applications/me           409 APPLICATION_LOCKED en revisión
 *   PUT   /api/driver-applications/me/documents/:tipo   multipart, un archivo
 *   POST  /api/driver-applications/me/submit    400 MISSING_DOCUMENTS (+ missing)
 *
 * LOS DOCUMENTOS SON PRIVADOS
 *
 * Se suben y ya. No se guardan en el teléfono, no se cachean y no se vuelven a
 * leer: para verlos hay que pedirlos al servidor con sesión. Una cédula en el
 * almacenamiento de la aplicación es una cédula que se filtra con el teléfono.
 */

import { llamar } from './api';
import type { Resultado } from '../domain/apiResult';
import type { EstadoDeSolicitud } from '../domain/driverApplication';

/** Un archivo tal como lo entrega React Native: una ruta, no un `Blob`. */
export interface FotoParaSubir {
  readonly uri: string;
  readonly nombre: string;
  /** `image/jpeg`, `image/png`… Lo que diga el selector. */
  readonly tipo: string;
  readonly tamano?: number;
}

/** El tope del servidor: cinco megas por archivo. */
export const TAMANO_MAXIMO_DE_DOCUMENTO = 5 * 1024 * 1024;

export interface DocumentoDeLaSolicitud {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly uploadedAt: string | null;
}

/** La solicitud, tal como la ve su dueño. Sin trazabilidad interna. */
export interface SolicitudPropia {
  readonly id: string | null;
  readonly status: EstadoDeSolicitud;
  readonly submittedAt: string | null;
  readonly updatedAt: string | null;
  /** Por qué se rechazó o qué hay que corregir. Lo escribe administración. */
  readonly decisionReason: string | null;
  /** Los tipos de documento que hay que rehacer. */
  readonly requestedChanges: readonly string[];
  readonly personal: Readonly<Record<string, unknown>> | null;
  readonly vehicle: Readonly<Record<string, unknown>> | null;
  readonly documents: readonly DocumentoDeLaSolicitud[];
}

const ESTADOS = ['draft', 'pending', 'approved', 'rejected', 'needs_changes', 'suspended'];

/**
 * Lee la respuesta del servidor sin fiarse de ella.
 *
 * Un estado que esta versión no conoce se trata como `pending`: el más
 * restrictivo de los que dejan seguir esperando. Nunca se cae en `approved`
 * por no reconocer un valor.
 */
function leerSolicitud(datos: unknown): SolicitudPropia | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const bruto = datos as Record<string, unknown>;
  if (typeof bruto.status !== 'string') return null;

  const documentos = Array.isArray(bruto.documents) ? bruto.documents : [];

  return {
    id: typeof bruto.id === 'string' ? bruto.id : null,
    status: (ESTADOS.includes(bruto.status) ? bruto.status : 'pending') as EstadoDeSolicitud,
    submittedAt: typeof bruto.submittedAt === 'string' ? bruto.submittedAt : null,
    updatedAt: typeof bruto.updatedAt === 'string' ? bruto.updatedAt : null,
    decisionReason: typeof bruto.decisionReason === 'string' ? bruto.decisionReason : null,
    requestedChanges: Array.isArray(bruto.requestedChanges)
      ? bruto.requestedChanges.filter((item): item is string => typeof item === 'string')
      : [],
    personal: typeof bruto.personal === 'object' && bruto.personal !== null
      ? (bruto.personal as Record<string, unknown>)
      : null,
    vehicle: typeof bruto.vehicle === 'object' && bruto.vehicle !== null
      ? (bruto.vehicle as Record<string, unknown>)
      : null,
    documents: documentos
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(item => ({
        id: typeof item.id === 'string' ? item.id : '',
        type: typeof item.type === 'string' ? item.type : '',
        status: typeof item.status === 'string' ? item.status : 'pending',
        uploadedAt: typeof item.uploadedAt === 'string' ? item.uploadedAt : null
      }))
  };
}

/** Qué salió mal, en el idioma de la persona. */
export type MotivoDePostulacion =
  | 'DATOS_INVALIDOS'
  | 'FALTAN_DOCUMENTOS'
  | 'YA_TIENE_SOLICITUD'
  | 'CUENTA_EXISTENTE'
  | 'NECESITA_CONTRASENA'
  | 'EN_REVISION'
  | 'DOCUMENTO_INVALIDO'
  | 'ARCHIVO_DEMASIADO_GRANDE'
  | 'SIN_CONEXION'
  | 'ERROR_DEL_SERVIDOR';

export interface FalloDePostulacion {
  readonly ok: false;
  readonly motivo: MotivoDePostulacion;
  /** Qué campo falló, cuando el servidor lo dice. */
  readonly campos?: Readonly<Record<string, string>>;
  /** Qué documentos faltan, cuando el servidor lo dice. */
  readonly faltan?: readonly string[];
}

function traducirFallo(respuesta: Extract<Resultado<unknown>, { ok: false }>): FalloDePostulacion {
  const codigo = respuesta.codigo ?? '';
  const detalle = (respuesta as unknown as { datos?: Record<string, unknown> }).datos ?? {};

  if (respuesta.motivo === 'SIN_RED') return { ok: false, motivo: 'SIN_CONEXION' };

  const porCodigo: Readonly<Record<string, MotivoDePostulacion>> = {
    VALIDATION_FAILED: 'DATOS_INVALIDOS',
    MISSING_DOCUMENTS: 'FALTAN_DOCUMENTOS',
    DRIVER_APPLICATION_EXISTS: 'YA_TIENE_SOLICITUD',
    USER_EXISTS: 'CUENTA_EXISTENTE',
    EXISTING_ACCOUNT_AUTH_REQUIRED: 'NECESITA_CONTRASENA',
    APPLICATION_LOCKED: 'EN_REVISION',
    INVALID_DOCUMENT: 'DOCUMENTO_INVALIDO',
    FILE_TOO_LARGE: 'ARCHIVO_DEMASIADO_GRANDE',
    UPLOAD_FAILED: 'DOCUMENTO_INVALIDO'
  };

  const campos = typeof detalle.fields === 'object' && detalle.fields !== null
    ? (detalle.fields as Record<string, string>)
    : undefined;
  const faltan = Array.isArray(detalle.missing)
    ? detalle.missing.filter((item): item is string => typeof item === 'string')
    : undefined;

  return {
    ok: false,
    motivo: porCodigo[codigo] ?? 'ERROR_DEL_SERVIDOR',
    ...(campos ? { campos } : {}),
    ...(faltan ? { faltan } : {})
  };
}

export type ResultadoDeSolicitud =
  | { readonly ok: true; readonly solicitud: SolicitudPropia }
  | FalloDePostulacion;

/** Cuando no hay ninguna solicitud todavía. No es un error. */
export type LecturaDeSolicitud =
  | { readonly ok: true; readonly solicitud: SolicitudPropia | null }
  | FalloDePostulacion;

function interpretar(respuesta: Resultado<unknown>): ResultadoDeSolicitud {
  if (!respuesta.ok) return traducirFallo(respuesta);
  const solicitud = leerSolicitud(respuesta.datos);
  return solicitud === null
    ? { ok: false, motivo: 'ERROR_DEL_SERVIDOR' }
    : { ok: true, solicitud };
}

/**
 * Mi solicitud, si la hay.
 *
 * El 404 del servidor significa «todavía no has empezado», que no es un fallo:
 * se devuelve `null` y la pantalla ofrece postularse.
 */
export async function leerMiPostulacion(): Promise<LecturaDeSolicitud> {
  const respuesta = await llamar<unknown>('/api/driver-applications/me');
  if (!respuesta.ok) {
    if (respuesta.codigo === 'APPLICATION_NOT_FOUND') return { ok: true, solicitud: null };
    return traducirFallo(respuesta);
  }
  const solicitud = leerSolicitud(respuesta.datos);
  return solicitud === null
    ? { ok: false, motivo: 'ERROR_DEL_SERVIDOR' }
    : { ok: true, solicitud };
}

/** Corrige los datos de una solicitud que aún se puede tocar. */
export async function actualizarMiPostulacion(
  campos: Readonly<Record<string, string>>
): Promise<ResultadoDeSolicitud> {
  return interpretar(await llamar<unknown>('/api/driver-applications/me', {
    metodo: 'PATCH',
    cuerpo: campos
  }));
}

/**
 * Sube un documento. Sustituye al anterior de ese tipo, si lo había.
 *
 * El tiempo máximo sube a un minuto: una foto por una red móvil venezolana no
 * cabe en los quince segundos de una petición normal.
 */
export async function subirDocumento(
  tipo: string,
  foto: FotoParaSubir
): Promise<ResultadoDeSolicitud> {
  if (foto.tamano !== undefined && foto.tamano > TAMANO_MAXIMO_DE_DOCUMENTO) {
    return { ok: false, motivo: 'ARCHIVO_DEMASIADO_GRANDE' };
  }

  const formulario = new FormData();
  // React Native manda archivos con esta forma; no es un `Blob` del navegador.
  formulario.append('file', {
    uri: foto.uri,
    name: foto.nombre,
    type: foto.tipo
  } as unknown as Blob);

  return interpretar(await llamar<unknown>(
    `/api/driver-applications/me/documents/${encodeURIComponent(tipo)}`,
    { metodo: 'PUT', cuerpo: formulario, tiempoMaximoMs: 60_000 }
  ));
}

/**
 * Manda la solicitud a revisión.
 *
 * El servidor vuelve a comprobar que estén los siete documentos. Si falta
 * alguno responde cuáles, y la pantalla los enseña por su nombre en vez de
 * decir «error al enviar».
 */
export async function enviarARevision(): Promise<ResultadoDeSolicitud> {
  return interpretar(await llamar<unknown>('/api/driver-applications/me/submit', {
    metodo: 'POST'
  }));
}
