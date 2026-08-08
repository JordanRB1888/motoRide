import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DatabaseSync } from 'node:sqlite';
import { calculateFare, DEFAULT_PRICING } from './domain/pricingService.js';
import { transitionTrip, TRIP_STATUS } from './domain/tripStateMachine.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 4000;
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE || path.join(serverDir, 'data', 'plus58express.sqlite');
const jwtSecret = process.env.JWT_SECRET || 'plus58express-development-secret';
let pricingConfig = {
  ...DEFAULT_PRICING,
  bcvRate: Number(process.env.BCV_RATE || 0),
  parallelRate: Number(process.env.PARALLEL_RATE || 0)
};

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
    socket.data.auth = { userId: payload.sub, role: payload.role };
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
  users: [
    {
      id: 'd1',
      role: 'driver',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      phone: '+58 414-000-0004',
      email: 'conductor@58express.com',
      vehicleBrand: 'Bera',
      vehicleType: 'MOTO',
      vehicleModel: 'SBR 150',
      vehiclePlate: 'AC3M49P',
      vehicleColor: 'Negro',
      rating: 4.9,
      totalTrips: 142,
      isVerified: true,
      status: 'AVAILABLE',
      location: { lat: 10.6427, lng: -71.6125, heading: 0, updatedAt: Date.now() }
    },
    {
      id: 'p1',
      role: 'passenger',
      firstName: 'Jordan',
      lastName: 'Pérez',
      phone: '+58 412-123-4567',
      email: 'pasajero@58express.com',
      walletBalance: 45.00
    },
    {
      id: 'admin_1',
      role: 'admin',
      firstName: 'Admin',
      lastName: '+58express',
      phone: '+58 414-000-0000',
      email: process.env.ADMIN_EMAIL || 'admin@58express.com'
    }
  ],
  trips: [],
  notifications: [],
  messages: [],
  supportMessages: [],
  settings: []
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
`);

function loadCollection(table) {
  return sqlite.prepare(`SELECT payload FROM ${table}`).all().map(row => JSON.parse(row.payload));
}

const database = {
  users: loadCollection('users'),
  trips: loadCollection('trips'),
  notifications: loadCollection('notifications'),
  messages: loadCollection('messages'),
  supportMessages: loadCollection('supportMessages'),
  settings: loadCollection('settings')
};

const storedPricing = database.settings.find(item => item.id === 'pricing');
if (storedPricing?.value) pricingConfig = { ...pricingConfig, ...storedPricing.value };

function ensureSeedCredentials() {
  const defaults = {
    d1: 'password123',
    p1: 'password123',
    admin_1: 'admin'
  };
  let changed = false;
  for (const seedUser of initialDatabase.users) {
    if (!database.users.some(user => user.id === seedUser.id)) {
      database.users.push(structuredClone(seedUser));
      changed = true;
    }
  }
  for (const user of database.users) {
    const seed = initialDatabase.users.find(item => item.id === user.id);
    if (seed && user.isVerified === undefined && seed.isVerified !== undefined) {
      user.isVerified = seed.isVerified;
      changed = true;
    }
    if (defaults[user.id] && (!user.passwordHash || !bcrypt.compareSync(defaults[user.id], user.passwordHash))) {
      user.passwordHash = bcrypt.hashSync(defaults[user.id], 12);
      changed = true;
    }
  }
  if (changed) persistDatabase();
}

function persistDatabase() {
  try {
    sqlite.exec('BEGIN IMMEDIATE');
    for (const table of ['users', 'trips', 'notifications', 'messages', 'supportMessages', 'settings']) {
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
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = database.users.find(item => item.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'INVALID_SESSION' });
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
  res.json({ status: 'ok', message: '+58express Real Backend Server Active 🇻🇪', timestamp: Date.now() });
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
  const user = database.users.find(item =>
    (!role || item.role === role) &&
    [item.email, item.phone].filter(Boolean).some(value => String(value).trim().toLowerCase() === loginId)
  );
  if (!user || !user.passwordHash || !await bcrypt.compare(String(password || ''), user.passwordHash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  res.json({ status: 'success', user: publicUser(user), token: signToken(user) });
});

app.post('/api/auth/register', async (req, res) => {
  const {
    email, phone, password, role = 'passenger', firstName, lastName,
    vehicleType = 'MOTO', vehicleBrand, vehicleModel, vehiclePlate, vehicleColor, vehicleYear,
    licenseNumber, documents, photoUrl
  } = req.body;
  if (!email || !password || password.length < 6 || !['passenger', 'driver'].includes(role)) {
    return res.status(400).json({ error: 'INVALID_REGISTRATION' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = phone ? String(phone).trim() : null;
  const duplicate = database.users.some(user => user.email?.toLowerCase() === normalizedEmail || (normalizedPhone && user.phone === normalizedPhone));
  if (duplicate) return res.status(409).json({ error: 'USER_EXISTS' });
  const user = {
    id: `${role}_${Date.now()}`,
    role,
    firstName: firstName || normalizedEmail.split('@')[0],
    lastName: lastName || 'Express',
    email: normalizedEmail,
    phone: normalizedPhone,
    passwordHash: await bcrypt.hash(password, 12),
    rating: 5,
    totalTrips: 0,
    walletBalance: role === 'passenger' ? 0 : undefined,
    status: role === 'driver' ? 'OFFLINE' : undefined,
    isVerified: role === 'passenger',
    ...(role === 'driver' ? {
      vehicleType: vehicleType === 'CAR' ? 'CAR' : 'MOTO', vehicleBrand, vehicleModel, vehiclePlate, vehicleColor, vehicleYear,
      licenseNumber, documents, photoUrl
    } : {})
  };
  database.users.push(user);
  persistDatabase();
  res.status(201).json({ status: 'created', user: publicUser(user), token: signToken(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

app.patch('/api/auth/me', requireAuth, (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'photoUrl', 'cedula', 'vehicleType', 'vehicleBrand', 'vehicleModel', 'vehiclePlate', 'vehicleColor'];
  for (const key of allowed) if (key in req.body) req.user[key] = req.body[key];
  persistDatabase();
  res.json(publicUser(req.user));
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
    averageRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 : null,
    bcvRate: Number(pricingConfig.bcvRate || 0)
  });
});

app.get('/api/drivers/nearby', requireAuth, requireRole('admin'), (req, res) => {
  res.json(database.users.filter(user => user.role === 'driver').map(driver => ({
    ...publicUser(driver),
    ...(driver.location || {}),
    driverId: driver.id,
    driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim()
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
    return { id: trip.id, date: trip.completedAt || trip.closedAt || trip.updatedAt, gross, commission, driverNet: Math.round((gross - commission) * 100) / 100, payoutStatus: trip.payoutStatus || 'PENDING', paymentMethod: trip.paymentMethod || 'EFECTIVO', driver: publicUser(driver), passenger: publicUser(passenger) };
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  res.json({
    bcvRate: Number(pricingConfig.bcvRate || 0), commissionRate, transactions,
    summary: {
      gross: transactions.reduce((s, t) => s + t.gross, 0),
      commission: transactions.reduce((s, t) => s + t.commission, 0),
      pending: transactions.filter(t => t.payoutStatus === 'PENDING').reduce((s, t) => s + t.driverNet, 0),
      paid: transactions.filter(t => t.payoutStatus === 'PAID').reduce((s, t) => s + t.driverNet, 0)
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
  if (!target || (!req.body.text?.trim() && !req.body.image)) return res.status(400).json({ error: 'INVALID_SUPPORT_MESSAGE' });
  const message = { id: `support_${crypto.randomUUID()}`, conversationUserId, senderId: req.user.id, senderRole: req.user.role, text: String(req.body.text || '').trim(), image: req.body.image || null, createdAt: new Date().toISOString(), read: false };
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

app.post('/api/admin/broadcasts', requireAuth, requireRole('admin'), (req, res) => {
  const role = ['all', 'driver', 'passenger'].includes(req.body.role) ? req.body.role : 'all';
  if (!req.body.title?.trim() || !req.body.message?.trim()) return res.status(400).json({ error: 'INVALID_BROADCAST' });
  const notification = { id: `notification_${crypto.randomUUID()}`, title: req.body.title.trim(), message: req.body.message.trim(), category: 'ANNOUNCEMENT', icon: '📢', targetRole: role, createdAt: new Date().toISOString() };
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
  try {
    transitionTrip(trip, req.body.status, { actorId: req.user.id, actorRole: 'admin' });
  } catch (error) {
    return res.status(409).json({ error: error.code });
  }
  trip.closedAt = new Date().toISOString();
  tripLocks.delete(trip.id);
  const driver = database.users.find(user => user.id === trip.driverId);
  if (driver) driver.status = 'AVAILABLE';
  persistDatabase();
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
  database.trips.push(trip);
  persistDatabase();
  
  // Trigger Dispatch Service
  dispatchTripToDrivers(trip);

  res.json({ status: 'created', trip });
});

app.patch('/api/drivers/status', requireAuth, requireRole('driver'), (req, res) => {
  const driverId = req.user.id;
  const driver = database.users.find(u => u.id === driverId && u.role === 'driver');
  if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  driver.status = req.body.status || driver.status;
  persistDatabase();
  io.emit('driverStatusChanged', { driverId, userId: driverId, status: driver.status });
  io.emit('admin:driver_updated', driver);
  res.json(driver);
});

app.patch('/api/drivers/location', requireAuth, requireRole('driver'), (req, res) => {
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
    const { driverId, lat, lng, heading } = data;
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
      persistDatabase();
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
    const image = typeof data.image === 'string' && data.image.length <= 1_000_000 ? data.image : null;
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

server.listen(PORT, () => {
  console.log(`🚀 [+58express Backend Server] Running on http://localhost:${PORT}`);
});
