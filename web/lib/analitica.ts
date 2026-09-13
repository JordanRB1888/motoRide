"use client";

import { track } from "@vercel/analytics";
import { ANALYTICS_ENABLED } from "@/lib/flags";

/**
 * Los once eventos de conversión de la web, y nada más.
 *
 * REGLA INNEGOCIABLE: **aquí no viaja ni un dato personal.** Ni correo, ni
 * teléfono, ni nombre, ni IP, ni identificador de nadie. Sólo qué ocurrió y en
 * qué página. Un embudo se mide con cuentas, no con personas.
 *
 * El tipo `Evento` es cerrado a propósito: un nombre de evento inventado sobre
 * la marcha no compila, así que el esquema no se degrada con el tiempo. Y las
 * propiedades permitidas están declaradas una por una — no hay forma de colar
 * `{ email }` sin que TypeScript lo rechace.
 */

export type Evento =
  | "contacto_abierto"
  | "whatsapp_general"
  | "whatsapp_conductor"
  | "whatsapp_aliado"
  | "whatsapp_soporte"
  | "zona_consultada"
  | "waitlist_iniciada"
  | "waitlist_confirmada"
  | "lead_aliado_enviado";

/** Lo único que se puede adjuntar. Todo son categorías, jamás identidades. */
export type Propiedades = {
  /** Ruta desde la que se disparó: `/`, `/conductores`… */
  origen?: string;
  /** `santa-cruz-de-mara` · `el-mojan` · `maracaibo` */
  zona?: string;
  /** `scroll` o `pulsacion` */
  modo?: string;
  /** `pasajero` · `conductor` · `comercio` */
  rol?: string;
  /** `mara` · `maracaibo` · `otro` */
  municipio?: string;
  /** `comida` · `mercado` · `farmacia`… */
  tipo_comercio?: string;
};

/** Claves que jamás deben salir del navegador, por si alguien lo intenta. */
const PROHIBIDAS = [
  "email",
  "correo",
  "telefono",
  "phone",
  "nombre",
  "name",
  "ip",
  "id",
  "userid",
  "token",
];

/**
 * El filtro, separado para poder probarlo.
 *
 * Red de seguridad en tiempo de ejecución, además del tipo: si algún día alguien
 * construye las propiedades dinámicamente, la clave sospechosa se cae aquí en
 * vez de acabar en la analítica.
 */
export function limpiarPropiedades(propiedades: Record<string, unknown>): Record<string, string> {
  const limpias: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(propiedades)) {
    if (valor == null) continue;
    if (PROHIBIDAS.includes(clave.toLowerCase())) continue;
    limpias[clave] = String(valor).slice(0, 64);
  }
  return limpias;
}

export function medir(evento: Evento, propiedades: Propiedades = {}): void {
  if (!ANALYTICS_ENABLED) return;

  const limpias = limpiarPropiedades(propiedades as Record<string, unknown>);

  try {
    track(evento, limpias);
  } catch {
    /* La analítica jamás puede romper la página. Si el script no cargó —por la
       CSP, por un bloqueador, porque el proyecto no la tiene activada— el sitio
       sigue funcionando igual. */
  }
}
