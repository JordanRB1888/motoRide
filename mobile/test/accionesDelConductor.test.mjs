import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  accionParaElEstado,
  motivoDelFallo,
  sePuedePulsar,
  titularDelConductor
} from '../domain/accionesDelConductor.ts';
import { SUPERFICIE_DEL_ESTADO, superficieDe } from '../domain/viajeActivo.ts';
import { datosDelViaje, usaLaPantallaDelViaje } from '../domain/superficieDelViaje.ts';

/**
 * Las acciones del conductor sobre su carrera — TRIP-LIFECYCLE-ACTIONS-1.
 *
 * QUÉ SE PROTEGE
 *
 * Que en cada estado se ofrezca UNA acción y sea la correcta. Ofrecer
 * «Finalizar viaje» a quien todavía no ha recogido a nadie no es un error
 * visual: es una carrera cobrada sin haber ocurrido.
 *
 * Y que el botón no dispare dos veces. Con red mala, el segundo toque no es
 * impaciencia: es que el primero no dio señal de vida.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));

test('cada estado ofrece la acción que le toca, y sólo esa', () => {
  assert.equal(accionParaElEstado('DRIVER_ASSIGNED')?.estadoQuePide, 'ARRIVED');
  assert.equal(accionParaElEstado('ARRIVED')?.estadoQuePide, 'IN_PROGRESS');
  assert.equal(accionParaElEstado('IN_PROGRESS')?.estadoQuePide, 'COMPLETED');
});

test('los estados sin acción NO dan botón', () => {
  // SEARCHING todavía no tiene conductor; los terminales ya no admiten nada.
  for (const estado of ['SEARCHING', 'COMPLETED', 'CANCELLED']) {
    assert.equal(accionParaElEstado(estado), null, `${estado} no debería dar botón`);
  }
});

test('un estado que no conocemos NO se convierte en una acción', () => {
  // El día que el servidor añada un estado, la pantalla se queda sin botón en
  // vez de ofrecer el último que recuerde. Fallar cerrado.
  assert.equal(accionParaElEstado('ALGO_NUEVO'), null);
  assert.equal(accionParaElEstado(null), null);
  assert.equal(accionParaElEstado(undefined), null);
  assert.equal(accionParaElEstado(''), null);
});

test('no se puede saltar el orden: de asignado no se finaliza', () => {
  // La prueba de verdad la hace el servidor. Ésta comprueba que la pantalla
  // tampoco lo propone, que es la primera línea.
  assert.notEqual(accionParaElEstado('DRIVER_ASSIGNED')?.estadoQuePide, 'COMPLETED');
  assert.notEqual(accionParaElEstado('DRIVER_ASSIGNED')?.estadoQuePide, 'IN_PROGRESS');
  assert.notEqual(accionParaElEstado('ARRIVED')?.estadoQuePide, 'COMPLETED');
});

test('mientras hay un envío en vuelo el botón NO vuelve a disparar', () => {
  assert.equal(sePuedePulsar('SUBMITTING', true), false, 'el doble toque saldría');
  assert.equal(sePuedePulsar('SUCCESS', true), false, 'la acción ya se hizo');
  assert.equal(sePuedePulsar('IDLE', true), true);
  assert.equal(sePuedePulsar('ERROR', true), true, 'tras un fallo hay que poder reintentar');
  assert.equal(sePuedePulsar('OFFLINE', true), true, 'con la red de vuelta, se reintenta');
});

test('sin conexión no se pulsa, esté como esté la fase', () => {
  for (const fase of ['IDLE', 'SUBMITTING', 'SUCCESS', 'ERROR', 'OFFLINE']) {
    assert.equal(sePuedePulsar(fase, false), false, `${fase} sin red no debería salir`);
  }
});

test('los fallos se cuentan en castellano, sin códigos', () => {
  const mensaje = motivoDelFallo('INVALID_TRIP_TRANSITION');
  assert.doesNotMatch(mensaje, /INVALID|TRANSITION|_/, 'se filtró el código del servidor');
  assert.match(mensaje, /carrera/i);

  // Un código que no está en la lista NO deja a nadie sin explicación.
  assert.notEqual(motivoDelFallo('ALGO_RARO'), '');
  assert.notEqual(motivoDelFallo(null), '');
});

test('el conductor lee su propio texto, no el de la pasajera', () => {
  // Ella lee «Tu conductor llegó». Él ya lo sabe: lo acaba de pulsar.
  const suyo = titularDelConductor('ARRIVED');
  const deElla = datosDelViaje({ estado: 'ARRIVED', conductor: null, origen: 'a', destino: 'b' })?.estado;
  assert.notEqual(suyo, deElla);
  assert.match(suyo, /esperando/i);
});

test('ARRIVED tiene pantalla para la pasajera, y con el texto correcto', () => {
  // El hueco que estaba declarado: el copy existía y el mapeo lo mandaba a
  // `null`, así que al llegar el conductor la pasajera salía de la pantalla del
  // viaje. Justo en el momento en que más mira el teléfono.
  assert.equal(SUPERFICIE_DEL_ESTADO.ARRIVED, 'viaje');
  assert.equal(superficieDe({ estado: 'ARRIVED' }), 'viaje');
  assert.equal(usaLaPantallaDelViaje('ARRIVED'), true);

  const datos = datosDelViaje({ estado: 'ARRIVED', conductor: null, origen: 'a', destino: 'b' });
  assert.match(datos.estado, /lleg/i);
});

test('los estados terminales NO son un viaje activo', () => {
  // Después de COMPLETED la pasajera no puede quedarse en la pantalla del
  // viaje: ya no hay viaje que enseñar.
  assert.equal(superficieDe({ estado: 'COMPLETED' }), null);
  assert.equal(superficieDe({ estado: 'CANCELLED' }), null);
});

test('la acción del conductor sale por el evento del servidor, no por HTTP', () => {
  // El contrato con el backend es un evento de socket. Si alguien lo cambiara
  // por una llamada REST habría que cambiar también el servidor, y esta prueba
  // obliga a enterarse.
  const socket = fs.readFileSync(path.join(aqui, '..', 'realtime', 'socket.ts'), 'utf8');
  const envio = /export function cambiarEstadoDeCarrera[\s\S]*?\n}/.exec(socket)[0];
  assert.match(envio, /socket\.emit\('tripStatusUpdated'/);
  assert.match(envio, /tripId: viajeId, status: estado/);
  // La identidad NO viaja en el payload: sale del token.
  assert.doesNotMatch(envio, /driverId|userId|token/);
});

test('el cliente escucha el rechazo del servidor', () => {
  // Sin esto, un «Llegué» rechazado deja el botón girando para siempre.
  const eventos = fs.readFileSync(path.join(aqui, '..', 'realtime', 'eventos.ts'), 'utf8');
  const escuchados = /EVENTOS_DEL_SERVIDOR = \[([\s\S]*?)\] as const/.exec(eventos)[1];
  const pendientes = /EVENTOS_PENDIENTES = \[([\s\S]*?)\] as const/.exec(eventos)[1];
  assert.match(escuchados, /'tripStatusRejected'/);
  assert.doesNotMatch(pendientes.replace(/\/\/[^\n]*/g, ''), /'tripStatusRejected'/);
});
