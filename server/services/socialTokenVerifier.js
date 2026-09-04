/**
 * El verificador de tokens de Google y de Apple.
 *
 * QUE VERIFICA
 *
 * Todo lo que el brief exige, en el servidor: la FIRMA contra las claves
 * publicas del proveedor (JWKS), el algoritmo, el emisor, la audiencia, el
 * vencimiento y la presencia del `sub`. Los claims los comprueba
 * `domain/socialToken.js`; aqui esta lo que necesita criptografia y red.
 *
 * DE DONDE SALEN LAS CLAVES
 *
 * `obtenerJwks(provider)` se inyecta. Por omision descarga el JWKS publico
 * del contrato con `fetch` y lo guarda una hora; las pruebas inyectan un JWKS
 * generado en local y firman con su clave privada, asi que la verificacion
 * que se prueba es la REAL, con la unica diferencia de quien emitio la clave.
 *
 * SIN AUDIENCIA NO HAY PROVEEDOR
 *
 * Si no esta configurado el client id (Google) o el bundle id (Apple), el
 * verificador responde `{ configurado: false }` y el router devuelve 503. No
 * hay modo de aceptar un token «porque el cliente dice que es de Google».
 *
 * NUNCA SE REGISTRA EL TOKEN. Ni entero, ni sus claims, ni en los errores.
 */
import { createPublicKey } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { CONTRATOS, RECHAZO, audienciasDesde, validarClaims } from '../domain/socialToken.js';

const VIDA_DEL_JWKS_MS = 60 * 60 * 1000;

async function descargarJwks(provider) {
  const respuesta = await fetch(CONTRATOS[provider].jwksUrl);
  if (!respuesta.ok) throw new Error(`JWKS_FETCH_FAILED:${provider}`);
  return respuesta.json();
}

function clavePublicaDesdeJwk(jwk) {
  return createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}

export function crearVerificadorSocial({
  env = process.env,
  obtenerJwks = descargarJwks,
  now = () => new Date()
} = {}) {
  const audiencias = {
    GOOGLE: audienciasDesde(env.GOOGLE_OAUTH_CLIENT_IDS),
    APPLE: audienciasDesde(env.APPLE_SIGN_IN_AUDIENCES)
  };
  const cache = new Map();

  async function clavesDe(provider, { forzar = false } = {}) {
    const guardado = cache.get(provider);
    if (!forzar && guardado && guardado.hasta > now().getTime()) return guardado.claves;
    const jwks = await obtenerJwks(provider);
    const claves = Array.isArray(jwks?.keys) ? jwks.keys : [];
    cache.set(provider, { claves, hasta: now().getTime() + VIDA_DEL_JWKS_MS });
    return claves;
  }

  function configurado(provider) {
    return Array.isArray(audiencias[provider]) && audiencias[provider].length > 0;
  }

  /**
   * Devuelve `{ configurado: false }`, `{ ok: false, motivo }` o
   * `{ ok: true, subject, email, emailVerified }`.
   */
  async function verificar(provider, token) {
    const contrato = CONTRATOS[provider];
    if (!contrato) throw new Error(`Proveedor social desconocido: ${provider}`);
    if (!configurado(provider)) return { configurado: false, ok: false, motivo: null };
    if (typeof token !== 'string' || token === '') return { configurado: true, ok: false, motivo: RECHAZO.SIN_TOKEN };

    const decodificado = jwt.decode(token, { complete: true });
    if (!decodificado?.header) return { configurado: true, ok: false, motivo: RECHAZO.MAL_FORMADO };
    if (!contrato.algoritmos.includes(decodificado.header.alg)) {
      return { configurado: true, ok: false, motivo: RECHAZO.ALGORITMO };
    }

    const kid = decodificado.header.kid;
    let jwk = (await clavesDe(provider)).find(k => k.kid === kid);
    // Los proveedores rotan claves: un kid desconocido merece una segunda
    // descarga antes de rechazar.
    if (!jwk) jwk = (await clavesDe(provider, { forzar: true })).find(k => k.kid === kid);
    if (!jwk) return { configurado: true, ok: false, motivo: RECHAZO.CLAVE_DESCONOCIDA };

    let claims;
    try {
      claims = jwt.verify(token, clavePublicaDesdeJwk(jwk), {
        algorithms: [...contrato.algoritmos],
        issuer: [...contrato.issuers],
        audience: audiencias[provider],
        clockTimestamp: Math.floor(now().getTime() / 1000)
      });
    } catch (error) {
      // `jsonwebtoken` distingue firma de vencimiento de audiencia. Al cliente
      // no le llega la distincion, pero aqui se conserva para las pruebas.
      const motivo =
        error?.name === 'TokenExpiredError'
          ? RECHAZO.VENCIDO
          : /audience/i.test(error?.message ?? '')
            ? RECHAZO.AUDIENCIA
            : /issuer/i.test(error?.message ?? '')
              ? RECHAZO.EMISOR
              : RECHAZO.FIRMA;
      return { configurado: true, ok: false, motivo };
    }

    const validacion = validarClaims({ provider, claims, audiencias: audiencias[provider], now: now() });
    if (!validacion.ok) return { configurado: true, ok: false, motivo: validacion.motivo };
    return { configurado: true, ...validacion };
  }

  return { verificar, configurado, audiencias };
}
