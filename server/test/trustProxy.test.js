import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustProxy, DEFAULT_PRODUCTION_HOPS } from '../services/trustProxy.js';

test('sin configurar, producción confía en el proxy de borde y desarrollo no', () => {
  assert.equal(resolveTrustProxy({ isProduction: true }).value, DEFAULT_PRODUCTION_HOPS);
  assert.equal(resolveTrustProxy({ isProduction: false }).value, false);
  for (const vacio of [undefined, null, '', '   ']) {
    assert.equal(resolveTrustProxy({ value: vacio, isProduction: true }).value, DEFAULT_PRODUCTION_HOPS);
  }
});

test('un número de saltos explícito se respeta', () => {
  assert.equal(resolveTrustProxy({ value: '2' }).value, 2);
  assert.equal(resolveTrustProxy({ value: 3 }).value, 3);
  assert.equal(resolveTrustProxy({ value: ' 1 ' }).value, 1);
  assert.equal(resolveTrustProxy({ value: '1' }).source, 'entorno');
});

test('cero y false desactivan la confianza', () => {
  assert.equal(resolveTrustProxy({ value: '0', isProduction: true }).value, false);
  assert.equal(resolveTrustProxy({ value: 'false', isProduction: true }).value, false);
  assert.equal(resolveTrustProxy({ value: false, isProduction: true }).value, false);
});

test('nunca se devuelve true: confiar en la cabecera completa anula el límite', () => {
  // Con `trust proxy: true` Express toma la primera entrada de
  // X-Forwarded-For, que la envía el cliente. Cualquiera podría anteponer una
  // dirección inventada por petición y estrenar cupo cada vez.
  for (const peligroso of ['true', true, 'on', 'yes', 'loopback', '203.0.113.7', 'uniquelocal']) {
    const resuelto = resolveTrustProxy({ value: peligroso, isProduction: true });
    assert.notEqual(resuelto.value, true, `no debía aceptarse: ${String(peligroso)}`);
    assert.equal(resuelto.value, DEFAULT_PRODUCTION_HOPS, 'debe caer al predeterminado');
    assert.match(resuelto.source, /inválido/);
  }
});

test('valores ilegibles o negativos caen al predeterminado, no a algo abierto', () => {
  for (const malo of ['abc', '-1', '1.5', 'NaN', {}, []]) {
    const enProduccion = resolveTrustProxy({ value: malo, isProduction: true });
    assert.equal(enProduccion.value, DEFAULT_PRODUCTION_HOPS, `producción, valor ${String(malo)}`);
    const enDesarrollo = resolveTrustProxy({ value: malo, isProduction: false });
    assert.equal(enDesarrollo.value, false, `desarrollo, valor ${String(malo)}`);
  }
});

test('el resultado siempre es un entero de saltos o false', () => {
  const entradas = [undefined, '', '0', '1', '5', 'false', 'true', 'abc', -3, 2];
  for (const entrada of entradas) {
    for (const isProduction of [true, false]) {
      const { value } = resolveTrustProxy({ value: entrada, isProduction });
      const valido = value === false || (Number.isInteger(value) && value >= 1);
      assert.ok(valido, `valor inesperado ${String(value)} para ${String(entrada)}`);
    }
  }
});
