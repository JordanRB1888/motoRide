import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatDistance, formatDuration } from '../src/utils/navFormat.js';
import {
  OFF_ROUTE_BASE_THRESHOLD_M,
  OFF_ROUTE_CONFIRMATION_SAMPLES,
  OFF_ROUTE_STATE,
  REROUTE_COOLDOWN_MS,
  createRerouteGovernor,
  createRouteProgressTracker,
  maneuverIconName,
  projectOntoPath
} from '../src/services/routeProgress.js';
import { icons } from '../src/utils/icons.js';
import { NAVIGATION_PHASE, createDriverNavigation } from '../src/services/driverNavigation.js';
import { normalizeGoogleRoute } from '../src/services/navigationRoute.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * MAPS-2C: navegacion dentro de la aplicacion.
 *
 * El motor de progresion es puro y se prueba con geometria determinista; el
 * controlador del conductor se prueba con dobles del servicio de rutas. La
 * tarifa y el despacho tienen sus guardas propias aqui ademas de las suites
 * que ya los vigilan.
 */

// Base Maracaibo; pt(este, norte) en METROS aproximados.
const BASE = { lat: 10.6427, lng: -71.6125 };
const pt = (este, norte = 0) => ({
  lat: BASE.lat + norte / 111_000,
  lng: BASE.lng + este / (111_000 * Math.cos(BASE.lat * Math.PI / 180))
});

/** Ruta recta al este de 1 km, 3 pasos (300/400/300 m), 9 min. */
function rutaDeTresPasos() {
  const camino = [];
  for (let m = 0; m <= 1000; m += 50) camino.push(pt(m));
  return Object.freeze({
    provider: 'google',
    travelMode: 'DRIVING',
    path: camino,
    distanceMeters: 1000,
    durationMillis: 540_000,
    localizedDistance: null,
    localizedDuration: null,
    steps: [
      { instruction: 'Avanza por la Av. Principal', maneuver: 'DEPART', distanceMeters: 300, durationMillis: 180_000, startLocation: pt(0), endLocation: pt(300), path: [pt(0), pt(300)] },
      { instruction: 'Gira a la derecha hacia Av 116', maneuver: 'TURN_RIGHT', distanceMeters: 400, durationMillis: 200_000, startLocation: pt(300), endLocation: pt(700), path: [pt(300), pt(700)] },
      { instruction: 'Continua hasta el destino', maneuver: 'DESTINATION', distanceMeters: 300, durationMillis: 160_000, startLocation: pt(700), endLocation: pt(1000), path: [pt(700), pt(1000)] }
    ]
  });
}

// --------------------------------------------------------------------------
// §36 — Formateadores locales (localizedValues NO es necesario)
// --------------------------------------------------------------------------

test('las distancias se formatean en local, en español y con limites correctos', () => {
  assert.equal(formatDistance(85), '85 m');
  assert.equal(formatDistance(999), '999 m');
  assert.equal(formatDistance(1000), '1,0 km');
  assert.equal(formatDistance(1234), '1,2 km');
  assert.equal(formatDistance(9949), '9,9 km');
  assert.equal(formatDistance(10_400), '10 km');
  assert.equal(formatDistance(-5), '');
  assert.equal(formatDistance('x'), '');
});

test('los tiempos se formatean en local con horas y minutos', () => {
  assert.equal(formatDuration(30_000), '1 min');
  assert.equal(formatDuration(8 * 60_000), '8 min');
  assert.equal(formatDuration(59.4 * 60_000), '59 min');
  assert.equal(formatDuration(60 * 60_000), '1 h');
  assert.equal(formatDuration(72 * 60_000), '1 h 12 min');
  assert.equal(formatDuration(-1), '');
});

// --------------------------------------------------------------------------
// §37 — Proyeccion sobre la ruta
// --------------------------------------------------------------------------

test('la proyeccion resuelve punto en ruta, cercano y fuera de los extremos', () => {
  const camino = rutaDeTresPasos().path;

  const enRuta = projectOntoPath(camino, pt(500));
  assert.ok(enRuta.distanceFromRouteMeters < 1);
  assert.ok(Math.abs(enRuta.distanceAlongRouteMeters - 500) < 2);
  assert.ok(Math.abs(enRuta.totalPathMeters - 1000) < 5);

  const cercano = projectOntoPath(camino, pt(500, 40)); // 40 m al norte
  assert.ok(Math.abs(cercano.distanceFromRouteMeters - 40) < 2);
  assert.ok(Math.abs(cercano.distanceAlongRouteMeters - 500) < 2);

  const antes = projectOntoPath(camino, pt(-80));       // antes del inicio
  assert.ok(Math.abs(antes.distanceAlongRouteMeters) < 2, 'se fija al inicio del primer segmento');
  const despues = projectOntoPath(camino, pt(1100));    // pasado el final
  assert.ok(Math.abs(despues.distanceAlongRouteMeters - 1000) < 5, 'se fija al final');
});

test('la distancia restante es consciente del progreso, no la total para siempre', () => {
  const tracker = createRouteProgressTracker(rutaDeTresPasos());
  const p1 = tracker.update({ ...pt(200), accuracy: 8 });
  assert.ok(Math.abs(p1.remainingDistanceMeters - 800) < 5);
  const p2 = tracker.update({ ...pt(650), accuracy: 8 });
  assert.ok(Math.abs(p2.remainingDistanceMeters - 350) < 5);
  // ETA restante por pasos: en 650 m queda parte del paso 2 + el paso 3.
  assert.ok(p2.remainingDurationMillis < 540_000);
  assert.ok(p2.remainingDurationMillis > 160_000);
});

// --------------------------------------------------------------------------
// §39 — Progresion de pasos sin oscilar
// --------------------------------------------------------------------------

test('el paso activo avanza hacia delante y el jitter no lo hace retroceder', () => {
  const tracker = createRouteProgressTracker(rutaDeTresPasos());
  assert.equal(tracker.update({ ...pt(100), accuracy: 8 }).currentStepIndex, 0);
  assert.equal(tracker.update({ ...pt(400), accuracy: 8 }).currentStepIndex, 1);
  // Jitter hacia atras (vuelve a 280 m, zona del paso 0): el paso NO baja.
  assert.equal(tracker.update({ ...pt(280), accuracy: 12 }).currentStepIndex, 1,
    'retroceder de paso por ruido esta prohibido');
  assert.equal(tracker.update({ ...pt(750), accuracy: 8 }).currentStepIndex, 2);
  // Una ruta NUEVA resetea la progresion (tracker nuevo).
  const tracker2 = createRouteProgressTracker(rutaDeTresPasos());
  assert.equal(tracker2.update({ ...pt(100), accuracy: 8 }).currentStepIndex, 0);
});

test('la distancia a la proxima maniobra se mide sobre la ruta', () => {
  const tracker = createRouteProgressTracker(rutaDeTresPasos());
  const p = tracker.update({ ...pt(100), accuracy: 8 });
  // El paso 1 (giro) empieza en 300 m: desde 100 m faltan ~200 m.
  assert.ok(Math.abs(p.distanceToNextManeuverMeters - 200) < 10);
  assert.equal(p.activeStep.maneuver, 'DEPART');
  assert.equal(p.nextStep.maneuver, 'TURN_RIGHT');
});

// --------------------------------------------------------------------------
// §38/§40 — Fuera de ruta con incertidumbre y confirmacion
// --------------------------------------------------------------------------

test('una desviacion aislada solo SOSPECHA; hacen falta consecutivas para confirmar', () => {
  const tracker = createRouteProgressTracker(rutaDeTresPasos());
  const lejos = pt(500, 200); // 200 m al norte de la ruta
  const s1 = tracker.update({ ...lejos, accuracy: 10 });
  assert.equal(s1.offRouteState, OFF_ROUTE_STATE.SUSPECTED, 'una muestra jamas confirma');
  const s2 = tracker.update({ ...lejos, accuracy: 10 });
  assert.equal(s2.offRouteState, OFF_ROUTE_STATE.SUSPECTED);
  const s3 = tracker.update({ ...lejos, accuracy: 10 });
  assert.equal(s3.offRouteState, OFF_ROUTE_STATE.CONFIRMED,
    `${OFF_ROUTE_CONFIRMATION_SAMPLES} creibles consecutivas confirman`);
});

test('volver a la ruta absuelve: el contador de desvios se reinicia', () => {
  const tracker = createRouteProgressTracker(rutaDeTresPasos());
  tracker.update({ ...pt(500, 200), accuracy: 10 });
  tracker.update({ ...pt(500, 200), accuracy: 10 });
  assert.equal(tracker.update({ ...pt(600), accuracy: 10 }).offRouteState, OFF_ROUTE_STATE.ON_ROUTE);
  // Y una nueva desviacion vuelve a empezar desde cero.
  assert.equal(tracker.update({ ...pt(600, 200), accuracy: 10 }).offRouteState, OFF_ROUTE_STATE.SUSPECTED);
});

test('una lectura de mala precision no acusa: la incertidumbre juega a favor', () => {
  const tracker = createRouteProgressTracker(rutaDeTresPasos());
  // 120 m de la ruta con accuracy 90: umbral efectivo 50+90=140 → en ruta.
  const p1 = tracker.update({ ...pt(500, 120), accuracy: 90 });
  assert.equal(p1.offRouteState, OFF_ROUTE_STATE.ON_ROUTE);
  // 200 m con accuracy 150 (> techo creible): ni acusa ni cambia el estado.
  const p2 = tracker.update({ ...pt(500, 200), accuracy: 150 });
  assert.equal(p2.offRouteState, OFF_ROUTE_STATE.ON_ROUTE,
    'la muestra no creible no puede empezar una acusacion');
  // Y las precisas de verdad fuera de ruta si acusan (tres → confirmado).
  for (let i = 0; i < OFF_ROUTE_CONFIRMATION_SAMPLES; i += 1) {
    tracker.update({ ...pt(500, 200), accuracy: 8 });
  }
  assert.equal(tracker.update({ ...pt(500, 200), accuracy: 8 }).offRouteState, OFF_ROUTE_STATE.CONFIRMED);
  assert.ok(OFF_ROUTE_BASE_THRESHOLD_M >= 30, 'el umbral base documentado existe');
});

// --------------------------------------------------------------------------
// §41/§42 — Gobernador: cooldown y un solo vuelo
// --------------------------------------------------------------------------

test('tras un recalculo hay cooldown, y jamas dos recalculos en vuelo', () => {
  let reloj = 1_000_000;
  const governor = createRerouteGovernor({ now: () => reloj });

  assert.equal(governor.shouldReroute(OFF_ROUTE_STATE.SUSPECTED), false, 'sospechar no recalcula');
  assert.equal(governor.shouldReroute(OFF_ROUTE_STATE.CONFIRMED), true);

  governor.begin();
  assert.equal(governor.shouldReroute(OFF_ROUTE_STATE.CONFIRMED), false, 'con uno en vuelo, no hay segundo');
  governor.finish();

  reloj += 5_000;
  assert.equal(governor.shouldReroute(OFF_ROUTE_STATE.CONFIRMED), false, 'dentro del cooldown no se repite');
  reloj += REROUTE_COOLDOWN_MS;
  assert.equal(governor.shouldReroute(OFF_ROUTE_STATE.CONFIRMED), true, 'pasado el cooldown, permitido');
});

// --------------------------------------------------------------------------
// El controlador del conductor: fases, primera muestra, reroute controlado
// --------------------------------------------------------------------------

function montarControlador({ rutas }) {
  const llamadas = [];
  const pintadas = [];
  const routeService = {
    cancel() {},
    async computeNavigationRoute({ origin, destination }) {
      llamadas.push({ origin, destination });
      const respuesta = rutas.shift() ?? { stale: false, route: null };
      return typeof respuesta === 'function' ? respuesta() : respuesta;
    }
  };
  const banner = { updates: [], update(p, ctx) { this.updates.push({ p, ctx }); }, hide() { this.hidden = true; } };
  const map = { drawNavigationRoute(route, opts) { pintadas.push({ route, opts }); return true; } };
  let posicion = { lat: BASE.lat, lng: BASE.lng, accuracy: 10 };
  const nav = createDriverNavigation({
    routeService, map, banner,
    getCurrentPosition: () => posicion,
    logger: { log() {} }
  });
  return { nav, llamadas, pintadas, banner, setPos: p => { posicion = p; } };
}

test('§47: el cambio de fase invalida la ruta a la recogida y computa la del destino', async () => {
  const rutaPickup = rutaDeTresPasos();
  const rutaDestino = rutaDeTresPasos();
  const { nav, llamadas, pintadas } = montarControlador({
    rutas: [
      { stale: false, route: rutaPickup },
      { stale: false, route: rutaDestino }
    ]
  });

  assert.equal(await nav.startPhase(NAVIGATION_PHASE.PICKUP, pt(1000), { label: 'Recogida' }), true);
  assert.equal(llamadas.length, 1);
  assert.equal(pintadas.length, 1);

  // Pasajero a bordo: fase destino → NUEVA ruta; la de la recogida no se
  // reutiliza (nueva llamada con el nuevo objetivo).
  assert.equal(await nav.startPhase(NAVIGATION_PHASE.DESTINATION, pt(5000), { label: 'Destino' }), true);
  assert.equal(llamadas.length, 2);
  assert.ok(Math.abs(llamadas[1].destination.lng - pt(5000).lng) < 1e-9);
  assert.equal(pintadas.length, 2);
  assert.equal(pintadas[1].opts.color, '#00E676', 'el color de fase destino es el verde del diseño');
});

test('repetir la MISMA fase con el mismo objetivo no vuelve a llamar a la red', async () => {
  const { nav, llamadas } = montarControlador({
    rutas: [{ stale: false, route: rutaDeTresPasos() }]
  });
  await nav.startPhase(NAVIGATION_PHASE.PICKUP, pt(1000));
  await nav.startPhase(NAVIGATION_PHASE.PICKUP, pt(1000)); // re-render de vista
  assert.equal(llamadas.length, 1, 'repintar una vista no gasta red');
});

test('los ticks de GPS solo progresan en local: cero llamadas de ruta por tick', async () => {
  const { nav, llamadas, banner } = montarControlador({
    rutas: [{ stale: false, route: rutaDeTresPasos() }]
  });
  await nav.startPhase(NAVIGATION_PHASE.PICKUP, pt(1000));
  for (const m of [100, 200, 300, 400, 500, 600]) {
    nav.onPositionSample({ ...pt(m), accuracy: 8 });
  }
  assert.equal(llamadas.length, 1, 'seis muestras en ruta = cero recalculos');
  assert.equal(banner.updates.length, 6, 'el banner se actualiza con cada muestra');
  const ultimo = banner.updates.at(-1).p;
  assert.ok(Math.abs(ultimo.remainingDistanceMeters - 400) < 10);
});

test('el desvio confirmado dispara UN solo recalculo, con cooldown detras', async () => {
  const { nav, llamadas } = montarControlador({
    rutas: [
      { stale: false, route: rutaDeTresPasos() },
      { stale: false, route: rutaDeTresPasos() }
    ]
  });
  await nav.startPhase(NAVIGATION_PHASE.PICKUP, pt(1000));
  const lejos = { ...pt(500, 300), accuracy: 8 };
  // 3 confirman → 1 reroute; las siguientes caen en cooldown/pending.
  for (let i = 0; i < 6; i += 1) nav.onPositionSample(lejos);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(llamadas.length, 2, 'exactamente un recalculo tras confirmar');
});

test('el fallo del recalculo no rompe la guia: la ruta vigente se conserva', async () => {
  const { nav, llamadas, banner } = montarControlador({
    rutas: [
      { stale: false, route: rutaDeTresPasos() },
      { stale: false, route: null }              // reroute sin ruta
    ]
  });
  await nav.startPhase(NAVIGATION_PHASE.PICKUP, pt(1000));
  const lejos = { ...pt(500, 300), accuracy: 8 };
  for (let i = 0; i < 4; i += 1) nav.onPositionSample(lejos);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(llamadas.length, 2);
  // La guia sigue viva sobre la ruta anterior (degradada, no rota).
  const progreso = nav.onPositionSample({ ...pt(600), accuracy: 8 });
  assert.ok(progreso, 'la ruta vigente sigue guiando');
  assert.equal(banner.updates.at(-1).ctx.degraded, true, 'el estado degradado se refleja');
});

test('sin posicion aceptada, la fase espera y la PRIMERA muestra la estrena', async () => {
  const { nav, llamadas, setPos } = montarControlador({
    rutas: [{ stale: false, route: rutaDeTresPasos() }]
  });
  setPos(null);
  assert.equal(await nav.startPhase(NAVIGATION_PHASE.PICKUP, pt(1000)), false);
  assert.equal(llamadas.length, 0, 'sin GPS aceptado no se computa nada');
  nav.onPositionSample({ ...pt(0), accuracy: 10 });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(llamadas.length, 1, 'la primera muestra aceptada estrena la ruta');
});

// --------------------------------------------------------------------------
// §24 — llegar solo INDICA
// --------------------------------------------------------------------------

test('llegar cerca del destino se indica, pero ningun estado de negocio cambia solo', () => {
  const tracker = createRouteProgressTracker(rutaDeTresPasos());
  const p = tracker.update({ ...pt(995), accuracy: 10 });
  assert.equal(p.arrived, true);
  // Guardas estaticas: el controlador no emite transiciones ni toca el viaje.
  const controlador = leer('src/services/driverNavigation.js');
  assert.ok(!controlador.includes('tripStatusUpdated'), 'la navegacion no transiciona viajes');
  assert.ok(!controlador.includes('socket.emit'), 'la navegacion no emite eventos de negocio');
  const app = leer('src/pages/driver/driverApp.js');
  assert.ok(!/arrived[\s\S]{0,80}(arrivePickup|completeTrip|startTrip)/.test(app),
    'ninguna transicion del viaje cuelga de la llegada GPS');
});

// --------------------------------------------------------------------------
// §44 — localizedValues null no deja la guia sin textos
// --------------------------------------------------------------------------

test('con localizedValues null, el banner tiene distancia y ETA formateadas en local', () => {
  const cruda = {
    path: [{ lat: 10.64, lng: -71.61 }, { lat: 10.65, lng: -71.6 }],
    distanceMeters: 4200,
    durationMillis: 540_000,
    localizedValues: null,
    legs: []
  };
  const ruta = normalizeGoogleRoute(cruda);
  assert.equal(ruta.localizedDistance, null);
  // La UI no depende de eso: formatea los canonicos numericos.
  assert.equal(formatDistance(ruta.distanceMeters), '4,2 km');
  assert.equal(formatDuration(ruta.durationMillis), '9 min');
  const banner = leer('src/components/navigationBanner.js');
  assert.ok(banner.includes('formatDistance(') && banner.includes('formatDuration('));
  assert.ok(!banner.includes('localizedDistance'), 'el banner no lee localizedValues');
});

// --------------------------------------------------------------------------
// Maniobras → señal local
// --------------------------------------------------------------------------

test('las maniobras conocidas mapean a iconos de la familia oficial; la desconocida a la flecha recta', () => {
  assert.equal(maneuverIconName('TURN_LEFT'), 'navTurnLeft');
  assert.equal(maneuverIconName('TURN_RIGHT'), 'navTurnRight');
  assert.equal(maneuverIconName('ROUNDABOUT_RIGHT'), 'navRoundabout');
  assert.equal(maneuverIconName('UTURN_LEFT'), 'navUturn');
  assert.equal(maneuverIconName('DESTINATION'), 'flag');
  assert.equal(maneuverIconName('MANIOBRA_FUTURA_DESCONOCIDA'), 'navStraight');
  assert.equal(maneuverIconName(null), 'navStraight');
  // Y cada nombre existe de verdad en la familia oficial: nada de emoji.
  for (const nombre of ['navStraight', 'navTurnLeft', 'navTurnRight', 'navSlightLeft',
    'navSlightRight', 'navUturn', 'navRoundabout', 'flag']) {
    assert.ok(icons[nombre], `falta el icono oficial ${nombre}`);
  }
});

// --------------------------------------------------------------------------
// §46 — El pasajero: visual Google, tarifa OSRM, sin duplicados de negocio
// --------------------------------------------------------------------------

test('el pasajero repinta SOLO geometria google y el precio sigue colgado de OSRM', () => {
  const app = leer('src/pages/passenger/passengerApp.js');
  const bloque = app.slice(app.indexOf('// Draw route asynchronously'), app.indexOf('function openScheduleModal'));
  assert.ok(bloque.includes('mapComponent.drawRoute(pickup, [lat, lon]).then(routeInfo'),
    'la tarifa sigue naciendo del routeInfo OSRM de drawRoute');
  assert.ok(bloque.indexOf('showFarePreview') < bloque.indexOf('rutaVisualGoogle'),
    'el precio queda fijado ANTES de pedir la geometria de Google');
  assert.ok(bloque.includes("route.provider !== 'google') return"),
    'solo la geometria google repinta; el respaldo no duplica el trazado OSRM');
  assert.ok(app.includes('osrmRoute: async () => null'),
    'el servicio visual del pasajero no tiene respaldo OSRM propio: cero llamadas duplicadas');
  assert.ok(!bloque.includes('calculateFare(route.'), 'ninguna tarifa sale de la ruta de navegacion');
});

// --------------------------------------------------------------------------
// El conductor navega por fases y las muestras entran ya aceptadas
// --------------------------------------------------------------------------

test('driverApp navega por fases desde la posicion aceptada y sin drawRoute', () => {
  const app = leer('src/pages/driver/driverApp.js');
  assert.ok(app.includes('driverNav.startPhase('), 'la ruta del conductor es una fase de navegacion');
  assert.ok(app.includes('NAVIGATION_PHASE.DESTINATION'));
  assert.ok(app.includes('driverGpsTracker.lastAcceptedSample'),
    'el origen de la fase es la ultima muestra ACEPTADA por GPS-1');
  assert.ok(app.includes('driverNav.onPositionSample('), 'cada muestra aceptada alimenta la guia');
  assert.ok(app.includes('driverNav.stop()'), 'cerrar el viaje apaga la guia');
  assert.ok(!app.includes('currentMap.drawRoute('), 'el camino OSRM+banner viejo salio del conductor');
});
