import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { leerDetalle } from '../domain/viajes.ts';
import { superficieDe } from '../domain/viajeActivo.ts';
import {
  datosDelViaje,
  tipoQueSeBusca,
  usaLaPantallaDelViaje
} from '../domain/superficieDelViaje.ts';

/**
 * Las superficies del viaje activo — ACTIVE-TRIP-SURFACES.
 *
 * QUÉ SE PROTEGE
 *
 * Que la pantalla diga la verdad sobre dónde está el conductor. «En camino»
 * cuando ya llegó, o «llega en 4 min» cuando nadie ha calculado ningún tiempo,
 * son mentiras pequeñas que se notan enseguida: la persona está mirando la
 * calle mientras lee.
 *
 * Y que los componentes no acaben sabiendo de `EN_ROUTE` ni de `pickup`. Esa
 * historia es del backend y no debe cruzar la frontera del presenter.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

/** Un viaje real, con el conductor asignado. */
const viajeEn = (estado, extra = {}) => leerDetalle({
  trip: {
    id: 'trip_1',
    status: estado,
    createdAt: '2026-09-01T12:14:00.000Z',
    pickup: { address: 'Calle 1' },
    destination: { address: 'Calle 9' },
    rideType: 'MOTO',
    paymentMethod: 'CASH',
    statusHistory: [{ status: estado, at: '2026-09-01T12:20:00.000Z' }],
    ...extra
  },
  passenger: { id: 'u_1', firstName: 'Ana', lastName: 'Pérez' },
  driver: {
    id: 'd_1',
    firstName: 'Luis',
    lastName: 'Gómez',
    vehicleBrand: 'Bera',
    vehicleModel: 'SBR',
    vehiclePlate: 'AB123CD',
    rating: 4.9
  }
});

// ---------------------------------------------------------------------------
// Cada estado, su superficie
// ---------------------------------------------------------------------------

test('SEARCHING usa la pantalla de buscar', () => {
  assert.equal(superficieDe(viajeEn('SEARCHING')), 'buscando');
  assert.equal(usaLaPantallaDelViaje('SEARCHING'), false, 'buscar no comparte pantalla con el viaje');
  assert.equal(datosDelViaje(viajeEn('SEARCHING')), null, 'se inventó un titular para buscar');
});

test('DRIVER_ASSIGNED dice «En camino»', () => {
  const datos = datosDelViaje(viajeEn('DRIVER_ASSIGNED'));
  assert.equal(datos.estado, 'En camino');
  assert.equal(datos.conductor, 'Luis Gómez');
  assert.equal(datos.iniciales, 'LG');
  assert.equal(datos.vehiculo, 'Bera SBR · AB123CD');
  assert.equal(datos.valoracion, '4,9');
  assert.equal(datos.origen, 'Calle 1');
  assert.equal(datos.destino, 'Calle 9');
});

test('ARRIVED dice que LLEGÓ, y no «En camino»', () => {
  // La variante que faltaba. Mismo layout, otro texto.
  const datos = datosDelViaje(viajeEn('ARRIVED'));
  assert.equal(datos.estado, 'Tu conductor llegó');
  assert.equal(datos.aclaracion, 'Ya está en el punto de recogida');

  assert.equal(/en camino/i.test(datos.estado), false);
  assert.equal(/en camino/i.test(datos.aclaracion ?? ''), false);
});

test('ARRIVED no inventa ningún tiempo', () => {
  // «Faltan X minutos» cuando ya está abajo es la peor forma de perder la
  // confianza de quien mira la calle mientras lee.
  const datos = datosDelViaje(viajeEn('ARRIVED'));
  assert.equal(/\d+\s*min|llega en|faltan/i.test(datos.aclaracion ?? ''), false);
});

test('IN_PROGRESS dice que el viaje va en curso', () => {
  const datos = datosDelViaje(viajeEn('IN_PROGRESS'));
  assert.equal(datos.estado, 'Viaje en curso');
  // Ni buscando, ni en camino, ni llegó.
  assert.equal(/buscando|en camino|lleg[óo]/i.test(datos.estado), false);
});

test('los tres estados comparten la MISMA pantalla', () => {
  // La variante de ARRIVED es de datos, no una pantalla nueva.
  for (const estado of ['DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS']) {
    assert.equal(usaLaPantallaDelViaje(estado), true, `«${estado}» se quedó sin pantalla`);
  }

  const ruta = sinComentarios('app/viaje-activo.tsx');
  // Un solo `C2Viaje` para los tres.
  assert.equal((ruta.match(/<C2Viaje/g) ?? []).length, 1, 'se duplicó la pantalla del viaje');
  assert.equal((ruta.match(/<C2BuscandoVehiculo/g) ?? []).length, 1);
});

test('los terminales dejan de ser superficie activa', () => {
  for (const estado of ['COMPLETED', 'CANCELLED']) {
    assert.equal(superficieDe(viajeEn(estado)), null);
    assert.equal(usaLaPantallaDelViaje(estado), false);
    assert.equal(datosDelViaje(viajeEn(estado)), null);
  }
});

test('un estado desconocido no fabrica pantalla', () => {
  // Si el servidor empieza a mandar uno nuevo, la aplicación no se lo inventa.
  assert.equal(datosDelViaje(viajeEn('ALGO_NUEVO')), null);
  assert.equal(usaLaPantallaDelViaje('ALGO_NUEVO'), false);
});

// ---------------------------------------------------------------------------
// Lo que no está, no se pinta
// ---------------------------------------------------------------------------

test('sin ETA del backend, el hueco se queda VACÍO', () => {
  // El diseño tiene sitio para «llega en 4 min» y el backend no calcula ningún
  // tiempo de llegada: `durationMin` es lo que dura el viaje entero.
  assert.equal(datosDelViaje(viajeEn('DRIVER_ASSIGNED')).aclaracion, null);
  assert.equal(datosDelViaje(viajeEn('IN_PROGRESS')).aclaracion, null);

  // Y no se usa `durationMin` como sucedáneo.
  const presenter = sinComentarios('domain/superficieDelViaje.ts');
  // `eta` con limites: sin ellos, «D-eta-lleReal» da un falso positivo.
  assert.equal(
    /durationMin|distanceKm|eta/i.test(presenter), false,
    'se está fabricando un ETA'
  );
});

test('un conductor sin valoración no recibe un 0,0', () => {
  // Un conductor recién aprobado tiene cero viajes, no una nota de cero.
  const sinNota = leerDetalle({
    trip: { id: 't', status: 'ARRIVED', pickup: {}, destination: {}, statusHistory: [] },
    driver: { id: 'd_1', firstName: 'Luis', rating: 0 }
  });
  assert.equal(sinNota.conductor.valoracion, null);
  assert.equal(datosDelViaje(sinNota).valoracion, null);

  // Y la pantalla no pinta el separador colgando.
  const pantalla = sinComentarios('preview/pantallasC2.tsx');
  assert.match(pantalla, /viaje\.valoracion === null \? viaje\.vehiculo/);
});

test('sin conductor asignado no se inventa vehículo', () => {
  const sinConductor = leerDetalle({
    trip: { id: 't', status: 'DRIVER_ASSIGNED', pickup: {}, destination: {}, statusHistory: [] },
    driver: null
  });
  const datos = datosDelViaje(sinConductor);
  assert.equal(datos.conductor, '');
  assert.equal(datos.vehiculo, '', 'se pintó un vehículo sin conductor');
  assert.equal(datos.iniciales, '');
});

test('sin placa, el vehículo no arrastra el separador', () => {
  const conVehiculo = leerDetalle({
    trip: { id: 't', status: 'ARRIVED', pickup: {}, destination: {}, rideType: 'MOTO', statusHistory: [] },
    driver: { id: 'd_1', firstName: 'Luis', vehicleBrand: 'Bera', vehicleModel: 'SBR' }
  });
  assert.equal(datosDelViaje(conVehiculo).vehiculo, 'Bera SBR');
});

// ---------------------------------------------------------------------------
// El backend no cruza la frontera
// ---------------------------------------------------------------------------

test('los alias del backend NO llegan a los componentes', () => {
  // `EN_ROUTE`, `IN_TRIP` y compañía son historia del servidor. Meterlos en una
  // pantalla la ata a esa historia para siempre.
  for (const pantalla of ['preview/pantallasC2.tsx', 'preview/pantallasC2Secciones.tsx']) {
    const codigo = despojarComentarios(leer(pantalla));
    for (const alias of ['EN_ROUTE', 'IN_TRIP', 'DRIVER_ARRIVED', 'PENDING']) {
      assert.equal(codigo.includes(alias), false, `${pantalla} conoce «${alias}»`);
    }
  }
});

test('los componentes no conocen los estados del backend', () => {
  const codigo = despojarComentarios(leer('preview/pantallasC2.tsx'));
  for (const estado of ['SEARCHING', 'DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS']) {
    assert.equal(codigo.includes(estado), false, `la pantalla decide sobre «${estado}»`);
  }
  // La decisión vive en el presenter y en la ruta.
  assert.match(leer('domain/superficieDelViaje.ts'), /ARRIVED: 'Tu conductor llegó'/);
});

test('el presenter no toca red ni React', () => {
  const presenter = leer('domain/superficieDelViaje.ts');
  assert.equal(/from 'react|services\/|fetch\(/.test(presenter), false);
});

test('el tipo de vehículo se traduce fuera del componente', () => {
  // El servidor dice CAR; la pantalla habla de AUTO.
  assert.equal(tipoQueSeBusca(viajeEn('SEARCHING', { rideType: 'CAR' })), 'AUTO');
  assert.equal(tipoQueSeBusca(viajeEn('SEARCHING', { rideType: 'MOTO' })), 'MOTO');
  assert.equal(tipoQueSeBusca(viajeEn('SEARCHING', { rideType: '' })), 'MOTO', 'sin tipo, la moto');
});

// ---------------------------------------------------------------------------
// Reanudar, reconectar, fallar
// ---------------------------------------------------------------------------

test('al abrir la aplicación con un viaje en marcha, se vuelve a él', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /viajeActivo\.fase === 'CON_VIAJE'/);
  assert.match(inicio, /router\.replace\('\/viaje-activo'\)/);
});

test('NO se salta de pantalla mientras el estado puede estar viejo', () => {
  // Durante RESINCRONIZANDO o ERROR lo que se sabe puede no valer, y un salto
  // de pantalla es lo más brusco que puede hacer una aplicación sola.
  const inicio = sinComentarios('app/pasajero.tsx');
  const efecto = inicio.slice(inicio.indexOf('useEffect'), inicio.indexOf('if (sesion.estado'));
  assert.equal(/RESINCRONIZANDO|ERROR/.test(efecto), false);
});

test('resincronizar NO enseña «no tienes viaje»', () => {
  // La pantalla se apoya en el viaje CONOCIDO, no en la fase: durante el ida y
  // vuelta se sigue enseñando lo último que se supo.
  const ruta = sinComentarios('app/viaje-activo.tsx');
  assert.match(ruta, /const \{ estado, viaje \} = useViajeActivo\(\)/);
  assert.match(ruta, /if \(viaje === null\)/, 'la pantalla decide por la fase y no por el viaje');
  // Sólo el SIN_VIAJE del servidor saca de aquí.
  assert.match(ruta, /if \(estado\.fase === 'SIN_VIAJE'\) router\.replace/);
});

test('un fallo de red conserva la superficie', () => {
  // `viajeConocido` devuelve el último viaje también en ERROR, así que la
  // pantalla no cambia. Es la garantía de REALTIME-2, consumida aquí.
  const ruta = sinComentarios('app/viaje-activo.tsx');
  assert.equal(/fase === 'ERROR'/.test(ruta), false, 'la pantalla reacciona al error');
});

test('el viaje terminado saca de la pantalla sin dejarla en la pila', () => {
  const ruta = sinComentarios('app/viaje-activo.tsx');
  assert.match(ruta, /router\.replace\('\/pasajero'\)/);
  assert.equal(/router\.push\(/.test(ruta), false, 'apila la pantalla del viaje');
});

// ---------------------------------------------------------------------------
// Lo que esta fase sigue sin hacer
// ---------------------------------------------------------------------------

test('cancelar todavía NO está conectado', () => {
  // Emitir `rideCancelled` es despacho. El botón se queda como en el recorrido
  // de diseño: sin manejador, no hace nada.
  const ruta = sinComentarios('app/viaje-activo.tsx');
  assert.equal(/onCancelar=/.test(ruta), false, 'se conectó cancelar');
});

test('sigue sin emitirse nada de negocio', () => {
  for (const fichero of ['app/viaje-activo.tsx', 'domain/superficieDelViaje.ts', 'preview/pantallasC2.tsx']) {
    const codigo = despojarComentarios(leer(fichero));
    for (const evento of ['rideRequested', 'rideAccepted', 'rideCancelled', 'tripStatusUpdated', 'tripRated']) {
      assert.equal(new RegExp(`emit\\(['"\`]${evento}`).test(codigo), false, `${fichero} emite «${evento}»`);
    }
  }
});

test('el mapa sigue siendo el dibujo, sin nada nativo', () => {
  const dependencias = Object.keys(JSON.parse(leer('package.json')).dependencies ?? {});
  for (const prohibida of ['react-native-maps', 'expo-maps', 'expo-location']) {
    assert.equal(dependencias.includes(prohibida), false, `se instaló ${prohibida}`);
  }
  // La pantalla sigue usando el lienzo dibujado.
  assert.match(leer('preview/pantallasC2.tsx'), /<LienzoDeMapa/);
});

test('la calificación sigue sin conectarse', () => {
  const ruta = sinComentarios('app/viaje-activo.tsx');
  assert.equal(/rating|calificar|valorar/i.test(ruta), false);
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

test('la ruta real no importa datos de demostración', () => {
  assert.equal(
    /from ['"][^'"]*preview\/fixtures/.test(leer('app/viaje-activo.tsx')), false
  );
});

test('en release, sin datos, la pantalla del viaje se pinta VACÍA', () => {
  // El fixture es el respaldo sólo en desarrollo, como en el perfil y en la
  // bandeja. «Demo Conductor» en el viaje de alguien real sería lo peor.
  const pantalla = sinComentarios('preview/pantallasC2.tsx');
  assert.match(pantalla, /datos \?\? \(EN_DESARROLLO \? VIAJE_DE_EJEMPLO : VIAJE_EN_BLANCO\)/);
  assert.match(pantalla, /const EN_DESARROLLO = typeof __DEV__/);
});

test('el recorrido de diseño sigue aislado', () => {
  for (const nombre of fs.readdirSync(path.join(raizMovil, 'app/diseno'), { recursive: true })) {
    const completa = path.join(raizMovil, 'app/diseno', String(nombre));
    if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
    const codigo = fs.readFileSync(completa, 'utf8');
    assert.equal(/ViajeActivo|realtime|superficieDelViaje/.test(codigo), false,
      `app/diseno/${nombre} toca el viaje real`);
  }
});
