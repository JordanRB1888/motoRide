import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAXIMO_DE_ENTREGAS,
  MEMORIA_DE_ENTREGA_MS,
  anotarEntrega,
  claveDeMensaje,
  claveDeViaje,
  convieneAvisar,
  podar,
  yaSeEntrego
} from '../domain/entregaDePush.js';
import {
  PUSH_TYPE,
  buildTripPayload,
  createPushNotificationService
} from '../services/pushNotificationService.js';

/**
 * LOS AVISOS DE PUSH-1 — ciclo de vida del viaje y chat.
 *
 * Lo que se protege aquí son tres cosas que fallan en silencio y sólo se notan
 * en el teléfono de alguien:
 *
 *   1. Que un mismo hecho no suene tres veces. La máquina de estados impide que
 *      el viaje cambie dos veces, pero no que el sitio que avisa se ejecute dos
 *      veces por un reintento, una reconexión o dos oyentes.
 *   2. Que no salga ni un nombre, ni una dirección, ni el texto de un mensaje.
 *      El payload lleva un TIPO, y el teléfono lo traduce con su propia tabla.
 *   3. Que la supresión por presencia no se coma nunca una oferta ni un cambio
 *      de estado — sólo el aviso de un mensaje cuyo chat ya está a la vista.
 */

// ---------------------------------------------------------------------------
// La idempotencia, en aislamiento
// ---------------------------------------------------------------------------

test('la clave es del HECHO, no del intento', () => {
  // Dos intentos de avisar de lo mismo comparten clave; dos hechos distintos
  // nunca la comparten.
  assert.equal(claveDeViaje('trip_1', PUSH_TYPE.TRIP_ARRIVED), claveDeViaje('trip_1', PUSH_TYPE.TRIP_ARRIVED));
  assert.notEqual(claveDeViaje('trip_1', PUSH_TYPE.TRIP_ARRIVED), claveDeViaje('trip_1', PUSH_TYPE.TRIP_STARTED));
  assert.notEqual(claveDeViaje('trip_1', PUSH_TYPE.TRIP_ARRIVED), claveDeViaje('trip_2', PUSH_TYPE.TRIP_ARRIVED));
  assert.notEqual(claveDeMensaje('msg_1'), claveDeMensaje('msg_2'));
});

test('lo ya entregado no vuelve a salir, y lo viejo deja de contar', () => {
  const entregas = [];
  const clave = claveDeViaje('trip_1', PUSH_TYPE.TRIP_ACCEPTED);

  assert.equal(yaSeEntrego(entregas, clave, 1_000), false);
  anotarEntrega(entregas, clave, 1_000);
  assert.equal(yaSeEntrego(entregas, clave, 1_000), true);
  assert.equal(yaSeEntrego(entregas, clave, 1_000 + MEMORIA_DE_ENTREGA_MS - 1), true);

  // Un día después ya no es un duplicado: es otra cosa.
  assert.equal(yaSeEntrego(entregas, clave, 1_000 + MEMORIA_DE_ENTREGA_MS), false);
});

test('la colección de entregas no crece sin final', () => {
  const entregas = [];
  for (let i = 0; i < MAXIMO_DE_ENTREGAS + 250; i += 1) {
    anotarEntrega(entregas, `viaje:t${i}:x`, 1_000 + i);
  }
  assert.ok(entregas.length <= MAXIMO_DE_ENTREGAS, `quedaron ${entregas.length}`);
  // Se van las más viejas, no las últimas.
  assert.equal(entregas.some(e => e.id === `viaje:t${MAXIMO_DE_ENTREGAS + 249}:x`), true);
  assert.equal(entregas.some(e => e.id === 'viaje:t0:x'), false);
});

test('la poda se lleva las caducadas', () => {
  const entregas = [
    { id: 'vieja', at: 0 },
    { id: 'fresca', at: MEMORIA_DE_ENTREGA_MS }
  ];
  podar(entregas, MEMORIA_DE_ENTREGA_MS + 10);
  assert.deepEqual(entregas.map(e => e.id), ['fresca']);
});

test('la supresión sólo alcanza a lo suprimible', () => {
  // Lo urgente sale aunque haya diez sockets vivos.
  assert.equal(convieneAvisar({ tipoSuprimible: false, conexionesVivas: 10 }), true);
  // Lo que se puede perder, sólo si no hay nadie conectado.
  assert.equal(convieneAvisar({ tipoSuprimible: true, conexionesVivas: 1 }), false);
  assert.equal(convieneAvisar({ tipoSuprimible: true, conexionesVivas: 0 }), true);
});

// ---------------------------------------------------------------------------
// El payload: qué puede acabar en una pantalla de bloqueo
// ---------------------------------------------------------------------------

test('el payload lleva un TIPO, y jamás texto de nadie', () => {
  const payload = buildTripPayload(PUSH_TYPE.CHAT_MESSAGE, 'trip_1');
  assert.deepEqual(Object.keys(payload).sort(), ['t', 'tripId', 'v']);
  assert.equal(payload.t, PUSH_TYPE.CHAT_MESSAGE);
  assert.equal(payload.tripId, 'trip_1');

  // Nada que se parezca a contenido. El teléfono traduce el tipo con su tabla.
  const texto = JSON.stringify(payload);
  for (const filtrado of ['nombre', 'address', 'direccion', 'text', 'body', 'title', 'image']) {
    assert.equal(texto.includes(filtrado), false, `el payload arrastra «${filtrado}»`);
  }
});

// ---------------------------------------------------------------------------
// El servicio, con un proveedor de mentira
// ---------------------------------------------------------------------------

/** Un servicio con una suscripción viva y un `sender` que cuenta envíos. */
function montar({ conexionesVivas = 0 } = {}) {
  const enviados = [];
  const database = {
    pushSubscriptions: [{
      id: 'sub_1',
      userId: 'pas_1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'x', auth: 'y' },
      disabledAt: null,
      failureCount: 0
    }],
    pushDeliveries: []
  };
  const servicio = createPushNotificationService({
    database,
    persistRecord: async () => true,
    enabled: true,
    logger: { log() {} },
    sender: async ({ payload }) => { enviados.push(payload); return { statusCode: 201 }; },
    contarConexiones: async () => conexionesVivas
  });
  return { servicio, enviados, database };
}

test('un cambio de estado avisa UNA vez, por muchas que se intente', async () => {
  // Es el caso del reintento del socket, la reconexión y los dos oyentes: el
  // hecho es el mismo y el teléfono tiene que sonar una vez.
  const { servicio, enviados } = montar();
  const trip = { id: 'trip_1', passengerId: 'pas_1' };

  await servicio.notifyTripLifecycle(trip, PUSH_TYPE.TRIP_ARRIVED, 'pas_1');
  await servicio.notifyTripLifecycle(trip, PUSH_TYPE.TRIP_ARRIVED, 'pas_1');
  const tercero = await servicio.notifyTripLifecycle(trip, PUSH_TYPE.TRIP_ARRIVED, 'pas_1');

  assert.equal(enviados.length, 1, `salieron ${enviados.length} avisos`);
  assert.equal(tercero.duplicado, true);
});

test('dos hechos distintos del mismo viaje sí avisan los dos', async () => {
  const { servicio, enviados } = montar();
  const trip = { id: 'trip_1', passengerId: 'pas_1' };

  await servicio.notifyTripLifecycle(trip, PUSH_TYPE.TRIP_ACCEPTED, 'pas_1');
  await servicio.notifyTripLifecycle(trip, PUSH_TYPE.TRIP_ARRIVED, 'pas_1');

  assert.equal(enviados.length, 2);
  assert.deepEqual(enviados.map(p => p.t), [PUSH_TYPE.TRIP_ACCEPTED, PUSH_TYPE.TRIP_ARRIVED]);
});

test('un tipo que no está en la lista blanca NO sale a ningún teléfono', async () => {
  // Aunque otro sitio del servidor se equivoque al llamar.
  const { servicio, enviados } = montar();
  const trip = { id: 'trip_1', passengerId: 'pas_1' };

  await servicio.notifyTripLifecycle(trip, 'marketing_oferta', 'pas_1');
  await servicio.notifyTripLifecycle(trip, PUSH_TYPE.RIDE_REQUEST, 'pas_1');
  await servicio.notifyTripLifecycle(trip, PUSH_TYPE.CHAT_MESSAGE, 'pas_1');

  assert.equal(enviados.length, 0);
});

test('el aviso de un mensaje se calla si esa persona está conectada', async () => {
  // Ya lo está viendo aparecer en la conversación: sonar encima sólo molesta.
  const { servicio, enviados } = montar({ conexionesVivas: 1 });
  const resultado = await servicio.notifyChatMessage({ tripId: 'trip_1', messageId: 'msg_1', userId: 'pas_1' });

  assert.equal(enviados.length, 0);
  assert.equal(resultado.suprimido, true);
});

test('el aviso de un mensaje SÍ sale si nadie está conectado', async () => {
  const { servicio, enviados } = montar({ conexionesVivas: 0 });
  await servicio.notifyChatMessage({ tripId: 'trip_1', messageId: 'msg_1', userId: 'pas_1' });

  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].t, PUSH_TYPE.CHAT_MESSAGE);
});

test('un cambio de estado NO se suprime aunque haya sockets vivos', async () => {
  // Tener un socket no es estar mirando: la aplicación en segundo plano lo
  // conserva un rato. Enterarse tarde de que la moto está abajo es peor que un
  // aviso de más.
  const { servicio, enviados } = montar({ conexionesVivas: 3 });
  await servicio.notifyTripLifecycle({ id: 'trip_1', passengerId: 'pas_1' }, PUSH_TYPE.TRIP_ARRIVED, 'pas_1');

  assert.equal(enviados.length, 1);
});

test('el mismo mensaje no suena dos veces', async () => {
  const { servicio, enviados } = montar();
  await servicio.notifyChatMessage({ tripId: 'trip_1', messageId: 'msg_1', userId: 'pas_1' });
  await servicio.notifyChatMessage({ tripId: 'trip_1', messageId: 'msg_1', userId: 'pas_1' });

  assert.equal(enviados.length, 1);
});

test('la marca de entrega se anota ANTES de enviar', async () => {
  // Si el proveedor tarda y alguien reintenta mientras tanto, el segundo
  // intento tiene que encontrar la marca. Un aviso perdido por un fallo del
  // proveedor es mejor que tres avisos por lo mismo: el socket ya llevó la
  // información.
  const database = { pushSubscriptions: [], pushDeliveries: [] };
  let habiaMarcaAlEnviar = null;
  const servicio = createPushNotificationService({
    database,
    persistRecord: async () => true,
    enabled: true,
    logger: { log() {} },
    sender: async () => {
      habiaMarcaAlEnviar = database.pushDeliveries.length > 0;
      return { statusCode: 201 };
    },
    contarConexiones: async () => 0
  });
  database.pushSubscriptions.push({
    id: 'sub_1', userId: 'pas_1', endpoint: 'https://x/y', keys: { p256dh: 'a', auth: 'b' },
    disabledAt: null, failureCount: 0
  });

  await servicio.notifyTripLifecycle({ id: 'trip_1', passengerId: 'pas_1' }, PUSH_TYPE.TRIP_STARTED, 'pas_1');
  assert.equal(habiaMarcaAlEnviar, true, 'se envió antes de anotar');
});

test('sin destinatario o sin viaje no se avisa a nadie', async () => {
  const { servicio, enviados } = montar();
  await servicio.notifyTripLifecycle(null, PUSH_TYPE.TRIP_ARRIVED, 'pas_1');
  await servicio.notifyTripLifecycle({ id: 'trip_1' }, PUSH_TYPE.TRIP_ARRIVED, null);
  await servicio.notifyChatMessage({ tripId: 'trip_1', messageId: null, userId: 'pas_1' });
  await servicio.notifyChatMessage({ tripId: null, messageId: 'msg_1', userId: 'pas_1' });

  assert.equal(enviados.length, 0);
});

test('un proveedor que lanza no rompe a quien avisa', async () => {
  // Push es entrega auxiliar: el viaje funciona sin ella y debe seguir
  // funcionando aunque el proveedor esté caído.
  const database = {
    pushSubscriptions: [{
      id: 'sub_1', userId: 'pas_1', endpoint: 'https://x/y', keys: { p256dh: 'a', auth: 'b' },
      disabledAt: null, failureCount: 0
    }],
    pushDeliveries: []
  };
  const servicio = createPushNotificationService({
    database,
    persistRecord: async () => true,
    enabled: true,
    logger: { log() {} },
    sender: async () => { throw new Error('proveedor caido'); },
    contarConexiones: async () => 0
  });

  const resultado = await servicio.notifyTripLifecycle(
    { id: 'trip_1', passengerId: 'pas_1' }, PUSH_TYPE.TRIP_COMPLETED, 'pas_1'
  );
  assert.equal(resultado.sent, 0);
});

// ---------------------------------------------------------------------------
// El cableado, comprobado sobre la fuente
// ---------------------------------------------------------------------------

test('el servidor avisa del cambio de estado sólo a la pasajera, y sin await', async () => {
  // El conductor provoca estos cambios pulsando los botones: avisarle de lo que
  // acaba de hacer sería ruido. Y sin `await` porque la transición ya está
  // persistida y anunciada — un proveedor lento no puede robar segundos.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.dirname(fileURLToPath(import.meta.url));
  const fuente = fs.readFileSync(path.join(raiz, '..', 'index.js'), 'utf8');

  assert.match(fuente, /pushService\.notifyTripLifecycle\(trip, tipo, trip\.passengerId\)\.catch\(/);
  assert.match(fuente, /avisarDelCambioDeViaje\(trip\);/);
  // TODOS los anuncios de cambio del viaje avisan al teléfono guardado. En el
  // laboratorio la aceptación no le llegó a la pasajera: `rideAccepted`
  // anunciaba por su cuenta y no pasaba por `anunciarTransicionDelConductor`.
  const lineas = fuente.split('\n');
  const anuncios = lineas.map((l, i) => (l.includes("emit('tripStatusUpdated'") ? i : -1)).filter(i => i >= 0);
  assert.ok(anuncios.length >= 5, 'se esperaban varios anuncios de tripStatusUpdated');
  for (const i of anuncios) {
    const despues = lineas.slice(i, i + 14).join('\n');
    assert.match(despues, /avisarDelCambioDeViaje\(trip\);/, `el anuncio de la línea ${i + 1} no avisa por push`);
  }
  // La señal de presencia sale del servidor, nunca del cliente.
  assert.match(fuente, /io\.in\(`user:\$\{userId\}`\)\.fetchSockets\(\)/);
});

test('el chat avisa a la CONTRAPARTE, nunca a quien escribió', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.dirname(fileURLToPath(import.meta.url));
  const fuente = fs.readFileSync(path.join(raiz, '..', 'index.js'), 'utf8');

  assert.match(fuente, /const destinatario = userId === trip\.passengerId \? trip\.driverId : trip\.passengerId;/);
  assert.match(fuente, /pushService\.notifyChatMessage\(\{ tripId: trip\.id, messageId: message\.id, userId: destinatario \}\)/);
});
