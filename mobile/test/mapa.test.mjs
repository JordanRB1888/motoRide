import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  camaraQueAbarca,
  CAMARA_DE_MARACAIBO,
  CENTRO_DE_MARACAIBO,
  dentroDelArea,
  esCoordenada,
  leerCoordenada,
  mereceMoverse,
  RADIO_DE_SERVICIO_KM
} from '../mapa/modelo.ts';
import { estiloDelMapa, MAPA_DE_DIA, MAPA_DE_NOCHE } from '../mapa/estilos.ts';
import { VARIABLE_CLAVE_ANDROID, VARIABLE_CLAVE_IOS, VARIABLE_CLAVE_WEB } from '../mapa/claves.ts';
import { AIRE_BAJO_LA_HOJA, mapaDelViaje } from '../domain/mapaDelViaje.ts';
import { leerDetalle } from '../domain/viajes.ts';

/**
 * El mapa real — MAP-INTEGRATION-1.
 *
 * QUÉ SE PROTEGE
 *
 * Que el mapa no invente posiciones. Un marcador donde no está el conductor es
 * peor que ningún marcador: quien mira la pantalla sale a la calle a buscarlo.
 *
 * Y que las claves no se mezclen. Tres claves con tres restricciones distintas;
 * la del servidor no puede tocar el cliente ni una vez.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

const viajeCon = (extra = {}) => leerDetalle({
  trip: {
    id: 't1',
    status: 'DRIVER_ASSIGNED',
    pickup: { address: 'Calle 1', lat: 10.64, lng: -71.61 },
    destination: { address: 'Calle 9', lat: 10.66, lng: -71.63 },
    rideType: 'MOTO',
    statusHistory: [],
    ...extra
  },
  driver: { id: 'd1', firstName: 'Luis' }
});

// ---------------------------------------------------------------------------
// Coordenadas
// ---------------------------------------------------------------------------

test('una coordenada inválida NO se pinta', () => {
  for (const mala of [
    null, undefined, {}, 'x', { lat: 'a', lng: 1 }, { lat: 1 },
    { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: NaN, lng: 0 }, { lat: Infinity, lng: 0 }
  ]) {
    assert.equal(esCoordenada(mala), false, `${JSON.stringify(mala)} se acepta`);
  }
  assert.equal(esCoordenada({ lat: 10.64, lng: -71.61 }), true);
});

test('el (0,0) se rechaza: es un campo sin rellenar, no el golfo de Guinea', () => {
  assert.equal(esCoordenada({ lat: 0, lng: 0 }), false);
  assert.equal(leerCoordenada({ lat: 0, lng: 0 }), null);
});

test('el área de servicio es la MISMA que la de la aplicación web', () => {
  const web = fs.readFileSync(path.join(raizProyecto, 'src/utils/operatingArea.js'), 'utf8');
  const centro = web.match(/lat: ([\d.-]+), lng: ([\d.-]+)/);
  const radio = web.match(/SERVICE_RADIUS_KM = (\d+)/);
  assert.ok(centro && radio, 'ya no se puede leer el área de la web');

  assert.equal(CENTRO_DE_MARACAIBO.lat, Number(centro[1]));
  assert.equal(CENTRO_DE_MARACAIBO.lng, Number(centro[2]));
  assert.equal(RADIO_DE_SERVICIO_KM, Number(radio[1]));

  assert.equal(dentroDelArea({ lat: 10.65, lng: -71.62 }), true);
  assert.equal(dentroDelArea({ lat: 4.7, lng: -74 }), false, 'Bogotá cae dentro del área');
});

// ---------------------------------------------------------------------------
// La cámara
// ---------------------------------------------------------------------------

test('sin puntos, la cámara es Maracaibo — nunca el océano', () => {
  assert.deepEqual(camaraQueAbarca([]), CAMARA_DE_MARACAIBO);
  assert.deepEqual(mapaDelViaje(null).camara, CAMARA_DE_MARACAIBO);
});

test('con puntos, los encuadra todos', () => {
  const camara = camaraQueAbarca([{ lat: 10.64, lng: -71.61 }, { lat: 10.66, lng: -71.63 }]);
  assert.ok(Math.abs(camara.centro.lat - 10.65) < 0.001);
  assert.ok(Math.abs(camara.centro.lng - -71.62) < 0.001);
  assert.ok(camara.abarca > 0.02, 'no deja holgura alrededor');
});

test('la cámara NO se mueve por nada', () => {
  // Animar en cada repintado deja el mapa temblando y gasta batería.
  const base = { centro: { lat: 10.64, lng: -71.61 }, abarca: 0.05 };
  assert.equal(mereceMoverse(null, base), true, 'la primera vez siempre se coloca');
  assert.equal(mereceMoverse(base, base), false);
  assert.equal(mereceMoverse(base, { ...base, centro: { lat: 10.6401, lng: -71.61 } }), false,
    'se mueve por cuatro metros');
  assert.equal(mereceMoverse(base, { ...base, centro: { lat: 10.70, lng: -71.61 } }), true);
  assert.equal(mereceMoverse(base, { ...base, abarca: 0.2 }), true);
});

// ---------------------------------------------------------------------------
// Lo que no hay, no se pinta
// ---------------------------------------------------------------------------

test('sin coordenadas, no hay marcadores', () => {
  // Un viaje escrito a mano no las tiene. No se geocodifica desde el teléfono.
  const sinCoordenadas = mapaDelViaje(viajeCon({
    pickup: { address: 'Calle 1' },
    destination: { address: 'Calle 9' }
  }));
  assert.equal(sinCoordenadas.marcadores.length, 0);
  assert.deepEqual(sinCoordenadas.camara, CAMARA_DE_MARACAIBO);

  const presenter = sinComentarios('domain/mapaDelViaje.ts');
  assert.equal(/geocod|geocoding|places/i.test(presenter), false, 'se está geocodificando');
});

test('el conductor sólo aparece si se sabe dónde está', () => {
  // Su posición NO viaja en `/api/trips/active/me`.
  const sinConductor = mapaDelViaje(viajeCon());
  assert.equal(sinConductor.marcadores.some(marcador => marcador.clave === 'conductor'), false);

  const conConductor = mapaDelViaje(viajeCon(), { conductorEn: { lat: 10.65, lng: -71.62 } });
  const moto = conConductor.marcadores.find(marcador => marcador.clave === 'conductor');
  assert.ok(moto);
  assert.equal(moto.clase, 'moto');
  assert.equal(moto.destacado, true);
  // Y sin rumbo real no se inventa uno.
  assert.equal(moto.rumbo, null);
});

test('el servidor sigue sin publicar la posición del conductor', () => {
  // Si algún día la publica, esta prueba avisa de que ya se puede pintar.
  const proyecciones = fs.readFileSync(path.join(raizProyecto, 'server/domain/userProjections.js'), 'utf8');
  const perfil = proyecciones.slice(proyecciones.indexOf('export function driverPublicProfile'));
  // Con limites de palabra: «vehiclePlate» contiene «lat».
  assert.equal(
    /(location|lat|lng|latitude|longitude)/.test(perfil.slice(0, 700)), false,
    'el conductor ya publica su posición: se puede pintar en el mapa'
  );
});

test('origen y destino se pintan con sus formas de siempre', () => {
  const modelo = mapaDelViaje(viajeCon());
  const origen = modelo.marcadores.find(marcador => marcador.clave === 'origen');
  const destino = modelo.marcadores.find(marcador => marcador.clave === 'destino');
  assert.equal(origen?.clase, 'origen');
  assert.equal(destino?.clase, 'destino');

  // Círculo y cuadrado, como en el lienzo dibujado y en el historial.
  const piezas = sinComentarios('mapa/Marcadores.tsx');
  assert.match(piezas, /borderRadius: esOrigen \? 11 : 5/);
});

test('no hay ruta todavía, y no se finge una', () => {
  assert.deepEqual(mapaDelViaje(viajeCon()).ruta, []);
  const presenter = sinComentarios('domain/mapaDelViaje.ts');
  assert.equal(/directions|routes\.googleapis|polyline\.decode/i.test(presenter), false);
});

// ---------------------------------------------------------------------------
// Los marcadores aprobados
// ---------------------------------------------------------------------------

test('la moto y el auto son los APROBADOS, no pines de Google', () => {
  const piezas = leer('mapa/Marcadores.tsx');
  assert.match(piezas, /MarcadorDeVehiculo/, 'no usa el marcador de la marca');
  assert.match(piezas, /tipo=\{marcador\.clase === 'auto' \? 'AUTO' : 'MOTO'\}/);

  // Y el adaptador nativo NO deja que Google ponga el suyo: pinta la pieza
  // como hijo del marcador.
  const nativo = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  assert.match(nativo, /<PiezaDelMarcador marcador=\{marcador\} \/>/);
  assert.equal(/pinColor|image=\{require/.test(nativo), false, 'usa un pin de Google');
});

test('el marcador se centra sobre su coordenada', () => {
  // Google ancla la punta abajo, que es lo correcto para un pin y no para una
  // moto vista desde arriba.
  assert.match(sinComentarios('mapa/MapaDeMovilidad.native.tsx'), /anchor=\{\{ x: 0\.5, y: 0\.5 \}\}/);
});

// ---------------------------------------------------------------------------
// Día y noche
// ---------------------------------------------------------------------------

test('hay un estilo para cada tema, y sólo uno de cada', () => {
  assert.equal(estiloDelMapa('oscuro'), MAPA_DE_NOCHE);
  assert.equal(estiloDelMapa('claro'), MAPA_DE_DIA);
  assert.ok(MAPA_DE_NOCHE.length > 5 && MAPA_DE_DIA.length > 5);
});

test('los dos temas esconden lo mismo', () => {
  // Cambiar de tema no puede cambiar la INFORMACIÓN que se ve.
  const apagados = estilo => estilo
    .filter(regla => regla.stylers.some(valor => valor.visibility === 'off'))
    .map(regla => regla.featureType ?? regla.elementType)
    .sort();
  assert.deepEqual(apagados(MAPA_DE_NOCHE), apagados(MAPA_DE_DIA));
});

test('ninguna pantalla define su propio estilo de mapa', () => {
  for (const carpeta of ['preview', 'app', 'ui']) {
    for (const nombre of fs.readdirSync(path.join(raizMovil, carpeta), { recursive: true })) {
      const completa = path.join(raizMovil, carpeta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      assert.equal(
        /customMapStyle|featureType/.test(fs.readFileSync(completa, 'utf8')), false,
        `${carpeta}/${nombre} define estilo de mapa`
      );
    }
  }
});

test('cambiar de tema NO remonta el mapa', () => {
  // Remontarlo perdería la cámara y volvería a pedir los mosaicos, y con un
  // viaje en curso eso se ve como un fallo.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.match(web, /mapa\.current\.setOptions\(\{ styles: estilo \}\)/);

  const nativo = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  // El estilo va como propiedad del mismo MapView, no como `key`.
  assert.equal(/key=\{esquema\}|key=\{estilo/.test(nativo), false);
});

// ---------------------------------------------------------------------------
// Las claves
// ---------------------------------------------------------------------------

test('tres claves distintas, una por plataforma', () => {
  assert.equal(VARIABLE_CLAVE_WEB, 'EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY');
  assert.equal(VARIABLE_CLAVE_ANDROID, 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY');
  assert.equal(VARIABLE_CLAVE_IOS, 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY');

  const app = JSON.parse(leer('app.json'));
  assert.equal(app.expo.android.config.googleMaps.apiKey, `$${VARIABLE_CLAVE_ANDROID}`);
  assert.equal(app.expo.ios.config.googleMapsApiKey, `$${VARIABLE_CLAVE_IOS}`);
  assert.ok(app.expo.plugins.includes('react-native-maps'));
});

test('sin clave del navegador se falla CERRADO', () => {
  // Nada de caer a la de producción para que el mapa cargue en localhost.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.match(web, /if \(clave === ''\) return resolver\(false\)/);
  assert.match(web, /if \(fallo\) return <HuecoDelMapa \/>/);

  const claves = sinComentarios('mapa/claves.ts');
  assert.equal(/AIza|https?:\/\//.test(claves), false, 'hay una clave o URL escrita');
});

test('la clave del servidor NO existe en el cliente', () => {
  // `DISPATCH_ROUTES_API_KEY` no tiene restricción de referente.
  for (const fichero of ['mapa/MapaDeMovilidad.tsx', 'mapa/MapaDeMovilidad.native.tsx', 'domain/mapaDelViaje.ts']) {
    assert.equal(/DISPATCH_ROUTES/.test(leer(fichero)), false, `${fichero} la menciona`);
  }
  // Y sigue siendo del servidor.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/services/routeMatrixClient.js'), 'utf8');
  assert.match(servidor, /process\.env\.DISPATCH_ROUTES_API_KEY/);
});

// ---------------------------------------------------------------------------
// El mapa puede fallar sin llevarse la pantalla
// ---------------------------------------------------------------------------

test('si Google no carga, la pantalla sigue entera', () => {
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  // El fallo del script se captura y se resuelve en `false`.
  assert.match(web, /etiqueta\.onerror = \(\) => resolver\(false\)/);
  // Y el hueco es sólo el suelo: la hoja y el viaje van encima, fuera de aquí.
  assert.match(web, /function HuecoDelMapa/);
});

test('el script de Google se carga UNA vez', () => {
  // Cargarlo dos veces Google lo castiga con avisos y comportamiento
  // indefinido. Es la misma técnica que ya usaba la aplicación web.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.match(web, /let cargando: Promise<boolean> \| null = null/);
  assert.match(web, /if \(cargando !== null\) return cargando/);
});

// ---------------------------------------------------------------------------
// Google y sus obligaciones
// ---------------------------------------------------------------------------

test('el logotipo de Google no queda bajo la hoja', () => {
  // Es obligatorio y no se puede ocultar.
  assert.ok(AIRE_BAJO_LA_HOJA > 150, 'el relleno inferior no llega');
  assert.match(sinComentarios('mapa/MapaDeMovilidad.native.tsx'), /mapPadding=\{\{[^}]*bottom: modelo\.aireInferior/);
  assert.match(sinComentarios('mapa/MapaDeMovilidad.tsx'), /bottom: modelo\.aireInferior \+ 40/);
});

// ---------------------------------------------------------------------------
// Lo que esta fase NO hace
// ---------------------------------------------------------------------------

test('no se pide ubicación ni se instala GPS', () => {
  const nativo = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  assert.match(nativo, /showsUserLocation=\{false\}/);
  assert.equal(/requestPermission|Location\./.test(nativo), false);

  const dependencias = Object.keys(JSON.parse(leer('package.json')).dependencies ?? {});
  assert.equal(dependencias.includes('expo-location'), false);

  const app = JSON.parse(leer('app.json'));
  const permisos = JSON.stringify(app.expo.android?.permissions ?? []);
  assert.equal(/LOCATION/.test(permisos), false, 'se declaró un permiso de ubicación');
});

test('el paquete WEB no incluye react-native-maps', () => {
  // No tiene implementación web: importarlo rompería el arranque del
  // navegador. La separación es por extensión de fichero.
  // Sin comentarios: la cabecera EXPLICA por que no se usa, y esa frase no es
  // un import.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.equal(/react-native-maps/.test(web), false, 'el adaptador web lo importa');
  assert.match(leer('mapa/MapaDeMovilidad.native.tsx'), /from 'react-native-maps'/);
  assert.ok(fs.existsSync(path.join(raizMovil, 'mapa/MapaDeMovilidad.native.tsx')));
});

test('el recorrido de diseño NO abre Google', () => {
  // Es una maqueta: sus vehículos están en porcentajes de pantalla, no en
  // coordenadas, y no debe pedir una clave para poder mirarse.
  assert.match(sinComentarios('ui/Mapa.tsx'), /modelo === undefined \? <Calles \/>/);
  for (const nombre of fs.readdirSync(path.join(raizMovil, 'app/diseno'), { recursive: true })) {
    const completa = path.join(raizMovil, 'app/diseno', String(nombre));
    if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
    assert.equal(/modelo=|mapaDelViaje/.test(fs.readFileSync(completa, 'utf8')), false,
      `app/diseno/${nombre} pasa un mapa real`);
  }
});

test('el mapa CONSUME el viaje, no lo decide', () => {
  const presenter = sinComentarios('domain/mapaDelViaje.ts');
  for (const negocio of ['SEARCHING', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'emit(', 'fetch(']) {
    assert.equal(presenter.includes(negocio), false, `el mapa decide sobre «${negocio}»`);
  }
});
