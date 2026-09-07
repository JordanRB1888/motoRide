import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EDAD_SOSPECHOSA_MS,
  VENTANA_BUSCANDO_MS,
  esViajeActivo,
  esViajeObsoleto,
  viajeActivoDe,
  viajeQueOcupaAlConductor
} from '../domain/viajeActivo.js';

/**
 * Un viaje no terminal no puede bloquear a alguien y esconderse de el.
 *
 * EL FALLO QUE ESTO PROTEGE
 *
 * Habia dos criterios de «viaje activo» y no coincidian. El despacho daba por
 * ocupado a un conductor sin limite de tiempo; `/api/trips/active/me` dejaba de
 * devolver el viaje a las doce horas. Pasadas esas horas el conductor no recibia
 * carreras y su aplicacion ya no le enseniaba el viaje que se lo impedia: no
 * podia cerrarlo porque no podia verlo.
 *
 * Paso de verdad, y hubo que cancelar el viaje desde administracion para
 * desbloquear al conductor de pruebas.
 */

const AHORA = Date.UTC(2026, 8, 5, 12, 0, 0);
const haceHoras = (horas) => new Date(AHORA - horas * 60 * 60 * 1000).toISOString();

const viaje = (status, horas, extra = {}) => ({
  id: `trip_${status}_${horas}h`,
  status,
  createdAt: haceHoras(horas),
  passengerId: 'pasajera_1',
  driverId: 'conductor_1',
  ...extra
});

const CON_CONDUCTOR = ['DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS'];

test('un viaje con conductor de más de 12 h SIGUE siendo activo', () => {
  // Esta es la regla entera. Mientras ocupe a alguien, se ve.
  for (const estado of CON_CONDUCTOR) {
    const v = viaje(estado, 20);
    assert.equal(esViajeActivo(v, AHORA), true, `${estado} de 20 h dejó de contar`);
  }
});

test('lo que bloquea al conductor es EXACTAMENTE lo que ve su aplicación', () => {
  // Los dos lados del fallo, comparados directamente. Si esto se rompe, vuelve
  // el conductor que no recibe carreras y no sabe por qué.
  for (const estado of CON_CONDUCTOR) {
    for (const horas of [0, 1, 11, 13, 48, 240]) {
      const trips = [viaje(estado, horas)];
      const bloquea = viajeQueOcupaAlConductor(trips, 'conductor_1', AHORA) !== null;
      const loVeElConductor = viajeActivoDe(trips, 'conductor_1', AHORA) !== null;
      const loVeLaPasajera = viajeActivoDe(trips, 'pasajera_1', AHORA) !== null;

      assert.equal(bloquea, loVeElConductor,
        `${estado} a las ${horas} h: bloquea=${bloquea} pero el conductor lo ve=${loVeElConductor}`);
      assert.equal(bloquea, loVeLaPasajera,
        `${estado} a las ${horas} h: bloquea=${bloquea} pero la pasajera lo ve=${loVeLaPasajera}`);
    }
  }
});

test('los viejos se MARCAN, no se apagan', () => {
  // Marcar es decir «esto lleva demasiado abierto». Apagar seria cerrar una
  // carrera que nadie ha pedido cerrar, y eso mueve dinero.
  const reciente = viaje('IN_PROGRESS', 1);
  const viejo = viaje('IN_PROGRESS', 20);

  assert.equal(esViajeObsoleto(reciente, AHORA), false);
  assert.equal(esViajeObsoleto(viejo, AHORA), true);
  // Marcado, pero sigue activo: la marca no lo saca de en medio.
  assert.equal(esViajeActivo(viejo, AHORA), true);
});

test('buscando conductor SÍ caduca, y esto es a propósito', () => {
  // Un `SEARCHING` viejo no bloquea a nadie --no hay conductor asignado-- y
  // reaparecer como activo dias despues seria enseniar una busqueda muerta.
  assert.equal(esViajeActivo(viaje('SEARCHING', 0, { driverId: null }), AHORA), true);

  const caducado = { ...viaje('SEARCHING', 0, { driverId: null }),
    createdAt: new Date(AHORA - VENTANA_BUSCANDO_MS - 1000).toISOString() };
  assert.equal(esViajeActivo(caducado, AHORA), false);
  // Y no se marca como obsoleto: sencillamente ya no es activo.
  assert.equal(esViajeObsoleto(caducado, AHORA), false);
});

test('los terminales no son activos, tengan la edad que tengan', () => {
  for (const estado of ['COMPLETED', 'CANCELLED']) {
    for (const horas of [0, 1, 20]) {
      assert.equal(esViajeActivo(viaje(estado, horas), AHORA), false, `${estado} a las ${horas} h`);
    }
  }
});

test('los alias históricos cuentan igual', () => {
  // `EN_ROUTE` e `IN_TRIP` siguen en la persistencia. Si dejaran de contar, un
  // viaje viejo bloquearía al conductor sin aparecer por ningún lado.
  for (const estado of ['EN_ROUTE', 'IN_TRIP']) {
    const trips = [viaje(estado, 20)];
    assert.equal(viajeQueOcupaAlConductor(trips, 'conductor_1', AHORA) !== null, true);
    assert.equal(viajeActivoDe(trips, 'conductor_1', AHORA) !== null, true);
  }
});

test('el umbral de sospecha son doce horas', () => {
  assert.equal(EDAD_SOSPECHOSA_MS, 12 * 60 * 60 * 1000);
  const justoAntes = { ...viaje('ARRIVED', 0),
    createdAt: new Date(AHORA - EDAD_SOSPECHOSA_MS + 1000).toISOString() };
  const justoDespues = { ...viaje('ARRIVED', 0),
    createdAt: new Date(AHORA - EDAD_SOSPECHOSA_MS - 1000).toISOString() };
  assert.equal(esViajeObsoleto(justoAntes, AHORA), false);
  assert.equal(esViajeObsoleto(justoDespues, AHORA), true);
});

test('el viaje de otra persona no es el mío', () => {
  const trips = [viaje('IN_PROGRESS', 1)];
  assert.equal(viajeActivoDe(trips, 'alguien_mas', AHORA), null);
  assert.equal(viajeQueOcupaAlConductor(trips, 'otro_conductor', AHORA), null);
});

test('la pasajera: activa sólo cuando un viaje de verdad la ocupa', () => {
  // Esta es la autoridad que ahora comparten el guard de creacion y
  // `/api/trips/active/me`: lo que bloquea crear es exactamente lo que la
  // aplicacion le ensenia. Se comprueba el booleano esperado estado por estado.
  const casos = [
    { estado: 'SEARCHING', horas: 0, driver: null, activo: true },   // buscando, recien pedido
    { estado: 'SEARCHING', horas: 1, driver: null, activo: false },  // buscando caducado (>3 min): no bloquea ni se ve
    { estado: 'DRIVER_ASSIGNED', horas: 0, driver: 'conductor_1', activo: true },
    { estado: 'DRIVER_ASSIGNED', horas: 48, driver: 'conductor_1', activo: true }, // con conductor no caduca
    { estado: 'ARRIVED', horas: 2, driver: 'conductor_1', activo: true },
    { estado: 'IN_PROGRESS', horas: 2, driver: 'conductor_1', activo: true },
    { estado: 'COMPLETED', horas: 0, driver: 'conductor_1', activo: false },
    { estado: 'CANCELLED', horas: 0, driver: 'conductor_1', activo: false }
  ];
  for (const c of casos) {
    const trips = [viaje(c.estado, c.horas, { driverId: c.driver })];
    const enLaApp = viajeActivoDe(trips, 'pasajera_1', AHORA) !== null;
    assert.equal(enLaApp, c.activo, `${c.estado} a las ${c.horas} h: se esperaba activo=${c.activo}`);
  }
});

test('todos los alias históricos cuentan como activo para la pasajera', () => {
  // `EN_ROUTE`/`IN_TRIP` ya estaban en la lista cruda; `PENDING`/`ACCEPTED`/
  // `DRIVER_ARRIVING`/`DRIVER_ARRIVED` sólo cuentan si la autoridad normaliza.
  // Si dejaran de contar, una pasajera con un viaje guardado con nombre
  // historico podria crear un segundo, o quedar bloqueada sin verlo.
  for (const estado of ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_TRIP']) {
    const sinConductor = estado === 'PENDING';   // PENDING normaliza a SEARCHING
    const trips = [viaje(estado, 0, { driverId: sinConductor ? null : 'conductor_1' })];
    assert.equal(viajeActivoDe(trips, 'pasajera_1', AHORA) !== null, true, `${estado} no contó como activo`);
  }
});
