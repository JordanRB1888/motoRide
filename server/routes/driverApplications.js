import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  DRIVER_APPLICATION_STATUS,
  DRIVER_DOCUMENT_TYPES,
  REQUIRED_DRIVER_DOCUMENTS,
  missingRequiredDocuments,
  normalizeDriverApplicationInput,
  validateDriverApplicationInput
} from '../domain/driverApplicationModel.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: DRIVER_DOCUMENT_TYPES.length },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype)) return callback(null, true);
    const error = new Error('INVALID_FILE_TYPE');
    error.code = 'INVALID_FILE_TYPE';
    callback(error);
  }
});

const uploadFields = upload.fields(DRIVER_DOCUMENT_TYPES.map(name => ({ name, maxCount: 1 })));
const singleDocumentUpload = upload.single('file');

function safeApplication(application, documents, user) {
  return {
    ...application,
    user: user ? {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      photoUrl: user.photoUrl || null,
      role: user.role,
      accountStatus: user.accountStatus
    } : null,
    documents: documents.map(({ storageKey, ...document }) => ({
      ...document,
      contentUrl: `/driver-documents/${document.id}/content`
    }))
  };
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

  router.post('/driver-applications', uploadFields, async (req, res) => {
    const validation = validateDriverApplicationInput(req.body);
    if (!validation.valid) return res.status(400).json({ error: 'VALIDATION_FAILED', fields: validation.errors });
    const { personal, vehicle } = validation.normalized;
    const phoneKey = personal.phone.replace(/\D/g, '');
    const matchingUsers = database.users.filter(user => user.email?.toLowerCase() === personal.email || String(user.phone || '').replace(/\D/g, '') === phoneKey);
    const existingUser = matchingUsers.length === 1 ? matchingUsers[0] : null;
    if (matchingUsers.length > 1 || (existingUser && existingUser.role !== 'passenger')) return res.status(409).json({ error: 'USER_EXISTS' });
    if (existingUser?.driverApplicationId) {
      const existingApplication = database.driverApplications.find(item => item.id === existingUser.driverApplicationId);
      return res.status(409).json({ error: 'DRIVER_APPLICATION_EXISTS', applicationStatus: existingApplication?.status || 'pending' });
    }
    if (existingUser && (!existingUser.passwordHash || !await bcrypt.compare(String(req.body.password || ''), existingUser.passwordHash))) {
      return res.status(401).json({ error: 'EXISTING_ACCOUNT_AUTH_REQUIRED' });
    }

    const files = Object.entries(req.files || {}).flatMap(([type, items]) => items.map(file => ({ type, file })));
    const missing = REQUIRED_DRIVER_DOCUMENTS.filter(type => !files.some(item => item.type === type));
    if (missing.length) return res.status(400).json({ error: 'MISSING_DOCUMENTS', missing });

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
      status: DRIVER_APPLICATION_STATUS.PENDING,
      personal,
      vehicle,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      decisionReason: null,
      requestedChanges: []
    };
    if (!existingUser) database.users.push(user);
    database.driverApplications.push(application);
    database.driverDocuments.push(...stored);
    const adminNotification = createNotification({
      targetRole: 'admin',
      title: 'Nuevo conductor esperando aprobación',
      message: `${personal.firstName} ${personal.lastName} envió una solicitud con vehículo ${vehicle.type === 'CAR' ? 'automóvil' : 'moto'}.`
    });
    persistDatabase();
    io.to('admins').emit('driver_application:new', safeApplication(application, stored, user));
    io.to('admins').emit('platform:notification', adminNotification);
    res.status(201).json({
      status: 'created',
      user: publicUser(user),
      token: signToken(user),
      application: safeApplication(application, stored, user)
    });
  });

  router.get('/driver-applications/me', requireAuth, (req, res) => {
    const application = database.driverApplications.find(item => item.userId === req.user.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    res.json(safeApplication(application, getApplicationDocuments(application.id), req.user));
  });

  router.patch('/driver-applications/me', requireAuth, (req, res) => {
    const application = database.driverApplications.find(item => item.userId === req.user.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    if (![DRIVER_APPLICATION_STATUS.DRAFT, DRIVER_APPLICATION_STATUS.NEEDS_CHANGES, DRIVER_APPLICATION_STATUS.REJECTED].includes(application.status)) {
      return res.status(409).json({ error: 'APPLICATION_LOCKED' });
    }
    const merged = {
      ...application.personal,
      ...application.vehicle,
      ...req.body,
      vehicleType: req.body.vehicleType || application.vehicle.type,
      vehicleBrand: req.body.vehicleBrand || application.vehicle.brand,
      vehicleModel: req.body.vehicleModel || application.vehicle.model,
      vehicleYear: req.body.vehicleYear || application.vehicle.year,
      vehicleColor: req.body.vehicleColor || application.vehicle.color,
      vehiclePlate: req.body.vehiclePlate || application.vehicle.plate
    };
    const validation = validateDriverApplicationInput(merged, { requirePassword: false });
    if (!validation.valid) return res.status(400).json({ error: 'VALIDATION_FAILED', fields: validation.errors });
    application.personal = validation.normalized.personal;
    application.vehicle = validation.normalized.vehicle;
    application.status = DRIVER_APPLICATION_STATUS.DRAFT;
    application.updatedAt = new Date().toISOString();
    persistDatabase();
    res.json(safeApplication(application, getApplicationDocuments(application.id), req.user));
  });

  router.put('/driver-applications/me/documents/:type', requireAuth, singleDocumentUpload, (req, res) => {
    const application = database.driverApplications.find(item => item.userId === req.user.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    if (![DRIVER_APPLICATION_STATUS.DRAFT, DRIVER_APPLICATION_STATUS.NEEDS_CHANGES, DRIVER_APPLICATION_STATUS.REJECTED].includes(application.status)) {
      return res.status(409).json({ error: 'APPLICATION_LOCKED' });
    }
    if (!DRIVER_DOCUMENT_TYPES.includes(req.params.type) || !req.file) return res.status(400).json({ error: 'INVALID_DOCUMENT' });
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
    application.updatedAt = new Date().toISOString();
    persistDatabase();
    res.json(safeApplication(application, getApplicationDocuments(application.id), req.user));
  });

  router.post('/driver-applications/me/submit', requireAuth, (req, res) => {
    const application = database.driverApplications.find(item => item.userId === req.user.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    if (![DRIVER_APPLICATION_STATUS.DRAFT, DRIVER_APPLICATION_STATUS.NEEDS_CHANGES, DRIVER_APPLICATION_STATUS.REJECTED].includes(application.status)) {
      return res.status(409).json({ error: 'APPLICATION_LOCKED' });
    }
    const missing = missingRequiredDocuments(getApplicationDocuments(application.id));
    if (missing.length) return res.status(400).json({ error: 'MISSING_DOCUMENTS', missing });
    application.status = DRIVER_APPLICATION_STATUS.PENDING;
    application.submittedAt = new Date().toISOString();
    application.updatedAt = application.submittedAt;
    application.decisionReason = null;
    persistDatabase();
    io.to('admins').emit('driver_application:new', safeApplication(application, getApplicationDocuments(application.id), req.user));
    res.json(safeApplication(application, getApplicationDocuments(application.id), req.user));
  });

  router.get('/admin/driver-applications', requireAuth, requireRole('admin'), (req, res) => {
    const status = String(req.query.status || '').toLowerCase();
    const query = String(req.query.q || '').trim().toLowerCase();
    const allowedStatuses = Object.values(DRIVER_APPLICATION_STATUS);
    const result = database.driverApplications
      .filter(application => !status || status === 'all' || (allowedStatuses.includes(status) && application.status === status))
      .filter(application => {
        if (!query) return true;
        const user = database.users.find(item => item.id === application.userId);
        return [application.personal.firstName, application.personal.lastName, application.personal.identityNumber, application.personal.phone, application.personal.email, application.vehicle.plate, user?.email]
          .filter(Boolean).some(value => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt))
      .map(application => safeApplication(application, getApplicationDocuments(application.id), database.users.find(user => user.id === application.userId)));
    const counts = Object.fromEntries(Object.values(DRIVER_APPLICATION_STATUS).map(item => [item, database.driverApplications.filter(application => application.status === item).length]));
    res.json({ applications: result, counts });
  });

  router.get('/admin/driver-applications/:id', requireAuth, requireRole('admin'), (req, res) => {
    const application = database.driverApplications.find(item => item.id === req.params.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    res.json(safeApplication(application, getApplicationDocuments(application.id), database.users.find(user => user.id === application.userId)));
  });

  router.patch('/admin/driver-applications/:id/decision', requireAuth, requireRole('admin'), (req, res) => {
    const application = database.driverApplications.find(item => item.id === req.params.id);
    if (!application) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    const user = database.users.find(item => item.id === application.userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const action = String(req.body.action || '').toLowerCase();
    const reason = String(req.body.reason || '').replace(/[\u0000-\u001f\u007f<>&"']/g, ' ').trim().slice(0, 600);
    const now = new Date().toISOString();
    const previousStatus = application.status;
    let notificationTitle;
    let notificationMessage;

    if (action === 'approve') {
      const missing = missingRequiredDocuments(getApplicationDocuments(application.id));
      if (missing.length) return res.status(409).json({ error: 'MISSING_DOCUMENTS', missing });
      application.status = DRIVER_APPLICATION_STATUS.APPROVED;
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
        photoStorageKey: selfie ? privateStorage.clone(selfie.storageKey, user.id) : user.photoStorageKey,
        photoMimeType: selfie?.mimeType || user.photoMimeType,
        photoSize: selfie?.size || user.photoSize,
        photoUrl: `/users/${user.id}/photo`
      });
      getApplicationDocuments(application.id).forEach(document => { document.status = 'approved'; document.reviewedAt = now; });
      notificationTitle = 'Tu solicitud como conductor fue aprobada';
      notificationMessage = '¡Felicidades! Ya puedes iniciar sesión como conductor y comenzar a trabajar con +58Express.';
    } else if (action === 'reject') {
      if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
      application.status = DRIVER_APPLICATION_STATUS.REJECTED;
      user.isVerified = false;
      notificationTitle = 'Tu solicitud necesita atención';
      notificationMessage = `La solicitud fue rechazada: ${reason}`;
    } else if (action === 'needs_changes') {
      if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
      application.status = DRIVER_APPLICATION_STATUS.NEEDS_CHANGES;
      application.requestedChanges = Array.isArray(req.body.requestedChanges) ? req.body.requestedChanges.filter(item => DRIVER_DOCUMENT_TYPES.includes(item)) : [];
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
    persistDatabase();
    io.to(`user:${user.id}`).emit('driver_application:updated', safeApplication(application, getApplicationDocuments(application.id), user));
    io.to(`user:${user.id}`).emit('platform:notification', notification);
    io.to('admins').emit('driver_application:updated', safeApplication(application, getApplicationDocuments(application.id), user));
    res.json({ application: safeApplication(application, getApplicationDocuments(application.id), user), user: publicUser(user), audit });
  });

  router.get('/admin/actions', requireAuth, requireRole('admin'), (req, res) => {
    res.json(database.adminActions.slice().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 500));
  });

  router.get('/driver-documents/:id/content', requireAuth, (req, res) => {
    const document = database.driverDocuments.find(item => item.id === req.params.id);
    if (!document) return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    if (req.user.role !== 'admin' && document.userId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });
    const absolutePath = privateStorage.resolve(document.storageKey);
    if (!absolutePath) return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Length', String(document.size));
    res.setHeader('Content-Disposition', `inline; filename="${String(document.originalName).replace(/["\r\n]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(absolutePath).pipe(res);
  });

  return router;
}
