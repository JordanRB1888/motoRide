import * as Sentry from '@sentry/node';

const dsn = String(process.env.SENTRY_DSN || '').trim();
const environment = String(process.env.SENTRY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development');
const sensitiveKey = /(authorization|cookie|token|password|secret|document|cedula|identity|license|photo|image|bank|reference|phone|email|address|latitude|longitude|coordinates|location)/i;
const tokenLike = /\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/g;
const emailLike = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneLike = /(?<!\d)(?:\+?58)?[\s-]?(?:0?4(?:12|14|16|24|26))[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;

function sampleRate(value, fallback = 0.05) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function redact(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 30).map(item => redact(item, depth + 1));
  if (!value || typeof value !== 'object') {
    return typeof value === 'string'
      ? value.slice(0, 500)
          .replace(tokenLike, '[REDACTED]')
          .replace(emailLike, '[REDACTED]')
          .replace(phoneLike, '[REDACTED]')
      : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redact(item, depth + 1)]));
}

export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment,
    release: String(process.env.SENTRY_RELEASE || 'plus58express-server@1.0.0'),
    sendDefaultPii: false,
    includeLocalVariables: false,
    tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    beforeSend(event) {
      const clean = redact(event);
      if (clean.user) clean.user = { id: clean.user.id, role: clean.user.role };
      if (clean.request) {
        delete clean.request.cookies;
        delete clean.request.data;
        delete clean.request.query_string;
        if (clean.request.url) clean.request.url = String(clean.request.url).split('?')[0];
        clean.request.headers = redact(clean.request.headers || {});
      }
      return clean;
    },
    beforeBreadcrumb(breadcrumb) {
      const clean = redact(breadcrumb);
      if (clean?.data?.url) clean.data.url = String(clean.data.url).split('?')[0];
      return clean;
    }
  });
  Sentry.setTag('app', 'plus58express');
  Sentry.setTag('surface', 'backend');
}

export { Sentry };
