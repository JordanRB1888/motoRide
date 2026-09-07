import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  CALIDAD_DE_VIDEO,
  DURACION_MAXIMA_EN_SEGUNDOS,
  MENSAJES_DE_VIDEO,
  TAMANO_MAXIMO_DE_VIDEO,
  TIPOS_DE_VIDEO,
  interpretarVideo,
  nombreDelVideo,
  tipoDeVideoPorExtension
} from '../domain/videoDePresentacion.ts';

/**
 * El vídeo de presentación: qué se acepta, qué se rechaza antes de gastar
 * megas, y que el vídeo no se quede en ningún sitio del teléfono.
 *
 * Las reglas de aquí son un espejo del servidor. Si allí cambian y aquí no,
 * alguien subiría cincuenta megas por una red móvil para que se los
 * rechazaran al final; estas pruebas leen el servidor y comparan.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));
const leerServidor = relativa => fs.readFileSync(path.resolve(raizMovil, '..', 'server', relativa), 'utf8');

// ---------------------------------------------------------------------------
// Las medidas son las del servidor
// ---------------------------------------------------------------------------

test('los tipos de vídeo son los del almacenamiento privado del servidor', () => {
  const almacen = leerServidor('services/privateStorage.js');
  const bloque = almacen.match(/VIDEO_MIME_TYPES = Object\.freeze\(\[([^\]]*)\]\)/);
  assert.ok(bloque, 'no encuentro los tipos de vídeo del servidor');
  const delServidor = [...bloque[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
  assert.deepEqual([...TIPOS_DE_VIDEO].sort(), delServidor.sort());
});

test('WebM no está: Safari no lo reproduce y administración revisa desde un Mac', () => {
  assert.equal(TIPOS_DE_VIDEO.includes('video/webm'), false);
  const almacen = leerServidor('services/privateStorage.js');
  const bloque = almacen.match(/VIDEO_MIME_TYPES = Object\.freeze\(\[([^\]]*)\]\)/);
  assert.equal(/webm/.test(bloque[1]), false, 'el servidor no debe aceptar WebM');
});

test('la duración y el peso máximos son los del servidor', () => {
  const modelo = leerServidor('domain/driverApplicationModel.js');
  const duracion = modelo.match(/VIDEO_MAX_DURATION_SECONDS = (\d+)/);
  const peso = modelo.match(/VIDEO_MAX_FILE_SIZE = (\d+) \* 1024 \* 1024/);
  assert.ok(duracion && peso, 'no encuentro los topes del vídeo en el servidor');
  assert.equal(DURACION_MAXIMA_EN_SEGUNDOS, Number(duracion[1]));
  assert.equal(TAMANO_MAXIMO_DE_VIDEO, Number(peso[1]) * 1024 * 1024);
});

test('se pide calidad media: 720p basta para una cara y ahorra datos', () => {
  assert.ok(CALIDAD_DE_VIDEO > 0 && CALIDAD_DE_VIDEO < 1, 'la calidad máxima gasta megas de más');
});

// ---------------------------------------------------------------------------
// Lo que devuelve el selector se interpreta con desconfianza
// ---------------------------------------------------------------------------

const activo = (extra = {}) => ({
  uri: 'file:///data/user/0/app/cache/presentacion.mp4',
  mimeType: 'video/mp4',
  duration: 12_000,
  fileSize: 3 * 1024 * 1024,
  width: 720,
  height: 1280,
  ...extra
});

test('un vídeo normal pasa, y la duración llega en segundos', () => {
  const resultado = interpretarVideo(activo());
  assert.equal(resultado.ok, true);
  assert.equal(resultado.video.mimeType, 'video/mp4');
  // El selector la da en milisegundos; el resto de la aplicación trabaja en segundos.
  assert.equal(resultado.video.duracion, 12);
  assert.equal(resultado.video.tamano, 3 * 1024 * 1024);
});

test('sin uri no hay vídeo', () => {
  assert.deepEqual(interpretarVideo(activo({ uri: undefined })), { ok: false, motivo: 'NO_DISPONIBLE' });
});

test('un tipo que no reproduce todo el mundo se rechaza aquí, no en el servidor', () => {
  assert.deepEqual(
    interpretarVideo(activo({ mimeType: 'video/webm', uri: 'file:///cache/v.webm' })),
    { ok: false, motivo: 'TIPO_NO_ADMITIDO' }
  );
  assert.deepEqual(
    interpretarVideo(activo({ mimeType: 'image/jpeg', uri: 'file:///cache/foto.jpg' })),
    { ok: false, motivo: 'TIPO_NO_ADMITIDO' }
  );
});

test('cuando el selector no dice el tipo, se mira la extensión; y si tampoco, se rechaza', () => {
  assert.equal(interpretarVideo(activo({ mimeType: null })).video.mimeType, 'video/mp4');
  assert.equal(
    interpretarVideo(activo({ mimeType: null, uri: 'file:///cache/clip.mov' })).video.mimeType,
    'video/quicktime'
  );
  assert.deepEqual(
    interpretarVideo(activo({ mimeType: null, uri: 'file:///cache/clip.avi' })),
    { ok: false, motivo: 'TIPO_NO_ADMITIDO' }
  );
  // Nunca se adivina un tipo: adivinar es subir algo que el servidor va a tirar.
  assert.equal(tipoDeVideoPorExtension('file:///cache/clip.mkv'), null);
  assert.equal(tipoDeVideoPorExtension('file:///cache/CLIP.MP4?v=2'), 'video/mp4');
});

test('el tipo con parámetros se limpia antes de compararlo', () => {
  assert.equal(interpretarVideo(activo({ mimeType: 'video/mp4; codecs="avc1.42E01E"' })).video.mimeType, 'video/mp4');
});

test('más de medio minuto se rechaza antes de gastar la red', () => {
  assert.deepEqual(interpretarVideo(activo({ duration: 95_000 })), { ok: false, motivo: 'DEMASIADO_LARGO' });
});

test('treinta segundos justos pasan, aunque el teléfono los declare con decimales', () => {
  assert.equal(interpretarVideo(activo({ duration: 30_000 })).ok, true);
  // Una grabación de treinta suele declararse como 30,04: rechazarla sería
  // incomprensible para quien acaba de contar hasta treinta.
  assert.equal(interpretarVideo(activo({ duration: 30_400 })).ok, true);
});

test('si el teléfono no sabe la duración deja pasar; quien decide es el servidor', () => {
  const resultado = interpretarVideo(activo({ duration: null }));
  assert.equal(resultado.ok, true);
  assert.equal(resultado.video.duracion, null);
  // El teléfono no rechaza porque su número es sólo una cortesía para no gastar
  // la red en balde. El servidor, que lee los bytes, sí rechaza lo que no puede
  // medir: si no supiera medirlo, el tope de treinta segundos sería opcional.
  const ruta = leerServidor('routes/driverApplications.js');
  assert.match(ruta, /VIDEO_TOO_LONG/);
  assert.match(ruta, /VIDEO_DURATION_UNVERIFIABLE/);
  assert.match(ruta, /duracion === null/);
});

test('en web la duración viene en segundos, y se interpreta como tal', () => {
  // `HTMLMediaElement.duration` son segundos; el módulo nativo da milisegundos.
  // Dar por hecha una de las dos convierte dos minutos en 0,12 segundos.
  assert.equal(interpretarVideo(activo({ duration: 12 }), 'SEGUNDOS').video.duracion, 12);
  assert.deepEqual(
    interpretarVideo(activo({ duration: 120 }), 'SEGUNDOS'),
    { ok: false, motivo: 'DEMASIADO_LARGO' }
  );
  // Y con la unidad equivocada, ese mismo vídeo de dos minutos se colaría.
  assert.equal(interpretarVideo(activo({ duration: 120 })).ok, true);
});

test('la unidad la decide la capa que conoce la plataforma, no el dominio', () => {
  const captura = sinComentarios('media/captura.ts');
  assert.match(captura, /Platform[.]OS === 'web' [?] 'SEGUNDOS' : 'MILISEGUNDOS'/);
  assert.match(captura, /interpretarVideo[(]activo, UNIDAD_DE_DURACION[)]/);
  // El dominio no pregunta en qué plataforma corre.
  assert.equal(/react-native/.test(sinComentarios('domain/videoDePresentacion.ts')), false);
});

test('pasado el peso máximo se rechaza aquí también', () => {
  assert.deepEqual(
    interpretarVideo(activo({ fileSize: TAMANO_MAXIMO_DE_VIDEO + 1 })),
    { ok: false, motivo: 'DEMASIADO_GRANDE' }
  );
  assert.equal(interpretarVideo(activo({ fileSize: TAMANO_MAXIMO_DE_VIDEO })).ok, true);
});

test('el nombre del fichero no lleva nada de la persona', () => {
  assert.equal(nombreDelVideo('video/mp4'), 'presentacion.mp4');
  assert.equal(nombreDelVideo('video/quicktime'), 'presentacion.mov');
  for (const tipo of TIPOS_DE_VIDEO) {
    assert.equal(/\d{4,}|cedula|nombre/i.test(nombreDelVideo(tipo)), false);
  }
});

test('cada motivo tiene su mensaje, y cancelar no dice nada', () => {
  for (const motivo of ['PERMISO_DENEGADO', 'TIPO_NO_ADMITIDO', 'DEMASIADO_LARGO', 'DEMASIADO_GRANDE', 'NO_DISPONIBLE']) {
    assert.equal(typeof MENSAJES_DE_VIDEO[motivo], 'string');
    assert.ok(MENSAJES_DE_VIDEO[motivo].length > 10, motivo);
  }
  // Cancelar es una decisión, no un fallo: no se avisa de nada.
  assert.equal(MENSAJES_DE_VIDEO.CANCELADO, '');
});

// ---------------------------------------------------------------------------
// La puerta al módulo nativo: permiso al pulsar, y el corte lo hace la cámara
// ---------------------------------------------------------------------------

test('el permiso de cámara se pide al pulsar grabar, nunca al abrir la pantalla', () => {
  const captura = sinComentarios('media/captura.ts');
  assert.match(captura, /if \(modo === 'TAKE_VIDEO'\) \{\s*const permiso = await ImagePicker\.requestCameraPermissionsAsync\(\);/);
  const pantalla = sinComentarios('app/postulacion/documentos.tsx');
  // Nada de pedir permisos dentro de un efecto al montar.
  assert.equal(/useEffect\([^)]*Permissions/.test(pantalla), false);
});

test('la cámara corta sola a los treinta segundos y no se pide base64 ni exif', () => {
  const captura = sinComentarios('media/captura.ts');
  assert.match(captura, /videoMaxDuration: DURACION_MAXIMA_EN_SEGUNDOS/);
  assert.match(captura, /mediaTypes: \['videos'\]/);
  const opciones = captura.slice(captura.indexOf('capturarVideo'));
  assert.equal(/base64: true/.test(opciones), false);
  assert.equal(/exif: true/.test(opciones), false);
});

test('capturarVideo nunca lanza: todo lo que falla vuelve como motivo', () => {
  const captura = sinComentarios('media/captura.ts');
  const cuerpo = captura.slice(captura.indexOf('export async function capturarVideo'));
  assert.match(cuerpo, /catch \{\s*return \{ ok: false, motivo: falloDe\(modo === 'TAKE_VIDEO'\) \};/);
});

// ---------------------------------------------------------------------------
// El vídeo no se queda en el teléfono ni aparece en un registro
// ---------------------------------------------------------------------------

test('el vídeo no se guarda en el teléfono ni se manda en base64', () => {
  for (const relativa of ['media/captura.ts', 'domain/videoDePresentacion.ts', 'services/postulacion.ts', 'app/postulacion/documentos.tsx']) {
    const codigo = sinComentarios(relativa);
    assert.equal(/AsyncStorage/.test(codigo), false, `${relativa} guarda algo`);
    assert.equal(/data:video/.test(codigo), false, `${relativa} mete el vídeo en una data URL`);
    assert.equal(/MediaLibrary\.save|saveToLibraryAsync/.test(codigo), false, `${relativa} deja el vídeo en la galería`);
  }
  // El vídeo NUNCA se pide en base64: se sube como archivo. La única excepción de
  // la puerta es la IMAGEN de chat, que sí viaja como data URL por el socket;
  // por eso el `base64: true` de la puerta se comprueba fuera de las opciones de
  // vídeo, no en toda la puerta a ciegas.
  const captura = sinComentarios('media/captura.ts');
  const opcionesDeVideo = captura.slice(captura.indexOf('capturarVideo'));
  assert.equal(/base64: true/.test(opcionesDeVideo), false, 'el vídeo se pide en base64');
  for (const relativa of ['domain/videoDePresentacion.ts', 'services/postulacion.ts', 'app/postulacion/documentos.tsx']) {
    assert.equal(/base64: true/.test(sinComentarios(relativa)), false, `${relativa} usa base64`);
  }
});

test('ni la ruta del vídeo ni su contenido salen por consola', () => {
  for (const relativa of ['media/captura.ts', 'domain/videoDePresentacion.ts', 'app/postulacion/documentos.tsx']) {
    const codigo = sinComentarios(relativa);
    assert.equal(/console\.(log|warn|error|info)/.test(codigo), false, `${relativa} registra algo`);
  }
});

// ---------------------------------------------------------------------------
// La subida: por donde sabemos que funciona, y sin reintentos que no ayudan
// ---------------------------------------------------------------------------

test('el vídeo se sube por XMLHttpRequest, no por el multipart de fetch', () => {
  const servicio = sinComentarios('services/postulacion.ts');
  assert.match(servicio, /subirVideoDePresentacion/);
  assert.match(servicio, /'\/api\/driver-applications\/me\/video'/);
  // `subirArchivo` es la vía de XHR que aprendimos en D1; el multipart de fetch
  // de Expo rechaza las partes con uri y ya nos costó una tarde.
  const cuerpo = servicio.slice(servicio.indexOf('export async function subirVideoDePresentacion'));
  assert.match(cuerpo, /await subirArchivo</);
  assert.equal(/fetch\(/.test(cuerpo), false);
  assert.match(sinComentarios('services/api.ts'), /new XMLHttpRequest\(\)/);
});

test('sólo se reintenta la falta de red: un 400, un 413 o un 429 no mejoran por insistir', () => {
  const servicio = sinComentarios('services/postulacion.ts');
  const cuerpo = servicio.slice(servicio.indexOf('export async function subirVideoDePresentacion'));
  assert.match(cuerpo, /respuesta\.motivo !== 'SIN_RED'/);
});

test('el vídeo va por PUT a su propia ruta, con su propio tiempo de espera', () => {
  const servicio = sinComentarios('services/postulacion.ts');
  const cuerpo = servicio.slice(servicio.indexOf('export async function subirVideoDePresentacion'));
  assert.match(cuerpo, /metodo: 'PUT'/);
  assert.match(cuerpo, /tiempoMaximoMs: 180_000/);
});

// ---------------------------------------------------------------------------
// La pantalla: cinco estados, y ninguno inventado
// ---------------------------------------------------------------------------

test('la tarjeta del vídeo muestra los cinco estados del expediente', () => {
  const pantalla = sinComentarios('app/postulacion/documentos.tsx');
  for (const estado of ["'SIN_VIDEO'", "'LISTO'", "'SUBIENDO'", "'SUBIDO'", "'REPETIR'"]) {
    assert.match(pantalla, new RegExp(estado.replace(/'/g, "'")));
  }
  // Los estados salen del expediente, no de una lista propia de la pantalla.
  assert.match(pantalla, /entregado: hecho/);
  assert.match(pantalla, /motivo, subiendo: ocupado/);
});

test('grabar no sube: la persona decide cuándo gastar sus megas', () => {
  const pantalla = sinComentarios('app/postulacion/documentos.tsx');
  const grabar = pantalla.slice(pantalla.indexOf('const grabar = async'), pantalla.indexOf('const subirElVideo'));
  assert.match(grabar, /setVideoGrabado\(captura\.video\)/);
  assert.equal(/subirVideoDePresentacion/.test(grabar), false, 'grabar no debe subir por su cuenta');
  assert.match(pantalla, /testID="subir-video"/);
});

test('al subirse, la copia local se suelta y manda lo que diga el servidor', () => {
  const pantalla = sinComentarios('app/postulacion/documentos.tsx');
  const subir = pantalla.slice(pantalla.indexOf('const subirElVideo = async'));
  assert.match(subir, /setVideoGrabado\(null\)/);
  assert.match(subir, /fijarSolicitud\(respuesta\.solicitud\)/);
});

test('con una corrección pendiente, lo recién grabado se puede subir', () => {
  // Regresión encontrada en el emulador: administración pidió repetir el
  // vídeo, la persona lo grabó, y la tarjeta seguía diciendo «hay que grabarlo
  // otra vez» sin ofrecer nunca el botón de subir. Un callejón sin salida.
  const pantalla = sinComentarios('app/postulacion/documentos.tsx');
  const cuerpo = pantalla.slice(pantalla.indexOf('function estadoDelVideo'), pantalla.indexOf('function alPerderLaSesion'));
  const posicionDeLoGrabado = cuerpo.indexOf("return 'LISTO'");
  const posicionDeLaCorreccion = cuerpo.indexOf("return 'REPETIR'");
  assert.ok(posicionDeLoGrabado > 0 && posicionDeLaCorreccion > 0, 'faltan los estados');
  assert.ok(posicionDeLoGrabado < posicionDeLaCorreccion, 'lo grabado debe ganar a la corrección');
  // Y el motivo se sigue viendo, con su borde de aviso.
  assert.match(pantalla, /motivo \? estilos\.tarjetaConCorreccion/);
});

// ---------------------------------------------------------------------------
// Cuando el servidor no puede certificar la duración
// ---------------------------------------------------------------------------

test('el 422 del servidor se traduce a un mensaje que se entiende', () => {
  const servicio = sinComentarios('services/postulacion.ts');
  assert.match(servicio, /VIDEO_DURATION_UNVERIFIABLE: 'VIDEO_SIN_DURACION'/);

  // Las tres pantallas que traducen motivos lo cubren, y ninguna enseña el
  // código del servidor ni un rastro técnico.
  for (const relativa of ['app/postulacion/documentos.tsx', 'app/postulacion/confirmacion.tsx', 'app/postulacion/vehiculo.tsx']) {
    const pantalla = leer(relativa);
    const linea = pantalla.split('\n').find(item => item.includes('VIDEO_SIN_DURACION:'));
    assert.ok(linea, `${relativa} no traduce el motivo`);
    assert.match(linea, /No pudimos verificar la duración/);
    assert.equal(/VIDEO_DURATION_UNVERIFIABLE|422|stack|Error:/.test(linea), false, `${relativa} enseña algo técnico`);
  }
});

test('un vídeo que el servidor no puede medir no se reintenta solo', () => {
  // Insistir con el mismo fichero da el mismo 422. Sólo se reintenta la red.
  const servicio = sinComentarios('services/postulacion.ts');
  const cuerpo = servicio.slice(servicio.indexOf('export async function subirVideoDePresentacion'));
  assert.match(cuerpo, /respuesta\.motivo !== 'SIN_RED'/);
});

test('la duración que manda el teléfono no es la que se guarda', () => {
  // El servidor mide los bytes y guarda ESA duración; lo que declare el cliente
  // no entra en el expediente.
  const ruta = leerServidor('routes/driverApplications.js');
  const bloque = ruta.slice(ruta.indexOf("router.put('/driver-applications/me/video'"));
  assert.match(bloque, /durationSeconds: duracion/);
  assert.equal(/req\.body\.duration/.test(bloque), false, 'el servidor no lee la duración del cuerpo');
});

test('un vídeo de la galería que no se puede leer no culpa a la cámara', () => {
  // Mismo hallazgo que con las fotos: el mensaje llegaba a decirle a alguien que
  // acababa de elegir un vídeo de su galería que «pruebe a elegir un vídeo de la
  // galería».
  const captura = sinComentarios('media/captura.ts');
  const cuerpo = captura.slice(captura.indexOf('export async function capturarVideo'));
  assert.match(cuerpo, /falloDe\(modo === 'TAKE_VIDEO'\)/);
  const linea = leer('domain/videoDePresentacion.ts').split('\n').find(item => item.includes('ARCHIVO_ILEGIBLE:'));
  assert.ok(linea, 'falta el mensaje del archivo ilegible');
  assert.equal(/abrir la cámara/.test(linea), false);
  assert.match(linea, /Elige otro/);
});

test('un aviso de error no sobrevive a una lectura correcta', () => {
  // Salió en la certificación E2E: el error de una operación que ya se había
  // arreglado seguía en pantalla, contradiciendo a las tarjetas en verde.
  const pantalla = sinComentarios('app/postulacion/documentos.tsx');
  const recargar = pantalla.slice(pantalla.indexOf('const recargar'), pantalla.indexOf('const irALaCorreccion'));
  assert.match(recargar, /setAviso\(null\);\s*fijarSolicitud/);
});
