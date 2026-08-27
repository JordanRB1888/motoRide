import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const swPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js');
const ORIGIN = 'https://plus58express.test';

/**
 * Contrato de Web Push del service worker.
 *
 * Se ejecuta el fuente real de public/sw.js en un contexto aislado: lo que se
 * prueba es el worker que se despliega, no un ayudante que lo imite.
 *
 * La propiedad que mas importa: NINGUNA cadena que venga del servidor puede
 * acabar pintada en la pantalla de bloqueo. El manejador anterior mandaba
 * `event.data.text()` directo al cuerpo de la notificacion, de modo que un
 * payload equivocado podia mostrar la direccion de recogida o el nombre del
 * pasajero en una pantalla que se ve sin desbloquear el telefono.
 */

function cargarWorker({ ventanas = [], suscripcionPrevia = null, subscribeFalla = false } = {}) {
  const codigo = fs.readFileSync(swPath, 'utf8');
  const listeners = new Map();
  const notificaciones = [];
  const ventanasAbiertas = [];
  const suscripciones = [];

  const clients = {
    matchAll: async () => ventanas,
    openWindow: async (url) => { ventanasAbiertas.push(url); return null; }
  };

  const self = {
    addEventListener: (tipo, manejador) => listeners.set(tipo, manejador),
    skipWaiting: () => {},
    clients,
    location: { origin: ORIGIN },
    registration: {
      showNotification: async (title, options) => { notificaciones.push({ title, options }); },
      pushManager: {
        subscribe: async (opciones) => {
          if (subscribeFalla) throw new Error('SUBSCRIBE_FAILED');
          suscripciones.push(opciones);
          return { endpoint: 'https://proveedor.test/nueva' };
        },
        getSubscription: async () => suscripcionPrevia
      }
    }
  };

  const contexto = {
    self, clients, caches: { open: async () => ({}), keys: async () => [], match: async () => undefined },
    fetch: async () => ({ ok: true, type: 'basic', redirected: false, clone() { return this; } }),
    URL, Response, Error, console, setTimeout
  };
  vm.createContext(contexto);
  vm.runInContext(codigo, contexto, { filename: 'sw.js' });

  const dispatch = async (tipo, evento) => {
    const manejador = listeners.get(tipo);
    assert.ok(manejador, `el worker no registro un listener de ${tipo}`);
    const pendientes = [];
    const envuelto = { ...evento, waitUntil: p => pendientes.push(p) };
    manejador(envuelto);
    await Promise.allSettled(pendientes);
    return envuelto;
  };

  return { listeners, notificaciones, ventanasAbiertas, suscripciones, dispatch, self };
}

/** Evento `push` con un cuerpo JSON. */
const eventoPush = (objeto) => ({
  data: {
    json: () => {
      if (objeto === '__ILEGIBLE__') throw new SyntaxError('JSON invalido');
      return objeto;
    },
    text: () => 'TEXTO_CRUDO_DEL_SERVIDOR'
  }
});

const ventana = (url, { conFoco = true } = {}) => {
  const registro = { url, mensajes: [], enfocada: false };
  registro.postMessage = (m) => registro.mensajes.push(m);
  if (conFoco) registro.focus = async () => { registro.enfocada = true; };
  return registro;
};

// --------------------------------------------------------------------------
// Generacion de cache
// --------------------------------------------------------------------------

test('la generacion de cache subio exactamente una vez, a v13', () => {
  const fuente = fs.readFileSync(swPath, 'utf8');
  const nombres = fuente.match(/const CACHE_NAME = '([^']+)'/g) || [];
  assert.equal(nombres.length, 1, 'solo puede declararse un CACHE_NAME');
  assert.match(fuente, /const CACHE_NAME = '58express-pwa-v13-push';/);
});

// --------------------------------------------------------------------------
// Payload: estructura cerrada
// --------------------------------------------------------------------------

test('un payload valido muestra el texto fijo del worker', async () => {
  const sw = cargarWorker();
  await sw.dispatch('push', eventoPush({ v: 1, t: 'ride_request', tripId: 'trp_123' }));

  assert.equal(sw.notificaciones.length, 1);
  const { title, options } = sw.notificaciones[0];
  assert.equal(title, 'Nueva solicitud de viaje');
  assert.equal(options.body, 'Tienes una nueva solicitud disponible.');
});

test('un payload ilegible no muestra ninguna notificacion', async () => {
  const sw = cargarWorker();
  await sw.dispatch('push', eventoPush('__ILEGIBLE__'));
  assert.equal(sw.notificaciones.length, 0);
});

test('sin datos no se muestra nada', async () => {
  const sw = cargarWorker();
  await sw.dispatch('push', { data: null });
  assert.equal(sw.notificaciones.length, 0);
});

test('una version desconocida no se muestra', async () => {
  const sw = cargarWorker();
  for (const v of [0, 2, '1', null, undefined]) {
    await sw.dispatch('push', eventoPush({ v, t: 'ride_request', tripId: 'trp_1' }));
  }
  assert.equal(sw.notificaciones.length, 0);
});

test('un tipo desconocido no se muestra, y tampoco uno de la cadena de prototipos', async () => {
  const sw = cargarWorker();
  // 'constructor' y '__proto__' encuentran algo si se consulta con el operador
  // de indice en vez de hasOwnProperty: pasarian por tipo valido.
  for (const t of ['ride_offer', 'promo', '', null, 42, 'constructor', '__proto__', 'toString']) {
    await sw.dispatch('push', eventoPush({ v: 1, t, tripId: 'trp_1' }));
  }
  assert.equal(sw.notificaciones.length, 0);
});

test('el titulo y el cuerpo que mande el servidor se IGNORAN', async () => {
  const sw = cargarWorker();
  await sw.dispatch('push', eventoPush({
    v: 1,
    t: 'ride_request',
    tripId: 'trp_9',
    title: 'TITULO INYECTADO POR EL SERVIDOR',
    body: 'CUERPO INYECTADO POR EL SERVIDOR',
    icon: 'https://malicioso.test/icono.png',
    badge: 'https://malicioso.test/badge.png'
  }));

  const { title, options } = sw.notificaciones[0];
  assert.equal(title, 'Nueva solicitud de viaje');
  assert.equal(options.body, 'Tienes una nueva solicitud disponible.');
  assert.equal(options.icon, '/notification-icon-brand-192.png');
  assert.equal(options.badge, '/notification-badge-brand-96.png');
});

test('ningun dato privado del viaje puede llegar a la notificacion', async () => {
  const sw = cargarWorker();
  const privados = {
    passengerName: 'Nombre Apellido',
    passengerPhone: '+58 414-1234567',
    pickupAddress: 'Calle 72 con Avenida 15, Maracaibo',
    destinationAddress: 'Centro Sambil',
    fareUSD: 4.5,
    paymentMethod: 'PAGO_MOVIL',
    chat: 'mensaje privado'
  };
  // Los datos privados se mandan tambien COMO titulo y cuerpo, que es el
  // vector realista: un backend equivocado que rellene esos campos con la
  // direccion de recogida.
  await sw.dispatch('push', eventoPush({
    v: 1,
    t: 'ride_request',
    tripId: 'trp_7',
    ...privados,
    title: privados.pickupAddress,
    body: `${privados.passengerName} · ${privados.passengerPhone}`
  }));

  const texto = JSON.stringify(sw.notificaciones[0]);
  for (const valor of Object.values(privados)) {
    assert.ok(!texto.includes(String(valor)), `la notificacion filtra: ${valor}`);
  }
  // Y el `data` de enrutado lleva solo tres campos.
  assert.deepEqual(Object.keys(sw.notificaciones[0].options.data).sort(), ['t', 'tripId', 'v']);
});

test('la etiqueta agrupa por viaje y no expone contenido privado', async () => {
  const sw = cargarWorker();
  await sw.dispatch('push', eventoPush({ v: 1, t: 'ride_request', tripId: 'trp_555' }));
  assert.equal(sw.notificaciones[0].options.tag, 'ride-request:trp_555');
  assert.equal(sw.notificaciones[0].options.renotify, true);

  // Sin tripId sigue habiendo etiqueta estable: dos avisos no se apilan.
  const sw2 = cargarWorker();
  await sw2.dispatch('push', eventoPush({ v: 1, t: 'ride_request' }));
  assert.equal(sw2.notificaciones[0].options.tag, 'ride-request');
});

test('ya no se declaran acciones que el worker no atiende', async () => {
  const sw = cargarWorker();
  await sw.dispatch('push', eventoPush({ v: 1, t: 'ride_request', tripId: 'trp_1' }));
  // Declaraba «ACEPTAR CARRERA» y notificationclick ni leia event.action:
  // prometia aceptar el viaje desde la pantalla de bloqueo, y no lo hacia.
  assert.equal(sw.notificaciones[0].options.actions, undefined);
  const fuente = fs.readFileSync(swPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');
  assert.ok(!/\bactions\s*:/.test(fuente), 'no puede quedar ninguna accion declarada');
  assert.ok(!/data\.text\(\)/.test(fuente), 'no puede quedar texto crudo del servidor');
});

// --------------------------------------------------------------------------
// notificationclick
// --------------------------------------------------------------------------

function eventoClick(tripId = 'trp_1') {
  const notificacion = { data: { v: 1, t: 'ride_request', tripId }, cerrada: false };
  notificacion.close = () => { notificacion.cerrada = true; };
  return { notification: notificacion };
}

test('al tocar la notificacion se cierra', async () => {
  const sw = cargarWorker({ ventanas: [] });
  const evento = eventoClick();
  await sw.dispatch('notificationclick', evento);
  assert.equal(evento.notification.cerrada, true);
});

test('una ventana abierta en la raiz se ENFOCA en vez de abrir otra', async () => {
  // Este era el fallo: solo se enfocaba una ventana cuya URL contuviera
  // #/driver, asi que con la aplicacion abierta en la pantalla de inicio se
  // abria una segunda ventana del PWA teniendo una delante.
  const inicio = ventana(`${ORIGIN}/#/`);
  const sw = cargarWorker({ ventanas: [inicio] });
  await sw.dispatch('notificationclick', eventoClick('trp_42'));

  assert.equal(inicio.enfocada, true, 'debia enfocarse la ventana existente');
  assert.equal(sw.ventanasAbiertas.length, 0, 'no puede abrirse una segunda ventana');
});

test('una ventana ya en la pantalla del conductor tambien se enfoca', async () => {
  const conductor = ventana(`${ORIGIN}/#/driver`);
  const sw = cargarWorker({ ventanas: [conductor] });
  await sw.dispatch('notificationclick', eventoClick('trp_7'));
  assert.equal(conductor.enfocada, true);
  assert.equal(sw.ventanasAbiertas.length, 0);
});

test('una ventana de otro origen no cuenta como propia', async () => {
  const ajena = ventana('https://otro-sitio.test/#/driver');
  const sw = cargarWorker({ ventanas: [ajena] });
  await sw.dispatch('notificationclick', eventoClick());
  assert.equal(ajena.enfocada, false);
  assert.deepEqual(sw.ventanasAbiertas, ['/#/driver'], 'debia abrirse una ventana propia');
});

test('sin ninguna ventana abierta se abre la del conductor', async () => {
  const sw = cargarWorker({ ventanas: [] });
  await sw.dispatch('notificationclick', eventoClick());
  assert.deepEqual(sw.ventanasAbiertas, ['/#/driver']);
});

test('el mensaje de navegacion lleva solo los campos de enrutado aprobados', async () => {
  const inicio = ventana(`${ORIGIN}/#/`);
  const sw = cargarWorker({ ventanas: [inicio] });
  await sw.dispatch('notificationclick', eventoClick('trp_314'));

  assert.equal(inicio.mensajes.length, 1);
  const mensaje = inicio.mensajes[0];
  assert.deepEqual(Object.keys(mensaje).sort(), ['target', 'tripId', 'type']);
  assert.equal(mensaje.type, 'push:navigate');
  assert.equal(mensaje.target, 'driver_ride_request');
  assert.equal(mensaje.tripId, 'trp_314');
});

test('el toque NO acepta el viaje: solo pide navegar', async () => {
  const inicio = ventana(`${ORIGIN}/#/`);
  const sw = cargarWorker({ ventanas: [inicio] });
  await sw.dispatch('notificationclick', eventoClick('trp_1'));

  const mensaje = JSON.stringify(inicio.mensajes[0]).toLowerCase();
  for (const prohibido of ['accept', 'aceptar', 'rideaccepted', 'token', 'authorization']) {
    assert.ok(!mensaje.includes(prohibido), `el mensaje sugiere aceptar el viaje: ${prohibido}`);
  }
  // Y el worker no habla con el backend en ningun momento.
  const fuente = fs.readFileSync(swPath, 'utf8');
  const bloquePush = fuente.slice(fuente.indexOf('addEventListener(\'notificationclick\''));
  assert.ok(!/fetch\(/.test(bloquePush), 'notificationclick no puede llamar al backend');
});

// --------------------------------------------------------------------------
// pushsubscriptionchange
// --------------------------------------------------------------------------

test('al rotar el endpoint se resuscribe y se avisa a la aplicacion', async () => {
  const abierta = ventana(`${ORIGIN}/#/driver`);
  const sw = cargarWorker({ ventanas: [abierta] });

  await sw.dispatch('pushsubscriptionchange', {
    oldSubscription: { options: { applicationServerKey: new Uint8Array([1, 2, 3]) } }
  });

  assert.equal(sw.suscripciones.length, 1, 'debia resuscribirse en el navegador');
  assert.equal(sw.suscripciones[0].userVisibleOnly, true);
  assert.equal(abierta.mensajes.length, 1);
  assert.equal(abierta.mensajes[0].type, 'push:resubscribe-required');
  assert.equal(abierta.mensajes[0].resubscribed, true);
});

test('si la resuscripcion falla igualmente se avisa, sin romper nada', async () => {
  const abierta = ventana(`${ORIGIN}/#/driver`);
  const sw = cargarWorker({ ventanas: [abierta], subscribeFalla: true });

  await sw.dispatch('pushsubscriptionchange', {
    oldSubscription: { options: { applicationServerKey: new Uint8Array([1]) } }
  });

  assert.equal(abierta.mensajes[0].type, 'push:resubscribe-required');
  assert.equal(abierta.mensajes[0].resubscribed, false);
});

test('sin clave anterior no se inventa una suscripcion', async () => {
  const abierta = ventana(`${ORIGIN}/#/driver`);
  const sw = cargarWorker({ ventanas: [abierta] });
  await sw.dispatch('pushsubscriptionchange', {});
  assert.equal(sw.suscripciones.length, 0);
  assert.equal(abierta.mensajes[0].resubscribed, false);
});

test('el worker NO guarda credenciales ni envia altas sin autenticar', () => {
  const fuente = fs.readFileSync(swPath, 'utf8');

  // Un service worker no tiene sesion. Mandar un alta desde aqui seria un
  // endpoint anonimo capaz de escribir en la base de datos.
  assert.ok(!/push\/subscriptions/.test(fuente),
    'el worker no puede registrar suscripciones en el backend');

  // Nada de almacenar ni construir credenciales.
  for (const prohibido of ['Bearer', 'localStorage', 'indexedDB', '58express_session', 'getAuthHeaders']) {
    assert.ok(!fuente.includes(prohibido), `el worker no puede manejar credenciales: ${prohibido}`);
  }

  // `Authorization` SI aparece, y debe seguir apareciendo: `isCacheable` la usa
  // para EXCLUIR de la cache cualquier peticion autenticada. Lo que se exige es
  // que solo se use para consultarla, nunca para escribirla en una peticion
  // saliente.
  const usos = fuente.match(/[^\n]*Authorization[^\n]*/g) || [];
  assert.equal(usos.length, 1, 'Authorization solo debe aparecer en la exclusion de cache');
  assert.match(usos[0], /headers\.has\('Authorization'\)/);

  // Y el bloque de push no hace ninguna peticion de red.
  const bloquePush = fuente.slice(fuente.indexOf('const PUSH_PAYLOAD_VERSION'));
  assert.ok(!/fetch\(/.test(bloquePush), 'el bloque de push no puede hacer peticiones');
});
