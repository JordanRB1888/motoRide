import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createLocationThrottle,
  approximateDistanceMeters,
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_MIN_DISTANCE_METERS
} from '../src/utils/locationThrottle.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * El regulador existe porque `watchPosition` con alta precisión entrega
 * muestras varias veces por segundo, y cada una emitía un evento de socket y
 * además una petición REST desde el teléfono del conductor.
 */

const EN = { latitude: 10.6427, longitude: -71.6125 };
// Unos 111 metros al norte: un grado de latitud son ~111 km.
const LEJOS = { latitude: 10.6437, longitude: -71.6125 };
// Menos de dos metros: deriva típica del GPS con la moto parada.
const CASI_IGUAL = { latitude: 10.64271, longitude: -71.61251 };

test('la primera muestra siempre se envía', () => {
  const regulador = createLocationThrottle();
  assert.equal(regulador.shouldSend(EN, 1000), true);
});

test('el suelo de frecuencia no se salta ni moviéndose deprisa', () => {
  const regulador = createLocationThrottle({ minIntervalMs: 2000 });
  regulador.markSent(EN, 1000);

  // Aunque la moto se haya desplazado más de cien metros, no se envía antes
  // de tiempo: es un suelo duro, no una sugerencia.
  assert.equal(regulador.shouldSend(LEJOS, 1500), false);
  assert.equal(regulador.shouldSend(LEJOS, 2999), false);
  assert.equal(regulador.shouldSend(LEJOS, 3000), true, 'cumplido el plazo sí');
});

test('con la moto parada no se envía hasta la señal de vida', () => {
  const regulador = createLocationThrottle({ minIntervalMs: 2000, heartbeatMs: 15_000 });
  regulador.markSent(EN, 0);

  // La deriva del GPS estando parado no debe generar tráfico.
  for (const t of [2000, 5000, 10_000, 14_999]) {
    assert.equal(regulador.shouldSend(CASI_IGUAL, t), false, `no debía enviarse en ${t} ms`);
  }
  assert.equal(regulador.shouldSend(CASI_IGUAL, 15_000), true, 'la señal de vida sí sale');
});

test('un desplazamiento real se envía en cuanto vence el suelo', () => {
  const regulador = createLocationThrottle({ minIntervalMs: 2000, heartbeatMs: 15_000 });
  regulador.markSent(EN, 0);
  // Sin esta rama, un conductor en marcha solo se actualizaría cada quince
  // segundos y el pasajero vería la moto a saltos.
  assert.equal(regulador.shouldSend(LEJOS, 2000), true);
});

test('markSent es lo que reinicia el ciclo, no shouldSend', () => {
  const regulador = createLocationThrottle({ minIntervalMs: 2000 });
  regulador.markSent(EN, 0);
  // Preguntar muchas veces no consume el cupo: si `shouldSend` tuviera efecto
  // se perderían muestras según cuántas veces se consultara.
  for (let i = 0; i < 50; i += 1) regulador.shouldSend(LEJOS, 3000);
  assert.equal(regulador.shouldSend(LEJOS, 3000), true);

  regulador.markSent(LEJOS, 3000);
  assert.equal(regulador.shouldSend(LEJOS, 3500), false, 'ahora sí cuenta desde el envío');
});

test('reset vuelve a dejar pasar la muestra siguiente', () => {
  const regulador = createLocationThrottle({ minIntervalMs: 2000 });
  regulador.markSent(EN, 1000);
  assert.equal(regulador.shouldSend(EN, 1100), false);
  // Tras reconectar, el servidor no sabe dónde está la moto.
  regulador.reset();
  assert.equal(regulador.shouldSend(EN, 1100), true);
});

test('una muestra ausente nunca se envía', () => {
  const regulador = createLocationThrottle();
  assert.equal(regulador.shouldSend(null, 1000), false);
  assert.equal(regulador.shouldSend(undefined, 1000), false);
});

// ------------------------------------------------------------------ distancia

test('la distancia aproximada es correcta en el orden de magnitud útil', () => {
  assert.equal(approximateDistanceMeters(EN, EN), 0);
  // Un grado de latitud son unos 111 km; una milésima, unos 111 m.
  const cien = approximateDistanceMeters(EN, LEJOS);
  assert.ok(cien > 100 && cien < 125, `esperaba ~111 m, obtuve ${cien}`);
  assert.ok(approximateDistanceMeters(EN, CASI_IGUAL) < 3);
});

test('una coordenada ilegible no hace pasar por quieta a la moto', () => {
  // Tratarla como distancia cero silenciaría la posición del conductor.
  for (const roto of [null, undefined, {}, { latitude: 'x', longitude: -71 }, { latitude: NaN, longitude: 0 }]) {
    assert.equal(approximateDistanceMeters(EN, roto), Infinity, `entrada: ${JSON.stringify(roto)}`);
    assert.equal(approximateDistanceMeters(roto, EN), Infinity);
  }
});

// ---------------------------------------------------------------- parámetros

test('el rastreador no envía ninguna posición sin pasar por el regulador', () => {
  const fuente = fs.readFileSync(path.join(raiz, 'src/services/driverGpsTracker.js'), 'utf8');

  // Cada punto del rastreador que manda posición a la red --el camino normal y
  // el de la posición de reserva cuando falla el GPS-- debe consultar antes al
  // regulador y confirmarlo después. Sin esto, una rama nueva volvería a
  // emitir con cada muestra del GPS.
  const emisiones = fuente.match(/emit\(\s*'driver:location_update'/g) || [];
  const consultas = fuente.match(/locationThrottle\.shouldSend\(/g) || [];
  const confirmaciones = fuente.match(/locationThrottle\.markSent\(/g) || [];

  assert.ok(emisiones.length > 0, 'se esperaba encontrar el envío de posición');
  assert.equal(consultas.length, emisiones.length, 'cada emisión necesita su consulta al regulador');
  assert.equal(confirmaciones.length, emisiones.length, 'cada emisión necesita confirmar el envío');

  // La petición REST viaja junto a la emisión de socket, así que queda tras la
  // misma compuerta; comprobamos que no se haya separado a otra rama.
  assert.ok(
    fuente.includes("apiService.patch('/drivers/location'"),
    'la persistencia REST sigue en el rastreador'
  );
  assert.equal(fuente.match(/apiService\.patch\('\/drivers\/location'/g).length, 1);
});

test('los valores por defecto quedan por debajo del techo del servidor', () => {
  // El servidor admite 20 eventos de GPS cada 10 s, o sea 2 por segundo. El
  // cliente debe quedarse holgadamente por debajo para que un conductor real
  // nunca vea un rechazo.
  const porSegundo = 1000 / DEFAULT_MIN_INTERVAL_MS;
  assert.ok(porSegundo <= 1, `el cliente enviaría ${porSegundo}/s, demasiado cerca del techo`);
  assert.ok(DEFAULT_HEARTBEAT_MS > DEFAULT_MIN_INTERVAL_MS, 'la señal de vida debe ser más espaciada');
  assert.ok(
    DEFAULT_MIN_DISTANCE_METERS >= 5 && DEFAULT_MIN_DISTANCE_METERS <= 30,
    'por debajo de 5 m manda la deriva del GPS; por encima de 30 m la moto se ve a saltos'
  );
});
