import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

/**
 * LA VENTANA DE ACEPTACIÓN DEL CONDUCTOR
 *
 * DE DÓNDE SALE
 *
 * De medir el despacho en dos emuladores: la oferta duraba quince segundos, que
 * alcanzan si el conductor está mirando la pantalla y no alcanzan para lo que
 * pasa de verdad —teléfono bloqueado en el bolsillo, llega el push, sacarlo,
 * desbloquear, abrir, leer recogida y destino, mirar la tarifa y decidir—.
 *
 * LA VENTANA ES CONFIGURABLE, Y ESTAS PRUEBAS LO APROVECHAN
 *
 * Se levanta el servidor con `DRIVER_OFFER_TIMEOUT_MS` en el mínimo admitido
 * para que las pruebas duren segundos y no medio minuto. Que funcionen así ES
 * parte de lo que se comprueba: si la variable dejara de leerse, estas pruebas
 * tardarían el valor por omisión y el temporizador de `node:test` las cortaría.
 *
 * LO QUE SE PROTEGE
 *
 *   1. Aceptar al principio y aceptar casi al final funcionan igual.
 *   2. Rechazar NO consume el resto de la ventana: el siguiente candidato
 *      recibe su oferta de inmediato. Es la diferencia entre encontrar moto en
 *      cinco segundos o en treinta y cinco.
 *   3. Una oferta vencida no se puede aceptar. Con la ventana en treinta
 *      segundos y un push que puede llegar tarde, esto deja de ser teórico.
 *   4. Dos conductores no pueden quedarse con el mismo viaje.
 *   5. La autoridad del tiempo es del servidor: el vencimiento viaja en el
 *      propio evento y no se reinicia al reconectar.
 */

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** El mínimo que admite la configuración. Las pruebas van a ese ritmo. */
const VENTANA_MS = 5_000;

/**
 * Los nombres que significan «asignado».
 *
 * El servidor emite a los clientes el ALIAS del estado --`EN_ROUTE`-- que
 * `TRIP_STATUS_ALIASES` normaliza a `DRIVER_ASSIGNED`. Comprobar solo el
 * nombre canonico haria fallar la prueba con el codigo correcto.
 */
const ASIGNADO = ['DRIVER_ASSIGNED', 'EN_ROUTE', 'ACCEPTED', 'DRIVER_ARRIVING'];

function assertAsignado(estado, contexto) {
  assert.ok(
    ASIGNADO.includes(estado),
    `${contexto}: se esperaba un estado de asignacion y llego ${estado}`
  );
}

function once(socket, event, predicate = () => true, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No llegó ${event}`)), timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/** Levanta un servidor propio con la ventana en el mínimo, y sus ayudas. */
async function servidorDePrueba(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58-ventana-oferta-'));
  const port = 22000 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.sqlite'),
      JWT_SECRET: 'ventana-de-oferta-secret-with-safe-length',
      ADMIN_PASSWORD: 'ventana-admin-password',
      DRIVER_OFFER_TIMEOUT_MS: String(VENTANA_MS)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());

  let startup = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Servidor no inició: ${startup}`)), 15_000);
    child.stdout.on('data', chunk => {
      startup += chunk.toString();
      if (startup.includes('Running')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', chunk => { startup += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Servidor terminó ${code}: ${startup}`)));
  });

  const url = `http://127.0.0.1:${port}`;
  const request = (route, token, options = {}) => fetch(`${url}${route}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const login = async (identifier, password, role) => {
    const response = await request('/api/auth/login', null, {
      method: 'POST', body: JSON.stringify({ identifier, password, role })
    });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  };

  const adminToken = await login('admin@58express.com', 'ventana-admin-password', 'admin');

  const crearPasajero = async sufijo => {
    const respuesta = await request('/api/auth/register', null, {
      method: 'POST',
      body: JSON.stringify({
        email: `ventana.pasajero.${sufijo}@example.com`, phone: `+58412200${sufijo}`,
        password: 'password123', role: 'passenger', firstName: 'Ventana', lastName: 'Pasajero'
      })
    });
    assert.equal(respuesta.status, 201);
    return respuesta.json();
  };

  const crearConductor = async sufijo => {
    const respuesta = await request('/api/admin/drivers', adminToken, {
      method: 'POST',
      body: JSON.stringify({
        email: `ventana.conductor.${sufijo}@example.com`, phone: `+58414200${sufijo}`,
        firstName: 'Ventana', lastName: `Conductor${sufijo}`,
        vehicleBrand: 'Bera', vehicleModel: 'SBR', vehiclePlate: `VEN00${sufijo}`
      })
    });
    assert.equal(respuesta.status, 201);
    const cuenta = await respuesta.json();
    const token = await login(cuenta.user.email, cuenta.temporaryPassword, 'driver');
    return { ...cuenta, token };
  };

  /** Conecta a un conductor y lo deja disponible en el punto de recogida. */
  const conectarConductor = async (conductor, { lat = 10.6428, lng = -71.6126 } = {}) => {
    const socket = io(url, { auth: { token: conductor.token }, transports: ['websocket'] });
    t.after(() => socket.close());
    await once(socket, 'connect');
    socket.emit('driver:connect', { status: 'AVAILABLE' });
    await once(socket, 'driver:connected');
    socket.emit('driver:location', { latitude: lat, longitude: lng });
    await wait(150);
    return socket;
  };

  const pedirViaje = async (pasajero, id) => {
    const respuesta = await request('/api/trips/create', pasajero.token, {
      method: 'POST',
      body: JSON.stringify({
        id, pickup: { lat: 10.6427, lng: -71.6125 },
        destination: { lat: 10.65, lng: -71.60 },
        fareUSD: 4, paymentMethod: 'CASH', rideType: 'MOTO'
      })
    });
    assert.equal(respuesta.status, 200);
    return respuesta.json();
  };

  return { url, request, crearPasajero, crearConductor, conectarConductor, pedirViaje, startup };
}

// ---------------------------------------------------------------------------

test('la ventana se lee del entorno, y se dice cuál está puesta', async t => {
  const { startup } = await servidorDePrueba(t);
  // Si esta línea desapareciera, nadie sabría con qué ventana corrió una prueba.
  assert.match(startup, new RegExp(`ventana de oferta = ${VENTANA_MS} ms \\(entorno\\)`));
});

test('aceptar en el primer segundo asigna el viaje', async t => {
  const s = await servidorDePrueba(t);
  const pasajero = await s.crearPasajero('01');
  const conductor = await s.crearConductor('01');
  const socket = await s.conectarConductor(conductor);

  const oferta = once(socket, 'rideRequested', p => p.id === 'trip_pronto');
  await s.pedirViaje(pasajero, 'trip_pronto');
  const recibida = await oferta;

  // El vencimiento viaja en el propio evento: la autoridad del tiempo es el
  // servidor, no el reloj del teléfono.
  assert.equal(recibida.offerExpiresInMs, VENTANA_MS);
  assert.ok(typeof recibida.offerExpiresAt === 'number');

  const asignado = once(socket, 'tripStatusUpdated', p => p.tripId === 'trip_pronto');
  socket.emit('rideAccepted', { tripId: 'trip_pronto' });
  assertAsignado((await asignado).status, 'aceptar al principio');
});

test('aceptar cerca del final de la ventana sigue asignando', async t => {
  const s = await servidorDePrueba(t);
  const pasajero = await s.crearPasajero('02');
  const conductor = await s.crearConductor('02');
  const socket = await s.conectarConductor(conductor);

  const oferta = once(socket, 'rideRequested', p => p.id === 'trip_al_filo');
  await s.pedirViaje(pasajero, 'trip_al_filo');
  await oferta;

  // Al filo, pero dentro. Es el caso del conductor que desbloquea el teléfono
  // y decide justo a tiempo.
  await wait(VENTANA_MS - 1_200);
  const asignado = once(socket, 'tripStatusUpdated', p => p.tripId === 'trip_al_filo');
  socket.emit('rideAccepted', { tripId: 'trip_al_filo' });
  assertAsignado((await asignado).status, 'aceptar al filo');
});

test('rechazar NO consume el resto de la ventana: el siguiente recibe ya', async t => {
  const s = await servidorDePrueba(t);
  const pasajero = await s.crearPasajero('03');
  const primero = await s.crearConductor('03');
  const segundo = await s.crearConductor('04');
  // El primero, más cerca, para que le toque antes.
  const socketPrimero = await s.conectarConductor(primero, { lat: 10.6428, lng: -71.6126 });
  const socketSegundo = await s.conectarConductor(segundo, { lat: 10.6460, lng: -71.6160 });

  const primeraOferta = once(socketPrimero, 'rideRequested', p => p.id === 'trip_rechazo');
  const segundaOferta = once(socketSegundo, 'rideRequested', p => p.id === 'trip_rechazo');
  await s.pedirViaje(pasajero, 'trip_rechazo');
  await primeraOferta;

  const antes = Date.now();
  socketPrimero.emit('rideRejected', { tripId: 'trip_rechazo' });
  await segundaOferta;
  const tardanza = Date.now() - antes;

  // Lo que se protege: que NO se espere la ventana entera. Con margen amplio
  // para no volverse frágil en una máquina cargada.
  assert.ok(
    tardanza < VENTANA_MS - 1_000,
    `el relevo tardó ${tardanza} ms; debería ser inmediato, no esperar los ${VENTANA_MS} ms`
  );
});

test('la oferta expira sola, y después ya no se puede aceptar', async t => {
  const s = await servidorDePrueba(t);
  const pasajero = await s.crearPasajero('05');
  const conductor = await s.crearConductor('05');
  const socket = await s.conectarConductor(conductor);

  const oferta = once(socket, 'rideRequested', p => p.id === 'trip_vencido');
  await s.pedirViaje(pasajero, 'trip_vencido');
  await oferta;

  // Se deja vencer sin contestar. Es el conductor que no oyó el teléfono.
  await wait(VENTANA_MS + 1_500);

  // Y ahora llega el push tarde y toca «Aceptar»: el servidor no lo admite.
  const fallo = once(socket, 'rideAcceptanceFailed', p => p.tripId === 'trip_vencido');
  socket.emit('rideAccepted', { tripId: 'trip_vencido' });
  const motivo = (await fallo).reason;
  assert.ok(
    ['NO_ACTIVE_OFFER', 'NOT_CURRENT_OFFER', 'TRIP_NOT_SEARCHING'].includes(motivo),
    `una oferta vencida no puede aceptarse; el servidor dijo ${motivo}`
  );
});

test('dos conductores no pueden quedarse con el mismo viaje', async t => {
  const s = await servidorDePrueba(t);
  const pasajero = await s.crearPasajero('06');
  const primero = await s.crearConductor('06');
  const segundo = await s.crearConductor('07');
  const socketPrimero = await s.conectarConductor(primero, { lat: 10.6428, lng: -71.6126 });
  const socketSegundo = await s.conectarConductor(segundo, { lat: 10.6460, lng: -71.6160 });

  const oferta = once(socketPrimero, 'rideRequested', p => p.id === 'trip_carrera');
  await s.pedirViaje(pasajero, 'trip_carrera');
  await oferta;

  // El segundo no tiene la oferta: intenta aceptar conociendo el identificador.
  const fallo = once(socketSegundo, 'rideAcceptanceFailed', p => p.tripId === 'trip_carrera');
  const asignado = once(socketPrimero, 'tripStatusUpdated', p => p.tripId === 'trip_carrera');
  socketSegundo.emit('rideAccepted', { tripId: 'trip_carrera' });
  socketPrimero.emit('rideAccepted', { tripId: 'trip_carrera' });

  assertAsignado((await asignado).status, 'el primero gana');
  const motivo = (await fallo).reason;
  assert.ok(
    ['NOT_CURRENT_OFFER', 'ALREADY_ACCEPTED', 'TRIP_NOT_SEARCHING'].includes(motivo),
    `conocer el id no basta para aceptar; el servidor dijo ${motivo}`
  );
});

test('reconectar durante la oferta no regala tiempo nuevo', async t => {
  const s = await servidorDePrueba(t);
  const pasajero = await s.crearPasajero('08');
  const conductor = await s.crearConductor('08');
  const socket = await s.conectarConductor(conductor);

  const oferta = once(socket, 'rideRequested', p => p.id === 'trip_reconecta');
  const creadoEn = Date.now();
  await s.pedirViaje(pasajero, 'trip_reconecta');
  await oferta;

  socket.close();
  await wait(1_200);
  const otro = io(s.url, { auth: { token: conductor.token }, transports: ['websocket'] });
  t.after(() => otro.close());
  await once(otro, 'connect');
  otro.emit('driver:connect', { status: 'AVAILABLE' });
  await once(otro, 'driver:connected');

  // El temporizador vive en el servidor y no sabe de sockets: la oferta vence
  // cuando le toca, contando desde que se emitió. Si reconectar reiniciara la
  // cuenta, un conductor podría estirarla indefinidamente cerrando la
  // aplicación.
  await wait(VENTANA_MS + 1_500 - (Date.now() - creadoEn));
  const fallo = once(otro, 'rideAcceptanceFailed', p => p.tripId === 'trip_reconecta');
  otro.emit('rideAccepted', { tripId: 'trip_reconecta' });
  const motivo = (await fallo).reason;
  assert.ok(
    ['NO_ACTIVE_OFFER', 'NOT_CURRENT_OFFER', 'TRIP_NOT_SEARCHING'].includes(motivo),
    `la ventana debía haber vencido pese a la reconexión; el servidor dijo ${motivo}`
  );
});

test('el aviso de nueva carrera no promete un plazo escrito a mano', () => {
  // Decia «Responde antes de 15 segundos» y la ventana paso a 30, ademas de
  // ser configurable con DRIVER_OFFER_TIMEOUT_MS: cualquier numero ahi es una
  // promesa que el servidor puede dejar de cumplir sin que nadie lo note. El
  // aviso lo componen DOS sitios --servidor y movil-- y los dos se vigilan.
  const fuentes = [
    fs.readFileSync(new URL('../services/pushNotificationService.js', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../../mobile/domain/notificaciones.ts', import.meta.url), 'utf8')
  ];
  for (const fuente of fuentes) {
    const desde = fuente.indexOf('ride_request:');
    assert.ok(desde > 0, 'no se encontro el aviso de nueva carrera');
    const aviso = fuente.slice(desde, desde + 220);
    assert.doesNotMatch(aviso, /\d+\s*segundos/, `el aviso de carrera promete un plazo concreto: ${aviso}`);
  }
});
