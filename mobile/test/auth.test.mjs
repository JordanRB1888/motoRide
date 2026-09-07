import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ESTADOS_DE_SESION,
  experienciaDeLaIdentidad,
  leerIdentidad,
  puedeOperarComoConductor,
  tieneAutoridadFresca,
  usuarioConocido
} from '../domain/authState.ts';
import {
  decidirValidacion,
  interpretarLogin,
  traducirFalloDeLogin
} from '../domain/authDecisions.ts';

/**
 * MOBILE WAVE 1 — autenticación y sesión.
 *
 * Todo puro: ninguna prueba abre la red ni necesita emulador. Eso es
 * consecuencia de que las decisiones vivan en `domain/` y no detrás de
 * `expo-secure-store`.
 */

const CONDUCTOR_APROBADO = {
  id: 'u1', role: 'driver', firstName: 'Ana', lastName: 'Pérez',
  isVerified: true, accountStatus: 'ACTIVE'
};
const PASAJERA = {
  id: 'u2', role: 'passenger', firstName: 'Luis', lastName: 'Gómez',
  isVerified: false, accountStatus: 'ACTIVE'
};

const fallo = (motivo, codigo = null, mensaje = 'x') => ({ ok: false, motivo, codigo, mensaje });

// ---------------------------------------------------------------------------
// La identidad: lo que se acepta del backend
// ---------------------------------------------------------------------------

test('una identidad completa se lee', () => {
  const identidad = leerIdentidad({ ...CONDUCTOR_APROBADO, walletBalance: 50, phone: '0414' });
  assert.ok(identidad);
  assert.equal(identidad.id, 'u1');
  assert.equal(identidad.role, 'driver');
  assert.equal(identidad.isVerified, true);
  // Sólo lo necesario: no se arrastra el objeto entero como verdad permanente.
  assert.deepEqual(Object.keys(identidad).sort(),
    ['accountStatus', 'firstName', 'isVerified', 'lastName', 'role', 'id'].sort());
});

test('una identidad a medias se rechaza entera', () => {
  // Rellenar huecos con valores por defecto produciría una identidad que parece
  // válida y falla más tarde, donde ya nadie relaciona la causa.
  for (const roto of [null, undefined, {}, 'texto', { id: 'u1' }, { role: 'driver' },
    { id: '', role: 'driver' }, { id: 'u1', role: 'superadmin' }]) {
    assert.equal(leerIdentidad(roto), null, JSON.stringify(roto));
  }
});

test('isVerified sólo es cierto con el `true` EXPLÍCITO', () => {
  // Cualquier otra cosa se lee como no verificado, que es el lado seguro.
  for (const valor of ['true', 1, 'yes', {}, [], 'sí']) {
    const identidad = leerIdentidad({ ...CONDUCTOR_APROBADO, isVerified: valor });
    assert.equal(identidad.isVerified, false, String(valor));
  }
  assert.equal(leerIdentidad({ ...CONDUCTOR_APROBADO, isVerified: true }).isVerified, true);
});

// ---------------------------------------------------------------------------
// Autoridad: sólo AUTENTICADO permite
// ---------------------------------------------------------------------------

test('SÓLO el estado AUTENTICADO da autoridad fresca', () => {
  assert.equal(tieneAutoridadFresca({ estado: 'AUTENTICADO', usuario: PASAJERA }), true);

  for (const sesion of [
    { estado: 'ARRANCANDO' },
    { estado: 'SIN_SESION', motivo: null },
    { estado: 'AUTENTICANDO' },
    // La clave: hay token guardado, pero NADIE ha confirmado que valga.
    { estado: 'SIN_VERIFICAR', usuario: PASAJERA }
  ]) {
    assert.equal(tieneAutoridadFresca(sesion), false, sesion.estado);
  }
});

test('SIN_VERIFICAR muestra al usuario pero NO autoriza', () => {
  const sesion = { estado: 'SIN_VERIFICAR', usuario: CONDUCTOR_APROBADO };
  // Sirve para saludar…
  assert.equal(usuarioConocido(sesion)?.firstName, 'Ana');
  // …y para nada más.
  assert.equal(tieneAutoridadFresca(sesion), false);
  assert.equal(puedeOperarComoConductor(sesion), false);
});

test('todos los estados declarados existen en el contrato', () => {
  assert.deepEqual([...ESTADOS_DE_SESION].sort(),
    ['ARRANCANDO', 'AUTENTICADO', 'AUTENTICANDO', 'SIN_SESION', 'SIN_VERIFICAR'].sort());
});

// ---------------------------------------------------------------------------
// Conductor: el rol del token NO basta
// ---------------------------------------------------------------------------

test('un conductor APROBADO puede operar', () => {
  assert.equal(
    puedeOperarComoConductor({ estado: 'AUTENTICADO', usuario: CONDUCTOR_APROBADO }),
    true
  );
});

test('role=driver SIN isVerified NO puede operar', () => {
  // El caso que importa: el JWT se firmó hace días y lleva `role: 'driver'`,
  // pero el backend exige además la aprobación. Un conductor suspendido ayer
  // sigue teniendo un token con ese claim.
  const sinAprobar = { ...CONDUCTOR_APROBADO, isVerified: false };
  assert.equal(puedeOperarComoConductor({ estado: 'AUTENTICADO', usuario: sinAprobar }), false);
});

test('una cuenta DESHABILITADA no puede operar aunque esté verificada', () => {
  const deshabilitado = { ...CONDUCTOR_APROBADO, accountStatus: 'DISABLED' };
  assert.equal(puedeOperarComoConductor({ estado: 'AUTENTICADO', usuario: deshabilitado }), false);
});

test('una pasajera nunca opera como conductora', () => {
  // Ni forzando isVerified: el rol lo dice el backend.
  const forzada = { ...PASAJERA, isVerified: true };
  assert.equal(puedeOperarComoConductor({ estado: 'AUTENTICADO', usuario: forzada }), false);
});

test('la experiencia la decide la identidad REAL, no lo elegido', () => {
  assert.equal(experienciaDeLaIdentidad(CONDUCTOR_APROBADO), 'driver');
  assert.equal(experienciaDeLaIdentidad(PASAJERA), 'passenger');
  // Alguien que eligió «Conductor» pero cuya cuenta es de pasajera acaba en la
  // experiencia de pasajera.
  assert.equal(experienciaDeLaIdentidad({ ...PASAJERA, isVerified: true }), 'passenger');
});

// ---------------------------------------------------------------------------
// Login: cada error, su mensaje
// ---------------------------------------------------------------------------

test('los códigos reales del backend se traducen uno a uno', () => {
  const casos = [
    ['INVALID_CREDENTIALS', 'CREDENCIALES_INVALIDAS'],
    ['ACCOUNT_DISABLED', 'CUENTA_DESHABILITADA'],
    ['DRIVER_APPLICATION_NOT_APPROVED', 'CONDUCTOR_NO_APROBADO']
  ];
  for (const [codigo, esperado] of casos) {
    const resultado = traducirFalloDeLogin(fallo('ERROR_DEL_SERVIDOR', codigo));
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, esperado, codigo);
  }
});

test('sin red y tiempo agotado se cuentan como sin conexión', () => {
  assert.equal(traducirFalloDeLogin(fallo('SIN_RED')).motivo, 'SIN_CONEXION');
  assert.equal(traducirFalloDeLogin(fallo('TIEMPO_AGOTADO')).motivo, 'SIN_CONEXION');
});

test('el limitador de credenciales se distingue', () => {
  assert.equal(traducirFalloDeLogin(fallo('ERROR_DEL_SERVIDOR', 'RATE_LIMITED')).motivo,
    'DEMASIADOS_INTENTOS');
  assert.equal(
    traducirFalloDeLogin(fallo('ERROR_DEL_SERVIDOR', null, 'El servidor respondió 429.')).motivo,
    'DEMASIADOS_INTENTOS'
  );
});

test('un 401 sin código conocido es credenciales', () => {
  assert.equal(traducirFalloDeLogin(fallo('NO_AUTENTICADO')).motivo, 'CREDENCIALES_INVALIDAS');
});

test('un login a medias se rechaza entero', () => {
  // Token sin identidad, o identidad sin token: ninguna de las dos es una
  // sesión. Aceptar media parecería funcionar y fallaría después.
  for (const cuerpo of [
    {},
    { token: 'abc' },
    { user: CONDUCTOR_APROBADO },
    { token: '', user: CONDUCTOR_APROBADO },
    { token: 'abc', user: { id: 'u1' } }
  ]) {
    const resultado = interpretarLogin(cuerpo);
    assert.equal(resultado.ok, false, JSON.stringify(cuerpo));
    assert.equal(resultado.motivo, 'RESPUESTA_INESPERADA');
  }
});

test('un login completo devuelve token e identidad', () => {
  const resultado = interpretarLogin({ token: 'jwt-de-prueba', user: CONDUCTOR_APROBADO });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.token, 'jwt-de-prueba');
  assert.equal(resultado.usuario.role, 'driver');
});

// ---------------------------------------------------------------------------
// LA DECISIÓN MÁS DELICADA: cuándo se borra la sesión
// ---------------------------------------------------------------------------

test('el backend confirma → sesión VÁLIDA', () => {
  const decision = decidirValidacion({ ok: true, datos: CONDUCTOR_APROBADO });
  assert.equal(decision.resultado, 'VALIDA');
  assert.equal(decision.usuario.id, 'u1');
});

test('401 del backend → INVÁLIDA (se borra el token)', () => {
  assert.equal(decidirValidacion(fallo('NO_AUTENTICADO', 'INVALID_SESSION')).resultado, 'INVALIDA');
  assert.equal(decidirValidacion(fallo('NO_AUTENTICADO', 'AUTH_REQUIRED')).resultado, 'INVALIDA');
});

test('cuenta deshabilitada → INVÁLIDA', () => {
  assert.equal(
    decidirValidacion(fallo('ERROR_DEL_SERVIDOR', 'ACCOUNT_DISABLED')).resultado,
    'INVALIDA'
  );
});

test('SIN RED → NO se borra la sesión', () => {
  // Cerrarle la sesión a alguien porque iba en el metro es un fallo que se nota
  // enseguida y molesta mucho.
  for (const motivo of ['SIN_RED', 'TIEMPO_AGOTADO', 'SIN_CONFIGURACION']) {
    assert.equal(decidirValidacion(fallo(motivo)).resultado, 'SIN_CONEXION', motivo);
  }
});

test('un 500 del servidor tampoco borra la sesión', () => {
  // Un fallo temporal del servidor no puede cerrarle la sesión a todo el mundo
  // a la vez.
  assert.equal(decidirValidacion(fallo('ERROR_DEL_SERVIDOR', 'INTERNAL')).resultado,
    'SIN_CONEXION');
});

test('un 200 con cuerpo ilegible se trata como INVÁLIDA', () => {
  // El lado seguro: si no se entiende quién es, no se entra.
  for (const datos of [null, 'texto', {}, { id: 'u1' }]) {
    assert.equal(decidirValidacion({ ok: true, datos }).resultado, 'INVALIDA', JSON.stringify(datos));
  }
});

// ---------------------------------------------------------------------------
// Reglas sobre el código de autenticación
// ---------------------------------------------------------------------------

test('el móvil NO verifica ni decodifica el JWT por su cuenta', () => {
  // El backend recarga el usuario de la base en cada petición. Decidir desde
  // los claims sería crear una segunda autoridad, desactualizada por diseño.
  const soloCodigo = texto =>
    texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  for (const ruta of ['../services/auth.ts', '../domain/authDecisions.ts',
    '../domain/authState.ts', '../context/AuthContext.tsx']) {
    const codigo = soloCodigo(fs.readFileSync(new URL(ruta, import.meta.url), 'utf8'));
    assert.equal(/jwt[-.]?decode|atob\(|jwtDecode|verify\(/i.test(codigo), false,
      `${ruta} decodifica o verifica el token`);
  }
});

test('no se inventó un endpoint de cierre de sesión', () => {
  // El backend no tiene revocación: se comprobó leyendo `server/index.js`.
  // Inventar `POST /api/auth/logout` daría 404 y parecería que algo se rompió.
  const auth = fs.readFileSync(new URL('../services/auth.ts', import.meta.url), 'utf8');
  assert.equal(/auth\/logout|auth\/revoke|auth\/signout/.test(auth), false);
  assert.match(auth, /BACKEND_TIENE_CIERRE_DE_SESION = false/);
});

test('la contraseña no se registra en ningún sitio', () => {
  const soloCodigo = texto =>
    texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  for (const ruta of ['../app/acceso.tsx', '../services/auth.ts', '../context/AuthContext.tsx']) {
    const codigo = soloCodigo(fs.readFileSync(new URL(ruta, import.meta.url), 'utf8'));
    assert.equal(
      /console\.\w+\([^)]*(contrasena|password|credenciales)/i.test(codigo), false,
      `${ruta} registra la contraseña`
    );
  }
});

test('el formulario oculta la contraseña y la limpia al entrar', () => {
  const acceso = fs.readFileSync(new URL('../app/acceso.tsx', import.meta.url), 'utf8');
  assert.match(acceso, /secureTextEntry/);
  assert.match(acceso, /setContrasena\(''\)/, 'se limpia del estado tras el acceso');
});

test('los endpoints usados son los REALES del backend', () => {
  const auth = fs.readFileSync(new URL('../services/auth.ts', import.meta.url), 'utf8');
  const servidor = fs.readFileSync(
    new URL('../../server/index.js', import.meta.url), 'utf8'
  );

  for (const ruta of ['/api/auth/login', '/api/auth/me']) {
    assert.ok(auth.includes(ruta), `el móvil usa ${ruta}`);
    assert.ok(servidor.includes(`'${ruta}'`), `el backend expone ${ruta}`);
  }
});
