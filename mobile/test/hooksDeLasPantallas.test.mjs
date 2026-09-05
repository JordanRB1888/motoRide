import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';

/**
 * Ningún hook por debajo de una salida condicional — DISPATCH-DRIVER-SURFACES.
 *
 * QUÉ SE PROTEGE
 *
 * React cuenta los hooks de cada render y los compara con el anterior. Una
 * pantalla que sale antes por un `return` —sesión que todavía arranca, rol que
 * no toca, redirección— ejecuta menos hooks en ese render que en el siguiente,
 * y si hay un hook por debajo de esa salida el recuento cambia. React entonces
 * no avisa con un aviso: tumba la pantalla entera con «Rendered more hooks
 * than during the previous render».
 *
 * Y se rompe justo donde peor se ve. En el arranque en frío con sesión
 * guardada la pantalla del conductor pasa por ARRANCANDO —sale por la primera
 * puerta— y al render siguiente ya está AUTENTICADO. Ese es el camino de todos
 * los días: abrir la aplicación. Costó dar con ello porque en el camino de
 * pruebas —entrar con el formulario— la pantalla se monta ya autenticada y no
 * hay render previo con el que discrepar, así que todo parecía funcionar.
 *
 * El aviso de React está en desarrollo. En una compilación de publicación el
 * síntoma es peor: la pantalla se queda a medias sin decir por qué.
 *
 * CÓMO SE COMPRUEBA
 *
 * Leyendo el fichero. No es una comprobación de tipos ni de estilo: es de
 * orden, y el orden se ve en el texto. Se acota el cuerpo del componente de la
 * pantalla —los auxiliares que vienen debajo tienen sus propios hooks y su
 * propio recuento, y no cuentan aquí—, se busca su primera salida condicional,
 * y se exige que no haya ninguna llamada a hook después.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** Las pantallas con salidas tempranas por estado de sesión o por rol. */
const PANTALLAS = ['conductor.tsx', 'pedir.tsx', 'historial.tsx', 'perfil.tsx', 'chat.tsx'];

/** `useAlgo(` al principio de una expresión, no `.useAlgo(` de un objeto. */
const LLAMADA_A_HOOK = /(^|[^.\w])(use[A-Z]\w*)\s*\(/g;

/** Un `return` que está dentro de un `if`, no el `return` final del cuerpo. */
const SALIDA_CONDICIONAL = /\n {2}if \([^\n]*\)[^\n]*\n?(?: {4}return|.*return)/;

/**
 * El cuerpo del componente de la pantalla, y sólo ese.
 *
 * Empieza en `export default function` y acaba en la primera llave que cierra
 * en la columna cero. Lo que viene detrás son componentes auxiliares del mismo
 * fichero: tienen sus propios hooks, su propio recuento, y mezclarlos aquí
 * daría una falsa alarma.
 */
function cuerpoDeLaPantalla(fuente) {
  const inicio = fuente.indexOf('export default function');
  if (inicio === -1) return null;
  const cierre = fuente.indexOf('\n}', inicio);
  return cierre === -1 ? fuente.slice(inicio) : fuente.slice(inicio, cierre);
}

for (const nombre of PANTALLAS) {
  const ruta = path.join(aqui, '..', 'app', nombre);
  if (!fs.existsSync(ruta)) continue;

  test(`${nombre} no llama a ningún hook por debajo de una salida condicional`, () => {
    const fuente = cuerpoDeLaPantalla(despojarComentarios(fs.readFileSync(ruta, 'utf8')));
    assert.notEqual(fuente, null, `${nombre}: no se encontró el componente de la pantalla`);

    const salida = fuente.search(SALIDA_CONDICIONAL);
    if (salida === -1) return; // Sin salidas tempranas no hay nada que ordenar.

    const despues = fuente.slice(salida);
    const tardios = [...despues.matchAll(LLAMADA_A_HOOK)].map(m => m[2]);

    assert.deepEqual(
      tardios,
      [],
      `${nombre}: ${tardios.join(', ')} se llama(n) después de una salida ` +
        'condicional. Súbelos junto al resto de los hooks, antes del primer ' +
        '`return`, o React tumbará la pantalla en el arranque en frío.'
    );
  });
}
