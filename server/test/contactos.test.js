import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  digitosDelTelefono,
  esCorreoValido,
  mismoCorreo,
  mismoTelefono,
  normalizarCorreo,
  normalizarTelefono,
  valorNormalizadoDeContacto
} from '../domain/contactos.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('el correo se compara sin espacios y en minusculas, como hacia el registro', () => {
  assert.equal(normalizarCorreo('  Ana@X.CO '), 'ana@x.co');
  assert.ok(mismoCorreo('ANA@x.co', 'ana@X.CO'));
  assert.ok(!mismoCorreo('', ''), 'dos vacios no son el mismo correo');
  assert.ok(esCorreoValido('ana@x.co'));
  assert.ok(!esCorreoValido('no-es-correo'));
});

test('un numero local venezolano se convierte a E.164 con +58 y sin el cero troncal', () => {
  const t = normalizarTelefono('0414-123.4567');
  assert.equal(t.valido, true);
  assert.equal(t.digitos, '04141234567', 'la clave de coincidencia de siempre no cambia');
  assert.equal(t.e164, '+584141234567');
});

test('un numero que ya trae codigo de pais se respeta, con o sin +, y con 00', () => {
  assert.equal(normalizarTelefono('+58 414 1234567').e164, '+584141234567');
  assert.equal(normalizarTelefono('584141234567').e164, '+584141234567');
  assert.equal(normalizarTelefono('00584141234567').e164, '+584141234567');
  assert.equal(normalizarTelefono('+1 (305) 555-0100').e164, '+13055550100', 'otro pais no se toca');
});

test('un numero fuera del rango que acepta el registro no tiene destino', () => {
  for (const malo of ['12', '0414123', '1234567890123456', '', null]) {
    const t = normalizarTelefono(malo);
    assert.equal(t.valido, false, `${malo} deberia ser invalido`);
    assert.equal(t.e164, null);
  }
});

test('la clave de coincidencia es exactamente la expresion que usaba el servidor', () => {
  const muestras = ['0414-123.4567', '+58 414 1234567', ' (0414) 123 45 67 ', 'abc'];
  for (const m of muestras) assert.equal(digitosDelTelefono(m), String(m).replace(/\D/g, ''));
  assert.ok(mismoTelefono('0414-123-4567', '04141234567'));
  assert.ok(!mismoTelefono('', ''));
});

test('el valor normalizado de un contacto depende de su tipo y nunca es basura', () => {
  assert.equal(valorNormalizadoDeContacto('EMAIL', ' Ana@X.CO '), 'ana@x.co');
  assert.equal(valorNormalizadoDeContacto('EMAIL', 'sin-arroba'), null);
  assert.equal(valorNormalizadoDeContacto('PHONE', '0414 123 4567'), '+584141234567');
  assert.equal(valorNormalizadoDeContacto('PHONE', '12'), null);
  assert.equal(valorNormalizadoDeContacto('FAX', '123'), null);
});

test('el registro y el login del servidor siguen comparando por digitos: la compatibilidad no se rompio', () => {
  const fuente = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  const registro = fuente.slice(fuente.indexOf("app.post('/api/auth/register'"), fuente.indexOf("app.get('/api/auth/me'"));
  assert.match(registro, /replace\(\/\\D\/g, ''\)/, 'el duplicado del registro se sigue buscando por digitos');
  assert.match(registro, /String\(email\)\.trim\(\)\.toLowerCase\(\)/, 'el correo se sigue bajando a minusculas');
  assert.match(registro, /normalizarTelefono\(normalizedPhone\)\.e164/, 'y el contacto declarado se guarda en E.164');
});
