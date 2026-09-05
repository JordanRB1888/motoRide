/**
 * Tomar o elegir una fotografía. La única puerta a `expo-image-picker`.
 *
 * POR QUÉ UNA SOLA PUERTA
 *
 * Cada pantalla que necesite una foto —los documentos de la postulación, la
 * foto de perfil el día que se conecte— llama aquí y no al módulo. Así las
 * decisiones que importan están en un sitio: qué tipos se aceptan, cuánto
 * puede pesar, con qué calidad se guarda, y cuándo se pide el permiso. Las
 * reglas viven en `domain/fotoDeDocumento.ts`, que se prueba sin dispositivo;
 * aquí solo está lo que necesita el teléfono.
 *
 * EL PERMISO SE PIDE AL PULSAR, NO AL ABRIR
 *
 * La cámara se pide en el momento en que alguien toca «Tomar foto», que es
 * cuando tiene sentido para esa persona. Un permiso que salta al abrir la
 * aplicación se deniega casi siempre. La galería, en Android 13 y iOS
 * recientes, abre el selector del sistema sin permiso ninguno; en Android
 * viejo hace falta el de almacenamiento, y solo entonces se pide.
 *
 * LO QUE DEVUELVE NO ES AUTORIDAD DE NADA
 *
 * Una ruta local, el tipo, el tamaño en píxeles y en bytes si el sistema lo
 * dice. Es lo que hace falta para SUBIRLA y nada más. No se guarda en ningún
 * sitio, no se copia a ningún almacén de la aplicación y no se registra: una
 * cédula fotografiada es una cédula, y va del selector al servidor y de ahí a
 * ninguna parte.
 */

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
  CALIDAD,
  interpretarActivo,
  type ResultadoDeCaptura
} from '../domain/fotoDeDocumento';
import {
  CALIDAD_DE_VIDEO,
  DURACION_MAXIMA_EN_SEGUNDOS,
  interpretarVideo,
  type ResultadoDeVideo,
  type UnidadDeDuracion
} from '../domain/videoDePresentacion';
import {
  interpretarImagenDeChat,
  type ResultadoDelPicker as ResultadoDeImagenDeChat
} from '../domain/imagenDeChat';

export type { FotoCapturada, MotivoDeCaptura, ResultadoDeCaptura } from '../domain/fotoDeDocumento';
export { MENSAJES_DE_CAPTURA, nombreDeArchivo } from '../domain/fotoDeDocumento';
export type { MotivoDeVideo, ResultadoDeVideo, VideoCapturado } from '../domain/videoDePresentacion';
export { MENSAJES_DE_VIDEO, nombreDelVideo } from '../domain/videoDePresentacion';
export type { ImagenDeChat, MotivoDelPicker, ResultadoDelPicker } from '../domain/imagenDeChat';
export { FORMATOS_DE_CHAT, LIMITE_DATA_URL, motivoDelPickerEnPantalla } from '../domain/imagenDeChat';

export type ModoDeCaptura = 'TAKE_PHOTO' | 'CHOOSE_PHOTO';
export type ModoDeVideo = 'TAKE_VIDEO' | 'CHOOSE_VIDEO';

/**
 * En qué unidad viene la duración de esta plataforma.
 *
 * En Android e iOS, el módulo nativo la da en milisegundos. En web la mide con
 * un elemento de vídeo, y `HTMLMediaElement.duration` son segundos. Saberlo es
 * asunto de esta capa: el dominio no debe preguntar en qué plataforma corre.
 */
const UNIDAD_DE_DURACION: UnidadDeDuracion = Platform.OS === 'web' ? 'SEGUNDOS' : 'MILISEGUNDOS';

const OPCIONES: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: CALIDAD,
  allowsEditing: false,
  allowsMultipleSelection: false,
  // Sin datos EXIF ni base64: lo primero lleva la ubicación de la foto, lo
  // segundo es una copia entera en memoria que no hace falta para subir.
  exif: false,
  base64: false
};

/**
 * Qué se le dice a la persona cuando el módulo nativo no devuelve nada útil.
 *
 * Desde aquí, «no hay cámara» y «este archivo no se puede leer» tienen la misma
 * pinta: una excepción o una lista vacía. Lo que las distingue es de dónde venía
 * la persona, y eso sí lo sabemos.
 */
const falloDe = (deLaCamara: boolean): 'NO_DISPONIBLE' | 'ARCHIVO_ILEGIBLE' => (deLaCamara ? 'NO_DISPONIBLE' : 'ARCHIVO_ILEGIBLE');

/** Si hace falta pedir el permiso de almacenamiento para la galería. */
function laGaleriaNecesitaPermiso(): boolean {
  // Android 13 (API 33) trae el selector de fotos del sistema, que no pide
  // permiso. Por debajo, sí. En iOS el selector limitado tampoco lo pide.
  return Platform.OS === 'android' && Number(Platform.Version) < 33;
}

/**
 * Toma una foto con la cámara o elige una de la galería.
 *
 * Nunca lanza: todo lo que puede salir mal vuelve como motivo, para que la
 * pantalla lo explique con palabras.
 */
export async function capturar(modo: ModoDeCaptura): Promise<ResultadoDeCaptura> {
  try {
    if (modo === 'TAKE_PHOTO') {
      const permiso = await ImagePicker.requestCameraPermissionsAsync();
      if (!permiso.granted) return { ok: false, motivo: 'PERMISO_DENEGADO' };
    } else if (laGaleriaNecesitaPermiso()) {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) return { ok: false, motivo: 'PERMISO_DENEGADO' };
    }

    const resultado = modo === 'TAKE_PHOTO'
      ? await ImagePicker.launchCameraAsync(OPCIONES)
      : await ImagePicker.launchImageLibraryAsync(OPCIONES);

    if (resultado.canceled) return { ok: false, motivo: 'CANCELADO' };
    const activo = resultado.assets?.[0];
    if (!activo) return { ok: false, motivo: falloDe(modo === 'TAKE_PHOTO') };

    return interpretarActivo(activo);
  } catch {
    // Dos cosas distintas con la misma pinta desde aquí: que no haya cámara, o
    // que el archivo elegido no se pueda leer. A quien acaba de elegir una foto
    // de su galería no se le dice que falló la cámara: no la tocó.
    return { ok: false, motivo: falloDe(modo === 'TAKE_PHOTO') };
  }
}

/** Opciones de la imagen de chat: con base64, que es lo que viaja por el socket. */
const OPCIONES_DE_CHAT: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: CALIDAD,
  allowsEditing: false,
  allowsMultipleSelection: false,
  exif: false,
  // A diferencia del documento, aquí SÍ hace falta el base64: la imagen del chat
  // viaja como data URL por el socket, no como archivo multipart.
  base64: true
};

/**
 * Elige o toma una imagen para el chat del viaje.
 *
 * MISMA PUERTA, MISMO PERMISO. Nadie fuera de este fichero toca
 * `expo-image-picker`. Lo único distinto de la foto de documento es que aquí se
 * pide el base64 —el chat manda la imagen como data URL— y que la validación de
 * formato y tamaño la hace `domain/imagenDeChat`, que se prueba sin dispositivo.
 *
 * Nunca lanza: todo lo que puede salir mal vuelve como motivo.
 */
export async function elegirImagenDeChat(modo: ModoDeCaptura): Promise<ResultadoDeImagenDeChat> {
  try {
    if (modo === 'TAKE_PHOTO') {
      const permiso = await ImagePicker.requestCameraPermissionsAsync();
      if (!permiso.granted) return { ok: false, motivo: 'PERMISO' };
    } else if (laGaleriaNecesitaPermiso()) {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) return { ok: false, motivo: 'PERMISO' };
    }

    const resultado = modo === 'TAKE_PHOTO'
      ? await ImagePicker.launchCameraAsync(OPCIONES_DE_CHAT)
      : await ImagePicker.launchImageLibraryAsync(OPCIONES_DE_CHAT);

    if (resultado.canceled) return { ok: false, motivo: 'CANCELADO' };
    return interpretarImagenDeChat(resultado.assets?.[0]);
  } catch {
    return { ok: false, motivo: 'ERROR' };
  }
}

/**
 * Recupera una imagen que el selector devolvió mientras la aplicación NO estaba.
 *
 * EL CASO QUE ESTO CIERRA
 *
 * En Android, con poca memoria, el sistema puede destruir la actividad de la
 * aplicación mientras el selector o la cámara están abiertos. Al volver, la
 * aplicación arranca de cero: la promesa de `launchCamera/launchImageLibrary`
 * se perdió con el proceso, y la imagen que la persona ya eligió se quedaría en
 * el aire. `getPendingResultAsync` la rescata: se llama al reabrir el chat, y si
 * hay algo esperando, se manda como si nada hubiera pasado.
 *
 * Devuelve `null` cuando no hay nada pendiente —el caso de siempre—, así que es
 * seguro llamarla en cada apertura. Consume el resultado: una sola vez.
 */
export async function recuperarImagenDeChatPendiente(): Promise<ResultadoDeImagenDeChat | null> {
  try {
    const pendiente = await ImagePicker.getPendingResultAsync();
    const item = Array.isArray(pendiente) ? pendiente[0] : pendiente;
    if (!item || typeof item !== 'object') return null;
    if ('canceled' in item && item.canceled) return null;
    if ('assets' in item && Array.isArray(item.assets)) return interpretarImagenDeChat(item.assets[0]);
    return null; // un resultado de error: nada que mandar
  } catch {
    return null;
  }
}

/**
 * El vídeo de presentación: se graba o se elige de la galería.
 *
 * MISMA PUERTA, OTRO MEDIO
 *
 * Está aquí, junto a la foto, porque la regla es la misma: NADIE fuera de este
 * fichero importa `expo-image-picker`. Si mañana hay que cambiar de librería,
 * se cambia en un sitio y las pantallas ni se enteran.
 *
 * Al grabar se le pide a la cámara que corte sola a los treinta segundos, que
 * es más amable que dejar grabar dos minutos y rechazarlo después. Y se pide
 * calidad media: 720p basta para ver una cara, y ahorra megas del plan de
 * datos de quien lo sube.
 *
 * Nunca lanza: todo lo que puede salir mal vuelve como motivo.
 */
export async function capturarVideo(modo: ModoDeVideo): Promise<ResultadoDeVideo> {
  const opciones: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    // La cámara corta sola: mejor que grabar de más y perder el intento.
    videoMaxDuration: DURACION_MAXIMA_EN_SEGUNDOS,
    quality: CALIDAD_DE_VIDEO,
    exif: false,
    base64: false
  };

  try {
    if (modo === 'TAKE_VIDEO') {
      // El permiso se pide AL PULSAR grabar, nunca al abrir la pantalla.
      const permiso = await ImagePicker.requestCameraPermissionsAsync();
      if (!permiso.granted) return { ok: false, motivo: 'PERMISO_DENEGADO' };
    } else if (laGaleriaNecesitaPermiso()) {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) return { ok: false, motivo: 'PERMISO_DENEGADO' };
    }

    const resultado = modo === 'TAKE_VIDEO'
      ? await ImagePicker.launchCameraAsync(opciones)
      : await ImagePicker.launchImageLibraryAsync(opciones);
    if (resultado.canceled) return { ok: false, motivo: 'CANCELADO' };

    const activo = resultado.assets?.[0];
    if (!activo) return { ok: false, motivo: falloDe(modo === 'TAKE_VIDEO') };
    return interpretarVideo(activo, UNIDAD_DE_DURACION);
  } catch {
    return { ok: false, motivo: falloDe(modo === 'TAKE_VIDEO') };
  }
}
