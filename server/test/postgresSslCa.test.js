import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePostgresSsl } from '../services/postgresPersistence.js';

/**
 * El cuarto cutover activo `DATABASE_SSL=require` y produccion arranco en
 * bucle con SELF_SIGNED_CERT_IN_CHAIN: `require` producia
 * `{ rejectUnauthorized: true }` SIN `ca`, asi que Node validaba contra su
 * almacen por defecto y la cadena de Supavisor no llegaba a ninguna raiz
 * conocida. Se salio del paso con `no-verify`, que cifra pero no comprueba
 * nada.
 *
 * Estas pruebas fijan el contrato del modo verificado. La propiedad que mas
 * importa no es que cargue el certificado, sino que **falle cerrado**: un
 * fichero ilegible o vacio tiene que lanzar, nunca degradarse en silencio a
 * `rejectUnauthorized: false`. Un `ca` vacio seria peor que no configurarlo,
 * porque Node caeria al almacen por defecto y volveria el fallo original
 * disfrazado de configuracion correcta.
 */

const temporales = [];

test.after(() => {
  for (const dir of temporales) fs.rmSync(dir, { recursive: true, force: true });
});

function ficheroTemporal(contenido, nombre = 'ca.crt') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-ca-'));
  temporales.push(dir);
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, contenido);
  return ruta;
}

const PEM_VALIDO = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBdummyContenidoDePruebaNoEsUnCertificadoReal0123456789abcdef',
  '-----END CERTIFICATE-----',
  ''
].join('\n');

// --------------------------------------------------------------------------
// Modos que ya existian: no se tocan
// --------------------------------------------------------------------------

test('no-verify sigue desactivando la verificacion', () => {
  assert.deepEqual(resolvePostgresSsl('no-verify', undefined), { rejectUnauthorized: false });
});

test('require sin CA configurada conserva el comportamiento de siempre', () => {
  const resultado = resolvePostgresSsl('require', undefined);
  assert.deepEqual(resultado, { rejectUnauthorized: true });
  assert.ok(!('ca' in resultado), 'no debe inventar un ca cuando no se configura');
  // La ruta vacia o de solo espacios cuenta como no configurada.
  assert.deepEqual(resolvePostgresSsl('require', ''), { rejectUnauthorized: true });
  assert.deepEqual(resolvePostgresSsl('require', '   '), { rejectUnauthorized: true });
});

test('disable apaga TLS y la ausencia de valor no decide nada', () => {
  assert.equal(resolvePostgresSsl('disable', undefined), false);
  assert.equal(resolvePostgresSsl('disabled', undefined), false);
  assert.equal(resolvePostgresSsl('false', undefined), false);
  assert.equal(resolvePostgresSsl('0', undefined), false);
  assert.equal(resolvePostgresSsl('', undefined), undefined);
  assert.equal(resolvePostgresSsl(undefined, undefined), undefined);
});

test('un valor desconocido sigue siendo un error, no un modo laxo', () => {
  assert.throws(() => resolvePostgresSsl('quizas', undefined), /INVALID_DATABASE_SSL/);
});

// --------------------------------------------------------------------------
// El modo verificado
// --------------------------------------------------------------------------

test('require con CA valida carga el certificado exacto', () => {
  const ruta = ficheroTemporal(PEM_VALIDO);
  const resultado = resolvePostgresSsl('require', ruta);
  assert.equal(resultado.rejectUnauthorized, true);
  assert.equal(resultado.ca, PEM_VALIDO, 'el contenido debe llegar tal cual, sin recortar');
});

test('las cuatro formas de pedir verificacion aceptan la CA', () => {
  const ruta = ficheroTemporal(PEM_VALIDO);
  for (const modo of ['require', 'required', 'true', '1']) {
    const r = resolvePostgresSsl(modo, ruta);
    assert.equal(r.rejectUnauthorized, true, modo);
    assert.equal(r.ca, PEM_VALIDO, modo);
  }
});

// --------------------------------------------------------------------------
// Fallar cerrado
// --------------------------------------------------------------------------

test('una CA configurada que no existe aborta', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-ca-'));
  temporales.push(dir);
  assert.throws(
    () => resolvePostgresSsl('require', path.join(dir, 'no-esta.crt')),
    /DATABASE_SSL_CA_UNREADABLE/
  );
});

test('una ruta que es un directorio aborta igual', () => {
  // Un directorio es ilegible como fichero en todas las plataformas, asi que
  // sirve de sustituto fiable del caso "sin permiso de lectura", que en
  // Windows no se puede provocar de forma estable.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-ca-'));
  temporales.push(dir);
  assert.throws(() => resolvePostgresSsl('require', dir), /DATABASE_SSL_CA_UNREADABLE/);
});

test('una CA vacia aborta en vez de dejar el ca en blanco', () => {
  assert.throws(() => resolvePostgresSsl('require', ficheroTemporal('')), /DATABASE_SSL_CA_INVALID/);
  assert.throws(() => resolvePostgresSsl('require', ficheroTemporal('   \n\n  ')), /DATABASE_SSL_CA_INVALID/);
});

test('un contenido que no es PEM aborta', () => {
  assert.throws(
    () => resolvePostgresSsl('require', ficheroTemporal('esto no es un certificado')),
    /DATABASE_SSL_CA_INVALID/
  );
  assert.throws(
    () => resolvePostgresSsl('require', ficheroTemporal('{"json":"tampoco"}')),
    /DATABASE_SSL_CA_INVALID/
  );
});

// --------------------------------------------------------------------------
// Las dos propiedades que de verdad protegen
// --------------------------------------------------------------------------

test('ninguna ruta produce rejectUnauthorized:false salvo el no-verify literal', () => {
  const rutaValida = ficheroTemporal(PEM_VALIDO);
  const dirIlegible = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-ca-'));
  temporales.push(dirIlegible);

  const combinaciones = [
    ['require', undefined], ['require', ''], ['require', rutaValida],
    ['required', rutaValida], ['true', rutaValida], ['1', rutaValida],
    ['disable', rutaValida], ['', rutaValida], [undefined, rutaValida],
    ['require', dirIlegible], ['require', ficheroTemporal('')],
    ['require', ficheroTemporal('no es pem')], ['quizas', rutaValida]
  ];

  for (const [modo, ca] of combinaciones) {
    let resultado;
    try {
      resultado = resolvePostgresSsl(modo, ca);
    } catch {
      continue;   // lanzar es un desenlace seguro
    }
    if (resultado && typeof resultado === 'object') {
      assert.notEqual(
        resultado.rejectUnauthorized, false,
        `modo ${modo} degrado la verificacion sin que nadie lo pidiera`
      );
    }
  }
});

test('los errores no filtran certificado, contrasena ni cadena de conexion', () => {
  const secretos = [
    'postgresql://usuario:contrasena-secreta@host:5432/postgres',
    'contrasena-secreta',
    PEM_VALIDO
  ];
  const dirIlegible = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-ca-'));
  temporales.push(dirIlegible);

  const casos = [
    () => resolvePostgresSsl('require', dirIlegible),
    () => resolvePostgresSsl('require', ficheroTemporal('')),
    () => resolvePostgresSsl('require', ficheroTemporal(PEM_VALIDO.replace('BEGIN CERTIFICATE', 'BEGIN NADA'))),
    () => resolvePostgresSsl('quizas', undefined)
  ];

  for (const caso of casos) {
    let capturado = null;
    try { caso(); } catch (error) { capturado = error; }
    assert.ok(capturado, 'se esperaba un error');
    const texto = `${capturado.message} ${capturado.stack || ''}`;
    for (const secreto of secretos) {
      assert.ok(!texto.includes(secreto), 'el error filtra material sensible');
    }
    // El mensaje es un codigo escueto, no una frase con datos dentro.
    assert.match(capturado.message, /^(DATABASE_SSL_CA_UNREADABLE|DATABASE_SSL_CA_INVALID|INVALID_DATABASE_SSL)$/);
  }
});

test('la funcion lee del entorno cuando no se le pasan argumentos', () => {
  const ruta = ficheroTemporal(PEM_VALIDO);
  const sslPrevio = process.env.DATABASE_SSL;
  const caPrevio = process.env.DATABASE_SSL_CA_FILE;
  try {
    process.env.DATABASE_SSL = 'require';
    process.env.DATABASE_SSL_CA_FILE = ruta;
    const r = resolvePostgresSsl();
    assert.equal(r.rejectUnauthorized, true);
    assert.equal(r.ca, PEM_VALIDO);
  } finally {
    if (sslPrevio === undefined) delete process.env.DATABASE_SSL; else process.env.DATABASE_SSL = sslPrevio;
    if (caPrevio === undefined) delete process.env.DATABASE_SSL_CA_FILE; else process.env.DATABASE_SSL_CA_FILE = caPrevio;
  }
});
