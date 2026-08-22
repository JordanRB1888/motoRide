import { io } from 'socket.io-client';
import { eventLogger } from '../utils/logger.js';
import { NetworkRecoveryController } from './networkRecoveryController.js';

class RealSocketClient {
  constructor() {
    this.listeners = new Map(); // eventName -> Set of callbacks
    this.processedMessageIds = new Set();
    this.socketHandlers = new Map();
    this.pendingRooms = new Set();
    this.connectionState = 'OFFLINE';

    // 1. Setup BroadcastChannel for 0ms cross-tab real-time sync
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('58express_dispatch_channel');
      this.channel.onmessage = (event) => {
        if (event.data && event.data.eventName) {
          const { eventName, data, msgId } = event.data;
          if (msgId && this.processedMessageIds.has(msgId)) return;
          if (msgId) {
            this.processedMessageIds.add(msgId);
            if (this.processedMessageIds.size > 200) {
              const firstKey = this.processedMessageIds.values().next().value;
              this.processedMessageIds.delete(firstKey);
            }
          }
          this._triggerLocalListeners(eventName, data);
        }
      };
    }

    // 2. Setup Storage Event Listener fallback for cross-window sync
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('58express_evt_') && e.newValue) {
          try {
            const eventName = e.key.replace('58express_evt_', '');
            const parsed = JSON.parse(e.newValue);
            if (parsed && parsed.msgId && this.processedMessageIds.has(parsed.msgId)) return;
            if (parsed && parsed.msgId) {
              this.processedMessageIds.add(parsed.msgId);
            }
            this._triggerLocalListeners(eventName, parsed.data);
          } catch (err) {}
        }
      });
    }

    // 3. Setup Socket.IO client for backend server communication
    const configuredSocketUrl = import.meta.env?.VITE_SOCKET_URL?.replace(/\/$/, '');
    const serverUrl = typeof window !== 'undefined' 
      ? (configuredSocketUrl || (['localhost','127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000' : 'https://motoride-production-4ce4.up.railway.app'))
      : 'http://localhost:4000';

    let savedToken = null;
    try {
      const savedSession = JSON.parse(localStorage.getItem('58express_session') || 'null');
      savedToken = savedSession?.token || null;
    } catch {}

    try {
      this.socket = io(serverUrl, {
        auth: savedToken ? { token: savedToken } : {},
        autoConnect: Boolean(savedToken),
        transports: ['websocket', 'polling'],
        reconnection: true,
        // En redes móviles la conexión puede perderse durante más de cinco
        // intentos aunque el GPS por REST siga funcionando. Un conductor que
        // eligió estar en línea no debe quedar fuera del registro de despacho
        // silenciosamente por agotar un presupuesto finito de reconexiones.
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        timeout: 5000
      });
      this._setupSocketListeners();
      this.networkRecovery = new NetworkRecoveryController({ client: this });
      this.networkRecovery.start();
    } catch (err) {
      console.warn('[SocketClient] Socket.IO connection warning:', err);
    }
  }

  _setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.networkRecovery?.socketConnected();
      this.pendingRooms.forEach(room => this.socket.emit('join:room', room));
      this.logLifecycle('socket_reconnect_success');
      this.publishState('RECONNECTING', 'socket_connected');
      eventLogger.info(`⚡ [Socket.IO Client] Conectado al Servidor Backend Real ID: ${this.socket.id}`);
    });

    this.socket.on('disconnect', (reason) => {
      this.networkRecovery?.socketDisconnected();
      this.logLifecycle('socket_disconnect', { reason });
      this.publishState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RECONNECTING', reason);
      eventLogger.warn(`⚠️ [Socket.IO Client] Desconectado del Backend. Razón: ${reason}`);
    });

    this.socket.on('connect_error', () => {
      this.networkRecovery?.socketDisconnected();
      this.logLifecycle('socket_reconnect_failed');
    });

    this.socket.io.on('reconnect_attempt', () => this.logLifecycle('socket_reconnect_start'));
  }

  _triggerLocalListeners(eventName, data) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[SocketClient] Error in listener callback for ${eventName}:`, err);
        }
      });
    }
  }

  joinRoom(room) {
    this.pendingRooms.add(room);
    if (this.socket && this.socket.connected) {
      this.socket.emit('join:room', room);
    }
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);

    if (this.socket && !this.socketHandlers.has(eventName)) {
      const handler = (data) => this._triggerLocalListeners(eventName, data);
      this.socketHandlers.set(eventName, handler);
      this.socket.on(eventName, handler);
    }
  }

  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
    }
    if (this.socket && callbacks && callbacks.size === 0) {
      const handler = this.socketHandlers.get(eventName);
      if (handler) this.socket.off(eventName, handler);
      this.socketHandlers.delete(eventName);
    }
  }

  emit(eventName, data) {
    const msgId = `${eventName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.processedMessageIds.add(msgId);

    eventLogger.log('SYSTEM', `[RealTime Broadcast Emit] ➔ ${eventName}`, data);

    // 1. Emit to Socket.IO backend server
    if (this.socket && this.socket.connected) {
      this.socket.emit(eventName, data);
    }

    // 2. Broadcast across all open browser tabs (BroadcastChannel)
    if (this.channel) {
      this.channel.postMessage({ eventName, data, msgId });
    }

    // 3. Persist storage event for multi-tab fallback
    try {
      localStorage.setItem(`58express_evt_${eventName}`, JSON.stringify({ data, msgId, timestamp: Date.now() }));
    } catch (err) {}

    // 4. Trigger listeners in current window context
    this._triggerLocalListeners(eventName, data);
  }

  getSocket() {
    return this.socket;
  }

  connect() {
    if (this.socket && !this.socket.connected && this.socket.auth?.token) {
      this.networkRecovery?.requestRecovery('explicit_connect');
    }
    return this.socket;
  }

  isAuthenticated() {
    return Boolean(this.socket?.auth?.token);
  }

  isConnected() {
    return Boolean(this.socket?.connected);
  }

  isOpeningOrReconnecting() {
    const managerState = this.socket?.io?._readyState;
    const engineState = this.socket?.io?.engine?.readyState;
    return ['opening', 'open'].includes(managerState) || ['opening', 'open'].includes(engineState) || Boolean(this.socket?.io?._reconnecting);
  }

  performRecovery({ trigger, hardReset = false } = {}) {
    if (!this.socket || !this.isAuthenticated()) return false;
    this.logLifecycle('socket_reconnect_start', { trigger, hardReset });
    if (hardReset) {
      this.logLifecycle('socket_watchdog_reset', { trigger });
      // Conserva la misma instancia y todos sus listeners, pero descarta el
      // Manager/Engine asociado a la interfaz de red anterior.
      this.socket.disconnect();
    }
    this.socket.connect();
    return true;
  }

  notifyRestHealthy() {
    this.networkRecovery?.restBecameHealthy();
  }

  publishState(state, trigger) {
    this.connectionState = state;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('58express:socket-state', { detail: { state, trigger } }));
    }
  }

  logLifecycle(event, details = null) {
    eventLogger.info(`[Realtime] ${event}`, details);
  }

  authenticate(token) {
    if (!this.socket || !token) return;
    this.socket.auth = { token };
    if (this.socket.connected) this.socket.disconnect();
    this.socket.connect();
  }

  clearAuthentication() {
    if (!this.socket) return;
    this.socket.disconnect();
    this.socket.auth = {};
    this.publishState('OFFLINE', 'authentication_cleared');
  }
}

export const socketClient = new RealSocketClient();
export const socket = socketClient; // Backward compatibility alias
export default socketClient;
