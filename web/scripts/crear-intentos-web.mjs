/**
 * Crea la tabla `public.intentos_web` — y NADA más.
 *
 *   node scripts/crear-intentos-web.mjs [--de-verdad]
 *
 * Sin `--de-verdad` sólo enseña las sentencias que ejecutaría. Es el modo por
 * defecto a propósito: un guion que toca una base de datos tiene que ser
 * aburrido de leer antes de ser peligroso de ejecutar.
 *
 * POR QUÉ EXISTE ESTA TABLA Y NO ESTABA
 *
 * Las dos tablas de datos (`lista_de_espera` y `contactos_aliados`) ya existían,
 * creadas a mano. Falta la tercera, que no guarda datos de nadie: sólo cuenta
 * intentos para el limitador. Sin ella, el límite de peticiones no puede
 * persistir, y un límite que no persiste en un despliegue sin servidor es un
 * límite que no existe.
 *
 * Las sentencias NO se escriben aquí: se leen de `lib/datos/esquema.sql`, que es
 * la declaración de referencia, y se filtran las que nombran `intentos_web`. Así
 * no hay dos versiones del mismo esquema que puedan separarse con el tiempo.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { cargarEnvLocal, conexion } from "./comun.mjs";

const { Pool } = pg;

cargarEnvLocal();

if (!process.env.WEB_DATABASE_URL) {
  console.error("Falta WEB_DATABASE_URL. Ejecuta antes: node scripts/configurar-base.mjs");
  process.exit(2);
}

const sql = readFileSync(new URL("../lib/datos/esquema.sql", import.meta.url), "utf8");

/* Primero se quitan los comentarios y DESPUÉS se parte por `;`. Al revés, un
   punto y coma dentro de un comentario en prosa partiría la línea en dos y la
   mitad de la frase acabaría pegada a una sentencia SQL.

   Del resto se quedan sólo las sentencias que nombran la tabla nueva. Ninguna
   otra de ese fichero la menciona, así que este filtro no puede tocar
   `lista_de_espera` ni `contactos_aliados` por accidente. */
const sentencias = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && /intentos_web/i.test(s));

if (sentencias.length === 0) {
  console.error("No he encontrado ninguna sentencia de intentos_web en lib/datos/esquema.sql.");
  process.exit(1);
}

console.log(`Sentencias a ejecutar (${sentencias.length}):\n`);
for (const s of sentencias) console.log(`  ${s.replace(/\s+/g, " ")};\n`);

const deVerdad = process.argv.includes("--de-verdad");
if (!deVerdad) {
  console.log("Modo ensayo. Para ejecutarlas: node scripts/crear-intentos-web.mjs --de-verdad");
  process.exit(0);
}

const pool = new Pool(conexion("esquema"));

/* Todas o ninguna: si el `revoke` fallara después de crear la tabla, quedaría una
   tabla accesible desde el navegador. */
const cliente = await pool.connect();
try {
  await cliente.query("begin");
  for (const s of sentencias) {
    await cliente.query(s);
    console.log(`  ✅ ${s.replace(/\s+/g, " ").slice(0, 70)}…`);
  }
  await cliente.query("commit");
  console.log("\nHecho.");
} catch (error) {
  await cliente.query("rollback").catch(() => {});
  console.error(`\n❌ ${error.message}\nNo se ha aplicado nada.`);
  process.exitCode = 1;
} finally {
  cliente.release();
  await pool.end();
}
