import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  googleMapsApiKey,
  isGoogleMapsConfigured,
  loadGoogleMaps,
  resetGoogleMapsLoader
} from '../src/services/googleMapsLoader.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => fs.readFileSync(path.join(raiz, r), 'utf8');

/** Doble mínimo de DOM: solo lo que el cargador toca. */
function navegador({ fallaScript = false, exponeMaps = true } = {}) {
  const insertados = [];
  const win = {};
  const doc = {
    createElement: () => {
      const el = { id: '', async: false, defer: false, src: '', oyentes: {} };
      el.addEventListener = (evento, fn) => { el.oyentes[evento] = fn; };
      el.remove = () => { const i = insertados.indexOf(el); if (i !== -1) insertados.splice(i, 1); };
      return el;
    },
    head: {
      appendChild: (el) => {
        insertados.push(el);
        // Se simula la respuesta del navegador en el siguiente turno.
        queueMicrotask(() => {
          if (fallaScript) { el.oyentes.error?.(); return; }
          if (exponeMaps) win.google = { maps: { version: 'simulada' } };
          const nombre = new URL(el.src).searchParams.get('callback');
          win[nombre]?.();
        });
      }
    }
  };
  return { win, doc, insertados };
}

function conNavegador(entorno, fn) {
  const winPrevio = globalThis.window;
  const docPrevio = globalThis.document;
  globalThis.window = entorno.win;
  globalThis.document = entorno.doc;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.window = winPrevio;
      globalThis.document = docPrevio;
      resetGoogleMapsLoader();
    });
}

// ------------------------------------------------------ separación de claves

test('la clave de servidor nunca puede llegar al navegador', () => {
  // Vite solo expone al bundle las variables con prefijo VITE_. Que la clave de
  // servidor NO lo tenga es lo único que impide que acabe publicada.
  for (const archivo of ['.env.example', 'server/.env.example']) {
    const contenido = leer(archivo);
    assert.ok(
      !/VITE_[A-Z_]*SERVER[A-Z_]*KEY/.test(contenido),
      `${archivo}: ninguna clave de servidor puede llevar el prefijo VITE_`
    );
  }
  const raizEnv = leer('.env.example');
  assert.ok(raizEnv.includes('VITE_GOOGLE_MAPS_BROWSER_KEY='), 'la del navegador sí es VITE_');
  assert.ok(raizEnv.includes('GOOGLE_MAPS_SERVER_KEY='), 'y la de servidor está documentada aparte');
});

test('ningún archivo del frontend lee la clave de servidor', () => {
  const ofensores = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(completo); continue; }
      if (!e.name.endsWith('.js')) continue;
      if (/GOOGLE_MAPS_SERVER_KEY/.test(fs.readFileSync(completo, 'utf8'))) {
        ofensores.push(path.relative(raiz, completo));
      }
    }
  };
  recorrer(path.join(raiz, 'src'));
  assert.deepEqual(ofensores, []);
});

test('no se escribe ninguna clave literal en el código', () => {
  // Las claves de Google empiezan por AIza. Ninguna puede quedar incrustada.
  const ofensores = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(completo); continue; }
      if (!/\.(js|html|css)$/.test(e.name)) continue;
      if (/AIza[0-9A-Za-z_-]{10,}/.test(fs.readFileSync(completo, 'utf8'))) {
        ofensores.push(path.relative(raiz, completo));
      }
    }
  };
  recorrer(path.join(raiz, 'src'));
  recorrer(path.join(raiz, 'server'));
  assert.deepEqual(ofensores, [], 'una clave literal en el repositorio es una filtración');
});

// -------------------------------------------------------------- configuración

test('sin clave, la aplicación sabe que no está configurada', () => {
  assert.equal(isGoogleMapsConfigured({}), false);
  assert.equal(isGoogleMapsConfigured({ VITE_GOOGLE_MAPS_BROWSER_KEY: '   ' }), false);
  assert.equal(isGoogleMapsConfigured({ VITE_GOOGLE_MAPS_BROWSER_KEY: 'AIzaSyEjemplo' }), true);
  assert.equal(googleMapsApiKey({ VITE_GOOGLE_MAPS_BROWSER_KEY: '  AIzaSyEjemplo  ' }), 'AIzaSyEjemplo');
});

// --------------------------------------------------------------------- carga

test('la API se carga una sola vez aunque se pida varias veces', async () => {
  const entorno = navegador();
  await conNavegador(entorno, async () => {
    const env = { VITE_GOOGLE_MAPS_BROWSER_KEY: 'AIzaSyEjemplo' };
    const [a, b, c] = await Promise.all([
      loadGoogleMaps({ env }), loadGoogleMaps({ env }), loadGoogleMaps({ env })
    ]);
    assert.equal(a.version, 'simulada');
    assert.equal(a, b);
    assert.equal(b, c);
    assert.equal(entorno.insertados.length, 1, 'un único script inyectado');
  });
});

test('la URL lleva las bibliotecas, el idioma y la región correctos', async () => {
  const entorno = navegador();
  await conNavegador(entorno, async () => {
    await loadGoogleMaps({ env: { VITE_GOOGLE_MAPS_BROWSER_KEY: 'AIzaSyEjemplo' } });
    const url = new URL(entorno.insertados[0].src);
    assert.equal(url.origin + url.pathname, 'https://maps.googleapis.com/maps/api/js');
    assert.equal(url.searchParams.get('key'), 'AIzaSyEjemplo');
    assert.equal(url.searchParams.get('language'), 'es');
    assert.equal(url.searchParams.get('region'), 'VE');
    assert.equal(url.searchParams.get('loading'), 'async');
    const libs = url.searchParams.get('libraries').split(',');
    assert.deepEqual(libs.sort(), ['geometry', 'maps', 'marker', 'places']);
  });
});

test('sin clave se rechaza con un error tipado y no se inyecta nada', async () => {
  const entorno = navegador();
  await conNavegador(entorno, async () => {
    await assert.rejects(
      () => loadGoogleMaps({ env: {} }),
      error => error.code === 'GOOGLE_MAPS_KEY_MISSING'
    );
    assert.equal(entorno.insertados.length, 0, 'no se pide nada a Google sin clave');
  });
});

test('un fallo de red se puede reintentar', async () => {
  const fallando = navegador({ fallaScript: true });
  await conNavegador(fallando, async () => {
    const env = { VITE_GOOGLE_MAPS_BROWSER_KEY: 'AIzaSyEjemplo' };
    await assert.rejects(
      () => loadGoogleMaps({ env }),
      error => error.code === 'GOOGLE_MAPS_LOAD_FAILED'
    );
    assert.equal(fallando.insertados.length, 0, 'el script fallido se retira');
    // Un corte de red no puede dejar la sesión sin mapa para siempre.
    await assert.rejects(() => loadGoogleMaps({ env }), error => error.code === 'GOOGLE_MAPS_LOAD_FAILED');
  });
});

test('el callback global no queda colgado en window', async () => {
  const entorno = navegador();
  await conNavegador(entorno, async () => {
    await loadGoogleMaps({ env: { VITE_GOOGLE_MAPS_BROWSER_KEY: 'AIzaSyEjemplo' } });
    const colgados = Object.keys(entorno.win).filter(k => k.startsWith('__plus58Express'));
    assert.deepEqual(colgados, [], 'el callback se borra tras resolverse');
  });
});

test('nada se pide a Google mientras nadie abra un mapa', () => {
  // El cargador es explícito: ningún módulo debe invocarlo al importarse.
  const fuente = leer('src/services/googleMapsLoader.js');
  const lineasSueltas = fuente
    .split('\n')
    .filter(l => /^\s*loadGoogleMaps\(/.test(l));
  assert.deepEqual(lineasSueltas, [], 'la carga solo ocurre cuando alguien la pide');
  assert.ok(!leer('src/main.js').includes('googleMapsLoader'), 'main.js no debe cargarla al arrancar');
});
