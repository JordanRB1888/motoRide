/**
 * Recoge el laboratorio.
 *
 * Por omisión apaga sólo el puente, que es lo que ocupa un puerto que otro
 * worktree puede necesitar. Los emuladores tardan varios minutos en arrancar y
 * cerrarlos por costumbre sale caro, así que hay que pedirlo:
 *
 *   node stop-lab.mjs                 sólo el puente
 *   node stop-lab.mjs --emuladores    también los dos emuladores
 *
 * No toca ni el Metro ni el backend: no los levantó este guión y apagar lo que
 * uno no ha encendido es la forma más rápida de interrumpir a otro.
 */

import { execFileSync } from 'node:child_process';

import { PUERTO_QUE_BUSCA_LA_APP, correr, lados, sdk } from './laboratorio.mjs';

const tambienLosEmuladores = process.argv.includes('--emuladores');

/** Quién escucha en un puerto, según el sistema. */
function pidsEscuchando(puerto) {
  const salida = process.platform === 'win32'
    ? execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
    : execFileSync('lsof', ['-ti', `tcp:${puerto}`], { encoding: 'utf8' });

  if (process.platform !== 'win32') {
    return [...new Set(salida.split('\n').map(l => l.trim()).filter(Boolean))];
  }
  return [...new Set(
    salida.split('\n')
      .filter(l => new RegExp(`:${puerto}\\s`).test(l) && /LISTENING/.test(l))
      .map(l => l.trim().split(/\s+/).pop())
      .filter(pid => pid && pid !== '0')
  )];
}

console.log('PUENTE');
const pids = pidsEscuchando(PUERTO_QUE_BUSCA_LA_APP);
if (pids.length === 0) {
  console.log(`  nada escuchando en el ${PUERTO_QUE_BUSCA_LA_APP}`);
} else {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
      console.log(`  parado el proceso ${pid}`);
    } catch (error) {
      console.log(`  no pude parar el ${pid}: ${error.message}`);
    }
  }
  console.log(`  ojo: si el ${PUERTO_QUE_BUSCA_LA_APP} lo tenía el Metro de otro worktree,`);
  console.log('  acabas de pararlo. Vuelve a arrancarlo desde su proyecto.');
}

if (!tambienLosEmuladores) {
  console.log('\nLos emuladores siguen en marcha. `--emuladores` para apagarlos también.');
} else {
  const { adb } = sdk();
  console.log('\nEMULADORES');
  for (const lado of Object.values(lados())) {
    if (lado.serial === null) { console.log(`  ${lado.papel}: ya estaba apagado`); continue; }
    correr(adb, ['-s', lado.serial, 'emu', 'kill']);
    console.log(`  ${lado.papel} (${lado.serial}): apagado`);
  }
}
