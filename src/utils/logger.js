/**
 * Structured Real-Time Event Logger for +58express
 */
export const eventLogger = {
  log(role, message, details = null) {
    const timestamp = new Date().toLocaleTimeString('es-VE', { hour12: false });
    const roleIcon = role === 'PASSENGER' ? '📱 [PASAJERO]' : role === 'DRIVER' ? '🛵 [CONDUCTOR]' : role === 'ADMIN' ? '🏢 [ADMIN]' : '⚡ [SISTEMA]';
    console.log(`%c[+58express ${timestamp}] ${roleIcon} ${message}`, 'color: #00E676; font-weight: bold;', details || '');
  },

  info(message, details = null) {
    const timestamp = new Date().toLocaleTimeString('es-VE', { hour12: false });
    console.log(`%c[+58express ${timestamp}] ℹ️ ${message}`, 'color: #00D2FF; font-weight: bold;', details || '');
  },

  warn(message, details = null) {
    const timestamp = new Date().toLocaleTimeString('es-VE', { hour12: false });
    console.warn(`[+58express ${timestamp}] ⚠️ ${message}`, details || '');
  },

  error(message, details = null) {
    const timestamp = new Date().toLocaleTimeString('es-VE', { hour12: false });
    console.error(`[+58express ${timestamp}] ❌ ${message}`, details || '');
  }
};
