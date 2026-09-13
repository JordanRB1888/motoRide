import { WAITLIST_ENABLED } from "@/lib/flags";
import { hayAlmacen, repositorioWeb } from "@/lib/datos";
import { correoConfirmacion } from "@/lib/correo/plantillas";
import { correoConfigurado, enviarCorreo } from "@/lib/correo/enviar";
import { LIMITES, envioDemasiadoReciente, superaLimite } from "@/lib/seguridad/limites";
import {
  ipDeLaPeticion,
  huellaDeIp,
  nuevoTestigo,
  VIGENCIA_CONFIRMACION_MS,
} from "@/lib/seguridad/testigos";
import { verificarTurnstile } from "@/lib/seguridad/turnstile";
import { pareceRobot, validarWaitlist } from "@/lib/seguridad/validacion";
import { json, leerCuerpo, noExiste, origenValido, tipoDeContenidoValido } from "@/lib/seguridad/peticion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alta en la lista de espera.
 *
 * EL PRINCIPIO QUE ORDENA TODO ESTE FICHERO: la respuesta **no revela** si una
 * dirección concreta está o no en la lista. Da igual si el correo es nuevo o ya
 * estaba: se responde igual de bien. Distinguirlo convertiría el formulario en
 * un buscador de quién se ha apuntado — que es una fuga de datos personales
 * disfrazada de detalle de interfaz.
 *
 * Orden de las comprobaciones, de la más barata a la más cara: interruptor →
 * origen → tipo → tamaño → validación → robot → límite → Turnstile → almacén.
 * Turnstile va tarde a propósito: es una llamada de red y no se gasta en una
 * petición que ya se sabe mala.
 */
export async function POST(peticion: Request): Promise<Response> {
  if (!WAITLIST_ENABLED) return noExiste();

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

  const validado = validarWaitlist(lectura.cuerpo);
  if (!validado.ok) return json({ error: validado.error, fallos: validado.fallos }, 400);
  const datos = validado.datos;

  const ahora = Date.now();

  /* Un robot recibe la misma respuesta que alguien legítimo. Decirle «te he
     pillado» sólo le enseña qué cambiar en el siguiente intento. */
  if (pareceRobot(datos.trampa, datos.abiertoEn, ahora)) {
    return json({ estado: "pendiente" }, 201);
  }

  if (!hayAlmacen()) return json({ error: "NO_DISPONIBLE" }, 503);
  const repo = repositorioWeb();

  const ip = ipDeLaPeticion(peticion.headers);
  const ipHash = huellaDeIp(ip, process.env.IP_HASH_SALT);

  if (ipHash && (await superaLimite(repo, `waitlist:${ipHash}`, LIMITES.waitlistPorIp, ahora))) {
    return json({ error: "DEMASIADAS_PETICIONES" }, 429);
  }

  const turnstile = await verificarTurnstile(datos.turnstileToken, ip || null);
  if (!turnstile.valido) {
    const estado = turnstile.motivo === "SIN_CONFIGURAR" ? 503 : 400;
    return json({ error: estado === 503 ? "NO_DISPONIBLE" : "TURNSTILE_INVALIDO" }, estado);
  }

  const alta = await repo.altaEnEspera({
    email: datos.email,
    rol: datos.rol,
    zona: datos.zona,
    origen: datos.origen,
    ipHash,
    tokenConfirmacion: nuevoTestigo(),
    tokenExpiraEn: new Date(ahora + VIGENCIA_CONFIRMACION_MS).toISOString(),
    tokenBaja: nuevoTestigo(),
  });

  /* Se manda el correo de confirmación en dos casos: cuando el alta es nueva, y
     cuando ya existía pero sigue sin confirmar —ahí el correo anterior pudo
     perderse—. A quien YA confirmó no se le vuelve a escribir. El límite por
     dirección evita que esto se use para bombardear un buzón ajeno. */
  const meritaCorreo =
    alta.creado || alta.registro.estado === "pendiente" || alta.registro.estado === "caducado";

  if (meritaCorreo && correoConfigurado() && !(await envioDemasiadoReciente(repo, datos.email, ahora))) {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mas58express.com";
    const correo = correoConfirmacion(
      `${base}/api/waitlist/confirmar?token=${encodeURIComponent(alta.registro.tokenConfirmacion ?? "")}`,
      `${base}/api/waitlist/baja?token=${encodeURIComponent(alta.registro.tokenBaja ?? "")}`,
    );
    const envio = await enviarCorreo(datos.email, correo);
    if (envio.enviado) await repo.registrarEnvioDeConfirmacion(datos.email, new Date(ahora).toISOString());
  }

  /* UNA SOLA RESPUESTA, siempre la misma.
   *
   * El encargo describía `201 pendiente` para un alta nueva y `200
   * ya_registrado` para una repetida, y a la vez exigía —en mayúsculas— no
   * revelar si una dirección pertenece a la lista. Las dos cosas no caben: dos
   * respuestas distintas convierten este formulario en un buscador de quién se
   * ha apuntado, probando direcciones una a una.
   *
   * Gana el principio. `alta.creado` se sigue distinguiendo por dentro —de él
   * depende si se manda correo— pero fuera no se nota. Si algún día se decide
   * que la enumeración es aceptable, el cambio es esta línea. */
  void alta.creado;
  return json({ estado: "pendiente" }, 201);
}
