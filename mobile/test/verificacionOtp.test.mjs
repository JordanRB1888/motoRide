import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  CANALES,
  ESTADOS,
  LONGITUD_DEL_CODIGO,
  aparienciaDeLaCasilla,
  canalPreferido,
  canalesOfrecibles,
  codigoCompleto,
  contactoDelCanal,
  esperaDelFallo,
  estaOcupado,
  interpretarEnvio,
  interpretarVerificacion,
  limpiarCodigo,
  siguienteSegundo
} from '../domain/verificacionOtp.ts';

/**
 * VERIFICAR UN CONTACTO CON UN CÓDIGO
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que el cliente NUNCA decida si un código es válido: eso sólo lo sabe el
 *    servidor, que guarda el hash y cuenta los intentos.
 * 2. Que cada fallo tenga su propia pantalla y su propia frase. «Algo salió
 *    mal» no ayuda a nadie a recibir su código.
 * 3. Que quedarse sin conexión no gaste un intento ni queme el código.
 * 4. Que un canal sin proveedor no se ofrezca como si funcionara.
 * 5. Que el código no se guarde ni se registre en ningún sitio.
 * 6. Que la superficie de Antigravity no lleve datos de demostración.
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

const DESAFIO = {
  challengeId: 'chal_1',
  channel: 'WHATSAPP',
  purpose: 'SIGNUP',
  expiresInSeconds: 300,
  resendAvailableInSeconds: 60,
  attemptsLeft: 5,
  maskedDestination: '+58••••••••67',
  deliveryConfirmed: true
};

// ---------------------------------------------------------------------------
// El servidor manda
// ---------------------------------------------------------------------------

test('el cliente no tiene ninguna forma de dar por bueno un código', () => {
  const dominio = leer('domain/verificacionOtp.ts');
  const servicio = leer('services/otp.ts');
  // Nada de hashes, comparaciones de códigos ni vencimientos calculados aquí.
  for (const prohibido of [/createHmac/, /sha256/i, /codeHash/, /=== *codigoEsperado/, /Date\.now\(\) *[<>]/]) {
    assert.ok(!prohibido.test(dominio), `el dominio no debe contener ${prohibido}`);
    assert.ok(!prohibido.test(servicio), `el servicio no debe contener ${prohibido}`);
  }
  // Lo único que sale del teléfono es el identificador y lo tecleado.
  assert.match(servicio, /challengeId: peticion\.challengeId/);
  assert.match(servicio, /code: peticion\.codigo/);
});

test('la cuenta atrás es visual: llegar a cero no invalida nada', () => {
  assert.equal(siguienteSegundo(2), 1);
  assert.equal(siguienteSegundo(1), 0);
  assert.equal(siguienteSegundo(0), 0, 'nunca baja de cero');
  assert.equal(siguienteSegundo(-5), 0);
  const pantalla = despojarComentarios(leer('app/verificacion.tsx'));
  // Ninguna rama marca el código como expirado por el reloj local: el estado
  // de expirado sólo llega desde `interpretarVerificacion`.
  assert.ok(!/CODIGO_EXPIRADO/.test(pantalla), 'la pantalla no declara expirado por su cuenta');
});

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

test('un envío correcto deja el desafío, la cuenta atrás y los intentos del servidor', () => {
  const resultado = interpretarEnvio({ ok: true, datos: DESAFIO });
  assert.equal(resultado.estado, 'CODIGO_ENVIADO');
  assert.equal(resultado.desafio.challengeId, 'chal_1');
  assert.equal(resultado.desafio.resendAvailableInSeconds, 60);
  assert.equal(resultado.canal, 'WHATSAPP');
  assert.equal(resultado.entregaSinConfirmar, false);
  assert.equal(resultado.mensaje, undefined, 'sin novedades no hay aviso que dar');
});

test('una entrega sin confirmar lo dice, y no finge que el mensaje salió', () => {
  const resultado = interpretarEnvio({ ok: true, datos: { ...DESAFIO, deliveryConfirmed: false, warning: 'DELIVERY_UNCONFIRMED' } });
  assert.equal(resultado.estado, 'CODIGO_ENVIADO');
  assert.equal(resultado.entregaSinConfirmar, true);
  assert.match(resultado.mensaje, /No pudimos confirmar el envío/);
  assert.match(resultado.mensaje, /otro medio/, 'y ofrece la salida');
});

test('cada fallo de envío tiene su estado y su frase: nunca «algo salió mal»', () => {
  const casos = [
    ['RESEND_COOLDOWN', 'LIMITE_ALCANZADO', /Espera unos segundos/],
    ['RATE_LIMITED', 'LIMITE_ALCANZADO', /demasiados códigos/i],
    ['VERIFICATION_PROVIDER_NOT_CONFIGURED', 'CANAL_NO_DISPONIBLE', /Prueba con otro/],
    ['VERIFICATION_SEND_FAILED', 'CANAL_NO_DISPONIBLE', /Prueba con otro/],
    ['INVALID_DESTINATION', 'ERROR_DEL_SERVIDOR', /no parece válido/],
    ['UN_CODIGO_QUE_NO_CONOCEMOS', 'ERROR_DEL_SERVIDOR', /Inténtalo de nuevo/]
  ];
  const vistos = new Set();
  for (const [codigo, estadoEsperado, frase] of casos) {
    const resultado = interpretarEnvio(fallo(codigo));
    assert.equal(resultado.estado, estadoEsperado, codigo);
    assert.match(resultado.mensaje, frase, codigo);
    vistos.add(resultado.mensaje);
  }
  assert.equal(vistos.size, casos.length, 'cada caso dice algo distinto');
});

test('el segundo toque del mismo botón no pinta un error: sigue enviando', () => {
  const resultado = interpretarEnvio(fallo('SEND_IN_PROGRESS'));
  assert.equal(resultado.estado, 'ENVIANDO');
  assert.equal(resultado.mensaje, undefined, 'no hay nada que contarle a nadie');
});

test('sin conexión al enviar: estado propio, y dice qué hacer', () => {
  for (const motivo of ['SIN_RED', 'TIEMPO_AGOTADO', 'SIN_CONFIGURACION']) {
    const resultado = interpretarEnvio({ ok: false, motivo, codigo: null });
    assert.equal(resultado.estado, 'SIN_CONEXION', motivo);
    assert.match(resultado.mensaje, /No hay conexión/);
  }
});

test('la espera que manda el servidor se convierte en segundos, y sólo si es un número', () => {
  assert.equal(esperaDelFallo(fallo('RATE_LIMITED', { detalle: { retryAfterMs: 45_000 } })), 45);
  assert.equal(esperaDelFallo(fallo('RATE_LIMITED', { detalle: { retryAfterMs: 1500 } })), 2, 'se redondea hacia arriba');
  assert.equal(esperaDelFallo(fallo('RATE_LIMITED', { detalle: {} })), undefined);
  assert.equal(esperaDelFallo(fallo('RATE_LIMITED', { detalle: 'texto' })), undefined);
  assert.equal(esperaDelFallo(fallo('RATE_LIMITED')), undefined);
  const conEspera = interpretarEnvio(fallo('RESEND_COOLDOWN', { detalle: { retryAfterMs: 60_000 } }));
  assert.equal(conEspera.esperaSegundos, 60, 'la cuenta atrás sale del servidor, no de un número inventado');
});

test('el canal que falló viaja para que la pantalla ofrezca otro', () => {
  const resultado = interpretarEnvio(fallo('VERIFICATION_PROVIDER_NOT_CONFIGURED', { detalle: { channel: 'SMS' } }));
  assert.equal(resultado.canal, 'SMS');
  assert.equal(interpretarEnvio(fallo('VERIFICATION_SEND_FAILED', { detalle: { channel: 'PALOMA' } })).canal, undefined);
});

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

test('un código correcto verifica y devuelve lo que el servidor diga', () => {
  const resultado = interpretarVerificacion({ ok: true, datos: { status: 'success', token: 'x' } });
  assert.equal(resultado.estado, 'VERIFICADO');
  assert.deepEqual(resultado.datos, { status: 'success', token: 'x' });
});

test('un código incorrecto cuenta los intentos que quedan, en singular y en plural', () => {
  const conCuatro = interpretarVerificacion(fallo('INVALID_CODE', { detalle: { attemptsLeft: 4 } }));
  assert.equal(conCuatro.estado, 'CODIGO_INCORRECTO');
  assert.equal(conCuatro.intentosRestantes, 4);
  assert.match(conCuatro.mensaje, /quedan 4 intentos/);
  assert.match(interpretarVerificacion(fallo('INVALID_CODE', { detalle: { attemptsLeft: 1 } })).mensaje, /queda un intento/);
  const sinDato = interpretarVerificacion(fallo('INVALID_CODE'));
  assert.equal(sinDato.intentosRestantes, undefined);
  assert.equal(sinDato.mensaje, 'El código no es correcto.');
});

test('expirado y agotado piden otro código, y se distinguen entre sí', () => {
  const expirado = interpretarVerificacion(fallo('CODE_EXPIRED'));
  assert.equal(expirado.estado, 'CODIGO_EXPIRADO');
  assert.equal(expirado.necesitaOtroCodigo, true);
  assert.match(expirado.mensaje, /venció/);

  const agotado = interpretarVerificacion(fallo('CODE_EXHAUSTED'));
  assert.equal(agotado.estado, 'CODIGO_AGOTADO');
  assert.equal(agotado.necesitaOtroCodigo, true);
  assert.match(agotado.mensaje, /Demasiados intentos/);
  assert.notEqual(expirado.mensaje, agotado.mensaje);
});

test('sin conexión al verificar NO se gasta un intento y el código sigue valiendo', () => {
  const resultado = interpretarVerificacion({ ok: false, motivo: 'SIN_RED', codigo: null });
  assert.equal(resultado.estado, 'SIN_CONEXION');
  assert.equal(resultado.intentosRestantes, undefined, 'no se descuenta nada');
  assert.notEqual(resultado.necesitaOtroCodigo, true, 'el código no se quema');
  assert.match(resultado.mensaje, /sigue siendo válido/);
});

test('los errores de cuenta se explican, no se disfrazan de código incorrecto', () => {
  for (const [codigo, frase] of [
    ['CONTACT_TAKEN', /ya está verificado en otra cuenta/],
    ['ACCOUNT_NOT_FOUND', /No encontramos una cuenta/],
    ['ACCOUNT_DISABLED', /desactivada/],
    ['RATE_LIMITED', /Demasiados intentos/]
  ]) {
    const resultado = interpretarVerificacion(fallo(codigo));
    assert.match(resultado.mensaje, frase, codigo);
    assert.notEqual(resultado.estado, 'CODIGO_INCORRECTO', codigo);
  }
});

// ---------------------------------------------------------------------------
// Estados de la superficie
// ---------------------------------------------------------------------------

test('todos los estados del contrato existen y ninguno deja la casilla sin apariencia', () => {
  assert.deepEqual([...ESTADOS].sort(), [
    'CANAL_NO_DISPONIBLE', 'CODIGO_AGOTADO', 'CODIGO_ENVIADO', 'CODIGO_EXPIRADO', 'CODIGO_INCORRECTO',
    'ELIGIENDO_CANAL', 'ENVIANDO', 'ERROR_DEL_SERVIDOR', 'LIMITE_ALCANZADO', 'SIN_CONEXION',
    'VERIFICADO', 'VERIFICANDO'
  ]);
  for (const estado of ESTADOS) {
    assert.ok(['normal', 'error', 'expirado', 'exito'].includes(aparienciaDeLaCasilla(estado)), estado);
  }
  assert.equal(aparienciaDeLaCasilla('VERIFICADO'), 'exito');
  assert.equal(aparienciaDeLaCasilla('CODIGO_INCORRECTO'), 'error');
  assert.equal(aparienciaDeLaCasilla('CODIGO_EXPIRADO'), 'expirado');
  assert.equal(aparienciaDeLaCasilla('CODIGO_AGOTADO'), 'expirado');
  assert.equal(aparienciaDeLaCasilla('SIN_CONEXION'), 'normal', 'sin conexión el código no está mal');
});

test('mientras se envía o se verifica, la operación está ocupada y el botón se protege', () => {
  assert.equal(estaOcupado('ENVIANDO'), true);
  assert.equal(estaOcupado('VERIFICANDO'), true);
  assert.equal(estaOcupado('CODIGO_ENVIADO'), false);
  const pantalla = despojarComentarios(leer('app/verificacion.tsx'));
  // Un cerrojo que no depende del repintado: dos toques ocurren en el mismo
  // fotograma y `useState` todavía no ha cambiado.
  assert.match(pantalla, /const enviando = useRef\(false\)/);
  assert.match(pantalla, /if \(enviando\.current\) return/);
  assert.match(pantalla, /const verificando = useRef\(false\)/);
  assert.match(pantalla, /if \(verificando\.current \|\| !desafio/);
  assert.match(pantalla, /finally\s*\{\s*enviando\.current = false/, 'el cerrojo se suelta pase lo que pase');
  assert.match(pantalla, /verificando=\{estado === 'VERIFICANDO'\}/, 'y el botón lo enseña');
});

// ---------------------------------------------------------------------------
// Canales
// ---------------------------------------------------------------------------

test('un canal sin proveedor no se ofrece: nada de botones muertos', () => {
  const canales = [
    { channel: 'WHATSAPP', contactType: 'PHONE', available: true },
    { channel: 'SMS', contactType: 'PHONE', available: false },
    { channel: 'EMAIL', contactType: 'EMAIL', available: false }
  ];
  assert.deepEqual(canalesOfrecibles(canales), ['WHATSAPP']);
  assert.equal(canalPreferido(canales), 'WHATSAPP');
  assert.deepEqual(canalesOfrecibles([]), []);
  assert.equal(canalPreferido([]), null, 'sin canales no se elige ninguno');
});

test('WhatsApp es el preferido; si no está, SMS; y el correo el último', () => {
  const con = disponibles => canalPreferido(CANALES.map(channel => ({
    channel,
    contactType: channel === 'EMAIL' ? 'EMAIL' : 'PHONE',
    available: disponibles.includes(channel)
  })));
  assert.equal(con(['WHATSAPP', 'SMS', 'EMAIL']), 'WHATSAPP');
  assert.equal(con(['SMS', 'EMAIL']), 'SMS');
  assert.equal(con(['EMAIL']), 'EMAIL');
  assert.equal(contactoDelCanal('WHATSAPP'), 'PHONE');
  assert.equal(contactoDelCanal('SMS'), 'PHONE');
  assert.equal(contactoDelCanal('EMAIL'), 'EMAIL');
});

test('la pantalla sólo pinta canales disponibles Y con contacto al que enviar', () => {
  const pantalla = despojarComentarios(leer('app/verificacion.tsx'));
  assert.match(pantalla, /canalesOfrecibles\(canales\)/);
  assert.match(pantalla, /\.filter\(disponible => destinoDe\(disponible\) !== ''\)/);
});

test('sin ningún canal disponible no hay lista vacía ni botón muerto: hay explicación y salida', () => {
  const pantalla = despojarComentarios(leer('app/verificacion.tsx'));
  // Es el estado de HOY --ningún proveedor configurado-- y es justo el que se
  // olvida: un selector con cero opciones y un «Continuar» que no hace nada.
  assert.match(pantalla, /canalesParaLaSuperficie\.length === 0/);
  assert.match(pantalla, /testID="pantalla-sin-canales"/);
  assert.match(pantalla, /No podemos enviarte el código/);
  assert.match(pantalla, /Inténtalo más tarde/);
  assert.match(pantalla, /titulo="Volver"/, 'y se puede salir');
  // Mientras se consulta la lista, se distingue de «no hay ninguno».
  assert.match(pantalla, /const cargandoCanales = canales\.length === 0/);
  assert.match(pantalla, /Un momento…/);
  // El estado vacío va ANTES del selector: si no, se pintaría la lista vacía.
  assert.ok(
    pantalla.indexOf('pantalla-sin-canales') < pantalla.indexOf('pantalla-eleccion-canal'),
    'el estado vacío se comprueba antes de pintar el selector'
  );
});

// ---------------------------------------------------------------------------
// El código que se teclea
// ---------------------------------------------------------------------------

test('el código son seis cifras: se limpia lo que se teclea y no se manda incompleto', () => {
  assert.equal(LONGITUD_DEL_CODIGO, 6);
  assert.equal(limpiarCodigo('12a3-4 5'), '12345');
  assert.equal(limpiarCodigo('123456789'), '123456', 'no pasa de seis');
  assert.equal(limpiarCodigo(null), '');
  assert.equal(codigoCompleto('123456'), true);
  assert.equal(codigoCompleto('12345'), false);
  assert.equal(codigoCompleto('12345a'), false);
});

// ---------------------------------------------------------------------------
// Nada sensible en ningún sitio
// ---------------------------------------------------------------------------

test('el código no se guarda, no se registra y no viaja a ningún sitio más', () => {
  for (const fichero of ['domain/verificacionOtp.ts', 'services/otp.ts', 'app/verificacion.tsx']) {
    const fuente = despojarComentarios(leer(fichero));
    assert.ok(!/console\.(log|warn|error|info|debug)/.test(fuente), `${fichero} no debe registrar nada`);
    assert.ok(!/AsyncStorage|SecureStore|guardarToken/.test(fuente), `${fichero} no debe persistir el código`);
    assert.ok(!/Sentry|analytics|track\(/i.test(fuente), `${fichero} no debe mandar telemetría`);
  }
  const pantalla = despojarComentarios(leer('app/verificacion.tsx'));
  assert.match(pantalla, /setCodigo\(''\)/, 'el código se limpia de la pantalla');
});

test('la pantalla no trae datos de demostración: todo sale del servidor', () => {
  const pantalla = despojarComentarios(leer('app/verificacion.tsx'));
  // Ni destinos, ni códigos, ni contadores escritos a mano.
  assert.ok(!/\+58 ?414|\d{6}|@correo\.com|ejemplo\.com/.test(pantalla), 'sin ejemplos incrustados');
  assert.match(pantalla, /segundosRestantes=\{segundosParaReenviar\}/);
  assert.match(pantalla, /intentosRestantes=\{intentosRestantes\}/);
});

test('la superficie de Antigravity ya no lleva los intentos ni el mensaje escritos a mano', () => {
  const superficie = leer('ui/VerificacionOTP.tsx');
  assert.ok(
    !/intentosRestantes=\{2\}/.test(superficie),
    'el número fijo de intentos era un dato de demostración'
  );
  assert.match(superficie, /mensajeError=\{mensajeError\}/);
  assert.match(superficie, /intentosRestantes=\{intentosRestantes\}/);
  assert.match(superficie, /avisoGeneral \? \(/, 'y hay sitio para lo que no es un fallo del código');
  // Sus valores por omisión conservan exactamente lo que la previsualización
  // enseñaba: esto conecta datos, no rediseña.
  assert.match(superficie, /mensajeError = 'El código ingresado no coincide\.'/);
  assert.match(superficie, /intentosRestantes = 2/);
});

test('la pantalla usa la superficie de Antigravity en vez de dibujar la suya', () => {
  const pantalla = leer('app/verificacion.tsx');
  assert.match(pantalla, /from '\.\.\/ui\/VerificacionOTP'/);
  assert.match(pantalla, /<C2VerificacionOTP/);
  assert.match(pantalla, /<SelectorCanalOTP/);
  // Nada de hojas de estilo propias que compitan con su diseño.
  assert.ok(!/StyleSheet\.create/.test(pantalla), 'no se introduce un diseño paralelo');
});
