import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEventRateLimiter,
  DEFAULT_EVENT_LIMITS,
  DEFAULT_FALLBACK
} from '../services/socketRateLimit.js';

/** Reloj controlado: nada de esperas reales en las pruebas. */
function reloj(inicio = 1_000_000) {
  let t = inicio;
  return { now: () => t, avanzar: ms => { t += ms; } };
}

test('deja pasar hasta el tope y rechaza a partir de ahí', () => {
  const t = reloj();
  const limitador = createEventRateLimiter({
    limits: { 'x': { limit: 3, windowMs: 1000 } }, now: t.now
  });

  for (let i = 0; i < 3; i += 1) {
    assert.equal(limitador.check('x'), null, `el evento ${i + 1} debía pasar`);
  }
  const rechazo = limitador.check('x');
  assert.ok(rechazo, 'el cuarto debía rechazarse');
  assert.equal(rechazo.limit, 3);
  assert.equal(rechazo.event, 'x');
});

test('la ventana se reabre al cumplirse el plazo, no antes', () => {
  const t = reloj();
  const limitador = createEventRateLimiter({
    limits: { 'x': { limit: 2, windowMs: 1000 } }, now: t.now
  });
  limitador.check('x');
  limitador.check('x');
  assert.ok(limitador.check('x'), 'agotada');

  t.avanzar(999);
  assert.ok(limitador.check('x'), 'un milisegundo antes sigue cerrada');

  t.avanzar(1);
  assert.equal(limitador.check('x'), null, 'cumplido el plazo vuelve a pasar');
  assert.equal(limitador.check('x'), null);
  assert.ok(limitador.check('x'), 'y el tope de la nueva ventana también aplica');
});

test('cada evento lleva su propio contador', () => {
  const t = reloj();
  const limitador = createEventRateLimiter({
    limits: { 'a': { limit: 1, windowMs: 1000 }, 'b': { limit: 1, windowMs: 1000 } }, now: t.now
  });
  assert.equal(limitador.check('a'), null);
  assert.ok(limitador.check('a'), 'a agotado');
  // Agotar `a` no puede cerrar `b`: inundar el GPS no debe impedir cancelar
  // un viaje o responder en el chat.
  assert.equal(limitador.check('b'), null, 'b no debía verse afectado');
});

test('solo se avisa una vez por ventana, aunque lleguen miles', () => {
  const t = reloj();
  const limitador = createEventRateLimiter({
    limits: { 'x': { limit: 1, windowMs: 1000 } }, now: t.now
  });
  limitador.check('x');

  const avisos = [];
  for (let i = 0; i < 5000; i += 1) {
    const r = limitador.check('x');
    if (r?.notificar) avisos.push(i);
  }
  // Responder a cada evento descartado convertiría la defensa en un
  // amplificador: quien inunda lograría una emisión del servidor por cada
  // mensaje suyo.
  assert.equal(avisos.length, 1, 'un único aviso por ventana');
  assert.equal(avisos[0], 0, 'y es el primero rechazado');

  t.avanzar(1000);
  limitador.check('x');
  assert.equal(limitador.check('x').notificar, true, 'la nueva ventana vuelve a avisar una vez');
});

test('retryAfterMs indica lo que falta para la nueva ventana', () => {
  const t = reloj();
  const limitador = createEventRateLimiter({
    limits: { 'x': { limit: 1, windowMs: 10_000 } }, now: t.now
  });
  limitador.check('x');
  assert.equal(limitador.check('x').retryAfterMs, 10_000);
  t.avanzar(4000);
  assert.equal(limitador.check('x').retryAfterMs, 6000);
  assert.ok(limitador.check('x').retryAfterMs >= 0);
});

test('un evento sin regla propia cae en el tope por defecto', () => {
  const t = reloj();
  const limitador = createEventRateLimiter({
    limits: { 'conocido': { limit: 1, windowMs: 1000 } },
    fallback: { limit: 2, windowMs: 1000 },
    now: t.now
  });
  // Que exista este techo es lo que impide que un evento nuevo quede sin
  // protección por descuido.
  assert.equal(limitador.check('inventado'), null);
  assert.equal(limitador.check('inventado'), null);
  assert.ok(limitador.check('inventado'), 'el tercero se rechaza por defecto');
});

test('una regla heredada del prototipo no se confunde con una regla propia', () => {
  const t = reloj();
  const limitador = createEventRateLimiter({
    limits: { 'x': { limit: 1, windowMs: 1000 } },
    fallback: { limit: 2, windowMs: 1000 },
    now: t.now
  });
  // `toString` existe en el prototipo de cualquier objeto: sin comprobar la
  // propiedad propia se usaría como si fuera una regla y rompería el cálculo.
  assert.equal(limitador.check('toString'), null);
  assert.equal(limitador.check('toString'), null);
  assert.ok(limitador.check('toString'), 'debía aplicarse el tope por defecto');
});

test('los contadores de dos sockets son independientes', () => {
  const t = reloj();
  const opciones = { limits: { 'x': { limit: 1, windowMs: 1000 } }, now: t.now };
  const uno = createEventRateLimiter(opciones);
  const otro = createEventRateLimiter(opciones);

  uno.check('x');
  assert.ok(uno.check('x'), 'el primero está agotado');
  // Una persona que inunda no puede dejar sin servicio a las demás.
  assert.equal(otro.check('x'), null, 'el segundo socket no se ve afectado');
});

// ------------------------------------------------------------ configuración

test('todos los eventos que registra el servidor tienen tope', () => {
  // Lista tomada de los `on(...)` de server/index.js. Si se añade un evento y
  // no se añade aquí, cae en el tope por defecto, nunca en «sin límite».
  const eventos = [
    'driver:connect', 'driver:location', 'driver:location_update',
    'passenger:location_update', 'driver:status', 'driver:status_change',
    'rideRequested', 'rideAccepted', 'rideRejected', 'tripStatusUpdated',
    'rideCancelled', 'chat:send_message', 'tripRated', 'join:room'
  ];
  for (const evento of eventos) {
    assert.ok(DEFAULT_EVENT_LIMITS[evento], `sin tope propio: ${evento}`);
  }
});

test('ningún tope permite más de dos eventos por segundo sostenidos', () => {
  for (const [evento, regla] of Object.entries(DEFAULT_EVENT_LIMITS)) {
    const porSegundo = regla.limit / (regla.windowMs / 1000);
    assert.ok(porSegundo <= 2, `${evento} permite ${porSegundo}/s, demasiado`);
    assert.ok(regla.limit > 0 && regla.windowMs > 0, `${evento} tiene una regla degenerada`);
  }
  const porDefecto = DEFAULT_FALLBACK.limit / (DEFAULT_FALLBACK.windowMs / 1000);
  assert.ok(porDefecto <= 3, `el tope por defecto permite ${porDefecto}/s`);
});

test('el chat es más estricto que el GPS', () => {
  // El GPS es automático y frecuente; el chat lo escribe una persona y cada
  // mensaje puede arrastrar una imagen.
  assert.ok(
    DEFAULT_EVENT_LIMITS['chat:send_message'].limit < DEFAULT_EVENT_LIMITS['driver:location'].limit,
    'el chat debe tener un tope menor que el GPS'
  );
});
