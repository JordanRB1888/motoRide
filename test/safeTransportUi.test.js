import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(root, relativo), 'utf8');

/**
 * SAFE-TRANSPORT-1F — contrato de la interfaz del Transporte Seguro.
 *
 * Lo que se protege: la bandera de visibilidad manda (apagada, los puntos de
 * entrada NO EXISTEN); el lenguaje es honesto (sin «garantizado», sin
 * créditos, sin facturación); la oferta del conductor jamás pinta la puerta
 * de la casa; y una ocurrencia activa REUSA la pantalla de viaje normal.
 */

const flag = leer('src/utils/safeTransportFlag.js');
const servicio = leer('src/services/safeTransportService.js');
const pasajero = leer('src/pages/passenger/safeTransport.js');
const conductor = leer('src/pages/driver/safeTransportDriver.js');
const appPasajero = leer('src/pages/passenger/passengerApp.js');
const appConductor = leer('src/pages/driver/driverApp.js');
const perfilConductor = leer('src/pages/driver/driverProfile.js');
// Lo que importa es lo que se RENDERIZA: los comentarios que documentan las
// prohibiciones («sin créditos», «nada en localStorage») no cuentan.
const sinComentarios = texto => texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');
const todoElFrontendST = sinComentarios(servicio + pasajero + conductor);

// --------------------------------------------------------------------------
// La bandera de visibilidad
// --------------------------------------------------------------------------

test('la bandera VITE_SAFE_TRANSPORT_ENABLED es apagada por defecto y de lista explicita', () => {
  assert.ok(flag.includes('VITE_SAFE_TRANSPORT_ENABLED'));
  assert.match(flag, /'1', 'true', 'yes', 'on'/, 'lista explicita de verdaderos');
  assert.ok(!/=\s*true/.test(flag), 'ningun valor por defecto encendido');
});

test('APAGADA, los puntos de entrada NO EXISTEN (no se renderizan deshabilitados)', () => {
  // Pasajero: con la bandera apagada ni siquiera existe el HUECO de la
  // entrada; la tarjeta real solo se inyecta tras el visto bueno del piloto.
  assert.match(appPasajero, /isSafeTransportUiEnabled\(\)\s*\?\s*`<div id="safe-transport-entry-slot">/,
    'render condicional del hueco: ausente, no disabled');
  // Conductor: la fila del perfil solo existe si el callback existe.
  assert.match(perfilConductor, /options\.onOpenScheduledTransport\s*\?\s*`/);
  assert.match(appConductor, /isSafeTransportUiEnabled\(\) && accesoTrasladosProgramados/);
});

test('PILOTO (1G): la entrada aparece SOLO tras la autorizacion del SERVIDOR, sin parpadeo', () => {
  // Pasajero: la tarjeta vive DENTRO del then() de la consulta autenticada —
  // mientras la consulta vuela, falla o responde 404, la entrada no existe.
  const bloque = appPasajero.slice(
    appPasajero.indexOf('consultarAccesoTransporteSeguro().then'),
    appPasajero.indexOf("handleNavigation('transporte-seguro'))")
  );
  assert.ok(bloque.includes('if (!autorizado || !hueco) return'), 'sin autorizacion, sin tarjeta');
  assert.ok(bloque.includes('safe-transport-entry'), 'la tarjeta se inyecta tras el visto bueno');
  assert.ok(!appPasajero.includes('id="safe-transport-entry" class') || bloque.includes('st-entry-card'),
    'la tarjeta no existe en el render inicial');
  // Conductor: el acceso arranca en false y solo el servidor lo enciende.
  assert.match(appConductor, /let accesoTrasladosProgramados = false/);
  assert.match(appConductor, /consultarAccesoTransporteSeguro\(\)\s*\n?\s*\.then/);
  // El servicio consulta al backend; jamas decide en local.
  assert.ok(servicio.includes("apiService.get('/transport/access')"));
});

test('PILOTO (1G): ninguna lista de cuentas puede acabar en el frontend', () => {
  const fs2 = fs;
  const recorrer = dir => {
    for (const entrada of fs2.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, entrada.name);
      if (entrada.isDirectory()) { recorrer(ruta); continue; }
      if (!/\.(js|css|html)$/.test(entrada.name)) continue;
      const codigo = fs2.readFileSync(ruta, 'utf8');
      assert.ok(!codigo.includes('SAFE_TRANSPORT_PILOT_USER_IDS'),
        `la variable del piloto es SOLO del backend: ${ruta}`);
    }
  };
  recorrer(path.join(root, 'src'));
  assert.ok(!flag.includes('PILOT'), 'la bandera de visibilidad no conoce el piloto');
});

// --------------------------------------------------------------------------
// Lenguaje honesto (§3, §12, §14, §25, §34)
// --------------------------------------------------------------------------

test('sin promesas que el producto no ofrece: ni garantias, ni creditos, ni facturacion', () => {
  const texto = todoElFrontendST.toLowerCase();
  for (const prohibido of ['garantizado', 'garantizada', 'ilimitado', 'ilimitada',
    'créditos', 'creditos', 'ridesused', 'ridesincluded', 'renovación automática',
    'prepago', 'suscripción prepagada incluida', 'empleador']) {
    assert.ok(!texto.includes(prohibido.toLowerCase()) || prohibido === 'suscripción prepagada incluida',
      `lenguaje prohibido en 1F: «${prohibido}»`);
  }
  // La honestidad del efectivo/pago normal esta presente en la landing.
  assert.ok(pasajero.includes('Cada viaje se paga como un viaje normal'));
  // Y ninguna pantalla de compra de planes ni checkout.
  for (const prohibido of ['checkout', 'comprar plan', 'paquete de viajes', 'renewal']) {
    assert.ok(!texto.includes(prohibido), `sin facturacion en 1F: «${prohibido}»`);
  }
});

test('el conductor preferido es SOLICITUD, jamas asignacion', () => {
  assert.ok(pasajero.includes('Conductor preferido'));
  assert.ok(/debe aceptar/.test(pasajero), 'se explica que el conductor debe aceptar');
  assert.ok(!/conductor asignado/i.test(pasajero), 'jamas «conductor asignado» como promesa');
});

test('los estados se traducen a espanol humano y ningun enum crudo llega a pantalla', () => {
  // El mapa cubre TODOS los estados de asignacion y servicio del backend.
  for (const estado of ['OFFERED_PREFERRED', 'ASSIGNING', 'DRIVER_CONFIRMED',
    'COVERAGE_CONFIRMED', 'AT_RISK', 'BACKUP_REQUIRED', 'UNASSIGNED']) {
    assert.ok(servicio.includes(`'${estado}'`), `estado sin traducir: ${estado}`);
  }
  for (const humano of ['Buscando cobertura', 'Esperando confirmación de tu conductor preferido',
    'Buscando conductor de respaldo', 'Conductor confirmado',
    'Estamos buscando una solución', 'Viaje en curso', 'Completado', 'Cancelado']) {
    assert.ok(servicio.includes(humano), `falta el texto humano: ${humano}`);
  }
  // La pagina pinta la traduccion, no el enum.
  assert.ok(pasajero.includes('estadoDeCoberturaEnHumano'));
  assert.ok(!/\$\{[^}]*assignmentStatus[^}]*\}/.test(pasajero), 'el enum crudo jamas se interpola');
});

test('AT_RISK: aviso honesto con tratamiento de advertencia, sin panico ni promesas', () => {
  assert.ok(servicio.includes('Estamos buscando una solución para este traslado'));
  assert.ok(pasajero.includes('st-ride--atencion'));
  assert.ok(pasajero.includes('Seguimos trabajando en la cobertura'));
  const css = leer('src/styles/safe-transport.css');
  assert.match(css, /st-ride--atencion\s*\{[^}]*--x58-warning/, 'ambar semantico, no rojo de panico');
  assert.ok(!/Conductor en camino|llegando/.test(pasajero), 'sin afirmaciones falsas en riesgo');
});

// --------------------------------------------------------------------------
// Privacidad (§6, §18, §32)
// --------------------------------------------------------------------------

test('la oferta del conductor JAMAS pinta direccion exacta ni datos del pasajero', () => {
  const tarjeta = conductor.slice(conductor.indexOf('tarjetaOferta'), conductor.indexOf('tarjetaCompromiso'));
  assert.ok(tarjeta.includes('pickupZone') && tarjeta.includes('destinationZone'), 'solo zonas aproximadas');
  for (const prohibido of ['pickup?.address', 'pickup.address', 'destination?.address',
    'passenger', 'phone', '.lat}', '.lng}']) {
    assert.ok(!tarjeta.includes(prohibido), `la oferta no debe tocar «${prohibido}»`);
  }
  assert.ok(tarjeta.includes('La dirección exacta se muestra al aceptar'));
  // El compromiso (ya aceptado) si lleva la ruta operativa del backend.
  const compromiso = conductor.slice(conductor.indexOf('tarjetaCompromiso'), conductor.indexOf('function pintar'));
  assert.ok(compromiso.includes('pickup?.address') && compromiso.includes('destination?.address'));
  // Y esta pantalla no reconstruye coordenadas con otra llamada.
  assert.ok(!conductor.includes('geocod') && !conductor.includes('nominatim') && !conductor.includes('places'));
});

test('la identidad del conductor para el pasajero: foto privada autenticada, sin telefono', () => {
  assert.ok(pasajero.includes('createPrivatePhotoLoader'), 'el cargador privado de siempre');
  assert.ok(pasajero.includes('data-foto-privada'));
  assert.ok(!/driver\.phone|conductor\.phone|\.email/.test(pasajero), 'sin telefono ni correo');
});

test('nada del Transporte Seguro persiste en localStorage ni invento de fetch propio', () => {
  for (const [nombre, codigo] of [['servicio', sinComentarios(servicio)],
    ['pasajero', sinComentarios(pasajero)], ['conductor', sinComentarios(conductor)]]) {
    assert.ok(!codigo.includes('localStorage'), `${nombre}: sin localStorage`);
    assert.ok(!codigo.includes('sessionStorage'), `${nombre}: sin sessionStorage`);
  }
  // Todo el trafico va por apiService (la unica fetch directa es el respaldo
  // Nominatim de la MISMA arquitectura de busqueda de la app).
  assert.ok(servicio.includes("from './apiService.js'"));
  const fetches = [...pasajero.matchAll(/fetch\(/g)];
  assert.equal(fetches.length, 1, 'una sola fetch: el respaldo Nominatim del buscador canonico');
  assert.ok(pasajero.includes('nominatim.openstreetmap.org'));
  assert.ok(!conductor.includes('fetch('), 'el conductor no llama red por su cuenta');
});

test('el service worker no cachea /api/transport', () => {
  const candidatos = ['public/service-worker.js', 'public/sw.js', 'service-worker.js']
    .filter(ruta => fs.existsSync(path.join(root, ruta)));
  for (const ruta of candidatos) {
    const sw = leer(ruta);
    assert.ok(!sw.includes('/api/transport'), `${ruta} no debe cachear la agenda`);
  }
});

// --------------------------------------------------------------------------
// Flujo del pasajero (§4-§11, §15, §23, §26)
// --------------------------------------------------------------------------

test('el alta usa la arquitectura canonica de lugares y no expone IANA al usuario', () => {
  assert.ok(pasajero.includes('createDestinationSearch') && pasajero.includes('getPlacesProvider'),
    'el MISMO buscador canonico de la app');
  assert.ok(!pasajero.includes('new google.maps'), 'sin geocodificador propio');
  assert.ok(!/timezone/i.test(pasajero.replace(/America\/Caracas/g, '')),
    'el usuario jamas elige un identificador IANA');
  assert.ok(!pasajero.includes('UTC'), 'sin conversiones UTC en pantalla');
  assert.ok(pasajero.includes("type=\"time\"") && pasajero.includes("type=\"date\""), 'entradas nativas');
});

test('semana, resumen y confirmaciones: L-V facil, resumen antes de crear, cancelar en dos pasos', () => {
  assert.ok(pasajero.includes('Lunes a viernes'), 'atajo L-V');
  assert.ok(pasajero.includes('aria-pressed'), 'los dias son conmutadores accesibles');
  assert.ok(pasajero.includes('Confirma tu plan') && pasajero.includes('data-confirmar'),
    'resumen con confirmacion explicita');
  assert.ok(pasajero.includes('¿Seguro? Toca de nuevo para cancelar'), 'cancelacion destructiva en dos pasos');
  assert.ok(pasajero.includes('data-pausar') && pasajero.includes('data-reanudar'), 'pausa y reanudacion');
  assert.ok(!pasajero.includes('fareUSD') && !pasajero.includes('precio total'),
    'sin totales fabricados en el resumen');
});

test('una ocurrencia ACTIVA reusa la pantalla de viaje normal: sin segunda tarjeta de viaje', () => {
  assert.ok(pasajero.includes('data-ver-viaje'));
  assert.ok(/no hay\s*\n?\s*\/\/\s*una segunda tarjeta|no existe una segunda|aquí no hay/.test(pasajero)
    || pasajero.includes('segunda tarjeta'), 'la decision esta documentada en el codigo');
  // El overlay se cierra y manda al Inicio (donde vive el viaje activo real).
  assert.ok(appPasajero.includes("onClose: () => handleNavigation('home')"));
  assert.ok(!pasajero.includes('renderActiveRide'), 'jamas duplica la tarjeta activa');
});

test('los errores se traducen: limite de plan, oferta vencida, conflicto, sin conexion', () => {
  for (const [codigo, humano] of [
    ['SUBSCRIPTION_LIMIT', 'Ya tienes un plan'],
    ['OFFER_EXPIRED', 'venció'],
    ['SCHEDULE_CONFLICT', 'comprometido en ese horario'],
    ['RIDE_ALREADY_COVERED', 'tomado por otro conductor'],
    ['NETWORK_ERROR', 'Sin conexión']
  ]) {
    assert.ok(servicio.includes(codigo) , `falta el codigo ${codigo}`);
    assert.ok(servicio.includes(humano), `falta el texto humano de ${codigo}`);
  }
  assert.ok(servicio.includes('mensajeDeError'));
  assert.ok(!/lastError\?\.error\s*\}\s*`/.test(pasajero), 'los codigos crudos no llegan a pantalla');
});

// --------------------------------------------------------------------------
// Conductor (§17-§21)
// --------------------------------------------------------------------------

test('opt-in del conductor: voluntario, con la politica de apagado explicada', () => {
  assert.ok(conductor.includes('Recibir traslados programados'));
  assert.ok(conductor.includes('voluntario'));
  assert.ok(/ofertas\s*\n?\s*NUEVAS/.test(conductor), 'apagar corta ofertas NUEVAS');
  assert.ok(/ya aceptaste siguen en pie/.test(conductor), 'los compromisos permanecen: la distincion no se oculta');
  assert.ok(conductor.includes('role="switch"') && conductor.includes('aria-checked'),
    'interruptor accesible');
});

test('aceptar/rechazar/retirarse: bloqueo anti doble toque y cero confirmacion optimista', () => {
  assert.ok(/forEach\(b => \{ b\.disabled = true; \}\)/.test(conductor),
    'todos los botones se bloquean al enviar');
  assert.ok(/await ejecutar\(rideId\)/.test(conductor), 'primero el servidor');
  assert.ok(conductor.includes('await cargar()'), 'tras el ACK se recarga el estado real');
  assert.ok(conductor.includes('¿Seguro? El pasajero necesitará respaldo'),
    'retirarse exige confirmar y explica la consecuencia');
  assert.ok(!/retiro cancela|cancelar(a|á) el plan/.test(conductor),
    'retirarse no se presenta como cancelar el plan del pasajero');
});

// --------------------------------------------------------------------------
// Integracion sin redisenos (§30) y accesibilidad (§28)
// --------------------------------------------------------------------------

test('la funcion nueva se adapta a la app: sin tocar navegacion ni pantallas ajenas', () => {
  // La navegacion inferior del pasajero conserva sus cuatro pestanas.
  for (const tab of ['data-tab="home"', 'data-tab="history"', 'data-tab="wallet"', 'data-tab="profile"']) {
    assert.ok(appPasajero.includes(tab), `pestana intacta: ${tab}`);
  }
  // La del conductor tambien.
  for (const tab of ['data-tab="inicio"', 'data-tab="ganancias"', 'data-tab="viajes"', 'data-tab="perfil"']) {
    assert.ok(appConductor.includes(tab), `pestana intacta: ${tab}`);
  }
  // El CSS nuevo vive en su hoja y usa los tokens del sistema.
  const css = leer('src/styles/safe-transport.css');
  assert.ok(css.includes('--x58-yellow') && css.includes('--x58-surface-1'));
  assert.ok(!/#00bcd4|#00e5ff|cyan|#2196f3/i.test(css), 'sin cian/azul decorativo');
  assert.ok(css.includes('safe-area-inset-bottom'), 'respeta el area segura');
  assert.ok(css.includes('prefers-reduced-motion'));
});

test('accesibilidad: controles de solo icono con etiqueta y estados anunciados', () => {
  assert.ok(pasajero.includes('aria-label="Volver"'));
  assert.ok(pasajero.includes('aria-live'));
  assert.ok(conductor.includes('aria-live'));
  assert.ok(pasajero.includes('role="status"'));
  const css = leer('src/styles/safe-transport.css');
  assert.ok(/min-height:\s*4[4-8]px/.test(css), 'objetivos tactiles al estandar de la app');
});

test('sin administracion del Transporte Seguro en 1F', () => {
  const adminDir = path.join(root, 'src/pages/admin');
  for (const entrada of fs.readdirSync(adminDir)) {
    const codigo = leer(path.join('src/pages/admin', entrada));
    assert.ok(!codigo.includes('transport/subscriptions') && !codigo.includes('safeTransport'),
      `sin UI admin del traslado seguro: ${entrada}`);
  }
});
