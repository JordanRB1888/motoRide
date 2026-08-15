import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createGoogleRoutesService,
  extractRouteMetrics,
  parseDurationToMinutes
} from '../services/googleRoutes.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MARACAIBO = { lat: 10.6427, lng: -71.6125 };
const DESTINO = { lat: 10.68, lng: -71.63 };

/** Respuesta simulada de la Routes API. */
const respuesta = (body, { ok = true, status = 200 } = {}) => ({
  ok, status, json: async () => body
});

function servicio({ responder, apiKey = 'clave-de-prueba', timeoutMs } = {}) {
  const llamadas = [];
  const diagnosticos = [];
  const service = createGoogleRoutesService({
    apiKey,
    timeoutMs,
    onDiagnostic: d => diagnosticos.push(d),
    fetchImpl: async (url, options) => {
      llamadas.push({ url, options });
      return responder ? responder(url, options) : respuesta({ routes: [{ distanceMeters: 4200, duration: '600s' }] });
    }
  });
  return { service, llamadas, diagnosticos };
}

// ------------------------------------------------------------- interpretación

test('la duración llega como cadena de segundos y se convierte a minutos', () => {
  assert.equal(parseDurationToMinutes('600s'), 10);
  assert.equal(parseDurationToMinutes('90s'), 1.5);
  assert.equal(parseDurationToMinutes('0s'), 0);
  assert.equal(parseDurationToMinutes(120), 2, 'un número se interpreta como segundos');
  for (const malo of ['', 'abc', '600', '600m', null, undefined, {}, '-60s']) {
    assert.equal(parseDurationToMinutes(malo), null, `no debía interpretarse: ${String(malo)}`);
  }
});

test('se extraen distancia y duración de una respuesta válida', () => {
  const metrics = extractRouteMetrics({ routes: [{ distanceMeters: 4235, duration: '723s' }] });
  assert.deepEqual(metrics, { distanceKm: 4.235, durationMin: 12.05 });
});

test('una respuesta sin ruta utilizable no inventa valores', () => {
  // Es preferible no calcular la tarifa a calcularla sobre un valor supuesto.
  for (const payload of [
    {}, { routes: [] }, { routes: null },
    { routes: [{}] },
    { routes: [{ distanceMeters: 0, duration: '600s' }] },
    { routes: [{ distanceMeters: -100, duration: '600s' }] },
    { routes: [{ distanceMeters: 4200 }] },
    { routes: [{ distanceMeters: 4200, duration: '0s' }] },
    { routes: [{ distanceMeters: 'lejos', duration: '600s' }] }
  ]) {
    assert.equal(extractRouteMetrics(payload), null, JSON.stringify(payload).slice(0, 50));
  }
});

// ----------------------------------------------------------------- petición

test('la petición lleva la clave, la máscara y el modo de dos ruedas', async () => {
  const { service, llamadas } = servicio();
  const metrics = await service.computeRoute({ origin: MARACAIBO, destination: DESTINO, rideType: 'MOTO' });

  assert.deepEqual(metrics, { distanceKm: 4.2, durationMin: 10 });
  assert.equal(llamadas.length, 1);

  const { url, options } = llamadas[0];
  assert.equal(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['X-Goog-Api-Key'], 'clave-de-prueba');
  assert.equal(options.headers['X-Goog-FieldMask'], 'routes.distanceMeters,routes.duration');

  const cuerpo = JSON.parse(options.body);
  assert.equal(cuerpo.travelMode, 'TWO_WHEELER', 'una moto no circula como un coche');
  assert.equal(cuerpo.routingPreference, 'TRAFFIC_UNAWARE', 'el precio no debe depender del tráfico del instante');
  assert.equal(cuerpo.origin.location.latLng.latitude, MARACAIBO.lat);
  assert.equal(cuerpo.destination.location.latLng.longitude, DESTINO.lng);
});

test('un viaje en automóvil usa el modo de conducción', async () => {
  const { service, llamadas } = servicio();
  await service.computeRoute({ origin: MARACAIBO, destination: DESTINO, rideType: 'CAR' });
  assert.equal(JSON.parse(llamadas[0].options.body).travelMode, 'DRIVE');
});

// ------------------------------------------------------- degradación segura

test('sin clave no se pide nada y el flujo anterior sigue disponible', async () => {
  const { service, llamadas, diagnosticos } = servicio({ apiKey: '' });
  assert.equal(service.isConfigured(), false);
  assert.equal(await service.computeRoute({ origin: MARACAIBO, destination: DESTINO }), null);
  assert.equal(llamadas.length, 0, 'ni una petición a Google sin clave');
  assert.deepEqual(diagnosticos, [{ code: 'NOT_CONFIGURED' }]);
});

test('coordenadas inservibles se descartan antes de gastar una petición', async () => {
  const { service, llamadas } = servicio();
  const malas = [
    null, undefined, {}, { lat: 'x', lng: 1 }, { lat: 91, lng: 0 },
    { lat: 0, lng: 181 }, { lat: 0, lng: 0 }
  ];
  for (const punto of malas) {
    assert.equal(await service.computeRoute({ origin: punto, destination: DESTINO }), null, JSON.stringify(punto));
    assert.equal(await service.computeRoute({ origin: MARACAIBO, destination: punto }), null, JSON.stringify(punto));
  }
  assert.equal(llamadas.length, 0, 'ninguna llamada facturable con datos inservibles');
});

test('un error HTTP devuelve null en vez de romper la creación del viaje', async () => {
  for (const status of [400, 401, 403, 429, 500, 503]) {
    const { service, diagnosticos } = servicio({ responder: () => respuesta({ error: 'x' }, { ok: false, status }) });
    assert.equal(await service.computeRoute({ origin: MARACAIBO, destination: DESTINO }), null);
    assert.deepEqual(diagnosticos, [{ code: 'HTTP_ERROR', status }]);
  }
});

test('una excepción de red no escapa', async () => {
  const { service, diagnosticos } = servicio({ responder: () => { throw new Error('ECONNRESET'); } });
  assert.equal(await service.computeRoute({ origin: MARACAIBO, destination: DESTINO }), null);
  assert.deepEqual(diagnosticos, [{ code: 'REQUEST_FAILED' }]);
});

test('un JSON malformado tampoco escapa', async () => {
  const { service } = servicio({ responder: () => ({ ok: true, status: 200, json: async () => { throw new Error('JSON'); } }) });
  assert.equal(await service.computeRoute({ origin: MARACAIBO, destination: DESTINO }), null);
});

test('una respuesta lenta se aborta y no cuelga la creación del viaje', async () => {
  const { service, diagnosticos } = servicio({
    timeoutMs: 40,
    responder: (_url, options) => new Promise((resolve, reject) => {
      // Se respeta la señal de aborto, como haría fetch de verdad.
      options.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('abortada'), { name: 'AbortError' }));
      });
    })
  });

  const inicio = Date.now();
  assert.equal(await service.computeRoute({ origin: MARACAIBO, destination: DESTINO }), null);
  assert.ok(Date.now() - inicio < 1500, 'no se queda esperando indefinidamente');
  assert.deepEqual(diagnosticos, [{ code: 'TIMEOUT' }]);
});

// -------------------------------------------------------------- privacidad

test('el diagnóstico nunca incluye coordenadas ni la clave', async () => {
  const casos = [
    { apiKey: '' },
    { responder: () => respuesta({}, { ok: false, status: 500 }) },
    { responder: () => respuesta({ routes: [] }) },
    { responder: () => { throw new Error('boom'); } }
  ];
  for (const caso of casos) {
    const { service, diagnosticos } = servicio(caso);
    await service.computeRoute({ origin: MARACAIBO, destination: DESTINO });
    const texto = JSON.stringify(diagnosticos);
    for (const marca of ['10.64', '71.61', '10.68', 'clave-de-prueba', 'lat', 'lng']) {
      assert.ok(!texto.includes(marca), `el diagnóstico no debía contener: ${marca}`);
    }
  }
});

test('la clave viaja en la cabecera, nunca en la URL', async () => {
  const { service, llamadas } = servicio();
  await service.computeRoute({ origin: MARACAIBO, destination: DESTINO });
  assert.ok(!llamadas[0].url.includes('clave-de-prueba'), 'una clave en la URL acaba en los logs del proxy');
  assert.ok(!llamadas[0].url.includes('key='));
});

test('el cliente no puede influir en el resultado', async () => {
  // Se le pasan métricas inventadas junto a las coordenadas: se ignoran, porque
  // el servicio solo mira origen, destino y tipo de vehículo.
  const { service, llamadas } = servicio();
  await service.computeRoute({
    origin: MARACAIBO,
    destination: DESTINO,
    rideType: 'MOTO',
    distanceKm: 0.1,
    durationMin: 0.1,
    fareUSD: 0.5
  });
  const cuerpo = JSON.parse(llamadas[0].options.body);
  assert.deepEqual(Object.keys(cuerpo).sort(), ['destination', 'languageCode', 'origin', 'routingPreference', 'travelMode', 'units']);
});

// ------------------------------------------- integracion con la tarifa

test('la ruta del servidor tiene prioridad sobre las metricas del cuerpo', () => {
  // Pin de contrato: en /api/trips/create la ruta calculada por el servidor se
  // asigna DESPUES de leer el cuerpo, de modo que sobrescribe lo que enviara el
  // cliente. Si alguien invirtiera el orden, el pasajero volveria a fijar la
  // distancia y con ella el importe.
  const fuente = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  const i = fuente.indexOf('routeMetrics = normalizeRouteMetrics(req.body)');
  const j = fuente.indexOf('if (rutaDelServidor) routeMetrics = rutaDelServidor;');
  assert.notEqual(i, -1, 'debe leerse el cuerpo');
  assert.notEqual(j, -1, 'debe calcularse la ruta en el servidor');
  assert.ok(i < j, 'la ruta del servidor debe sobrescribir, no al reves');

  // Y el origen de la tarifa distingue las tres procedencias.
  assert.ok(fuente.includes("'SERVER_ROUTED'"), 'ruta calculada por el servidor');
  assert.ok(fuente.includes("'SERVER_CALCULATED'"), 'metricas del cuerpo');
  assert.ok(fuente.includes("'CLIENT_ESTIMATE'"), 'ultimo recurso');
});

test('el servidor no depende de Google para poder crear un viaje', () => {
  const fuente = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  const i = fuente.indexOf('const rutaDelServidor = await googleRoutes.computeRoute(');
  const bloque = fuente.slice(i, i + 400);
  // No hay ningun return de error atado al resultado: un fallo de Google deja
  // `null` y el flujo continua por el camino anterior.
  assert.ok(!bloque.includes('return res.status'), 'un fallo de Google no puede impedir el viaje');
  assert.ok(bloque.includes('if (rutaDelServidor) routeMetrics = rutaDelServidor;'));
});
