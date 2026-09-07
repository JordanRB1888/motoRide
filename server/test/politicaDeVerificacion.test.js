import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHONE_VERIFICATION_REQUIRED,
  faltaTelefonoVerificadoParaConductor,
  faltaTelefonoVerificadoParaPasajero,
  politicasDeVerificacion
} from '../domain/politicaDeVerificacion.js';

/**
 * AUTH-FINAL-2: la politica de contacto verificado existe, esta probada y
 * esta APAGADA. Lo que estas pruebas protegen es justamente que siga apagada
 * mientras nadie la encienda a proposito, porque encenderla hoy bloquearia a
 * todos los usuarios que ya existen.
 */
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VERIFICADO = [{ type: 'PHONE', valueNormalized: '+584141234567', verifiedAt: '2026-09-04T12:00:00.000Z' }];
const SIN_VERIFICAR = [{ type: 'PHONE', valueNormalized: '+584141234567', verifiedAt: null }];

test('las dos politicas nacen APAGADAS, y con el entorno vacio no bloquean a nadie', () => {
  assert.deepEqual(politicasDeVerificacion({}), {
    conductorExigeTelefono: false,
    pasajeroExigeTelefono: false
  });
  // Sin contactos, sin verificar, da igual: apagada no bloquea.
  for (const contactos of [[], SIN_VERIFICAR, VERIFICADO]) {
    assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: contactos, env: {} }), false);
    assert.equal(faltaTelefonoVerificadoParaPasajero({ contactosVerificados: contactos, env: {} }), false);
  }
});

test('encendida, exige el telefono verificado, y sigue dejando pasar a quien lo tiene', () => {
  const env = { DRIVER_REQUIRE_VERIFIED_PHONE: 'true' };
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: [], env }), true);
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: SIN_VERIFICAR, env }), true);
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: VERIFICADO, env }), false);
  // Un correo verificado no vale como telefono verificado.
  const soloCorreo = [{ type: 'EMAIL', valueNormalized: 'ana@x.co', verifiedAt: '2026-09-04T12:00:00.000Z' }];
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: soloCorreo, env }), true);
});

test('las dos politicas son independientes: encender una no enciende la otra', () => {
  const soloConductor = { DRIVER_REQUIRE_VERIFIED_PHONE: 'true' };
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: [], env: soloConductor }), true);
  assert.equal(faltaTelefonoVerificadoParaPasajero({ contactosVerificados: [], env: soloConductor }), false);

  const soloPasajero = { PASSENGER_REQUIRE_VERIFIED_PHONE: '1' };
  assert.equal(faltaTelefonoVerificadoParaPasajero({ contactosVerificados: [], env: soloPasajero }), true);
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: [], env: soloPasajero }), false);
});

test('sólo un valor afirmativo explícito la enciende: cualquier otra cosa la deja apagada', () => {
  for (const valor of ['true', '1', 'yes', 'si', 'TRUE', ' Si ']) {
    assert.equal(politicasDeVerificacion({ DRIVER_REQUIRE_VERIFIED_PHONE: valor }).conductorExigeTelefono, true, valor);
  }
  for (const valor of ['false', '0', 'no', '', ' ', undefined, null, 'quizas']) {
    assert.equal(politicasDeVerificacion({ DRIVER_REQUIRE_VERIFIED_PHONE: valor }).conductorExigeTelefono, false, String(valor));
  }
});

test('la politica se lee en cada llamada: apagarla no exige reiniciar el servidor', () => {
  const env = { DRIVER_REQUIRE_VERIFIED_PHONE: 'true' };
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: [], env }), true);
  env.DRIVER_REQUIRE_VERIFIED_PHONE = 'false';
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: [], env }), false, 'se puede apagar en caliente');
});

test('está cableada en el ENVÍO del expediente, no en la entrada ni en la aprobación', () => {
  const router = fs.readFileSync(path.join(serverDir, 'routes/driverApplications.js'), 'utf8');
  const submit = router.slice(router.indexOf("router.post('/driver-applications/me/submit'"));
  const cuerpoDelSubmit = submit.slice(0, submit.indexOf('router.', 10));
  assert.match(cuerpoDelSubmit, /faltaTelefonoVerificadoParaConductor/, 'se comprueba al enviar');
  assert.match(cuerpoDelSubmit, new RegExp(PHONE_VERIFICATION_REQUIRED));

  // Y no se llama en ningún otro sitio: nadie pierde el acceso a su cuenta
  // por esto. Se cuentan las LLAMADAS, no las menciones en comentarios.
  const llamadas = (router.match(/faltaTelefonoVerificadoParaConductor\(/g) ?? []).length;
  assert.equal(llamadas, 1, 'se comprueba en un solo punto: el envío');
  const indexJs = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  assert.ok(!/faltaTelefonoVerificado/.test(indexJs), 'ni el login ni el registro la miran');
});

test('la ruta de envío sigue funcionando igual con la política apagada', () => {
  // La comprobación devuelve `false` sin mirar nada más, así que el camino de
  // siempre no cambia. Es lo que garantizan las 45 pruebas del expediente,
  // que siguen pasando; aquí se fija la razón por la que pueden pasar.
  assert.equal(faltaTelefonoVerificadoParaConductor({ contactosVerificados: undefined, env: {} }), false);
  assert.equal(faltaTelefonoVerificadoParaConductor({}), false, 'sin argumentos tampoco bloquea');
});
