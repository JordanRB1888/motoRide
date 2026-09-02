import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  crearReguladorDeEnvio,
  DISTANCIA_MINIMA_M,
  INTERVALO_MINIMO_MS,
  LATIDO_MS,
  metrosAproximados
} from '../domain/envioDeUbicacion.ts';
import {
  aceptarUbicacion,
  EDAD_MAXIMA_MS,
  leerUbicacionDelConductor,
  limpiarSiYaNoCorresponde,
  siguePresente
} from '../domain/ubicacionDelConductor.ts';
import { mapaDelViaje } from '../domain/mapaDelViaje.ts';
import { EVENTOS_DEL_SERVIDOR, EVENTOS_PENDIENTES } from '../realtime/eventos.ts';

/**
 * LOCATION-INTEGRATION-1B — la ubicación viajando por el socket.
 *
 * QUÉ SE PROTEGE
 *
 * Que no se pinte la moto de otro conductor, que no retroceda por un evento
 * retrasado, y que no se quede en el mapa cuando su posición ya es vieja o el
 * viaje terminó. Las tres serían mentiras sobre dónde está la moto, y quien
 * mira la pantalla sale a la calle a esperarla.
 *
 * Que se emita poco: el conductor paga sus datos y su batería.
 *
 * Y que esta fase siga sin tocar el negocio: nada de pedir, aceptar o cancelar.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

const AHORA = 1_700_000_000_000;
const evento = (extra = {}) => ({
  lat: 10.6580, lng: -71.6210, heading: 0,
  updatedAt: AHORA, driverId: 'd1', userId: 'd1', tripId: 't1',
  ...extra
});

// ---------------------------------------------------------------------------
// El contrato, leído del servidor
// ---------------------------------------------------------------------------

test('los eventos son los que el servidor emite de verdad', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');

  // Que existan estos manejadores no es una suposición: están en el servidor.
  assert.match(servidor, /on\('driver:location', handleDriverLocation\)/);
  assert.match(servidor, /on\('passenger:location_update'/);
  assert.match(servidor, /emit\('driverLocationUpdated'/);
  assert.match(servidor, /emit\('driver:location_rejected'/);

  // Y ya se escuchan aquí.
  for (const conectado of [
    'driverLocationUpdated', 'passengerLocationUpdated',
    'driver:location_rejected', 'passenger:location_rejected'
  ]) {
    assert.ok(EVENTOS_DEL_SERVIDOR.includes(conectado), `falta escuchar ${conectado}`);
    assert.equal(EVENTOS_PENDIENTES.includes(conectado), false, `${conectado} sigue como pendiente`);
  }
});

test('la identidad NO viaja en el mensaje', () => {
  // El servidor saca el conductor de la sesión firmada e IGNORA lo que venga
  // en el payload. Mandarlo sugeriría que sirve para algo, y el día que
  // alguien se fiara tendría un agujero de suplantación.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.match(servidor, /const driverId = socket\.data\.auth\.userId;/);

  const transporte = sinComentarios('realtime/socket.ts');
  const emisores = transporte.slice(transporte.indexOf('enviarUbicacionDeConductor'));
  for (const prohibido of ['driverId', 'userId', 'passengerId', 'role']) {
    assert.equal(emisores.includes(prohibido), false, `se manda «${prohibido}» en el payload`);
  }
});

test('no hay emisor genérico, y sólo salen dos eventos', () => {
  const transporte = sinComentarios('realtime/socket.ts');
  assert.match(transporte, /export function enviarUbicacionDeConductor/);
  assert.match(transporte, /export function enviarUbicacionDePasajera/);
  assert.equal(/export function emitir\b/.test(transporte), false);
});

// ---------------------------------------------------------------------------
// El regulador: medir no es enviar
// ---------------------------------------------------------------------------

test('los números del regulador son los MISMOS que los de la web', () => {
  const web = fs.readFileSync(path.join(raizProyecto, 'src/utils/locationThrottle.js'), 'utf8');
  const numero = nombre => {
    const encontrado = web.match(new RegExp(`${nombre} = ([\\d_]+)`));
    assert.ok(encontrado, `la web ya no declara ${nombre}`);
    return Number(encontrado[1].replace(/_/g, ''));
  };

  assert.equal(INTERVALO_MINIMO_MS, numero('DEFAULT_MIN_INTERVAL_MS'));
  assert.equal(LATIDO_MS, numero('DEFAULT_HEARTBEAT_MS'));
  assert.equal(DISTANCIA_MINIMA_M, numero('DEFAULT_MIN_DISTANCE_METERS'));
});

test('la primera muestra siempre viaja', () => {
  const regulador = crearReguladorDeEnvio();
  assert.equal(regulador.debeEnviarse({ lat: 10.65, lng: -71.62 }, AHORA), true);
});

test('el suelo de dos segundos no se lo salta nadie', () => {
  const regulador = crearReguladorDeEnvio();
  const punto = { lat: 10.65, lng: -71.62 };
  regulador.seEnvio(punto, AHORA);

  // Ni moviéndose mucho: el suelo va antes que cualquier otra consideración.
  const lejos = { lat: 10.70, lng: -71.62 };
  assert.equal(regulador.debeEnviarse(lejos, AHORA + 500), false);
  assert.equal(regulador.debeEnviarse(lejos, AHORA + INTERVALO_MINIMO_MS), true);
});

test('parado no se envía, salvo la señal de vida', () => {
  const regulador = crearReguladorDeEnvio();
  const punto = { lat: 10.65, lng: -71.62 };
  regulador.seEnvio(punto, AHORA);

  // Tres metros no es moverse.
  const casiIgual = { lat: 10.650027, lng: -71.62 };
  assert.equal(regulador.debeEnviarse(casiIgual, AHORA + 5000), false);

  // Pero al rato se manda una señal de vida.
  assert.equal(regulador.debeEnviarse(casiIgual, AHORA + LATIDO_MS), true);
});

test('en marcha se envía, y no más de lo debido', () => {
  const regulador = crearReguladorDeEnvio();
  regulador.seEnvio({ lat: 10.65, lng: -71.62 }, AHORA);
  // Unos veinte metros.
  const movido = { lat: 10.65018, lng: -71.62 };
  assert.equal(regulador.debeEnviarse(movido, AHORA + INTERVALO_MINIMO_MS), true);
});

test('tras una reconexión, la primera vuelve a viajar', () => {
  const regulador = crearReguladorDeEnvio();
  const punto = { lat: 10.65, lng: -71.62 };
  regulador.seEnvio(punto, AHORA);
  assert.equal(regulador.debeEnviarse(punto, AHORA + 100), false);

  regulador.reiniciar();
  assert.equal(regulador.debeEnviarse(punto, AHORA + 100), true);
});

test('una coordenada ilegible no hace pasar por quieta a una moto en marcha', () => {
  assert.equal(metrosAproximados(null, { lat: 10.65, lng: -71.62 }), Infinity);
  assert.equal(metrosAproximados({ lat: NaN, lng: 0 }, { lat: 10.65, lng: -71.62 }), Infinity);
});

test('el ritmo cabe dentro del limitador del servidor', () => {
  // El servidor admite veinte cada diez segundos. Dos segundos de suelo dan
  // cinco como mucho: queda margen de sobra, y el servidor sigue siendo la
  // defensa final.
  const limitador = fs.readFileSync(path.join(raizProyecto, 'server/services/socketRateLimit.js'), 'utf8');
  const regla = limitador.match(/'driver:location': \{ limit: (\d+), windowMs: ([\d_]+) \}/);
  assert.ok(regla, 'el limitador ya no declara driver:location');

  const permitidosPorVentana = Number(regla[1]);
  const ventanaMs = Number(regla[2].replace(/_/g, ''));
  const nuestrosPorVentana = ventanaMs / INTERVALO_MINIMO_MS;
  assert.ok(nuestrosPorVentana < permitidosPorVentana,
    `el ritmo del cliente (${nuestrosPorVentana}) roza el límite (${permitidosPorVentana})`);
});

// ---------------------------------------------------------------------------
// Qué evento de posición se cree
// ---------------------------------------------------------------------------

test('un evento malformado no pinta nada', () => {
  for (const malo of [
    null, undefined, 'x', {},
    evento({ lat: NaN }), evento({ lat: 91 }), evento({ lng: 181 }),
    // El (0,0) es un campo sin rellenar.
    evento({ lat: 0, lng: 0 }),
    // Sin conductor no se sabe de quién es.
    evento({ driverId: '', userId: '' })
  ]) {
    assert.equal(leerUbicacionDelConductor(malo), null, `${JSON.stringify(malo)} se acepta`);
  }
});

test('el rumbo sólo cuando se sabe de verdad', () => {
  // El servidor rellena `heading: 0` cuando el cliente no lo mandó, así que un
  // cero no distingue «al norte» de «no se sabe». Ante la duda, no se inventa.
  assert.equal(leerUbicacionDelConductor(evento({ heading: 0 })).rumbo, null);
  assert.equal(leerUbicacionDelConductor(evento({ heading: 90 })).rumbo, 90);
  assert.equal(leerUbicacionDelConductor(evento({ heading: 450 })).rumbo, 90);
  assert.equal(leerUbicacionDelConductor(evento({ heading: -90 })).rumbo, 270);
  assert.equal(leerUbicacionDelConductor(evento({ heading: 'norte' })).rumbo, null);
});

test('la moto de OTRO conductor no se pinta', () => {
  const esperado = { conductorId: 'd1', viajeId: 't1' };
  const mia = leerUbicacionDelConductor(evento());
  const ajena = leerUbicacionDelConductor(evento({ driverId: 'd2', userId: 'd2' }));

  assert.deepEqual(aceptarUbicacion(mia, { esperado }), mia);
  assert.equal(aceptarUbicacion(ajena, { esperado }), null);
  // Y no pisa a la que ya estaba.
  assert.deepEqual(aceptarUbicacion(ajena, { vigente: mia, esperado }), mia);
});

test('la posición de OTRO viaje no se pinta', () => {
  const esperado = { conductorId: 'd1', viajeId: 't1' };
  const deOtroViaje = leerUbicacionDelConductor(evento({ tripId: 't9' }));
  assert.equal(aceptarUbicacion(deOtroViaje, { esperado }), null);
});

test('sin conductor asignado no aparece ninguna moto', () => {
  const esperado = { conductorId: null, viajeId: 't1' };
  assert.equal(aceptarUbicacion(leerUbicacionDelConductor(evento()), { esperado }), null);
});

test('un evento retrasado NO hace retroceder la moto', () => {
  // La red no garantiza el orden: una muestra medida antes puede llegar
  // después, y la moto daría un salto hacia atrás en el mapa.
  const esperado = { conductorId: 'd1', viajeId: 't1' };
  const nueva = leerUbicacionDelConductor(evento({ updatedAt: AHORA + 5000, lat: 10.66 }));
  const vieja = leerUbicacionDelConductor(evento({ updatedAt: AHORA, lat: 10.65 }));

  const trasLaNueva = aceptarUbicacion(nueva, { esperado });
  assert.deepEqual(aceptarUbicacion(vieja, { vigente: trasLaNueva, esperado }), trasLaNueva);
});

test('una posición vieja deja de enseñarse', () => {
  const posicion = leerUbicacionDelConductor(evento());
  assert.equal(siguePresente(posicion, AHORA), true);
  assert.equal(siguePresente(posicion, AHORA + EDAD_MAXIMA_MS), true);
  assert.equal(siguePresente(posicion, AHORA + EDAD_MAXIMA_MS + 1), false);
  assert.equal(siguePresente(null, AHORA), false);
});

test('el umbral de posición vieja es el MISMO que el del despacho', () => {
  // Si aquí fuera otro, el servidor estaría descartando a ese conductor por
  // rancio mientras la pantalla enseña su moto como si siguiera llegando.
  const despacho = fs.readFileSync(
    path.join(raizProyecto, 'server/domain/dispatchEligibility.js'), 'utf8');
  const encontrado = despacho.match(/maxLocationAgeMs = ([\d_]+)/);
  assert.ok(encontrado, 'el despacho ya no declara su umbral');
  assert.equal(EDAD_MAXIMA_MS, Number(encontrado[1].replace(/_/g, '')));
});

test('al cambiar de conductor se borra la moto anterior', () => {
  const vigente = leerUbicacionDelConductor(evento());
  assert.equal(limpiarSiYaNoCorresponde(vigente, { conductorId: 'd2', viajeId: 't1' }), null);
  assert.deepEqual(limpiarSiYaNoCorresponde(vigente, { conductorId: 'd1', viajeId: 't1' }), vigente);
});

test('al terminar el viaje no queda moto fantasma', () => {
  const vigente = leerUbicacionDelConductor(evento());
  // Sin viaje ni conductor —lo que queda cuando el viaje se cierra— no hay
  // nada que pintar.
  assert.equal(limpiarSiYaNoCorresponde(vigente, { conductorId: null, viajeId: null }), null);
  // Y con otro viaje, tampoco.
  assert.equal(limpiarSiYaNoCorresponde(vigente, { conductorId: 'd1', viajeId: 't9' }), null);
});

// ---------------------------------------------------------------------------
// El mapa
// ---------------------------------------------------------------------------

const viajeCon = () => ({
  id: 't1', estado: 'DRIVER_ASSIGNED',
  origenEn: { lat: 10.66, lng: -71.61 },
  destinoEn: { lat: 10.65, lng: -71.62 },
  origen: 'A', destino: 'B', tipoDeVehiculo: 'MOTO'
});

test('la moto real llega al mapa con su rumbo', () => {
  const modelo = mapaDelViaje(viajeCon(), {
    conductorEn: { lat: 10.658, lng: -71.621 },
    rumboDelConductor: 45
  });
  const moto = modelo.marcadores.find(marcador => marcador.clave === 'conductor');
  assert.ok(moto, 'no se pinta la moto');
  assert.equal(moto.clase, 'moto');
  assert.equal(moto.rumbo, 45);
  assert.equal(moto.destacado, true);
});

test('el movimiento del conductor NO mueve la cámara', () => {
  // Antes su posición entraba en el encuadre porque llegaba una vez con el
  // viaje. Ahora llega cada pocos segundos: si siguiera dentro, el mapa se
  // reajustaría con cada evento, justo mientras la moto se acerca y es cuando
  // más se mira la pantalla.
  const sinMoto = mapaDelViaje(viajeCon());
  const conMotoCerca = mapaDelViaje(viajeCon(), { conductorEn: { lat: 10.658, lng: -71.621 } });
  const conMotoLejos = mapaDelViaje(viajeCon(), { conductorEn: { lat: 10.80, lng: -71.90 } });

  assert.deepEqual(conMotoCerca.camara, sinMoto.camara);
  assert.deepEqual(conMotoLejos.camara, sinMoto.camara, 'la cámara siguió a la moto');
});

// ---------------------------------------------------------------------------
// Los límites de esta fase
// ---------------------------------------------------------------------------

test('la calidad se comprueba ANTES de emitir, y una sola vez', () => {
  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  // Lee del proveedor, que ya filtró. No vuelve a validar con otro criterio:
  // dos validaciones distintas acaban discrepando.
  assert.match(tuberia, /const posicion = ubicacion\.posicion;/);
  assert.equal(/normalizarUbicacion|evaluarUbicacion/.test(tuberia), false,
    'la tubería vuelve a validar por su cuenta');
});

test('se emite en UN solo sitio', () => {
  const carpetas = ['app', 'ui', 'preview', 'realtime', 'domain', 'services', 'context', 'ubicacion'];
  let emisores = 0;
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      if (completa.endsWith(path.join('realtime', 'socket.ts'))) continue;
      const codigo = despojarComentarios(fs.readFileSync(completa, 'utf8'));
      if (/enviarUbicacionDeConductor\(|enviarUbicacionDePasajera\(/.test(codigo)) emisores++;
    }
  }
  assert.equal(emisores, 1, 'hay más de una tubería emitiendo la posición');
});

test('el rechazo del servidor no tumba nada ni reintenta en bucle', () => {
  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.match(tuberia, /driver:location_rejected/);
  assert.match(tuberia, /passenger:location_rejected/);
  // Nada de reintentar: la siguiente muestra llega sola por el observador.
  assert.equal(/setTimeout|setInterval|reintent/i.test(tuberia), false,
    'hay un reintento sobre el rechazo');
});

test('el conductor no se pone disponible por tener GPS', () => {
  // El servidor sólo le asigna estado si NO tenía ninguno; reportar posición
  // no reactiva a un suspendido ni cambia el estado de nadie.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.match(servidor, /if \(!driver\.status\) driver\.status = DRIVER_STATUS\.AVAILABLE;/);

  // Y el cliente no toca el estado del conductor en ninguna parte.
  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  for (const prohibido of ['AVAILABLE', 'OFFLINE', 'driver:status', 'driver:connect']) {
    assert.equal(tuberia.includes(prohibido), false, `la tubería toca «${prohibido}»`);
  }
});

test('la tuberia del socket no toca el segundo plano', () => {
  // El segundo plano existe desde DRIVER-LOCATION-RESILIENCE-1, pero vive en
  // `ubicacion/`. Esta tuberia manda por socket con la pantalla encendida y
  // no sabe nada de tareas: mezclar las dos cosas aqui haria imposible saber
  // cual de los dos transportes esta mandando.
  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.equal(/TaskManager|startLocationUpdatesAsync|requestBackgroundPermissions/.test(tuberia), false);
});

test('el recorrido de diseño no manda ninguna posición', () => {
  // Sin socket no hay emisión, y el proveedor de tiempo real ya lo apaga ahí.
  const proveedorSocket = sinComentarios('realtime/ProveedorDeTiempoReal.tsx');
  assert.match(proveedorSocket, /ZONAS_SIN_TIEMPO_REAL = \['diseno', 'preview'\]/);

  // Y la tubería sólo emite con sesión confirmada y socket conectado.
  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.match(tuberia, /if \(!autenticada \|\| !conectado\) return;/);
});

test('no se registran coordenadas ni se guardan trazas', () => {
  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.equal(/console\.(log|warn|info|debug)/.test(tuberia), false);
  for (const prohibido of ['AsyncStorage', 'SecureStore', 'localStorage', 'analytics']) {
    assert.equal(tuberia.includes(prohibido), false, `la tubería usa ${prohibido}`);
  }
});

test('sigue sin ruta y sin ETA', () => {
  assert.deepEqual(mapaDelViaje(viajeCon(), { conductorEn: { lat: 10.658, lng: -71.621 } }).ruta, []);
  // Con límites de palabra y sin ignorar mayúsculas: «DetalleReal» contiene
  // «eta», y un `/eta/i` suelto marcaba como fallo un nombre de tipo.
  const presenter = sinComentarios('domain/mapaDelViaje.ts');
  assert.equal(/durationMin|\bETA\b/.test(presenter), false);

  // Y tampoco se calcula el tiempo desde la distancia del GPS, que sería
  // inventarlo con otro nombre: en Maracaibo un kilómetro puede ser un minuto
  // o quince, y el número saldría en pantalla como si alguien lo supiera.
  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.equal(/minutos|duracion|velocidad/i.test(tuberia), false);
});
