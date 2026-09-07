import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decimalACadena,
  decimalDesdeCadena,
  decimalDesdeFormatoVenezolano,
  multiplicarDecimales,
  redondearDecimal,
  compararDecimales
} from '../domain/decimalMoney.ts';
import { leerTasaDelBcv } from '../domain/bcvRateParser.ts';
import { revisarVariacion } from '../domain/fxSanity.ts';
import { PORTADA_BCV_REAL, TASA_ESPERADA, FECHA_VALOR_ESPERADA } from './fixtures/bcvHome.js';

/**
 * FX-BCV-1 — lectura de la tasa oficial.
 *
 * Todo aquí es puro: no sale a la red, no toca base de datos y no depende de
 * que el BCV esté disponible. Lo que se comprueba es el contrato de forma
 * contra HTML capturado de verdad.
 */

// ---------------------------------------------------------------------------
// Aritmética decimal: la base de que nada pase por coma flotante
// ---------------------------------------------------------------------------

test('el formato venezolano se lee con precisión exacta', () => {
  const valor = decimalDesdeFormatoVenezolano('794,99170000');
  assert.ok(valor);
  assert.equal(decimalACadena(valor), '794.99170000');
  // Ocho decimales conservados, no siete ni nueve: la escala es un dato.
  assert.equal(valor.escala, 8);
  assert.equal(valor.unidades, 79499170000n);
});

test('el separador de miles se interpreta como tal', () => {
  const valor = decimalDesdeFormatoVenezolano('1.234,56789012');
  assert.ok(valor);
  assert.equal(decimalACadena(valor), '1234.56789012');
});

test('se rechaza el formato ambiguo en vez de adivinarlo', () => {
  // `794.99` es 794 con 99 céntimos en inglés y un separador de miles mal
  // formado en venezolano. Interpretarlo mal sería un error de mil veces, así
  // que se rechaza: preferimos fallar y que alguien mire.
  assert.equal(decimalDesdeFormatoVenezolano('794.99'), null);
  assert.equal(decimalDesdeFormatoVenezolano('1,234.56'), null);
  assert.equal(decimalDesdeFormatoVenezolano('1.23.456,78'), null);
  assert.equal(decimalDesdeFormatoVenezolano(''), null);
  assert.equal(decimalDesdeFormatoVenezolano('N/D'), null);
  assert.equal(decimalDesdeFormatoVenezolano('-794,99'), null, 'una tasa negativa no existe');
});

test('la multiplicación no pierde un solo dígito', () => {
  // En coma flotante 794.9917 * 3.5 da 2782.4709500000003. Aquí no.
  const tasa = decimalDesdeCadena('794.99170000');
  const monto = decimalDesdeCadena('3.50');
  assert.ok(tasa && monto);
  const producto = multiplicarDecimales(monto, tasa);
  // La escala del producto es la SUMA de las escalas: 2 + 8 = 10 decimales.
  assert.equal(producto.escala, 10);
  assert.equal(decimalACadena(producto), '2782.4709500000');
  assert.equal(decimalACadena(redondearDecimal(producto, 2)), '2782.47');
});

test('el redondeo es comercial: la mitad sube', () => {
  const casos = [
    ['2.345', 2, '2.35'],
    ['2.344', 2, '2.34'],
    ['2.355', 2, '2.36'],
    ['-2.345', 2, '-2.35'],
    ['0.005', 2, '0.01'],
    ['0.004', 2, '0.00']
  ];
  for (const [entrada, escala, esperado] of casos) {
    const valor = decimalDesdeCadena(entrada);
    assert.ok(valor, entrada);
    assert.equal(decimalACadena(redondearDecimal(valor, escala)), esperado, entrada);
  }
});

test('comparar funciona entre escalas distintas', () => {
  const a = decimalDesdeCadena('794.9');
  const b = decimalDesdeCadena('794.90000000');
  const c = decimalDesdeCadena('794.90000001');
  assert.ok(a && b && c);
  assert.equal(compararDecimales(a, b), 0);
  assert.equal(compararDecimales(a, c), -1);
  assert.equal(compararDecimales(c, a), 1);
});

// ---------------------------------------------------------------------------
// El parser, contra HTML real del BCV
// ---------------------------------------------------------------------------

test('lee la tasa y la fecha valor de la portada real del BCV', () => {
  const resultado = leerTasaDelBcv(PORTADA_BCV_REAL);
  assert.equal(resultado.ok, true, resultado.ok ? '' : resultado.detalle);
  assert.equal(resultado.lectura.tasa, TASA_ESPERADA);
  assert.equal(resultado.lectura.fechaValor, FECHA_VALOR_ESPERADA);
});

test('NO confunde el dólar con las otras monedas de la misma página', () => {
  // El fixture real trae la lira (16,47982495) y el rublo (9,22739438) justo
  // ANTES del bloque del dólar. Leer la moneda equivocada sería cobrar veinte
  // veces de menos, y la página no daría ninguna señal de error.
  const resultado = leerTasaDelBcv(PORTADA_BCV_REAL);
  assert.equal(resultado.ok, true);
  assert.notEqual(resultado.lectura.tasa, '16.47982495');
  assert.notEqual(resultado.lectura.tasa, '9.22739438');
});

test('la fecha valor no se corre un día por el huso horario', () => {
  // El BCV declara `2026-08-31T00:00:00-04:00`. Pasar eso por `new Date()` y
  // formatearlo en UTC daría 2026-08-31T04:00Z — correcto por casualidad—, pero
  // con `-04:00` a las 22:00 daría el día siguiente. Se toma la parte de fecha
  // tal cual viene, y esta prueba lo fija.
  const html = PORTADA_BCV_REAL.replace(
    'content="2026-08-31T00:00:00-04:00"',
    'content="2026-08-31T22:30:00-04:00"'
  );
  const resultado = leerTasaDelBcv(html);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.lectura.fechaValor, '2026-08-31');
});

// ---------------------------------------------------------------------------
// Fallar cerrado: cada forma rota tiene su motivo, y ninguna devuelve un número
// ---------------------------------------------------------------------------

test('falla con motivo cuando la página cambia de forma', () => {
  const casos = [
    ['', 'HTML_VACIO'],
    ['<html><body>mantenimiento</body></html>', 'BLOQUE_DOLAR_AUSENTE'],
    [PORTADA_BCV_REAL.replace('<span> USD</span>', '<span> XXX</span>'), 'MONEDA_NO_CONFIRMADA'],
    [
      PORTADA_BCV_REAL.replace('<strong class="strong-tb">794,99170000</strong>', ''),
      'VALOR_AUSENTE'
    ],
    [PORTADA_BCV_REAL.replace('794,99170000', 'No disponible'), 'VALOR_ILEGIBLE'],
    [PORTADA_BCV_REAL.replace('794,99170000', '0,00000000'), 'VALOR_NO_POSITIVO'],
    [PORTADA_BCV_REAL.replace('Fecha Valor', 'Otra cosa'), 'FECHA_VALOR_AUSENTE'],
    [
      PORTADA_BCV_REAL.replace('content="2026-08-31T00:00:00-04:00"', 'content="ayer"'),
      'FECHA_VALOR_ILEGIBLE'
    ],
    [
      PORTADA_BCV_REAL.replace('content="2026-08-31T00:00:00-04:00"', 'content="2026-02-31T00:00:00-04:00"'),
      'FECHA_VALOR_ILEGIBLE'
    ]
  ];

  for (const [html, motivoEsperado] of casos) {
    const resultado = leerTasaDelBcv(html);
    assert.equal(resultado.ok, false, `debería fallar: ${motivoEsperado}`);
    assert.equal(resultado.motivo, motivoEsperado);
    // Lo importante no es sólo que falle, sino que NO traiga ningún valor.
    assert.equal(resultado.lectura, undefined);
  }
});

test('descarta valores que no son tasas creíbles', () => {
  const enorme = leerTasaDelBcv(PORTADA_BCV_REAL.replace('794,99170000', '999.999.999,00'));
  assert.equal(enorme.ok, false);
  assert.equal(enorme.motivo, 'VALOR_FUERA_DE_RANGO');
});

test('un año colado donde va la tasa no pasa por tasa', () => {
  // Es el fallo realista: la maquetación cambia y el `<strong>` del bloque pasa
  // a contener otra cosa. `2026` es un decimal válido, así que sólo lo frena la
  // comprobación de que el valor trae la forma publicada por el BCV.
  const resultado = leerTasaDelBcv(PORTADA_BCV_REAL.replace('794,99170000', '2026'));
  assert.equal(resultado.ok, true, 'un entero plano sí es legible');
  assert.equal(resultado.lectura.tasa, '2026');

  // Y aquí está el límite honesto de lo que un parser puede saber: 2026 es un
  // decimal perfectamente válido y una tasa plausible. Ninguna comprobación de
  // FORMA puede rechazarlo. Lo que lo atrapa es comparar con lo que ya sabíamos
  // -es lo que hace `revisarVariacion`- y por eso ese filtro existe.
  const revision = revisarVariacion('2026', '794.99170000');
  assert.equal(revision.veredicto, 'VARIACION_SOSPECHOSA');
});

// ---------------------------------------------------------------------------
// El filtro de cordura: lo que la forma no puede detectar
// ---------------------------------------------------------------------------

test('confundir el dólar con otra moneda se detecta al comparar', () => {
  // El fallo realista: la portada se reordena y leemos la lira. Tiene forma
  // impecable, así que sólo lo delata el salto respecto de la última conocida.
  const revision = revisarVariacion('16.47982495', '794.99170000');
  assert.equal(revision.veredicto, 'VARIACION_SOSPECHOSA');
});

test('leer mal el separador de miles se detecta al comparar', () => {
  assert.equal(
    revisarVariacion('794991.70000000', '794.99170000').veredicto,
    'VARIACION_SOSPECHOSA'
  );
});

test('una variación cambiaria normal se acepta', () => {
  const plausibles = ['794.99170000', '800.00000000', '750.00000000', '1000.00000000', '400.00000000'];
  for (const tasa of plausibles) {
    assert.equal(revisarVariacion(tasa, '794.99170000').veredicto, 'ACEPTABLE', tasa);
  }
});

test('los bordes del umbral están donde se dice que están', () => {
  // Exactamente el doble y exactamente la mitad se aceptan; pasarse, no.
  assert.equal(revisarVariacion('1589.98340000', '794.99170000').veredicto, 'ACEPTABLE');
  assert.equal(revisarVariacion('397.49585000', '794.99170000').veredicto, 'ACEPTABLE');
  assert.equal(revisarVariacion('1589.98340001', '794.99170000').veredicto, 'VARIACION_SOSPECHOSA');
  assert.equal(revisarVariacion('397.49584999', '794.99170000').veredicto, 'VARIACION_SOSPECHOSA');
});

test('la primera tasa de todas se acepta sin referencia', () => {
  // Rechazarla dejaría el sistema sin poder arrancar nunca.
  assert.equal(revisarVariacion('794.99170000', null).veredicto, 'SIN_REFERENCIA');
});
