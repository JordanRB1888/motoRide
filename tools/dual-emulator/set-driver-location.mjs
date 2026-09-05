/**
 * Mueve el GPS del emulador del conductor. Sólo el suyo.
 *
 *   node set-driver-location.mjs 10.6710 -71.5920
 *   node set-driver-location.mjs                    (vuelve al punto de partida)
 *
 * Es el guión con el que se acerca o se aleja al conductor de la pasajera sin
 * tocar dónde está ella, que es justo lo que hace falta para ver si el despacho
 * elige a quien tiene que elegir.
 */

import { moverGps, ubicacionDe, dormir, lados } from './laboratorio.mjs';

const PUNTO_DE_PARTIDA = { lat: 10.6710, lng: -71.5920 }; // al norte de la ciudad

const lat = process.argv[2] === undefined ? PUNTO_DE_PARTIDA.lat : Number(process.argv[2]);
const lng = process.argv[3] === undefined ? PUNTO_DE_PARTIDA.lng : Number(process.argv[3]);

if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  console.error('coordenadas no válidas. Uso: node set-driver-location.mjs <lat> <lng>');
  process.exit(1);
}

const { conductor } = lados();
if (conductor.serial === null) {
  console.error(`el emulador del conductor (${conductor.avd}) no está en marcha`);
  process.exit(1);
}

moverGps(conductor.serial, lat, lng);
dormir(2500);

const ahora = ubicacionDe(conductor.serial);
console.log(`CONDUCTOR (${conductor.serial}) -> ${lat}, ${lng}`);
console.log(`  el sistema dice: ${ahora === null ? 'todavía nada' : `${ahora.lat}, ${ahora.lng}`}`);

if (ahora === null) {
  console.log('  (abre la aplicación: sin nadie escuchando el GPS, la posición no se publica)');
}
