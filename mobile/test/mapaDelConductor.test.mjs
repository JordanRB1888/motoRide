import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  CAMARA_INICIAL_DEL_CONDUCTOR,
  MENSAJES_DE_UBICACION,
  ZOOM_DEL_CONDUCTOR,
  avisoDeUbicacion,
  camaraCentradaEn,
  camaraDelConductor,
  estaBuscando,
  estaRancia,
  marcadorPropio,
  modeloDelMapaDelConductor,
  sePuedeReintentar
} from '../domain/mapaDelConductor.ts';
import { EDAD_MAXIMA_MS } from '../domain/calidadDeUbicacion.ts';

/**
 * EL CONDUCTOR SE VE A SÍ MISMO EN EL MAPA
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que el mapa sea un mapa. Antes era un dibujo: `LienzoDeMapa` pinta la
 *    cuadrícula del recorrido de diseño cuando no recibe `modelo`, y esta
 *    pantalla nunca se lo pasaba.
 * 2. Que la ubicación salga del GPS. Antes era `{ x: 48, y: 30 }`: porcentaje
 *    de pantalla, clavado.
 * 3. Que ver la ubicación NO sea publicarla: fuera de línea se ve, y no sale
 *    nada hacia el servidor.
 * 4. Que la cámara centre una vez y luego deje mirar el mapa en paz.
 * 5. Que no haya un segundo GPS.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

const AHORA = 1_800_000_000_000;
const posicion = (extra = {}) => ({ lat: 10.6427, lng: -71.6125, precision: 12, momento: AHORA, ...extra });
const estado = (extra = {}) => ({ fase: 'LISTA', posicion: posicion(), fueraDelArea: false, motivo: null, ...extra });

// ---------------------------------------------------------------------------
// El marcador propio
// ---------------------------------------------------------------------------

test('la ubicación propia sale del GPS, no de un porcentaje de pantalla', () => {
  const marcador = marcadorPropio(posicion());
  assert.equal(marcador.clase, 'usuario');
  assert.deepEqual(marcador.en, { lat: 10.6427, lng: -71.6125 });
  assert.equal(marcador.destacado, true);
  // Coordenadas, no `x` e `y`.
  assert.ok(!('x' in marcador.en) && !('y' in marcador.en));
});

test('sin lectura no hay marcador: no se inventa ninguna posición', () => {
  assert.equal(marcadorPropio(null), null);
  const modelo = modeloDelMapaDelConductor({ posicion: null, camara: CAMARA_INICIAL_DEL_CONDUCTOR });
  assert.deepEqual(modelo.marcadores, []);
});

test('el marcador SE MUEVE en vez de acumularse: siempre la misma clave', () => {
  const a = marcadorPropio(posicion({ lat: 10.60, lng: -71.60 }));
  const b = marcadorPropio(posicion({ lat: 10.65, lng: -71.65 }));
  const c = marcadorPropio(posicion({ lat: 10.70, lng: -71.70 }));
  assert.equal(a.clave, 'yo');
  assert.equal(b.clave, 'yo');
  assert.equal(c.clave, 'yo');
  // Tres posiciones distintas, un solo marcador cada vez.
  for (const p of [a, b, c]) {
    const modelo = modeloDelMapaDelConductor({ posicion: p.en.lat === undefined ? null : { ...p.en, precision: null, momento: AHORA }, camara: CAMARA_INICIAL_DEL_CONDUCTOR });
    assert.equal(modelo.marcadores.length, 1);
  }
  assert.notDeepEqual(a.en, b.en);
  assert.notDeepEqual(b.en, c.en);
});

test('el modelo del conductor no lleva ruta, ni retícula, ni motos de ejemplo', () => {
  const modelo = modeloDelMapaDelConductor({ posicion: posicion(), camara: CAMARA_INICIAL_DEL_CONDUCTOR });
  assert.deepEqual(modelo.ruta, [], 'el trazado sigue pendiente');
  assert.equal(modelo.eligiendoPunto, false, 'el conductor no elige un punto');
  assert.equal(modelo.marcadores.length, 1, 'sólo él: nada de motos inventadas');
  assert.equal(modelo.marcadores[0].clave, 'yo');
});

test('las motos de ejemplo desaparecieron de la pantalla del conductor', () => {
  const pantalla = despojarComentarios(leer('preview/pantallasC2.tsx'));
  const inicio = pantalla.slice(pantalla.indexOf('export function C2InicioConductor'));
  const cuerpo = inicio.slice(0, inicio.indexOf('\nexport '));
  assert.ok(!/MOTOS_CERCA/.test(cuerpo), 'seguían pintándose motos de la competencia inventadas');
});

// ---------------------------------------------------------------------------
// La cámara
// ---------------------------------------------------------------------------

test('la primera posición centra el mapa UNA vez', () => {
  const anterior = CAMARA_INICIAL_DEL_CONDUCTOR;
  const centrada = camaraDelConductor({ posicion: posicion(), yaCentro: false, anterior });
  assert.notEqual(centrada, anterior);
  assert.deepEqual(centrada.centro, { lat: 10.6427, lng: -71.6125 });
  assert.equal(centrada.abarca, ZOOM_DEL_CONDUCTOR);
});

test('después de centrar, el paneo manual se respeta: la cámara no se recalcula', () => {
  const dondeLaDejo = { centro: { lat: 10.70, lng: -71.70 }, abarca: 0.01 };
  // Llegan lecturas nuevas y la cámara NO se mueve.
  for (const lat of [10.60, 10.61, 10.62]) {
    const siguiente = camaraDelConductor({
      posicion: posicion({ lat }),
      yaCentro: true,
      anterior: dondeLaDejo
    });
    assert.equal(siguiente, dondeLaDejo, 'la cámara peleó contra quien mira el mapa');
  }
});

test('sin posición la cámara se queda donde estaba', () => {
  const anterior = CAMARA_INICIAL_DEL_CONDUCTOR;
  assert.equal(camaraDelConductor({ posicion: null, yaCentro: false, anterior }), anterior);
  assert.equal(camaraDelConductor({ posicion: null, yaCentro: true, anterior }), anterior);
});

test('el botón de recentrar usa la última coordenada válida', () => {
  const camara = camaraCentradaEn(posicion({ lat: 10.70, lng: -71.70 }));
  assert.deepEqual(camara.centro, { lat: 10.70, lng: -71.70 });
  assert.equal(camara.abarca, ZOOM_DEL_CONDUCTOR);
  // Y es más cerrado que el encuadre de ciudad: quien conduce mira su calle.
  assert.ok(ZOOM_DEL_CONDUCTOR < CAMARA_INICIAL_DEL_CONDUCTOR.abarca);
});

test('el botón no está muerto: sin posición, la pide', () => {
  const pantalla = despojarComentarios(leer('app/conductor.tsx'));
  assert.match(pantalla, /const centrarEnMi = useCallback/);
  assert.match(pantalla, /if \(ubicacion\.posicion !== null\)/);
  assert.match(pantalla, /void refrescarUbicacion\(\)/, 'sin posición hay que pedirla');
  assert.match(pantalla, /onCentrar=\{centrarEnMi\}/);
});

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

test('cada fase de la ubicación tiene su aviso, y todos tienen mensaje o silencio', () => {
  assert.equal(avisoDeUbicacion(estado(), AHORA), 'NINGUNO');
  assert.equal(avisoDeUbicacion(estado({ fase: 'DENEGADA', posicion: null }), AHORA), 'DENEGADA');
  assert.equal(avisoDeUbicacion(estado({ fase: 'SIN_SERVICIO', posicion: null }), AHORA), 'SIN_SERVICIO');
  assert.equal(avisoDeUbicacion(estado({ fase: 'ERROR', posicion: null }), AHORA), 'ERROR');
  assert.equal(avisoDeUbicacion(estado({ fase: 'BUSCANDO', posicion: null }), AHORA), 'BUSCANDO');
  assert.equal(avisoDeUbicacion(estado({ fase: 'DESCONOCIDA', posicion: null }), AHORA), 'BUSCANDO');
  // Con mensaje o sin él, ninguno deja la pantalla sin saber qué decir.
  for (const clave of Object.keys(MENSAJES_DE_UBICACION)) {
    const mensaje = MENSAJES_DE_UBICACION[clave];
    assert.ok(mensaje === null || (typeof mensaje === 'string' && mensaje.length > 10), clave);
  }
  assert.equal(MENSAJES_DE_UBICACION.NINGUNO, null, 'cuando va bien, el sitio es del mapa');
});

test('permiso denegado se explica y NO ofrece reintentar: eso se arregla en ajustes', () => {
  assert.match(MENSAJES_DE_UBICACION.DENEGADA, /necesitamos tu ubicación/i);
  assert.match(MENSAJES_DE_UBICACION.DENEGADA, /conductor/i);
  assert.equal(sePuedeReintentar('DENEGADA'), false);
  // Lo que sí se puede reintentar.
  assert.equal(sePuedeReintentar('ERROR'), true);
  assert.equal(sePuedeReintentar('SIN_SERVICIO'), true);
  assert.equal(sePuedeReintentar('RANCIA'), true);
  assert.equal(sePuedeReintentar('NINGUNO'), false);
  assert.equal(sePuedeReintentar('BUSCANDO'), false);
});

test('el error es humano, no técnico', () => {
  assert.equal(MENSAJES_DE_UBICACION.ERROR, 'No pudimos obtener tu ubicación.');
  for (const mensaje of Object.values(MENSAJES_DE_UBICACION)) {
    if (mensaje === null) continue;
    assert.ok(!/undefined|null|Error:|exception|GPS_|E_/.test(mensaje), `tripas en: ${mensaje}`);
  }
});

test('una lectura vieja se enseña, pero no como si fuera de ahora mismo', () => {
  const vieja = posicion({ momento: AHORA - EDAD_MAXIMA_MS - 1 });
  assert.equal(estaRancia(vieja, AHORA), true);
  assert.equal(avisoDeUbicacion(estado({ posicion: vieja }), AHORA), 'RANCIA');
  // Se sigue pintando: es lo único que se sabe.
  assert.equal(modeloDelMapaDelConductor({ posicion: vieja, camara: CAMARA_INICIAL_DEL_CONDUCTOR }).marcadores.length, 1);
  // Justo en el límite todavía no es vieja.
  assert.equal(estaRancia(posicion({ momento: AHORA - EDAD_MAXIMA_MS }), AHORA), false);
  // Sin marca de tiempo no se puede juzgar: no se declara vieja por si acaso.
  assert.equal(estaRancia(posicion({ momento: null }), AHORA), false);
  assert.equal(estaRancia(null, AHORA), false);
});

test('el umbral de frescura es el que ya existía: no se inventó otro', () => {
  const dominio = despojarComentarios(leer('domain/mapaDelConductor.ts'));
  assert.match(dominio, /EDAD_MAXIMA_MS/);
  // Ningún número mágico propio.
  assert.ok(!/[0-9]{4,}\s*;/.test(dominio.replace(/ZOOM_DE_CIUDAD[^\n]*/g, '')), 'umbral inventado');
  assert.equal(EDAD_MAXIMA_MS, 30_000, 'y sigue valiendo lo mismo');
});

test('mientras busca, el mapa se sigue pintando', () => {
  const modelo = modeloDelMapaDelConductor({ posicion: null, camara: CAMARA_INICIAL_DEL_CONDUCTOR });
  assert.ok(modelo.camara, 'hay cámara aunque no haya posición');
  assert.deepEqual(modelo.marcadores, []);
  assert.equal(estaBuscando('BUSCANDO'), true);
  assert.equal(estaBuscando('PIDIENDO_PERMISO'), true);
  assert.equal(estaBuscando('DESCONOCIDA'), true);
  assert.equal(estaBuscando('LISTA'), false);
  assert.equal(estaBuscando('DENEGADA'), false);
  // El aviso es una pastilla, no una pantalla que tape el mapa.
  const aviso = leer('ui/AvisoDeUbicacion.tsx');
  assert.ok(!/flex: 1/.test(aviso), 'el aviso no puede ocupar la pantalla');
  assert.match(aviso, /if \(mensaje === null\) return null/);
});

// ---------------------------------------------------------------------------
// Un solo GPS, y ver no es publicar
// ---------------------------------------------------------------------------

test('no hay un segundo GPS: la pantalla LEE el proveedor único', () => {
  const pantalla = leer('app/conductor.tsx');
  assert.match(pantalla, /useUbicacion\(\)/);
  // Nada de abrir vigilancias por su cuenta.
  for (const prohibido of [/watchPositionAsync/, /getCurrentPositionAsync/, /setInterval/, /expo-location/]) {
    assert.ok(!prohibido.test(pantalla), `la pantalla no debe usar ${prohibido}`);
  }
  // Y el proveedor sigue siendo el único que vigila en primer plano.
  const dueños = ['ubicacion/UbicacionDelDispositivo.tsx', 'ubicacion/tareaDeUbicacion.ts'];
  const conVigilancia = ['ubicacion/UbicacionDelDispositivo.tsx', 'ubicacion/tareaDeUbicacion.ts', 'ubicacion/PermisoDeSegundoPlano.tsx']
    .filter(f => /watchPositionAsync|startLocationUpdatesAsync/.test(leer(f)));
  assert.deepEqual(conVigilancia, dueños, 'apareció otro dueño de la ubicación');
});

test('ver la ubicación NO la publica: fuera de línea no sale nada al servidor', () => {
  const pantalla = despojarComentarios(leer('app/conductor.tsx'));
  // La pantalla sólo lee y pinta: no manda nada.
  for (const prohibido of [/emit\(/, /publicar/i, /llamar\(/, /fetch\(/]) {
    assert.ok(!prohibido.test(pantalla), `la pantalla no debe ${prohibido}`);
  }
  // Quien publica sigue siendo el de siempre, con su propia condición.
  const enVivo = leer('realtime/UbicacionEnVivo.tsx');
  assert.match(enVivo, /disponibilidad|enLinea|AVAILABLE/i, 'la publicación depende de la disponibilidad');
});

test('el dominio del mapa es puro: se prueba sin emulador', () => {
  const dominio = leer('domain/mapaDelConductor.ts');
  for (const prohibido of [/react-native/, /expo-/, /useState/, /useEffect/]) {
    assert.ok(!prohibido.test(dominio), `el dominio no puede depender de ${prohibido}`);
  }
});

// ---------------------------------------------------------------------------
// El mapa es un mapa
// ---------------------------------------------------------------------------

test('la pantalla del conductor pasa el modelo REAL, no el lienzo dibujado', () => {
  const pantalla = despojarComentarios(leer('app/conductor.tsx'));
  assert.match(pantalla, /modeloDelMapa=\{modeloDelMapa\}/);
  assert.match(pantalla, /modeloDelMapaDelConductor\(/);

  // Y el componente lo acepta y lo pasa al lienzo.
  const c2 = despojarComentarios(leer('preview/pantallasC2.tsx'));
  const inicio = c2.slice(c2.indexOf('export function C2InicioConductor'));
  assert.match(inicio.slice(0, 3000), /modelo=\{modeloDelMapa\}/);
  assert.match(inicio.slice(0, 3000), /onCentrar=\{onCentrar\}/);
});

test('sin modelo el laboratorio conserva su lienzo dibujado', () => {
  const c2 = despojarComentarios(leer('preview/pantallasC2.tsx'));
  const inicio = c2.slice(c2.indexOf('export function C2InicioConductor'));
  // La moto dibujada sólo se pinta cuando NO hay mapa real: es el recorrido
  // de diseño, que no tiene GPS y no debería perder su pantalla.
  assert.match(inicio.slice(0, 3000), /vehiculos=\{modeloDelMapa === undefined \? \[mio\] : \[\]\}/);
});

test('no se tocó el estilo del mapa en la nube', () => {
  const estilos = leer('mapa/estilos.ts');
  const claves = leer('mapa/claves.ts');
  // Estos ficheros no se tocan en esta fase.
  assert.ok(estilos.length > 0 && claves.length > 0);
  const pantalla = leer('app/conductor.tsx');
  for (const prohibido of [/mapId/i, /customMapStyle/, /apiKey/i, /PROVIDER_/]) {
    assert.ok(!prohibido.test(pantalla), `la pantalla no debe tocar ${prohibido}`);
  }
});
