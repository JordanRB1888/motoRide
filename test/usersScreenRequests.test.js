import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fuente = fs.readFileSync(path.join(raiz, 'src/pages/admin/usersManagement.js'), 'utf8');

/**
 * Cambiar de pagina, de filtro o de busqueda arrastraba consigo la coleccion
 * entera de viajes --que no esta paginada-- y un recalculo de las cifras
 * globales, que no dependen de nada de eso. Tres navegaciones seguidas eran
 * nueve peticiones, dos de ellas pesadas.
 *
 * Medido en la pantalla real tras el cambio: tres navegaciones, tres
 * peticiones, todas a /users; ninguna a /trips ni a /admin/overview, y las
 * cuatro cifras de cabecera siguieron correctas sin volver a pedirse.
 */

/** Cuerpo aproximado de una funcion declarada como `const nombre = async () => {`. */
function cuerpoDe(nombre) {
  const inicio = fuente.indexOf(`const ${nombre} = async () => {`);
  assert.notEqual(inicio, -1, `no se encontro ${nombre}`);
  let profundidad = 0;
  let i = fuente.indexOf('{', inicio);
  const desde = i;
  for (; i < fuente.length; i += 1) {
    if (fuente[i] === '{') profundidad += 1;
    else if (fuente[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) break;
    }
  }
  return fuente.slice(desde, i + 1);
}

/**
 * Manejadores de navegacion: filtros, paginas y busqueda.
 *
 * Se toma una ventana fija desde cada marca en lugar de intentar delimitar el
 * final del manejador: estos son de una sola linea y con parentesis anidados,
 * y cualquier intento de cerrar la expresion corta por donde no debe.
 */
function navegacion() {
  // Marcas del manejador, no del HTML: `data-user-role` aparece antes dentro
  // de la plantilla, y esa ventana no contiene ninguna llamada de carga.
  const marcas = [
    "querySelectorAll('[data-user-role]')",
    "querySelector('#user-status-filter')",
    "querySelectorAll('[data-user-page]')",
    "querySelector('#users-prev')",
    "querySelector('#users-next')",
    'temporizadorBusqueda = setTimeout'
  ];
  return marcas.map(marca => {
    const inicio = fuente.indexOf(marca);
    assert.notEqual(inicio, -1, `no se encontro el manejador ${marca}`);
    return { marca, tramo: fuente.slice(inicio, inicio + 320) };
  });
}

test('las tres cargas estan separadas', () => {
  for (const nombre of ['loadPage', 'loadCounts', 'loadTrips']) {
    assert.ok(cuerpoDe(nombre).length > 0, `falta ${nombre}`);
  }
});

test('la carga de pagina no pide viajes ni cifras', () => {
  const cuerpo = cuerpoDe('loadPage');
  assert.ok(cuerpo.includes('consulta()'), 'debe pedir la pagina de usuarios');
  assert.ok(!cuerpo.includes("'/trips'"), 'no debe pedir la coleccion de viajes');
  assert.ok(!cuerpo.includes("'/admin/overview'"), 'no debe recalcular las cifras globales');
});

test('navegar solo dispara la carga de pagina', () => {
  for (const { marca, tramo } of navegacion()) {
    // La llamada tiene que aparecer antes que cualquier otra carga.
    const posicionPagina = tramo.indexOf('loadPage()');
    assert.notEqual(posicionPagina, -1, `${marca} no pide la pagina`);

    const completa = tramo.search(/[^a-zA-Z]load\(\)/);
    assert.ok(
      completa === -1 || completa > posicionPagina + 200,
      `${marca} dispara la carga completa, que arrastra viajes y cifras`
    );
    const cifras = tramo.indexOf('loadCounts()');
    assert.ok(
      cifras === -1 || cifras > posicionPagina + 200,
      `${marca} recalcula las cifras globales al navegar`
    );
  }
});

test('los viajes solo se piden si no estan ya cargados', () => {
  // El panel los trae al abrirse, asi que en el caso normal no hay peticion.
  const cuerpo = cuerpoDe('loadTrips');
  assert.match(cuerpo, /if \(trips\.length\) return;/, 'debe salir si ya estan');
  const veces = fuente.split("apiService.get('/trips')").length - 1;
  assert.equal(veces, 1, `/trips se pide en ${veces} sitios, deberia ser uno`);
});

test('las cifras globales se refrescan cuando cambia el censo, no al navegar', () => {
  // Suspender o dar de alta a alguien si cambia los cuatro contadores.
  const acciones = fuente.match(/await Promise\.all\(\[loadPage\(\), loadCounts\(\)\]\)/g) || [];
  assert.ok(acciones.length >= 2, `se esperaban las acciones sobre el censo, hay ${acciones.length}`);
  const veces = fuente.split("apiService.get('/admin/overview')").length - 1;
  assert.equal(veces, 1, `/admin/overview se pide en ${veces} sitios, deberia ser uno`);
});
