import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeById, createCoalescer, withCanonicalId, accumulatePage, createLatestOnly } from '../src/utils/liveUpdates.js';

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

// ------------------------------------------------------------ accumulatePage

test('las paginas siguientes se anaden al final en orden', () => {
  const primera = [{ id: 'a' }, { id: 'b' }];
  const segunda = [{ id: 'c' }, { id: 'd' }];
  assert.deepEqual(
    accumulatePage(primera, segunda).map(i => i.id),
    ['a', 'b', 'c', 'd']
  );
});

test('los mensajes anteriores se anteponen conservando su orden', () => {
  // El cursor avanza hacia atras en el tiempo, pero la conversacion se lee
  // del mas antiguo al mas reciente.
  const enPantalla = [{ id: 'm3' }, { id: 'm4' }];
  const anteriores = [{ id: 'm1' }, { id: 'm2' }];
  assert.deepEqual(
    accumulatePage(enPantalla, anteriores, { posicion: 'inicio' }).map(i => i.id),
    ['m1', 'm2', 'm3', 'm4']
  );
});

test('un registro que ya estaba no se repite', () => {
  // Entre dos paginas puede llegar un mensaje nuevo y desplazar el corte: sin
  // descartar lo conocido, un registro apareceria dos veces en pantalla.
  const previos = [{ id: 'a' }, { id: 'b' }];
  const solapada = [{ id: 'b' }, { id: 'c' }];
  assert.deepEqual(accumulatePage(previos, solapada).map(i => i.id), ['a', 'b', 'c']);
});

test('los duplicados dentro de la propia pagina tampoco entran dos veces', () => {
  const resultado = accumulatePage([], [{ id: 'a' }, { id: 'a' }, { id: 'b' }]);
  assert.deepEqual(resultado.map(i => i.id), ['a', 'b']);
});

test('los registros sin identificador se descartan en vez de acumularse', () => {
  let coleccion = [{ id: 'a' }];
  for (let i = 0; i < 10; i += 1) {
    coleccion = accumulatePage(coleccion, [{}, { id: null }, { id: '' }]);
  }
  assert.equal(coleccion.length, 1, `se acumularon ${coleccion.length} registros basura`);
});

test('recorrer un listado entero por paginas no repite ni pierde nada', () => {
  // Comportamiento completo: quince hilos en paginas de cuatro, como haria la
  // pantalla pulsando «cargar mas».
  const todos = Array.from({ length: 15 }, (_, i) => ({ userId: `u_${i}` }));
  const idOf = item => item?.userId;
  let cargados = [];
  for (let desde = 0; desde < todos.length; desde += 4) {
    cargados = accumulatePage(cargados, todos.slice(desde, desde + 4), { idOf });
  }
  assert.equal(cargados.length, 15);
  assert.deepEqual(cargados.map(idOf), todos.map(idOf));
});

test('no modifica la coleccion recibida ni devuelve otra sin motivo', () => {
  const previos = [{ id: 'a' }];
  const copia = [...previos];
  assert.equal(accumulatePage(previos, []), previos, 'sin nada que anadir devuelve la misma');
  assert.equal(accumulatePage(previos, [{ id: 'a' }]), previos, 'sin novedades tampoco copia');
  assert.deepEqual(previos, copia, 'la original queda intacta');
});

test('entradas ausentes no rompen la acumulacion', () => {
  assert.deepEqual(accumulatePage(null, [{ id: 'a' }]).map(i => i.id), ['a']);
  assert.deepEqual(accumulatePage([{ id: 'a' }], null).map(i => i.id), ['a']);
  assert.deepEqual(accumulatePage(undefined, undefined), []);
});

// ------------------------------------------------------------ createLatestOnly

/** Simula una petición que tarda `ms` en resolver, con reloj controlado. */
function servidorLento() {
  const pendientes = [];
  return {
    pedir(valor, ms) {
      return new Promise(resolve => pendientes.push({ resolve, valor, cuando: ms }));
    },
    // Resuelve en el orden de latencia, no en el de llamada.
    resolverPorLatencia() {
      [...pendientes].sort((a, b) => a.cuando - b.cuando).forEach(p => p.resolve(p.valor));
      pendientes.length = 0;
    }
  };
}

test('una respuesta tardia de una busqueda anterior se descarta', async () => {
  // Se teclea «ana» y luego «ana rodriguez». La primera tarda mas y responde
  // despues: sin guardia dejaria la lista mostrando resultados de un texto que
  // ya no esta en el buscador.
  const vigencia = createLatestOnly();
  const red = servidorLento();
  let lista = [];

  const buscar = async (texto, ms) => {
    const sigueVigente = vigencia.begin();
    const resultado = await red.pedir(texto, ms);
    if (!sigueVigente()) return;
    lista = [resultado];
  };

  const primera = buscar('ana', 300);
  const segunda = buscar('ana rodriguez', 50);
  red.resolverPorLatencia();
  await Promise.all([primera, segunda]);

  assert.deepEqual(lista, ['ana rodriguez'], 'debe quedar la ultima consulta, no la que tardo mas');
});

test('la respuesta de la consulta vigente si se aplica', async () => {
  const vigencia = createLatestOnly();
  const red = servidorLento();
  let lista = [];
  const buscar = async (texto, ms) => {
    const sigueVigente = vigencia.begin();
    const resultado = await red.pedir(texto, ms);
    if (!sigueVigente()) return;
    lista = [resultado];
  };
  const unica = buscar('carlos', 10);
  red.resolverPorLatencia();
  await unica;
  assert.deepEqual(lista, ['carlos']);
});

test('«cargar mas» en vuelo se descarta si entretanto cambia la busqueda', async () => {
  // Es el caso que se cuela con facilidad: la pagina siguiente de la busqueda
  // vieja llega despues y se anade a la lista nueva, mezclando resultados de
  // dos consultas distintas.
  const vigencia = createLatestOnly();
  const red = servidorLento();
  let lista = ['viejo_1', 'viejo_2'];

  const cargarMas = async () => {
    const sigueVigente = vigencia.current();
    const pagina = await red.pedir(['viejo_3'], 300);
    if (!sigueVigente()) return;
    lista = [...lista, ...pagina];
  };
  const buscar = async () => {
    const sigueVigente = vigencia.begin();
    const pagina = await red.pedir(['nuevo_1'], 50);
    if (!sigueVigente()) return;
    lista = pagina;
  };

  const continuacion = cargarMas();
  const busqueda = buscar();
  red.resolverPorLatencia();
  await Promise.all([continuacion, busqueda]);

  assert.deepEqual(lista, ['nuevo_1'], 'la pagina de la busqueda vieja no debe colarse');
});

test('«cargar mas» se aplica si nadie cambio la busqueda', async () => {
  const vigencia = createLatestOnly();
  const red = servidorLento();
  let lista = ['a'];
  const cargarMas = async () => {
    const sigueVigente = vigencia.current();
    const pagina = await red.pedir(['b'], 20);
    if (!sigueVigente()) return;
    lista = [...lista, ...pagina];
  };
  const continuacion = cargarMas();
  red.resolverPorLatencia();
  await continuacion;
  assert.deepEqual(lista, ['a', 'b']);
});

test('invalidate descarta lo que viene en camino sin lanzar nada', async () => {
  // Al teclear se invalida ya, sin esperar al agrupador de 250 ms: cualquier
  // respuesta en vuelo corresponde a un texto que ya no esta en el buscador.
  const vigencia = createLatestOnly();
  const red = servidorLento();
  let lista = [];
  const enVuelo = (async () => {
    const sigueVigente = vigencia.begin();
    const resultado = await red.pedir('vieja', 100);
    if (!sigueVigente()) return;
    lista = [resultado];
  })();

  vigencia.invalidate();
  red.resolverPorLatencia();
  await enVuelo;
  assert.deepEqual(lista, [], 'la respuesta invalidada no debe aplicarse');
});

test('varias consultas encadenadas dejan solo la ultima', async () => {
  const vigencia = createLatestOnly();
  const red = servidorLento();
  let lista = [];
  const buscar = async (texto, ms) => {
    const sigueVigente = vigencia.begin();
    const resultado = await red.pedir(texto, ms);
    if (!sigueVigente()) return;
    lista = [resultado];
  };
  // Cinco pulsaciones con latencias arbitrarias, la ultima la mas lenta.
  const todas = [
    buscar('a', 90), buscar('an', 10), buscar('ana', 70),
    buscar('anab', 30), buscar('anabel', 200)
  ];
  red.resolverPorLatencia();
  await Promise.all(todas);
  assert.deepEqual(lista, ['anabel'], 'solo la ultima consulta puede escribir');
});

test('la generacion avanza con cada consulta nueva y no con las continuaciones', () => {
  const vigencia = createLatestOnly();
  const inicio = vigencia.generation;
  vigencia.current();
  assert.equal(vigencia.generation, inicio, 'continuar no abre generacion');
  vigencia.begin();
  assert.equal(vigencia.generation, inicio + 1);
  vigencia.invalidate();
  assert.equal(vigencia.generation, inicio + 2);
});
