import { WAITLIST_ENABLED } from "@/lib/flags";
import { hayAlmacen, repositorioWeb } from "@/lib/datos";
import { correoBaja } from "@/lib/correo/plantillas";
import { correoConfigurado, enviarCorreo } from "@/lib/correo/enviar";
import { metodoNoPermitido, noExiste } from "@/lib/seguridad/peticion";

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

  let registro;
  try {
    const repo = repositorioWeb();
    registro = await repo.buscarPorTokenBaja(token);
    if (!registro) return aBaja("invalido", url);

    if (registro.estado === "baja") return aBaja("ya_baja", url);

    await repo.darDeBajaEnEspera(registro.id);
  } catch (error) {
    /* Aquí `error` en vez de `invalido` pesa todavía más que al confirmar:
       decirle «este enlace no vale» a quien intenta dejar de recibir correos es
       la forma más rápida de que marque el siguiente como spam. */
    console.error("[baja] almacén:", (error as Error).message);
    return aBaja("error", url);
  }

  /* Un acuse de la baja. Es el último correo que se le manda, y existe para que
     quede constancia por si la baja no la pidió quien tiene el buzón. */
  try {
    if (correoConfigurado()) {
      await enviarCorreo(registro.email, correoBaja());
    }
  } catch (error) {
    // La baja está hecha, que es lo que pidió. El acuse es cortesía.
    console.error("[baja] correo:", (error as Error).message);
  }

  return aBaja("baja", url);
}

/** Mismo criterio que en `/api/waitlist`: apagado, 404; encendido, 405. */
export async function POST(): Promise<Response> {
  if (!WAITLIST_ENABLED) return noExiste();
  return metodoNoPermitido("GET");
}
