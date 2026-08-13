// Proyecciones de solicitudes de conductor por tipo de receptor.
//
// Listas blancas puras: cada campo se copia por nombre y nunca se propaga el
// objeto persistido. Un campo nuevo en el modelo de solicitud o de documento
// no aparece en ninguna respuesta hasta que se añade aquí a mano.
//
// El expediente completo —cédula, nacimiento, dirección— vive únicamente en
// `driverApplicationAdminDetail` y en la vista del propio solicitante.

const text = value => (typeof value === 'string' ? value : '');
const numeric = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
/** Cadena no vacía, o null. Se usa para fechas ISO y para texto opcional. */
const textOrNull = value => (typeof value === 'string' && value ? value : null);
const isoOrNull = textOrNull;

/**
 * Metadatos de un documento. Sin `contentUrl`: el cliente compone la ruta
 * protegida a partir del identificador cuando el revisor pulsa «ver», de modo
 * que la referencia no viaja en cada listado ni en cada evento.
 *
 * `originalName` queda fuera a propósito: lo elige quien sube el archivo y
 * puede contener datos personales; ninguna pantalla lo muestra.
 */
export function driverDocumentMetadata(document) {
  if (!document) return null;
  return {
    id: document.id ?? null,
    type: text(document.type),
    status: text(document.status) || 'pending',
    mimeType: text(document.mimeType),
    size: numeric(document.size),
    updatedAt: isoOrNull(document.updatedAt)
  };
}

const documentList = documents => (Array.isArray(documents) ? documents : []).map(driverDocumentMetadata);

function applicantFullName(application, user) {
  const first = text(application?.personal?.firstName) || text(user?.firstName);
  const last = text(application?.personal?.lastName) || text(user?.lastName);
  return `${first} ${last}`.trim();
}

/**
 * Fila de la cola administrativa.
 *
 * Sin datos personales de contacto ni identificación: para decidir a quién
 * revisar primero bastan el nombre, el vehículo, la antigüedad y si el
 * expediente está completo. La búsqueda por cédula, correo o teléfono sigue
 * funcionando en el servidor sin devolver esos campos en cada fila.
 */
export function driverApplicationListItem(application, documents = [], user = null) {
  if (!application) return null;
  const docs = Array.isArray(documents) ? documents : [];
  return {
    id: application.id ?? null,
    status: text(application.status),
    submittedAt: isoOrNull(application.submittedAt),
    createdAt: isoOrNull(application.createdAt),
    updatedAt: isoOrNull(application.updatedAt),
    applicantName: applicantFullName(application, user),
    vehicleType: application.vehicle?.type === 'CAR' ? 'CAR' : 'MOTO',
    vehiclePlate: text(application.vehicle?.plate),
    documentCount: docs.length,
    documentsPendingCount: docs.filter(item => text(item?.status) !== 'approved').length,
    decisionReason: textOrNull(application.decisionReason)
  };
}

/** Datos personales del expediente. Solo administración y el propio titular. */
function personalDetail(personal) {
  return {
    firstName: text(personal?.firstName),
    lastName: text(personal?.lastName),
    identityNumber: text(personal?.identityNumber),
    birthDate: text(personal?.birthDate),
    phone: text(personal?.phone),
    email: text(personal?.email),
    address: text(personal?.address),
    city: text(personal?.city),
    region: text(personal?.region)
  };
}

function vehicleDetail(vehicle) {
  return {
    type: vehicle?.type === 'CAR' ? 'CAR' : 'MOTO',
    brand: text(vehicle?.brand),
    model: text(vehicle?.model),
    year: numeric(vehicle?.year),
    color: text(vehicle?.color),
    plate: text(vehicle?.plate),
    additionalInfo: text(vehicle?.additionalInfo)
  };
}

/** Expediente completo. Exclusivo de administradores autenticados. */
export function driverApplicationAdminDetail(application, documents = [], user = null) {
  if (!application) return null;
  return {
    id: application.id ?? null,
    status: text(application.status),
    submittedAt: isoOrNull(application.submittedAt),
    createdAt: isoOrNull(application.createdAt),
    updatedAt: isoOrNull(application.updatedAt),
    reviewedBy: application.reviewedBy ?? null,
    reviewedAt: isoOrNull(application.reviewedAt),
    decisionReason: textOrNull(application.decisionReason),
    requestedChanges: Array.isArray(application.requestedChanges) ? [...application.requestedChanges] : [],
    personal: personalDetail(application.personal),
    vehicle: vehicleDetail(application.vehicle),
    applicant: user ? {
      id: user.id ?? null,
      firstName: text(user.firstName),
      lastName: text(user.lastName),
      accountStatus: text(user.accountStatus) || 'ACTIVE'
    } : null,
    documents: documentList(documents)
  };
}

/**
 * Vista del propio solicitante. Son sus datos, así que los recibe completos,
 * pero sin la trazabilidad interna de la revisión: quién revisó es información
 * administrativa, no suya.
 */
export function driverApplicationOwnerView(application, documents = []) {
  if (!application) return null;
  return {
    id: application.id ?? null,
    status: text(application.status),
    submittedAt: isoOrNull(application.submittedAt),
    createdAt: isoOrNull(application.createdAt),
    updatedAt: isoOrNull(application.updatedAt),
    decisionReason: textOrNull(application.decisionReason),
    requestedChanges: Array.isArray(application.requestedChanges) ? [...application.requestedChanges] : [],
    personal: personalDetail(application.personal),
    vehicle: vehicleDetail(application.vehicle),
    documents: documentList(documents)
  };
}

/**
 * Aviso mínimo para Socket.IO. Un evento solo señala que algo cambió; quien
 * lo recibe vuelve a pedir por HTTP la vista que le corresponde, en lugar de
 * transportar el expediente por el canal en tiempo real.
 */
export function driverApplicationEvent(application, { status = null } = {}) {
  if (!application) return null;
  return {
    applicationId: application.id ?? null,
    status: text(status || application.status),
    updatedAt: isoOrNull(application.updatedAt)
  };
}
