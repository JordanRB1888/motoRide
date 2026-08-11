import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calculateFare } from '../domain/pricingService.js';
import {
  DEFAULT_BUSINESS_TIME_ZONE,
  getBusinessHour,
  resolveBusinessTimeZone
} from '../domain/businessTime.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pricingModuleUrl = pathToFileURL(path.join(serverDir, 'domain', 'pricingService.js')).href;

// Ejecuta el cálculo en un proceso con otra zona horaria de sistema para
// comprobar que el resultado comercial no depende del reloj del servidor.
function calculateFareUnderSystemTimeZone(timeZone, requestedAt) {
  const script = `
    import { calculateFare } from ${JSON.stringify(pricingModuleUrl)};
    const fare = calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: ${JSON.stringify(requestedAt)} });
    console.log(JSON.stringify({
      isNight: fare.isNight,
      isPeak: fare.isPeak,
      localHour: fare.localHour,
      timeZone: fare.timeZone,
      fareUSD: fare.fareUSD,
      systemHour: new Date(${JSON.stringify(requestedAt)}).getHours()
    }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: timeZone, BUSINESS_TIME_ZONE: '' },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `El subproceso falló bajo TZ=${timeZone}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('la franja nocturna se evalúa en la hora de Caracas', () => {
  // 22:00 en Venezuela (UTC-4) es horario nocturno aunque en UTC sean las 02:00
  // del día siguiente y en Tokio las 11:00 de la mañana.
  const fare = calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: '2026-08-08T22:00:00-04:00' });
  assert.equal(fare.timeZone, 'America/Caracas');
  assert.equal(fare.localHour, 22);
  assert.equal(fare.isNight, true);
  assert.equal(fare.isPeak, false);
});

test('la hora pico de la mañana y la tarde usan la hora de Caracas', () => {
  const morningPeak = calculateFare({ distanceKm: 3, durationMin: 8, requestedAt: '2026-08-10T07:30:00-04:00' });
  assert.equal(morningPeak.localHour, 7);
  assert.equal(morningPeak.isPeak, true);
  assert.equal(morningPeak.isNight, false);

  const afternoonPeak = calculateFare({ distanceKm: 3, durationMin: 8, requestedAt: '2026-08-10T17:00:00-04:00' });
  assert.equal(afternoonPeak.isPeak, true);

  const midday = calculateFare({ distanceKm: 3, durationMin: 8, requestedAt: '2026-08-10T12:00:00-04:00' });
  assert.equal(midday.isPeak, false);
  assert.equal(midday.isNight, false);
  assert.equal(midday.multiplier, 1);
});

test('el resultado es idéntico en servidores con zonas horarias distintas', () => {
  const instant = '2026-08-08T22:00:00-04:00';
  const tokyo = calculateFareUnderSystemTimeZone('Asia/Tokyo', instant);
  const utc = calculateFareUnderSystemTimeZone('UTC', instant);
  const caracas = calculateFareUnderSystemTimeZone('America/Caracas', instant);

  // Comprobación de que la variable TZ realmente cambió el reloj del proceso:
  // sin ella, la prueba no demostraría nada.
  assert.notEqual(tokyo.systemHour, utc.systemHour);

  for (const result of [tokyo, utc, caracas]) {
    assert.equal(result.timeZone, 'America/Caracas');
    assert.equal(result.localHour, 22);
    assert.equal(result.isNight, true);
    assert.equal(result.isPeak, false);
  }
  assert.equal(tokyo.fareUSD, utc.fareUSD);
  assert.equal(tokyo.fareUSD, caracas.fareUSD);
});

test('BUSINESS_TIME_ZONE permite mover la operación de zona', () => {
  const instant = '2026-08-08T22:00:00-04:00';
  const caracas = calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: instant });
  // En Madrid ese mismo instante son las 04:00: sigue siendo franja nocturna
  // pero la hora local es distinta, lo que prueba que la zona sí se aplica.
  const madrid = calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: instant }, { timeZone: 'Europe/Madrid' });
  assert.equal(caracas.localHour, 22);
  assert.equal(madrid.timeZone, 'Europe/Madrid');
  assert.equal(madrid.localHour, 4);

  // Y a mediodía de Caracas, Madrid ya está en hora pico de la tarde.
  const noon = '2026-08-08T12:00:00-04:00';
  assert.equal(calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: noon }).isPeak, false);
  assert.equal(calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: noon }, { timeZone: 'Europe/Madrid' }).isPeak, true);
});

test('una zona horaria inválida cae en Caracas en lugar de la del servidor', () => {
  assert.equal(resolveBusinessTimeZone('Marte/Olympus'), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(resolveBusinessTimeZone(''), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(resolveBusinessTimeZone(undefined), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(resolveBusinessTimeZone('Europe/Madrid'), 'Europe/Madrid');

  const fare = calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: '2026-08-08T22:00:00-04:00' }, { timeZone: 'Marte/Olympus' });
  assert.equal(fare.timeZone, DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(fare.isNight, true);
});

test('la hora de negocio cubre los bordes de la franja nocturna', () => {
  const hourAt = iso => getBusinessHour(new Date(iso), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(hourAt('2026-08-08T00:00:00-04:00'), 0);
  assert.equal(hourAt('2026-08-08T23:59:00-04:00'), 23);

  assert.equal(calculateFare({ distanceKm: 4, durationMin: 10, requestedAt: '2026-08-08T20:59:00-04:00' }).isNight, false);
  assert.equal(calculateFare({ distanceKm: 4, durationMin: 10, requestedAt: '2026-08-08T21:00:00-04:00' }).isNight, true);
  assert.equal(calculateFare({ distanceKm: 4, durationMin: 10, requestedAt: '2026-08-08T05:59:00-04:00' }).isNight, true);
  assert.equal(calculateFare({ distanceKm: 4, durationMin: 10, requestedAt: '2026-08-08T06:00:00-04:00' }).isNight, false);
});

test('las tarifas base y los recargos no cambiaron', () => {
  // Viaje diurno sin recargos: 1.5 + 5*0.45 + 12*0.04 = 4.23
  const daytime = calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: '2026-08-08T12:00:00-04:00' });
  assert.equal(daytime.fareUSD, 4.23);
  assert.equal(daytime.multiplier, 1);

  const night = calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: '2026-08-08T22:00:00-04:00' });
  assert.equal(night.multiplier, 1.2);
  assert.equal(night.fareUSD, 5.08);

  const peak = calculateFare({ distanceKm: 5, durationMin: 12, requestedAt: '2026-08-08T08:00:00-04:00' });
  assert.equal(peak.multiplier, 1.15);
  assert.equal(peak.fareUSD, 4.86);
});
