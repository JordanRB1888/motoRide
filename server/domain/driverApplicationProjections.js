// Proyecciones de solicitudes de conductor por tipo de receptor.
//
// Listas blancas puras: cada campo se copia por nombre y nunca se propaga el
// objeto persistido. Un campo nuevo en el modelo de solicitud o de documento
// no aparece en ninguna respuesta hasta que se añade aquí a mano.
//
// El expediente completo —cédula, RIF, nacimiento, dirección— vive únicamente
// en `driverApplicationAdminDetail` y en la vista del propio solicitante.
//
// Todas parten de `normalizeStoredApplication`: un expediente guardado antes
// de que existieran los servicios, la licencia estructurada o los controles
// administrativos se proyecta con sus valores por omisión, y quien lo lee no
// tiene que saber de qué versión es.

import { missingRequiredDocuments, normalizeStoredApplication } from './driverApplicationModel.js';

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

/** A qué se postula: siempre una lista, nunca vacía tras normalizar. */
const servicesList = application => [...(application.servicesAppliedFor || [])];

/**
 * Fila de la cola administrativa.
 *
 * Sin datos personales de contacto ni identificación: para decidir a quién
 * revisar primero bastan el nombre, el vehículo, los servicios, la antigüedad
 * y si el expediente está completo. La búsqueda por cédula, RIF, correo o
 * teléfono sigue funcionando en el servidor sin devolver esos campos en cada
 * fila.
 */
export function driverApplicationListItem(application, documents = [], user = null) {
  const app = application && typeof application === 'object' ? normalizeStoredApplication(application) : null;
  if (!app) return null;
  const docs = Array.isArray(documents) ? documents : [];
  return {
    id: app.id ?? null,
    status: text(app.status),
    submittedAt: isoOrNull(app.submittedAt),
    createdAt: isoOrNull(app.createdAt),
    updatedAt: isoOrNull(app.updatedAt),
    applicantName: applicantFullName(app, user),
    vehicleType: app.vehicle?.type === 'CAR' ? 'CAR' : 'MOTO',
    vehiclePlate: text(app.vehicle?.plate),
    servicesAppliedFor: servicesList(app),
    requirementsVersion: app.requirementsVersion,
    documentCount: docs.length,
    documentsPendingCount: docs.filter(item => text(item?.status) !== 'approved').length,
    missingDocumentCount: missingRequiredDocuments(docs, app).length,
    decisionReason: textOrNull(app.decisionReason)
  };
}

/** Datos personales del expediente. Solo administración y el propio titular. */
function personalDetail(personal) {
  return {
    firstName: text(personal?.firstName),
    lastName: text(personal?.lastName),
    identityNumber: text(personal?.identityNumber),
    rif: text(personal?.rif),
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
    legalDocumentType: text(vehicle?.legalDocumentType) || 'CIRCULATION_CARD',
    additionalInfo: text(vehicle?.additionalInfo)
  };
}

function licenseDetail(license) {
  return {
    grade: Number.isInteger(license?.grade) ? license.grade : null,
    expiration: isoOrNull(license?.expiration)
  };
}

function medicalCertificateDetail(medical) {
  return { expiration: isoOrNull(medical?.expiration) };
}

function checkpointsDetail(checkpoints) {
  return { ...checkpoints };
}

const requestedChangeDetails = app => (app.requestedChangeDetails || []).map(item => ({
  type: text(item?.type),
  reason: textOrNull(item?.reason)
}));

/** Lo que comparten la vista de administración y la del titular. */
function commonDetail(app, documents) {
  return {
    id: app.id ?? null,
    status: text(app.status),
    requirementsVersion: app.requirementsVersion,
    submittedAt: isoOrNull(app.submittedAt),
    createdAt: isoOrNull(app.createdAt),
    updatedAt: isoOrNull(app.updatedAt),
    decisionReason: textOrNull(app.decisionReason),
    requestedChanges: [...(app.requestedChanges || [])],
    requestedChangeDetails: requestedChangeDetails(app),
    textualCorrections: textOrNull(app.textualCorrections),
    servicesAppliedFor: servicesList(app),
    personal: personalDetail(app.personal),
    vehicle: vehicleDetail(app.vehicle),
    license: licenseDetail(app.license),
    medicalCertificate: medicalCertificateDetail(app.medicalCertificate),
    checkpoints: checkpointsDetail(app.checkpoints),
    documents: documentList(documents),
    // Qué obligatorios faltan según SU vehículo y SU versión. Es lo que la
    // aplicación enseña como «te falta esto», sin calcularlo por su cuenta.
    missingDocuments: [...missingRequiredDocuments(documents, app)]
  };
}

/** Expediente completo. Exclusivo de administradores autenticados. */
export function driverApplicationAdminDetail(application, documents = [], user = null) {
  const app = application && typeof application === 'object' ? normalizeStoredApplication(application) : null;
  if (!app) return null;
  return {
    ...commonDetail(app, documents),
    reviewedBy: app.reviewedBy ?? null,
    reviewedAt: isoOrNull(app.reviewedAt),
    applicant: user ? {
      id: user.id ?? null,
      firstName: text(user.firstName),
      lastName: text(user.lastName),
      accountStatus: text(user.accountStatus) || 'ACTIVE'
    } : null
  };
}

/**
 * Vista del propio solicitante. Son sus datos, así que los recibe completos,
 * pero sin la trazabilidad interna de la revisión: quién revisó es información
 * administrativa, no suya.
 */
export function driverApplicationOwnerView(application, documents = []) {
  const app = application && typeof application === 'object' ? normalizeStoredApplication(application) : null;
  if (!app) return null;
  return commonDetail(app, documents);
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
