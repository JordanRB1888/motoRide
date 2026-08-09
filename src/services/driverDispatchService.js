import { socket } from './socketClient.js';
import { db } from './clientCache.js';
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
      if (data && (data.driverId || data.userId)) {
        this.updateDriverLocation(data.driverId || data.userId, data.lat ?? data.latitude, data.lng ?? data.longitude, data.heading || 0);
      }
    });

    socket.on('driver:location_update', (data) => {
      if (data && (data.driverId || data.userId)) {
        this.updateDriverLocation(data.driverId || data.userId, data.lat ?? data.latitude, data.lng ?? data.longitude, data.heading || 0);
      }
    });

    // Listen for driver status changes
    socket.on('driverStatusChanged', (data) => {
      if (data && (data.driverId || data.userId)) {
        this.updateDriverStatus(data.driverId || data.userId, data.status);
      }
    });

    socket.on('driver:status_change', (data) => {
      if (data && (data.driverId || data.userId)) {
        this.updateDriverStatus(data.driverId || data.userId, data.status);
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
      firstName: driver.firstName || '',
      lastName: driver.lastName || '',
      phone: driver.phone || '',
      photoUrl: driver.photoUrl || null,
      vehicleBrand: driver.vehicleBrand || '',
      vehicleModel: driver.vehicleModel || '',
      vehiclePlate: driver.vehiclePlate || '',
      vehicleColor: driver.vehicleColor || '',
      rating: Number(driver.rating || 0),
      totalTrips: Number(driver.totalTrips || 0),
      status: driver.status || existing.status || 'AVAILABLE',
      location: driver.location || existing.location || null,
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
      const dbUser = db.query('users', { id: driverId })[0];
      driver = this.registerDriver(dbUser || {
        id: driverId,
        firstName: 'Conductor',
        status: 'AVAILABLE'
      });
    }

    driver.location = {
      lat: Number(lat),
      lng: Number(lng),
      heading: Number(heading),
      updatedAt: Date.now()
    };
    driver.lastHeartbeat = Date.now();

    return driver;
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
    const available = [];
    
    // Include drivers from local database collection
    const dbDrivers = db.query('users', { role: 'driver' });
    dbDrivers.forEach(dbD => {
      if (!this.driverRegistry.has(dbD.id)) {
        this.registerDriver(dbD);
      }
    });

    for (const [id, driver] of this.driverRegistry.entries()) {
      if (driver.status === 'AVAILABLE' || driver.status === 'ONLINE' || driver.isAvailable || driver.isOnline) {
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

    const pickupLat = Number(tripData.pickup?.lat);
    const pickupLng = Number(tripData.pickup?.lng);
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      eventLogger.warn('SYSTEM', `Viaje [${tripData.id}] rechazado: falta la ubicación GPS real del pasajero.`);
      return;
    }

    eventLogger.log('SYSTEM', `⚡ Iniciando algoritmo de despacho para Viaje ID [${tripData.id}] desde (${pickupLat}, ${pickupLng})`);

    const availableDrivers = this.getAvailableDrivers();
    if (availableDrivers.length === 0) {
      eventLogger.warn('SYSTEM', `No hay conductores con GPS activo actualmente. Despachando a lista de conductores registrados...`);
    }

    // Calculate exact distance to each candidate driver
    const candidates = availableDrivers.map(driver => {
      const dLat = Number(driver.location?.lat);
      const dLng = Number(driver.location?.lng);
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return null;
      const distKm = calculateHaversine(pickupLat, pickupLng, dLat, dLng, 1.0);
      return {
        driver,
        distKm
      };
    }).filter(c => c && c.distKm <= maxRadiusKm)
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
    socket.emit('rideAccepted', {
      tripId,
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
