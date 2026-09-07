import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { detalleDeViaje, HISTORIAL_DEMO } from '../preview/fixtures.ts';

/**
 * El registro de un viaje.
 *
 * QUÉ SE PROTEGE AQUÍ
 *
 * El historial no se abre para acordarse: se abre para RECLAMAR. Lo que hace
 * útil esta pantalla es que guarde lo suficiente para resolver un reclamo sin
 * la palabra de nadie —las horas, quién conducía, cuánto se cobró y lo que se
 * habló—, y eso se pierde en silencio: si mañana alguien recorta la
 * conversación o quita las horas, la pantalla sigue viéndose bien y sólo se
 * nota el día que hay una queja.
 *
 * También se protege lo que NO se puede prometer: el plazo de conservación no
 * está decidido, y lo honesto es decir eso y no inventar un número.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

const DETALLE = 'preview/pantallaDetalleDeViaje.tsx';
const HISTORIAL = 'preview/pantallasC2Secciones.tsx';

// ---------------------------------------------------------------------------
// La puerta
// ---------------------------------------------------------------------------

test('cada viaje del historial lleva a su registro, y lo DICE', () => {
  // Que la fila entera sea pulsable no se ve. Quien viene a reclamar está
  // buscando dónde se mira lo que pasó, no tanteando filas a ver cuál abre.
  const historial = leer(HISTORIAL);
  const seccion = historial.slice(historial.indexOf('export function C2Historial'));

  // El destino pasó a ser un manejador con respaldo: la aplicación real le
  // pasa el suyo —que abre la ruta con el identificador de VERDAD— y el
  // recorrido de diseño cae en el de siempre. Lo que se protege es lo mismo:
  // que la fila abra el registro de ESE viaje.
  assert.match(seccion, /onPress=\{\(\) => abrir\(viaje\.clave\)\}/, 'la fila no abre el registro');
  assert.match(
    seccion,
    /onViaje \?\? \(\(clave: string\) => ir\('viaje-detalle', \{ viaje: clave \}\)\)/,
    'el recorrido de diseño se quedó sin destino'
  );
  assert.match(seccion, /Ver detalle/, 'no hay nada que anuncie el registro');
});

test('el registro se abre para TODOS los viajes, no sólo los completados', () => {
  // Un viaje cancelado es el que más reclamos genera: me cobraron una
  // cancelación, el conductor no apareció, canceló él y sale como que canceló
  // yo. Dejarlo sin registro sería dejar sin pruebas justo el caso que las
  // necesita.
  for (const viaje of HISTORIAL_DEMO) {
    const dato = detalleDeViaje(viaje.clave);
    assert.equal(dato.clave, viaje.clave, `«${viaje.clave}» no tiene registro propio`);
    assert.ok(dato.conversacion.length > 0, `«${viaje.clave}» no guarda conversación`);
    assert.ok(dato.hitos.length > 0, `«${viaje.clave}» no guarda cronología`);
  }
});

test('la clave del detalle tiene ruta y pantalla', () => {
  const rutas = leer('navegacion/rutas.ts');
  assert.match(rutas, /'viaje-detalle': `\$\{RAIZ\}\/viaje-detalle`/, 'la clave no tiene ruta');
  assert.ok(
    fs.existsSync(path.join(raizMovil, 'app/diseno/viaje-detalle.tsx')),
    'la ruta no tiene fichero'
  );
});

test('el detalle sabe DE CUÁL viaje habla', () => {
  // Sin el parámetro enseñaría siempre el mismo registro, y una pantalla que
  // enseña siempre lo mismo no es un detalle: es un ejemplo.
  assert.match(leer('app/diseno/viaje-detalle.tsx'), /useLocalSearchParams/);
  assert.match(leer('app/diseno/_layout.tsx'), /URLSearchParams/, 'los parámetros no viajan en la ruta');
});

// ---------------------------------------------------------------------------
// Lo que el registro tiene que guardar
// ---------------------------------------------------------------------------

test('el registro guarda las HORAS de cada paso', () => {
  // Casi todos los reclamos son sobre tiempos: no llegó, tardó, me cobraron la
  // espera. Sin la hora de cada paso no hay nada que comprobar.
  const dato = detalleDeViaje('h1');
  const pasos = dato.hitos.filter(hito => hito.ocurrido);

  assert.ok(pasos.length >= 4, `sólo se guardan ${pasos.length} pasos`);
  for (const hito of pasos) {
    assert.match(hito.hora, /^\d{2}:\d{2}$/, `«${hito.titulo}» no guarda hora`);
  }

  // Y los dos que el dueño pidió por su nombre.
  const titulos = dato.hitos.map(hito => hito.titulo).join(' · ');
  assert.match(titulos, /punto de recogida/i, 'no consta cuándo llegó el motorizado');
  assert.match(titulos, /Llegó al destino/i, 'no consta cuándo se llegó al destino');
});

test('un paso que NO ocurrió se guarda como no ocurrido, no desaparece', () => {
  // Que falte un paso dice tanto como que esté. Borrarlo del registro deja la
  // cronología cuadrada y sin la información que importa.
  const dato = detalleDeViaje('h3');
  const pendientes = dato.hitos.filter(hito => !hito.ocurrido);

  assert.ok(pendientes.length > 0, 'el viaje cancelado no conserva los pasos que no ocurrieron');
  for (const hito of pendientes) {
    assert.equal(hito.hora, '', `«${hito.titulo}» tiene hora de algo que no pasó`);
  }
});

test('el registro guarda quién conducía y con qué', () => {
  const dato = detalleDeViaje('h1');
  for (const campo of ['nombre', 'vehiculo', 'placa']) {
    assert.ok(dato.conductor[campo].length > 0, `no se guarda ${campo}`);
  }
  // Y sigue siendo obviamente de ejemplo: una placa con pinta de real en una
  // captura es la matrícula de alguien.
  assert.match(dato.conductor.placa, /^AA000AA$/, 'la placa parece real');
});

test('la cronología cuenta quién pidió el viaje sin atribuírselo a quien lo condujo', () => {
  // «Pediste el viaje» es cierto para quien lo pidió. Al conductor le decía
  // que lo había pedido él, cuando lo único que hizo fue aceptarlo.
  const pantalla = leer('app/viaje/[id].tsx');
  assert.match(pantalla, /titulo: 'Pediste el viaje', tituloParaElConductor: 'La pasajera solicitó el viaje'/);
  // Elige el MISMO `soyPasajera` que decide la contraparte: una sola fuente de
  // rol, sin una segunda detección que pueda discrepar.
  assert.match(
    pantalla,
    /titulo: !soyPasajera && 'tituloParaElConductor' in paso \? paso\.tituloParaElConductor : paso\.titulo/
  );
});

test('los demás hitos siguen siendo hechos, iguales para los dos', () => {
  // El conductor asignado es el mismo para ambos, y llegó / empezó / llegó al
  // destino son hechos, no perspectivas: no llevan alternativa, y que no la
  // lleven es la afirmación.
  const pantalla = leer('app/viaje/[id].tsx');
  const tabla = pantalla.slice(pantalla.indexOf('const PASOS = ['), pantalla.indexOf('] as const;'));
  for (const titulo of ['Conductor asignado', 'Llegó al punto de recogida', 'Empezó el viaje', 'Llegó al destino']) {
    assert.ok(tabla.includes(`titulo: '${titulo}' }`), `${titulo} cambió de forma`);
  }
  assert.equal(
    (tabla.match(/tituloParaElConductor/g) ?? []).length,
    1,
    'sólo el primer hito se cuenta distinto según quién mire'
  );
});

test('la contraparte se llama por su nombre, según quién mire el viaje', () => {
  // El dato ya era correcto --al conductor se le pone su pasajera-- pero los
  // rótulos seguían siendo los de la pasajera, así que al conductor se le
  // informaba de que su pasajera le había llevado a él.
  const superficie = leer(DETALLE);
  assert.match(superficie, /perspectiva === 'conductor' \? 'A quién llevaste' : 'Quién te llevó'/);
  assert.match(superficie, /perspectiva === 'conductor' \? 'Pasajera' : 'Conductor'/);

  // Y la perspectiva sale del rol de la SESIÓN, el mismo que decide el dato:
  // ni de la ruta, ni de un parámetro, ni de un valor por omisión escondido.
  const pantalla = leer('app/viaje/[id].tsx');
  assert.match(pantalla, /perspectiva=\{soyPasajera \? 'pasajera' : 'conductor'\}/);
  assert.match(pantalla, /const soyPasajera = sesion\.usuario\.role !== 'driver';/);
});

test('a quien no tiene vehículo no se le pinta una fila de vehículo vacía', () => {
  // La contraparte del conductor es una persona, no una moto: `vehiculo` y
  // `placa` llegan vacíos. La placa ya tenía su guarda; el vehículo no, y se
  // veía el rótulo suelto sin valor debajo.
  const superficie = leer(DETALLE);
  for (const campo of ['vehiculo', 'placa']) {
    assert.match(
      superficie,
      new RegExp(`dato\\.conductor\\.${campo} !== '' \\?`),
      `la fila de ${campo} se pinta aunque no haya nada que poner`
    );
  }
});

test('el registro guarda el cobro, y sigue sin inventar importes', () => {
  // La tarifa la calcula el servidor con su configuración y la tasa del BCV.
  // Una cifra creíble en una maqueta es la forma más fácil de que alguien la
  // tome por real.
  for (const viaje of HISTORIAL_DEMO) {
    const dato = detalleDeViaje(viaje.clave);
    assert.ok(dato.cobro.metodo.length > 0, 'no consta cómo se pagó');
    for (const importe of [dato.cobro.total, ...dato.cobro.desglose.map(l => l.importe)]) {
      assert.match(importe, /^\$0[.,]00$/, `${importe} se lee como una tarifa real`);
    }
  }
  assert.match(leer(DETALLE), /Los importes los calcula el servidor/);
});

// ---------------------------------------------------------------------------
// La conversación
// ---------------------------------------------------------------------------

test('la conversación se archiva ENTERA, con sus adjuntos', () => {
  // Una foto del portón o del recibo es justo la clase de prueba que decide un
  // reclamo. Perderla porque «era sólo una imagen» sería perder lo único que
  // sirve.
  const dato = detalleDeViaje('h1');

  const autores = new Set(dato.conversacion.map(mensaje => mensaje.autor));
  assert.ok(autores.has('pasajera') && autores.has('conductor'), 'la conversación no guarda los dos lados');

  for (const mensaje of dato.conversacion) {
    assert.match(mensaje.hora, /^\d{2}:\d{2}$/, 'un mensaje sin hora no sirve para reclamar');
    assert.ok(
      mensaje.texto !== undefined || mensaje.adjunto !== undefined,
      'un mensaje sin contenido'
    );
  }

  assert.ok(
    dato.conversacion.some(mensaje => mensaje.adjunto !== undefined),
    'no se guarda ningún adjunto'
  );
  assert.match(leer(DETALLE), /function Adjunto/, 'la pantalla no pinta los adjuntos');
});

test('la pantalla dice QUIÉN MÁS puede leer la conversación', () => {
  // Quien lee lo que escribió merece saberlo ahí mismo, no en una pantalla de
  // condiciones que nadie abre.
  const detalle = leer(DETALLE);
  assert.match(detalle, /CONSERVACION_DEMO\.aviso/);
  assert.match(leer('preview/fixtures.ts'), /Soporte puede leerla si abres un reclamo/);
});

test('el plazo de conservación NO se inventa mientras no esté decidido', () => {
  // Es una promesa sobre datos personales, y de las que las tiendas de
  // aplicaciones piden por escrito. Un «12 meses» de relleno sería peor que no
  // decir nada.
  const fixtures = leer('preview/fixtures.ts');
  const bloque = fixtures.slice(fixtures.indexOf('CONSERVACION_DEMO'));

  assert.match(bloque, /por definir/i, 'el plazo dejó de anunciarse como pendiente');
  assert.doesNotMatch(
    bloque.slice(0, bloque.indexOf('} as const')),
    /\d+\s*(meses|años|días)/i,
    'hay un plazo inventado en pantalla'
  );
});

// ---------------------------------------------------------------------------
// Soporte
// ---------------------------------------------------------------------------

test('el registro trae la referencia que soporte necesita', () => {
  // Sin ella, un reclamo empieza por «¿cuál de todos?».
  for (const viaje of HISTORIAL_DEMO) {
    assert.match(
      detalleDeViaje(viaje.clave).referencia,
      /^VJ-DEMO-\d{4}$/,
      `«${viaje.clave}» no tiene referencia de ejemplo`
    );
  }
  assert.match(leer(DETALLE), /Referencia \$\{dato\.referencia\}/, 'la referencia no se enseña');
});

test('el detalle no llama a NINGUNA API', () => {
  // La misma condición que el resto del recorrido: se abre sin servidor.
  const codigo = leer(DETALLE);
  for (const prohibido of ['fetch(', 'services/', 'SecureStore', 'XMLHttpRequest']) {
    assert.ok(!codigo.includes(prohibido), `el detalle usa ${prohibido}`);
  }
});
