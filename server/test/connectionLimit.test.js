import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createConnectionLimiter,
  DEFAULT_MAX_CONNECTIONS_PER_USER
} from '../services/connectionLimit.js';

test('admite hasta el techo y rechaza a partir de ahí', () => {
  const limitador = createConnectionLimiter({ maxPerUser: 3 });
  for (let i = 1; i <= 3; i += 1) {
    const resultado = limitador.acquire('u_1');
    assert.equal(resultado.allowed, true, `la conexión ${i} debía admitirse`);
    assert.equal(resultado.open, i);
  }
  const excedida = limitador.acquire('u_1');
  assert.equal(excedida.allowed, false);
  assert.equal(excedida.maxPerUser, 3);
});

test('al cerrar una conexión se libera el hueco', () => {
  const limitador = createConnectionLimiter({ maxPerUser: 2 });
  limitador.acquire('u_1');
  limitador.acquire('u_1');
  assert.equal(limitador.acquire('u_1').allowed, false);

  limitador.release('u_1');
  limitador.release('u_1');   // la rechazada también libera
  assert.equal(limitador.count('u_1'), 1);
  limitador.release('u_1');
  assert.equal(limitador.acquire('u_1').allowed, true, 'el hueco vuelve a estar libre');
});

test('la conexión rechazada también cuenta, para poder liberarla sin ramas', () => {
  // Si `acquire` no contara al rechazar, quien llama tendría que decidir si
  // libera o no. Un solo error en esa rama desincroniza el contador y acaba
  // cerrando la puerta a una cuenta legítima para siempre.
  const limitador = createConnectionLimiter({ maxPerUser: 1 });
  limitador.acquire('u_1');
  assert.equal(limitador.acquire('u_1').allowed, false);
  assert.equal(limitador.count('u_1'), 2, 'la rechazada quedó contada');

  limitador.release('u_1');
  limitador.release('u_1');
  assert.equal(limitador.count('u_1'), 0);
  assert.equal(limitador.acquire('u_1').allowed, true);
});

test('el contador no baja de cero por liberaciones de más', () => {
  const limitador = createConnectionLimiter({ maxPerUser: 2 });
  limitador.acquire('u_1');
  for (let i = 0; i < 5; i += 1) limitador.release('u_1');
  assert.equal(limitador.count('u_1'), 0);
  // Y el cupo sigue completo, no en negativo.
  assert.equal(limitador.acquire('u_1').allowed, true);
  assert.equal(limitador.acquire('u_1').allowed, true);
  assert.equal(limitador.acquire('u_1').allowed, false);
});

test('cada cuenta tiene su propio cupo', () => {
  const limitador = createConnectionLimiter({ maxPerUser: 1 });
  assert.equal(limitador.acquire('u_1').allowed, true);
  assert.equal(limitador.acquire('u_1').allowed, false);
  // Agotar una cuenta no puede dejar fuera a las demás.
  assert.equal(limitador.acquire('u_2').allowed, true);
});

test('el mapa no crece con cuentas que ya se desconectaron', () => {
  const limitador = createConnectionLimiter({ maxPerUser: 2 });
  for (let i = 0; i < 1000; i += 1) {
    limitador.acquire(`u_${i}`);
    limitador.release(`u_${i}`);
  }
  // Dejar la entrada a cero convertiría el contador en una fuga de memoria:
  // una entrada por cada cuenta que se haya conectado alguna vez.
  assert.equal(limitador.trackedUsers(), 0, 'no debe quedar ninguna entrada');
});

test('un identificador ausente nunca se admite ni ensucia el mapa', () => {
  const limitador = createConnectionLimiter({ maxPerUser: 5 });
  for (const invalido of [undefined, null, '', 42, {}]) {
    assert.equal(limitador.acquire(invalido).allowed, false, `debía rechazarse: ${String(invalido)}`);
    limitador.release(invalido);
  }
  assert.equal(limitador.trackedUsers(), 0);
});

test('un techo degenerado se rechaza al construir', () => {
  for (const malo of [0, -1, 1.5, NaN, '5', null]) {
    assert.throws(
      () => createConnectionLimiter({ maxPerUser: malo }),
      /INVALID_MAX_CONNECTIONS/,
      `no debía admitirse: ${String(malo)}`
    );
  }
  assert.equal(createConnectionLimiter().maxPerUser, DEFAULT_MAX_CONNECTIONS_PER_USER);
});

test('el techo por defecto deja margen al uso real sin abrir la mano', () => {
  // Teléfono, pestaña de navegador y alguna reconexión sin cerrar.
  assert.ok(DEFAULT_MAX_CONNECTIONS_PER_USER >= 3, 'debe caber el uso legítimo');
  assert.ok(DEFAULT_MAX_CONNECTIONS_PER_USER <= 10, 'no debe multiplicar el cupo de eventos');
});
