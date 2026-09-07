import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { ESQUEMA_CLARO, ESQUEMA_OSCURO } from '../theme/esquemas.ts';
import { LIENZO_DE_IMAGEN } from '../theme/primitives.ts';
import {
  ACCESOS_RAPIDOS,
  REJILLA_DEL_INICIO,
  SERVICIO_DESTACADO,
  SERVICIOS_DE_INICIO
} from '../preview/fixtures.ts';
import { DESTINO_DE_SERVICIO } from '../navegacion/rutas.ts';

/**
 * El inicio de la pasajera según la referencia visual del dueño.
 *
 * Lo que aquí se custodia no es un dibujo: son las decisiones que, al
 * romperse, no dan ningún error. Que el texto sobre una fotografía tenga su
 * propio token en vez de un blanco a mano; que la rejilla enseñe exactamente
 * los siete servicios de la referencia y diga cuáles no existen; que el saldo
 * no invente una cifra; que las piezas nuevas no fijen tintas que en el modo
 * día desaparecen.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

// ---------------------------------------------------------------------------
// La tinta sobre imagen
// ---------------------------------------------------------------------------

/** Luminancia relativa (WCAG), para medir y no opinar. */
function luminancia(hex) {
  const canal = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * canal(((n >> 16) & 255) / 255)
    + 0.7152 * canal(((n >> 8) & 255) / 255)
    + 0.0722 * canal((n & 255) / 255);
}
const contraste = (a, b) => {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (bajo + 0.05);
};

/** Compone `rgba(r, g, b, a)` sobre un fondo `#rrggbb` y devuelve `#rrggbb`. */
function componer(fondoHex, rgba) {
  const [r, g, b, a] = rgba.match(/[\d.]+/g).map(Number);
  const n = parseInt(fondoHex.slice(1, 7), 16);
  const fondo = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mezcla = [r, g, b].map((c, i) => Math.round(c * a + fondo[i] * (1 - a)));
  return '#' + mezcla.map(c => c.toString(16).padStart(2, '0')).join('');
}

// El velo REAL que va sobre las fotografías del inicio (hero y promociones):
// el grafito del lienzo con la capa baja encima, compuestos desde los mismos
// valores que usan las piezas. Es el peor caso: donde el texto se escribe.
const VELO_SOBRE_FOTO = componer(LIENZO_DE_IMAGEN.fondo, LIENZO_DE_IMAGEN.veloBajo);

test('los dos esquemas declaran la tinta sobre imagen, y se lee sobre el velo', () => {
  for (const [nombre, esquema] of [['claro', ESQUEMA_CLARO], ['oscuro', ESQUEMA_OSCURO]]) {
    assert.equal(typeof esquema.sobreImagen, 'string', `${nombre}: falta sobreImagen`);
    const relacion = contraste(esquema.sobreImagen, VELO_SOBRE_FOTO);
    assert.ok(relacion >= 4.5, `${nombre}: sobreImagen da ${relacion.toFixed(2)}:1 sobre el velo`);
    // Y el amarillo como texto, que de día no vale sobre marfil, sobre el velo sí.
    assert.equal(typeof esquema.acentoSobreImagen, 'string', `${nombre}: falta acentoSobreImagen`);
    const amarillo = contraste(esquema.acentoSobreImagen, VELO_SOBRE_FOTO);
    assert.ok(amarillo >= 4.5, `${nombre}: acentoSobreImagen da ${amarillo.toFixed(2)}:1 sobre el velo`);
  }
});

test('la etiqueta verde de las promociones se lee en los dos esquemas', () => {
  // El verde de éxito es oscuro de día y claro de noche, así que la tinta
  // cambia con el esquema: clara sobre el verde oscuro, oscura sobre el claro.
  const dia = contraste(ESQUEMA_CLARO.sobreImagen, ESQUEMA_CLARO.exito);
  assert.ok(dia >= 4.5, `día: tinta clara sobre éxito da ${dia.toFixed(2)}:1`);
  const noche = contraste(ESQUEMA_OSCURO.sobreAcento, ESQUEMA_OSCURO.exito);
  assert.ok(noche >= 4.5, `noche: tinta oscura sobre éxito da ${noche.toFixed(2)}:1`);
  const fuente = despojarComentarios(leer('ui/PromocionesDelInicio.tsx'));
  assert.match(fuente, /esquema === 'claro' \? tema\.color\.sobreImagen : tema\.color\.sobreAcento/, 'la etiqueta no elige la tinta por esquema');
});

// ---------------------------------------------------------------------------
// Los datos de la referencia
// ---------------------------------------------------------------------------

test('la rejilla del inicio enseña los siete servicios de la referencia, en su orden', () => {
  const titulos = REJILLA_DEL_INICIO.map(clave => SERVICIOS_DE_INICIO.find(s => s.clave === clave)?.titulo);
  assert.deepEqual(titulos, ['Moto', 'Delivery', 'Comida', 'Envíos', 'Mercado', 'Comercios', 'Compra y venta']);
});

test('Transporte Seguro no está en la rejilla del inicio, pero sigue existiendo', () => {
  // La referencia no lo lleva. Tiene pestaña propia en la barra y sigue en la
  // hoja «¿Qué necesitas hoy?»: no se pierde, se saca de la rejilla.
  assert.ok(!REJILLA_DEL_INICIO.includes('seguro'));
  assert.ok(SERVICIOS_DE_INICIO.some(s => s.clave === 'seguro' && s.listo));
});

test('lo que la referencia promete y no existe lleva a «pronto»', () => {
  assert.equal(DESTINO_DE_SERVICIO.delivery, 'pronto');
  assert.equal(DESTINO_DE_SERVICIO[SERVICIO_DESTACADO.clave], 'pronto');
  assert.equal(SERVICIO_DESTACADO.listo, false);
  assert.equal(SERVICIO_DESTACADO.titulo, '+58Moto Plus');
});

test('los accesos rápidos son los cuatro de la referencia', () => {
  assert.deepEqual(ACCESOS_RAPIDOS.map(a => a.nombre), ['Casa', 'Trabajo', 'Lugares favoritos', 'Recientes']);
});

// ---------------------------------------------------------------------------
// La familia de iconos
// ---------------------------------------------------------------------------

test('la familia de iconos tiene lo que el inicio nuevo necesita', () => {
  // Se lee el fuente y no se importa: `Icono.tsx` lleva JSX y el resolver de
  // pruebas no lo carga. Es lo mismo que hacen el resto de custodias.
  const fuente = leer('ui/Icono.tsx');
  const lista = fuente.slice(fuente.indexOf('export const NOMBRES_DE_ICONO'), fuente.indexOf('] as const;'));
  for (const nombre of ['chevron-derecha', 'ubicacion', 'corona', 'billetera', 'estrella', 'reloj']) {
    assert.ok(lista.includes(`'${nombre}'`), `falta el icono «${nombre}»`);
    assert.ok(fuente.includes(`case '${nombre}'`), `«${nombre}» está en la lista pero no se dibuja`);
  }
});

// ---------------------------------------------------------------------------
// Las piezas nuevas del inicio
// ---------------------------------------------------------------------------

const PIEZAS_NUEVAS = [
  'ui/TarjetaDeSaldo.tsx',
  'ui/AccesosRapidos.tsx',
  'ui/CabeceraDeSeccion.tsx',
  'ui/PromocionesDelInicio.tsx',
  'ui/RejillaDeServicios.tsx'
];

test('las piezas nuevas del inicio tampoco fijan ninguna tinta a mano', () => {
  // La misma guarda que `inicioPasajera.test.mjs` pone a las tres piezas
  // comerciales de antes: una tinta escrita a mano no sabe si es de día.
  for (const pieza of PIEZAS_NUEVAS) {
    assert.ok(fs.existsSync(path.join(raizMovil, pieza)), `falta la pieza ${pieza}`);
    const codigo = despojarComentarios(leer(pieza));
    assert.deepEqual(codigo.match(/color:\s*'#[0-9a-fA-F]{3,8}'/g) ?? [], [], `${pieza} escribe la tinta a mano`);
    assert.ok(!/rgba\(\s*255\s*,\s*255\s*,\s*255/.test(codigo), `${pieza} usa blanco con alfa`);
    assert.ok(!/color:\s*tema\.color\.acento\b/.test(codigo), `${pieza} escribe con tema.color.acento`);
  }
});

test('las secciones del inicio comparten una sola cabecera', () => {
  const fuente = despojarComentarios(leer('ui/CabeceraDeSeccion.tsx'));
  assert.match(fuente, /export function CabeceraDeSeccion/);
  assert.match(fuente, /nivel="encabezado"/, 'el título va en el nivel de encabezado');
  assert.match(fuente, /nombre="chevron-derecha"/, 'la acción lleva su chevron');
  assert.match(fuente, /accessibilityRole="header"/);
});

test('el saldo no inventa una cifra cuando no la hay', () => {
  const fuente = despojarComentarios(leer('ui/TarjetaDeSaldo.tsx'));
  assert.match(fuente, /saldo === null/, 'sin saldo real la píldora tiene que decir otra cosa, no un cero');
  assert.match(fuente, /nombre="billetera"/);
  assert.match(fuente, /export function BotonDeUbicacion/);
  assert.match(fuente, /nombre="ubicacion"/);
});

test('los accesos rápidos son chips, todos con nombre accesible', () => {
  const fuente = despojarComentarios(leer('ui/AccesosRapidos.tsx'));
  assert.match(fuente, /borderRadius: tema\.radio\.pildora/);
  assert.match(fuente, /accessibilityRole="button"/);
  assert.match(fuente, /accessibilityLabel=\{acceso\.nombre\}/);
});

// ---------------------------------------------------------------------------
// Las secciones comerciales
// ---------------------------------------------------------------------------

test('el hero es una pieza publicitaria con imagen, titular destacado, CTA y puntos', () => {
  const fuente = despojarComentarios(leer('ui/PromoCarousel.tsx'));
  assert.match(fuente, /tema\.color\.sobreImagen/, 'el texto sobre la foto sale del token');
  assert.match(fuente, /tituloDestacado/, 'falta la palabra en amarillo del titular');
  assert.match(fuente, /VEHICULOS\.MOTO\.tarjeta/, 'sin foto, la composición de marca lleva la moto real');
  assert.match(fuente, /title: 'Más que un destino,'/);
  assert.match(fuente, /tituloDestacado: 'es tu ciudad'/);
  assert.match(fuente, /ctaLabel: 'Descubre \+58Express'/);
  assert.match(fuente, /tag: 'Venezuela se mueve contigo'/);
  assert.ok((fuente.match(/active: true/g) ?? []).length >= 3, 'la referencia enseña tres puntos');
});

test('los aliados son los de la referencia, en discos, con hueco para el logotipo', () => {
  const fuente = despojarComentarios(leer('ui/CommercialPartners.tsx'));
  for (const nombre of ['McDonald’s', 'Farmatodo', 'Automercado', 'Café Amanecer', 'Yummy', 'MultiMax']) {
    assert.ok(fuente.includes(`name: '${nombre}'`), `falta el aliado «${nombre}»`);
  }
  assert.match(fuente, /aliado\.logo !== undefined/, 'cuando haya logotipo se pinta; mientras, el monograma');
  assert.match(fuente, /<CabeceraDeSeccion/);
  assert.match(fuente, /borderRadius: DIAMETRO \/ 2/);
});

test('las promociones son las tres de la referencia, con foto y palabra destacada', () => {
  const fuente = despojarComentarios(leer('ui/PromocionesDelInicio.tsx'));
  for (const etiqueta of ['HASTA 30% OFF', 'VIAJA SEGURO', 'TU MERCADO EN MINUTOS']) {
    assert.ok(fuente.includes(`etiqueta: '${etiqueta}'`), `falta la promoción «${etiqueta}»`);
  }
  assert.match(fuente, /tituloDestacado: '20% OFF'/);
  assert.match(fuente, /tema\.color\.sobreImagen/);
  assert.match(fuente, /<CabeceraDeSeccion/);
  assert.match(fuente, /nombre="chevron-derecha"/);
  // Ilustraciones cuadradas, no los banners apaisados: en una tarjeta vertical
  // el recorte de aquéllos se quedaba con el fondo negro y el arte desaparecía.
  assert.doesNotMatch(fuente, /ARTE_DE_ALIADO/, 'los banners apaisados no valen para una tarjeta vertical');
  assert.match(fuente, /ajuste === 'contener'/, 'una ilustración se contiene; una foto se cubre');
  // Un punto por tarjeta y el índice con el mismo paso que el snap: contar
  // «pantallas» dejaba el último punto apagado para siempre.
  assert.match(fuente, /promociones\.map\(\(_, i\)/, 'los puntos no van uno por tarjeta');
  assert.match(fuente, /contentOffset\.x \/ \(ANCHO \+ HUECO\)/, 'el índice del punto no usa el paso del snap');
  // El lienzo es el compartido, no una copia.
  assert.match(fuente, /LIENZO_DE_IMAGEN/);
  assert.match(despojarComentarios(leer('ui/PromoCarousel.tsx')), /LIENZO_DE_IMAGEN/);
});

test('Txt reenvía al texto nativo las props que sus usos llevan años pasándole', () => {
  // `numberOfLines`, `adjustsFontSizeToFit`, `minimumFontScale` y
  // `accessibilityRole` se destructuraban y se perdían: treinta y tres usos de
  // `numberOfLines` en la aplicación no hacían nada, y un arreglo de la
  // rejilla del inicio que dependía de ellos fue un no-op hasta que se vio.
  const fuente = despojarComentarios(leer('ui/componentes.tsx'));
  for (const prop of ['numberOfLines', 'adjustsFontSizeToFit', 'minimumFontScale', 'accessibilityRole']) {
    assert.match(fuente, new RegExp(`${prop}=\\{${prop}\\}`), `Txt no reenvía ${prop}`);
  }
});

test('la rejilla del inicio es de cuatro columnas, con ilustración, y dice lo que no está', () => {
  const fuente = despojarComentarios(leer('ui/RejillaDeServicios.tsx'));
  assert.match(fuente, /COLUMNAS = 4/);
  assert.match(fuente, /ARTE_DE_SERVICIO\[dato\.arte\]/, 'las casillas usan las ilustraciones encargadas');
  assert.match(fuente, /arte === undefined/, 'sin ilustración cae al icono, no a un hueco');
  assert.match(fuente, /accessibilityState=\{\{ disabled: !dato\.listo \}\}/);
  assert.match(fuente, /PRONTO/, 'lo pendiente lo dice, aunque sea en pequeño');
  assert.match(fuente, /export function ServicioDestacado/);
  assert.match(fuente, /nombre="corona"/);
  assert.match(fuente, /VEHICULOS\.MOTO\.tarjeta/, 'la tarjeta destacada lleva la moto real');
});

test('la superficie comercial compone las cinco secciones de la referencia, en orden', () => {
  const fuente = despojarComentarios(leer('ui/PassengerHomeCommercial.tsx'));
  const orden = ['{encabezado}', '<PromoCarousel', '<CommercialPartners', '<PromocionesDelInicio', '<RejillaDeServicios'];
  const posiciones = orden.map(marca => fuente.indexOf(marca));
  assert.ok(posiciones.every(p => p >= 0), `falta alguna sección: ${orden.filter((_, i) => posiciones[i] < 0).join(', ')}`);
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, 'las secciones no van en el orden de la referencia');
  assert.doesNotMatch(fuente, /Recarga tu saldo sin comisiones/, 'las tarjetas de promoción antiguas se fueron');
});

// ---------------------------------------------------------------------------
// La pantalla
// ---------------------------------------------------------------------------

test('el inicio conserva su top bar y monta el bloque utilitario debajo, en orden', () => {
  const fuente = despojarComentarios(leer('preview/pantallaInicioPasajera.tsx'));
  // La cabecera no se toca: mismo componente, mismos datos.
  assert.match(fuente, /<Cabecera datos=\{datos\} \/>/);
  const bloque = fuente.slice(fuente.indexOf('const encabezado ='), fuente.indexOf('<PassengerHomeCommercial'));
  const orden = ['<TarjetaDeSaldo', '<BotonDeUbicacion', "<CampoDeDestino onPress={() => ir('buscar-destino')} />", '<AccesosRapidos'];
  const posiciones = orden.map(marca => bloque.indexOf(marca));
  assert.ok(posiciones.every(p => p >= 0), 'falta alguna pieza del bloque utilitario');
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones);
  assert.match(fuente, /saldo: SaldoDelInicio \| null/);
  assert.match(fuente, /onPress=\{\(\) => ir\('saldo'\)\}/);
  // La app real no inventa un saldo.
  assert.match(despojarComentarios(leer('app/pasajero.tsx')), /saldo: null/);
});
