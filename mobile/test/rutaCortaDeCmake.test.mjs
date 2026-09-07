import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * DEPENDENCY-UNBLOCK-1 — el complemento que acorta la ruta de CMake.
 *
 * Existe porque ninja falla con «Filename longer than 260 characters» al
 * compilar el codegen de `react-native-gesture-handler` cuando el proyecto
 * cuelga de una carpeta de nombre largo. No es un problema del proyecto sino
 * de dónde está guardado, así que el complemento no puede llevar la ruta
 * escrita: sin la variable no toca nada.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const require = createRequire(import.meta.url);
const complemento = require(path.join(raizMovil, 'plugins/rutaCortaDeCmake.js'));

/** Un `build.gradle` mínimo, con el bloque que el complemento busca. */
const GRADLE = 'apply plugin: "com.android.application"\n\nandroid {\n    namespace "com.plus58express.app"\n}\n';

async function aplicar(variable, partida = GRADLE) {
  const previo = process.env.EXPO_ANDROID_CXX_DIR;
  if (variable === undefined) delete process.env.EXPO_ANDROID_CXX_DIR;
  else process.env.EXPO_ANDROID_CXX_DIR = variable;

  // El complemento devuelve la config con un `mod` pendiente; se ejecuta a
  // mano para ver qué escribiría, sin arrancar todo el prebuild.
  const resultado = complemento({ name: 'prueba', slug: 'prueba', mods: {} });

  let gradle = null;
  const mod = resultado?.mods?.android?.appBuildGradle;
  if (mod) {
    const conf = { modResults: { contents: partida, language: 'groovy' }, modRequest: {} };
    // El mod es asíncrono por contrato. `await` sobre un objeto normal
    // también es seguro, así que vale para las dos ramas.
    gradle = (await mod(conf)).modResults.contents;
  }

  if (previo === undefined) delete process.env.EXPO_ANDROID_CXX_DIR;
  else process.env.EXPO_ANDROID_CXX_DIR = previo;
  return { resultado, gradle };
}

test('sin la variable no toca nada', async () => {
  // En Linux, en macOS y en cualquier equipo con el proyecto en una ruta
  // corta el problema no existe, y un complemento que actuara igualmente
  // mandaría los objetos a una carpeta que quizá no es de nadie.
  const { resultado } = await aplicar(undefined);
  assert.equal(resultado.mods?.android?.appBuildGradle, undefined);
});

test('con la variable, la ruta llega a build.gradle', async () => {
  const { gradle } = await aplicar('C:/corta');
  assert.match(gradle, /externalNativeBuild/);
  assert.match(gradle, /buildStagingDirectory = file\("C:\/corta"\)/);
});

test('las barras invertidas de Windows no rompen Groovy', async () => {
  // Dentro de una cadena de Groovy, `\c` se leería como un escape.
  const conBarras = ['C:', 'corta', 'cxx'].join('\\');
  const { gradle } = await aplicar(conBarras);
  assert.match(gradle, /file\("C:\/corta\/cxx"\)/);
  assert.equal(gradle.includes('file("C:\\'), false, 'quedó una barra invertida');
});

test('no se duplica si ya está puesto', async () => {
  // El prebuild puede pasar dos veces sobre el mismo fichero.
  const unaVez = (await aplicar('C:/corta')).gradle;
  const dosVeces = (await aplicar('C:/corta', unaVez)).gradle;

  assert.equal(dosVeces, unaVez);
  assert.equal(dosVeces.match(/buildStagingDirectory/g).length, 1);
});

test('el complemento está declarado y no lleva ninguna ruta escrita', () => {
  const app = JSON.parse(fs.readFileSync(path.join(raizMovil, 'app.json'), 'utf8'));
  assert.ok(app.expo.plugins.includes('./plugins/rutaCortaDeCmake'));

  // Una ruta de una máquina concreta, guardada en el repositorio, sería
  // basura para cualquier otra persona.
  const codigo = fs.readFileSync(path.join(raizMovil, 'plugins/rutaCortaDeCmake.js'), 'utf8');
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.equal(/[A-Z]:[\\/]/.test(sinComentarios), false, 'hay una ruta absoluta escrita en el complemento');
});
