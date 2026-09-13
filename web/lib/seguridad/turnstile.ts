/**
 * Verificación de Cloudflare Turnstile — **en el servidor**.
 *
 * El componente del navegador produce un testigo, y ese testigo no prueba nada
 * por sí solo: cualquiera puede enviar el formulario con `curl` y un testigo
 * inventado. Lo único que vale es preguntarle a Cloudflare, desde el servidor,
 * si ese testigo es suyo y si se ha usado ya.
 *
 * Por eso no existe ninguna ruta que confíe en el cliente: la verificación es
 * obligatoria y va ANTES de tocar el almacén.
 */

const VERIFICAR = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type ResultadoTurnstile =
  | { valido: true }
  | { valido: false; motivo: "SIN_TESTIGO" | "RECHAZADO" | "SIN_CONFIGURAR" | "ERROR_DE_RED" };

export function turnstileConfigurado(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verificarTurnstile(
  testigo: string | undefined,
  ip: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoTurnstile> {
  const secreto = process.env.TURNSTILE_SECRET_KEY;

  /* Sin clave no se puede verificar, y NO se deja pasar. Hacer lo contrario
     convertiría una configuración incompleta en una puerta abierta, que es
     justo el fallo que nadie ve hasta que llega el abuso. */
  if (!secreto) return { valido: false, motivo: "SIN_CONFIGURAR" };
  if (!testigo) return { valido: false, motivo: "SIN_TESTIGO" };

  const cuerpo = new URLSearchParams({ secret: secreto, response: testigo });
  if (ip) cuerpo.set("remoteip", ip);

  try {
    const r = await fetchImpl(VERIFICAR, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: cuerpo.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const datos = (await r.json()) as { success?: boolean };
    return datos?.success === true ? { valido: true } : { valido: false, motivo: "RECHAZADO" };
  } catch {
    /* Si Cloudflare no responde, NO se deja pasar. Es preferible que un alta
       legítima se reintente a que el filtro desaparezca justo cuando falla. */
    return { valido: false, motivo: "ERROR_DE_RED" };
  }
}
