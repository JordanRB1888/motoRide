import test from 'node:test';
import assert from 'node:assert/strict';
import { identityKey, createIdentityLimiter, MINUTO, CUARTO_DE_HORA } from '../services/httpRateLimit.js';

/**
 * No hay limitador global por dirección IP a propósito: los móviles
 * venezolanos comparten IP tras el NAT del operador, y un tope por dirección
 * castigaría a decenas de personas legítimas por culpa de una sola.
 */

test('con sesión se cuenta por cuenta, no por dirección', () => {
  const desdeLaMismaIp = ip => ({ ip, user: undefined });
  // Dos personas tras el mismo NAT del operador.
  const ana = { ip: '190.202.5.10', user: { id: 'user_ana' } };
  const luis = { ip: '190.202.5.10', user: { id: 'user_luis' } };

  assert.notEqual(identityKey(ana), identityKey(luis), 'no pueden compartir cupo');
  assert.match(identityKey(ana), /^user:user_ana$/);

  // La misma persona desde dos redes distintas sí comparte cupo: la identidad
  // es la cuenta, no el sitio desde donde se conecta.
  const anaEnOtraRed = { ip: '181.66.1.1', user: { id: 'user_ana' } };
  assert.equal(identityKey(ana), identityKey(anaEnOtraRed));

  // Sin sesión no queda más remedio que la dirección.
  assert.match(identityKey(desdeLaMismaIp('190.202.5.10')), /^ip:/);
});

test('las direcciones IPv6 se agrupan por prefijo', () => {
  // Un bloque IPv6 es enorme y barato: sin agrupar, quien lo tenga estrenaría
  // cupo con cada dirección y el límite no serviría de nada.
  const una = identityKey({ ip: '2001:db8:1234:5678:aaaa:bbbb:cccc:dddd' });
  const otra = identityKey({ ip: '2001:db8:1234:5678:1111:2222:3333:4444' });
  assert.equal(una, otra, 'el mismo /64 debe compartir cupo');

  const ajena = identityKey({ ip: '2001:db8:9999:0000:1111:2222:3333:4444' });
  assert.notEqual(una, ajena, 'otro bloque es otro cliente');
});

test('un identificador vacío o ausente cae a la dirección', () => {
  for (const usuario of [undefined, null, {}, { id: '' }, { id: 42 }]) {
    const clave = identityKey({ ip: '10.0.0.1', user: usuario });
    assert.match(clave, /^ip:/, `debía usar la dirección con ${JSON.stringify(usuario)}`);
  }
});

test('la construcción rechaza topes degenerados', () => {
  assert.throws(() => createIdentityLimiter({ limit: 10, windowMs: MINUTO }), /REQUIRES_NAME/);
  for (const malo of [0, -1, 1.5, NaN, '10', null]) {
    assert.throws(
      () => createIdentityLimiter({ name: 'x', limit: malo, windowMs: MINUTO }),
      /INVALID_LIMIT/, `límite ${String(malo)}`
    );
  }
  for (const malo of [0, 999, -1, 'un minuto']) {
    assert.throws(
      () => createIdentityLimiter({ name: 'x', limit: 10, windowMs: malo }),
      /INVALID_WINDOW/, `ventana ${String(malo)}`
    );
  }
});

test('las ventanas declaradas son las que dicen ser', () => {
  assert.equal(MINUTO, 60 * 1000);
  assert.equal(CUARTO_DE_HORA, 15 * 60 * 1000);
});

test('el limitador se construye como middleware utilizable', () => {
  const limitador = createIdentityLimiter({ name: 'prueba', limit: 5, windowMs: MINUTO });
  assert.equal(typeof limitador, 'function');
  // Express pasa (req, res, next): tres argumentos.
  assert.equal(limitador.length, 3);
});
