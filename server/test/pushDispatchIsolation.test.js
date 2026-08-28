import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISPATCH_REJECTION,
  evaluateDriverEligibility,
  selectEligibleDrivers
} from '../domain/dispatchEligibility.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');

/**
 * La misma fuente sin comentarios.
 *
 * Buscar `notifyRideOffer` sobre el fuente crudo encontraba la nota que
 * explica que conectarlo es PUSH-3a: la prueba se disparaba con su propio
 * comentario. Lo que importa es que no exista la LLAMADA.
 */
const indexCodigo = indexSource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');

/**
 * Guarda de regresion alrededor del despacho, escrita ANTES de tocarlo.
 *
 * PUSH-1 instalo los cimientos sin conectar nada. PUSH-3A conecta UNA cosa:
 * `notifyRideOffer` dentro de `offerNext`, sin await, acompanando a la oferta
 * de socket. Estas pruebas fijan que esa es la UNICA puerta y que todo lo
 * demas --elegibilidad, orden, ventana-- quedo exactamente como estaba.
 *
 * La decision de producto es PUSH-3A, no PUSH-3B: la elegibilidad NO cambia.
 * Un conductor sin socket sigue sin ser candidato, la posicion sigue caducando
 * y la ventana sigue siendo de quince segundos. Aqui se fija todo eso.
 */

const distancia = () => 1;
const registroCon = (...ids) => new Map(ids.map(id => [id, `socket_${id}`]));
const sinViaje = () => null;

function conductor(overrides = {}) {
  return {
    id: 'driver_1',
    role: 'driver',
    status: 'AVAILABLE',
    isVerified: true,
    accountStatus: 'ACTIVE',
    vehicleType: 'MOTO',
    location: { lat: 10.6427, lng: -71.6125, updatedAt: Date.now() },
    ...overrides
  };
}

const viaje = { id: 'trip_1', rideType: 'MOTO' };
const recogida = { lat: 10.6427, lng: -71.6125 };

// --------------------------------------------------------------------------
// PUSH-3A: el despacho invoca push SOLO por la puerta semantica autorizada
// --------------------------------------------------------------------------

test('el despacho invoca exactamente la operacion semantica de PUSH-3A y nada mas', () => {
  // Hasta PUSH-1 esta prueba exigia CERO llamadas. PUSH-3A autoriza UNA:
  // `pushService.notifyRideOffer(...)` dentro de `offerNext`, acompanando a
  // la oferta de Socket.IO ya emitida. Cualquier segunda llamada seria un
  // canal nuevo sin autorizar.
  const llamadas = indexCodigo.match(/pushService\.notifyRideOffer\(/g) || [];
  assert.equal(llamadas.length, 1, 'debe existir exactamente UNA invocacion semantica');
  // La regla de fondo NO cambia: el servidor jamas toca el transporte
  // generico. Cada aviso sale por una operacion CON NOMBRE y lista blanca
  // propia. El Transporte Seguro anadio la suya (`notifyScheduledEvent`,
  // autorizada por el dueno para que la oferta programada y la hora de
  // recogida suenen); `notifyUser` sigue prohibido aqui.
  assert.ok(!indexCodigo.includes('pushService.notifyUser('),
    'el servidor no llama al transporte generico: solo operaciones semanticas');
  const programados = indexCodigo.match(/pushService\.notifyScheduledEvent\(/g) || [];
  assert.equal(programados.length, 1, 'un solo punto de entrada para los avisos del plan');

  // Y esa unica llamada vive dentro de offerNext, DESPUES de emitir la oferta
  // por socket al conductor concreto: push acompana a la oferta, nunca la
  // precede ni la sustituye.
  const offerNextSrc = indexCodigo.slice(
    indexCodigo.indexOf('const offerNext = async () =>'),
    indexCodigo.indexOf('offerNext().catch')
  );
  const posSocket = offerNextSrc.indexOf("io.to(socketId).emit('rideRequested', offer)");
  const posPush = offerNextSrc.indexOf('pushService.notifyRideOffer(');
  assert.ok(posSocket >= 0, 'la oferta por socket debe seguir en offerNext');
  assert.ok(posPush > posSocket, 'push debe ir despues de la oferta por socket, en offerNext');
});

test('la llamada de PUSH-3A es fuego y olvido: sin await y con catch', () => {
  // La ventana de quince segundos no puede depender del proveedor: un `await`
  // aqui seria exactamente la regresion que PUSH-3A prohibe.
  assert.ok(!/await\s+pushService\./.test(indexCodigo),
    'el despacho no puede esperar a push en ningun punto');
  assert.match(indexCodigo, /pushService\.notifyRideOffer\(trip, candidate\.driver\.id\)\.catch\(/,
    'la invocacion debe llevar su catch: ningun rechazo puede quedar sin manejar');
});

test('el adaptador real solo se construye con la funcionalidad encendida', () => {
  // En PUSH-1 esta prueba exigia que NO hubiera ningun `sender`, porque
  // entonces no existia. PUSH-4A instala el adaptador real, asi que lo que hay
  // que fijar ya no es su ausencia sino su GUARDA: con la bandera apagada no
  // se construye, y ni siquiera se leen las variables VAPID.
  const construccion = indexCodigo.slice(
    indexCodigo.indexOf('function construirPushSender'),
    indexCodigo.indexOf('const pushService = createPushNotificationService')
  );
  assert.ok(construccion.length > 0, 'el adaptador debia construirse tras una guarda');

  const posGuarda = construccion.indexOf('if (!isWebPushEnabled()) return');
  const posClave = construccion.indexOf('WEB_PUSH_VAPID_PUBLIC_KEY');
  assert.ok(posGuarda >= 0, 'falta la guarda de la bandera');
  assert.ok(posClave > posGuarda, 'las claves no pueden leerse antes de la guarda');

  // Y la configuracion invalida no puede tumbar el servidor: push es entrega
  // auxiliar, no un requisito del despacho de carreras.
  assert.match(construccion, /catch \(error\)/);
  assert.ok(!/process\.exit/.test(construccion), 'un fallo de push no puede matar el proceso');
});

// --------------------------------------------------------------------------
// La ventana de oferta
// --------------------------------------------------------------------------

test('la ventana de oferta sigue siendo de quince segundos', () => {
  assert.ok(
    indexCodigo.includes('offerExpiresAt: Date.now() + 15000'),
    'la caducidad anunciada al conductor cambio'
  );
  assert.ok(
    /setTimeout\(\(\) => offerNext\(\)[\s\S]{0,220}?\}\), 15000\)/.test(indexCodigo),
    'el temporizador que pasa al siguiente candidato cambio'
  );
});

test('el despacho sigue emitiendo la oferta por Socket.IO al conductor concreto', () => {
  // Push nunca sustituye al socket: es despertador, no transporte.
  assert.ok(
    indexCodigo.includes("io.to(socketId).emit('rideRequested', offer)"),
    'la entrega en tiempo real por socket es el camino principal y no puede moverse'
  );
});

// --------------------------------------------------------------------------
// Elegibilidad: intacta (PUSH-3b NO se implementa)
// --------------------------------------------------------------------------

test('las doce razones OPERATIVAS de rechazo siguen siendo exactamente las mismas', () => {
  // Los doce filtros del despacho son intocables: esta guarda existe para
  // que nadie los borre, renombre ni relaje por descuido.
  const OPERATIVAS = [
    'ACTIVE_TRIP', 'BUSY', 'EXCLUDED', 'INVALID_STATUS', 'NOT_APPROVED',
    'NO_LOCATION', 'NO_SOCKET', 'OFFLINE', 'OUT_OF_RADIUS', 'ROLE_MISMATCH',
    'STALE_LOCATION', 'VEHICLE_MISMATCH'
  ];
  for (const razon of OPERATIVAS) {
    assert.equal(DISPATCH_REJECTION[razon], razon, `sigue existiendo ${razon}`);
  }
  // DRIVER-FINANCE-1 anadio UNA frontera mas, autorizada por el dueno: la
  // deuda del conductor. No sustituye a ninguna de las doce ni cambia su
  // orden; solo se suma. Cualquier decimocuarta razon debe pasar por aqui.
  assert.deepEqual(Object.keys(DISPATCH_REJECTION).sort(),
    [...OPERATIVAS, 'FINANCIAL_BALANCE_BLOCK'].sort());
});

test('un conductor sin socket sigue sin ser candidato', () => {
  // Este es el corazon de PUSH-3b y NO se toca en esta fase. Mientras esta
  // regla siga en pie, push no puede alcanzar a un conductor desconectado, y
  // asi debe quedar hasta que haya metricas reales que justifiquen cambiarla.
  const resultado = evaluateDriverEligibility({
    driver: conductor(), trip: viaje, pickup: recogida,
    hasSocket: false, calculateDistance: distancia,
    maxRadiusKm: 15, maxLocationAgeMs: 120_000
  });
  assert.equal(resultado.eligible, false);
  assert.equal(resultado.reason, DISPATCH_REJECTION.NO_SOCKET);
});

test('un conductor desconectado (OFFLINE) sigue sin ser candidato', () => {
  const resultado = evaluateDriverEligibility({
    driver: conductor({ status: 'OFFLINE' }), trip: viaje, pickup: recogida,
    hasSocket: true, calculateDistance: distancia,
    maxRadiusKm: 15, maxLocationAgeMs: 120_000
  });
  assert.equal(resultado.reason, DISPATCH_REJECTION.OFFLINE);
});

test('la posicion sigue caducando a los dos minutos', () => {
  const ahora = Date.now();
  const viejo = evaluateDriverEligibility({
    driver: conductor({ location: { lat: 10.6427, lng: -71.6125, updatedAt: ahora - 120_001 } }),
    trip: viaje, pickup: recogida, hasSocket: true, calculateDistance: distancia,
    maxRadiusKm: 15, maxLocationAgeMs: 120_000, now: ahora
  });
  assert.equal(viejo.reason, DISPATCH_REJECTION.STALE_LOCATION);

  const reciente = evaluateDriverEligibility({
    driver: conductor({ location: { lat: 10.6427, lng: -71.6125, updatedAt: ahora - 119_000 } }),
    trip: viaje, pickup: recogida, hasSocket: true, calculateDistance: distancia,
    maxRadiusKm: 15, maxLocationAgeMs: 120_000, now: ahora
  });
  assert.equal(reciente.eligible, true);
});

test('el orden de candidatos sigue siendo por distancia ascendente', () => {
  // La distancia se deriva de las coordenadas, que es como la calcula el
  // codigo real: calculateDistance(pickup.lat, pickup.lng, driver.lat, driver.lng).
  const porLatitud = (lat1, lng1, lat2) => Math.abs(lat2 - lat1) * 100;
  const conLat = (id, delta) => conductor({
    id,
    location: { lat: recogida.lat + delta, lng: recogida.lng, updatedAt: Date.now() }
  });

  const { candidates } = selectEligibleDrivers({
    drivers: [conLat('lejos', 0.09), conLat('cerca', 0.01), conLat('medio', 0.04)],
    trip: viaje,
    pickup: recogida,
    driverRegistry: registroCon('lejos', 'cerca', 'medio'),
    activeTripForDriver: sinViaje,
    calculateDistance: porLatitud,
    maxRadiusKm: 15,
    maxLocationAgeMs: 120_000
  });

  assert.equal(candidates.length, 3);
  assert.deepEqual(
    candidates.map(item => item.driver.id),
    ['cerca', 'medio', 'lejos'],
    'los candidatos deben venir de mas cerca a mas lejos'
  );
});

test('el conteo de rechazos sigue agrupandose por razon', () => {
  const { candidates, rejectionCounts } = selectEligibleDrivers({
    drivers: [
      conductor({ id: 'ok' }),
      conductor({ id: 'sin_socket' }),
      conductor({ id: 'apagado', status: 'OFFLINE' }),
      conductor({ id: 'no_aprobado', isVerified: false })
    ],
    trip: viaje,
    pickup: recogida,
    driverRegistry: registroCon('ok', 'apagado', 'no_aprobado'),
    activeTripForDriver: sinViaje,
    calculateDistance: distancia,
    maxRadiusKm: 15,
    maxLocationAgeMs: 120_000
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].driver.id, 'ok');
  assert.equal(rejectionCounts[DISPATCH_REJECTION.NO_SOCKET], 1);
  assert.equal(rejectionCounts[DISPATCH_REJECTION.OFFLINE], 1);
  assert.equal(rejectionCounts[DISPATCH_REJECTION.NOT_APPROVED], 1);
});

test('la creacion de un viaje sigue despachando de forma directa', () => {
  // `dispatchTripToDrivers(trip)` cuelga de POST /api/trips y no puede pasar a
  // depender de nada de push.
  const posicion = indexSource.indexOf('dispatchTripToDrivers(trip);');
  assert.ok(posicion > 0, 'el despacho debe seguir invocandose al crear un viaje');
  // Buscar 'push' a secas daba un falso positivo con `database.trips.push(trip)`,
  // que es el metodo del array. Lo que no puede aparecer es el servicio.
  const alrededor = indexCodigo.slice(posicion - 400, posicion + 200);
  assert.ok(!alrededor.includes('pushService'), 'la creacion de viaje no puede tocar push todavia');
  assert.ok(!alrededor.includes('notify'), 'la creacion de viaje no puede notificar todavia');
});
