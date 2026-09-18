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

/**
 * Número de atención, confirmado por el dueño.
 *
 * 17/09/2026 — pasa a ser **el número de la empresa**, `0422-058-0558`. Hasta
 * entonces era el `0412-514-3242` que se confirmó el 13/09.
 *
 * Se escribe una sola vez y en E.164 porque es lo que exige `wa.me`. Todo lo
 * demás sale de aquí: el pie de las diez páginas, los cuatro botones por
 * intención, el `telephone` del JSON-LD y el pie de los correos. Tener el número
 * escrito en cada sitio habría garantizado que el día de un cambio como éste
 * alguno se quedara viejo — y el que se quedaría viejo sería justamente el que
 * alguien pulse.
 */
const WHATSAPP_E164 = "584220580558";

export const WHATSAPP = {
  activo: true,
  /** Formato que exige wa.me: código de país, sin «+», sin espacios ni guiones. */
  e164: WHATSAPP_E164,
  /** Cómo se le enseña a una persona. */
  visible: "+58 422-058-0558",
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
/**
 * Las redes oficiales, en UN solo sitio.
 *
 * Las direcciones no se repiten en ningún componente: el pie y `/contacto` leen
 * de aquí. Tres copias de una URL son tres oportunidades de que una se quede
 * vieja el día que la cuenta cambie de nombre, y la que quedaría mal sería
 * justamente la que alguien pulse.
 *
 * La clave de cada entrada es además el sufijo del evento de analítica
 * (`social_tiktok`…), de modo que añadir una red nueva sin medirla —o medir una
 * que no existe— deja de compilar.
 *
 * El orden es el que se pinta, y es deliberado: TikTok primero porque es donde
 * hay más movimiento.
 */
export type RedSocial = "tiktok" | "instagram" | "facebook";

export const REDES_SOCIALES: Record<
  RedSocial,
  { activa: boolean; nombre: string; url: string }
> = {
  tiktok: {
    activa: true,
    nombre: "TikTok",
    url: "https://www.tiktok.com/@58express7",
  },
  instagram: {
    activa: true,
    nombre: "Instagram",
    url: "https://www.instagram.com/58expressapp",
  },
  facebook: {
    activa: true,
    nombre: "Facebook",
    url: "https://www.facebook.com/profile.php?id=61594407713816&sk=directory_intro",
  },
};

/** Las que se pintan hoy, en orden. */
export const REDES_ACTIVAS = (Object.keys(REDES_SOCIALES) as RedSocial[]).filter(
  (red) => REDES_SOCIALES[red].activa,
);

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
 * El interruptor de la lista de espera vive ahora en `lib/flags.ts`, junto a los
 * demás. Se reexporta aquí para no romper lo que ya lo importaba de este módulo.
 */
export { WAITLIST_ENABLED } from "@/lib/flags";
