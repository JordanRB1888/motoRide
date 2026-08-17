import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSupportSearch,
  matchesSupportThread,
  filterSupportThreads,
  MAX_SUPPORT_SEARCH_LENGTH
} from '../domain/supportSearch.js';

const hilo = (extra = {}) => ({
  userId: 'u_1',
  user: { id: 'u_1', firstName: 'Ana', lastName: 'Rodriguez', email: 'ana@ejemplo.com', phone: '+584140001122' },
  lastMessage: { id: 'm_1', text: 'Mi conductor no llego al punto de encuentro' },
  unread: 0,
  messageCount: 1,
  ...extra
});

test('el texto se normaliza y tiene longitud maxima', () => {
  assert.equal(parseSupportSearch('  ANA  '), 'ana');
  assert.equal(parseSupportSearch(''), '');
  assert.equal(parseSupportSearch(undefined), '');
  assert.equal(parseSupportSearch(null), '');
  assert.doesNotThrow(() => parseSupportSearch('a'.repeat(MAX_SUPPORT_SEARCH_LENGTH)));
  assert.throws(() => parseSupportSearch('a'.repeat(MAX_SUPPORT_SEARCH_LENGTH + 1)), /SEARCH_TOO_LONG/);
});

test('busca en nombre, correo, telefono y ultimo mensaje', () => {
  // El mismo conjunto de campos que miraba la pantalla.
  for (const consulta of [
    'ana', 'RODRIGUEZ', 'ana rodriguez',
    'ejemplo.com', '0001122',
    'conductor', 'punto de encuentro'
  ]) {
    assert.equal(
      matchesSupportThread(hilo(), parseSupportSearch(consulta)), true,
      `debia encontrarse con "${consulta}"`
    );
  }
  assert.equal(matchesSupportThread(hilo(), parseSupportSearch('zzznoexiste')), false);
});

test('sin texto no se filtra nada', () => {
  const hilos = [hilo({ userId: 'a' }), hilo({ userId: 'b' })];
  assert.equal(filterSupportThreads(hilos, ''), hilos, 'devuelve la misma coleccion');
  assert.equal(filterSupportThreads(hilos, parseSupportSearch('')).length, 2);
});

test('un hilo sin usuario o sin mensaje no rompe la busqueda', () => {
  assert.doesNotThrow(() => matchesSupportThread({ user: null, lastMessage: null }, 'ana'));
  assert.equal(matchesSupportThread({ user: null, lastMessage: null }, 'ana'), false);
  assert.equal(matchesSupportThread(null, 'ana'), false);
  // Sin texto que buscar, cualquier hilo pasa.
  assert.equal(matchesSupportThread(null, ''), true);
});

test('el filtrado conserva el orden de actividad reciente', () => {
  const hilos = ['c', 'b', 'a'].map(id => hilo({ userId: id }));
  assert.deepEqual(filterSupportThreads(hilos, 'ana').map(h => h.userId), ['c', 'b', 'a']);
});

test('entradas ausentes devuelven una coleccion vacia', () => {
  assert.deepEqual(filterSupportThreads(null, 'ana'), []);
  assert.deepEqual(filterSupportThreads(undefined, 'ana'), []);
});

test('cada hilo se examina una sola vez, sea cual sea el volumen', () => {
  // Se cuentan accesos en lugar de cronometrar: el reloj de pared es ruido
  // cuando la suite corre en paralelo.
  const construir = n => Array.from({ length: n }, (_, i) => {
    const base = {
      userId: `u_${i}`,
      user: { firstName: `Persona${i}`, lastName: 'Prueba', email: `p${i}@ejemplo.com`, phone: '+58414' },
      unread: 0, messageCount: 1
    };
    let lecturas = 0;
    Object.defineProperty(base, 'lastMessage', {
      get() { lecturas += 1; return { text: `Mensaje ${i}` }; },
      enumerable: true
    });
    Object.defineProperty(base, '__lecturas', { get: () => lecturas, enumerable: false });
    return base;
  });

  for (const n of [100, 1000, 5000]) {
    const datos = construir(n);
    filterSupportThreads(datos, 'persona9');
    const total = datos.reduce((suma, item) => suma + item.__lecturas, 0);
    assert.ok(total <= n * 2, `con ${n} hilos hubo ${total} lecturas: el coste no es lineal`);
  }
});
