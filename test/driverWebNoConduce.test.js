import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AVISO_SOLO_DESDE_LA_APP,
  PLATAFORMA_DE_ESTA_APLICACION,
  PLATAFORMA_OPERATIVA_DEL_CONDUCTOR,
  puedeEntrarEnServicioDesde
} from '../src/utils/driverPlatform.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * DESDE EL NAVEGADOR NO SE CONDUCE
 *
 * Decisión del dueño: la plataforma operativa del conductor es la aplicación
 * móvil nativa, y sólo ésa.
 *
 * QUÉ SE PROTEGE
 *
 * Que no exista nunca el estado «UI dice En línea, despacho ve una posición
 * rancia». El navegador no tiene ubicación en segundo plano: en cuanto la
 * pestaña deja de estar activa suspende los temporizadores y deja de haber
 * posiciones, sin avisar a nadie. Un conductor creería que trabaja, no le
 * llegarían viajes, y quien espera vería una moto parada.
 *
 * Y que el bloqueo sea REAL. Un botón deshabilitado no vale de nada mientras el
 * servicio que emite `driver:connect` siga siendo alcanzable.
 *
 * Que la web del conductor siga siendo suya para todo lo demás: su perfil, sus
 * datos, su historial, sus ganancias, sus documentos y su configuración.
 *
 * Y que esto no roce a la pasajera ni al administrador, que llevan años
 * usando la web y no tienen nada que ver con esta regla.
 */

// ---------------------------------------------------------------------------
// La regla
// ---------------------------------------------------------------------------

test('la plataforma operativa del conductor es la aplicación nativa', () => {
  assert.equal(PLATAFORMA_OPERATIVA_DEL_CONDUCTOR, 'NATIVE_MOBILE_ONLY');
  assert.equal(PLATAFORMA_DE_ESTA_APLICACION, 'WEB');
});

test('desde la web no se entra en servicio; desde la nativa sí', () => {
  // Los dos sentidos. Una función que sólo supiera decir «no» no probaría que
  // la regla distingue nada.
  assert.equal(puedeEntrarEnServicioDesde('WEB'), false);
  assert.equal(puedeEntrarEnServicioDesde('NATIVE_MOBILE'), true);

  // Y por defecto habla de dónde corre este código, que es el navegador.
  assert.equal(puedeEntrarEnServicioDesde(), false);
});

test('cualquier plataforma desconocida queda fuera', () => {
  // Nace bloqueando. Si mañana alguien añade una superficie nueva —un reloj,
  // un televisor, un WebView— tendrá que decir explícitamente que ahí se puede
  // conducir, en vez de colarse por olvido.
  for (const rara of ['', null, undefined, 'DESKTOP', 'PWA', 'native_mobile', 'WEB_MOBILE']) {
    assert.equal(puedeEntrarEnServicioDesde(rara), false, `${String(rara)} se cuela`);
  }
});

test('el aviso dice qué hacer, no sólo que no se puede', () => {
  // Quien lo lee necesita saber por dónde sigue su jornada.
  assert.match(AVISO_SOLO_DESDE_LA_APP, /app móvil/);
  assert.match(AVISO_SOLO_DESDE_LA_APP, /ponte en servicio/i);
});

// ---------------------------------------------------------------------------
// El bloqueo es real, no visual
// ---------------------------------------------------------------------------

test('el rastreador NO emite driver:connect desde la web', () => {
  // `startTracking` es la única puerta de la web hacia `driver:connect` con
  // `AVAILABLE` y hacia el GPS operativo. Cerrarla aquí es lo que de verdad
  // cierra el paso.
  const fuente = leer('src/services/driverGpsTracker.js');

  // La emisión sigue existiendo —la aplicación nativa no se toca— pero queda
  // detrás de la comprobación.
  assert.match(fuente, /socket\.emit\('driver:connect'/);

  const arranque = fuente.slice(fuente.indexOf('async startTracking'));
  const cuerpo = arranque.slice(0, arranque.indexOf('\n  }'));
  const puerta = cuerpo.indexOf('puedeEntrarEnServicioDesde()');
  assert.ok(puerta !== -1, 'el rastreador ya no comprueba la plataforma');

  // Y sale ANTES de tocar nada: ni bandera, ni socket, ni GPS.
  const bandera = cuerpo.indexOf('this.isTracking = true');
  const conexion = cuerpo.indexOf('socketClient.connect()');
  assert.ok(puerta < bandera, 'se marca como rastreando antes de comprobar la plataforma');
  assert.ok(puerta < conexion, 'se conecta el socket antes de comprobar la plataforma');
  assert.match(cuerpo, /if \(!puedeEntrarEnServicioDesde\(\)\) \{[\s\S]{0,200}return false;/);
});

test('la pantalla del conductor tampoco lo intenta', () => {
  // Dos capas, y ninguna decorativa. A `setOnline(true)` se llega desde media
  // docena de sitios —el botón, aceptar un viaje, volver a una jornada
  // abierta— y comprobarlo en cada uno dejaría un hueco tarde o temprano.
  const fuente = leer('src/pages/driver/driverApp.js');
  const funcion = fuente.slice(fuente.indexOf('function setOnline(online)'));
  const cuerpo = funcion.slice(0, funcion.indexOf('\n    function '));

  const puerta = cuerpo.indexOf('puedeEntrarEnServicioDesde()');
  assert.ok(puerta !== -1, 'la pantalla ya no comprueba la plataforma');

  // Antes de arrancar el rastreo y de registrar al conductor como disponible.
  const rastreo = cuerpo.indexOf('driverGpsTracker.startTracking');
  const registro = cuerpo.indexOf("status: 'AVAILABLE'");
  assert.ok(puerta < rastreo, 'se arranca el GPS antes de comprobar la plataforma');
  assert.ok(puerta < registro, 'se registra como AVAILABLE antes de comprobar');

  // Y hay más de una llamada a `setOnline(true)`: por eso se comprueba dentro.
  const llamadas = (fuente.match(/setOnline\(true\)/g) ?? []).length;
  assert.ok(llamadas >= 3, `sólo ${llamadas} llamadas: revisar si sigue teniendo sentido`);
});

test('OFFLINE se queda OFFLINE: el interruptor no miente', () => {
  // Si el botón se quedara encendido tras el rechazo, la pantalla diría «En
  // línea» sin que nadie esté mandando posiciones. Es exactamente el estado
  // que esta regla existe para evitar.
  const fuente = leer('src/pages/driver/driverApp.js');
  const funcion = fuente.slice(fuente.indexOf('function setOnline(online)'));
  const cuerpo = funcion.slice(0, funcion.indexOf('\n    function '));

  const rechazo = cuerpo.indexOf('puedeEntrarEnServicioDesde()');
  const trozo = cuerpo.slice(rechazo, cuerpo.indexOf('isVerified === false'));
  assert.match(trozo, /reflejarDisponibilidad\(false\)/);
  assert.match(trozo, /return;/);

  // Y no se llega a poner la bandera interna.
  assert.equal(/isOnline = online/.test(trozo), false, 'se marca en línea pese al rechazo');
});

test('salir de servicio desde la web sigue permitido', () => {
  // Quitarse de en medio siempre se puede: el bloqueo es para entrar. Si un
  // conductor se puso en línea con el móvil y quiere pararlo desde el
  // navegador, dejarle es honesto —deja de estar disponible de verdad—.
  const fuente = leer('src/pages/driver/driverApp.js');
  const funcion = fuente.slice(fuente.indexOf('function setOnline(online)'));
  const cuerpo = funcion.slice(0, funcion.indexOf('\n    function '));
  assert.match(cuerpo, /if \(online && !puedeEntrarEnServicioDesde\(\)\)/,
    'el bloqueo no distingue entrar de salir');
  assert.match(cuerpo, /updateDriverStatus\(user\.id, 'OFFLINE'\)/);
});

// ---------------------------------------------------------------------------
// Lo que NO se toca
// ---------------------------------------------------------------------------

test('la web del conductor sigue siendo suya para todo lo demás', () => {
  // Perfil, datos, historial, ganancias, documentos y configuración: nada de
  // eso necesita ubicación en segundo plano y nada de eso se bloquea.
  const fuente = leer('src/pages/driver/driverApp.js');
  for (const pantalla of [
    'renderDriverProfile',
    'renderDriverTrips',
    'renderEarnings',
    'renderDocuments',
    'renderScheduledRides'
  ]) {
    assert.match(fuente, new RegExp(`${pantalla}\\b`), `se perdió ${pantalla}`);
  }
});

test('la pasajera no se entera de nada', () => {
  // Su mapa registra conductores en un índice local para pintar las motos, y
  // eso NO es pedir estar disponible. Confundir las dos cosas habría dejado a
  // la pasajera sin ver motos.
  const pasajera = leer('src/pages/passenger/passengerApp.js');
  assert.match(pasajera, /driverDispatchService\.registerDriver\(/);
  assert.equal(/driverPlatform|puedeEntrarEnServicioDesde/.test(pasajera), false,
    'el bloqueo del conductor se coló en la pantalla de la pasajera');

  // Y el registro local no quedó tocado: es de los dos.
  const despacho = leer('src/services/driverDispatchService.js');
  assert.equal(/driverPlatform|puedeEntrarEnServicioDesde/.test(despacho), false,
    'se bloqueó el índice local, que la pasajera necesita para ver las motos');
});

test('el administrador tampoco', () => {
  const admin = leer('src/pages/admin/adminApp.js');
  assert.equal(/driverPlatform|puedeEntrarEnServicioDesde/.test(admin), false,
    'el bloqueo se coló en el panel de administración');

  // El mapa de flota sigue leyendo posiciones de conductores como siempre.
  const flota = leer('src/pages/admin/fleetMap.js');
  assert.equal(/puedeEntrarEnServicioDesde/.test(flota), false);
});

test('el bloqueo vive en DOS sitios, y sólo en esos dos', () => {
  // Repartirlo más sería tener varias versiones de la misma regla; tenerlo en
  // uno solo dejaría alcanzable el otro camino.
  const carpetas = ['src'];
  const encontrados = [];
  for (const carpeta of carpetas) {
    const ruta = path.join(raiz, carpeta);
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.js$/.test(completa)) continue;
      const relativa = path.relative(raiz, completa).replace(/\\/g, '/');
      if (relativa.endsWith('utils/driverPlatform.js')) continue;
      if (/puedeEntrarEnServicioDesde/.test(fs.readFileSync(completa, 'utf8'))) {
        encontrados.push(relativa);
      }
    }
  }
  assert.deepEqual(encontrados.sort(), [
    'src/pages/driver/driverApp.js',
    'src/services/driverGpsTracker.js'
  ]);
});

// ---------------------------------------------------------------------------
// Las dos aplicaciones dicen lo mismo
// ---------------------------------------------------------------------------

test('la aplicación móvil aplica la MISMA regla en su versión web', () => {
  // `mobile/` también se exporta a web. Si allí se pudiera entrar en servicio,
  // la regla tendría un agujero por el otro lado.
  const dominio = leer('mobile/domain/seguimientoEnSegundoPlano.ts');
  assert.match(dominio, /if \(permiso === 'NO_DISPONIBLE'\) return 'SOLO_DESDE_LA_APP';/);

  // Y quien pide el cambio de estado sólo sigue con la puerta abierta.
  const disponibilidad = leer('mobile/realtime/Disponibilidad.tsx');
  assert.match(disponibilidad, /if \(puerta !== 'ADELANTE'\) \{/);
  assert.match(disponibilidad, /rechazada\(previa, 'SOLO_DESDE_LA_APP'\)/);
});
