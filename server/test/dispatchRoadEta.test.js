import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankCandidatesByRoadEta } from '../domain/candidateRanking.js';
import { createRouteMatrixClient, parseDurationMillis, ROUTE_MATRIX_ERROR } from '../services/routeMatrixClient.js';
import { createDispatchRanker, isDispatchRouteMatrixEnabled, DEFAULT_MATRIX_MAX_CANDIDATES, DEFAULT_MATRIX_TIMEOUT_MS } from '../services/dispatchRanking.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(serverDir, relativo), 'utf8');
const sinComentarios = fuente => fuente
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');

/**
 * DISPATCH-2A: el ranking por ETA real solo puede REORDENAR a los ya
 * elegibles. Dormido por defecto; fail closed sin credencial; cualquier
 * fallo devuelve el orden actual; y ni la elegibilidad, ni el radio, ni la
 * ventana de 15 s, ni PUSH-3A, ni la tarifa se enteran de que existe.
 */

const candidato = (id, dist, lat = 10.64, lng = -71.61) =>
  ({ driver: { id, location: { lat, lng } }, dist });

// --------------------------------------------------------------------------
// La bandera y el estado de produccion tras el release
// --------------------------------------------------------------------------

test('la bandera es explicita y su defecto es APAGADO', () => {
  for (const apagado of [undefined, '', 'false', '0', 'no', 'FALSE ', 'off']) {
    assert.equal(isDispatchRouteMatrixEnabled(apagado), false, String(apagado));
  }
  for (const encendido of ['true', '1', 'yes', 'ON ']) {
    assert.equal(isDispatchRouteMatrixEnabled(encendido), true, encendido);
  }
});

test('§23: apagado = CERO llamadas a Google y el orden actual intacto', async () => {
  let llamadas = 0;
  const ranker = createDispatchRanker({
    enabled: false,
    matrixClient: { isConfigured: () => true, computeToPickup: async () => { llamadas += 1; return []; } }
  });
  const originales = [candidato('a', 1), candidato('b', 2)];
  const { candidates, source } = await ranker.rank({ pickup: { lat: 10.64, lng: -71.61 }, candidates: originales });
  assert.equal(llamadas, 0);
  assert.equal(source, 'fallback');
  assert.deepEqual(candidates.map(c => c.driver.id), ['a', 'b']);
});

test('§24: bandera encendida SIN credencial = fail closed, sin secretos y sin caida', async () => {
  const avisos = [];
  const ranker = createDispatchRanker({
    enabled: true,
    matrixClient: { isConfigured: () => false, computeToPickup: async () => { throw new Error('no debia'); } },
    logger: { warn: mensaje => avisos.push(mensaje), log: () => {} }
  });
  assert.equal(ranker.enabled, false, 'sin credencial el ranking queda desactivado');
  assert.ok(avisos[0].includes('DESACTIVADO'));
  assert.ok(!avisos.join(' ').match(/AIza|key=|Bearer/i), 'ningun material de credencial en los avisos');
  const { source } = await ranker.rank({ pickup: { lat: 10.64, lng: -71.61 }, candidates: [candidato('a', 1), candidato('b', 2)] });
  assert.equal(source, 'fallback');
});

// --------------------------------------------------------------------------
// §22 — mas cerca en linea recta pero mas lento por carretera
// --------------------------------------------------------------------------

test('§22: el geograficamente cercano con ETA de 12 min cede ante el lejano con 5 min', async () => {
  const ranker = createDispatchRanker({
    enabled: true,
    matrixClient: {
      isConfigured: () => true,
      computeToPickup: async () => [
        { originIndex: 0, etaMillis: 12 * 60_000, roadDistanceMeters: 900 },   // A: cerca pero lento
        { originIndex: 1, etaMillis: 5 * 60_000, roadDistanceMeters: 2400 }    // B: mas lejos pero rapido
      ]
    },
    logger: { log: () => {}, warn: () => {} }
  });
  const { candidates, source } = await ranker.rank({
    pickup: { lat: 10.64, lng: -71.61 },
    candidates: [candidato('A', 0.8), candidato('B', 2.1)]
  });
  assert.equal(source, 'google');
  assert.deepEqual(candidates.map(c => c.driver.id), ['B', 'A'],
    'la carretera real manda sobre la linea recta');
});

test('empates deterministas: misma ETA → distancia geografica → orden estable', () => {
  const { ordered } = rankCandidatesByRoadEta(
    [candidato('a', 3.0), candidato('b', 1.0), candidato('c', 1.0)],
    [
      { originIndex: 0, etaMillis: 300_000 },
      { originIndex: 1, etaMillis: 300_000 },
      { originIndex: 2, etaMillis: 300_000 }
    ]
  );
  assert.deepEqual(ordered.map(c => c.driver.id), ['b', 'c', 'a'],
    'ETA igual → gana la distancia; distancia igual → el orden original');
});

// --------------------------------------------------------------------------
// §26/§12 — resultado parcial: nadie desaparece
// --------------------------------------------------------------------------

test('§26: sin ruta para B, B queda DETRAS en su orden actual — jamas fuera', async () => {
  const ranker = createDispatchRanker({
    enabled: true,
    matrixClient: {
      isConfigured: () => true,
      computeToPickup: async () => [
        { originIndex: 0, etaMillis: 600_000 },
        { originIndex: 2, etaMillis: 240_000 }
        // B (indice 1): Google no encontro ruta
      ]
    },
    logger: { log: () => {}, warn: () => {} }
  });
  const originales = [candidato('A', 1), candidato('B', 2), candidato('C', 3)];
  const { candidates } = await ranker.rank({ pickup: { lat: 10.64, lng: -71.61 }, candidates: originales });
  assert.deepEqual(candidates.map(c => c.driver.id), ['C', 'A', 'B'],
    'los con ETA por delante (C 4min, A 10min); B al final, presente');
  assert.equal(candidates.length, 3, 'NO_ROUTE_REMOVES_ELIGIBLE_DRIVER: NO');
});

// --------------------------------------------------------------------------
// §25/§27/§13/§15 — fallos totales y cuelgues: el despacho continua
// --------------------------------------------------------------------------

test('§25: el proveedor colgado vence por SU timeout y el despacho sigue con el orden actual', async () => {
  const cliente = createRouteMatrixClient({
    apiKey: 'clave-de-prueba-que-no-debe-filtrarse',
    timeoutMs: 100,
    fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('abortado');
        error.name = 'AbortError';
        reject(error);
      });
    }),
    logger: { warn: () => {} }
  });
  const inicio = Date.now();
  await assert.rejects(() => cliente.computeToPickup([{ lat: 10.6, lng: -71.6 }], { lat: 10.7, lng: -71.7 }),
    new RegExp(ROUTE_MATRIX_ERROR.TIMEOUT));
  assert.ok(Date.now() - inicio < 1000, 'el presupuesto es duro, no indefinido');

  const ranker = createDispatchRanker({
    enabled: true,
    matrixClient: { isConfigured: () => true, computeToPickup: () => new Promise((_, r) => setTimeout(() => r(new Error(ROUTE_MATRIX_ERROR.TIMEOUT)), 50)) },
    logger: { log: () => {}, warn: () => {} }
  });
  const originales = [candidato('a', 1), candidato('b', 2)];
  const { candidates, source } = await ranker.rank({ pickup: { lat: 10.64, lng: -71.61 }, candidates: originales });
  assert.equal(source, 'fallback');
  assert.deepEqual(candidates.map(c => c.driver.id), ['a', 'b'], 'GOOGLE_FAILURE_BLOCKS_DISPATCH: NO');
});

test('§27: auth/cuota/red/respuesta rara/cero elementos → orden actual, siempre', async () => {
  const fallos = [
    async () => { throw new Error(ROUTE_MATRIX_ERROR.PROVIDER_ERROR); },
    async () => { throw new Error(ROUTE_MATRIX_ERROR.MALFORMED); },
    async () => []
  ];
  for (const falla of fallos) {
    const ranker = createDispatchRanker({
      enabled: true,
      matrixClient: { isConfigured: () => true, computeToPickup: falla },
      logger: { log: () => {}, warn: () => {} }
    });
    const { candidates, source } = await ranker.rank({
      pickup: { lat: 10.64, lng: -71.61 },
      candidates: [candidato('a', 1), candidato('b', 2)]
    });
    assert.equal(source, 'fallback');
    assert.deepEqual(candidates.map(c => c.driver.id), ['a', 'b']);
  }
});

// --------------------------------------------------------------------------
// §2/§28 — Google jamas añade ni resucita inelegibles
// --------------------------------------------------------------------------

test('el ranking devuelve EXACTAMENTE el conjunto elegible: ni uno mas, ni uno menos', async () => {
  // Resultados de matriz con indices fuera de rango y duplicados maliciosos:
  // nada de eso puede inyectar un conductor.
  const { ordered } = rankCandidatesByRoadEta(
    [candidato('a', 1), candidato('b', 2)],
    [
      { originIndex: 0, etaMillis: 100 },
      { originIndex: 7, etaMillis: 1 },          // fuera de rango: ignorado
      { originIndex: -1, etaMillis: 1 },         // invalido: ignorado
      { originIndex: 0, etaMillis: 999_999 }     // duplicado: ignorado
    ]
  );
  assert.deepEqual(ordered.map(c => c.driver.id).sort(), ['a', 'b'],
    'GOOGLE_CAN_ADD_INELIGIBLE_DRIVER: NO');
  // Y la frontera del pipeline: el ranker corre DESPUES de
  // selectEligibleDrivers, sobre session.candidates ya filtrados — los
  // NO_SOCKET/OFFLINE/STALE_LOCATION jamas llegan aqui (sus suites propias
  // siguen vigilando la elegibilidad).
  const indice = sinComentarios(leer('index.js'));
  const posElegibles = indice.indexOf('selectEligibleDrivers({');
  const posRanking = indice.indexOf('dispatchRanker.rank({');
  assert.ok(posElegibles > 0 && posRanking > posElegibles,
    'el ranking vive despues de la elegibilidad');
  assert.ok(indice.includes('candidates.length === session.candidates.length'),
    'solo se adopta un resultado con el MISMO numero de candidatos');
});

// --------------------------------------------------------------------------
// Lista corta, presupuesto y una llamada por ciclo
// --------------------------------------------------------------------------

test('la lista corta acota la matriz y el resto conserva su lugar detras', async () => {
  let origenesEnviados = null;
  const ranker = createDispatchRanker({
    enabled: true,
    maxCandidates: 2,
    matrixClient: {
      isConfigured: () => true,
      computeToPickup: async (origins) => {
        origenesEnviados = origins.length;
        return [
          { originIndex: 0, etaMillis: 500_000 },
          { originIndex: 1, etaMillis: 100_000 }
        ];
      }
    },
    logger: { log: () => {}, warn: () => {} }
  });
  const originales = [candidato('a', 1), candidato('b', 2), candidato('c', 3), candidato('d', 4)];
  const { candidates } = await ranker.rank({ pickup: { lat: 10.64, lng: -71.61 }, candidates: originales });
  assert.equal(origenesEnviados, 2, 'solo la lista corta viaja a Google');
  assert.deepEqual(candidates.map(c => c.driver.id), ['b', 'a', 'c', 'd'],
    'los rankeados delante; c y d detras en su orden actual');
});

test('una sola llamada de matriz por ciclo de ranking', async () => {
  let llamadas = 0;
  const ranker = createDispatchRanker({
    enabled: true,
    matrixClient: { isConfigured: () => true, computeToPickup: async () => { llamadas += 1; return [{ originIndex: 0, etaMillis: 1000 }]; } },
    logger: { log: () => {}, warn: () => {} }
  });
  await ranker.rank({ pickup: { lat: 10.64, lng: -71.61 }, candidates: [candidato('a', 1), candidato('b', 2)] });
  assert.equal(llamadas, 1);
  // Y con UN solo candidato ni siquiera se llama: no hay nada que ordenar.
  await ranker.rank({ pickup: { lat: 10.64, lng: -71.61 }, candidates: [candidato('a', 1)] });
  assert.equal(llamadas, 1);
});

// --------------------------------------------------------------------------
// El cliente REST: contrato minimo y privacidad
// --------------------------------------------------------------------------

test('la peticion lleva SOLO datos de enrutado y la mascara minima', async () => {
  let capturada = null;
  const cliente = createRouteMatrixClient({
    apiKey: 'clave-de-prueba-que-no-debe-filtrarse',
    fetchImpl: async (url, opciones) => {
      capturada = { url, opciones };
      return { ok: true, json: async () => [{ originIndex: 0, condition: 'ROUTE_EXISTS', duration: '300s', distanceMeters: 2500 }] };
    }
  });
  const resultados = await cliente.computeToPickup(
    [{ lat: 10.64, lng: -71.61 }],
    { lat: 10.65, lng: -71.6 }
  );
  assert.equal(resultados[0].etaMillis, 300_000);
  assert.equal(resultados[0].roadDistanceMeters, 2500);

  assert.ok(capturada.url.startsWith('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'));
  assert.equal(capturada.opciones.headers['X-Goog-FieldMask'],
    'originIndex,destinationIndex,condition,duration,distanceMeters',
    'sin polilineas, sin pasos, sin peajes, sin textos');
  const body = JSON.parse(capturada.opciones.body);
  assert.equal(body.travelMode, 'DRIVE');
  assert.ok(!('languageCode' in body) && !('units' in body));
  const volcado = capturada.opciones.body.toLowerCase();
  for (const prohibido of ['name', 'phone', 'email', 'driverid', 'token', 'jwt']) {
    assert.ok(!volcado.includes(prohibido), `la peticion contiene "${prohibido}"`);
  }
});

test('las duraciones del proveedor se interpretan con rigor', () => {
  assert.equal(parseDurationMillis('300s'), 300_000);
  assert.equal(parseDurationMillis('12.5s'), 12_500);
  assert.equal(parseDurationMillis('300'), null);
  assert.equal(parseDurationMillis(''), null);
  assert.equal(parseDurationMillis(undefined), null);
});

test('sin credencial el cliente lanza su codigo escueto y jamas toca la red', async () => {
  let toco = false;
  const cliente = createRouteMatrixClient({ apiKey: '', fetchImpl: async () => { toco = true; } });
  assert.equal(cliente.isConfigured(), false);
  await assert.rejects(() => cliente.computeToPickup([{ lat: 1, lng: 1 }], { lat: 2, lng: 2 }),
    new RegExp(ROUTE_MATRIX_ERROR.NOT_CONFIGURED));
  assert.equal(toco, false);
});

// --------------------------------------------------------------------------
// §29-§32 — lo intocable, en estatico (mas sus suites propias)
// --------------------------------------------------------------------------

test('la ventana de 15000 ms, PUSH-3A y la tarifa ni se enteran del ranking', () => {
  const indice = sinComentarios(leer('index.js'));
  assert.ok(indice.includes('offerExpiresAt: Date.now() + 15000'), 'la ventana no se toca');
  assert.ok(indice.includes('pushService.notifyRideOffer(trip, candidate.driver.id)'),
    'PUSH-3A identico');
  const fare = fs.readFileSync(path.join(serverDir, '..', 'src', 'services', 'fareCalculator.js'), 'utf8');
  assert.ok(!fare.toLowerCase().includes('matrix'), 'la tarifa no importa la matriz');
  const navegacion = fs.readFileSync(path.join(serverDir, '..', 'src', 'services', 'navigationRoute.js'), 'utf8');
  assert.ok(!navegacion.includes('computeRouteMatrix'), 'la navegacion del conductor es otra via');
  // Y la clave del navegador jamas se reusa en el servidor: la credencial es
  // una variable DEDICADA.
  const clienteFuente = leer('services/routeMatrixClient.js');
  assert.ok(clienteFuente.includes('DISPATCH_ROUTES_API_KEY'));
  assert.ok(!clienteFuente.includes('VITE_GOOGLE_MAPS_API_KEY'),
    'BROWSER_GOOGLE_KEY_REUSED_SERVER_SIDE: NO');
});

test('los valores por defecto documentados existen y son conservadores', () => {
  assert.equal(DEFAULT_MATRIX_MAX_CANDIDATES, 5);
  assert.equal(DEFAULT_MATRIX_TIMEOUT_MS, 1500);
  assert.ok(DEFAULT_MATRIX_TIMEOUT_MS < 15000 / 2, 'muy por debajo de la ventana de oferta');
});
