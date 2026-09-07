import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RUTAS_DE_POSTULACION,
  destinoDePostulacion,
  esExpedienteEditable
} from '../domain/postulacion.ts';
import { destinoTrasEntrar } from '../domain/entrada.ts';

/**
 * REANUDAR LA POSTULACIÓN — el servidor manda, y la decisión vive en un sitio.
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que nadie llegue a la interfaz de conductor sin que el BACKEND lo diga.
 *    Pulsar «Conductor» en la bienvenida es una intención; el rol es otra cosa.
 * 2. Que el progreso no lo guarde el teléfono. Quien cierra la aplicación a
 *    mitad vuelve al paso que le falta porque se lo dice el expediente del
 *    servidor, no porque el dispositivo recuerde nada.
 * 3. Que la decisión esté en UNA función. Repartirla en `if` por las pantallas
 *    es cómo se acaba con dos criterios que discrepan y alguien dando vueltas.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativo => fs.readFileSync(path.join(raizMovil, relativo), 'utf8');
const sinComentarios = relativo => leer(relativo).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Un expediente completo y editable: no le falta nada. */
const completo = (extra = {}) => ({
  estado: 'draft',
  documentosQueFaltan: [],
  correccionesPendientes: 0,
  tieneRif: true,
  tieneLicencia: true,
  tienePlaca: true,
  ...extra
});

// ---------------------------------------------------------------------------
// El rol real manda siempre
// ---------------------------------------------------------------------------

test('quien ya es conductor no se vuelve a postular', () => {
  // Da igual lo que diga el expediente: si el backend dice «driver», su sitio
  // es el inicio de conductor.
  for (const expediente of [null, completo(), completo({ estado: 'pending' }), completo({ estado: 'suspended' })]) {
    assert.equal(destinoDePostulacion(expediente, { rolReal: 'driver' }), '/conductor');
  }
});

test('sin rol de conductor, ningún expediente abre la interfaz de conductor', () => {
  const estados = ['draft', 'pending', 'approved', 'rejected', 'needs_changes', 'suspended', 'inventado'];
  for (const estado of estados) {
    for (const rol of ['passenger', 'admin', null, undefined]) {
      const destino = destinoDePostulacion(completo({ estado }), { rolReal: rol });
      assert.notEqual(destino, '/conductor', `${estado} con rol ${String(rol)} abrió conductor`);
    }
  }
});

test('un expediente aprobado que el rol todavía no refleja se queda en el estado', () => {
  // La aprobación la canta el backend; hasta que la sesión se refresca, lo que
  // se enseña es el estado, no una interfaz que aún no le corresponde.
  assert.equal(destinoDePostulacion(completo({ estado: 'approved' }), { rolReal: 'passenger' }), '/postulacion/estado');
});

// ---------------------------------------------------------------------------
// Reanudar: al primer paso al que le falte algo
// ---------------------------------------------------------------------------

test('sin expediente se empieza por el principio', () => {
  assert.equal(destinoDePostulacion(null, { rolReal: 'passenger' }), '/postulacion');
  assert.equal(destinoDePostulacion(null), '/postulacion');
});

test('el borrador cae en el paso que le falta, en el orden del formulario', () => {
  assert.equal(destinoDePostulacion(completo({ tieneRif: false })), '/postulacion');
  assert.equal(destinoDePostulacion(completo({ tienePlaca: false })), '/postulacion/vehiculo');
  assert.equal(destinoDePostulacion(completo({ tieneLicencia: false })), '/postulacion/vehiculo');
  assert.equal(destinoDePostulacion(completo({ documentosQueFaltan: ['plate_photo'] })), '/postulacion/documentos');
  assert.equal(destinoDePostulacion(completo()), '/postulacion/confirmacion');
});

test('lo que falta antes gana: primero la persona, luego el vehículo, luego las fotos', () => {
  const aMedias = completo({ tieneRif: false, tienePlaca: false, documentosQueFaltan: ['rif'] });
  assert.equal(destinoDePostulacion(aMedias), '/postulacion');
  assert.equal(destinoDePostulacion({ ...aMedias, tieneRif: true }), '/postulacion/vehiculo');
});

test('las correcciones pedidas llevan a repetirlas, aunque no falte ningún documento', () => {
  const conCorrecciones = completo({ estado: 'needs_changes', correccionesPendientes: 1 });
  assert.equal(destinoDePostulacion(conCorrecciones), '/postulacion/documentos');
});

test('un expediente rechazado sigue siendo editable: se puede corregir', () => {
  assert.equal(esExpedienteEditable('rejected'), true);
  assert.equal(destinoDePostulacion(completo({ estado: 'rejected', documentosQueFaltan: ['rif'] })), '/postulacion/documentos');
});

test('en revisión no se toca nada', () => {
  assert.equal(destinoDePostulacion(completo({ estado: 'pending' })), '/postulacion/estado');
  assert.equal(esExpedienteEditable('pending'), false);
  assert.equal(esExpedienteEditable('approved'), false);
  assert.equal(esExpedienteEditable('suspended'), false);
});

test('un estado que esta versión no conoce se mira, no se toca', () => {
  // Si el backend añade un estado mañana, lo peor que puede pasar es que se
  // enseñe el estado; nunca que se abra a editar algo que ya no lo es.
  assert.equal(destinoDePostulacion(completo({ estado: 'en_auditoria' })), '/postulacion/estado');
  assert.equal(esExpedienteEditable('en_auditoria'), false);
});

test('las rutas son las que existen de verdad', () => {
  for (const ruta of Object.values(RUTAS_DE_POSTULACION)) {
    if (ruta === '/conductor') {
      assert.ok(fs.existsSync(path.join(raizMovil, 'app/conductor.tsx')), 'falta app/conductor.tsx');
      continue;
    }
    const relativa = ruta === '/postulacion' ? 'app/postulacion/index.tsx' : `app${ruta}.tsx`;
    assert.ok(fs.existsSync(path.join(raizMovil, relativa)), `la ruta ${ruta} no tiene pantalla`);
  }
});

// ---------------------------------------------------------------------------
// La entrada: la intención elige puerta, nunca rol
// ---------------------------------------------------------------------------

const cuenta = extra => ({ id: 'u1', role: 'passenger', firstName: 'Ana', lastName: 'P', email: 'a@b.c', phone: '+58412', ...extra });

test('la intención de conductor lleva a la postulación, no al inicio de conductor', () => {
  assert.equal(destinoTrasEntrar(cuenta(), 'driver'), '/postulacion');
  assert.equal(destinoTrasEntrar(cuenta(), 'passenger'), '/pasajero');
  assert.equal(destinoTrasEntrar(cuenta(), null), '/pasajero');
});

test('la cuenta de conductor va a conductor, se haya pulsado lo que se haya pulsado', () => {
  assert.equal(destinoTrasEntrar(cuenta({ role: 'driver' }), 'passenger'), '/conductor');
  assert.equal(destinoTrasEntrar(cuenta({ role: 'driver' }), 'driver'), '/conductor');
});

test('administración no se postula por pulsar una tarjeta', () => {
  assert.equal(destinoTrasEntrar(cuenta({ role: 'admin' }), 'driver'), '/pasajero');
});

// ---------------------------------------------------------------------------
// La decisión vive en un solo sitio
// ---------------------------------------------------------------------------

test('las pantallas no reimplementan la lista de estados editables', () => {
  // Cada copia de esta lista es un sitio donde el criterio puede divergir del
  // servidor. La única que vale es la del dominio.
  for (const pantalla of ['app/postulacion/index.tsx', 'app/conductor.tsx']) {
    const fuente = sinComentarios(pantalla);
    assert.equal(
      /\['draft',\s*'needs_changes'/.test(fuente),
      false,
      `${pantalla} tiene su propia lista de estados editables`
    );
  }
});

test('el paso 1 decide con la función del dominio', () => {
  const fuente = sinComentarios('app/postulacion/index.tsx');
  assert.match(fuente, /destinoDePostulacion\(/);
  assert.match(fuente, /retratoDelExpediente\(/);
});

test('el rol que se usa para decidir sale de la sesión del backend', () => {
  const fuente = sinComentarios('app/postulacion/index.tsx');
  assert.match(fuente, /sesion\.usuario\.role/, 'el rol sale de la sesión, no de la intención');
  assert.equal(/intencion/i.test(fuente), false, 'la intención no decide nada en el paso 1');
});

test('la aprobación se refresca contra el backend, no se concede en el teléfono', () => {
  const estado = sinComentarios('app/postulacion/estado.tsx');
  assert.match(estado, /revalidar\(\)/, 'pide la identidad otra vez al backend');
  assert.equal(/role\s*=\s*['"]driver['"]/.test(estado), false, 'se concede el rol desde la aplicación');
  assert.match(estado, /usuario\.role === 'driver'/, 'sólo con el rol ya refrescado se abre conductor');
});

test('volver atrás desde el vehículo no tira lo escrito', () => {
  // Salió en la certificación E2E: se rellenaba el vehículo, se volvía al paso
  // anterior a corregir una errata de la cédula, y al regresar estaba todo en
  // blanco. El paso sólo guardaba al avanzar.
  const pantalla = leer('app/postulacion/vehiculo.tsx');
  assert.match(pantalla, /const volver = \(\) => \{[\s\S]{0,300}actualizar\(\{[\s\S]{0,200}router\.back\(\)/);
  assert.match(pantalla, /titulo="←  Atrás"[^>]*onPress=\{volver\}/);
  // Y lo que guarda es TODO lo del paso, no sólo el tipo de vehículo.
  const cuerpo = pantalla.slice(pantalla.indexOf('const volver'), pantalla.indexOf('const cambiar'));
  for (const campo of ['vehiculo:', 'servicios', 'datosDelVehiculo:', 'licencia', 'certificadoMedico:']) {
    assert.ok(cuerpo.includes(campo), `volver no guarda ${campo}`);
  }
});

test('la pantalla de estado se entera de las novedades al volver', () => {
  // Salió en la certificación E2E: con la pantalla de estado abierta,
  // administración pedía cambios y la persona seguía leyendo «estamos
  // revisando tu postulación» hasta que cerraba y volvía a abrir.
  const pantalla = leer('app/postulacion/estado.tsx');
  assert.match(pantalla, /AppState\.addEventListener\('change'/);
  assert.match(pantalla, /siguiente === 'active'\) consultar\(\)/);
  // Y usa la misma consulta que el inicio: dos pantallas abiertas no son dos
  // peticiones.
  assert.match(pantalla, /consultarEstadoDePostulacion\(\{ forzar: true \}\)/);
});
