import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  HOST_OFICIAL_BCV,
  URL_OFICIAL_BCV,
  crearAgenteDelBcv,
  descargarDelBcv,
  esHostDelBcv,
  obtenerTasaOficial,
  validarDestino
} from '../services/bcvRateProvider.ts';
import { PORTADA_BCV_REAL, TASA_ESPERADA, FECHA_VALOR_ESPERADA } from './fixtures/bcvHome.js';

/**
 * FX-BCV-1 — el proveedor y su endurecimiento.
 *
 * Salvo la prueba explícitamente marcada, ninguna sale a la red: el
 * descargador es sustituible justamente para poder comprobar el
 * endurecimiento sin depender de que el BCV esté disponible.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizServidor = path.resolve(aqui, '..');

/**
 * El código sin comentarios: lo que de verdad se ejecuta.
 *
 * Las reglas de abajo miran esto y no el fichero entero. Los comentarios de
 * FX-BCV-1 nombran a Binance y al mercado paralelo precisamente para explicar
 * que NO se usan, y una regla que leyera el texto completo se dispararía con su
 * propia documentación.
 */
const soloCodigo = texto =>
  texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const codigoDe = relativa =>
  soloCodigo(fs.readFileSync(path.join(raizServidor, relativa), 'utf8'));

// ---------------------------------------------------------------------------
// La fuente: oficial, y sólo la oficial
// ---------------------------------------------------------------------------

test('la única fuente configurada es el dominio del BCV', () => {
  assert.equal(HOST_OFICIAL_BCV, 'www.bcv.org.ve');
  assert.equal(URL_OFICIAL_BCV, 'https://www.bcv.org.ve/');
  assert.ok(URL_OFICIAL_BCV.startsWith('https://'), 'la fuente oficial se consulta por HTTPS');
});

test('ninguna fuente no oficial aparece en el código de FX', () => {
  // La regla del encargo es explícita: la tasa oficial la publica el BCV y
  // nadie más. Republicar no es publicar. Esta prueba existe para que meter una
  // fuente paralela requiera borrarla a conciencia, y no sea nunca un descuido
  // de un día con prisa.
  const prohibidas = [
    'binance', 'monitordolar', 'dolartoday', 'exchangerate', 'openexchange',
    'yadio', 'pydolarve', 'criptodolar', 'airtm', 'usdt.com', 'cotizave', 'bcvapi'
  ];
  const ficheros = [
    'domain/bcvRateParser.ts',
    'domain/fxSanity.ts',
    'domain/decimalMoney.ts',
    'services/bcvRateProvider.ts',
    'services/fxRateService.ts',
    'services/fxRateStore.ts',
    'services/fxRateScheduler.ts',
    'services/fxRateUpdater.ts'
  ];

  for (const relativa of ficheros) {
    const codigo = codigoDe(relativa).toLowerCase();
    for (const prohibida of prohibidas) {
      assert.equal(codigo.includes(prohibida), false, `${relativa} usa ${prohibida}`);
    }
  }
});

test('no existe ninguna tasa escrita a mano como respaldo', () => {
  // Un valor de respaldo se queda viejo en silencio y cobra mal durante semanas.
  // La ausencia de tasa tiene que ser visible, no maquillada.
  // Ningún literal numérico con pinta de tasa (tres o más dígitos enteros).
  for (const relativa of ['services/bcvRateProvider.ts', 'services/fxRateService.ts']) {
    const sospechosos = codigoDe(relativa).match(/\b\d{3,}\.\d+\b/g) ?? [];
    assert.deepEqual(sospechosos, [], `${relativa} contiene un valor con forma de tasa`);
  }
});

// ---------------------------------------------------------------------------
// TLS: se completa la cadena, NO se relaja la verificación
// ---------------------------------------------------------------------------

test('el agente TLS mantiene la verificación encendida', () => {
  const agente = crearAgenteDelBcv();
  assert.equal(agente.options.rejectUnauthorized, true);
  assert.equal(agente.options.minVersion, 'TLSv1.2');
  assert.ok(Array.isArray(agente.options.ca), 'se pasa una lista de autoridades');
  // Muchas: el almacén del sistema MÁS el intermedio. Si sólo hubiera una, se
  // habría reemplazado el almacén en vez de ampliarlo, y la raíz que firma el
  // propio intermedio quedaría fuera.
  assert.ok(agente.options.ca.length > 1, 'el almacén del sistema se conserva');
});

test('rejectUnauthorized: false no aparece en ninguna parte de FX', () => {
  // Es LA tentación de este encargo: el BCV no envía su certificado intermedio
  // y apagar la verificación «arregla» el síntoma en una línea. También deja la
  // conexión abierta a cualquiera que pueda interponerse, para traer el número
  // con el que se cobra. La solución fue completar la cadena, no relajarla.
  const prohibido = /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/;
  for (const relativa of ['services/bcvRateProvider.ts', 'services/fxRateUpdater.ts']) {
    assert.equal(prohibido.test(codigoDe(relativa)), false, `${relativa} desactiva la verificación TLS`);
  }
});

test('el certificado intermedio guardado es el que dice ser', () => {
  // Se comprueba la huella, el emisor y que siga vigente. Si alguien sustituye
  // el fichero por otro certificado, esto lo dice.
  const pem = fs.readFileSync(
    path.join(raizServidor, 'certs/sectigo-public-server-authentication-ca-dv-r36.pem'),
    'utf8'
  );
  const certificado = new X509Certificate(pem);

  assert.equal(
    certificado.fingerprint256,
    '8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0'
  );
  assert.match(certificado.subject, /Sectigo Public Server Authentication CA DV R36/);
  assert.match(certificado.issuer, /Sectigo Public Server Authentication Root R46/);
  assert.equal(certificado.ca, true, 'tiene que ser una autoridad certificadora');
  assert.ok(new Date(certificado.validTo) > new Date(), 'el intermedio sigue vigente');
});

test('el fichero de certificados NO contiene ninguna clave privada', () => {
  // `.gitignore` excluye `*.pem` precisamente porque casi siempre son claves
  // privadas, y para este fichero hay una excepción nominal. Esta prueba es el
  // contrapeso de esa excepción: si alguien deja caer una clave privada en
  // `server/certs/`, se entera aquí y no cuando ya esté publicada.
  const directorio = path.join(raizServidor, 'certs');
  for (const nombre of fs.readdirSync(directorio)) {
    const contenido = fs.readFileSync(path.join(directorio, nombre), 'utf8');
    assert.equal(
      /-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(contenido),
      false,
      `${nombre} contiene una clave privada`
    );
    assert.ok(
      contenido.includes('-----BEGIN CERTIFICATE-----'),
      `${nombre} debería ser un certificado`
    );
  }
});

// ---------------------------------------------------------------------------
// A dónde se permite llegar
// ---------------------------------------------------------------------------

test('sólo se reconoce como propio el dominio del BCV', () => {
  assert.equal(esHostDelBcv('bcv.org.ve'), true);
  assert.equal(esHostDelBcv('www.bcv.org.ve'), true);
  assert.equal(esHostDelBcv('WWW.BCV.ORG.VE'), true);

  // El ataque evidente: un dominio que TERMINA parecido pero no lo es.
  assert.equal(esHostDelBcv('bcv.org.ve.atacante.com'), false);
  assert.equal(esHostDelBcv('malobcv.org.ve'), false, 'sufijo sin punto: no es subdominio');
  assert.equal(esHostDelBcv('bcv.org.ve.co'), false);
  assert.equal(esHostDelBcv('binance.com'), false);
  assert.equal(esHostDelBcv(''), false);
});

test('se rechaza HTTP en claro', async () => {
  await assert.rejects(
    () => descargarDelBcv('http://www.bcv.org.ve/'),
    /sólo se admite HTTPS/,
    'sobre HTTP cualquiera en el camino puede cambiar el número'
  );
});

test('se rechaza cualquier host fuera del BCV', async () => {
  await assert.rejects(() => descargarDelBcv('https://binance.com/'), /fuera del dominio del BCV/);
  await assert.rejects(() => descargarDelBcv('https://bcv.org.ve.atacante.com/'), /fuera del dominio/);
});

test('el destino de una redirección pasa por la MISMA validación', () => {
  // El escenario que importa: el servidor responde 302 y manda la petición a
  // otro sitio. Seguirla a ciegas significa aceptar que un tercero decida de
  // dónde sale la tasa oficial.
  //
  // Se ejercita `validarDestino`, que es la función que el descargador aplica
  // tanto a la petición inicial como a cada salto. Reimplementar aquí la lógica
  // comprobaría la copia y no el código que corre en producción.
  const comoSeResuelveUnSalto = (ubicacion, base) => new URL(ubicacion, base).toString();

  assert.throws(
    () => validarDestino(comoSeResuelveUnSalto('https://dolartoday.com/', URL_OFICIAL_BCV)),
    /fuera del dominio del BCV/
  );
  assert.throws(
    () => validarDestino(comoSeResuelveUnSalto('http://www.bcv.org.ve/tasas', URL_OFICIAL_BCV)),
    /sólo se admite HTTPS/,
    'una redirección no puede degradar la conexión a HTTP'
  );

  // Y un salto legítimo dentro del propio dominio sí se admite.
  const interno = validarDestino(comoSeResuelveUnSalto('/tasas-informativas', URL_OFICIAL_BCV));
  assert.equal(interno.hostname, 'www.bcv.org.ve');
  assert.equal(interno.protocol, 'https:');
});

// ---------------------------------------------------------------------------
// Reintentos: los de red sí, los de forma no
// ---------------------------------------------------------------------------

test('reintenta los fallos de red y acaba devolviendo la tasa', async () => {
  let intentos = 0;
  const resultado = await obtenerTasaOficial({
    esperaMs: 0,
    descargador: async () => {
      intentos += 1;
      if (intentos < 3) throw new Error('ECONNRESET');
      return { html: PORTADA_BCV_REAL, urlFinal: URL_OFICIAL_BCV, estado: 200 };
    }
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.valor.tasa, TASA_ESPERADA);
  assert.equal(resultado.valor.fechaValor, FECHA_VALOR_ESPERADA);
  assert.equal(intentos, 3);
});

test('agotados los intentos devuelve fallo de red, nunca un número', async () => {
  let intentos = 0;
  const resultado = await obtenerTasaOficial({
    esperaMs: 0,
    descargador: async () => {
      intentos += 1;
      throw new Error('sin respuesta');
    }
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'RED');
  assert.equal(intentos, 3);
  assert.equal(resultado.valor, undefined, 'un fallo no puede traer una tasa');
});

test('NO reintenta cuando la página se descarga pero cambió de forma', async () => {
  // Repetir la misma petición daría el mismo documento. El problema no es
  // transitorio: la página cambió y eso lo tiene que ver una persona.
  let intentos = 0;
  const resultado = await obtenerTasaOficial({
    esperaMs: 0,
    descargador: async () => {
      intentos += 1;
      return { html: '<html>mantenimiento</html>', urlFinal: URL_OFICIAL_BCV, estado: 200 };
    }
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'BLOQUE_DOLAR_AUSENTE');
  assert.equal(intentos, 1, 'un fallo de forma no se reintenta');
});

test('el detalle del fallo no arrastra el documento ni cabeceras', async () => {
  // Esto acaba en los registros del servidor. Un volcado del HTML entero ahí no
  // ayuda a nadie y llena los registros de ruido.
  const resultado = await obtenerTasaOficial({
    esperaMs: 0,
    descargador: async () => { throw new Error('socket hang up'); }
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.detalle, 'socket hang up');
  assert.ok(resultado.detalle.length < 200);
});

test('el instante de obtención es inyectable y sale en ISO', async () => {
  const resultado = await obtenerTasaOficial({
    descargador: async () => ({ html: PORTADA_BCV_REAL, urlFinal: URL_OFICIAL_BCV, estado: 200 }),
    ahora: () => new Date('2026-08-30T21:30:00.000Z')
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.valor.obtenidaEn, '2026-08-30T21:30:00.000Z');
});

// ---------------------------------------------------------------------------
// La red de verdad, sólo si se pide
// ---------------------------------------------------------------------------

test('llega al BCV real con la cadena TLS completa', {
  skip: process.env.FX_BCV_LIVE === '1'
    ? false
    : 'prueba de red: ejecutar con FX_BCV_LIVE=1'
}, async () => {
  // Comprueba lo que ninguna prueba con fixture puede: que el certificado
  // intermedio guardado sigue completando la cadena y que la portada sigue
  // teniendo la forma que el parser espera. Está apagada por defecto para que
  // la suite no dependa de la red ni moleste al BCV en cada ejecución.
  const resultado = await obtenerTasaOficial();
  assert.equal(resultado.ok, true, resultado.ok ? '' : `${resultado.motivo}: ${resultado.detalle}`);
  assert.match(resultado.valor.tasa, /^\d+\.\d+$/);
  assert.match(resultado.valor.fechaValor, /^\d{4}-\d{2}-\d{2}$/);
});
