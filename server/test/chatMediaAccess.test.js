import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewChatMedia, findMessageByMediaId, isChatMediaId } from '../domain/chatMediaAccess.js';

const ID = '9f1c7e2a-4b6d-4a1e-9c3f-2d8e5a7b1c04';
const OTRO_ID = '11111111-2222-3333-4444-555555555555';

const PASAJERO = { id: 'user_pasajero', role: 'passenger' };
const CONDUCTOR = { id: 'user_conductor', role: 'driver' };
const AJENO = { id: 'user_ajeno', role: 'passenger' };
const ADMIN = { id: 'user_admin', role: 'admin' };

const viaje = status => ({ id: 'trip_1', status, passengerId: PASAJERO.id, driverId: CONDUCTOR.id });

const mensajeViaje = {
  id: 'msg_1',
  tripId: 'trip_1',
  senderId: PASAJERO.id,
  imageRef: { id: ID, mimeType: 'image/png', size: 100, createdAt: '2026-08-14T00:00:00.000Z' },
  imageStorageKey: 'user_pasajero/uuid.png'
};

const mensajeSoporte = {
  id: 'support_1',
  conversationUserId: PASAJERO.id,
  senderId: PASAJERO.id,
  imageRef: { id: OTRO_ID, mimeType: 'image/jpeg', size: 100, createdAt: '2026-08-14T00:00:00.000Z' },
  imageStorageKey: 'user_pasajero/otro.jpg'
};

// -------------------------------------------------------------- identificador

test('solo un UUID opaco cuenta como identificador de adjunto', () => {
  assert.equal(isChatMediaId(ID), true);
  for (const malo of [
    '', '   ', null, undefined, 42, {},
    '../../etc/passwd',
    'user_1/uuid.png',
    ID + '/../otro',
    ID + '.png',
    'no-es-un-uuid'
  ]) {
    assert.equal(isChatMediaId(malo), false, `no debía admitirse: ${String(malo).slice(0, 30)}`);
  }
});

test('el identificador nunca se usa como ruta', () => {
  // Un id con forma de ruta ni siquiera pasa la validación, así que no puede
  // llegar a componer una clave de almacenamiento.
  for (const intento of ['user_1/uuid.png', '../chat-media/uuid.png', '/etc/passwd']) {
    assert.equal(findMessageByMediaId({ id: intento, messages: [mensajeViaje] }), null);
  }
  // Y un identificador válido solo sirve para encontrar el mensaje: la clave
  // sale del registro, no del id.
  const hallado = findMessageByMediaId({ id: ID, messages: [mensajeViaje] });
  assert.equal(hallado.message.imageStorageKey, 'user_pasajero/uuid.png');
  assert.ok(!hallado.message.imageStorageKey.includes(ID), 'la clave no se deriva del id');
});

test('la búsqueda es por igualdad exacta en ambas colecciones', () => {
  const enViaje = findMessageByMediaId({ id: ID, messages: [mensajeViaje], supportMessages: [mensajeSoporte] });
  assert.equal(enViaje.channel, 'trip');
  assert.equal(enViaje.message.id, 'msg_1');

  const enSoporte = findMessageByMediaId({ id: OTRO_ID, messages: [mensajeViaje], supportMessages: [mensajeSoporte] });
  assert.equal(enSoporte.channel, 'support');
  assert.equal(enSoporte.message.id, 'support_1');

  // Un id que no existe, y uno que solo coincide parcialmente.
  assert.equal(findMessageByMediaId({ id: '00000000-0000-0000-0000-000000000000', messages: [mensajeViaje] }), null);
  assert.equal(findMessageByMediaId({ id: ID.slice(0, -1) + 'f', messages: [mensajeViaje] }), null);
  assert.equal(findMessageByMediaId({ id: ID, messages: null, supportMessages: null }), null);
});

// --------------------------------------------------------------- chat de viaje

test('pasajero y conductor abren el adjunto de su viaje, también cerrado', () => {
  for (const estado of ['SEARCHING', 'DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) {
    const trips = [viaje(estado)];
    for (const quien of [PASAJERO, CONDUCTOR]) {
      assert.equal(
        canViewChatMedia({ viewer: quien, message: mensajeViaje, channel: 'trip', trips }), true,
        `${quien.role} debía poder verlo en ${estado}`
      );
    }
  }
});

test('administración no accede al chat de viaje, ni siquiera cerrado', () => {
  for (const estado of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED']) {
    assert.equal(
      canViewChatMedia({ viewer: ADMIN, message: mensajeViaje, channel: 'trip', trips: [viaje(estado)] }), false,
      `administración no debía acceder en ${estado}`
    );
  }
});

test('la exclusión de administración es explícita, no por no ser participante', () => {
  // Un administrador que ADEMÁS es el pasajero del viaje. Sin la exclusión
  // explícita pasaría la comprobación de participantes, que es justo lo que
  // haría `userCanAccessTrip` al autorizar por rol.
  const adminPasajero = { id: PASAJERO.id, role: 'admin' };
  assert.equal(
    canViewChatMedia({ viewer: adminPasajero, message: mensajeViaje, channel: 'trip', trips: [viaje('IN_PROGRESS')] }),
    false,
    'el rol admin excluye aunque la persona sea participante'
  );
  // Y la misma persona sin el rol sí accede: lo que decide es el rol.
  assert.equal(
    canViewChatMedia({ viewer: PASAJERO, message: mensajeViaje, channel: 'trip', trips: [viaje('IN_PROGRESS')] }),
    true
  );
});

test('un tercero nunca accede al chat de viaje', () => {
  assert.equal(canViewChatMedia({ viewer: AJENO, message: mensajeViaje, channel: 'trip', trips: [viaje('IN_PROGRESS')] }), false);
  // Ni el participante si el viaje no aparece.
  assert.equal(canViewChatMedia({ viewer: PASAJERO, message: mensajeViaje, channel: 'trip', trips: [] }), false);
  // Ni si el viaje es de otras dos personas.
  const ajeno = { id: 'trip_1', passengerId: 'otro_1', driverId: 'otro_2' };
  assert.equal(canViewChatMedia({ viewer: PASAJERO, message: mensajeViaje, channel: 'trip', trips: [ajeno] }), false);
});

// -------------------------------------------------------------------- soporte

test('el propietario del hilo y administración abren el adjunto de soporte', () => {
  assert.equal(canViewChatMedia({ viewer: PASAJERO, message: mensajeSoporte, channel: 'support' }), true);
  assert.equal(canViewChatMedia({ viewer: ADMIN, message: mensajeSoporte, channel: 'support' }), true);
});

test('un tercero no accede al hilo de soporte ajeno', () => {
  assert.equal(canViewChatMedia({ viewer: AJENO, message: mensajeSoporte, channel: 'support' }), false);
  assert.equal(canViewChatMedia({ viewer: CONDUCTOR, message: mensajeSoporte, channel: 'support' }), false);
});

test('entradas incompletas o canal desconocido no conceden acceso', () => {
  assert.equal(canViewChatMedia(), false);
  assert.equal(canViewChatMedia({ viewer: null, message: mensajeViaje, channel: 'trip' }), false);
  assert.equal(canViewChatMedia({ viewer: PASAJERO, message: null, channel: 'trip' }), false);
  assert.equal(canViewChatMedia({ viewer: PASAJERO, message: mensajeViaje, channel: 'inventado', trips: [viaje('IN_PROGRESS')] }), false);
  assert.equal(canViewChatMedia({ viewer: { role: 'admin' }, message: mensajeSoporte, channel: 'support' }), false, 'sin id no hay acceso');
});

test('la política no depende del estado del viaje, solo de quién pregunta', () => {
  // Contraste explícito con las fotografías de perfil (2B-2-1), donde el
  // acceso sí caduca. Aquí no: es una decisión distinta y deliberada.
  const cerrado = [viaje('COMPLETED')];
  assert.equal(canViewChatMedia({ viewer: PASAJERO, message: mensajeViaje, channel: 'trip', trips: cerrado }), true);
  assert.equal(canViewChatMedia({ viewer: AJENO, message: mensajeViaje, channel: 'trip', trips: cerrado }), false);
});
