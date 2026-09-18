/**
 * Lo que comparten los tres guiones de la base.
 *
 * Estaba copiado en cada uno, y una copia de algo que decide cómo se conecta a
 * una base de datos es una copia que un día se queda atrás sin que nadie lo note.
 */
import { readFileSync } from "node:fs";

/**
 * Carga `.env.local`.
 *
 * A mano y no con `--env-file`, que depende de la versión de Node que tenga cada
 * máquina. Lo que ya esté en el entorno manda: así se puede apuntar a otra base
 * desde la terminal sin editar el fichero.
 */
export function cargarEnvLocal() {
  try {
    const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const linea of texto.split(/\r?\n/)) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith("#")) continue;
      const corte = limpia.indexOf("=");
      if (corte < 1) continue;
      const clave = limpia.slice(0, corte).trim();
      let valor = limpia.slice(corte + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  } catch {
    /* No existe: se usa lo que haya en el entorno. */
  }
}

/**
 * La CA de Supabase, leída del módulo que usa la aplicación.
 *
 * Se saca de ahí con una expresión regular en vez de copiarla: si algún día hay
 * que renovar el certificado, se cambia en un sitio y estos guiones verifican
 * contra el mismo que verifica la web. Dos copias del ancla de confianza serían
 * dos oportunidades de que una se quede vieja y alguien la desactive «porque no
 * funciona».
 */
export function caSupabase() {
  const modulo = readFileSync(new URL("../lib/datos/supabase-ca.ts", import.meta.url), "utf8");
  const pem = modulo.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
  if (!pem) throw new Error("No encuentro el certificado en lib/datos/supabase-ca.ts");
  return pem[0] + "\n";
}

/** La configuración de conexión que usan todos: verificada, y una sola conexión. */
export function conexion(nombre) {
  return {
    connectionString: process.env.WEB_DATABASE_URL,
    ssl: { ca: caSupabase(), rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 15_000,
    application_name: `mas58express-web-${nombre}`,
  };
}
