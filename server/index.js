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
  notifications: []
};

fs.mkdirSync(path.dirname(dataFile), { recursive: true });
const sqlite = new DatabaseSync(dataFile);
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
`);

function loadCollection(table) {
  return sqlite.prepare(`SELECT payload FROM ${table}`).all().map(row => JSON.parse(row.payload));
}

const database = {
  users: loadCollection('users'),
  trips: loadCollection('trips'),
  notifications: loadCollection('notifications')
};

function ensureSeedCredentials() {
  const defaults = {
    d1: process.env.DRIVER_PASSWORD || 'password123',
    p1: process.env.PASSENGER_PASSWORD || 'password123',
    admin_1: process.env.ADMIN_PASSWORD || 'admin'
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
    if (!user.passwordHash && defaults[user.id]) {
      user.passwordHash = bcrypt.hashSync(defaults[user.id], 12);
      changed = true;
    }
  }
  if (changed) persistDatabase();
}

function persistDatabase() {
  try {
    sqlite.exec('BEGIN IMMEDIATE');
    for (const table of ['users', 'trips', 'notifications']) {
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

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '+58express Real Backend Server Active 🇻🇪', timestamp: Date.now() });
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
    vehicleBrand, vehicleModel, vehiclePlate, vehicleColor, vehicleYear,
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
      vehicleBrand, vehicleModel, vehiclePlate, vehicleColor, vehicleYear,
      licenseNumber, documents, photoUrl
    } : {})
  };
  database.users.push(user);
  persistDatabase();
  res.status(201).json({ status: 'created', user: publicUser(user), token: signToken(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

app.patch('/api/auth/me', requireAuth, (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'photoUrl', 'cedula', 'vehicleBrand', 'vehicleModel', 'vehiclePlate', 'vehicleColor'];
  for (const key of allowed) if (key in req.body) req.user[key] = req.body[key];
  persistDatabase();
  res.json(publicUser(req.user));
});

app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json(database.users.map(publicUser));
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
  const { email, phone, firstName, lastName, vehicleBrand, vehicleModel, vehiclePlate } = req.body;
  if (!email || !phone || !firstName || !vehiclePlate) return res.status(400).json({ error: 'INVALID_DRIVER' });
  if (database.users.some(user => user.email?.toLowerCase() === email.toLowerCase() || user.phone === phone)) {
    return res.status(409).json({ error: 'USER_EXISTS' });
  }
  const temporaryPassword = `Moto-${crypto.randomUUID().slice(0, 8)}`;
  const driver = {
    id: `driver_${Date.now()}`,
    role: 'driver', firstName, lastName, email: email.toLowerCase(), phone,
    vehicleBrand, vehicleModel, vehiclePlate,
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

app.post('/api/trips/create', requireAuth, requireRole('passenger'), (req, res) => {
  const trip = req.body;
  trip.passengerId = req.user.id;
  trip.id = trip.id || 'trip_' + Date.now();
  trip.status = 'SEARCHING';
  trip.createdAt = new Date().toISOString();
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
  io.emit('driverLocationUpdated', payload);
  io.emit('admin:driver_location', payload);
  res.json(driver);
});

function dispatchTripToDrivers(trip) {
  const pickupLat = trip.pickup?.lat || 10.6427;
  const pickupLng = trip.pickup?.lng || -71.6125;

  // Find available online drivers
  const availableDrivers = database.users
    .filter(u => u.role === 'driver' && u.status === 'AVAILABLE')
    .map(d => {
      const dist = calculateDistance(pickupLat, pickupLng, d.location.lat, d.location.lng);
      return { driver: d, dist };
    })
    .sort((a, b) => a.dist - b.dist);

  console.log(`[+58express Dispatcher] Dispatching trip [${trip.id}] to ${availableDrivers.length} online drivers`);

  // Emit Socket.IO event to driver room
  io.to('drivers').to('admins').emit('rideRequested', {
    ...trip,
    candidatesCount: availableDrivers.length
  });

  // Set 15s batch timeout
  if (dispatchTimers.has(trip.id)) clearTimeout(dispatchTimers.get(trip.id));
  const timer = setTimeout(() => {
    if (!tripLocks.get(trip.id)) {
      console.log(`[+58express Dispatcher] Batch 1 timeout for trip [${trip.id}]. Expanding search...`);
      io.to('drivers').to('admins').emit('rideRequested', trip);
    }
  }, 15000);
  dispatchTimers.set(trip.id, timer);
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
    // Broadcast to passengers and admin
    io.emit('driverLocationUpdated', { driverId, lat, lng, heading: heading || 0 });
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
    io.emit('driverLocationUpdated', payload);
    io.emit('admin:driver_location', payload);
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
    const { tripId, driver } = data;

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

    // Update trip and driver status
    const trip = database.trips.find(t => t.id === tripId);
    if (trip) {
      trip.status = 'DRIVER_ASSIGNED';
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

  // Trip Status Transition Event ('ARRIVED', 'IN_PROGRESS', 'COMPLETED')
  socket.on('tripStatusUpdated', (data) => {
    if (!allowSocketRole(socket, 'driver')) return;
    const { tripId, status, driver } = data;
    const trip = database.trips.find(t => t.id === tripId);
    if (trip) {
      trip.status = status;
      persistDatabase();
    }
    io.to(`user:${trip?.passengerId}`).to('drivers').to('admins').emit('tripStatusUpdated', data);
  });

  // Passenger Ride Cancelled Event
  socket.on('rideCancelled', (data) => {
    if (!allowSocketRole(socket, 'passenger')) return;
    const { tripId } = data;
    tripLocks.delete(tripId);
    if (dispatchTimers.has(tripId)) {
      clearTimeout(dispatchTimers.get(tripId));
      dispatchTimers.delete(tripId);
    }
    const trip = database.trips.find(t => t.id === tripId);
    if (trip) {
      trip.status = 'CANCELLED';
      persistDatabase();
    }

    console.log(`[+58express Socket.IO] Ride [${tripId}] cancelled by passenger`);
    io.emit('rideCancelled', { tripId });
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
