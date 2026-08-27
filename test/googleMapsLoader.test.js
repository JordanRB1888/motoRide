import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleMapsLoader, GOOGLE_MAPS_STATUS } from '../src/services/googleMapsService.js';

/**
 * Cargador centralizado de Google Maps.
 *
 * Todas las pruebas usan dobles de document/window: NINGUNA contacta con
 * Google ni con ningun otro servicio. La clave de las pruebas es un marcador
 * reconocible que ademas sirve para demostrar que no se filtra.
 */

const CLAVE_FALSA = 'CLAVE-FALSA-DE-PRUEBA-QUE-NO-DEBE-FILTRARSE';

/** Doble de navegador: controla el script inyectado y su desenlace. */
function montarNavegador({ googlePrecargado = false } = {}) {
  const scripts = [];
  const windowRef = {};
  if (googlePrecargado) windowRef.google = { maps: { Map: function Map() {} } };

  const documentRef = {
    head: {
      appendChild(script) {
        scripts.push(script);
      }
    },
    createElement(tag) {
      return { tag, src: '', async: false, onerror: null };
    }
  };

  return {
    windowRef,
    documentRef,
    scripts,
    /** Simula que el script de Google cargo y ejecuta su callback JSONP. */
    completarCarga() {
      windowRef.google = { maps: { Map: function Map() {} } };
      const callback = windowRef.__plus58GoogleMapsReady;
      assert.ok(callback, 'el script debia registrar su callback');
      callback();
    },
    fallarCarga() {
      scripts[0]?.onerror?.();
    },
    fallarAutorizacion() {
      windowRef.gm_authFailure?.();
    }
  };
}

const montarLoader = (clave, extras = {}) => {
  const nav = montarNavegador(extras);
  const loader = createGoogleMapsLoader({
    getKey: () => clave,
    documentRef: nav.documentRef,
    windowRef: nav.windowRef,
    timeoutMs: extras.timeoutMs ?? 10000
  });
  return { loader, nav };
};

// --------------------------------------------------------------------------
// Clave ausente
// --------------------------------------------------------------------------

test('sin clave no se toca la red y el resultado es NO_KEY', async () => {
  for (const clave of ['', '   ', undefined, null]) {
    const { loader, nav } = montarLoader(clave);
    assert.equal(loader.isConfigured(), false);
    await assert.rejects(() => loader.load(), /NO_KEY/);
    assert.equal(nav.scripts.length, 0, 'no puede inyectarse ningun script sin clave');
    assert.equal(loader.getStatus(), GOOGLE_MAPS_STATUS.NO_KEY);
  }
});

// --------------------------------------------------------------------------
// Carga correcta
// --------------------------------------------------------------------------

test('con clave el script se inyecta una vez y la promesa resuelve', async () => {
  const { loader, nav } = montarLoader(CLAVE_FALSA);
  assert.equal(loader.isConfigured(), true);

  const promesa = loader.load();
  assert.equal(loader.getStatus(), GOOGLE_MAPS_STATUS.LOADING);
  assert.equal(nav.scripts.length, 1);
  assert.ok(nav.scripts[0].src.startsWith('https://maps.googleapis.com/maps/api/js?'));
  assert.ok(nav.scripts[0].async, 'el script debe cargarse en asincrono');

  nav.completarCarga();
  const maps = await promesa;
  assert.equal(typeof maps.Map, 'function');
  assert.equal(loader.getStatus(), GOOGLE_MAPS_STATUS.READY);
});

test('llamadas repetidas comparten la MISMA promesa: un solo script', async () => {
  const { loader, nav } = montarLoader(CLAVE_FALSA);

  const primera = loader.load();
  const segunda = loader.load();
  const tercera = loader.load();
  assert.equal(primera, segunda, 'debe ser la misma promesa');
  assert.equal(segunda, tercera);

  nav.completarCarga();
  await primera;
  assert.equal(nav.scripts.length, 1, 'cargar dos veces esta prohibido por construccion');

  // Incluso despues de resolver, cargar de nuevo no inyecta otro script.
  await loader.load();
  assert.equal(nav.scripts.length, 1);
});

test('si Google ya vive en la pagina se reutiliza sin tocar el DOM', async () => {
  const { loader, nav } = montarLoader(CLAVE_FALSA, { googlePrecargado: true });
  const maps = await loader.load();
  assert.equal(typeof maps.Map, 'function');
  assert.equal(nav.scripts.length, 0, 'no debia inyectarse nada');
});

// --------------------------------------------------------------------------
// Fallos
// --------------------------------------------------------------------------

test('un fallo del script rechaza con LOAD_FAILED', async () => {
  const { loader, nav } = montarLoader(CLAVE_FALSA);
  const promesa = loader.load();
  nav.fallarCarga();
  await assert.rejects(() => promesa, /LOAD_FAILED/);
  assert.equal(loader.getStatus(), GOOGLE_MAPS_STATUS.FAILED);
});

test('una clave rechazada por Google se detecta como AUTH_FAILED', async () => {
  // gm_authFailure llega DESPUES del onload: sin este gancho, una clave
  // restringida a otro dominio pareceria una carga correcta con mapa gris.
  const { loader, nav } = montarLoader(CLAVE_FALSA);
  const promesa = loader.load();
  nav.fallarAutorizacion();
  await assert.rejects(() => promesa, /AUTH_FAILED/);
});

test('una carga que no termina vence por tiempo', async () => {
  const { loader } = montarLoader(CLAVE_FALSA, { timeoutMs: 30 });
  await assert.rejects(() => loader.load(), /LOAD_TIMEOUT/);
});

test('sin document (entorno no navegador) no revienta', async () => {
  const loader = createGoogleMapsLoader({
    getKey: () => CLAVE_FALSA,
    documentRef: undefined,
    windowRef: undefined
  });
  await assert.rejects(() => loader.load(), /NO_DOCUMENT/);
});

// --------------------------------------------------------------------------
// La clave no se filtra
// --------------------------------------------------------------------------

test('ningun error ni estado contiene la clave', async () => {
  const escenarios = [
    async () => { const { loader, nav } = montarLoader(CLAVE_FALSA); const p = loader.load(); nav.fallarCarga(); return p; },
    async () => { const { loader, nav } = montarLoader(CLAVE_FALSA); const p = loader.load(); nav.fallarAutorizacion(); return p; },
    async () => { const { loader } = montarLoader(CLAVE_FALSA, { timeoutMs: 20 }); return loader.load(); }
  ];

  for (const escenario of escenarios) {
    let capturado = null;
    try { await escenario(); } catch (error) { capturado = error; }
    assert.ok(capturado, 'se esperaba un fallo');
    const texto = `${capturado.message} ${capturado.stack || ''}`;
    assert.ok(!texto.includes(CLAVE_FALSA), 'el error filtra la clave');
    assert.match(capturado.message, /^(NO_KEY|LOAD_FAILED|AUTH_FAILED|LOAD_TIMEOUT|NO_DOCUMENT)$/);
  }
});

test('el cargador no registra nada en consola', async () => {
  // El unico sitio donde la clave existe es el atributo src del script, que es
  // como funciona esta API. Ninguna traza propia debe repetirla.
  const originales = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const trazas = [];
  console.log = console.warn = console.error = console.info = (...args) => trazas.push(args.join(' '));
  try {
    const { loader, nav } = montarLoader(CLAVE_FALSA);
    const promesa = loader.load();
    nav.completarCarga();
    await promesa;
  } finally {
    Object.assign(console, originales);
  }
  assert.ok(!trazas.join('\n').includes(CLAVE_FALSA), 'la clave aparecio en consola');
});

test('el fuente del cargador y de los motores no contiene ninguna clave', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  for (const relativo of [
    'src/services/googleMapsService.js',
    'src/components/googleMapEngine.js',
    'src/components/leafletMapEngine.js',
    'src/components/mapComponent.js',
    '.env.example'
  ]) {
    const contenido = fs.readFileSync(path.join(raiz, relativo), 'utf8');
    // Una clave real de Google empieza por AIza y sigue con 35 caracteres.
    assert.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(contenido), `${relativo} contiene una clave de Google`);
  }
});
