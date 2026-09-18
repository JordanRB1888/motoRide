import { WAITLIST_ENABLED } from "@/lib/flags";
import { hayAlmacen, repositorioWeb } from "@/lib/datos";
import { metodoNoPermitido, noExiste } from "@/lib/seguridad/peticion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Segundo paso del doble consentimiento: quien pulsa el enlace del correo.
 *
 * Siempre termina en `/gracias` con una palabra de estado en la URL —nunca el
 * correo, ni el testigo, ni un identificador—. Una dirección en la barra del
 * navegador acaba en el historial, en los registros del servidor y en el
 * `Referer` de la siguiente petición.
 *
 * Nunca se enseña un error técnico: quien abre este enlace no ha hecho nada mal
 * aunque el testigo haya caducado.
 */
function aGracias(estado: string, base: URL): Response {
  const destino = new URL("/gracias", base);
  destino.searchParams.set("estado", estado);
  return Response.redirect(destino, 302);
}

export async function GET(peticion: Request): Promise<Response> {
  if (!WAITLIST_ENABLED) return noExiste();

  const url = new URL(peticion.url);
  const token = url.searchParams.get("token") ?? "";

  if (!token || !hayAlmacen()) return aGracias("invalido", url);

  try {
    const repo = repositorioWeb();
    const registro = await repo.buscarPorTokenConfirmacion(token);

    /* Sin registro pueden estar pasando dos cosas: el enlace es falso, o ya se
       usó —al confirmar, el testigo se quema—. Se responde igual en los dos casos:
       distinguirlos diría a un desconocido si ese testigo existió alguna vez. */
    if (!registro) return aGracias("invalido", url);

    if (registro.estado === "confirmado") return aGracias("ya_confirmado", url);
    if (registro.estado === "baja") return aGracias("invalido", url);

    const caducado =
      !registro.tokenExpiraEn || new Date(registro.tokenExpiraEn).getTime() < Date.now();

    if (caducado) {
      await repo.caducarEnEspera(registro.id);
      return aGracias("expirado", url);
    }

    await repo.confirmarEnEspera(registro.id);
    return aGracias("confirmado", url);
  } catch (error) {
    /* Si la base tropieza, el estado es `error` y NO `invalido`. La diferencia
       importa: «este enlace no vale» le dice a alguien con un enlace perfecto
       que se rinda, cuando lo único que pasa es que hay que volver a pulsarlo
       dentro de un rato. Y el testigo no se ha gastado. */
    console.error("[confirmar] almacén:", (error as Error).message);
    return aGracias("error", url);
  }
}

/** Mismo criterio que en `/api/waitlist`: apagado, 404; encendido, 405. */
export async function POST(): Promise<Response> {
  if (!WAITLIST_ENABLED) return noExiste();
  return metodoNoPermitido("GET");
}
