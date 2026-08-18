import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Un 429 llegaba a la pantalla como «Credenciales incorrectas».
 *
 * El limitador antiguo respondia texto plano; el cliente intentaba leerlo como
 * JSON, fallaba, y guardaba REQUEST_FAILED perdiendo el unico dato fiable que
 * tenia --el estado HTTP--. En el formulario ese codigo desconocido caia en la
 * rama por defecto, que dice que la contrasena esta mal. Reintentar entonces
 * es lo peor que se puede hacer: alarga el bloqueo.
 */

// ------------------------------------------------- el cliente HTTP, ejecutado

import { buildRequestError, errorCodeForStatus } from '../src/services/httpErrorCodes.js';

test('un 429 con cuerpo JSON conserva su codigo y su alcance', () => {
  const error = buildRequestError(429, { error: 'RATE_LIMITED', scope: 'login', retryAfterMs: 900000 });
  assert.equal(error.status, 429);
  assert.equal(error.error, 'RATE_LIMITED');
  assert.equal(error.scope, 'login');
  assert.equal(error.retryAfterMs, 900000);
});

test('un 429 SIN cuerpo JSON tampoco pierde su codigo', () => {
  // Es el caso exacto que rompia: texto plano del limitador antiguo, el
  // parseo falla y llega `null`.
  const error = buildRequestError(429, null);
  assert.equal(error.status, 429, 'el estado debe conservarse');
  assert.equal(error.error, 'RATE_LIMITED', 'y deducirse el codigo, no REQUEST_FAILED');
});

test('un 401 con cuerpo conserva el codigo que manda el servidor', () => {
  const error = buildRequestError(401, { error: 'INVALID_CREDENTIALS' });
  assert.equal(error.status, 401);
  assert.equal(error.error, 'INVALID_CREDENTIALS', 'el cuerpo manda sobre la traduccion');
});

test('los estados conocidos sin cuerpo se traducen a su codigo', () => {
  for (const [status, esperado] of [
    [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'], [500, 'SERVER_ERROR'], [503, 'SERVER_ERROR']
  ]) {
    assert.equal(errorCodeForStatus(status), esperado, `estado ${status}`);
    assert.equal(buildRequestError(status, null).status, status);
  }
});

test('un estado sin traduccion sigue siendo REQUEST_FAILED', () => {
  assert.equal(errorCodeForStatus(418), 'REQUEST_FAILED');
  assert.equal(buildRequestError(418, null).error, 'REQUEST_FAILED');
});

test('el estado nunca lo pisa el cuerpo del servidor', () => {
  // Un cuerpo que trajera su propio `status` no puede falsear el real.
  const error = buildRequestError(429, { error: 'RATE_LIMITED', status: 200 });
  assert.equal(error.status, 429);
});

test('un cuerpo que no sea objeto se trata como ausente', () => {
  for (const raro of ['texto plano', 42, true, []]) {
    const error = buildRequestError(429, raro);
    assert.equal(error.status, 429, `entrada: ${JSON.stringify(raro)}`);
    if (!Array.isArray(raro)) assert.equal(error.error, 'RATE_LIMITED');
  }
});

test('el cliente HTTP usa esta composicion, no una propia', () => {
  const api = fs.readFileSync(path.join(raiz, 'src/services/apiService.js'), 'utf8');
  assert.match(api, /import \{ buildRequestError \}/, 'debe importar el modulo puro');
  assert.match(api, /this\.lastError = buildRequestError\(response\.status, payload\)/,
    'y componer el error con el');
  assert.ok(!/error: 'REQUEST_FAILED'/.test(api), 'no debe quedar la composicion antigua');
});

// ----------------------------------------------- el formulario, por su fuente

const landing = fs.readFileSync(path.join(raiz, 'src/pages/landing.js'), 'utf8');

/** Ramas del `if` que decide el mensaje, en orden. */
function ramasDelMensaje() {
  const inicio = landing.indexOf('if (result?.success && result.user)');
  assert.notEqual(inicio, -1, 'no se encontro el manejador del formulario');
  const fin = landing.indexOf('} catch (error)', inicio);
  return landing.slice(inicio, fin);
}

test('el 429 se atiende antes que la rama por defecto', () => {
  const ramas = ramasDelMensaje();
  const limite = ramas.search(/result\?\.status === 429|result\?\.error === 'RATE_LIMITED'/);
  const porDefecto = ramas.indexOf('Credenciales incorrectas');

  assert.notEqual(limite, -1, 'debe haber una rama explicita para el limitador');
  assert.notEqual(porDefecto, -1, 'la rama por defecto debe seguir existiendo');
  assert.ok(limite < porDefecto, 'el 429 debe resolverse antes de llegar al mensaje generico');
});

test('el mensaje del limitador dice que se espere, no que la clave esta mal', () => {
  const ramas = ramasDelMensaje();
  const bloque = ramas.slice(ramas.search(/result\?\.status === 429/), ramas.indexOf("USER_EXISTS"));
  assert.match(bloque, /Demasiados intentos/);
  assert.ok(!/Credenciales incorrectas/.test(bloque), 'no debe hablar de credenciales');
});

test('el mismo manejador cubre iniciar sesion y registrarse', () => {
  // Las dos vias pasan por el mismo `if`: una sola rama las cubre.
  const ramas = ramasDelMensaje();
  assert.match(ramas, /registrationMode \? 'No se pudo crear la cuenta' : 'Credenciales incorrectas'/,
    'la rama por defecto distingue ambos casos');
  const limite = ramas.search(/result\?\.status === 429/);
  const generico = ramas.indexOf('registrationMode ?');
  assert.ok(limite < generico, 'el limitador se atiende antes en ambos flujos');
});

test('los mensajes que ya existian siguen en su sitio', () => {
  const ramas = ramasDelMensaje();
  for (const marca of [
    "result?.error === 'USER_EXISTS'",
    "result?.error === 'DRIVER_APPLICATION_NOT_APPROVED'",
    'result?.fields'
  ]) {
    assert.ok(ramas.includes(marca), `desaparecio el manejo de ${marca}`);
  }
});

test('authService propaga el estado HTTP a la pantalla', () => {
  // Sin esto, el formulario nunca veria el 429.
  const auth = fs.readFileSync(path.join(raiz, 'src/services/authService.js'), 'utf8');
  for (const metodo of ['login', 'register']) {
    const inicio = auth.indexOf(`async ${metodo}(`);
    assert.notEqual(inicio, -1, `falta ${metodo}`);
    const cuerpo = auth.slice(inicio, inicio + 400);
    assert.match(cuerpo, /\.\.\.\(apiService\.lastError/, `${metodo} debe propagar lastError entero`);
  }
});
