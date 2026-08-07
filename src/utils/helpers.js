/**
 * UUID-like unique ID generator
 */
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Format money with $ or Bs
 */
export function formatCurrency(amount, currency = 'USD') {
  if (currency === 'VES' || currency === 'Bs') {
    return `Bs. ${Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format distance
 */
export function formatDistance(km) {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Format duration in minutes
 */
export function formatDuration(minutes) {
  const rounded = Math.round(minutes);
  if (rounded < 60) {
    return `${rounded} min`;
  }
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/**
 * Format date in Spanish locale
 */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('es-VE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format time to HH:MM
 */
export function formatTime(date) {
  return new Date(date).toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Calculate distance between two coords using Haversine formula
 */
export function calculateHaversine(lat1, lon1, lat2, lon2, roadMultiplier = 1.35) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c * roadMultiplier;
  return Math.max(1.2, Number(dist.toFixed(1)));
}

export function getHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  return calculateHaversine(lat1, lon1, lat2, lon2, 1.35);
}

/**
 * Calculate bearing angle between two points
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (val) => val * Math.PI / 180;
  const toDeg = (val) => val * 180 / Math.PI;
  
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  
  return (brng + 360) % 360;
}

/**
 * Debounce function
 */
export function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * Promise-based sleep delay
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get relative time string (e.g. hace 5 min)
 */
export function getRelativeTime(date) {
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const diffInMs = new Date(date).getTime() - Date.now();
  const diffInMinutes = Math.round(diffInMs / (1000 * 60));
  
  if (Math.abs(diffInMinutes) < 60) {
    return rtf.format(diffInMinutes, 'minute');
  }
  
  const diffInHours = Math.round(diffInMinutes / 60);
  if (Math.abs(diffInHours) < 24) {
    return rtf.format(diffInHours, 'hour');
  }
  
  const diffInDays = Math.round(diffInHours / 24);
  return rtf.format(diffInDays, 'day');
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Random number in range
 */
export function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
