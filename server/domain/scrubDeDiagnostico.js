/**
 * Lo que puede salir de aquí hacia un servicio de diagnóstico, y lo que no.
 *
 * POR QUÉ ES DOMINIO Y NO PARTE DEL CLIENTE DE SENTRY
 *
 * Porque hay que poder probarlo sin red y sin SDK. Un scrub que sólo se ejerce
 * cuando hay un DSN configurado es un scrub que nadie comprueba: se descubre
 * que dejaba pasar una contraseña el día que alguien mira un evento real.
 *
 * LA REGLA
 *
 * Lista de permitidos para las cabeceras, lista de prohibidos para todo lo
 * demás. Las cabeceras son un conjunto pequeño y conocido, así que se puede
 * enumerar lo que sí vale; el cuerpo de una petición no lo es, y ahí sólo cabe
 * reconocer lo que se sabe peligroso --y recortar por longitud lo que no se
 * reconozca, porque un campo largo que nadie esperaba es justo donde se cuela
 * un documento en base64--.
 *
 * QUÉ NO SALE, NUNCA
 *
 * Contraseñas, tokens de sesión, la cabecera `authorization`, las cookies, los
 * códigos de verificación, claves privadas, documentos, imágenes, correos y
 * teléfonos completos, y la ubicación con más precisión de la que hace falta
 * para entender un fallo.
 *
 * QUÉ SÍ SALE
 *
 * Lo suficiente para diagnosticar: la ruta, el método, el código de estado, el
 * identificador de la cuenta --que es un opaco, no un dato personal--, el
 * contacto enmascarado cuando el fallo va de un contacto, y la ubicación
 * redondeada a barrio.
 */

import { enmascararCorreo, enmascararTelefono } from './contactos.js';

/** Lo ÚNICO que viaja de las cabeceras. Todo lo demás se descarta. */
const CABECERAS_PERMITIDAS = Object.freeze([
  'accept',
  'accept-language',
  'content-type',
  'content-length',
  'user-agent',
  'referer'
]);

/**
 * Nombres de campo que nunca viajan, se llamen como se llamen alrededor.
 *
 * Se compara sobre el nombre en minúsculas y sin separadores, así que
 * `newPassword`, `new_password` y `NEW-PASSWORD` caen los tres.
 */
const PROHIBIDOS = Object.freeze([
  'password', 'contrasena', 'contrasenia', 'clave', 'pass',
  'token', 'jwt', 'authorization', 'auth', 'cookie', 'sessionid',
  'code', 'codigo', 'otp', 'challenge', 'secret', 'apikey', 'privatekey',
  'serviceaccount', 'credential', 'refresh',
  // Documentos e imágenes: ni el contenido ni la ruta en disco.
  'documento', 'document', 'file', 'archivo', 'buffer', 'base64', 'datauri',
  'foto', 'photo', 'imagen', 'image', 'adjunto', 'attachment'
]);

/** Campos que sí valen, pero enmascarados. */
const CONTACTOS = Object.freeze(['email', 'correo', 'destination', 'destino', 'identificador', 'identifier']);
const TELEFONOS = Object.freeze(['phone', 'telefono', 'celular', 'movil']);

/** Coordenadas: se redondean, no se borran. Saber el barrio ayuda; la acera no. */
const CAMPOS_DE_COORDENADA = Object.freeze(['lat', 'lng', 'latitude', 'longitude', 'lon']);

/**
 * Cuánta precisión conserva una coordenada que viaja a diagnóstico.
 *
 * Dos decimales son ~1,1 km en el ecuador: sitúan el fallo en una zona de
 * Maracaibo --que es lo que hace falta para entender un problema de despacho o
 * de ruta-- y no en un portal concreto.
 */
export const DECIMALES_DE_COORDENADA = 2;

/** Más largo que esto, no se envía: nadie diagnostica con un campo así. */
const LARGO_MAXIMO = 200;

/** Profundidad máxima al recorrer. Un ciclo o un árbol hondo no cuelgan esto. */
const PROFUNDIDAD_MAXIMA = 6;

const OCULTO = '[oculto]';

function normalizar(nombre) {
  return String(nombre).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function coincide(nombre, lista) {
  const limpio = normalizar(nombre);
  return lista.some(prohibido => limpio.includes(prohibido));
}

/**
 * ¿Este nombre de campo nunca puede viajar?
 *
 * Se exporta porque las pruebas comprueban nombres concretos, y porque el
 * cliente de Sentry lo usa también sobre las claves de sus propios contextos.
 */
export function esCampoProhibido(nombre) {
  return coincide(nombre, PROHIBIDOS);
}

/** Redondea una coordenada a la precisión que se permite publicar. */
export function recortarCoordenada(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  const factor = 10 ** DECIMALES_DE_COORDENADA;
  return Math.round(numero * factor) / factor;
}

/**
 * Un texto suelto, ya limpio de lo que se reconoce como contacto.
 *
 * Un correo o un teléfono pueden aparecer dentro de un mensaje de error --«no
 * existe cuenta para juan@ejemplo.com»-- sin que ningún campo se llame así.
 * Aquí se enmascaran por forma, no por nombre.
 */
/**
 * Un teléfono dentro de un texto, y NO cualquier ristra de dígitos.
 *
 * La primera versión de esto era `/\+?\d[\d\s()-]{7,}\d/`, y en el primer
 * evento real que llegó a Sentry se vio lo que hacía: convirtió la marca de
 * tiempo `prueba-1788765295954` en `prueba-+58•••••••••••54`, y la fecha
 * `2026-09-07T07:14:06.271Z` en `+20••••07T07:14:06.271Z`. Enmascarar de más no
 * es gratis: deja el diagnóstico sin las dos cosas que más se miran, cuándo
 * pasó y con qué identificador.
 *
 * Así que se exige forma de teléfono, no longitud:
 *
 *   - internacional: `+` y de 7 a 14 dígitos, con separadores o sin ellos;
 *   - local venezolano: `0` y de 10 a 11 dígitos --`04140031808`--;
 *   - o dígitos agrupados con separadores, que es como se escribe un número a
 *     mano y no como se escribe una marca de tiempo.
 *
 * Un epoch de trece dígitos empieza por `1` y va pegado: no cae en ninguna.
 */
const TELEFONO_EN_TEXTO = /(?<![\w.])(?:\+\d[\d\s()-]{5,16}\d|0\d{9,10}|\d{2,4}[\s()-]+\d{2,4}[\s()-]+\d{2,6})(?![\w.])/g;

export function limpiarTexto(texto) {
  if (typeof texto !== 'string') return texto;
  let salida = texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, coincidencia => enmascararCorreo(coincidencia))
    .replace(TELEFONO_EN_TEXTO, coincidencia => enmascararTelefono(coincidencia));
  // Un JWT tiene forma propia y reconocible: tres bloques base64url. Puede
  // acabar dentro de un mensaje aunque ningún campo se llame «token».
  salida = salida.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, OCULTO);
  salida = ocultarSecretosEtiquetados(salida);
  return salida.length > LARGO_MAXIMO ? `${salida.slice(0, LARGO_MAXIMO)}…` : salida;
}

/**
 * Un secreto escrito dentro de una frase, precedido de su nombre.
 *
 * «POST /api/auth/login con clave ClaveLarga123» no tiene ningún campo llamado
 * `password`: la contraseña va en el texto. Aparece así de verdad, en mensajes
 * de error escritos a mano y en migas de navegación.
 *
 * LO QUE ESTO CUBRE, Y LO QUE NO
 *
 * Cubre la forma habitual --un nombre reconocible, un separador, el valor-- que
 * es como se escriben estas cosas cuando se escriben. NO puede cubrir una
 * contraseña suelta en mitad de una frase, porque una contraseña no tiene forma
 * propia: es una cadena cualquiera y no hay patrón que la distinga de un
 * identificador de viaje.
 *
 * Por eso esta función es una red, no la defensa. La defensa es no escribir
 * secretos en los mensajes, y que las migas de consola no se envíen.
 */
function ocultarSecretosEtiquetados(texto) {
  const nombres = 'clave|contraseña|contrasena|password|pass|token|jwt|secret|secreto|otp|código|codigo|apikey|api[_ -]?key';
  return texto.replace(
    new RegExp(`\\b(${nombres})\\b\\s*(?:[:=]|es|:)?\\s*(\\S+)`, 'gi'),
    (_completo, etiqueta) => `${etiqueta} ${OCULTO}`
  );
}

/**
 * Limpia cualquier valor antes de que salga hacia diagnóstico.
 *
 * Recorre objetos y listas. Lo que no reconoce lo recorta por longitud, que es
 * la única defensa razonable contra un campo nuevo que nadie previó.
 */
export function limpiarValor(valor, profundidad = 0) {
  if (valor === null || valor === undefined) return valor;
  if (profundidad > PROFUNDIDAD_MAXIMA) return OCULTO;

  if (typeof valor === 'string') return limpiarTexto(valor);
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;

  if (Array.isArray(valor)) {
    // Sólo los primeros: una lista larga no aporta más que sus primeros
    // elementos para entender un fallo, y sí multiplica lo que se publica.
    return valor.slice(0, 20).map(elemento => limpiarValor(elemento, profundidad + 1));
  }

  if (typeof valor !== 'object') return OCULTO;

  const salida = {};
  for (const [clave, contenido] of Object.entries(valor)) {
    if (esCampoProhibido(clave)) { salida[clave] = OCULTO; continue; }

    if (coincide(clave, CONTACTOS) && typeof contenido === 'string') {
      salida[clave] = contenido.includes('@') ? enmascararCorreo(contenido) : enmascararTelefono(contenido);
      continue;
    }
    if (coincide(clave, TELEFONOS) && typeof contenido === 'string') {
      salida[clave] = enmascararTelefono(contenido);
      continue;
    }
    if (coincide(clave, CAMPOS_DE_COORDENADA) && typeof contenido === 'number') {
      salida[clave] = recortarCoordenada(contenido);
      continue;
    }
    salida[clave] = limpiarValor(contenido, profundidad + 1);
  }
  return salida;
}

/** Las cabeceras que pueden viajar, y sólo ésas. */
export function limpiarCabeceras(cabeceras) {
  if (!cabeceras || typeof cabeceras !== 'object') return {};
  const salida = {};
  for (const permitida of CABECERAS_PERMITIDAS) {
    const valor = cabeceras[permitida];
    if (typeof valor === 'string') salida[permitida] = limpiarTexto(valor);
  }
  return salida;
}

/**
 * Deja un evento de Sentry en condiciones de salir.
 *
 * Es el `beforeSend` completo, escrito aquí para poder ejercerlo con un evento
 * de mentira en una prueba, sin levantar el SDK ni tocar la red.
 */
export function limpiarEvento(evento) {
  if (!evento || typeof evento !== 'object') return evento;
  const salida = { ...evento };

  if (salida.request) {
    const peticion = { ...salida.request };
    peticion.headers = limpiarCabeceras(peticion.headers);
    delete peticion.cookies;
    // La cadena de consulta puede llevar el destino de un código o un token de
    // recuperación. Nunca viaja: la ruta sola basta para saber qué falló.
    delete peticion.query_string;
    if (peticion.data !== undefined) peticion.data = limpiarValor(peticion.data);
    if (typeof peticion.url === 'string') peticion.url = peticion.url.split('?')[0];
    salida.request = peticion;
  }

  if (salida.extra) salida.extra = limpiarValor(salida.extra);
  if (salida.contexts) salida.contexts = limpiarValor(salida.contexts);
  if (salida.tags) salida.tags = limpiarValor(salida.tags);

  // Del usuario sólo el identificador, que es opaco, y el rol. Ni correo, ni
  // teléfono, ni dirección IP: con el id se sigue a una persona por sus
  // eventos, que es para lo que hace falta.
  if (salida.user) {
    salida.user = {
      id: typeof salida.user.id === 'string' ? salida.user.id : undefined,
      role: typeof salida.user.role === 'string' ? salida.user.role : undefined
    };
  }

  if (Array.isArray(salida.breadcrumbs)) {
    salida.breadcrumbs = salida.breadcrumbs.map(miga => ({
      ...miga,
      message: limpiarTexto(miga?.message),
      data: miga?.data === undefined ? undefined : limpiarValor(miga.data)
    }));
  }

  if (Array.isArray(salida.exception?.values)) {
    salida.exception = {
      ...salida.exception,
      values: salida.exception.values.map(fallo => ({
        ...fallo,
        value: limpiarTexto(fallo?.value)
      }))
    };
  }

  if (typeof salida.message === 'string') salida.message = limpiarTexto(salida.message);

  return salida;
}
