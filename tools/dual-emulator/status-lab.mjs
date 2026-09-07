/**
 * Cómo está el laboratorio ahora mismo.
 *
 * Se mira una vez antes de empezar a probar y se ahorran horas. La pregunta
 * que responde y que nadie se acuerda de hacerse a tiempo es «¿los dos
 * emuladores están corriendo el MISMO código?»: si uno carga de un Metro y el
 * otro de otro, todo parece funcionar y nada de lo que veas es cierto.
 *
 * Uso: node status-lab.mjs
 */

import {
  PAQUETE, PUERTO_DEL_BACKEND, PUERTO_DE_METRO, PUERTO_QUE_BUSCA_LA_APP,
  correr, lados, primeraLineaHttp, sdk, ubicacionDe
} from './laboratorio.mjs';

import net from 'node:net';

function puertoOcupado(puerto) {
  return new Promise(resolve => {
    const sonda = net.connect({ port: puerto, host: '127.0.0.1' });
    sonda.on('connect', () => { sonda.destroy(); resolve(true); });
    sonda.on('error', () => resolve(false));
    setTimeout(() => { sonda.destroy(); resolve(false); }, 1500);
  });
}

/** La huella del APK instalado, para poder comparar los dos lados. */
function huellaDelApk(serial) {
  const { adb } = sdk();
  const ruta = correr(adb, ['-s', serial, 'shell', 'pm', 'path', PAQUETE]).replace(/^package:/, '');
  if (ruta === '') return null;
  const suma = correr(adb, ['-s', serial, 'shell', `md5sum ${ruta}`]).split(/\s+/)[0] ?? null;
  const volcado = correr(adb, ['-s', serial, 'shell', 'dumpsys', 'package', PAQUETE]);
  const version = /versionName=(\S+)/.exec(volcado)?.[1] ?? '?';
  return { suma, version, depurable: /flags=\[[^\]]*DEBUGGABLE/.test(volcado) };
}

const huellas = [];

console.log('SERVIDORES EN EL ORDENADOR');
for (const [nombre, puerto] of [
  ['backend', PUERTO_DEL_BACKEND],
  ['metro', PUERTO_DE_METRO],
  ['puente/metro que ve la app', PUERTO_QUE_BUSCA_LA_APP]
]) {
  console.log(`  ${String(puerto).padEnd(6)} ${nombre.padEnd(28)} ${await puertoOcupado(puerto) ? 'escuchando' : 'NADA'}`);
}

console.log('\nEMULADORES');
for (const lado of Object.values(lados())) {
  console.log(`  ${lado.papel}  (${lado.avd})`);
  if (lado.serial === null) { console.log('    no está en marcha'); continue; }

  console.log(`    serial      ${lado.serial}`);

  const apk = huellaDelApk(lado.serial);
  if (apk === null) {
    console.log('    aplicación  NO instalada');
  } else {
    huellas.push(apk.suma);
    console.log(`    aplicación  ${apk.version}  ${apk.depurable ? 'depurable' : 'NO DEPURABLE (¿es una compilación de publicación?)'}`);
    console.log(`    huella      ${apk.suma}`);
  }

  const salud = primeraLineaHttp(lado.serial, PUERTO_DEL_BACKEND, '/api/health');
  console.log(`    backend     ${salud || 'sin respuesta'}`);

  const metro = primeraLineaHttp(lado.serial, PUERTO_QUE_BUSCA_LA_APP, '/status');
  console.log(`    metro       ${metro || 'sin respuesta'}`);

  const sitio = ubicacionDe(lado.serial);
  console.log(`    gps         ${sitio === null ? 'sin fijar' : `${sitio.lat}, ${sitio.lng}`}`);
}

if (huellas.length === 2) {
  console.log(`\n${huellas[0] === huellas[1]
    ? 'Los dos llevan el MISMO build.'
    : 'CUIDADO: cada emulador lleva un build DISTINTO. Lo que compares no valdrá.'}`);
}
