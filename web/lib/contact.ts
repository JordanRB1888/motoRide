/**
 * Canales de contacto de +58Express — fuente única.
 *
 * Antes de esto el sitio no tenía NINGUNA forma de hablar con la empresa: ni
 * correo, ni teléfono, ni WhatsApp, en ninguna de las diez páginas. Estos datos
 * viven aquí y sólo aquí: repetirlos por los componentes garantiza que algún día
 * uno se quede viejo.
 *
 * REGLA: aquí no entra un dato que no esté confirmado por el dueño. Un canal sin
 * confirmar se queda apagado (`activo: false`) y sencillamente no se pinta.
 */

/** Número de atención, confirmado por el dueño el 13/09/2026. */
const WHATSAPP_E164 = "584125143242";

export const WHATSAPP = {
  activo: true,
  /** Formato que exige wa.me: código de país, sin «+», sin espacios ni guiones. */
  e164: WHATSAPP_E164,
  /** Cómo se le enseña a una persona. */
  visible: "+58 412-514-3242",
} as const;

/**
 * Correo público. Es una dirección de Gmail a propósito: el dominio todavía no
 * tiene MX, así que publicar `hola@mas58express.com` sería publicar un buzón
 * que no existe y perder cada mensaje. El plan para el correo propio está en
 * `agent-reports/public-website-phase-0.md`.
 */
export const EMAIL = {
  activo: true,
  direccion: "58expressapp@gmail.com",
} as const;

/**
 * Redes sociales.
 *
 * El dueño confirmó que existen (TikTok, Instagram y Facebook como «+58Express»),
 * pero «+58Express» es el nombre visible, no el usuario: el signo «+» no es válido
 * en un identificador de ninguna de las tres. Las tres plataformas responden 200 a
 * CUALQUIER usuario inventado —son muros de acceso—, así que no se pueden verificar
 * por HTTP y enlazar a un usuario adivinado llevaría a la gente al perfil de otro.
 *
 * Se quedan apagadas hasta tener la URL exacta. Encenderlas es cambiar `activo`.
 */
export const SOCIALS: ReadonlyArray<{
  activo: boolean;
  red: string;
  url: string;
  usuario: string;
}> = [
  { activo: false, red: "Instagram", url: "", usuario: "" },
  { activo: false, red: "TikTok", url: "", usuario: "" },
  { activo: false, red: "Facebook", url: "", usuario: "" },
];

/** Las cuatro intenciones con las que alguien escribe a +58Express. */
export type Intencion = "conductor" | "aliado" | "soporte" | "general";

/**
 * Mensaje que ya viene escrito al abrir el chat.
 *
 * Cada uno dice de dónde viene la persona y qué quiere, de modo que quien atiende
 * sepa a qué cola va sin preguntar. Un único mensaje genérico obligaría a
 * averiguarlo en cada conversación.
 */
export const MENSAJES: Record<Intencion, string> = {
  conductor:
    "Hola, vi la página de +58Express y estoy interesado en trabajar como conductor.",
  aliado:
    "Hola, vi la página de +58Express y quiero información para ser aliado comercial.",
  soporte: "Hola, necesito ayuda con +58Express.",
  general: "Hola, quisiera información sobre +58Express.",
};

/** Asunto del correo, equivalente al mensaje prellenado del chat. */
export const ASUNTOS: Record<Intencion, string> = {
  conductor: "Quiero conducir con +58Express",
  aliado: "Quiero ser aliado comercial de +58Express",
  soporte: "Ayuda con +58Express",
  general: "Información sobre +58Express",
};

/**
 * Enlace de WhatsApp para una intención.
 *
 * `wa.me` es el enlace oficial y el que mejor se comporta en los dos sitios: en
 * el móvil abre la aplicación y en el escritorio lleva a WhatsApp Web. El texto
 * se codifica entero porque lleva tildes, comas y espacios.
 */
export function whatsapp(intencion: Intencion = "general"): string {
  const texto = encodeURIComponent(MENSAJES[intencion]);
  return `https://wa.me/${WHATSAPP.e164}?text=${texto}`;
}

/** Enlace de correo para una intención, con el asunto ya puesto. */
export function correo(intencion: Intencion = "general"): string {
  return `mailto:${EMAIL.direccion}?subject=${encodeURIComponent(ASUNTOS[intencion])}`;
}

/**
 * Lista de espera del lanzamiento.
 *
 * Apagada a propósito. Pedir un correo exige, antes: política de privacidad
 * válida, responsable identificado, dónde se guarda, doble confirmación,
 * protección antibot y límite de peticiones. Nada de eso existe todavía, así que
 * el sitio NO pinta ningún campo: un formulario que no puede cumplir lo que
 * promete es peor que no tenerlo.
 *
 * Cuando esté todo, esto pasa a `true` y aparece el formulario.
 */
export const WAITLIST_ENABLED = false;
