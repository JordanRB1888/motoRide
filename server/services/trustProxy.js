/**
 * Configuración de confianza en el proxy inverso.
 *
 * Express solo lee `X-Forwarded-For` si se le dice cuántos saltos de proxy hay
 * por delante. Sin configurarlo, `req.ip` es la dirección del proxy, idéntica
 * para todo el mundo: el limitador de autenticación pasa a ser un cupo global
 * y treinta intentos en toda la plataforma dejan a todos fuera.
 *
 * El extremo contrario es igual de malo. Con `trust proxy: true` se confía en
 * la cabecera completa, y como la envía el cliente, cualquiera puede anteponer
 * direcciones inventadas y estrenar cupo en cada petición: el limitador deja
 * de existir.
 *
 * Por eso el valor tiene que ser el número EXACTO de proxies por delante. Se
 * expresa como número de saltos, nunca como booleano.
 */

// Railway, Render y Fly sitúan un único proxy de borde delante del servicio.
// Si se añadiera otro nivel --una CDN propia, un balanceador extra-- este
// número tiene que subir en la misma medida.
export const DEFAULT_PRODUCTION_HOPS = 1;

/**
 * Traduce la configuración del entorno al valor de `trust proxy`.
 *
 * @returns {{ value: number|false, source: string }}
 */
export function resolveTrustProxy({ value, isProduction = false } = {}) {
  const bruto = typeof value === 'string' ? value.trim() : value;

  if (bruto !== undefined && bruto !== null && bruto !== '') {
    if (bruto === 'false' || bruto === false) return { value: false, source: 'entorno' };

    // `Number.parseInt` se detiene en el primer carácter no numérico, así que
    // una dirección como "203.0.113.7" se leería como 203 saltos y una CDN
    // entera pasaría a ser de confianza. La cadena debe ser solo dígitos.
    const saltos = typeof bruto === 'number'
      ? bruto
      : (/^\d+$/.test(String(bruto)) ? Number(bruto) : Number.NaN);
    if (Number.isInteger(saltos) && saltos >= 0) {
      return { value: saltos === 0 ? false : saltos, source: 'entorno' };
    }
    // `true`, `on`, una lista de direcciones o cualquier cosa ilegible. No se
    // adivina: se cae al valor por defecto, que es seguro en ambos sentidos.
    return {
      value: isProduction ? DEFAULT_PRODUCTION_HOPS : false,
      source: 'valor inválido, se usa el predeterminado'
    };
  }

  return {
    value: isProduction ? DEFAULT_PRODUCTION_HOPS : false,
    source: 'predeterminado'
  };
}
