import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { PANTALLAS } from '../scripts/pantallasWeb.mjs';
import { CAMPANAS_DEMO, SERVICIOS_DE_INICIO } from '../preview/fixtures.ts';

/**
 * El vestíbulo de la pasajera.
 *
 * Aquí se protegen tres decisiones que, al romperse, no dan ningún error:
 *
 *   - Inicio ya NO lleva mapa, y el conductor SÍ. Son dos oficios distintos:
 *     quien conduce mira dónde hay gente; quien pide, no.
 *   - Lo que no está construido lo dice y no se puede pulsar. Un botón de
 *     «Comida» que no lleva a nada es una promesa rota a la primera pulsación.
 *   - Ninguna campaña enseña cifras. Una recaudación inventada en una captura
 *     se lee como dinero recaudado de verdad.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

const INICIO = 'preview/pantallaInicioPasajera.tsx';
const PANTALLAS_C2 = 'preview/pantallasC2.tsx';
const DIBUJO = 'scripts/pantallasWeb.mjs';

// ---------------------------------------------------------------------------
// El mapa cambia de sitio
// ---------------------------------------------------------------------------

test('el inicio de la pasajera NO lleva mapa', () => {
  // La decisión grande. En reposo, un mapa de tu propia calle no dice nada que
  // no sepas, y se estaba gastando en él la pantalla más visitada.
  //
  // Sin comentarios: se busca que el lienzo NO esté, y explicarlo obliga a
  // nombrarlo.
  const movil = despojarComentarios(leer(INICIO));
  assert.ok(!movil.includes('LienzoDeMapa'), 'el inicio volvió a montar el mapa');

  const dibujo = PANTALLAS.pasajera();
  assert.ok(!dibujo.includes('class="mapa"'), 'el dibujo del inicio volvió a llevar mapa');
});

test('el mapa sigue estando al pedir', () => {
  // No se ha perdido: se ha movido detrás del disco central. Si desapareciera
  // de las dos, no habría forma de pedir un viaje.
  assert.ok(PANTALLAS.pedir().includes('class="mapa"'), 'pedir se quedó sin mapa');
  assert.ok(
    despojarComentarios(leer(PANTALLAS_C2)).includes('LienzoDeMapa'),
    'las pantallas de viaje se quedaron sin mapa'
  );
});

test('el conductor conserva su mapa', () => {
  // Ahí el mapa es el trabajo, no decoración.
  for (const clave of ['conductor-offline', 'conductor-online', 'panel-jornada']) {
    assert.ok(
      PANTALLAS[clave]().includes('class="mapa"'),
      `${clave} se quedó sin mapa`
    );
  }
});

// ---------------------------------------------------------------------------
// No se promete lo que no hay
// ---------------------------------------------------------------------------

test('los servicios que no existen lo dicen', () => {
  const pendientes = SERVICIOS_DE_INICIO.filter(dato => !dato.listo);
  assert.ok(pendientes.length > 0, 'no queda ningún servicio por construir, revisa el fixture');

  const dibujo = PANTALLAS.pasajera();
  const rotulos = (dibujo.match(/PRONTO/g) ?? []).length;
  assert.equal(
    rotulos,
    pendientes.length,
    `hay ${pendientes.length} servicios sin construir y ${rotulos} rótulos de PRONTO`
  );
});

test('los servicios que no existen tampoco se pueden pulsar', () => {
  // El rótulo sin el bloqueo sería peor que nada: dice «pronto» y aun así te
  // deja tocarlo para no llevarte a ningún sitio.
  assert.ok(
    leer(INICIO).includes('disabled={!dato.listo}'),
    'las casillas pendientes siguen siendo pulsables'
  );
  assert.ok(
    leer(INICIO).includes('accessibilityState={{ disabled: !dato.listo }}'),
    'las casillas pendientes no se anuncian como desactivadas'
  );
});

test('los servicios listos son los que la aplicación hace de verdad', () => {
  // Viajes, los comercios aliados y Transporte Seguro. Nada más está
  // construido, y esta prueba salta si alguien marca `listo` a la ligera.
  const listos = SERVICIOS_DE_INICIO.filter(dato => dato.listo).map(dato => dato.clave);
  assert.deepEqual(listos.sort(), ['comercios', 'seguro', 'viajes']);
});

test('Viajes ocupa el ancho entero y es el único', () => {
  // Es lo único que la aplicación hace hoy. Seis casillas iguales dirían que
  // +58express es seis cosas a medias en vez de una bien.
  const anchos = SERVICIOS_DE_INICIO.filter(dato => dato.ancho);
  assert.equal(anchos.length, 1, 'hay más de una casilla ancha');
  assert.equal(anchos[0].clave, 'viajes');
});

// ---------------------------------------------------------------------------
// Las campañas
// ---------------------------------------------------------------------------

test('ninguna campaña enseña una cifra', () => {
  // Una recaudación inventada en una captura se lee como dinero recaudado de
  // verdad, y con una causa real eso sería grave.
  // El nombre de la marca lleva un 58 dentro, así que se quita antes de mirar:
  // lo que no puede haber son importes, porcentajes ni recuentos.
  const sinMarca = texto => texto.replace(/\+58express/g, '');
  for (const campana of CAMPANAS_DEMO) {
    const texto = sinMarca(`${campana.titulo} ${campana.detalle} ${campana.accion}`);
    assert.ok(!/\d/.test(texto), `«${campana.titulo}» lleva una cifra`);
  }

  const dibujo = PANTALLAS.pasajera();
  const zona = dibujo.slice(dibujo.indexOf('Lo que está pasando'), dibujo.indexOf('Aliados'));
  const cifras = zona.match(/\$\s?\d|Bs\.\s?\d|\d+\s?%/g) ?? [];
  assert.deepEqual(cifras, [], `las campañas enseñan ${cifras.join(', ')}`);
});

// ---------------------------------------------------------------------------
// El dibujo y el teléfono cuentan lo mismo
// ---------------------------------------------------------------------------

test('la rejilla sale del mismo sitio en los dos', () => {
  for (const fichero of [INICIO, DIBUJO]) {
    assert.ok(leer(fichero).includes('SERVICIOS_DE_INICIO'), `${fichero} no lee el fixture`);
    assert.ok(leer(fichero).includes('CAMPANAS_DEMO'), `${fichero} no lee las campañas`);
  }

  const dibujo = PANTALLAS.pasajera();
  for (const dato of SERVICIOS_DE_INICIO) {
    assert.ok(dibujo.includes(dato.titulo), `la rejilla no enseña «${dato.titulo}»`);
  }
});

test('la tasa del BCV está en el inicio, que es lo que se pidió', () => {
  // Antes vivía sólo en la pantalla de pedir, con el argumento de que es donde
  // se decide un gasto. Manda el otro: en Venezuela la tasa se consulta a todas
  // horas y ésta es la pantalla que más se abre.
  assert.match(PANTALLAS.pasajera(), /Tasa BCV/, 'el inicio no enseña la tasa');
  assert.ok(leer(INICIO).includes('TASA_DEMO'), 'el teléfono no lee la tasa del fixture');
});

test('el saludo usa el nombre de quien entró', () => {
  assert.match(PANTALLAS.pasajera(), /Hola, /, 'el inicio no saluda');
  assert.ok(leer(INICIO).includes('PASAJERA_DEMO'), 'el saludo no sale de los datos');
});
