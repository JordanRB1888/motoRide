import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EL PING-PONG DE LA POSTULACIÓN — dos pantallas que se reenvían la una a la otra.
 *
 * QUÉ PASÓ
 *
 * En un dispositivo real, la pantalla de Documentos se deslizaba de lado y
 * dejaba ver un fogonazo gris, varias veces seguidas. No era un gesto ni un
 * scroll: eran transiciones de verdad del Stack, una detrás de otra. El rastro
 * con sello de tiempo lo enseñó así:
 *
 *   documentos.recargar:respuesta {"ok":true,"solicitud":"null"}
 *   documentos.NAVEGA {"a":"/postulacion","porque":"solicitud===null"}
 *   documentos.DESMONTA
 *   RUTA {"pathname":"/postulacion"}
 *
 * La causa es que las dos pantallas decidían con fuentes distintas:
 *
 *   · `documentos` pregunta al BACKEND. Si responde que no hay expediente, se
 *     va a `/postulacion`.
 *   · `/postulacion` decide con el CONTEXTO, sin preguntar a nadie. Si el
 *     contexto todavía guardaba el expediente de antes, devuelve a `documentos`.
 *
 * Y vuelta a empezar. Cada ciclo es un deslizamiento con su fogonazo.
 *
 * LO QUE PROTEGE ESTA PRUEBA
 *
 * Que cuando el servidor diga que no hay expediente, la copia que guarda el
 * teléfono se tire ANTES de navegar. Sin esa línea el ciclo vuelve, y vuelve
 * de una forma que sólo se ve en un dispositivo y cuesta días encontrar.
 *
 * Se lee el fuente a propósito, como `resumeDePostulacion.test.mjs`: lo que hay
 * que fijar aquí es el ORDEN de dos llamadas dentro de una pantalla, y montar
 * expo-router entero para comprobarlo costaría más de lo que protege.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativo => fs.readFileSync(path.join(raizMovil, relativo), 'utf8');

test('documentos tira la copia del expediente antes de irse a /postulacion', () => {
  const fuente = leer('app/postulacion/documentos.tsx');

  const bloque = fuente.slice(fuente.indexOf('lectura.solicitud === null'));
  assert.notEqual(bloque, '', 'ya no existe la rama que trata «el servidor dice que no hay expediente»');

  const limpia = bloque.indexOf('fijarSolicitud(null)');
  const navega = bloque.indexOf("router.replace('/postulacion')");

  assert.ok(limpia !== -1, 'la rama navega sin tirar la copia del contexto: el ping-pong vuelve');
  assert.ok(navega !== -1, 'la rama ya no navega a /postulacion');
  assert.ok(
    limpia < navega,
    'hay que limpiar el contexto ANTES de navegar: si no, /postulacion todavía lee el expediente viejo y devuelve aquí'
  );
});

test('las dos pantallas no pueden decidir con fuentes distintas sin guarda', () => {
  const indice = leer('app/postulacion/index.tsx');

  /* `/postulacion` sigue pudiendo reenviar desde el contexto —es lo que hace
     que volver atrás desde un paso posterior no repita el formulario—, pero
     eso sólo es seguro mientras alguien se encargue de que ese contexto no
     sobreviva a un «no existe» del servidor. Esa parte la fija la prueba de
     arriba; ésta deja constancia de que el reenvío existe y de por qué. */
  assert.match(
    indice,
    /if \(solicitud !== null\)/,
    'si el reenvío desde el contexto desaparece, revisa la prueba de arriba: ya no haría falta'
  );
});
