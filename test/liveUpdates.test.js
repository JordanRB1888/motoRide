import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeById, createCoalescer, withCanonicalId } from '../src/utils/liveUpdates.js';

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

// ------------------------------------------------------------ withCanonicalId

test('el identificador se toma de la primera clave que lo traiga', () => {
  assert.equal(withCanonicalId({ id: 'a' }).id, 'a');
  assert.equal(withCanonicalId({ userId: 'b' }).id, 'b');
  assert.equal(withCanonicalId({ driverId: 'c' }).id, 'c');
  // `id` manda sobre los demas cuando estan los dos.
  assert.equal(withCanonicalId({ id: 'a', userId: 'b' }).id, 'a');
});

test('el resto del evento se conserva intacto', () => {
  const evento = { userId: 'd_1', status: 'OFFLINE', extra: { anidado: true } };
  const normalizado = withCanonicalId(evento);
  assert.deepEqual(normalizado, { userId: 'd_1', status: 'OFFLINE', extra: { anidado: true }, id: 'd_1' });
  assert.deepEqual(evento, { userId: 'd_1', status: 'OFFLINE', extra: { anidado: true } }, 'no muta el original');
});

test('las claves a mirar se pueden elegir', () => {
  // `tripStatusUpdated` identifica el viaje con `tripId`.
  assert.equal(withCanonicalId({ tripId: 't_1' }, ['id', 'tripId']).id, 't_1');
  // Y con la lista por defecto ese mismo evento no se reconoce.
  assert.equal(withCanonicalId({ tripId: 't_1' }), null);
});

test('un evento sin identificador utilizable se descarta', () => {
  for (const roto of [null, undefined, {}, 'texto', 42, { id: '' }, { userId: null }, { userId: 42 }]) {
    assert.equal(withCanonicalId(roto), null, `no debia aceptarse: ${JSON.stringify(roto)}`);
  }
});

test('el evento OFFLINE de desconexion actualiza el conductor, no lo duplica', () => {
  // Comportamiento completo: el panel tiene al conductor cargado y llega el
  // aviso de desconexion, que en una de sus ramas viaja sin `id`.
  const usuarios = [{ id: 'd_1', firstName: 'Carlos', status: 'AVAILABLE' }, { id: 'd_2', status: 'BUSY' }];
  const evento = { userId: 'd_1', status: 'OFFLINE' };

  const resultado = mergeById(usuarios, withCanonicalId(evento));

  assert.equal(resultado.length, 2, 'no debe anadirse un registro nuevo');
  assert.equal(resultado[0].status, 'OFFLINE', 'el estado debe actualizarse');
  assert.equal(resultado[0].firstName, 'Carlos', 'y conservarse lo que el evento no trae');
  assert.equal(resultado[1].status, 'BUSY', 'el otro conductor no se toca');
});

test('sin normalizar, ese mismo evento se perderia en silencio', () => {
  // Documenta el defecto que motiva la normalizacion: `mergeById` descarta lo
  // que no lleva `id`, asi que la pantalla se quedaria mostrando AVAILABLE.
  const usuarios = [{ id: 'd_1', status: 'AVAILABLE' }];
  const sinNormalizar = mergeById(usuarios, { userId: 'd_1', status: 'OFFLINE' });
  assert.equal(sinNormalizar[0].status, 'AVAILABLE', 'se pierde sin normalizar');

  const normalizado = mergeById(usuarios, withCanonicalId({ userId: 'd_1', status: 'OFFLINE' }));
  assert.equal(normalizado[0].status, 'OFFLINE', 'y se aplica con normalizacion');
});

test('varios eventos de desconexion seguidos no acumulan duplicados', () => {
  let usuarios = [{ id: 'd_1', status: 'AVAILABLE' }];
  for (let i = 0; i < 20; i += 1) {
    usuarios = mergeById(usuarios, withCanonicalId({ userId: 'd_1', status: 'OFFLINE' }));
  }
  assert.equal(usuarios.length, 1, `se acumularon ${usuarios.length} registros`);
});
