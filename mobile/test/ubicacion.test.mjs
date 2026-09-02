import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  calidadDe,
  CALIDAD,
  EDAD_MAXIMA_MS,
  evaluarUbicacion,
  FACTOR_DE_DEGRADACION,
  GRACIA_DE_LA_POBRE_MS,
  metrosEntre,
  normalizarUbicacion,
  PRECISION_BUENA_M,
  PRECISION_POBRE_M,
  RECHAZO,
  VELOCIDAD_MAXIMA_KMH
} from '../domain/calidadDeUbicacion.ts';
import {
  alFallar,
  conPosicion,
  hayPosicion,
  puedePedirPermiso,
  UBICACION_INICIAL
} from '../domain/ubicacion.ts';
import { mapaDelViaje } from '../domain/mapaDelViaje.ts';
import { CAMARA_DE_MARACAIBO } from '../mapa/modelo.ts';

/**
 * LOCATION-INTEGRATION-1A — el GPS del teléfono.
 *
 * QUÉ SE PROTEGE
 *
 * Que no se crea cualquier coordenada. El sistema entrega lecturas de caché,
 * de antena y saltos imposibles; aceptarlas todas hace bailar el punto por el
 * mapa.
 *
 * Que estar fuera de Maracaibo NO se cuente como avería del GPS. Son cosas
 * distintas y se responden distinto.
 *
 * Y que esta fase siga siendo sólo primer plano: sin permiso de segundo plano,
 * sin servicio, y sin mandar la posición a ningún sitio.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

const AHORA = 1_700_000_000_000;
const enMaracaibo = { lat: 10.6427, lng: -71.6125 };

const lectura = (extra = {}) => ({
  coords: { latitude: enMaracaibo.lat, longitude: enMaracaibo.lng, accuracy: 12, ...extra.coords },
  timestamp: extra.timestamp ?? AHORA
});

// ---------------------------------------------------------------------------
// La dependencia
// ---------------------------------------------------------------------------

test('expo-location está declarado y en la línea del SDK 57', () => {
  const paquete = JSON.parse(leer('package.json'));
  const declarada = paquete.dependencies['expo-location'];
  assert.ok(declarada, 'expo-location no está declarado');
  assert.match(declarada, /^~?57\./, `fuera de la línea del SDK 57: ${declarada}`);

  // Y CUMPLE lo que Expo pide para este SDK, no una versión elegida a mano.
  //
  // Se compara compatibilidad y no identidad: la matriz de este `expo` dice
  // `~57.0.14` y `npx expo install` trajo la 57.0.15, que es exactamente lo
  // que ese rango permite. Exigir el número exacto haría fallar la prueba cada
  // vez que Expo publica un parche, que es justo lo que hay que aceptar.
  const matriz = JSON.parse(leer('node_modules/expo/bundledNativeModules.json'));
  const pedido = matriz['expo-location'];
  assert.ok(pedido, 'la matriz de Expo ya no lista expo-location');

  const partes = texto => texto.replace(/^[~^]/, '').split('.').map(Number);
  const [mayorPedido, menorPedido, parchePedido] = partes(pedido);
  const instalada = JSON.parse(leer('node_modules/expo-location/package.json')).version;
  const [mayor, menor, parche] = partes(instalada);

  assert.equal(mayor, mayorPedido, `línea mayor distinta: ${instalada} frente a ${pedido}`);
  assert.equal(menor, menorPedido, `línea menor distinta: ${instalada} frente a ${pedido}`);
  assert.ok(parche >= parchePedido, `${instalada} es anterior a la que pide Expo (${pedido})`);
});

// ---------------------------------------------------------------------------
// Las reglas vienen de la web, y no pueden divergir
// ---------------------------------------------------------------------------

test('los umbrales son los MISMOS que los ya probados en la web', () => {
  // La aplicación web lleva estas reglas contrastadas contra el GPS real. Dos
  // números distintos para el mismo GPS serían dos aplicaciones distintas: si
  // alguien afina un umbral allí y no aquí, esto salta.
  const web = fs.readFileSync(path.join(raizProyecto, 'src/utils/locationQuality.js'), 'utf8');
  const numero = nombre => {
    const encontrado = web.match(new RegExp(`${nombre} = ([\\d_]+)`));
    assert.ok(encontrado, `la web ya no declara ${nombre}`);
    return Number(encontrado[1].replace(/_/g, ''));
  };

  assert.equal(EDAD_MAXIMA_MS, numero('MAX_SAMPLE_AGE_MS'));
  assert.equal(PRECISION_BUENA_M, numero('GOOD_ACCURACY_METERS'));
  assert.equal(PRECISION_POBRE_M, numero('POOR_ACCURACY_METERS'));
  assert.equal(GRACIA_DE_LA_POBRE_MS, numero('POOR_REPLACEMENT_GRACE_MS'));
  assert.equal(FACTOR_DE_DEGRADACION, numero('POOR_DEGRADATION_FACTOR'));
  assert.equal(VELOCIDAD_MAXIMA_KMH, numero('MAX_PLAUSIBLE_SPEED_KMH'));
});

// ---------------------------------------------------------------------------
// Qué coordenada se cree
// ---------------------------------------------------------------------------

test('una coordenada malformada se rechaza', () => {
  for (const mala of [
    null, undefined, 'x', 42, {},
    { coords: { latitude: NaN, longitude: 0 } },
    { coords: { latitude: Infinity, longitude: 0 } },
    { coords: { latitude: 91, longitude: 0 } },
    { coords: { latitude: 0, longitude: 181 } },
    // El (0,0) es un campo sin rellenar, no el golfo de Guinea.
    { coords: { latitude: 0, longitude: 0 } }
  ]) {
    assert.equal(normalizarUbicacion(mala), null, `${JSON.stringify(mala)} se acepta`);
  }

  assert.deepEqual(normalizarUbicacion(lectura()), {
    lat: enMaracaibo.lat, lng: enMaracaibo.lng, precision: 12, momento: AHORA
  });
});

test('lo que el sistema no dijo, no se inventa', () => {
  const sinExtras = normalizarUbicacion({ coords: { latitude: 10.6, longitude: -71.6 } });
  assert.equal(sinExtras.precision, null, 'se inventó una precisión');
  assert.equal(sinExtras.momento, null, 'se inventó una hora');
  // Y sin precisión no se presume ni buena ni mala.
  assert.equal(calidadDe(sinExtras), CALIDAD.ACEPTABLE);
});

test('una lectura vieja no pasa por «dónde estás ahora»', () => {
  const vieja = normalizarUbicacion(lectura({ timestamp: AHORA - EDAD_MAXIMA_MS - 1 }));
  const veredicto = evaluarUbicacion(vieja, { ahora: AHORA });
  assert.equal(veredicto.aceptar, false);
  assert.equal(veredicto.motivo, RECHAZO.VIEJA);
});

test('un salto imposible se rechaza, y uno normal no', () => {
  const anterior = normalizarUbicacion(lectura());

  // Cincuenta kilómetros en un segundo: nadie.
  const imposible = normalizarUbicacion(lectura({
    coords: { latitude: 11.1, longitude: -71.6125, accuracy: 12 },
    timestamp: AHORA + 1000
  }));
  assert.equal(evaluarUbicacion(imposible, { anterior, ahora: AHORA + 1000 }).motivo,
    RECHAZO.SALTO_IMPOSIBLE);

  // Doscientos metros en diez segundos: una moto por la avenida.
  const creible = normalizarUbicacion(lectura({
    coords: { latitude: enMaracaibo.lat + 0.0018, longitude: enMaracaibo.lng, accuracy: 12 },
    timestamp: AHORA + 10_000
  }));
  assert.equal(evaluarUbicacion(creible, { anterior, ahora: AHORA + 10_000 }).aceptar, true);
});

test('una lectura de antena no pisa a una buena reciente', () => {
  const buena = normalizarUbicacion(lectura({ coords: { accuracy: 8 } }));
  const pobre = normalizarUbicacion(lectura({
    coords: { latitude: enMaracaibo.lat + 0.002, longitude: enMaracaibo.lng, accuracy: 900 },
    timestamp: AHORA + 3000
  }));

  assert.equal(evaluarUbicacion(pobre, { anterior: buena, ahora: AHORA + 3000 }).motivo,
    RECHAZO.POBRE_PISANDO_BUENA);

  // Pasada la gracia, mejor algo que nada.
  const masTarde = AHORA + GRACIA_DE_LA_POBRE_MS + 1000;
  const pobreTardia = normalizarUbicacion(lectura({
    coords: { latitude: enMaracaibo.lat + 0.002, longitude: enMaracaibo.lng, accuracy: 900 },
    timestamp: masTarde
  }));
  assert.equal(evaluarUbicacion(pobreTardia, { anterior: buena, ahora: masTarde }).aceptar, true);
});

test('la incertidumbre juega a favor de la muestra', () => {
  // Dos lecturas con cien metros de error cada una, separadas ciento veinte
  // metros: la mayor parte del salto lo explica la propia imprecisión.
  const anterior = normalizarUbicacion(lectura({ coords: { accuracy: 100 } }));
  const siguiente = normalizarUbicacion(lectura({
    coords: { latitude: enMaracaibo.lat + 0.0011, longitude: enMaracaibo.lng, accuracy: 100 },
    timestamp: AHORA + 1000
  }));
  assert.equal(evaluarUbicacion(siguiente, { anterior, ahora: AHORA + 1000 }).aceptar, true);
});

test('la distancia se mide de verdad', () => {
  assert.equal(Math.round(metrosEntre({ lat: 10.64, lng: -71.61 }, { lat: 10.64, lng: -71.61 })), 0);
  const mil = metrosEntre({ lat: 10.64, lng: -71.61 }, { lat: 10.649, lng: -71.61 });
  assert.ok(mil > 950 && mil < 1050, `un kilómetro medido como ${mil}`);
});

// ---------------------------------------------------------------------------
// Los estados
// ---------------------------------------------------------------------------

test('se arranca sin saber nada, y sólo entonces se puede preguntar', () => {
  assert.equal(UBICACION_INICIAL.fase, 'DESCONOCIDA');
  assert.equal(UBICACION_INICIAL.posicion, null);
  assert.equal(hayPosicion(UBICACION_INICIAL), false);
  assert.equal(puedePedirPermiso(UBICACION_INICIAL), true);

  // Tras un «no» no se vuelve a insistir: el sistema deja de enseñar el
  // diálogo y el segundo intento sólo repite el rechazo.
  const denegada = alFallar(UBICACION_INICIAL, 'DENEGADA', 'dijo que no');
  assert.equal(puedePedirPermiso(denegada), false);
});

test('un fallo NO borra la última posición conocida', () => {
  // Si el GPS pierde señal en un túnel, el punto no puede desaparecer: la
  // última posición sigue siendo la mejor respuesta que hay.
  const muestra = normalizarUbicacion(lectura());
  const listo = conPosicion(muestra);
  assert.equal(listo.fase, 'LISTA');

  for (const fase of ['DENEGADA', 'SIN_SERVICIO', 'ERROR']) {
    const roto = alFallar(listo, fase, 'lo que sea');
    assert.equal(roto.fase, fase);
    assert.deepEqual(roto.posicion, muestra, `${fase} perdió la posición`);
    assert.equal(hayPosicion(roto), true);
  }
});

test('el permiso denegado y la ubicación apagada NO son el mismo problema', () => {
  // Se arreglan de forma distinta, así que la pantalla tiene que poder
  // decirlo distinto. Y ninguno es «sin internet».
  const denegada = alFallar(UBICACION_INICIAL, 'DENEGADA', 'no dio permiso');
  const apagada = alFallar(UBICACION_INICIAL, 'SIN_SERVICIO', 'ubicación apagada');
  assert.notEqual(denegada.fase, apagada.fase);

  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  assert.match(capa, /hasServicesEnabledAsync/);
  assert.match(capa, /'SIN_SERVICIO'/);
});

// ---------------------------------------------------------------------------
// Maracaibo
// ---------------------------------------------------------------------------

test('estar fuera de Maracaibo NO es un error de GPS', () => {
  // Es la distinción que más importa: el GPS acertó, sencillamente no damos
  // servicio ahí. Convertirlo en ERROR mandaría a alguien a revisar su
  // teléfono cuando lo que pasa es otra cosa.
  const bogota = conPosicion(normalizarUbicacion({
    coords: { latitude: 4.711, longitude: -74.072, accuracy: 10 },
    timestamp: AHORA
  }));

  assert.equal(bogota.fase, 'LISTA', 'fuera del área se marcó como avería');
  assert.equal(bogota.fueraDelArea, true);
  assert.equal(bogota.motivo, null);

  const aqui = conPosicion(normalizarUbicacion(lectura()));
  assert.equal(aqui.fueraDelArea, false);
});

test('el área de servicio no se toca en esta fase', () => {
  // Sigue siendo la misma que la de la aplicación web, con su prueba aparte.
  const modelo = sinComentarios('mapa/modelo.ts');
  assert.match(modelo, /RADIO_DE_SERVICIO_KM = 60/);
  assert.match(modelo, /export function dentroDelArea/);
});

// ---------------------------------------------------------------------------
// El mapa
// ---------------------------------------------------------------------------

test('el mapa recibe la coordenada real, y sin ella no pinta nada', () => {
  const sinGps = mapaDelViaje(null);
  assert.equal(sinGps.marcadores.length, 0);
  assert.deepEqual(sinGps.camara, CAMARA_DE_MARACAIBO);

  const conGps = mapaDelViaje(null, { usuarioEn: enMaracaibo });
  const yo = conGps.marcadores.find(marcador => marcador.clave === 'usuario');
  assert.ok(yo, 'no se pinta dónde estás');
  assert.equal(yo.clase, 'usuario');
  assert.deepEqual(yo.en, enMaracaibo);
  // No se le inventa un rumbo: no se sabe hacia dónde mira quien camina.
  assert.equal(yo.rumbo, null);
});

test('tu posición NO abre el encuadre del viaje', () => {
  // Si entrara en el encuadre, con el conductor a dos calles el mapa se
  // alejaría a media ciudad sin que nadie lo pidiera.
  const viaje = {
    origenEn: { lat: 10.66, lng: -71.61 },
    destinoEn: { lat: 10.65, lng: -71.62 },
    origen: 'A', destino: 'B', tipoDeVehiculo: 'MOTO'
  };
  const sinMi = mapaDelViaje(viaje);
  const conMigoLejos = mapaDelViaje(viaje, { usuarioEn: { lat: 4.711, lng: -74.072 } });
  assert.deepEqual(conMigoLejos.camara, sinMi.camara, 'el encuadre se abrió por mi posición');
});

test('la cámara sólo se mueve cuando alguien pulsa centrar', () => {
  const viaje = {
    origenEn: { lat: 10.66, lng: -71.61 },
    destinoEn: { lat: 10.65, lng: -71.62 },
    origen: 'A', destino: 'B', tipoDeVehiculo: 'MOTO'
  };
  const normal = mapaDelViaje(viaje, { usuarioEn: enMaracaibo });
  const centrado = mapaDelViaje(viaje, { usuarioEn: enMaracaibo, centrarEn: enMaracaibo });

  assert.notDeepEqual(centrado.camara, normal.camara);
  assert.equal(centrado.camara.centro.lat, enMaracaibo.lat);

  // Y es una foto, no un seguimiento: la pantalla guarda la posición del
  // instante del clic, no la posición viva.
  const pantalla = sinComentarios('app/viaje-activo.tsx');
  assert.match(pantalla, /setCentrarEn\(\{ lat: donde\.lat, lng: donde\.lng \}\)/);
});

test('sin viaje pero con GPS, la vista arranca donde estás', () => {
  const soloYo = mapaDelViaje(null, { usuarioEn: enMaracaibo });
  assert.equal(soloYo.camara.centro.lat, enMaracaibo.lat);
  assert.notDeepEqual(soloYo.camara, CAMARA_DE_MARACAIBO);
});

// ---------------------------------------------------------------------------
// Un solo observador, y que se apague
// ---------------------------------------------------------------------------

test('hay UN solo sitio que observa el GPS', () => {
  // Dos observadores serían dos veces la batería y dos posiciones que podrían
  // no coincidir.
  const carpetas = ['app', 'preview', 'ui', 'realtime', 'domain', 'services', 'context'];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      const codigo = fs.readFileSync(completa, 'utf8');
      assert.equal(/watchPositionAsync|getCurrentPositionAsync/.test(codigo), false,
        `${carpeta}/${nombre} habla con el GPS por su cuenta`);
    }
  }

  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  assert.equal((capa.match(/watchPositionAsync/g) ?? []).length, 1);
});

test('no se abre un segundo observador si ya hay uno', () => {
  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  assert.match(capa, /if \(arrancando\.current \|\| observador\.current !== null\) return;/);
});

test('el observador se apaga al irse al fondo y se recupera al volver', () => {
  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  assert.match(capa, /AppState\.addEventListener/);
  // Al fondo: parar. Mantenerlo vivo con trucos es lo que esta fase no hace.
  assert.match(capa, /if \(siguiente !== 'active'\) \{\s*detener\(\);/);
  // Al volver: revisar el permiso, que pudo cambiar en los ajustes.
  assert.match(capa, /getForegroundPermissionsAsync/);
  // Y al desmontar, limpieza.
  assert.match(capa, /observador\.current\?\.remove\(\)/);
});

// ---------------------------------------------------------------------------
// Los límites de esta fase
// ---------------------------------------------------------------------------

test('el segundo plano vive en UN solo sitio', () => {
  // Esta prueba prohibia cualquier segundo plano. El dueno lo autorizo en
  // DRIVER-LOCATION-RESILIENCE-1, y lo que protege ahora es que no se
  // reparta: seguir a alguien con la aplicacion cerrada es lo mas invasivo
  // que hace esta aplicacion, y tiene que poder leerse en un fichero.
  const permitidos = [
    path.join('ubicacion', 'tareaDeUbicacion.ts'),
    path.join('ubicacion', 'SeguimientoDelConductor.tsx'),
    // El permiso se separo del seguimiento al exigirlo ANTES de entrar en
    // servicio: tiene que estar montado por encima de la disponibilidad para
    // que esta pueda preguntarle. Sigue estando en `ubicacion/`, nombrado y
    // contado, que es lo que esta prueba protege.
    path.join('ubicacion', 'PermisoDeSegundoPlano.tsx')
  ];
  const carpetas = ['app', 'ubicacion', 'realtime', 'domain', 'services', 'context', 'ui', 'preview'];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      if (permitidos.some(p => completa.endsWith(p))) continue;
      const codigo = despojarComentarios(fs.readFileSync(completa, 'utf8'));
      assert.equal(/requestBackgroundPermissionsAsync|startLocationUpdatesAsync/.test(codigo), false,
        `${carpeta}/${nombre} toca el segundo plano por su cuenta`);
    }
  }
});

test('el texto del permiso dice lo que de verdad pasa', () => {
  const app = JSON.parse(leer('app.json'));
  const entrada = app.expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-location');
  assert.ok(entrada, 'expo-location no está declarado como complemento');

  // El de primer plano NO menciona segundo plano: ese permiso no lo cubre,
  // y prometerlo ahi seria pedir una cosa contando otra.
  assert.match(entrada[1].locationWhenInUsePermission, /ubicación para mostrar dónde estás/);
  assert.equal(/segundo plano|siempre|todo el tiempo/i.test(entrada[1].locationWhenInUsePermission), false);

  // Y el de segundo plano SI lo dice, con las dos mitades de la verdad:
  // cuando se comparte y cuando deja de compartirse. Prometer solo la
  // primera mitad seria la mentira facil.
  const fondo = entrada[1].locationAlwaysAndWhenInUsePermission;
  assert.match(fondo, /pantalla esté apagada/);
  assert.match(fondo, /sales de servicio/);
});

test('la ubicación NO se manda a ningún sitio todavía', () => {
  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  for (const prohibido of ['emit(', 'fetch(', 'apiFetch', 'socket', 'driver:location', 'passenger:location']) {
    assert.equal(capa.includes(prohibido), false, `la capa de ubicación usa ${prohibido}`);
  }
});

test('la ubicación no decide nada sobre el viaje', () => {
  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  for (const negocio of ['SEARCHING', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'AVAILABLE', 'useViajeActivo']) {
    assert.equal(capa.includes(negocio), false, `la ubicación decide sobre «${negocio}»`);
  }
});

test('no se guarda historial de ubicación en el dispositivo', () => {
  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  for (const prohibido of ['AsyncStorage', 'SecureStore', 'localStorage', 'setItem']) {
    assert.equal(capa.includes(prohibido), false, `la ubicación se guarda con ${prohibido}`);
  }
});

test('no se registran coordenadas', () => {
  // Un registro con la posición de alguien es un problema de privacidad que
  // no compensa ninguna comodidad de depuración.
  const capa = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  assert.equal(/console\.(log|warn|info|debug)/.test(capa), false);
  // El motivo que sí se guarda es texto, nunca la posición.
  assert.match(capa, /function descripcionDe/);
  assert.equal(/descripcionDe\([^)]*lat/.test(capa), false);
});

test('el mapa sigue sin conductor en vivo y sin ruta', () => {
  const presenter = sinComentarios('domain/mapaDelViaje.ts');
  assert.match(presenter, /ruta: \[\]/);
  // El conductor sólo si de verdad se sabe dónde está; nunca alrededor del
  // pasajero por decoración.
  assert.match(presenter, /const conductorEn = opciones\.conductorEn \?\? null;/);
});

test('el marcador del usuario no es un vehículo', () => {
  const piezas = sinComentarios('mapa/Marcadores.tsx');
  const usuario = piezas.slice(piezas.indexOf("marcador.clase === 'usuario'"));
  const hastaElSiguiente = usuario.slice(0, usuario.indexOf("marcador.clase === 'origen'"));
  assert.equal(/MarcadorDeVehiculo/.test(hastaElSiguiente), false,
    'al usuario se le pintó un vehículo');
});
