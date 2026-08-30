import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DRIVER-FINANCE-1 v5 — EL ORDEN de la completación, como contrato.
 *
 * La cuarta auditoría encontró que el dinero del conductor se confirmaba antes
 * de que el viaje completado y el cobro a la pasajera fueran durables. Un
 * fallo posterior al persistir dejaba una liquidación real colgando de un
 * viaje que, para la base, todavía no había terminado — y el reconciliador no
 * tenía forma de saber qué había pasado.
 *
 * El orden correcto es uno solo:
 *
 *   1. transición canónica + cobro a la pasajera   (documentos)
 *   2. PERSISTIR                                    (durable)
 *   3. dinero del conductor                         (libro contable)
 *
 * Esta prueba lo vigila donde es fácil que se rompa: no en el comportamiento,
 * que un refactor puede conservar por casualidad, sino en la FORMA del código.
 * Si alguien vuelve a mover el dinero antes de persistir, aquí se entera.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fuente = fs.readFileSync(path.join(raiz, 'index.js'), 'utf8');

/** El cuerpo de una función declarada con `function nombre(`, por llaves. */
function cuerpoDe(nombre) {
  const inicio = fuente.indexOf(`function ${nombre}(`);
  assert.notEqual(inicio, -1, `no se encontró la función ${nombre}`);
  // El cuerpo empieza tras la lista de parámetros, no en la primera llave:
  // una firma con desestructuración —`({ a, b })`— traía una llave antes.
  let parentesis = 0;
  let j = fuente.indexOf('(', inicio);
  for (; j < fuente.length; j += 1) {
    if (fuente[j] === '(') parentesis += 1;
    else if (fuente[j] === ')') { parentesis -= 1; if (parentesis === 0) break; }
  }
  let profundidad = 0;
  let i = fuente.indexOf('{', j);
  const desde = i;
  for (; i < fuente.length; i += 1) {
    if (fuente[i] === '{') profundidad += 1;
    else if (fuente[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return fuente.slice(desde, i + 1);
    }
  }
  throw new Error(`cuerpo sin cerrar: ${nombre}`);
}

const apariciones = (texto, aguja) => texto.split(aguja).length - 1;

test('el dinero del conductor se escribe en UN solo sitio', () => {
  // Fuera de su propia declaración, `settleDriverForCompletedTrip` solo puede
  // invocarse desde el paso posterior a la persistencia y desde el rescate de
  // lo que quedó pendiente. Dos caminos, y los dos después de lo durable.
  const invocaciones = apariciones(fuente, 'settleDriverForCompletedTrip(trip)')
    - apariciones(fuente, 'function settleDriverForCompletedTrip(trip)');
  assert.equal(invocaciones, 2,
    'solo el paso posterior a persistir y el rescate de pendientes pueden liquidar');
  assert.ok(cuerpoDe('liquidarConductorTrasPersistir').includes('settleDriverForCompletedTrip(trip)'),
    'uno es el paso posterior a persistir');
});

test('la transición canónica NO toca el dinero del conductor', () => {
  const cuerpo = cuerpoDe('aplicarTransicionDelConductor');
  assert.ok(!cuerpo.includes('settleDriverForCompletedTrip'),
    'la transición no puede liquidar: todavía no hay nada durable');
  assert.ok(!cuerpo.includes('liquidarConductorTrasPersistir'),
    'ni llamar al paso que lo hace');
  // Lo que SÍ hace: el cobro a la pasajera, que es un documento y viaja con
  // el viaje en la misma persistencia.
  assert.ok(cuerpo.includes('debitPassengerWalletForCompletedTrip(trip)'),
    'la pasajera se cobra aquí, junto al viaje');
  assert.ok(cuerpo.includes('driverPending: true'),
    'y el dinero del conductor queda marcado como pendiente, no hecho');
});

test('los TRES caminos de completación liquidan después de persistir', () => {
  const llamadas = [...fuente.matchAll(/liquidarConductorTrasPersistir\(/g)]
    .filter(m => !fuente.slice(Math.max(0, m.index - 40), m.index).includes('async function'));
  assert.equal(llamadas.length, 3,
    'socket del conductor, reconciliación sin conexión y cierre administrativo: ni uno más');

  const contextos = llamadas.map(m => fuente.slice(Math.max(0, m.index - 1400), m.index));

  // 1) El camino en línea: el socket persiste y solo entonces liquida.
  assert.ok(contextos.some(c => /if \(!await persistDatabase\(\)\) \{[\s\S]*tripStatusRejected/.test(c)),
    'el camino del socket liquida tras una persistencia correcta');

  // 2) El cierre administrativo: lo mismo con su propia persistencia HTTP.
  assert.ok(contextos.some(c => c.includes('if (!await persistHttp(res)) return;')),
    'el cierre administrativo liquida tras persistir');

  // 3) La reconciliación sin conexión: liquida DENTRO del anuncio que el
  //    router invoca, y el router solo anuncia después de persistir. Ese
  //    segundo tramo se comprueba en el propio router, más abajo.
  assert.ok(contextos.some(c => c.includes('announceTransition: async (trip, settlement)')),
    'la reconciliación sin conexión liquida dentro del anuncio');
});

test('el router sin conexión solo anuncia —y por tanto liquida— tras persistir', () => {
  const router = fs.readFileSync(path.join(raiz, 'routes', 'tripOfflineEvents.js'), 'utf8');
  const anuncio = router.indexOf('await announceTransition(');
  assert.notEqual(anuncio, -1, 'el router espera al anuncio: dentro se mueve dinero');
  const antes = router.slice(0, anuncio);
  const persistencia = antes.lastIndexOf('await persistDatabase()');
  assert.notEqual(persistencia, -1, 'y persiste antes');
  assert.ok(persistencia < anuncio,
    'el orden es persistir y después liquidar, igual que en el camino en línea');
  // Y si la persistencia falla, el router devuelve 503 sin llegar al anuncio.
  assert.ok(/if \(!await persistDatabase\(\)\) \{[\s\S]{0,600}?return res\.status\(503\)/.test(router),
    'una persistencia fallida corta el camino antes de tocar el dinero');
});

test('el reintento de lo pendiente también pasa por la misma liquidación', () => {
  assert.ok(fuente.includes('resolvePendingSettlement:'),
    'la aplicación tiene que saber rescatar una carrera hecha sin cobrar');
  const bloque = fuente.slice(fuente.indexOf('resolvePendingSettlement:'), fuente.indexOf('resolvePendingSettlement:') + 700);
  assert.ok(bloque.includes('settleDriverForCompletedTrip(trip)'),
    'y hacerlo por el camino normal, no por uno paralelo');
  assert.ok(bloque.includes("trip.status !== TRIP_STATUS.COMPLETED"),
    'solo se rescata lo que de verdad se completó');
});

test('la autoridad del saldo NO depende de la bandera de la política', () => {
  // El crítico 2 de la cuarta auditoría: apagar la política devolvía las
  // ganancias al documento mientras el disparador las borraba. Una vez que
  // alguien entra al libro, su dinero vive ahí — encendida o apagada.
  const liquidacion = cuerpoDe('settleDriverForCompletedTrip');
  assert.ok(liquidacion.includes('const libro = persistence.financeReady === true;'),
    'el libro manda por existir, no por la bandera');
  assert.ok(!liquidacion.includes('DRIVER_FINANCE_ON && persistence.financeReady'),
    'la bandera ya no decide dónde vive el saldo');
  assert.ok(liquidacion.includes('policyEnabled: DRIVER_FINANCE_ON'),
    'lo que la bandera decide es la POLÍTICA, y se pasa explícita');

  const credito = cuerpoDe('aplicarCreditoAlConductor');
  assert.ok(credito.includes('if (persistence.financeReady === true) {'),
    'el crédito entra al libro aunque la política esté apagada');
  assert.ok(credito.includes('policyEnabled: DRIVER_FINANCE_ON'));
});

// ---------------------------------------------------------------------------
// v8 · el fin de carrera de la pasajera no espera al libro del conductor
// ---------------------------------------------------------------------------
//
// La septima auditoria midio 11.5 segundos entre un viaje que YA era durable
// -la pasajera ya estaba cobrada- y el anuncio que su pantalla esperaba. No
// era una carrera ni un fallo de la liquidacion: el anuncio estaba encadenado
// al dinero del conductor, que no le concierne.

test('v8 · el estado se anuncia ANTES de liquidar, y la cartera del conductor despues', () => {
  for (const [camino, ancla] of [
    ['el socket del conductor', 'const resultado = await aplicarTransicionDelConductor(trip, status'],
    ['la reconciliacion sin conexion', 'announceTransition: async (trip, settlement)']
  ]) {
    const desde = fuente.indexOf(ancla);
    assert.notEqual(desde, -1, `no se encontro ${camino}`);
    const bloque = fuente.slice(desde, desde + 2600);
    const anuncio = bloque.indexOf('anunciarTransicionDelConductor(trip');
    const liquidacion = bloque.indexOf('liquidarConductorTrasPersistir(trip');
    const cartera = bloque.indexOf('emitirCarteraDeConductor(trip');
    assert.ok(anuncio > -1 && liquidacion > -1 && cartera > -1,
      `${camino} tiene que anunciar, liquidar y emitir la cartera del conductor`);
    assert.ok(anuncio < liquidacion,
      `${camino}: el estado se anuncia en cuanto es durable, sin esperar al dinero del conductor`);
    assert.ok(liquidacion < cartera,
      `${camino}: la cartera del conductor se emite cuando su liquidacion se resuelve, no antes`);
  }
});

test('v8 · el anuncio de la transicion NO arrastra la cartera del conductor', () => {
  const desde = fuente.indexOf('function anunciarTransicionDelConductor(');
  assert.notEqual(desde, -1);
  const cuerpo = fuente.slice(desde, fuente.indexOf('\n}', desde));
  assert.ok(cuerpo.includes('emitirCarteraDePasajera'),
    'la cartera de la pasajera SI: ya es durable cuando el viaje lo es');
  assert.ok(!cuerpo.includes('emitirCarteraDeConductor'),
    'la del conductor NO: aun no se sabe, y esperarla retenia el fin de carrera');
});
