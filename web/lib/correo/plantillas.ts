import { EMAIL, WHATSAPP } from "@/lib/contact";

/**
 * Las tres plantillas de correo.
 *
 * Decisiones que las gobiernan:
 *
 *  · **Nada de rastreo.** Ni píxel de apertura, ni enlaces envueltos para contar
 *    clics. Un correo que avisa de un lanzamiento no necesita saber quién lo
 *    abrió, y meter un píxel invisible en el primer mensaje que alguien recibe
 *    de la marca es exactamente el tipo de cosa que esta web decidió no hacer.
 *  · **Estilos en línea.** Gmail y Outlook descartan las hojas de estilo; lo que
 *    no va en el atributo `style` no existe.
 *  · **Una sola columna, 600 px.** Es lo único que se ve bien en todos los
 *    clientes, y en un teléfono venezolano es lo que hay.
 *  · **Texto alternativo siempre.** Un correo sólo-HTML acaba en spam más a
 *    menudo, y hay quien lee en texto plano.
 */

const GRAFITO = "#0b0b0c";
const SUPERFICIE = "#141417";
const AMARILLO = "#fcb000";
const PAPEL = "#f7f6f3";
const TENUE = "#b9b7b1";

function envoltorio(titulo: string, contenido: string, pie: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${titulo}</title></head>
<body style="margin:0;padding:0;background:${GRAFITO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GRAFITO};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${SUPERFICIE};border-radius:18px;overflow:hidden;">
  <tr><td style="padding:36px 32px 0 32px;">
    <p style="margin:0;font:700 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:${AMARILLO};">+58Express</p>
  </td></tr>
  <tr><td style="padding:24px 32px 8px 32px;">${contenido}</td></tr>
  <tr><td style="padding:28px 32px 36px 32px;border-top:1px solid rgba(255,255,255,.08);">
    ${pie}
  </td></tr>
</table>
<p style="margin:20px 0 0 0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#6f6d69;">
  +58Express · Maracaibo y Municipio Mara, estado Zulia
</p>
</td></tr></table></body></html>`;
}

const h1 = (t: string) =>
  `<h1 style="margin:0 0 16px 0;font:700 28px/1.15 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${PAPEL};">${t}</h1>`;

const p = (t: string) =>
  `<p style="margin:0 0 14px 0;font:400 16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TENUE};">${t}</p>`;

const boton = (href: string, texto: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px 0;"><tr>
    <td style="background:${AMARILLO};border-radius:999px;">
      <a href="${href}" style="display:inline-block;padding:15px 30px;font:700 16px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${GRAFITO};text-decoration:none;">${texto}</a>
    </td></tr></table>`;

const menudo = (t: string) =>
  `<p style="margin:0 0 8px 0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#8d8b87;">${t}</p>`;

export type Correo = { asunto: string; html: string; texto: string };

/** A · Confirmación de la lista de espera. */
export function correoConfirmacion(urlConfirmar: string, urlBaja: string): Correo {
  return {
    asunto: "Confirma que quieres el aviso de +58Express",
    html: envoltorio(
      "Confirma tu correo",
      h1("Un toque y listo") +
        p("Pediste que te avisáramos cuando +58Express esté disponible en tu zona. Confirma que este correo es tuyo y no volvemos a escribirte hasta ese día.") +
        boton(urlConfirmar, "Sí, avísenme") +
        menudo("El enlace caduca en 48 horas."),
      menudo(`Si no fuiste tú, ignora este mensaje: sin confirmar, no te escribimos. También puedes <a href="${urlBaja}" style="color:${TENUE};">salir de la lista</a>.`) +
        menudo(`¿Dudas? Escríbenos a ${EMAIL.direccion} o por WhatsApp al ${WHATSAPP.visible}.`),
    ),
    texto: [
      "Un toque y listo",
      "",
      "Pediste que te avisáramos cuando +58Express esté disponible en tu zona.",
      "Confirma que este correo es tuyo:",
      urlConfirmar,
      "",
      "El enlace caduca en 48 horas.",
      "Si no fuiste tú, ignora este mensaje: sin confirmar, no te escribimos.",
      `Salir de la lista: ${urlBaja}`,
      "",
      `+58Express · ${EMAIL.direccion} · ${WHATSAPP.visible}`,
    ].join("\n"),
  };
}

/** B · Confirmación de la baja. */
export function correoBaja(): Correo {
  return {
    asunto: "Saliste de la lista de +58Express",
    html: envoltorio(
      "Baja confirmada",
      h1("Listo, no te escribimos más") +
        p("Saliste de la lista de espera de +58Express. No recibirás el aviso de lanzamiento ni ningún otro correo nuestro.") +
        p("Si fue un error, puedes volver a apuntarte cuando quieras desde la web."),
      menudo(`Si necesitas algo, seguimos en ${EMAIL.direccion} y en WhatsApp al ${WHATSAPP.visible}.`),
    ),
    texto: [
      "Listo, no te escribimos más",
      "",
      "Saliste de la lista de espera de +58Express.",
      "Si fue un error, puedes volver a apuntarte desde la web cuando quieras.",
      "",
      `+58Express · ${EMAIL.direccion} · ${WHATSAPP.visible}`,
    ].join("\n"),
  };
}

/** C · Acuse de recibo a un comercio. */
export function correoAcuseAliado(nombre: string, negocio: string): Correo {
  return {
    asunto: "Recibimos tu mensaje — +58Express",
    html: envoltorio(
      "Recibimos tu mensaje",
      h1("Recibimos lo tuyo") +
        p(`Hola ${escapar(nombre)}: nos llegó tu interés en llevar <strong style="color:${PAPEL};">${escapar(negocio)}</strong> a +58Express.`) +
        p("Alguien del equipo lo revisa y se pone en contacto contigo. Todavía no comprometemos un plazo: preferimos no prometer una fecha antes de poder cumplirla.") +
        p("Si mientras tanto quieres adelantar algo, respóndenos a este correo o escríbenos por WhatsApp."),
      menudo(`${EMAIL.direccion} · WhatsApp ${WHATSAPP.visible}`),
    ),
    texto: [
      "Recibimos lo tuyo",
      "",
      `Hola ${nombre}: nos llegó tu interés en llevar ${negocio} a +58Express.`,
      "Alguien del equipo lo revisa y se pone en contacto contigo.",
      "Todavía no comprometemos un plazo.",
      "",
      `+58Express · ${EMAIL.direccion} · ${WHATSAPP.visible}`,
    ].join("\n"),
  };
}

/** D · Aviso interno al equipo. Sin IP: no hace falta para atender a nadie. */
export function correoAvisoInterno(lead: {
  nombre: string;
  negocio: string;
  telefono: string;
  email: string;
  municipio: string;
  tipoComercio: string;
  mensaje: string | null;
}): Correo {
  const fila = (k: string, v: string) =>
    `<tr><td style="padding:6px 12px 6px 0;font:400 14px/1.5 -apple-system,Arial,sans-serif;color:#8d8b87;white-space:nowrap;">${k}</td>` +
    `<td style="padding:6px 0;font:600 14px/1.5 -apple-system,Arial,sans-serif;color:${PAPEL};">${escapar(v)}</td></tr>`;

  return {
    asunto: `Nuevo aliado interesado: ${lead.negocio}`,
    html: envoltorio(
      "Nuevo aliado interesado",
      h1("Un comercio quiere entrar") +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0 0;">
          ${fila("Nombre", lead.nombre)}${fila("Negocio", lead.negocio)}
          ${fila("Teléfono", lead.telefono)}${fila("Correo", lead.email)}
          ${fila("Municipio", lead.municipio)}${fila("Tipo", lead.tipoComercio)}
        </table>` +
        (lead.mensaje ? p(`<em>«${escapar(lead.mensaje)}»</em>`) : ""),
      menudo("Aviso automático de la web pública."),
    ),
    texto: [
      "Un comercio quiere entrar",
      "",
      `Nombre:    ${lead.nombre}`,
      `Negocio:   ${lead.negocio}`,
      `Teléfono:  ${lead.telefono}`,
      `Correo:    ${lead.email}`,
      `Municipio: ${lead.municipio}`,
      `Tipo:      ${lead.tipoComercio}`,
      lead.mensaje ? `\nMensaje:\n${lead.mensaje}` : "",
    ].join("\n"),
  };
}

/** Lo que escribe un desconocido no entra en una plantilla sin escapar. */
export function escapar(s: string): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
