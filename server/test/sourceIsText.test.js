import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * `server/domain/pagination.js` llego a contener un byte nulo: se habia usado
 * como separador del cursor precisamente porque no puede aparecer dentro de
 * una fecha ni de un identificador. El efecto colateral fue que git dejo de
 * tratarlo como texto y en el parche aparecia como «Binary files ... differ»,
 * sin diff que revisar.
 *
 * Un byte de control en el fuente tambien rompe herramientas que truncan al
 * primer nulo, y hace invisible el cambio en cualquier revision.
 */

const DIRECTORIOS = ['server/domain', 'server/services', 'server/routes', 'server/test', 'src'];
const EXTENSIONES = ['.js', '.mjs', '.json', '.css', '.md'];
const OMITIR = new Set(['node_modules', 'dist', '.git', 'data']);

function fuentes(directorio) {
  const encontrados = [];
  const pendientes = [path.join(raiz, directorio)];
  while (pendientes.length) {
    const actual = pendientes.pop();
    if (!fs.existsSync(actual)) continue;
    for (const entrada of fs.readdirSync(actual, { withFileTypes: true })) {
      if (OMITIR.has(entrada.name)) continue;
      const completo = path.join(actual, entrada.name);
      if (entrada.isDirectory()) pendientes.push(completo);
      else if (EXTENSIONES.includes(path.extname(entrada.name))) encontrados.push(completo);
    }
  }
  return encontrados;
}

const todos = DIRECTORIOS.flatMap(fuentes);

test('se encuentran los archivos fuente que hay que revisar', () => {
  assert.ok(todos.length > 40, `se esperaban muchos archivos, hay ${todos.length}`);
});

test('ningún archivo fuente contiene bytes nulos', () => {
  for (const archivo of todos) {
    const bytes = fs.readFileSync(archivo);
    const posicion = bytes.indexOf(0);
    assert.equal(
      posicion, -1,
      `${path.relative(raiz, archivo)} tiene un byte nulo en la posición ${posicion}: ` +
      'git lo tratará como binario y el cambio no será revisable'
    );
  }
});

test('ningún archivo fuente contiene otros bytes de control', () => {
  // Se admiten tabulador (9), salto (10) y retorno (13); nada más por debajo
  // de 32, que es lo que suele delatar contenido pegado por error.
  for (const archivo of todos) {
    const bytes = fs.readFileSync(archivo);
    for (let i = 0; i < bytes.length; i += 1) {
      const b = bytes[i];
      if (b < 32 && b !== 9 && b !== 10 && b !== 13) {
        assert.fail(`${path.relative(raiz, archivo)}: byte de control ${b} en la posición ${i}`);
      }
    }
  }
});

test('todos los archivos fuente son UTF-8 válido y sin marca de orden', () => {
  const decodificador = new TextDecoder('utf-8', { fatal: true });
  for (const archivo of todos) {
    const bytes = fs.readFileSync(archivo);
    assert.ok(
      !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
      `${path.relative(raiz, archivo)} empieza con marca de orden de bytes`
    );
    assert.doesNotThrow(
      () => decodificador.decode(bytes),
      `${path.relative(raiz, archivo)} no es UTF-8 válido`
    );
  }
});
