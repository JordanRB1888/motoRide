const noop = () => {};

export class NetworkRecoveryController {
  constructor({
    client,
    windowRef = typeof window !== 'undefined' ? window : null,
    navigatorRef = typeof navigator !== 'undefined' ? navigator : null,
    documentRef = typeof document !== 'undefined' ? document : null,
    clock = () => Date.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = timer => clearTimeout(timer),
    cooldownMs = 6000,
    watchdogMs = 12000
  } = {}) {
    this.client = client;
    this.windowRef = windowRef;
    this.navigatorRef = navigatorRef;
    this.documentRef = documentRef;
    this.connectionRef = navigatorRef?.connection || navigatorRef?.mozConnection || navigatorRef?.webkitConnection || null;
    this.clock = clock;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.cooldownMs = cooldownMs;
    this.watchdogMs = watchdogMs;
    this.started = false;
    this.disconnectedAt = null;
    this.lastRecoveryAt = Number.NEGATIVE_INFINITY;
    this.watchdogTimer = null;
    this.watchdogResetDone = false;
    this.recoveryInProgress = false;
    this.handlers = {};
  }

  start() {
    if (this.started || !this.windowRef) return;
    this.started = true;
    this.handlers.online = () => {
      this.client?.logLifecycle?.('network_online');
      this.requestRecovery('network_online', { force: true });
    };
    this.handlers.offline = () => {
      this.client?.logLifecycle?.('network_offline');
      this.client?.publishState?.('OFFLINE', 'network_offline');
    };
    this.handlers.focus = () => this.requestRecovery('window_focus');
    this.handlers.pageshow = () => this.requestRecovery('page_show');
    this.handlers.visibility = () => {
      if (this.documentRef?.visibilityState === 'visible') this.requestRecovery('visibility_visible');
    };
    this.handlers.connection = () => {
      this.client?.logLifecycle?.('network_online', { trigger: 'connection_change' });
      this.requestRecovery('connection_change', { force: true });
    };

    this.windowRef.addEventListener('online', this.handlers.online);
    this.windowRef.addEventListener('offline', this.handlers.offline);
    this.windowRef.addEventListener('focus', this.handlers.focus);
    this.windowRef.addEventListener('pageshow', this.handlers.pageshow);
    this.documentRef?.addEventListener?.('visibilitychange', this.handlers.visibility);
    this.connectionRef?.addEventListener?.('change', this.handlers.connection);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.windowRef?.removeEventListener('online', this.handlers.online);
    this.windowRef?.removeEventListener('offline', this.handlers.offline);
    this.windowRef?.removeEventListener('focus', this.handlers.focus);
    this.windowRef?.removeEventListener('pageshow', this.handlers.pageshow);
    this.documentRef?.removeEventListener?.('visibilitychange', this.handlers.visibility);
    this.connectionRef?.removeEventListener?.('change', this.handlers.connection);
    this._clearWatchdog();
    this.handlers = {};
  }

  socketDisconnected() {
    if (this.disconnectedAt === null) this.disconnectedAt = this.clock();
    if (!this.recoveryInProgress) this.watchdogResetDone = false;
    this._armWatchdog();
  }

  socketConnected() {
    this.disconnectedAt = null;
    this.watchdogResetDone = false;
    this._clearWatchdog();
  }

  restBecameHealthy() {
    if (!this.client?.isConnected?.()) this.requestRecovery('gps_rest_healthy');
  }

  requestRecovery(trigger, { force = false } = {}) {
    if (!this.client?.isAuthenticated?.()) return false;
    if (this.navigatorRef?.onLine === false) {
      this.client.publishState?.('OFFLINE', trigger);
      return false;
    }
    if (this.client.isConnected?.() && !force) return false;

    const now = this.clock();
    if ((now - this.lastRecoveryAt) < this.cooldownMs) return false;

    const disconnectedFor = this.disconnectedAt === null ? 0 : now - this.disconnectedAt;
    const stuck = disconnectedFor >= this.watchdogMs && this.client.isOpeningOrReconnecting?.();
    const hardReset = force || stuck;
    this.lastRecoveryAt = now;
    this.client.publishState?.('RECONNECTING', trigger);
    this.recoveryInProgress = true;
    try {
      this.client.performRecovery?.({ trigger, hardReset });
    } finally {
      this.recoveryInProgress = false;
    }
    if (hardReset) {
      this.watchdogResetDone = true;
      this._clearWatchdog();
    } else {
      this._armWatchdog();
    }
    return true;
  }

  _armWatchdog() {
    if (this.watchdogTimer || this.watchdogResetDone || !this.client?.isAuthenticated?.()) return;
    this.watchdogTimer = this.setTimer(() => {
      this.watchdogTimer = null;
      if (!this.client?.isConnected?.() && this.navigatorRef?.onLine !== false) {
        this.requestRecovery('socket_watchdog', { force: true });
      }
    }, this.watchdogMs);
  }

  _clearWatchdog() {
    if (!this.watchdogTimer) return;
    (this.clearTimer || noop)(this.watchdogTimer);
    this.watchdogTimer = null;
  }
}
