const SENSITIVE_KEY = /(authorization|cookie|token|password|secret|document|cedula|identity|license|photo|image|bank|reference|phone|email|address|latitude|longitude|coordinates|location)/i;
const TOKEN_LIKE = /\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/g;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_LIKE = /(?<!\d)(?:\+?58)?[\s-]?(?:0?4(?:12|14|16|24|26))[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;

export function redactMonitoringValue(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 30).map(item => redactMonitoringValue(item, depth + 1));
  if (!value || typeof value !== 'object') {
    return typeof value === 'string'
      ? value.slice(0, 500)
          .replace(TOKEN_LIKE, '[REDACTED]')
          .replace(EMAIL_LIKE, '[REDACTED]')
          .replace(PHONE_LIKE, '[REDACTED]')
      : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactMonitoringValue(item, depth + 1)
  ]));
}

export function sanitizeMonitoringEvent(event) {
  const clean = redactMonitoringValue(event);
  if (clean.user) clean.user = { id: clean.user.id, role: clean.user.role };
  if (clean.request) {
    delete clean.request.cookies;
    delete clean.request.data;
    delete clean.request.query_string;
    if (clean.request.url) clean.request.url = String(clean.request.url).split('?')[0];
    clean.request.headers = redactMonitoringValue(clean.request.headers || {});
  }
  return clean;
}

export function sanitizeMonitoringBreadcrumb(breadcrumb) {
  const clean = redactMonitoringValue(breadcrumb);
  if (clean?.data?.url) clean.data.url = String(clean.data.url).split('?')[0];
  if (clean?.category === 'ui.input') return null;
  return clean;
}
