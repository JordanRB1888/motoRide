import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MARGEN_DE_RESPUESTA_MS,
  estadoTrasRechazoDeAceptacion,
  leerOferta,
  sePuedeAceptar,
  seQuedoSinRespuesta
} from '../domain/ofertaDeViaje.ts';
import { leerDetalle } from '../domain/viajes.ts';

/**
 * Los dos segundos malos: aceptar justo al vencer, y reintentar lo ya creado.
 *
 * QUÉ SE PROTEGE
 *
 * Que «aceptando…» no dure para siempre. Un botón girando sin salida no es un
 * detalle visual: mientras dura, ese conductor no puede recibir ninguna carrera,
 * y la única forma de salir era cerrar la aplicación.
 *
 * Y que la respuesta del servidor se pueda leer. Toda creación contestaba «el
 * viaje se creó pero no se pudo leer», aunque hubiera salido bien.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const AHORA = 1_700_000_000_000;

const ofertaCruda = (venceEn) => ({
  id: 'trip_borde_1',
  pickup: { lat: 10.64, lng: -71.61, address: 'Vereda del Lago' },
  destination: { lat: 10.66, lng: -71.60, address: 'Sambil' },
  rideType: 'MOTO',
  distanceKm: 2.2,
  durationMin: 5,
  fareUSD: 3.2,
  paymentMethod: 'CASH',
  offerExpiresAt: venceEn
});

const oferta = (venceEn) => leerOferta(ofertaCruda(venceEn));

// ---------------------------------------------------------------------------
// A. Aceptar antes de que venza
// ---------------------------------------------------------------------------

test('A · aceptar con tiempo por delante funciona como siempre', () => {
  const viva = oferta(AHORA + 5_000);
  assert.equal(sePuedeAceptar('OFERTA', viva, AHORA), true);
  // Y estando en vuelo, nada la da por perdida todavía.
  assert.equal(seQuedoSinRespuesta('ACEPTANDO', viva, AHORA), false);
});

// ---------------------------------------------------------------------------
// B. Aceptar justo en el segundo del vencimiento
// ---------------------------------------------------------------------------

test('B · una aceptación en vuelo NUNCA se queda girando para siempre', () => {
  const justa = oferta(AHORA);

  // Al vencer, la respuesta todavía puede estar llegando: no se corta.
  assert.equal(seQuedoSinRespuesta('ACEPTANDO', justa, AHORA), false);
  assert.equal(seQuedoSinRespuesta('ACEPTANDO', justa, AHORA + MARGEN_DE_RESPUESTA_MS - 1), false);

  // Pasado el margen sin que nadie conteste, se cierra. Este es el caso que
  // dejaba la pantalla muerta.
  assert.equal(seQuedoSinRespuesta('ACEPTANDO', justa, AHORA + MARGEN_DE_RESPUESTA_MS), true);
  assert.equal(seQuedoSinRespuesta('ACEPTANDO', justa, AHORA + 60_000), true);
});

test('B · el servidor manda: su negativa cierra la pantalla en el acto', () => {
  // Llegar tarde no es un error: es que se acabó el tiempo, y así se cuenta.
  for (const motivo of ['NO_ACTIVE_OFFER', 'NOT_CURRENT_OFFER', 'TRIP_NOT_SEARCHING', 'ALREADY_ACCEPTED']) {
    assert.equal(estadoTrasRechazoDeAceptacion(motivo), 'EXPIRADA', motivo);
  }
  // Lo demás sí son fallos de verdad.
  for (const motivo of ['DRIVER_NOT_APPROVED', 'PERSISTENCE_FAILED', 'INVALID_TRIP_ID', null, undefined, 42]) {
    assert.equal(estadoTrasRechazoDeAceptacion(motivo), 'ERROR', String(motivo));
  }
});

test('B · la red de seguridad NO toca los demás estados', () => {
  // Sólo cierra lo que está en vuelo. Una oferta viva sigue viva, y un cierre
  // ya resuelto no se vuelve a tocar.
  const vencida = oferta(AHORA - 60_000);
  for (const estado of ['OFERTA', 'ESPERANDO', 'ACEPTADA', 'RECHAZADA', 'EXPIRADA', 'ERROR', 'OFFLINE']) {
    assert.equal(seQuedoSinRespuesta(estado, vencida, AHORA), false, estado);
  }
  // Y sin oferta no hay nada que cerrar.
  assert.equal(seQuedoSinRespuesta('ACEPTANDO', null, AHORA), false);
});

// ---------------------------------------------------------------------------
// C. Después de vencer, el conductor sigue sirviendo
// ---------------------------------------------------------------------------

test('C · tras vencer se puede recibir la siguiente oferta', () => {
  const dominio = fs.readFileSync(path.join(aqui, '..', 'domain', 'ofertaDeViaje.ts'), 'utf8');
  // `ACEPTANDO` es el ÚNICO estado que retiene una oferta nueva. Si la pantalla
  // se quedara ahí clavada, no entraría ninguna más: por eso importa que salga.
  assert.match(dominio, /export function debeSustituirLaOferta[\s\S]{0,160}estado !== 'ACEPTANDO'/);

  // Y el hook resuelve ese estado por las dos vías: la negativa del servidor y
  // la red de seguridad.
  const hook = fs.readFileSync(path.join(aqui, '..', 'realtime', 'OfertaEnVivo.tsx'), 'utf8');
  assert.match(hook, /useEvento\('rideAcceptanceFailed'/);
  assert.match(hook, /seQuedoSinRespuesta\(estado, oferta, ahora\)/);
});

test('C · el cliente ESCUCHA la negativa de aceptación', () => {
  // Estaba entre los pendientes, y por eso la pantalla se quedaba girando: el
  // servidor lo mandaba desde siempre y aquí no lo oía nadie.
  const eventos = fs.readFileSync(path.join(aqui, '..', 'realtime', 'eventos.ts'), 'utf8');
  const escuchados = /EVENTOS_DEL_SERVIDOR = \[([\s\S]*?)\] as const/.exec(eventos)[1];
  const pendientes = /EVENTOS_PENDIENTES = \[([\s\S]*?)\] as const/.exec(eventos)[1];
  assert.match(escuchados, /'rideAcceptanceFailed'/);
  assert.doesNotMatch(pendientes.replace(/\/\/[^\n]*/g, ''), /'rideAcceptanceFailed'/);
});

// ---------------------------------------------------------------------------
// D y E. La respuesta del servidor se lee, se cree o ya existiera
// ---------------------------------------------------------------------------

const sobre = (status, estadoDelViaje) => ({
  status,
  ...(status === 'existing' ? { idempotentReplay: true } : {}),
  trip: {
    id: 'trip_replay_1',
    status: estadoDelViaje,
    createdAt: '2026-09-05T03:00:00.000Z',
    pickup: { lat: 10.64, lng: -71.61, address: 'Vereda del Lago' },
    destination: { lat: 10.66, lng: -71.60, address: 'Sambil' },
    rideType: 'MOTO',
    paymentMethod: 'CASH',
    fareUSD: 3.2
  }
});

test('D · la respuesta de un reintento se lee igual que la de una creación', () => {
  // Las dos formas que devuelve el servidor, y las dos tienen que entenderse.
  const recienCreado = leerDetalle(sobre('created', 'SEARCHING'));
  const yaExistia = leerDetalle(sobre('existing', 'CANCELLED'));

  assert.notEqual(recienCreado, null, 'no se pudo leer una creación');
  assert.notEqual(yaExistia, null, 'no se pudo leer un reintento');

  // Mismo viaje, y el estado REAL del servidor, no uno inventado.
  assert.equal(recienCreado.id, 'trip_replay_1');
  assert.equal(yaExistia.id, 'trip_replay_1');
  assert.equal(yaExistia.estado, 'CANCELLED');
});

test('D · `crearViaje` le pasa a `leerDetalle` el sobre, no el viaje pelado', () => {
  // El fallo estaba justo aquí: se desenvolvía de más, así que `leerDetalle`
  // buscaba `trip.trip`, no lo encontraba, y TODA creación contestaba «el viaje
  // se creó pero no se pudo leer» aunque hubiera salido bien.
  const pedido = fs.readFileSync(path.join(aqui, '..', 'services', 'pedido.ts'), 'utf8');
  assert.match(pedido, /leerDetalle\(respuesta\.datos\)/);
  assert.doesNotMatch(pedido, /leerDetalle\(cuerpo\?\.trip/);
});

test('E · un cuerpo sin viaje sigue siendo ilegible, y se dice', () => {
  // El aviso tiene que seguir existiendo para cuando de verdad no haya viaje.
  assert.equal(leerDetalle({ status: 'created' }), null);
  assert.equal(leerDetalle({ status: 'created', trip: {} }), null, 'un viaje sin id no vale');
  assert.equal(leerDetalle(null), null);
});

// ---------------------------------------------------------------------------
// F · El reloj del contador es el del aparato
// ---------------------------------------------------------------------------

test('F · el proveedor ancla el vencimiento al instante en que recibe la oferta', () => {
  // El servidor manda cuánto queda; eso vale contra el reloj de este aparato.
  // Restar su marca absoluta contra `Date.now()` local metía en el contador
  // todo el desfase entre los dos relojes.
  const proveedor = fs.readFileSync(path.join(aqui, '..', 'realtime/OfertaEnVivo.tsx'), 'utf8');
  assert.match(proveedor, /const recibidaEn = Date\.now\(\);/);
  assert.match(proveedor, /leerOferta\(cuerpo, recibidaEn\)/);
});

test('F · una oferta que llega ya vencida NO se pinta', () => {
  // Ofrecería una carrera que el despacho ya le pasó a otro: el botón no haría
  // nada y quien conduce pensaría que la perdió por lento.
  const proveedor = fs.readFileSync(path.join(aqui, '..', 'realtime/OfertaEnVivo.tsx'), 'utf8');
  assert.match(proveedor, /if \(estaVencida\(leida, recibidaEn\)\) \{[\s\S]{0,200}?return;/);
});

test('F · al volver de segundo plano se recalcula el tiempo, no se reanuda', () => {
  // Android congela los temporizadores de lo que no está delante. Sin esto, al
  // volver se seguía descontando desde donde se quedó el contador y se
  // enseñaban segundos ya gastados con la pantalla apagada.
  const proveedor = fs.readFileSync(path.join(aqui, '..', 'realtime/OfertaEnVivo.tsx'), 'utf8');
  assert.match(proveedor, /AppState\.addEventListener\('change'/);
  assert.match(proveedor, /siguiente === 'active'\) setAhora\(Date\.now\(\)\)/);
  assert.match(proveedor, /suscripcion\.remove\(\)/, 'la suscripción se retira al dejar de contar');
});
