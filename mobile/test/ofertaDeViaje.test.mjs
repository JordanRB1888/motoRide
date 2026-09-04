import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ESTADOS_DE_OFERTA,
  debeSustituirLaOferta,
  estaVencida,
  formaDePagoEnPantalla,
  leerOferta,
  segundosRestantes,
  sePuedeAceptar,
  sePuedeRechazar
} from '../domain/ofertaDeViaje';

/**
 * DISPATCH-DRIVER-SURFACES-1 — la oferta que le llega al conductor.
 *
 * El despacho ya existía entero en el servidor. Lo que se comprueba aquí es la
 * cabeza de la pantalla: qué se enseña, cuánto queda y qué se puede pulsar.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const despojarComentarios = fuente => fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(linea => !linea.trim().startsWith('//')).join('\n');

/** Una oferta como la que manda `dispatchTripToDrivers`, sin inventar campos. */
const ofertaCruda = (extra = {}) => ({
  id: 'trip_abc',
  passengerId: 'passenger_1',
  passengerName: 'Ana Cliente',
  pickup: { lat: 10.6427, lng: -71.6125, address: 'Vereda del Lago' },
  destination: { lat: 10.65, lng: -71.60, address: 'Sambil' },
  rideType: 'MOTO',
  paymentMethod: 'CASH',
  status: 'SEARCHING',
  fareUSD: 3.2,
  fareVES: 0,
  distanceKm: 2.15,
  durationMin: 5,
  offeredDriverId: 'driver_1',
  distanceToPickupKm: 0.8,
  candidatesCount: 2,
  offerExpiresAt: 1_000_000 + 15_000,
  ...extra
});

// ---------------------------------------------------------------------------
// Leer la oferta
// ---------------------------------------------------------------------------

test('la oferta se lee del viaje REAL, sin inventar nada', () => {
  const oferta = leerOferta(ofertaCruda());
  assert.ok(oferta);
  assert.equal(oferta.viajeId, 'trip_abc');
  assert.equal(oferta.tipo, 'MOTO');
  assert.equal(oferta.dolares, 3.2);
  assert.equal(oferta.distanciaKm, 2.15);
  assert.equal(oferta.distanciaHastaRecogidaKm, 0.8);
  assert.equal(oferta.minutos, 5);
  assert.equal(oferta.formaDePago, 'Efectivo');
  assert.equal(oferta.recogida.direccion, 'Vereda del Lago');
  assert.equal(oferta.destino.direccion, 'Sambil');
  assert.equal(oferta.venceEn, 1_015_000);

  // `fareVES: 0` con la tasa apagada NO es un precio: se deja en null para que
  // la pantalla no escriba «Bs. 0,00», que sería una cifra falsa.
  assert.equal(oferta.bolivares, null);
});

test('MEDIA oferta no se enseña', () => {
  // Quien decide en quince segundos no puede permitirse un dato a medias. Sin
  // viaje, sin recogida o sin vencimiento no hay superficie que pintar.
  for (const roto of [
    { id: undefined },
    { id: '' },
    { pickup: null },
    { pickup: { lat: 'x', lng: -71 } },
    { offerExpiresAt: undefined },
    { offerExpiresAt: 'pronto' }
  ]) {
    assert.equal(leerOferta(ofertaCruda(roto)), null, JSON.stringify(roto));
  }
  for (const basura of [null, undefined, 'oferta', 42, []]) {
    assert.equal(leerOferta(basura), null);
  }
});

test('lo que el servidor no manda se queda en null, no en cero', () => {
  const oferta = leerOferta(ofertaCruda({
    fareUSD: undefined, distanceKm: undefined, durationMin: undefined,
    destination: null, distanceToPickupKm: undefined
  }));
  assert.ok(oferta);
  assert.equal(oferta.dolares, null);
  assert.equal(oferta.distanciaKm, null);
  assert.equal(oferta.minutos, null);
  assert.equal(oferta.destino, null);
  assert.equal(oferta.distanciaHastaRecogidaKm, null);
  // Pero sigue siendo pintable: hay viaje, recogida y reloj.
  assert.equal(oferta.viajeId, 'trip_abc');
});

test('el auto viaja como CAR y se enseña como Auto', () => {
  assert.equal(leerOferta(ofertaCruda({ rideType: 'CAR' })).tipo, 'AUTO');
  assert.equal(leerOferta(ofertaCruda({ rideType: 'MOTO' })).tipo, 'MOTO');
  // Cualquier otra cosa cae a moto, igual que hace `calculateFare`.
  assert.equal(leerOferta(ofertaCruda({ rideType: 'HELICOPTERO' })).tipo, 'MOTO');
});

test('las formas de pago se dicen en español', () => {
  assert.equal(formaDePagoEnPantalla('CASH'), 'Efectivo');
  assert.equal(formaDePagoEnPantalla('WALLET'), 'Saldo');
  assert.equal(formaDePagoEnPantalla('PAGO_MOVIL'), 'Pago móvil');
  // Una desconocida no rompe la pantalla ni enseña un código en bruto.
  assert.equal(formaDePagoEnPantalla('CRIPTO'), 'Efectivo');
  assert.equal(formaDePagoEnPantalla(undefined), 'Efectivo');
});

// ---------------------------------------------------------------------------
// El reloj
// ---------------------------------------------------------------------------

test('el reloj cuenta contra el vencimiento DEL SERVIDOR, no desde quince', () => {
  const vence = 1_015_000;

  // Recién ofrecida: quince.
  assert.equal(segundosRestantes(vence, 1_000_000), 15);
  // Si la oferta tardó dos segundos en llegar, quedan trece. Prometer quince
  // sería regalar un tiempo que no existe y que el servidor no va a respetar.
  assert.equal(segundosRestantes(vence, 1_002_000), 13);
  assert.equal(segundosRestantes(vence, 1_014_500), 1);
  // Nunca negativo.
  assert.equal(segundosRestantes(vence, 1_020_000), 0);
  assert.equal(segundosRestantes(vence, 1_015_000), 0);
});

test('una oferta vencida está vencida', () => {
  const oferta = leerOferta(ofertaCruda());
  assert.equal(estaVencida(oferta, 1_010_000), false);
  assert.equal(estaVencida(oferta, 1_015_000), true);
  assert.equal(estaVencida(oferta, 1_020_000), true);
  assert.equal(estaVencida(null, 1_000_000), true, 'sin oferta no hay nada que aceptar');
});

// ---------------------------------------------------------------------------
// Los candados
// ---------------------------------------------------------------------------

test('DOBLE TOQUE: el segundo no manda una segunda aceptación', () => {
  const oferta = leerOferta(ofertaCruda());
  const ahora = 1_005_000;

  // El primero sí.
  assert.equal(sePuedeAceptar('OFERTA', oferta, ahora), true);
  // Y en cuanto la aceptación está en camino, el segundo no. El candado vive
  // en el estado, no en el botón: entre el toque y el repintado cabe otro dedo.
  assert.equal(sePuedeAceptar('ACEPTANDO', oferta, ahora), false);
  assert.equal(sePuedeRechazar('ACEPTANDO', oferta, ahora), false);
});

test('NUNCA se acepta una oferta vencida', () => {
  const oferta = leerOferta(ofertaCruda());
  assert.equal(sePuedeAceptar('OFERTA', oferta, 1_015_001), false);
  assert.equal(sePuedeRechazar('OFERTA', oferta, 1_015_001), false);

  // El servidor también la rechazaría —su sesión de despacho ya pasó a otro—
  // pero dejar pulsar algo que no puede funcionar es prometer una carrera que
  // ya no existe.
});

test('sin oferta delante no se puede aceptar nada', () => {
  for (const estado of ESTADOS_DE_OFERTA) {
    assert.equal(sePuedeAceptar(estado, null, 1_000_000), false, estado);
  }
});

test('sólo desde OFERTA se puede responder', () => {
  const oferta = leerOferta(ofertaCruda());
  for (const estado of ESTADOS_DE_OFERTA) {
    const esperado = estado === 'OFERTA';
    assert.equal(sePuedeAceptar(estado, oferta, 1_005_000), esperado, estado);
  }
});

// ---------------------------------------------------------------------------
// Sin cola
// ---------------------------------------------------------------------------

test('una oferta nueva SUSTITUYE, salvo con una aceptación en vuelo', () => {
  // El despacho ofrece de uno en uno: si llega otra es porque la anterior ya no
  // vale. Guardar la vieja sería inventar una cola que el servidor no tiene.
  for (const estado of ['ESPERANDO', 'OFERTA', 'EXPIRADA', 'RECHAZADA', 'ERROR', 'ACEPTADA', 'OFFLINE']) {
    assert.equal(debeSustituirLaOferta(estado), true, estado);
  }
  // Menos aquí: cambiar la pantalla debajo del dedo mientras se resuelve es la
  // forma más fácil de que alguien acepte una carrera que no quería.
  assert.equal(debeSustituirLaOferta('ACEPTANDO'), false);
});

// ---------------------------------------------------------------------------
// El contrato con el servidor
// ---------------------------------------------------------------------------

test('el evento y los dos emisores son los que el servidor ya tenía', () => {
  const raizProyecto = path.resolve(raizMovil, '..');
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');

  // Nada de esto se ha creado en esta fase: ya existía.
  assert.match(servidor, /emit\('rideRequested', offer\)/);
  assert.match(servidor, /on\('rideAccepted'/);
  assert.match(servidor, /on\('rideRejected'/);
  assert.match(servidor, /offerExpiresAt: Date\.now\(\) \+ 15000/);

  // Y el cliente lo escucha y lo emite con el mismo nombre.
  const eventos = leer('realtime/eventos.ts');
  // Que esté en los ESCUCHADOS —el array que termina en `EventoDelServidor`— y
  // no en la lista de pendientes, que es donde vivía antes de esta fase.
  assert.match(eventos, /'rideRequested'\s*\]\s*as const;\s*export type EventoDelServidor/);
  const pendientes = /EVENTOS_PENDIENTES = \[([\s\S]*?)\] as const;/.exec(eventos);
  assert.ok(pendientes && !pendientes[1].includes("'rideRequested'"), 'ya no está pendiente');

  const socket = despojarComentarios(leer('realtime/socket.ts'));
  assert.match(socket, /socket\.emit\('rideAccepted', \{ tripId: viajeId \}\)/);
  assert.match(socket, /socket\.emit\('rideRejected', \{ tripId: viajeId \}\)/);
  // La identidad NO viaja en el mensaje: el servidor la saca de la sesión.
  assert.ok(!/rideAccepted'[^)]*driverId/.test(socket), 'la identidad no va en el payload');
});

test('la superficie no inventa ni un dato ni un color', () => {
  const superficie = despojarComentarios(leer('conductor/SuperficieDeOferta.tsx'));

  // Todo sale del tema aprobado; no hay colores escritos a mano.
  const literales = superficie.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(literales, [], `colores a mano: ${literales.join(', ')}`);
  assert.match(superficie, /useTema\(\)/);

  // Y no hay textos de relleno.
  for (const demo of ['Lorem', 'ejemplo', 'Calle Falsa', 'demo', '4.5', '$5.00']) {
    assert.ok(!superficie.includes(demo), `dato de demostración: ${demo}`);
  }

  // Lo que no se sabe se dice, no se rellena con un cero.
  assert.match(superficie, /'—'/);
});

test('sólo se escucha en servicio, y la superficie va ENCIMA del inicio aprobado', () => {
  const pantalla = despojarComentarios(leer('app/conductor.tsx'));

  assert.match(pantalla, /useOfertaEnVivo\(\)/, 'la disponibilidad la decide el servidor');
  assert.match(pantalla, /<SuperficieDeOferta/);
  assert.match(pantalla, /pointerEvents="box-none"/, 'los toques llegan al mapa');

  // El inicio aprobado sigue montándose igual: la oferta se superpone.
  assert.match(pantalla, /<C2InicioConductor/);
  assert.match(pantalla, /modeloDelMapa=\{modeloDelMapa\}/, 'el mapa del conductor sigue');
  assert.match(pantalla, /onAlternar=\{alternar\}/, 'el disco de disponibilidad sigue');
});
