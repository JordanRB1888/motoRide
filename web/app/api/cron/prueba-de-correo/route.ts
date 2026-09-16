import { testigosIguales } from "@/lib/seguridad/testigos";
import { json, noExiste } from "@/lib/seguridad/peticion";
import { DOMINIO_REMITENTE, correoConfigurado, enviarCorreo } from "@/lib/correo/enviar";
import type { Correo } from "@/lib/correo/plantillas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Certificar Resend desde dentro de producción. Nada más.
 *
 * POR QUÉ HACE FALTA UNA RUTA Y NO UN GUION LOCAL
 *
 * `RESEND_API_KEY` está guardada en Vercel como **Secret**, y un Secret no se
 * devuelve nunca: ni al panel, ni a `vercel env pull`, ni a `vercel env run`.
 * Eso es exactamente lo que se quiso al guardarla así, y no se va a deshacer
 * para hacer una prueba. Pero significa que la única máquina capaz de usar esa
 * clave es el propio despliegue de producción. Por eso la prueba vive aquí.
 *
 * La alternativa —encender la lista de espera «a ver si llega el correo»— es
 * inaceptable: publicaría una superficie que recoge datos personales antes de
 * saber si el doble consentimiento funciona. Primero se certifica el envío;
 * después se enciende el formulario.
 *
 * POR QUÉ ESTO NO ES UN ENDPOINT PÚBLICO
 *
 *   · **apagada por omisión.** No se guarda por `CRON_SECRET` —que dispara el
 *     borrado por retención y no tiene por qué compartir llave con esto— sino
 *     por `PRUEBA_CORREO_TOKEN`, una variable que normalmente NO EXISTE. Sin
 *     ella, aquí no hay ruta: 404 y punto, igual que hacen los interruptores de
 *     los formularios. Se crea para correr la prueba y se borra después, de
 *     modo que el estado de reposo de este fichero es «inerte»;
 *   · cuando existe, exige `Authorization: Bearer $PRUEBA_CORREO_TOKEN`,
 *     comparado en tiempo constante, y quien no acierte recibe **404**, no 401:
 *     un 401 confirmaría que la ruta está ahí;
 *   · **el destinatario está escrito aquí dentro**. La petición no aporta ni una
 *     letra del correo: ni destino, ni asunto, ni cuerpo. Aunque el testigo se
 *     filtrara, esto no es un relé abierto — lo único que se puede provocar es
 *     un mensaje idéntico al buzón del propio equipo;
 *   · no está en el sitemap, no está enlazada, y NO está en `vercel.json`, así
 *     que ningún cron la dispara. Sólo se ejecuta si alguien la llama a mano.
 *
 * QUÉ NO HACE: no imprime la clave, no la devuelve, no la registra. De la
 * respuesta de Resend se conserva todo menos ella.
 */

/** Escrito aquí, no en la petición. Es lo que impide que esto sea un relé. */
const DESTINO = "58expressapp@gmail.com";
const ASUNTO = "Prueba técnica +58Express — Resend";

function correoDePrueba(cuando: string): Correo {
  const texto = [
    "Prueba técnica del sistema de correo de la web de +58Express.",
    "",
    `Enviado: ${cuando}`,
    "",
    "Este mensaje lo genera una comprobación interna para verificar que Resend",
    "entrega de verdad en el buzón antes de publicar la lista de espera.",
    "No requiere ninguna acción y no contiene datos de ninguna persona.",
  ].join("\n");

  /* Sin <img>, sin <a>, sin nada que cargue desde fuera: no hay apertura que
     contar ni clic que rastrear, que es la misma regla que siguen las plantillas
     de verdad. Estilos en línea porque los clientes de correo tiran las hojas. */
  const html =
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<title>${ASUNTO}</title></head>` +
    `<body style="margin:0;padding:24px;background:#f7f6f3;">` +
    `<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;` +
    `font:400 16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0b0b0c;">` +
    `<p style="margin:0 0 14px 0;"><strong>Prueba técnica del sistema de correo de la web de +58Express.</strong></p>` +
    `<p style="margin:0 0 14px 0;">Enviado: ${cuando}</p>` +
    `<p style="margin:0;color:#57544e;">Este mensaje lo genera una comprobación interna para verificar que ` +
    `Resend entrega de verdad en el buzón antes de publicar la lista de espera. No requiere ninguna acción ` +
    `y no contiene datos de ninguna persona.</p>` +
    `</div></body></html>`;

  return { asunto: ASUNTO, html, texto };
}

/**
 * ¿Existe el testigo y lo trae quien llama?
 *
 * Las dos negativas dan el mismo `false`, y arriba se traduce en el mismo 404:
 * quien pruebe no puede distinguir «esta ruta está desarmada» de «has fallado
 * el testigo», que es justo lo que interesa que no pueda distinguir.
 */
function autorizada(peticion: Request): boolean {
  const testigo = process.env.PRUEBA_CORREO_TOKEN;
  if (!testigo) return false;
  return testigosIguales(peticion.headers.get("authorization") ?? "", `Bearer ${testigo}`);
}

/** El remitente tal y como lo resuelve el envío real, sin duplicar la lógica. */
function remitenteEfectivo(): string {
  return process.env.EMAIL_FROM || `+58Express <no-reply@${DOMINIO_REMITENTE}>`;
}

/**
 * Diagnóstico que NO envía nada.
 *
 * Pregunta a Resend por los dominios del propietario de la clave. Sirve para
 * distinguir dos cosas que se confunden con facilidad: que la clave autentique
 * y que el dominio esté verificado. Una clave de «Sending access» contesta 401
 * o 403 aquí y 200 al enviar; en ese caso el estado del dominio se queda en
 * desconocido, y así se dice, en vez de inventarlo.
 */
export async function GET(peticion: Request): Promise<Response> {
  if (!autorizada(peticion)) return noExiste();

  const clave = process.env.RESEND_API_KEY;
  if (!clave) {
    return json({ configurada: false, remitente: remitenteEfectivo(), dominios: null }, 200);
  }

  let consulta: { http: number; dominios: unknown; error: string | null };
  try {
    const r = await fetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${clave}` },
      signal: AbortSignal.timeout(10_000),
    });
    const crudo = await r.text();
    let cuerpo: unknown = null;
    try {
      cuerpo = JSON.parse(crudo);
    } catch {
      cuerpo = null;
    }
    const datos = (cuerpo as { data?: unknown[] } | null)?.data;
    consulta = {
      http: r.status,
      dominios: Array.isArray(datos)
        ? datos.map((d) => {
            const dom = d as Record<string, unknown>;
            return { name: dom.name, status: dom.status, region: dom.region, created_at: dom.created_at };
          })
        : null,
      error: r.ok
        ? null
        : ((cuerpo as { message?: string } | null)?.message ??
          /* Nunca puede contener la clave, pero se recorta y se limpia igual. */
          crudo.replace(clave, "«oculta»").slice(0, 200)),
    };
  } catch (error) {
    consulta = { http: 0, dominios: null, error: (error as Error).message };
  }

  return json(
    {
      configurada: correoConfigurado(),
      remitente: remitenteEfectivo(),
      dominioEsperado: DOMINIO_REMITENTE,
      consultaDeDominios: consulta,
    },
    200,
  );
}

/**
 * UN correo de prueba al buzón del equipo.
 *
 * Es `POST` y no `GET` a propósito: tiene un efecto que no se deshace. Y usa
 * `enviarCorreo()`, el mismo camino exacto que recorrerá la lista de espera
 * —mismo remitente, mismas cabeceras, misma API—, porque probar un camino
 * distinto del que se va a publicar no prueba nada.
 *
 * El `fetch` va envuelto sólo para poder contar qué contestó Resend: el código
 * HTTP y el cuerpo. `enviarCorreo()` los resume en «aceptado» o «rechazado», y
 * para certificar hace falta el detalle.
 */
export async function POST(peticion: Request): Promise<Response> {
  if (!autorizada(peticion)) return noExiste();

  if (!correoConfigurado()) {
    return json({ enviado: false, motivo: "SIN_CONFIGURAR" }, 200);
  }

  const cuando = new Date().toISOString();
  const observado: { http: number | null; cuerpo: string | null } = { http: null, cuerpo: null };

  const espia: typeof fetch = async (entrada, opciones) => {
    const r = await fetch(entrada, opciones);
    const crudo = await r.clone().text();
    observado.http = r.status;
    const clave = process.env.RESEND_API_KEY ?? "";
    observado.cuerpo = (clave ? crudo.replaceAll(clave, "«oculta»") : crudo).slice(0, 400);
    return r;
  };

  const resultado = await enviarCorreo(DESTINO, correoDePrueba(cuando), espia);

  console.log(
    `[prueba-de-correo] http=${observado.http} enviado=${resultado.enviado} ` +
      `id=${resultado.enviado ? (resultado.id ?? "sin-id") : "-"}`,
  );

  return json(
    {
      cuando,
      remitente: remitenteEfectivo(),
      destino: DESTINO,
      asunto: ASUNTO,
      enviado: resultado.enviado,
      id: resultado.enviado ? resultado.id : null,
      motivo: resultado.enviado ? null : resultado.motivo,
      http: observado.http,
      respuesta: observado.cuerpo,
      /* Que Resend lo acepte NO es que haya llegado. Lo dice la respuesta misma
         para que nadie lo lea como una certificación de entrega. */
      aviso: "ACEPTADO_NO_ES_ENTREGADO: sólo el buzón lo confirma.",
    },
    200,
  );
}
