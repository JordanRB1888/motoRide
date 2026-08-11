import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, safeImageUrl, safeNumber, safeCoordinate } from '../src/utils/safeDom.js';

const FALLBACK = '/brand-logo-header-compact.png';

test('escapeHtml neutraliza una etiqueta con manejador de eventos', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const escaped = escapeHtml(payload);
  assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!escaped.includes('<'));
  assert.ok(!escaped.includes('>'));
});

test('escapeHtml cierra la salida por atributo con comillas dobles y simples', () => {
  assert.equal(escapeHtml('a"b'), 'a&quot;b');
  assert.equal(escapeHtml("a'b"), 'a&#39;b');
  assert.equal(
    escapeHtml('" onmouseover="alert(1)'),
    '&quot; onmouseover=&quot;alert(1)'
  );
  assert.equal(
    escapeHtml("' onfocus='alert(1)"),
    '&#39; onfocus=&#39;alert(1)'
  );
});

test('escapeHtml escapa el ampersand sin duplicar entidades', () => {
  assert.equal(escapeHtml('Tacos & Salsa'), 'Tacos &amp; Salsa');
  // El ampersand se procesa primero: si no, `<` acabaría como `&amp;lt;`.
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('escapeHtml trata valores vacíos y no textuales sin imprimir basura', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
});

test('escapeHtml protege un nombre de conductor hostil', () => {
  const nombre = '<script>fetch("/api/robo")</script>';
  assert.equal(
    escapeHtml(nombre),
    '&lt;script&gt;fetch(&quot;/api/robo&quot;)&lt;/script&gt;'
  );
});

test('safeImageUrl rechaza javascript: en todas sus formas', () => {
  const hostiles = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)  ',
    'JAVASCRIPT:alert(document.cookie)',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'about:blank'
  ];
  for (const url of hostiles) {
    assert.equal(safeImageUrl(url, FALLBACK), FALLBACK, `debió rechazarse: ${url}`);
  }
});

test('safeImageUrl rechaza esquemas ofuscados con caracteres de control', () => {
  const conTabulador = 'java\tscript:alert(1)';
  const conSaltoDeLinea = 'java\nscript:alert(1)';
  const conNulo = `java${String.fromCharCode(0)}script:alert(1)`;
  assert.equal(safeImageUrl(conTabulador, FALLBACK), FALLBACK);
  assert.equal(safeImageUrl(conSaltoDeLinea, FALLBACK), FALLBACK);
  assert.equal(safeImageUrl(conNulo, FALLBACK), FALLBACK);
});

test('safeImageUrl acepta http y https válidos', () => {
  const validas = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos',
    'http://localhost:4000/api/users/driver_1/photo',
    'https://plus58express.vercel.app/logo.png',
    'HTTPS://EJEMPLO.COM/foto.jpg'
  ];
  for (const url of validas) {
    assert.equal(safeImageUrl(url, FALLBACK), url, `debió aceptarse: ${url}`);
  }
});

test('safeImageUrl acepta rutas relativas de la propia aplicación', () => {
  const rutas = [
    '/vehicles/moto-real.png',
    '/api/users/driver_9/photo',
    './assets/avatar.png',
    '../public/logo.png',
    'images/logo.png'
  ];
  for (const ruta of rutas) {
    assert.equal(safeImageUrl(ruta, FALLBACK), ruta, `debió aceptarse: ${ruta}`);
  }
});

test('safeImageUrl rechaza el protocolo relativo //host', () => {
  // Hereda el esquema de la página y puede apuntar a cualquier dominio.
  assert.equal(safeImageUrl('//evil.example/x.png', FALLBACK), FALLBACK);
});

test('safeImageUrl devuelve el fallback con valores nulos o malformados', () => {
  const invalidos = [null, undefined, '', '   ', 42, {}, [], true, NaN, 'http://', 'https://'];
  for (const valor of invalidos) {
    assert.equal(safeImageUrl(valor, FALLBACK), FALLBACK, `debió rechazarse: ${String(valor)}`);
  }
});

test('safeImageUrl usa cadena vacía como fallback por omisión', () => {
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(safeImageUrl(null), '');
});

test('safeImageUrl solo admite imágenes data: cuando se piden explícitamente', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  // Por omisión quedan fuera: el avatar del conductor nunca las necesita.
  assert.equal(safeImageUrl(png, FALLBACK), FALLBACK);
  // El chat de soporte sí las usa y las habilita de forma explícita.
  assert.equal(safeImageUrl(png, FALLBACK, { allowData: true }), png);
  assert.equal(
    safeImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==', FALLBACK, { allowData: true }),
    'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  );
  // Un SVG puede transportar scripts, así que no entra ni con allowData.
  assert.equal(
    safeImageUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', FALLBACK, { allowData: true }),
    FALLBACK
  );
  // Y un data: que no sea imagen tampoco.
  assert.equal(
    safeImageUrl('data:text/html;base64,PHNjcmlwdD4=', FALLBACK, { allowData: true }),
    FALLBACK
  );
});

test('safeNumber normaliza calificaciones y contadores de viajes', () => {
  assert.equal(safeNumber(4.87, { decimals: 1 }), 4.9);
  assert.equal(safeNumber('4.5'), 4.5);
  assert.equal(safeNumber('no soy un número', { fallback: 5 }), 5);
  assert.equal(safeNumber(null, { fallback: 0 }), 0);
  assert.equal(safeNumber(Infinity, { fallback: 5 }), 5);
  assert.equal(safeNumber(NaN, { fallback: 5 }), 5);
  // Una calificación fuera de escala se acota en vez de mostrarse tal cual.
  assert.equal(safeNumber(9999, { min: 0, max: 5 }), 5);
  assert.equal(safeNumber(-3, { min: 0, max: 5 }), 0);
  assert.equal(safeNumber('<img src=x onerror=alert(1)>', { fallback: 0 }), 0);
});

test('safeCoordinate valida rangos geográficos', () => {
  assert.equal(safeCoordinate('10.6427'), 10.6427);
  assert.equal(safeCoordinate('-71.6125', 'lng'), -71.6125);
  assert.equal(safeCoordinate(90), 90);
  assert.equal(safeCoordinate(-90), -90);
  assert.equal(safeCoordinate(180, 'lng'), 180);
  assert.equal(safeCoordinate(-180, 'lng'), -180);

  assert.equal(safeCoordinate(91), null);
  assert.equal(safeCoordinate(-91), null);
  assert.equal(safeCoordinate(181, 'lng'), null);
  assert.equal(safeCoordinate(-181, 'lng'), null);
  assert.equal(safeCoordinate('abc'), null);
  assert.equal(safeCoordinate(null), null);
  assert.equal(safeCoordinate(undefined), null);
  assert.equal(safeCoordinate(Infinity), null);
  assert.equal(safeCoordinate(''), null);
  // Una longitud válida sigue siendo inválida como latitud.
  assert.equal(safeCoordinate(150, 'lat'), null);
  assert.equal(safeCoordinate(150, 'lng'), 150);
});
