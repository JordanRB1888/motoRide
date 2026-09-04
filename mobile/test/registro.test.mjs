import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  LARGO_MINIMO_DE_CONTRASENA,
  MENSAJES_DE_REGISTRO,
  destinoTrasRegistrarse,
  digitosDelTelefono,
  normalizarCorreo,
  registroCompleto,
  validarRegistro
} from '../domain/registro.ts';
import { traducirFalloDeRegistro } from '../domain/authDecisions.ts';

/**
 * CREAR UNA CUENTA DESDE LA APLICACIÓN
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que la intención no sea nunca un permiso. Pulsar «Conductor» y crear una
 *    cuenta no convierte a nadie en conductor: nace como pasajera, y el rol lo
 *    concede el backend al aprobar el expediente.
 * 2. Que no haya un segundo sistema de usuarios. Las reglas son las del
 *    servidor, leídas de él.
 * 3. Que un correo ya registrado no se pueda averiguar probando.
 * 4. Que la contraseña no se guarde, ni se registre, ni viaje dos veces.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));
const leerServidor = () => fs.readFileSync(path.resolve(raizMovil, '..', 'server', 'index.js'), 'utf8');

const datos = (extra = {}) => ({
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: 'ana.perez@ejemplo.test',
  telefono: '04141234567',
  contrasena: 'ClaveSegura123',
  ...extra
});

// ---------------------------------------------------------------------------
// Las reglas son las del servidor
// ---------------------------------------------------------------------------

test('las medidas de la validación son las del servidor, leídas de él', () => {
  const servidor = leerServidor();
  const registro = servidor.slice(servidor.indexOf("app.post('/api/auth/register'"), servidor.indexOf("app.get('/api/auth/me'"));

  const contrasena = registro.match(/String\(password \|\| ''\)\.length < (\d+)/);
  assert.ok(contrasena, 'no encuentro el mínimo de contraseña del servidor');
  assert.equal(LARGO_MINIMO_DE_CONTRASENA, Number(contrasena[1]));

  const telefono = registro.match(/phoneDigits\.length < (\d+) \|\| phoneDigits\.length > (\d+)/);
  assert.ok(telefono, 'no encuentro el rango del teléfono');
  assert.equal(validarRegistro(datos({ telefono: '1'.repeat(Number(telefono[1]) - 1) })).phone !== undefined, true);
  assert.equal(validarRegistro(datos({ telefono: '1'.repeat(Number(telefono[2]) + 1) })).phone !== undefined, true);
  assert.equal(validarRegistro(datos({ telefono: '1'.repeat(Number(telefono[1])) })).phone, undefined);

  // El mismo patrón de correo, ni más estricto ni más laxo.
  assert.ok(registro.includes("/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/"), 'el servidor cambió el patrón de correo');
});

test('un registro correcto no tiene nada que objetar', () => {
  assert.deepEqual(validarRegistro(datos()), {});
  assert.equal(registroCompleto(validarRegistro(datos())), true);
});

test('cada campo se comprueba, y con el texto del servidor', () => {
  assert.match(validarRegistro(datos({ nombre: 'A' })).firstName, /nombre es obligatorio/);
  assert.match(validarRegistro(datos({ apellido: '' })).lastName, /apellido es obligatorio/);
  assert.match(validarRegistro(datos({ correo: 'sin-arroba' })).email, /correo válida/);
  assert.match(validarRegistro(datos({ telefono: '123' })).phone, /teléfono válido/);
  assert.match(validarRegistro(datos({ contrasena: 'corta' })).password, /8 caracteres/);
});

test('el correo y el teléfono se normalizan como en el servidor', () => {
  assert.equal(normalizarCorreo('  ANA.Perez@Ejemplo.TEST '), 'ana.perez@ejemplo.test');
  assert.equal(digitosDelTelefono('+58 (414) 123-45-67'), '584141234567');
  // Un correo con mayúsculas y espacios es válido: se normaliza antes de mirar.
  assert.equal(validarRegistro(datos({ correo: '  ANA@Ejemplo.TEST ' })).email, undefined);
});

// ---------------------------------------------------------------------------
// La intención NO es un rol
// ---------------------------------------------------------------------------

test('el registro NO manda ningún rol, y el servidor lo rechazaría', () => {
  const servicio = sinComentarios('services/auth.ts');
  const cuerpo = servicio.slice(servicio.indexOf('export async function crearCuenta'));
  assert.equal(/role/i.test(cuerpo), false, 'el alta de cuenta manda un rol');
  // Y el servidor rechaza cualquier valor que no sea pasajera.
  assert.match(leerServidor(), /if \(role !== 'passenger'\) fields\.role/);
});

test('quien se registra para conducir va a la postulación, no al inicio de conductor', () => {
  assert.equal(destinoTrasRegistrarse('driver'), '/postulacion');
  assert.equal(destinoTrasRegistrarse('passenger'), '/pasajero');
  assert.equal(destinoTrasRegistrarse(null), '/pasajero');
  assert.equal(destinoTrasRegistrarse(), '/pasajero');
  // Nunca al inicio de conductor: esa cuenta todavía no lo es.
  for (const intencion of ['driver', 'passenger', null]) {
    assert.notEqual(destinoTrasRegistrarse(intencion), '/conductor');
  }
});

test('la pantalla de acceso no asigna roles ni firma sesiones', () => {
  const pantalla = sinComentarios('app/acceso.tsx');
  const alta = pantalla.slice(pantalla.indexOf('const crearLaCuenta'), pantalla.indexOf('const enviar'));
  assert.equal(/role\s*[:=]/.test(alta), false);
  assert.equal(/signToken|jwt|firmar/i.test(alta), false);
  // La sesión se abre por el contexto, que es el único que guarda el token.
  assert.match(pantalla, /const \{ entrar, registrar, sesion \} = useSesion\(\)/);
  assert.match(sinComentarios('context/AuthContext.tsx'), /await guardarToken\(resultado\.token\)/);
});

// ---------------------------------------------------------------------------
// Lo que el servidor responde, traducido
// ---------------------------------------------------------------------------

const fallo = (extra = {}) => ({ ok: false, motivo: 'HTTP', codigo: null, mensaje: '', ...extra });

test('una cuenta que ya existe se dice sin decir cuál de los dos datos es', () => {
  const traducido = traducirFalloDeRegistro(fallo({ codigo: 'USER_EXISTS' }));
  assert.equal(traducido.motivo, 'CUENTA_EXISTENTE');
  const mensaje = MENSAJES_DE_REGISTRO.CUENTA_EXISTENTE;
  // Ofrece la salida —entrar— sin confirmar cuál de los dos estaba registrado.
  assert.match(mensaje, /Entra con ella/);
  assert.equal(/el correo ya|ese correo está|teléfono ya está/i.test(mensaje), false);
});

test('los campos que devuelve el servidor llegan al formulario', () => {
  const traducido = traducirFalloDeRegistro(fallo({
    codigo: 'VALIDATION_FAILED',
    detalle: { fields: { email: 'Introduce una dirección de correo válida.', password: 'Corta.' } }
  }));
  assert.equal(traducido.motivo, 'DATOS_INVALIDOS');
  assert.equal(traducido.campos.email, 'Introduce una dirección de correo válida.');
  assert.equal(traducido.campos.password, 'Corta.');
});

test('un cuerpo raro no rompe el formulario', () => {
  for (const detalle of [null, undefined, 'texto', { fields: 'no es un objeto' }, { fields: { email: 42 } }]) {
    const traducido = traducirFalloDeRegistro(fallo({ codigo: 'VALIDATION_FAILED', detalle }));
    assert.equal(traducido.motivo, 'DATOS_INVALIDOS');
  }
});

test('la red, el límite y lo desconocido tienen su propio motivo', () => {
  assert.equal(traducirFalloDeRegistro(fallo({ motivo: 'SIN_RED' })).motivo, 'SIN_CONEXION');
  assert.equal(traducirFalloDeRegistro(fallo({ motivo: 'TIEMPO_AGOTADO' })).motivo, 'SIN_CONEXION');
  assert.equal(traducirFalloDeRegistro(fallo({ codigo: 'RATE_LIMITED' })).motivo, 'DEMASIADOS_INTENTOS');
  assert.equal(traducirFalloDeRegistro(fallo({ codigo: 'ALGO_NUEVO' })).motivo, 'ERROR_DEL_SERVIDOR');
});

test('ningún mensaje enseña tripas', () => {
  for (const [motivo, mensaje] of Object.entries(MENSAJES_DE_REGISTRO)) {
    assert.ok(mensaje.length > 15, motivo);
    assert.equal(/\{|\}|error:|stack|SQL|JWT|token|4\d\d|5\d\d/i.test(mensaje), false, motivo);
  }
});

// ---------------------------------------------------------------------------
// Un solo usuario aunque se pulse dos veces
// ---------------------------------------------------------------------------

test('el segundo toque no manda otra petición', () => {
  const pantalla = sinComentarios('app/acceso.tsx');
  assert.match(pantalla, /if \(creandoCuenta\) return;/);
  assert.match(pantalla, /setCreandoCuenta\(true\)/);
  // Y el botón espera mientras tanto.
  assert.match(sinComentarios('ui/Registro.tsx'), /deshabilitado=\{!puedeEnviar \|\| creando\}/);
});

test('el servidor comprueba el duplicado DOS veces, antes y después de cifrar', () => {
  // Cifrar cede el hilo: entre la primera comprobación y la escritura cabe otra
  // petición. Por eso el servidor vuelve a mirar justo antes de guardar, y eso
  // es lo que impide que un doble toque cree dos cuentas.
  const servidor = leerServidor();
  const registro = servidor.slice(servidor.indexOf("app.post('/api/auth/register'"), servidor.indexOf("app.get('/api/auth/me'"));
  const comprobaciones = [...registro.matchAll(/USER_EXISTS/g)].length;
  assert.ok(comprobaciones >= 2, `sólo hay ${comprobaciones} comprobación de duplicado`);
  const hash = registro.indexOf('bcrypt.hash');
  const segunda = registro.lastIndexOf('USER_EXISTS');
  assert.ok(segunda > hash, 'la segunda comprobación debe ir después de cifrar');
});

test('el registro tiene su propio limitador, no el de la lectura del expediente', () => {
  const servidor = leerServidor();
  assert.match(servidor, /registro: createIdentityLimiter\(\{ name: 'registro'/);
  assert.match(servidor, /app\.post\('\/api\/auth\/register', credenciales\.registro/);
});

// ---------------------------------------------------------------------------
// La contraseña no se queda en ningún sitio
// ---------------------------------------------------------------------------

test('la contraseña no se guarda, ni se registra, ni se reporta', () => {
  for (const relativa of ['app/acceso.tsx', 'domain/registro.ts', 'services/auth.ts', 'context/AuthContext.tsx']) {
    const codigo = sinComentarios(relativa);
    assert.equal(/console\.(log|warn|error|info)/.test(codigo), false, `${relativa} registra algo`);
    assert.equal(/AsyncStorage|Sentry|analytics/i.test(codigo), false, `${relativa} persiste o reporta`);
  }
  // El almacén seguro sólo guarda el token, nunca la contraseña.
  const sesion = sinComentarios('services/session.ts');
  assert.equal(/contrasena|password/i.test(sesion), false, 'el almacén de sesión toca la contraseña');
});

// ---------------------------------------------------------------------------
// La pantalla es la de Antigravity, cableada
// ---------------------------------------------------------------------------

test('el registro vive en la pantalla de acceso, montado y no copiado', () => {
  // Antigravity integró las dos vías —entrar y crear cuenta— en una sola
  // pantalla con su selector. Aquí se cablea su hoja; no se dibuja otra.
  const pantalla = sinComentarios('app/acceso.tsx');
  assert.match(pantalla, /import \{ HojaDeRegistro, SelectorDeCaminoAuth \} from '\.\.\/ui\/Registro'/);
  assert.match(pantalla, /<HojaDeRegistro/);
  // Y ya no queda la promesa de que las altas llegarían «próximamente».
  assert.equal(/se conectará próximamente/.test(pantalla), false);
});

test('la superficie de Antigravity sigue sin lógica de negocio', () => {
  const tarjeta = leer('ui/Registro.tsx');
  assert.equal(/fetch\(|useRouter\(/.test(tarjeta), false);
  assert.equal(/auth\/register|driver-applications/.test(tarjeta), false);
  // Y conserva sus dos caminos y sus dos textos de botón.
  assert.match(tarjeta, /Crear cuenta y postularme/);
  assert.match(tarjeta, /'passenger' \| 'driver'/);
});

test('Google y Apple siguen sin fingir que funcionan', () => {
  const tarjeta = leer('ui/Registro.tsx');
  assert.match(tarjeta, /AVISO_DE_NO_DISPONIBLE/);
  assert.equal(/signInWithGoogle|GoogleSignin|AppleAuthentication/.test(tarjeta), false);
});
