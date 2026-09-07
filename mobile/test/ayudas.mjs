/**
 * Ayudas compartidas por las pruebas.
 *
 * POR QUÉ EXISTE `sinComentarios`
 *
 * Cada vez que una prueba busca una palabra PROHIBIDA —«no importes
 * SecureStore», «no menciones la cartera»— acaba encontrándola en el comentario
 * que explica por qué está prohibida. Explicar por qué algo no está obliga a
 * nombrarlo.
 *
 * Ha pasado cuatro veces en este proyecto, y las cuatro parecía un fallo del
 * código cuando era un fallo de la prueba. Vive aquí para que la quinta no
 * exista.
 *
 * Regla: si la prueba comprueba que algo NO aparece, se le pasa el código sin
 * comentarios. Si comprueba que algo SÍ aparece, se le pasa entero — los
 * comentarios también son parte de lo que se quiere conservar.
 */

import fs from 'node:fs';
import path from 'node:path';

/** El código sin sus comentarios de bloque ni de línea. */
export function despojarComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Todos los ficheros del laboratorio visual, con rutas normalizadas.
 *
 * Se descubren solos. Antes se listaban a mano y cada pantalla nueva quedaba
 * sin vigilar hasta que alguien se acordaba de añadirla a la lista.
 */
export function ficherosDelLaboratorio(raizMovil) {
  const carpeta = path.join(raizMovil, 'preview');
  const dentro = fs.readdirSync(carpeta, { recursive: true })
    .map(nombre => `preview/${String(nombre).replace(/\\/g, '/')}`)
    .filter(relativa => /\.(ts|tsx)$/.test(relativa));
  return [...dentro, 'app/preview.tsx'];
}
