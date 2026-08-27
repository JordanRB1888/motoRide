/**
 * Reintento ACOTADO del arranque de la base de datos — DB-STARTUP-RESILIENCE-1.
 *
 * Nace de un incidente real: Supavisor (el pooler de Supabase) aceptaba la
 * conexión y respondía «econnrefused» porque ÉL no alcanzaba a PostgreSQL
 * durante unos minutos. El backend falla cerrado por diseño (sin base de
 * datos no arranca), así que Railway entró en bucle de crash hasta un
 * reinicio manual posterior a la recuperación.
 *
 * Este módulo tolera ESE tipo de corte SIN debilitar el fail-closed:
 *
 *  - Solo reintenta errores compatibles con conectividad transitoria
 *    (lista explícita). Un fallo de autenticación, de certificado o de
 *    configuración falla RÁPIDO: reintentarlo escondería un problema real.
 *  - El reintento es finito: escalera de esperas 2s→4s→8s→15s→30s (con un
 *    poco de azar acotado para no sincronizar reintentos) dentro de una
 *    ventana total de ~2,5 minutos. Agotada, se relanza el error y el
 *    proceso muere igual que hoy — Railway decide después.
 *  - UN solo dueño: esta es la única espiral de reintentos del proceso.
 *
 * Nada de aquí toca la URL, el pooler, el TLS ni el esquema.
 */

/** Escalera de esperas; el último peldaño se repite hasta agotar la ventana. */
export const STARTUP_RETRY_DELAYS_MS = Object.freeze([2_000, 4_000, 8_000, 15_000, 30_000]);

/** Ventana total del arranque tolerante. Configurable por entorno. */
export const STARTUP_RETRY_MAX_TOTAL_MS = 150_000;

/** Azar acotado (±20 %) para no sincronizar reintentos entre réplicas. */
export const STARTUP_RETRY_JITTER_RATIO = 0.2;

/** Códigos de red/pg compatibles con un corte transitorio de conectividad. */
const CODIGOS_TRANSITORIOS = new Set([
  // Node / socket
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE',
  'EAI_AGAIN', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH',
  // PostgreSQL (clase 08: fallo de conexión) y «cannot connect now»
  '08006', '08001', '08004', '57P03'
]);

/** Códigos que JAMÁS se reintentan: seguridad/configuración rotas. */
const CODIGOS_PERMANENTES = new Set([
  // PostgreSQL: autenticación/autorización/objetos
  '28P01', '28000', '3D000',
  // TLS de Node: certificados inválidos NUNCA se insisten
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'HOSTNAME_MISMATCH'
]);

/**
 * ¿Es este fallo un corte transitorio de conectividad?
 *
 * Conservador: lo desconocido NO se reintenta (un error de programación o de
 * configuración debe verse rápido, no esconderse tras minutos de espera).
 */
export function isTransientStartupError(error) {
  const code = String(error?.code ?? '');
  if (CODIGOS_PERMANENTES.has(code)) return false;
  if (CODIGOS_TRANSITORIOS.has(code)) return true;
  // El caso REAL del incidente: el pooler responde un error de protocolo
  // Postgres con severidad FATAL y mensaje «Failed to connect to database:
  // {:error, :econnrefused}» — a veces sin código utilizable.
  const mensaje = String(error?.message ?? '');
  if (/failed to connect to database|econnrefused|connection terminated unexpectedly|timeout expired/i.test(mensaje)
    && !/password|authentication|certificate|self.signed/i.test(mensaje)) {
    return true;
  }
  return false;
}

/** Categoría segura para las trazas: código o forma, jamás credenciales. */
export function safeErrorCategory(error) {
  return String(error?.code ?? '').trim()
    || (isTransientStartupError(error) ? 'TRANSIENT_CONNECTIVITY' : 'UNCLASSIFIED');
}

/**
 * Ejecuta `attempt()` con la política de reintentos del arranque.
 *
 * @param {object} opciones
 * @param {() => Promise<any>} opciones.attempt  UN intento completo de
 *   apertura (el intento es responsable de limpiar sus propios recursos si
 *   falla: ningún pool a medias puede sobrevivir entre intentos).
 * @returns lo que devuelva `attempt` en el primer intento exitoso.
 * @throws el último error si es permanente o si la ventana se agota.
 */
export async function runStartupWithRetry({
  attempt,
  delaysMs = STARTUP_RETRY_DELAYS_MS,
  maxTotalMs = Number(process.env.DATABASE_STARTUP_MAX_RETRY_MS) || STARTUP_RETRY_MAX_TOTAL_MS,
  jitterRatio = STARTUP_RETRY_JITTER_RATIO,
  classify = isTransientStartupError,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
  random = Math.random,
  logger = console
} = {}) {
  const inicio = now();
  let intento = 0;

  for (;;) {
    intento += 1;
    try {
      const resultado = await attempt();
      if (intento > 1) {
        logger.log?.(`[+58express Database] ${JSON.stringify({
          event: 'database_startup_recovered',
          attempts: intento,
          elapsedMs: now() - inicio
        })}`);
      }
      return resultado;
    } catch (error) {
      const categoria = safeErrorCategory(error);
      if (!classify(error)) {
        logger.error?.(`[+58express Database] ${JSON.stringify({
          event: 'database_startup_permanent_failure',
          attempt: intento,
          category: categoria
        })}`);
        throw error;
      }

      const base = delaysMs[Math.min(intento - 1, delaysMs.length - 1)];
      const jitter = Math.round(base * jitterRatio * (random() * 2 - 1));
      const espera = Math.max(500, base + jitter);
      const transcurrido = now() - inicio;
      if (transcurrido + espera > maxTotalMs) {
        logger.error?.(`[+58express Database] ${JSON.stringify({
          event: 'database_startup_retries_exhausted',
          attempts: intento,
          elapsedMs: transcurrido,
          category: categoria
        })}`);
        throw error;
      }

      logger.warn?.(`[+58express Database] ${JSON.stringify({
        event: 'database_startup_retry',
        attempt: intento,
        nextDelayMs: espera,
        category: categoria
      })}`);
      await sleep(espera);
    }
  }
}
