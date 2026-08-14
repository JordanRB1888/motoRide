import test from 'node:test';
import assert from 'node:assert/strict';
import { composeApiUrl, normalizeBaseUrl } from '../src/services/apiUrl.js';

/**
 * Estas pruebas comprueban la URL final completa, no un fragmento.
 *
 * El defecto que motivó el módulo era invisible a cualquier comprobación que
 * solo mirase el endpoint: `/api/users/:id/photo` es correcto por sí mismo, y
 * aun así producía `/api/api/users/...` al unirse con una base que ya termina
 * en `/api`.
 */

const RAILWAY = 'https://motoride-production-4ce4.up.railway.app/api';
const LOCAL = 'http://localhost:4000/api';

test('la fotografía privada no duplica el prefijo /api', () => {
  assert.equal(
    composeApiUrl(RAILWAY, '/api/users/user_1/photo'),
    'https://motoride-production-4ce4.up.railway.app/api/users/user_1/photo'
  );
  const url = composeApiUrl(RAILWAY, '/api/users/user_1/photo');
  assert.ok(!url.includes('/api/api'), `no puede aparecer /api/api: ${url}`);
  assert.equal((url.match(/\/api\//g) || []).length, 1, 'exactamente un /api/');
});

test('un endpoint sin prefijo recibe el que aporta la base', () => {
  assert.equal(
    composeApiUrl(RAILWAY, '/users/user_1/photo'),
    'https://motoride-production-4ce4.up.railway.app/api/users/user_1/photo'
  );
  // Y el resto de la API sigue componiéndose igual que siempre.
  assert.equal(composeApiUrl(RAILWAY, '/trips'), 'https://motoride-production-4ce4.up.railway.app/api/trips');
  assert.equal(
    composeApiUrl(RAILWAY, '/driver-documents/doc_1/content'),
    'https://motoride-production-4ce4.up.railway.app/api/driver-documents/doc_1/content'
  );
});

test('en localhost el resultado es igualmente correcto', () => {
  assert.equal(composeApiUrl(LOCAL, '/api/users/user_1/photo'), 'http://localhost:4000/api/users/user_1/photo');
  assert.equal(composeApiUrl(LOCAL, '/users/user_1/photo'), 'http://localhost:4000/api/users/user_1/photo');
  assert.equal(composeApiUrl(LOCAL, '/auth/me'), 'http://localhost:4000/api/auth/me');
});

test('VITE_API_URL con o sin barra final produce lo mismo', () => {
  for (const base of ['https://ejemplo.test/api', 'https://ejemplo.test/api/', 'https://ejemplo.test/api///']) {
    assert.equal(normalizeBaseUrl(base), 'https://ejemplo.test/api', `normalización de ${base}`);
    assert.equal(
      composeApiUrl(base, '/api/users/user_1/photo'),
      'https://ejemplo.test/api/users/user_1/photo',
      `composición con ${base}`
    );
  }
});

test('nunca se elimina el único prefijo /api', () => {
  // Base sin `/api`: el prefijo del endpoint es el único que hay y se conserva.
  assert.equal(composeApiUrl('https://ejemplo.test', '/api/users/user_1/photo'), 'https://ejemplo.test/api/users/user_1/photo');
  assert.equal(composeApiUrl('https://ejemplo.test/', '/api/users/user_1/photo'), 'https://ejemplo.test/api/users/user_1/photo');
  // Una base que termina en algo parecido pero no igual no engaña a la función.
  assert.equal(composeApiUrl('https://ejemplo.test/apix', '/api/users/u/photo'), 'https://ejemplo.test/apix/api/users/u/photo');
});

test('casos límite no rompen la composición', () => {
  assert.equal(composeApiUrl(RAILWAY, '/api'), 'https://motoride-production-4ce4.up.railway.app/api');
  assert.equal(composeApiUrl(RAILWAY, 'trips'), 'https://motoride-production-4ce4.up.railway.app/api/trips');
  assert.equal(composeApiUrl(RAILWAY, ''), RAILWAY);
  assert.equal(composeApiUrl(RAILWAY, null), RAILWAY);
  // Una URL absoluta se respeta tal cual.
  assert.equal(composeApiUrl(RAILWAY, 'https://otro.test/x.png'), 'https://otro.test/x.png');
});

test('la composición antigua producía el defecto que esta corrección elimina', () => {
  // Reproducción explícita de la regresión, para que quede documentada.
  const antigua = (base, endpoint) => `${base}${endpoint}`;
  assert.equal(
    antigua(RAILWAY, '/api/users/user_1/photo'),
    'https://motoride-production-4ce4.up.railway.app/api/api/users/user_1/photo'
  );
  assert.notEqual(
    composeApiUrl(RAILWAY, '/api/users/user_1/photo'),
    antigua(RAILWAY, '/api/users/user_1/photo')
  );
});
