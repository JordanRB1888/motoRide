import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installPushMessageHandler,
  parsePushMessage,
  PUSH_NAVIGATE_EVENT
} from '../src/services/pushClientMessages.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Los saltos de linea se normalizan al leer. Este fichero recorta el fuente
// con indexOf sobre patrones que llevan un salto UNIX, y el repositorio usa
// core.autocrlf=true: en un checkout limpio de Windows el fichero llega con
// CRLF, la busqueda falla y la porcion sale vacia. El test se ponia rojo por
// el final de linea, no por el producto.
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8')
  .split('\r\n').join('\n');

/**
 * Puente service worker -> aplicacion, y experiencia de permiso del conductor.
 *
 * La regla de producto que se protege aqui: push es una MEJORA. Un conductor
 * debe poder ponerse en linea aunque su navegador no admita notificaciones,
 * aunque las haya rechazado y aunque el servidor las tenga apagadas.
 */

// --------------------------------------------------------------------------
// El mensaje se trata como DATO, no como orden
// --------------------------------------------------------------------------

test('solo se aceptan las dos formas conocidas de mensaje', () => {
  assert.deepEqual(
    parsePushMessage({ type: 'push:navigate', target: 'driver_ride_request', tripId: 'trp_1' }),
    { kind: 'navigate', target: 'driver_ride_request', tripId: 'trp_1' }
  );
  assert.deepEqual(
    parsePushMessage({ type: 'push:resubscribe-required', resubscribed: true }),
    { kind: 'resubscribe', resubscribed: true }
  );
});

test('cualquier otro mensaje se descarta sin ejecutar nada', () => {
  const rechazados = [
    null, undefined, 'texto', 42, [],
    {},
    { type: 'push:navigate' },                                    // sin target
    { type: 'push:navigate', target: 'admin_panel' },             // destino ajeno
    { type: 'push:navigate', target: 'driver_ride_request', tripId: 42 },
    { type: 'eval', code: 'process.exit(1)' },
    { type: 'push:unknown' },
    { target: 'driver_ride_request' }                             // sin type
  ];
  for (const entrada of rechazados) {
    const salida = parsePushMessage(entrada);
    if (entrada && entrada.type === 'push:navigate' && entrada.target === 'driver_ride_request') {
      // tripId invalido se normaliza a null, no invalida el mensaje
      assert.equal(salida.tripId, null);
    } else {
      assert.equal(salida, null, `deberia rechazarse: ${JSON.stringify(entrada)}`);
    }
  }
});

// --------------------------------------------------------------------------
// Instalacion del puente
// --------------------------------------------------------------------------

function montarPuente({ usuario = { role: 'driver', id: 'd1' }, hash = '#/', servicioPush = null } = {}) {
  const eventos = [];
  const oyentes = new Map();
  const windowRef = {
    location: { hash },
    dispatchEvent: (evento) => { eventos.push(evento); return true; }
  };
  const navigatorRef = {
    serviceWorker: {
      addEventListener: (tipo, manejador) => oyentes.set(tipo, manejador),
      removeEventListener: (tipo) => oyentes.delete(tipo)
    }
  };
  const quitar = installPushMessageHandler({
    navigatorRef,
    windowRef,
    getCurrentUser: () => usuario,
    getPushService: servicioPush ? () => Promise.resolve(servicioPush) : null
  });
  const emitir = (data) => oyentes.get('message')?.({ data });
  return { windowRef, eventos, emitir, quitar, oyentes };
}

test('un aviso tocado con sesion de conductor navega y avisa a la pantalla', () => {
  const puente = montarPuente({ hash: '#/' });
  puente.emitir({ type: 'push:navigate', target: 'driver_ride_request', tripId: 'trp_9' });

  assert.equal(puente.windowRef.location.hash, '#/driver');
  assert.equal(puente.eventos.length, 1);
  assert.equal(puente.eventos[0].type, PUSH_NAVIGATE_EVENT);
  assert.equal(puente.eventos[0].detail.tripId, 'trp_9');
});

test('ya en la pantalla del conductor no se renavega, solo se avisa', () => {
  const puente = montarPuente({ hash: '#/driver' });
  puente.emitir({ type: 'push:navigate', target: 'driver_ride_request', tripId: 'trp_2' });
  assert.equal(puente.windowRef.location.hash, '#/driver');
  assert.equal(puente.eventos.length, 1);
});

test('sin sesion se va al inicio y NO se filtra el viaje', () => {
  // El aviso puede tocarse dias despues, con el token de siete dias caducado.
  const puente = montarPuente({ usuario: null });
  puente.emitir({ type: 'push:navigate', target: 'driver_ride_request', tripId: 'trp_secreto' });

  assert.equal(puente.windowRef.location.hash, '#/');
  assert.equal(puente.eventos.length, 0, 'no se emite el destino sin sesion');
});

test('una sesion de otro rol tampoco entra en la pantalla del conductor', () => {
  const puente = montarPuente({ usuario: { role: 'passenger', id: 'p1' } });
  puente.emitir({ type: 'push:navigate', target: 'driver_ride_request', tripId: 'trp_1' });
  assert.equal(puente.windowRef.location.hash, '#/');
  assert.equal(puente.eventos.length, 0);
});

test('un mensaje no reconocido no navega ni emite nada', () => {
  const puente = montarPuente({ hash: '#/' });
  puente.emitir({ type: 'eval', code: 'malicioso' });
  puente.emitir({ type: 'push:navigate', target: 'admin_panel' });
  puente.emitir('texto suelto');

  assert.equal(puente.windowRef.location.hash, '#/');
  assert.equal(puente.eventos.length, 0);
});

test('la rotacion de endpoint dispara la reconciliacion, no una navegacion', async () => {
  let reconciliaciones = 0;
  const puente = montarPuente({
    hash: '#/driver',
    servicioPush: { reconcile: async () => { reconciliaciones += 1; return { result: 'OK' }; } }
  });

  puente.emitir({ type: 'push:resubscribe-required', resubscribed: true });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(reconciliaciones, 1);
  assert.equal(puente.eventos.length, 0, 'resuscribir no navega');
});

test('sin service worker el puente no rompe nada', () => {
  const quitar = installPushMessageHandler({ navigatorRef: {}, windowRef: {} });
  assert.equal(typeof quitar, 'function');
  quitar();
});

// --------------------------------------------------------------------------
// La pantalla del conductor
// --------------------------------------------------------------------------

const driverApp = leer('src/pages/driver/driverApp.js');

test('el permiso solo puede pedirse desde un gesto explicito', () => {
  // `requestPermission: true` viaja unicamente dentro del manejador del boton
  // de la tarjeta contextual.
  const usos = driverApp.match(/requestPermission:\s*true/g) || [];
  assert.equal(usos.length, 1, 'solo un punto puede pedir permiso');

  const bloque = driverApp.slice(
    driverApp.indexOf("driver-push-allow').addEventListener"),
    driverApp.indexOf('requestPermission: true') + 40
  );
  assert.ok(bloque.length > 0 && bloque.includes('requestPermission: true'),
    'la peticion de permiso debe colgar del boton de la tarjeta');
});

test('no se pide permiso al arrancar la pantalla', () => {
  // La cadena completa se comprueba eslabon a eslabon, porque lo que importa
  // no es que exista una llamada sino DESDE DONDE puede dispararse:
  //
  //   gesto en el FAB -> ofrecerNotificacionesSiProcede()
  //                   -> mostrarTarjetaPermisoPush()
  //                   -> boton de la tarjeta -> requestPermission
  //
  // Si algun eslabon pudiera invocarse fuera de esa cadena, el dialogo del
  // navegador saldria sin gesto y se gastaria el unico intento que da Chrome.
  const lineas = driverApp.split('\n');
  const numeroDe = (patron) => lineas
    .map((linea, i) => ({ linea, n: i + 1 }))
    .filter(({ linea }) => patron.test(linea))
    .map(({ n }) => n);

  const defineOfrecer = numeroDe(/async function ofrecerNotificacionesSiProcede/);
  const llamaOfrecer = numeroDe(/(?<!function )ofrecerNotificacionesSiProcede\(\)/);
  const defineTarjeta = numeroDe(/function mostrarTarjetaPermisoPush/);
  const llamaTarjeta = numeroDe(/(?<!function )mostrarTarjetaPermisoPush\(\)/);
  const pidePermiso = numeroDe(/requestPermission:\s*true/);

  assert.equal(defineOfrecer.length, 1);
  assert.equal(defineTarjeta.length, 1);

  // La tarjeta se muestra desde UN solo sitio, y ese sitio esta dentro de
  // `ofrecerNotificacionesSiProcede`.
  assert.equal(llamaTarjeta.length, 1, 'la tarjeta solo puede mostrarse desde un punto');
  assert.ok(llamaTarjeta[0] > defineOfrecer[0],
    'la unica llamada a la tarjeta debe vivir dentro de ofrecerNotificacionesSiProcede');

  // Y `ofrecerNotificacionesSiProcede` se invoca desde UN solo sitio: el
  // manejador del FAB.
  assert.equal(llamaOfrecer.length, 1, 'solo el FAB puede ofrecer notificaciones');
  const lineaFab = numeroDe(/onlineFab\?\.addEventListener/)[0];
  assert.ok(llamaOfrecer[0] > lineaFab,
    'la oferta debe colgar del gesto del FAB, no del arranque');

  // El permiso se pide desde un unico punto, dentro de la tarjeta.
  assert.equal(pidePermiso.length, 1);
  assert.ok(pidePermiso[0] > defineTarjeta[0] && pidePermiso[0] < defineOfrecer[0],
    'el permiso solo puede pedirse desde el boton de la tarjeta');

  // driverApp nunca habla con la API de notificaciones por su cuenta.
  assert.ok(!/Notification\.requestPermission/.test(driverApp),
    'la pantalla no puede llamar al navegador directamente');

  // Lo unico que corre solo al montar la pantalla es la reconciliacion, que
  // por contrato no muestra ningun dialogo.
  const arranqueSuelto = driverApp.slice(
    driverApp.indexOf('getPushSubscriptionService()\n        .then'),
    driverApp.indexOf('realtimeLifecycle.addListener(window, PUSH_NAVIGATE_EVENT')
  );
  assert.match(arranqueSuelto, /servicio\.reconcile\(\)/);
  assert.ok(!/requestPermission/.test(arranqueSuelto), 'el arranque no puede pedir permiso');
  assert.ok(!/mostrarTarjetaPermisoPush/.test(arranqueSuelto), 'el arranque no puede mostrar la tarjeta');
});

test('ponerse en linea NO depende de las notificaciones', () => {
  // `setOnline` se llama primero y sin await: ninguna rama de push puede
  // impedir la disponibilidad ni retrasarla.
  const manejador = driverApp.slice(
    driverApp.indexOf("onlineFab?.addEventListener"),
    driverApp.indexOf("if (driverHeaderBtn)")
  );
  assert.match(manejador, /setOnline\(siguiente\);/);
  assert.ok(!/await\s+ofrecerNotificacionesSiProcede/.test(manejador),
    'la oferta de notificaciones no puede bloquear el FAB');
  const posSetOnline = manejador.indexOf('setOnline(siguiente)');
  const posOferta = manejador.indexOf('ofrecerNotificacionesSiProcede');
  assert.ok(posSetOnline < posOferta, 'la disponibilidad se resuelve antes que push');
});

test('con permiso denegado no se vuelve a insistir', () => {
  const bloque = driverApp.slice(
    driverApp.indexOf('async function ofrecerNotificacionesSiProcede'),
    driverApp.indexOf('// Reconciliacion en primer plano')
  );
  assert.match(bloque, /if \(permiso !== 'default'\) return;/);
  assert.match(bloque, /if \(yaSePregunto\(\)\) return;/);
});

test('sin soporte no se ensena nada y no se rompe la pantalla', () => {
  const bloque = driverApp.slice(
    driverApp.indexOf('async function ofrecerNotificacionesSiProcede'),
    driverApp.indexOf('// Reconciliacion en primer plano')
  );
  assert.match(bloque, /if \(!servicio\.detectSupport\(\)\.supported\) return;/);
  assert.match(bloque, /catch \(error\)/);
});

test('el servidor apagado se responde, y no como un error', () => {
  const bloque = driverApp.slice(
    driverApp.indexOf("driver-push-allow').addEventListener"),
    driverApp.indexOf('async function ofrecerNotificacionesSiProcede')
  );
  assert.match(bloque, /PUSH_RESULT\.PUSH_DISABLED/);

  // Se mira todo lo que sigue a la rama, sin presupuesto de caracteres: un
  // comentario largo no puede hacer que la comprobacion deje de ver la llamada.
  const trasLaRama = bloque.slice(bloque.indexOf('PUSH_RESULT.PUSH_DISABLED'));

  // No es un error, asi que no puede salir un toast de error.
  assert.ok(!/showToast\([^)]*'error'\)/.test(trasLaRama),
    'el servidor apagado no es un fallo de la persona');

  // Pero tampoco puede quedar en silencio: acaba de aceptar en el dialogo del
  // navegador, y sin respuesta parece que el boton no hizo nada.
  assert.match(trasLaRama, /showToast\([^)]*'info'\)/,
    'conceder el permiso debe tener alguna respuesta visible');
});

test('el toque en la notificacion relee el estado autorizado del backend', () => {
  // El payload del push es un timbre, no una fuente de verdad.
  const bloque = driverApp.slice(driverApp.indexOf('PUSH_NAVIGATE_EVENT'));
  assert.match(bloque, /restoreActiveTrip\(\)/);
});

test('el FAB aprobado conserva su estructura', () => {
  assert.match(driverApp, /#driver-online-fab/);
  assert.match(driverApp, /function reflejarDisponibilidad\(online\)/);
  assert.match(driverApp, /driver-online-fab-label/);
  assert.match(driverApp, /onlineFab\.classList\.toggle\('is-online', online\)/);
});

test('la tarjeta de permiso reutiliza el sistema de diseno existente', () => {
  const bloque = driverApp.slice(
    driverApp.indexOf('function mostrarTarjetaPermisoPush'),
    driverApp.indexOf('async function ofrecerNotificacionesSiProcede')
  );
  for (const token of ['var(--surface-card)', 'var(--accent-primary)', 'var(--text-primary)', 'var(--text-secondary)']) {
    assert.ok(bloque.includes(token), `la tarjeta debe usar ${token}`);
  }
  assert.match(bloque, /Activa las notificaciones/);
});

// --------------------------------------------------------------------------
// El puente esta instalado en la aplicacion
// --------------------------------------------------------------------------

test('main.js instala el puente una sola vez y le pasa la sesion', () => {
  const main = leer('src/main.js');
  const usos = main.match(/installPushMessageHandler\(/g) || [];
  assert.equal(usos.length, 1);
  assert.match(main, /getCurrentUser: \(\) => authService\.getCurrentUser\(\)/);
});

// --------------------------------------------------------------------------
// El despacho: PUSH-3A conecta UNA cosa y nada mas
// --------------------------------------------------------------------------

test('PUSH-3A conecta exactamente una llamada semantica sin tocar la ventana ni la elegibilidad', () => {
  // Hasta PUSH-2 aqui se exigia CERO conexiones. PUSH-3A autoriza una unica
  // puerta: `pushService.notifyRideOffer` en offerNext, sin await, como aviso
  // de atencion que acompana a la oferta de socket. Todo lo demas sigue
  // intacto, y esta guarda lo vigila desde el lado del cliente.
  const index = leer('server/index.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');
  const llamadas = index.match(/pushService\.notifyRideOffer\(/g) || [];
  assert.equal(llamadas.length, 1, 'debe existir exactamente UNA invocacion semantica');
  assert.ok(!index.includes('pushService.notifyUser('), 'el despacho no usa el transporte generico');
  assert.ok(!/await\s+pushService\./.test(index), 'el despacho no puede esperar a push');
  assert.ok(index.includes('offerExpiresAt: Date.now() + 15000'), 'la ventana de oferta cambio');
  const eligibility = leer('server/domain/dispatchEligibility.js');
  assert.match(eligibility, /if \(!hasSocket\) return \{ eligible: false, reason: DISPATCH_REJECTION\.NO_SOCKET \};/);
});
