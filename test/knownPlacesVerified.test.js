import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_PLACES, findKnownPlace } from '../src/utils/knownPlaces.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * PRESETS-1: dos destinos corregidos con evidencia, dos retenidos a proposito.
 *
 * La auditoria de activacion de Places midio en produccion donde cae cada
 * lugar segun Google. Sambil y Basilica eran inequivocos y se corrigen a la
 * canonica verificada. La Vereda (un parque enorme: ¿que entrada?) y 5 de
 * Julio/Calle 72 (Google resuelve la Calle 76, otra esquina) NO se tocan sin
 * decision explicita del propietario — adivinar seria fabricar un lugar.
 */

test('Sambil lleva la coordenada canonica verificada contra Google Places', () => {
  const sambil = findKnownPlace('sambil-maracaibo');
  assert.equal(sambil.lat, 10.72277);
  assert.equal(sambil.lng, -71.63268);
  assert.equal(sambil.verified, true);
});

test('la Basilica lleva la canonica verificada y ya no es el centro del area de servicio', () => {
  const basilica = findKnownPlace('basilica-chiquinquira');
  assert.equal(basilica.lat, 10.64290);
  assert.equal(basilica.lng, -71.61556);
  assert.equal(basilica.verified, true);
  // La heredada (10.6427, -71.6125) era el centro nominal del area: si
  // reaparece aqui, alguien deshizo la correccion.
  assert.notEqual(`${basilica.lat},${basilica.lng}`, '10.6427,-71.6125');
});

test('la Vereda y 5 de Julio quedan EXACTAMENTE como estaban, esperando al propietario', () => {
  const vereda = findKnownPlace('vereda-del-lago');
  assert.equal(vereda.lat, 10.6658);
  assert.equal(vereda.lng, -71.5975);
  assert.equal(vereda.verified, false, 'sin confirmacion del propietario no se marca verificado');

  const cincoDeJulio = findKnownPlace('cinco-de-julio-calle-72');
  assert.equal(cincoDeJulio.lat, 10.6689);
  assert.equal(cincoDeJulio.lng, -71.6167);
  assert.equal(cincoDeJulio.verified, false);
  // La intencion del producto es la CALLE 72: el «5 de julio» generico de
  // Google (Calle 76) no puede sustituirla en silencio.
  assert.ok(cincoDeJulio.id.includes('calle-72'));
});

test('los ids son los mismos de MAPS-2A: nada se renombro ni se perdio', () => {
  assert.deepEqual(KNOWN_PLACES.map(lugar => lugar.id), [
    'basilica-chiquinquira',
    'sambil-maracaibo',
    'vereda-del-lago',
    'cinco-de-julio-calle-72'
  ]);
});

test('ninguna coordenada volvio al HTML: el modulo sigue siendo la unica fuente', () => {
  const app = fs.readFileSync(path.join(raiz, 'src/pages/passenger/passengerApp.js'), 'utf8');
  assert.ok(!app.includes('data-lat='), 'coordenadas en el marcado otra vez');
  assert.ok(!app.includes('data-lon='), 'coordenadas en el marcado otra vez');
  assert.ok(app.includes('data-preset-id='));
  // Y las coordenadas corregidas no aparecen escritas en la pantalla.
  assert.ok(!app.includes('10.72277'), 'la canonica del Sambil solo vive en knownPlaces');
});
