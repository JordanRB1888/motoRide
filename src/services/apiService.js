import { syncInsertSupabase, syncUpdateSupabase } from './supabaseClient.js';
import { eventLogger } from '../utils/logger.js';

class ApiService {
  constructor() {
    this.baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
      ? 'http://localhost:4000/api' 
      : '/api';
  }

  async get(endpoint) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`);
      if (res.ok) return await res.json();
    } catch (err) {
      eventLogger.warn(`API GET ${endpoint} note:`, err);
    }
    return null;
  }

  async post(endpoint, data) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (err) {
      eventLogger.warn(`API POST ${endpoint} note:`, err);
    }
    return null;
  }

  /**
   * Supabase Cloud Real-Time Persistence Methods
   */
  async syncTripToSupabase(trip) {
    try {
      await syncInsertSupabase('trips', {
        id: trip.id,
        passenger_id: trip.passengerId,
        driver_id: trip.driverId,
        origin: trip.pickup?.address || 'Basílica de Chiquinquirá',
        destination: trip.destination?.address || 'Maracaibo',
        fare_usd: trip.fareEUR || trip.fareUSD || 4.50,
        status: trip.status || 'SEARCHING',
        created_at: new Date().toISOString()
      });
    } catch (err) {
      // Graceful fallback
    }
  }
}

export const apiService = new ApiService();
export const db = {
  query: (collection, filter) => {
    // Adapter for UI compatibility
    return [
      {
        id: 'd1',
        role: 'driver',
        firstName: 'Carlos',
        lastName: 'Mendoza',
        phone: '+58 414-000-0004',
        vehicleBrand: 'Bera',
        vehicleModel: 'SBR 150',
        vehiclePlate: 'AC3M49P',
        rating: 4.9,
        totalTrips: 142,
        location: { lat: 10.6427, lng: -71.6125 }
      }
    ];
  },
  getCollection: () => [],
  insert: (col, data) => data,
  update: (col, id, patch) => patch
};
