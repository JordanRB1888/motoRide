import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EN ANDROID NO SE AJUSTA LA VENTANA DESDE JAVASCRIPT
 *
 * EL FALLO QUE ESTO CIERRA
 *
 * `KeyboardAvoidingView` con `behavior="height"` encoge la vista por su cuenta,
 * y Android ya la encoge solo: Expo deja `adjustResize` puesto. Los dos ajustes
 * se pisan y el resultado oscila —la pantalla parpadea, se mueve de lado y los
 * botones se escapan bajo el dedo—. Con `edgeToEdgeEnabled`, que este proyecto
 * tiene activado, es peor todavía: los márgenes del sistema cambian sobre la
 * marcha y realimentan el bucle.
 *
 * Lo encontró el dueño intentando subir sus documentos de conductor: la
 * pantalla temblaba tanto que no se podía pulsar nada. Estaban las cuatro
 * pantallas de la postulación igual, porque todas comparten `Formulario`.
 *
 * `chat.tsx` y la maqueta del OTP ya lo hacían bien; los dos contenedores
 * compartidos se habían quedado atrás.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Todos los `.tsx` de la aplicación, sin el laboratorio ni node_modules. */
function ficherosDeLaApp() {
  const encontrados = [];
  const mirar = directorio => {
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
      const ruta = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) { mirar(ruta); continue; }
      if (entrada.name.endsWith('.tsx')) encontrados.push(ruta);
    }
  };
  for (const carpeta of ['app', 'components', 'ui', 'conductor', 'mapa', 'navegacion']) {
    const ruta = path.join(raizMovil, carpeta);
    if (fs.existsSync(ruta)) mirar(ruta);
  }
  return encontrados;
}

test('nadie usa behavior="height" para el teclado', () => {
  const culpables = [];
  for (const ruta of ficherosDeLaApp()) {
    const fuente = fs.readFileSync(ruta, 'utf8');
    if (/behavior=\{[^}]*'height'/.test(fuente)) {
      culpables.push(path.relative(raizMovil, ruta));
    }
  }
  assert.deepEqual(
    culpables,
    [],
    'con "height" la pantalla tiembla en Android: Android ya reajusta la ventana solo'
  );
});

test('los dos contenedores compartidos dejan trabajar a Android', () => {
  // Son los que usan casi todas las pantallas: si vuelven a "height", vuelve el
  // temblor a la mitad de la aplicación de una sola vez.
  for (const fichero of ['components/Formulario.tsx', 'components/Pantalla.tsx']) {
    const fuente = fs.readFileSync(path.join(raizMovil, fichero), 'utf8');
    assert.match(
      fuente,
      /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/,
      `${fichero} volvió a ajustar el teclado a mano en Android`
    );
  }
});

test('en iOS SÍ se ajusta, porque allí el sistema no lo hace', () => {
  // No es simetría: iOS no reajusta la ventana solo, así que quitarlo allí
  // dejaría el teclado tapando los campos.
  const formulario = fs.readFileSync(path.join(raizMovil, 'components/Formulario.tsx'), 'utf8');
  assert.match(formulario, /'ios' \? 'padding'/);
});
