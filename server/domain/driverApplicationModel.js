// El expediente de postulación a conductor: el modelo canónico.
//
// DOS DIMENSIONES, NO UNA
//
// Un expediente tiene un VEHÍCULO (moto o carro) y uno o más SERVICIOS a los
// que se postula (transporte de personas, delivery). Son ejes independientes:
// una moto puede hacer las dos cosas, y un carro también. No existen cadenas
// combinadas como `MOTO_DELIVERY_PASSENGER`; cualquier combinación de las dos
// listas es válida, y añadir un servicio nuevo mañana no toca los expedientes
// que ya existen.
//
// QUÉ DOCUMENTOS SE PIDEN DEPENDE DEL VEHÍCULO
//
// Hay un tronco común (cédula, RIF, licencia, certificado médico, documento
// legal del vehículo, fotos del vehículo por delante y por detrás, placa,
// selfie) y una pieza por vehículo: cascos para la moto, interior trasero
// para el carro. `requiredDocumentsFor` es la única función que decide qué
// falta; el móvil la refleja, pero la palabra es de aquí.
//
// LOS EXPEDIENTES VIEJOS NO SE ROMPEN
//
// Antes de este modelo se pedían siete documentos y no había servicios ni
// licencia estructurada. Esos expedientes siguen siendo válidos tal cual: se
// les asigna `requirementsVersion: 1` al leerlos y se evalúan con la lista
// que regía cuando se crearon. Un expediente creado hoy es versión 2. Así un
// conductor aprobado ayer no aparece de pronto «incompleto», y uno pendiente
// no recibe una petición de documentos que nadie le pidió al postularse. Lo
// mismo vale para el vídeo de presentación, que se exige desde la versión 3. Lo
// mismo vale para el vídeo de presentación, que se exige desde la versión 3.
//
// La persistencia guarda cada expediente como un JSON en una fila, así que
// añadir campos no exige migración de esquema; la compatibilidad se resuelve
// en `normalizeStoredApplication`, que rellena los valores por omisión.
//
// UNA SOLA AUTORIDAD
//
// Aprobar, rechazar, pedir cambios: eso pasa en las rutas de administración
// con este modelo como fuente. Aquí no hay nada que conceda nada por su
// cuenta.

export const DRIVER_APPLICATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NEEDS_CHANGES: 'needs_changes',
  SUSPENDED: 'suspended'
});

/** El vehículo con el que se trabaja. Determina los documentos condicionales. */
export const VEHICLE_TYPES = Object.freeze(['MOTO', 'CAR']);

/**
 * A qué se postula. DELIVERY se puede elegir desde hoy, pero el despacho de
 * paquetes todavía no existe: esta fase solo registra la intención.
 */
export const DRIVER_SERVICES = Object.freeze(['PASSENGER_TRANSPORT', 'DELIVERY']);

/** Con qué papel se acredita el vehículo. */
export const VEHICLE_LEGAL_DOCUMENT_TYPES = Object.freeze([
  'CIRCULATION_CARD',
  'OWNERSHIP_TITLE',
  'ORIGIN_CERTIFICATE'
]);

/**
 * Qué grado de licencia sirve para cada vehículo.
 *
 * No existía ninguna regla en el servidor antes de esta; el móvil la copia y
 * hay una prueba que compara. Segundo grado para moto; tercero, cuarto o
 * quinto para carro.
 */
export const LICENSE_GRADES_BY_VEHICLE = Object.freeze({
  MOTO: Object.freeze([2]),
  CAR: Object.freeze([3, 4, 5])
});

/**
 * Los controles administrativos, separados de los documentos.
 *
 * Hoy solo la revisión de documentos ocurre de verdad: la aprobación la deja
 * en PASSED. Los otros tres existen en el modelo para que el día que la
 * operación los tenga no haya que migrar expedientes; mientras tanto nacen en
 * NOT_REQUIRED y nadie simula haberlos hecho.
 */
export const ADMIN_CHECKPOINTS = Object.freeze([
  'DOCUMENTS_REVIEW',
  'VEHICLE_INSPECTION',
  'PSYCHOTECHNICAL_REVIEW',
  'ORIENTATION_TUTORIAL'
]);

export const CHECKPOINT_STATUS = Object.freeze(['NOT_REQUIRED', 'PENDING', 'PASSED', 'FAILED']);

/**
 * La versión de requisitos con la que nace un expediente creado hoy.
 *
 *   1  los siete documentos de siempre
 *   2  once, con RIF, certificado médico y la pieza propia de cada vehículo
 *   3  los once anteriores más el vídeo de presentación
 *
 * Subirla es lo que permite exigir algo nuevo sin volver incompleta ni una
 * sola solicitud ya entregada: cada expediente se evalúa con la versión que
 * regía cuando se creó, y quien mandó el suyo ayer no se encuentra hoy con un
 * requisito que nadie le pidió.
 */
export const REQUIREMENTS_VERSION = 3;

/**
 * Lo que se le pide al vídeo de presentación.
 *
 * Medio minuto es una presentación, no una entrevista: quien revisa ve
 * decenas al día, y el aspirante graba desde su teléfono con el plan de datos
 * que tiene. Los cincuenta megas son el techo técnico de esa media hora de
 * grabación en la peor calidad razonable; el que manda para la persona es la
 * duración, porque es lo que ella controla.
 */
export const VIDEO_MAX_DURATION_SECONDS = 30;
export const VIDEO_MAX_FILE_SIZE = 50 * 1024 * 1024;
/** Los que graban Android e iOS. WebM queda fuera: Safari no lo reproduce. */
export const VIDEO_MIME_TYPES = Object.freeze(['video/mp4', 'video/quicktime']);

/**
 * El catálogo de documentos.
 *
 *   requirement  common    lo piden moto y carro
 *                MOTO/CAR  solo ese vehículo
 *                optional  se acepta, no se exige
 *                legacy    de la versión 1; sigue leyéndose y aceptándose
 *   kind         image     fotografía o PDF por el almacenamiento privado
 *                video     PRESENTATION_VIDEO: MP4 o QuickTime, hasta media
 *                          minuto, por el mismo almacén privado
 *   sinceVersion  desde qué versión de requisitos se pide
 *   satisfiedBy  otros tipos que cuentan como este (compatibilidad v1)
 */
export const DRIVER_DOCUMENT_CATALOG = Object.freeze([
  Object.freeze({ type: 'identity_front', kind: 'image', requirement: 'common' }),
  Object.freeze({ type: 'identity_back', kind: 'image', requirement: 'common' }),
  Object.freeze({ type: 'rif', kind: 'image', requirement: 'common' }),
  Object.freeze({ type: 'driver_license', kind: 'image', requirement: 'common' }),
  Object.freeze({ type: 'medical_certificate', kind: 'image', requirement: 'common' }),
  // El documento legal del vehículo. Cuál de los tres es va en
  // `vehicle.legalDocumentType`; el archivo es este.
  Object.freeze({ type: 'vehicle_registration', kind: 'image', requirement: 'common' }),
  Object.freeze({ type: 'vehicle_front', kind: 'image', requirement: 'common', satisfiedBy: Object.freeze(['vehicle_photo']) }),
  Object.freeze({ type: 'vehicle_rear', kind: 'image', requirement: 'common' }),
  Object.freeze({ type: 'plate_photo', kind: 'image', requirement: 'common' }),
  Object.freeze({ type: 'driver_selfie', kind: 'image', requirement: 'common' }),
  Object.freeze({ type: 'moto_helmets', kind: 'image', requirement: 'MOTO' }),
  Object.freeze({ type: 'car_rear_interior', kind: 'image', requirement: 'CAR' }),
  Object.freeze({ type: 'vehicle_insurance', kind: 'image', requirement: 'optional' }),
  Object.freeze({ type: 'vehicle_photo', kind: 'image', requirement: 'legacy' }),
  // El vídeo de presentación. `sinceVersion` es lo que lo mantiene fuera de
  // los expedientes anteriores: se exige a los nuevos y a nadie más.
  Object.freeze({ type: 'presentation_video', kind: 'video', requirement: 'common', sinceVersion: 3 })
]);

/** Todos los tipos conocidos, incluidos los heredados. */
export const DRIVER_DOCUMENT_TYPES = Object.freeze(DRIVER_DOCUMENT_CATALOG.map(item => item.type));

/**
 * Los que se suben por la ruta de documentos: fotografías y PDF.
 *
 * El vídeo NO está aquí, y no por no admitirse: tiene su propia ruta, con su
 * propio tope de tamaño y su comprobación de duración. Si estuviera en esta
 * lista, el tope de cinco megas de las fotos tendría que subir a cincuenta
 * para todos, y una cédula de cuarenta megas pasaría sin que nadie lo hubiera
 * decidido.
 */
export const UPLOADABLE_DOCUMENT_TYPES = Object.freeze(
  DRIVER_DOCUMENT_CATALOG.filter(item => item.kind === 'image').map(item => item.type)
);

/** Los que se suben por la ruta del vídeo. Hoy, uno. */
export const UPLOADABLE_VIDEO_TYPES = Object.freeze(
  DRIVER_DOCUMENT_CATALOG.filter(item => item.kind === 'video').map(item => item.type)
);

/** Los obligatorios de la versión 1. Se conservan para evaluar expedientes viejos. */
export const REQUIRED_DRIVER_DOCUMENTS = Object.freeze([
  'identity_front',
  'identity_back',
  'driver_license',
  'vehicle_registration',
  'vehicle_photo',
  'plate_photo',
  'driver_selfie'
]);

/** Los obligatorios de la versión 2, según el vehículo. */
export function requiredDocumentsFor({ vehicleType = 'MOTO', requirementsVersion = REQUIREMENTS_VERSION } = {}) {
  const version = Number(requirementsVersion);
  if (version < 2) return REQUIRED_DRIVER_DOCUMENTS;
  const vehicle = VEHICLE_TYPES.includes(vehicleType) ? vehicleType : 'MOTO';
  return Object.freeze(
    DRIVER_DOCUMENT_CATALOG
      .filter(item => (item.requirement === 'common' || item.requirement === vehicle)
        // Lo que se añadió después no se le exige a quien empezó antes.
        && (item.sinceVersion === undefined || version >= item.sinceVersion))
      .map(item => item.type)
  );
}

/**
 * Qué obligatorios faltan.
 *
 * Acepta el expediente para saber su versión y su vehículo. Sin él se evalúa
 * como versión 1, que es lo que hacía antes: así las llamadas antiguas siguen
 * funcionando igual. Un expediente sin el campo de versión también es de la
 * versión 1: es de antes de que existieran.
 */
export function missingRequiredDocuments(documents = [], application = null) {
  const submitted = new Set((documents || []).map(document => document?.type).filter(Boolean));
  const required = application
    ? requiredDocumentsFor({
        vehicleType: application?.vehicle?.type,
        requirementsVersion: Number.isInteger(application?.requirementsVersion) ? application.requirementsVersion : 1
      })
    : REQUIRED_DRIVER_DOCUMENTS;
  return required.filter(type => {
    if (submitted.has(type)) return false;
    const entry = DRIVER_DOCUMENT_CATALOG.find(item => item.type === type);
    return !(entry?.satisfiedBy || []).some(alias => submitted.has(alias));
  });
}

// ---------------------------------------------------------------------------
// Normalización de la entrada
// ---------------------------------------------------------------------------

// Los caracteres de control se quitan por su categoría Unicode (`Cc`), no por
// una clase escrita a mano: así ningún escape puede degradarse a bytes crudos
// al copiar el archivo.
const text = (value, max = 160) => String(value ?? '')
  .replace(/\p{Cc}/gu, ' ')
  .replace(/[<>&"']/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const normalizeIdentityNumber = value => {
  const compact = text(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = compact.match(/^([VEJPG]?)(\d{5,12})$/);
  return match ? `${match[1] ? `${match[1]}-` : ''}${match[2]}` : compact;
};

/** `V-12345678-9`: letra, ocho dígitos y verificador. Una cédula no es un RIF. */
const RIF_PATTERN = /^[VEJPG]-\d{8}-\d$/;

const normalizeRif = value => {
  const compact = text(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';
  const match = compact.match(/^([VEJPG])(\d{8})(\d)$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : compact;
};

/** Lista, o cadena separada por comas (así llega desde un formulario multipart). */
const normalizeServices = value => {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const services = [];
  for (const item of raw) {
    const service = text(item, 40).toUpperCase();
    if (DRIVER_SERVICES.includes(service) && !services.includes(service)) services.push(service);
  }
  return Object.freeze(services);
};

/** Una fecha `YYYY-MM-DD` real, o null. Nunca se inventa una. */
const isoDate = value => {
  const candidate = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  return Number.isNaN(new Date(`${candidate}T00:00:00Z`).getTime()) ? null : candidate;
};

/** Vencida cuando el día ya pasó entero. Hoy todavía vale. */
const expired = (date, now) => new Date(`${date}T23:59:59Z`).getTime() < now.getTime();

const normalizeLegalDocumentType = value => {
  const candidate = text(value, 40).toUpperCase();
  return VEHICLE_LEGAL_DOCUMENT_TYPES.includes(candidate) ? candidate : 'CIRCULATION_CARD';
};

const normalizeLicenseGrade = value => {
  const candidate = text(value, 5);
  if (candidate === '') return null;
  const grade = Number.parseInt(candidate, 10);
  return Number.isInteger(grade) ? grade : null;
};

const normalizeVehicleType = value => (text(value, 20).toUpperCase() === 'CAR' ? 'CAR' : 'MOTO');

export function normalizeDriverApplicationInput(input = {}) {
  return {
    servicesAppliedFor: normalizeServices(input.servicesAppliedFor),
    personal: {
      firstName: text(input.firstName, 80),
      lastName: text(input.lastName, 80),
      identityNumber: normalizeIdentityNumber(input.identityNumber),
      rif: normalizeRif(input.rif),
      birthDate: text(input.birthDate, 10),
      phone: text(input.phone, 30),
      email: text(input.email, 180).toLowerCase(),
      address: text(input.address, 240),
      city: text(input.city, 100),
      region: text(input.region, 100)
    },
    vehicle: {
      type: normalizeVehicleType(input.vehicleType),
      brand: text(input.vehicleBrand, 80),
      model: text(input.vehicleModel, 80),
      year: Number(input.vehicleYear),
      color: text(input.vehicleColor, 50),
      plate: text(input.vehiclePlate, 20).replace(/\s+/g, '').toUpperCase(),
      legalDocumentType: normalizeLegalDocumentType(input.vehicleLegalDocumentType),
      additionalInfo: text(input.vehicleAdditionalInfo, 300)
    },
    license: {
      grade: normalizeLicenseGrade(input.licenseGrade),
      expiration: isoDate(input.licenseExpiration)
    },
    medicalCertificate: {
      expiration: isoDate(input.medicalCertificateExpiration)
    }
  };
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

/** Las reglas de licencia, RIF y certificado. Compartidas por entrada y envío. */
function credentialErrors({ vehicleType, rif, license, medicalCertificate }, { forSubmission, now }) {
  const errors = {};

  if (rif && !RIF_PATTERN.test(rif)) errors.rif = 'Introduce un RIF válido. Por ejemplo, V-12345678-9.';
  if (forSubmission && !rif) errors.rif = 'El RIF es obligatorio para enviar la solicitud.';

  const allowed = LICENSE_GRADES_BY_VEHICLE[vehicleType] || LICENSE_GRADES_BY_VEHICLE.MOTO;
  if (license.grade !== null && !allowed.includes(license.grade)) {
    errors.licenseGrade = vehicleType === 'MOTO'
      ? 'Para moto hace falta licencia de segundo grado.'
      : 'Para carro hace falta licencia de tercer, cuarto o quinto grado.';
  }
  if (forSubmission && license.grade === null) errors.licenseGrade = 'El grado de la licencia es obligatorio.';
  if (license.expiration && expired(license.expiration, now)) errors.licenseExpiration = 'La licencia está vencida.';
  if (forSubmission && !license.expiration) errors.licenseExpiration = 'La fecha de vencimiento de la licencia es obligatoria.';

  if (medicalCertificate.expiration && expired(medicalCertificate.expiration, now)) {
    errors.medicalCertificateExpiration = 'El certificado médico está vencido.';
  }

  return errors;
}

export function validateDriverApplicationInput(
  input = {},
  { requirePassword = true, forSubmission = false, now = new Date() } = {}
) {
  const normalized = normalizeDriverApplicationInput(input);
  const errors = {};
  const { personal, vehicle, license, medicalCertificate } = normalized;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneDigits = personal.phone.replace(/\D/g, '');
  const identityPattern = /^[VEJPG]?[- ]?\d{5,12}$/i;
  const birth = new Date(`${personal.birthDate}T00:00:00Z`);
  const age = Number.isNaN(birth.getTime()) ? -1 : Math.floor((now.getTime() - birth.getTime()) / 31557600000);
  const maxVehicleYear = now.getFullYear() + 1;

  if (normalized.servicesAppliedFor.length === 0) errors.servicesAppliedFor = 'Elige al menos un servicio.';
  if (personal.firstName.length < 2) errors.firstName = 'El nombre es obligatorio.';
  if (personal.lastName.length < 2) errors.lastName = 'El apellido es obligatorio.';
  if (!identityPattern.test(personal.identityNumber)) errors.identityNumber = 'Introduce una cédula válida.';
  if (age < 18 || age > 80) errors.birthDate = 'El conductor debe ser mayor de edad.';
  if (phoneDigits.length < 10 || phoneDigits.length > 15) errors.phone = 'Introduce un teléfono válido.';
  if (!emailPattern.test(personal.email)) errors.email = 'Introduce una dirección de correo válida.';
  if (personal.address.length < 8) errors.address = 'La dirección es obligatoria.';
  if (personal.city.length < 2) errors.city = 'La ciudad es obligatoria.';
  if (personal.region.length < 2) errors.region = 'El estado o región es obligatorio.';
  if (vehicle.brand.length < 2) errors.vehicleBrand = 'La marca es obligatoria.';
  if (vehicle.model.length < 1) errors.vehicleModel = 'El modelo es obligatorio.';
  if (!Number.isInteger(vehicle.year) || vehicle.year < 1980 || vehicle.year > maxVehicleYear) errors.vehicleYear = 'Introduce un año válido.';
  if (vehicle.color.length < 2) errors.vehicleColor = 'El color es obligatorio.';
  if (!/^[A-Z0-9-]{4,12}$/.test(vehicle.plate)) errors.vehiclePlate = 'La placa es obligatoria y debe ser válida.';
  if (requirePassword && String(input.password || '').length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.';

  Object.assign(errors, credentialErrors(
    { vehicleType: vehicle.type, rif: personal.rif, license, medicalCertificate },
    { forSubmission, now }
  ));

  return { valid: Object.keys(errors).length === 0, errors, normalized };
}

/**
 * Lo que un expediente GUARDADO necesita para mandarse a revisión, además de
 * los documentos. Un expediente de versión 1 no necesita nada: se le exige lo
 * que se le pidió cuando se creó.
 */
export function validateApplicationForSubmission(application = {}, { now = new Date() } = {}) {
  const stored = normalizeStoredApplication(application);
  if (stored.requirementsVersion < 2) return { valid: true, errors: {} };
  const errors = credentialErrors(
    {
      vehicleType: stored.vehicle.type,
      rif: stored.personal.rif,
      license: stored.license,
      medicalCertificate: stored.medicalCertificate
    },
    { forSubmission: true, now }
  );
  return { valid: Object.keys(errors).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Controles y correcciones
// ---------------------------------------------------------------------------

/** Lo que se hace de verdad hoy queda pendiente; el resto, no requerido. */
export function defaultCheckpoints() {
  return {
    DOCUMENTS_REVIEW: 'PENDING',
    VEHICLE_INSPECTION: 'NOT_REQUIRED',
    PSYCHOTECHNICAL_REVIEW: 'NOT_REQUIRED',
    ORIENTATION_TUTORIAL: 'NOT_REQUIRED'
  };
}

/**
 * Las correcciones que pide administración, documento por documento.
 *
 * Acepta tipos sueltos (`'plate_photo'`) o pares (`{ type, reason }`). Los
 * tipos desconocidos se descartan y los repetidos se quedan con la primera
 * mención. Un tipo sin motivo propio hereda el motivo general, si lo hay.
 */
export function normalizeRequestedChanges(value = [], fallbackReason = null) {
  const fallback = text(fallbackReason, 300) || null;
  const details = [];
  for (const item of Array.isArray(value) ? value : []) {
    const type = text(typeof item === 'string' ? item : item?.type, 40);
    if (!DRIVER_DOCUMENT_TYPES.includes(type) || details.some(detail => detail.type === type)) continue;
    const reason = typeof item === 'object' && item !== null ? text(item.reason, 300) : '';
    details.push({ type, reason: reason || fallback });
  }
  return details;
}

/**
 * Un expediente tal como está guardado, con todo lo que este modelo espera.
 *
 * Rellena sin sobrescribir: lo que ya existe se respeta, lo que falta toma el
 * valor que tenía implícito cuando se guardó. No muta el original.
 */
export function normalizeStoredApplication(application = {}) {
  const source = application && typeof application === 'object' ? application : {};
  const requirementsVersion = Number.isInteger(source.requirementsVersion) ? source.requirementsVersion : 1;

  const personal = { ...(source.personal || {}) };
  personal.rif = typeof personal.rif === 'string' ? personal.rif : '';

  const vehicle = { ...(source.vehicle || {}) };
  vehicle.type = vehicle.type === 'CAR' ? 'CAR' : 'MOTO';
  vehicle.legalDocumentType = VEHICLE_LEGAL_DOCUMENT_TYPES.includes(vehicle.legalDocumentType)
    ? vehicle.legalDocumentType
    : 'CIRCULATION_CARD';

  const declared = normalizeServices(source.servicesAppliedFor);
  const servicesAppliedFor = declared.length > 0 ? declared : Object.freeze(['PASSENGER_TRANSPORT']);

  const license = {
    grade: Number.isInteger(source.license?.grade) ? source.license.grade : null,
    expiration: isoDate(source.license?.expiration)
  };
  const medicalCertificate = { expiration: isoDate(source.medicalCertificate?.expiration) };

  // Un expediente viejo sin controles: la revisión de documentos refleja lo
  // que ya se decidió sobre él, sin inventar el resto.
  const checkpoints = defaultCheckpoints();
  if (source.status === DRIVER_APPLICATION_STATUS.APPROVED) checkpoints.DOCUMENTS_REVIEW = 'PASSED';
  if (source.status === DRIVER_APPLICATION_STATUS.REJECTED) checkpoints.DOCUMENTS_REVIEW = 'FAILED';
  for (const name of ADMIN_CHECKPOINTS) {
    const value = source.checkpoints?.[name];
    if (CHECKPOINT_STATUS.includes(value)) checkpoints[name] = value;
  }

  const decisionReason = typeof source.decisionReason === 'string' ? source.decisionReason : null;
  const requestedChangeDetails = Array.isArray(source.requestedChangeDetails) && source.requestedChangeDetails.length > 0
    ? normalizeRequestedChanges(source.requestedChangeDetails, decisionReason)
    : normalizeRequestedChanges(source.requestedChanges || [], decisionReason);
  const requestedChanges = requestedChangeDetails.map(detail => detail.type);
  const textualCorrections = typeof source.textualCorrections === 'string' && source.textualCorrections
    ? source.textualCorrections
    : null;

  return {
    ...source,
    requirementsVersion,
    servicesAppliedFor,
    personal,
    vehicle,
    license,
    medicalCertificate,
    checkpoints,
    requestedChangeDetails,
    requestedChanges,
    textualCorrections,
    documents: Array.isArray(source.documents) ? source.documents : []
  };
}
