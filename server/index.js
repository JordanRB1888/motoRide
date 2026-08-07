import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

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

// In-Memory Database & State Sync Engine (Real-Time Backend Dispatch)
const database = {
  users: [
    {
      id: 'd1',
      role: 'driver',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      phone: '+58 414-000-0004',
      vehicleBrand: 'Bera',
      vehicleModel: 'SBR 150',
      vehiclePlate: 'AC3M49P',
      vehicleColor: 'Negro',
      rating: 4.9,
      totalTrips: 142,
      status: 'AVAILABLE',
      location: { lat: 10.6427, lng: -71.6125, heading: 0, updatedAt: Date.now() }
    },
    {
      id: 'p1',
      role: 'passenger',
      firstName: 'Jordan',
      lastName: 'Pérez',
      phone: '+58 412-123-4567',
      walletBalance: 45.00
    }
  ],
  trips: [],
  notifications: []
};

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

app.post('/api/auth/login', (req, res) => {
  const { phone, role } = req.body;
  let user = database.users.find(u => u.phone === phone || u.role === role);
  if (!user) {
    user = {
      id: 'usr_' + Date.now(),
      phone: phone || '+584140000000',
      role: role || 'passenger',
      firstName: role === 'driver' ? 'Conductor' : 'Pasajero',
      lastName: 'Verificado',
      walletBalance: 25.0
    };
    database.users.push(user);
  }
  res.json({ status: 'success', user, token: 'jwt_token_' + Date.now() });
});

app.get('/api/users', (req, res) => {
  res.json(database.users);
});

app.get('/api/trips', (req, res) => {
  res.json(database.trips);
});

app.post('/api/trips/create', (req, res) => {
  const trip = req.body;
  trip.id = trip.id || 'trip_' + Date.now();
  trip.status = 'SEARCHING';
  trip.createdAt = new Date().toISOString();
  database.trips.push(trip);
  
  // Trigger Dispatch Service
  dispatchTripToDrivers(trip);

  res.json({ status: 'created', trip });
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
  io.to('drivers').emit('rideRequested', {
    ...trip,
    candidatesCount: availableDrivers.length
  });

  // Set 15s batch timeout
  if (dispatchTimers.has(trip.id)) clearTimeout(dispatchTimers.get(trip.id));
  const timer = setTimeout(() => {
    if (!tripLocks.get(trip.id)) {
      console.log(`[+58express Dispatcher] Batch 1 timeout for trip [${trip.id}]. Expanding search...`);
      io.to('drivers').emit('rideRequested', trip);
    }
  }, 15000);
  dispatchTimers.set(trip.id, timer);
}

// Socket.IO Server Setup
io.on('connection', (socket) => {
  console.log(`[+58express Socket.IO] Client connected: ${socket.id}`);

  socket.on('join:room', (room) => {
    socket.join(room);
    console.log(`[+58express Socket.IO] Socket ${socket.id} joined room: ${room}`);
  });

  // Driver GPS Continuous Streaming Event
  socket.on('driver:location', (data) => {
    const { driverId, lat, lng, heading } = data;
    const driver = database.users.find(u => u.id === driverId);
    if (driver) {
      driver.location = { lat, lng, heading: heading || 0, updatedAt: Date.now() };
      driver.status = driver.status || 'AVAILABLE';
    }
    // Broadcast to passengers and admin
    io.emit('driverLocationUpdated', { driverId, lat, lng, heading: heading || 0 });
  });

  // Driver Status Toggle Event ('AVAILABLE' | 'BUSY' | 'OFFLINE')
  socket.on('driver:status', (data) => {
    const { driverId, status } = data;
    const driver = database.users.find(u => u.id === driverId);
    if (driver) {
      driver.status = status;
    }
    io.emit('driverStatusChanged', { driverId, status });
  });

  // Passenger Ride Request Event
  socket.on('rideRequested', (tripData) => {
    console.log(`[+58express Socket.IO] Passenger requested ride [${tripData.id}]`);
    database.trips.push(tripData);
    dispatchTripToDrivers(tripData);
  });

  // Driver Atomic Ride Acceptance Event
  socket.on('rideAccepted', (data) => {
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
    }

    const dUser = database.users.find(u => u.id === driver.id);
    if (dUser) dUser.status = 'BUSY';

    console.log(`[+58express Socket.IO] Atomic lock success! Ride [${tripId}] assigned to ${driver.firstName}`);

    // Broadcast confirmation to ALL clients (Passengers, Drivers, Admin)
    io.emit('tripStatusUpdated', {
      tripId,
      status: 'EN_ROUTE',
      driver
    });
  });

  // Trip Status Transition Event ('ARRIVED', 'IN_PROGRESS', 'COMPLETED')
  socket.on('tripStatusUpdated', (data) => {
    const { tripId, status, driver } = data;
    const trip = database.trips.find(t => t.id === tripId);
    if (trip) {
      trip.status = status;
    }
    io.emit('tripStatusUpdated', data);
  });

  // Passenger Ride Cancelled Event
  socket.on('rideCancelled', (data) => {
    const { tripId } = data;
    tripLocks.delete(tripId);
    if (dispatchTimers.has(tripId)) {
      clearTimeout(dispatchTimers.get(tripId));
      dispatchTimers.delete(tripId);
    }
    const trip = database.trips.find(t => t.id === tripId);
    if (trip) trip.status = 'CANCELLED';

    console.log(`[+58express Socket.IO] Ride [${tripId}] cancelled by passenger`);
    io.emit('rideCancelled', { tripId });
  });

  socket.on('disconnect', () => {
    console.log(`[+58express Socket.IO] Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 [+58express Backend Server] Running on http://localhost:${PORT}`);
});
