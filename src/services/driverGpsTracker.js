import { socketClient } from './socketClient.js';
import { authService } from './authService.js';
import { apiService } from './apiService.js';
import { eventLogger } from '../utils/logger.js';
import { showToast } from '../components/toast.js';

class DriverGpsTracker {
  constructor() {
    this.watchId = null;
    this.isTracking = false;
    this.lastPosition = null;
    this.batteryLevel = null;
    this.activeUser = null;
    this.heartbeatTimer = null;
  }

  async startTracking(user) {
    if (this.isTracking) return;

    this.activeUser = user || authService.getCurrentUser();
    if (!this.activeUser || !this.activeUser.id) {
      showToast('⚠️ Debes estar autenticado para conectarte como conductor', 'danger');
      return false;
    }

    if (!('geolocation' in navigator)) {
      showToast('🚫 Tu dispositivo no soporta geolocalización GPS', 'danger');
      return false;
    }

    // 1. Conectar Socket.IO real con handshake JWT
    const socket = socketClient.connect();

    // 2. Transmitir registro de conductor al socket
    socket.emit('driver:connect', {
      userId: this.activeUser.id,
      status: 'AVAILABLE'
    });

    eventLogger.log('GPS_TRACKER', `Conductor [${this.activeUser.id}] registrando sesión en Socket.IO`);

    // 3. Monitorear nivel de batería si está disponible en la API del navegador
    if (typeof navigator.getBattery === 'function') {
      try {
        const battery = await navigator.getBattery();
        this.batteryLevel = Math.round(battery.level * 100);
        battery.addEventListener('levelchange', () => {
          this.batteryLevel = Math.round(battery.level * 100);
        });
      } catch (err) {
        // Battery API not supported or blocked
      }
    }

    // 4. Iniciar seguimiento continuo de posición GPS HTML5 High Accuracy
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._onPositionSuccess(pos),
      (err) => this._onPositionError(err),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000,
      }
    );

    // 5. Configurar listener de reconexión automática en Socket.IO
    socket.on('connect', () => {
      eventLogger.log('GPS_TRACKER', `Socket.IO reconectado. Re-registrando estado AVAILABLE para [${this.activeUser.id}]`);
      socket.emit('driver:connect', {
        userId: this.activeUser.id,
        status: 'AVAILABLE'
      });
    });

    this.isTracking = true;
    showToast('Transmisión GPS en tiempo real activa en Maracaibo', 'success');
    return true;
  }

  stopTracking() {
    if (this.watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.activeUser && this.activeUser.id) {
      const socket = socketClient.getSocket();
      if (socket) {
        socket.emit('driver:status_change', {
          userId: this.activeUser.id,
          status: 'OFFLINE'
        });
      }
      // Llamada REST opcional de actualización
      apiService.patch('/drivers/status', { status: 'OFFLINE' }).catch(() => {});
      eventLogger.log('GPS_TRACKER', `Conductor [${this.activeUser.id}] cambió a estado OFFLINE`);
    }

    this.isTracking = false;
    this.lastPosition = null;
  }

  _onPositionSuccess(pos) {
    const { latitude, longitude, heading, speed } = pos.coords;
    const now = Date.now();

    const payload = {
      userId: this.activeUser.id,
      latitude,
      longitude,
      heading: heading || 0,
      speed: speed ? Math.round(speed * 3.6) : 0, // Convert m/s to km/h
      batteryLevel: this.batteryLevel,
      timestamp: now,
    };

    this.lastPosition = payload;

    // Reuse the same GPS sample locally so the driver sees the exact vehicle
    // position passengers receive, without starting a second location watcher.
    window.dispatchEvent(new CustomEvent('58express:driver-position', { detail: payload }));

    // Emitir telemetría GPS continua sobre WebSocket real
    const socket = socketClient.getSocket();
    if (socket && socket.connected) {
      socket.emit('driver:location_update', payload);
    }

    // Persistencia asíncrona mediante REST API si la socket no responde
    apiService.patch('/drivers/location', payload).catch(() => {});

    eventLogger.log('GPS_TRACKER', `GPS actualizado: (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) · Vel: ${payload.speed} km/h · Bat: ${this.batteryLevel || 'N/A'}%`);
  }

  _onPositionError(err) {
    eventLogger.log('GPS_TRACKER', `Error de lectura GPS: ${err.message}. Usando coordenadas por defecto en Maracaibo`);
    
    // Fallback a coordenadas del centro de Maracaibo (10.6427, -71.6125)
    const fallbackPayload = {
      userId: this.activeUser?.id || 'd1',
      latitude: 10.6427,
      longitude: -71.6125,
      heading: 0,
      speed: 0,
      batteryLevel: this.batteryLevel,
      timestamp: Date.now(),
    };

    const socket = socketClient.getSocket();
    if (socket && socket.connected) {
      socket.emit('driver:location_update', fallbackPayload);
    }
  }

  getLastPosition() {
    return this.lastPosition;
  }

  getIsTracking() {
    return this.isTracking;
  }
}

export const driverGpsTracker = new DriverGpsTracker();
