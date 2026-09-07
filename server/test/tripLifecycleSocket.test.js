import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * TRIP-LIFECYCLE-ACTIONS-1: las acciones del conductor POR SOCKET, que es el
 * camino que usa la aplicacion cuando hay red.
 *
 * `tripOfflineEvents` ya cubre la reconciliacion por HTTP. Esta suite cubre el
 * otro transporte, el de todos los dias: llegue, arranco, termino, con el
 * telefono conectado.
 *
 * LO QUE SE PROTEGE
 *
 * Que dos toques del mismo boton dejen UNA sola transicion --y una sola linea
 * en el historial, porque el historial cuenta lo que paso y paso una vez--;
 * que no se pueda saltar un eslabon; que un conductor ajeno no toque una
 * carrera que no es suya; que una pasajera no pueda hacer de conductor; y que
 * el anuncio llegue a los DOS, porque una transicion que solo ve uno de los dos
 * lados es media transicion.
 */

async function arrancarServidor(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-lifecycle-'));
  const port = 28100 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, 'database.json'),
      JWT_SECRET: 'lifecycle-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 8000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return `http://127.0.0.1:${port}`;
}

const json = { 'content-type': 'application/json' };
const respirar = (ms = 220) => new Promise(resolve => setTimeout(resolve, ms));

/** Un viaje real, aceptado en linea, con los dos sockets abiertos. */
async function montarViajeActivo(t, url) {
  const login = async (identifier, password, role) => {
    const r = await fetch(`${url}/api/auth/login`, {
      method: 'POST', headers: json, body: JSON.stringify({ identifier, password, role })
    });
    assert.equal(r.status, 200);
    return (await r.json()).token;
  };
  const adminToken = await login('admin@58express.com', 'admin', 'admin');

  const registro = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: json,
    body: JSON.stringify({
      email: 'p.ciclo@58express.com', phone: '+584120007711', password: 'password123',
      role: 'passenger', firstName: 'Ana', lastName: 'Ciclo'
    })
  });
  const pasajera = await registro.json();

  const crearConductor = async (n) => {
    const r = await fetch(`${url}/api/admin/drivers`, {
      method: 'POST', headers: { ...json, authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        email: `d.ciclo${n}@58express.com`, phone: `+58414000${7700 + n}`,
        firstName: `Cic${n}`, lastName: 'Lo', vehicleBrand: 'Bera',
        vehicleModel: 'BR200', vehiclePlate: `CI${n}A58`
      })
    });
    const cuenta = await r.json();
    const token = await login(`d.ciclo${n}@58express.com`, cuenta.temporaryPassword, 'driver');
    return { id: cuenta.user.id, token };
  };
  const conductor = await crearConductor(1);
  const intruso = await crearConductor(2);

  const socketConductor = io(url, { auth: { token: conductor.token } });
  t.after(() => socketConductor.close());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('conductor sin registrar')), 5000);
    socketConductor.on('connect', () =>
      socketConductor.emit('driver:connect', { userId: conductor.id, status: 'AVAILABLE' }));
    socketConductor.on('driver:connected', () => {
      socketConductor.emit('driver:location', { latitude: 10.6428, longitude: -71.6126, heading: 0 });
      clearTimeout(timeout); resolve();
    });
  });

  // La pasajera tambien mira: sin su socket no se puede comprobar que el
  // anuncio llega a los dos lados.
  const socketPasajera = io(url, { auth: { token: pasajera.token } });
  t.after(() => socketPasajera.close());
  await new Promise(resolve => socketPasajera.on('connect', resolve));

  const aceptado = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('sin oferta')), 8000);
    socketConductor.on('rideRequested', oferta => {
      socketConductor.emit('rideAccepted', { tripId: oferta.id });
      clearTimeout(timeout); resolve(oferta.id);
    });
  });
  await respirar(120);
  const creacion = await fetch(`${url}/api/trips/create`, {
    method: 'POST', headers: { ...json, authorization: `Bearer ${pasajera.token}` },
    body: JSON.stringify({
      id: 'ciclo_trip_1',
      pickup: { lat: 10.6427, lng: -71.6125 },
      destination: { lat: 10.65, lng: -71.60 },
      paymentMethod: 'efectivo', rideType: 'MOTO'
    })
  });
  assert.equal(creacion.status, 200);
  const tripId = await aceptado;
  await respirar();

  return { adminToken, pasajera, conductor, intruso, tripId, socketConductor, socketPasajera };
}

/** El viaje tal cual, sacado de la vista `{ trip, passenger, driver }`. */
const estadoDelViaje = async (url, token, tripId) => {
  const r = await fetch(`${url}/api/trips/${tripId}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.status !== 200) return null;
  return (await r.json()).trip;
};

/** Cómo ve el administrador al conductor de este viaje. */
const conductorDelViaje = async (url, adminToken, tripId) => {
  const r = await fetch(`${url}/api/trips/${tripId}`, { headers: { authorization: `Bearer ${adminToken}` } });
  return r.status === 200 ? (await r.json()).driver : null;
};

/** Recoge los `tripStatusUpdated` que llegan a un socket. */
function anotarAnuncios(socket) {
  const vistos = [];
  socket.on('tripStatusUpdated', dato => vistos.push(dato.status));
  return vistos;
}

test('el ciclo completo por socket: llegué, arranco, termino', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId, socketConductor, socketPasajera, adminToken } =
    await montarViajeActivo(t, url);

  const veLaPasajera = anotarAnuncios(socketPasajera);
  const veElConductor = anotarAnuncios(socketConductor);

  for (const estado of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    socketConductor.emit('tripStatusUpdated', { tripId, status: estado });
    await respirar(320);
    const viaje = await estadoDelViaje(url, conductor.token, tripId);
    assert.equal(viaje.status, estado, `el servidor no llegó a ${estado}`);
  }

  // El anuncio llega a los DOS. Una transición que sólo ve uno es media
  // transición: la pasajera se queda mirando «en camino» con el viaje acabado.
  for (const estado of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    assert.ok(veLaPasajera.includes(estado), `la pasajera no se enteró de ${estado}`);
    assert.ok(veElConductor.includes(estado), `el conductor no se enteró de ${estado}`);
  }

  // Y el conductor vuelve a estar disponible, que es el contrato de siempre:
  // un conductor que termina y se queda ocupado no recibe la siguiente carrera.
  const suyo = await conductorDelViaje(url, adminToken, tripId);
  assert.equal(suyo?.status, 'AVAILABLE', 'el conductor quedó ocupado tras completar');
});

test('dos toques del mismo botón dejan UNA transición y UNA línea de historial', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId, socketConductor } = await montarViajeActivo(t, url);

  // El doble toque de verdad: sin esperar entre uno y otro.
  socketConductor.emit('tripStatusUpdated', { tripId, status: 'ARRIVED' });
  socketConductor.emit('tripStatusUpdated', { tripId, status: 'ARRIVED' });
  await respirar(420);

  const viaje = await estadoDelViaje(url, conductor.token, tripId);
  assert.equal(viaje.status, 'ARRIVED');

  const llegadas = (viaje.statusHistory ?? []).filter(paso => paso.status === 'ARRIVED');
  assert.equal(llegadas.length, 1, 'el viaje cuenta que el conductor llegó dos veces');
});

test('no se puede saltar un eslabón: iniciar sin haber llegado se rechaza', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId, socketConductor } = await montarViajeActivo(t, url);

  const rechazos = [];
  socketConductor.on('tripStatusRejected', dato => rechazos.push(dato.error));

  // De DRIVER_ASSIGNED no se llega a IN_PROGRESS ni a COMPLETED.
  socketConductor.emit('tripStatusUpdated', { tripId, status: 'IN_PROGRESS' });
  await respirar(300);
  socketConductor.emit('tripStatusUpdated', { tripId, status: 'COMPLETED' });
  await respirar(300);

  const viaje = await estadoDelViaje(url, conductor.token, tripId);
  assert.equal(viaje.status, 'DRIVER_ASSIGNED', 'el viaje se movió sin permiso');
  assert.deepEqual(rechazos, ['INVALID_TRIP_TRANSITION', 'INVALID_TRIP_TRANSITION']);
});

test('un estado que no existe no mueve nada', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId, socketConductor } = await montarViajeActivo(t, url);

  const rechazos = [];
  socketConductor.on('tripStatusRejected', dato => rechazos.push(dato.error));

  socketConductor.emit('tripStatusUpdated', { tripId, status: 'TELETRANSPORTADO' });
  socketConductor.emit('tripStatusUpdated', { tripId });
  await respirar(360);

  const viaje = await estadoDelViaje(url, conductor.token, tripId);
  assert.equal(viaje.status, 'DRIVER_ASSIGNED');
  assert.ok(rechazos.length >= 1, 'ni siquiera avisó de que no lo aplicó');
});

test('la carrera de otro no se toca', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, intruso, tripId } = await montarViajeActivo(t, url);

  const socketIntruso = io(url, { auth: { token: intruso.token } });
  t.after(() => socketIntruso.close());
  await new Promise(resolve => socketIntruso.on('connect', resolve));

  const negativas = [];
  socketIntruso.on('authorization:error', dato => negativas.push(dato.error));

  socketIntruso.emit('tripStatusUpdated', { tripId, status: 'ARRIVED' });
  await respirar(340);

  const viaje = await estadoDelViaje(url, conductor.token, tripId);
  assert.equal(viaje.status, 'DRIVER_ASSIGNED', 'un conductor ajeno movió la carrera');
  assert.deepEqual(negativas, ['FORBIDDEN']);
});

test('la pasajera no puede hacer de conductor', async (t) => {
  const url = await arrancarServidor(t);
  const { conductor, tripId, socketPasajera } = await montarViajeActivo(t, url);

  // Es SU viaje, pero no es su papel. Que el viaje sea suyo no la autoriza a
  // declarar que el conductor llegó ni a cerrarlo y disparar la liquidación.
  socketPasajera.emit('tripStatusUpdated', { tripId, status: 'ARRIVED' });
  await respirar(300);
  socketPasajera.emit('tripStatusUpdated', { tripId, status: 'COMPLETED' });
  await respirar(300);

  const viaje = await estadoDelViaje(url, conductor.token, tripId);
  assert.equal(viaje.status, 'DRIVER_ASSIGNED', 'la pasajera movió el viaje ella sola');
});

test('después de COMPLETED el viaje deja de estar activo, y no revive', async (t) => {
  const url = await arrancarServidor(t);
  const { pasajera, conductor, tripId, socketConductor } = await montarViajeActivo(t, url);

  for (const estado of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    socketConductor.emit('tripStatusUpdated', { tripId, status: estado });
    await respirar(300);
  }

  // Lo que la aplicación pregunta al abrirse. Un 204 es «no tienes viaje».
  for (const token of [pasajera.token, conductor.token]) {
    const activo = await fetch(`${url}/api/trips/active/me`, {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(activo.status, 204, 'un viaje terminado sigue contando como activo');
  }

  // Y no se puede resucitar volviendo a mandar acciones.
  socketConductor.emit('tripStatusUpdated', { tripId, status: 'IN_PROGRESS' });
  await respirar(300);
  const viaje = await estadoDelViaje(url, conductor.token, tripId);
  assert.equal(viaje.status, 'COMPLETED', 'un viaje completado volvió atrás');
});
