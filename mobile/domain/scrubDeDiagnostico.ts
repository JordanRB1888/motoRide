/**
 * Lo que puede salir del teléfono hacia diagnóstico, y lo que no.
 *
 * ES GEMELO DEL DEL SERVIDOR, Y ESTÁ DUPLICADO A PROPÓSITO
 *
 * `server/domain/scrubDeDiagnostico.js` hace lo mismo del otro lado. Compartir
 * el fichero exigiría un paquete común entre dos proyectos con `tsconfig`,
 * empaquetadores y ciclos de vida distintos --el del servidor se despliega en
 * un contenedor, éste viaja dentro del APK-- y ese acoplamiento cuesta más de
 * lo que ahorra: son ochenta líneas sin dependencias.
 *
 * Lo que NO se duplica es la decisión: las dos listas dicen lo mismo, y las dos
 * suites lo comprueban por separado.
 *
 * POR QUÉ IMPORTA MÁS AQUÍ QUE EN EL SERVIDOR
 *
 * Porque aquí los datos son de la persona que tiene el teléfono en la mano, y
 * porque el móvil manda cosas que el servidor no ve: el texto que se escribe en
 * un campo, la ubicación exacta, la respuesta de una API con su cuenta dentro.
 */

/** Nombres de campo que nunca viajan, se escriban como se escriban. */
const PROHIBIDOS: readonly string[] = [
  'password', 'contrasena', 'contrasenia', 'clave', 'pass',
  'token', 'jwt', 'authorization', 'auth', 'cookie', 'sessionid',
  'code', 'codigo', 'otp', 'challenge', 'secret', 'apikey', 'privatekey',
  'credential', 'refresh',
  'documento', 'document', 'file', 'archivo', 'buffer', 'base64', 'datauri',
  'foto', 'photo', 'imagen', 'image', 'adjunto', 'attachment'
];

const CONTACTOS: readonly string[] = ['email', 'correo', 'destination', 'destino', 'identificador', 'identifier'];
const TELEFONOS: readonly string[] = ['phone', 'telefono', 'celular', 'movil'];
const COORDENADAS: readonly string[] = ['lat', 'lng', 'latitude', 'longitude', 'lon'];

/** Dos decimales: sitúan el fallo en una zona de Maracaibo, no en un portal. */
export const DECIMALES_DE_COORDENADA = 2;

const LARGO_MAXIMO = 200;
const PROFUNDIDAD_MAXIMA = 6;
const OCULTO = '[oculto]';

function normalizar(nombre: string): string {
  return String(nombre).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function coincide(nombre: string, lista: readonly string[]): boolean {
  const limpio = normalizar(nombre);
  return lista.some(prohibido => limpio.includes(prohibido));
}

export function esCampoProhibido(nombre: string): boolean {
  return coincide(nombre, PROHIBIDOS);
}

export function enmascararCorreo(valor: string): string {
  const correo = String(valor).trim().toLowerCase();
  const arroba = correo.lastIndexOf('@');
  if (arroba <= 0) return '•••';
  const nombre = correo.slice(0, arroba);
  const dominio = correo.slice(arroba);
  if (nombre.length <= 2) return `${nombre[0] ?? '•'}•••${dominio}`;
  return `${nombre[0]}•••${nombre[nombre.length - 1]}${dominio}`;
}

export function enmascararTelefono(valor: string): string {
  const referencia = String(valor).replace(/[^\d+]/g, '');
  if (referencia.length < 5) return '+•••';
  const pais = referencia.slice(0, 3);
  const finales = referencia.slice(-2);
  const ocultas = Math.max(1, referencia.length - pais.length - finales.length);
  return `${pais}${'•'.repeat(ocultas)}${finales}`;
}

export function recortarCoordenada(valor: unknown): number | null {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  const factor = 10 ** DECIMALES_DE_COORDENADA;
  return Math.round(numero * factor) / factor;
}

/**
 * Un teléfono dentro de un texto, y NO cualquier ristra de dígitos.
 *
 * Misma forma que en el servidor, y por el mismo motivo: allí un filtro por
 * longitud convirtió una marca de tiempo en un teléfono enmascarado y dejó el
 * evento sin la hora. Un epoch de trece dígitos empieza por `1` y va pegado; no
 * cae en ninguna de estas tres formas.
 */
const TELEFONO_EN_TEXTO = /(?<![\w.])(?:\+\d[\d\s()-]{5,16}\d|0\d{9,10}|\d{2,4}[\s()-]+\d{2,4}[\s()-]+\d{2,6})(?![\w.])/g;

function ocultarSecretosEtiquetados(texto: string): string {
  const nombres = 'clave|contraseña|contrasena|password|pass|token|jwt|secret|secreto|otp|código|codigo|apikey|api[_ -]?key';
  return texto.replace(
    new RegExp(`\\b(${nombres})\\b\\s*(?:[:=]|es|:)?\\s*(\\S+)`, 'gi'),
    (_completo, etiqueta: string) => `${etiqueta} ${OCULTO}`
  );
}

export function limpiarTexto(texto: unknown): unknown {
  if (typeof texto !== 'string') return texto;
  let salida = texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, coincidencia => enmascararCorreo(coincidencia))
    .replace(TELEFONO_EN_TEXTO, coincidencia => enmascararTelefono(coincidencia))
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, OCULTO);
  salida = ocultarSecretosEtiquetados(salida);
  return salida.length > LARGO_MAXIMO ? `${salida.slice(0, LARGO_MAXIMO)}…` : salida;
}

export function limpiarValor(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (profundidad > PROFUNDIDAD_MAXIMA) return OCULTO;

  if (typeof valor === 'string') return limpiarTexto(valor);
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;

  if (Array.isArray(valor)) {
    return valor.slice(0, 20).map(elemento => limpiarValor(elemento, profundidad + 1));
  }

  if (typeof valor !== 'object') return OCULTO;

  const salida: Record<string, unknown> = {};
  for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
    if (esCampoProhibido(clave)) { salida[clave] = OCULTO; continue; }

    if (coincide(clave, CONTACTOS) && typeof contenido === 'string') {
      salida[clave] = contenido.includes('@') ? enmascararCorreo(contenido) : enmascararTelefono(contenido);
      continue;
    }
    if (coincide(clave, TELEFONOS) && typeof contenido === 'string') {
      salida[clave] = enmascararTelefono(contenido);
      continue;
    }
    if (coincide(clave, COORDENADAS) && typeof contenido === 'number') {
      salida[clave] = recortarCoordenada(contenido);
      continue;
    }
    salida[clave] = limpiarValor(contenido, profundidad + 1);
  }
  return salida;
}

/** La forma mínima de un evento, para no depender de los tipos del SDK. */
export interface EventoDeDiagnostico {
  message?: unknown;
  request?: Record<string, unknown>;
  user?: Record<string, unknown>;
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
  breadcrumbs?: Array<Record<string, unknown>>;
  exception?: { values?: Array<Record<string, unknown>> };
  [clave: string]: unknown;
}

/** El `beforeSend` entero, escrito aquí para poder ejercerlo sin el SDK. */
export function limpiarEvento(evento: EventoDeDiagnostico | null): EventoDeDiagnostico | null {
  if (!evento || typeof evento !== 'object') return evento;
  const salida: EventoDeDiagnostico = { ...evento };

  if (salida.request) {
    const peticion = { ...salida.request } as Record<string, unknown>;
    delete peticion.headers;
    delete peticion.cookies;
    delete peticion.query_string;
    if (peticion.data !== undefined) peticion.data = limpiarValor(peticion.data);
    if (typeof peticion.url === 'string') peticion.url = peticion.url.split('?')[0];
    salida.request = peticion;
  }

  if (salida.extra) salida.extra = limpiarValor(salida.extra) as Record<string, unknown>;
  if (salida.contexts) salida.contexts = limpiarValor(salida.contexts) as Record<string, unknown>;
  if (salida.tags) salida.tags = limpiarValor(salida.tags) as Record<string, unknown>;

  // Del usuario, sólo el identificador y el rol. El id es opaco y sirve para
  // seguir a una persona por sus eventos; el correo no aporta nada que el id no
  // dé, y sí es un dato personal.
  if (salida.user) {
    const usuario = salida.user as Record<string, unknown>;
    salida.user = {
      id: typeof usuario.id === 'string' ? usuario.id : undefined,
      role: typeof usuario.role === 'string' ? usuario.role : undefined
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
      values: salida.exception.values.map(fallo => ({ ...fallo, value: limpiarTexto(fallo?.value) }))
    };
  }

  if (typeof salida.message === 'string') salida.message = limpiarTexto(salida.message);

  return salida;
}
