import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { leerRuta, tramoDelEstado } from '../domain/rutaDelViaje.ts';
import {
  CADUCIDAD_MS,
  ESPERA_MINIMA_MS,
  UMBRAL_DE_RECALCULO_METROS,
  estadoDeLaRuta,
  metrosEntre,
  puntosParaElMapa,
  tocaPedirRuta
} from '../domain/rutaEnPantalla.ts';

/**
 * LA RUTA EN PANTALLA (ROUTE-1)
 *
 * Lo que se protege aquí es que el teléfono NO decida por dónde va la ruta, y
 * que no pida una nueva cada vez que el GPS respira.
 *
 * Las dos cosas fallan en silencio. Una ruta inventada se dibuja igual de bien
 * que una de verdad —y manda a alguien por una calle que puede no existir—, y
 * un ritmo de peticiones descontrolado no rompe nada: sólo llega la factura de
 * Google a final de mes.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

const MOTO = { lat: 10.66, lng: -71.61 };
const RECOGIDA = { lat: 10.6667, lng: -71.6167 };
const DESTINO = { lat: 10.68, lng: -71.63 };

const rutaVigente = (extra = {}) => ({
  tramo: 'A_RECOGIDA',
  puntos: [MOTO, RECOGIDA],
  desde: MOTO,
  pedidaEn: 1_000_000,
  ...extra
});

// ---------------------------------------------------------------------------
// Qué tramo toca en cada momento
// ---------------------------------------------------------------------------

test('el tramo sale del estado del viaje, con sus alias', () => {
  // El espejo del servidor. Sirve para no llamar en los estados que no tienen
  // ruta; quien manda sigue siendo el `leg` que responde el servidor.
  for (const estado of ['DRIVER_ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'DRIVER_ARRIVING']) {
    assert.equal(tramoDelEstado(estado), 'A_RECOGIDA', estado);
  }
  for (const estado of ['IN_PROGRESS', 'IN_TRIP']) {
    assert.equal(tramoDelEstado(estado), 'A_DESTINO', estado);
  }
});

test('al llegar y al terminar NO hay tramo, así que no se llama', () => {
  // Al llegar, la moto está en la puerta: la ruta a la recogida ya no significa
  // nada y la del destino no ha empezado. Terminado, una ruta en pantalla haría
  // creer que el viaje sigue vivo.
  for (const estado of ['ARRIVED', 'COMPLETED', 'CANCELLED', 'SEARCHING', '']) {
    assert.equal(tramoDelEstado(estado), null, estado);
    assert.equal(tocaPedirRuta(rutaVigente(), null, MOTO, 2_000_000), false, estado);
  }
});

// ---------------------------------------------------------------------------
// Cuándo se vuelve a pedir
// ---------------------------------------------------------------------------

test('sin ruta vigente se pide, y con una fresca no', () => {
  assert.equal(tocaPedirRuta(null, 'A_RECOGIDA', MOTO, 1_000_000), true);
  // Recién pedida: el freno de tiempo lo impide aunque la moto se haya movido.
  const lejos = { lat: MOTO.lat + 0.01, lng: MOTO.lng };
  assert.equal(tocaPedirRuta(rutaVigente(), 'A_RECOGIDA', lejos, 1_000_000 + 1_000), false);
});

test('moverse poco NO dispara una petición', () => {
  // El GPS llega cada pocos segundos. Mientras la moto avanza POR la ruta que
  // ya tiene, esa ruta sigue siendo correcta: lo que sobra es el trozo ya
  // recorrido, y ese se ve igual con el marcador encima.
  const apenas = { lat: MOTO.lat + 0.0002, lng: MOTO.lng };
  assert.ok(metrosEntre(MOTO, apenas) < UMBRAL_DE_RECALCULO_METROS);
  const luego = 1_000_000 + ESPERA_MINIMA_MS + 1;
  assert.equal(tocaPedirRuta(rutaVigente(), 'A_RECOGIDA', apenas, luego), false);
});

test('desviarse de verdad SÍ dispara una petición', () => {
  const lejos = { lat: MOTO.lat + 0.005, lng: MOTO.lng };
  assert.ok(metrosEntre(MOTO, lejos) > UMBRAL_DE_RECALCULO_METROS);
  const luego = 1_000_000 + ESPERA_MINIMA_MS + 1;
  assert.equal(tocaPedirRuta(rutaVigente(), 'A_RECOGIDA', lejos, luego), true);
});

test('cambiar de tramo pide ruta aunque la moto no se haya movido', () => {
  // Al pulsar INICIAR el conductor sigue en el mismo sitio, pero lo que hay que
  // dibujar es otra cosa por completo. Manda sobre el freno de tiempo.
  assert.equal(tocaPedirRuta(rutaVigente(), 'A_DESTINO', MOTO, 1_000_000 + 500), true);
});

test('sin posición de la moto no se insiste', () => {
  // No hay forma de saber si se desvió, así que no hay motivo para volver a
  // preguntar lo mismo.
  const luego = 1_000_000 + ESPERA_MINIMA_MS + 1;
  assert.equal(tocaPedirRuta(rutaVigente(), 'A_RECOGIDA', null, luego), false);
});

// ---------------------------------------------------------------------------
// Qué se enseña mientras tanto
// ---------------------------------------------------------------------------

test('sin red se conserva la ruta anterior', () => {
  // Una pantalla que se queda en blanco en cada bache de cobertura es peor que
  // una ruta con unos segundos de retraso.
  const estado = estadoDeLaRuta(rutaVigente(), null, 1_000_001);
  assert.equal(estado.clase, 'TRAZADA');
  assert.deepEqual(estado.ruta.puntos, [MOTO, RECOGIDA]);
  assert.equal(estado.vieja, false);
});

test('una ruta vieja se marca, pero NO se borra', () => {
  const estado = estadoDeLaRuta(rutaVigente(), null, 1_000_000 + CADUCIDAD_MS + 1);
  assert.equal(estado.clase, 'TRAZADA');
  assert.equal(estado.vieja, true, 'no avisó de que la ruta ya no es fresca');
});

test('si el servidor dice que no hay ruta, se retira', () => {
  // Es la diferencia con el caso sin red: aquí SÍ se sabe algo nuevo.
  const estado = estadoDeLaRuta(
    rutaVigente(),
    { disponible: false, motivo: 'NO_ROUTE_FOR_STATE', tramo: null },
    1_000_001
  );
  assert.equal(estado.clase, 'SIN_RUTA');
  assert.equal(estado.motivo, 'NO_ROUTE_FOR_STATE');
  assert.deepEqual(puntosParaElMapa(estado), [], 'quedó línea después del estado terminal');
});

test('mientras se refresca sigue dibujada la anterior', () => {
  // REFRESCANDO no es «sin ruta»: la pantalla no parpadea en cada esquina.
  const estado = estadoDeLaRuta(rutaVigente(), null, 1_000_001, true);
  assert.equal(estado.clase, 'REFRESCANDO');
  assert.equal(puntosParaElMapa(estado).length, 2);
});

// ---------------------------------------------------------------------------
// Lo que llega del servidor
// ---------------------------------------------------------------------------

test('una ruta del servidor se lee entera', () => {
  const leida = leerRuta({
    available: true,
    leg: 'A_DESTINO',
    points: [MOTO, RECOGIDA, DESTINO],
    distanceMeters: 2400,
    durationMillis: 480000
  });
  assert.equal(leida.disponible, true);
  assert.equal(leida.tramo, 'A_DESTINO');
  assert.equal(leida.puntos.length, 3);
  assert.equal(leida.metros, 2400);
  assert.equal(leida.duracionMs, 480000);
});

test('menos de dos puntos NO es una ruta', () => {
  // Publicar un punto suelto pintaría una mancha donde debería haber recorrido.
  const leida = leerRuta({ available: true, leg: 'A_DESTINO', points: [MOTO] });
  assert.equal(leida.disponible, false);
});

test('el motivo del servidor se conserva sin traducir', () => {
  // La pantalla necesita distinguir «todavía no toca» de «no hay proveedor»:
  // una es normal y la otra es una carencia que hay que poder ver.
  for (const motivo of ['NO_ROUTE_FOR_STATE', 'ROUTE_PROVIDER_NOT_CONFIGURED', 'ROUTE_PROVIDER_UNAVAILABLE']) {
    assert.equal(leerRuta({ available: false, reason: motivo }).motivo, motivo);
  }
});

test('un cuerpo ilegible se lee como «no hay ruta», nunca como media ruta', () => {
  // Media geometría dibuja una línea que se corta en el aire.
  for (const basura of [null, undefined, 42, 'texto', {}, { available: true }]) {
    assert.equal(leerRuta(basura).disponible, false, String(basura));
  }
});

test('las métricas del proveedor no se inventan cuando no vienen', () => {
  // NO_FAKE_ETA: sin número del servidor, `null`, y la pantalla no lo enseña.
  const leida = leerRuta({ available: true, leg: 'A_RECOGIDA', points: [MOTO, RECOGIDA] });
  assert.equal(leida.metros, null);
  assert.equal(leida.duracionMs, null);
});

// ---------------------------------------------------------------------------
// La regla de oro
// ---------------------------------------------------------------------------

test('el cliente NO manda origen, destino ni posición al pedir la ruta', () => {
  // El servidor es la autoridad: decide el tramo y traza la línea. Si el
  // teléfono empezara a mandar coordenadas, podría dibujar la ruta que
  // quisiera — y ésa es justo la puerta que esta fase cierra.
  const servicio = sinComentarios('services/ruta.ts');
  assert.match(servicio, /\/api\/trips\/\$\{encodeURIComponent\(viajeId\)\}\/route/);
  assert.equal(/body:/.test(servicio), false, 'el cliente manda cuerpo en la petición de ruta');
  assert.equal(/lat:|lng:/.test(servicio.split('export function leerRuta')[0]), false,
    'el cliente manda coordenadas al pedir la ruta');
});

test('ninguna pieza del móvil fabrica geometría', () => {
  // Ni interpolación, ni recta entre extremos, ni geodésica dibujada. La única
  // haversine que hay es la del umbral de recálculo, que compara distancias y
  // no produce ni un punto de la línea.
  for (const pieza of ['services/ruta.ts', 'realtime/rutaDelViaje.ts', 'domain/mapaDelViaje.ts']) {
    const codigo = sinComentarios(pieza);
    for (const inventado of ['interpolar', 'lineaRecta', 'geodesic', 'bezier']) {
      assert.equal(codigo.includes(inventado), false, `${pieza} fabrica ruta con ${inventado}`);
    }
  }
});

test('la ruta se pinta en verde, y el amarillo se queda para la marca', () => {
  // Sobre las avenidas —amarillas— del mapa de Maracaibo, una ruta amarilla se
  // pierde justo encima de las calles por las que pasa. Y compite con el botón
  // de pedir, que es la identidad.
  const mapa = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  assert.match(mapa, /strokeColor=\{tema\.color\.rutaDelMapa\}/);
  assert.equal(/strokeColor=\{tema\.color\.acento\}/.test(mapa), false,
    'la ruta volvió al amarillo de la marca');

  // Y el token existe en los DOS esquemas: una ruta que sólo se ve de noche no
  // está terminada.
  const esquemas = leer('theme/esquemas.ts');
  assert.equal((esquemas.match(/rutaDelMapa:/g) ?? []).length, 3,
    'falta el color de ruta en alguno de los dos esquemas');
});
