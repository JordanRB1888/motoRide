import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios, medido } from './ayudas.mjs';

import { NOMBRES, PANTALLAS } from '../scripts/pantallasWeb.mjs';
import { ESQUEMA_CLARO, ESQUEMA_OSCURO } from '../theme/esquemas.ts';
import { DESTINOS_DE_CONDUCTOR, DESTINOS_DE_PASAJERA } from '../theme/navegacion.ts';
import {
  AVISOS_DEMO,
  HISTORIAL_DEMO,
  MOVIMIENTOS_DEMO,
  PERFIL_DEMO
} from '../preview/fixtures.ts';

/**
 * El dibujo de revisión.
 *
 * Este fichero no juzga si algo se ve bonito. Comprueba las cosas que, al
 * romperse, NO dan ningún error y sólo se descubren mirando: una pantalla que
 * se queda fuera del menú, una pestaña que nunca se enciende, un texto que se
 * escribió dos veces y se quedó a medias, un color que en modo día desaparece.
 *
 * Todas las que hay aquí salieron de recorrer las pantallas en el navegador.
 * Ninguna se escribió por si acaso.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

const DIBUJO = 'scripts/pantallasWeb.mjs';
const SERVIDOR = 'scripts/servidorDeRevision.mjs';

const claves = Object.keys(PANTALLAS);
const pintar = (clave, esquema = 'claro') => PANTALLAS[clave](esquema);

// ---------------------------------------------------------------------------
// Ninguna pantalla se queda sin puerta
// ---------------------------------------------------------------------------

test('todas las pantallas se pintan en los dos esquemas', () => {
  for (const clave of claves) {
    for (const esquema of ['claro', 'oscuro']) {
      const salida = pintar(clave, esquema);
      assert.equal(typeof salida, 'string', `${clave} en ${esquema}`);
      assert.ok(salida.trim().length > 200, `${clave} en ${esquema} sale casi vacía`);
    }
  }
});

test('todas las pantallas tienen nombre en el menú', () => {
  for (const clave of claves) {
    assert.ok(NOMBRES[clave], `${clave} no tiene nombre y saldría con su clave cruda`);
  }
});

test('todas las pantallas están en algún grupo del servidor', () => {
  // Una pantalla dibujada pero no listada existe y no se puede abrir: es
  // exactamente el estado en el que estuvieron siete de ellas.
  const servidor = leer(SERVIDOR);
  const grupos = servidor.slice(servidor.indexOf('const GRUPOS'), servidor.indexOf('const PENDIENTES'));
  for (const clave of claves) {
    assert.ok(grupos.includes(`'${clave}'`), `${clave} no aparece en ningún grupo del menú`);
  }
});

test('ninguna pantalla dibujada sigue anunciada como pendiente', () => {
  const servidor = leer(SERVIDOR);
  const pendientes = servidor.slice(servidor.indexOf('const PENDIENTES'));
  const lista = pendientes.slice(0, pendientes.indexOf(']'));
  for (const clave of claves) {
    const nombre = NOMBRES[clave];
    assert.ok(!lista.includes(nombre), `${nombre} está dibujada y aún se anuncia como pendiente`);
  }
});

// ---------------------------------------------------------------------------
// El laboratorio no se mete en el diseño
// ---------------------------------------------------------------------------

test('el CSS del laboratorio no comparte nombres con el de las pantallas', () => {
  // Los dos van en el mismo documento. `.pie` estaba en los dos, y la del
  // laboratorio —centrada, con ancho máximo— se colaba en TODAS las pantallas:
  // los textos de detalle salían centrados dentro de sus filas. No dio ningún
  // error; se vio mirando.
  const nombres = texto => new Set(
    [...texto.matchAll(/^\s*\.([a-z0-9-]+)[\s,{]/gm)].map(coincidencia => coincidencia[1])
  );
  const compartidas = [...nombres(leer(SERVIDOR))].filter(clase => nombres(leer(DIBUJO)).has(clase));
  assert.deepEqual(compartidas, [], `clases en los dos CSS: ${compartidas.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Las barras
// ---------------------------------------------------------------------------

test('las barras se dibujan desde los destinos de verdad', () => {
  // Sólo el trozo de las barras: en `NOMBRES` los mismos textos son legítimos,
  // porque ahí nombran la pantalla en el menú del laboratorio y no la pestaña.
  //
  // Sin comentarios: lo que se busca es que los nombres NO estén escritos a
  // mano, y explicarlo obliga a escribirlos.
  const dibujo = despojarComentarios(leer(DIBUJO));
  const barras = dibujo.slice(dibujo.indexOf('const barraPasajera'), dibujo.indexOf('const hojaAlta'));
  assert.ok(barras.length > 200, 'no se encontró el trozo de las barras');

  for (const destino of [...DESTINOS_DE_PASAJERA, ...DESTINOS_DE_CONDUCTOR]) {
    assert.ok(
      !barras.includes(`'${destino.etiqueta}'`),
      `«${destino.etiqueta}» está escrito a mano en la barra en vez de leerse de navegacion.ts`
    );
  }
});

test('cada pantalla con barra enciende exactamente un destino', () => {
  // La del conductor sabía encender sólo el primero, y sólo si se llamaba
  // «mapa»: en la de saldo no había ninguna encendida y no se sabía dónde
  // estabas.
  for (const clave of claves) {
    const html = pintar(clave);
    if (!html.includes('class="barra"')) continue;

    const encendidos = [...html.matchAll(/class="etq (?:t3)?"/g)]
      .filter(coincidencia => !coincidencia[0].includes('t3')).length;
    assert.ok(encendidos >= 1, `${clave} no tiene ningún destino encendido`);
    assert.ok(encendidos <= 1, `${clave} tiene ${encendidos} destinos encendidos`);
  }
});

test('el destino encendido se ve en los DOS esquemas', () => {
  // El amarillo de marca sobre la barra casi blanca del modo día se queda en
  // 1,35:1, y un elemento de interfaz necesita 3:1. La etiqueta pasaba a negro
  // y el icono desaparecía, así que sólo la mitad del par se veía.
  const MINIMO_INTERFAZ = 3;
  for (const [nombre, esquema] of [['claro', ESQUEMA_CLARO], ['oscuro', ESQUEMA_OSCURO]]) {
    const medida = medido(esquema.acentoTexto, esquema.superficie);
    assert.ok(
      medida >= MINIMO_INTERFAZ,
      `el icono del destino activo da ${medida}:1 sobre la barra en ${nombre}`
    );
  }
});

test('el dibujo no tiñe el destino activo con el amarillo de superficie', () => {
  const dibujo = despojarComentarios(leer(DIBUJO));
  const barras = dibujo.slice(dibujo.indexOf('const barraPasajera'), dibujo.indexOf('const hojaAlta'));
  assert.ok(
    !barras.includes("=== activo ? 'var(--acento)'"),
    'el destino activo vuelve a usar el amarillo de marca, que en día no se ve'
  );
});

// ---------------------------------------------------------------------------
// Los textos salen de un solo sitio
// ---------------------------------------------------------------------------

test('el historial enseña los viajes del fixture', () => {
  const html = pintar('historial');
  for (const viaje of HISTORIAL_DEMO) {
    for (const dato of [viaje.fecha, viaje.origen, viaje.destino, viaje.estado]) {
      assert.ok(html.includes(dato), `el historial no enseña «${dato}»`);
    }
  }
});

test('los avisos salen del fixture, con su estado de leído', () => {
  const html = pintar('avisos');
  for (const aviso of AVISOS_DEMO) {
    assert.ok(html.includes(aviso.titulo), `falta el aviso «${aviso.titulo}»`);
    assert.ok(html.includes(aviso.detalle), `falta el detalle de «${aviso.titulo}»`);
  }
  const sinLeer = AVISOS_DEMO.filter(aviso => aviso.sinLeer).length;
  assert.equal(
    [...html.matchAll(/border-radius:50%;\s*\n?\s*background:var\(--acento-texto\)/g)].length,
    sinLeer,
    'los puntos de «sin leer» no cuadran con el fixture'
  );
});

test('los movimientos del conductor salen del fixture', () => {
  // Estaban escritos otra vez dentro del dibujo. Cambiar un texto en el fixture
  // dejaba el navegador enseñando el de antes.
  const html = pintar('saldo-conductor');
  for (const movimiento of MOVIMIENTOS_DEMO) {
    for (const dato of [movimiento.titulo, movimiento.detalle, movimiento.cuando, movimiento.estado]) {
      assert.ok(html.includes(dato), `el saldo no enseña «${dato}»`);
    }
  }
  assert.ok(html.includes(`${MOVIMIENTOS_DEMO.length} registros`), 'el recuento está escrito a mano');
});

test('el perfil enseña a la persona del fixture', () => {
  const html = pintar('perfil');
  for (const dato of [PERFIL_DEMO.nombre, PERFIL_DEMO.iniciales, PERFIL_DEMO.desde]) {
    assert.ok(html.includes(dato), `el perfil no enseña «${dato}»`);
  }
});

// ---------------------------------------------------------------------------
// Lo que las pantallas nuevas NO deben hacer
// ---------------------------------------------------------------------------

test('las secciones nuevas no enseñan ninguna cifra de dinero', () => {
  // El saldo de la pasajera dice que la cartera no está encendida. Un número de
  // ejemplo en esa pantalla se lee como dinero de verdad.
  const SECCIONES = ['historial', 'viaje-seguro', 'perfil', 'saldo-pasajera', 'avisos', 'ayuda', 'configuracion'];
  for (const clave of SECCIONES) {
    const html = pintar(clave);
    const cifras = html.match(/\$\s?\d|Bs\.\s?\d/g) ?? [];
    assert.deepEqual(cifras, [], `${clave} enseña ${cifras.join(', ')}`);
  }
});

test('la tasa del BCV sigue saliendo en un solo sitio de cada rol', () => {
  // Decisión del dueño: en el conductor, en Saldo; en la pasajera, al pedir.
  const conTasa = claves.filter(clave => /Tasa BCV|tasa referencial/.test(pintar(clave)));
  assert.deepEqual(conTasa.sort(), ['pedir', 'saldo-conductor']);
});

test('las muestras de apariencia usan los fondos reales de cada esquema', () => {
  // Son los DOS esquemas dibujados a la vez, así que no pueden salir de los
  // tokens de la página: sólo valen para el que está puesto. Si los esquemas
  // cambian de fondo, la muestra tiene que cambiar con ellos.
  const html = pintar('configuracion');
  assert.ok(html.includes(ESQUEMA_CLARO.fondo), 'la muestra del día no usa el fondo claro real');
  assert.ok(html.includes(ESQUEMA_OSCURO.fondo), 'la muestra de la noche no usa el fondo oscuro real');
});

test('Configuración dice el modo que de verdad está puesto', () => {
  assert.ok(pintar('configuracion', 'claro').includes('modo día'));
  assert.ok(pintar('configuracion', 'oscuro').includes('modo noche'));
});

// ---------------------------------------------------------------------------
// El contenido largo se puede mirar entero
// ---------------------------------------------------------------------------

test('las pantallas largas se pueden desplazar', () => {
  // En el teléfono van en un ScrollView. Aquí iban dentro de una caja de altura
  // fija con el desbordamiento oculto: el final de Perfil y de Configuración no
  // se podía auditar porque no había forma de llegar a él.
  for (const clave of ['historial', 'viaje-seguro', 'perfil', 'saldo-pasajera',
    'avisos', 'ayuda', 'configuracion', 'saldo-conductor']) {
    assert.ok(pintar(clave).includes('class="hoja"'), `${clave} no se puede desplazar`);
  }
});

// ---------------------------------------------------------------------------
// El dibujo no se convierte en otra aplicación
// ---------------------------------------------------------------------------

test('el dibujo no llama a ninguna API ni guarda nada', () => {
  const dibujo = despojarComentarios(leer(DIBUJO));
  for (const prohibido of ['fetch(', 'XMLHttpRequest', 'localStorage', 'SecureStore', 'supabase']) {
    assert.ok(!dibujo.includes(prohibido), `el dibujo usa ${prohibido}`);
  }
});

test('el servidor de revisión sigue escuchando sólo en local', () => {
  assert.ok(leer(SERVIDOR).includes("'127.0.0.1'"), 'el servidor podría quedar expuesto fuera del equipo');
});
