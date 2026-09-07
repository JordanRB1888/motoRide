import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRANSPORTE,
  endpointHost,
  registerSubscription,
  validateSubscriptionInput
} from '../domain/pushSubscription.js';
import { crearSenderCompuesto, transporteDe } from '../services/pushSender.js';
import { PUSH_TYPE, createPushNotificationService } from '../services/pushNotificationService.js';

/**
 * DOS TRANSPORTES, UNA COLECCIÓN (PUSH-1 · Firebase)
 *
 * Lo que se protege: que un teléfono y un navegador convivan en la misma lista
 * de dispositivos sin que ninguno rompa las reglas del otro; que el emisor
 * compuesto reparta por transporte; y que un transporte sin credencial no
 * cueste la baja de dispositivos vivos.
 */

// ---------------------------------------------------------------------------
// La validación
// ---------------------------------------------------------------------------

test('un token de FCM se acepta con su plataforma, sin claves', () => {
  const r = validateSubscriptionInput({ transport: 'fcm', token: 'dXNlcjE:APA91b_abc-DEF_123', platform: 'android' });
  assert.equal(r.ok, true);
  assert.equal(r.value.transport, TRANSPORTE.FCM);
  assert.equal(r.value.endpoint, 'dXNlcjE:APA91b_abc-DEF_123');
  assert.equal(r.value.keys, null);
  assert.equal(r.value.platform, 'android');
});

test('un token de FCM con basura, sin plataforma o de plataforma rara se rechaza', () => {
  for (const malo of [
    { transport: 'fcm', token: '', platform: 'android' },
    { transport: 'fcm', token: 'con espacios y <html>', platform: 'android' },
    { transport: 'fcm', token: 'a'.repeat(5000), platform: 'android' },
    { transport: 'fcm', token: 'tok', platform: 'web' },
    { transport: 'fcm', token: 'tok' }
  ]) {
    assert.equal(validateSubscriptionInput(malo).ok, false, JSON.stringify(malo).slice(0, 60));
  }
});

test('una suscripción de navegador sigue validándose exactamente igual que antes', () => {
  const r = validateSubscriptionInput({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'AAAA', auth: 'BBBB' } });
  assert.equal(r.ok, true);
  assert.equal(r.value.transport, TRANSPORTE.WEB_PUSH);
  assert.equal(r.value.platform, 'web');
  assert.equal(validateSubscriptionInput({ endpoint: 'http://inseguro', keys: { p256dh: 'A', auth: 'B' } }).ok, false);
});

// ---------------------------------------------------------------------------
// El registro
// ---------------------------------------------------------------------------

test('el token de un teléfono se registra con transporte y plataforma, y sin claves', () => {
  const col = [];
  const { record, created } = registerSubscription(col, {
    userId: 'u1', endpoint: 'tok-1', keys: null, id: 'sub_1', now: 't', transport: 'fcm', platform: 'android'
  });
  assert.equal(created, true);
  assert.equal(record.transport, 'fcm');
  assert.equal(record.platform, 'android');
  assert.equal(record.keys, null);
});

test('el mismo teléfono con otra cuenta CAMBIA de dueño en la misma fila', () => {
  // La regla de «un teléfono que cambia de manos», intacta para FCM: la cuenta
  // anterior no puede seguir recibiendo las carreras de la nueva.
  const col = [];
  registerSubscription(col, { userId: 'cuentaA', endpoint: 'tok-1', keys: null, id: 'sub_1', now: 't1', transport: 'fcm', platform: 'android' });
  const { record, created, ownerChanged } = registerSubscription(col, {
    userId: 'cuentaB', endpoint: 'tok-1', keys: null, id: 'sub_2', now: 't2', transport: 'fcm', platform: 'android'
  });
  assert.equal(created, false);
  assert.equal(ownerChanged, true);
  assert.equal(record.userId, 'cuentaB');
  assert.equal(col.length, 1, 'quedaron dos filas para el mismo teléfono');
});

test('una fila antigua sin transporte es de navegador', () => {
  assert.equal(transporteDe({ endpoint: 'https://x' }), TRANSPORTE.WEB_PUSH);
  assert.equal(transporteDe({ endpoint: 'tok', transport: 'fcm' }), TRANSPORTE.FCM);
  assert.equal(endpointHost('tok-que-no-es-url', 'fcm'), 'fcm');
  assert.equal(endpointHost('https://updates.push.services.mozilla.com/x'), 'updates.push.services.mozilla.com');
});

// ---------------------------------------------------------------------------
// El emisor compuesto
// ---------------------------------------------------------------------------

test('cada suscripción va por su transporte', async () => {
  const idas = [];
  const { sender, enabled, transportes } = crearSenderCompuesto({
    webpush: async s => { idas.push(['webpush', s.endpoint]); return { statusCode: 201 }; },
    fcm: async s => { idas.push(['fcm', s.endpoint]); return { statusCode: 200 }; }
  });
  assert.equal(enabled, true);
  assert.deepEqual(transportes.sort(), ['fcm', 'webpush']);

  await sender({ endpoint: 'https://nav', transport: 'webpush' });
  await sender({ endpoint: 'tok', transport: 'fcm' });
  await sender({ endpoint: 'https://antigua' });
  assert.deepEqual(idas, [['webpush', 'https://nav'], ['fcm', 'tok'], ['webpush', 'https://antigua']]);
});

test('sin ningún emisor, push queda apagado; con uno, encendido', () => {
  assert.equal(crearSenderCompuesto({}).enabled, false);
  assert.equal(crearSenderCompuesto({}).sender, null);
  assert.equal(crearSenderCompuesto({ fcm: async () => ({ statusCode: 200 }) }).enabled, true);
});

test('un transporte sin emisor se omite sin penalizar al dispositivo', async () => {
  // Solo FCM configurado, y hay una suscripción de navegador viva: no se
  // intenta, se dice por qué, y su contador de fallos no se mueve.
  const { sender } = crearSenderCompuesto({ fcm: async () => ({ statusCode: 200 }) });
  const database = {
    pushSubscriptions: [
      { id: 'nav', userId: 'u1', endpoint: 'https://navegador', keys: { p256dh: 'a', auth: 'b' }, disabledAt: null, failureCount: 0 },
      { id: 'tel', userId: 'u1', endpoint: 'tok', transport: 'fcm', platform: 'android', keys: null, disabledAt: null, failureCount: 0 }
    ],
    pushDeliveries: []
  };
  const registros = [];
  const servicio = createPushNotificationService({
    database, persistRecord: async () => true, enabled: true, sender,
    logger: { log: m => registros.push(String(m)) }, contarConexiones: async () => 0
  });

  const r = await servicio.notifyTripLifecycle({ id: 'trip_1', passengerId: 'u1' }, PUSH_TYPE.TRIP_ARRIVED, 'u1');

  assert.equal(r.sent, 1, 'el teléfono tenía que recibirlo');
  assert.equal(database.pushSubscriptions[0].failureCount, 0, 'el navegador pagó por una carencia nuestra');
  assert.equal(database.pushSubscriptions[0].disabledAt, null);
  assert.ok(registros.some(l => l.includes('push_omitido_sin_emisor')), 'no se dijo por qué se omitió');
});

test('un token que FCM declara muerto se da de baja con el dominio de siempre', async () => {
  // El emisor normaliza UNREGISTERED a 410 y el clasificador existente hace el
  // resto: baja lógica, con motivo, sin código nuevo.
  const { sender } = crearSenderCompuesto({ fcm: async () => ({ statusCode: 410, fcm: 'UNREGISTERED' }) });
  const database = {
    pushSubscriptions: [{ id: 'tel', userId: 'u1', endpoint: 'tok', transport: 'fcm', platform: 'android', keys: null, disabledAt: null, failureCount: 0 }],
    pushDeliveries: []
  };
  const servicio = createPushNotificationService({
    database, persistRecord: async () => true, enabled: true, sender, logger: { log() {} }, contarConexiones: async () => 0
  });

  await servicio.notifyTripLifecycle({ id: 'trip_1', passengerId: 'u1' }, PUSH_TYPE.TRIP_STARTED, 'u1');

  assert.notEqual(database.pushSubscriptions[0].disabledAt, null, 'el token muerto sigue vivo');
  assert.equal(database.pushSubscriptions[0].disabledReason, 'EXPIRED_410');
});
