import type { Correo } from "./plantillas";

/**
 * Envío por Resend.
 *
 * Se usa el Resend que ya existe en el proyecto —el que manda los códigos de
 * verificación del backend— y no se añade un segundo proveedor: dos remitentes
 * para el mismo dominio es el camino recto a que uno de los dos acabe en spam.
 *
 * El remitente sale de `send.mas58express.com`, que es el subdominio que ya
 * tiene SPF y DKIM verificados. El apex NO envía: su SPF es `v=spf1 -all`.
 *
 * Sin rastreo de aperturas ni de clics. Si algún día el panel de Resend lo
 * activa a nivel de dominio, hay que apagarlo allí: aquí no se pide.
 */

const API = "https://api.resend.com/emails";

export type ResultadoEnvio =
  | { enviado: true; id: string | null }
  | { enviado: false; motivo: "SIN_CONFIGURAR" | "RECHAZADO" | "ERROR_DE_RED" };

export function correoConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function remitente(): string {
  return process.env.EMAIL_FROM || "+58Express <hola@send.mas58express.com>";
}

export async function enviarCorreo(
  para: string,
  correo: Correo,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoEnvio> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) return { enviado: false, motivo: "SIN_CONFIGURAR" };

  try {
    const r = await fetchImpl(API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${clave}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: remitente(),
        to: [para],
        subject: correo.asunto,
        html: correo.html,
        text: correo.texto,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!r.ok) return { enviado: false, motivo: "RECHAZADO" };
    const datos = (await r.json().catch(() => null)) as { id?: string } | null;
    return { enviado: true, id: datos?.id ?? null };
  } catch {
    return { enviado: false, motivo: "ERROR_DE_RED" };
  }
}
