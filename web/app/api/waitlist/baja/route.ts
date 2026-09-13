import { WAITLIST_ENABLED } from "@/lib/flags";
import { hayAlmacen, repositorioWeb } from "@/lib/datos";
import { correoBaja } from "@/lib/correo/plantillas";
import { correoConfigurado, enviarCorreo } from "@/lib/correo/enviar";
import { noExiste } from "@/lib/seguridad/peticion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salir de la lista.
 *
 * Sin identificarse y sin fricción: el testigo de baja del correo basta. Pedir
 * una contraseña para dejar de recibir un correo es una forma elegante de no
 * dejar que la gente se vaya, y además estas direcciones no tienen cuenta.
 *
 * El testigo de baja es DISTINTO del de confirmación a propósito: si fuera el
 * mismo, el enlace de «darme de baja» confirmaría la inscripción de quien nunca
 * la quiso — justo lo contrario de lo que pidió.
 */
function aBaja(estado: string, base: URL): Response {
  const destino = new URL("/baja", base);
  destino.searchParams.set("estado", estado);
  return Response.redirect(destino, 302);
}

export async function GET(peticion: Request): Promise<Response> {
  if (!WAITLIST_ENABLED) return noExiste();

  const url = new URL(peticion.url);
  const token = url.searchParams.get("token") ?? "";

  if (!token || !hayAlmacen()) return aBaja("invalido", url);

  const repo = repositorioWeb();
  const registro = await repo.buscarPorTokenBaja(token);
  if (!registro) return aBaja("invalido", url);

  if (registro.estado === "baja") return aBaja("ya_baja", url);

  await repo.darDeBajaEnEspera(registro.id);

  /* Un acuse de la baja. Es el último correo que se le manda, y existe para que
     quede constancia por si la baja no la pidió quien tiene el buzón. */
  if (correoConfigurado()) {
    await enviarCorreo(registro.email, correoBaja());
  }

  return aBaja("baja", url);
}
