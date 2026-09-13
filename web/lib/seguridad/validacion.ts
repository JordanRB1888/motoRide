import type { RolWaitlist, ZonaWaitlist } from "@/lib/datos";

/**
 * Validación en el servidor, con lista blanca.
 *
 * La regla que gobierna este fichero: **lo que no está declarado, no entra**. No
 * se sanea lo que llega, se descarta: un objeto con cincuenta claves inesperadas
 * pasa por aquí y sale con las tres que valen. Así ningún campo sorpresa llega
 * al almacén ni a una plantilla de correo.
 *
 * Sin dependencias externas a propósito: son cuatro formularios, y una librería
 * de esquemas añadiría superficie para lo que caben veinte líneas.
 */

export const ROLES: RolWaitlist[] = ["pasajero", "conductor", "comercio"];
export const ZONAS: ZonaWaitlist[] = ["santa-cruz-de-mara", "el-mojan", "maracaibo"];
export const MUNICIPIOS = ["mara", "maracaibo", "otro"] as const;
export const TIPOS_COMERCIO = [
  "comida",
  "mercado",
  "farmacia",
  "licores",
  "reposteria",
  "otro",
] as const;

/** Tamaño máximo del cuerpo. Un formulario honesto no pasa de unos cientos de bytes. */
export const MAX_CUERPO_BYTES = 8 * 1024;

/** Un envío en menos de esto no lo ha escrito una persona. */
export const TIEMPO_MINIMO_MS = 3000;

export type Fallo = { campo: string; mensaje: string };

const texto = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * Correo.
 *
 * Comprobación deliberadamente conservadora: la única validación que de verdad
 * demuestra que una dirección existe es mandarle un mensaje, y eso es justo lo
 * que hace el doble consentimiento. Aquí sólo se descarta lo que no puede ser
 * una dirección.
 */
export function normalizarEmail(valor: unknown): string | null {
  const v = texto(valor, 254).toLowerCase();
  if (v.length < 6 || v.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) return null;
  if (v.includes("..")) return null;
  return v;
}

export type EntradaWaitlist = {
  email: string;
  rol: RolWaitlist | null;
  zona: ZonaWaitlist | null;
  consentimiento: boolean;
  turnstileToken: string;
  trampa: string;
  abiertoEn: number | null;
  /** De dónde vino. Saneado a caracteres inocuos: acaba en el almacén. */
  origen: string | null;
};

export function validarWaitlist(cuerpo: unknown):
  | { ok: true; datos: EntradaWaitlist }
  | { ok: false; error: "EMAIL_INVALIDO" | "VALIDACION"; fallos: Fallo[] } {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const fallos: Fallo[] = [];

  const email = normalizarEmail(c.email);
  if (!email) {
    return {
      ok: false,
      error: "EMAIL_INVALIDO",
      fallos: [{ campo: "email", mensaje: "Escribe un correo válido." }],
    };
  }

  const rolCrudo = texto(c.rol, 20);
  const rol = ROLES.includes(rolCrudo as RolWaitlist) ? (rolCrudo as RolWaitlist) : null;
  if (rolCrudo && !rol) fallos.push({ campo: "rol", mensaje: "Opción no válida." });

  const zonaCruda = texto(c.zona, 32);
  const zona = ZONAS.includes(zonaCruda as ZonaWaitlist) ? (zonaCruda as ZonaWaitlist) : null;
  if (zonaCruda && !zona) fallos.push({ campo: "zona", mensaje: "Opción no válida." });

  if (c.consentimiento !== true) {
    fallos.push({ campo: "consentimiento", mensaje: "Hace falta tu consentimiento." });
  }

  if (fallos.length) return { ok: false, error: "VALIDACION", fallos };

  return {
    ok: true,
    datos: {
      email,
      rol,
      zona,
      consentimiento: true,
      turnstileToken: texto(c.turnstileToken, 4096),
      trampa: texto(c.trampa, 200),
      abiertoEn: typeof c.abiertoEn === "number" ? c.abiertoEn : null,
      origen: texto(c.origen, 40).replace(/[^a-z0-9_.-]/gi, "") || null,
    },
  };
}

export type EntradaLeadAliado = {
  nombre: string;
  negocio: string;
  telefono: string;
  email: string;
  municipio: string;
  tipoComercio: string;
  mensaje: string | null;
  turnstileToken: string;
  trampa: string;
  abiertoEn: number | null;
};

export function validarLeadAliado(cuerpo: unknown):
  | { ok: true; datos: EntradaLeadAliado }
  | { ok: false; error: "VALIDACION"; fallos: Fallo[] } {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const fallos: Fallo[] = [];

  const nombre = texto(c.nombre, 80);
  if (nombre.length < 2) fallos.push({ campo: "nombre", mensaje: "Dinos tu nombre." });

  const negocio = texto(c.negocio, 120);
  if (negocio.length < 2) fallos.push({ campo: "negocio", mensaje: "¿Cómo se llama tu negocio?" });

  const telefono = texto(c.telefono, 24);
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) {
    fallos.push({ campo: "telefono", mensaje: "Escribe un teléfono válido." });
  }

  const email = normalizarEmail(c.email);
  if (!email) fallos.push({ campo: "email", mensaje: "Escribe un correo válido." });

  const municipio = texto(c.municipio, 40);
  if (!MUNICIPIOS.includes(municipio as (typeof MUNICIPIOS)[number])) {
    fallos.push({ campo: "municipio", mensaje: "Elige dónde estás." });
  }

  const tipoComercio = texto(c.tipoComercio, 40);
  if (!TIPOS_COMERCIO.includes(tipoComercio as (typeof TIPOS_COMERCIO)[number])) {
    fallos.push({ campo: "tipoComercio", mensaje: "Elige el tipo de comercio." });
  }

  if (c.consentimiento !== true) {
    fallos.push({ campo: "consentimiento", mensaje: "Hace falta tu consentimiento." });
  }

  if (fallos.length) return { ok: false, error: "VALIDACION", fallos };

  return {
    ok: true,
    datos: {
      nombre,
      negocio,
      telefono,
      email: email!,
      municipio,
      tipoComercio,
      mensaje: texto(c.mensaje, 1000) || null,
      turnstileToken: texto(c.turnstileToken, 4096),
      trampa: texto(c.trampa, 200),
      abiertoEn: typeof c.abiertoEn === "number" ? c.abiertoEn : null,
    },
  };
}

/**
 * ¿Huele a robot?
 *
 * Dos señales baratas que no molestan a nadie: un campo que sólo un programa
 * rellenaría, y un envío tan rápido que ninguna persona ha podido escribirlo.
 * Ninguna de las dos mira el navegador ni construye una huella del visitante.
 */
export function pareceRobot(trampa: string, abiertoEn: number | null, ahora: number): boolean {
  if (trampa) return true;
  if (abiertoEn && ahora - abiertoEn < TIEMPO_MINIMO_MS) return true;
  return false;
}
