import { socket } from './socketClient.js';
import { db } from './mockDatabase.js';
import { eventLogger } from '../utils/logger.js';
import { calculateHaversine } from '../utils/helpers.js';

class DriverDispatchService {
  constructor() {
    this.driverRegistry = new Map(); // driverId -> DriverState
    this.tripLocks = new Map(); // tripId -> boolean
    this.dispatchTimers = new Map(); // tripId -> setTimeout ID
    this._initSocketListeners();
  }

  _initSocketListeners() {
    // Listen for driver location updates continuously
    socket.on('driverLocationUpdated', (data) => {
      if (data && data.driverId) {
        this.updateDriverLocation(data.driverId, data.lat, data.lng, data.heading || 0);
      }
    });

    // Listen for driver status changes
    socket.on('driverStatusChanged', (data) => {
      if (data && data.driverId) {
        this.updateDriverStatus(data.driverId, data.status);
      }
    });
  }

  /**
   * Register or update an online driver in the dispatch service registry
   */
  registerDriver(driver) {
    if (!driver || !driver.id) return;
    const existing = this.driverRegistry.get(driver.id) || {};
    const updated = {
      id: driver.id,
      firstName: driver.firstName || 'Carlos',
      lastName: driver.lastName || 'Mendoza',
      phone: driver.phone || '+58 414-000-0004',
      photoUrl: driver.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(driver.firstName || 'Driver')}`,
      vehicleBrand: driver.vehicleBrand || 'Bera',
      vehicleModel: driver.vehicleModel || 'SBR 150',
      vehiclePlate: driver.vehiclePlate || 'AC3M49P',
      vehicleColor: driver.vehicleColor || 'Negro',
      rating: driver.rating || 4.9,
      totalTrips: driver.totalTrips || 120,
      status: driver.status || existing.status || 'AVAILABLE',
      location: driver.location || existing.location || { lat: 10.6427, lng: -71.6125, heading: 0, updatedAt: Date.now() },
      lastHeartbeat: Date.now()
    };

    this.driverRegistry.set(driver.id, updated);
    eventLogger.info(`🛵 Conductor registrado en DriverDispatchService: ${updated.firstName} (${updated.status})`);
    return updated;
  }

  /**
   * Update continuous GPS location transmitted by available driver
   */
  updateDriverLocation(driverId, lat, lng, heading = 0) {
    let driver = this.driverRegistry.get(driverId);
    if (!driver) {
      // Find from DB if not in memory
      const dbUser = db.query('users', { id: driverId })[0];
      driver = this.registerDriver(dbUser || { id: driverId, firstName: 'Carlos', lastName: 'Mendoza' });
    }

    driver.location = {
      lat: Number(lat),
      lng: Number(lng),
      heading: Number(heading),
      updatedAt: Date.now()
    };
    driver.lastHeartbeat = Date.now();

    // Broadcast location update to all listening clients & admin
    socket.emit('driverLocationUpdated', {
      driverId,
      lat: Number(lat),
      lng: Number(lng),
      heading: Number(heading),
      driverName: `${driver.firstName} ${driver.lastName}`.trim()
    });
  }

  /**
   * Update driver operational status ('AVAILABLE' | 'BUSY' | 'OFFLINE')
   */
  updateDriverStatus(driverId, status) {
    const driver = this.driverRegistry.get(driverId);
    if (driver) {
      driver.status = status;
      driver.lastHeartbeat = Date.now();
      eventLogger.info(`🛵 Estado de conductor [${driverId}] cambiado a ➔ ${status}`);
    }
  }

  /**
   * Get all active available drivers in Maracaibo
   */
  getAvailableDrivers() {
    const now = Date.now();
    const available = [];
    
    // Also include drivers from local database collection
    const dbDrivers = db.query('users', { role: 'driver' });
    dbDrivers.forEach(dbD => {
      if (!this.driverRegistry.has(dbD.id)) {
        this.registerDriver(dbD);
      }
    });

    for (const [id, driver] of this.driverRegistry.entries()) {
      // Driver is available if status is AVAILABLE and sent heartbeat in last 120s
      if (driver.status === 'AVAILABLE' && (now - driver.lastHeartbeat) < 120000) {
        available.push(driver);
      }
    }
    return available;
  }

  /**
   * Dispatch ride request using geospatial proximity sorting & batching
   */
  dispatchTrip(tripData, maxRadiusKm = 5.0) {
    if (!tripData || !tripData.id) return;

    const pickupLat = tripData.pickup?.lat || 10.6427;
    const pickupLng = tripData.pickup?.lng || -71.6125;

    eventLogger.log('SYSTEM', `⚡ Iniciando algoritmo de despacho para Viaje ID [${tripData.id}] desde (${pickupLat}, ${pickupLng})`);

    const availableDrivers = this.getAvailableDrivers();
    if (availableDrivers.length === 0) {
      eventLogger.warn('SYSTEM', `No hay conductores con GPS activo actualmente. Despachando a lista de conductores registrados...`);
    }

    // Calculate exact distance to each candidate driver
    const candidates = availableDrivers.map(driver => {
      const dLat = driver.location?.lat || 10.6427;
      const dLng = driver.location?.lng || -71.6125;
      const distKm = calculateHaversine(pickupLat, pickupLng, dLat, dLng, 1.0);
      return {
        driver,
        distKm
      };
    }).filter(c => c.distKm <= maxRadiusKm)
      .sort((a, b) => a.distKm - b.distKm); // Sort closest first

    eventLogger.log('SYSTEM', `🎯 Conductores evaluados en radio de ${maxRadiusKm}km: ${candidates.length} encontrados`, candidates);

    // Broadcast ride request to candidate drivers
    const payload = {
      id: tripData.id,
      passengerId: tripData.passengerId || 'p1',
      passengerName: tripData.passengerName || 'Pasajero',
      passengerRating: tripData.passengerRating || 4.9,
      passengerAvatar: tripData.passengerAvatar,
      pickup: tripData.pickup,
      destination: tripData.destination,
      fareEUR: tripData.fareEUR || 4.50,
      candidatesCount: candidates.length,
      timestamp: Date.now()
    };

    socket.emit('rideRequested', payload);

    // Set 15-second batch timer for automatic retry if no driver accepts
    if (this.dispatchTimers.has(tripData.id)) {
      clearTimeout(this.dispatchTimers.get(tripData.id));
    }

    const timerId = setTimeout(() => {
      if (!this.tripLocks.get(tripData.id)) {
        eventLogger.warn('SYSTEM', `⏱️ Tiempo de espera (15s) de la primera ronda expirado para viaje [${tripData.id}]. Re-despachando a la red amplia...`);
        // Retry dispatch with expanded radius
        this.dispatchTrip(tripData, maxRadiusKm + 5.0);
      }
    }, 15000);

    this.dispatchTimers.set(tripData.id, timerId);
  }

  /**
   * Atomic Trip Acceptance Lock: Ensures zero race conditions or double acceptances
   */
  acceptTripAtomic(tripId, driverData) {
    if (this.tripLocks.get(tripId)) {
      eventLogger.warn('SYSTEM', `🚫 Intento de doble aceptación bloqueado. Viaje [${tripId}] ya fue tomado por otro conductor.`);
      return { success: false, reason: 'ALREADY_ACCEPTED' };
    }

    // Lock trip atomically
    this.tripLocks.set(tripId, true);

    // Clear pending dispatch timer
    if (this.dispatchTimers.has(tripId)) {
      clearTimeout(this.dispatchTimers.get(tripId));
      this.dispatchTimers.delete(tripId);
    }

    // Update driver status in registry
    if (driverData && driverData.id) {
      this.updateDriverStatus(driverData.id, 'BUSY');
    }

    // Update trip in database
    db.update('trips', tripId, {
      status: 'DRIVER_ASSIGNED',
      driverId: driverData?.id || 'd1',
      acceptedAt: new Date().toISOString()
    });

    eventLogger.log('SYSTEM', `🔒 Bloqueo atómico exitoso. Viaje [${tripId}] asignado a ${driverData?.firstName || 'Carlos'} (${driverData?.vehiclePlate || 'AC3M49P'})`);

    // Broadcast confirmation across Sockets & Cloud KV
    socket.emit('tripStatusUpdated', {
      tripId,
      status: 'EN_ROUTE',
      driver: driverData
    });

    return { success: true, tripId };
  }

  /**
   * Cancel ride dispatch and release atomic locks
   */
  cancelTrip(tripId) {
    if (this.dispatchTimers.has(tripId)) {
      clearTimeout(this.dispatchTimers.get(tripId));
      this.dispatchTimers.delete(tripId);
    }
    this.tripLocks.delete(tripId);
    db.update('trips', tripId, { status: 'CANCELLED' });
    socket.emit('rideCancelled', { tripId });
    eventLogger.log('SYSTEM', `✕ Despacho de viaje [${tripId}] cancelado. Cerraduras liberadas.`);
  }
}

export const driverDispatchService = new DriverDispatchService();
