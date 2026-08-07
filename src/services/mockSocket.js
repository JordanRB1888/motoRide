class MockSocket {
  constructor() {
    this.listeners = new Map();
    this.lastProcessedTripId = null;
    this.lastTripTimestamp = 0;
    
    // Channel 1: Native BroadcastChannel (Same Device Cross-Tab)
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('motoRide_socket_channel');
        this.channel.onmessage = (event) => {
          const { eventName, data } = event.data || {};
          this.triggerLocalListeners(eventName, data);
        };
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    // Channel 2: LocalStorage Sync Fallback (Same Device Cross-Tab)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'motoRide_socket_event' && e.newValue) {
          try {
            const { eventName, data } = JSON.parse(e.newValue);
            this.triggerLocalListeners(eventName, data);
          } catch (err) {
            console.error('Storage sync parse error:', err);
          }
        }
      });
    }

    // Channel 3: Global Public Cloud WebSocket Relay (Real Cross-Device Internet Communication)
    if (typeof window !== 'undefined') {
      this.cloudEndpoints = [
        'wss://free.piesocket.com/v3/channel_58express_maracaibo_v4?api_key=VCXSpRKYA3ipZaWosD20aThKuAfiG5xJuZzpKAzi&notify_self=0',
        'wss://socketsbay.com/wss/v2/1/58express_maracaibo_channel_v4/'
      ];
      this.currentEndpointIndex = 0;
      this._connectCloudRelay();
      this._startCloudPolling();
    }
  }

  _connectCloudRelay() {
    if (!this.cloudEndpoints || this.cloudEndpoints.length === 0) return;
    const url = this.cloudEndpoints[this.currentEndpointIndex];

    try {
      this.cloudWs = new WebSocket(url);

      this.cloudWs.onopen = () => {
        console.log('[+58express Cloud Relay] 🌐 Conectado exitosamente a la Red Global WebSocket');
      };

      this.cloudWs.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const { eventName, data } = parsed || {};
          if (eventName) {
            this.triggerLocalListeners(eventName, data);
          }
        } catch (err) {
          // Ignore non-JSON messages
        }
      };

      this.cloudWs.onerror = (err) => {
        console.warn('[+58express Cloud Relay] Connection note:', err);
      };

      this.cloudWs.onclose = () => {
        setTimeout(() => {
          this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.cloudEndpoints.length;
          this._connectCloudRelay();
        }, 3000);
      };
    } catch (e) {
      console.warn('[+58express Cloud Relay] Socket init note:', e);
    }
  }

  // Channel 4: Real-Time Cloud Polling (Guarantees delivery across mobile networks for ALL ride events)
  _startCloudPolling() {
    this.lastProcessedEventTime = Date.now();
    setInterval(async () => {
      try {
        const res = await fetch('https://kvdb.io/4tW3qDkL2Y8zM5n/58express_cloud_event_v5', { cache: 'no-store' });
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData && cloudData.eventName && cloudData.timestamp > this.lastProcessedEventTime) {
            this.lastProcessedEventTime = cloudData.timestamp;
            this.triggerLocalListeners(cloudData.eventName, cloudData.data);
          }
        }
      } catch (err) {
        // Silent catch for network polling
      }
    }, 1500);
  }

  async _publishToCloud(eventName, data) {
    const payload = {
      eventName,
      data,
      timestamp: Date.now()
    };
    this.lastProcessedEventTime = payload.timestamp;
    try {
      await fetch('https://kvdb.io/4tW3qDkL2Y8zM5n/58express_cloud_event_v5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Cloud publish info:', err);
    }
  }

  triggerLocalListeners(eventName, data) {
    if (!eventName || !this.listeners.has(eventName)) return;
    this.listeners.get(eventName).forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`[MockSocket] Error in listener for ${eventName}:`, err);
      }
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event).filter(cb => cb !== callback);
    if (callbacks.length === 0) {
      this.listeners.delete(event);
    } else {
      this.listeners.set(event, callbacks);
    }
  }

  emit(event, data) {
    // 1. Local tab listeners
    this.triggerLocalListeners(event, data);

    // 2. BroadcastChannel cross-tab
    if (this.channel) {
      try {
        this.channel.postMessage({ eventName: event, data });
      } catch (err) {
        console.error('Broadcast post error:', err);
      }
    }

    // 3. Storage event cross-tab fallback
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('motoRide_socket_event', JSON.stringify({
          eventName: event,
          data,
          _t: Date.now() + Math.random()
        }));
      } catch (err) {
        console.error('Storage set error:', err);
      }
    }

    // 4. Global Cloud WebSocket Relay (Transmits over Internet to other phones)
    if (this.cloudWs && this.cloudWs.readyState === WebSocket.OPEN) {
      try {
        this.cloudWs.send(JSON.stringify({ eventName: event, data }));
      } catch (err) {
        console.error('[+58express Cloud Relay] Send error:', err);
      }
    }

    // 5. Cloud KV Store Publish
    this._publishToCloud(event, data);
  }

  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const socket = new MockSocket();
export default MockSocket;
