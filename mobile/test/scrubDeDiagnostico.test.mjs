import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  esCampoProhibido,
  limpiarEvento,
  limpiarTexto,
  limpiarValor,
  recortarCoordenada
} from '../domain/scrubDeDiagnostico.ts';

/**
 * LO QUE NO PUEDE SALIR DEL TELÉFONO
 *
 * El filtro sólo se ejerce en release y con DSN, es decir, nunca durante el
 * desarrollo. Sin estas pruebas nadie comprueba que funciona hasta que alguien
 * abre un evento en Sentry y encuentra dentro una contraseña, ya publicada.
 *
 * Es gemelo del de `server/test/scrubDeDiagnostico.test.js`, y las dos suites
 * comprueban lo mismo por separado a propósito: el filtro está duplicado en los
 * dos lados y la decisión de qué se oculta no puede divergir sin que salte algo.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

test('los nombres de campo peligrosos se reconocen escritos de cualquier forma', () => {
  for (const nombre of [
    'password', 'newPassword', 'new_password', 'contrasena', 'clave',
    'token', 'accessToken', 'refresh_token', 'authorization', 'cookie',
    'otp', 'codigo', 'challengeId', 'apiKey',
    'documento', 'fotoBase64', 'imagenAdjunta'
  ]) {
    assert.equal(esCampoProhibido(nombre), true, `«${nombre}» debería estar prohibido`);
  }
});

test('lo que sirve para diagnosticar no se bloquea', () => {
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

  const texto = JSON.stringify(limpio);
  assert.doesNotMatch(texto, /ClaveLarga123/);
  assert.doesNotMatch(texto, /jordan@ejemplo\.com/);
  assert.doesNotMatch(texto, /584140031808/);
  assert.equal(limpio.trip.status, 'REQUESTED');
});

test('los teléfonos se enmascaran; las marcas de tiempo y los identificadores NO', () => {
  // Misma regresión que en el servidor: un filtro por longitud convertía la
  // marca `prueba-1788765295954` en un teléfono enmascarado y dejaba el evento
  // sin saber cuándo pasó.
  assert.equal(limpiarTexto('prueba-1788765295954'), 'prueba-1788765295954');
  assert.equal(limpiarTexto('2026-09-07T07:14:06.271Z'), '2026-09-07T07:14:06.271Z');
  assert.equal(limpiarTexto('trip_1788765295954'), 'trip_1788765295954');

  for (const numero of ['+584140031808', '+58 414 003 1808', '04140031808']) {
    const limpio = limpiarTexto(`llamar a ${numero} ahora`);
    assert.doesNotMatch(limpio, /4140031808/, `se escapó ${numero}`);
  }
});

test('la ubicación se redondea a barrio', () => {
  assert.equal(recortarCoordenada(10.664123456), 10.66);
  const limpio = limpiarValor({ origen: { lat: 10.664123456, lng: -71.612987654 } });
  assert.equal(limpio.origen.lat, 10.66);
  assert.equal(limpio.origen.lng, -71.61);
});

test('un evento entero sale sin nada que no deba salir', () => {
  const evento = limpiarEvento({
    message: 'fallo al pedir viaje para jordan@ejemplo.com',
    request: {
      url: 'https://api-staging.mas58express.com/api/trips/create?token=abc123',
      headers: { authorization: 'Bearer abc' },
      data: { password: 'x', destination: 'jordan@ejemplo.com', tripId: 't1' }
    },
    user: { id: 'passenger_1', role: 'passenger', email: 'jordan@ejemplo.com' },
    extra: { otp: '451949', distanceKm: 8.8 },
    breadcrumbs: [{ message: 'login con clave ClaveLarga123', data: { password: 'ClaveLarga123' } }],
    exception: { values: [{ value: 'no existe cuenta para jordan@ejemplo.com' }] }
  });

  const texto = JSON.stringify(evento);
  assert.doesNotMatch(texto, /jordan@ejemplo\.com/, 'se escapó un correo completo');
  assert.doesNotMatch(texto, /ClaveLarga123/, 'se escapó una contraseña');
  assert.doesNotMatch(texto, /451949/, 'se escapó un código de verificación');
  assert.doesNotMatch(texto, /Bearer abc/, 'se escapó una cabecera de sesión');
  assert.equal(evento.request.headers, undefined);
  assert.equal(evento.request.url, 'https://api-staging.mas58express.com/api/trips/create');
  assert.equal(evento.user.id, 'passenger_1');
  assert.equal(evento.extra.distanceKm, 8.8);
});

// ---------------------------------------------------------------------------
// Cómo se enciende
// ---------------------------------------------------------------------------

test('el diagnóstico NO se enciende en desarrollo ni sin DSN', () => {
  const modulo = leer('observabilidad/sentry.ts');
  assert.match(modulo, /if \(EN_DESARROLLO\) return \{ activo: false/);
  assert.match(modulo, /sin \$\{VARIABLE_DSN\}/);
  // Y jamás manda los datos que el SDK adjuntaría por su cuenta.
  assert.match(modulo, /sendDefaultPii: false/);
  // Las migas de consola no viajan: es por donde se colaría un console.log.
  assert.match(modulo, /category === 'console'\) return null/);
});

test('la raíz de la aplicación arranca el diagnóstico y envuelve el render', () => {
  const raiz = leer('app/_layout.tsx');
  // En el cuerpo del módulo, no en un efecto: lo que hay que capturar es
  // justamente lo que pasa antes de que React monte nada.
  assert.match(raiz, /const observabilidad = iniciarObservabilidad\(\);/);
  assert.match(raiz, /export default Sentry\.wrap\(DisposicionRaiz\);/);
});

test('sólo se anotan los fallos de API que nadie espera', () => {
  const api = leer('services/api.ts');
  // Un 401 o un 404 son respuestas correctas a situaciones normales; anotarlos
  // llena las migas de ruido hasta que el fallo real no se distingue.
  assert.match(api, /estado >= 500/);
  assert.match(api, /SIN_RED' \|\| resultado\.motivo === 'TIEMPO_AGOTADO'/);
});

test('se etiqueta de quién son los errores, sin decir quién es', () => {
  const observador = leer('observabilidad/IdentidadEnDiagnostico.tsx');
  assert.match(observador, /identificarUsuario\(/);
  assert.match(observador, /id, role: rol/, 'sólo el identificador y el rol');
  // Al salir se limpia: sin esto, los errores de quien entre después en el
  // mismo teléfono se le atribuirían a quien estaba antes.
  assert.match(observador, /: null\)/);
  // Y no se publica nada más de la persona. Se mira el CÓDIGO, no los
  // comentarios: éstos explican precisamente por qué el correo no viaja.
  assert.doesNotMatch(despojarComentarios(observador), /email|correo|telefono|phone/i);
});

test('el contexto de sesión NO tiene ninguna vía hacia el diagnóstico', () => {
  // Es donde vive la contraseña en claro mientras se envía. La separación la
  // vigila además `registro.test.mjs`; aquí se deja dicho el porqué, para que
  // nadie «simplifique» moviendo la identificación de vuelta ahí dentro.
  const contexto = leer('context/AuthContext.tsx');
  assert.doesNotMatch(contexto, /observabilidad\/sentry/);
  assert.doesNotMatch(contexto, /identificarUsuario/);
});
