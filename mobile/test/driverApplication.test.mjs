import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ESTADOS_DE_SOLICITUD,
  SIN_SOLICITUD,
  describirSituacion,
  puedeConducir
} from '../domain/driverApplication.ts';

/**
 * MOBILE-NATIVE-1 — la situación del conductor.
 *
 * La regla que protegen: elegir «Conductor» en el selector NO abre la interfaz
 * de conductor. Sólo la aprobación explícita del backend lo hace.
 */

// ---------------------------------------------------------------------------
// La coherencia con el backend, comprobada de verdad
// ---------------------------------------------------------------------------

test('los estados son EXACTAMENTE los que define el backend', () => {
  // Se leen del fichero real. Si alguien añade o renombra un estado allí, esta
  // prueba lo dice — que es mejor que descubrirlo cuando la aplicación enseñe
  // un estado equivocado sobre una decisión de aprobación.
  const fuente = fs.readFileSync(
    new URL('../../server/domain/driverApplicationModel.js', import.meta.url),
    'utf8'
  );
  const bloque = fuente.slice(
    fuente.indexOf('DRIVER_APPLICATION_STATUS'),
    fuente.indexOf('});', fuente.indexOf('DRIVER_APPLICATION_STATUS'))
  );
  const delBackend = [...bloque.matchAll(/:\s*'([a-z_]+)'/g)].map(coincidencia => coincidencia[1]);

  assert.ok(delBackend.length >= 5, 'se encontraron los estados del backend');
  assert.deepEqual([...ESTADOS_DE_SOLICITUD].sort(), delBackend.sort(),
    'la aplicación móvil conoce los mismos estados que el backend, ni uno más ni uno menos');
});

// ---------------------------------------------------------------------------
// Sólo la aprobación concede
// ---------------------------------------------------------------------------

test('SÓLO «approved» permite conducir', () => {
  assert.equal(puedeConducir('approved'), true);

  for (const estado of ESTADOS_DE_SOLICITUD) {
    if (estado === 'approved') continue;
    assert.equal(puedeConducir(estado), false, estado);
  }
  assert.equal(puedeConducir(SIN_SOLICITUD), false);
});

test('un estado DESCONOCIDO no concede nada', () => {
  // Si el backend empezara a devolver un estado que esta versión no conoce, lo
  // peor que puede pasar es que se ofrezca empezar una solicitud — nunca que se
  // abra una interfaz de conductor por error.
  for (const invento of ['APPROVED', 'aprobado', 'ok', '', 'admin', 'true']) {
    assert.equal(puedeConducir(invento), false, invento);
    assert.equal(describirSituacion(invento).puedeConducir, false, invento);
  }
});

test('cada estado tiene un mensaje propio y comprensible', () => {
  const todas = [...ESTADOS_DE_SOLICITUD, SIN_SOLICITUD];
  const titulos = new Set();

  for (const situacion of todas) {
    const mensaje = describirSituacion(situacion);
    assert.ok(mensaje.titulo.length > 0, situacion);
    assert.ok(mensaje.explicacion.length > 0, situacion);
    titulos.add(mensaje.titulo);
  }

  // Ningún estado copia el mensaje de otro: si dos dijeran lo mismo, la persona
  // no sabría en cuál está.
  assert.equal(titulos.size, todas.length, 'cada situación se explica distinto');
});

test('los estados sin salida no ofrecen una acción imposible', () => {
  // En revisión no hay nada que la persona pueda hacer, y ofrecer un botón
  // sería mentirle.
  assert.equal(describirSituacion('pending').accion, null);
});

test('sólo «approved» dice que se puede conducir en su mensaje', () => {
  for (const situacion of [...ESTADOS_DE_SOLICITUD, SIN_SOLICITUD]) {
    assert.equal(
      describirSituacion(situacion).puedeConducir,
      situacion === 'approved',
      situacion
    );
  }
});
