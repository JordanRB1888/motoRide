import { hayAlmacen, repositorioWeb } from "@/lib/datos";
import { testigosIguales } from "@/lib/seguridad/testigos";
import { json, noExiste } from "@/lib/seguridad/peticion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El borrado por retención, una vez al día.
 *
 * POR QUÉ EXISTE ESTA RUTA
 *
 * La política de privacidad publicada promete tres plazos: 30 días para las
 * altas sin confirmar, 12 meses para los contactos de comercios y 24 horas para
 * los registros del limitador. **Una promesa de borrado que nadie ejecuta es
 * peor que no haberla hecho**: convierte un documento legal en una declaración
 * falsa. Esto la cumple.
 *
 * POR QUÉ UN CRON DE VERCEL Y NO OTRA COSA
 *
 * Porque no añade ningún servicio ni ningún coste: el cron ya viene con el
 * proyecto. La alternativa seria era `pg_cron` dentro de Supabase —que además no
 * expondría ninguna ruta—, pero dejaría la lógica en SQL, fuera del repositorio
 * y fuera del alcance de las pruebas. Aquí el borrado vive en el mismo
 * repositorio que todo lo demás, se prueba con fechas simuladas contra la base
 * real, y esta ruta es sólo el disparador.
 *
 * CÓMO ESTÁ PROTEGIDA, Y POR QUÉ ASÍ
 *
 * Vercel envía `Authorization: Bearer $CRON_SECRET` en cada ejecución. Se
 * comprueba con una comparación en tiempo constante, y:
 *
 *   · **sin `CRON_SECRET` configurada, no se ejecuta nada.** Una configuración a
 *     medias no puede convertirse en una puerta abierta que cualquiera use para
 *     provocar borrados;
 *   · quien no acierte recibe **404, no 401**. Un 401 confirma que la ruta
 *     existe; un 404 no dice nada. La ruta no aparece en el sitemap ni está
 *     enlazada desde ninguna parte.
 *
 * El secreto vive sólo en el servidor: no lleva el prefijo `NEXT_PUBLIC_`, así
 * que jamás viaja al navegador, y esta ruta se ejecuta en Node, nunca en el
 * cliente.
 *
 * QUÉ SE REGISTRA: tres números. Ni un correo, ni un identificador, ni una IP.
 */
export async function GET(peticion: Request): Promise<Response> {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return noExiste();

  const recibido = peticion.headers.get("authorization") ?? "";
  if (!testigosIguales(recibido, `Bearer ${secreto}`)) return noExiste();

  if (!hayAlmacen()) return json({ error: "NO_DISPONIBLE" }, 503);

  try {
    const resultado = await repositorioWeb().purgarPorRetencion(Date.now());
    // Sólo cuentas. Es lo único que hace falta para saber que funcionó.
    console.log(
      `[retencion] espera=${resultado.esperaEliminadas} aliados=${resultado.aliadosEliminados} intentos=${resultado.intentosEliminados}`,
    );
    return json({ ok: true, ...resultado }, 200);
  } catch (error) {
    console.error("[retencion] almacén:", (error as Error).message);
    return json({ error: "NO_DISPONIBLE" }, 503);
  }
}
