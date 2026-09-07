import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  CONSECUENCIAS_DEL_BORRADO,
  MOTIVO_ULTIMO_METODO,
  TEXTO_DEL_ESTADO,
  estadoDelMetodo,
  interpretarBorrado,
  interpretarDesvinculacion,
  interpretarMetodos,
  pruebaParaBorrar,
  sePuedeDesvincular
} from '../domain/seguridadDeCuenta.ts';

/**
 * SEGURIDAD DE LA CUENTA
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que nadie se quede sin puerta de entrada a su propia cuenta.
 * 2. Que borrar la cuenta no sea un toque, y que se diga la verdad sobre lo
 *    que se pierde y lo que se conserva.
 * 3. Que no se filtre ningún identificador interno.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

const metodos = (extra = {}) => ({
  password: true,
  providers: [
    { provider: 'GOOGLE', linked: false, available: true },
    { provider: 'APPLE', linked: false, available: false }
  ],
  total: 1,
  contacts: [],
  ...extra
});

test('cada método tiene su estado, y un proveedor sin configurar no se ofrece', () => {
  assert.equal(estadoDelMetodo({ provider: 'GOOGLE', linked: true, available: true }), 'VINCULADO');
  assert.equal(estadoDelMetodo({ provider: 'GOOGLE', linked: false, available: true }), 'NO_VINCULADO');
  assert.equal(estadoDelMetodo({ provider: 'APPLE', linked: false, available: false }), 'NO_DISPONIBLE');
  // Un proveedor vinculado se enseña como tal aunque el servidor lo haya
  // apagado después: la identidad sigue ahí.
  assert.equal(estadoDelMetodo({ provider: 'APPLE', linked: true, available: false }), 'VINCULADO');
  for (const clave of ['VINCULADO', 'NO_VINCULADO', 'NO_DISPONIBLE']) {
    assert.ok(TEXTO_DEL_ESTADO[clave].length > 3, clave);
  }
});

test('NO se puede quitar el último método: la pantalla lo dice antes de intentarlo', () => {
  // Sólo Google vinculado y sin contraseña: no se puede quitar.
  const soloGoogle = metodos({
    password: false,
    providers: [
      { provider: 'GOOGLE', linked: true, available: true },
      { provider: 'APPLE', linked: false, available: true }
    ],
    total: 1
  });
  assert.equal(sePuedeDesvincular(soloGoogle, 'GOOGLE'), false);

  // Con contraseña además, sí.
  const conAmbos = metodos({
    password: true,
    providers: [
      { provider: 'GOOGLE', linked: true, available: true },
      { provider: 'APPLE', linked: false, available: true }
    ],
    total: 2
  });
  assert.equal(sePuedeDesvincular(conAmbos, 'GOOGLE'), true);
  // Lo no vinculado no se quita.
  assert.equal(sePuedeDesvincular(conAmbos, 'APPLE'), false);
  assert.match(MOTIVO_ULTIMO_METODO, /única forma de entrar/);
});

test('el servidor manda: si dice LAST_AUTH_METHOD, se explica y no se insiste', () => {
  const negado = interpretarDesvinculacion({ ok: false, motivo: 'HTTP', codigo: 'LAST_AUTH_METHOD' });
  assert.equal(negado.ok, false);
  assert.equal(negado.mensaje, MOTIVO_ULTIMO_METODO);
  // Y la pantalla comprueba lo mismo antes, para no ofrecer un botón que falla.
  const pantalla = despojarComentarios(leer('app/seguridad.tsx'));
  assert.match(pantalla, /sePuedeDesvincular\(metodos, metodo\.provider\)/);
  assert.match(pantalla, /deshabilitado: !puedeQuitar/);
});

test('borrar la cuenta necesita contraseña; sin contraseña, un código', () => {
  assert.equal(pruebaParaBorrar(metodos({ password: true })), 'CONTRASENA');
  assert.equal(pruebaParaBorrar(metodos({ password: false })), 'CODIGO');
});

test('borrar no es un toque: se avisa, se reautentica y se confirma', () => {
  const pantalla = despojarComentarios(leer('app/seguridad.tsx'));
  // Tres pasos, en este orden.
  assert.match(pantalla, /useState<'AVISO' \| 'CONTRASENA' \| 'EN_CURSO' \| null>\(null\)/);
  assert.match(pantalla, /testID="consecuencias-del-borrado"/);
  assert.match(pantalla, /testID="confirmar-borrado"/);
  // Cancelar está siempre a mano.
  assert.match(pantalla, /testID="cancelar-borrado"/);
  assert.match(pantalla, /testID="cancelar-confirmacion"/);
  // Y el botón de borrar no se puede pulsar sin escribir la contraseña.
  assert.match(pantalla, /deshabilitado=\{contrasena === '' \|\| borrando === 'EN_CURSO'\}/);
});

test('se dice la verdad sobre lo que se pierde Y lo que se conserva', () => {
  assert.ok(CONSECUENCIAS_DEL_BORRADO.length >= 3);
  const todo = CONSECUENCIAS_DEL_BORRADO.join(' ');
  assert.match(todo, /No podrás volver a entrar/);
  assert.match(todo, /datos personales/);
  // Lo que se conserva también se cuenta: enterarse después sería peor.
  assert.match(todo, /viajes se conserva/);
  assert.match(todo, /no se puede deshacer/i);
  // Sin patrones engañosos: nada que empuje a borrar.
  assert.ok(!/gratis|mejor|recomendad/i.test(todo));
});

test('cada fallo del borrado tiene su frase, y ninguno miente sobre lo ocurrido', () => {
  assert.equal(interpretarBorrado({ ok: true, datos: {} }).ok, true);
  const malaClave = interpretarBorrado({ ok: false, motivo: 'HTTP', codigo: 'REAUTHENTICATION_REQUIRED' });
  assert.match(malaClave.mensaje, /contraseña no es correcta/);
  const sinRed = interpretarBorrado({ ok: false, motivo: 'SIN_RED', codigo: null });
  assert.match(sinRed.mensaje, /No se eliminó nada/, 'sin red no se borró nada, y hay que decirlo');
  assert.match(interpretarBorrado({ ok: false, motivo: 'HTTP', codigo: 'RATE_LIMITED' }).mensaje, /Demasiados intentos/);
});

test('los estados de la pantalla están todos, y ninguno la deja en blanco', () => {
  assert.equal(interpretarMetodos({ ok: true, datos: metodos() }).estado, 'LISTO');
  assert.equal(interpretarMetodos({ ok: false, motivo: 'SIN_RED', codigo: null }).estado, 'SIN_CONEXION');
  assert.equal(interpretarMetodos({ ok: false, motivo: 'ERROR_DEL_SERVIDOR', codigo: null }).estado, 'ERROR');
  const pantalla = despojarComentarios(leer('app/seguridad.tsx'));
  assert.match(pantalla, /testID="seguridad-cargando"/);
  assert.match(pantalla, /testID="seguridad-error"/);
  assert.match(pantalla, /titulo="Reintentar"/);
  // Vacío: no es un error.
  assert.match(pantalla, /testID="sin-metodos-sociales"/);
  assert.match(pantalla, /No tienes métodos sociales vinculados/);
});

test('no se filtra ningún identificador interno', () => {
  for (const fichero of ['app/seguridad.tsx', 'domain/seguridadDeCuenta.ts', 'services/seguridad.ts']) {
    const fuente = despojarComentarios(leer(fichero));
    for (const prohibido of [/providerSubject/, /passwordHash/, /jwt/i, /\bsub\b/]) {
      assert.ok(!prohibido.test(fuente), `${fichero} no debe exponer ${prohibido}`);
    }
    assert.ok(!/console\.(log|warn|error)/.test(fuente), `${fichero} no debe registrar`);
  }
});

test('tras una mutación se vuelve a preguntar: la lista no es autoridad cacheada', () => {
  const pantalla = despojarComentarios(leer('app/seguridad.tsx'));
  const quitar = pantalla.slice(pantalla.indexOf('const quitar'), pantalla.indexOf('const borrar'));
  assert.match(quitar, /await cargar\(\)/, 'tras desvincular hay que releer');
});

test('al borrar la cuenta se cierra la sesión local y se vuelve al principio', () => {
  const pantalla = despojarComentarios(leer('app/seguridad.tsx'));
  assert.match(pantalla, /await salir\(\)/);
  assert.match(pantalla, /router\.replace\('\/'\)/);
});

test('la fila del perfil por fin lleva a alguna parte', () => {
  const perfil = despojarComentarios(leer('app/perfil.tsx'));
  assert.match(perfil, /if \(clave === 'seguridad'\) router\.push\('\/seguridad'\)/);
  const secciones = leer('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /onFila\('seguridad'\)/);
});
