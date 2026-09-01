import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { PANTALLAS } from '../scripts/pantallasWeb.mjs';
import { ALIADOS_DEMO, CATEGORIAS_DEMO } from '../preview/fixtures.ts';

/**
 * Los comercios aliados.
 *
 * ES PUBLICIDAD, Y ESO TIENE REGLAS
 *
 * +58express cobra por aparecer, no por lo que se venda. De ahí salen las dos
 * comprobaciones que no son de gusto sino de obligación:
 *
 *   - que el espacio se identifique como pagado, porque lo piden la ley de
 *     publicidad y las dos tiendas;
 *   - que se diga quién responde por el pedido, porque no somos nosotros y
 *     alguien va a reclamar aquí.
 *
 * Y una tercera que protege el modelo elegido: NO hay carrito, ni precios, ni
 * cobro. El día que se cuele un precio en estas pantallas, +58express estará
 * prometiendo un marketplace que no ha construido.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

const MOVIL = 'preview/pantallasAliados.tsx';
const DIBUJO = 'scripts/pantallasWeb.mjs';
const INICIO = 'preview/pantallasC2.tsx';

const pantallasDeAliados = ['aliados', 'comercio'];

// ---------------------------------------------------------------------------
// Se ve que es publicidad
// ---------------------------------------------------------------------------

test('las dos pantallas se identifican como espacio pagado', () => {
  for (const clave of pantallasDeAliados) {
    assert.match(PANTALLAS[clave](), /PUBLICIDAD/, `${clave} no dice que es publicidad`);
  }
});

test('el adelanto de Inicio también se identifica', () => {
  // Es el sitio donde más se ve y el que más se parece a una recomendación de
  // la propia aplicación. Si en algún sitio hace falta el rótulo, es aquí.
  assert.match(PANTALLAS.pasajera(), /PUBLICIDAD/, 'el adelanto de Inicio no lleva rótulo');
  assert.ok(leer(MOVIL).includes('PUBLICIDAD'), 'el teléfono no lleva rótulo');
  assert.ok(
    leer(MOVIL).includes('<RotuloPagado />'),
    'el adelanto del teléfono no pinta el rótulo'
  );
});

test('cada salida al exterior está marcada', () => {
  // Quien toca tiene derecho a saber que va a salir de la aplicación antes de
  // tocar, no después.
  //
  // En las pantallas completas hay sitio para decirlo con palabras. En el
  // adelanto de Inicio no lo hay —son tarjetas de 228 puntos—, así que va la
  // flecha, que es el convenio de toda la vida, con su etiqueta para quien
  // navega escuchando.
  for (const clave of pantallasDeAliados) {
    assert.match(
      PANTALLAS[clave](),
      /fuera de \+58express|Sales de \+58express/,
      `${clave} no avisa por escrito de que el enlace lleva fuera`
    );
  }

  const adelanto = PANTALLAS.pasajera();
  const flechas = (adelanto.match(/Abre fuera de la aplicacion/g) ?? []).length;
  assert.equal(flechas, 3, `el adelanto marca ${flechas} salidas y enseña 3 comercios`);

  assert.ok(leer(MOVIL).includes('FlechaDeSalida'), 'el teléfono no marca las salidas');
  assert.ok(
    leer(MOVIL).includes('Abre fuera de la aplicación'),
    'la flecha del teléfono no se anuncia'
  );
});

// ---------------------------------------------------------------------------
// Se ve quién responde
// ---------------------------------------------------------------------------

test('las dos pantallas dicen que +58express no atiende el pedido', () => {
  for (const clave of pantallasDeAliados) {
    assert.match(
      PANTALLAS[clave](),
      /\+58express no vende/,
      `${clave} no dice quién responde por el pedido`
    );
  }
  assert.ok(
    leer(MOVIL).includes('AvisoDeQuienResponde'),
    'el teléfono no dice quién responde'
  );
});

// ---------------------------------------------------------------------------
// Es publicidad, NO un marketplace
// ---------------------------------------------------------------------------

test('no hay carrito, ni cobro, ni pedido dentro de la aplicación', () => {
  // El dueño eligió cobrar por aparecer, no por pedido. Un carrito aquí
  // prometería un marketplace que no existe ni en el servidor ni en la cartera.
  //
  // Sin comentarios: se busca que estas palabras NO estén, y explicarlo obliga
  // a escribirlas.
  const prohibidas = ['carrito', 'Carrito', 'Añadir al pedido', 'Pagar', 'Finalizar compra'];
  for (const fichero of [MOVIL, DIBUJO]) {
    const codigo = despojarComentarios(leer(fichero));
    for (const palabra of prohibidas) {
      assert.ok(!codigo.includes(palabra), `${fichero} habla de «${palabra}»`);
    }
  }
});

test('ningún comercio enseña un precio', () => {
  // Los precios los pone el comercio, no nosotros. Una cifra aquí se lee como
  // un precio garantizado por +58express.
  for (const clave of pantallasDeAliados) {
    const cifras = PANTALLAS[clave]().match(/\$\s?\d|Bs\.\s?\d/g) ?? [];
    assert.deepEqual(cifras, [], `${clave} enseña ${cifras.join(', ')}`);
  }
  for (const aliado of ALIADOS_DEMO) {
    const texto = `${aliado.nombre} ${aliado.gancho}`;
    assert.ok(!/\$|Bs\./.test(texto), `«${aliado.nombre}» lleva un precio en su texto`);
  }
});

// ---------------------------------------------------------------------------
// Los datos
// ---------------------------------------------------------------------------

test('los comercios son OBVIAMENTE de ejemplo', () => {
  // Si una captura acaba en una presentación, ningún negocio real de Maracaibo
  // debe poder decir que se usó su nombre sin permiso.
  for (const aliado of ALIADOS_DEMO) {
    assert.match(aliado.nombre, /ejemplo/i, `«${aliado.nombre}» no se identifica como ejemplo`);
    assert.match(aliado.zona, /demo/i, `la zona de «${aliado.nombre}» no se identifica como demo`);
  }
});

test('el dibujo y el teléfono leen los mismos comercios', () => {
  // Los dos importan del fixture. Si alguno los repitiera a mano, renombrar un
  // comercio dejaría al otro enseñando el de antes.
  for (const fichero of [MOVIL, DIBUJO]) {
    assert.ok(leer(fichero).includes('ALIADOS_DEMO'), `${fichero} no lee el fixture`);
  }
  const lista = PANTALLAS.aliados();
  for (const aliado of ALIADOS_DEMO) {
    assert.ok(lista.includes(aliado.nombre), `la lista no enseña «${aliado.nombre}»`);
  }
});

test('las categorías salen de los propios comercios', () => {
  // Escritas a mano, una categoría podría quedarse sin comercios detrás o al
  // revés: un comercio sin filtro que lo encuentre.
  const deLosComercios = new Set(ALIADOS_DEMO.map(aliado => aliado.categoria));
  for (const categoria of CATEGORIAS_DEMO.slice(1)) {
    assert.ok(deLosComercios.has(categoria), `la categoría «${categoria}» no tiene comercios`);
  }
  assert.equal(CATEGORIAS_DEMO.length, deLosComercios.size + 1, 'falta o sobra alguna categoría');
});

// ---------------------------------------------------------------------------
// El mapa sigue mandando en Inicio
// ---------------------------------------------------------------------------

test('el adelanto de Inicio enseña TRES comercios, no todos', () => {
  // Inicio es map-first. La lista entera ahí empujaría el mapa fuera de la
  // pantalla, que es justo lo que C2 no hace.
  assert.ok(
    leer(MOVIL).includes('ALIADOS_DEMO.slice(0, 3)'),
    'el adelanto del teléfono no se limita a tres'
  );
  assert.ok(
    leer(DIBUJO).includes('ALIADOS_DEMO.slice(0, 3)'),
    'el adelanto del dibujo no se limita a tres'
  );
});

test('Inicio sigue sin repetir los destinos recientes', () => {
  // Se quitaron a propósito: al tocar el disco central se despliega la petición
  // con esa misma lista dentro. Los aliados se añadieron DEBAJO, no en su
  // lugar, y esta prueba impide que vuelvan de rebote.
  const inicio = despojarComentarios(leer(INICIO));
  const cuerpo = inicio.slice(
    inicio.indexOf('export function C2InicioPasajera'),
    inicio.indexOf('export function C2PedirViaje')
  );
  assert.ok(
    !cuerpo.includes('DESTINOS_RECIENTES_DEMO'),
    'los destinos recientes volvieron a Inicio'
  );
});

test('el hueco del logotipo existe y hoy lleva la inicial', () => {
  // Cuando haya logotipos de verdad, se sustituye el sello y ya. Un icono de
  // categoría prestado de los doce que hay mentiría mientras tanto.
  assert.ok(leer(MOVIL).includes('SelloDeComercio'), 'no hay sello de comercio');
  for (const aliado of ALIADOS_DEMO) {
    assert.equal(
      aliado.inicial,
      aliado.nombre[0],
      `la inicial de «${aliado.nombre}» no es su primera letra`
    );
  }
});
