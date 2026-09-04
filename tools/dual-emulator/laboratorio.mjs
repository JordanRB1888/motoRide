/**
 * Lo que comparten los guiones del laboratorio de dos emuladores.
 *
 * QUÉ ES ESTE LABORATORIO
 *
 * Dos emuladores a la vez para poder mirar los dos lados de una carrera: quien
 * la pide y quien la recibe. Con uno solo hay que ir cerrando sesión y
 * volviendo a entrar, y así no se ve nunca lo único que importa de verdad —qué
 * pasa en la pantalla del otro en el mismo segundo.
 *
 * NADA DE SERIALES A DEDO
 *
 * `emulator-5554` es el primero que arranca y `emulator-5556` el segundo, pero
 * eso depende del orden y de qué haya abierto ya. Aquí se pregunta a cada
 * emulador por el nombre de su AVD y se decide con eso, que es lo único que no
 * cambia.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** El AVD de cada lado. Se pueden cambiar sin tocar los guiones. */
export const AVD_PASAJERA = process.env.PLUS58_AVD_PASAJERA ?? 'Pixel_10_Pro';
export const AVD_CONDUCTOR = process.env.PLUS58_AVD_CONDUCTOR ?? 'Plus58_Driver';

/** Dónde vive el servidor de desarrollo de verdad, y dónde lo busca la app. */
export const PUERTO_DE_METRO = Number(process.env.PLUS58_PUERTO_METRO ?? 8085);
export const PUERTO_QUE_BUSCA_LA_APP = 8081;
export const PUERTO_DEL_BACKEND = Number(process.env.PLUS58_PUERTO_BACKEND ?? 4000);

export const PAQUETE = 'com.plus58express.app';

/** Desde el emulador, la máquina de al lado es siempre esta dirección. */
export const HOST_DESDE_EL_EMULADOR = '10.0.2.2';

function primeraQueExista(candidatas) {
  return candidatas.find(c => c !== null && fs.existsSync(c)) ?? null;
}

/** El SDK, buscado donde suele estar antes de rendirse. */
export function sdk() {
  const raiz = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  if (!fs.existsSync(raiz)) {
    throw new Error(`no encuentro el SDK de Android en ${raiz}. Define ANDROID_HOME.`);
  }
  const exe = process.platform === 'win32' ? '.exe' : '';
  const adb = primeraQueExista([path.join(raiz, 'platform-tools', `adb${exe}`)]);
  const emulador = primeraQueExista([path.join(raiz, 'emulator', `emulator${exe}`)]);
  if (adb === null) throw new Error('no encuentro adb en platform-tools');
  if (emulador === null) throw new Error('no encuentro el ejecutable del emulador');
  return { raiz, adb, emulador };
}

/** Ejecuta y devuelve la salida limpia. Nunca lanza por un código de salida. */
export function correr(programa, argumentos, opciones = {}) {
  try {
    return execFileSync(programa, argumentos, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...opciones
    }).replace(/\r/g, '').trim();
  } catch (error) {
    return typeof error.stdout === 'string' ? error.stdout.replace(/\r/g, '').trim() : '';
  }
}

/** Los emuladores conectados, cada uno con el nombre de su AVD. */
export function emuladoresConectados() {
  const { adb } = sdk();
  const lineas = correr(adb, ['devices']).split('\n').slice(1);
  const emuladores = [];
  for (const linea of lineas) {
    const [serial, estado] = linea.trim().split(/\s+/);
    // Sólo emuladores: un teléfono enchufado por USB no es asunto nuestro.
    if (!serial || !serial.startsWith('emulator-') || estado !== 'device') continue;
    const avd = correr(adb, ['-s', serial, 'emu', 'avd', 'name'])
      .split('\n')
      .find(l => l && l !== 'OK') ?? '(desconocido)';
    emuladores.push({ serial, avd });
  }
  return emuladores;
}

/** El serial de un AVD, o `null` si ese emulador no está en marcha. */
export function serialDe(avd) {
  return emuladoresConectados().find(e => e.avd === avd)?.serial ?? null;
}

/**
 * Los dos lados del laboratorio.
 *
 * Devuelve siempre las dos entradas, con `serial: null` cuando ese emulador no
 * está arrancado. Quien llama decide si eso es un problema: para `status-lab`
 * no lo es, y para mover el GPS sí.
 */
export function lados() {
  return {
    pasajera: { papel: 'PASAJERA', avd: AVD_PASAJERA, serial: serialDe(AVD_PASAJERA) },
    conductor: { papel: 'CONDUCTOR', avd: AVD_CONDUCTOR, serial: serialDe(AVD_CONDUCTOR) }
  };
}

/** Espera a que el emulador termine de arrancar. */
export function esperarArranque(serial, segundos = 300) {
  const { adb } = sdk();
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    if (correr(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']) === '1') return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }
  return false;
}

/** Una espera sin dependencias ni promesas, que aquí sobran. */
export function dormir(milisegundos) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milisegundos);
}

/**
 * Una petición HTTP desde DENTRO del emulador.
 *
 * La imagen del sistema no trae `curl` ni `wget`, así que se habla el protocolo
 * a mano por `nc`, que sí está. Devuelve la primera línea de la respuesta, que
 * es donde viene el código.
 *
 * EL `sleep` NO SOBRA. Sin él, `nc` cierra la conexión en cuanto se le acaba la
 * entrada y `head` se queda sin nada que leer si la respuesta tarda un pelo
 * más: contra el Metro directo llega a tiempo y a través del puente no, así
 * que el puente parecía roto cuando estaba perfectamente. Tres segundos de
 * margen y se acabó la falsa alarma.
 */
export function primeraLineaHttp(serial, puerto, ruta) {
  const { adb } = sdk();
  const cabecera = `GET ${ruta} HTTP/1.1\\r\\nHost: ${HOST_DESDE_EL_EMULADOR}:${puerto}\\r\\nConnection: close\\r\\n\\r\\n`;
  const peticion = `(printf '${cabecera}'; sleep 3) | nc ${HOST_DESDE_EL_EMULADOR} ${puerto} | head -1`;
  return correr(adb, ['-s', serial, 'shell', peticion]);
}

/** La última posición que el sistema tiene por buena, o `null`. */
export function ubicacionDe(serial) {
  const { adb } = sdk();
  const volcado = correr(adb, ['-s', serial, 'shell', 'dumpsys location']);
  const m = /last location=Location\[gps ([-0-9.]+),([-0-9.]+)/.exec(volcado);
  return m === null ? null : { lat: Number(m[1]), lng: Number(m[2]) };
}

/** Mueve el GPS de UN emulador. El otro no se entera, que es la gracia. */
export function moverGps(serial, lat, lng) {
  const { adb } = sdk();
  // El emulador espera longitud primero. Puesto al revés, la moto aparece en
  // mitad del océano y cuesta un rato entender por qué.
  correr(adb, ['-s', serial, 'emu', 'geo', 'fix', String(lng), String(lat)]);
}

export function ponerReenvios(serial) {
  const { adb } = sdk();
  for (const puerto of [PUERTO_DE_METRO, PUERTO_DEL_BACKEND]) {
    correr(adb, ['-s', serial, 'reverse', `tcp:${puerto}`, `tcp:${puerto}`]);
  }
}
