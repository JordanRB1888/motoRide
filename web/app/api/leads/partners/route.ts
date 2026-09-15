import { PARTNER_LEADS_ENABLED } from "@/lib/flags";
import { hayAlmacen, repositorioWeb } from "@/lib/datos";
import { EMAIL } from "@/lib/contact";
import { correoAcuseAliado, correoAvisoInterno } from "@/lib/correo/plantillas";
import { correoConfigurado, enviarCorreo } from "@/lib/correo/enviar";
import { LIMITES, superaLimite } from "@/lib/seguridad/limites";
import { huellaDeIp, ipDeLaPeticion } from "@/lib/seguridad/testigos";
import { verificarTurnstile } from "@/lib/seguridad/turnstile";
import { pareceRobot, validarLeadAliado } from "@/lib/seguridad/validacion";
import {
  json,
  leerCuerpo,
  metodoNoPermitido,
  noExiste,
  origenValido,
  tipoDeContenidoValido,
} from "@/lib/seguridad/peticion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Un comercio pide que le contacten.
 *
 * No es un alta: el producto de comercios no existe todavía en el backend, y
 * fingir un onboarding sería prometer algo que no hay. Esto recoge el interés,
 * avisa al equipo y responde con un acuse honesto que **no compromete plazo**.
 *
 * Mismas guardas que la lista de espera, y por las mismas razones.
 */
export async function POST(peticion: Request): Promise<Response> {
  if (!PARTNER_LEADS_ENABLED) return noExiste();

  if (!origenValido(peticion) || !tipoDeContenidoValido(peticion)) {
    return json({ error: "PETICION_NO_VALIDA" }, 400);
  }

  const lectura = await leerCuerpo(peticion);
  if (!lectura.ok) {
    return json(
      { error: lectura.motivo === "DEMASIADO_GRANDE" ? "CUERPO_DEMASIADO_GRANDE" : "VALIDACION" },
      400,
    );
  }

  const validado = validarLeadAliado(lectura.cuerpo);
  if (!validado.ok) return json({ error: validado.error, fallos: validado.fallos }, 400);
  const datos = validado.datos;

  const ahora = Date.now();
  if (pareceRobot(datos.trampa, datos.abiertoEn, ahora)) {
    return json({ estado: "recibido" }, 201);
  }

  if (!hayAlmacen()) return json({ error: "NO_DISPONIBLE" }, 503);

  const ip = ipDeLaPeticion(peticion.headers);
  const ipHash = huellaDeIp(ip, process.env.IP_HASH_SALT);

  // Mismo envoltorio y mismo motivo que en la lista de espera: la base puede
  // fallar, y un 500 de Next no es una respuesta que este formulario pueda dar.
  let lead;
  try {
    const repo = repositorioWeb();

    if (ipHash && (await superaLimite(repo, `aliados:${ipHash}`, LIMITES.aliadosPorIp, ahora))) {
      return json({ error: "DEMASIADAS_PETICIONES" }, 429);
    }

    const turnstile = await verificarTurnstile(datos.turnstileToken, ip || null);
    if (!turnstile.valido) {
      const estado = turnstile.motivo === "SIN_CONFIGURAR" ? 503 : 400;
      return json({ error: estado === 503 ? "NO_DISPONIBLE" : "TURNSTILE_INVALIDO" }, estado);
    }

    lead = await repo.crearLeadAliado({
      nombre: datos.nombre,
      negocio: datos.negocio,
      telefono: datos.telefono,
      email: datos.email,
      municipio: datos.municipio,
      tipoComercio: datos.tipoComercio,
      mensaje: datos.mensaje,
      // CUÁNDO consintió. Un booleano no prueba nada el día que haga falta.
      consentimientoEn: new Date(ahora).toISOString(),
      ipHash,
    });
  } catch (error) {
    console.error("[aliados] almacén:", (error as Error).message);
    return json({ error: "NO_DISPONIBLE" }, 503);
  }

  try {
    if (correoConfigurado()) {
      // Acuse al comercio y aviso al equipo. El aviso NO lleva la IP: para
      // atender a alguien no hace falta saber desde dónde escribió.
      await enviarCorreo(lead.email, correoAcuseAliado(lead.nombre, lead.negocio));
      await enviarCorreo(
        process.env.EMAIL_EQUIPO || EMAIL.direccion,
        correoAvisoInterno({
          nombre: lead.nombre,
          negocio: lead.negocio,
          telefono: lead.telefono,
          email: lead.email,
          municipio: lead.municipio,
          tipoComercio: lead.tipoComercio,
          mensaje: lead.mensaje,
        }),
      );
    }
  } catch (error) {
    /* El interés quedó guardado, que es lo que importa: el equipo lo verá en la
       tabla aunque el aviso por correo no haya salido. */
    console.error("[aliados] correo:", (error as Error).message);
  }

  return json({ estado: "recibido" }, 201);
}

/** Mismo motivo que en `/api/waitlist`: con el interruptor apagado, 404 y no 405. */
export async function GET(): Promise<Response> {
  if (!PARTNER_LEADS_ENABLED) return noExiste();
  return metodoNoPermitido("POST");
}
