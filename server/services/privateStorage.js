import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov'
});

/**
 * Los tipos de video que se admiten, y por que estos dos.
 *
 * MP4 es lo que graba Android y lo que reproduce todo. QuickTime es lo que
 * graba iOS cuando no se le pide otra cosa, y comparte contenedor con MP4
 * --ISO-BMFF, la misma firma-- asi que validarlo cuesta lo mismo.
 *
 * WEBM QUEDA FUERA, y no por descuido: Safari no lo reproduce, ni en Mac ni en
 * iPhone. Un video que administracion no puede ver desde un Mac es un video
 * que no sirve para revisar a nadie, y aceptarlo seria crear expedientes que
 * dependen de con que navegador se abran.
 */
const VIDEO_MIME_TYPES = Object.freeze(['video/mp4', 'video/quicktime']);

/** MIME canonico para un video, o null si el valor no es admisible. */
export function canonicalVideoMimeType(value) {
  const normalized = String(value || '').trim().toLowerCase().split(';')[0];
  return VIDEO_MIME_TYPES.includes(normalized) ? normalized : null;
}

/**
 * Cuanto hace falta leer para saber si unos bytes son el video que dicen ser.
 *
 * La firma de ISO-BMFF vive en los doce primeros bytes; la duracion, dentro
 * del box `moov`, que puede estar al principio o al final del fichero. Este
 * tope acota lo que se lee para BUSCARLA sin recorrer cincuenta megas.
 */
const CABECERA_DE_VIDEO = 64 * 1024;

/**
 * Tipos que puede tener una fotografía de perfil. El PDF queda fuera a
 * propósito: sirve para documentos, no para imágenes. El SVG no aparece en
 * ninguna lista porque no tiene firma binaria y es contenido activo.
 */
const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

/** MIME canónico para una fotografía, o null si el valor no es admisible. */
export function canonicalImageMimeType(value) {
  const normalized = String(value || '').trim().toLowerCase().split(';')[0];
  return IMAGE_MIME_TYPES.includes(normalized) ? normalized : null;
}

export function hasValidSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  // MP4 y MOV son el mismo contenedor: una sucesion de cajas donde la primera
  // suele ser `ftyp`. Se comprueba la etiqueta en su sitio --bytes 4 a 8-- y
  // que el tamano declarado de esa caja sea creible; un fichero de texto con
  // el nombre cambiado no pasa ninguna de las dos.
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
    if (buffer.subarray(4, 8).toString('latin1') !== 'ftyp') return false;
    const tamanoDeLaPrimeraCaja = buffer.readUInt32BE(0);
    return tamanoDeLaPrimeraCaja >= 8 && tamanoDeLaPrimeraCaja <= buffer.length + CABECERA_DE_VIDEO;
  }
  return false;
}

/**
 * Recorre las cajas de un tramo del fichero y llama a `visitar` con cada una.
 *
 * ISO-BMFF es una lista de cajas: cuatro bytes de tamano, cuatro de tipo, y el
 * contenido. El tamano 1 significa que el real viene despues en 64 bits, y el
 * 0, que la caja llega hasta el final --lo que solo vale para la ultima--.
 *
 * En cuanto algo no cuadra, se PARA y se devuelve `false`. Una caja que declara
 * mas de lo que hay es un fichero truncado o manipulado, y seguir leyendo
 * detras de eso seria inventarse una estructura.
 *
 * Devolver `true` significa que las cajas cubrieron el tramo entero, sin huecos
 * ni sobras. Aguas arriba, eso es lo que separa «lo medi» de «no pude medir», y
 * no poder medir significa rechazar el fichero.
 */
function recorrerCajas(buffer, desde, hasta, visitar) {
  let posicion = desde;
  while (posicion + 8 <= hasta) {
    const declarado = buffer.readUInt32BE(posicion);
    const tipo = buffer.subarray(posicion + 4, posicion + 8).toString('latin1');
    let cabecera = 8;
    let tamano = declarado;

    if (declarado === 1) {
      if (posicion + 16 > hasta) return false;
      const grande = buffer.readBigUInt64BE(posicion + 8);
      if (grande > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      tamano = Number(grande);
      cabecera = 16;
    } else if (declarado === 0) {
      tamano = hasta - posicion;
    }

    if (tamano < cabecera || posicion + tamano > hasta) return false;
    visitar(tipo, posicion + cabecera, posicion + tamano);
    posicion += tamano;
  }
  // Bytes sueltos al final: las cajas no cubren el tramo, y eso no cuadra.
  return posicion === hasta;
}

/** Una duracion que el formato marca como desconocida, no como cero. */
const DURACION_DESCONOCIDA_32 = 0xffffffff;
const DURACION_DESCONOCIDA_64 = 0xffffffffffffffffn;

/** Sirve para medir: es un numero positivo y finito. */
const seMidio = valor => Number.isFinite(valor) && valor > 0;

/**
 * Lee una cabecera de tiempo (`mvhd` o `mdhd`): las dos tienen el mismo
 * principio --version, banderas, creacion, modificacion, escala y duracion--.
 *
 * Una version que no conocemos devuelve null en vez de leer a ciegas: los
 * campos estarian en otro sitio y el numero que saliera no significaria nada.
 */
function leerCabeceraDeTiempo(buffer, inicio, fin) {
  if (inicio >= fin) return null;
  const version = buffer[inicio];

  if (version === 0) {
    if (inicio + 20 > fin) return null;
    const duracion = buffer.readUInt32BE(inicio + 16);
    return {
      escala: buffer.readUInt32BE(inicio + 12),
      duracion: duracion === DURACION_DESCONOCIDA_32 ? 0 : duracion
    };
  }

  if (version === 1) {
    if (inicio + 32 > fin) return null;
    const duracion = buffer.readBigUInt64BE(inicio + 24);
    return {
      escala: buffer.readUInt32BE(inicio + 20),
      duracion: duracion === DURACION_DESCONOCIDA_64 || duracion > BigInt(Number.MAX_SAFE_INTEGER)
        ? 0
        : Number(duracion)
    };
  }

  return null;
}

/** La duracion total de un fichero fragmentado, si su `mvex` la declara. */
function leerDuracionDeFragmentos(buffer, inicio, fin) {
  if (inicio >= fin) return 0;
  const version = buffer[inicio];
  if (version === 0) return inicio + 8 <= fin ? buffer.readUInt32BE(inicio + 4) : 0;
  if (version === 1) {
    if (inicio + 12 > fin) return 0;
    const duracion = buffer.readBigUInt64BE(inicio + 4);
    return duracion > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(duracion);
  }
  return 0;
}

/**
 * Cuanto dura el video, en segundos, medido en sus propios bytes.
 *
 * EL SERVIDOR ES LA AUTORIDAD
 *
 * El telefono manda una duracion, y sirve para avisar antes de gastar la red;
 * pero es un numero que cualquiera puede escribir. Lo que decide es esto: la
 * estructura del propio fichero.
 *
 * SE MIRAN TRES SITIOS, EN ESTE ORDEN
 *
 * 1. `moov/mvhd`, que es donde esta la duracion de la pelicula.
 * 2. `moov/mvex/mehd`, para los ficheros fragmentados, donde `mvhd` suele
 *    venir a cero porque la duracion se declara aparte.
 * 3. La pista mas larga (`moov/trak/mdia/mdhd`), que salva los ficheros a los
 *    que un editor dejo la cabecera de la pelicula sin rellenar.
 *
 * DEVOLVER `null` ES RECHAZAR
 *
 * Antes, no poder medir dejaba pasar el fichero. Eso hacia que el tope de
 * treinta segundos fuera una recomendacion: bastaba con subir algo que no
 * supieramos leer. Ahora `null` significa que la duracion NO se pudo
 * certificar, y quien llama tiene que rechazar el fichero. Es preferible pedir
 * otro video a guardar uno que no sabemos cuanto dura.
 *
 * Una duracion de cero tampoco vale. En un video de verdad no existe, y en uno
 * fragmentado significa «esto se declara en otra parte»: tomarla al pie de la
 * letra seria aceptar cualquier cosa como si durase nada.
 */
export function videoDurationSeconds(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;

  try {
    let hayMoov = false;
    let escalaDeLaPelicula = 0;
    let duracionDeLaPelicula = 0;
    let duracionDeLosFragmentos = 0;
    let laPistaMasLarga = 0;

    const cuadraElFichero = recorrerCajas(buffer, 0, buffer.length, (tipo, inicio, fin) => {
      if (tipo !== 'moov') return;
      hayMoov = true;

      recorrerCajas(buffer, inicio, fin, (tipoDeMoov, inicioDeMoov, finDeMoov) => {
        if (tipoDeMoov === 'mvhd') {
          const leido = leerCabeceraDeTiempo(buffer, inicioDeMoov, finDeMoov);
          if (leido) {
            escalaDeLaPelicula = leido.escala;
            duracionDeLaPelicula = leido.duracion;
          }
          return;
        }

        if (tipoDeMoov === 'mvex') {
          recorrerCajas(buffer, inicioDeMoov, finDeMoov, (tipoDeMvex, inicioDeMvex, finDeMvex) => {
            if (tipoDeMvex === 'mehd') duracionDeLosFragmentos = leerDuracionDeFragmentos(buffer, inicioDeMvex, finDeMvex);
          });
          return;
        }

        if (tipoDeMoov !== 'trak') return;
        recorrerCajas(buffer, inicioDeMoov, finDeMoov, (tipoDeTrak, inicioDeTrak, finDeTrak) => {
          if (tipoDeTrak !== 'mdia') return;
          recorrerCajas(buffer, inicioDeTrak, finDeTrak, (tipoDeMdia, inicioDeMdia, finDeMdia) => {
            if (tipoDeMdia !== 'mdhd') return;
            const leido = leerCabeceraDeTiempo(buffer, inicioDeMdia, finDeMdia);
            if (leido && leido.escala > 0 && seMidio(leido.duracion)) {
              laPistaMasLarga = Math.max(laPistaMasLarga, leido.duracion / leido.escala);
            }
          });
        });
      });
    });

    // Un fichero cuyas cajas se solapan o se salen del final esta manipulado o
    // roto. Aunque dentro se leyera un `mvhd` con pinta correcta, no hay forma
    // de saber a que corresponde: se rechaza.
    if (!cuadraElFichero) return null;

    if (!hayMoov || escalaDeLaPelicula <= 0) {
      // Sin `moov` no hay nada que leer; y sin escala de tiempo, la duracion
      // de la pelicula no se puede convertir a segundos. Queda la pista.
      return seMidio(laPistaMasLarga) ? laPistaMasLarga : null;
    }
    if (seMidio(duracionDeLaPelicula)) return duracionDeLaPelicula / escalaDeLaPelicula;
    if (seMidio(duracionDeLosFragmentos)) return duracionDeLosFragmentos / escalaDeLaPelicula;
    if (seMidio(laPistaMasLarga)) return laPistaMasLarga;
    return null;
  } catch {
    // Nunca lanza: un fichero raro es un fichero que no se pudo medir.
    return null;
  }
}

export function createPrivateStorage({ rootDirectory }) {
  const root = path.resolve(rootDirectory);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  function save(file, ownerId) {
    if (!file?.buffer || !MIME_EXTENSIONS[file.mimetype] || !hasValidSignature(file.buffer, file.mimetype)) {
      const error = new Error('INVALID_FILE_TYPE');
      error.code = 'INVALID_FILE_TYPE';
      throw error;
    }
    const ownerDirectory = path.join(root, String(ownerId).replace(/[^a-zA-Z0-9_-]/g, '_'));
    fs.mkdirSync(ownerDirectory, { recursive: true, mode: 0o700 });
    const filename = `${crypto.randomUUID()}${MIME_EXTENSIONS[file.mimetype]}`;
    const absolutePath = path.join(ownerDirectory, filename);
    fs.writeFileSync(absolutePath, file.buffer, { mode: 0o600 });
    return path.relative(root, absolutePath).split(path.sep).join('/');
  }

  function resolve(storageKey) {
    const absolutePath = path.resolve(root, String(storageKey || ''));
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) return null;
    return fs.existsSync(absolutePath) ? absolutePath : null;
  }

  function remove(storageKey) {
    const absolutePath = resolve(storageKey);
    if (absolutePath) fs.rmSync(absolutePath, { force: true });
  }

  function clone(storageKey, ownerId) {
    const source = resolve(storageKey);
    if (!source) return null;
    const extension = path.extname(source).toLowerCase();
    const ownerDirectory = path.join(root, String(ownerId).replace(/[^a-zA-Z0-9_-]/g, '_'));
    fs.mkdirSync(ownerDirectory, { recursive: true, mode: 0o700 });
    const absolutePath = path.join(ownerDirectory, `${crypto.randomUUID()}${extension}`);
    fs.copyFileSync(source, absolutePath);
    fs.chmodSync(absolutePath, 0o600);
    return path.relative(root, absolutePath).split(path.sep).join('/');
  }

  /**
   * Lee una imagen ya almacenada comprobando de nuevo su firma binaria.
   *
   * La validación en la subida no basta: el MIME que acompaña al registro
   * podría haberse alterado, y servir bytes cuyo contenido real no coincide con
   * la cabecera declarada abre la puerta al sniffing y a los polyglots.
   * Devuelve null ante cualquier discrepancia, sin distinguir la causa.
   */
  function readImage(storageKey, declaredMimeType) {
    const mimeType = canonicalImageMimeType(declaredMimeType);
    if (!mimeType) return null;
    const absolutePath = resolve(storageKey);
    if (!absolutePath) return null;
    let buffer;
    try { buffer = fs.readFileSync(absolutePath); }
    catch { return null; }
    if (!hasValidSignature(buffer, mimeType)) return null;
    return { buffer, mimeType };
  }

  /**
   * Abre un fichero guardado para servirlo por tramos, comprobando primero que
   * sus bytes siguen siendo lo que el registro dice.
   *
   * Lee solo la cabecera para validar la firma; el resto se sirve en flujo. Sin
   * esto habria que cargar el video entero en memoria para comprobarlo, que es
   * justo lo que se quiere evitar al reproducir por tramos.
   *
   * Devuelve el tamano real en disco --no el que dice el registro-- porque es
   * el que manda al calcular un rango.
   */
  function abrirParaServir(storageKey, declaredMimeType) {
    const mimeType = String(declaredMimeType || '').trim().toLowerCase().split(';')[0];
    if (!MIME_EXTENSIONS[mimeType]) return null;
    const absolutePath = resolve(storageKey);
    if (!absolutePath) return null;

    let descriptor;
    try {
      descriptor = fs.openSync(absolutePath, 'r');
      const cabecera = Buffer.alloc(Math.min(CABECERA_DE_VIDEO, fs.fstatSync(descriptor).size));
      fs.readSync(descriptor, cabecera, 0, cabecera.length, 0);
      if (!hasValidSignature(cabecera, mimeType)) return null;
      const size = fs.fstatSync(descriptor).size;
      return {
        mimeType,
        size,
        /** Un flujo del tramo pedido. Sin argumentos, el fichero entero. */
        crear: (desde = 0, hasta = size - 1) => fs.createReadStream(absolutePath, { start: desde, end: hasta })
      };
    } catch {
      return null;
    } finally {
      if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch { /* ya cerrado */ } }
    }
  }

  return { root, save, resolve, remove, clone, readImage, abrirParaServir };
}
