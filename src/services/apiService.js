import { eventLogger } from '../utils/logger.js';
import { db as clientCache } from './clientCache.js';
import { offlineRequestQueue } from './offlineRequestQueue.js';
import { composeApiUrl, normalizeBaseUrl } from './apiUrl.js';

class ApiService {
  constructor() {
    const configuredUrl = normalizeBaseUrl(import.meta.env.VITE_API_URL || '') || null;
    this.baseUrl = configuredUrl || (typeof window !== 'undefined' && ['localhost','127.0.0.1'].includes(window.location.hostname)
      ? 'http://localhost:4000/api'
      : 'https://motoride-production-4ce4.up.railway.app/api');
    this.lastError = null;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flushOfflineRequests());
      queueMicrotask(() => navigator.onLine && this.flushOfflineRequests());
    }
  }

  getAuthHeaders() {
    try {
      const session = JSON.parse(localStorage.getItem('58express_session') || 'null');
      return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
    } catch { return {}; }
  }

  async request(endpoint, { method = 'GET', body = null } = {}) {
    try {
      const isFormData = body instanceof FormData;
      const response = await fetch(this.resolveUrl(endpoint), {
        method,
        headers: { ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...this.getAuthHeaders() },
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (response.ok) {
        this.lastError = null;
        return payload ?? true;
      }
      this.lastError = { status: response.status, ...(payload || { error: 'REQUEST_FAILED' }) };
      return null;
    } catch (error) {
      this.lastError = { status: 0, error: 'NETWORK_ERROR' };
      eventLogger.warn(`API ${method} ${endpoint}:`, error);
      return null;
    }
  }

  get(endpoint) { return this.request(endpoint); }
  // Punto unico de composicion: ninguna pantalla concatena por su cuenta.
  resolveUrl(endpoint) { return composeApiUrl(this.baseUrl, endpoint); }
  post(endpoint, data) { return this.request(endpoint, { method: 'POST', body: data }); }
  postForm(endpoint, formData) { return this.post(endpoint, formData); }
  patch(endpoint, data) { return this.request(endpoint, { method: 'PATCH', body: data }); }
  putForm(endpoint, formData) { return this.request(endpoint, { method: 'PUT', body: formData }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }

  async getPrivateFileUrl(endpoint) {
    try {
      // Sin normalizar, `/api/users/:id/photo` sobre una base que ya termina
      // en `/api` produciria `/api/api/users/...` y la peticion fallaria.
      const response = await fetch(this.resolveUrl(endpoint), { headers: this.getAuthHeaders() });
      if (!response.ok) return null;
      return URL.createObjectURL(await response.blob());
    } catch { return null; }
  }

  queueOfflineTrip(endpoint, data) {
    offlineRequestQueue.enqueue({ endpoint, data, idempotencyKey: data.id || crypto.randomUUID() });
  }

  async flushOfflineRequests() {
    return offlineRequestQueue.flush(async request => {
      const response = await fetch(`${this.baseUrl}${request.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': request.idempotencyKey, ...this.getAuthHeaders() },
        body: JSON.stringify(request.data)
      });
      return response.ok;
    });
  }

  async createTrip(data) {
    const result = await this.post('/trips/create', data);
    if (result) return result;
    if (this.lastError?.status >= 500 || this.lastError?.error === 'NETWORK_ERROR') {
      this.queueOfflineTrip('/trips/create', data);
      return { queued: true, trip: data };
    }
    return null;
  }
}

export const apiService = new ApiService();
export const db = clientCache;
