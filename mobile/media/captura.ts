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
  type ResultadoDeVideo
} from '../domain/videoDePresentacion';

export type { FotoCapturada, MotivoDeCaptura, ResultadoDeCaptura } from '../domain/fotoDeDocumento';
export { MENSAJES_DE_CAPTURA, nombreDeArchivo } from '../domain/fotoDeDocumento';
export type { MotivoDeVideo, ResultadoDeVideo, VideoCapturado } from '../domain/videoDePresentacion';
export { MENSAJES_DE_VIDEO, nombreDelVideo } from '../domain/videoDePresentacion';

export type ModoDeCaptura = 'TAKE_PHOTO' | 'CHOOSE_PHOTO';
export type ModoDeVideo = 'TAKE_VIDEO' | 'CHOOSE_VIDEO';

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
    if (!activo) return { ok: false, motivo: 'NO_DISPONIBLE' };

    return interpretarActivo(activo);
  } catch {
    // Sin cámara (un emulador sin cámara virtual, un dispositivo raro): no es
    // un fallo de la persona y no se registra nada de lo que llevaba.
    return { ok: false, motivo: 'NO_DISPONIBLE' };
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
    if (!activo) return { ok: false, motivo: 'NO_DISPONIBLE' };
    return interpretarVideo(activo);
  } catch {
    return { ok: false, motivo: 'NO_DISPONIBLE' };
  }
}
