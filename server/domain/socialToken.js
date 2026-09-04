/**
 * Los contratos de los tokens de Google y de Apple, y la comprobacion de sus
 * claims. Este fichero NO verifica firmas: eso necesita las claves publicas
 * del proveedor y vive en `services/socialTokenVerifier.js`. Aqui esta lo que
 * se puede decidir mirando solo el contenido del token, y se prueba sin red.
 *
 * QUE ENTREGA CADA PROVEEDOR
 *
 *   GOOGLE  -- un ID token (JWT, RS256) firmado por Google. `iss` es
 *              `https://accounts.google.com` o `accounts.google.com`; `aud`
 *              es el client id de la aplicacion; `sub` es el id estable de la
 *              cuenta; puede traer `email` y `email_verified`.
 *   APPLE   -- un identity token (JWT, RS256) firmado por Apple. `iss` es
 *              `https://appleid.apple.com`; `aud` es el bundle id (iOS) o el
 *              service id (web); `sub` es el id estable; `email` puede ser
 *              un alias de relay y solo llega la primera vez.
 *
 * QUE NO ES PRUEBA
 *
 * Que el cliente diga `provider: 'google'`, mande un `email` o un `name`. Nada
 * de eso demuestra nada: lo unico que cuenta es un token cuya firma verifique
 * el servidor contra las claves publicas del proveedor y cuyos claims cuadren
 * con lo de abajo.
 */

export const CONTRATOS = Object.freeze({
  GOOGLE: Object.freeze({
    issuers: Object.freeze(['https://accounts.google.com', 'accounts.google.com']),
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    algoritmos: Object.freeze(['RS256']),
    /** Variables de entorno que hacen falta para que el servidor lo acepte. */
    configuracion: Object.freeze(['GOOGLE_OAUTH_CLIENT_IDS'])
  }),
  APPLE: Object.freeze({
    issuers: Object.freeze(['https://appleid.apple.com']),
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    algoritmos: Object.freeze(['RS256']),
    configuracion: Object.freeze(['APPLE_SIGN_IN_AUDIENCES'])
  })
});

/**
 * Los motivos por los que un token se rechaza. Al cliente le llega uno solo,
 * `INVALID_PROVIDER_TOKEN`, sin distinguir: distinguir ayudaria a quien
 * fabrica tokens, no a quien entra con el suyo.
 */
export const RECHAZO = Object.freeze({
  SIN_TOKEN: 'SIN_TOKEN',
  MAL_FORMADO: 'MAL_FORMADO',
  EMISOR: 'EMISOR',
  AUDIENCIA: 'AUDIENCIA',
  VENCIDO: 'VENCIDO',
  AUN_NO_VALIDO: 'AUN_NO_VALIDO',
  SIN_SUBJECT: 'SIN_SUBJECT',
  FIRMA: 'FIRMA',
  ALGORITMO: 'ALGORITMO',
  CLAVE_DESCONOCIDA: 'CLAVE_DESCONOCIDA'
});

/** Margen de reloj entre el servidor y el proveedor. */
export const TOLERANCIA_DE_RELOJ_MS = 60 * 1000;

/**
 * Comprueba los claims de un token YA verificado criptograficamente. Devuelve
 * `{ ok: true, subject, email, emailVerified }` o `{ ok: false, motivo }`.
 *
 * `audiencias` es la lista de client ids / bundle ids que esta aplicacion
 * acepta. Vacia significa que el proveedor no esta configurado, y eso no es
 * un rechazo del token: es un 503, y lo decide quien llama.
 */
export function validarClaims({ provider, claims, audiencias, now = new Date() }) {
  const contrato = CONTRATOS[provider];
  if (!contrato) throw new Error(`Proveedor social desconocido: ${provider}`);
  if (!claims || typeof claims !== 'object') return { ok: false, motivo: RECHAZO.MAL_FORMADO };

  if (!contrato.issuers.includes(claims.iss)) return { ok: false, motivo: RECHAZO.EMISOR };

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some(a => audiencias.includes(a))) return { ok: false, motivo: RECHAZO.AUDIENCIA };

  const ahora = now.getTime();
  if (typeof claims.exp !== 'number' || claims.exp * 1000 + TOLERANCIA_DE_RELOJ_MS <= ahora) {
    return { ok: false, motivo: RECHAZO.VENCIDO };
  }
  if (typeof claims.iat === 'number' && claims.iat * 1000 - TOLERANCIA_DE_RELOJ_MS > ahora) {
    return { ok: false, motivo: RECHAZO.AUN_NO_VALIDO };
  }
  if (typeof claims.nbf === 'number' && claims.nbf * 1000 - TOLERANCIA_DE_RELOJ_MS > ahora) {
    return { ok: false, motivo: RECHAZO.AUN_NO_VALIDO };
  }

  if (typeof claims.sub !== 'string' || claims.sub === '') return { ok: false, motivo: RECHAZO.SIN_SUBJECT };

  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null;
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  return { ok: true, subject: claims.sub, email, emailVerified };
}

/**
 * Lee la lista de audiencias de una variable de entorno con valores separados
 * por comas. Devuelve `[]` si no esta: el proveedor no esta configurado.
 */
export function audienciasDesde(valor) {
  return String(valor ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '');
}
