import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveNotificationTarget } from '../src/utils/notificationTargets.js';

/**
 * Tocar una notificación lleva a su pantalla, de un solo toque.
 *
 * Lo que estas pruebas custodian: que cada aviso vaya donde de verdad se
 * resuelve (el saldo a la wallet, la oferta programada a los traslados del
 * conductor), que un aviso sin destino NO prometa navegación, y que las tres
 * apps sigan pasando su navegación al centro de notificaciones.
 */

const leer = relativo => fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
const modal = leer('src/components/notificationCenterModal.js');
const servicio = leer('src/services/notificationService.js');

test('el destino de cada aviso es el sitio donde se resuelve', () => {
  // Pasajera.
  assert.equal(resolveNotificationTarget({ category: 'SAFE_TRANSPORT', event: 'scheduled_ride_at_risk' }, 'passenger'), 'transporte-seguro');
  assert.equal(resolveNotificationTarget({ category: 'SAFE_TRANSPORT', event: 'scheduled_driver_confirmed' }, 'passenger'), 'transporte-seguro');
  assert.equal(resolveNotificationTarget({ category: 'FINANCE' }, 'passenger'), 'wallet');
  assert.equal(resolveNotificationTarget({ category: 'TRIP' }, 'passenger'), 'home');
  // La suspensión por saldo se resuelve recargando, no mirando la agenda.
  assert.equal(resolveNotificationTarget({ category: 'SAFE_TRANSPORT', event: 'subscription_suspended_payment' }, 'passenger'), 'wallet');

  // Conductor: la oferta programada y la cancelación viven en SU pantalla.
  assert.equal(resolveNotificationTarget({ category: 'SAFE_TRANSPORT', event: 'scheduled_driver_offer' }, 'driver'), 'traslados-seguros');
  assert.equal(resolveNotificationTarget({ category: 'SAFE_TRANSPORT', event: 'scheduled_ride_cancelled' }, 'driver'), 'traslados-seguros');
  assert.equal(resolveNotificationTarget({ category: 'FINANCE' }, 'driver'), 'ganancias');
  assert.equal(resolveNotificationTarget({ category: 'TRIP' }, 'driver'), 'inicio');

  // Administración.
  assert.equal(resolveNotificationTarget({ category: 'FINANCE' }, 'admin'), 'finances');
  assert.equal(resolveNotificationTarget({ category: 'TRIP' }, 'admin'), 'dashboard');
});

test('un aviso que no lleva a ninguna parte no promete navegacion', () => {
  for (const categoria of ['ANNOUNCEMENT', 'SYSTEM', undefined]) {
    assert.equal(resolveNotificationTarget({ category: categoria }, 'passenger'), null, String(categoria));
  }
  // El Transporte Seguro no existe para la administración: no la manda ahí.
  assert.equal(resolveNotificationTarget({ category: 'SAFE_TRANSPORT' }, 'admin'), null);
  assert.equal(resolveNotificationTarget(null, 'passenger'), null);
  assert.equal(resolveNotificationTarget({ category: 'FINANCE' }, undefined), null);
  assert.equal(resolveNotificationTarget({ category: 'FINANCE' }, 'desconocido'), null);
});

test('los destinos existen de verdad en la app de cada rol', () => {
  const pasajero = leer('src/pages/passenger/passengerApp.js');
  for (const tab of ['home', 'wallet', 'transporte-seguro']) {
    assert.ok(pasajero.includes(`'${tab}'`), `el pasajero navega a ${tab}`);
  }
  const conductor = leer('src/pages/driver/driverApp.js');
  for (const tab of ['inicio', 'ganancias', 'traslados-seguros']) {
    assert.ok(conductor.includes(`'${tab}'`), `el conductor navega a ${tab}`);
  }
  const admin = leer('src/pages/admin/adminApp.js');
  for (const tab of ['finances', 'dashboard', 'support']) {
    assert.ok(admin.includes(`'${tab}'`), `la administración navega a ${tab}`);
  }
});

test('las tres apps le pasan su navegacion al centro de notificaciones', () => {
  for (const ruta of ['src/pages/passenger/passengerApp.js', 'src/pages/driver/driverApp.js', 'src/pages/admin/adminApp.js']) {
    const codigo = leer(ruta);
    assert.match(codigo, /createNotificationCenterModal\([^)]*onNavigate/s, `${ruta} pasa onNavigate`);
  }
});

test('UN toque: marca leida (aqui y en el servidor), cierra y navega', () => {
  assert.ok(modal.includes('resolveNotificationTarget'), 'el modal decide el destino con la regla compartida');
  assert.ok(modal.includes('notificationService.markAsRead'), 'la leída también viaja al servidor');
  // El orden importa: cerrar y navegar en el MISMO gesto, sin segundo toque.
  const gesto = modal.slice(modal.indexOf('const abrir ='), modal.indexOf('card.addEventListener(\'click\''));
  assert.ok(gesto.includes('closeModal()') && gesto.includes('onNavigate(destino)'), 'cierra y navega de una vez');
  assert.ok(!/dblclick/.test(modal), 'jamás un segundo toque');
  // Accesible con teclado, no solo con el dedo.
  assert.ok(modal.includes("card.addEventListener('keydown'"), 'Enter y espacio abren igual');
  assert.ok(modal.includes('role="button"'), 'las navegables se anuncian como botón');
  // El chevron solo donde hay a dónde ir.
  assert.match(modal, /navegable \?\s*'<span class="notification-chevron"/, 'sin chevron en avisos sin destino');
});

test('el evento del aviso sobrevive al llegar por socket', () => {
  // Sin `event`, un aviso recién llegado navegaría peor que el mismo aviso
  // traído del servidor: el servicio debe conservarlo en ambos caminos.
  assert.match(servicio, /addNotification\(userId, \{[^}]*event/s, 'addNotification acepta el evento');
  assert.match(servicio, /const newNotif = \{[^}]*\n\s*event,/s, 'y lo guarda');
  assert.match(servicio, /this\.notify\(user\.id, \{[^}]*event: payload\.event/s, 'el socket lo propaga');
});

test('marcar UNA leida no inventa peticiones para avisos que solo viven en el cliente', () => {
  const metodo = servicio.slice(servicio.indexOf('async markAsRead'), servicio.indexOf('async markAllAsRead'));
  assert.match(metodo, /\^notification_/, 'solo los ids del servidor se reportan');
  assert.ok(metodo.includes('/notifications/'), 'usa el endpoint existente');
});
