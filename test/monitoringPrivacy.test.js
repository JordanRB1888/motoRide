import test from 'node:test';
import assert from 'node:assert/strict';
import { redactMonitoringValue, sanitizeMonitoringBreadcrumb, sanitizeMonitoringEvent } from '../src/services/monitoringPrivacy.js';

test('la telemetría elimina secretos y datos personales anidados', () => {
  const clean = redactMonitoringValue({
    token: 'secret-token',
    profile: { email: 'persona@example.com', role: 'driver' },
    coordinates: { latitude: 10.6, longitude: -71.6 },
    safe: { state: 'ACCEPTED' }
  });
  assert.equal(clean.token, '[REDACTED]');
  assert.equal(clean.profile.email, '[REDACTED]');
  assert.equal(clean.coordinates, '[REDACTED]');
  assert.equal(clean.safe.state, 'ACCEPTED');
});

test('la telemetría limpia correo y teléfono aunque aparezcan dentro de un mensaje', () => {
  const clean = redactMonitoringValue({
    message: 'Falló la cuenta persona@ejemplo.com con el teléfono +58 412 123 4567'
  });

  assert.equal(clean.message.includes('persona@ejemplo.com'), false);
  assert.equal(clean.message.includes('412 123 4567'), false);
});

test('los eventos no conservan payload, cookies, consultas ni identidad directa', () => {
  const clean = sanitizeMonitoringEvent({
    user: { id: 'user-1', role: 'passenger', email: 'private@example.com' },
    request: { url: 'https://app.test/api/trips?token=secret', data: { password: 'x' }, cookies: { sid: 'x' }, query_string: 'token=x', headers: { authorization: 'Bearer x', accept: 'json' } }
  });
  assert.deepEqual(clean.user, { id: 'user-1', role: 'passenger' });
  assert.equal(clean.request.url, 'https://app.test/api/trips');
  assert.equal(clean.request.data, undefined);
  assert.equal(clean.request.cookies, undefined);
  assert.equal(clean.request.query_string, undefined);
  assert.equal(clean.request.headers.authorization, '[REDACTED]');
});

test('los breadcrumbs de entrada se descartan y las URLs pierden consultas', () => {
  assert.equal(sanitizeMonitoringBreadcrumb({ category: 'ui.input', message: 'typed' }), null);
  const clean = sanitizeMonitoringBreadcrumb({ category: 'fetch', data: { url: 'https://api.test/trips?lat=10.6' } });
  assert.equal(clean.data.url, 'https://api.test/trips');
});
