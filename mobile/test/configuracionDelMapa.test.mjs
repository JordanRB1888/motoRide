import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * MAP-VALIDATION-1 — que la clave de Google llegue de verdad al teléfono.
 *
 * Estas pruebas nacen de un fallo que ninguna otra habría visto. La clave
 * estaba declarada en `app.json` como `"$EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY"`,
 * todo compilaba, todas las pruebas pasaban — y el manifiesto generado no
 * llevaba ninguna clave. El mapa habría salido gris en el teléfono, y el
 * motivo no se ve leyendo el código: sólo mirando lo que el prebuild escribe.
 *
 * Dos causas, las dos comprobadas aquí:
 *
 *  1. `app.json` es JSON. Un `"$VARIABLE"` no se sustituye por nada: se copia
 *     literal. Sólo `app.config.js` puede leer el entorno, porque se ejecuta.
 *
 *  2. El complemento de `react-native-maps` lee la clave de SUS opciones. Si
 *     no se la pasan, ELIMINA `com.google.android.geo.API_KEY` del manifiesto,
 *     así que ponerla en `android.config.googleMaps.apiKey` no sólo no servía:
 *     el complemento borraba después lo que hubiera.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const require = createRequire(import.meta.url);

const appJson = JSON.parse(fs.readFileSync(path.join(raizMovil, 'app.json'), 'utf8')).expo;

/** Ejecuta `app.config.js` con el entorno dado y devuelve las opciones del mapa. */
function opcionesDelMapa(entorno) {
  const previo = { ...process.env };
  for (const clave of ['EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY', 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY']) {
    delete process.env[clave];
  }
  Object.assign(process.env, entorno);

  delete require.cache[require.resolve(path.join(raizMovil, 'app.config.js'))];
  const construir = require(path.join(raizMovil, 'app.config.js'));
  const resuelta = construir({ config: appJson });

  process.env = previo;

  const entrada = resuelta.plugins.find(
    (p) => (Array.isArray(p) ? p[0] : p) === 'react-native-maps'
  );
  return { resuelta, entrada };
}

test('sin variables no se escribe ninguna clave', () => {
  // Falla cerrado. Escribir una cadena vacía sería peor: Google contesta un
  // error distinto y cuesta más entender qué falta.
  const { entrada } = opcionesDelMapa({});
  assert.ok(Array.isArray(entrada), 'el complemento debe llevar opciones, aunque estén vacías');
  assert.deepEqual(entrada[1], {});
});

test('con variables, la clave llega al complemento', () => {
  const { entrada } = opcionesDelMapa({
    EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY: 'una-de-android',
    EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY: 'una-de-ios'
  });
  assert.equal(entrada[1].androidGoogleMapsApiKey, 'una-de-android');
  assert.equal(entrada[1].iosGoogleMapsApiKey, 'una-de-ios');
});

test('cada plataforma lleva la suya, y nunca la de la otra', () => {
  // Se restringen de forma distinta —Android por paquete y huella, iOS por
  // identificador—, así que una sola clave para las dos tendría que aceptarlo
  // todo. Una clave que lo acepta todo la puede usar cualquiera con tu factura.
  const { entrada } = opcionesDelMapa({ EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY: 'sólo-android' });
  assert.equal(entrada[1].androidGoogleMapsApiKey, 'sólo-android');
  assert.equal('iosGoogleMapsApiKey' in entrada[1], false);
});

test('los nombres de las opciones son los que el complemento lee de verdad', () => {
  // Atarse al paquete instalado y no a la documentación: si `react-native-maps`
  // renombra la opción en una actualización, la clave dejaría de llegar en
  // silencio y el mapa saldría gris sin que nada fallara al compilar.
  const android = fs.readFileSync(
    path.join(raizMovil, 'node_modules/react-native-maps/plugin/build/android.js'), 'utf8'
  );
  const ios = fs.readFileSync(
    path.join(raizMovil, 'node_modules/react-native-maps/plugin/build/ios.js'), 'utf8'
  );
  assert.match(android, /androidGoogleMapsApiKey/);
  assert.match(ios, /iosGoogleMapsApiKey/);

  // Y que sigue escribiendo la clave donde Android la busca.
  assert.match(android, /com\.google\.android\.geo\.API_KEY/);
});

test('no se pierde ningún complemento por el camino', () => {
  // `app.config.js` sólo añade opciones a uno. Si redefiniera la lista entera,
  // quien añadiera mañana un complemento en `app.json` lo vería ignorado sin
  // que nada avisara.
  const { resuelta } = opcionesDelMapa({});
  const nombres = resuelta.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  for (const esperado of appJson.plugins.map((p) => (Array.isArray(p) ? p[0] : p))) {
    assert.ok(nombres.includes(esperado), `falta el complemento ${esperado}`);
  }
});

test('app.json no vuelve a declarar claves que nunca se sustituyen', () => {
  // La trampa original: `"$EXPO_PUBLIC_..."` dentro de JSON se queda literal y
  // acaba en el manifiesto tal cual. Parece configurado y no lo está.
  const crudo = fs.readFileSync(path.join(raizMovil, 'app.json'), 'utf8');
  assert.equal(/\$EXPO_PUBLIC_/.test(crudo), false,
    'app.json tiene una variable literal: eso no se sustituye nunca');

  // Y las dos entradas muertas no vuelven: el complemento las ignora y además
  // borra lo que dejen en el manifiesto.
  assert.equal(appJson.ios?.config?.googleMapsApiKey, undefined);
  assert.equal(appJson.android?.config?.googleMaps, undefined);
});

test('la clave del servidor no aparece en la configuración', () => {
  // `DISPATCH_ROUTES_API_KEY` no tiene restricción de plataforma: publicada en
  // una aplicación es una factura abierta. Sólo puede nombrarse para prohibirla.
  const config = fs.readFileSync(path.join(raizMovil, 'app.config.js'), 'utf8');
  const sinComentarios = config.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.equal(/DISPATCH_ROUTES_API_KEY/.test(sinComentarios), false);
});

test('el mapa no pide permisos de ubicación todavía', () => {
  // Sin GPS, pedir la ubicación al abrir la aplicación asusta y no sirve para
  // nada: no hay nada que hacer con ella.
  const crudo = JSON.stringify(appJson);
  assert.equal(/ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|NSLocationWhenInUse/.test(crudo), false);
});
