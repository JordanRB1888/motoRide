/**
 * La autoridad de autenticación de Google Maps en el SERVIDOR.
 *
 * POR QUÉ EXISTE
 *
 * Las llamadas de servidor a Google Maps se autenticaban con una clave de API
 * restringida por IP. En este entorno la IP la pone Proton VPN y cambia cada
 * vez que se cambia de servidor de salida: cada cambio dejaba Routes fuera de
 * juego con `API_KEY_IP_ADDRESS_BLOCKED` hasta que alguien iba a Google Cloud a
 * poner la IP nueva en la lista. Eso no es un ajuste puntual, es una tarea
 * manual repetida que además rompe el cálculo de distancia y tiempo del viaje
 * sin avisar.
 *
 * Un token OAuth de cuenta de servicio no está atado a ninguna IP: se firma con
 * la clave privada de la cuenta y vale desde donde sea. Esa es la única razón
 * de esta pieza.
 *
 * UNA SOLA AUTORIDAD, NO CUATRO
 *
 * `routeGeometryClient`, `routeMatrixClient` y lo que venga después --búsqueda
 * de lugares, geocodificación-- piden aquí sus cabeceras. Si cada cliente
 * resolviera su propia autenticación habría cuatro cachés de token, cuatro
 * formas de fallar y cuatro sitios donde olvidarse de no registrar el token.
 *
 * QUÉ ACEPTA CADA API, COMPROBADO CONTRA GOOGLE (2026-09-06)
 *
 * No se dio por supuesto: se probó un token de cuenta de servicio contra cada
 * endpoint y se leyó lo que respondió.
 *
 *   Routes computeRoutes / computeRouteMatrix   acepta OAuth
 *   Places API (New) searchText                 acepta OAuth
 *   Geocoding clásico (maps.googleapis.com)     NO acepta OAuth: contesta
 *                                               «You must use an API key»
 *
 * Por eso la geocodificación clásica, si algún día se usa, se queda con clave
 * de API a propósito, y con ella su dependencia de la IP. Está anotado en el
 * informe de la migración y no es un olvido.
 *
 * EL ALCANCE
 *
 * De los alcances candidatos, el único que Google acepta hoy para estas APIs es
 * `cloud-platform`: los `maps-platform.*` que se probaron devuelven
 * «invalid authentication credentials» o «insufficient authentication scopes».
 * Se deja configurable por `GOOGLE_MAPS_OAUTH_SCOPE` para poder estrecharlo el
 * día que exista uno específico, sin tocar este código.
 *
 * EL RESPALDO NO ES SILENCIOSO
 *
 * Sin cuenta de servicio se sigue usando la clave de API, porque quedarse sin
 * rutas es peor. Pero el modo se anuncia al arrancar: quien lea el registro
 * sabe si está en OAuth o en clave, y por tanto si depende o no de la IP.
 */

import fs from 'node:fs';
import jwt from 'jsonwebtoken';

/**
 * El alcance que Google acepta hoy para Routes y Places con cuenta de
 * servicio. Ver la nota de arriba: los `maps-platform.*` se probaron y no
 * sirven.
 */
export const ALCANCE_POR_OMISION = 'https://www.googleapis.com/auth/cloud-platform';

const VIDA_DEL_TOKEN_S = 3600;
/** Se renueva un minuto antes de caducar: un reloj adelantado no puede tumbar una ruta. */
const MARGEN_DE_RENOVACION_MS = 60_000;

/** Códigos escuetos: jamás llevan clave ni token dentro. */
export const MAPS_AUTH_ERROR = Object.freeze({
  FILE_MISSING: 'MAPS_SERVICE_ACCOUNT_FILE_MISSING',
  FILE_UNREADABLE: 'MAPS_SERVICE_ACCOUNT_FILE_UNREADABLE',
  ENV_UNREADABLE: 'MAPS_SERVICE_ACCOUNT_ENV_UNREADABLE',
  INVALID: 'MAPS_SERVICE_ACCOUNT_INVALID',
  AUTH_FAILED: 'MAPS_AUTH_FAILED',
  NOT_CONFIGURED: 'MAPS_AUTH_NOT_CONFIGURED'
});

/** Cómo se está autenticando ahora mismo. Se anuncia; no se adivina. */
export const MODO_DE_AUTH = Object.freeze({
  OAUTH: 'oauth',
  API_KEY: 'api-key',
  SIN_CONFIGURAR: 'sin-configurar'
});

/**
 * Lee y comprueba la cuenta de servicio sin registrar nada de ella.
 *
 * Exportada para la prueba, que la ejerce con una cuenta generada en memoria:
 * ninguna prueba necesita --ni debe-- la cuenta real.
 */
export function cargarCuentaDeServicio(ruta) {
  if (!ruta) throw new Error(MAPS_AUTH_ERROR.FILE_MISSING);
  let texto;
  try {
    texto = fs.readFileSync(ruta, 'utf8');
  } catch {
    throw new Error(MAPS_AUTH_ERROR.FILE_MISSING);
  }
  let cuenta;
  try {
    cuenta = JSON.parse(texto);
  } catch {
    throw new Error(MAPS_AUTH_ERROR.FILE_UNREADABLE);
  }
  return validarCuentaDeServicio(cuenta);
}

export function validarCuentaDeServicio(cuenta) {
  const ok = cuenta
    && cuenta.type === 'service_account'
    && typeof cuenta.project_id === 'string' && cuenta.project_id
    && typeof cuenta.client_email === 'string' && cuenta.client_email
    && typeof cuenta.private_key === 'string' && cuenta.private_key.includes('PRIVATE KEY')
    && typeof cuenta.token_uri === 'string' && cuenta.token_uri.startsWith('https://');
  if (!ok) throw new Error(MAPS_AUTH_ERROR.INVALID);
  return {
    projectId: cuenta.project_id,
    clientEmail: cuenta.client_email,
    privateKey: cuenta.private_key,
    tokenUri: cuenta.token_uri
  };
}

/**
 * La misma cuenta, pero venida del entorno en base64.
 *
 * Para PRODUCCIÓN. En Railway no hay dónde montar un fichero: la imagen del
 * servidor no copia ninguna credencial a propósito. Y una variable con el JSON
 * crudo dentro está descartada desde FCM --varias líneas en el entorno acaban
 * mal escapadas y, peor, acaban en un registro--; base64 es una sola línea, no
 * lleva comillas ni saltos, y aquí se decodifica EN MEMORIA: nunca toca disco.
 */
export function cuentaDesdeElEntorno(base64) {
  if (!base64) throw new Error(MAPS_AUTH_ERROR.FILE_MISSING);
  let cuenta;
  try {
    cuenta = JSON.parse(Buffer.from(String(base64).trim(), 'base64').toString('utf8'));
  } catch {
    throw new Error(MAPS_AUTH_ERROR.ENV_UNREADABLE);
  }
  return validarCuentaDeServicio(cuenta);
}

/**
 * La autoridad de auth para las llamadas de servidor a Google Maps.
 *
 * Devuelve CABECERAS, no un token: quien llama no tiene por qué saber si detrás
 * hay un token o una clave, y así no hay ningún sitio donde un token se pueda
 * copiar a mano a otra parte.
 *
 * @param {object} opciones
 * @param {string} [opciones.rutaDeLaCuenta] fichero JSON de la cuenta de servicio
 * @param {object} [opciones.cuenta] cuenta ya cargada (para las pruebas)
 * @param {string} [opciones.apiKey] respaldo explícito
 * @param {string} [opciones.alcance]
 */
export function crearAuthDeMaps({
  rutaDeLaCuenta = process.env.GOOGLE_MAPS_SERVICE_ACCOUNT_FILE,
  cuentaEnBase64 = process.env.GOOGLE_MAPS_SERVICE_ACCOUNT_B64,
  cuenta = null,
  apiKey = process.env.DISPATCH_ROUTES_API_KEY,
  alcance = process.env.GOOGLE_MAPS_OAUTH_SCOPE || ALCANCE_POR_OMISION,
  fetchImpl = fetch,
  firmar = jwt.sign,
  now = () => Date.now(),
  logger = console,
  timeoutMs = 5_000
} = {}) {
  const clave = typeof apiKey === 'string' ? apiKey.trim() : '';

  // La cuenta se carga UNA vez, al construir. Un fichero ilegible no puede
  // descubrirse a mitad de un despacho: o se arranca con OAuth, o se sabe
  // desde el principio que se está con la clave.
  //
  // El fichero primero --es lo que se usa en local, y es explícito-- y el
  // entorno después, que es como llega en producción.
  let credencial = null;
  const deDonde = cuenta
    ? () => validarCuentaDeServicio(cuenta)
    : (rutaDeLaCuenta && fs.existsSync(rutaDeLaCuenta))
      ? () => cargarCuentaDeServicio(rutaDeLaCuenta)
      : (cuentaEnBase64 ? () => cuentaDesdeElEntorno(cuentaEnBase64) : null);
  if (deDonde) {
    try {
      credencial = deDonde();
    } catch (error) {
      // El mensaje NO cita la ruta ni el contenido: solo el código.
      logger.error?.(`[+58express Maps] la cuenta de servicio no sirve (${error.message})`);
      credencial = null;
    }
  }

  const modo = credencial !== null
    ? MODO_DE_AUTH.OAUTH
    : (clave.length > 0 ? MODO_DE_AUTH.API_KEY : MODO_DE_AUTH.SIN_CONFIGURAR);

  /** { valor, caducaEn } — un solo token para todo el proceso. */
  let tokenDeAcceso = null;

  async function obtenerToken() {
    const ahora = now();
    if (tokenDeAcceso && tokenDeAcceso.caducaEn - MARGEN_DE_RENOVACION_MS > ahora) {
      return tokenDeAcceso.valor;
    }

    const emitidoEn = Math.floor(ahora / 1000);
    const asercion = firmar({
      iss: credencial.clientEmail,
      scope: alcance,
      aud: credencial.tokenUri,
      iat: emitidoEn,
      exp: emitidoEn + VIDA_DEL_TOKEN_S
    }, credencial.privateKey, { algorithm: 'RS256' });

    let respuesta;
    try {
      respuesta = await fetchImpl(credencial.tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: asercion
        }).toString(),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      // Ni la URL ni la aserción entran en el registro.
      logger.error?.('[+58express Maps] no se pudo pedir el token de acceso');
      throw new Error(MAPS_AUTH_ERROR.AUTH_FAILED);
    }

    if (!respuesta.ok) {
      // El cuerpo puede describir la cuenta: se registra el código y nada más.
      logger.error?.(`[+58express Maps] Google rechazo la cuenta de servicio (${respuesta.status})`);
      throw new Error(MAPS_AUTH_ERROR.AUTH_FAILED);
    }

    const json = await respuesta.json().catch(() => null);
    const valor = json?.access_token;
    if (typeof valor !== 'string' || valor === '') {
      logger.error?.('[+58express Maps] la respuesta del token no traia token');
      throw new Error(MAPS_AUTH_ERROR.AUTH_FAILED);
    }

    const vidaS = Number(json.expires_in);
    tokenDeAcceso = {
      valor,
      caducaEn: ahora + (Number.isFinite(vidaS) && vidaS > 0 ? vidaS : VIDA_DEL_TOKEN_S) * 1000
    };
    return valor;
  }

  return {
    /** 'oauth' | 'api-key' | 'sin-configurar'. Para anunciarlo al arrancar. */
    get modo() {
      return modo;
    },

    /** Si las llamadas de servidor dependen de que la IP esté en la lista. */
    get dependeDeLaIp() {
      return modo === MODO_DE_AUTH.API_KEY;
    },

    estaConfigurado() {
      return modo !== MODO_DE_AUTH.SIN_CONFIGURAR;
    },

    /**
     * Las cabeceras de autenticación de esta llamada.
     *
     * Con OAuth devuelve `Authorization: Bearer …` --token cacheado y renovado
     * solo--; con clave, la cabecera de siempre. Nunca devuelve el token pelado.
     */
    async cabeceras() {
      if (modo === MODO_DE_AUTH.SIN_CONFIGURAR) throw new Error(MAPS_AUTH_ERROR.NOT_CONFIGURED);
      if (modo === MODO_DE_AUTH.API_KEY) return { 'X-Goog-Api-Key': clave };
      return { Authorization: `Bearer ${await obtenerToken()}` };
    },

    /** Sólo para las pruebas: olvida el token cacheado. */
    olvidarToken() {
      tokenDeAcceso = null;
    }
  };
}
