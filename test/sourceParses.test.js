import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Una edicion automatizada dejo un `;\n}` suelto en apiService.js. La suite
 * entera siguio en verde --las pruebas del cliente HTTP miran la fuente con
 * expresiones regulares, y una regex no se entera de que el archivo ya no
 * compila--; solo lo delato el build de produccion, al final de todo.
 *
 * Aqui se comprueba lo minimo que ninguna prueba por inspeccion puede dar por
 * supuesto: que cada fuente del frontend es JavaScript valido. Se usa el mismo
 * esbuild que usa Vite, asi que `import.meta.env` no molesta: se analiza la
 * sintaxis, no se ejecuta nada.
 */

/** Todas las fuentes bajo `src/`, sin entrar en dependencias. */
function fuentes(dir = path.join(raiz, 'src')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entrada => {
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return fuentes(completa);
    return entrada.isFile() && entrada.name.endsWith('.js') ? [completa] : [];
  });
}

test('todas las fuentes del frontend son JavaScript valido', () => {
  const archivos = fuentes();
  assert.ok(archivos.length > 30, `solo se encontraron ${archivos.length} fuentes`);

  const rotos = [];
  for (const archivo of archivos) {
    // Un archivo vacio compila sin quejarse: hay que mirarlo aparte. Una
    // restauracion mal hecha durante este mismo arreglo dejo apiService.js a
    // cero bytes y el barrido siguio en verde.
    const contenido = fs.readFileSync(archivo, 'utf8');
    if (contenido.trim().length === 0) {
      rotos.push(`${path.relative(raiz, archivo)}: archivo vacio`);
      continue;
    }
    try {
      esbuild.transformSync(contenido, {
        loader: 'js', format: 'esm', sourcefile: archivo
      });
    } catch (error) {
      rotos.push(`${path.relative(raiz, archivo)}: ${error.errors?.[0]?.text || error.message}`);
    }
  }

  assert.deepEqual(rotos, [], `fuentes que no compilan:\n  ${rotos.join('\n  ')}`);
});

test('el punto de entrada del cliente HTTP compila y expone lo suyo', () => {
  // Comprobacion dirigida al archivo que se rompio, por si el barrido de
  // arriba cambiara de alcance algun dia.
  const fuente = fs.readFileSync(path.join(raiz, 'src/services/apiService.js'), 'utf8');
  esbuild.transformSync(fuente, { loader: 'js', format: 'esm' });
  assert.match(fuente, /class ApiService/);
});
