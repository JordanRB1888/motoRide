import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURRENT_ROUTE_TRAVEL_MODE,
  GOOGLE_ROUTE_FIELDS,
  ROUTES_ERROR,
  createNavigationRouteService,
  normalizeGoogleRoute,
  normalizeOsrmRoute
} from '../src/services/navigationRoute.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * MAPS-2B: la fundacion de rutas de navegacion.
 *
 * Tres separaciones inviolables que esta suite vigila: la TARIFA sigue
 * saliendo de OSRM por su propio camino, el DESPACHO ni conoce este modulo,
 * y ningun objeto crudo del SDK sale del servicio. Google Routes duerme
 * hasta que se habilite la API: toda indisponibilidad degrada a OSRM.
 */

// --------------------------------------------------------------------------
// Modo de viaje: DRIVING, y el porque queda fijado
// --------------------------------------------------------------------------

test('el modo es DRIVING: Venezuela no tiene cobertura TWO_WHEELER oficial', () => {
  assert.equal(CURRENT_ROUTE_TRAVEL_MODE, 'DRIVING');
  const fuente = leer('src/services/navigationRoute.js');
  assert.ok(!/travelMode:\s*'TWO_WHEELER'/.test(fuente), 'TWO_WHEELER no puede usarse en produccion');
  assert.ok(fuente.includes('TWO_WHEELER'), 'la nota de arquitectura del modo futuro debe existir');
});

// --------------------------------------------------------------------------
// §25 — Normalizacion de la ruta de Google
// --------------------------------------------------------------------------

function rutaGoogleCruda() {
  // Puntos con lat/lng como FUNCIONES, como los LatLng del SDK.
  const p = (lat, lng) => ({ lat: () => lat, lng: () => lng });
  return {
    path: [p(10.64, -71.61), p(10.65, -71.60), p(10.66, -71.59)],
    distanceMeters: 4200,
    durationMillis: 540000,
    localizedValues: { distance: { text: '4,2 km' }, duration: { text: '9 min' } },
    legs: [{
      steps: [
        {
          navInstruction: { maneuver: 'TURN_LEFT', instructions: 'Gira a la <b>izquierda</b> en Av. 5 de Julio' },
          distanceMeters: 900,
          staticDurationMillis: 120000,
          startLocation: p(10.64, -71.61),
          endLocation: p(10.645, -71.605),
          path: [p(10.64, -71.61), p(10.645, -71.605)]
        },
        {
          navInstruction: { maneuver: 'TURN_RIGHT', instructions: 'Gira a la derecha' },
          distanceMeters: 3300,
          staticDurationMillis: 420000,
          startLocation: p(10.645, -71.605),
          endLocation: p(10.66, -71.59),
          path: []
        }
      ]
    }]
  };
}

test('la ruta de Google se normaliza a datos planos, sin objetos del SDK', () => {
  const ruta = normalizeGoogleRoute(rutaGoogleCruda());
  assert.equal(ruta.provider, 'google');
  assert.equal(ruta.travelMode, 'DRIVING');
  assert.deepEqual(ruta.path[0], { lat: 10.64, lng: -71.61 });
  assert.equal(ruta.distanceMeters, 4200);
  assert.equal(ruta.durationMillis, 540000);
  assert.equal(ruta.localizedDistance, '4,2 km');
  assert.equal(ruta.localizedDuration, '9 min');
  assert.equal(ruta.steps.length, 2);

  const paso = ruta.steps[0];
  assert.equal(paso.maneuver, 'TURN_LEFT');
  assert.equal(paso.instruction, 'Gira a la izquierda en Av. 5 de Julio',
    'el marcado del proveedor se despoja: nadie ejecuta HTML de navegacion');
  assert.equal(paso.distanceMeters, 900);
  assert.deepEqual(paso.startLocation, { lat: 10.64, lng: -71.61 });
  assert.deepEqual(paso.endLocation, { lat: 10.645, lng: -71.605 });
  assert.equal(paso.path.length, 2);

  // Nada del SDK sobrevive: todo el arbol es de tipos planos congelados.
  assert.ok(Object.isFrozen(ruta) && Object.isFrozen(ruta.steps));
  const json = JSON.stringify(ruta);
  assert.ok(!json.includes('function'), 'no puede quedar ninguna funcion del SDK');
});

test('una ruta de Google sin lo esencial se descarta en vez de fabricarse', () => {
  assert.equal(normalizeGoogleRoute(null), null);
  assert.equal(normalizeGoogleRoute({ path: [], distanceMeters: 100, durationMillis: 1 }), null);
  assert.equal(normalizeGoogleRoute({ path: [{ lat: 10, lng: -71 }], distanceMeters: 'x', durationMillis: 1 }), null);
});

test('la ruta de OSRM se normaliza al MISMO contrato', () => {
  const ruta = normalizeOsrmRoute({
    distanceKm: 4.2,
    durationMin: 9,
    geometry: { coordinates: [[-71.61, 10.64], [-71.6, 10.65]] }
  });
  assert.equal(ruta.provider, 'osrm');
  assert.deepEqual(ruta.path, [{ lat: 10.64, lng: -71.61 }, { lat: 10.65, lng: -71.6 }]);
  assert.equal(ruta.distanceMeters, 4200);
  assert.equal(ruta.durationMillis, 540000);
  assert.equal(ruta.localizedDistance, '4.2 km');
  assert.deepEqual([...ruta.steps], [], 'el respaldo sin pasos detallados es aceptable');
});

// --------------------------------------------------------------------------
// Arneses del servicio
// --------------------------------------------------------------------------

function montarServicio({ google = null, osrm, configurado = true, timeoutMs = 4000 } = {}) {
  const llamadas = { compute: [], osrm: 0 };
  const lib = google === null ? null : {
    Route: {
      async computeRoutes(request) {
        llamadas.compute.push(request);
        const respuesta = typeof google === 'function' ? await google(request) : google;
        return respuesta;
      }
    }
  };
  const mapsLoader = {
    isConfigured: () => configurado,
    load: async () => ({
      importLibrary: async () => {
        if (!lib) throw new Error('ApiNotActivatedMapError: detalle crudo');
        return lib;
      }
    })
  };
  const servicio = createNavigationRouteService({
    mapsLoader,
    timeoutMs,
    osrmRoute: async (origen, destino) => {
      llamadas.osrm += 1;
      if (osrm instanceof Error) throw osrm;
      return typeof osrm === 'function' ? osrm(origen, destino) : osrm;
    }
  });
  return { servicio, llamadas };
}

const OSRM_OK = {
  distanceKm: 3.5,
  durationMin: 8,
  geometry: { coordinates: [[-71.61, 10.64], [-71.6, 10.65]] }
};

const EXTREMOS = { origin: { lat: 10.64, lng: -71.61 }, destination: { lat: 10.66, lng: -71.59 } };

// --------------------------------------------------------------------------
// §26/§31 — API sin habilitar (el estado real de produccion tras el release)
// --------------------------------------------------------------------------

test('con Routes API sin habilitar, la ruta sale de OSRM y nada revienta', async () => {
  const { servicio, llamadas } = montarServicio({ google: null, osrm: OSRM_OK });
  const { stale, route } = await servicio.computeNavigationRoute(EXTREMOS);
  assert.equal(stale, false);
  assert.equal(route.provider, 'osrm');
  assert.equal(route.distanceMeters, 3500);
  assert.equal(llamadas.osrm, 1);
});

test('sin clave de Maps configurada, Google ni se intenta', async () => {
  const { servicio, llamadas } = montarServicio({ configurado: false, google: rutaGoogleCruda, osrm: OSRM_OK });
  const { route } = await servicio.computeNavigationRoute(EXTREMOS);
  assert.equal(route.provider, 'osrm');
  assert.equal(llamadas.compute.length, 0);
});

// --------------------------------------------------------------------------
// §27 — Fallos de Google → OSRM
// --------------------------------------------------------------------------

test('auth, red, timeout o cero rutas de Google degradan a OSRM', async () => {
  const fallos = [
    () => { throw new Error('PERMISSION_DENIED: crudo'); },
    () => { throw new Error('NetworkError'); },
    () => new Promise(() => {}),          // colgado → timeout del servicio
    () => ({ routes: [] })                // sin rutas utilizables
  ];
  for (const falla of fallos) {
    const { servicio } = montarServicio({ google: falla, osrm: OSRM_OK, timeoutMs: 150 });
    const { stale, route } = await servicio.computeNavigationRoute(EXTREMOS);
    assert.equal(stale, false);
    assert.equal(route?.provider, 'osrm', `el fallo ${falla} no degrado a OSRM`);
  }
});

test('si tambien OSRM falla, la respuesta es honesta: route null, sin lanzar', async () => {
  const { servicio } = montarServicio({ google: null, osrm: new Error('OSRM caido') });
  const { stale, route } = await servicio.computeNavigationRoute(EXTREMOS);
  assert.equal(stale, false);
  assert.equal(route, null);
});

// --------------------------------------------------------------------------
// §5/§6 — La peticion a Google usa la superficie y la mascara declaradas
// --------------------------------------------------------------------------

test('computeRoutes recibe DRIVING, es-419, METRIC y SOLO los campos de la mascara', async () => {
  const { servicio, llamadas } = montarServicio({
    google: { routes: [rutaGoogleCruda()] },
    osrm: OSRM_OK
  });
  const { route } = await servicio.computeNavigationRoute(EXTREMOS);
  assert.equal(route.provider, 'google');
  const request = llamadas.compute[0];
  assert.equal(request.travelMode, 'DRIVING');
  assert.equal(request.languageCode, 'es-419');
  assert.equal(request.units, 'METRIC');
  assert.deepEqual(request.fields, [...GOOGLE_ROUTE_FIELDS]);
  assert.deepEqual(request.origin, { location: { lat: 10.64, lng: -71.61 } });
  // Y sin DirectionsService ni DistanceMatrix en ninguna parte del modulo.
  const fuente = leer('src/services/navigationRoute.js');
  assert.ok(!fuente.includes('DirectionsService'));
  assert.ok(!fuente.includes('DistanceMatrix'));
});

// --------------------------------------------------------------------------
// §18/§28 — Respuestas zombi
// --------------------------------------------------------------------------

test('una ruta vieja que resuelve tarde llega marcada stale y no puede pintarse', async () => {
  let soltarA;
  const { servicio } = montarServicio({
    google: (request) => (request.destination.location.lat === 10.66
      ? new Promise(resolve => { soltarA = () => resolve({ routes: [rutaGoogleCruda()] }); })
      : { routes: [rutaGoogleCruda()] }),
    osrm: OSRM_OK
  });

  const vieja = servicio.computeNavigationRoute(EXTREMOS); // destino A (10.66)
  const nueva = await servicio.computeNavigationRoute({
    origin: EXTREMOS.origin, destination: { lat: 10.70, lng: -71.63 }
  });
  assert.equal(nueva.stale, false);
  assert.ok(nueva.route);

  soltarA();
  const resultadoViejo = await vieja;
  assert.equal(resultadoViejo.stale, true, 'la vieja no puede pisar a la nueva');
  assert.equal(resultadoViejo.route, null);
});

// --------------------------------------------------------------------------
// §20 — Extremos canonicos, jamas texto
// --------------------------------------------------------------------------

test('el servicio exige coordenadas: con texto o extremos invalidos lanza', async () => {
  const { servicio } = montarServicio({ google: null, osrm: OSRM_OK });
  for (const malos of [
    {},
    { origin: { lat: 10.6 }, destination: EXTREMOS.destination },
    { origin: 'Sambil Maracaibo', destination: EXTREMOS.destination }
  ]) {
    await assert.rejects(() => servicio.computeNavigationRoute(malos), new RegExp(ROUTES_ERROR.INVALID_ENDPOINTS));
  }
});

// --------------------------------------------------------------------------
// §2/§11/§29 — Aislamiento de la TARIFA
// --------------------------------------------------------------------------

test('una distancia absurda de Google no toca la tarifa: el dinero sigue en OSRM', async () => {
  const absurda = rutaGoogleCruda();
  absurda.distanceMeters = 999999;
  const { servicio } = montarServicio({ google: { routes: [absurda] }, osrm: OSRM_OK });
  const { route } = await servicio.computeNavigationRoute(EXTREMOS);
  assert.equal(route.distanceMeters, 999999, 'la navegacion puede decir lo que quiera');

  // La tarifa ni conoce este modulo: fareCalculator no lo importa y sigue
  // llamando a OSRM; y las pantallas siguen calculando el precio desde el
  // camino OSRM de siempre (drawRoute -> fareCalculator.calculateFare).
  const fare = leer('src/services/fareCalculator.js');
  assert.ok(fare.includes('router.project-osrm.org'));
  assert.ok(!fare.includes('navigationRoute'), 'la tarifa no puede importar navegacion');
  const pasajero = leer('src/pages/passenger/passengerApp.js');
  assert.ok(pasajero.includes('mapComponent.drawRoute(pickup, [lat, lon]).then(routeInfo'),
    'el refinado del precio sigue colgando del camino OSRM de drawRoute');
  const mapa = leer('src/components/mapComponent.js');
  assert.ok(mapa.includes('fareCalculator.calculateRoute'),
    'drawRoute sigue calculando con OSRM: la tarifa no cambia de manos');
});

// --------------------------------------------------------------------------
// §30 — Aislamiento del DESPACHO
// --------------------------------------------------------------------------

test('el despacho ni conoce el modulo de navegacion', () => {
  const indice = leer('server/index.js');
  assert.ok(!indice.includes('navigationRoute'), 'el servidor no importa navegacion');
  assert.ok(!indice.toLowerCase().includes('computeroutes'), 'el servidor no llama a Google Routes');
  const elegibilidad = leer('server/domain/dispatchEligibility.js');
  assert.ok(!elegibilidad.toLowerCase().includes('google'));
  // La ventana de oferta sigue intacta (tambien vigilada por sus suites).
  assert.ok(indice.includes('offerExpiresAt: Date.now() + 15000'));
});

// --------------------------------------------------------------------------
// §14 — NAVEGAR sigue en su sitio
// --------------------------------------------------------------------------

test('el boton NAVEGAR sigue presente: la navegacion interna aun no esta validada', () => {
  const mapa = leer('src/components/mapComponent.js');
  assert.ok(mapa.includes('>NAVEGAR</a>'), 'NAVEGAR no puede retirarse hasta MAPS-2C');
});

// --------------------------------------------------------------------------
// El render normalizado existe y es puro (capacidad para MAPS-2C)
// --------------------------------------------------------------------------

test('MapComponent puede pintar una ruta normalizada sin tocar tarifa ni banner', () => {
  const mapa = leer('src/components/mapComponent.js');
  // De la definicion del metodo hasta la DEFINICION de clearRoute (no hasta
  // la llamada interna this.clearRoute() que vive dentro del propio metodo).
  const bloque = mapa.slice(
    mapa.search(/^  drawNavigationRoute\(/m),
    mapa.search(/^  clearRoute\(\) \{/m)
  );
  assert.ok(bloque.includes('route.path.map(p => [p.lat, p.lng])'), 'consume el contrato neutro');
  assert.ok(!bloque.includes('fareCalculator'), 'el render normalizado no calcula nada');
  assert.ok(!bloque.includes('_showNavigationBanner'), 'el banner de guia es de MAPS-2C');
});
