/**
 * Adaptador real de FCM V1, para los teléfonos (PUSH-1 · Firebase).
 *
 * Hermano de `webPushSender.js`, y con la misma responsabilidad estrecha:
 * autenticarse contra Google, traducir nuestra suscripción al formato del
 * proveedor, enviar el payload ya minimizado y NORMALIZAR la respuesta al
 * `{ statusCode }` que el clasificador de siempre sabe leer. Ninguna decisión
 * de negocio vive aquí: ni qué avisar, ni a quién, ni cuándo dar de baja.
 *
 * SIN `firebase-admin`
 *
 * La API V1 solo pide un token OAuth2 firmado con la clave de la cuenta de
 * servicio, y `jsonwebtoken` --que ya está en el proyecto para las sesiones--
 * firma RS256. Traer `firebase-admin` para esto serían veinte megas de
 * dependencias para una firma y un POST.
 *
 * LA CUENTA DE SERVICIO NUNCA SALE DE AQUÍ
 *
 * Se lee UNA vez de disco al construir. Ni la clave privada, ni el correo de la
 * cuenta, ni el identificador del proyecto se registran jamás; los errores de
 * configuración llevan un código, no el valor. Y el token de un dispositivo
 * tampoco se registra: identifica a un teléfono concreto.
 *
 * DATA-ONLY, Y POR QUÉ LLEVA TÍTULO
 *
 * El mensaje va como `data`, sin bloque `notification`. Así lo presenta la
 * aplicación con SU tabla y no el sistema con lo que Google le pase, y llega
 * igual con la aplicación cerrada. El título y el cuerpo que viajan son
 * CONSTANTES de `TEXTO_DE_AVISO`, elegidas por TIPO: el emisor no tiene acceso
 * al viaje, al mensaje ni a la persona, así que no existe el camino por el que
 * una dirección o el texto de un chat lleguen a una pantalla de bloqueo.
 */

import fs from 'node:fs';
import jwt from 'jsonwebtoken';

import { PUSH_TTL_SEGUNDOS } from './webPushSender.js';
import { TEXTO_DE_AVISO } from './pushNotificationService.js';

const ALCANCE = 'https://www.googleapis.com/auth/firebase.messaging';
const VIDA_DEL_TOKEN_S = 3600;
/** Se renueva un minuto antes de caducar: un reloj adelantado no debe romper un envío. */
const MARGEN_DE_RENOVACION_MS = 60_000;

/** Códigos escuetos: nunca llevan material de clave ni un token dentro. */
export const FCM_CONFIG_ERROR = Object.freeze({
  FILE_MISSING: 'FCM_SERVICE_ACCOUNT_FILE_MISSING',
  FILE_UNREADABLE: 'FCM_SERVICE_ACCOUNT_FILE_UNREADABLE',
  ENV_UNREADABLE: 'FCM_SERVICE_ACCOUNT_ENV_UNREADABLE',
  INVALID: 'FCM_SERVICE_ACCOUNT_INVALID'
});

/**
 * Lee y comprueba la cuenta de servicio sin registrar nada de ella.
 *
 * Exportada para la prueba, que la ejerce con una cuenta generada en memoria.
 */
export function cargarCuentaDeServicio(ruta) {
  if (!ruta) throw new Error(FCM_CONFIG_ERROR.FILE_MISSING);
  let texto;
  try {
    texto = fs.readFileSync(ruta, 'utf8');
  } catch {
    throw new Error(FCM_CONFIG_ERROR.FILE_MISSING);
  }
  let cuenta;
  try {
    cuenta = JSON.parse(texto);
  } catch {
    throw new Error(FCM_CONFIG_ERROR.FILE_UNREADABLE);
  }
  return validarCuentaDeServicio(cuenta);
}

/**
 * La misma cuenta, pero venida del entorno en base64.
 *
 * PARA RAILWAY. Allí no hay dónde montar un fichero: la imagen del servidor no
 * copia ninguna credencial a propósito, y meterla dentro dejaría una clave
 * privada en cada capa de la imagen y en el registro de contenedores.
 *
 * En base64 y no como JSON crudo, por lo mismo que en Maps: un JSON de varias
 * líneas en una variable de entorno acaba mal escapado y, peor, acaba impreso
 * en un registro el día que alguien vuelca el entorno para depurar. Base64 es
 * una sola línea, sin comillas ni saltos, y aquí se decodifica EN MEMORIA:
 * nunca toca el disco.
 *
 * Es el gemelo de `cuentaDesdeElEntorno` en `googleMapsAuth.js`. Las dos
 * credenciales del proyecto se aportan igual, y eso es deliberado: una sola
 * forma de dar una cuenta de servicio es una sola forma de equivocarse.
 */
export function cuentaDesdeElEntorno(base64) {
  if (!base64) throw new Error(FCM_CONFIG_ERROR.FILE_MISSING);
  let cuenta;
  try {
    cuenta = JSON.parse(Buffer.from(String(base64).trim(), 'base64').toString('utf8'));
  } catch {
    throw new Error(FCM_CONFIG_ERROR.ENV_UNREADABLE);
  }
  return validarCuentaDeServicio(cuenta);
}

/**
 * Qué campo de la cuenta no cumple, dicho con el NOMBRE del campo y nada más.
 *
 * POR QUÉ HACE FALTA SABERLO
 *
 * `FCM_SERVICE_ACCOUNT_INVALID` a secas deja el diagnóstico en un callejón: la
 * credencial es válida en el portátil y el servidor la rechaza, y no hay forma
 * de saber cuál de las cinco comprobaciones falló sin imprimir la cuenta, que
 * es justo lo que no se puede hacer.
 *
 * El nombre del campo es seguro: dice `private_key`, nunca su contenido.
 */
export function camposInvalidosDeLaCuenta(cuenta) {
  if (!cuenta || typeof cuenta !== 'object') return [`(no es un objeto: ${typeof cuenta})`];
  const fallos = [];
  if (cuenta.type !== 'service_account') fallos.push('type');
  if (typeof cuenta.project_id !== 'string' || !cuenta.project_id) fallos.push('project_id');
  if (typeof cuenta.client_email !== 'string' || !cuenta.client_email) fallos.push('client_email');
  if (typeof cuenta.private_key !== 'string' || !cuenta.private_key.includes('PRIVATE KEY')) fallos.push('private_key');
  if (typeof cuenta.token_uri !== 'string' || !cuenta.token_uri.startsWith('https://')) fallos.push('token_uri');
  return fallos;
}

export function validarCuentaDeServicio(cuenta) {
  const fallos = camposInvalidosDeLaCuenta(cuenta);
  if (fallos.length > 0) {
    // El mensaje lleva los NOMBRES de los campos que fallan. Nunca sus valores:
    // este texto acaba en los registros de Railway.
    const error = new Error(FCM_CONFIG_ERROR.INVALID);
    error.campos = fallos;
    error.claves = Object.keys(cuenta && typeof cuenta === 'object' ? cuenta : {}).slice(0, 12);
    throw error;
  }
  return {
    projectId: cuenta.project_id,
    clientEmail: cuenta.client_email,
    privateKey: cuenta.private_key,
    tokenUri: cuenta.token_uri
  };
}

/**
 * Traduce la respuesta de FCM V1 al `{ statusCode }` del clasificador.
 *
 * Exportada porque es donde de verdad se puede equivocar uno, y las
 * consecuencias son opuestas: tomar un token muerto por transitorio lo deja
 * reintentándose para siempre; tomar un fallo NUESTRO por token muerto va
 * borrando dispositivos válidos.
 *
 *   UNREGISTERED           el teléfono desinstaló o rotó el token   → 410, baja
 *   SENDER_ID_MISMATCH     token de otro proyecto de Firebase       → 404, baja
 *   INVALID_ARGUMENT       si habla del token → 404; si no, es
 *                          nuestro payload → 400, sin penalizar
 *   QUOTA_EXCEEDED / 429   límite nuestro con el proveedor          → 429
 *   401 / 403              NUESTRA credencial rechazada             → 429 (*)
 *   5xx / UNAVAILABLE      transitorio                              → 503
 *
 * (*) Un fallo de la cuenta de servicio no dice nada de ningún teléfono. Si se
 * clasificara como transitorio, cinco envíos seguidos darían de baja TODAS las
 * suscripciones por un error de configuración nuestro. Se devuelve como límite
 * --que el clasificador no penaliza-- y se registra con estruendo.
 */
export function normalizarRespuestaFcm(status, cuerpo) {
  if (status >= 200 && status < 300) return { statusCode: 200 };

  const detalles = Array.isArray(cuerpo?.error?.details) ? cuerpo.error.details : [];
  const fcm = detalles.find(d => typeof d?.errorCode === 'string');
  const codigo = fcm?.errorCode ?? cuerpo?.error?.status ?? '';
  const mensaje = String(cuerpo?.error?.message ?? '').toLowerCase();

  if (codigo === 'UNREGISTERED') return { statusCode: 410, fcm: codigo };
  if (codigo === 'SENDER_ID_MISMATCH') return { statusCode: 404, fcm: codigo };
  if (codigo === 'INVALID_ARGUMENT' || status === 400) {
    const habla = mensaje.includes('token') || mensaje.includes('registration');
    return { statusCode: habla ? 404 : 400, fcm: codigo || 'INVALID_ARGUMENT' };
  }
  if (codigo === 'QUOTA_EXCEEDED' || status === 429) return { statusCode: 429, fcm: codigo || 'QUOTA_EXCEEDED' };
  if (status === 401 || status === 403) return { statusCode: 429, fcm: 'AUTH_REJECTED', credencial: true };
  return { statusCode: status >= 500 ? status : 503, fcm: codigo || 'UNAVAILABLE' };
}

/**
 * El canal de Android donde caen los avisos. Es espejo de `CANAL_DE_CARRERAS`
 * en el teléfono, y hay una prueba que lo vigila: un canal que no existe en
 * el aparato manda el aviso al de reserva de expo, con menos importancia.
 */
export const CANAL_ANDROID = 'carreras';

/**
 * El mensaje que se envía. Exportado para que la prueba certifique que sólo
 * lleva lo que debe.
 *
 * Tiene la forma que `expo-notifications` espera en Android: `title` y
 * `message` son lo que se muestra; `body` es el JSON que la aplicación recibe
 * como `content.data` (tipo y viaje, y nada más); `channelId` elige el canal.
 * FCM V1 exige que todo `data` sean cadenas, por eso el JSON va serializado.
 */
export function construirMensajeFcm({ token, payload, ttlSegundos = PUSH_TTL_SEGUNDOS }) {
  const texto = TEXTO_DE_AVISO[payload?.t] ?? TEXTO_DE_AVISO.por_omision;
  const aviso = { v: Number(payload?.v ?? 1), t: String(payload?.t ?? '') };
  if (payload?.tripId) aviso.tripId = String(payload.tripId);

  return {
    message: {
      token,
      data: {
        title: texto.title,
        message: texto.body,
        channelId: CANAL_ANDROID,
        body: JSON.stringify(aviso)
      },
      android: { priority: 'high', ttl: `${ttlSegundos}s` },
      // iOS: arquitectura lista. Lee sus datos de `body` junto a `aps`. Sin
      // dispositivo ni APNs no se declara PASS.
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { alert: { title: texto.title, body: texto.body }, sound: 'default' }, body: aviso }
      }
    }
  };
}

export function createFcmSender({
  rutaDeLaCuenta = process.env.FCM_SERVICE_ACCOUNT_FILE,
  /** La cuenta en base64, tal cual viene del entorno. Como en `crearAuthDeMaps`. */
  cuentaEnBase64 = process.env.FCM_SERVICE_ACCOUNT_B64,
  cuenta = null,
  fetchImpl = fetch,
  firmar = jwt.sign,
  now = () => Date.now(),
  logger = console,
  ttlSegundos = PUSH_TTL_SEGUNDOS,
  timeoutMs = 5_000
} = {}) {
  // TRES ENTRADAS, UNA SOLA VALIDACIÓN.
  //
  // El base64 se resuelve AQUÍ, y no fuera, porque `cuentaDesdeElEntorno`
  // devuelve la cuenta ya normalizada --`projectId`, `clientEmail`…-- y
  // `validarCuentaDeServicio` espera la forma cruda de Google --`project_id`,
  // `client_email`…--. Pasarle la normalizada la rechazaba entera: en el
  // arranque de staging fallaban los cinco campos a la vez con la credencial
  // correcta puesta, y sólo se vio al hacer que el error dijera QUÉ claves
  // había recibido.
  //
  // Ofrecer la vía de base64 en la misma función que la valida cierra ese
  // camino: quien la usa ya no puede validar dos veces.
  const credencial = cuenta
    ? validarCuentaDeServicio(cuenta)
    : (cuentaEnBase64 ? cuentaDesdeElEntorno(cuentaEnBase64) : cargarCuentaDeServicio(rutaDeLaCuenta));
  const endpointDeEnvio = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credencial.projectId)}/messages:send`;

  /** { valor, caducaEn } — un solo token para todo el proceso. */
  let tokenDeAcceso = null;

  async function obtenerTokenDeAcceso() {
    const ahora = now();
    if (tokenDeAcceso && tokenDeAcceso.caducaEn - MARGEN_DE_RENOVACION_MS > ahora) return tokenDeAcceso.valor;

    const emitidoEn = Math.floor(ahora / 1000);
    const asercion = firmar({
      iss: credencial.clientEmail,
      scope: ALCANCE,
      aud: credencial.tokenUri,
      iat: emitidoEn,
      exp: emitidoEn + VIDA_DEL_TOKEN_S
    }, credencial.privateKey, { algorithm: 'RS256' });

    const cuerpo = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: asercion
    });
    const respuesta = await fetchImpl(credencial.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo.toString(),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!respuesta.ok) {
      // El cuerpo puede describir la cuenta: no se registra.
      logger.error?.(`[+58express Push] Google rechazo la cuenta de servicio de FCM (${respuesta.status})`);
      throw new Error('FCM_AUTH_FAILED');
    }
    const json = await respuesta.json();
    if (typeof json?.access_token !== 'string') throw new Error('FCM_AUTH_FAILED');
    tokenDeAcceso = {
      valor: json.access_token,
      caducaEn: ahora + Number(json.expires_in ?? VIDA_DEL_TOKEN_S) * 1000
    };
    return tokenDeAcceso.valor;
  }

  return async function enviar({ endpoint, payload } = {}) {
    // En una suscripción FCM el `endpoint` ES el token del dispositivo.
    const token = typeof endpoint === 'string' ? endpoint.trim() : '';
    if (!token) return { statusCode: 400, fcm: 'TOKEN_MISSING' };

    let acceso;
    try {
      acceso = await obtenerTokenDeAcceso();
    } catch {
      // Credencial nuestra: no se penaliza al dispositivo. Ver `normalizarRespuestaFcm`.
      return { statusCode: 429, fcm: 'AUTH_REJECTED', credencial: true };
    }

    let respuesta;
    try {
      respuesta = await fetchImpl(endpointDeEnvio, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${acceso}`
        },
        body: JSON.stringify(construirMensajeFcm({ token, payload, ttlSegundos })),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (fallo) {
      // Fallo de red de verdad: se relanza con un código escueto, como Web Push.
      logger.warn?.('[+58express Push] fallo de red al enviar por FCM');
      throw new Error(fallo?.name === 'TimeoutError' ? 'FCM_TIMEOUT' : 'FCM_NETWORK');
    }

    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    const resultado = normalizarRespuestaFcm(respuesta.status, cuerpo);
    if (resultado.credencial) {
      logger.error?.(`[+58express Push] FCM rechazo NUESTRA credencial (${respuesta.status}); no se penaliza al dispositivo`);
    }
    return resultado;
  };
}
