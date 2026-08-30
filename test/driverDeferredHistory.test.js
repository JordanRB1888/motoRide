import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ganancias = fs.readFileSync(path.join(raiz, 'src/pages/driver/earnings.js'), 'utf8');
const finanzas = fs.readFileSync(path.join(raiz, 'src/pages/admin/finances.js'), 'utf8');

/**
 * DRIVER-FINANCE-1 v9 — el pago de una comisión pendiente se ve.
 *
 * La octava auditoría comprobó que el apunte se escribía bien, era
 * exactamente-una-vez y estaba correctamente acotado al conductor... y que la
 * pantalla de ganancias lo filtraba fuera. El saldo del conductor bajaba de
 * verdad y en su historial no había nada que lo explicara.
 */

const TIPO = 'DRIVER_DEFERRED_COMMISSION_PAYMENT';

test('la pantalla de ganancias incluye el pago de comisión pendiente', () => {
  const filtro = ganancias.match(/const movements = [^;]+;/s);
  assert.ok(filtro, 'la lista de movimientos existe');
  assert.ok(filtro[0].includes(TIPO),
    'un débito real del saldo no puede quedarse fuera del historial del conductor');
});

test('y lo muestra con un nombre que una persona entiende', () => {
  assert.match(ganancias, new RegExp(`${TIPO}:'[^']+'`),
    'el movimiento necesita etiqueta: sin ella la pantalla enseñaría la constante interna');
  const etiqueta = ganancias.match(new RegExp(`${TIPO}:'([^']+)'`))[1];
  assert.ok(!/[A-Z]{2,}_/.test(etiqueta), 'y esa etiqueta no puede ser jerga de implementación');
  assert.ok(etiqueta.length > 3);
});

test('el panel de administración audita los movimientos del libro del conductor', () => {
  assert.ok(finanzas.includes('driverMovements'),
    'la auditoría de finanzas tiene que recibir los movimientos del libro');
  assert.ok(finanzas.includes(TIPO),
    'incluido el pago de comisión pendiente, que era el que faltaba');
  // Lo que se audita: quién, cuánto, con qué saldo quedó y cuándo.
  const tarjeta = finanzas.slice(finanzas.indexOf('finance-ledger-card'));
  for (const campo of ['personName(item.user)', 'item.amount', 'item.balanceAfter', 'item.createdAt']) {
    assert.ok(tarjeta.includes(campo), `la auditoría necesita ${campo}`);
  }
});

test('y ninguna pantalla de pasajera conoce este movimiento', () => {
  const pasajera = (function recoger(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entrada => {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) return recoger(completa);
      return entrada.isFile() && entrada.name.endsWith('.js')
        ? [fs.readFileSync(completa, 'utf8')] : [];
    });
  })(path.join(raiz, 'src/pages/passenger'));
  assert.equal(pasajera.filter(fuente => fuente.includes(TIPO)).length, 0,
    'el libro del conductor no se asoma a la aplicación de la pasajera');
});

// ---------------------------------------------------------------------------
// v10 · el saldo resultante se VE, no solo viaja en la respuesta
// ---------------------------------------------------------------------------
//
// La novena auditoria lo encontro: la integracion probaba que `balanceAfter`
// llegaba, y la pantalla nunca lo pintaba. La prueba anterior solo miraba la
// presencia del tipo y su etiqueta, asi que no podia detectarlo.

test('v10 · la pantalla de ganancias pinta el saldo resultante del movimiento', () => {
  assert.ok(ganancias.includes('balanceAfter'),
    'un historial de dinero sin el saldo con el que quedo la cuenta no situa nada');
  // Y lo pinta DENTRO de la fila del movimiento, no en cualquier sitio.
  const fila = ganancias.slice(ganancias.indexOf('earning-row-amount'));
  assert.ok(fila.slice(0, 400).includes('saldoTras(item)'),
    'el saldo va en la fila del movimiento, junto a su importe');
});

test('v10 · y NO lo inventa cuando el apunte no lo trae', () => {
  const desde = ganancias.indexOf('const saldoTras');
  assert.notEqual(desde, -1, 'el ayudante existe');
  const cuerpo = ganancias.slice(desde, desde + 400);
  assert.ok(/Number\.isFinite\(Number\(item\?\.balanceAfter\)\)/.test(cuerpo),
    'solo se muestra cuando el apunte lo trae de verdad');
  assert.ok(cuerpo.includes("? `") && cuerpo.includes(": ''"),
    'y si no lo trae, no se pinta nada: un saldo inventado es peor que ninguno');
});
