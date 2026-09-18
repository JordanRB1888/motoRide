import type { Correo } from "./plantillas";

/**
 * Envío por Resend.
 *
 * Se usa Resend, el mismo proveedor que ya manda los códigos de verificación del
 * backend, y no se añade un segundo: dos proveedores para el mismo dominio es el
 * camino recto a que uno de los dos acabe en spam.
 *
 * EL REMITENTE ES EL APEX, Y ESTO ES LO QUE LO DEMUESTRA
 *
 * Una versión anterior de este fichero enviaba desde `send.mas58express.com`
 * diciendo que era «el subdominio con SPF y DKIM verificados». Era falso, y el
 * DNS lo desmiente:
 *
 *   resend._domainkey.mas58express.com        →  p=MIGfMA0GCSqGSIb3…   (DKIM)
 *   resend._domainkey.send.mas58express.com   →  NO EXISTE
 *   send.mas58express.com  TXT                →  v=spf1 include:amazonses.com ~all
 *   send.mas58express.com  MX                 →  feedback-smtp.eu-west-1.amazonses.com
 *   mas58express.com       TXT                →  v=spf1 -all
 *
 * Es decir: el dominio dado de alta en Resend es **el apex**, y `send.` es sólo
 * su Return-Path —por donde vuelven los rebotes—, no un dominio de envío. Firmar
 * DKIM como `mas58express.com` y poner en el `From:` otro dominio habría hecho
 * que Resend rechazara el envío, porque ese otro no está verificado.
 *
 * Y el `v=spf1 -all` del apex no estorba: SPF se evalúa contra el remitente del
 * sobre, que es `send.mas58express.com`, no contra el `From:` que ve la persona.
 * La alineación de DMARC la da el DKIM, que sí firma como el apex.
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

/** El dominio verificado en Resend. Nada que no termine así puede enviarse. */
export const DOMINIO_REMITENTE = "mas58express.com";

function remitente(): string {
  return process.env.EMAIL_FROM || `+58Express <no-reply@${DOMINIO_REMITENTE}>`;
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
