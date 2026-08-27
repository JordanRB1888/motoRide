import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GOOD_ACCURACY_METERS,
  LOCATION_QUALITY,
  MAX_PLAUSIBLE_SPEED_KMH,
  MAX_SAMPLE_AGE_MS,
  POOR_ACCURACY_METERS,
  POOR_REPLACEMENT_GRACE_MS,
  SAMPLE_REJECTION,
  distanceBetweenMeters,
  evaluateLocationSample,
  normalizeLocationSample,
  qualityOf
} from '../src/utils/locationQuality.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * GPS-1: el filtro de calidad de ubicacion, probado con la logica REAL.
 *
 * El modulo es puro a proposito: las mismas reglas que hoy alimenta el
 * navegador podran alimentarse desde Android/iOS normalizando sus lecturas al
 * mismo contrato {lat, lng, accuracy, timestamp}.
 */

const AHORA = 1_700_000_000_000;

/** Muestra en Maracaibo con desplazamiento en metros aproximados. */
function muestra({ este = 0, norte = 0, accuracy = 10, edadMs = 0 } = {}) {
  return {
    lat: 10.6427 + norte / 111_000,
    lng: -71.6125 + este / (111_000 * Math.cos(10.6427 * Math.PI / 180)),
    accuracy,
    timestamp: AHORA - edadMs
  };
}

// --------------------------------------------------------------------------
// Normalizacion: nada se inventa
// --------------------------------------------------------------------------

test('normaliza el Position del navegador conservando su momento de medicion', () => {
  const sample = normalizeLocationSample({
    coords: { latitude: 10.65, longitude: -71.61, accuracy: 12.4 },
    timestamp: AHORA - 500
  });
  assert.deepEqual(sample, { lat: 10.65, lng: -71.61, accuracy: 12.4, timestamp: AHORA - 500 });
});

test('sin accuracy o sin timestamp quedan null: jamas se fabrican', () => {
  const sample = normalizeLocationSample({ lat: 10.65, lng: -71.61 });
  assert.equal(sample.accuracy, null);
  assert.equal(sample.timestamp, null);
});

test('coordenadas ilegibles o fuera de rango no producen muestra', () => {
  for (const rota of [null, {}, { lat: 'x', lng: -71 }, { lat: 95, lng: -71 }, { lat: 10, lng: 200 }]) {
    assert.equal(normalizeLocationSample(rota), null, JSON.stringify(rota));
  }
});

// --------------------------------------------------------------------------
// §15 — la muestra buena entra
// --------------------------------------------------------------------------

test('una muestra buena y fresca se acepta con calidad GOOD', () => {
  const veredicto = evaluateLocationSample(muestra({ accuracy: 8 }), { now: AHORA });
  assert.equal(veredicto.accept, true);
  assert.equal(veredicto.quality, LOCATION_QUALITY.GOOD);
});

test('la primera muestra sin referencia previa se acepta aunque sea mediocre', () => {
  // Sin vara de comparacion, algo es mejor que nada: el filtro protege
  // reemplazos, no la adquisicion inicial.
  const veredicto = evaluateLocationSample(muestra({ accuracy: 400 }), { now: AHORA });
  assert.equal(veredicto.accept, true);
  assert.equal(veredicto.quality, LOCATION_QUALITY.POOR);
});

// --------------------------------------------------------------------------
// §16 — una lectura pobre no pisa a una buena reciente
// --------------------------------------------------------------------------

test('una lectura de torre (450 m) no sustituye a un GPS de 8 m con 2 s de vida', () => {
  const buena = muestra({ accuracy: 8, edadMs: 2_000 });
  const pobre = muestra({ este: 350, accuracy: 450, edadMs: 1_000 });
  const veredicto = evaluateLocationSample(pobre, { previous: buena, now: AHORA });
  assert.equal(veredicto.accept, false);
  assert.equal(veredicto.reason, SAMPLE_REJECTION.POOR_REPLACING_BETTER);
});

test('pasada la gracia, la lectura pobre entra: mejor algo que nada', () => {
  const buenaVieja = muestra({ accuracy: 8, edadMs: POOR_REPLACEMENT_GRACE_MS + 2_000 });
  const pobre = muestra({ este: 350, accuracy: 450 });
  const veredicto = evaluateLocationSample(pobre, { previous: buenaVieja, now: AHORA });
  assert.equal(veredicto.accept, true, 'con la buena envejecida, la pobre es la mejor evidencia disponible');
});

test('una oscilacion normal de precision (8 m -> 20 m) no cuenta como degradacion', () => {
  const previa = muestra({ accuracy: 8, edadMs: 2_000 });
  const nueva = muestra({ este: 15, accuracy: 20 });
  assert.equal(evaluateLocationSample(nueva, { previous: previa, now: AHORA }).accept, true);
});

// --------------------------------------------------------------------------
// §17 — el salto imposible
// --------------------------------------------------------------------------

test('un salto de 2 km en 2 s con buena precision se rechaza como imposible', () => {
  const previa = muestra({ accuracy: 10, edadMs: 2_000 });
  const salto = muestra({ este: 2_000, accuracy: 10 });
  const veredicto = evaluateLocationSample(salto, { previous: previa, now: AHORA });
  assert.equal(veredicto.accept, false);
  assert.equal(veredicto.reason, SAMPLE_REJECTION.REJECTED_JUMP);
  // La velocidad implicita del caso: 2000 m / 2 s = 3600 km/h >> techo.
  assert.ok(MAX_PLAUSIBLE_SPEED_KMH < 3_600);
});

// --------------------------------------------------------------------------
// §7 — la envolvente de incertidumbre descuenta a favor de la muestra
// --------------------------------------------------------------------------

test('el mismo desplazamiento con precision de 300 m NO es un salto: lo explica el ruido', () => {
  // 500 m aparentes con incertidumbre combinada de 600 m: el movimiento no
  // explicado es cero. Rechazarlo castigaria lecturas ruidosas legitimas.
  const previa = muestra({ accuracy: 300, edadMs: 2_000 });
  const nueva = muestra({ este: 500, accuracy: 300 });
  const veredicto = evaluateLocationSample(nueva, { previous: previa, now: AHORA });
  assert.notEqual(veredicto.reason, SAMPLE_REJECTION.REJECTED_JUMP);
});

// --------------------------------------------------------------------------
// §18 — la moto real nunca se rechaza
// --------------------------------------------------------------------------

test('un recorrido urbano realista de moto se acepta muestra a muestra', () => {
  // ~60 km/h sostenidos con giros: 33 m por muestra de 2 s, precision tipica
  // de 8-18 m. Ninguna se puede perder.
  let previa = null;
  let momento = AHORA - 40_000;
  for (let i = 0; i < 20; i += 1) {
    const rumboEste = i < 10 ? 33 : 0;   // giro a mitad de camino
    const rumboNorte = i < 10 ? 0 : 33;
    const candidata = {
      lat: (previa?.lat ?? 10.6427) + rumboNorte / 111_000,
      lng: (previa?.lng ?? -71.6125) + rumboEste / (111_000 * Math.cos(10.6427 * Math.PI / 180)),
      accuracy: 8 + (i % 3) * 5,
      timestamp: momento
    };
    const veredicto = evaluateLocationSample(candidata, { previous: previa, now: momento + 200 });
    assert.equal(veredicto.accept, true, `muestra ${i} rechazada: ${veredicto.reason}`);
    previa = candidata;
    momento += 2_000;
  }
});

test('una aceleracion fuerte pero fisicamente posible (100 km/h) se acepta', () => {
  const previa = muestra({ accuracy: 10, edadMs: 2_000 });
  const rapida = muestra({ este: 55, accuracy: 10 }); // ~55 m en 2 s ≈ 100 km/h
  assert.equal(evaluateLocationSample(rapida, { previous: previa, now: AHORA }).accept, true);
});

// --------------------------------------------------------------------------
// §19 — la muestra vieja no entra como fresca
// --------------------------------------------------------------------------

test('una lectura de cache mas vieja que el techo se rechaza como STALE_SAMPLE', () => {
  const vieja = muestra({ accuracy: 10, edadMs: MAX_SAMPLE_AGE_MS + 5_000 });
  const veredicto = evaluateLocationSample(vieja, { now: AHORA });
  assert.equal(veredicto.accept, false);
  assert.equal(veredicto.reason, SAMPLE_REJECTION.STALE_SAMPLE);
});

test('el techo del cliente queda muy por debajo de los 120 s del servidor', () => {
  // GPS-1 evita alimentar al servidor con muestras evidentemente viejas; la
  // regla de frescura del DESPACHO sigue siendo la del servidor y no cambia.
  assert.ok(MAX_SAMPLE_AGE_MS < 120_000 / 2);
  const indice = leer('server/index.js');
  assert.ok(indice.includes('MAX_DRIVER_LOCATION_AGE_MS || 120_000'), 'la regla del servidor no cambio');
});

// --------------------------------------------------------------------------
// Etiquetas de calidad y distancia
// --------------------------------------------------------------------------

test('las etiquetas de calidad siguen los umbrales con nombre', () => {
  assert.equal(qualityOf({ accuracy: GOOD_ACCURACY_METERS }), LOCATION_QUALITY.GOOD);
  assert.equal(qualityOf({ accuracy: POOR_ACCURACY_METERS }), LOCATION_QUALITY.FAIR);
  assert.equal(qualityOf({ accuracy: POOR_ACCURACY_METERS + 1 }), LOCATION_QUALITY.POOR);
  assert.equal(qualityOf({ accuracy: null }), LOCATION_QUALITY.FAIR, 'sin evidencia no se castiga');
});

test('la distancia del semiverseno es correcta a escala urbana', () => {
  const a = muestra();
  const b = muestra({ este: 1_000 });
  const d = distanceBetweenMeters(a, b);
  assert.ok(Math.abs(d - 1_000) < 15, `esperaba ~1000 m, obtuve ${d}`);
});

// --------------------------------------------------------------------------
// Integracion: el rastreador del conductor y el watch del pasajero filtran
// --------------------------------------------------------------------------

const sinComentarios = fuente => fuente
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ')
  .replace(/[ \t]\/\/[^\n]*$/gm, ' ');

test('el rastreador del conductor evalua cada lectura y descarta sin emitir', () => {
  const tracker = sinComentarios(leer('src/services/driverGpsTracker.js'));
  assert.ok(tracker.includes('normalizeLocationSample(pos)'), 'normaliza la lectura real');
  assert.ok(tracker.includes('evaluateLocationSample(sample'), 'y la evalua contra la ultima aceptada');
  // La DEFINICION del metodo (nombre al inicio de su linea), no la referencia
  // `this._onPositionSuccess(pos)` del watchPosition.
  const definicion = nombre => tracker.search(new RegExp(`^  ${nombre}\\(`, 'm'));
  const exito = tracker.slice(definicion('_onPositionSuccess'), definicion('_onPositionError'));
  const rechazo = exito.indexOf('if (!veredicto.accept)');
  const evento = exito.indexOf('58express:driver-position');
  const emision = exito.indexOf("emit('driver:location_update'");
  assert.ok(rechazo >= 0 && evento > rechazo && emision > rechazo,
    'el rechazo corta ANTES del evento visual y de la emision de red');
  // El rechazo se registra por categoria: nunca con las coordenadas.
  const bloqueRechazo = exito.slice(rechazo, exito.indexOf('this.lastAcceptedSample'));
  assert.ok(!bloqueRechazo.includes('latitude') && !bloqueRechazo.includes('.lat'),
    'las coordenadas rechazadas no se registran');
});

test('el payload del conductor lleva la precision y el momento de la MEDICION', () => {
  const tracker = sinComentarios(leer('src/services/driverGpsTracker.js'));
  assert.ok(tracker.includes('accuracy: sample.accuracy'), 'la precision viaja con la muestra');
  assert.ok(tracker.includes('timestamp: sample.timestamp ?? now'),
    'el momento es el de la medicion, no el del procesamiento');
  assert.ok(!/timestamp:\s*now,/.test(tracker.slice(tracker.indexOf('_onPositionSuccess'))),
    'el timestamp del render ya no existe en el payload');
});

test('la reconexion reenvia la ultima muestra real SIN rejuvenecerla', () => {
  const tracker = sinComentarios(leer('src/services/driverGpsTracker.js'));
  const reconexion = tracker.slice(
    tracker.indexOf('this._onDriverConnected = ()'),
    tracker.indexOf('this.socket?.on(')
  );
  assert.ok(reconexion.includes("emit('driver:location_update', this.lastPosition)"),
    'la reconexion reenvia la ultima posicion real tal cual');
  // Sin reescribir la muestra: ni asignarle marca de tiempo nueva, ni
  // reconstruirla. Date.now existe en el bloque SOLO como reloj del regulador.
  assert.ok(!/timestamp\s*:/.test(reconexion), 'la marca de tiempo de la muestra no se toca');
  assert.ok(!/lastPosition\s*=/.test(reconexion), 'la muestra no se reconstruye al reconectar');
  assert.ok(!reconexion.includes('...this.lastPosition'), 'ni se copia con campos nuevos');
});

test('el watch del pasajero filtra igual y no emite muestras rechazadas', () => {
  const app = sinComentarios(leer('src/pages/passenger/passengerApp.js'));
  const watch = app.slice(app.indexOf('function startPassengerTracking'), app.indexOf('function stopPassengerTracking'));
  assert.ok(watch.includes('normalizeLocationSample(position)'));
  assert.ok(watch.includes('evaluateLocationSample(sample'));
  const rechazo = watch.indexOf('if (!veredicto.accept) return');
  const emision = watch.indexOf("emit('passenger:location_update'");
  assert.ok(rechazo >= 0 && emision > rechazo, 'el rechazo corta antes de emitir');
  assert.ok(watch.includes('capturedAt: sample.timestamp'),
    'el estado del pasajero conserva el momento real de la medicion');
});

// --------------------------------------------------------------------------
// GPS-0 sigue en pie (ademas de su propia suite, que corre entera)
// --------------------------------------------------------------------------

test('GPS-1 no reabrio la puerta de GPS-0: la rama de error sigue sin coordenadas', () => {
  const tracker = sinComentarios(leer('src/services/driverGpsTracker.js'));
  assert.ok(!tracker.includes('10.6427'), 'el centro de Maracaibo sigue fuera del rastreador');
  assert.ok(!tracker.includes('71.6125'));
});
