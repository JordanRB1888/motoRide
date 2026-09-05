/**
 * Mueve el GPS del emulador de la pasajera. Sólo el suyo.
 *
 *   node set-passenger-location.mjs 10.6430 -71.6128
 *   node set-passenger-location.mjs                    (vuelve al punto de partida)
 *
 * Primero la latitud y luego la longitud, como se dicen las coordenadas en voz
 * alta. El emulador las quiere al revés y de eso se encarga `moverGps`.
 */

import { moverGps, ubicacionDe, dormir, lados } from './laboratorio.mjs';

const PUNTO_DE_PARTIDA = { lat: 10.6430, lng: -71.6128 }; // Vereda del Lago

const lat = process.argv[2] === undefined ? PUNTO_DE_PARTIDA.lat : Number(process.argv[2]);
const lng = process.argv[3] === undefined ? PUNTO_DE_PARTIDA.lng : Number(process.argv[3]);

if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  console.error('coordenadas no válidas. Uso: node set-passenger-location.mjs <lat> <lng>');
  process.exit(1);
}

const { pasajera } = lados();
if (pasajera.serial === null) {
  console.error(`el emulador de la pasajera (${pasajera.avd}) no está en marcha`);
  process.exit(1);
}

moverGps(pasajera.serial, lat, lng);
dormir(2500);

const ahora = ubicacionDe(pasajera.serial);
console.log(`PASAJERA (${pasajera.serial}) -> ${lat}, ${lng}`);
console.log(`  el sistema dice: ${ahora === null ? 'todavía nada' : `${ahora.lat}, ${ahora.lng}`}`);

// El emulador sólo entrega la posición cuando algo está escuchando el GPS. Si
// la aplicación está cerrada, `geo fix` se acepta y no se ve reflejado: no es
// un fallo del guión, es que no hay nadie preguntando.
if (ahora === null) {
  console.log('  (abre la aplicación: sin nadie escuchando el GPS, la posición no se publica)');
}
