import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCATION_PROVIDER,
  createCanonicalLocation,
  fromGooglePlaceFields,
  fromGpsSample,
  fromMapPoint,
  fromNominatimResult,
  fromPreset
} from '../src/utils/canonicalLocation.js';
import { KNOWN_PLACES, findKnownPlace } from '../src/utils/knownPlaces.js';
import { createPlacesProvider, PLACES_ERROR } from '../src/services/placesService.js';
import { createDestinationSearch } from '../src/services/destinationSearch.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * MAPS-2A: identidad canonica de lugares.
 *
 * Un destino elegido es UN objeto inmutable cuyas lat/lng son la autoridad
 * final: nada se re-geocodifica, ningun proveedor pisa las coordenadas de
 * otro, y marcador, ruta y payload del viaje leen del mismo sitio. Google
 * Places queda listo pero DORMIDO: sin configurar o sin habilitar, el
 * buscador degrada a Nominatim sin romper nada.
 */

// --------------------------------------------------------------------------
// El modelo: todos los proveedores producen el MISMO contrato
// --------------------------------------------------------------------------

test('los cinco origenes producen el mismo contrato canonico', () => {
  const casos = [
    fromGooglePlaceFields({ placeId: 'ChIJx', displayName: 'Sambil', formattedAddress: 'Av. Goajira', lat: 10.69, lng: -71.63 }),
    fromNominatimResult({ place_id: 123, display_name: 'Vereda del Lago, Maracaibo', lat: '10.6658', lon: '-71.5975' }),
    fromPreset(KNOWN_PLACES[0]),
    fromGpsSample({ lat: 10.64, lng: -71.61 }),
    fromMapPoint({ lat: 10.65, lng: -71.6 })
  ];
  const claves = ['provider', 'placeId', 'displayName', 'formattedAddress', 'lat', 'lng'];
  for (const canonica of casos) {
    assert.ok(canonica, 'cada origen debe producir una ubicacion valida');
    assert.deepEqual(Object.keys(canonica).sort(), [...claves].sort());
    assert.ok(Object.isFrozen(canonica), 'la ubicacion elegida es inmutable');
    assert.ok(Number.isFinite(canonica.lat) && Number.isFinite(canonica.lng));
  }
  assert.equal(casos[0].provider, LOCATION_PROVIDER.GOOGLE);
  assert.equal(casos[1].provider, LOCATION_PROVIDER.NOMINATIM);
  assert.equal(casos[2].provider, LOCATION_PROVIDER.PRESET);
  assert.equal(casos[3].provider, LOCATION_PROVIDER.GPS);
  assert.equal(casos[4].provider, LOCATION_PROVIDER.MANUAL);
});

test('sin nombre o sin coordenadas reales no hay ubicacion', () => {
  for (const rota of [
    { provider: 'google', displayName: '', lat: 10, lng: -71 },
    { provider: 'google', displayName: 'X', lat: 'no', lng: -71 },
    { provider: 'google', displayName: 'X', lat: 95, lng: -71 },
    { provider: 'inventado', displayName: 'X', lat: 10, lng: -71 }
  ]) {
    assert.equal(createCanonicalLocation(rota), null, JSON.stringify(rota));
  }
});

// --------------------------------------------------------------------------
// Google Places: dormido, con sesion, y sin re-geocodificar jamas
// --------------------------------------------------------------------------

/** Doble de la libreria de Places (New) con la superficie oficial. */
function montarGoogle({ sugerencias = [], fallaFetchFields = false, place = {} } = {}) {
  const llamadas = { fetchSuggestions: [], fetchFields: 0, toPlace: 0 };
  const lib = {
    AutocompleteSessionToken: class { },
    AutocompleteSuggestion: {
      async fetchAutocompleteSuggestions(request) {
        llamadas.fetchSuggestions.push(request);
        return {
          suggestions: sugerencias.map(item => ({
            placePrediction: {
              placeId: item.placeId,
              mainText: { text: item.main },
              secondaryText: { text: item.secondary ?? null },
              text: { text: item.main },
              toPlace() {
                llamadas.toPlace += 1;
                return {
                  id: item.placeId,
                  displayName: place.displayName ?? item.main,
                  formattedAddress: place.formattedAddress ?? item.secondary ?? null,
                  location: {
                    lat: () => place.lat ?? item.lat,
                    lng: () => place.lng ?? item.lng
                  },
                  async fetchFields() {
                    llamadas.fetchFields += 1;
                    if (fallaFetchFields) throw new Error('detalle crudo del proveedor');
                  }
                };
              }
            }
          }))
        };
      }
    }
  };
  const mapsLoader = {
    isConfigured: () => true,
    load: async () => ({ importLibrary: async (nombre) => (nombre === 'places' ? lib : {}) })
  };
  return { mapsLoader, llamadas };
}

test('la seleccion de Google conserva SUS coordenadas y no vuelve a geocodificar', async () => {
  const { mapsLoader, llamadas } = montarGoogle({
    sugerencias: [{ placeId: 'ChIJ-sambil', main: 'Sambil Maracaibo', secondary: 'Av. Goajira', lat: 10.6975, lng: -71.6342 }]
  });
  const provider = createPlacesProvider({ mapsLoader });

  const candidatos = await provider.search('sambil');
  assert.equal(candidatos.length, 1);
  assert.equal(candidatos[0].title, 'Sambil Maracaibo');

  const canonica = await candidatos[0].resolve();
  assert.equal(canonica.provider, 'google');
  assert.equal(canonica.placeId, 'ChIJ-sambil');
  assert.equal(canonica.lat, 10.6975);
  assert.equal(canonica.lng, -71.6342);
  assert.equal(llamadas.fetchFields, 1, 'un solo fetchFields del lugar elegido');
  // El sesgo viaja con la peticion: pais y circulo del area de servicio.
  const request = llamadas.fetchSuggestions[0];
  assert.deepEqual(request.includedRegionCodes, ['ve']);
  assert.ok(request.locationBias.radius <= 50_000, 'el radio respeta el maximo soportado');
  assert.ok(request.sessionToken, 'la sesion de facturacion existe');
});

test('sin clave configurada el proveedor ni intenta cargar', async () => {
  const provider = createPlacesProvider({
    mapsLoader: { isConfigured: () => false, load: async () => { throw new Error('no debia cargar'); } }
  });
  assert.equal(provider.isConfigured(), false);
  await assert.rejects(() => provider.search('x'), new RegExp(PLACES_ERROR.NOT_CONFIGURED));
});

test('con la API de Places sin habilitar, el proveedor falla cerrado y escueto', async () => {
  const provider = createPlacesProvider({
    mapsLoader: {
      isConfigured: () => true,
      load: async () => ({ importLibrary: async () => { throw new Error('ApiNotActivatedMapError: detalles crudos'); } })
    }
  });
  let capturado = null;
  try { await provider.search('sambil'); } catch (error) { capturado = error; }
  assert.ok(capturado);
  assert.equal(capturado.message, PLACES_ERROR.UNAVAILABLE, 'el error crudo del proveedor no se propaga');
});

// --------------------------------------------------------------------------
// El orquestador: fallback y respuestas zombi
// --------------------------------------------------------------------------

const nominatimDe = items => async () => items;

test('con Places indisponible la busqueda degrada a Nominatim y sigue canonica', async () => {
  const buscador = createDestinationSearch({
    placesProvider: {
      isConfigured: () => true,
      search: async () => { throw new Error(PLACES_ERROR.UNAVAILABLE); }
    },
    nominatimSearch: nominatimDe([{ place_id: 9, display_name: 'Vereda del Lago, Maracaibo', lat: '10.6658', lon: '-71.5975' }])
  });
  const respuesta = await buscador.search('vereda');
  assert.equal(respuesta.stale, false);
  assert.equal(respuesta.provider, 'nominatim');
  assert.equal(respuesta.candidates.length, 1);
  const canonica = await respuesta.candidates[0].resolve();
  assert.equal(canonica.provider, 'nominatim');
  assert.equal(canonica.lat, 10.6658);
});

test('sin Google configurado, Nominatim responde directo (produccion actual)', async () => {
  let googleLlamado = false;
  const buscador = createDestinationSearch({
    placesProvider: { isConfigured: () => false, search: async () => { googleLlamado = true; return []; } },
    nominatimSearch: nominatimDe([{ display_name: 'Basilica, Maracaibo', lat: '10.64', lon: '-71.61' }])
  });
  const respuesta = await buscador.search('basilica');
  assert.equal(googleLlamado, false, 'Google ni se consulta sin clave');
  assert.equal(respuesta.provider, 'nominatim');
  assert.equal(respuesta.candidates.length, 1);
});

test('una respuesta lenta de una busqueda vieja llega marcada como zombi', async () => {
  let soltarVieja;
  const lenta = new Promise(resolve => { soltarVieja = resolve; });
  const buscador = createDestinationSearch({
    placesProvider: null,
    nominatimSearch: async (query) => (query === 'Mar' ? lenta : [{ display_name: 'Maracaibo centro', lat: '10.64', lon: '-71.61' }])
  });

  const vieja = buscador.search('Mar');
  const nueva = await buscador.search('Maracaibo');
  assert.equal(nueva.stale, false);
  assert.equal(nueva.candidates.length, 1);

  soltarVieja([{ display_name: 'Mar de otro sitio', lat: '20', lon: '-100' }]);
  const resultadoViejo = await vieja;
  assert.equal(resultadoViejo.stale, true, 'la vieja no puede pintarse');
  assert.equal(resultadoViejo.candidates.length, 0);
});

test('consultas vacias o cortas no tocan ningun proveedor', async () => {
  let llamadas = 0;
  const buscador = createDestinationSearch({
    placesProvider: { isConfigured: () => true, search: async () => { llamadas += 1; return []; } },
    nominatimSearch: async () => { llamadas += 1; return []; }
  });
  for (const query of ['', ' ', 'ab']) {
    const respuesta = await buscador.search(query);
    assert.deepEqual(respuesta.candidates, []);
  }
  assert.equal(llamadas, 0);
});

test('Google sin resultados consulta el respaldo: la lista no queda vacia por cobertura', async () => {
  const buscador = createDestinationSearch({
    placesProvider: { isConfigured: () => true, search: async () => [] },
    nominatimSearch: nominatimDe([{ display_name: 'Sitio local', lat: '10.65', lon: '-71.6' }])
  });
  const respuesta = await buscador.search('sitio');
  assert.equal(respuesta.provider, 'nominatim');
  assert.equal(respuesta.candidates.length, 1);
});

// --------------------------------------------------------------------------
// Presets: un solo modulo, datos validos, marcado sin coordenadas
// --------------------------------------------------------------------------

test('cada preset es valido, unico y con coordenadas geograficas reales', () => {
  assert.ok(KNOWN_PLACES.length >= 4, 'los cuatro accesos rapidos siguen existiendo');
  const ids = new Set();
  for (const lugar of KNOWN_PLACES) {
    assert.ok(lugar.id && !ids.has(lugar.id), `id duplicado o vacio: ${lugar.id}`);
    ids.add(lugar.id);
    assert.ok(lugar.label.trim().length, 'etiqueta vacia');
    assert.ok(Number.isFinite(lugar.lat) && Math.abs(lugar.lat) <= 90);
    assert.ok(Number.isFinite(lugar.lng) && Math.abs(lugar.lng) <= 180);
    assert.ok(Object.isFrozen(lugar));
    // Los Place IDs no se inventan: o se conocen con certeza o van null.
    assert.equal(lugar.googlePlaceId, null);
    const canonica = fromPreset(lugar);
    assert.equal(canonica.lat, lugar.lat);
    assert.equal(canonica.lng, lugar.lng);
  }
  assert.equal(findKnownPlace('sambil-maracaibo')?.label, 'Sambil Maracaibo');
  assert.equal(findKnownPlace('inexistente'), null);
});

test('el marcado de la pantalla ya no lleva coordenadas escritas a mano', () => {
  const app = leer('src/pages/passenger/passengerApp.js');
  assert.ok(!app.includes('data-lat='), 'quedaban data-lat en el HTML');
  assert.ok(!app.includes('data-lon='), 'quedaban data-lon en el HTML');
  assert.ok(app.includes('data-preset-id='), 'los presets se identifican por id estable');
  assert.ok(app.includes('findKnownPlace(preset.dataset.presetId)'));
  assert.ok(app.includes('fromPreset(lugar)'));
});

// --------------------------------------------------------------------------
// Sin deriva: marcador, ruta y viaje leen del MISMO objeto
// --------------------------------------------------------------------------

test('la pantalla guarda el canonico elegido y el payload del viaje lee de el', () => {
  const app = leer('src/pages/passenger/passengerApp.js');
  assert.ok(app.includes('currentSelectedDestination = location'),
    'la seleccion guarda el objeto canonico');
  const payload = app.slice(app.indexOf('destination: {'), app.indexOf('fareEUR:'));
  assert.ok(payload.includes('currentSelectedDestination?.lat'),
    'la latitud del viaje sale del canonico');
  assert.ok(payload.includes('currentSelectedDestination?.lng'),
    'la longitud del viaje sale del canonico');
  assert.ok(payload.includes('currentSelectedDestination?.displayName'),
    'la direccion mostrada es la del canonico');
  // Y dentro de selectDestination, marcador y ruta usan las MISMAS lat/lon
  // derivadas del objeto: no existe otra fuente.
  const seleccion = app.slice(app.indexOf('async function selectDestination'), app.indexOf('function showFarePreview'));
  assert.ok(seleccion.includes("mapComponent.addMarker([lat, lon], 'destination')"));
  assert.ok(seleccion.includes('mapComponent.drawRoute(pickup, [lat, lon])'));
  assert.ok(!seleccion.includes('nominatim'), 'la seleccion no vuelve a consultar ningun geocodificador');
});

test('la tarifa sigue saliendo de OSRM: Places no toca el dinero', () => {
  const fare = leer('src/services/fareCalculator.js');
  assert.ok(fare.includes('router.project-osrm.org'), 'OSRM sigue siendo la fuente de la ruta de tarifa');
  assert.ok(!fare.toLowerCase().includes('google'), 'ninguna referencia a Google en la tarifa');
});
