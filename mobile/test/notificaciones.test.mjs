import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  CANAL_DE_CARRERAS,
  TEXTO_DE_AVISO,
  TIPOS_DE_AVISO,
  convienePedirPermiso,
  destinoDeAviso,
  estadoDePermiso,
  leerAviso
} from '../domain/notificaciones.ts';

/**
 * LOS AVISOS PUSH EN EL TELÉFONO (PUSH-1 · Firebase)
 *
 * Lo que se protege:
 *
 *   1. Que el payload NO sea autoridad: se lee un tipo y un identificador, y
 *      nada más. Aunque un servidor equivocado mandara una dirección o el texto
 *      de un mensaje, el analizador no los devuelve y ninguna pantalla puede
 *      leerlos.
 *   2. Que cada aviso lleve a la pantalla REAL de su rol, y que un aviso de un
 *      rol ajeno --otra cuenta en el mismo teléfono-- no abra nada suyo.
 *   3. Que la tabla de textos del teléfono sea ESPEJO de la del servidor.
 *   4. Que `expo-notifications` tenga una sola puerta, y que cerrar sesión dé
 *      de baja el dispositivo.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

// ---------------------------------------------------------------------------
// Qué dice un aviso
// ---------------------------------------------------------------------------

test('un aviso nuestro se lee: tipo y viaje, y nada más', () => {
  const aviso = leerAviso({ v: '1', t: 'trip_arrived', tripId: 'trip_1', title: 'x', body: 'y' });
  assert.deepEqual(aviso, { tipo: 'trip_arrived', viajeId: 'trip_1' });
  assert.deepEqual(Object.keys(aviso), ['tipo', 'viajeId'], 'el analizador devuelve más de lo que debe');
});

test('lo que no es un aviso nuestro se ignora sin lanzar', () => {
  for (const raro of [null, undefined, 42, 'texto', {}, { t: 'marketing' }, { t: 'trip_arrived', v: 2 }, { v: 1 }]) {
    assert.equal(leerAviso(raro), null, JSON.stringify(raro));
  }
});

test('aunque el payload traiga PII, el aviso leído no la conserva', () => {
  // El servidor nunca la manda. Pero si algún día un servidor equivocado lo
  // hiciera, ninguna pantalla podría pintarla: el analizador no la devuelve.
  const aviso = leerAviso({
    v: 1, t: 'chat_message', tripId: 'trip_1',
    text: 'voy llegando', senderName: 'Ana', address: 'Calle 72', imageStorageKey: 'x/y.jpg'
  });
  assert.equal(JSON.stringify(aviso).includes('Ana'), false);
  assert.equal(JSON.stringify(aviso).includes('Calle'), false);
  assert.equal(JSON.stringify(aviso).includes('imageStorageKey'), false);
});

// ---------------------------------------------------------------------------
// A dónde lleva
// ---------------------------------------------------------------------------

test('la oferta lleva al conductor a su pantalla, y a nadie más', () => {
  const oferta = { tipo: 'ride_request', viajeId: 'trip_1' };
  assert.equal(destinoDeAviso(oferta, 'driver'), '/conductor');
  // Otra cuenta en el mismo teléfono: no abre nada del conductor anterior.
  assert.equal(destinoDeAviso(oferta, 'passenger'), '/pasajero');
  assert.equal(destinoDeAviso(oferta, null), '/');
});

test('el ciclo de vida lleva a la pasajera a su viaje activo', () => {
  for (const tipo of ['trip_accepted', 'trip_arrived', 'trip_started']) {
    assert.equal(destinoDeAviso({ tipo, viajeId: 'trip_1' }, 'passenger'), '/viaje-activo', tipo);
  }
});

test('un viaje terminado lleva a su ficha en el historial, no a un viaje activo que ya no existe', () => {
  assert.equal(destinoDeAviso({ tipo: 'trip_completed', viajeId: 'trip_1' }, 'passenger'), '/viaje/trip_1');
  assert.equal(destinoDeAviso({ tipo: 'trip_cancelled', viajeId: 'trip_1' }, 'passenger'), '/viaje/trip_1');
  assert.equal(destinoDeAviso({ tipo: 'trip_completed', viajeId: null }, 'passenger'), '/pasajero');
});

test('el mensaje lleva al chat del viaje, sea quien sea', () => {
  assert.equal(destinoDeAviso({ tipo: 'chat_message', viajeId: 'trip_1' }, 'passenger'), '/chat');
  assert.equal(destinoDeAviso({ tipo: 'chat_message', viajeId: 'trip_1' }, 'driver'), '/chat');
});

test('las rutas destino existen como pantallas reales', () => {
  // Un enlace profundo a una pantalla que no existe abre una pantalla vacía.
  for (const [ruta, fichero] of [['/conductor', 'app/conductor.tsx'], ['/viaje-activo', 'app/viaje-activo.tsx'], ['/chat', 'app/chat.tsx'], ['/pasajero', 'app/pasajero.tsx'], ['/viaje/x', 'app/viaje/[id].tsx']]) {
    assert.ok(fs.existsSync(path.join(raizMovil, fichero)), `${ruta} no tiene pantalla (${fichero})`);
  }
});

// ---------------------------------------------------------------------------
// El permiso
// ---------------------------------------------------------------------------

test('el permiso se pide una vez y nunca se insiste', () => {
  assert.equal(estadoDePermiso(false, true, 'undetermined'), 'sin_decidir');
  assert.equal(estadoDePermiso(true, false, 'granted'), 'concedido');
  assert.equal(estadoDePermiso(false, false, 'denied'), 'denegado');
  // Android ANTES de pedir: dice «denied» y deja preguntar. Nunca se pidió: se pide.
  assert.equal(estadoDePermiso(false, true, 'denied', false), 'sin_decidir', 'el «denied» previo de Android no es una negativa');
  // Se pidió una vez y se negó: no se insiste aunque el sistema lo permita.
  assert.equal(estadoDePermiso(false, true, 'denied', true), 'denegado', 'se insistiría tras una negativa');
  // Y el proveedor anota «ya se pidió» DESPUÉS de la respuesta: si la
  // aplicación muere con el diálogo abierto, nadie contestó y se vuelve a pedir.
  const proveedor = sinComentarios('realtime/Notificaciones.tsx');
  assert.match(proveedor, /const p = await Notifications\.requestPermissionsAsync\(\);\s*await marcarPermisoPushPedido\(\);/);

  assert.equal(convienePedirPermiso('sin_decidir'), true);
  assert.equal(convienePedirPermiso('denegado'), false);
  assert.equal(convienePedirPermiso('concedido'), false);
});

// ---------------------------------------------------------------------------
// La tabla de textos es espejo de la del servidor
// ---------------------------------------------------------------------------

test('el teléfono y el servidor traducen cada tipo con las MISMAS palabras', async () => {
  // Con la aplicación cerrada presenta el sistema lo que manda el servidor;
  // abierta, presenta la aplicación con su tabla. Si divergen, la misma
  // novedad se lee distinto según cómo llegó.
  const servidor = await import('../../server/services/pushNotificationService.js');
  assert.deepEqual(TEXTO_DE_AVISO, servidor.TEXTO_DE_AVISO);
  // Y cada tipo que el servidor puede mandar, el teléfono lo entiende.
  for (const tipo of Object.values(servidor.PUSH_TYPE)) {
    assert.ok(TIPOS_DE_AVISO.includes(tipo), `el teléfono no entiende «${tipo}»`);
  }
});

test('el canal de Android que manda el servidor es el que el teléfono declara', async () => {
  // Un `channelId` que no existe en el aparato manda el aviso al canal de
  // reserva de expo, con menos importancia: una oferta que no suena.
  const fcm = await import('../../server/services/fcmSender.js');
  assert.equal(CANAL_DE_CARRERAS, fcm.CANAL_ANDROID);
  const mensaje = fcm.construirMensajeFcm({ token: 'x', payload: { v: 1, t: 'ride_request', tripId: 'trip_1' } });
  assert.equal(mensaje.message.data.channelId, CANAL_DE_CARRERAS);
  // Y lo que el teléfono lee del aviso es exactamente el `body` del mensaje.
  assert.deepEqual(leerAviso(JSON.parse(mensaje.message.data.body)), { tipo: 'ride_request', viajeId: 'trip_1' });
});

// ---------------------------------------------------------------------------
// La puerta única, y la baja al salir
// ---------------------------------------------------------------------------

test('expo-notifications sólo se importa desde la puerta única', () => {
  const permitido = path.join(raizMovil, 'realtime', 'Notificaciones.tsx');
  const recorrer = dir => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (['node_modules', 'android', 'ios', '.expo', 'test', 'assets'].includes(entrada.name)) continue;
        recorrer(completa);
      } else if (/\.(ts|tsx)$/.test(entrada.name) && completa !== permitido) {
        const codigo = despojarComentarios(fs.readFileSync(completa, 'utf8'));
        assert.equal(/from ['"]expo-notifications['"]/.test(codigo), false, `${path.relative(raizMovil, completa)} importa expo-notifications`);
      }
    }
  };
  recorrer(raizMovil);
});

test('al cerrar sesión se da de baja el dispositivo, y otra cuenta no hereda la suscripción', () => {
  const proveedor = sinComentarios('realtime/Notificaciones.tsx');
  assert.match(proveedor, /darDeBajaDispositivo\(guardada\.id\)/, 'no se da de baja al salir');
  // La baja va en la DESPEDIDA, con el token todavía vivo. En el laboratorio
  // salía después de borrar el token: 401, y la fila seguía viva.
  assert.match(proveedor, /alCerrarSesion\(async \(\) => \{[\s\S]*?darDeBajaDispositivo\(guardada\.id\)/);
  const auth = sinComentarios('context/AuthContext.tsx');
  const salir = auth.slice(auth.indexOf('const salir = useCallback('));
  const despedida = salir.indexOf('await despedirse();');
  const borrado = salir.indexOf('await borrarToken()');
  assert.ok(despedida > 0 && borrado > despedida, 'salir() debe despedirse ANTES de borrar el token');
  assert.match(proveedor, /guardada\.userId !== usuarioId/, 'no se comprueba de quién es la suscripción guardada');
  // El propietario nunca sale del teléfono: el servicio no manda userId.
  const servicio = sinComentarios('services/push.ts');
  assert.equal(/userId/.test(servicio), false, 'el cliente manda un userId al registrar');
  assert.match(servicio, /transport: 'fcm'/);
});

test('con la aplicación abierta presenta la propia aplicación, con su tabla, y sólo lo remoto', () => {
  // expo no consulta al manejador por los mensajes solo-datos con la app
  // abierta: si no lo presenta la aplicación, una oferta que llega mientras
  // se mira el mapa no suena. Y la notificación local vuelve a pasar por el
  // mismo oyente: sin la guarda del `trigger` se presentaría a sí misma.
  const proveedor = sinComentarios('realtime/Notificaciones.tsx');
  assert.match(proveedor, /addNotificationReceivedListener\(presentarConLaAplicacionAbierta\)/);
  assert.match(proveedor, /disparador\.type === 'push'/);
  assert.match(proveedor, /if \(aviso === null \|\| !esRemoto\) return;/);
  assert.match(proveedor, /TEXTO_DE_AVISO\[aviso\.tipo\]/);
  assert.match(proveedor, /trigger: \{ channelId: CANAL_DE_CARRERAS \}/);
  // Y con los mismos datos: el toque abre la misma puerta que un aviso remoto.
  assert.match(proveedor, /data: notificacion\.request\.content\.data/);
});

test('al tocar un aviso se abre una pantalla; nunca se aplica el payload como estado', () => {
  const proveedor = sinComentarios('realtime/Notificaciones.tsx');
  assert.match(proveedor, /const destino = destinoDeAviso\(aviso, rol\);/);
  // En el arranque en frío la sesión llega DESPUÉS que la respuesta: el aviso
  // espera sin marcarse como abierto. Se aprendió en el laboratorio: abría «/».
  const espera = proveedor.indexOf("if (rol === null || ruta === '/')");
  const marca = proveedor.indexOf('ultimoAvisoAbierto.current = identificador');
  assert.ok(espera > 0 && marca > espera, 'el aviso debe esperar a la sesión ANTES de marcarse como abierto');
  // Se NAVEGA a la pantalla; con `push` se apilaba una segunda copia vacía
  // encima de la que tenía la oferta.
  assert.match(proveedor, /router\.navigate\(destino as never\)/);
  assert.equal(/router\.push\(/.test(proveedor), false, 'desde un aviso no se apila');
  // Ni un `set` de viaje ni de mensaje desde el aviso.
  assert.equal(/setViaje|setMensajes|setOferta/.test(proveedor), false);
});
