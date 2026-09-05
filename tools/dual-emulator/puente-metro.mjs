/**
 * El puente que lleva el 8081 al Metro de verdad.
 *
 * POR QUÉ EXISTE
 *
 * La compilación de depuración pide su JavaScript a `10.0.2.2:8081` y no hay
 * forma cómoda de convencerla de otra cosa: el menú de desarrollo permite
 * cambiar la dirección a mano, pero el ajuste no sobrevive a cerrar la
 * aplicación, así que en un laboratorio de dos emuladores habría que repetirlo
 * en cada arranque, en los dos, y a mano.
 *
 * Este puente escucha en el 8081 del ordenador y reenvía todo al Metro que se
 * le diga. Las aplicaciones no se enteran: piden donde siempre y les responde
 * quien queremos. Cero configuración en el dispositivo.
 *
 * ES UN REENVÍO CIEGO, Y ESO ES LO QUE HACE FALTA. No lee ni interpreta nada:
 * copia bytes en las dos direcciones. Por eso funcionan igual el bundle, el
 * canal de registro, la recarga en caliente y el inspector, que son HTTP y
 * WebSocket sobre la misma conexión.
 *
 * NO OCUPA EL PUERTO MÁS QUE MIENTRAS VIVE. Si otro worktree necesita el 8081
 * para su propio Metro, se para el puente y el puerto queda libre en el acto.
 * Y si el 8081 ya está ocupado cuando arranca, no pelea: lo dice y se retira,
 * porque quedarse a medias sería peor que no estar.
 *
 * Uso:
 *   node puente-metro.mjs [--puerto 8081] [--destino 8085] [--host 127.0.0.1]
 */

import net from 'node:net';

function argumento(nombre, pordefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 || i === process.argv.length - 1 ? pordefecto : process.argv[i + 1];
}

const PUERTO = Number(argumento('puerto', 8081));
const DESTINO = Number(argumento('destino', 8085));
const HOST = argumento('host', '127.0.0.1');

const servidor = net.createServer(entrante => {
  const saliente = net.connect(DESTINO, HOST);

  // Un fallo de una conexión suelta no puede tumbar el puente: se cierra ese
  // par y se sigue atendiendo a los demás.
  const cerrarPar = () => { entrante.destroy(); saliente.destroy(); };
  entrante.on('error', cerrarPar);
  saliente.on('error', cerrarPar);

  entrante.pipe(saliente);
  saliente.pipe(entrante);
});

servidor.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[puente] el ${PUERTO} ya está ocupado. No lo toco: si es el Metro de otro`);
    console.error('[puente] worktree, déjalo estar; si es un puente viejo, páralo antes.');
  } else {
    console.error(`[puente] no pude escuchar en el ${PUERTO}: ${error.message}`);
  }
  process.exit(1);
});

servidor.listen(PUERTO, () => {
  console.log(`[puente] ${PUERTO} -> ${HOST}:${DESTINO}`);
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => { servidor.close(); process.exit(0); });
}
