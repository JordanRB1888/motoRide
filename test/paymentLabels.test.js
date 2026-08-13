import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentLabel, isWalletPaymentLabel, DEFAULT_PAYMENT_LABEL } from '../src/utils/paymentLabels.js';

test('los métodos canónicos del servidor se etiquetan correctamente', () => {
  // Desde que el backend normaliza, estos son los valores que llegan.
  assert.equal(paymentLabel('WALLET'), 'Billetera +58Express');
  assert.equal(paymentLabel('CASH'), 'Efectivo USD');
  assert.equal(paymentLabel('PAGO_MOVIL'), 'Pago móvil');
  assert.equal(paymentLabel('ZELLE'), 'Zelle');
  assert.equal(paymentLabel('ZINLI'), 'Zinli');
});

test('WALLET no puede etiquetarse como efectivo', () => {
  // Regresión: el mapa anterior solo tenía claves en minúscula, así que un
  // viaje pagado con billetera se mostraba al conductor como "Efectivo USD".
  assert.notEqual(paymentLabel('WALLET'), 'Efectivo USD');
  assert.notEqual(paymentLabel('WALLET'), DEFAULT_PAYMENT_LABEL);
});

test('las variantes antiguas en minúscula siguen funcionando', () => {
  assert.equal(paymentLabel('wallet'), 'Billetera +58Express');
  assert.equal(paymentLabel('billetera'), 'Billetera +58Express');
  assert.equal(paymentLabel('billetera express'), 'Billetera +58Express');
  assert.equal(paymentLabel('cash_usd'), 'Efectivo USD');
  assert.equal(paymentLabel('cash_ves'), 'Efectivo Bs.');
  assert.equal(paymentLabel('efectivo'), 'Efectivo USD');
  assert.equal(paymentLabel('pago_movil'), 'Pago móvil');
  assert.equal(paymentLabel('pago movil'), 'Pago móvil');
  assert.equal(paymentLabel('WALLET_PENDING'), 'Billetera +58Express');
});

test('un método desconocido o ausente cae en la etiqueta por defecto', () => {
  for (const valor of ['bitcoin', '', '   ', null, undefined, 42, {}, [], true]) {
    assert.equal(paymentLabel(valor), DEFAULT_PAYMENT_LABEL, `valor: ${JSON.stringify(valor)}`);
  }
});

test('isWalletPaymentLabel reconoce billetera en ambas formas', () => {
  for (const valor of ['WALLET', 'wallet', 'Billetera', 'BILLETERA_EXPRESS', 'billetera express', 'WALLET_PENDING']) {
    assert.equal(isWalletPaymentLabel(valor), true, `debía ser billetera: ${valor}`);
  }
  for (const valor of ['CASH', 'efectivo', 'cash_usd', 'PAGO_MOVIL', 'ZELLE', '', null, undefined, 42]) {
    assert.equal(isWalletPaymentLabel(valor), false, `no debía ser billetera: ${JSON.stringify(valor)}`);
  }
});
