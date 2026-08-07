import { io } from 'socket.io-client';
import { eventLogger } from '../utils/logger.js';

class RealSocketClient {
  constructor() {
    const serverUrl = typeof window !== 'undefined' 
      ? (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin)
      : 'http://localhost:4000';

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this._setupListeners();
  }

  _setupListeners() {
    this.socket.on('connect', () => {
      eventLogger.info(`⚡ [Socket.IO Client] Conectado al Servidor Backend Real ID: ${this.socket.id}`);
    });

    this.socket.on('disconnect', (reason) => {
      eventLogger.warn(`⚠️ [Socket.IO Client] Desconectado del Backend. Razón: ${reason}`);
    });

    this.socket.on('connect_error', (err) => {
      // Fallback auto-reconnect note
    });
  }

  joinRoom(room) {
    this.socket.emit('join:room', room);
  }

  on(eventName, callback) {
    this.socket.on(eventName, callback);
  }

  off(eventName, callback) {
    this.socket.off(eventName, callback);
  }

  emit(eventName, data) {
    eventLogger.log('SYSTEM', `[Socket.IO Emit] ➔ ${eventName}`, data);
    this.socket.emit(eventName, data);
  }
}

export const socketClient = new RealSocketClient();
export const socket = socketClient; // Backward compatibility alias
export default socketClient;
