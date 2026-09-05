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

// ---------------------------------------------------------------------------
// Lo que la maqueta no puede enseñar: la fuente llega TARDE
// ---------------------------------------------------------------------------

test('el adjunto reacciona a una fuente que llega después de montarse', () => {
  // Guarda de un fallo real, y de los que no dan ninguna señal.
  //
  // El estado del componente se calculaba una sola vez, al montar. En las
  // maquetas eso basta —el adjunto viene del fixture y ya está en el primer
  // render—, pero en la aplicación de verdad la pantalla se monta SIN imagen:
  // `fuenteDeAdjunto` va al servidor con la sesión y el data URI aparece un
  // momento después.
  //
  // Sin reaccionar a esa llegada, el estado quedaba clavado en «placeholder» y
  // la imagen no se pintaba nunca, aunque el servidor devolviera sus 200 y sus
  // veintisiete kilobytes. En el historial se veía un marco vacío.
  const adjuntoSrc = sinComentarios('ui/AdjuntoDetalleViaje.tsx');

  assert.match(
    adjuntoSrc,
    /useEffect\(\(\) => \{[\s\S]*?setEstadoCarga\(uri === undefined \? 'placeholder' : 'cargando'\)/,
    'el adjunto no se entera de que la fuente llegó'
  );
  assert.match(
    adjuntoSrc,
    /\}, \[uri, estadoForzado\]\)/,
    'el efecto no depende de la fuente, así que no vuelve a correr cuando cambia'
  );
});

test('el marco de la imagen no puede colapsar a cero de ancho', () => {
  // El componente traía `width: '100%'`, y en el detalle del viaje vive dentro
  // de una burbuja que se ajusta a su contenido: ahí un porcentaje no tiene
  // contra qué medirse y se resuelve a cero. La imagen se cargaba y no había
  // dónde pintarla.
  const adjuntoSrc = sinComentarios('ui/AdjuntoDetalleViaje.tsx');
  assert.match(adjuntoSrc, /minWidth: 220/, 'el marco perdió su suelo de anchura');
});

test('el detalle del viaje usa la presentación de Antigravity con la fuente privada de aquí', () => {
  // La mitad visual es de la rama de diseño; la fuente la resuelve
  // `fuenteDeAdjunto`, que pide los bytes CON LA SESIÓN y devuelve un data URI.
  // Si alguien volviera a pintar aquí una URL directa, la imagen dejaría de
  // verse en el dispositivo —`<Image>` no reenvía cabeceras propias— y además
  // sería una dirección sin autenticar.
  const detalle = sinComentarios('preview/pantallaDetalleDeViaje.tsx');
  assert.match(detalle, /<AdjuntoDetalleViaje rotulo=\{rotulo\} fuente=\{fuente\} \/>/);
  assert.doesNotMatch(detalle, /imageStorageKey/, 'la clave del almacén no se nombra en el cliente');
});
