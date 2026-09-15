import { MAX_CUERPO_BYTES } from "./validacion";

/**
 * Guardas comunes a toda ruta que acepta una escritura.
 *
 * Son tres comprobaciones baratas que se hacen ANTES de mirar el contenido,
 * porque cada una descarta una familia entera de peticiones que no valen la pena
 * procesar.
 */

/**
 * ¿Viene de nuestro propio sitio?
 *
 * Es la defensa contra la falsificación de petición: un formulario en otra
 * página no puede poner la cabecera `Origin` a su antojo —la pone el navegador—,
 * así que comparar contra el origen propio basta. No hace falta un testigo CSRF
 * porque no hay sesión ni cookie que robar: aquí no se autentica a nadie.
 *
 * Una petición sin `Origin` (curl, una prueba) se acepta sólo fuera de
 * producción: en producción, lo que no declara de dónde viene, no entra.
 */
export function origenValido(peticion: Request): boolean {
  const origen = peticion.headers.get("origin");
  if (!origen) return process.env.NODE_ENV !== "production";

  const permitidos = new Set(
    [
      "https://mas58express.com",
      "https://www.mas58express.com",
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3100" : null,
      process.env.NODE_ENV !== "production" ? "http://localhost:3000" : null,
    ].filter(Boolean) as string[],
  );

  return permitidos.has(origen);
}

/** Sólo JSON. Un `content-type` de formulario permitiría enviarlo desde otro sitio. */
export function tipoDeContenidoValido(peticion: Request): boolean {
  const tipo = peticion.headers.get("content-type") ?? "";
  return tipo.toLowerCase().startsWith("application/json");
}

export type LecturaCuerpo =
  | { ok: true; cuerpo: unknown }
  | { ok: false; motivo: "DEMASIADO_GRANDE" | "JSON_INVALIDO" };

/**
 * Lee el cuerpo con un techo de tamaño.
 *
 * Se comprueba el `content-length` **y** el tamaño real: la cabecera la escribe
 * quien llama y puede mentir.
 */
export async function leerCuerpo(peticion: Request): Promise<LecturaCuerpo> {
  const declarado = Number(peticion.headers.get("content-length") ?? 0);
  if (declarado > MAX_CUERPO_BYTES) return { ok: false, motivo: "DEMASIADO_GRANDE" };

  const texto = await peticion.text().catch(() => "");
  if (texto.length > MAX_CUERPO_BYTES) return { ok: false, motivo: "DEMASIADO_GRANDE" };

  try {
    return { ok: true, cuerpo: JSON.parse(texto || "{}") };
  } catch {
    return { ok: false, motivo: "JSON_INVALIDO" };
  }
}

/** Respuesta JSON sin caché: nada de esto debe quedarse guardado por el camino. */
export function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * La ruta no existe.
 *
 * Se usa cuando el interruptor está apagado: 404 y no 503, porque no es una
 * caída temporal — es que esa funcionalidad todavía no se ha publicado, y no hay
 * razón para anunciar que existe.
 */
export function noExiste(): Response {
  return json({ error: "NO_ENCONTRADO" }, 404);
}

/**
 * Método equivocado sobre una ruta que sí existe.
 *
 * Sólo tiene sentido con el interruptor ENCENDIDO. Con él apagado se responde
 * `noExiste()`, porque si no la ruta se delataría sola: un `POST` devolvía 404 y
 * un `GET` al mismo sitio, 405 — y un 405 sólo lo da algo que está ahí.
 */
export function metodoNoPermitido(permitidos: string): Response {
  return new Response(JSON.stringify({ error: "METODO_NO_PERMITIDO" }), {
    status: 405,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      allow: permitidos,
    },
  });
}
