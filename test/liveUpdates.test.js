import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeById, createCoalescer } from '../src/utils/liveUpdates.js';

// ------------------------------------------------------------------ mergeById

test('actualiza el registro existente sin tocar los demás', () => {
  const viajes = [{ id: 't1', status: 'SEARCHING' }, { id: 't2', status: 'COMPLETED' }];
  const resultado = mergeById(viajes, { id: 't1', status: 'IN_PROGRESS' });

  assert.deepEqual(resultado.map(v => v.status), ['IN_PROGRESS', 'COMPLETED']);
  assert.equal(resultado.length, 2, 'no debe duplicar');
});

test('un evento parcial conserva los campos que no trae', () => {
  // `tripStatusUpdated` trae estado y fecha, no la ruta ni la tarifa.
  // Sustituir en vez de fusionar dejaría el viaje sin origen ni destino y la
  // tabla del panel se vaciaría a medias.
  const viajes = [{ id: 't1', status: 'SEARCHING', fareUSD: 5, pickup: { address: 'Origen' } }];
  const resultado = mergeById(viajes, { id: 't1', status: 'IN_PROGRESS', updatedAt: 'ahora' });

  assert.deepEqual(resultado[0], {
    id: 't1', status: 'IN_PROGRESS', fareUSD: 5, pickup: { address: 'Origen' }, updatedAt: 'ahora'
  });
});

test('un registro desconocido se añade', () => {
  const resultado = mergeById([{ id: 't1' }], { id: 't2', status: 'SEARCHING' });
  assert.equal(resultado.length, 2);
  assert.equal(resultado[1].id, 't2');
});

test('no modifica la colección recibida', () => {
  const original = [{ id: 't1', status: 'SEARCHING' }];
  const copiaPrevia = JSON.parse(JSON.stringify(original));
  mergeById(original, { id: 't1', status: 'IN_PROGRESS' });
  mergeById(original, { id: 't2' });
  assert.deepEqual(original, copiaPrevia, 'la colección original queda intacta');
});

test('un evento sin identificador se descarta en vez de duplicar', () => {
  const viajes = [{ id: 't1' }];
  // Añadirlo al final crearía un registro basura por cada evento malformado.
  for (const roto of [{}, { id: null }, { id: '' }, null, undefined]) {
    assert.deepEqual(mergeById(viajes, roto), viajes, `no debía añadirse: ${JSON.stringify(roto)}`);
  }
});

test('una colección ausente no rompe nada', () => {
  assert.deepEqual(mergeById(null, { id: 'a' }), [{ id: 'a' }]);
  assert.deepEqual(mergeById(undefined, { id: 'a' }), [{ id: 'a' }]);
  assert.deepEqual(mergeById('texto', { id: 'a' }), [{ id: 'a' }]);
});

test('el identificador se puede extraer con una función propia', () => {
  const items = [{ clave: 'a', n: 1 }];
  const resultado = mergeById(items, { clave: 'a', n: 2 }, item => item?.clave);
  assert.deepEqual(resultado, [{ clave: 'a', n: 2 }]);
});

// ------------------------------------------------------------- createCoalescer

/** Reloj y temporizador controlados: nada de esperas reales. */
function banco() {
  let ahora = 0;
  const tareas = [];
  return {
    now: () => ahora,
    schedule: (callback, ms) => { tareas.push({ callback, cuando: ahora + ms }); return tareas.length - 1; },
    cancel: id => { if (tareas[id]) tareas[id].cancelada = true; },
    avanzar(ms) {
      ahora += ms;
      for (const tarea of tareas) {
        if (!tarea.ejecutada && !tarea.cancelada && tarea.cuando <= ahora) {
          tarea.ejecutada = true;
          tarea.callback();
        }
      }
    }
  };
}

test('la primera llamada se ejecuta de inmediato', () => {
  const b = banco();
  let veces = 0;
  const disparar = createCoalescer(() => { veces += 1; }, { intervalMs: 1000, ...b });
  disparar();
  assert.equal(veces, 1, 'el panel debe reaccionar al instante');
});

test('una ráfaga de eventos produce dos ejecuciones, no cincuenta', () => {
  const b = banco();
  let veces = 0;
  const disparar = createCoalescer(() => { veces += 1; }, { intervalMs: 1000, ...b });

  // Cincuenta eventos en el mismo instante: lo que ocurre en hora punta.
  for (let i = 0; i < 50; i += 1) disparar();
  assert.equal(veces, 1, 'solo la primera se ejecuta de inmediato');

  b.avanzar(1000);
  assert.equal(veces, 2, 'las demás se funden en una sola al cerrar el intervalo');

  b.avanzar(5000);
  assert.equal(veces, 2, 'y no se repite sin eventos nuevos');
});

test('el ritmo queda acotado bajo eventos sostenidos', () => {
  const b = banco();
  let veces = 0;
  const disparar = createCoalescer(() => { veces += 1; }, { intervalMs: 1000, ...b });

  // Diez eventos por segundo durante diez segundos.
  for (let s = 0; s < 10; s += 1) {
    for (let i = 0; i < 10; i += 1) disparar();
    b.avanzar(100);
    for (let i = 0; i < 10; i += 1) disparar();
    b.avanzar(900);
  }
  assert.ok(veces <= 11, `se ejecutó ${veces} veces en 10 s; el tope es una por segundo`);
  assert.ok(veces >= 9, `se ejecutó solo ${veces} veces: el panel se quedaría desactualizado`);
});

test('pasado el intervalo en silencio, el evento siguiente vuelve a ser inmediato', () => {
  const b = banco();
  let veces = 0;
  const disparar = createCoalescer(() => { veces += 1; }, { intervalMs: 1000, ...b });
  disparar();
  b.avanzar(5000);
  disparar();
  assert.equal(veces, 2, 'no debe esperar si no hubo actividad reciente');
});

test('dispose cancela la ejecución pendiente', () => {
  const b = banco();
  let veces = 0;
  const disparar = createCoalescer(() => { veces += 1; }, { intervalMs: 1000, ...b });
  disparar();
  disparar();
  // Al abandonar la pantalla no puede quedar una petición en vuelo que
  // escriba sobre un panel ya desmontado.
  disparar.dispose();
  b.avanzar(5000);
  assert.equal(veces, 1, 'la pendiente no debía ejecutarse');
});
