import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { PANTALLAS } from '../scripts/pantallasWeb.mjs';
import { ALIADOS_DEMO, CAMPANAS_DEMO, CATEGORIAS_DEMO } from '../preview/fixtures.ts';

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

// ---------------------------------------------------------------------------
// El relleno
// ---------------------------------------------------------------------------

test('cada espacio publicitario tiene imagen, y el fichero existe', () => {
  // Una rejilla de discos grises con una letra dentro se lee como una sección
  // sin terminar, y ésta es justo la parte que se vende. El arte es RELLENO
  // —lo sustituye cada anunciante desde el panel— pero mientras no lo haga,
  // el hueco no puede verse vacío.
  const marca = leer('theme/marca.ts');

  for (const aliado of ALIADOS_DEMO) {
    assert.ok(aliado.arte !== undefined, `«${aliado.nombre}» no tiene imagen`);
    assert.ok(
      marca.includes(`'${aliado.arte}': require(`),
      `«${aliado.arte}» no está en el registro de arte`
    );
    assert.ok(
      fs.existsSync(path.join(raizMovil, `assets/marca/publicidad/${aliado.arte}.jpg`)),
      `falta el fichero de «${aliado.arte}»`
    );
  }
});

test('ninguna campaña se queda en texto seco', () => {
  // Dos tarjetas de campaña una al lado de la otra, una con arte y otra sin
  // él, se ven como si a la segunda le faltara algo. Y le falta.
  for (const campana of CAMPANAS_DEMO) {
    assert.ok(campana.banner !== undefined, `la campaña «${campana.titulo}» no tiene banner`);
  }
});

test('el arte de relleno se puede REHACER', () => {
  // Si cambia el encuadre de una tarjeta o el gris de la marca, se vuelve a
  // ejecutar el script en vez de recordar cómo se hicieron las imágenes.
  assert.ok(
    fs.existsSync(path.join(raizMovil, 'scripts/arte-de-publicidad.py')),
    'las imágenes no tienen receta'
  );
});

test('el relleno no se disfraza de negocio real', () => {
  // Son marcadores de posición. Los comercios se llaman «de ejemplo» y el
  // código lo dice donde se registran, para que nadie los tome por clientes.
  const marca = leer('theme/marca.ts');
  // El comentario va ANTES de la declaracion, que es donde lo lee quien abre
  // el fichero para anadir una imagen.
  const explicacion = marca.slice(0, marca.indexOf('export const ARTE_DE_ALIADO'));
  assert.match(explicacion.slice(-1200), /Marcadores de posición|marcador/i);

  for (const aliado of ALIADOS_DEMO) {
    assert.match(aliado.nombre, /ejemplo/i, `«${aliado.nombre}» no se anuncia como ejemplo`);
  }
});

test('quien no tiene imagen conserva su sello', () => {
  // Un aliado recién dado de alta no tiene arte hasta que lo suba, y esa fila
  // tiene que seguir viéndose bien. Si el respaldo desaparece, el día del alta
  // se ve un hueco.
  const pantalla = leer('preview/pantallasAliados.tsx');
  const sello = pantalla.slice(pantalla.indexOf('export function SelloOPortada'));
  assert.match(sello.slice(0, 700), /<SelloDeComercio/, 'no hay respaldo sin imagen');
});

// ---------------------------------------------------------------------------
// Las filas que se deslizan
// ---------------------------------------------------------------------------

test('las dos filas deslizantes son la MISMA pieza', () => {
  // Se escribían a mano por separado y se notaba: títulos de tamaños distintos,
  // sangrados distintos, y ninguna de las dos decía que se podía deslizar.
  for (const fichero of ['preview/pantallaInicioPasajera.tsx', 'preview/pantallasAliados.tsx']) {
    assert.match(leer(fichero), /<Carrusel/, `${fichero} no usa la pieza común`);
  }

  // Y ya no queda ningún ScrollView horizontal suelto en el inicio: si vuelve
  // uno, vuelve el desorden que esto arregló.
  const inicio = despojarComentarios(leer('preview/pantallaInicioPasajera.tsx'));
  assert.doesNotMatch(inicio, /<ScrollView\s+horizontal/, 'hay una fila deslizante escrita a mano');
});

test('la flecha DICE que hay más, y deja de decirlo al final', () => {
  // Una tarjeta cortada por el borde, sin nada que lo explique, se lee como un
  // fallo de maquetación y no como «hay más».
  //
  // Y desaparece al llegar al final: una flecha que no lleva a ninguna parte
  // enseña a no hacer caso de las flechas.
  const carrusel = leer('ui/Carrusel.tsx');

  assert.match(carrusel, /\{hayMas \? \(/, 'la flecha se pinta siempre');
  assert.match(
    carrusel,
    /donde\.current \+ visible\.current < total\.current/,
    'no se comprueba si queda algo a la derecha'
  );

  // No es sólo un cartel: se toca y avanza, que es lo que espera quien la ve.
  assert.match(carrusel, /scrollTo\(\{ x: donde\.current \+ paso/, 'la flecha no desplaza nada');
  assert.match(carrusel, /accessibilityLabel=\{`Ver más de/, 'la flecha no se anuncia');
});

test('el rótulo de PUBLICIDAD sobrevive al cambio de título', () => {
  // El título de los aliados pasó de etiqueta en mayúsculas a encabezado, para
  // que las dos filas se lean como hermanas. Lo que NO puede perderse en ese
  // cambio es el rótulo: es publicidad, y las tiendas exigen que se distinga.
  const pantalla = leer('preview/pantallasAliados.tsx');
  const adelanto = pantalla.slice(pantalla.indexOf('export function AdelantoDeAliados'));

  assert.match(adelanto.slice(0, 900), /rotulo=\{<RotuloPagado \/>\}/, 'el rótulo de publicidad se perdió');
  assert.match(adelanto.slice(0, 900), /titulo="Aliados"/);
});
