import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  alTocarElInterruptor,
  confirmada,
  debeEmitirUbicacion,
  DISPONIBILIDAD_INICIAL,
  enServicio,
  ESTADOS_DEL_CONDUCTOR,
  ESTADOS_DE_ADMINISTRACION,
  leerEstadoDelConductor,
  pidiendo,
  rechazada
} from '../domain/disponibilidad.ts';
import { EVENTOS_DEL_SERVIDOR, EVENTOS_PENDIENTES } from '../realtime/eventos.ts';

/**
 * DRIVER-AVAILABILITY-1 — el conductor entra y sale de servicio.
 *
 * QUÉ SE PROTEGE
 *
 * Que el estado que se ve sea el del SERVIDOR y no el deseo del usuario. Un
 * conductor que se cree en línea mientras el servidor lo tiene fuera se queda
 * esperando viajes que no van a llegar, y culpa a la aplicación.
 *
 * Que nadie pueda auto-suspenderse ni, sobre todo, auto-reactivarse.
 *
 * Y que fuera de servicio no se gasten los datos del conductor mandando una
 * posición que a nadie le sirve.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

// ---------------------------------------------------------------------------
// El contrato, leído del servidor
// ---------------------------------------------------------------------------

test('los estados son los MISMOS que el servidor admite', () => {
  const servidor = fs.readFileSync(
    path.join(raizProyecto, 'server/domain/driverState.js'), 'utf8');

  // Los cuatro que un conductor puede pedirse a sí mismo.
  const bloque = servidor.slice(
    servidor.indexOf('export const DRIVER_STATUS'),
    servidor.indexOf('export const ADMIN_DRIVER_STATUS')
  );
  for (const estado of ESTADOS_DEL_CONDUCTOR) {
    assert.match(bloque, new RegExp(`${estado}: '${estado}'`), `el servidor ya no admite ${estado}`);
  }

  // Y los dos que NO.
  const deAdmin = servidor.slice(servidor.indexOf('export const ADMIN_DRIVER_STATUS'));
  for (const estado of ESTADOS_DE_ADMINISTRACION) {
    assert.match(deAdmin, new RegExp(`${estado}: '${estado}'`));
  }
});

test('los eventos de presencia son los que el servidor emite', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.match(servidor, /on\('driver:connect'/);
  assert.match(servidor, /on\('driver:status', handleDriverStatus\)/);
  assert.match(servidor, /emit\('driverStatusChanged', summary\)/);
  assert.match(servidor, /emit\('driver:status_rejected'/);

  for (const conectado of ['driver:connected', 'driverStatusChanged', 'driver:status_rejected']) {
    assert.ok(EVENTOS_DEL_SERVIDOR.includes(conectado), `falta escuchar ${conectado}`);
    assert.equal(EVENTOS_PENDIENTES.includes(conectado), false, `${conectado} sigue pendiente`);
  }
});

test('la identidad la pone la sesión, no el mensaje', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const manejador = servidor.slice(servidor.indexOf('const handleDriverStatus'));
  assert.match(manejador.slice(0, 400), /const driverId = socket\.data\.auth\.userId;/);

  const transporte = sinComentarios('realtime/socket.ts');
  const emisores = transporte.slice(transporte.indexOf('conectarComoConductor'));
  for (const prohibido of ['driverId', 'userId', 'role']) {
    assert.equal(emisores.includes(prohibido), false, `se manda «${prohibido}» en el payload`);
  }
});

// ---------------------------------------------------------------------------
// Leer el estado
// ---------------------------------------------------------------------------

test('los alias históricos se leen, no se rechazan', () => {
  // El servidor los normaliza en vez de rechazarlos para no romper sesiones
  // viejas. Rechazarlos aquí dejaría a ese conductor sin estado en pantalla.
  assert.equal(leerEstadoDelConductor('ONLINE'), 'AVAILABLE');
  assert.equal(leerEstadoDelConductor('disponible'), 'AVAILABLE');
  assert.equal(leerEstadoDelConductor('EN VIAJE'), 'IN_TRIP');
  assert.equal(leerEstadoDelConductor('  offline  '), 'OFFLINE');
});

test('lo que no es un estado conocido no se inventa', () => {
  for (const malo of [null, undefined, '', 'CUALQUIERA', 42, {}, 'SUSPENDED', 'PENDING_APPROVAL']) {
    assert.equal(leerEstadoDelConductor(malo), null, `${JSON.stringify(malo)} se acepta`);
  }
});

test('estar en servicio incluye llevar a alguien', () => {
  assert.equal(enServicio('AVAILABLE'), true);
  // Quien lleva a alguien está trabajando: el disco sigue encendido.
  assert.equal(enServicio('IN_TRIP'), true);
  // Y una pausa es una pausa, no una salida.
  assert.equal(enServicio('BUSY'), true);
  assert.equal(enServicio('OFFLINE'), false);
  assert.equal(enServicio(null), false);
});

// ---------------------------------------------------------------------------
// El interruptor
// ---------------------------------------------------------------------------

test('el interruptor sólo alterna entre trabajar y no trabajar', () => {
  assert.equal(alTocarElInterruptor('OFFLINE'), 'AVAILABLE');
  assert.equal(alTocarElInterruptor(null), 'AVAILABLE');
  assert.equal(alTocarElInterruptor('AVAILABLE'), 'OFFLINE');
  assert.equal(alTocarElInterruptor('BUSY'), 'OFFLINE');
});

test('NO se sale de servicio con alguien montado en la moto', () => {
  // Desde IN_TRIP no hay nada que alternar, y el botón no debe fingir que sí.
  // Quien quiera terminar la jornada, termina el viaje primero.
  assert.equal(alTocarElInterruptor('IN_TRIP'), null);
});

test('el conductor no puede pedirse un estado de administración', () => {
  // Ni auto-suspenderse ni, sobre todo, auto-reactivarse. El interruptor sólo
  // devuelve estados que el servidor acepta de un conductor.
  for (const estado of [null, 'AVAILABLE', 'BUSY', 'IN_TRIP', 'OFFLINE']) {
    const pedido = alTocarElInterruptor(estado);
    if (pedido === null) continue;
    assert.equal(ESTADOS_DE_ADMINISTRACION.includes(pedido), false);
  }

  // Y el tipo del emisor tampoco los admite: no caben ni por descuido.
  const transporte = sinComentarios('realtime/socket.ts');
  const firma = transporte.slice(transporte.indexOf('export function pedirEstadoDeConductor'));
  assert.equal(/SUSPENDED|PENDING_APPROVAL/.test(firma.slice(0, 300)), false);
});

// ---------------------------------------------------------------------------
// Manda el servidor
// ---------------------------------------------------------------------------

test('se arranca sin saber, no suponiendo que está fuera', () => {
  assert.equal(DISPONIBILIDAD_INICIAL.fase, 'DESCONOCIDA');
  assert.equal(DISPONIBILIDAD_INICIAL.estado, null);
});

test('un rechazo NO apaga el disco', () => {
  // Si el servidor no acepta el cambio, el conductor sigue donde estaba.
  // Apagarle el disco le haría creer que salió de servicio cuando no ha salido.
  const enLinea = confirmada('AVAILABLE');
  const tras = rechazada(enLinea, 'DATABASE_WRITE_FAILED');
  assert.equal(tras.fase, 'RECHAZADA');
  assert.equal(tras.estado, 'AVAILABLE');
  assert.equal(tras.motivo, 'DATABASE_WRITE_FAILED');
  assert.equal(enServicio(tras.estado), true);
});

test('mientras se espera respuesta, el estado sigue siendo el viejo', () => {
  const enLinea = confirmada('AVAILABLE');
  const esperando = pidiendo(enLinea);
  assert.equal(esperando.fase, 'PIDIENDO');
  assert.equal(esperando.estado, 'AVAILABLE', 'se pintó el deseo en vez del estado real');
});

test('lo que se pinta viene del servidor, no del botón', () => {
  const capa = sinComentarios('realtime/Disponibilidad.tsx');
  // El estado sólo se fija con lo que confirma el servidor.
  assert.match(capa, /escuchar\('driverStatusChanged'/);
  assert.match(capa, /setDisponibilidad\(confirmada\(estado\)\)/);
  // Y al pulsar se PIDE, no se fija.
  assert.match(capa, /pedirEstadoDeConductor\(pedido\)/);
  assert.match(capa, /setDisponibilidad\(pidiendo\)/);
});

test('el evento de OTRO conductor no cambia el propio estado', () => {
  // `driverStatusChanged` llega también al pasajero hablando de SU conductor.
  const capa = sinComentarios('realtime/Disponibilidad.tsx');
  assert.match(capa, /if \(miId !== null && dueño !== '' && dueño !== miId\) return;/);
});

test('el estado de arranque sale del perfil que el backend confirmó', () => {
  // Sin esto, un conductor que dejó la aplicación en servicio la abriría con el
  // disco apagado y creería que se ha desconectado.
  const identidad = sinComentarios('domain/authState.ts');
  assert.match(identidad, /driverStatus: typeof dato\.status === 'string' \? dato\.status : ''/);

  const capa = sinComentarios('realtime/Disponibilidad.tsx');
  assert.match(capa, /leerEstadoDelConductor\(usuario\?\.driverStatus\)/);
  // Pero no pisa a una confirmación del socket, que es más reciente.
  assert.match(capa, /previa\.fase === 'DESCONOCIDA' \? confirmada\(delPerfil\) : previa/);
});

test('reconectar no pone a trabajar a quien se había ido', () => {
  const capa = sinComentarios('realtime/Disponibilidad.tsx');
  assert.match(capa, /conectarComoConductor\(enServicio\(actual\) \? 'AVAILABLE' : 'OFFLINE'\)/);
});

// ---------------------------------------------------------------------------
// La ubicación respeta el estado
// ---------------------------------------------------------------------------

test('fuera de servicio NO se manda la posición', () => {
  assert.equal(debeEmitirUbicacion('AVAILABLE'), true);
  assert.equal(debeEmitirUbicacion('IN_TRIP'), true);
  assert.equal(debeEmitirUbicacion('BUSY'), true);
  assert.equal(debeEmitirUbicacion('OFFLINE'), false);
  assert.equal(debeEmitirUbicacion(null), false);

  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.match(tuberia, /if \(rol === 'driver' && !debeEmitirUbicacion\(disponibilidad\.estado\)\) return;/);
});

test('el GPS del conductor sigue midiendo aunque esté fuera', () => {
  // Ver dónde está no depende de estar trabajando: lo que se corta es el
  // ENVÍO, no la medición.
  const proveedor = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  for (const prohibido of ['disponibilidad', 'AVAILABLE', 'OFFLINE', 'enServicio']) {
    assert.equal(proveedor.includes(prohibido), false,
      `el proveedor de GPS mira «${prohibido}»`);
  }
});

// ---------------------------------------------------------------------------
// Los límites de esta fase
// ---------------------------------------------------------------------------

test('la pantalla del conductor es la aprobada, sin dibujar nada nuevo', () => {
  const pantalla = sinComentarios('app/conductor.tsx');
  assert.match(pantalla, /<C2InicioConductor enLinea=\{enLinea\} onAlternar=\{alternar\} \/>/);

  // Y el disco que se conecta ya estaba dibujado en la barra.
  const barra = sinComentarios('ui/Navegacion.tsx');
  assert.match(barra, /export function ControlDeDisponibilidad/);
});

test('quien no está aprobado NO ve la pantalla de conductor', () => {
  // La comprobación la hace el backend en cada petición; aquí se refleja.
  const pantalla = sinComentarios('app/conductor.tsx');
  assert.match(pantalla, /const operativo = puedeOperarComoConductor\(sesion\);/);
  assert.match(pantalla, /if \(operativo\) \{/);
  assert.match(pantalla, /<SituacionSinAprobar \/>/);
});

test('la pantalla de diseño se sigue gobernando sola', () => {
  // Sin manejador externo, el recorrido de maqueta funciona como siempre: no
  // necesita servidor para poder mirarse.
  const pantallas = sinComentarios('preview/pantallasC2.tsx');
  assert.match(pantallas, /const conectado = onAlternar === undefined \? propio : enLinea;/);
});

test('el GPS no pone a nadie disponible', () => {
  // Estado y ubicación siguen siendo dos autoridades distintas. El cliente no
  // cambia el estado desde la tubería de ubicación.
  const tuberia = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.equal(/pedirEstadoDeConductor|conectarComoConductor/.test(tuberia), false);
});

test('sigue sin haber despacho', () => {
  const carpetas = ['realtime', 'app', 'preview', 'services'];
  // `rideCancelled` sale de la lista en PASSENGER-TRIP-1: la pasajera ya
  // puede cancelar la busqueda desde su pantalla, con su confirmacion del
  // servidor. Siguen vedados los del CONDUCTOR —aceptar y rechazar— que son
  // la fase siguiente y necesitan su superficie.
  const prohibidos = ['rideAccepted', 'rideRejected', 'tripRated', 'chat:send_message'];
  for (const carpeta of carpetas) {
    for (const nombre of fs.readdirSync(path.join(raizMovil, carpeta), { recursive: true })) {
      const completa = path.join(raizMovil, carpeta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      if (completa.endsWith(path.join('realtime', 'eventos.ts'))) continue;
      const codigo = despojarComentarios(fs.readFileSync(completa, 'utf8'));
      for (const evento of prohibidos) {
        assert.equal(new RegExp(`emit\\(['"\`]${evento}`).test(codigo), false,
          `${nombre} emite «${evento}»`);
      }
    }
  }
});

test('la disponibilidad no sabe nada del segundo plano', () => {
  // Este fichero pide el cambio de estado al servidor y escucha la respuesta.
  // Nada mas. El segundo plano —permiso, arranque y parada— vive entero en
  // `SeguimientoDelConductor`, que se monta POR DEBAJO de este proveedor.
  //
  // Se intento al reves y no funcionaba: desde aqui el contexto del seguimiento
  // era el valor por defecto, asi que el permiso no llegaba a pedirse nunca, y
  // ademas los dos ficheros se importaban en ciclo.
  const capa = sinComentarios('realtime/Disponibilidad.tsx');
  assert.equal(/pedirPermisoDeFondo|useSeguimiento|SeguimientoDelConductor/.test(capa), false,
    'la disponibilidad vuelve a depender del seguimiento');
  assert.equal(/TaskManager|startLocationUpdatesAsync|stopLocationUpdatesAsync/.test(capa), false);
});
