import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTORNOS,
  VARIABLE_ENTORNO,
  VARIABLE_URL,
  resolverConfiguracion
} from '../config/environment.ts';

/**
 * MOBILE-NATIVE-1 — la configuración de entorno.
 *
 * La regla que estas pruebas protegen: en desarrollo, si falta la
 * configuración, la aplicación NO habla con producción. Falla y lo dice.
 */

const URL_LOCAL = 'http://192.168.1.10:8080';
const URL_SEGURA = 'https://api.ejemplo.test';

// ---------------------------------------------------------------------------
// LA REGLA PRINCIPAL
// ---------------------------------------------------------------------------

test('sin URL configurada NO se cae a producción: falla', () => {
  // Un valor por defecto que apunte a producción es la forma más fácil de que
  // alguien depure contra la base real sin enterarse.
  const resultado = resolverConfiguracion({}, true);

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'URL_AUSENTE');
  // El mensaje tiene que explicar qué hacer, no sólo que algo falló.
  assert.match(resultado.detalle, /EXPO_PUBLIC_API_BASE_URL/);
  assert.match(resultado.detalle, /producción/);
});

test('NINGUNA URL de producción aparece en el código de configuración', async () => {
  // La comprobación de que no existe un respaldo escondido: ni en una constante,
  // ni comentado «por si acaso», ni deducido del nombre del entorno.
  const fs = await import('node:fs');
  const url = new URL('../config/environment.ts', import.meta.url);
  const codigo = fs.readFileSync(url, 'utf8');

  for (const rastro of ['railway.app', 'vercel.app', 'motoride-production', 'plus58express.com']) {
    assert.equal(codigo.includes(rastro), false, `no debe aparecer: ${rastro}`);
  }
});

// ---------------------------------------------------------------------------
// Lo que sí se admite
// ---------------------------------------------------------------------------

test('con URL declarada, la configuración es válida', () => {
  const resultado = resolverConfiguracion(
    { [VARIABLE_URL]: URL_LOCAL, [VARIABLE_ENTORNO]: 'development' },
    true
  );
  assert.equal(resultado.ok, true);
  assert.equal(resultado.entorno, 'development');
  assert.equal(resultado.urlBase, URL_LOCAL);
});

test('la barra final se quita para poder concatenar rutas', () => {
  const resultado = resolverConfiguracion(
    { [VARIABLE_URL]: `${URL_SEGURA}///`, [VARIABLE_ENTORNO]: 'production' },
    false
  );
  assert.equal(resultado.ok, true);
  assert.equal(resultado.urlBase, URL_SEGURA);
});

test('sin entorno declarado se asume el MENOS peligroso', () => {
  // En desarrollo, desarrollo. Nunca producción por omisión.
  const enDesarrollo = resolverConfiguracion({ [VARIABLE_URL]: URL_LOCAL }, true);
  assert.equal(enDesarrollo.ok, true);
  assert.equal(enDesarrollo.entorno, 'development');
});

// ---------------------------------------------------------------------------
// Lo que se rechaza
// ---------------------------------------------------------------------------

test('HTTP en claro sólo se tolera en desarrollo', () => {
  // Mandar credenciales por HTTP desde un teléfono, a menudo por wifi ajena, es
  // exactamente el escenario que TLS existe para cubrir.
  for (const entorno of ['staging', 'production']) {
    const resultado = resolverConfiguracion(
      { [VARIABLE_URL]: URL_LOCAL, [VARIABLE_ENTORNO]: entorno },
      false
    );
    assert.equal(resultado.ok, false, entorno);
    assert.equal(resultado.motivo, 'URL_NO_SEGURA', entorno);
  }

  // Y en desarrollo sí, porque el backend local no tiene certificado.
  const local = resolverConfiguracion(
    { [VARIABLE_URL]: URL_LOCAL, [VARIABLE_ENTORNO]: 'development' },
    true
  );
  assert.equal(local.ok, true);
});

test('una URL que no lo es se rechaza', () => {
  for (const valor of ['no es una url', 'ftp://algo', '/api', 'localhost:8080']) {
    const resultado = resolverConfiguracion(
      { [VARIABLE_URL]: valor, [VARIABLE_ENTORNO]: 'development' },
      true
    );
    assert.equal(resultado.ok, false, valor);
    assert.equal(resultado.motivo, 'URL_INVALIDA', valor);
  }
});

test('un entorno inventado se rechaza', () => {
  const resultado = resolverConfiguracion(
    { [VARIABLE_URL]: URL_SEGURA, [VARIABLE_ENTORNO]: 'preproduccion' },
    false
  );
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'ENTORNO_DESCONOCIDO');
  // El mensaje enumera los válidos, para no obligar a buscar en el código.
  for (const entorno of ENTORNOS) assert.match(resultado.detalle, new RegExp(entorno));
});

test('sólo un resultado válido trae URL', () => {
  const roto = resolverConfiguracion({}, true);
  assert.equal(roto.ok, false);
  assert.equal('urlBase' in roto, false, 'un fallo no puede traer un servidor al que llamar');
});
