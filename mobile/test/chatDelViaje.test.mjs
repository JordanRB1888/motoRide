import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  LARGO_MAXIMO,
  conHistorial,
  conMensaje,
  enPantalla,
  estadoDeLaPantalla,
  marcarFallida,
  motivoDelFallo,
  pendienteDe,
  reactivarPendiente,
  sePuedeEscribir,
  sinPendiente,
  textoParaEnviar
} from '../domain/chatDelViaje';
import { EVENTOS_DEL_CLIENTE, EVENTOS_DEL_SERVIDOR, EVENTOS_PENDIENTES } from '../realtime/eventos';
import {
  FORMATOS_DE_CHAT,
  LIMITE_DATA_URL,
  interpretarImagenDeChat
} from '../domain/imagenDeChat';

/**
 * CHAT PASSENGER ↔ DRIVER 1 — la conversación del viaje.
 *
 * El backend del chat ya existía: aquí se comprueba la cabeza del móvil. Que
 * un mensaje no aparezca dos veces por ningún camino, que el orden no dependa
 * de por dónde llegó, que sólo se escriba con la carrera viva, y que la
 * pantalla distinga VACÍO de ERROR y SIN CONEXIÓN de fallo del servidor.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

const YO = 'passenger_1';
const ELLA = 'driver_1';

/** Un mensaje como el que devuelve el servidor, ya proyectado. */
const real = (id, autorId, cuando, extra = {}) => ({
  id,
  autorId,
  autorNombre: autorId === YO ? 'Ana' : 'Luis',
  texto: `texto ${id}`,
  cuando,
  adjuntoId: null,
  ...extra
});

// ---------------------------------------------------------------------------
// Sin duplicados
// ---------------------------------------------------------------------------

test('el mismo id no entra dos veces: historial y luego socket', () => {
  const m = enPantalla(real('m1', ELLA, '2026-09-05T10:00:00.000Z'), YO);
  const lista = conMensaje(conMensaje([], m), m);
  assert.equal(lista.length, 1);
});

test('el acuse de un pendiente lo sustituye en vez de sumarse', () => {
  const pendiente = pendienteDe('hola', 'clave_a', 'Ana', Date.parse('2026-09-05T10:00:00.000Z'));
  const acuse = enPantalla(real('m2', YO, '2026-09-05T10:00:01.000Z', { clientId: 'clave_a' }), YO);

  const lista = conMensaje([pendiente], acuse);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, 'm2');
  assert.equal(lista[0].pendiente, false);
  assert.equal(lista[0].mio, true);
});

test('un reintento del servidor con el mismo id no duplica aunque llegue tras el acuse', () => {
  const pendiente = pendienteDe('hola', 'clave_a', 'Ana', 0);
  const acuse = enPantalla(real('m2', YO, '2026-09-05T10:00:01.000Z', { clientId: 'clave_a' }), YO);
  const lista = conMensaje(conMensaje([pendiente], acuse), acuse);
  assert.equal(lista.length, 1);
});

test('el historial conserva los pendientes vivos y descarta los que ya trae acusados', () => {
  const vivo = pendienteDe('aún en camino', 'clave_v', 'Ana', Date.parse('2026-09-05T10:00:05.000Z'));
  const yaAcusado = pendienteDe('ya llegó', 'clave_y', 'Ana', Date.parse('2026-09-05T10:00:02.000Z'));
  const historial = [
    enPantalla(real('h1', ELLA, '2026-09-05T10:00:00.000Z'), YO),
    enPantalla(real('h2', YO, '2026-09-05T10:00:03.000Z', { clientId: 'clave_y' }), YO)
  ];

  const lista = conHistorial([vivo, yaAcusado], historial);
  assert.deepEqual(lista.map(m => m.id), ['h1', 'h2', 'pendiente_clave_v']);
  assert.equal(lista.filter(m => m.pendiente).length, 1);
});

test('el historial repetido —reconexión, remount— no cambia la lista', () => {
  const historial = [
    enPantalla(real('h1', ELLA, '2026-09-05T10:00:00.000Z'), YO),
    enPantalla(real('h2', YO, '2026-09-05T10:00:03.000Z'), YO)
  ];
  const una = conHistorial([], historial);
  const dos = conHistorial(una, historial);
  assert.deepEqual(dos.map(m => m.id), ['h1', 'h2']);
});

test('un pendiente rechazado se quita, no se queda girando', () => {
  const pendiente = pendienteDe('hola', 'clave_r', 'Ana', 0);
  const otro = enPantalla(real('m1', ELLA, '2026-09-05T10:00:00.000Z'), YO);
  const lista = sinPendiente(conMensaje([pendiente], otro), 'clave_r');
  assert.deepEqual(lista.map(m => m.id), ['m1']);
});

// ---------------------------------------------------------------------------
// Orden determinista
// ---------------------------------------------------------------------------

test('el orden es por marca de tiempo y luego por id, venga por donde venga', () => {
  const a = enPantalla(real('b', ELLA, '2026-09-05T10:00:00.000Z'), YO);
  const b = enPantalla(real('a', YO, '2026-09-05T10:00:00.000Z'), YO);
  const c = enPantalla(real('z', ELLA, '2026-09-05T09:59:59.000Z'), YO);

  const porSocket = conMensaje(conMensaje(conMensaje([], a), b), c);
  const porHistorial = conHistorial([], [c, b, a]);

  assert.deepEqual(porSocket.map(m => m.id), ['z', 'a', 'b']);
  assert.deepEqual(porHistorial.map(m => m.id), ['z', 'a', 'b']);
});

// ---------------------------------------------------------------------------
// Cuándo se escribe y qué se manda
// ---------------------------------------------------------------------------

test('se escribe con la carrera viva y con ningún otro estado', () => {
  for (const vivo of ['DRIVER_ASSIGNED', 'ARRIVED', 'IN_PROGRESS']) assert.equal(sePuedeEscribir(vivo), true, vivo);
  for (const no of ['SEARCHING', 'COMPLETED', 'CANCELLED', 'REJECTED', null, undefined, '']) {
    assert.equal(sePuedeEscribir(no), false, String(no));
  }
});

test('el vacío no se manda y el texto se recorta al tope del servidor', () => {
  assert.equal(textoParaEnviar(''), null);
  assert.equal(textoParaEnviar('   \n  '), null);
  assert.equal(textoParaEnviar('  hola  '), 'hola');
  assert.equal(textoParaEnviar('x'.repeat(LARGO_MAXIMO + 50)).length, LARGO_MAXIMO);
  assert.equal(LARGO_MAXIMO, 1000);
});

test('mío o ajeno lo decide el id del autor, nunca lo que diga el texto', () => {
  assert.equal(enPantalla(real('m1', YO, '2026-09-05T10:00:00.000Z'), YO).mio, true);
  assert.equal(enPantalla(real('m1', ELLA, '2026-09-05T10:00:00.000Z'), YO).mio, false);
});

// ---------------------------------------------------------------------------
// Los cinco estados de la pantalla
// ---------------------------------------------------------------------------

test('VACÍO ≠ ERROR y SIN CONEXIÓN ≠ fallo del servidor', () => {
  const nada = [];
  assert.equal(estadoDeLaPantalla({ cargando: true, fallo: false, hayConexion: true, mensajes: nada }), 'CARGANDO');
  assert.equal(estadoDeLaPantalla({ cargando: false, fallo: false, hayConexion: true, mensajes: nada }), 'VACIO');
  assert.equal(estadoDeLaPantalla({ cargando: false, fallo: true, hayConexion: true, mensajes: nada }), 'ERROR');
  assert.equal(estadoDeLaPantalla({ cargando: false, fallo: true, hayConexion: false, mensajes: nada }), 'SIN_CONEXION');
  assert.equal(estadoDeLaPantalla({ cargando: false, fallo: false, hayConexion: false, mensajes: nada }), 'SIN_CONEXION');
});

test('con contenido se sigue leyendo aunque no haya red o falle la recarga', () => {
  const algo = [enPantalla(real('m1', ELLA, '2026-09-05T10:00:00.000Z'), YO)];
  assert.equal(estadoDeLaPantalla({ cargando: false, fallo: true, hayConexion: false, mensajes: algo }), 'CONTENIDO');
  assert.equal(estadoDeLaPantalla({ cargando: true, fallo: false, hayConexion: true, mensajes: algo }), 'CONTENIDO');
});

test('cada rechazo del servidor tiene su frase, y lo desconocido una genérica', () => {
  for (const codigo of ['FORBIDDEN', 'CHAT_CLOSED', 'EMPTY_MESSAGE', 'CHAT_MESSAGE_FAILED']) {
    assert.notEqual(motivoDelFallo(codigo), motivoDelFallo('OTRA_COSA'), codigo);
  }
  assert.equal(motivoDelFallo(undefined), motivoDelFallo('OTRA_COSA'));
});

// ---------------------------------------------------------------------------
// Contratos con el servidor y con las pantallas
// ---------------------------------------------------------------------------

test('chat:message y chat:error ya se escuchan: están en los eventos del servidor y no en los pendientes', () => {
  assert.ok(EVENTOS_DEL_SERVIDOR.includes('chat:message'));
  assert.ok(EVENTOS_DEL_SERVIDOR.includes('chat:error'));
  assert.ok(!EVENTOS_PENDIENTES.includes('chat:message'));
  assert.ok(!EVENTOS_PENDIENTES.includes('chat:error'));
  assert.ok(EVENTOS_DEL_CLIENTE.includes('chat:send_message'));
});

test('el envío lleva tripId, text y clientId, y NUNCA la identidad del remitente', () => {
  const fuente = despojarComentarios(leer('realtime/socket.ts'));
  const emisor = fuente.slice(fuente.indexOf('export function enviarMensajeDeChat'));
  const cuerpo = emisor.slice(0, emisor.indexOf('\n}'));

  assert.match(cuerpo, /emit\('chat:send_message', \{[\s\S]*tripId: viajeId,[\s\S]*text: texto,[\s\S]*clientId: claveDeIntento/);
  assert.doesNotMatch(cuerpo, /senderId|userId|role/);
  // Sin socket no se manda y se dice: el pendiente no se pinta a ciegas.
  assert.match(cuerpo, /if \(socket === null \|\| !socket\.connected\) return false;/);
});

test('el hook no da un mensaje por enviado hasta que el servidor lo devuelve', () => {
  const fuente = despojarComentarios(leer('realtime/ChatDelViaje.tsx'));
  // El pendiente sólo entra si el socket aceptó emitir.
  assert.match(fuente, /if \(!enviarMensajeDeChat\(viajeId, texto, clave\)\) \{[\s\S]*?return;[\s\S]*?\}\s*setMensajes\(previos => conMensaje\(previos, pendienteDe\(/);
  // El acuse y el historial pasan por las guardas de duplicados, no por push.
  assert.match(fuente, /useEvento\('chat:message'/);
  assert.match(fuente, /conMensaje\(previos, durable\)/);
  assert.match(fuente, /conHistorial\(previos, durables\)/);
  assert.doesNotMatch(fuente, /\[\.\.\.previos, /);
  // Al reconectar se vuelve a pedir el historial.
  assert.match(fuente, /useResync\(/);
  // Los mensajes de otro viaje no entran.
  assert.match(fuente, /dato\.tripId !== viajeEnPantalla\.current\) return;/);
});

test('las dos pantallas del viaje llevan al chat con un botón vivo, no muerto', () => {
  const pasajera = despojarComentarios(leer('app/viaje-activo.tsx'));
  assert.match(pasajera, /<C2Viaje[^>]*onMensaje=\{\(\) => router\.push\('\/chat'\)\}/);

  const tarjeta = despojarComentarios(leer('preview/pantallasC2.tsx'));
  assert.match(tarjeta, /testID=\{accion === 'Mensaje' \? 'abrir-chat' : undefined\}/);
  assert.match(tarjeta, /onPress=\{accion === 'Mensaje' \? onMensaje : undefined\}/);

  const conductor = despojarComentarios(leer('app/conductor.tsx'));
  assert.match(conductor, /<SuperficieDeCarrera[\s\S]*?onMensaje=\{\(\) => router\.push\('\/chat'\)\}/);

  const superficie = despojarComentarios(leer('conductor/SuperficieDeCarrera.tsx'));
  assert.match(superficie, /onMensaje === undefined \? null : \(/);
  assert.match(superficie, /testID="abrir-chat-conductor"/);
});

test('la pantalla del chat existe como ruta, respeta el tope y tiene sus cinco estados', () => {
  const fuente = leer('app/chat.tsx');
  assert.match(fuente, /export default function PantallaDeChat/);
  assert.match(fuente, /maxLength=\{LARGO_MAXIMO\}/);
  for (const estado of ['chat-cargando', 'chat-sin-conexion', 'chat-error', 'chat-vacio', 'hilo-de-chat']) {
    assert.ok(fuente.includes(`testID="${estado}"`), estado);
  }
  for (const testID of ['mensaje-pendiente', 'mensaje-mio', 'mensaje-ajeno', 'campo-de-chat', 'boton-enviar-chat', 'chat-cerrado']) {
    assert.ok(fuente.includes(testID), testID);
  }
});

// ---------------------------------------------------------------------------
// CHAT PASSENGER ↔ DRIVER 2 — imágenes privadas
// ---------------------------------------------------------------------------

/** Un mensaje del servidor con adjunto: sólo la referencia pública viaja. */
const conAdjunto = (id, autorId, cuando, adjuntoId, extra = {}) =>
  real(id, autorId, cuando, { adjuntoId, texto: '', ...extra });

test('un mensaje durable con imagen lleva su id público de adjunto', () => {
  const m = enPantalla(conAdjunto('m1', ELLA, '2026-09-05T10:00:00.000Z', 'media_abc'), YO);
  assert.equal(m.adjuntoId, 'media_abc');
  assert.equal(m.adjuntoLocal, null);       // durable: no hay vista previa local
  assert.equal(m.fallida, false);
});

test('un pendiente de imagen enseña su vista previa local y aún no tiene id de adjunto', () => {
  const p = pendienteDe('', 'clave_img', 'Ana', Date.parse('2026-09-05T10:00:00.000Z'), 'file:///tmp/foto.jpg');
  assert.equal(p.pendiente, true);
  assert.equal(p.adjuntoLocal, 'file:///tmp/foto.jpg');
  assert.equal(p.adjuntoId, '');            // todavía no ha vuelto del servidor
  assert.equal(p.texto, '');
});

test('el durable de una imagen sustituye a su pendiente: id de adjunto, sin vista previa local', () => {
  const pend = pendienteDe('', 'clave_img', 'Ana', Date.parse('2026-09-05T10:00:00.000Z'), 'file:///tmp/foto.jpg');
  const durable = enPantalla(conAdjunto('m2', YO, '2026-09-05T10:00:01.000Z', 'media_xyz', { clientId: 'clave_img' }), YO);
  const lista = conMensaje([pend], durable);
  assert.equal(lista.length, 1);            // sustituye, no se suma
  assert.equal(lista[0].id, 'm2');
  assert.equal(lista[0].adjuntoId, 'media_xyz');
  assert.equal(lista[0].adjuntoLocal, null);
  assert.equal(lista[0].pendiente, false);
});

test('una imagen rechazada se marca fallida y se conserva; el reintento la reactiva', () => {
  const pend = pendienteDe('', 'clave_img', 'Ana', 0, 'file:///tmp/foto.jpg');
  const fallada = marcarFallida([pend], 'clave_img');
  assert.equal(fallada.length, 1);          // NO se quita: se conserva para reintentar
  assert.equal(fallada[0].fallida, true);
  assert.equal(fallada[0].adjuntoLocal, 'file:///tmp/foto.jpg'); // la previa sigue

  const reactivada = reactivarPendiente(fallada, 'clave_img');
  assert.equal(reactivada[0].fallida, false);
  assert.equal(reactivada[0].pendiente, true);
});

test('un mensaje de sólo imagen cuenta como contenido, no como vacío', () => {
  const soloImagen = [enPantalla(conAdjunto('m1', ELLA, '2026-09-05T10:00:00.000Z', 'media_abc'), YO)];
  assert.equal(estadoDeLaPantalla({ cargando: false, fallo: false, hayConexion: true, mensajes: soloImagen }), 'CONTENIDO');
});

// --- Contratos de la imagen ---

test('el emisor del socket manda la imagen sólo cuando la hay, y nunca la identidad', () => {
  const fuente = despojarComentarios(leer('realtime/socket.ts'));
  const emisor = fuente.slice(fuente.indexOf('export function enviarMensajeDeChat'));
  const cuerpo = emisor.slice(0, emisor.indexOf('\n}'));
  // La firma acepta una imagen opcional y sólo la incluye cuando existe.
  assert.match(cuerpo, /imagen\?: string/);
  assert.match(cuerpo, /\.\.\.\(imagen \? \{ image: imagen \} : \{\}\)/);
  assert.doesNotMatch(cuerpo, /senderId|userId|role/);
});

test('la lista blanca de formatos y el tope son los del contrato', () => {
  assert.deepEqual([...FORMATOS_DE_CHAT], ['image/jpeg', 'image/png', 'image/webp']);
  // Por debajo del corte de 1 MB del socket, para dejar sitio al sobre del evento.
  assert.equal(LIMITE_DATA_URL, 900_000);
  assert.ok(LIMITE_DATA_URL < 1_000_000);
});

test('interpretarImagenDeChat: acepta los tres formatos y rechaza todo lo demás', () => {
  const base64 = Buffer.from('bytes-de-una-imagen').toString('base64');
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const r = interpretarImagenDeChat({ uri: `file:///tmp/x`, mimeType: mime, base64 });
    assert.equal(r.ok, true, mime);
    if (r.ok) assert.equal(r.imagen.dataUrl, `data:${mime};base64,${base64}`);
  }
  // Formatos activos o no admitidos: fuera.
  for (const mime of ['image/svg+xml', 'image/gif', 'image/bmp', 'image/tiff', 'text/html']) {
    assert.equal(interpretarImagenDeChat({ uri: 'file:///tmp/x', mimeType: mime, base64 }).ok, false, mime);
  }
  // Sin base64 no hay nada que mandar.
  assert.equal(interpretarImagenDeChat({ uri: 'file:///tmp/x.jpg', base64: null }).ok, false);
  // Por encima del tope: se rechaza sin mandarlo.
  const enorme = interpretarImagenDeChat({ uri: 'file:///tmp/x.jpg', mimeType: 'image/jpeg', base64: 'A'.repeat(LIMITE_DATA_URL) });
  assert.equal(enorme.ok, false);
  if (!enorme.ok) assert.equal(enorme.motivo, 'TAMANO');
});

test('el picker vive tras la puerta única, y su lógica es pura y sin orígenes externos', () => {
  // La captura nativa está en la puerta; nadie más importa expo-image-picker
  // (lo vigila fotoDeDocumento.test). Aquí sólo se confirma que la imagen de
  // chat entra por esa puerta con base64.
  const puerta = leer('media/captura.ts');
  assert.match(puerta, /export async function elegirImagenDeChat/);
  assert.match(puerta, /base64: true/);
  // La lógica pura no toca red ni orígenes activos.
  const dominio = despojarComentarios(leer('domain/imagenDeChat.ts'));
  assert.doesNotMatch(dominio, /svg|image\/gif|http:\/\/|https:\/\/|blob:|data:text\/html/);
});

test('la imagen sobrevive a que Android destruya la aplicación: se rescata al reabrir', () => {
  // La puerta expone el rescate con getPendingResultAsync, y el chat lo llama al
  // montar con un viaje cargado y manda lo que quedó pendiente. Sin esto, una
  // imagen elegida justo antes de una recreación de actividad se perdería.
  const puerta = leer('media/captura.ts');
  assert.match(puerta, /export async function recuperarImagenDeChatPendiente/);
  assert.match(puerta, /getPendingResultAsync/);

  const pantalla = despojarComentarios(leer('app/chat.tsx'));
  assert.match(pantalla, /recuperarImagenDeChatPendiente\(\)/);
  assert.match(pantalla, /pendiente\.ok[\s\S]{0,60}chat\.enviarImagen\(pendiente\.imagen\)/);
});

test('la pantalla del chat adjunta, pinta, amplía y reintenta imágenes con el loader autenticado', () => {
  const fuente = leer('app/chat.tsx');
  for (const testID of ['adjuntar-imagen', 'imagen-de-chat', 'imagen-subiendo', 'reintentar-imagen', 'cerrar-imagen']) {
    assert.ok(fuente.includes(`testID="${testID}"`), testID);
  }
  // La vista ampliada sólo lleva su testID cuando está visible.
  assert.ok(fuente.includes("'imagen-ampliada'"), 'imagen-ampliada');
  // La imagen durable se pide con la sesión, por el mismo loader del historial.
  assert.match(fuente, /fuenteDeAdjunto/);
  // La pendiente enseña su `file://` local; la durable, la fuente autenticada.
  assert.match(fuente, /mensaje\.adjuntoLocal !== null[\s\S]{0,40}\{ uri: mensaje\.adjuntoLocal \}/);
  const limpio = despojarComentarios(fuente);
  assert.doesNotMatch(limpio, /svg|image\/gif|http:\/\/|https:\/\/|blob:|data:text\/html/);
});

test('el hook expone el envío y el reintento de imágenes', () => {
  const fuente = despojarComentarios(leer('realtime/ChatDelViaje.tsx'));
  assert.match(fuente, /enviarImagen: \(imagen: ImagenDeChat\) => void/);
  assert.match(fuente, /reintentarImagen: \(claveDeIntento: string\) => void/);
  // Nunca se da por enviada una imagen sin acuse: el pendiente sale con su
  // vista previa local y sólo el durable lo sustituye.
  assert.match(fuente, /enviarMensajeDeChat\(viajeId, '', clave, imagen\.dataUrl\)/);
  // Al cambiar de viaje se sueltan las data URL guardadas: sin fugas.
  assert.match(fuente, /intentosDeImagen\.current\.clear\(\)/);
});
