import test from 'node:test';
import assert from 'node:assert/strict';

import {
  esCampoProhibido,
  limpiarCabeceras,
  limpiarEvento,
  limpiarTexto,
  limpiarValor,
  recortarCoordenada
} from '../domain/scrubDeDiagnostico.js';

import {
  entornoDeclarado,
  versionDelServidor
} from '../services/observabilidad.js';

/**
 * LO QUE NUNCA PUEDE SALIR HACIA DIAGNÓSTICO
 *
 * Estas pruebas son la única defensa real. El filtro sólo se ejerce cuando hay
 * un DSN configurado, así que sin ellas nadie comprueba nunca que funciona: se
 * descubriría que dejaba pasar una contraseña el día que alguien mirase un
 * evento en Sentry, con la contraseña ya publicada.
 *
 * Se prueba sobre estructuras, sin red y sin SDK.
 */

test('los nombres de campo peligrosos se reconocen escritos de cualquier forma', () => {
  for (const nombre of [
    'password', 'newPassword', 'new_password', 'PASSWORD', 'contrasena',
    'token', 'accessToken', 'refresh_token', 'jwt', 'authorization',
    'cookie', 'sessionId', 'otp', 'code', 'codigo', 'challengeId',
    'privateKey', 'serviceAccount', 'apiKey',
    'documento', 'fileBuffer', 'fotoBase64', 'imagenAdjunta'
  ]) {
    assert.equal(esCampoProhibido(nombre), true, `«${nombre}» debería estar prohibido`);
  }
});

test('los campos que sí sirven para diagnosticar no se bloquean', () => {
  for (const nombre of ['tripId', 'status', 'role', 'distanceKm', 'vehicleType', 'userId']) {
    assert.equal(esCampoProhibido(nombre), false, `«${nombre}» no debería bloquearse`);
  }
});

test('una contraseña no sale ni anidada ni con otro nombre', () => {
  const limpio = limpiarValor({
    email: 'jordan@ejemplo.com',
    password: 'ClaveLarga123',
    perfil: { newPassword: 'otra', telefono: '+584140031808' },
    trip: { id: 'trip_1', status: 'REQUESTED' }
  });

  assert.equal(limpio.password, '[oculto]');
  assert.equal(limpio.perfil.newPassword, '[oculto]');
  // El correo y el teléfono viajan enmascarados: distinguen dos cuentas sin
  // decir cuál es ninguna.
  assert.doesNotMatch(JSON.stringify(limpio), /jordan@ejemplo\.com/);
  assert.doesNotMatch(JSON.stringify(limpio), /584140031808/);
  assert.match(limpio.email, /@ejemplo\.com$/);
  // Y lo que sirve para entender el fallo se conserva entero.
  assert.equal(limpio.trip.id, 'trip_1');
  assert.equal(limpio.trip.status, 'REQUESTED');
});

test('un correo o un JWT dentro de un mensaje de error tampoco salen', () => {
  const mensaje = limpiarTexto('No existe cuenta para jordan@ejemplo.com');
  assert.doesNotMatch(mensaje, /jordan@ejemplo\.com/);
  assert.match(mensaje, /ejemplo\.com/, 'el dominio sí ayuda y puede quedarse');

  const conToken = limpiarTexto('falló con eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-def_123');
  assert.doesNotMatch(conToken, /eyJhbGciOiJIUzI1NiJ9/);
  assert.match(conToken, /\[oculto\]/);
});

test('los teléfonos se enmascaran; las marcas de tiempo y los identificadores NO', () => {
  // REGRESIÓN DE UN FALLO REAL, visto en el primer evento que llegó a Sentry.
  // El filtro de teléfonos era `/\+?\d[\d\s()-]{7,}\d/` y se comía todo lo que
  // fueran muchos dígitos: la marca `prueba-1788765295954` viajó como
  // `prueba-+58•••••••••••54`, y la fecha de arranque como `+20••••07T07:14…`.
  // Enmascarar de más deja el diagnóstico sin cuándo pasó ni con qué id.
  assert.equal(limpiarTexto('prueba-1788765295954'), 'prueba-1788765295954');
  assert.equal(limpiarTexto('2026-09-07T07:14:06.271Z'), '2026-09-07T07:14:06.271Z');
  assert.equal(limpiarTexto('trip_1788765295954'), 'trip_1788765295954');

  // Y los teléfonos de verdad siguen sin salir, en los formatos que se usan.
  for (const numero of ['+584140031808', '+58 414 003 1808', '04140031808']) {
    const limpio = limpiarTexto(`llamar a ${numero} ahora`);
    assert.doesNotMatch(limpio, /4140031808/, `se escapó ${numero}`);
    assert.match(limpio, /•/, `${numero} no llegó a enmascararse`);
  }
});

test('sólo pasan las cabeceras de la lista de permitidos', () => {
  const limpias = limpiarCabeceras({
    authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma',
    cookie: 'session=abc123',
    'x-api-key': 'secreto',
    'user-agent': 'okhttp/4.12.0',
    'content-type': 'application/json'
  });

  assert.deepEqual(Object.keys(limpias).sort(), ['content-type', 'user-agent']);
  assert.equal(limpias['user-agent'], 'okhttp/4.12.0');
});

test('la ubicación se redondea a barrio, no se publica la acera', () => {
  // Maracaibo, con precisión de metros en la entrada.
  assert.equal(recortarCoordenada(10.664123456), 10.66);
  assert.equal(recortarCoordenada(-71.612987654), -71.61);
  assert.equal(recortarCoordenada('no es un numero'), null);

  const limpio = limpiarValor({ origen: { lat: 10.664123456, lng: -71.612987654 } });
  assert.equal(limpio.origen.lat, 10.66);
  assert.equal(limpio.origen.lng, -71.61);
});

test('un evento entero sale sin nada que no deba salir', () => {
  const evento = limpiarEvento({
    message: 'fallo al pedir viaje para jordan@ejemplo.com',
    request: {
      url: 'https://api-staging.mas58express.com/api/trips/create?token=abc123',
      query_string: 'token=abc123',
      headers: { authorization: 'Bearer abc', 'user-agent': 'okhttp' },
      cookies: { sesion: 'abc' },
      data: { password: 'x', destination: 'jordan@ejemplo.com', tripId: 't1' }
    },
    user: { id: 'passenger_1', role: 'passenger', email: 'jordan@ejemplo.com', ip_address: '190.1.2.3' },
    extra: { otp: '451949', distanceKm: 8.8 },
    breadcrumbs: [{ message: 'POST /api/auth/login con clave ClaveLarga123', data: { password: 'ClaveLarga123' } }],
    exception: { values: [{ value: 'no existe cuenta para jordan@ejemplo.com' }] }
  });

  const texto = JSON.stringify(evento);
  assert.doesNotMatch(texto, /jordan@ejemplo\.com/, 'se escapó un correo completo');
  assert.doesNotMatch(texto, /ClaveLarga123/, 'se escapó una contraseña');
  assert.doesNotMatch(texto, /451949/, 'se escapó un código de verificación');
  assert.doesNotMatch(texto, /Bearer abc/, 'se escapó una cabecera de sesión');
  assert.doesNotMatch(texto, /190\.1\.2\.3/, 'se escapó la dirección IP');
  assert.equal(evento.request.cookies, undefined);
  assert.equal(evento.request.query_string, undefined);
  assert.equal(evento.request.url, 'https://api-staging.mas58express.com/api/trips/create');

  // Y lo que sirve para diagnosticar sigue estando.
  assert.equal(evento.user.id, 'passenger_1');
  assert.equal(evento.user.role, 'passenger');
  assert.equal(evento.extra.distanceKm, 8.8);
  assert.equal(evento.request.data.tripId, 't1');
});

test('un ciclo no cuelga el filtro', () => {
  const nodo = { nombre: 'a' };
  nodo.mismo = nodo;
  const limpio = limpiarValor(nodo);
  assert.equal(limpio.nombre, 'a');
  assert.ok(limpio);
});

// ---------------------------------------------------------------------------
// Entorno y versión
// ---------------------------------------------------------------------------

test('el entorno se declara, y nunca se supone produccion por descarte', () => {
  assert.equal(entornoDeclarado({ SENTRY_ENVIRONMENT: 'staging' }), 'staging');
  // Sin variable propia, se toma la del despliegue.
  assert.equal(entornoDeclarado({ RAILWAY_ENVIRONMENT_NAME: 'staging' }), 'staging');
  // Y sin nada, desarrollo. Mezclar los errores de la beta con los de
  // produccion haría inutiles los dos.
  assert.equal(entornoDeclarado({}), 'development');
});

test('cada despliegue se puede distinguir del anterior', () => {
  assert.equal(versionDelServidor({ SENTRY_RELEASE: 'v1.2.3' }), 'v1.2.3');
  assert.equal(
    versionDelServidor({ RAILWAY_GIT_COMMIT_SHA: 'cd8175d08d44b22d9b6eccddac6874f483ac1d5a' }),
    'plus58express-server@cd8175d'
  );
  assert.equal(versionDelServidor({}), undefined);
});
