import test from 'node:test';
import assert from 'node:assert/strict';

import { adelgazarRuta, decodificarPolilinea } from '../domain/polilinea.js';
import {
  SIN_RUTA,
  UMBRAL_DE_RECALCULO_METROS,
  hayQueRecalcular,
  metrosEntre,
  tramoDeLaRuta
} from '../domain/rutaDelViaje.js';
import {
  ROUTE_GEOMETRY_ERROR,
  createRouteGeometryClient,
  leerRespuestaDeRutas,
  parseDurationMillis
} from '../services/routeGeometryClient.js';

/**
 * LA RUTA DEL VIAJE — geometría, tramo y recálculo (ROUTE-1)
 *
 * Todo lo que se comprueba aquí es PURO: se decide sin red, sin reloj y sin
 * base de datos. Es a propósito, y es la razón de que estas tres piezas vivan
 * separadas del cliente HTTP: una ruta mal decodificada o un tramo mal elegido
 * no lanzan ningún error —dibujan la línea en otro sitio, o dibujan la línea
 * equivocada— y eso sólo se ve mirando el mapa. Aquí se ve antes.
 */

// ---------------------------------------------------------------------------
// La polilínea
// ---------------------------------------------------------------------------

test('decodifica la polilínea del ejemplo oficial de Google', () => {
  // `_p~iF~ps|U_ulLnnqC_mqNvxq`@` es el ejemplo que publica Google con su
  // formato, y sus tres puntos son conocidos. Si esto se rompe, la ruta entera
  // se dibuja desplazada y en pantalla parece un mapa roto, no un fallo.
  const puntos = decodificarPolilinea('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

  assert.equal(puntos.length, 3);
  assert.deepEqual(puntos.map(p => [Number(p.lat.toFixed(5)), Number(p.lng.toFixed(5))]), [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453]
  ]);
});

test('una cadena que no es una polilínea da una ruta vacía, no una excepción', () => {
  // Degradar a «no hay ruta» es honesto; tumbar la petición que la pidió, no.
  for (const basura of ['', 'no soy una polilínea', '???', null, undefined, 42, {}]) {
    assert.deepEqual(decodificarPolilinea(basura), [], String(basura));
  }
});

test('una polilínea cortada a la mitad no devuelve medio punto', () => {
  // Se corta el último número por la mitad: leer «lo que se pueda» produciría
  // una coordenada inventada al final de la ruta.
  const entera = '_p~iF~ps|U_ulLnnqC';
  assert.equal(decodificarPolilinea(entera).length, 2);
  assert.deepEqual(decodificarPolilinea(entera.slice(0, -1)), []);
});

test('el adelgazado conserva las curvas y se lleva los tramos rectos', () => {
  // Una L: dos tramos rectos partidos en muchos puntos y UN vértice. Lo que no
  // puede perderse es el vértice; lo que sobra son los puntos intermedios.
  const puntos = [];
  for (let i = 0; i <= 10; i += 1) puntos.push({ lat: 10, lng: 10 + i * 0.001 });
  for (let i = 1; i <= 10; i += 1) puntos.push({ lat: 10 + i * 0.001, lng: 10.01 });

  const fino = adelgazarRuta(puntos);

  assert.ok(fino.length < puntos.length, 'no adelgazó nada');
  assert.deepEqual(fino[0], puntos[0], 'se perdió el principio');
  assert.deepEqual(fino[fino.length - 1], puntos[puntos.length - 1], 'se perdió el final');
  // El vértice de la L sigue ahí: sin él la ruta cortaría por el aire.
  assert.ok(
    fino.some(p => Math.abs(p.lat - 10) < 1e-9 && Math.abs(p.lng - 10.01) < 1e-9),
    'se perdió la esquina'
  );
});

test('una ruta de dos puntos no se toca', () => {
  const dos = [{ lat: 10, lng: -71 }, { lat: 10.01, lng: -71.01 }];
  assert.deepEqual(adelgazarRuta(dos), dos);
});

// ---------------------------------------------------------------------------
// El tramo, según el momento del viaje
// ---------------------------------------------------------------------------

const RECOGIDA = { lat: 10.6667, lng: -71.6167 };
const DESTINO = { lat: 10.68, lng: -71.63 };
const MOTO = { lat: 10.66, lng: -71.61 };

const viaje = (status, extra = {}) => ({
  status,
  pickup: RECOGIDA,
  destination: DESTINO,
  ...extra
});

test('con conductor asignado, la ruta va de la moto a la recogida', () => {
  const tramo = tramoDeLaRuta(viaje('DRIVER_ASSIGNED'), MOTO);
  assert.equal(tramo.ok, true);
  assert.equal(tramo.tramo, 'A_RECOGIDA');
  assert.deepEqual(tramo.origen, MOTO);
  assert.deepEqual(tramo.destino, RECOGIDA);
});

test('los alias históricos del estado cuentan igual', () => {
  // ACCEPTED, EN_ROUTE y DRIVER_ARRIVING son el mismo momento con otro nombre,
  // y la persistencia todavía guarda viajes con ellos.
  for (const alias of ['ACCEPTED', 'EN_ROUTE', 'DRIVER_ARRIVING']) {
    assert.equal(tramoDeLaRuta(viaje(alias), MOTO).tramo, 'A_RECOGIDA', alias);
  }
  assert.equal(tramoDeLaRuta(viaje('IN_TRIP'), MOTO).tramo, 'A_DESTINO', 'IN_TRIP');
});

test('en marcha, la ruta va de la moto al destino, no desde la recogida', () => {
  // A mitad de carrera lo que falta es lo que falta. Trazar desde la recogida
  // dibujaría un trozo ya recorrido.
  const tramo = tramoDeLaRuta(viaje('IN_PROGRESS'), MOTO);
  assert.equal(tramo.tramo, 'A_DESTINO');
  assert.deepEqual(tramo.origen, MOTO);
  assert.deepEqual(tramo.destino, DESTINO);
});

test('en marcha sin posición de la moto, se traza desde la recogida', () => {
  // Es la ruta del viaje, no una posición inventada: las dos son ciertas.
  const tramo = tramoDeLaRuta(viaje('IN_PROGRESS'), null);
  assert.equal(tramo.ok, true);
  assert.deepEqual(tramo.origen, RECOGIDA);
});

test('al llegar NO hay ruta, y es deliberado', () => {
  // La moto está en la puerta: la ruta hasta la recogida ya no significa nada,
  // y la del destino todavía no ha empezado. Dibujar cualquiera de las dos
  // sería decir algo que no está pasando.
  const tramo = tramoDeLaRuta(viaje('ARRIVED'), MOTO);
  assert.equal(tramo.ok, false);
  assert.equal(tramo.motivo, SIN_RUTA.ESTADO);
});

test('un viaje terminado no conserva ruta activa', () => {
  for (const estado of ['COMPLETED', 'CANCELLED']) {
    const tramo = tramoDeLaRuta(viaje(estado), MOTO);
    assert.equal(tramo.ok, false, estado);
    assert.equal(tramo.motivo, SIN_RUTA.ESTADO, estado);
  }
});

test('sin coordenadas no se inventa ningún extremo', () => {
  // Un viaje puede no traerlas: quien lo pidió escribió la dirección a mano.
  assert.equal(tramoDeLaRuta({ status: 'DRIVER_ASSIGNED', pickup: null }, MOTO).motivo, SIN_RUTA.SIN_COORDENADAS);
  assert.equal(tramoDeLaRuta(viaje('DRIVER_ASSIGNED'), null).motivo, SIN_RUTA.SIN_COORDENADAS);
  // `0,0` es el Golfo de Guinea, no una coordenada que alguien haya señalado.
  assert.equal(tramoDeLaRuta(viaje('DRIVER_ASSIGNED'), { lat: 0, lng: 0 }).motivo, SIN_RUTA.SIN_COORDENADAS);
});

// ---------------------------------------------------------------------------
// El recálculo
// ---------------------------------------------------------------------------

test('moverse poco NO pide otra ruta', () => {
  // El GPS llega cada pocos segundos. Pedir una ruta nueva con cada uno serían
  // cientos de llamadas de pago por carrera para redibujar lo mismo.
  const vigente = { tramo: 'A_RECOGIDA', origen: MOTO, destino: RECOGIDA };
  const apenas = { lat: MOTO.lat + 0.0002, lng: MOTO.lng }; // ~22 m
  assert.ok(metrosEntre(MOTO, apenas) < UMBRAL_DE_RECALCULO_METROS);
  assert.equal(hayQueRecalcular(vigente, { tramo: 'A_RECOGIDA', origen: apenas, destino: RECOGIDA }), false);
});

test('desviarse de verdad SÍ pide otra ruta', () => {
  const vigente = { tramo: 'A_RECOGIDA', origen: MOTO, destino: RECOGIDA };
  const lejos = { lat: MOTO.lat + 0.005, lng: MOTO.lng }; // ~550 m
  assert.ok(metrosEntre(MOTO, lejos) > UMBRAL_DE_RECALCULO_METROS);
  assert.equal(hayQueRecalcular(vigente, { tramo: 'A_RECOGIDA', origen: lejos, destino: RECOGIDA }), true);
});

test('cambiar de tramo siempre pide otra ruta, por cerca que se esté', () => {
  // Al pulsar INICIAR la moto no se ha movido, pero lo que hay que dibujar es
  // otra cosa por completo.
  const vigente = { tramo: 'A_RECOGIDA', origen: MOTO, destino: RECOGIDA };
  assert.equal(hayQueRecalcular(vigente, { tramo: 'A_DESTINO', origen: MOTO, destino: DESTINO }), true);
});

test('sin ruta vigente, se pide', () => {
  assert.equal(hayQueRecalcular(null, { tramo: 'A_RECOGIDA', origen: MOTO, destino: RECOGIDA }), true);
});

// ---------------------------------------------------------------------------
// El proveedor
// ---------------------------------------------------------------------------

test('sin credencial, el cliente lo dice y no llama a nadie', async () => {
  let llamadas = 0;
  const cliente = createRouteGeometryClient({
    apiKey: '',
    fetchImpl: () => { llamadas += 1; return Promise.reject(new Error('no debería llegar aquí')); }
  });

  assert.equal(cliente.isConfigured(), false);
  await assert.rejects(
    () => cliente.computeRoute(MOTO, RECOGIDA),
    /ROUTE_GEOMETRY_NOT_CONFIGURED/
  );
  assert.equal(llamadas, 0, 'llamó al proveedor sin credencial');
});

test('la máscara de campos pide la polilínea y NADA más', async () => {
  // Pasos, peajes e instrucciones se pagan y no se usan. Y la credencial viaja
  // en su cabecera, nunca en la URL ni en el cuerpo.
  let visto = null;
  const cliente = createRouteGeometryClient({
    apiKey: 'clave-de-prueba',
    fetchImpl: (url, opciones) => {
      visto = { url, opciones };
      return Promise.resolve({
        ok: true,
        json: async () => ({ routes: [{ polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' }, distanceMeters: 1200, duration: '300s' }] })
      });
    }
  });

  const ruta = await cliente.computeRoute(MOTO, RECOGIDA);

  assert.equal(visto.opciones.headers['X-Goog-FieldMask'], 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration');
  assert.ok(!visto.url.includes('clave-de-prueba'), 'la credencial acabó en la URL');
  assert.ok(!visto.opciones.body.includes('clave-de-prueba'), 'la credencial acabó en el cuerpo');
  assert.equal(ruta.metros, 1200);
  assert.equal(ruta.duracionMs, 300000);
  assert.equal(ruta.puntos.length, 2);
});

test('al proveedor sólo le viajan coordenadas y el modo de viaje', () => {
  // Ni nombres, ni teléfonos, ni identificadores de viaje, ni JWT.
  let visto = null;
  const cliente = createRouteGeometryClient({
    apiKey: 'clave-de-prueba',
    fetchImpl: (_url, opciones) => {
      visto = JSON.parse(opciones.body);
      return Promise.resolve({ ok: true, json: async () => ({ routes: [] }) });
    }
  });

  return cliente.computeRoute(MOTO, RECOGIDA).catch(() => {
    assert.deepEqual(Object.keys(visto).sort(), [
      'computeAlternativeRoutes', 'destination', 'languageCode', 'origin',
      'polylineQuality', 'routingPreference', 'travelMode', 'units'
    ]);
  });
});

test('una respuesta sin ruta utilizable NO se convierte en una recta', () => {
  // Es la regla entera de esta fase: una recta sobre un mapa se lee como «por
  // aquí se va», y por ahí puede no haber calle.
  assert.equal(leerRespuestaDeRutas({}), null);
  assert.equal(leerRespuestaDeRutas({ routes: [] }), null);
  assert.equal(leerRespuestaDeRutas({ routes: [{ polyline: {} }] }), null);
  // Un solo punto no es una línea: publicarlo pintaría una mancha.
  assert.equal(leerRespuestaDeRutas({ routes: [{ polyline: { encodedPolyline: '_p~iF~ps|U' } }] }), null);
});

test('un proveedor caído lanza, y no devuelve geometría a medias', async () => {
  const cliente = createRouteGeometryClient({
    apiKey: 'clave-de-prueba',
    fetchImpl: () => Promise.resolve({ ok: false, status: 503 })
  });
  await assert.rejects(() => cliente.computeRoute(MOTO, RECOGIDA), new RegExp(ROUTE_GEOMETRY_ERROR.PROVIDER_ERROR));
});

test('la duración se lee en el formato del proveedor, y sólo en ése', () => {
  assert.equal(parseDurationMillis('300s'), 300000);
  assert.equal(parseDurationMillis('12.5s'), 12500);
  for (const malo of ['300', '5m', '', null, undefined, 'abcs']) {
    assert.equal(parseDurationMillis(malo), null, String(malo));
  }
});
