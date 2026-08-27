import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * Integracion de Google Maps en MapComponent.
 *
 * Ninguna prueba contacta con Google: el espacio `google.maps` es un doble, el
 * cargador se inyecta por `options.mapsLoader`, y Leaflet global es otro doble.
 *
 * Las dos propiedades que mas se protegen:
 *
 *   1. Un fallo de Google NUNCA deja la pantalla sin mapa: se degrada a
 *      Leaflet y las operaciones encoladas se reproducen.
 *   2. Google no toca el negocio: la ruta y la tarifa siguen saliendo de OSRM,
 *      la geolocalizacion sigue siendo navigator.geolocation y la guardia de
 *      Maracaibo sigue en su sitio.
 */

// --------------------------------------------------------------------------
// Entorno de navegador falso, compartido por las pruebas de componente
// --------------------------------------------------------------------------

function elementoFalso() {
  const el = {
    children: [],
    style: {},
    innerHTML: '',
    className: '',
    title: '',
    disabled: false,
    appendChild(hijo) { el.children.push(hijo); return hijo; },
    querySelector: () => null,
    setAttribute() {},
    addEventListener() {},
    removeChild(hijo) { el.children = el.children.filter(c => c !== hijo); }
  };
  return el;
}

function instalarGlobales() {
  // `navigator` es solo-getter en Node moderno y ademas ya existe: el
  // componente solo lo usa dentro de getUserLocation, asi que no se toca.
  const previos = {
    document: globalThis.document,
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    L: globalThis.L
  };

  globalThis.document = {
    getElementById: () => null,
    createElement: () => elementoFalso(),
    documentElement: { classList: { contains: () => true } },   // tema oscuro
    head: { appendChild() {} }
  };
  // La cadena de imports de mapComponent arrastra socketClient, que lee
  // window.location y localStorage AL CARGARSE (construye su singleton sin
  // conectar). El doble debe cubrir eso.
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    location: { hostname: 'localhost', hash: '#/', search: '' },
    dispatchEvent: () => true
  };
  if (!globalThis.localStorage) {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    previos.__quitarLocalStorage = true;
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
  globalThis.cancelAnimationFrame = clearTimeout;

  return () => {
    const quitarLS = previos.__quitarLocalStorage;
    delete previos.__quitarLocalStorage;
    Object.assign(globalThis, previos);
    if (quitarLS) delete globalThis.localStorage;
  };
}

/** Doble minimo de Leaflet: registra lo creado para poder afirmarlo. */
function leafletFalso() {
  const registro = { mapas: 0, tiles: [], marcadores: [], polilineas: [] };
  const capa = () => ({
    addTo() { return this; },
    remove() { this.eliminado = true; },
    bringToBack() {},
    setLatLng(p) { this._pos = p; },
    getLatLng() { return { lat: this._pos?.[0] ?? 0, lng: this._pos?.[1] ?? 0 }; },
    getElement: () => null,
    bindTooltip() { return this; },
    getLatLngs: () => []
  });
  globalThis.L = {
    map() {
      registro.mapas += 1;
      return {
        setView() { return this; },
        removeLayer() {},
        fitBounds() {},
        getZoom: () => 14,
        on() {},
        remove() {}
      };
    },
    tileLayer(url) { const t = capa(); t.url = url; registro.tiles.push(t); return t; },
    divIcon: (opciones) => ({ opciones }),
    marker(pos, opciones) { const m = capa(); m._pos = pos; m.opciones = opciones; registro.marcadores.push(m); return m; },
    polyline(latlngs, estilo) { const p = capa(); p.latlngs = latlngs; p.estilo = estilo; registro.polilineas.push(p); return p; },
    latLngBounds: (puntos) => ({ puntos })
  };
  return registro;
}

/** Doble del espacio google.maps con OverlayView funcional. */
function googleMapsFalso() {
  const registro = { mapas: [], overlays: [], polilineas: [], listeners: [] };

  class OverlayView {
    setMap(mapa) {
      if (mapa) { registro.overlays.push(this); this.onAdd?.(); this.draw?.(); }
      else this.onRemove?.();
      this._mapa = mapa;
    }
    getPanes() { return { overlayMouseTarget: elementoFalso() }; }
    getProjection() {
      return { fromLatLngToDivPixel: (latlng) => ({ x: latlng.lng() * 10, y: latlng.lat() * 10 }) };
    }
  }

  const maps = {
    Map: class {
      constructor(container, opciones) { this.opciones = opciones; registro.mapas.push(this); }
      setOptions(o) { this.opciones = { ...this.opciones, ...o }; }
      panTo() {} setZoom() {} fitBounds() {} getZoom() { return 14; }
    },
    OverlayView,
    LatLng: class { constructor(lat, lng) { this._lat = lat; this._lng = lng; } lat() { return this._lat; } lng() { return this._lng; } },
    LatLngBounds: class { extend() { return this; } },
    Polyline: class { constructor(o) { this.o = o; registro.polilineas.push(this); } setMap(m) { this._mapa = m; } },
    event: {
      addListener(objeto, tipo, manejador) {
        const l = { objeto, tipo, manejador, remove() { this.eliminado = true; } };
        registro.listeners.push(l);
        return l;
      },
      clearInstanceListeners() {}
    }
  };
  return { maps, registro };
}

const cargarMapComponent = () => import('../src/components/mapComponent.js');

// --------------------------------------------------------------------------
// El motor Google, puro
// --------------------------------------------------------------------------

test('el motor google crea el mapa con estilos del tema y sin UI de Google', async () => {
  const limpiar = instalarGlobales();
  try {
    const { createGoogleMapEngine } = await import('../src/components/googleMapEngine.js');
    const { maps, registro } = googleMapsFalso();
    const motor = createGoogleMapEngine({
      maps, container: elementoFalso(), center: { lat: 10.6, lng: -71.6 }, zoom: 14, theme: 'dark'
    });

    assert.equal(registro.mapas.length, 1);
    const opciones = registro.mapas[0].opciones;
    assert.ok(Array.isArray(opciones.styles) && opciones.styles.length > 0, 'tema oscuro = estilos JSON');
    assert.equal(opciones.disableDefaultUI, true);
    assert.equal(opciones.clickableIcons, false, 'los POI de Google no roban los toques');

    // El tema claro se aplica EN CALIENTE, que es la razon de no usar mapId.
    motor.setTheme('light');
    assert.deepEqual(registro.mapas[0].opciones.styles, []);
  } finally { limpiar(); }
});

test('el marcador HTML del motor google conserva el arte y el contrato', async () => {
  const limpiar = instalarGlobales();
  try {
    const { createGoogleMapEngine } = await import('../src/components/googleMapEngine.js');
    const { maps } = googleMapsFalso();
    const motor = createGoogleMapEngine({ maps, container: elementoFalso(), center: { lat: 0, lng: 0 } });

    const html = '<div class="live-vehicle-marker">ARTE-APROBADO</div>';
    const marcador = motor.crearMarcadorHtml({ lat: 10, lng: -71, html, className: 'driver-3d-marker', anchor: [29, 29] });

    assert.ok(marcador.getElement().innerHTML.includes('ARTE-APROBADO'), 'el HTML llega tal cual');
    assert.equal(marcador.getElement().className, 'driver-3d-marker');
    assert.deepEqual(marcador.getLatLng(), { lat: 10, lng: -71 });

    marcador.setLatLng([11, -70]);
    assert.deepEqual(marcador.getLatLng(), { lat: 11, lng: -70 });

    marcador.remove();
    assert.equal(marcador._mapa, null, 'remove debe soltar el overlay');
  } finally { limpiar(); }
});

test('la polyline del motor google solo PINTA: nunca pide la ruta a Google', async () => {
  const limpiar = instalarGlobales();
  try {
    const { createGoogleMapEngine } = await import('../src/components/googleMapEngine.js');
    const { maps, registro } = googleMapsFalso();
    const motor = createGoogleMapEngine({ maps, container: elementoFalso(), center: { lat: 0, lng: 0 } });

    const linea = motor.crearPolyline([[10, -71], [11, -70]], { color: '#00D2FF', weight: 8, opacity: 1 });
    assert.equal(registro.polilineas.length, 1);
    assert.deepEqual(registro.polilineas[0].o.path, [{ lat: 10, lng: -71 }, { lat: 11, lng: -70 }]);
    linea.remove();
    assert.equal(registro.polilineas[0]._mapa, null);

    // Y el fuente no conoce ningun servicio de rutas de Google.
    const fuente = leer('src/components/googleMapEngine.js');
    for (const prohibido of ['DirectionsService', 'DirectionsRenderer', 'routes.googleapis', 'DistanceMatrix']) {
      assert.ok(!fuente.includes(prohibido), `el motor usa ${prohibido}`);
    }
  } finally { limpiar(); }
});

// --------------------------------------------------------------------------
// MapComponent: eleccion de motor, cola y degradacion
// --------------------------------------------------------------------------

test('sin clave configurada se usa Leaflet directamente: el comportamiento de siempre', async () => {
  const limpiar = instalarGlobales();
  try {
    const registroL = leafletFalso();
    const { MapComponent } = await cargarMapComponent();

    const mapa = new MapComponent(elementoFalso(), {
      mapsLoader: { isConfigured: () => false, load: () => Promise.reject(new Error('NO_KEY')) }
    });

    assert.equal(registroL.mapas, 1, 'el mapa Leaflet debe existir de inmediato');
    assert.ok(mapa.map, 'this.map queda listo en el constructor, como siempre');
    assert.equal(mapa.engine.kind, 'leaflet');
    assert.ok(registroL.tiles[0].url.includes('cartocdn'), 'mismas teselas CARTO de siempre');

    mapa.setUserLocation(10.64, -71.61);
    assert.equal(registroL.marcadores.length, 1);
    mapa.destroy();
  } finally { limpiar(); }
});

test('con clave y carga correcta gana el motor google y la cola se reproduce', async () => {
  const limpiar = instalarGlobales();
  try {
    leafletFalso();
    const { maps } = googleMapsFalso();
    const { MapComponent } = await cargarMapComponent();

    let resolver;
    const cargador = { isConfigured: () => true, load: () => new Promise(r => { resolver = r; }) };
    const mapa = new MapComponent(elementoFalso(), { mapsLoader: cargador });

    // Mientras Google carga, las operaciones NO se pierden: se encolan.
    mapa.setUserLocation(10.64, -71.61);
    mapa.addDriverMarker('d1', 10.65, -71.62, 90, { vehicleType: 'MOTO' });
    mapa.centerOn(10.64, -71.61, 15);
    assert.equal(mapa.map, null, 'el mapa aun no existe');
    assert.equal(mapa._pendingOps.length, 3);

    resolver(maps);
    await new Promise(r => setTimeout(r, 0));

    assert.equal(mapa.engine.kind, 'google');
    assert.ok(mapa.map, 'el mapa google quedo listo');
    assert.ok(mapa.userMarker, 'la operacion encolada se aplico');
    assert.ok(mapa.markers.has('d1'), 'el marcador de conductor encolado se aplico');
    mapa.destroy();
  } finally { limpiar(); }
});

test('si Google FALLA se degrada a Leaflet sin perder las operaciones', async () => {
  // La propiedad central de la fase: un fallo de Google no deja la pantalla
  // sin mapa ni rompe nada. La cola se reproduce sobre el respaldo.
  const limpiar = instalarGlobales();
  try {
    const registroL = leafletFalso();
    const { MapComponent } = await cargarMapComponent();

    let rechazar;
    const cargador = { isConfigured: () => true, load: () => new Promise((_r, rej) => { rechazar = rej; }) };
    const mapa = new MapComponent(elementoFalso(), { mapsLoader: cargador });

    mapa.setUserLocation(10.64, -71.61);
    mapa.setPickupMarker(10.65, -71.6);
    assert.equal(mapa._pendingOps.length, 2);

    rechazar(new Error('AUTH_FAILED'));
    await new Promise(r => setTimeout(r, 0));

    assert.equal(mapa.engine.kind, 'leaflet', 'debe ganar el respaldo');
    assert.ok(mapa.map);
    assert.equal(registroL.marcadores.length, 2, 'las dos operaciones encoladas se aplicaron');
    assert.ok(mapa.userMarker && mapa.pickupMarker);
    mapa.destroy();
  } finally { limpiar(); }
});

test('destruir el componente mientras Google carga no revienta ni construye tarde', async () => {
  const limpiar = instalarGlobales();
  try {
    const registroL = leafletFalso();
    const { maps } = googleMapsFalso();
    const { MapComponent } = await cargarMapComponent();

    let resolver;
    const cargador = { isConfigured: () => true, load: () => new Promise(r => { resolver = r; }) };
    const mapa = new MapComponent(elementoFalso(), { mapsLoader: cargador });
    mapa.destroy();

    resolver(maps);
    await new Promise(r => setTimeout(r, 0));

    assert.equal(mapa.engine, null, 'no debe construirse un motor tras destroy');
    assert.equal(registroL.mapas, 0);
  } finally { limpiar(); }
});

// --------------------------------------------------------------------------
// El negocio no cambia de manos
// --------------------------------------------------------------------------

test('la ruta y la tarifa siguen saliendo de OSRM, no de Google', () => {
  const fareCalculator = leer('src/services/fareCalculator.js');
  assert.match(fareCalculator, /router\.project-osrm\.org/, 'OSRM sigue siendo el proveedor de rutas');
  assert.ok(!/googleapis|google\.maps/.test(fareCalculator), 'la tarifa no puede depender de Google');

  const mapComponent = leer('src/components/mapComponent.js');
  assert.match(mapComponent, /fareCalculator\.calculateRoute\(/, 'drawRoute sigue pidiendo la geometria a OSRM');
});

test('la busqueda de destinos sigue siendo Nominatim: sin Places API', () => {
  const passenger = leer('src/pages/passenger/passengerApp.js');
  assert.match(passenger, /nominatim\.openstreetmap\.org/);
  assert.ok(!/places\.googleapis|AutocompleteService|PlacesService/.test(passenger),
    'Places no forma parte de esta fase');
});

test('la geolocalizacion del dispositivo sigue siendo navigator.geolocation', () => {
  const mapComponent = leer('src/components/mapComponent.js');
  assert.match(mapComponent, /navigator\.geolocation\.getCurrentPosition/);
  const tracker = leer('src/services/driverGpsTracker.js');
  assert.ok(!/google/i.test(tracker), 'el GPS del conductor no conoce a Google');
});

test('la guardia de Maracaibo sigue siendo logica de la aplicacion', () => {
  const area = leer('src/utils/operatingArea.js');
  assert.match(area, /MARACAIBO_SERVICE_CENTER = Object\.freeze\(\{ lat: 10\.6427, lng: -71\.6125 \}\)/);
  assert.match(area, /MARACAIBO_SERVICE_RADIUS_KM = 60/);
  assert.ok(!/google/i.test(area), 'Google no decide donde opera +58Express');

  const passenger = leer('src/pages/passenger/passengerApp.js');
  assert.match(passenger, /isInsideMaracaiboServiceArea/);
});

test('el contrato del tiempo real del conductor sigue intacto', () => {
  assert.match(leer('src/services/networkRecoveryController.js'), /network_online/);
  assert.match(leer('src/services/socketClient.js'), /socket_watchdog_reset/);
  assert.match(leer('src/services/driverGpsTracker.js'), /driver_reregistered/);
});

test('solo el cargador central inyecta el script de Google', () => {
  // Ningun otro fichero puede construir la URL de la API: cargarla dos veces
  // esta prohibido por construccion.
  const conScript = [];
  const revisar = (dir) => {
    for (const entrada of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      if (entrada.isDirectory()) { revisar(path.join(dir, entrada.name)); continue; }
      if (!entrada.name.endsWith('.js')) continue;
      const relativo = path.join(dir, entrada.name).replaceAll('\\', '/');
      const contenido = leer(relativo);
      if (contenido.includes('maps.googleapis.com/maps/api/js')) conScript.push(relativo);
    }
  };
  revisar('src');
  assert.deepEqual(conScript, ['src/services/googleMapsService.js']);
});
