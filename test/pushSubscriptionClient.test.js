import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPushSubscriptionService,
  urlBase64ToUint8Array,
  PUSH_RESULT
} from '../src/services/pushSubscriptionService.js';

/**
 * Contrato del alta de Web Push en el navegador.
 *
 * Todas las APIs del navegador son dobles: ninguna prueba toca la red, ningun
 * proveedor real, ninguna clave VAPID de verdad.
 *
 * Las dos propiedades que mas se protegen aqui:
 *
 *   1. Push es una MEJORA. Ninguna rama --sin soporte, permiso denegado,
 *      servidor apagado, fallo del backend-- puede lanzar hacia la pantalla.
 *   2. El cliente NUNCA envia el propietario. El servidor lo deriva del token.
 */

const CLAVE_PUBLICA_FALSA = 'BFakeVapidPublicKeyParaPruebas0123456789abcdefgh';

/** Fabrica un entorno de navegador completo y programable. */
function montar({
  soporte = { serviceWorker: true, PushManager: true, Notification: true },
  permiso = 'default',
  permisoTrasPedir = 'granted',
  config = { enabled: true, publicKey: CLAVE_PUBLICA_FALSA },
  endpointExistente = null,
  subscribeFalla = false,
  altaDevuelve = { id: 'sub_abc' },
  readyFalla = false
} = {}) {
  const llamadas = { get: [], post: [], delete: [], requestPermission: 0, subscribe: [], unsubscribe: 0 };
  const trazas = [];
  const almacen = new Map();

  const nuevaSuscripcion = (endpoint = 'https://fcm.googleapis.com/fcm/send/nuevo') => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'BClavePrueba', auth: 'YXV0aA' } }),
    unsubscribe: async () => { llamadas.unsubscribe += 1; return true; }
  });

  // La suscripcion previa se construye AQUI, dentro del mismo montaje: si
  // viniera de otro, su contador de bajas incrementaria en el montaje ajeno y
  // la asercion miraria al sitio equivocado.
  const previa = endpointExistente ? nuevaSuscripcion(endpointExistente) : null;

  const pushManager = {
    getSubscription: async () => previa,
    subscribe: async (opciones) => {
      llamadas.subscribe.push(opciones);
      if (subscribeFalla) throw new Error('NotAllowedError');
      return nuevaSuscripcion();
    }
  };

  const navigatorRef = {};
  if (soporte.serviceWorker) {
    navigatorRef.serviceWorker = readyFalla
      ? { get ready() { return Promise.reject(new Error('sin worker')); } }
      : { ready: Promise.resolve({ pushManager }) };
  }

  const windowRef = {};
  if (soporte.PushManager) windowRef.PushManager = function PushManager() {};
  if (soporte.Notification) {
    windowRef.Notification = {
      permission: permiso,
      requestPermission: async () => {
        llamadas.requestPermission += 1;
        windowRef.Notification.permission = permisoTrasPedir;
        return permisoTrasPedir;
      }
    };
  }

  const api = {
    get: async (ruta) => { llamadas.get.push(ruta); return config; },
    post: async (ruta, cuerpo) => { llamadas.post.push({ ruta, cuerpo }); return altaDevuelve; },
    delete: async (ruta) => { llamadas.delete.push(ruta); return true; }
  };

  const storage = {
    getItem: k => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: k => almacen.delete(k)
  };

  const servicio = createPushSubscriptionService({
    api,
    navigatorRef,
    windowRef,
    storage,
    logger: { warn: (m) => trazas.push(String(m)), info: (m) => trazas.push(String(m)) },
    base64ToBytes: (valor) => {
      if (!/^[A-Za-z0-9_-]+=*$/.test(String(valor))) throw new Error('INVALID_PUBLIC_KEY');
      return new Uint8Array([1, 2, 3]);
    }
  });

  return { servicio, llamadas, trazas, almacen, windowRef, nuevaSuscripcion };
}

// --------------------------------------------------------------------------
// Soporte
// --------------------------------------------------------------------------

test('sin service worker se devuelve UNSUPPORTED y no se pide permiso', async () => {
  const { servicio, llamadas } = montar({ soporte: { serviceWorker: false, PushManager: true, Notification: true } });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.UNSUPPORTED);
  assert.deepEqual(r.missing, ['serviceWorker']);
  assert.equal(llamadas.requestPermission, 0, 'no puede aparecer el dialogo si no hay soporte');
});

test('sin PushManager se devuelve UNSUPPORTED', async () => {
  const { servicio, llamadas } = montar({ soporte: { serviceWorker: true, PushManager: false, Notification: true } });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.UNSUPPORTED);
  assert.deepEqual(r.missing, ['PushManager']);
  assert.equal(llamadas.requestPermission, 0);
});

test('sin Notification se devuelve UNSUPPORTED', async () => {
  const { servicio } = montar({ soporte: { serviceWorker: true, PushManager: true, Notification: false } });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.UNSUPPORTED);
  assert.deepEqual(r.missing, ['Notification']);
  assert.equal(servicio.getPermissionState(), 'unsupported');
});

// --------------------------------------------------------------------------
// Permisos
// --------------------------------------------------------------------------

test('con permiso por decidir y sin gesto NO se abre el dialogo', async () => {
  const { servicio, llamadas } = montar({ permiso: 'default' });
  const r = await servicio.subscribe({ requestPermission: false });
  assert.equal(r.result, PUSH_RESULT.PERMISSION_DISMISSED);
  assert.equal(llamadas.requestPermission, 0, 'el dialogo solo puede salir de un gesto explicito');
});

test('con permiso denegado no se vuelve a preguntar nunca', async () => {
  const { servicio, llamadas } = montar({ permiso: 'denied' });
  for (let i = 0; i < 3; i += 1) {
    const r = await servicio.subscribe({ requestPermission: true });
    assert.equal(r.result, PUSH_RESULT.PERMISSION_DENIED);
  }
  assert.equal(llamadas.requestPermission, 0, 'insistir gastaria el unico dialogo que da el navegador');
});

test('si la persona rechaza en el dialogo se devuelve PERMISSION_DENIED', async () => {
  const { servicio, llamadas } = montar({ permiso: 'default', permisoTrasPedir: 'denied' });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.PERMISSION_DENIED);
  assert.equal(llamadas.requestPermission, 1);
  assert.equal(llamadas.subscribe.length, 0);
});

test('si el dialogo se cierra sin decidir no se suscribe', async () => {
  const { servicio, llamadas } = montar({ permiso: 'default', permisoTrasPedir: 'default' });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.PERMISSION_DISMISSED);
  assert.equal(llamadas.subscribe.length, 0);
});

// --------------------------------------------------------------------------
// Configuracion del servidor
// --------------------------------------------------------------------------

test('con push apagado en el servidor NO se llama a PushManager.subscribe', async () => {
  // Es exactamente el estado de produccion hasta la activacion controlada.
  const { servicio, llamadas } = montar({ permiso: 'granted', config: { enabled: false, publicKey: null } });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.PUSH_DISABLED);
  assert.equal(llamadas.subscribe.length, 0);
  assert.deepEqual(llamadas.get, ['/push/public-key']);
});

test('habilitado pero sin clave publica se trata como configuracion invalida', async () => {
  const { servicio, llamadas } = montar({ permiso: 'granted', config: { enabled: true, publicKey: null } });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.INVALID_PUBLIC_KEY);
  assert.equal(llamadas.subscribe.length, 0);
});

test('una clave publica malformada no llega al navegador', async () => {
  const { servicio, llamadas } = montar({ permiso: 'granted', config: { enabled: true, publicKey: 'no es base64url !!' } });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.INVALID_PUBLIC_KEY);
  assert.equal(llamadas.subscribe.length, 0);
});

test('si la consulta de configuracion falla se degrada a apagado', async () => {
  const { servicio } = montar({ permiso: 'granted' });
  const roto = createPushSubscriptionService({
    api: { get: async () => { throw new Error('RED'); }, post: async () => null, delete: async () => null },
    navigatorRef: { serviceWorker: { ready: Promise.resolve({ pushManager: {} }) } },
    windowRef: { PushManager: function () {}, Notification: { permission: 'granted', requestPermission: async () => 'granted' } },
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  });
  const r = await roto.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.PUSH_DISABLED, 'un fallo de red no puede lanzar');
  assert.ok(servicio);
});

// --------------------------------------------------------------------------
// Alta
// --------------------------------------------------------------------------

test('alta correcta: se suscribe y se registra en el backend', async () => {
  const { servicio, llamadas } = montar({ permiso: 'granted' });
  const r = await servicio.subscribe({ requestPermission: true });

  assert.equal(r.result, PUSH_RESULT.SUBSCRIBED);
  assert.equal(r.subscriptionId, 'sub_abc');
  assert.equal(llamadas.subscribe.length, 1);
  assert.equal(llamadas.subscribe[0].userVisibleOnly, true);
  assert.equal(llamadas.post.length, 1);
  assert.equal(llamadas.post[0].ruta, '/push/subscriptions');
});

test('una suscripcion que ya tiene el navegador se REUTILIZA', async () => {
  // Crear otra a ciegas rotaria el endpoint y dejaria una fila muerta en el
  // servidor hasta que un 410 la retire.
  const { servicio, llamadas } = montar({
    permiso: 'granted',
    endpointExistente: 'https://fcm.googleapis.com/fcm/send/previo'
  });

  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.ALREADY_SUBSCRIBED);
  assert.equal(llamadas.subscribe.length, 0, 'no debia crear una suscripcion nueva');
  assert.equal(llamadas.post[0].cuerpo.endpoint, 'https://fcm.googleapis.com/fcm/send/previo');
});

test('si PushManager.subscribe falla se devuelve un resultado, no una excepcion', async () => {
  const { servicio, trazas } = montar({ permiso: 'granted', subscribeFalla: true });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.SUBSCRIBE_FAILED);
  // El mensaje del error puede arrastrar el endpoint completo: no se registra.
  assert.ok(!trazas.join(' ').includes('googleapis'));
});

test('si el backend rechaza el alta se deshace la suscripcion del navegador', async () => {
  const { servicio, llamadas } = montar({ permiso: 'granted', altaDevuelve: null });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.REGISTRATION_FAILED);
  assert.equal(llamadas.unsubscribe, 1, 'no puede quedar un endpoint vivo que nadie conoce');
});

test('sin service worker listo no se rompe', async () => {
  const { servicio } = montar({ permiso: 'granted', readyFalla: true });
  const r = await servicio.subscribe({ requestPermission: true });
  assert.equal(r.result, PUSH_RESULT.UNSUPPORTED);
});

// --------------------------------------------------------------------------
// LA REGLA CENTRAL: el cliente no decide el propietario
// --------------------------------------------------------------------------

test('el alta envia SOLO endpoint y keys: ni userId, ni rol, ni dispositivo', async () => {
  const { servicio, llamadas } = montar({ permiso: 'granted' });
  await servicio.subscribe({ requestPermission: true });

  const cuerpo = llamadas.post[0].cuerpo;
  assert.deepEqual(Object.keys(cuerpo).sort(), ['endpoint', 'keys']);
  assert.deepEqual(Object.keys(cuerpo.keys).sort(), ['auth', 'p256dh']);

  const texto = JSON.stringify(cuerpo).toLowerCase();
  for (const prohibido of ['userid', 'role', 'useragent', 'user-agent', 'device', 'platform', 'ip']) {
    assert.ok(!texto.includes(prohibido), `el cuerpo incluye ${prohibido}`);
  }
});

// --------------------------------------------------------------------------
// Almacenamiento local
// --------------------------------------------------------------------------

test('solo se guarda el identificador opaco, nunca el endpoint ni las claves', async () => {
  const { servicio, almacen } = montar({ permiso: 'granted' });
  await servicio.subscribe({ requestPermission: true });

  const guardado = JSON.stringify([...almacen.entries()]);
  assert.ok(guardado.includes('sub_abc'), 'el identificador opaco si se guarda');
  for (const prohibido of ['googleapis', 'endpoint', 'p256dh', 'auth', 'BClavePrueba']) {
    assert.ok(!guardado.includes(prohibido), `el almacenamiento local filtra ${prohibido}`);
  }
  assert.equal(servicio.getStoredSubscriptionId(), 'sub_abc');
});

test('sin almacenamiento disponible el alta sigue funcionando', async () => {
  const servicio = createPushSubscriptionService({
    api: {
      get: async () => ({ enabled: true, publicKey: CLAVE_PUBLICA_FALSA }),
      post: async () => ({ id: 'sub_x' }),
      delete: async () => true
    },
    navigatorRef: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => null,
            subscribe: async () => ({ toJSON: () => ({ endpoint: 'https://p.test/a', keys: { p256dh: 'B', auth: 'A' } }) })
          }
        })
      }
    },
    windowRef: { PushManager: function () {}, Notification: { permission: 'granted' } },
    storage: { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } },
    base64ToBytes: () => new Uint8Array([1])
  });
  const r = await servicio.subscribe({ requestPermission: false });
  assert.equal(r.result, PUSH_RESULT.SUBSCRIBED);
});

// --------------------------------------------------------------------------
// Reconciliacion en primer plano
// --------------------------------------------------------------------------

test('la reconciliacion vuelve a registrar la suscripcion existente sin pedir permiso', async () => {
  const { servicio, llamadas } = montar({
    permiso: 'granted',
    endpointExistente: 'https://fcm.googleapis.com/fcm/send/rotado'
  });

  const r = await servicio.reconcile();
  assert.equal(r.result, PUSH_RESULT.ALREADY_SUBSCRIBED);
  assert.equal(llamadas.requestPermission, 0, 'la reconciliacion nunca muestra dialogos');
  assert.equal(llamadas.post[0].cuerpo.endpoint, 'https://fcm.googleapis.com/fcm/send/rotado');
});

test('sin permiso concedido la reconciliacion no hace nada', async () => {
  for (const permiso of ['default', 'denied']) {
    const { servicio, llamadas } = montar({ permiso });
    const r = await servicio.reconcile();
    assert.equal(r.result, PUSH_RESULT.NOTHING_TO_DO);
    assert.equal(llamadas.requestPermission, 0);
    assert.equal(llamadas.post.length, 0);
  }
});

test('sin suscripcion previa la reconciliacion no crea ninguna', async () => {
  const { servicio, llamadas } = montar({ permiso: 'granted', endpointExistente: null });
  const r = await servicio.reconcile();
  assert.equal(r.result, PUSH_RESULT.NOTHING_TO_DO);
  assert.equal(llamadas.subscribe.length, 0);
});

test('la reconciliacion es idempotente: repetirla no duplica nada', async () => {
  const { servicio, llamadas } = montar({
    permiso: 'granted',
    endpointExistente: 'https://fcm.googleapis.com/fcm/send/estable'
  });

  await servicio.reconcile();
  await servicio.reconcile();
  await servicio.reconcile();

  assert.equal(llamadas.subscribe.length, 0);
  // El alta es idempotente por endpoint en el servidor: son tres altas del
  // mismo endpoint, no tres suscripciones.
  assert.equal(new Set(llamadas.post.map(p => p.cuerpo.endpoint)).size, 1);
});

// --------------------------------------------------------------------------
// Baja
// --------------------------------------------------------------------------

test('la baja retira el registro del servidor y la suscripcion del navegador', async () => {
  const { servicio, llamadas, almacen } = montar({
    permiso: 'granted',
    endpointExistente: 'https://fcm.googleapis.com/fcm/send/a-borrar'
  });

  await servicio.subscribe({ requestPermission: false });   // deja el id guardado
  const r = await servicio.unsubscribe();

  assert.equal(r.result, PUSH_RESULT.UNSUBSCRIBED);
  assert.equal(llamadas.delete[0], '/push/subscriptions/sub_abc');
  assert.equal(llamadas.unsubscribe, 1);
  assert.equal(almacen.size, 0, 'el identificador local se limpia');
});

test('si el backend falla, la baja del navegador ocurre igualmente', async () => {
  // Un fallo del servidor no puede dejar a nadie atrapado con una suscripcion
  // viva que no sabe quitarse.
  let bajas = 0;
  const servicio = createPushSubscriptionService({
    api: {
      get: async () => ({ enabled: true, publicKey: CLAVE_PUBLICA_FALSA }),
      post: async () => ({ id: 'sub_z' }),
      delete: async () => { throw new Error('SERVIDOR_CAIDO'); }
    },
    navigatorRef: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => ({
              endpoint: 'https://fcm.googleapis.com/fcm/send/caido',
              toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/caido', keys: { p256dh: 'B', auth: 'A' } }),
              unsubscribe: async () => { bajas += 1; return true; }
            }),
            subscribe: async () => { throw new Error('no deberia suscribir'); }
          }
        })
      }
    },
    windowRef: { PushManager: function () {}, Notification: { permission: 'granted' } },
    storage: (() => { const m = new Map([['58express_push_subscription_id', 'sub_z']]); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; })(),
    base64ToBytes: () => new Uint8Array([1])
  });

  const r = await servicio.unsubscribe();
  assert.equal(r.result, PUSH_RESULT.UNSUBSCRIBED);
  assert.equal(bajas, 1, 'el navegador debe quedar sin suscripcion pase lo que pase');
});

test('la baja sin soporte no lanza', async () => {
  const { servicio } = montar({ soporte: { serviceWorker: false, PushManager: false, Notification: false } });
  const r = await servicio.unsubscribe();
  assert.equal(r.result, PUSH_RESULT.UNSUPPORTED);
});

// --------------------------------------------------------------------------
// Conversion de la clave
// --------------------------------------------------------------------------

test('la conversion de la clave publica rechaza material invalido', () => {
  for (const malo of ['', '   ', null, undefined, 42, {}, 'con espacios', 'con+mas/y', '!!!']) {
    assert.throws(() => urlBase64ToUint8Array(malo), /INVALID_PUBLIC_KEY/, String(malo));
  }
});

test('la conversion produce los bytes correctos para base64url valido', () => {
  // 'AQID' en base64 son los bytes 1, 2, 3.
  assert.deepEqual([...urlBase64ToUint8Array('AQID')], [1, 2, 3]);
  // base64url usa - y _ donde base64 usa + y /, y el relleno se completa.
  assert.equal(urlBase64ToUint8Array('_-8').length, 2);
});

// --------------------------------------------------------------------------
// El fuente no puede contener claves
// --------------------------------------------------------------------------

test('ninguna clave VAPID esta codificada en el fuente del cliente', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fuente = fs.readFileSync(path.join(raiz, 'src/services/pushSubscriptionService.js'), 'utf8');

  assert.ok(!/PRIVATE_KEY/.test(fuente), 'ninguna nocion de clave privada puede vivir en el navegador');
  assert.ok(/api\.get\('\/push\/public-key'\)/.test(fuente), 'la clave publica debe pedirse al backend');
  // Una clave VAPID real son 87-88 caracteres base64url empezando por B.
  assert.ok(!/['"`]B[A-Za-z0-9_-]{80,}['"`]/.test(fuente), 'no puede haber una clave publica codificada');
});
