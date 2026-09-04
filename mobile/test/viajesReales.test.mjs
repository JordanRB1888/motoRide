import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  duracionEntre,
  esEstadoConocido,
  fechaDe,
  horaDe,
  importeDe,
  leerCancelacion,
  leerDetalle,
  leerHistorial,
  leerHitos,
  leerMensajes,
  nombreDeEstado,
  normalizarEstado
} from '../domain/viajes.ts';

/**
 * El historial y el registro REALES — HISTORY-INTEGRATION-1.
 *
 * QUÉ SE PROTEGE
 *
 * Que la pantalla no fabrique nada. Un hito con hora inventada, un importe de
 * cero donde no hubo cobro o un conductor de relleno convierten un registro
 * —que existe para RECLAMAR— en algo que no sirve para reclamar.
 *
 * La cronología sale de `statusHistory`, que ya existía. Si un paso no está en
 * esa lista, no ocurrió, y se pinta apagado.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

/** Un viaje completado, con la forma REAL del backend. */
const COMPLETADO = {
  id: 'trip_abc',
  status: 'COMPLETED',
  createdAt: '2026-09-01T12:14:00.000Z',
  closedAt: '2026-09-01T12:34:00.000Z',
  pickup: { address: 'Calle 1', lat: 10.6, lng: -71.6 },
  destination: { address: 'Calle 9', lat: 10.7, lng: -71.7 },
  rideType: 'MOTO',
  paymentMethod: 'CASH',
  fareUSD: 3.5,
  passengerName: 'Ana Pérez',
  statusHistory: [
    { status: 'SEARCHING', at: '2026-09-01T12:14:00.000Z', actorId: 'u_1' },
    { status: 'DRIVER_ASSIGNED', at: '2026-09-01T12:15:00.000Z', actorId: 'd_1', actorRole: 'driver' },
    { status: 'ARRIVED', at: '2026-09-01T12:19:00.000Z', actorRole: 'driver' },
    { status: 'IN_PROGRESS', at: '2026-09-01T12:21:00.000Z', actorRole: 'driver' },
    { status: 'COMPLETED', at: '2026-09-01T12:34:00.000Z', actorRole: 'driver' }
  ]
};

const DETALLE_COMPLETADO = {
  trip: COMPLETADO,
  passenger: { id: 'u_1', firstName: 'Ana', lastName: 'Pérez' },
  driver: {
    id: 'd_1',
    firstName: 'Luis',
    lastName: 'Gómez',
    vehicleBrand: 'Bera',
    vehicleModel: 'SBR',
    vehiclePlate: 'AB123CD'
  }
};

/** Cancelado por el sistema, sin conductor: no llegó a asignarse ninguno. */
const DETALLE_CANCELADO = {
  trip: {
    id: 'trip_xyz',
    status: 'CANCELLED',
    createdAt: '2026-09-01T07:41:00.000Z',
    closedAt: '2026-09-01T07:44:00.000Z',
    pickup: { address: 'Calle 1' },
    destination: { address: 'Calle 9' },
    rideType: 'MOTO',
    paymentMethod: 'CASH',
    statusHistory: [
      { status: 'SEARCHING', at: '2026-09-01T07:41:00.000Z', actorId: 'u_1' },
      { status: 'CANCELLED', at: '2026-09-01T07:44:00.000Z', actorRole: 'system', reason: 'NO_DRIVERS_AVAILABLE' }
    ]
  },
  passenger: { id: 'u_1', firstName: 'Ana', lastName: 'Pérez' },
  driver: null
};

// ---------------------------------------------------------------------------
// Los estados
// ---------------------------------------------------------------------------

test('los alias históricos se normalizan como en el backend', () => {
  // Los viajes guardados antes de la normalización siguen llegando así.
  assert.equal(normalizarEstado('EN_ROUTE'), 'DRIVER_ASSIGNED');
  assert.equal(normalizarEstado('IN_TRIP'), 'IN_PROGRESS');
  assert.equal(normalizarEstado('DRIVER_ARRIVED'), 'ARRIVED');
  assert.equal(normalizarEstado('PENDING'), 'SEARCHING');
  assert.equal(normalizarEstado('COMPLETED'), 'COMPLETED');
});

test('la lista de alias es la MISMA que la del servidor', () => {
  const maquina = fs.readFileSync(path.join(raizProyecto, 'server/domain/tripStateMachine.js'), 'utf8');
  const alias = [...maquina.matchAll(/^\s{2}([A-Z_]+): TRIP_STATUS\.([A-Z_]+)/gm)];
  assert.ok(alias.length >= 5, 'ya no se pueden leer los alias del servidor');

  for (const [, viejo, nuevo] of alias) {
    assert.equal(normalizarEstado(viejo), nuevo, `«${viejo}» no se normaliza igual que en el servidor`);
  }
});

test('un estado inesperado NO se traduce a «Completado»', () => {
  // Decirle a alguien que su viaje terminó bien cuando el servidor dice otra
  // cosa es peor que enseñarle una palabra rara.
  assert.equal(nombreDeEstado('COMPLETED'), 'Completado');
  assert.equal(nombreDeEstado('CANCELLED'), 'Cancelado');
  assert.equal(nombreDeEstado('IN_TRIP'), 'En curso', 'el alias no se resuelve');
  assert.equal(nombreDeEstado('ALGO_NUEVO'), 'ALGO_NUEVO');
  assert.equal(esEstadoConocido('ALGO_NUEVO'), false);
});

// ---------------------------------------------------------------------------
// El historial
// ---------------------------------------------------------------------------

test('el historial se lee de la respuesta REAL', () => {
  const viajes = leerHistorial([COMPLETADO]);
  assert.equal(viajes.length, 1);
  assert.equal(viajes[0].id, 'trip_abc');
  assert.equal(viajes[0].origen, 'Calle 1');
  assert.equal(viajes[0].destino, 'Calle 9');
  assert.equal(viajes[0].estado, 'COMPLETED');
});

test('un viaje sin identificador se descarta', () => {
  // No se podría abrir su detalle, y una fila que no responde es peor que
  // ninguna fila.
  assert.equal(leerHistorial([{ status: 'COMPLETED' }, COMPLETADO]).length, 1);
});

test('una respuesta que no es lista da historial vacío, no un fallo', () => {
  for (const basura of [null, undefined, {}, 'no', 7]) {
    assert.deepEqual(leerHistorial(basura), []);
  }
});

test('lo que falta en el historial queda VACÍO, no inventado', () => {
  const viajes = leerHistorial([{ id: 'trip_1' }]);
  assert.equal(viajes[0].origen, '');
  assert.equal(viajes[0].destino, '');
  assert.equal(viajes[0].cuando, '');
  assert.equal(fechaDe(viajes[0].cuando), '', 'sin fecha se pinta una fecha');
});

test('el historial sirve a los DOS roles con una sola implementación', () => {
  // El servidor filtra por passengerId o driverId según quién pregunta. Dos
  // implementaciones distintas acabarían discrepando.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const ruta = servidor.slice(servidor.indexOf("app.get('/api/trips/me/history'"));
  assert.match(ruta.slice(0, 400), /\['passenger', 'driver'\]\.includes\(req\.user\.role\)/);

  const servicio = leer('services/viajes.ts');
  assert.equal((servicio.match(/\/api\/trips\/me\/history/g) ?? []).length, 1, 'hay dos llamadas al historial');
});

// ---------------------------------------------------------------------------
// El detalle
// ---------------------------------------------------------------------------

test('el detalle se lee de { trip, passenger, driver }', () => {
  // Es una forma DISTINTA a la del listado, y por eso se leen por separado.
  const detalle = leerDetalle(DETALLE_COMPLETADO);
  assert.ok(detalle);
  assert.equal(detalle.id, 'trip_abc');
  assert.equal(detalle.origen, 'Calle 1');
  assert.equal(detalle.conductor?.nombre, 'Luis Gómez');
  assert.equal(detalle.conductor?.vehiculo, 'Bera SBR');
  assert.equal(detalle.conductor?.placa, 'AB123CD');
  assert.equal(detalle.pasajero, 'Ana Pérez');
  assert.equal(detalle.importe, 3.5);
});

test('un detalle sin viaje dentro se rechaza entero', () => {
  assert.equal(leerDetalle(null), null);
  assert.equal(leerDetalle({}), null, 'sin trip');
  assert.equal(leerDetalle({ trip: { status: 'COMPLETED' } }), null, 'sin id');
});

test('sin conductor NO se inventa uno', () => {
  // Un viaje cancelado antes de que nadie lo aceptara no tiene conductor.
  const detalle = leerDetalle(DETALLE_CANCELADO);
  assert.equal(detalle.conductor, null);
  // Y la pantalla quita la banda entera en vez de enseñar tres huecos.
  assert.match(sinComentarios('preview/pantallaDetalleDeViaje.tsx'), /dato\.conductor !== null \?/);
});

test('sin marca ni modelo se cae al tipo de vehículo, que sí consta', () => {
  const detalle = leerDetalle({
    trip: { ...COMPLETADO, rideType: 'CAR' },
    driver: { id: 'd_1', firstName: 'Luis' }
  });
  assert.equal(detalle.conductor?.vehiculo, 'Carro');
});

// ---------------------------------------------------------------------------
// La cronología
// ---------------------------------------------------------------------------

test('los hitos salen de statusHistory, con sus horas REALES', () => {
  const hitos = leerHitos(COMPLETADO.statusHistory);
  assert.equal(hitos.length, 5);
  assert.deepEqual(
    hitos.map(hito => hito.estado),
    ['SEARCHING', 'DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']
  );
  assert.equal(hitos[2].cuando, '2026-09-01T12:19:00.000Z');
});

test('la pantalla NO fabrica ningún hito', () => {
  // Cada paso busca su entrada en statusHistory; si no está, se pinta apagado
  // y sin hora. Ésta es la decisión central de la fase.
  const ruta = sinComentarios('app/viaje/[id].tsx');
  assert.match(ruta, /hora: ocurrido === undefined \? '' : horaDe\(ocurrido\.cuando\)/);
  assert.match(ruta, /ocurrido: ocurrido !== undefined/);
  // Y no hay ninguna hora escrita a mano.
  assert.equal(/\d{2}:\d{2}/.test(ruta), false, 'hay una hora escrita en el código');
});

test('un hito de statusHistory sin estado se descarta', () => {
  assert.equal(leerHitos([{ at: '2026-09-01T12:00:00.000Z' }]).length, 0);
  assert.deepEqual(leerHitos(null), []);
});

test('los alias también se normalizan dentro de la cronología', () => {
  const hitos = leerHitos([{ status: 'IN_TRIP', at: '2026-09-01T12:21:00.000Z' }]);
  assert.equal(hitos[0].estado, 'IN_PROGRESS');
});

// ---------------------------------------------------------------------------
// Cancelados
// ---------------------------------------------------------------------------

test('quién canceló sale de la cronología, no de un campo que no existe', () => {
  // El servidor NO guarda `cancelledBy` ni `cancelReason` como campos del
  // viaje: los apunta en la entrada CANCELLED de statusHistory.
  const detalle = leerDetalle(DETALLE_CANCELADO);
  assert.deepEqual(detalle.cancelacion, {
    quien: 'system',
    razon: 'NO_DRIVERS_AVAILABLE',
    cuando: '2026-09-01T07:44:00.000Z'
  });

  // Y se comprueba contra el servidor: si algún día aparecen esos campos, hay
  // que preferirlos a la cronología.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.equal(/\bcancelledBy\b|\bcancelReason\b/.test(servidor), false,
    'el servidor ya guarda quién canceló: usar ese campo');
});

test('un cancelado NO completa los pasos que no ocurrieron', () => {
  const detalle = leerDetalle(DETALLE_CANCELADO);
  const ocurridos = detalle.hitos.map(hito => hito.estado);
  assert.deepEqual(ocurridos, ['SEARCHING', 'CANCELLED']);
  assert.equal(ocurridos.includes('ARRIVED'), false, 'se inventó una llegada');
  assert.equal(ocurridos.includes('COMPLETED'), false);
});

test('un viaje sin cancelación no la inventa', () => {
  assert.equal(leerCancelacion(leerHitos(COMPLETADO.statusHistory)), null);
});

test('el paso de cancelación se coloca donde ocurrió', () => {
  // Al final dejaría pasos apagados por encima de él, como si hubieran podido
  // pasar después de cancelarse.
  const ruta = sinComentarios('app/viaje/[id].tsx');
  assert.match(ruta, /function insertarCancelacion/);
  assert.match(ruta, /pasos\.reduce\(\(tope, actual, indice\) => \(actual\.ocurrido \? indice : tope\), -1\)/);
});

// ---------------------------------------------------------------------------
// El cobro
// ---------------------------------------------------------------------------

test('sin tarifa NO se pinta «$0,00»', () => {
  // Un viaje que se canceló antes de tener tarifa no costó cero: es que no
  // llegó a costar. «$0,00» se lee como «gratis».
  const detalle = leerDetalle(DETALLE_CANCELADO);
  assert.equal(detalle.importe, null);
  assert.equal(importeDe(null), '');
  assert.equal(importeDe(3.5), '$3,50');

  assert.match(sinComentarios('preview/pantallaDetalleDeViaje.tsx'), /dato\.cobro\.total === '' \? 'Sin cobro'/);
});

test('no se inventa un desglose que el servidor no publica', () => {
  const ruta = sinComentarios('app/viaje/[id].tsx');
  assert.match(ruta, /desglose: \[\]/, 'se está construyendo un desglose');
});

// ---------------------------------------------------------------------------
// La conversación
// ---------------------------------------------------------------------------

test('los mensajes se leen de la respuesta REAL', () => {
  const mensajes = leerMensajes([
    {
      id: 'msg_1',
      tripId: 'trip_abc',
      senderId: 'u_1',
      senderName: 'Ana',
      text: 'Estoy en la entrada.',
      timestamp: '2026-09-01T12:16:00.000Z'
    },
    {
      id: 'msg_2',
      senderId: 'd_1',
      senderName: 'Luis',
      text: '',
      imageRef: { id: 'media_1', mimeType: 'image/jpeg' },
      timestamp: '2026-09-01T12:17:00.000Z'
    }
  ]);

  assert.equal(mensajes.length, 2);
  assert.equal(mensajes[0].texto, 'Estoy en la entrada.');
  assert.equal(mensajes[0].adjuntoId, '');
  assert.equal(mensajes[1].adjuntoId, 'media_1', 'el adjunto no se lee');
});

test('un mensaje sin texto y sin imagen no es un mensaje', () => {
  assert.equal(leerMensajes([{ id: 'msg_1', senderId: 'u_1' }]).length, 0);
});

test('NO se inventan «entregado», «leído» ni «escribiendo»', () => {
  // El backend no los guarda para el chat del viaje. Serían atrezo, y del que
  // se nota.
  const dominio = leer('domain/viajes.ts');
  const pantalla = sinComentarios('preview/pantallaDetalleDeViaje.tsx');
  for (const inventado of ['delivered', 'entregado', 'readAt', 'leido', 'typing', 'escribiendo']) {
    assert.equal(
      new RegExp(inventado, 'i').test(despojarComentarios(dominio)), false,
      `el dominio inventa «${inventado}»`
    );
    assert.equal(new RegExp(inventado, 'i').test(pantalla), false, `la pantalla inventa «${inventado}»`);
  }

  // Y el servidor tampoco los guarda: si algún día lo hace, esto avisa.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const chat = servidor.slice(servidor.indexOf("on('chat:send_message'"), servidor.indexOf("on('chat:send_message'") + 1200);
  assert.equal(/deliveredAt|readAt|seenAt/.test(chat), false, 'el chat ya guarda estados de entrega');
});

// ---------------------------------------------------------------------------
// Los adjuntos
// ---------------------------------------------------------------------------

test('los adjuntos siguen siendo PRIVADOS', () => {
  const servicio = leer('services/viajes.ts');
  // Por el endpoint privado, con la cabecera de sesión y el identificador
  // PÚBLICO. La clave del almacén nunca sale del servidor.
  assert.match(servicio, /\/api\/chat-media\/\$\{encodeURIComponent\(adjuntoId\)\}\/content/);
  assert.match(servicio, /authorization: `Bearer \$\{token\}`/);
  assert.equal(/imageStorageKey|base64|dataUrl/i.test(servicio), false, 'se sale del contrato privado');
});

test('no se amplían los tipos de imagen aceptados', () => {
  // El teléfono no decide qué imágenes valen: el servidor lo hace, y esta fase
  // no sube ninguna.
  const servicio = leer('services/viajes.ts');
  assert.equal(/image\/(gif|bmp|tiff|svg)/.test(servicio), false);
  assert.equal(/FormData|multipart/.test(servicio), false, 'esta fase no sube adjuntos');
});

// ---------------------------------------------------------------------------
// La referencia de soporte
// ---------------------------------------------------------------------------

test('la referencia de soporte es el identificador REAL del viaje', () => {
  const ruta = sinComentarios('app/viaje/[id].tsx');
  assert.match(ruta, /referencia: viaje\.id/);
  // Y no queda ni rastro del identificador de ejemplo en la aplicación real.
  for (const fichero of ['app/viaje/[id].tsx', 'app/historial.tsx', 'domain/viajes.ts', 'services/viajes.ts']) {
    assert.equal(/VJ-DEMO/.test(leer(fichero)), false, `${fichero} usa la referencia de ejemplo`);
  }
});

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

test('las fechas se leen en la hora de Venezuela', () => {
  // Alguien en otro huso vería «Ayer» en un viaje de esta mañana.
  // Las dos que importan: la HORA y el DIA. Contar apariciones seria fragil
  // -la fecha corta se arma del dia, no de un formato propio-, asi que se
  // comprueba cada funcion por separado.
  const dominio = leer('domain/viajes.ts');
  const hora = dominio.slice(dominio.indexOf('export function horaDe'), dominio.indexOf('export function fechaDe'));
  assert.match(hora, /America\/Caracas/, 'la hora se calcula en el huso del telefono');

  const fecha = dominio.slice(dominio.indexOf('export function fechaDe'));
  assert.match(fecha, /timeZone: 'America\/Caracas'/, 'el dia se calcula en el huso del telefono');

  const ahora = Date.parse('2026-09-01T20:00:00.000Z');
  assert.match(fechaDe('2026-09-01T12:14:00.000Z', ahora), /^Hoy · \d{2}:\d{2}$/);
  assert.match(fechaDe('2026-08-31T12:14:00.000Z', ahora), /^Ayer · \d{2}:\d{2}$/);
  assert.match(fechaDe('2026-08-20T12:14:00.000Z', ahora), /^\d{2}\/\d{2} · \d{2}:\d{2}$/);
  assert.equal(fechaDe('', ahora), '');
  assert.equal(fechaDe('el martes', ahora), '');
});

test('la duración sale de dos horas reales, o no sale', () => {
  assert.equal(duracionEntre('2026-09-01T12:21:00.000Z', '2026-09-01T12:34:00.000Z'), '13 minutos');
  assert.equal(duracionEntre('2026-09-01T12:21:00.000Z', '2026-09-01T12:22:00.000Z'), '1 minuto');
  assert.equal(duracionEntre('', '2026-09-01T12:34:00.000Z'), '', 'sin inicio no hay duración');
  assert.equal(duracionEntre('2026-09-01T12:34:00.000Z', '2026-09-01T12:21:00.000Z'), '', 'fin antes que inicio');
  assert.equal(horaDe('no es una fecha'), '');
});

// ---------------------------------------------------------------------------
// Sesión, navegación y fixtures
// ---------------------------------------------------------------------------

test('la autorización sigue siendo del SERVIDOR', () => {
  // Repetirla en el teléfono no añadiría seguridad —se desmonta la aplicación
  // y desaparece— y sí una segunda regla que puede discrepar.
  const ruta = sinComentarios('app/viaje/[id].tsx');
  assert.equal(/passengerId === |driverId === |participa/i.test(ruta), false,
    'la pantalla comprueba la autorización por su cuenta');
  // Lo que sí hace es enseñar bien el 403.
  assert.match(ruta, /codigo === 'FORBIDDEN'/);
});

test('un error de red NO cierra la sesión', () => {
  for (const ruta of ['app/historial.tsx', 'app/viaje/[id].tsx']) {
    const fuente = sinComentarios(ruta);
    assert.equal(/salir\(/.test(fuente), false, `${ruta} cierra la sesión por su cuenta`);
    assert.match(fuente, /Reintentar/, `${ruta} no deja reintentar`);
  }
});

test('las rutas nuevas están protegidas', () => {
  for (const ruta of ['app/historial.tsx', 'app/viaje/[id].tsx']) {
    const fuente = sinComentarios(ruta);
    assert.match(fuente, /sesion\.estado !== 'AUTENTICADO'/, `${ruta} no comprueba el estado`);
    assert.match(fuente, /<Redirect href="\/" \/>/, `${ruta} no redirige fuera`);
  }
});

test('Historial → Detalle → volver', () => {
  // La fila abre el viaje por su identificador real; el detalle vuelve al
  // historial por la pestaña, que hace `replace` y no apila.
  assert.match(
    sinComentarios('app/historial.tsx'),
    /router\.push\(`\/viaje\/\$\{encodeURIComponent\(id\)\}`/,
    'el historial no abre el detalle con el id real'
  );
  assert.match(sinComentarios('app/viaje/[id].tsx'), /router\.back\(\)/, 'no se puede volver');
  // La pestana la resuelve el shell, que hace `replace` y no apila: asi
  // «atras» sale de la aplicacion en vez de recorrer la historia de pestanas.
  assert.match(sinComentarios('navegacion/shellDePasajero.tsx'), /case 'historial':\n *router\.replace\('\/historial'\)/);
});

test('la aplicación real NUNCA navega a /diseno', () => {
  const carpeta = path.join(raizMovil, 'app');
  for (const nombre of fs.readdirSync(carpeta, { recursive: true })) {
    const completa = path.join(carpeta, String(nombre));
    if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
    const relativa = path.relative(raizMovil, completa).replace(/\\/g, '/');
    if (relativa.startsWith('app/diseno/') || relativa === 'app/preview.tsx') continue;

    const codigo = despojarComentarios(fs.readFileSync(completa, 'utf8'));
    assert.equal(/router\.(push|replace)\(['"`]\/diseno/.test(codigo), false,
      `${relativa} navega al recorrido de diseño`);
  }
});

test('los fixtures no entran en la aplicación real', () => {
  for (const ruta of ['app/historial.tsx', 'app/viaje/[id].tsx']) {
    assert.equal(/from ['"][^'"]*preview\/fixtures/.test(leer(ruta)), false,
      `${ruta} importa datos de demostración`);
  }

  // Y sin datos, en release las dos pantallas se pintan vacías, no con el
  // ejemplo.
  const secciones = sinComentarios('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /viajes \?\? \(EN_DESARROLLO \? HISTORIAL_DE_EJEMPLO : \[\]\)/);
  const detalle = sinComentarios('preview/pantallaDetalleDeViaje.tsx');
  assert.match(detalle, /datos \?\? \(EN_DESARROLLO \? deEjemplo\(clave\) : VIAJE_VACIO\)/);
});

test('el perfil sigue SIN contador de viajes', () => {
  // Traer hasta 150 viajes completos cada vez que se abre el perfil, sólo para
  // pintar un número, es caro y conceptualmente incorrecto: el historial no es
  // un contador. Cuando el backend publique un total, se conecta.
  const ruta = sinComentarios('app/perfil.tsx');
  assert.match(ruta, /viajes: null/);
  assert.equal(/pedirHistorial/.test(ruta), false, 'el perfil trae el historial entero para un badge');
});
