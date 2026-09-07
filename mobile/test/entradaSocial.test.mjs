import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  ESTADOS_SOCIALES,
  NOMBRE_DEL_PROVEEDOR,
  destinoTrasEntrar,
  esFalloQueSeAvisa,
  interpretarEntradaSocial,
  interpretarResultadoDelProveedor,
  proveedoresOfrecibles,
  socialOcupado
} from '../domain/entradaSocial.ts';

/**
 * ENTRAR CON GOOGLE Y CON APPLE
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que el proveedor demuestre QUIÉN eres y no te dé un ROL: quien nace por
 *    Google o Apple nace pasajero, y el destino lo decide el servidor.
 * 2. Que el cliente no mande nunca correo, nombre o identificador como prueba:
 *    lo único que vale es el token firmado.
 * 3. Que cancelar no se enseñe como un error.
 * 4. Que un correo repetido NO fusione cuentas.
 * 5. Que ni el token ni el identificador de la cuenta se registren.
 * 6. Que la pantalla no importe las bibliotecas: una sola puerta.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

const fallo = (codigo, extra = {}) => ({
  ok: false,
  motivo: 'ERROR_DEL_SERVIDOR',
  codigo,
  mensaje: 'da igual',
  ...extra
});

const cuenta = (role, extra = {}) => ({
  id: 'u1',
  role,
  firstName: 'Ana',
  lastName: 'Prueba',
  isVerified: role === 'driver',
  accountStatus: 'ACTIVE',
  ...extra
});

// ---------------------------------------------------------------------------
// El rol lo da el servidor
// ---------------------------------------------------------------------------

test('el destino lo decide el ROL del servidor, no la intención con la que se pulsó', () => {
  // Quien acaba de nacer por Google es pasajero: con intención de conductor va
  // a la postulación, JAMÁS al inicio de conductor.
  assert.equal(destinoTrasEntrar(cuenta('passenger'), 'driver'), '/postulacion');
  assert.equal(destinoTrasEntrar(cuenta('passenger'), 'passenger'), '/pasajero');
  // Un conductor aprobado va a su inicio, entrara por la puerta que entrara.
  assert.equal(destinoTrasEntrar(cuenta('driver'), 'passenger'), '/conductor');
  assert.equal(destinoTrasEntrar(cuenta('driver'), 'driver'), '/conductor');
  assert.equal(destinoTrasEntrar(cuenta('passenger'), null), '/pasajero');
});

test('no hay una segunda regla de destino: se reutiliza la de la contraseña', () => {
  const dominio = leer('domain/entradaSocial.ts');
  assert.match(dominio, /export \{ destinoTrasEntrar \} from '\.\/entrada'/);
  // Escribir aquí otra versión sería crear un sitio donde la regla pudiera
  // divergir, y el día que divergiera Google concedería algo que la contraseña
  // no concede.
  assert.ok(!/function destinoTrasEntrar/.test(dominio), 'no se reimplementa la regla');
});

// ---------------------------------------------------------------------------
// El cliente no es autoridad
// ---------------------------------------------------------------------------

test('lo único que viaja como prueba es el token del proveedor', () => {
  const servicio = despojarComentarios(leer('services/social.ts'));
  const cuerpo = servicio.slice(servicio.indexOf('entrarConProveedor'), servicio.indexOf('vincularProveedor'));
  assert.match(cuerpo, /token: peticion\.token/);
  // El nombre viaja como sugerencia para la ficha, y el servidor lo sanea.
  assert.match(cuerpo, /firstName: peticion\.nombre/);
  // Y nunca como prueba: ni correo, ni proveedor, ni identificador de cuenta.
  for (const prohibido of [/email:/, /provider:/, /\bsub:/, /emailVerified/]) {
    assert.ok(!prohibido.test(cuerpo), `el cliente no debe mandar ${prohibido}`);
  }
});

test('entrar NO lleva la sesión, y vincular SÍ: son dos acciones distintas', () => {
  const servicio = despojarComentarios(leer('services/social.ts'));
  const entrar = servicio.slice(servicio.indexOf('/auth/social/$'), servicio.indexOf('vincularProveedor'));
  assert.match(entrar, /conSesion: false/, 'con sesión adjunta el servidor vincularía en vez de entrar');
  const vincular = servicio.slice(servicio.indexOf('/auth/identities/link/'));
  assert.match(vincular, /conSesion: true/, 'la sesión ES la prueba al vincular');
});

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

test('los doce estados existen y los de operación en curso protegen el botón', () => {
  assert.deepEqual([...ESTADOS_SOCIALES].sort(), [
    'ABRIENDO_PROVEEDOR', 'CANCELADO', 'ENTRADO', 'ERROR_DEL_SERVIDOR', 'ESPERANDO_PROVEEDOR',
    'FALLO_DEL_PROVEEDOR', 'HACE_FALTA_VINCULAR', 'IDENTIDAD_OCUPADA', 'REPOSO', 'SIN_CONEXION',
    'TOKEN_RECHAZADO', 'VERIFICANDO_CON_SERVIDOR'
  ]);
  assert.equal(socialOcupado('ABRIENDO_PROVEEDOR'), true);
  assert.equal(socialOcupado('ESPERANDO_PROVEEDOR'), true);
  assert.equal(socialOcupado('VERIFICANDO_CON_SERVIDOR'), true);
  assert.equal(socialOcupado('REPOSO'), false);
  assert.equal(socialOcupado('CANCELADO'), false);
});

test('CANCELADO no es un error: no se avisa de él', () => {
  assert.equal(esFalloQueSeAvisa('CANCELADO'), false);
  assert.equal(esFalloQueSeAvisa('ENTRADO'), false);
  assert.equal(esFalloQueSeAvisa('REPOSO'), false);
  // Los que sí son fallos, sí.
  for (const estado of ['SIN_CONEXION', 'FALLO_DEL_PROVEEDOR', 'TOKEN_RECHAZADO', 'HACE_FALTA_VINCULAR', 'IDENTIDAD_OCUPADA', 'ERROR_DEL_SERVIDOR']) {
    assert.equal(esFalloQueSeAvisa(estado), true, estado);
  }
});

test('cerrar el selector vuelve limpio: sin aviso y sin crear nada', () => {
  const cancelado = interpretarResultadoDelProveedor({ estado: 'CANCELADO' }, 'GOOGLE');
  assert.equal(cancelado.estado, 'CANCELADO');
  assert.equal(cancelado.mensaje, undefined, 'no hay nada que contarle a nadie');
  const pantalla = despojarComentarios(leer('app/acceso.tsx'));
  assert.match(pantalla, /esFalloQueSeAvisa\(corte\.estado\) \? corte\.mensaje \?\? null : null/);
});

test('un token que el proveedor no entrega es un fallo, no una cancelación', () => {
  const roto = interpretarResultadoDelProveedor({ estado: 'FALLO_DEL_PROVEEDOR' }, 'GOOGLE');
  assert.equal(roto.estado, 'FALLO_DEL_PROVEEDOR');
  assert.match(roto.mensaje, /Google/);
  const noHay = interpretarResultadoDelProveedor({ estado: 'NO_DISPONIBLE' }, 'APPLE');
  assert.match(noHay.mensaje, /no está disponible en este dispositivo/);
  // Con token, no hay corte: toca preguntar al servidor.
  assert.equal(interpretarResultadoDelProveedor({ estado: 'TOKEN' }, 'GOOGLE'), null);
});

// ---------------------------------------------------------------------------
// Respuestas del servidor
// ---------------------------------------------------------------------------

test('una entrada correcta trae la sesión de +58Express, no la del proveedor', () => {
  const resultado = interpretarEntradaSocial(
    { ok: true, datos: { status: 'created', user: cuenta('passenger'), token: 'jwt-de-58express' } },
    'GOOGLE'
  );
  assert.equal(resultado.estado, 'ENTRADO');
  assert.equal(resultado.usuario.role, 'passenger');
  assert.equal(resultado.token, 'jwt-de-58express');
});

test('cada error del servidor tiene su estado y su frase, y nombra al proveedor', () => {
  const casos = [
    ['INVALID_PROVIDER_TOKEN', 'TOKEN_RECHAZADO', /No pudimos comprobar tu cuenta/],
    ['ACCOUNT_LINK_REQUIRED', 'HACE_FALTA_VINCULAR', /Entra con tu contraseña/],
    ['IDENTITY_TAKEN', 'IDENTIDAD_OCUPADA', /ya está vinculada a otro usuario/],
    ['SOCIAL_PROVIDER_NOT_CONFIGURED', 'ERROR_DEL_SERVIDOR', /no está disponible/],
    ['ACCOUNT_DISABLED', 'ERROR_DEL_SERVIDOR', /desactivada/],
    ['ALGO_QUE_NO_CONOCEMOS', 'ERROR_DEL_SERVIDOR', /Inténtalo de nuevo/]
  ];
  const mensajes = new Set();
  for (const [codigo, estado, frase] of casos) {
    const resultado = interpretarEntradaSocial(fallo(codigo), 'GOOGLE');
    assert.equal(resultado.estado, estado, codigo);
    assert.match(resultado.mensaje, frase, codigo);
    mensajes.add(resultado.mensaje);
  }
  assert.equal(mensajes.size, casos.length, 'cada caso dice algo distinto');
  // Y el mensaje nombra al proveedor por el que se intentó entrar.
  assert.match(interpretarEntradaSocial(fallo('IDENTITY_TAKEN'), 'APPLE').mensaje, /Apple/);
  assert.equal(NOMBRE_DEL_PROVEEDOR.GOOGLE, 'Google');
  assert.equal(NOMBRE_DEL_PROVEEDOR.APPLE, 'Apple');
});

test('el correo repetido NO fusiona cuentas: manda demostrar la que ya existe', () => {
  const resultado = interpretarEntradaSocial(fallo('ACCOUNT_LINK_REQUIRED'), 'GOOGLE');
  assert.equal(resultado.estado, 'HACE_FALTA_VINCULAR');
  assert.ok(!('token' in resultado) || resultado.token === undefined, 'no se entrega ninguna sesión');
  assert.equal(resultado.usuario, undefined);
  assert.match(resultado.mensaje, /Entra con tu contraseña y después podrás vincular/);
});

test('sin conexión es su propio estado, no un token rechazado', () => {
  for (const motivo of ['SIN_RED', 'TIEMPO_AGOTADO', 'SIN_CONFIGURACION']) {
    const resultado = interpretarEntradaSocial({ ok: false, motivo, codigo: null }, 'GOOGLE');
    assert.equal(resultado.estado, 'SIN_CONEXION', motivo);
    assert.match(resultado.mensaje, /No hay conexión/);
  }
});

// ---------------------------------------------------------------------------
// Disponibilidad
// ---------------------------------------------------------------------------

test('un proveedor se ofrece sólo si el SERVIDOR lo tiene y la plataforma lo soporta', () => {
  const delServidor = [
    { provider: 'GOOGLE', available: true },
    { provider: 'APPLE', available: true }
  ];
  // En Android, Apple no se ofrece aunque el servidor lo tenga configurado.
  assert.deepEqual(proveedoresOfrecibles(delServidor, p => p === 'GOOGLE'), ['GOOGLE']);
  // Y si el servidor no lo tiene, no se ofrece aunque la plataforma pueda.
  assert.deepEqual(
    proveedoresOfrecibles([{ provider: 'GOOGLE', available: false }, { provider: 'APPLE', available: true }], () => true),
    ['APPLE']
  );
  assert.deepEqual(proveedoresOfrecibles([], () => true), []);
});

test('Apple sólo en iOS; Google necesita su client ID de web', () => {
  const puerta = despojarComentarios(leer('social/proveedores.ts'));
  assert.match(puerta, /return Platform\.OS === 'ios'/, 'Apple sólo iOS: no se finge paridad');
  assert.match(puerta, /if \(Platform\.OS === 'web'\) return false/);
  assert.match(puerta, /return CLIENTES_DE_GOOGLE\.web !== ''/);
});

test('sin proveedores disponibles los botones siguen apagados y con su aviso', () => {
  const pantalla = despojarComentarios(leer('app/acceso.tsx'));
  assert.match(pantalla, /disponible=\{hayGoogle && !ocupado\}/);
  assert.match(pantalla, /disponible=\{hayApple && !ocupado\}/);
  assert.match(pantalla, /const alguno = hayGoogle \|\| hayApple/);
  assert.match(pantalla, /\{alguno \? null : \(/, 'el aviso aparece cuando no hay ninguno');
  assert.match(pantalla, /AVISO_DE_NO_DISPONIBLE/);
  // La lista empieza vacía: el botón nunca aparece encendido y luego apagado.
  assert.match(pantalla, /useState<readonly ProveedorSocial\[\]>\(\[\]\)/);
});

// ---------------------------------------------------------------------------
// Doble toque
// ---------------------------------------------------------------------------

test('dos toques seguidos abren un solo selector', () => {
  const pantalla = despojarComentarios(leer('app/acceso.tsx'));
  assert.match(pantalla, /const abriendoProveedor = useRef\(false\)/);
  assert.match(pantalla, /if \(abriendoProveedor\.current\) return/);
  assert.match(pantalla, /abriendoProveedor\.current = true/);
  assert.match(pantalla, /finally\s*\{\s*abriendoProveedor\.current = false/, 'el cerrojo se suelta pase lo que pase');
  // Y mientras tanto los botones se deshabilitan.
  assert.match(pantalla, /ocupado=\{socialOcupado\(estadoSocial\)\}/);
});

// ---------------------------------------------------------------------------
// Una sola puerta, y nada que registrar
// ---------------------------------------------------------------------------

test('la pantalla no importa las bibliotecas de Google ni de Apple', () => {
  const pantalla = leer('app/acceso.tsx');
  assert.ok(!/google-signin|apple-authentication|expo-auth-session/.test(pantalla),
    'las bibliotecas entran por social/proveedores.ts, como la cámara por media/captura.ts');
  assert.match(pantalla, /from '\.\.\/social\/proveedores'/);
  // Y la puerta es la única que las importa.
  const puertas = ['social/proveedores.ts'];
  for (const fichero of ['domain/entradaSocial.ts', 'services/social.ts', 'context/AuthContext.tsx']) {
    assert.ok(!/google-signin|apple-authentication/.test(leer(fichero)), `${fichero} no debe importarlas`);
  }
  assert.match(leer(puertas[0]), /@react-native-google-signin\/google-signin/);
  assert.match(leer(puertas[0]), /expo-apple-authentication/);
});

test('las bibliotecas se cargan al pulsar, no al abrir la aplicación', () => {
  const puerta = leer('social/proveedores.ts');
  // Con `import()` dentro de la función: importarlas arriba rompería el
  // paquete de web, donde no existen.
  assert.match(puerta, /await import\('@react-native-google-signin\/google-signin'\)/);
  assert.match(puerta, /await import\('expo-apple-authentication'\)/);
  assert.ok(!/^import .* from '@react-native-google-signin/m.test(puerta), 'no en la cabecera');
});

test('ni el token ni el identificador de la cuenta se registran en ningún sitio', () => {
  for (const fichero of ['social/proveedores.ts', 'services/social.ts', 'domain/entradaSocial.ts', 'app/acceso.tsx']) {
    const fuente = despojarComentarios(leer(fichero));
    assert.ok(!/console\.(log|warn|error|info|debug)/.test(fuente), `${fichero} no debe registrar nada`);
    assert.ok(!/Sentry|analytics|track\(/i.test(fuente), `${fichero} no debe mandar telemetría`);
  }
  // El token del proveedor no se guarda: ya cumplió su función al verificarse.
  const contexto = despojarComentarios(leer('context/AuthContext.tsx'));
  const social = contexto.slice(contexto.indexOf('entrarConIdentidadSocial'));
  assert.match(social, /guardarToken\(sesionNueva\.token\)/, 'se guarda el JWT de +58Express');
  assert.ok(!/idToken|identityToken/.test(contexto), 'y nunca el del proveedor');
});

test('Apple: el nombre sólo llega la primera vez, y no se inventa cuando falta', () => {
  const puerta = despojarComentarios(leer('social/proveedores.ts'));
  assert.match(puerta, /credencial\.fullName\?\.givenName \?\? undefined/);
  assert.match(puerta, /credencial\.fullName\?\.familyName \?\? undefined/);
  // Sin token no se sigue con lo que el proveedor cuente del usuario.
  assert.match(puerta, /if \(typeof token !== 'string' \|\| token === ''\) return \{ estado: 'FALLO_DEL_PROVEEDOR' \}/);
});

test('la configuración de Google deriva el esquema de iOS en vez de pedir otra variable', () => {
  const config = leer('app.config.js');
  assert.match(config, /function esquemaInvertidoDeGoogle/);
  assert.match(config, /com\.googleusercontent\.apps\./);
  // Sin client ID no se inventa ninguno.
  assert.match(config, /if \(!clienteDeIos \|\| !clienteDeIos\.endsWith\(sufijo\)\) return null/);
  const ejemplo = leer('.env.example');
  assert.match(ejemplo, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
  assert.match(ejemplo, /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=/);
  assert.match(ejemplo, /NO es un secreto/, 'se explica por qué un client ID puede viajar');
});
