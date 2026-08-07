import { db } from './mockDatabase.js';
import { socket } from './mockSocket.js';
import { fareCalculator } from './fareCalculator.js';
import { paymentService } from './mockPayment.js';

// Fallback constants in case they don't exist
const TRIP_STATES = {
  DRAFT: 'DRAFT',
  SEARCHING: 'SEARCHING',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  DRIVER_EN_ROUTE: 'DRIVER_EN_ROUTE',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  IN_TRIP: 'IN_TRIP',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

const SEARCH_RADIUS_KM = 5.0;

class TripEngine {
  async createTrip(passengerId, origin, destination, paymentMethod) {
    const estimate = await fareCalculator.estimateFare(origin.lat, origin.lng, destination.lat, destination.lng);
    
    const trip = {
      passengerId,
      driverId: null,
      status: TRIP_STATES.DRAFT,
      origin,
      destination,
      paymentMethod,
      estimate,
      routeGeometry: estimate.geometry,
      finalFare: estimate.fareUSD, // can be updated later
      createdAt: new Date().toISOString()
    };

    const savedTrip = db.insert('trips', trip);
    this._emit(savedTrip.id, 'trip_created', savedTrip);
    return savedTrip;
  }

  searchDriver(tripId) {
    const trip = this.getTripById(tripId);
    if (!trip || trip.status !== TRIP_STATES.DRAFT) return false;
    
    trip.status = TRIP_STATES.SEARCHING;
    db.update('trips', tripId, { status: TRIP_STATES.SEARCHING });
    this._emit(tripId, 'state_changed', trip);
    return true;
  }

  async acceptTrip(tripId, driverId) {
    const trip = this.getTripById(tripId);
    if (!trip) return false;

    trip.driverId = driverId;
    trip.status = TRIP_STATES.DRIVER_EN_ROUTE;
    db.update('trips', tripId, { driverId, status: trip.status });
    this._emit(tripId, 'state_changed', trip);
    return true;
  }

  driverArrived(tripId) {
    const trip = this.getTripById(tripId);
    if (!trip || trip.status !== TRIP_STATES.DRIVER_EN_ROUTE) return false;

    trip.status = TRIP_STATES.DRIVER_ARRIVED;
    db.update('trips', tripId, { status: trip.status });
    this._emit(tripId, 'driver_arrived', trip);
    this._emit(tripId, 'state_changed', trip);
    return true;
  }

  startTrip(tripId) {
    const trip = this.getTripById(tripId);
    if (!trip || trip.status !== TRIP_STATES.DRIVER_ARRIVED) return false;

    trip.status = TRIP_STATES.IN_TRIP;
    trip.startTime = new Date().toISOString();
    db.update('trips', tripId, { status: trip.status, startTime: trip.startTime });
    this._emit(tripId, 'state_changed', trip);
    return true;
  }

  completeTrip(tripId) {
    const trip = this.getTripById(tripId);
    if (!trip || trip.status !== TRIP_STATES.IN_TRIP) return false;

    trip.status = TRIP_STATES.COMPLETED;
    trip.endTime = new Date().toISOString();
    db.update('trips', tripId, { status: trip.status, endTime: trip.endTime });
    
    // Process Payment
    paymentService.processPayment(trip.id, trip.passengerId, trip.finalFare, trip.paymentMethod);
    paymentService.processDriverPayout(trip.id, trip.driverId, trip.finalFare);

    this._emit(tripId, 'state_changed', trip);
    this._emit(tripId, 'completed', trip);
    return true;
  }

  cancelTrip(tripId, reason) {
    const trip = this.getTripById(tripId);
    if (!trip) return false;

    trip.status = TRIP_STATES.CANCELLED;
    trip.cancelReason = reason;
    db.update('trips', tripId, { status: trip.status, cancelReason: reason });
    
    this._emit(tripId, 'state_changed', trip);
    this._emit(tripId, 'cancelled', trip);
    return true;
  }

  rateTrip(tripId, rating, comment) {
    return db.update('trips', tripId, { rating, comment });
  }

  getTripById(tripId) {
    return db.findById('trips', tripId);
  }

  getActiveTrip(userId, role) {
    const activeStates = [TRIP_STATES.SEARCHING, TRIP_STATES.DRIVER_ASSIGNED, TRIP_STATES.DRIVER_EN_ROUTE, TRIP_STATES.DRIVER_ARRIVED, TRIP_STATES.IN_TRIP];
    return db.getCollection('trips').find(t => 
      (role === 'passenger' ? t.passengerId === userId : t.driverId === userId) && 
      activeStates.includes(t.status)
    );
  }

  getTripHistory(userId, role) {
    const pastStates = [TRIP_STATES.COMPLETED, TRIP_STATES.CANCELLED];
    return db.getCollection('trips').filter(t => 
      (role === 'passenger' ? t.passengerId === userId : t.driverId === userId) && 
      pastStates.includes(t.status)
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  _emit(tripId, event, data) {
    socket.emit(`trip:${event}`, data);
    socket.emit(`trip:${tripId}:${event}`, data);
  }
}

export const tripEngine = new TripEngine();
