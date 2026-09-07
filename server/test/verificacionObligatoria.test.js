import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * UNA CUENTA SIN VERIFICAR NO PUEDE USAR LA APLICACIÓN
 *
 * EL AGUJERO QUE ESTO CIERRA
 *
 * `POST /api/auth/register` crea la cuenta y devuelve el token en el acto, y
 * durante un tiempo NADIE comprobó después si el contacto se había verificado.
 * Con un correo inventado se podía pedir una carrera de verdad, a un conductor
 * de verdad, que se desplaza de verdad — y sin forma de avisar a nadie luego.
 * Lo encontró el dueño registrándose y notando que nunca le pidieron el código.
 *
 * LA PARTE DELICADA
 *
 * La guarda NO puede exigir `emailVerified === true` a secas: el administrador
 * que se siembra al arrancar y los conductores que crea el panel no tienen ese
 * campo en absoluto, y quedarían encerrados fuera de su propia aplicación. Un
 * campo ausente es «anterior a esta comprobación»; un `false` es «lo sabemos y
 * no lo ha hecho». Esta prueba fija esa diferencia.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(aqui, '..', 'index.js'), 'utf8');

/** La misma función que hay en el servidor, para poder ejercerla aquí. */
function contactoSinVerificar(user) {
  if (!user) return false;
  if (user.role === 'admin') return false;
  const declarado = user.emailVerified !== undefined || user.phoneVerified !== undefined;
  if (!declarado) return false;
  return user.emailVerified !== true && user.phoneVerified !== true;
}

test('la guarda del servidor es exactamente la que se ejerce aquí', () => {
  // Si alguien cambia la del servidor y no ésta, la prueba deja de significar
  // nada. Se comprueba que las dos siguen diciendo lo mismo.
  const enElServidor = fuente.slice(
    fuente.indexOf('function contactoSinVerificar'),
    fuente.indexOf('function requireContactoVerificado')
  );
  for (const trozo of [
    "if (user.role === 'admin') return false;",
    'user.emailVerified !== undefined || user.phoneVerified !== undefined',
    'return user.emailVerified !== true && user.phoneVerified !== true;'
  ]) {
    assert.ok(enElServidor.includes(trozo), `la guarda del servidor cambió: falta ${trozo}`);
  }
});

test('una cuenta recién registrada NO pasa', () => {
  // Es la forma exacta que deja `POST /api/auth/register`.
  assert.equal(contactoSinVerificar({ role: 'passenger', emailVerified: false, phoneVerified: false }), true);
});

test('verificar el correo O el teléfono basta', () => {
  assert.equal(contactoSinVerificar({ role: 'passenger', emailVerified: true, phoneVerified: false }), false);
  assert.equal(contactoSinVerificar({ role: 'passenger', emailVerified: false, phoneVerified: true }), false);
});

test('el administrador sembrado al arrancar NO se queda fuera', () => {
  // No tiene ninguno de los dos campos. Exigir `=== true` lo habría dejado sin
  // poder entrar a su propio panel, que es como se rompe una aplicación entera
  // por cerrar una puerta de más.
  assert.equal(contactoSinVerificar({ id: 'admin_1', role: 'admin' }), false);
});

test('un conductor creado por el panel tampoco', () => {
  // El panel los crea sin `emailVerified`: su identidad la respalda el
  // administrador que los dio de alta, no un código.
  assert.equal(contactoSinVerificar({ role: 'driver', isVerified: true }), false);
});

test('lo que se cierra es lo que cuesta dinero o mueve a alguien', () => {
  const cerrados = [
    ["app.post('/api/trips/create'", 'pedir una carrera mueve a un conductor de verdad'],
    ["app.post('/api/pricing/estimate'", 'cada estimación puede ser una llamada de PAGO a Google'],
    ["app.get('/api/places/search'", 'la búsqueda de lugares también se paga'],
    ["app.post('/api/wallet/topups'", 'es dinero']
  ];
  for (const [ruta, porque] of cerrados) {
    const inicio = fuente.indexOf(ruta);
    assert.ok(inicio !== -1, `desapareció ${ruta}`);
    const declaracion = fuente.slice(inicio, fuente.indexOf('\n', inicio));
    assert.ok(
      declaracion.includes('requireContactoVerificado'),
      `${ruta} quedó abierta a cuentas sin verificar, y ${porque}`
    );
  }
});

test('lo que permite verificarse o marcharse queda ABIERTO', () => {
  // Bloquear esto dejaría a alguien encerrado: con sesión, sin poder
  // verificarse y sin poder irse.
  for (const ruta of ["app.get('/api/auth/me'", "app.post('/api/auth/login'", "app.post('/api/auth/register'"]) {
    const inicio = fuente.indexOf(ruta);
    assert.ok(inicio !== -1, `desapareció ${ruta}`);
    const declaracion = fuente.slice(inicio, fuente.indexOf('\n', inicio));
    assert.equal(
      declaracion.includes('requireContactoVerificado'),
      false,
      `${ruta} se cerró, y por ahí es por donde alguien se verifica o se va`
    );
  }

  // Y las rutas de verificación viven en su propio router, sin la guarda.
  const auth = fs.readFileSync(path.join(aqui, '..', 'routes', 'auth.js'), 'utf8');
  assert.equal(
    auth.includes('requireContactoVerificado'),
    false,
    'se cerró el propio camino para verificarse'
  );
});

test('el fallo se distingue de un «no autorizado» cualquiera', () => {
  // La aplicación tiene que poder llevar a la persona a la pantalla del código
  // en vez de enseñar un error que no dice qué hacer.
  assert.match(fuente, /error: 'CONTACT_NOT_VERIFIED'/);
  assert.match(fuente, /res\.status\(403\)\.json\(\{ error: 'CONTACT_NOT_VERIFIED' \}\)/);
});
