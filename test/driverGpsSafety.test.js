import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * GPS-0: la posicion operativa del conductor y el respaldo visual del mapa
 * son conceptos SEPARADOS para siempre.
 *
 * La auditoria encontro que un fallo de GPS (permiso denegado, señal perdida,
 * timeout) fabricaba el centro de Maracaibo (10.6427, -71.6125) y lo emitia
 * como posicion real: el servidor lo registraba con marca de tiempo fresca y
 * el despacho podia ofrecer carreras a un conductor que no estaba alli.
 *
 * El contrato que estas pruebas fijan:
 *   - una coordenada operativa solo puede nacer de una lectura real del GPS;
 *   - un fallo de GPS no emite NADA: ni socket, ni REST, ni marca de tiempo;
 *   - la ultima posicion real conserva su antigüedad y caduca sola por la
 *     regla de frescura del servidor (STALE_LOCATION), que no cambia;
 *   - el centro de Maracaibo sigue disponible como encuadre VISUAL del mapa.
 *
 * Son pruebas sobre el fuente porque el rastreador es un singleton que
 * arrastra apiService (import.meta.env sin ?.) y no puede importarse en Node:
 * el mismo patron que ya usan locationThrottle y realtimeSocketRecovery.
 */

/** El fuente sin comentarios: lo que importa es el CODIGO, no las notas. */
const sinComentarios = fuente => fuente
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ')
  .replace(/[ \t]\/\/[^\n]*$/gm, ' ');

const trackerFuente = leer('src/services/driverGpsTracker.js');
const tracker = sinComentarios(trackerFuente);

/**
 * Cuerpo de un metodo de la clase, delimitado por el metodo siguiente.
 *
 * Se busca la DEFINICION (el nombre al inicio de su linea, con la indentacion
 * de metodo), no las referencias `this._metodo(...)` que aparecen antes.
 */
function cuerpoDelMetodo(codigo, nombre, siguiente) {
  const definicion = etiqueta => {
    const coincidencia = new RegExp(`^  ${etiqueta}\\(`, 'm').exec(codigo);
    return coincidencia ? coincidencia.index : -1;
  };
  const desde = definicion(nombre);
  const hasta = definicion(siguiente);
  assert.ok(desde >= 0, `no se encontro la definicion de ${nombre}`);
  assert.ok(hasta > desde, `no se encontro el limite ${siguiente}`);
  return codigo.slice(desde, hasta);
}

// --------------------------------------------------------------------------
// Un fallo de GPS no produce coordenadas (permiso denegado, POSITION_UNAVAILABLE
// y timeout entran TODOS por _onPositionError: la misma guarda cubre los tres)
// --------------------------------------------------------------------------

test('la rama de error del GPS no fabrica ni emite ninguna coordenada', () => {
  const rama = cuerpoDelMetodo(tracker, '_onPositionError', 'getLastPosition');

  // Nada de coordenadas inventadas: ni las de Maracaibo ni ninguna otra.
  assert.ok(!rama.includes('10.6427'), 'la latitud de Maracaibo volvio a la rama de error');
  assert.ok(!rama.includes('71.6125'), 'la longitud de Maracaibo volvio a la rama de error');
  assert.ok(!/latitude\s*:/.test(rama), 'la rama de error no puede construir una posicion');
  assert.ok(!/longitude\s*:/.test(rama), 'la rama de error no puede construir una posicion');

  // Y nada viaja: ni socket, ni REST, ni regulador (consultarlo implicaria
  // que hay algo que enviar).
  assert.ok(!rama.includes('emit('), 'un fallo de GPS no emite nada por socket');
  assert.ok(!rama.includes('apiService'), 'un fallo de GPS no envia nada por REST');
  assert.ok(!rama.includes('locationThrottle'), 'sin posicion no hay nada que regular');
});

test('la rama de error no refresca marcas de tiempo ni toca la ultima posicion real', () => {
  const rama = cuerpoDelMetodo(tracker, '_onPositionError', 'getLastPosition');
  // La antigüedad de la ultima lectura REAL es la evidencia que el servidor
  // usa para caducarla (STALE_LOCATION). Rejuvenecerla seria mentir.
  assert.ok(!rama.includes('Date.now'), 'la rama de error no puede fabricar marcas de tiempo');
  assert.ok(!rama.includes('timestamp'), 'la rama de error no toca marcas de tiempo');
  assert.ok(!/this\.lastPosition\s*=/.test(rama), 'la ultima posicion real no se pisa en un error');
});

test('el centro de Maracaibo desaparecio por completo del rastreador', () => {
  // En este fichero esa coordenada solo podia significar una cosa: posicion
  // operativa falsa. Si reaparece --con cualquier disfraz--, es una regresion.
  assert.ok(!tracker.includes('10.6427'), 'coordenada de Maracaibo en el rastreador');
  assert.ok(!tracker.includes('71.6125'), 'coordenada de Maracaibo en el rastreador');
});

// --------------------------------------------------------------------------
// El camino bueno queda intacto: solo lecturas reales viajan
// --------------------------------------------------------------------------

test('la posicion que se emite nace de pos.coords, la lectura real del dispositivo', () => {
  const rama = cuerpoDelMetodo(tracker, '_onPositionSuccess', '_onPositionError');
  assert.match(rama, /const\s*\{\s*latitude,\s*longitude,\s*heading,\s*speed\s*\}\s*=\s*pos\.coords/,
    'el payload debe desestructurar la lectura real del GPS');
  assert.ok(rama.includes("emit('driver:location_update', payload)"),
    'la emision del camino bueno sigue en su sitio');
  assert.ok(rama.includes("apiService.patch('/drivers/location'"),
    'la persistencia REST del camino bueno sigue en su sitio');
});

test('toda emision de posicion del rastreador sigue regulada y son solo las reales', () => {
  // Dos emisiones legitimas: la muestra buena y el reenvio tras reconectar
  // (que reusa lastPosition, una lectura real). Cada una con su consulta y su
  // confirmacion al regulador. La tercera --la falsa-- ya no existe.
  const emisiones = tracker.match(/emit\(\s*'driver:location_update'/g) || [];
  assert.equal(emisiones.length, 2, 'solo el camino bueno y la reconexion pueden emitir');
  assert.equal((tracker.match(/locationThrottle\.shouldSend\(/g) || []).length, 2);
  assert.equal((tracker.match(/locationThrottle\.markSent\(/g) || []).length, 2);
});

// --------------------------------------------------------------------------
// El respaldo visual sigue existiendo y NO puede volverse operativo
// --------------------------------------------------------------------------

test('el mapa conserva su encuadre visual de Maracaibo sin GPS', () => {
  const mapa = sinComentarios(leer('src/components/mapComponent.js'));
  // El visor abre centrado en la ciudad aunque no haya GPS: eso es UI.
  assert.match(mapa, /initMap\(lat = 10\.6427, lng = -71\.6125/,
    'el encuadre visual por defecto debe seguir existiendo');
  // Y el respaldo de getUserLocation se declara a si mismo como tal.
  assert.match(mapa, /isFallback:\s*true/,
    'el respaldo visual debe marcarse como isFallback');
});

test('nadie pide el respaldo visual como si fuera una posicion real', () => {
  // getUserLocation({allowFallback:true}) devuelve Maracaibo MARCADO como
  // respaldo. Hoy ningun llamador lo pide; si alguien lo hace mañana, que
  // esta prueba obligue a mirar que hara con el.
  const src = path.join(raiz, 'src');
  const ficheros = [];
  const recorrer = dir => {
    for (const nombre of fs.readdirSync(dir)) {
      const ruta = path.join(dir, nombre);
      if (fs.statSync(ruta).isDirectory()) recorrer(ruta);
      else if (nombre.endsWith('.js')) ficheros.push(ruta);
    }
  };
  recorrer(src);
  for (const ruta of ficheros) {
    const codigo = sinComentarios(fs.readFileSync(ruta, 'utf8'));
    assert.ok(!/allowFallback:\s*true/.test(codigo),
      `${path.relative(raiz, ruta)} pide el respaldo visual como ubicacion`);
  }
});

test('el pasajero sigue descartando el respaldo visual de su estado operativo', () => {
  // La guarda gemela del lado pasajero: setPassengerLocation rechaza
  // isFallback. Es la que impide que el respaldo entre por la otra puerta.
  const app = sinComentarios(leer('src/pages/passenger/passengerApp.js'));
  assert.match(app, /location\?\.isFallback\)\s*return null/,
    'el estado del pasajero debe rechazar posiciones de respaldo');
});

// --------------------------------------------------------------------------
// La caducidad del servidor sigue siendo la autoridad
// --------------------------------------------------------------------------

test('la regla de frescura del servidor no cambio con GPS-0', () => {
  const indice = sinComentarios(leer('server/index.js'));
  assert.ok(indice.includes('MAX_DRIVER_LOCATION_AGE_MS || 120_000'),
    'la caducidad de 120 s es la que excluye al conductor sin GPS: no puede moverse en GPS-0');
  const elegibilidad = leer('server/domain/dispatchEligibility.js');
  assert.match(elegibilidad, /STALE_LOCATION/);
  assert.match(elegibilidad, /NO_LOCATION/);
});
