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
 *                                               nace en `draft` si faltan documentos
 *                                               400 VALIDATION_FAILED (+ fields)
 *                                               409 USER_EXISTS
 *                                               409 DRIVER_APPLICATION_EXISTS
 *                                               401 EXISTING_ACCOUNT_AUTH_REQUIRED
 *
 *   GET   /api/driver-applications/me           404 APPLICATION_NOT_FOUND si no hay
 *   PATCH /api/driver-applications/me           409 APPLICATION_LOCKED en revisión
 *   PUT   /api/driver-applications/me/documents/:tipo   multipart, un archivo
 *   POST  /api/driver-applications/me/submit    400 MISSING_DOCUMENTS (+ missing)
 *                                               400 VALIDATION_FAILED (+ fields)
 *
 * LA SESIÓN SIGUE SIENDO UNA
 *
 * Crear el expediente devuelve un token, y aquí NO se guarda: la sesión la
 * gobierna `AuthContext`, y la pantalla, tras crear la cuenta, entra por
 * `entrar()` como cualquiera. Guardar el token por otro camino sería una
 * segunda autoridad de sesión.
 *
 * LOS DOCUMENTOS SON PRIVADOS
 *
 * Se suben y ya. No se guardan en el teléfono, no se cachean y no se vuelven a
 * leer: para verlos hay que pedirlos al servidor con sesión. Una cédula en el
 * almacenamiento de la aplicación es una cédula que se filtra con el teléfono.
 */

import { llamar, subirArchivo } from './api';
import { avisarDeCambioDelExpediente } from './expedienteCambiado';
import type { Resultado } from '../domain/apiResult';
import type { EstadoDeSolicitud } from '../domain/driverApplication';
import type { ExpedienteEnElInicio } from '../domain/avisoDePostulacion';
import type {
  ClaveDeServicio,
  DatosDeLicencia,
  DatosDelCertificadoMedico,
  DatosDelVehiculo,
  DatosPersonales,
  TipoDeVehiculo
} from '../domain/postulacion';
import { normalizarCedula, normalizarPlaca, normalizarRif, regionDeLaCiudad } from '../domain/postulacion';
import { TAMANO_MAXIMO_DE_VIDEO } from '../domain/videoDePresentacion';
import type { RetratoDelExpediente } from '../domain/postulacion';

/** Un archivo tal como lo entrega React Native: una ruta, no un `Blob`. */
export interface FotoParaSubir {
  readonly uri: string;
  readonly nombre: string;
  /** `image/jpeg`, `image/png`… Lo que diga el selector. */
  readonly tipo: string;
  readonly tamano?: number | null;
}

/** El tope del servidor: cinco megas por archivo. */
export const TAMANO_MAXIMO_DE_DOCUMENTO = 5 * 1024 * 1024;

export interface DocumentoDeLaSolicitud {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly updatedAt: string | null;
}

export interface CorreccionPedida {
  readonly type: string;
  readonly reason: string | null;
}

export type EstadoDeControl = 'NOT_REQUIRED' | 'PENDING' | 'PASSED' | 'FAILED';

/** La solicitud, tal como la ve su dueño. Sin trazabilidad interna. */
export interface SolicitudPropia {
  readonly id: string | null;
  readonly status: EstadoDeSolicitud;
  readonly requirementsVersion: number;
  readonly submittedAt: string | null;
  readonly updatedAt: string | null;
  /** Por qué se rechazó o qué hay que corregir. Lo escribe administración. */
  readonly decisionReason: string | null;
  /** Los tipos de documento que hay que rehacer. */
  readonly requestedChanges: readonly string[];
  /** Cada uno con su motivo. */
  readonly requestedChangeDetails: readonly CorreccionPedida[];
  /** Si además hay un dato escrito que corregir. */
  readonly textualCorrections: string | null;
  readonly servicesAppliedFor: readonly ClaveDeServicio[];
  readonly vehicleType: TipoDeVehiculo;
  readonly personal: Readonly<Record<string, unknown>> | null;
  readonly vehicle: Readonly<Record<string, unknown>> | null;
  readonly license: { readonly grade: number | null; readonly expiration: string | null };
  readonly medicalCertificate: { readonly expiration: string | null };
  readonly checkpoints: Readonly<Record<string, EstadoDeControl>>;
  readonly documents: readonly DocumentoDeLaSolicitud[];
  /** Qué obligatorios faltan, según el servidor. Es la autoridad. */
  readonly missingDocuments: readonly string[];
}

const ESTADOS = ['draft', 'pending', 'approved', 'rejected', 'needs_changes', 'suspended'];
const CONTROLES = ['NOT_REQUIRED', 'PENDING', 'PASSED', 'FAILED'];

const cadena = (valor: unknown): string | null => (typeof valor === 'string' && valor !== '' ? valor : null);
const objeto = (valor: unknown): Record<string, unknown> | null =>
  (typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : null);
const listaDeCadenas = (valor: unknown): string[] =>
  (Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []);

/**
 * Lee la respuesta del servidor sin fiarse de ella.
 *
 * Un estado que esta versión no conoce se trata como `pending`: el más
 * restrictivo de los que dejan seguir esperando. Nunca se cae en `approved`
 * por no reconocer un valor.
 */
function leerSolicitud(datos: unknown): SolicitudPropia | null {
  const bruto = objeto(datos);
  if (bruto === null || typeof bruto.status !== 'string') return null;

  const licencia = objeto(bruto.license) ?? {};
  const medico = objeto(bruto.medicalCertificate) ?? {};
  const controlesBrutos = objeto(bruto.checkpoints) ?? {};
  const controles: Record<string, EstadoDeControl> = {};
  for (const [nombre, valor] of Object.entries(controlesBrutos)) {
    if (typeof valor === 'string' && CONTROLES.includes(valor)) controles[nombre] = valor as EstadoDeControl;
  }
  const vehiculo = objeto(bruto.vehicle);

  return {
    id: cadena(bruto.id),
    status: (ESTADOS.includes(bruto.status) ? bruto.status : 'pending') as EstadoDeSolicitud,
    requirementsVersion: Number.isInteger(bruto.requirementsVersion) ? (bruto.requirementsVersion as number) : 1,
    submittedAt: cadena(bruto.submittedAt),
    updatedAt: cadena(bruto.updatedAt),
    decisionReason: cadena(bruto.decisionReason),
    requestedChanges: listaDeCadenas(bruto.requestedChanges),
    requestedChangeDetails: (Array.isArray(bruto.requestedChangeDetails) ? bruto.requestedChangeDetails : [])
      .map(objeto)
      .filter((item): item is Record<string, unknown> => item !== null)
      .map(item => ({ type: cadena(item.type) ?? '', reason: cadena(item.reason) })),
    textualCorrections: cadena(bruto.textualCorrections),
    servicesAppliedFor: listaDeCadenas(bruto.servicesAppliedFor)
      .filter((item): item is ClaveDeServicio => item === 'PASSENGER_TRANSPORT' || item === 'DELIVERY'),
    vehicleType: vehiculo?.type === 'CAR' ? 'CAR' : 'MOTO',
    personal: objeto(bruto.personal),
    vehicle: vehiculo,
    license: {
      grade: Number.isInteger(licencia.grade) ? (licencia.grade as number) : null,
      expiration: cadena(licencia.expiration)
    },
    medicalCertificate: { expiration: cadena(medico.expiration) },
    checkpoints: controles,
    documents: (Array.isArray(bruto.documents) ? bruto.documents : [])
      .map(objeto)
      .filter((item): item is Record<string, unknown> => item !== null)
      .map(item => ({
        id: cadena(item.id) ?? '',
        type: cadena(item.type) ?? '',
        status: cadena(item.status) ?? 'pending',
        updatedAt: cadena(item.updatedAt)
      })),
    missingDocuments: listaDeCadenas(bruto.missingDocuments)
  };
}

/** Qué salió mal, en el idioma de la persona. */
export type MotivoDePostulacion =
  | 'VIDEO_DEMASIADO_LARGO'
  | 'VIDEO_SIN_DURACION'
  | 'SESION_CADUCADA'
  | 'DEMASIADOS_INTENTOS'
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
  const detalle = objeto((respuesta as unknown as { datos?: unknown }).datos) ?? {};

  if (respuesta.motivo === 'SIN_RED') return { ok: false, motivo: 'SIN_CONEXION' };
  // Dos casos que no son «un error del servidor» y que la persona puede
  // resolver: la sesión caducó, o el servidor está limitando las peticiones.
  if (respuesta.motivo === 'NO_AUTENTICADO') return { ok: false, motivo: 'SESION_CADUCADA' };
  if (respuesta.estadoHttp === 429) return { ok: false, motivo: 'DEMASIADOS_INTENTOS' };

  const porCodigo: Readonly<Record<string, MotivoDePostulacion>> = {
    VIDEO_TOO_LONG: 'VIDEO_DEMASIADO_LARGO',
    // El servidor no pudo certificar cuánto dura. No es culpa de quien lo sube
    // y no se arregla insistiendo: hace falta otro vídeo.
    VIDEO_DURATION_UNVERIFIABLE: 'VIDEO_SIN_DURACION',
    VALIDATION_FAILED: 'DATOS_INVALIDOS',
    MISSING_DOCUMENTS: 'FALTAN_DOCUMENTOS',
    DRIVER_APPLICATION_EXISTS: 'YA_TIENE_SOLICITUD',
    USER_EXISTS: 'CUENTA_EXISTENTE',
    EXISTING_ACCOUNT_AUTH_REQUIRED: 'NECESITA_CONTRASENA',
    APPLICATION_LOCKED: 'EN_REVISION',
    INVALID_DOCUMENT: 'DOCUMENTO_INVALIDO',
    INVALID_FILE_TYPE: 'DOCUMENTO_INVALIDO',
    FILE_TOO_LARGE: 'ARCHIVO_DEMASIADO_GRANDE',
    LIMIT_FILE_SIZE: 'ARCHIVO_DEMASIADO_GRANDE',
    UPLOAD_FAILED: 'DOCUMENTO_INVALIDO'
  };

  const campos = objeto(detalle.fields) as Record<string, string> | null;
  const faltan = Array.isArray(detalle.missing) ? listaDeCadenas(detalle.missing) : null;

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
  // Todo lo que cambia el expediente pasa por aquí. Avisar en este punto, y no
  // en cada función, es lo que impide que alguien añada una mutación nueva y se
  // olvide de que el inicio está enseñando lo de antes.
  if (solicitud !== null) avisarDeCambioDelExpediente();
  return solicitud === null
    ? { ok: false, motivo: 'ERROR_DEL_SERVIDOR' }
    : { ok: true, solicitud };
}

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------

export interface DatosParaPostularse {
  readonly vehiculo: TipoDeVehiculo;
  readonly servicios: readonly ClaveDeServicio[];
  readonly personales: DatosPersonales;
  readonly datosDelVehiculo: DatosDelVehiculo;
  readonly licencia: DatosDeLicencia;
  readonly certificadoMedico: DatosDelCertificadoMedico;
  /** La de la cuenta nueva, o la de la cuenta de pasajera que ya existe. */
  readonly contrasena: string;
}

/** Los campos tal como los nombra el servidor. */
export function camposDelServidor(datos: Omit<DatosParaPostularse, 'contrasena'>): Record<string, string> {
  const region = regionDeLaCiudad(datos.personales.ciudad) ?? '';
  return {
    servicesAppliedFor: datos.servicios.join(','),
    firstName: datos.personales.nombre.trim(),
    lastName: datos.personales.apellido.trim(),
    identityNumber: normalizarCedula(datos.personales.cedula),
    rif: normalizarRif(datos.personales.rif),
    birthDate: datos.personales.nacimiento.trim(),
    phone: datos.personales.telefono.trim(),
    email: datos.personales.correo.trim().toLowerCase(),
    address: datos.personales.direccion.trim(),
    city: datos.personales.ciudad.trim(),
    region,
    vehicleType: datos.vehiculo,
    vehicleBrand: datos.datosDelVehiculo.marca.trim(),
    vehicleModel: datos.datosDelVehiculo.modelo.trim(),
    vehicleYear: datos.datosDelVehiculo.ano.trim(),
    vehicleColor: datos.datosDelVehiculo.color.trim(),
    vehiclePlate: normalizarPlaca(datos.datosDelVehiculo.placa),
    vehicleLegalDocumentType: datos.datosDelVehiculo.documentoLegal,
    licenseGrade: datos.licencia.grado.trim(),
    licenseExpiration: datos.licencia.vencimiento.trim(),
    medicalCertificateExpiration: datos.certificadoMedico.vencimiento.trim()
  };
}

export type ResultadoDeCreacion =
  | { readonly ok: true; readonly solicitud: SolicitudPropia; readonly correo: string }
  | FalloDePostulacion;

/**
 * Crea la cuenta y el expediente, sin documentos: nace como borrador.
 *
 * El token que devuelve el servidor NO se guarda aquí. La pantalla entra
 * después por `entrar()` del contexto de sesión, con el correo y la
 * contraseña que la persona acaba de escribir.
 */
export async function crearPostulacion(datos: DatosParaPostularse): Promise<ResultadoDeCreacion> {
  const formulario = new FormData();
  for (const [campo, valor] of Object.entries(camposDelServidor(datos))) {
    if (valor !== '') formulario.append(campo, valor);
  }
  formulario.append('password', datos.contrasena);

  const respuesta = await llamar<unknown>('/api/driver-applications', {
    metodo: 'POST',
    conSesion: false,
    cuerpo: formulario,
    tiempoMaximoMs: 60_000
  });
  if (!respuesta.ok) return traducirFallo(respuesta);

  const bruto = objeto(respuesta.datos);
  const solicitud = leerSolicitud(bruto?.application);
  if (solicitud === null) return { ok: false, motivo: 'ERROR_DEL_SERVIDOR' };
  return { ok: true, solicitud, correo: datos.personales.correo.trim().toLowerCase() };
}

// ---------------------------------------------------------------------------
// Leer, corregir, subir, enviar
// ---------------------------------------------------------------------------

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

/** Corrige los datos de una solicitud que aún se puede tocar. Campos del servidor. */
export async function actualizarMiPostulacion(
  campos: Readonly<Record<string, string>>
): Promise<ResultadoDeSolicitud> {
  return interpretar(await llamar<unknown>('/api/driver-applications/me', {
    metodo: 'PATCH',
    cuerpo: campos
  }));
}

/**
 * La subida arranca justo cuando la aplicación vuelve de la cámara o del
 * selector, y en ese instante Android está reasignando la red al proceso:
 * las conexiones abiertas se cortan y la primera petición puede caer en el
 * hueco (visto en el emulador: «Software caused connection abort» al
 * reanudar y `requestNetwork` cinco segundos después). Por eso «sin red» se
 * reintenta unas pocas veces, con pausa. Sólo «sin red»: un 400 o un 413 no
 * mejoran por insistir. Y acotado: nada de bucles.
 */
const INTENTOS_DE_SUBIDA = 3;
const PAUSA_ENTRE_INTENTOS_MS = 2000;

const pausa = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });

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
  if (typeof foto.tamano === 'number' && foto.tamano > TAMANO_MAXIMO_DE_DOCUMENTO) {
    return { ok: false, motivo: 'ARCHIVO_DEMASIADO_GRANDE' };
  }

  for (let intento = 1; ; intento += 1) {
    // Por ruta y desde nativo: `subirArchivo` explica por qué no es `fetch`.
    const respuesta = await subirArchivo<unknown>(
      `/api/driver-applications/me/documents/${encodeURIComponent(tipo)}`,
      'file',
      { uri: foto.uri, nombre: foto.nombre, tipo: foto.tipo },
      { metodo: 'PUT', tiempoMaximoMs: 60_000 }
    );
    if (respuesta.ok || respuesta.motivo !== 'SIN_RED' || intento >= INTENTOS_DE_SUBIDA) {
      return interpretar(respuesta);
    }
    await pausa(PAUSA_ENTRE_INTENTOS_MS);
  }
}

/**
 * Manda la solicitud a revisión.
 *
 * El servidor vuelve a comprobar los documentos según el vehículo, y que estén
 * el RIF y la licencia. Si falta algo responde qué, y la pantalla lo enseña
 * por su nombre en vez de decir «error al enviar».
 */
export async function enviarARevision(): Promise<ResultadoDeSolicitud> {
  return interpretar(await llamar<unknown>('/api/driver-applications/me/submit', {
    metodo: 'POST'
  }));
}

/**
 * Sube el vídeo de presentación.
 *
 * POR SU PROPIA RUTA, Y POR XMLHttpRequest
 *
 * La ruta es otra porque el servidor lo trata distinto: otro tope de tamaño y
 * una comprobación de duración que las fotos no necesitan. El transporte es el
 * mismo que aprendimos con las fotos: `XMLHttpRequest`, que manda el fichero
 * desde nativo y en flujo. Con `fetch` habría que cargar cincuenta megas en
 * memoria para envolverlos, y en un teléfono modesto eso es cerrar la
 * aplicación.
 *
 * El tiempo máximo sube a tres minutos: cincuenta megas por una red móvil
 * venezolana no caben en uno.
 */
export async function subirVideoDePresentacion(video: FotoParaSubir): Promise<ResultadoDeSolicitud> {
  if (typeof video.tamano === 'number' && video.tamano > TAMANO_MAXIMO_DE_VIDEO) {
    return { ok: false, motivo: 'ARCHIVO_DEMASIADO_GRANDE' };
  }

  for (let intento = 1; ; intento += 1) {
    const respuesta = await subirArchivo<unknown>(
      '/api/driver-applications/me/video',
      'file',
      { uri: video.uri, nombre: video.nombre, tipo: video.tipo },
      { metodo: 'PUT', tiempoMaximoMs: 180_000 }
    );
    // Igual que con las fotos: sólo se reintenta la falta de red, que es lo
    // único que puede arreglarse solo. Un 400, un 413 o un 429 no mejoran
    // porque se insista.
    if (respuesta.ok || respuesta.motivo !== 'SIN_RED' || intento >= INTENTOS_DE_SUBIDA) {
      return interpretar(respuesta);
    }
    await pausa(PAUSA_ENTRE_INTENTOS_MS);
  }
}

/**
 * Lo que el inicio necesita del expediente, y nada más.
 *
 * Se queda fuera todo lo que identifica a la persona: la cédula, el teléfono,
 * las claves de los ficheros. Lo que sale de aquí acaba pintado en una tarjeta
 * sobre el mapa, a la vista de quien mire el teléfono por encima del hombro.
 */
export function expedienteParaElInicio(solicitud: SolicitudPropia | null): ExpedienteEnElInicio | null {
  if (solicitud === null) return null;
  return {
    retrato: retratoDelExpediente(solicitud),
    correcciones: solicitud.requestedChangeDetails.map(detalle => ({
      tipo: detalle.type,
      motivo: detalle.reason
    })),
    motivoDeLaDecision: solicitud.decisionReason,
    correccionEscrita: solicitud.textualCorrections
  };
}

/** La ruta protegida de un documento. Sólo con sesión; nunca una URL pública. */
export function rutaDelDocumento(id: string): string {
  return `/api/driver-documents/${encodeURIComponent(id)}/content`;
}

/**
 * El expediente, reducido a lo que hace falta para decidir a dónde ir.
 *
 * Lo traduce el servicio porque es quien conoce la forma que devuelve el
 * backend; quien DECIDE con él es `destinoDePostulacion`, en el dominio.
 */
export function retratoDelExpediente(solicitud: SolicitudPropia): RetratoDelExpediente {
  const vehiculo = solicitud.vehicle ?? {};
  const placa = typeof vehiculo.plate === 'string' ? vehiculo.plate : '';
  const rif = typeof solicitud.personal?.rif === 'string' ? solicitud.personal.rif : '';
  return {
    estado: solicitud.status,
    documentosQueFaltan: solicitud.missingDocuments,
    correccionesPendientes: solicitud.requestedChangeDetails.length,
    tieneRif: rif !== '',
    tieneLicencia: solicitud.license.grade !== null && solicitud.license.expiration !== null,
    tienePlaca: placa !== ''
  };
}
