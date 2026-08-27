import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * OFFLINE-TRIP-1B: el estado de sincronizacion es visible SIEMPRE.
 *
 * El defecto real de campo: el pill anclado al fondo del mapa (bottom:14px)
 * quedaba detras de la barra inferior (10-76px) y de la tarjeta (desde
 * 84px). Estas guardas fijan la solucion en dos capas --franja integrada en
 * la tarjeta + pill flotante de respaldo-- y que NINGUN temporizador de UI
 * pueda marcar algo como sincronizado: solo el sincronizador real.
 */

const app = leer('src/pages/driver/driverApp.js');
const tarjeta = leer('src/pages/driver/activeTrip.js');
const css = leer('src/styles/driver.css');

// --------------------------------------------------------------------------
// Causa raiz cerrada: el pill ya no vive en la franja tapada
// --------------------------------------------------------------------------

test('el pill de respaldo salio de la franja de la barra inferior y de la tarjeta', () => {
  assert.ok(!/#trip-sync-pill\{[^}]*bottom:calc\(14px/.test(css),
    'la posicion tapada del defecto de campo no puede volver');
  const regla = css.match(/#trip-sync-pill\{[^}]*\}/)?.[0] ?? '';
  assert.ok(regla.includes('position:fixed'), 'fixed: fuera del stacking del mapa');
  assert.ok(regla.includes('bottom:calc(88px'), 'justo ENCIMA de la barra inferior (que ocupa 10-76px)');
  assert.ok(regla.includes('env(safe-area-inset-bottom'), 'respeta el area segura');
  assert.ok(regla.includes('z-index:1200'), 'por encima de la tarjeta y la barra');
});

// --------------------------------------------------------------------------
// La franja integrada: visible donde el conductor opera (el fix del campo)
// --------------------------------------------------------------------------

test('la tarjeta del viaje lleva su franja de sincronizacion integrada', () => {
  assert.ok(tarjeta.includes('data-trip-sync'), 'la franja existe en el marcado de la tarjeta');
  assert.ok(tarjeta.includes('aria-live="polite"'), 'accesible: el estado se anuncia sin spam');
  // La franja va ANTES del boton primario: jamas lo tapa (esta en el flujo).
  const posFranja = tarjeta.indexOf('data-trip-sync');
  const posBoton = tarjeta.indexOf('trip-primary-action');
  assert.ok(posFranja > 0 && posFranja < posBoton, 'la franja precede al boton primario en el flujo');
  // Estilo con estado por TEXTO y clase, no solo color.
  assert.ok(css.includes('.trip-sync-status{'));
  assert.ok(css.includes('.trip-sync-status.is-error'));
});

test('cada vista montada re-aplica el ultimo estado: la franja sobrevive a los cambios de fase', () => {
  assert.equal((app.match(/reaplicarEstadoSync\(\)/g) || []).length >= 5, true,
    'los cuatro montajes de vista y el colapso del panel reaplican el estado');
  assert.ok(app.includes('let ultimoEstadoSync'), 'el ultimo estado se recuerda');
  // La restauracion sin red tambien lo pinta (probado en 1A y conservado).
  assert.ok(app.includes('pintarEstadoSync(SYNC_STATE.PENDING'));
});

test('el pill flotante es respaldo: aparece solo sin franja visible, y el panel minimizado marca su boton', () => {
  assert.ok(app.includes('const franjaVisible = integrados.length > 0 && !tripPanelCollapsed'),
    'la decision de quien muestra el estado es explicita');
  assert.ok(app.includes("classList.toggle('has-pending-sync'"), 'el toggle minimizado marca pendientes');
  assert.ok(css.includes('.driver-trip-panel-toggle.has-pending-sync::after'),
    'el punto ambar existe en CSS');
});

// --------------------------------------------------------------------------
// Estados honestos: textos y persistencia
// --------------------------------------------------------------------------

test('los cuatro estados tienen texto y solo el exito se auto-oculta', () => {
  for (const texto of [
    'Guardado sin conexion · Pendiente de sincronizacion',
    'Pendiente de sincronizacion',
    'Sincronizando…',
    'Viaje sincronizado',
    'No se pudo sincronizar · Se reintentara'
  ]) {
    assert.ok(app.includes(texto), `falta el texto: ${texto}`);
  }
  // El timeout SOLO oculta el exito: pendiente y error son persistentes, y
  // ningun temporizador de interfaz puede fingir una sincronizacion.
  const bloqueTimeout = app.slice(app.indexOf('SYNC_STATE.SYNCED) {'), app.indexOf('reaplicarEstadoSync'));
  assert.ok(bloqueTimeout.includes('ultimoEstadoSync === SYNC_STATE.SYNCED'),
    'el auto-ocultado revalida que el estado siga siendo exito');
  assert.ok(!/setTimeout[\s\S]{0,200}SYNC_STATE\.PENDING/.test(bloqueTimeout),
    'lo pendiente jamas se oculta por tiempo');
});

test('el estado de la UI nace SOLO del sincronizador real: no hay segunda maquina', () => {
  // pintarEstadoSync se alimenta de onStateChange del sincronizador y de la
  // restauracion local; nadie mas inventa estados.
  const invocaciones = [...app.matchAll(/pintarEstadoSync\(/g)].length;
  assert.ok(invocaciones >= 2 && invocaciones <= 4,
    `pocas puertas controladas al estado (${invocaciones})`);
  assert.ok(app.includes('onStateChange: pintarEstadoSync'),
    'la fuente principal es el sincronizador');
  const sync = leer('src/services/tripTransitionSync.js');
  assert.ok(sync.includes("SYNCED: 'SYNCED'"), 'los estados canonicos viven en el sincronizador');
});

// --------------------------------------------------------------------------
// Convivencia con el resto de la pantalla (guardas de layout)
// --------------------------------------------------------------------------

test('nada critico queda tapado: navegacion arriba, respaldo abajo, franja en el flujo', () => {
  // El banner de navegacion vive arriba (top:145px); el pill de respaldo
  // abajo (bottom:88px): no comparten franja.
  assert.ok(css.includes('.driver-nav-banner{position:absolute;top:calc(145px'));
  const pill = css.match(/#trip-sync-pill\{[^}]*\}/)?.[0] ?? '';
  assert.ok(!pill.includes('top:'), 'el pill no invade la franja del banner de navegacion');
  // Y es inerte al tacto: jamas roba un toque a los botones del viaje.
  assert.ok(pill.includes('pointer-events:none'));
});

// --------------------------------------------------------------------------
// Contratos de negocio 1A intactos (ademas de re-correr sus suites)
// --------------------------------------------------------------------------

test('1B no toco el contrato de negocio: cola, eventos y endpoint identicos', () => {
  const colaFuente = leer('src/services/tripEventQueue.js');
  assert.ok(colaFuente.includes('crypto.randomUUID()'), 'eventId intacto');
  const syncFuente = leer('src/services/tripTransitionSync.js');
  assert.ok(syncFuente.includes('offline-events'), 'endpoint intacto');
  const rutas = leer('server/routes/tripOfflineEvents.js');
  assert.ok(rutas.includes('ALREADY_APPLIED'), 'idempotencia del servidor intacta');
  assert.equal((app.match(/tripSync\.recordTransition\(/g) || []).length, 3,
    'las tres transiciones siguen pasando por la cola durable');
});
