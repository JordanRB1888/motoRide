import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { leerDetalle, normalizarEstado } from '../domain/viajes.ts';
import {
  alCerrarSesion,
  alEmpezarAPreguntar,
  alFallar,
  alNoHaberViaje,
  alRecibirViaje,
  ESPERA_BASE_MS,
  ESTADO_INICIAL,
  esTerminal,
  puedeEstarViejo,
  REPARTO_MAXIMO_MS,
  retrasoDeRecarga,
  superficieDe,
  SUPERFICIE_DEL_ESTADO,
  viajeConocido
} from '../domain/viajeActivo.ts';

/**
 * El viaje activo — REALTIME-INTEGRATION-2.
 *
 * QUÉ SE PROTEGE
 *
 * Lo que sólo se rompe con red mala, que es como se usa esta aplicación de
 * verdad: una respuesta lenta que pisa a una rápida, un fallo de red que hace
 * desaparecer un viaje en curso, y una cuenta que hereda el viaje de la
 * anterior.
 *
 * Y la diferencia entre las dos máquinas de estados: la del negocio es del
 * servidor; la de aquí sólo dice en qué punto está la carga.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

/** Lo que devuelve `GET /api/trips/active/me` para un viaje en curso. */
const enCurso = (estado = 'IN_PROGRESS') => ({
  trip: {
    id: 'trip_activo',
    status: estado,
    createdAt: '2026-09-01T12:14:00.000Z',
    pickup: { address: 'Calle 1' },
    destination: { address: 'Calle 9' },
    rideType: 'MOTO',
    paymentMethod: 'CASH',
    fareUSD: 3.5,
    statusHistory: [
      { status: 'SEARCHING', at: '2026-09-01T12:14:00.000Z' },
      { status: estado, at: '2026-09-01T12:21:00.000Z' }
    ]
  },
  passenger: { id: 'u_1', firstName: 'Ana', lastName: 'Pérez' },
  driver: { id: 'd_1', firstName: 'Luis', lastName: 'Gómez', vehiclePlate: 'AB123CD' }
});

// ---------------------------------------------------------------------------
// Las dos máquinas de estados
// ---------------------------------------------------------------------------

test('la máquina de la CARGA no inventa estados de negocio', () => {
  // Meter «BUSCANDO_CONDUCTOR» aquí sería crear una segunda autoridad del
  // negocio en el teléfono.
  const dominio = despojarComentarios(leer('domain/viajeActivo.ts'));
  const fases = [...dominio.matchAll(/'([A-Z_]+)'/g)].map(coincidencia => coincidencia[1]);

  const delNegocio = ['SEARCHING', 'DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS'];
  const enFases = dominio.slice(dominio.indexOf('export const FASES'), dominio.indexOf('] as const'));
  for (const estado of delNegocio) {
    assert.equal(enFases.includes(estado), false, `«${estado}» se coló entre las fases de carga`);
  }
  assert.ok(fases.includes('ARRANCANDO') && fases.includes('RESINCRONIZANDO'));
});

test('los estados del negocio salen del contrato compartido', () => {
  // Nada de cadenas nuevas: la autoridad es `server/domain/tripStateMachine.js`
  // a través de `shared/contracts`.
  assert.match(leer('domain/viajes.ts'), /from '\.\.\/\.\.\/shared\/contracts\/domain'/);

  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/domain/tripStateMachine.js'), 'utf8');
  for (const estado of Object.keys(SUPERFICIE_DEL_ESTADO)) {
    assert.match(servidor, new RegExp(`${estado}:`), `«${estado}» no existe en el servidor`);
  }
});

test('los alias históricos siguen normalizándose', () => {
  assert.equal(normalizarEstado('EN_ROUTE'), 'DRIVER_ASSIGNED');
  assert.equal(normalizarEstado('IN_TRIP'), 'IN_PROGRESS');
  assert.equal(normalizarEstado('DRIVER_ARRIVED'), 'ARRIVED');

  // Y el viaje activo los lee ya normalizados.
  const detalle = leerDetalle(enCurso('IN_TRIP'));
  assert.equal(detalle.estado, 'IN_PROGRESS');
});

// ---------------------------------------------------------------------------
// El arranque
// ---------------------------------------------------------------------------

test('sin viaje, el estado queda limpio', () => {
  const estado = alNoHaberViaje();
  assert.equal(estado.fase, 'SIN_VIAJE');
  assert.equal(viajeConocido(estado), null);
});

test('con viaje, se guarda normalizado', () => {
  const viaje = leerDetalle(enCurso('DRIVER_ASSIGNED'));
  const estado = alRecibirViaje(viaje);
  assert.equal(estado.fase, 'CON_VIAJE');
  assert.equal(viajeConocido(estado).id, 'trip_activo');
  assert.equal(viajeConocido(estado).estado, 'DRIVER_ASSIGNED');
  assert.equal(puedeEstarViejo(estado), false);
});

test('el 204 se lee como «no hay viaje», no como fallo', () => {
  // `GET /api/trips/active/me` responde 204 sin cuerpo. Confundirlo con un
  // error dejaría el estado en ERROR para siempre.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const ruta = servidor.slice(servidor.indexOf("app.get('/api/trips/active/me'"));
  assert.match(ruta.slice(0, 600), /res\.status\(204\)\.end\(\)/);

  const servicio = sinComentarios('services/viajes.ts');
  assert.match(servicio, /respuesta\.datos === undefined \|\| respuesta\.datos === null/);
  assert.match(servicio, /return \{ ok: true, datos: null \};/);
});

test('cada estado del negocio tiene su superficie, o se declara que no', () => {
  assert.equal(superficieDe(leerDetalle(enCurso('SEARCHING'))), 'buscando');
  assert.equal(superficieDe(leerDetalle(enCurso('DRIVER_ASSIGNED'))), 'viaje');
  assert.equal(superficieDe(leerDetalle(enCurso('IN_PROGRESS'))), 'viaje');
  // El hueco declarado: ARRIVED no tiene pantalla aprobada.
  assert.equal(superficieDe(leerDetalle(enCurso('ARRIVED'))), null);
  // Terminales: ya no son viaje activo.
  assert.equal(superficieDe(leerDetalle(enCurso('COMPLETED'))), null);
  assert.equal(superficieDe(leerDetalle(enCurso('CANCELLED'))), null);
  assert.equal(superficieDe(null), null);
});

test('ARRIVED se SOPORTA aunque no tenga pantalla', () => {
  // El estado se guarda tal cual: el hueco es visual, no del modelo. Si el
  // store lo descartara, el día que exista la pantalla habría que rehacerlo.
  const viaje = leerDetalle(enCurso('ARRIVED'));
  assert.equal(viaje.estado, 'ARRIVED');
  assert.equal(alRecibirViaje(viaje).fase, 'CON_VIAJE');
  assert.equal(SUPERFICIE_DEL_ESTADO.ARRIVED, null, 'se inventó una pantalla para ARRIVED');
});

test('los terminales no se fabrican en el cliente', () => {
  assert.equal(esTerminal('COMPLETED'), true);
  assert.equal(esTerminal('CANCELLED'), true);
  assert.equal(esTerminal('IN_PROGRESS'), false);

  // Ni el store ni el proveedor construyen un estado terminal por su cuenta.
  const proveedor = sinComentarios('realtime/ViajeActivo.tsx');
  assert.equal(/'COMPLETED'|'CANCELLED'/.test(proveedor), false,
    'el proveedor fabrica un estado terminal');
});

// ---------------------------------------------------------------------------
// Lo que pasa cuando la red falla
// ---------------------------------------------------------------------------

test('un fallo de red CONSERVA el viaje conocido', () => {
  // La decisión más importante: quien va montado en la moto sigue yendo
  // montado aunque el teléfono pierda cobertura.
  const viaje = leerDetalle(enCurso('IN_PROGRESS'));
  const conViaje = alRecibirViaje(viaje);
  const roto = alFallar(conViaje, 'No hay conexión con el servidor.');

  assert.equal(roto.fase, 'ERROR');
  assert.equal(viajeConocido(roto).id, 'trip_activo', 'el viaje desapareció al fallar la red');
  assert.equal(puedeEstarViejo(roto), true);
});

test('resincronizar no hace parpadear la pantalla', () => {
  const viaje = leerDetalle(enCurso());
  const preguntando = alEmpezarAPreguntar(alRecibirViaje(viaje));
  assert.equal(preguntando.fase, 'RESINCRONIZANDO');
  assert.equal(viajeConocido(preguntando).id, 'trip_activo', 'se pierde lo que se estaba enseñando');
});

test('un fallo de red NO cierra la sesión', () => {
  const proveedor = sinComentarios('realtime/ViajeActivo.tsx');
  assert.equal(/salir\(|borrarToken/.test(proveedor), false);
});

// ---------------------------------------------------------------------------
// Nada viejo pisa nada nuevo
// ---------------------------------------------------------------------------

test('una respuesta vieja no puede escribir', () => {
  // Con red mala, una petición lenta llega después de una rápida y deja el
  // modelo en el pasado.
  const proveedor = sinComentarios('realtime/ViajeActivo.tsx');
  assert.match(proveedor, /const mia = \+\+generacion\.current;/);
  assert.match(proveedor, /if \(!montado\.current \|\| mia !== generacion\.current\) return;/);
});

test('cambiar de cuenta invalida lo que hubiera en vuelo', () => {
  // La cuenta B jamás puede heredar el viaje de A.
  const proveedor = sinComentarios('realtime/ViajeActivo.tsx');
  assert.match(proveedor, /generacion\.current \+= 1;/, 'el número no salta al cerrar sesión');
  assert.match(proveedor, /setEstado\(alCerrarSesion\(\)\)/);
  // El efecto depende de la IDENTIDAD, no sólo de si hay sesión.
  assert.match(proveedor, /const identidad = sesion\.estado === 'AUTENTICADO' \? sesion\.usuario\.id : null;/);
  assert.match(proveedor, /\}, \[identidad, refrescar\]\);/);

  assert.equal(alCerrarSesion().fase, 'ARRANCANDO');
  assert.equal(viajeConocido(alCerrarSesion()), null);
});

// ---------------------------------------------------------------------------
// El socket avisa, HTTP manda
// ---------------------------------------------------------------------------

test('los eventos del viaje NO se aplican: disparan resync', () => {
  // El payload de `tripStatusUpdated` tiene CINCO formas distintas, a veces sin
  // `canonicalStatus` y a veces sin `updatedAt`, y nunca trae el viaje entero.
  const proveedor = sinComentarios('realtime/ViajeActivo.tsx');
  for (const evento of ['tripStatusUpdated', 'rideCancelled', 'dispatch:no_drivers']) {
    assert.match(proveedor, new RegExp(`useEvento\\('${evento}', alCambiarElViaje\\)`), `falta «${evento}»`);
  }
  assert.match(proveedor, /const alCambiarElViaje = useCallback\(\(\) => \{ void refrescar\(\); \}/);

  // Y el payload no se lee en ninguna parte.
  assert.equal(/canonicalStatus|payload\.|\.status/.test(proveedor), false,
    'el proveedor lee el payload del evento');
});

test('las cinco formas de tripStatusUpdated existen de verdad', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const emisiones = [...servidor.matchAll(/emit\('tripStatusUpdated', \{[\s\S]{0,240}?\}\)/g)];
  assert.ok(emisiones.length >= 4, `sólo se encontraron ${emisiones.length} emisiones`);

  // Al menos una SIN canonicalStatus: es lo que hace inseguro aplicar el payload.
  const sinCanonico = emisiones.filter(([texto]) => !texto.includes('canonicalStatus'));
  assert.ok(sinCanonico.length > 0, 'ya todas traen canonicalStatus: se podría revisar la estrategia');
});

test('rideAccepted NO se escucha, porque el servidor no lo emite', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.equal(/emit\('rideAccepted'/.test(servidor), false, 'el servidor ya lo emite: revisar');

  const eventos = leer('realtime/eventos.ts');
  const escuchados = eventos.slice(eventos.indexOf('EVENTOS_DEL_SERVIDOR'), eventos.indexOf('EventoDelServidor'));
  assert.equal(/'rideAccepted'/.test(escuchados), false);
});

test('tras reconectar se vuelve a preguntar', () => {
  const proveedor = sinComentarios('realtime/ViajeActivo.tsx');
  assert.match(proveedor, /useResync\(\(\) => \{ void refrescar\(\); \}\)/);
});

test('al volver del segundo plano se vuelve a preguntar, sin temporizadores', () => {
  // El sistema suspende los temporizadores con la aplicación: un intervalo
  // «cada minuto» puede despertar tres horas después creyendo que pasó uno.
  const proveedor = sinComentarios('realtime/ViajeActivo.tsx');
  assert.match(proveedor, /AppState\.addEventListener\('change'/);
  assert.match(proveedor, /siguiente === 'active'/);
  assert.match(proveedor, /suscripcion\.remove\(\)/, 'la suscripción no se limpia');
  assert.equal(/setInterval/.test(proveedor), false, 'hay un sondeo por temporizador');
});

// ---------------------------------------------------------------------------
// Una sola autoridad
// ---------------------------------------------------------------------------

test('hay UNA autoridad del viaje activo, para los dos roles', () => {
  const raiz = leer('app/_layout.tsx');
  assert.equal((raiz.match(/<ProveedorDeViajeActivo>/g) ?? []).length, 1);

  // Ni almacenes por rol.
  for (const inventado of ['PassengerTripStore', 'DriverTripStore', 'RealtimeTripStore', 'ActiveTripContext']) {
    assert.equal(fs.existsSync(path.join(raizMovil, `realtime/${inventado}.tsx`)), false);
  }

  // El mismo endpoint sirve a los dos: el servidor filtra por rol.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const ruta = servidor.slice(servidor.indexOf("app.get('/api/trips/active/me'"));
  assert.match(ruta.slice(0, 600), /item\.passengerId === req\.user\.id \|\| item\.driverId === req\.user\.id/);
});

// ---------------------------------------------------------------------------
// El reparto de recargas
// ---------------------------------------------------------------------------

test('una difusión se REPARTE, no se retrasa en bloque', () => {
  // Una espera fija mueve el pico; no lo distribuye.
  assert.equal(retrasoDeRecarga(0, true), ESPERA_BASE_MS);
  assert.equal(retrasoDeRecarga(1, true), ESPERA_BASE_MS + REPARTO_MAXIMO_MS);
  assert.equal(retrasoDeRecarga(0.5, true), ESPERA_BASE_MS + REPARTO_MAXIMO_MS / 2);

  // Determinista con el aleatorio inyectado, y acotado ante valores absurdos.
  assert.equal(retrasoDeRecarga(-3, true), ESPERA_BASE_MS);
  assert.equal(retrasoDeRecarga(9, true), ESPERA_BASE_MS + REPARTO_MAXIMO_MS);
});

test('un evento individual NO se reparte', () => {
  // Soy uno solo y estoy esperando: repartir aquí sería demora sin motivo.
  assert.equal(retrasoDeRecarga(0.9, false), ESPERA_BASE_MS);
  assert.equal(retrasoDeRecarga(1, false), ESPERA_BASE_MS);
});

test('varios eventos seguidos producen UNA recarga', () => {
  const enVivo = sinComentarios('realtime/avisosEnVivo.ts');
  assert.match(enVivo, /clearTimeout\(temporizador\.current\)/, 'no se agrupan');
  assert.match(enVivo, /retrasoDeRecarga\(Math\.random\(\), repartir\)/);
  // La difusión reparte; la reconexión no.
  assert.match(enVivo, /useEvento\('platform:notification', useCallback\(\(\) => pedirRecarga\(true\)/);
  assert.match(enVivo, /useResync\(useCallback\(\(\) => pedirRecarga\(false\)/);
});

test('la espera fija de 400 ms ya no existe', () => {
  const enVivo = leer('realtime/avisosEnVivo.ts');
  assert.equal(/ESPERA_MS = 400/.test(enVivo), false);
});

test('no hay sondeo en ninguna parte', () => {
  for (const fichero of ['realtime/ViajeActivo.tsx', 'realtime/avisosEnVivo.ts', 'realtime/socket.ts']) {
    assert.equal(/setInterval/.test(sinComentarios(fichero)), false, `${fichero} sondea`);
  }
});

// ---------------------------------------------------------------------------
// Lo que esta fase sigue sin hacer
// ---------------------------------------------------------------------------

test('sigue sin emitirse nada de negocio', () => {
  const proveedor = sinComentarios('realtime/ViajeActivo.tsx');
  assert.equal(/emit\(/.test(proveedor), false, 'el viaje activo emite');
  assert.equal(/export function emitir/.test(sinComentarios('realtime/socket.ts')), false);
});

test('esta fase tampoco instala nada nativo', () => {
  const dependencias = Object.keys(JSON.parse(leer('package.json')).dependencies ?? {});
  // `expo-location` sale de la lista en LOCATION-INTEGRATION-1A: el dueño
  // lo autorizó y la aplicación ya usa la ubicación en primer plano. El
  // resto sigue prohibido, y `expo-task-manager` en especial: es lo que
  // hace falta para seguir midiendo con la aplicación cerrada.
  // `expo-task-manager` sale de la lista en DRIVER-LOCATION-RESILIENCE-1:
  // el dueno autorizo el seguimiento en segundo plano del conductor en
  // servicio, y esa es la pieza oficial que lo hace posible. Lo que se
  // protege ahora no es que no exista, sino que solo exista trabajando
  // —eso lo vigila `seguimientoEnSegundoPlano.test.mjs`—.
  // `expo-image-picker` sale de la lista en DRIVER-APPLICATION-D1: el dueno
  // autorizo la captura de documentos para la postulacion de conductor. Lo
  // que se vigila ahora es que solo lo importe `media/captura.ts` —eso lo
  // hace `fotoDeDocumento.test.mjs`—.
  for (const prohibida of [
    'expo-maps', '@react-native-community/netinfo',
    'expo-notifications', 'expo-background-fetch'
  ]) {
    assert.equal(dependencias.includes(prohibida), false, `se instaló ${prohibida}`);
  }
});

test('el recorrido de diseño sigue aislado', () => {
  const proveedorSocket = sinComentarios('realtime/ProveedorDeTiempoReal.tsx');
  assert.match(proveedorSocket, /ZONAS_SIN_TIEMPO_REAL = \['diseno', 'preview'\]/);

  // Y sin socket no hay eventos, así que el viaje activo tampoco se dispara ahí.
  for (const nombre of fs.readdirSync(path.join(raizMovil, 'app/diseno'), { recursive: true })) {
    const completa = path.join(raizMovil, 'app/diseno', String(nombre));
    if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
    assert.equal(
      /ViajeActivo|realtime/.test(fs.readFileSync(completa, 'utf8')), false,
      `app/diseno/${nombre} toca el viaje activo`
    );
  }
});

test('el estado inicial no finge saber nada', () => {
  assert.equal(ESTADO_INICIAL.fase, 'ARRANCANDO');
  assert.equal(viajeConocido(ESTADO_INICIAL), null);
  assert.equal(superficieDe(viajeConocido(ESTADO_INICIAL)), null);
});
