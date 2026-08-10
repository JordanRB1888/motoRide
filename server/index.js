import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DatabaseSync } from 'node:sqlite';
import { calculateFare, DEFAULT_PRICING } from './domain/pricingService.js';
import { transitionTrip, TRIP_STATUS } from './domain/tripStateMachine.js';
import { createPrivateStorage } from './services/privateStorage.js';
import { createDriverApplicationsRouter } from './routes/driverApplications.js';

const app = express();
const allowedOrigins = String(process.env.CLIENT_ORIGIN || 'https://plus58express.vercel.app,http://localhost:3000,http://localhost:5173,http://127.0.0.1:4173')
  .split(',').map(value => value.trim()).filter(Boolean);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    callback(new Error('ORIGIN_NOT_ALLOWED'));
  }
}));
app.use(express.json({ limit: '1mb' }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);
app.use('/api/driver-applications', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 4000;
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE || path.join(serverDir, 'data', 'plus58express.sqlite');
const jwtSecret = process.env.JWT_SECRET || 'plus58express-development-secret';
const isProduction = process.env.NODE_ENV === 'production' || String(process.env.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase() === 'production';
if (isProduction && (!process.env.JWT_SECRET || jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET_REQUIRED_IN_PRODUCTION');
}
const privateStorage = createPrivateStorage({
  rootDirectory: process.env.UPLOAD_DIR || path.join(path.dirname(dataFile), 'private-uploads')
});
let pricingConfig = {
  ...DEFAULT_PRICING,
  bcvRate: Number(process.env.BCV_RATE || 0),
  parallelRate: Number(process.env.PARALLEL_RATE || 0)
};

function sanitizeText(value, max = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    const payload = jwt.verify(token, jwtSecret);
    const currentUser = database.users.find(user => user.id === payload.sub);
    if (!currentUser) return next(new Error('INVALID_SESSION'));
    if (currentUser.role === 'driver' && (!currentUser.isVerified || currentUser.status === 'SUSPENDED')) {
      return next(new Error('DRIVER_NOT_APPROVED'));
    }
    if (currentUser.accountStatus === 'DISABLED') return next(new Error('ACCOUNT_DISABLED'));
    socket.data.auth = { userId: currentUser.id, role: currentUser.role };
    next();
  } catch {
    next(new Error('INVALID_SESSION'));
  }
});

function allowSocketRole(socket, role) {
  if (socket.data.auth?.role === role) return true;
  socket.emit('authorization:error', { error: 'FORBIDDEN', requiredRole: role });
  return false;
}

// In-Memory Database & State Sync Engine (Real-Time Backend Dispatch)
const initialDatabase = {
  users: [{
    id: 'admin_1',
    role: 'admin',
    firstName: 'Admin',
    lastName: '+58express',
    phone: '+58 414-000-0000',
    email: process.env.ADMIN_EMAIL || 'admin@58express.com',
    accountStatus: 'ACTIVE'
  }],
  trips: [],
  notifications: [],
  messages: [],
  supportMessages: [],
  settings: [],
  transactions: [],
  driverApplications: [],
  driverDocuments: [],
  adminActions: []
};

fs.mkdirSync(path.dirname(dataFile), { recursive: true });
const sqlite = new DatabaseSync(dataFile);
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS supportMessages (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS driverApplications (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS driverDocuments (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS adminActions (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS schemaMigrations (id TEXT PRIMARY KEY, appliedAt TEXT NOT NULL);
`);

const migrationsDirectory = path.join(serverDir, 'migrations');
if (fs.existsSync(migrationsDirectory)) {
  for (const filename of fs.readdirSync(migrationsDirectory).filter(name => name.endsWith('.sql')).sort()) {
    if (sqlite.prepare('SELECT id FROM schemaMigrations WHERE id = ?').get(filename)) continue;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.exec(fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8'));
      sqlite.prepare('INSERT INTO schemaMigrations (id, appliedAt) VALUES (?, ?)').run(filename, new Date().toISOString());
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw new Error(`MIGRATION_FAILED:${filename}:${error.message}`);
    }
  }
}

function loadCollection(table) {
  return sqlite.prepare(`SELECT payload FROM ${table}`).all().map(row => JSON.parse(row.payload));
}

const database = {
  users: loadCollection('users'),
  trips: loadCollection('trips'),
  notifications: loadCollection('notifications'),
  messages: loadCollection('messages'),
  supportMessages: loadCollection('supportMessages'),
  settings: loadCollection('settings'),
  transactions: loadCollection('transactions'),
  driverApplications: loadCollection('driverApplications'),
  driverDocuments: loadCollection('driverDocuments'),
  adminActions: loadCollection('adminActions')
};

const storedPricing = database.settings.find(item => item.id === 'pricing');
if (storedPricing?.value) pricingConfig = { ...pricingConfig, ...storedPricing.value };

function ensureSeedCredentials() {
  let changed = false;
  for (const seedUser of initialDatabase.users) {
    if (!database.users.some(user => user.id === seedUser.id)) {
      database.users.push(structuredClone(seedUser));
      changed = true;
    }
  }
  const admin = database.users.find(user => user.id === 'admin_1');
  if (admin && !admin.passwordHash) {
    const bootstrapPassword = process.env.ADMIN_PASSWORD || (isProduction ? crypto.randomUUID() : 'admin');
    admin.passwordHash = bcrypt.hashSync(bootstrapPassword, 12);
    admin.accountStatus = 'ACTIVE';
    changed = true;
  }
  if (isProduction && process.env.DISABLE_LEGACY_DEMO_USERS !== 'false') {
    for (const user of database.users.filter(item => ['d1', 'p1'].includes(item.id))) {
      if (user.accountStatus !== 'DISABLED') {
        user.accountStatus = 'DISABLED';
        user.disabledReason = 'LEGACY_DEMO_ACCOUNT';
        if (user.role === 'driver') user.status = 'SUSPENDED';
        changed = true;
      }
    }
  }
  for (const user of database.users) {
    if (!user.accountStatus) {
      user.accountStatus = 'ACTIVE';
      changed = true;
    }
  }
  if (changed) persistDatabase();
}

function persistDatabase() {
  try {
    sqlite.exec('BEGIN IMMEDIATE');
    for (const table of ['users', 'trips', 'notifications', 'messages', 'supportMessages', 'settings', 'transactions', 'driverApplications', 'driverDocuments', 'adminActions']) {
      sqlite.exec(`DELETE FROM ${table}`);
      const insert = sqlite.prepare(`INSERT INTO ${table} (id, payload) VALUES (?, ?)`);
      for (const item of database[table]) insert.run(item.id, JSON.stringify(item));
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    try { sqlite.exec('ROLLBACK'); } catch {}
    console.error('[+58express Database] No se pudo guardar la persistencia:', error.message);
  }
}

ensureSeedCredentials();

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, photoStorageKey, ...safeUser } = user;
  return safeUser;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
}

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const tripFareUSD = trip => Math.max(0, roundMoney(trip?.fareUSD || trip?.fareEUR || trip?.pricing?.fareUSD || 0));
const isWalletPayment = paymentMethod => ['WALLET', 'BILLETERA', 'BILLETERA EXPRESS'].includes(
  String(paymentMethod || '').trim().replaceAll('_', ' ').toUpperCase()
);

function ensureWalletCanCoverTrip(trip, passenger) {
  if (!isWalletPayment(trip?.paymentMethod)) return;
  if (trip?.id && database.transactions.some(item => item.type === 'RIDE_PAYMENT' && item.tripId === trip.id)) return;
  const fare = tripFareUSD(trip);
  const balance = roundMoney(passenger?.walletBalance || 0);
  if (!passenger || fare <= 0 || balance < fare) {
    const error = new Error('INSUFFICIENT_WALLET_BALANCE');
    error.code = 'INSUFFICIENT_WALLET_BALANCE';
    error.balance = balance;
    error.required = fare;
    throw error;
  }
}

function debitPassengerWalletForCompletedTrip(trip) {
  if (!trip || trip.status !== TRIP_STATUS.COMPLETED || !isWalletPayment(trip.paymentMethod)) return null;
  const existing = database.transactions.find(item => item.type === 'RIDE_PAYMENT' && item.tripId === trip.id);
  if (existing) return existing;

  const passenger = database.users.find(user => user.id === trip.passengerId);
  ensureWalletCanCoverTrip(trip, passenger);
  const fare = tripFareUSD(trip);
  passenger.walletBalance = roundMoney(Number(passenger.walletBalance || 0) - fare);
  trip.passengerWalletDebitUSD = fare;
  const transaction = {
    id: `transaction_${crypto.randomUUID()}`,
    userId: passenger.id,
    tripId: trip.id,
    type: 'RIDE_PAYMENT',
    amount: -fare,
    currency: 'USD',
    status: 'APPROVED',
    balanceAfter: passenger.walletBalance,
    createdAt: new Date().toISOString()
  };
  database.transactions.push(transaction);
  database.notifications.push({
    id: `notification_${crypto.randomUUID()}`,
    userId: passenger.id,
    title: 'Pago de viaje realizado',
    message: `Se descontaron $${fare.toFixed(2)} de tu Billetera Express. Saldo disponible: $${passenger.walletBalance.toFixed(2)}.`,
    category: 'FINANCE',
    read: false,
    createdAt: transaction.createdAt
  });
  return transaction;
}

function creditCompletedTrip(trip) {
  if (!trip || trip.status !== TRIP_STATUS.COMPLETED || database.transactions.some(item => item.type === 'DRIVER_EARNING' && item.tripId === trip.id)) return;
  const driver = database.users.find(user => user.id === trip.driverId);
  if (!driver) return;
  const gross = Number(trip.fareUSD || trip.fareEUR || trip.pricing?.fareUSD || 0);
  const commission = Math.round(gross * Number(pricingConfig.commissionRate || 0.15) * 100) / 100;
  const net = Math.max(0, Math.round((gross - commission) * 100) / 100);
  driver.walletBalance = Math.round((Number(driver.walletBalance || 0) + net) * 100) / 100;
  trip.driverEarningUSD = net;
  database.transactions.push({ id:`transaction_${crypto.randomUUID()}`, userId:driver.id, tripId:trip.id, type:'DRIVER_EARNING', amount:net, gross, commission, currency:'USD', status:'APPROVED', createdAt:new Date().toISOString() });
}

function settleCompletedTrip(trip) {
  const passengerTransaction = debitPassengerWalletForCompletedTrip(trip);
  creditCompletedTrip(trip);
  return passengerTransaction;
}

function emitPassengerWalletUpdate(trip, transaction) {
  if (!transaction) return;
  const passenger = database.users.find(user => user.id === trip.passengerId);
  io.to(`user:${trip.passengerId}`).emit('wallet:updated', {
    balance: roundMoney(passenger?.walletBalance || 0),
    transaction
  });
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = database.users.find(item => item.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'INVALID_SESSION' });
    if (user.accountStatus === 'DISABLED') return res.status(403).json({ error: 'ACCOUNT_DISABLED' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'INVALID_SESSION' });
  }
}

function requireRole(role) {
  return (req, res, next) => req.user?.role === role
    ? next()
    : res.status(403).json({ error: 'FORBIDDEN' });
}

function requireApprovedDriver(req, res, next) {
  if (req.user?.role !== 'driver') return res.status(403).json({ error: 'FORBIDDEN' });
  if (!req.user.isVerified || req.user.status === 'SUSPENDED') return res.status(403).json({ error: 'DRIVER_NOT_APPROVED' });
  next();
}

app.use('/api', createDriverApplicationsRouter({
  database,
  persistDatabase,
  publicUser,
  signToken,
  requireAuth,
  requireRole,
  io,
  bcrypt,
  privateStorage
}));

// Driver Dispatch Registry & Atomic Lock Map
const driverRegistry = new Map();
const tripLocks = new Map();
const dispatchTimers = new Map();
const dispatchSessions = new Map();

// Calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.35; // Urban road factor
}

function normalizeLocation(location) {
  if (location?.lat === null || location?.lat === undefined || location?.lng === null || location?.lng === undefined || String(location.lat).trim() === '' || String(location.lng).trim() === '') {
    return null;
  }
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { ...location, lat, lng };
}

function userCanAccessTrip(userId, role, trip) {
  return role === 'admin' || trip?.passengerId === userId || trip?.driverId === userId;
}

function emitDriverLocation(driverId, location) {
  const payload = { ...location, driverId, userId: driverId };
  const activeTrip = database.trips.findLast(trip =>
    trip.driverId === driverId &&
    ['DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'].includes(trip.status)
  );
  io.to('admins').to(`user:${driverId}`).emit('driverLocationUpdated', {
    ...payload,
    tripId: activeTrip?.id || null
  });
  if (activeTrip) {
    io.to(`user:${activeTrip.passengerId}`).emit('driverLocationUpdated', {
      ...payload,
      tripId: activeTrip.id
    });
  }
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '+58express Real Backend Server Active 🇻🇪',
    features: { livePassengerGpsOrigin: true, idempotentWalletRideSettlement: true },
    timestamp: Date.now()
  });
});

app.get('/api/pricing/config', requireAuth, (req, res) => res.json(pricingConfig));

app.post('/api/pricing/estimate', requireAuth, (req, res) => {
  const distanceKm = Number(req.body.distanceKm);
  const durationMin = Number(req.body.durationMin);
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMin)) {
    return res.status(400).json({ error: 'INVALID_ROUTE_METRICS' });
  }
  res.json(calculateFare({
    distanceKm,
    durationMin,
    requestedAt: req.body.requestedAt || new Date(),
    exchangeRateType: req.body.exchangeRateType || 'BCV',
    rideType: req.body.rideType || 'MOTO'
  }, pricingConfig));
});

app.post('/api/auth/login', async (req, res) => {
  const { identifier, phone, email, password, role } = req.body;
  const loginId = String(identifier || phone || email || '').trim().toLowerCase();
  const identityUser = database.users.find(item =>
    [item.email, item.phone].filter(Boolean).some(value => String(value).trim().toLowerCase() === loginId)
  );
  if (identityUser?.accountStatus === 'DISABLED') return res.status(403).json({ error: 'ACCOUNT_DISABLED' });
  if (!identityUser || !identityUser.passwordHash || !await bcrypt.compare(String(password || ''), identityUser.passwordHash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  if (role === 'driver' && identityUser?.role === 'passenger' && identityUser.driverApplicationId) {
    const application = database.driverApplications.find(item => item.id === identityUser.driverApplicationId);
    return res.status(403).json({ error: 'DRIVER_APPLICATION_NOT_APPROVED', applicationStatus: application?.status || 'pending' });
  }
  const user = identityUser && (!role || identityUser.role === role) ? identityUser : null;
  if (!user) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  res.json({ status: 'success', user: publicUser(user), token: signToken(user) });
});

app.post('/api/auth/register', async (req, res) => {
  const {
    email, phone, password, role = 'passenger', firstName, lastName
  } = req.body;
  const normalizedFirstName = sanitizeText(firstName, 80);
  const normalizedLastName = sanitizeText(lastName, 80);
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = String(phone || '').trim();
  const phoneDigits = normalizedPhone.replace(/\D/g, '');
  const fields = {};
  if (role !== 'passenger') fields.role = 'El registro directo solamente permite cuentas de cliente.';
  if (normalizedFirstName.length < 2) fields.firstName = 'El nombre es obligatorio.';
  if (normalizedLastName.length < 2) fields.lastName = 'El apellido es obligatorio.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) fields.email = 'Introduce una dirección de correo válida.';
  if (phoneDigits.length < 10 || phoneDigits.length > 15) fields.phone = 'Introduce un teléfono válido.';
  if (String(password || '').length < 8) fields.password = 'La contraseña debe tener al menos 8 caracteres.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'VALIDATION_FAILED', fields });
  const duplicate = database.users.some(user => user.email?.toLowerCase() === normalizedEmail || String(user.phone || '').replace(/\D/g, '') === phoneDigits);
  if (duplicate) return res.status(409).json({ error: 'USER_EXISTS' });
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 12);
  if (database.users.some(existing => existing.email?.toLowerCase() === normalizedEmail || String(existing.phone || '').replace(/\D/g, '') === phoneDigits)) return res.status(409).json({ error: 'USER_EXISTS' });
  const user = {
    id: `passenger_${crypto.randomUUID()}`,
    role: 'passenger',
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    email: normalizedEmail,
    phone: normalizedPhone,
    passwordHash,
    rating: 5,
    totalTrips: 0,
    walletBalance: 0,
    accountStatus: 'ACTIVE',
    emailVerified: false,
    phoneVerified: false,
    createdAt: now,
    updatedAt: now
  };
  database.users.push(user);
  persistDatabase();
  res.status(201).json({ status: 'created', user: publicUser(user), token: signToken(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

app.patch('/api/auth/me', requireAuth, (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'cedula', ...(req.user.role === 'driver' ? ['vehicleBrand', 'vehicleModel', 'vehiclePlate', 'vehicleColor'] : [])];
  for (const key of allowed) {
    if (!(key in req.body)) continue;
    const value = sanitizeText(req.body[key], key === 'phone' ? 30 : 100);
    if (['firstName','lastName'].includes(key) && value.length < 2) return res.status(400).json({ error:'VALIDATION_FAILED', fields:{[key]:'Campo obligatorio.'} });
    if (key === 'phone' && (value.replace(/\D/g,'').length < 10 || value.replace(/\D/g,'').length > 15)) return res.status(400).json({ error:'VALIDATION_FAILED', fields:{phone:'Teléfono inválido.'} });
    if (key === 'phone' && database.users.some(user => user.id !== req.user.id && String(user.phone || '').replace(/\D/g,'') === value.replace(/\D/g,''))) return res.status(409).json({ error:'USER_EXISTS' });
    req.user[key] = key === 'vehiclePlate' ? value.toUpperCase() : value;
  }
  req.user.updatedAt = new Date().toISOString();
  persistDatabase();
  res.json(publicUser(req.user));
});

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype))
}).single('file');

app.post('/api/auth/me/photo', requireAuth, profilePhotoUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'INVALID_PROFILE_PHOTO' });
  let storageKey;
  try { storageKey = privateStorage.save(req.file, req.user.id); }
  catch (error) { return res.status(400).json({ error: error.code || 'UPLOAD_FAILED' }); }
  if (req.user.photoStorageKey) privateStorage.remove(req.user.photoStorageKey);
  req.user.photoStorageKey = storageKey;
  req.user.photoMimeType = req.file.mimetype;
  req.user.photoSize = req.file.size;
  req.user.photoUrl = `/users/${req.user.id}/photo`;
  req.user.updatedAt = new Date().toISOString();
  persistDatabase();
  res.json(publicUser(req.user));
});

app.get('/api/users/:id/photo', (req, res) => {
  const user = database.users.find(item => item.id === req.params.id);
  if (!user?.photoStorageKey) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
  const absolutePath = privateStorage.resolve(user.photoStorageKey);
  if (!absolutePath) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
  res.setHeader('Content-Type', user.photoMimeType || 'image/jpeg');
  res.setHeader('Content-Length', String(user.photoSize || fs.statSync(absolutePath).size));
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(absolutePath).pipe(res);
});

app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json(database.users.map(publicUser));
});

app.get('/api/admin/overview', requireAuth, requireRole('admin'), (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const activeStatuses = ['SEARCHING', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'];
  const completedToday = database.trips.filter(trip => trip.status === 'COMPLETED' && String(trip.completedAt || trip.closedAt || trip.updatedAt || '').startsWith(today));
  const grossToday = completedToday.reduce((sum, trip) => sum + Number(trip.fareUSD || trip.fareEUR || trip.pricing?.fareUSD || 0), 0);
  const drivers = database.users.filter(user => user.role === 'driver');
  const ratings = database.trips.flatMap(trip => [trip.driverRating, trip.passengerRating]).filter(Number.isFinite);
  res.json({
    activeTrips: database.trips.filter(trip => activeStatuses.includes(trip.status)).length,
    completedToday: completedToday.length,
    grossToday: Math.round(grossToday * 100) / 100,
    commissionToday: Math.round(grossToday * Number(pricingConfig.commissionRate || 0.15) * 100) / 100,
    drivers: {
      total: drivers.length,
      available: drivers.filter(driver => ['AVAILABLE', 'ONLINE'].includes(driver.status)).length,
      busy: drivers.filter(driver => ['BUSY', 'IN_TRIP'].includes(driver.status)).length,
      offline: drivers.filter(driver => !['AVAILABLE', 'ONLINE', 'BUSY', 'IN_TRIP'].includes(driver.status)).length
    },
    driverApplications: {
      total: database.driverApplications.length,
      pending: database.driverApplications.filter(item => item.status === 'pending').length,
      needsChanges: database.driverApplications.filter(item => item.status === 'needs_changes').length
    },
    walletRequests: {
      pendingTopups: database.transactions.filter(item => item.type === 'TOP_UP' && item.status === 'PENDING').length,
      pendingPayouts: database.transactions.filter(item => item.type === 'PAYOUT' && item.status === 'PENDING').length
    },
    averageRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 : null,
    bcvRate: Number(pricingConfig.bcvRate || 0)
  });
});

app.get('/api/drivers/nearby', requireAuth, (req, res) => {
  const drivers = database.users.filter(user => user.role === 'driver');
  if (req.user.role === 'admin') {
    return res.json(drivers.map(driver => ({
      ...publicUser(driver),
      ...(driver.location || {}),
      driverId: driver.id,
      driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim()
    })));
  }

  res.json(drivers
    .filter(driver => ['AVAILABLE', 'ONLINE'].includes(driver.status) && Number.isFinite(driver.location?.lat) && Number.isFinite(driver.location?.lng))
    .map(driver => ({
      id: driver.id,
      driverId: driver.id,
      firstName: driver.firstName || 'Conductor',
      photoUrl: driver.photoUrl || null,
      rating: Number(driver.rating || 0),
      vehicleType: driver.vehicleType || 'MOTO',
      status: driver.status,
      lat: driver.location.lat,
      lng: driver.location.lng,
      heading: Number(driver.location.heading || 0),
      updatedAt: driver.location.updatedAt || null
    })));
});

app.patch('/api/admin/pricing', requireAuth, requireRole('admin'), (req, res) => {
  const numberFields = ['nightMultiplier', 'peakMultiplier', 'bcvRate', 'parallelRate', 'commissionRate'];
  const next = structuredClone(pricingConfig);
  for (const key of numberFields) if (req.body[key] !== undefined) next[key] = Number(req.body[key]);
  for (const type of ['MOTO', 'CAR']) {
    if (!req.body.vehicleTypes?.[type]) continue;
    next.vehicleTypes[type] = { ...next.vehicleTypes[type] };
    for (const [key, value] of Object.entries(req.body.vehicleTypes[type])) next.vehicleTypes[type][key] = Number(value);
  }
  if (!Number.isFinite(next.bcvRate) || next.bcvRate < 0 || !Number.isFinite(next.commissionRate) || next.commissionRate < 0 || next.commissionRate > 1) {
    return res.status(400).json({ error: 'INVALID_PRICING' });
  }
  pricingConfig = next;
  const record = database.settings.find(item => item.id === 'pricing');
  if (record) record.value = next;
  else database.settings.push({ id: 'pricing', value: next });
  persistDatabase();
  io.to('admins').emit('admin:pricing_updated', next);
  res.json(next);
});

app.get('/api/admin/finance', requireAuth, requireRole('admin'), (req, res) => {
  const commissionRate = Number(pricingConfig.commissionRate || 0.15);
  const transactions = database.trips.filter(trip => trip.status === 'COMPLETED').map(trip => {
    const gross = Number(trip.fareUSD || trip.fareEUR || trip.pricing?.fareUSD || 0);
    const commission = Math.round(gross * commissionRate * 100) / 100;
    const driver = database.users.find(user => user.id === trip.driverId);
    const passenger = database.users.find(user => user.id === trip.passengerId);
    return { id: trip.id, date: trip.completedAt || trip.closedAt || trip.updatedAt, gross, commission, driverNet: Math.round((gross - commission) * 100) / 100, payoutStatus: trip.payoutStatus || 'CREDITED', paymentMethod: trip.paymentMethod || 'EFECTIVO', driver: publicUser(driver), passenger: publicUser(passenger) };
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  res.json({
    bcvRate: Number(pricingConfig.bcvRate || 0), commissionRate, transactions,
    walletRequests: database.transactions.filter(item => ['TOP_UP','PAYOUT'].includes(item.type)).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(item=>({...item,user:publicUser(database.users.find(user=>user.id===item.userId))})),
    summary: {
      gross: transactions.reduce((s, t) => s + t.gross, 0),
      commission: transactions.reduce((s, t) => s + t.commission, 0),
      pending: database.transactions.filter(t => t.type === 'PAYOUT' && t.status === 'PENDING').reduce((s, t) => s + t.amount, 0),
      paid: database.transactions.filter(t => t.type === 'PAYOUT' && t.status === 'APPROVED').reduce((s, t) => s + t.amount, 0)
    }
  });
});

app.patch('/api/admin/trips/:id/payout', requireAuth, requireRole('admin'), (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id && item.status === 'COMPLETED');
  if (!trip) return res.status(404).json({ error: 'COMPLETED_TRIP_NOT_FOUND' });
  if (!['PAID', 'REJECTED', 'PENDING'].includes(req.body.status)) return res.status(400).json({ error: 'INVALID_PAYOUT_STATUS' });
  trip.payoutStatus = req.body.status;
  trip.payoutUpdatedAt = new Date().toISOString();
  trip.payoutReference = req.body.reference || null;
  persistDatabase();
  const event = { tripId: trip.id, status: trip.payoutStatus, reference: trip.payoutReference };
  io.to(`user:${trip.driverId}`).to('admins').emit('finance:payout_updated', event);
  io.to(`user:${trip.driverId}`).emit('platform:notification', { title: trip.payoutStatus === 'PAID' ? 'Liquidación aprobada' : 'Liquidación actualizada', message: `El pago del viaje #${trip.id.slice(-6)} figura como ${trip.payoutStatus}.`, category: 'FINANCE', icon: '💵' });
  res.json(event);
});

app.get('/api/support/threads', requireAuth, (req, res) => {
  const messages = req.user.role === 'admin' ? database.supportMessages : database.supportMessages.filter(message => message.conversationUserId === req.user.id);
  const grouped = new Map();
  for (const message of messages) {
    const id = message.conversationUserId;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(message);
  }
  res.json([...grouped].map(([userId, items]) => ({ user: publicUser(database.users.find(user => user.id === userId)), messages: items.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)), unread: items.filter(item => !item.read && item.senderRole !== req.user.role).length })));
});

app.post('/api/support/messages', requireAuth, (req, res) => {
  const conversationUserId = req.user.role === 'admin' ? req.body.recipientId : req.user.id;
  const target = database.users.find(user => user.id === conversationUserId && user.role !== 'admin');
  const image = typeof req.body.image === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(req.body.image) && req.body.image.length <= 1_000_000 ? req.body.image : null;
  if (!target || (!req.body.text?.trim() && !image)) return res.status(400).json({ error: 'INVALID_SUPPORT_MESSAGE' });
  const message = { id: `support_${crypto.randomUUID()}`, conversationUserId, senderId: req.user.id, senderRole: req.user.role, text: sanitizeText(req.body.text, 2000), image, createdAt: new Date().toISOString(), read: false };
  database.supportMessages.push(message);
  persistDatabase();
  io.to('admins').to(`user:${conversationUserId}`).emit('support:message', { ...message, user: publicUser(target) });
  res.status(201).json(message);
});

app.patch('/api/support/threads/:userId/read', requireAuth, requireRole('admin'), (req, res) => {
  database.supportMessages.forEach(message => { if (message.conversationUserId === req.params.userId && message.senderRole !== 'admin') message.read = true; });
  persistDatabase();
  res.json({ ok: true });
});

app.get('/api/notifications/me', requireAuth, (req, res) => {
  const notifications = database.notifications
    .filter(item => item.userId === req.user.id || item.targetRole === 'all' || item.targetRole === req.user.role)
    .sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp))
    .slice(0, 150);
  res.json(notifications);
});

app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
  const notification = database.notifications.find(item => item.id === req.params.id);
  if (!notification || !(notification.userId === req.user.id || notification.targetRole === 'all' || notification.targetRole === req.user.role)) {
    return res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
  }
  notification.read = true;
  notification.readAt = new Date().toISOString();
  persistDatabase();
  res.json(notification);
});

app.patch('/api/notifications/me/read-all', requireAuth, (req, res) => {
  const now = new Date().toISOString();
  database.notifications.forEach(item => {
    if (item.userId === req.user.id || item.targetRole === 'all' || item.targetRole === req.user.role) {
      item.read = true;
      item.readAt = now;
    }
  });
  persistDatabase();
  res.json({ ok: true });
});

app.get('/api/wallet/me', requireAuth, (req, res) => {
  res.json({
    balance: Number(req.user.walletBalance || 0),
    currency: 'USD',
    transactions: database.transactions.filter(item => item.userId === req.user.id).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 150)
  });
});

app.post('/api/wallet/topups', requireAuth, (req, res) => {
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const reference = String(req.body.reference || '').replace(/\D/g, '').slice(0, 20);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000 || reference.length < 6) return res.status(400).json({ error: 'INVALID_TOPUP' });
  if (database.transactions.some(item => item.type === 'TOP_UP' && item.reference === reference && item.status !== 'REJECTED')) return res.status(409).json({ error: 'REFERENCE_EXISTS' });
  const transaction = { id:`transaction_${crypto.randomUUID()}`, userId:req.user.id, type:'TOP_UP', amount, currency:'USD', method:'PAGO_MOVIL', reference, status:'PENDING', createdAt:new Date().toISOString() };
  database.transactions.push(transaction);
  database.notifications.push({ id:`notification_${crypto.randomUUID()}`, targetRole:'admin', title:'Recarga pendiente de verificación', message:`${req.user.firstName} registró una recarga de $${amount.toFixed(2)}.`, category:'FINANCE', read:false, createdAt:new Date().toISOString() });
  persistDatabase();
  io.to('admins').emit('finance:topup_pending', transaction);
  res.status(201).json(transaction);
});

app.post('/api/wallet/payouts', requireAuth, requireApprovedDriver, (req, res) => {
  const available = Number(req.user.walletBalance || 0);
  const amount = Math.round(Number(req.body.amount || available) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > available) return res.status(400).json({ error:'INVALID_PAYOUT' });
  if (database.transactions.some(item => item.userId===req.user.id && item.type==='PAYOUT' && item.status==='PENDING')) return res.status(409).json({ error:'PAYOUT_ALREADY_PENDING' });
  const transaction={id:`transaction_${crypto.randomUUID()}`,userId:req.user.id,type:'PAYOUT',amount,currency:'USD',method:'PAGO_MOVIL',status:'PENDING',createdAt:new Date().toISOString()};
  database.transactions.push(transaction);
  database.notifications.push({ id:`notification_${crypto.randomUUID()}`, targetRole:'admin', title:'Liquidación pendiente', message:`${sanitizeText(req.user.firstName,80)} solicitó retirar $${amount.toFixed(2)}.`, category:'FINANCE', read:false, createdAt:new Date().toISOString() });
  persistDatabase();io.to('admins').emit('finance:payout_pending',transaction);res.status(201).json(transaction);
});

app.patch('/api/admin/transactions/:id', requireAuth, requireRole('admin'), (req, res) => {
  const transaction = database.transactions.find(item => item.id === req.params.id);
  if (!transaction) return res.status(404).json({ error:'TRANSACTION_NOT_FOUND' });
  const status = String(req.body.status || '').toUpperCase();
  if (!['APPROVED','REJECTED'].includes(status) || transaction.status !== 'PENDING') return res.status(409).json({ error:'INVALID_TRANSACTION_STATE' });
  if (transaction.type === 'TOP_UP' && status === 'APPROVED' && req.body.referenceConfirmed !== true) {
    return res.status(400).json({ error:'TOPUP_REFERENCE_CONFIRMATION_REQUIRED' });
  }
  const owner = database.users.find(item => item.id === transaction.userId);
  if (status === 'APPROVED' && transaction.type === 'PAYOUT' && Number(owner?.walletBalance || 0) < transaction.amount) return res.status(409).json({ error:'INSUFFICIENT_BALANCE' });
  transaction.status = status;
  transaction.reviewedBy = req.user.id;
  transaction.reviewedAt = new Date().toISOString();
  transaction.reviewNote = sanitizeText(req.body.reviewNote, 500) || null;
  if (status === 'APPROVED' && owner && transaction.type === 'TOP_UP') owner.walletBalance = Math.round((Number(owner.walletBalance || 0) + transaction.amount) * 100) / 100;
  if (status === 'APPROVED' && owner && transaction.type === 'PAYOUT') {
    owner.walletBalance = Math.round((Number(owner.walletBalance || 0) - transaction.amount) * 100) / 100;
  }
  const isPayout = transaction.type === 'PAYOUT';
  database.adminActions.push({ id:`admin_action_${crypto.randomUUID()}`, adminId:req.user.id, targetUserId:transaction.userId, action:`${isPayout?'payout':'topup'}_${status.toLowerCase()}`, transactionId:transaction.id, createdAt:new Date().toISOString() });
  database.notifications.push({ id:`notification_${crypto.randomUUID()}`, userId:transaction.userId, title:isPayout?(status==='APPROVED'?'Liquidación pagada':'Liquidación rechazada'):(status==='APPROVED'?'Recarga acreditada':'Recarga rechazada'), message:isPayout?(status==='APPROVED'?`Administración aprobó tu liquidación de $${transaction.amount.toFixed(2)}.`:'Administración rechazó la solicitud de liquidación.'):(status==='APPROVED'?`Se acreditaron $${transaction.amount.toFixed(2)} a tu billetera.`:'Administración no pudo validar la referencia enviada.'), category:'FINANCE', read:false, createdAt:new Date().toISOString() });
  persistDatabase();
  io.to(`user:${transaction.userId}`).emit('finance:topup_updated', transaction);
  io.to('admins').emit('finance:transaction_updated', { id: transaction.id, type: transaction.type, status: transaction.status });
  res.json({ transaction, balance:Number(owner?.walletBalance || 0) });
});

app.post('/api/admin/broadcasts', requireAuth, requireRole('admin'), (req, res) => {
  const role = ['all', 'driver', 'passenger'].includes(req.body.role) ? req.body.role : 'all';
  if (!req.body.title?.trim() || !req.body.message?.trim()) return res.status(400).json({ error: 'INVALID_BROADCAST' });
  const notification = { id: `notification_${crypto.randomUUID()}`, title: sanitizeText(req.body.title, 120), message: sanitizeText(req.body.message, 1000), category: 'ANNOUNCEMENT', icon: '📢', targetRole: role, createdAt: new Date().toISOString() };
  database.notifications.push(notification);
  persistDatabase();
  if (role === 'all') io.to('drivers').to('passengers').emit('platform:notification', notification);
  else io.to(`${role}s`).emit('platform:notification', notification);
  io.to('admins').emit('admin:broadcast_sent', notification);
  res.status(201).json(notification);
});

app.patch('/api/admin/drivers/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const driver = database.users.find(user => user.id === req.params.id && user.role === 'driver');
  if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  const { action, documentKey, documentStatus } = req.body;
  const reason = sanitizeText(req.body.reason, 600);
  if (action === 'suspend' && !reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  const previousStatus = driver.status;
  if (documentKey && ['approved', 'rejected', 'pending'].includes(documentStatus)) {
    driver.documents = { ...(driver.documents || {}), [documentKey]: documentStatus };
  }
  if (action === 'approve') {
    driver.isVerified = true;
    driver.status = 'OFFLINE';
    driver.documents = Object.fromEntries(
      ['cedula', 'licencia', 'rcv', 'certificadoMedico', 'carnetCirculacion'].map(key => [key, 'approved'])
    );
  } else if (action === 'suspend') {
    driver.isVerified = false;
    driver.status = 'SUSPENDED';
  } else if (action === 'pending') {
    driver.isVerified = false;
    driver.status = 'PENDING_APPROVAL';
  }
  const application = database.driverApplications.find(item => item.userId === driver.id);
  if (application && action === 'suspend') Object.assign(application, { status: 'suspended', decisionReason: reason, reviewedBy: req.user.id, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (application && action === 'approve' && application.status === 'suspended') Object.assign(application, { status: 'approved', decisionReason: null, reviewedBy: req.user.id, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (['approve','suspend'].includes(action)) {
    database.adminActions.push({ id:`admin_action_${crypto.randomUUID()}`, adminId:req.user.id, targetUserId:driver.id, applicationId:application?.id||null, action:action==='approve'?'reactivate':'suspend', previousStatus, nextStatus:driver.status, reason:reason||null, createdAt:new Date().toISOString() });
    database.notifications.push({ id:`notification_${crypto.randomUUID()}`, userId:driver.id, title:action==='suspend'?'Cuenta de conductor suspendida':'Cuenta de conductor reactivada', message:action==='suspend'?reason:'Tu acceso operativo fue restaurado.', category:'SYSTEM', read:false, createdAt:new Date().toISOString() });
  }
  persistDatabase();
  io.to(`user:${driver.id}`).emit('driver:account_updated', publicUser(driver));
  io.to('admins').emit('admin:driver_updated', publicUser(driver));
  if (driver.status === 'SUSPENDED') {
    const sockets = await io.in(`user:${driver.id}`).fetchSockets();
    sockets.forEach(client => client.disconnect(true));
  }
  res.json(publicUser(driver));
});

app.patch('/api/admin/trips/:id', requireAuth, requireRole('admin'), (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
  const allowedStatuses = ['CANCELLED', 'COMPLETED'];
  if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ error: 'INVALID_STATUS' });
  if (req.body.status === TRIP_STATUS.COMPLETED) {
    try {
      ensureWalletCanCoverTrip(trip, database.users.find(user => user.id === trip.passengerId));
    } catch (error) {
      return res.status(402).json({ error: error.code, balance: error.balance, required: error.required });
    }
  }
  try {
    transitionTrip(trip, req.body.status, { actorId: req.user.id, actorRole: 'admin' });
  } catch (error) {
    return res.status(409).json({ error: error.code });
  }
  trip.closedAt = new Date().toISOString();
  tripLocks.delete(trip.id);
  const driver = database.users.find(user => user.id === trip.driverId);
  if (driver) driver.status = 'AVAILABLE';
  const passengerTransaction = trip.status === TRIP_STATUS.COMPLETED ? settleCompletedTrip(trip) : null;
  persistDatabase();
  emitPassengerWalletUpdate(trip, passengerTransaction);
  io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).to('admins').emit('tripStatusUpdated', {
    tripId: trip.id,
    status: trip.status
  });
  res.json(trip);
});

app.delete('/api/admin/drivers/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const index = database.users.findIndex(user => user.id === req.params.id && user.role === 'driver');
  if (index < 0) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  const [driver] = database.users.splice(index, 1);
  persistDatabase();
  const sockets = await io.in(`user:${driver.id}`).fetchSockets();
  sockets.forEach(client => client.disconnect(true));
  res.status(204).end();
});

app.post('/api/admin/drivers', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, phone, firstName, lastName, vehicleType = 'MOTO', vehicleBrand, vehicleModel, vehiclePlate } = req.body;
  if (!email || !phone || !firstName || !vehiclePlate) return res.status(400).json({ error: 'INVALID_DRIVER' });
  if (database.users.some(user => user.email?.toLowerCase() === email.toLowerCase() || user.phone === phone)) {
    return res.status(409).json({ error: 'USER_EXISTS' });
  }
  const temporaryPassword = `Moto-${crypto.randomUUID().slice(0, 8)}`;
  const driver = {
    id: `driver_${Date.now()}`,
    role: 'driver', firstName, lastName, email: email.toLowerCase(), phone,
    vehicleType: vehicleType === 'CAR' ? 'CAR' : 'MOTO', vehicleBrand, vehicleModel, vehiclePlate,
    passwordHash: await bcrypt.hash(temporaryPassword, 12),
    status: 'OFFLINE', isVerified: true, rating: 5, totalTrips: 0,
    documents: Object.fromEntries(
      ['cedula', 'licencia', 'rcv', 'certificadoMedico', 'carnetCirculacion'].map(key => [key, 'approved'])
    )
  };
  database.users.push(driver);
  persistDatabase();
  res.status(201).json({ user: publicUser(driver), temporaryPassword });
});

app.get('/api/trips', requireAuth, requireRole('admin'), (req, res) => {
  res.json(database.trips);
});

app.get('/api/trips/me/history', requireAuth, (req, res) => {
  if (!['passenger', 'driver'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const trips = database.trips
    .filter(item => req.user.role === 'passenger' ? item.passengerId === req.user.id : item.driverId === req.user.id || item.assignedDriverId === req.user.id)
    .sort((a, b) => new Date(b.completedAt || b.updatedAt || b.createdAt || 0) - new Date(a.completedAt || a.updatedAt || a.createdAt || 0));
  res.json(trips);
});

app.get('/api/trips/active/me', requireAuth, (req, res) => {
  const activeStatuses = ['SEARCHING', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'];
  const now = Date.now();
  const trip = database.trips.findLast(item =>
    activeStatuses.includes(item.status) &&
    now - new Date(item.createdAt || 0).getTime() < (item.status === 'SEARCHING' ? 3 * 60 * 1000 : 12 * 60 * 60 * 1000) &&
    (item.passengerId === req.user.id || item.driverId === req.user.id)
  );
  if (!trip) return res.status(204).end();
  const passenger = database.users.find(user => user.id === trip.passengerId);
  const driver = database.users.find(user => user.id === trip.driverId);
  res.json({
    trip,
    passenger: publicUser(passenger),
    driver: publicUser(driver)
  });
});

app.get('/api/trips/pending-review/me', requireAuth, requireRole('passenger'), (req, res) => {
  const reviewWindowMs = 2 * 60 * 60 * 1000;
  const trip = database.trips.findLast(item =>
    item.passengerId === req.user.id &&
    item.status === TRIP_STATUS.COMPLETED &&
    !item.driverReview &&
    Date.now() - new Date(item.closedAt || item.updatedAt || item.createdAt || 0).getTime() < reviewWindowMs
  );
  if (!trip) return res.status(204).end();
  const passenger = database.users.find(user => user.id === trip.passengerId);
  const driver = database.users.find(user => user.id === trip.driverId);
  res.json({ trip, passenger: publicUser(passenger), driver: publicUser(driver) });
});

app.get('/api/trips/:id', requireAuth, (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
  if (!userCanAccessTrip(req.user.id, req.user.role, trip)) return res.status(403).json({ error: 'FORBIDDEN' });
  const passenger = database.users.find(user => user.id === trip.passengerId);
  const driver = database.users.find(user => user.id === trip.driverId);
  res.json({ trip, passenger: publicUser(passenger), driver: publicUser(driver) });
});

app.get('/api/trips/:id/messages', requireAuth, (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
  if (!userCanAccessTrip(req.user.id, req.user.role, trip)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  res.json(database.messages.filter(message => message.tripId === trip.id));
});

app.post('/api/trips/create', requireAuth, requireRole('passenger'), (req, res) => {
  const requestedId = req.body.id || req.headers['idempotency-key'];
  const existing = requestedId && database.trips.find(item => item.id === requestedId && item.passengerId === req.user.id);
  if (existing) return res.json({ status: 'existing', trip: existing });
  const trip = { ...req.body };
  const pickup = normalizeLocation(trip.pickup);
  const destination = normalizeLocation(trip.destination);
  if (!pickup || !destination) {
    return res.status(400).json({ error: 'VALID_GPS_COORDINATES_REQUIRED' });
  }
  trip.pickup = pickup;
  trip.destination = destination;
  trip.rideType = trip.rideType === 'CAR' ? 'CAR' : 'MOTO';
  trip.passengerId = req.user.id;
  trip.driverId = null;
  delete trip.driver;
  trip.id = trip.id || 'trip_' + Date.now();
  trip.status = TRIP_STATUS.SEARCHING;
  trip.createdAt = new Date().toISOString();
  trip.updatedAt = trip.createdAt;
  trip.statusHistory = [{ status: trip.status, at: trip.createdAt, actorId: req.user.id }];
  if (Number.isFinite(Number(trip.distanceKm)) && Number.isFinite(Number(trip.durationMin))) {
    trip.pricing = calculateFare({
      distanceKm: Number(trip.distanceKm),
      durationMin: Number(trip.durationMin),
      exchangeRateType: trip.exchangeRateType || 'BCV',
      rideType: trip.rideType
    }, pricingConfig);
    trip.fareUSD = trip.pricing.fareUSD;
    trip.fareVES = trip.pricing.fareVES;
  }
  try {
    ensureWalletCanCoverTrip(trip, req.user);
  } catch (error) {
    return res.status(402).json({ error: error.code, balance: error.balance, required: error.required });
  }
  database.trips.push(trip);
  persistDatabase();
  
  // Trigger Dispatch Service
  dispatchTripToDrivers(trip);

  res.json({ status: 'created', trip });
});

app.post('/api/trips/scheduled', requireAuth, requireRole('passenger'), (req, res) => {
  const scheduledAt = new Date(req.body.scheduledAt);
  const pickupAddress = String(req.body.pickup?.address || '').trim().slice(0, 240);
  const destinationAddress = String(req.body.destination?.address || '').trim().slice(0, 240);
  if (!pickupAddress || !destinationAddress || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 30 * 60 * 1000) return res.status(400).json({ error:'INVALID_SCHEDULED_TRIP' });
  const trip = { id:`scheduled_${crypto.randomUUID()}`, passengerId:req.user.id, pickup:{...req.body.pickup,address:pickupAddress}, destination:{...req.body.destination,address:destinationAddress}, scheduledAt:scheduledAt.toISOString(), rideType:req.body.rideType==='CAR'?'CAR':'MOTO', paymentMethod:String(req.body.paymentMethod||'CASH').slice(0,30), fareUSD:Math.max(0,Math.round(Number(req.body.fareUSD||0)*100)/100), status:'SCHEDULED', assignedDriverId:null, createdAt:new Date().toISOString() };
  database.trips.push(trip); persistDatabase(); io.to('drivers').to('admins').emit('scheduled_trip:new',trip); res.status(201).json(trip);
});

app.get('/api/trips/scheduled/available', requireAuth, requireApprovedDriver, (req, res) => {
  const trips = database.trips.filter(item => item.status==='SCHEDULED' && item.rideType===(req.user.vehicleType||'MOTO') && (!item.assignedDriverId || item.assignedDriverId===req.user.id) && new Date(item.scheduledAt)>new Date()).map(trip=>({...trip,passenger:publicUser(database.users.find(user=>user.id===trip.passengerId))}));
  res.json(trips);
});

app.post('/api/trips/scheduled/:id/claim', requireAuth, requireApprovedDriver, (req, res) => {
  const trip = database.trips.find(item=>item.id===req.params.id && item.status==='SCHEDULED');
  if(!trip)return res.status(404).json({error:'SCHEDULED_TRIP_NOT_FOUND'});
  if(trip.assignedDriverId && trip.assignedDriverId!==req.user.id)return res.status(409).json({error:'ALREADY_ASSIGNED'});
  trip.assignedDriverId=req.user.id;trip.driverId=req.user.id;trip.updatedAt=new Date().toISOString();persistDatabase();io.to(`user:${trip.passengerId}`).to('admins').emit('scheduled_trip:claimed',{tripId:trip.id,driver:publicUser(req.user)});res.json(trip);
});

app.delete('/api/trips/scheduled/:id', requireAuth, requireRole('passenger'), (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id && item.passengerId === req.user.id && item.status === 'SCHEDULED');
  if (!trip) return res.status(404).json({ error: 'SCHEDULED_TRIP_NOT_FOUND' });
  if (trip.assignedDriverId) return res.status(409).json({ error: 'SCHEDULED_TRIP_ALREADY_ASSIGNED' });
  trip.status = TRIP_STATUS.CANCELLED;
  trip.cancelledAt = new Date().toISOString();
  trip.updatedAt = trip.cancelledAt;
  persistDatabase();
  io.to('admins').emit('scheduled_trip:cancelled', { tripId: trip.id });
  res.json(trip);
});

app.patch('/api/drivers/status', requireAuth, requireApprovedDriver, (req, res) => {
  const driverId = req.user.id;
  const driver = database.users.find(u => u.id === driverId && u.role === 'driver');
  if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  driver.status = req.body.status || driver.status;
  persistDatabase();
  io.emit('driverStatusChanged', { driverId, userId: driverId, status: driver.status });
  io.emit('admin:driver_updated', driver);
  res.json(driver);
});

app.patch('/api/drivers/location', requireAuth, requireApprovedDriver, (req, res) => {
  const driverId = req.user.id;
  const driver = database.users.find(u => u.id === driverId && u.role === 'driver');
  if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  driver.location = {
    lat: Number(req.body.latitude ?? req.body.lat),
    lng: Number(req.body.longitude ?? req.body.lng),
    heading: Number(req.body.heading || 0),
    updatedAt: Date.now()
  };
  persistDatabase();
  const payload = { ...driver.location, driverId, userId: driverId };
  emitDriverLocation(driverId, payload);
  io.emit('admin:driver_location', payload);
  res.json(driver);
});

function dispatchTripToDrivers(trip) {
  const pickup = normalizeLocation(trip.pickup);
  if (!pickup) {
    console.error(`[+58express Dispatcher] Trip [${trip.id}] rejected: invalid pickup GPS`);
    return;
  }
  const pickupLat = pickup.lat;
  const pickupLng = pickup.lng;

  // Find available online drivers
  const availableDrivers = database.users
    .filter(u =>
      u.role === 'driver' &&
      u.isVerified === true &&
      u.accountStatus !== 'DISABLED' &&
      u.status === 'AVAILABLE' &&
      driverRegistry.has(u.id) &&
      (u.vehicleType || 'MOTO') === (trip.rideType || 'MOTO') &&
      !(trip.excludedDriverIds || []).includes(u.id) &&
      Number.isFinite(u.location?.lat) &&
      Number.isFinite(u.location?.lng)
    )
    .map(d => {
      const dist = calculateDistance(pickupLat, pickupLng, d.location.lat, d.location.lng);
      return { driver: d, dist };
    })
    .filter(candidate => candidate.dist <= Number(process.env.MAX_DISPATCH_RADIUS_KM || 15))
    .sort((a, b) => a.dist - b.dist);

  console.log(`[+58express Dispatcher] Dispatching trip [${trip.id}] to ${availableDrivers.length} online drivers`);

  const session = { tripId: trip.id, candidates: availableDrivers, index: -1, currentDriverId: null };
  dispatchSessions.set(trip.id, session);

  const offerNext = () => {
    if (tripLocks.get(trip.id) || trip.status !== TRIP_STATUS.SEARCHING) return;
    session.index += 1;
    const candidate = session.candidates[session.index];
    if (!candidate) {
      transitionTrip(trip, TRIP_STATUS.CANCELLED, { actorRole: 'system', reason: 'NO_DRIVERS_AVAILABLE' });
      persistDatabase();
      dispatchSessions.delete(trip.id);
      dispatchTimers.delete(trip.id);
      io.to(`user:${trip.passengerId}`).to('admins').emit('dispatch:no_drivers', { tripId: trip.id });
      io.to(`user:${trip.passengerId}`).to('admins').emit('tripStatusUpdated', {
        tripId: trip.id,
        status: TRIP_STATUS.CANCELLED,
        reason: 'NO_DRIVERS_AVAILABLE'
      });
      return;
    }
    session.currentDriverId = candidate.driver.id;
    const socketId = driverRegistry.get(candidate.driver.id) || candidate.driver.socketId;
    const offer = {
      ...trip,
      offeredDriverId: candidate.driver.id,
      distanceToPickupKm: Math.round(candidate.dist * 100) / 100,
      candidatesCount: session.candidates.length,
      offerExpiresAt: Date.now() + 15000
    };
    if (socketId) io.to(socketId).emit('rideRequested', offer);
    io.to('admins').emit('rideRequested', offer);
    const timer = setTimeout(offerNext, 15000);
    dispatchTimers.set(trip.id, timer);
  };

  offerNext();
}

// Socket.IO Server Setup
io.on('connection', (socket) => {
  console.log(`[+58express Socket.IO] Client connected: ${socket.id}`);
  socket.join(`${socket.data.auth.role}s`);
  socket.join(`user:${socket.data.auth.userId}`);

  socket.on('join:room', (room) => {
    const allowedRooms = [`${socket.data.auth.role}s`, `user:${socket.data.auth.userId}`];
    if (!allowedRooms.includes(room)) return;
    socket.join(room);
    console.log(`[+58express Socket.IO] Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('driver:connect', (data = {}) => {
    if (!allowSocketRole(socket, 'driver')) return;
    data.userId = socket.data.auth.userId;
    socket.join('drivers');
    const driver = database.users.find(u => u.id === data.userId) || database.users.find(u => u.role === 'driver');
    if (driver) {
      driver.status = data.status || 'AVAILABLE';
      driver.socketId = socket.id;
      driverRegistry.set(driver.id, socket.id);
      persistDatabase();
    }
    socket.emit('driver:connected', { success: true, socketId: socket.id, driver: driver || null });
    io.emit('admin:driver_updated', driver || { userId: data.userId, status: data.status || 'AVAILABLE' });
  });

  // Driver GPS Continuous Streaming Event
  socket.on('driver:location', (data) => {
    if (!allowSocketRole(socket, 'driver')) return;
    data.driverId = socket.data.auth.userId;
    const driverId = data.driverId;
    const lat = Number(data.latitude ?? data.lat);
    const lng = Number(data.longitude ?? data.lng);
    const heading = Number(data.heading || 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const driver = database.users.find(u => u.id === driverId);
    if (driver) {
      driver.location = { lat, lng, heading: heading || 0, updatedAt: Date.now() };
      driver.status = driver.status || 'AVAILABLE';
      persistDatabase();
    }
    emitDriverLocation(driverId, { lat, lng, heading: heading || 0, updatedAt: Date.now() });
  });

  socket.on('driver:location_update', (data) => {
    if (!allowSocketRole(socket, 'driver')) return;
    data.userId = socket.data.auth.userId;
    const driverId = data.userId || data.driverId;
    const lat = data.latitude ?? data.lat;
    const lng = data.longitude ?? data.lng;
    const driver = database.users.find(u => u.id === driverId);
    if (driver && Number.isFinite(lat) && Number.isFinite(lng)) {
      driver.location = { lat, lng, heading: data.heading || 0, updatedAt: Date.now() };
      persistDatabase();
    }
    const payload = { ...data, driverId, lat, lng };
    emitDriverLocation(driverId, payload);
    io.emit('admin:driver_location', payload);
  });

  socket.on('passenger:location_update', (data = {}) => {
    if (!allowSocketRole(socket, 'passenger')) return;
    const passengerId = socket.data.auth.userId;
    const trip = database.trips.findLast(item =>
      item.passengerId === passengerId &&
      ['SEARCHING', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'].includes(item.status)
    );
    if (!trip) return;
    const lat = Number(data.latitude ?? data.lat);
    const lng = Number(data.longitude ?? data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    trip.pickup = { ...(trip.pickup || {}), lat, lng };
    trip.passengerLocation = { lat, lng, heading: Number(data.heading || 0), updatedAt: Date.now() };
    persistDatabase();
    const payload = { ...trip.passengerLocation, passengerId, tripId: trip.id };
    io.to(`user:${trip.driverId}`).to('admins').emit('passengerLocationUpdated', payload);
  });

  // Driver Status Toggle Event ('AVAILABLE' | 'BUSY' | 'OFFLINE')
  socket.on('driver:status', (data) => {
    if (!allowSocketRole(socket, 'driver')) return;
    data.driverId = socket.data.auth.userId;
    const { driverId, status } = data;
    const driver = database.users.find(u => u.id === driverId);
    if (driver) {
      driver.status = status;
      persistDatabase();
    }
    io.emit('driverStatusChanged', { driverId, status });
  });

  socket.on('driver:status_change', (data) => {
    if (!allowSocketRole(socket, 'driver')) return;
    data.userId = socket.data.auth.userId;
    const driverId = data.userId || data.driverId;
    const driver = database.users.find(u => u.id === driverId);
    if (driver) {
      driver.status = data.status;
      persistDatabase();
    }
    io.emit('driverStatusChanged', { driverId, userId: driverId, status: data.status });
    io.emit('admin:driver_updated', driver || data);
  });

  // Passenger Ride Request Event
  socket.on('rideRequested', (tripData) => {
    if (!allowSocketRole(socket, 'passenger')) return;
    const pickup = normalizeLocation(tripData?.pickup);
    const destination = normalizeLocation(tripData?.destination);
    if (!pickup || !destination) {
      socket.emit('rideRequestFailed', { tripId: tripData?.id, reason: 'VALID_GPS_COORDINATES_REQUIRED' });
      return;
    }
    tripData.pickup = pickup;
    tripData.destination = destination;
    tripData.passengerId = socket.data.auth.userId;
    try {
      ensureWalletCanCoverTrip(tripData, database.users.find(user => user.id === socket.data.auth.userId));
    } catch (error) {
      socket.emit('rideRequestFailed', { tripId: tripData?.id, reason: error.code, balance: error.balance, required: error.required });
      return;
    }
    console.log(`[+58express Socket.IO] Passenger requested ride [${tripData.id}]`);
    const existing = database.trips.find(t => t.id === tripData.id);
    const trip = existing || {
      ...tripData,
      id: tripData.id || 'trip_' + Date.now(),
      status: 'SEARCHING',
      createdAt: tripData.createdAt || new Date().toISOString()
    };
    if (!existing) {
      database.trips.push(trip);
      persistDatabase();
    }
    dispatchTripToDrivers(trip);
  });

  // Driver Atomic Ride Acceptance Event
  socket.on('rideAccepted', (data) => {
    if (!allowSocketRole(socket, 'driver')) return;
    const { tripId } = data;
    const authenticatedDriver = database.users.find(user =>
      user.id === socket.data.auth.userId && user.role === 'driver'
    );
    if (!authenticatedDriver?.isVerified) {
      socket.emit('rideAcceptanceFailed', { tripId, reason: 'DRIVER_NOT_APPROVED' });
      return;
    }
    const driver = publicUser(authenticatedDriver);
    const dispatchSession = dispatchSessions.get(tripId);
    if (dispatchSession && dispatchSession.currentDriverId !== driver.id) {
      socket.emit('rideAcceptanceFailed', { tripId, reason: 'NOT_CURRENT_OFFER' });
      return;
    }

    // Atomic Lock Check
    if (tripLocks.get(tripId)) {
      socket.emit('rideAcceptanceFailed', { tripId, reason: 'ALREADY_ACCEPTED' });
      return;
    }

    tripLocks.set(tripId, true);
    if (dispatchTimers.has(tripId)) {
      clearTimeout(dispatchTimers.get(tripId));
      dispatchTimers.delete(tripId);
    }
    dispatchSessions.delete(tripId);

    // Update trip and driver status
    const trip = database.trips.find(t => t.id === tripId);
    if (trip) {
      transitionTrip(trip, TRIP_STATUS.DRIVER_ASSIGNED, { actorId: driver.id, actorRole: 'driver' });
      trip.driver = driver;
      trip.driverId = driver?.id;
      persistDatabase();
    }

    const dUser = database.users.find(u => u.id === driver.id);
    if (dUser) dUser.status = 'BUSY';

    console.log(`[+58express Socket.IO] Atomic lock success! Ride [${tripId}] assigned to ${driver.firstName}`);

    // Broadcast confirmation to ALL clients (Passengers, Drivers, Admin)
    io.to(`user:${trip?.passengerId}`).to('drivers').to('admins').emit('tripStatusUpdated', {
      tripId,
      status: 'EN_ROUTE',
      driver
    });
  });

  socket.on('rideRejected', ({ tripId } = {}) => {
    if (!allowSocketRole(socket, 'driver')) return;
    const session = dispatchSessions.get(tripId);
    if (!session || session.currentDriverId !== socket.data.auth.userId) return;
    if (dispatchTimers.has(tripId)) clearTimeout(dispatchTimers.get(tripId));
    const trip = database.trips.find(item => item.id === tripId);
    if (trip) {
      trip.excludedDriverIds = [...(trip.excludedDriverIds || []), socket.data.auth.userId];
      dispatchTripToDrivers(trip);
    }
  });

  // Trip Status Transition Event ('ARRIVED', 'IN_PROGRESS', 'COMPLETED')
  socket.on('tripStatusUpdated', (data) => {
    if (!allowSocketRole(socket, 'driver')) return;
    const { tripId, status, driver } = data;
    const trip = database.trips.find(t => t.id === tripId);
    if (!trip || trip.driverId !== socket.data.auth.userId) {
      socket.emit('authorization:error', { error: 'FORBIDDEN', tripId });
      return;
    }
    if (trip) {
      if (status === TRIP_STATUS.COMPLETED) {
        try {
          ensureWalletCanCoverTrip(trip, database.users.find(user => user.id === trip.passengerId));
        } catch (error) {
          socket.emit('tripStatusRejected', { tripId, status, error: error.code, balance: error.balance, required: error.required });
          return;
        }
      }
      try {
        transitionTrip(trip, status, { actorId: socket.data.auth.userId, actorRole: 'driver' });
      } catch (error) {
        socket.emit('tripStatusRejected', { tripId, status, error: error.code });
        return;
      }
      if (status === 'COMPLETED' || status === 'CANCELLED') {
        const assignedDriver = database.users.find(user => user.id === trip.driverId);
        if (assignedDriver) assignedDriver.status = 'AVAILABLE';
        tripLocks.delete(tripId);
      }
      const passengerTransaction = trip.status === TRIP_STATUS.COMPLETED ? settleCompletedTrip(trip) : null;
      persistDatabase();
      emitPassengerWalletUpdate(trip, passengerTransaction);
    }
    io.to(`user:${trip?.passengerId}`).to('drivers').to('admins').emit('tripStatusUpdated', data);
  });

  // Passenger Ride Cancelled Event
  socket.on('rideCancelled', (data) => {
    if (!allowSocketRole(socket, 'passenger')) return;
    const { tripId } = data;
    tripLocks.delete(tripId);
    dispatchSessions.delete(tripId);
    if (dispatchTimers.has(tripId)) {
      clearTimeout(dispatchTimers.get(tripId));
      dispatchTimers.delete(tripId);
    }
    const trip = database.trips.find(t => t.id === tripId);
    if (trip) {
      transitionTrip(trip, TRIP_STATUS.CANCELLED, { actorId: socket.data.auth.userId, actorRole: 'passenger' });
      persistDatabase();
    }

    console.log(`[+58express Socket.IO] Ride [${tripId}] cancelled by passenger`);
    io.emit('rideCancelled', { tripId });
  });

  socket.on('chat:send_message', (data = {}) => {
    const trip = database.trips.find(item => item.id === data.tripId);
    const { userId, role } = socket.data.auth;
    if (!trip || !userCanAccessTrip(userId, role, trip) || role === 'admin') {
      socket.emit('chat:error', { error: 'FORBIDDEN', tripId: data.tripId });
      return;
    }
    const text = String(data.text || '').trim().slice(0, 1000);
    const image = typeof data.image === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(data.image) && data.image.length <= 1_000_000 ? data.image : null;
    if (!text && !image) return;
    const sender = database.users.find(user => user.id === userId);
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tripId: trip.id,
      senderId: userId,
      senderName: sender?.firstName || 'Usuario',
      recipientId: role === 'driver' ? trip.passengerId : trip.driverId,
      text,
      image,
      timestamp: new Date().toISOString()
    };
    database.messages.push(message);
    persistDatabase();
    io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).emit('chat:message', message);
  });

  socket.on('tripRated', (data = {}) => {
    const trip = database.trips.find(item => item.id === data.tripId);
    const { userId, role } = socket.data.auth;
    if (!trip || !userCanAccessTrip(userId, role, trip) || !['driver', 'passenger'].includes(role)) return;
    const rating = Math.max(1, Math.min(5, Number(data.rating) || 5));
    const review = {
      rating,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 5) : [],
      comment: String(data.comment || '').slice(0, 500),
      createdAt: new Date().toISOString()
    };
    if (role === 'driver' && data.targetRole === 'passenger') trip.passengerReview = review;
    if (role === 'passenger' && data.targetRole === 'driver') {
      trip.driverReview = { ...review, tipEUR: Math.max(0, Number(data.tipEUR) || 0) };
    }
    persistDatabase();
    io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).to('admins').emit('tripRatingUpdated', { tripId: trip.id, role, review });
  });

  socket.on('disconnect', () => {
    for (const [driverId, socketId] of driverRegistry.entries()) {
      if (socketId === socket.id) {
        driverRegistry.delete(driverId);
        const driver = database.users.find(u => u.id === driverId);
        if (driver) {
          driver.status = 'OFFLINE';
          persistDatabase();
        }
        io.emit('admin:driver_updated', driver || { userId: driverId, status: 'OFFLINE' });
      }
    }
    console.log(`[+58express Socket.IO] Client disconnected: ${socket.id}`);
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED' });
  }
  if (error?.code === 'INVALID_FILE_TYPE' || error?.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ error: 'INVALID_FILE_TYPE' });
  }
  if (error?.message === 'ORIGIN_NOT_ALLOWED') return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
  console.error('[+58express HTTP]', error);
  return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
});

server.listen(PORT, () => {
  console.log(`🚀 [+58express Backend Server] Running on http://localhost:${PORT}`);
});
