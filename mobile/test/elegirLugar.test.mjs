import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';

/**
 * ELEGIR DE DÓNDE Y A DÓNDE
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que tocar un campo de texto abra un TECLADO. Durante un tiempo los dos
 *    campos y el enlace del mapa hacían lo mismo —abrir el mapa— y no había
 *    forma de escribir una dirección. Se toca un campo para escribir; que se
 *    abra un mapa es lo contrario de lo que espera cualquiera.
 *
 * 2. Que la recogida se pueda cambiar. Por omisión es el GPS, que acierta casi
 *    siempre, pero se pide un viaje desde dentro de un portal o para alguien
 *    que espera en otra esquina. Sin poder cambiarla, la moto llega al sitio
 *    equivocado y no hay forma de arreglarlo.
 *
 * 3. Que la búsqueda no se pague por cada tecla. Cada consulta es una llamada
 *    de PAGO a Google.
 *
 * 4. Que ningún punto se dé por elegido sin confirmarlo.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

test('los campos de texto abren la búsqueda escrita, no el mapa', () => {
  const pantalla = leer('app/pedir.tsx');
  assert.match(pantalla, /onTocarOrigen=\{\(\) => buscarEscribiendo\('origen'\)\}/);
  assert.match(pantalla, /onTocarDestino=\{\(\) => buscarEscribiendo\('destino'\)\}/);
});

test('la recogida puede no ser donde dice el GPS', () => {
  const pantalla = despojarComentarios(leer('app/pedir.tsx'));
  // Lo elegido a mano manda: quien lo cambió sabe algo que el teléfono no.
  assert.match(pantalla, /if \(origenElegido !== null\) return origenElegido;/);
  // Y se puede deshacer sin salir de la pantalla.
  assert.match(pantalla, /volverAlGps === '1'/);
  assert.match(leer('app/destino.tsx'), /titulo="Usar mi ubicación actual"/);
});

test('la recogida elegida NO se sigue llamando «tu ubicación ahora»', () => {
  // Seguir diciéndolo sería mentir sobre dónde va a llegar la moto, que es
  // justo el dato que no se puede equivocar.
  const pantalla = despojarComentarios(leer('app/pedir.tsx'));
  assert.match(pantalla, /if \(punto\.fuente === 'gps'\) return 'Tu ubicación ahora';/);
  assert.match(pantalla, /nombreDelOrigen\(origen\)/);
});

test('no se busca en cada tecla, ni con dos letras', () => {
  const buscador = leer('app/destino.tsx');
  const servicio = leer('services/lugares.ts');
  // Se espera a que pare de escribir.
  assert.match(buscador, /ESPERA_MS = \d+/);
  assert.match(buscador, /setTimeout\(async \(\)/);
  assert.match(buscador, /clearTimeout\(reloj\)/, 'sin cancelar, cada tecla dispara su búsqueda');
  // Y por debajo del mínimo no se pregunta nada.
  assert.match(servicio, /MINIMO_PARA_BUSCAR = 3/);
  assert.match(servicio, /if \(consulta\.length < MINIMO_PARA_BUSCAR\) return \{ ok: false, motivo: 'CORTA' \}/);
});

test('una respuesta lenta no pisa a la búsqueda nueva', () => {
  // Se escribe «sam», luego «sambil»: si la primera contesta después, la lista
  // acabaría enseñando resultados de algo que ya no está escrito.
  const buscador = despojarComentarios(leer('app/destino.tsx'));
  assert.match(buscador, /if \(ultima\.current !== consulta\) return;/);
});

test('el mapa dice QUÉ se está eligiendo', () => {
  // El mismo mapa sirve para la recogida y para el destino. Sin decirlo, se
  // confirma un punto creyendo que es el otro.
  const pantalla = leer('app/pedir.tsx');
  assert.match(pantalla, /campoQueSeElige === 'origen' \? '¿Dónde te recogemos\?' : '¿A dónde vas\?'/);
  assert.match(pantalla, /'Confirmar la recogida' : 'Confirmar este destino'/);
});

test('mientras se elige en el mapa, el trayecto no estorba', () => {
  // La pantalla es para apuntar: enseñar debajo el trayecto y los vehículos
  // deja una franja de mapa donde hace falta el mapa entero.
  const pantalla = leer('app/pedir.tsx');
  assert.match(pantalla, /\{eligiendoEnMapa \? null : \(\s*<Trayecto/);
});

test('el buscador no es un callejón: siempre se puede ir al mapa', () => {
  // Hay sitios sin nombre que sólo se pueden señalar. La salida está a la
  // vista, no escondida en el texto de un error.
  const buscador = leer('app/destino.tsx');
  assert.match(buscador, /titulo="Mejor lo elijo en el mapa"/);
  assert.match(buscador, /elegirEnMapa: esOrigen \? 'origen' : 'destino'/);
  // Y la pantalla de pedir sabe recibir esa señal.
  assert.match(leer('app/pedir.tsx'), /const cual = elegido\.elegirEnMapa;/);
});

test('el alfiler del mapa es rojo y se ve', () => {
  // El amarillo de marca es el color de casi todo lo tocable: sobre el mapa se
  // confundía con la interfaz y costaba ver dónde se apuntaba.
  const marcadores = leer('mapa/Marcadores.tsx');
  assert.match(marcadores, /const rojo = '#E5342A'/);
  // Con punta, no una bolita: una bolita señala un área y deja la duda de si
  // el sitio es su centro o su borde.
  assert.match(marcadores, /El tallo, que baja hasta el punto exacto/);
});
