/**
 * Limitadores de frecuencia por ruta y por identidad.
 *
 * No se pone un limitador global por dirección IP a propósito: los móviles
 * venezolanos comparten IP tras el NAT del operador, y un tope por dirección
 * castigaría a decenas de personas legítimas a la vez por culpa de una sola.
 *
 * Cuando hay sesión se cuenta por cuenta, que es la identidad real de quien
 * hace la petición. Solo se recurre a la dirección en las rutas anónimas,
 * donde no hay otra cosa a la que agarrarse.
 *
 * El limitador se monta DESPUÉS de `requireAuth` en cada ruta: antes de eso
 * `req.user` no existe todavía y todo el mundo compartiría la clave de IP.
 */

import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

export const MINUTO = 60 * 1000;
export const CUARTO_DE_HORA = 15 * MINUTO;

/**
 * Clave de conteo: la cuenta si hay sesión, la dirección si no.
 *
 * `ipKeyGenerator` normaliza IPv6 a su prefijo /64. Sin eso, un atacante con
 * un bloque IPv6 --que son enormes y baratos-- estrenaría cupo con cada
 * dirección y el límite no serviría de nada.
 */
export function identityKey(req) {
  const id = req.user?.id;
  if (typeof id === 'string' && id !== '') return `user:${id}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}

/**
 * Clave de conteo por dirección, siempre, haya sesión o no.
 *
 * Para los limitadores que corren ANTES de `requireAuth`, donde `req.user` no
 * existe todavía y no puede existir. `identityKey` recaería igualmente en la
 * dirección, pero hacerlo explícito evita que un cambio futuro en el orden de
 * los middlewares convierta un techo por dirección en uno por cuenta sin que
 * nadie se entere.
 */
export function addressKey(req) {
  return `ip:${ipKeyGenerator(req.ip)}`;
}

/**
 * @param {object} opciones
 * @param {string} opciones.name etiqueta que viaja en la respuesta 429, para
 *   que quien la reciba sepa qué límite tocó sin adivinarlo.
 * @param {number} opciones.limit peticiones por ventana.
 * @param {number} opciones.windowMs duración de la ventana.
 * @param {(req: object) => string} [opciones.keyGenerator] cómo se agrupa el
 *   conteo. Por omisión, la cuenta si hay sesión y la dirección si no.
 * @param {boolean} [opciones.skipSuccessfulRequests] si las respuestas
 *   correctas devuelven su permiso al terminar. Para las guardias previas a la
 *   autenticación, donde lo que se quiere frenar es el tráfico que falla.
 */
export function createIdentityLimiter({
  name, limit, windowMs, keyGenerator = identityKey, skipSuccessfulRequests = false
}) {
  if (!name) throw new Error('RATE_LIMITER_REQUIRES_NAME');
  if (!Number.isInteger(limit) || limit < 1) throw new Error('RATE_LIMITER_INVALID_LIMIT');
  if (!Number.isInteger(windowMs) || windowMs < 1000) throw new Error('RATE_LIMITER_INVALID_WINDOW');

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    skipSuccessfulRequests,
    handler: (req, res) => {
      // Segundos que faltan para que la ventana se reabra. `resetTime` lo pone
      // la propia librería; si no estuviera, la ventana completa es una cota
      // superior segura.
      const restanteMs = req.rateLimit?.resetTime
        ? Math.max(0, req.rateLimit.resetTime.getTime() - Date.now())
        : windowMs;
      // Retry-After es la cabecera estándar que consultan los clientes para
      // saber cuándo reintentar. El handler propio sustituye al de la
      // librería, así que hay que ponerla aquí explícitamente.
      res.set('Retry-After', String(Math.ceil(restanteMs / 1000)));
      // Cuerpo JSON como el resto de la API: un HTML o un texto plano de error
      // rompería a cualquier cliente que espere JSON.
      res.status(429).json({
        error: 'RATE_LIMITED',
        scope: name,
        retryAfterMs: restanteMs
      });
    }
  });
}
