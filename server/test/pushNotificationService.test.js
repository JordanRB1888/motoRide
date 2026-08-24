import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPushNotificationService,
  isWebPushEnabled,
  buildRideOfferPayload
} from '../services/pushNotificationService.js';
import {
  MAX_CONSECUTIVE_FAILURES,
  PUSH_DISABLED_REASON,
  classifyDeliveryResult,
  DELIVERY_RESULT
} from '../domain/pushSubscription.js';

/**
 * PUSH-1 instala la maquinaria de envio pero no conecta ningun proveedor real.
 * Todo lo de aqui usa un `sender` falso: ni una sola prueba toca la red, ni
 * necesita claves VAPID, ni contacta con un endpoint de navegador.
 *
 * La propiedad que mas importa no es que envie, es que NUNCA rompa a quien lo
 * llama. El despacho de carreras funciona hoy sin push y debe seguir
 * funcionando igual aunque el proveedor este caido, tarde o lance. Esa
 * garantia se fija aqui, antes de que PUSH-3a conecte nada.
 */

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/AAAA-token-de-prueba';
const CLAVES = { p256dh: 'BFakeKeyMaterialParaPruebas', auth: 'YXV0aC10ZXN0' };

function suscripcion(overrides = {}) {
  return {
    id: 'sub_1',
    userId: 'driver_1',
    endpoint: ENDPOINT,
    keys: { ...CLAVES },
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
    lastSeenAt: '2026-08-24T00:00:00.000Z',
    lastSuccessAt: null,
    failureCount: 0,
    disabledAt: null,
    disabledReason: null,
    ...overrides
  };
}

/** Servicio con un sender programable y un registro capturado. */
function montar({ respuestas = [], enabled = true, sender, persistRecord } = {}) {
  const database = { pushSubscriptions: [] };
  const trazas = [];
  const llamadas = [];
  let indice = 0;

  const senderPorDefecto = async (envio) => {
    llamadas.push(envio);
    const siguiente = respuestas[Math.min(indice, respuestas.length - 1)];
    indice += 1;
    if (siguiente instanceof Error) throw siguiente;
    return siguiente ?? { statusCode: 201 };
  };

  const servicio = createPushNotificationService({
    database,
    persistRecord: persistRecord || (async () => true),
    sender: sender === null ? null : (sender || senderPorDefecto),
    enabled,
    logger: { log: (linea) => trazas.push(linea) }
  });

  return { servicio, database, trazas, llamadas };
}

// --------------------------------------------------------------------------
// La bandera
// --------------------------------------------------------------------------

test('la bandera solo se enciende con valores explicitos', () => {
  for (const verdadero of ['1', 'true', 'TRUE', 'yes', 'on', ' true ']) {
    assert.equal(isWebPushEnabled(verdadero), true, verdadero);
  }
  // `Boolean('false')` es true: por eso la lectura es por lista y no por
  // veracidad. Un fallo aqui encenderia en produccion algo que se creia
  // apagado.
  for (const falso of ['false', 'FALSE', '0', 'no', 'off', '', '   ', undefined, null, 'quizas']) {
    assert.equal(isWebPushEnabled(falso), false, String(falso));
  }
});

test('con la funcionalidad apagada el sender no se llama nunca', async () => {
  const { servicio, database, llamadas } = montar({ enabled: false });
  database.pushSubscriptions.push(suscripcion());

  const resultado = await servicio.notifyUser('driver_1', { t: 'ride_request' });

  assert.equal(llamadas.length, 0, 'no debia contactarse con ningun proveedor');
  assert.equal(resultado.sent, 0);
  assert.equal(resultado.skipped, true);
});

test('sin adaptador real configurado no se envia nada', async () => {
  // Es el estado de PUSH-1: bandera encendida, pero sin sender.
  const { servicio, database } = montar({ enabled: true, sender: null });
  database.pushSubscriptions.push(suscripcion());

  const resultado = await servicio.notifyUser('driver_1', { t: 'ride_request' });
  assert.equal(resultado.sent, 0);
  assert.equal(resultado.skipped, true);
});

// --------------------------------------------------------------------------
// Clasificacion
// --------------------------------------------------------------------------

test('cada respuesta del proveedor cae en su clase', () => {
  assert.equal(classifyDeliveryResult({ statusCode: 200 }), DELIVERY_RESULT.SUCCESS);
  assert.equal(classifyDeliveryResult({ statusCode: 201 }), DELIVERY_RESULT.SUCCESS);
  assert.equal(classifyDeliveryResult({ statusCode: 404 }), DELIVERY_RESULT.EXPIRED);
  assert.equal(classifyDeliveryResult({ statusCode: 410 }), DELIVERY_RESULT.EXPIRED);
  assert.equal(classifyDeliveryResult({ statusCode: 429 }), DELIVERY_RESULT.RATE_LIMITED);
  assert.equal(classifyDeliveryResult({ statusCode: 400 }), DELIVERY_RESULT.BAD_REQUEST);
  assert.equal(classifyDeliveryResult({ statusCode: 500 }), DELIVERY_RESULT.TRANSIENT);
  assert.equal(classifyDeliveryResult({ statusCode: 503 }), DELIVERY_RESULT.TRANSIENT);
  assert.equal(classifyDeliveryResult({ error: 'ETIMEDOUT' }), DELIVERY_RESULT.TRANSIENT);
  assert.equal(classifyDeliveryResult({}), DELIVERY_RESULT.TRANSIENT);
});

test('un envio correcto marca el exito y limpia el contador de fallos', async () => {
  const { servicio, database } = montar({ respuestas: [{ statusCode: 201 }] });
  database.pushSubscriptions.push(suscripcion({ failureCount: 3 }));

  const resultado = await servicio.notifyUser('driver_1', { t: 'ride_request' });

  assert.equal(resultado.sent, 1);
  const registro = database.pushSubscriptions[0];
  assert.ok(registro.lastSuccessAt, 'debia registrar el ultimo exito');
  assert.equal(registro.failureCount, 0, 'un exito reinicia el contador');
  assert.equal(registro.disabledAt, null);
});

test('404 y 410 dan de baja la suscripcion de inmediato', async () => {
  for (const [codigo, motivo] of [[404, PUSH_DISABLED_REASON.EXPIRED_404], [410, PUSH_DISABLED_REASON.EXPIRED_410]]) {
    const { servicio, database } = montar({ respuestas: [{ statusCode: codigo }] });
    database.pushSubscriptions.push(suscripcion());

    await servicio.notifyUser('driver_1', { t: 'ride_request' });

    const registro = database.pushSubscriptions[0];
    assert.ok(registro.disabledAt, `${codigo} debia dar de baja`);
    assert.equal(registro.disabledReason, motivo);
  }
});

test('un 429 no da de baja ni penaliza la suscripcion', async () => {
  const { servicio, database } = montar({ respuestas: [{ statusCode: 429 }] });
  database.pushSubscriptions.push(suscripcion());

  await servicio.notifyUser('driver_1', { t: 'ride_request' });

  const registro = database.pushSubscriptions[0];
  assert.equal(registro.disabledAt, null, 'un limite del proveedor no mata un dispositivo');
  // Un 429 es un limite NUESTRO con el proveedor: no es evidencia de que el
  // dispositivo haya desaparecido, asi que no debe acercarlo a su baja.
  assert.equal(registro.failureCount, 0);
});

test('un 400 se trata como defecto propio, no como suscripcion invalida', async () => {
  const { servicio, database, trazas } = montar({ respuestas: [{ statusCode: 400 }] });
  database.pushSubscriptions.push(suscripcion());

  await servicio.notifyUser('driver_1', { t: 'ride_request' });

  const registro = database.pushSubscriptions[0];
  assert.equal(registro.disabledAt, null, 'un error de payload nuestro no debe borrar suscripciones validas');
  assert.equal(registro.failureCount, 0);
  assert.ok(trazas.some(linea => linea.includes('push_bad_request')), 'debia quedar registrado como defecto propio');
});

test('un 5xx suma un fallo pero no mata la suscripcion', async () => {
  const { servicio, database } = montar({ respuestas: [{ statusCode: 503 }] });
  database.pushSubscriptions.push(suscripcion());

  await servicio.notifyUser('driver_1', { t: 'ride_request' });

  const registro = database.pushSubscriptions[0];
  assert.equal(registro.failureCount, 1);
  assert.equal(registro.disabledAt, null, 'un solo 5xx no puede matar una suscripcion');
});

test('un sender que lanza cuenta como fallo transitorio', async () => {
  const { servicio, database } = montar({ respuestas: [new Error('ECONNRESET')] });
  database.pushSubscriptions.push(suscripcion());

  const resultado = await servicio.notifyUser('driver_1', { t: 'ride_request' });

  assert.equal(resultado.sent, 0);
  assert.equal(database.pushSubscriptions[0].failureCount, 1);
  assert.equal(database.pushSubscriptions[0].disabledAt, null);
});

test('solo al alcanzar el umbral se da de baja por fallos repetidos', async () => {
  const { servicio, database } = montar({ respuestas: [{ statusCode: 500 }] });
  database.pushSubscriptions.push(suscripcion());

  for (let intento = 1; intento < MAX_CONSECUTIVE_FAILURES; intento += 1) {
    await servicio.notifyUser('driver_1', { t: 'ride_request' });
    assert.equal(database.pushSubscriptions[0].disabledAt, null, `no debia caer en el intento ${intento}`);
  }
  await servicio.notifyUser('driver_1', { t: 'ride_request' });

  const registro = database.pushSubscriptions[0];
  assert.ok(registro.disabledAt, 'al alcanzar el umbral si se da de baja');
  assert.equal(registro.disabledReason, PUSH_DISABLED_REASON.TOO_MANY_FAILURES);
});

// --------------------------------------------------------------------------
// Varios dispositivos y aislamiento
// --------------------------------------------------------------------------

test('se envia a todos los dispositivos vivos del usuario', async () => {
  const { servicio, database, llamadas } = montar({ respuestas: [{ statusCode: 201 }] });
  database.pushSubscriptions.push(
    suscripcion({ id: 'sub_1', endpoint: `${ENDPOINT}-1` }),
    suscripcion({ id: 'sub_2', endpoint: `${ENDPOINT}-2` }),
    suscripcion({ id: 'sub_3', endpoint: `${ENDPOINT}-3` })
  );

  const resultado = await servicio.notifyUser('driver_1', { t: 'ride_request' });

  assert.equal(llamadas.length, 3);
  assert.equal(resultado.sent, 3);
});

test('las suscripciones dadas de baja se ignoran', async () => {
  const { servicio, database, llamadas } = montar({ respuestas: [{ statusCode: 201 }] });
  database.pushSubscriptions.push(
    suscripcion({ id: 'sub_viva', endpoint: `${ENDPOINT}-viva` }),
    suscripcion({ id: 'sub_muerta', endpoint: `${ENDPOINT}-muerta`, disabledAt: '2026-08-01T00:00:00.000Z', disabledReason: 'USER_REVOKED' })
  );

  await servicio.notifyUser('driver_1', { t: 'ride_request' });

  assert.equal(llamadas.length, 1, 'solo la viva');
  assert.equal(llamadas[0].endpoint, `${ENDPOINT}-viva`);
});

test('el fallo de un dispositivo no aborta el envio a los demas', async () => {
  const database = { pushSubscriptions: [] };
  const alcanzados = [];
  const servicio = createPushNotificationService({
    database,
    persistRecord: async () => true,
    enabled: true,
    logger: { log: () => {} },
    sender: async ({ endpoint }) => {
      alcanzados.push(endpoint);
      if (endpoint.endsWith('-2')) throw new Error('EAI_AGAIN');
      return { statusCode: 201 };
    }
  });
  database.pushSubscriptions.push(
    suscripcion({ id: 'sub_1', endpoint: `${ENDPOINT}-1` }),
    suscripcion({ id: 'sub_2', endpoint: `${ENDPOINT}-2` }),
    suscripcion({ id: 'sub_3', endpoint: `${ENDPOINT}-3` })
  );

  const resultado = await servicio.notifyUser('driver_1', { t: 'ride_request' });

  assert.equal(alcanzados.length, 3, 'los tres debian intentarse');
  assert.equal(resultado.sent, 2, 'dos correctos pese al fallo del segundo');
});

test('sin suscripciones vivas no se llama al proveedor y no se rompe', async () => {
  const { servicio, llamadas } = montar({ respuestas: [{ statusCode: 201 }] });
  const resultado = await servicio.notifyUser('driver_sin_dispositivos', { t: 'ride_request' });
  assert.equal(llamadas.length, 0);
  assert.equal(resultado.sent, 0);
});

// --------------------------------------------------------------------------
// El contrato que protege al despacho
// --------------------------------------------------------------------------

test('notifyUser nunca rechaza, pase lo que pase', async () => {
  const catastroficos = [
    async () => { throw new Error('proveedor caido'); },
    async () => { const e = new Error('sin codigo'); e.code = 'ECONNREFUSED'; throw e; },
    async () => { throw 'ni siquiera es un Error'; },
    async () => ({ statusCode: 'no es un numero' }),
    async () => null,
    async () => undefined
  ];

  for (const sender of catastroficos) {
    const database = { pushSubscriptions: [suscripcion()] };
    const servicio = createPushNotificationService({
      database, persistRecord: async () => true, sender, enabled: true, logger: { log: () => {} }
    });
    // Si esto rechazara, el `await` de abajo lanzaria y la prueba fallaria.
    const resultado = await servicio.notifyUser('driver_1', { t: 'ride_request' });
    assert.ok(resultado && typeof resultado === 'object', 'siempre un resultado estructurado');
  }
});

test('un fallo al persistir tampoco propaga', async () => {
  const { servicio, database } = montar({
    respuestas: [{ statusCode: 201 }],
    persistRecord: async () => { throw new Error('DISCO_CAIDO'); }
  });
  database.pushSubscriptions.push(suscripcion());

  const resultado = await servicio.notifyUser('driver_1', { t: 'ride_request' });
  assert.equal(resultado.sent, 1, 'el envio ocurrio aunque el disco fallara');
});

test('notifyRideOffer tolera un viaje o un conductor ausentes', async () => {
  const { servicio, llamadas } = montar({ respuestas: [{ statusCode: 201 }] });
  for (const [trip, driverId] of [[null, 'd1'], [{ id: 't1' }, null], [undefined, undefined], [{}, 'd1']]) {
    const resultado = await servicio.notifyRideOffer(trip, driverId);
    assert.equal(resultado.sent, 0);
  }
  assert.equal(llamadas.length, 0);
});

// --------------------------------------------------------------------------
// Privacidad del payload y de las trazas
// --------------------------------------------------------------------------

test('el payload de oferta solo lleva el identificador de enrutado', () => {
  const payload = buildRideOfferPayload('trip_123');
  assert.deepEqual(Object.keys(payload).sort(), ['t', 'tripId', 'v']);
  assert.equal(payload.t, 'ride_request');
  assert.equal(payload.tripId, 'trip_123');
});

test('ni el payload ni las trazas exponen datos del viaje ni del dispositivo', async () => {
  const { servicio, database, trazas, llamadas } = montar({ respuestas: [{ statusCode: 410 }] });
  database.pushSubscriptions.push(suscripcion());

  const viaje = {
    id: 'trip_secreto',
    passengerName: 'Nombre Apellido',
    passengerPhone: '+58 414-1234567',
    pickupAddress: 'Calle 72 con Avenida 15, Maracaibo',
    destinationAddress: 'Centro Sambil',
    fareUSD: 4.5
  };
  await servicio.notifyRideOffer(viaje, 'driver_1');

  const prohibidos = [
    ENDPOINT, CLAVES.p256dh, CLAVES.auth,
    'Nombre Apellido', '+58 414-1234567',
    'Calle 72 con Avenida 15, Maracaibo', 'Centro Sambil'
  ];

  const registro = trazas.join('\n');
  for (const secreto of prohibidos) {
    assert.ok(!registro.includes(secreto), `la traza filtra: ${secreto}`);
  }

  const enviado = JSON.stringify(llamadas[0].payload);
  for (const secreto of prohibidos) {
    assert.ok(!enviado.includes(secreto), `el payload filtra: ${secreto}`);
  }

  // El host si aparece: identifica al proveedor, no a la persona.
  assert.ok(registro.includes('fcm.googleapis.com'), 'el host es util y no identifica a nadie');
  assert.ok(registro.includes('trip_secreto'), 'el tripId si puede viajar');
});
