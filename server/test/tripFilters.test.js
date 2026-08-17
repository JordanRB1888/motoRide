import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTripFilters, matchesTripFilters, filterTrips,
  summarizeTripsByUser, tripRecency,
  ESTADOS_ACTIVOS, MAX_TRIP_USER_IDS
} from '../domain/tripFilters.js';

const viaje = (extra = {}) => ({
  id: 't_1', status: 'COMPLETED', passengerId: 'p_1', driverId: 'd_1',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T01:00:00.000Z',
  ...extra
});

// ------------------------------------------------------------- interpretacion

test('sin parametros no se filtra nada', () => {
  const filtros = parseTripFilters({});
  assert.equal(filtros.status, 'all');
  assert.equal(filtros.userIds, null);
});

test('un estado inventado se rechaza en vez de ignorarse', () => {
  // Ignorarlo devolveria mas viajes de los pedidos, que en un panel de
  // operaciones es lo contrario de lo que se espera.
  for (const malo of ['inventado', 'COMPLETED', 'activo', 'ALL']) {
    assert.throws(() => parseTripFilters({ status: malo }), /INVALID_TRIP_STATUS/, `estado ${malo}`);
  }
});

test('se pueden pedir los viajes de varias personas a la vez', () => {
  // La pantalla de usuarios resuelve las ocho de la pagina de una vez, nunca
  // una peticion por fila.
  assert.deepEqual([...parseTripFilters({ userId: 'a,b,c' }).userIds], ['a', 'b', 'c']);
  assert.deepEqual([...parseTripFilters({ userId: ' a , b ' }).userIds], ['a', 'b']);
});

test('el numero de personas tiene tope', () => {
  const muchos = Array.from({ length: MAX_TRIP_USER_IDS }, (_, i) => `u_${i}`).join(',');
  assert.doesNotThrow(() => parseTripFilters({ userId: muchos }));
  assert.throws(() => parseTripFilters({ userId: `${muchos},uno_mas` }), /TOO_MANY_USER_IDS/);
  assert.throws(() => parseTripFilters({ userId: ',' }), /INVALID_USER_ID/);
});

// -------------------------------------------------------------------- filtros

test('«active» son exactamente los estados no terminales', () => {
  const filtros = parseTripFilters({ status: 'active' });
  for (const estado of ESTADOS_ACTIVOS) {
    assert.equal(matchesTripFilters(viaje({ status: estado }), filtros), true, estado);
  }
  for (const estado of ['COMPLETED', 'CANCELLED', 'SCHEDULED']) {
    assert.equal(matchesTripFilters(viaje({ status: estado }), filtros), false, estado);
  }
});

test('los demas estados filtran uno a uno', () => {
  for (const [consulta, estado] of [
    ['completed', 'COMPLETED'], ['cancelled', 'CANCELLED'], ['scheduled', 'SCHEDULED']
  ]) {
    const filtros = parseTripFilters({ status: consulta });
    assert.equal(matchesTripFilters(viaje({ status: estado }), filtros), true);
    assert.equal(matchesTripFilters(viaje({ status: 'IN_PROGRESS' }), filtros), false);
  }
});

test('una persona cuenta en cualquiera de sus tres papeles', () => {
  const filtros = parseTripFilters({ userId: 'x' });
  assert.equal(matchesTripFilters(viaje({ passengerId: 'x' }), filtros), true);
  assert.equal(matchesTripFilters(viaje({ driverId: 'x' }), filtros), true);
  assert.equal(matchesTripFilters(viaje({ assignedDriverId: 'x' }), filtros), true);
  assert.equal(matchesTripFilters(viaje(), filtros), false);
});

test('los filtros se combinan', () => {
  const viajes = [
    viaje({ id: 'a', passengerId: 'x', status: 'COMPLETED' }),
    viaje({ id: 'b', passengerId: 'x', status: 'IN_PROGRESS' }),
    viaje({ id: 'c', passengerId: 'y', status: 'COMPLETED' })
  ];
  const filtros = parseTripFilters({ userId: 'x', status: 'completed' });
  assert.deepEqual(filterTrips(viajes, filtros).map(t => t.id), ['a']);
});

test('se devuelven del mas reciente al mas antiguo', () => {
  // Toda pantalla que los enseña quiere los ultimos primero; antes cada una
  // reordenaba por su cuenta tras descargarlo todo.
  const viajes = [
    viaje({ id: 'viejo', updatedAt: '2026-01-01T00:00:00.000Z' }),
    viaje({ id: 'nuevo', updatedAt: '2026-06-01T00:00:00.000Z' }),
    viaje({ id: 'medio', updatedAt: '2026-03-01T00:00:00.000Z' })
  ];
  assert.deepEqual(filterTrips(viajes, parseTripFilters({})).map(t => t.id), ['nuevo', 'medio', 'viejo']);
});

test('la recencia prefiere el cierre y luego la ultima actualizacion', () => {
  const cerrado = viaje({ completedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const tocado = viaje({ updatedAt: '2026-05-01T00:00:00.000Z' });
  assert.ok(tripRecency(cerrado) > tripRecency(tocado));
  // Un viaje sin ninguna fecha no rompe el orden.
  assert.equal(tripRecency({}), 0);
  assert.equal(tripRecency(null), 0);
  assert.equal(tripRecency({ updatedAt: 'no es fecha' }), 0);
});

test('entradas ausentes no rompen el filtrado', () => {
  assert.deepEqual(filterTrips(null, parseTripFilters({})), []);
  assert.deepEqual(filterTrips(undefined, parseTripFilters({})), []);
  assert.equal(matchesTripFilters(null, parseTripFilters({})), false);
});

// ------------------------------------------------------------------- recuento

test('el recuento cubre las personas pedidas, tambien sin viajes', () => {
  const viajes = [
    viaje({ id: 'a', passengerId: 'p1', status: 'COMPLETED' }),
    viaje({ id: 'b', passengerId: 'p1', status: 'CANCELLED' }),
    viaje({ id: 'c', driverId: 'p2', status: 'COMPLETED' })
  ];
  const resumen = summarizeTripsByUser(viajes, ['p1', 'p2', 'sin_viajes']);
  const por = Object.fromEntries(resumen.map(r => [r.userId, r]));

  assert.deepEqual(por.p1, { userId: 'p1', total: 2, completed: 1 });
  assert.deepEqual(por.p2, { userId: 'p2', total: 1, completed: 1 });
  // Quien no tiene viajes debe aparecer con cero, no faltar: la fila mostraria
  // un hueco en vez de un numero.
  assert.deepEqual(por.sin_viajes, { userId: 'sin_viajes', total: 0, completed: 0 });
});

test('un viaje no se cuenta dos veces a la misma persona', () => {
  // Puede figurar como conductor asignado y como conductor final.
  const viajes = [viaje({ id: 'a', driverId: 'd1', assignedDriverId: 'd1', passengerId: 'p1', status: 'COMPLETED' })];
  const resumen = summarizeTripsByUser(viajes, ['d1']);
  assert.deepEqual(resumen[0], { userId: 'd1', total: 1, completed: 1 });
});

test('solo se cuenta a quien se pregunta', () => {
  const viajes = [viaje({ passengerId: 'p1', driverId: 'd1' })];
  const resumen = summarizeTripsByUser(viajes, ['p1']);
  assert.equal(resumen.length, 1);
  assert.equal(resumen[0].userId, 'p1');
});

test('entradas ausentes devuelven el recuento a cero', () => {
  assert.deepEqual(summarizeTripsByUser(null, ['p1']), [{ userId: 'p1', total: 0, completed: 0 }]);
  assert.deepEqual(summarizeTripsByUser([], []), []);
  assert.deepEqual(summarizeTripsByUser([], undefined), []);
});

// ---------------------------------------------------------------- complejidad

test('el recuento hace una sola pasada sobre los viajes', () => {
  // Contar por persona recorriendo la coleccion una vez por cada una seria
  // cuadratico: ocho personas por cincuenta mil viajes.
  const construir = n => Array.from({ length: n }, (_, i) => {
    const base = { id: `t_${i}`, status: i % 3 === 0 ? 'COMPLETED' : 'CANCELLED', driverId: `d_${i % 8}` };
    let lecturas = 0;
    Object.defineProperty(base, 'passengerId', {
      get() { lecturas += 1; return `p_${i % 8}`; }, enumerable: true
    });
    Object.defineProperty(base, '__lecturas', { get: () => lecturas, enumerable: false });
    return base;
  });

  const personas = Array.from({ length: 8 }, (_, i) => `p_${i}`);
  for (const n of [200, 2000, 10000]) {
    const datos = construir(n);
    summarizeTripsByUser(datos, personas);
    const total = datos.reduce((suma, item) => suma + item.__lecturas, 0);
    assert.ok(total <= n * 2, `con ${n} viajes y 8 personas hubo ${total} lecturas`);
  }
});
