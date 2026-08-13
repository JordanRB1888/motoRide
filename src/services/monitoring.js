import * as Sentry from '@sentry/browser';
import { sanitizeMonitoringBreadcrumb, sanitizeMonitoringEvent } from './monitoringPrivacy.js';

const dsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();
const environment = String(import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development');
let initialized = false;

function sampleRate(value, fallback = 0.05) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function initMonitoring() {
  if (!dsn || initialized) return false;
  Sentry.init({
    dsn,
    environment,
    release: String(import.meta.env.VITE_SENTRY_RELEASE || `plus58express-web@${__APP_VERSION__}`),
    sendDefaultPii: false,
    tracesSampleRate: sampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    beforeSend: sanitizeMonitoringEvent,
    beforeBreadcrumb: sanitizeMonitoringBreadcrumb,
    ignoreErrors: ['ResizeObserver loop limit exceeded', 'AbortError', 'NotAllowedError']
  });
  Sentry.setTag('app', 'plus58express');
  Sentry.setTag('surface', 'web');
  initialized = true;
  return true;
}

export function identifyMonitoringUser(user) {
  if (!initialized) return;
  Sentry.setUser(user?.id ? { id: String(user.id), role: String(user.role || 'unknown') } : null);
}

export function captureMonitoringError(error, context = {}) {
  if (!initialized) return null;
  return Sentry.captureException(error, { extra: sanitizeMonitoringEvent(context) });
}

export const monitoringEnabled = () => initialized;
