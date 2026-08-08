import { syncInsertSupabase, syncUpdateSupabase } from './supabaseClient.js';
import { eventLogger } from '../utils/logger.js';
import { db as localDatabase } from './mockDatabase.js';
import { offlineRequestQueue } from './offlineRequestQueue.js';

class ApiService {
  constructor() {
    const configuredUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
    this.baseUrl = configuredUrl || (typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:4000/api'
      : 'https://motoride-production-4ce4.up.railway.app/api');
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flushOfflineRequests());
      queueMicrotask(() => navigator.onLine && this.flushOfflineRequests());
    }
  }

  getAuthHeaders() {
    try {
      const session = JSON.parse(localStorage.getItem('58express_session') || 'null');
      return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
    } catch {
      return {};
    }
  }

  async get(endpoint) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, { headers: this.getAuthHeaders() });
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
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
      if (endpoint === '/trips/create' && res.status >= 500) this.queueOfflineTrip(endpoint, data);
    } catch (err) {
      eventLogger.warn(`API POST ${endpoint} note:`, err);
      if (endpoint === '/trips/create') {
        this.queueOfflineTrip(endpoint, data);
        return { queued: true, trip: data };
      }
    }
    return null;
  }

  queueOfflineTrip(endpoint, data) {
    offlineRequestQueue.enqueue({
      endpoint,
      data,
      idempotencyKey: data.id || crypto.randomUUID()
    });
  }

  async flushOfflineRequests() {
    return offlineRequestQueue.flush(async request => {
      const res = await fetch(`${this.baseUrl}${request.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': request.idempotencyKey,
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(request.data)
      });
      return res.ok;
    });
  }

  async patch(endpoint, data) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (err) {
      eventLogger.warn(`API PATCH ${endpoint} note:`, err);
    }
    return null;
  }

  async delete(endpoint) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return res.ok;
    } catch (err) {
      eventLogger.warn(`API DELETE ${endpoint} note:`, err);
      return false;
    }
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
export const db = localDatabase;
