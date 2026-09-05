import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

// ---------------------------------------------------------------------------
// 1. Aislamiento e integridad
// ---------------------------------------------------------------------------

test('ChatVisual, TripVisual y AdjuntoDetalleViaje no importan socket, backend ni auth', () => {
  const chatSrc = sinComentarios('ui/ChatVisual.tsx');
  const tripSrc = sinComentarios('ui/TripVisual.tsx');
  const adjuntoSrc = sinComentarios('ui/AdjuntoDetalleViaje.tsx');
  const previewSrc = sinComentarios('preview/pantallasChatTrip.tsx');

  for (const src of [chatSrc, tripSrc, adjuntoSrc, previewSrc]) {
    assert.doesNotMatch(src, /socket\.io/i, 'No debe haber socket.io');
    assert.doesNotMatch(src, /realtime/i, 'No debe importar de realtime');
    assert.doesNotMatch(src, /AuthContext/i, 'No debe importar de AuthContext');
    assert.doesNotMatch(src, /fetch\(/i, 'No debe hacer llamadas de red fetch');
    assert.doesNotMatch(src, /XMLHttpRequest/i, 'No debe hacer llamadas XMLHttpRequest');
  }
});

// ---------------------------------------------------------------------------
// 2. Registro de las 18 pantallas (A hasta R) en el catálogo de C2
// ---------------------------------------------------------------------------

test('el catálogo C2 del laboratorio visual incluye las 18 pantallas (A hasta R)', () => {
  const previewApp = sinComentarios('app/preview.tsx');

  const pantallasRequeridas = [
    'chat-pasajera-light',          // A
    'chat-pasajera-dark',           // B
    'chat-conductor-light',         // C
    'chat-conductor-dark',          // D
    'chat-texto',                   // E
    'chat-imagenes',                // F
    'chat-uploading',               // G
    'chat-failed-retry',            // H
    'chat-offline',                 // I
    'chat-empty',                   // J
    'chat-error',                   // K
    'passenger-driver-assigned',    // L
    'passenger-arrived',            // M
    'passenger-in-progress',        // N
    'driver-driver-assigned',       // O
    'driver-arrived',               // P
    'driver-in-progress',           // Q
    'historial-detalle-imagen'      // R
  ];

  for (const clave of pantallasRequeridas) {
    assert.ok(
      previewApp.includes(`clave: '${clave}'`),
      `La pantalla ${clave} no está registrada en PANTALLAS_C2`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Exportación de componentes de preview
// ---------------------------------------------------------------------------

test('pantallasChatTrip exporta todos los componentes de preview requeridos', () => {
  const previewHarness = sinComentarios('preview/pantallasChatTrip.tsx');

  const componentesRequeridos = [
    'PreviewChatPasajeraLight',
    'PreviewChatPasajeraDark',
    'PreviewChatConductorLight',
    'PreviewChatConductorDark',
    'PreviewChatTexto',
    'PreviewChatImagenes',
    'PreviewChatUploading',
    'PreviewChatFailedRetry',
    'PreviewChatOffline',
    'PreviewChatEmpty',
    'PreviewChatError',
    'PreviewPassengerDriverAssigned',
    'PreviewPassengerArrived',
    'PreviewPassengerInProgress',
    'PreviewDriverDriverAssigned',
    'PreviewDriverArrived',
    'PreviewDriverInProgress',
    'PreviewHistorialDetalleConImagen',
    'PreviewViajeActivoPasajera',
    'PreviewViajeActivoConductor',
    'PreviewChatEstados'
  ];

  for (const comp of componentesRequeridos) {
    assert.ok(
      previewHarness.includes(`export function ${comp}`),
      `El componente ${comp} no está exportado en pantallasChatTrip.tsx`
    );
  }
});

test('ChatVisual soporta agrupación, visor fullscreen y estados', () => {
  const chatSrc = sinComentarios('ui/ChatVisual.tsx');

  assert.ok(chatSrc.includes('VisorDeImagenModal'), 'Debe incluir visor de imagen fullscreen');
  assert.ok(chatSrc.includes('TicksDeEnvio'), 'Debe incluir indicadores de estado de envío');
  assert.ok(chatSrc.includes('mensajesAgrupados'), 'Debe implementar agrupación visual de mensajes');
  assert.ok(chatSrc.includes('OFFLINE'), 'Debe soportar estado OFFLINE');
  assert.ok(chatSrc.includes('ERROR'), 'Debe soportar estado ERROR');
  assert.ok(chatSrc.includes('CARGANDO'), 'Debe soportar estado CARGANDO');
  assert.ok(chatSrc.includes('VACIO'), 'Debe soportar estado VACIO');
});

test('TripVisual implementa jerarquía lifecycle primaria y mensaje secundario para conductor', () => {
  const tripSrc = sinComentarios('ui/TripVisual.tsx');

  assert.ok(tripSrc.includes('ViajeActivoPasajeraSheet'), 'Debe exportar ViajeActivoPasajeraSheet');
  assert.ok(tripSrc.includes('ViajeActivoConductorSheet'), 'Debe exportar ViajeActivoConductorSheet');
  assert.ok(tripSrc.includes('LLEGUÉ AL PUNTO DE ENCUENTRO'), 'Debe incluir acción LLEGUÉ');
  assert.ok(tripSrc.includes('INICIAR VIAJE'), 'Debe incluir acción INICIAR VIAJE');
  assert.ok(tripSrc.includes('FINALIZAR VIAJE'), 'Debe incluir acción FINALIZAR VIAJE');
  assert.ok(tripSrc.includes('botonLifecyclePrincipal'), 'La acción del ciclo de vida debe ser la principal');
});

test('AdjuntoDetalleViaje soporta todos los estados requeridos (cargando, cargado, error, placeholder)', () => {
  const adjuntoSrc = sinComentarios('ui/AdjuntoDetalleViaje.tsx');

  assert.ok(adjuntoSrc.includes('overlayCargando'), 'Debe incluir estado de carga');
  assert.ok(adjuntoSrc.includes('overlayError'), 'Debe incluir estado de error con reintento');
  assert.ok(adjuntoSrc.includes('marcoPlaceholder'), 'Debe incluir estado de placeholder con marco discontinuo');
  assert.ok(adjuntoSrc.includes('Modal'), 'Debe incluir visor modal fullscreen');
});
