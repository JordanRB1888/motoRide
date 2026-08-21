import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScreenLifecycle } from '../src/utils/screenLifecycle.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const landing = fs.readFileSync(path.join(raiz, 'src/pages/landing.js'), 'utf8');

/**
 * La pantalla de entrada pone tres oyentes en `window` --el raton para el
 * brillo y la inclinacion, la suelta del boton y la del dedo para dejar de
 * acelerar-- y arranca un bucle de animacion.
 *
 * El enrutador vacia el contenedor en cada cambio de ruta, pero eso desconecta
 * el DOM y nada mas: el fotograma pendiente se seguia reprogramando y los tres
 * oyentes seguian vivos sujetando el DOM viejo. Entrar, salir y volver dejaba
 * dos bucles y dos juegos de oyentes; a la tercera, tres.
 *
 * La pantalla no se puede importar desde una prueba --arrastra `socketClient`,
 * que lee `import.meta.env`, inexistente fuera de Vite--, asi que el ciclo de
 * vida vive en su propio modulo y se prueba ejecutandolo de verdad.
 */

// ------------------------------------------- un navegador de mentira

function crearVentana({ reducedMotion = false } = {}) {
  const oyentes = new Map();
  const pedidos = [];
  const cancelados = [];
  let siguienteId = 1;
  let observador = null;
  let nodoEnElDocumento = true;

  const clave = (objetivo, tipo) => `${objetivo === ventana ? 'window' : 'media'}:${tipo}`;

  const consulta = {
    matches: reducedMotion,
    addEventListener(tipo, handler) { registrar(consulta, tipo, handler); },
    removeEventListener(tipo, handler) { quitar(consulta, tipo, handler); }
  };

  function registrar(objetivo, tipo, handler) {
    const k = clave(objetivo, tipo);
    if (!oyentes.has(k)) oyentes.set(k, new Set());
    oyentes.get(k).add(handler);
  }
  function quitar(objetivo, tipo, handler) { oyentes.get(clave(objetivo, tipo))?.delete(handler); }

  const nodo = { id: 'raiz-de-la-pantalla' };

  const ventana = {
    addEventListener(tipo, handler) { registrar(ventana, tipo, handler); },
    removeEventListener(tipo, handler) { quitar(ventana, tipo, handler); },
    matchMedia: () => consulta,
    requestAnimationFrame(cb) { const id = siguienteId++; pedidos.push({ id, cb }); return id; },
    cancelAnimationFrame(id) { cancelados.push(id); },
    performance: { now: () => 0 },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.conectado = false; observador = this; }
      observe() { this.conectado = true; }
      disconnect() { this.conectado = false; }
    },
    document: { body: { contains: n => nodoEnElDocumento && n === nodo } }
  };

  return {
    ventana, consulta, nodo, pedidos, cancelados,
    contarOyentes: () => [...oyentes.values()].reduce((s, set) => s + set.size, 0),
    oyentesDe: tipo => oyentes.get(`window:${tipo}`)?.size || 0,
    oyentesDeMedia: () => oyentes.get('media:change')?.size || 0,
    /** El enrutador vacía el contenedor. */
    desmontar() { nodoEnElDocumento = false; observador?.cb([], observador); },
    get observadorConectado() { return Boolean(observador?.conectado); },
    correrUltimoFrame(time = 16) { pedidos.at(-1)?.cb(time); },
    cambiarPreferencia(valor) {
      consulta.matches = valor;
      for (const h of oyentes.get('media:change') || []) h({ matches: valor });
    }
  };
}

/** Monta un ciclo de vida como lo hace la pantalla. */
function montarPantalla(opciones = {}) {
  const env = crearVentana(opciones);
  const dibujados = [];
  const lifecycle = createScreenLifecycle({
    window: env.ventana,
    onFrame: time => dibujados.push(time)
  });
  // Los mismos tres oyentes globales que pone el login.
  const noop = () => {};
  lifecycle.addListener(env.ventana, 'mousemove', noop, { passive: true });
  lifecycle.addListener(env.ventana, 'mouseup', noop);
  lifecycle.addListener(env.ventana, 'touchend', noop, { passive: true });
  lifecycle.start();
  lifecycle.closeWhenDetached(env.nodo);
  return { env, lifecycle, dibujados };
}

// ------------------------------------------------------------- A y B

test('A) al desmontar se cancela el fotograma pendiente', () => {
  const { env, lifecycle } = montarPantalla();
  assert.ok(env.pedidos.length >= 1, 'debe haberse pedido un fotograma');
  assert.equal(env.cancelados.length, 0);
  assert.equal(lifecycle.animating, true);

  env.desmontar();

  assert.equal(env.cancelados.length, 1, 'el fotograma pendiente debe cancelarse');
  assert.equal(env.cancelados[0], env.pedidos.at(-1).id, 'y debe ser el último pedido');
  assert.equal(lifecycle.animating, false);
  assert.equal(lifecycle.disposed, true);
});

test('B) al desmontar se retiran todos los oyentes globales', () => {
  const { env, lifecycle } = montarPantalla();
  for (const tipo of ['mousemove', 'mouseup', 'touchend']) {
    assert.equal(env.oyentesDe(tipo), 1, `debe haber un oyente de ${tipo}`);
  }
  assert.equal(lifecycle.listenerCount, 4, 'tres globales más el de la preferencia');

  env.desmontar();

  assert.equal(env.contarOyentes(), 0, 'no debe quedar ningún oyente');
  assert.equal(lifecycle.listenerCount, 0);
  assert.equal(env.observadorConectado, false, 'el observador debe desconectarse');
});

// ------------------------------------------------------------- C y D

test('C) montar, desmontar y volver deja una sola generación viva', () => {
  const primera = montarPantalla();
  primera.env.desmontar();
  assert.equal(primera.env.contarOyentes(), 0, 'la primera no debe dejar nada');

  const segunda = montarPantalla();
  assert.equal(segunda.env.oyentesDe('mousemove'), 1, 'exactamente un oyente, no dos');
  assert.equal(segunda.lifecycle.animating, true, 'y su propio bucle');
  assert.equal(primera.lifecycle.disposed, true, 'la anterior sigue cerrada');
  segunda.env.desmontar();
});

test('D) un fotograma tardío de la generación anterior no pinta ni se reprograma', () => {
  const { env, dibujados } = montarPantalla();
  const pedidosAntes = env.pedidos.length;
  const dibujadosAntes = dibujados.length;

  env.desmontar();
  env.correrUltimoFrame(1000);   // el navegador entrega lo que ya estaba en cola

  assert.equal(dibujados.length, dibujadosAntes, 'no debe pintar sobre una pantalla cerrada');
  assert.equal(env.pedidos.length, pedidosAntes, 'ni encadenar otro fotograma');
});

// ----------------------------------------------------------------- E

test('E) cerrar dos veces no cancela de más ni retira dos veces', () => {
  const { env, lifecycle } = montarPantalla();
  env.desmontar();
  const cancelados = env.cancelados.length;

  lifecycle.cleanup();
  env.desmontar();

  assert.equal(env.cancelados.length, cancelados, 'no debe cancelarse un fotograma ajeno');
  assert.equal(env.contarOyentes(), 0);
  assert.equal(lifecycle.disposed, true);
});

// --------------------------------------------------------------- F y G

test('F) con prefers-reduced-motion no queda un bucle perpetuo', () => {
  const { env, lifecycle, dibujados } = montarPantalla({ reducedMotion: true });

  assert.equal(env.pedidos.length, 0, `no debe programarse ningún fotograma; hubo ${env.pedidos.length}`);
  assert.equal(lifecycle.animating, false);
  assert.equal(dibujados.length, 1, 'pero la escena se dibuja una vez, no queda a medias');
  // Y la pantalla sigue siendo interactiva.
  assert.equal(env.oyentesDe('mousemove'), 1);
  env.desmontar();
});

test('G) sin esa preferencia el bucle arranca y se encadena como siempre', () => {
  const { env, lifecycle, dibujados } = montarPantalla({ reducedMotion: false });
  assert.equal(lifecycle.animating, true);

  const antes = env.pedidos.length;
  env.correrUltimoFrame(16);

  assert.equal(env.pedidos.length, antes + 1, 'cada fotograma debe programar el siguiente');
  assert.equal(dibujados.at(-1), 16, 'y dibujar con el tiempo que le llega');
  env.desmontar();
});

test('el cambio de preferencia en caliente se atiende, y se suelta al cerrar', () => {
  const { env, lifecycle } = montarPantalla({ reducedMotion: false });
  assert.equal(env.oyentesDeMedia(), 1, 'debe escucharse el cambio de preferencia');
  assert.equal(lifecycle.animating, true);

  env.cambiarPreferencia(true);
  assert.equal(lifecycle.animating, false, 'al pedir menos movimiento, el bucle para');

  env.cambiarPreferencia(false);
  assert.equal(lifecycle.animating, true, 'y al revocarlo, vuelve');

  env.desmontar();
  assert.equal(env.oyentesDeMedia(), 0, 'el oyente de la preferencia también se suelta');
});

test('un oyente registrado tras el cierre no se cuela', () => {
  const { env, lifecycle } = montarPantalla();
  env.desmontar();
  lifecycle.addListener(env.ventana, 'mousemove', () => {});
  assert.equal(env.contarOyentes(), 0, 'una pantalla cerrada no registra nada nuevo');
});

// ----------------------------------------------------------------- H

test('H) los tiempos visuales aprobados no cambian', () => {
  const css = fs.readFileSync(path.join(raiz, 'src/styles/modern-yellow-lab.css'), 'utf8');
  const esperados = {
    s1: '0.04s', s2: '0.08s', s3: '0.12s', s4: '0.16s', s5: '0.20s',
    s6: '0.24s', s7: '0.28s', s7b: '0.30s', s8: '0.32s', s9: '0.36s'
  };
  for (const [clase, retardo] of Object.entries(esperados)) {
    const patron = new RegExp(`\\.stagger-item\\.${clase}\\s*\\{\\s*transition-delay:\\s*${retardo.replace('.', '\\.')}`);
    assert.match(css, patron, `el retardo de .${clase} debe seguir siendo ${retardo}`);
  }
});

test('H) el inventario de oyentes globales del login está fijado', () => {
  // Si mañana se añade otro oyente de `window` sin pasar por el ciclo de vida,
  // esta prueba obliga a incluirlo.
  const sueltos = [...landing.matchAll(/window\.addEventListener\('([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(sueltos, [],
    `oyentes de window fuera del ciclo de vida: ${sueltos.join(', ')} — regístralos con lifecycle.addListener`);

  const registrados = [...landing.matchAll(/lifecycle\.addListener\(window, '([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(registrados.sort(), ['mousemove', 'mouseup', 'touchend'],
    'los tres oyentes globales deben pasar por el ciclo de vida');
});

test('H) la pantalla cierra sola al desmontarse y no deja el bucle suelto', () => {
  assert.match(landing, /createScreenLifecycle\(/, 'debe crear su ciclo de vida');
  assert.match(landing, /lifecycle\.closeWhenDetached\(/, 'y cerrarse al desconectarse del documento');
  assert.ok(!/requestAnimationFrame\(/.test(landing),
    'el bucle ya no se programa a mano: de eso se encarga el ciclo de vida');
});

// ------------------------------------- cleanup() es terminal

/**
 * Una instancia cerrada no puede volver a ponerse en marcha.
 *
 * `cleanup()` cancela el fotograma y retira los oyentes, pero eso solo sirve si
 * ademas cierra la puerta: si `start()` siguiera funcionando despues, bastaria
 * con una llamada tardia --un cambio de preferencia que llega, un callback que
 * quedaba en cola-- para resucitar el bucle de una pantalla que ya no existe, y
 * volveriamos a tener dos generaciones vivas.
 *
 * La guarda estaba en el codigo desde el principio; lo que faltaba era esto:
 * nadie comprobaba que estuviera.
 */

test('cleanup() es terminal: start() despues no reactiva nada', () => {
  const { env, lifecycle, dibujados } = montarPantalla();
  env.desmontar();

  const pedidosTrasCierre = env.pedidos.length;
  const dibujadosTrasCierre = dibujados.length;
  const canceladosTrasCierre = env.cancelados.length;

  lifecycle.start();

  assert.equal(env.pedidos.length, pedidosTrasCierre, 'no debe programarse ningún fotograma nuevo');
  assert.equal(dibujados.length, dibujadosTrasCierre, 'ni dibujarse una escena nueva');
  assert.equal(env.cancelados.length, canceladosTrasCierre, 'ni cancelarse nada de más');
  assert.equal(lifecycle.animating, false, 'el bucle no puede reactivarse');
  assert.equal(lifecycle.disposed, true, 'y la instancia sigue cerrada');
});

test('cleanup() es terminal también con movimiento reducido', () => {
  // Con `reduce`, `start()` no programa fotograma pero sí dibuja uno. Tras el
  // cierre tampoco debe dibujar: pintaria sobre el DOM de una pantalla ida.
  const { env, lifecycle, dibujados } = montarPantalla({ reducedMotion: true });
  assert.equal(dibujados.length, 1, 'al montar dibuja una vez');

  env.desmontar();
  lifecycle.start();

  assert.equal(dibujados.length, 1, 'tras cerrar no debe volver a dibujar');
  assert.equal(env.pedidos.length, 0);
  assert.equal(lifecycle.animating, false);
});

test('cleanup() → start() → addListener() → start() no revive la instancia', () => {
  const { env, lifecycle, dibujados } = montarPantalla();
  env.desmontar();

  const pedidos = env.pedidos.length;
  const pintados = dibujados.length;
  const oyentes = env.contarOyentes();

  lifecycle.start();
  lifecycle.addListener(env.ventana, 'mousemove', () => {});
  lifecycle.start();

  assert.equal(env.pedidos.length - pedidos, 0, 'fotogramas adicionales: debe ser 0');
  assert.equal(dibujados.length - pintados, 0, 'dibujos adicionales: debe ser 0');
  assert.equal(env.contarOyentes() - oyentes, 0, 'oyentes añadidos: debe ser 0');
  assert.equal(lifecycle.listenerCount, 0, 'la cuenta interna tampoco puede crecer');
  assert.equal(lifecycle.animating, false);
  assert.equal(lifecycle.disposed, true);
});

test('tras cerrar, ni stop() ni un fotograma en cola despiertan la instancia', () => {
  const { env, lifecycle, dibujados } = montarPantalla();
  const frameEnCola = env.pedidos.at(-1);
  env.desmontar();

  const cancelados = env.cancelados.length;
  lifecycle.stop();                    // no hay nada que parar
  assert.equal(env.cancelados.length, cancelados, 'stop() sobre una instancia cerrada no cancela nada');

  // El navegador entrega el fotograma que ya tenía en cola.
  frameEnCola.cb(999);
  assert.equal(dibujados.length, 0, 'ese fotograma no debe pintar');
  assert.equal(lifecycle.animating, false);
});
