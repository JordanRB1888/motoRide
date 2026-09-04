/**
 * Levanta el laboratorio: dos emuladores, el puente al Metro y los reenvíos.
 *
 * Lo que hace, por orden:
 *   1. arranca el emulador que falte y espera a que termine de arrancar;
 *   2. levanta el puente del 8081 al Metro de verdad, si no está ya;
 *   3. deja puestos los reenvíos de puertos en los dos;
 *   4. concede los permisos de ubicación, que si no la aplicación arranca ciega;
 *   5. separa el GPS de los dos lados;
 *   6. abre la aplicación en ambos.
 *
 * NO INSTALA NADA. La aplicación se instala aparte, a propósito: cuál es el
 * APK bueno es una decisión que cambia según lo que se esté probando, y un
 * guión que la tome por su cuenta acaba instalando el equivocado. `status-lab`
 * avisa si falta o si los dos emuladores no tienen el mismo.
 *
 * Uso: node start-lab.mjs
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AVD_PASAJERA, AVD_CONDUCTOR, PAQUETE, PUERTO_DE_METRO, PUERTO_QUE_BUSCA_LA_APP,
  correr, dormir, esperarArranque, lados, moverGps, ponerReenvios, sdk, serialDe
} from './laboratorio.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** Dónde empieza cada uno. Lo bastante lejos para que se note quién es quién. */
const PUNTO_DE_LA_PASAJERA = { lat: 10.6430, lng: -71.6128 }; // Vereda del Lago
const PUNTO_DEL_CONDUCTOR = { lat: 10.6710, lng: -71.5920 };  // al norte, a unos km

const PERMISOS = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.POST_NOTIFICATIONS'
];

function puertoOcupado(puerto) {
  return new Promise(resolve => {
    const sonda = net.connect({ port: puerto, host: '127.0.0.1' });
    sonda.on('connect', () => { sonda.destroy(); resolve(true); });
    sonda.on('error', () => resolve(false));
    setTimeout(() => { sonda.destroy(); resolve(false); }, 1500);
  });
}

function arrancarEmulador(avd) {
  const { emulador } = sdk();
  console.log(`  arrancando ${avd}…`);
  const hijo = spawn(emulador, ['-avd', avd], { detached: true, stdio: 'ignore' });
  hijo.unref();
}

async function main() {
  const { adb } = sdk();

  console.log('EMULADORES');
  for (const avd of [AVD_PASAJERA, AVD_CONDUCTOR]) {
    if (serialDe(avd) !== null) { console.log(`  ${avd}: ya estaba en marcha`); continue; }
    arrancarEmulador(avd);
  }

  // Se espera a los dos juntos: arrancarlos en serie duplica el rato muerto.
  for (const avd of [AVD_PASAJERA, AVD_CONDUCTOR]) {
    let serial = null;
    const limite = Date.now() + 300000;
    while (serial === null && Date.now() < limite) { serial = serialDe(avd); if (serial === null) dormir(4000); }
    if (serial === null) { console.log(`  ${avd}: NO llegó a aparecer`); continue; }
    console.log(`  ${avd}: ${serial}${esperarArranque(serial) ? ' (arrancado)' : ' (sigue arrancando)'}`);
  }

  console.log('\nPUENTE AL METRO');
  if (await puertoOcupado(PUERTO_QUE_BUSCA_LA_APP)) {
    console.log(`  el ${PUERTO_QUE_BUSCA_LA_APP} ya está ocupado: lo dejo como está.`);
    console.log('  (si es el Metro de otro worktree, la aplicación cargará SU código)');
  } else if (!await puertoOcupado(PUERTO_DE_METRO)) {
    console.log(`  no hay ningún Metro escuchando en el ${PUERTO_DE_METRO}: arráncalo antes.`);
  } else {
    const puente = spawn(process.execPath, [path.join(aqui, 'puente-metro.mjs')], {
      detached: true, stdio: 'ignore'
    });
    puente.unref();
    dormir(1500);
    console.log(`  ${PUERTO_QUE_BUSCA_LA_APP} -> ${PUERTO_DE_METRO} (pid ${puente.pid})`);
  }

  console.log('\nCADA LADO');
  const sitios = { pasajera: PUNTO_DE_LA_PASAJERA, conductor: PUNTO_DEL_CONDUCTOR };
  for (const [clave, lado] of Object.entries(lados())) {
    if (lado.serial === null) { console.log(`  ${lado.papel}: sin emulador`); continue; }
    ponerReenvios(lado.serial);
    for (const permiso of PERMISOS) {
      correr(adb, ['-s', lado.serial, 'shell', 'pm', 'grant', PAQUETE, permiso]);
    }
    correr(adb, ['-s', lado.serial, 'shell', 'am', 'start', '-n', `${PAQUETE}/.MainActivity`]);
    moverGps(lado.serial, sitios[clave].lat, sitios[clave].lng);
    console.log(`  ${lado.papel} (${lado.serial}): permisos, reenvíos, aplicación abierta y GPS puesto`);
  }

  console.log('\nListo. `node status-lab.mjs` para ver cómo ha quedado.');
}

await main();
