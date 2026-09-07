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
import {
  VARIABLE_CLAVE_ANDROID,
  VARIABLE_CLAVE_IOS,
  VARIABLE_CLAVE_WEB,
  VARIABLE_MAPA_ANDROID,
  VARIABLE_MAPA_IOS,
  VARIABLE_MAPA_WEB
} from '../mapa/claves.ts';
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

test('el mapa se rehace por el tema, y por nada más', () => {
  // Esta prueba decía «cambiar de tema NO remonta el mapa». Dejó de ser
  // posible al pasar el estilo a Google Cloud: `mapId` y `colorScheme` en el
  // navegador, y `googleMapId` y `userInterfaceStyle` en el teléfono, son
  // opciones de CREACIÓN. En react-native-maps sus setters dicen literalmente
  // «do nothing (initialProp)». No es una decisión nuestra.
  //
  // Lo que sigue importando —y es lo que se protege ahora— es que se rehaga
  // SÓLO por el tema o el identificador. Rehacerlo cuando cambia el modelo
  // sería un parpadeo continuo, porque el modelo cambia a cada rato.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');

  // Las dependencias del efecto que CREA el mapa, no las de los otros: el de
  // la cámara sí depende del modelo, y debe seguir haciéndolo.
  const creacion = web.slice(web.indexOf('new Map(contenedor.current'));
  assert.ok(web.includes('new Map(contenedor.current'), 'no encuentro dónde se crea el mapa');
  const dependencias = creacion.match(/\}, \[([^\]]*)\]\);/);
  assert.ok(dependencias, 'no encuentro las dependencias del efecto que crea el mapa');
  assert.equal(dependencias[1].trim(), 'esquema, identificador',
    'el mapa del navegador se rehace por algo que no es el tema');

  const nativo = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  assert.match(nativo, /key=\{`\$\{identificador\}:\$\{esquema\}`\}/);

  // Y que al rehacerlo no se pierda dónde estaba mirando: saltar a otro sitio
  // al amanecer se lee como un fallo.
  assert.match(web, /centroPrevio/);
  assert.match(nativo, /initialRegion=\{region\(ultima\.current \?\? modelo\.camara\)\}/);
  assert.match(nativo, /onRegionChangeComplete/);
});

test('los marcadores van pegados al mapa, no a la pantalla', () => {
  // Se colocaban por regla de tres sobre la cámara del modelo. Al arrastrar el
  // mapa se quedaban clavados mientras las calles pasaban por debajo: el
  // marcador de origen dejaba de señalar el origen. Se vio arrastrando el mapa.
  //
  // Ahora el sitio lo da la proyección de Google, la misma que coloca sus
  // propios marcadores.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.match(web, /fromLatLngToContainerPixel/);
  assert.equal(/enPorcentaje/.test(web), false, 'sigue la proyección inventada');

  // Y se recolocan moviendo el nodo, no repintando: Google llama a `draw()` en
  // cada fotograma del movimiento, y pedir un repintado de React ahí deja la
  // página en un bucle. Se probó: la página dejaba de responder.
  assert.match(web, /superficie\.draw = \(\) => colocar\.current\(\)/);
  assert.match(web, /nodo\.style\.transform = /);

  // Sin proyección todavía, el marcador se esconde en vez de irse a la esquina
  // superior izquierda, que se leería como un marcador en mitad del lago.
  assert.match(web, /nodo\.style\.visibility = 'hidden'/);
});

test('se espera a que Google esté listo, no a que llegue su fichero', () => {
  // `loading=async` hace que el script se ejecute y siga preparando la API un
  // rato. En `onload`, `google.maps.importLibrary` todavía no existe —visto en
  // el navegador— y el mapa fallaba con «Map is not a constructor». Un instante
  // después sí está, así que el fallo iba y venía según la red.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.match(web, /&callback=\$\{avisar\}/);
  assert.equal(/etiqueta\.onload/.test(web), false, 'vuelve a fiarse del onload');

  // Y las clases se piden por biblioteca, que es como funciona el cargador.
  assert.match(web, /importLibrary\('maps'\)/);
});

test('la pantalla de validación del mapa no llega a release', () => {
  // Lleva coordenadas fijas escritas a mano para poder mirar el mapa sin
  // levantar el backend. En una versión publicada no puede alcanzarse.
  const pantalla = leer('app/validacion-mapa.tsx');
  assert.match(pantalla, /if \(!EN_DESARROLLO\) return <Redirect href="\/" \/>;/);

  // Y no habla con nadie: ni API, ni socket, ni sesión.
  const sinTexto = despojarComentarios(pantalla);
  for (const prohibido of ['fetch(', 'apiFetch', 'io(', 'useSesion', 'useViajeActivo']) {
    assert.equal(sinTexto.includes(prohibido), false,
      `la pantalla de validación usa ${prohibido}`);
  }
});

test('el estilo de la nube y el local nunca se aplican a la vez', () => {
  // Google ignora el JSON de estilo en cuanto hay identificador de mapa. Tener
  // los dos puestos sería mentir sobre de dónde sale lo que se ve: alguien
  // cambiaría estos colores, no pasaría nada, y no sabría por qué.
  const estilos = sinComentarios('mapa/estilos.ts');
  assert.match(estilos, /export function estiloLocalSiHaceFalta/);
  assert.match(estilos, /identificadorDeMapa === '' \? estiloDelMapa\(esquema\) : undefined/);

  // Y que la decisión esté en un solo sitio: ningún adaptador puede elegir por
  // su cuenta, o un día uno de los dos aplicará las dos cosas.
  for (const fichero of ['mapa/MapaDeMovilidad.tsx', 'mapa/MapaDeMovilidad.native.tsx']) {
    const codigo = sinComentarios(fichero);
    assert.match(codigo, /estiloLocalSiHaceFalta\(esquema, identificador\)/, fichero);
    assert.equal(/estiloDelMapa\(/.test(codigo), false,
      `${fichero} se salta la decisión y coge el estilo local directamente`);
  }

  // En el navegador, `styles` y `mapId` van en ramas excluyentes del mismo
  // objeto de opciones.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.match(web, /identificador === '' \? \{ styles: estilo \} : \{ mapId: identificador \}/);
});

test('cada plataforma usa su identificador, nunca el de otra', () => {
  // Google valida el tipo del identificador contra el SDK que lo pide: el de
  // JavaScript en Android deja el mapa gris y sin explicación.
  assert.equal(VARIABLE_MAPA_WEB, 'EXPO_PUBLIC_GOOGLE_MAP_ID_WEB');
  assert.equal(VARIABLE_MAPA_ANDROID, 'EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID');
  assert.equal(VARIABLE_MAPA_IOS, 'EXPO_PUBLIC_GOOGLE_MAP_ID_IOS');

  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.match(web, /identificadorDelNavegador\(\)/);
  assert.equal(/GOOGLE_MAP_ID_ANDROID|GOOGLE_MAP_ID_IOS/.test(web), false,
    'el navegador nombra el identificador de otra plataforma');

  const nativo = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  assert.match(nativo, /Platform\.OS === 'ios' \? identificadorDeIOS\(\) : identificadorDeAndroid\(\)/);
  assert.equal(/GOOGLE_MAP_ID_WEB|identificadorDelNavegador/.test(nativo), false,
    'el teléfono nombra el identificador del navegador');

  // Los nombres se leen enteros y literales: Expo sustituye `process.env`
  // mirando el texto, y una lectura armada devolvería vacío siempre.
  const claves = sinComentarios('mapa/claves.ts');
  for (const nombre of [VARIABLE_MAPA_WEB, VARIABLE_MAPA_ANDROID, VARIABLE_MAPA_IOS]) {
    assert.match(claves, new RegExp(`process\\.env\\.${nombre}`));
  }
});

test('el tema del mapa lo manda +58express, no el navegador ni el sistema', () => {
  // La aplicación decide día y noche por la hora de Caracas. Si el mapa
  // siguiera al sistema, alguien con el teléfono en claro a las nueve de la
  // noche vería la aplicación oscura con un mapa blanco dentro.
  const web = sinComentarios('mapa/MapaDeMovilidad.tsx');
  assert.match(web, /colorScheme: esquema === 'oscuro' \? 'DARK' : 'LIGHT'/);
  assert.equal(/prefers-color-scheme|FOLLOW_SYSTEM|matchMedia/.test(web), false);

  const nativo = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  assert.match(nativo, /userInterfaceStyle=\{esquema === 'oscuro' \? 'dark' : 'light'\}/);
  assert.equal(/useColorScheme|Appearance\.|'system'/.test(nativo), false);
});

// ---------------------------------------------------------------------------
// Las claves
// ---------------------------------------------------------------------------

test('tres claves distintas, una por plataforma', () => {
  assert.equal(VARIABLE_CLAVE_WEB, 'EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY');
  assert.equal(VARIABLE_CLAVE_ANDROID, 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY');
  assert.equal(VARIABLE_CLAVE_IOS, 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY');

  const app = JSON.parse(leer('app.json'));
  assert.ok(app.expo.plugins.includes('react-native-maps'));

  // Esta prueba comprobaba que `app.json` declaraba las claves en
  // `android.config.googleMaps.apiKey`. Comprobaba que estuviera escrito lo
  // que yo quería escribir, no que sirviera — y no servía: en JSON un
  // `"$VARIABLE"` no se sustituye nunca, y el complemento de react-native-maps
  // ni siquiera mira ahí; es más, borra esa entrada del manifiesto si no le
  // pasan la clave por sus opciones. El mapa habría salido gris con la prueba
  // en verde. Lo vimos leyendo el manifiesto generado, no el código.
  //
  // Ahora las claves se resuelven en `app.config.js`, que se ejecuta y lee el
  // entorno de verdad. Aquí sólo queda vigilar que no vuelvan al sitio que no
  // funciona; que lleguen es cosa de `configuracionDelMapa.test.mjs`, que
  // ejecuta la configuración y mira el resultado.
  assert.equal(app.expo.android?.config?.googleMaps, undefined,
    'las claves volvieron a un sitio donde el complemento no las lee');
  assert.equal(app.expo.ios?.config?.googleMapsApiKey, undefined);
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

test('el punto azul de Google sigue apagado: manda nuestro marcador', () => {
  // Esta prueba decía «no se pide ubicación ni se instala GPS». La ubicación
  // ya existe, autorizada por el dueño, pero la decisión de fondo no cambia:
  // UNA sola autoridad visual.
  //
  // `showsUserLocation` dibujaría el punto azul de Google Y pediría el
  // permiso por su cuenta, saltandose las reglas de calidad. Serían dos
  // puntos posibles sobre el mismo mapa y dos caminos hacia el permiso.
  // El marcador propio además funciona igual en el navegador, donde esa
  // propiedad ni existe.
  const nativo = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  assert.match(nativo, /showsUserLocation=\{false\}/);
  assert.equal(/Location\./.test(nativo), false,
    'el adaptador del mapa habla con el GPS por su cuenta');

  // El permiso lo pide la capa de ubicación, no el mapa.
  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  assert.match(capa, /requestForegroundPermissionsAsync/);

  // Y sigue sin haber permiso de segundo plano en la configuración.
  const app = JSON.parse(leer('app.json'));
  const permisos = JSON.stringify(app.expo.android?.permissions ?? []);
  assert.equal(/BACKGROUND_LOCATION/.test(permisos), false);
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
