import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';

/**
 * RECUPERAR LA CONTRASEÑA
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que el enlace «¿Olvidaste tu contraseña?» LLEVE a algún sitio. Durante un
 *    tiempo fue un aviso que decía que no se podía hacer desde la aplicación,
 *    y para entonces el servidor ya sabía hacerlo: sólo faltaba el camino.
 *
 * 2. Que el código y la contraseña viajen JUNTOS. El servidor valida la
 *    contraseña antes de gastar el código, precisamente para que una contraseña
 *    corta no queme el código y obligue a pedir otro. Mandarlos por separado
 *    tiraría esa garantía a la basura.
 *
 * 3. Que al completar las seis cifras NO se verifique todavía en este
 *    propósito: falta la mitad de lo que hay que mandar.
 *
 * 4. Que la contraseña no se quede escrita por ahí cuando el código se quema.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

test('el enlace de contraseña olvidada lleva al flujo, no a un aviso', () => {
  const fuente = despojarComentarios(leer('app/acceso.tsx'));

  assert.match(fuente, /testID="contrasena-olvidada"/, 'desapareció el enlace');
  assert.match(
    fuente,
    /router\.push\(\{[\s\S]*?pathname: '\/verificacion'/,
    'el enlace no navega a la pantalla de verificación'
  );
  assert.match(fuente, /proposito: 'PASSWORD_RESET'/, 'no se pide el propósito correcto');

  // La frase del callejón sin salida no puede volver.
  assert.doesNotMatch(
    fuente,
    /Todavía no se puede cambiar desde la aplicación/,
    'el enlace volvió a ser un aviso que no lleva a ninguna parte'
  );
});

test('el correo ya escrito viaja; un teléfono no se confunde con uno', () => {
  const fuente = despojarComentarios(leer('app/acceso.tsx'));
  // La arroba es lo único que separa un correo de un teléfono sin ambigüedad.
  assert.match(fuente, /escrito\.includes\('@'\)/, 'se adivina el tipo de contacto');
  assert.match(fuente, /correo: escrito/, 'el correo escrito no se aprovecha');
  assert.match(fuente, /<ContrasenaOlvidada identificador=\{identificador\}/, 'no recibe lo escrito');
});

test('al recuperar, las seis cifras NO verifican todavía', () => {
  // El servidor quiere código y contraseña en la misma petición. Si aquí se
  // verificara al sexto dígito, el código se gastaría sin contraseña que
  // aplicar y habría que pedir otro.
  const fuente = despojarComentarios(leer('app/verificacion.tsx'));
  assert.match(
    fuente,
    /if \(recuperandoContrasena\) setPidiendoContrasena\(true\);\s*else void verificar\(limpio\);/,
    'el código se envía solo también al recuperar la contraseña'
  );
});

test('el código y la contraseña se mandan juntos', () => {
  const fuente = despojarComentarios(leer('app/verificacion.tsx'));
  assert.match(fuente, /contrasenaNueva: contrasena/, 'la contraseña no viaja en la verificación');
  assert.match(
    fuente,
    /void verificar\(codigo, contrasenaNueva\)/,
    'no se mandan juntos el código y la contraseña'
  );
});

test('las dos reglas de la contraseña se comprueban antes de gastar la ida y vuelta', () => {
  const fuente = despojarComentarios(leer('app/verificacion.tsx'));
  // Ocho es el mínimo que exige el servidor: comprobarlo aquí ahorra una
  // petición, pero el servidor sigue siendo la autoridad.
  assert.match(fuente, /contrasenaNueva\.length < 8/, 'no se comprueba la longitud');
  assert.match(fuente, /contrasenaNueva !== contrasenaRepetida/, 'no se comprueba que coincidan');
});

test('un código quemado no deja la contraseña escrita detrás', () => {
  const fuente = despojarComentarios(leer('app/verificacion.tsx'));
  const bloque = fuente.slice(
    fuente.indexOf('necesitaOtroCodigo'),
    fuente.indexOf('necesitaOtroCodigo') + 320
  );
  assert.match(bloque, /setPidiendoContrasena\(false\)/, 'se queda en el paso de la contraseña');
  assert.match(bloque, /setContrasenaNueva\(''\)/, 'la contraseña escrita se conserva');
  assert.match(bloque, /setContrasenaRepetida\(''\)/, 'la repetición se conserva');
});

test('la pantalla de la contraseña existe y sus campos se ocultan', () => {
  const fuente = despojarComentarios(leer('app/verificacion.tsx'));
  assert.match(fuente, /testID="pantalla-contrasena-nueva"/);
  assert.match(fuente, /testID="campo-contrasena-nueva"/);
  assert.match(fuente, /testID="campo-contrasena-repetida"/);
  assert.match(fuente, /testID="confirmar-contrasena-nueva"/);

  // Dos campos de contraseña, dos `secureTextEntry`: escribirla a la vista de
  // quien esté al lado no es una opción.
  const ocultos = fuente.match(/secureTextEntry/g) ?? [];
  assert.ok(ocultos.length >= 2, 'algún campo de contraseña se ve mientras se escribe');
});

test('el cliente sabe mandar la contraseña, y sólo en este propósito', () => {
  const fuente = despojarComentarios(leer('services/otp.ts'));
  assert.match(
    fuente,
    /\.\.\.\(peticion\.contrasenaNueva \? \{ newPassword: peticion\.contrasenaNueva \} : \{\}\)/,
    'la contraseña viaja siempre, incluso donde no hace falta'
  );
});
