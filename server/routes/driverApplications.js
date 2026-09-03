import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { videoDurationSeconds } from '../services/privateStorage.js';
import {
  driverApplicationListItem,
  driverApplicationAdminDetail,
  driverApplicationOwnerView,
  driverApplicationEvent
} from '../domain/driverApplicationProjections.js';
import {
  DRIVER_APPLICATION_STATUS,
  REQUIREMENTS_VERSION,
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MAX_FILE_SIZE,
  VIDEO_MIME_TYPES,
  UPLOADABLE_DOCUMENT_TYPES,
  defaultCheckpoints,
  missingRequiredDocuments,
  normalizeRequestedChanges,
  normalizeStoredApplication,
  validateApplicationForSubmission,
  validateDriverApplicationInput
} from '../domain/driverApplicationModel.js';

// Solo lo que se puede subir hoy. El vídeo de presentación está en el modelo
// pero no aquí: el almacenamiento privado no lo admite todavía.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: UPLOADABLE_DOCUMENT_TYPES.length },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype)) return callback(null, true);
    const error = new Error('INVALID_FILE_TYPE');
    error.code = 'INVALID_FILE_TYPE';
    callback(error);
  }
});

const uploadFields = upload.fields(UPLOADABLE_DOCUMENT_TYPES.map(name => ({ name, maxCount: 1 })));
const singleDocumentUpload = upload.single('file');

/**
 * El video va por su propia puerta.
 *
 * Cincuenta megas frente a los cinco de una foto: mezclarlos en el mismo
 * `multer` significaria abrir ese techo para cualquier documento, y entonces
 * una cedula de cuarenta megas pasaria sin que nadie lo hubiera decidido.
 */
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (VIDEO_MIME_TYPES.includes(String(file.mimetype || '').toLowerCase().split(';')[0])) {
      callback(null, true);
      return;
    }
    const error = new Error('INVALID_FILE_TYPE');
    error.code = 'INVALID_FILE_TYPE';
    callback(error);
  }
}).single('file');

import { addressKey, createIdentityLimiter, MINUTO, CUARTO_DE_HORA } from '../services/httpRateLimit.js';

// El limitador de /api/driver-applications no alcanza a todas estas rutas:
// el router se monta en /api, de modo que /api/admin/driver-applications,
// /api/admin/actions y /api/driver-documents/:id/content quedaban sin cubrir
// pese a parecer que estaban dentro.
// Cada operacion cuesta lo suyo, y por eso cada una tiene su propio techo. Los
// de aqui van SIEMPRE detras de `requireAuth`, de modo que cuentan por cuenta:
// dos personas que comparten la direccion de su operador no se restan.
const limitadores = {
  // Lee un documento de disco en cada peticion.
  documentos: createIdentityLimiter({ name: 'documentos', limit: 120, windowMs: MINUTO }),
  // Subir cedula, licencia o RCV: caro y poco frecuente. Un expediente completo
  // son once fotos; con repeticiones y las correcciones que pida administracion,
  // sesenta por cuenta y cuarto de hora deja sitio de sobra para el uso honrado
  // y sigue siendo un techo real --sesenta ficheros de cinco megas--.
  subidas: createIdentityLimiter({ name: 'subidas-documento', limit: 60, windowMs: CUARTO_DE_HORA }),
  // Leer y corregir el expediente, propio o desde administracion.
  expedientes: createIdentityLimiter({ name: 'expedientes', limit: 240, windowMs: MINUTO }),
  // El video pesa diez veces mas que una foto y solo hay uno por expediente.
  // Diez por cuarto de hora deja repetirlo las veces que haga falta --grabar
  // uno bueno cuesta varios intentos-- sin abrir la puerta a medio giga.
  video: createIdentityLimiter({ name: 'subida-video', limit: 10, windowMs: CUARTO_DE_HORA })
};

/**
 * El alta: lo unico que no lleva sesion y si cuesta.
 *
 * Crea una cuenta y calcula un hash de contrasena, asi que cuenta tambien los
 * aciertos y se agrupa por direccion --no hay cuenta todavia que usar como
 * clave--. Veinte por cuarto de hora es el mismo techo que el registro normal
 * de la aplicacion: dar de alta veinte conductores distintos desde la misma
 * conexion en quince minutos no es un caso legitimo.
 */
const limitadorDeAlta = createIdentityLimiter({
  name: 'postulacion-alta',
  limit: 20,
  windowMs: CUARTO_DE_HORA,
  keyGenerator: addressKey
});

/** Los estados en los que el titular todavía puede tocar su expediente. */
const EDITABLE_STATUSES = [
  DRIVER_APPLICATION_STATUS.DRAFT,
  DRIVER_APPLICATION_STATUS.NEEDS_CHANGES,
  DRIVER_APPLICATION_STATUS.REJECTED
];

const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>&"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Qué trozo del fichero pide una cabecera `Range`.
 *
 * Devuelve `null` cuando no hay que servir un trozo —sin cabecera, o con una
 * que no se entiende, que por norma se ignora y se manda el fichero entero— y
 * la cadena `'INVALIDO'` cuando el rango se entiende pero cae fuera del
 * fichero, que es lo que merece un 416.
 *
 * Sólo se admite un rango simple: `bytes=inicio-fin`, `bytes=inicio-` o
 * `bytes=-ultimos`. Los rangos múltiples exigirían respuesta multiparte, y
 * ningún reproductor los necesita para esto.
 */
function leerRango(cabecera, tamano) {
  if (typeof cabecera !== 'string') return null;
  const partes = /^bytes=(\d*)-(\d*)$/.exec(cabecera.trim());
  if (!partes) return null;

  const [, inicioBruto, finBruto] = partes;
  if (inicioBruto === '' && finBruto === '') return null;
  if (tamano === 0) return 'INVALIDO';

  let desde;
  let hasta;
  if (inicioBruto === '') {
    // `bytes=-500`: los últimos quinientos bytes.
    const ultimos = Number(finBruto);
    if (!Number.isFinite(ultimos) || ultimos <= 0) return 'INVALIDO';
    desde = Math.max(0, tamano - ultimos);
    hasta = tamano - 1;
  } else {
    desde = Number(inicioBruto);
    hasta = finBruto === '' ? tamano - 1 : Number(finBruto);
    if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return 'INVALIDO';
    // Un final más allá del fichero se recorta; un principio, no: eso es pedir
    // algo que no existe.
    hasta = Math.min(hasta, tamano - 1);
    if (desde > hasta || desde >= tamano) return 'INVALIDO';
  }
  return { desde, hasta };
}

export function createDriverApplicationsRouter({
  database,
  persistDatabase,
  publicUser,
  signToken,
  requireAuth,
  requireRole,
  io,
  bcrypt,
  privateStorage
}) {
  const router = express.Router();

  const getApplicationDocuments = applicationId => database.driverDocuments.filter(document => document.applicationId === applicationId);
  const createNotification = ({ userId = null, targetRole = null, title, message, category = 'ACCOUNT' }) => {
    const notification = {
      id: `notification_${crypto.randomUUID()}`,
      userId,
      targetRole,
      title,
      message,
      category,
      icon: '🔔',
      read: false,
      createdAt: new Date().toISOString()
    };
    database.notifications.push(notification);
    return notification;
  };

  /**
   * Crea la cuenta (o reutiliza la del pasajero) y el expediente.
   *
   * CON O SIN DOCUMENTOS
   *
   * Antes exigía todos los documentos en esta misma petición. Eso obligaba a
   * hacer las once fotos de una vez y sin poder parar. Ahora el expediente
   * nace como BORRADOR si falta algo, y se completa documento a documento con
   * `PUT /me/documents/:type` hasta que `POST /me/submit` lo manda a revisión.
   * Si llega completo y con los datos de envío, entra directamente en
   * revisión, como antes.
   */
  router.post('/driver-applications', limitadorDeAlta, uploadFields, async (req, res) => {
    // Un cliente que no declara servicios es de antes de que existieran (el
    // registro web): su expediente nace con los requisitos de la version 1 y
    // se postula, como siempre, a llevar personas. Quien declara el campo se
    // valida estricto: vacio o desconocido es 400.
    const legacyClient = req.body.servicesAppliedFor === undefined && req.body.requirementsVersion === undefined;
    if (legacyClient) req.body.servicesAppliedFor = 'PASSENGER_TRANSPORT';
    const requirementsVersion = legacyClient ? 1 : REQUIREMENTS_VERSION;
    const validation = validateDriverApplicationInput(req.body);
    if (!validation.valid) return res.status(400).json({ error: 'VALIDATION_FAILED', fields: validation.errors });
    const { personal, vehicle, license, medicalCertificate, servicesAppliedFor } = validation.normalized;
    const phoneKey = personal.phone.replace(/\D/g, '');
    const matchingUsers = database.users.filter(user => user.email?.toLowerCase() === personal.email || String(user.phone || '').replace(/\D/g, '') === phoneKey);
    const existingUser = matchingUsers.length === 1 ? matchingUsers[0] : null;
    if (matchingUsers.length > 1 || (existingUser && existingUser.role !== 'passenger')) return res.status(409).json({ error: 'USER_EXISTS' });
    // Un expediente por persona, y la comprobacion no se fia de un solo dato.
    //
    // El puntero `driverApplicationId` del usuario es lo primero que se mira,
    // pero si por lo que sea no se hubiera escrito --una escritura a medias, un
    // dato importado-- el expediente seguiria existiendo en su coleccion. Por
    // eso se busca tambien por `userId`: es la misma pregunta hecha por el otro
    // lado, y es la que impide que tocar dos veces el boton deje a alguien con
    // dos expedientes vivos que administracion tendria que desempatar a mano.
    const existingApplication = existingUser
      ? database.driverApplications.find(item => item.userId === existingUser.id || item.id === existingUser.driverApplicationId)
      : null;
    if (existingApplication) {
      return res.status(409).json({ error: 'DRIVER_APPLICATION_EXISTS', applicationStatus: existingApplication.status || 'pending' });
    }
    if (existingUser && (!existingUser.passwordHash || !await bcrypt.compare(String(req.body.password || ''), existingUser.passwordHash))) {
      return res.status(401).json({ error: 'EXISTING_ACCOUNT_AUTH_REQUIRED' });
    }

    const files = Object.entries(req.files || {})
      .filter(([type]) => UPLOADABLE_DOCUMENT_TYPES.includes(type))
      .flatMap(([type, items]) => items.map(file => ({ type, file })));

    const now = new Date().toISOString();
    const userId = existingUser?.id || `passenger_${crypto.randomUUID()}`;
    const applicationId = `driver_application_${crypto.randomUUID()}`;
    const stored = [];
    try {
      for (const item of files) {
        const storageKey = privateStorage.save(item.file, userId);
        stored.push({
          id: `driver_document_${crypto.randomUUID()}`,
          applicationId,
          userId,
          type: item.type,
          storageKey,
          originalName: String(item.file.originalname || 'documento').slice(0, 180),
          mimeType: item.file.mimetype,
          size: item.file.size,
          status: 'pending',
          uploadedAt: now,
          updatedAt: now
        });
      }
    } catch (error) {
      stored.forEach(document => privateStorage.remove(document.storageKey));
      return res.status(400).json({ error: error.code || 'UPLOAD_FAILED' });
    }

    const passwordHash = existingUser?.passwordHash || await bcrypt.hash(String(req.body.password), 12);
    const conflictingUser = database.users.find(item => item.id !== userId && (item.email?.toLowerCase() === personal.email || String(item.phone || '').replace(/\D/g, '') === personal.phone.replace(/\D/g, '')));
    if (conflictingUser) {
      stored.forEach(document => privateStorage.remove(document.storageKey));
      return res.status(409).json({ error: 'USER_EXISTS' });
    }
    const user = existingUser || {
      id: userId,
      role: 'passenger',
      firstName: personal.firstName,
      lastName: personal.lastName,
      email: personal.email,
      phone: personal.phone,
      cedula: personal.identityNumber,
      rif: personal.rif || null,
      birthDate: personal.birthDate,
      address: personal.address,
      city: personal.city,
      region: personal.region,
      passwordHash,
      accountStatus: 'ACTIVE',
      emailVerified: false,
      phoneVerified: false,
      driverApplicationId: applicationId,
      walletBalance: 0,
      rating: 5,
      totalTrips: 0,
      createdAt: now,
      updatedAt: now
    };
    if (existingUser) {
      Object.assign(user, {
        firstName: personal.firstName,
        lastName: personal.lastName,
        email: personal.email,
        phone: personal.phone,
        cedula: personal.identityNumber,
        rif: personal.rif || user.rif || null,
        birthDate: personal.birthDate,
        address: personal.address,
        city: personal.city,
        region: personal.region,
        driverApplicationId: applicationId,
        updatedAt: now
      });
    }

    const application = {
      id: applicationId,
      userId,
      requirementsVersion,
      status: DRIVER_APPLICATION_STATUS.DRAFT,
      servicesAppliedFor: [...servicesAppliedFor],
      personal,
      vehicle,
      license,
      medicalCertificate,
      checkpoints: defaultCheckpoints(),
      submittedAt: null,
      createdAt: now,
      updatedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      decisionReason: null,
      requestedChanges: [],
      requestedChangeDetails: [],
      textualCorrections: null
    };

    // Si llegó completo, entra en revisión directamente.
    const missing = missingRequiredDocuments(stored, application);
    const submission = validateApplicationForSubmission(application);
    const complete = missing.length === 0 && submission.valid;
    if (complete) {
      application.status = DRIVER_APPLICATION_STATUS.PENDING;
      application.submittedAt = now;
    }

    if (!existingUser) database.users.push(user);
    database.driverApplications.push(application);
    database.driverDocuments.push(...stored);
    const adminNotification = complete ? createNotification({
      targetRole: 'admin',
      title: 'Nuevo conductor esperando aprobación',
      message: `${personal.firstName} ${personal.lastName} envió una solicitud con vehículo ${vehicle.type === 'CAR' ? 'automóvil' : 'moto'}.`
    }) : null;
    if (!await persistDatabase()) {
      stored.forEach(document => privateStorage.remove(document.storageKey));
      return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
    }
    if (complete) {
      io.to('admins').emit('driver_application:new', driverApplicationEvent(application));
      io.to('admins').emit('platform:notification', adminNotification);
    }
    res.status(201).json({
      status: 'created',
      user: publicUser(user),
      token: signToken(user),
      application: driverApplicationOwnerView(application, stored)
    });
  });

  router.get('/driver-applications/me', requireAuth, limitadores.expedientes, (req, res) => {
    const application = database.driverApplications.find(item => item.userId === req.user.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    res.json(driverApplicationOwnerView(application, getApplicationDocuments(application.id)));
  });

  /**
   * Corrige los datos de un expediente que todavía se puede tocar.
   *
   * Lo que no venga en el cuerpo se conserva. Eso incluye el vehículo: se
   * puede pasar de moto a carro antes de enviar, y entonces cambian los
   * documentos que faltan.
   */
  router.patch('/driver-applications/me', requireAuth, limitadores.expedientes, async (req, res) => {
    const application = database.driverApplications.find(item => item.userId === req.user.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    if (!EDITABLE_STATUSES.includes(application.status)) return res.status(409).json({ error: 'APPLICATION_LOCKED' });
    const stored = normalizeStoredApplication(application);
    const merged = {
      ...stored.personal,
      ...req.body,
      servicesAppliedFor: req.body.servicesAppliedFor ?? stored.servicesAppliedFor,
      rif: req.body.rif ?? stored.personal.rif,
      vehicleType: req.body.vehicleType || stored.vehicle.type,
      vehicleBrand: req.body.vehicleBrand || stored.vehicle.brand,
      vehicleModel: req.body.vehicleModel || stored.vehicle.model,
      vehicleYear: req.body.vehicleYear || stored.vehicle.year,
      vehicleColor: req.body.vehicleColor || stored.vehicle.color,
      vehiclePlate: req.body.vehiclePlate || stored.vehicle.plate,
      vehicleLegalDocumentType: req.body.vehicleLegalDocumentType || stored.vehicle.legalDocumentType,
      vehicleAdditionalInfo: req.body.vehicleAdditionalInfo ?? stored.vehicle.additionalInfo,
      licenseGrade: req.body.licenseGrade ?? stored.license.grade ?? '',
      licenseExpiration: req.body.licenseExpiration ?? stored.license.expiration ?? '',
      medicalCertificateExpiration: req.body.medicalCertificateExpiration ?? stored.medicalCertificate.expiration ?? ''
    };
    const validation = validateDriverApplicationInput(merged, { requirePassword: false });
    if (!validation.valid) return res.status(400).json({ error: 'VALIDATION_FAILED', fields: validation.errors });
    application.personal = validation.normalized.personal;
    application.vehicle = validation.normalized.vehicle;
    application.license = validation.normalized.license;
    application.medicalCertificate = validation.normalized.medicalCertificate;
    application.servicesAppliedFor = [...validation.normalized.servicesAppliedFor];
    application.status = DRIVER_APPLICATION_STATUS.DRAFT;
    application.updatedAt = new Date().toISOString();
    if (!await persistDatabase()) return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
    res.json(driverApplicationOwnerView(application, getApplicationDocuments(application.id)));
  });

  router.put('/driver-applications/me/documents/:type', requireAuth, limitadores.subidas, singleDocumentUpload, async (req, res) => {
    const application = database.driverApplications.find(item => item.userId === req.user.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    if (!EDITABLE_STATUSES.includes(application.status)) return res.status(409).json({ error: 'APPLICATION_LOCKED' });
    if (!UPLOADABLE_DOCUMENT_TYPES.includes(req.params.type) || !req.file) return res.status(400).json({ error: 'INVALID_DOCUMENT' });
    const existing = database.driverDocuments.find(document => document.applicationId === application.id && document.type === req.params.type);
    let storageKey;
    try { storageKey = privateStorage.save(req.file, req.user.id); }
    catch (error) { return res.status(400).json({ error: error.code || 'UPLOAD_FAILED' }); }
    if (existing) {
      privateStorage.remove(existing.storageKey);
      Object.assign(existing, { storageKey, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, status: 'pending', updatedAt: new Date().toISOString() });
    } else {
      database.driverDocuments.push({ id: `driver_document_${crypto.randomUUID()}`, applicationId: application.id, userId: req.user.id, type: req.params.type, storageKey, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, status: 'pending', uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    application.status = DRIVER_APPLICATION_STATUS.DRAFT;
    // Repetir el documento atiende la correccion que administracion pidio
    // sobre el: deja de figurar como pendiente. El motivo global y las
    // correcciones de texto siguen hasta el reenvio; si el nuevo tampoco
    // sirve, administracion volvera a pedirlo.
    const pendientes = normalizeStoredApplication(application).requestedChangeDetails
      .filter(detail => detail.type !== req.params.type);
    application.requestedChangeDetails = pendientes;
    application.requestedChanges = pendientes.map(detail => detail.type);
    application.updatedAt = new Date().toISOString();
    if (!await persistDatabase()) {
      privateStorage.remove(storageKey);
      return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
    }
    res.json(driverApplicationOwnerView(application, getApplicationDocuments(application.id)));
  });

  /**
   * El vídeo de presentación.
   *
   * TIENE SU PROPIA RUTA, Y NO ES CAPRICHO
   *
   * Pesa diez veces más que una foto, dura lo que dura y se valida distinto.
   * Meterlo en la ruta de los documentos habría significado subir el tope de
   * tamaño para todos y colar la comprobación de duración en un camino que no
   * la necesita. Aparte del contenedor, todo lo demás es igual: mismo
   * expediente, mismo almacén privado, misma corrección por documento.
   *
   * LO QUE DICE EL CLIENTE NO CUENTA
   *
   * El teléfono manda un tipo y una duración. Aquí se comprueban los BYTES:
   * que sean un contenedor ISO-BMFF de verdad y, cuando se puede leer, que la
   * duración que trae dentro no pase del máximo. Un fichero de texto renombrado
   * a `.mp4` no llega a guardarse.
   */
  router.put('/driver-applications/me/video', requireAuth, limitadores.video, (req, res) => {
    videoUpload(req, res, async error => {
      if (error) {
        // Demasiado grande y tipo no admitido son cosas distintas para quien
        // lo está subiendo: una se arregla grabando más corto y la otra no.
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'FILE_TOO_LARGE', maxBytes: VIDEO_MAX_FILE_SIZE });
        }
        return res.status(415).json({ error: error.code || 'INVALID_FILE_TYPE', accepted: VIDEO_MIME_TYPES });
      }
      if (!req.file) return res.status(400).json({ error: 'INVALID_DOCUMENT' });

      const application = database.driverApplications.find(item => item.userId === req.user.id);
      if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
      if (!EDITABLE_STATUSES.includes(application.status)) return res.status(409).json({ error: 'APPLICATION_LOCKED' });

      // La duración, leída del propio fichero. Si no se puede determinar no se
      // rechaza: no poder medir no es medir mal, y el tamaño ya tiene tope.
      const duracion = videoDurationSeconds(req.file.buffer);
      if (duracion !== null && duracion > VIDEO_MAX_DURATION_SECONDS + 0.5) {
        return res.status(400).json({
          error: 'VIDEO_TOO_LONG',
          maxSeconds: VIDEO_MAX_DURATION_SECONDS,
          seconds: Math.round(duracion)
        });
      }

      const existing = database.driverDocuments.find(document => document.applicationId === application.id && document.type === 'presentation_video');
      let storageKey;
      // `save` vuelve a comprobar la firma antes de escribir un solo byte.
      try { storageKey = privateStorage.save(req.file, req.user.id); }
      catch (fallo) { return res.status(415).json({ error: fallo.code || 'INVALID_FILE_TYPE' }); }

      const ahora = new Date().toISOString();
      const anterior = existing?.storageKey ?? null;
      if (existing) {
        Object.assign(existing, {
          storageKey,
          originalName: String(req.file.originalname || 'presentacion').slice(0, 180),
          mimeType: req.file.mimetype,
          size: req.file.size,
          durationSeconds: duracion,
          status: 'pending',
          updatedAt: ahora
        });
      } else {
        database.driverDocuments.push({
          id: `driver_document_${crypto.randomUUID()}`,
          applicationId: application.id,
          userId: req.user.id,
          type: 'presentation_video',
          storageKey,
          originalName: String(req.file.originalname || 'presentacion').slice(0, 180),
          mimeType: req.file.mimetype,
          size: req.file.size,
          durationSeconds: duracion,
          status: 'pending',
          uploadedAt: ahora,
          updatedAt: ahora
        });
      }

      application.status = DRIVER_APPLICATION_STATUS.DRAFT;
      const pendientes = normalizeStoredApplication(application).requestedChangeDetails
        .filter(detail => detail.type !== 'presentation_video');
      application.requestedChangeDetails = pendientes;
      application.requestedChanges = pendientes.map(detail => detail.type);
      application.updatedAt = ahora;

      if (!await persistDatabase()) {
        // Lo que no se pudo registrar no se queda en disco.
        privateStorage.remove(storageKey);
        return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
      }
      // El anterior se borra DESPUÉS de que el nuevo esté registrado: si la
      // escritura falla, la persona conserva el vídeo que ya tenía.
      if (anterior && anterior !== storageKey) privateStorage.remove(anterior);

      res.json(driverApplicationOwnerView(application, getApplicationDocuments(application.id)));
    });
  });

  /**
   * Manda el expediente a revisión.
   *
   * Vuelve a comprobar los documentos según el vehículo declarado y, en los
   * expedientes de la versión 2, que estén el RIF y los datos de la licencia.
   * Las correcciones que administración había pedido se dan por atendidas:
   * si no lo están, volverá a pedirlas.
   */
  router.post('/driver-applications/me/submit', requireAuth, limitadores.expedientes, async (req, res) => {
    const application = database.driverApplications.find(item => item.userId === req.user.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    if (!EDITABLE_STATUSES.includes(application.status)) return res.status(409).json({ error: 'APPLICATION_LOCKED' });
    const missing = missingRequiredDocuments(getApplicationDocuments(application.id), application);
    if (missing.length) return res.status(400).json({ error: 'MISSING_DOCUMENTS', missing });
    const submission = validateApplicationForSubmission(application);
    if (!submission.valid) return res.status(400).json({ error: 'VALIDATION_FAILED', fields: submission.errors });
    const now = new Date().toISOString();
    application.status = DRIVER_APPLICATION_STATUS.PENDING;
    application.submittedAt = now;
    application.updatedAt = now;
    application.decisionReason = null;
    application.requestedChanges = [];
    application.requestedChangeDetails = [];
    application.textualCorrections = null;
    application.checkpoints = { ...normalizeStoredApplication(application).checkpoints, DOCUMENTS_REVIEW: 'PENDING' };
    if (!await persistDatabase()) return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
    io.to('admins').emit('driver_application:new', driverApplicationEvent(application));
    res.json(driverApplicationOwnerView(application, getApplicationDocuments(application.id)));
  });

  router.get('/admin/driver-applications', requireAuth, requireRole('admin'), limitadores.expedientes, (req, res) => {
    const status = String(req.query.status || '').toLowerCase();
    const query = String(req.query.q || '').trim().toLowerCase();
    const allowedStatuses = Object.values(DRIVER_APPLICATION_STATUS);
    const result = database.driverApplications
      .filter(application => !status || status === 'all' || (allowedStatuses.includes(status) && application.status === status))
      .filter(application => {
        if (!query) return true;
        const user = database.users.find(item => item.id === application.userId);
        return [application.personal.firstName, application.personal.lastName, application.personal.identityNumber, application.personal.rif, application.personal.phone, application.personal.email, application.vehicle.plate, user?.email]
          .filter(Boolean).some(value => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt))
      .map(application => driverApplicationListItem(application, getApplicationDocuments(application.id), database.users.find(user => user.id === application.userId)));
    const counts = Object.fromEntries(Object.values(DRIVER_APPLICATION_STATUS).map(item => [item, database.driverApplications.filter(application => application.status === item).length]));
    res.json({ applications: result, counts });
  });

  router.get('/admin/driver-applications/:id', requireAuth, requireRole('admin'), (req, res) => {
    const application = database.driverApplications.find(item => item.id === req.params.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    res.json(driverApplicationAdminDetail(application, getApplicationDocuments(application.id), database.users.find(user => user.id === application.userId)));
  });

  router.patch('/admin/driver-applications/:id/decision', requireAuth, requireRole('admin'), limitadores.expedientes, async (req, res) => {
    const application = database.driverApplications.find(item => item.id === req.params.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    const user = database.users.find(item => item.id === application.userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const action = String(req.body.action || '').toLowerCase();
    const reason = cleanText(req.body.reason, 600);
    const now = new Date().toISOString();
    const previousStatus = application.status;
    const checkpoints = { ...normalizeStoredApplication(application).checkpoints };
    let notificationTitle;
    let notificationMessage;

    if (action === 'approve') {
      const missing = missingRequiredDocuments(getApplicationDocuments(application.id), application);
      if (missing.length) return res.status(409).json({ error: 'MISSING_DOCUMENTS', missing });
      application.status = DRIVER_APPLICATION_STATUS.APPROVED;
      checkpoints.DOCUMENTS_REVIEW = 'PASSED';
      user.role = 'driver';
      user.isVerified = true;
      user.status = 'OFFLINE';
      user.accountStatus = 'ACTIVE';
      const selfie = getApplicationDocuments(application.id).find(document => document.type === 'driver_selfie');
      Object.assign(user, {
        vehicleType: application.vehicle.type,
        vehicleBrand: application.vehicle.brand,
        vehicleModel: application.vehicle.model,
        vehicleYear: application.vehicle.year,
        vehicleColor: application.vehicle.color,
        vehiclePlate: application.vehicle.plate,
        rif: application.personal?.rif || user.rif || null,
        photoStorageKey: selfie ? privateStorage.clone(selfie.storageKey, user.id) : user.photoStorageKey,
        photoMimeType: selfie?.mimeType || user.photoMimeType,
        photoSize: selfie?.size || user.photoSize,
        photoUrl: `/api/users/${user.id}/photo`
      });
      getApplicationDocuments(application.id).forEach(document => { document.status = 'approved'; document.reviewedAt = now; });
      notificationTitle = 'Tu solicitud como conductor fue aprobada';
      notificationMessage = '¡Felicidades! Ya puedes iniciar sesión como conductor y comenzar a trabajar con +58Express.';
    } else if (action === 'reject') {
      if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
      application.status = DRIVER_APPLICATION_STATUS.REJECTED;
      checkpoints.DOCUMENTS_REVIEW = 'FAILED';
      user.isVerified = false;
      notificationTitle = 'Tu solicitud necesita atención';
      notificationMessage = `La solicitud fue rechazada: ${reason}`;
    } else if (action === 'needs_changes') {
      if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
      application.status = DRIVER_APPLICATION_STATUS.NEEDS_CHANGES;
      // Qué documento hay que repetir, y por qué cada uno. Se admite la forma
      // vieja (solo tipos) y la nueva (tipo y motivo); el motivo general cubre
      // a los que no traigan el suyo.
      const details = normalizeRequestedChanges(req.body.requestedChanges, reason);
      application.requestedChangeDetails = details;
      application.requestedChanges = details.map(item => item.type);
      application.textualCorrections = cleanText(req.body.textualCorrections, 600) || null;
      user.isVerified = false;
      notificationTitle = 'Debes actualizar tu solicitud';
      notificationMessage = reason;
    } else if (action === 'suspend') {
      if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
      application.status = DRIVER_APPLICATION_STATUS.SUSPENDED;
      user.isVerified = false;
      user.status = 'SUSPENDED';
      notificationTitle = 'Cuenta de conductor suspendida';
      notificationMessage = reason;
    } else if (action === 'reactivate') {
      application.status = DRIVER_APPLICATION_STATUS.APPROVED;
      user.role = 'driver';
      user.isVerified = true;
      user.status = 'OFFLINE';
      notificationTitle = 'Cuenta de conductor reactivada';
      notificationMessage = 'Tu acceso operativo a +58Express fue restaurado.';
    } else {
      return res.status(400).json({ error: 'INVALID_ACTION' });
    }

    application.checkpoints = checkpoints;
    application.reviewedBy = req.user.id;
    application.reviewedAt = now;
    application.updatedAt = now;
    application.decisionReason = reason || null;
    user.updatedAt = now;
    const audit = {
      id: `admin_action_${crypto.randomUUID()}`,
      adminId: req.user.id,
      targetUserId: user.id,
      applicationId: application.id,
      action,
      previousStatus,
      nextStatus: application.status,
      reason: reason || null,
      createdAt: now
    };
    database.adminActions.push(audit);
    const notification = createNotification({ userId: user.id, title: notificationTitle, message: notificationMessage });
    if (!await persistDatabase()) return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
    io.to(`user:${user.id}`).emit('driver_application:updated', driverApplicationEvent(application));
    io.to(`user:${user.id}`).emit('platform:notification', notification);
    io.to('admins').emit('driver_application:updated', driverApplicationEvent(application));
    res.json({ application: driverApplicationAdminDetail(application, getApplicationDocuments(application.id), user), user: publicUser(user), audit });
  });

  router.get('/admin/actions', requireAuth, requireRole('admin'), limitadores.expedientes, (req, res) => {
    res.json(database.adminActions.slice().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 500));
  });

  router.get('/driver-documents/:id/content', requireAuth, limitadores.documentos, (req, res) => {
    // Una respuesta única para todo lo que no sea un acceso legítimo: quien no
    // es el propietario ni administrador no puede distinguir un documento
    // ajeno de uno inexistente, ni deducir a quién pertenece.
    const documentNotAvailable = () => res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });

    const document = database.driverDocuments.find(item => item.id === req.params.id);
    if (!document) return documentNotAvailable();
    // LA AUTORIZACIÓN VA ANTES QUE CUALQUIER BYTE, también en una petición
    // parcial: pedir un rango no es una puerta de servicio.
    if (req.user.role !== 'admin' && document.userId !== req.user.id) return documentNotAvailable();

    const fichero = privateStorage.abrirParaServir(document.storageKey, document.mimeType);
    if (!fichero) return documentNotAvailable();

    res.setHeader('Content-Type', fichero.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${String(document.originalName).replace(/["\r\n]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Se anuncia siempre: es lo que le dice al reproductor que puede pedir
    // trozos en vez de tragarse cincuenta megas para enseñar el primer
    // fotograma.
    res.setHeader('Accept-Ranges', 'bytes');

    const tramo = leerRango(req.headers.range, fichero.size);
    if (tramo === 'INVALIDO') {
      // Un rango que no cabe en el fichero. Lo estándar es contestar 416 con
      // el tamaño real, y no revelar nada más.
      res.setHeader('Content-Range', `bytes */${fichero.size}`);
      return res.status(416).json({ error: 'RANGE_NOT_SATISFIABLE' });
    }

    if (tramo === null) {
      // Sin cabecera `Range`, o una que no se entiende: el fichero entero, como
      // siempre. Una cabecera rara nunca es un error; simplemente se ignora.
      res.setHeader('Content-Length', String(fichero.size));
      fichero.crear().pipe(res);
      return;
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${tramo.desde}-${tramo.hasta}/${fichero.size}`);
    res.setHeader('Content-Length', String(tramo.hasta - tramo.desde + 1));
    fichero.crear(tramo.desde, tramo.hasta).pipe(res);
  });

  return router;
}
