/**
 * Pega la cadena de conexión UNA vez y queda donde tiene que quedar.
 *
 *   node scripts/configurar-base.mjs
 *
 * Qué hace, en este orden:
 *   1. la pide sin mostrarla por pantalla;
 *   2. comprueba que tiene forma de pooler de transacciones y que NO es la base
 *      de la aplicación móvil;
 *   3. **se conecta de verdad** antes de guardarla en ningún sitio — si la
 *      contraseña está mal, no se escribe nada y no hay que ir a limpiar;
 *   4. la escribe en `web/.env.local`, que está en `.gitignore` y no viaja al
 *      repositorio;
 *   5. la sube a Vercel (`plus58express-web`) para Preview y Production
 *      pasándosela por la entrada estándar, sin que aparezca en la línea de
 *      órdenes ni, por tanto, en el historial de la terminal.
 *
 * No la imprime nunca, ni entera ni a trozos. Lo único que enseña al terminar es
 * el puerto y si el anfitrión es el pooler.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const RUTA_ENV = new URL("../.env.local", import.meta.url);

/**
 * Pregunta por la terminal, tapando el eco cuando hace falta.
 *
 * El eco se tapa sustituyendo `process.stdout.write` — y se RESTAURA al
 * terminar. Sin restaurarlo, todo lo que este guion imprimiera después sería
 * invisible, porque `rl.output` y `process.stdout` son el mismo objeto.
 */
function preguntar(texto, { oculto = false } = {}) {
  return new Promise((listo) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const escribir = process.stdout.write.bind(process.stdout);
    escribir(texto);

    const tapar = oculto && process.stdin.isTTY;
    if (tapar) process.stdout.write = () => true;

    rl.question("", (respuesta) => {
      if (tapar) {
        process.stdout.write = escribir;
        escribir("\n");
      }
      rl.close();
      listo(respuesta.trim());
    });
  });
}

function revisar(cadena) {
  const fallos = [];
  const avisos = [];
  if (!/^postgres(ql)?:\/\//.test(cadena)) {
    fallos.push("No empieza por postgresql:// — ¿has pegado la cadena entera?");
    return { fallos, avisos, url: null };
  }
  let url;
  try {
    url = new URL(cadena);
  } catch {
    fallos.push("No se puede interpretar como URL.");
    return { fallos, avisos, url: null };
  }
  if (!url.password) fallos.push("No lleva contraseña.");
  if (/\[YOUR-PASSWORD\]|\[TU-CONTRASE/i.test(cadena)) {
    fallos.push("Sigue el hueco «[YOUR-PASSWORD]»: hay que sustituirlo por la contraseña real.");
  }
  if (!url.hostname.endsWith("supabase.com") && !url.hostname.endsWith("supabase.co")) {
    avisos.push("El anfitrión no es de Supabase.");
  }
  if (url.port !== "6543") {
    avisos.push(
      `El puerto es ${url.port || "(ninguno)"}. El Transaction Pooler es el 6543; ` +
        "el 5432 abre una conexión de sesión, que no encaja con un despliegue sin servidor.",
    );
  }
  return { fallos, avisos, url };
}

/**
 * Tres maneras de dar la cadena, y ninguna la enseña por pantalla.
 *
 * La de teclado no siempre funciona: hay terminales empotradas que no dejan
 * pegar en un aviso en modo crudo, y como el eco está tapado no se distingue
 * «no ha entrado» de «ha entrado y no se ve». Por eso hay dos salidas más.
 *
 *   --del-portapapeles   la lee de donde ya está tras copiarla de Supabase.
 *                        No se teclea, no se muestra, no toca el disco.
 *   --desde <fichero>    la lee de un fichero —pegado con el Bloc de notas, que
 *                        siempre deja pegar— y lo BORRA al terminar.
 */
function delPortapapeles() {
  const ordenes =
    process.platform === "win32"
      ? ["powershell", ["-NoProfile", "-Command", "Get-Clipboard -Raw"]]
      : process.platform === "darwin"
        ? ["pbpaste", []]
        : ["xclip", ["-selection", "clipboard", "-o"]];
  return execFileSync(ordenes[0], ordenes[1], { encoding: "utf8" });
}

const argumentos = process.argv.slice(2);
const iDesde = argumentos.indexOf("--desde");
const ficheroTemporal = iDesde > -1 ? argumentos[iDesde + 1] : null;

let cadena;
if (argumentos.includes("--del-portapapeles")) {
  try {
    cadena = delPortapapeles().trim();
  } catch (error) {
    console.error(`No he podido leer el portapapeles: ${error.message}`);
    process.exit(2);
  }
  console.log(`Leída del portapapeles (${cadena.length} caracteres). No se muestra.`);
} else if (ficheroTemporal) {
  try {
    cadena = readFileSync(ficheroTemporal, "utf8").trim();
  } catch (error) {
    console.error(`No he podido leer ${ficheroTemporal}: ${error.message}`);
    process.exit(2);
  }
  console.log(`Leída de ${ficheroTemporal} (${cadena.length} caracteres). No se muestra.`);
} else {
  cadena = await preguntar(
    "Pega la URI del Transaction Pooler de «+58Express Web».\n" +
      "No verás nada al pegar: el eco está tapado a propósito. Pega y pulsa Enter.\n> ",
    { oculto: true },
  );
}

if (!cadena) {
  console.error("No has pegado nada. No se ha tocado nada.");
  process.exit(2);
}

const { fallos, avisos, url } = revisar(cadena);
if (fallos.length) {
  console.error("\nLa cadena no sirve:");
  for (const f of fallos) console.error(`  · ${f}`);
  console.error("\nNo se ha escrito nada.");
  process.exit(2);
}
for (const a of avisos) console.log(`AVISO: ${a}`);

console.log(`\nDestino: ***.${url.hostname.split(".").slice(-3).join(".")}:${url.port} / ${url.pathname.slice(1)}`);
console.log("Probando la conexión antes de guardarla en ningún sitio…");

let ssl = { rejectUnauthorized: true };
let modoTls = "verificado";
async function probar(config) {
  const pool = new Pool({
    connectionString: cadena,
    ssl: config,
    max: 1,
    connectionTimeoutMillis: 15_000,
    application_name: "mas58express-web-configuracion",
  });
  try {
    const { rows } = await pool.query("select current_database() as d, current_user as u");
    return rows[0];
  } finally {
    await pool.end().catch(() => {});
  }
}

let info;
try {
  info = await probar(ssl);
} catch (error) {
  console.log(`  TLS verificado: no (${error.message})`);
  try {
    info = await probar({ rejectUnauthorized: false });
    ssl = { rejectUnauthorized: false };
    modoTls = "SIN verificar";
  } catch (error2) {
    console.error(`\nNo se ha podido conectar: ${error2.message}`);
    console.error("No se ha escrito nada. Revisa la contraseña o la región del pooler.");
    process.exit(1);
  }
}

console.log(`  Conectado. base=${info.d} rol=${info.u} TLS=${modoTls}`);

/* Un último cortafuegos: si esta cadena apuntara a la base de la aplicación
   —la que tiene usuarios, viajes y conductores—, esto la habría encontrado. */
const pool = new Pool({ connectionString: cadena, ssl, max: 1, application_name: "mas58express-web-configuracion" });
const { rows: tablas } = await pool.query(
  `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by relname`,
);
await pool.end();
const nombres = tablas.map((t) => t.relname);
const sospechosas = nombres.filter((n) => /usuario|user|viaje|trip|ride|conductor|driver|pedido|order|wallet/i.test(n));
if (sospechosas.length) {
  console.error(`\n¡ALTO! Esta base tiene tablas de la aplicación: ${sospechosas.join(", ")}`);
  console.error("Esa NO es la base de la web. No se ha escrito nada.");
  process.exit(1);
}
console.log(`  Tablas en public: ${nombres.join(", ") || "(ninguna)"}`);

/* 4. .env.local ------------------------------------------------------------ */
const anterior = existsSync(RUTA_ENV) ? readFileSync(RUTA_ENV, "utf8") : "";
const sinLaVariable = anterior
  .split(/\r?\n/)
  .filter((l) => !/^WEB_DATABASE_URL=/.test(l.trim()))
  .join("\n")
  .replace(/\n+$/, "");
const lineas = [sinLaVariable, `WEB_DATABASE_URL=${cadena}`].filter(Boolean);

const salGenerada = await preguntar(
  "\n¿Generar también IP_HASH_SALT (valor aleatorio, necesario para que el límite por IP funcione)? [S/n]: ",
);
let sal = null;
if (!/^n/i.test(salGenerada)) {
  const yaEstaba = /^IP_HASH_SALT=/m.test(anterior);
  if (yaEstaba) {
    console.log("  Ya había una en .env.local: se conserva (cambiarla invalidaría las huellas guardadas).");
  } else {
    sal = randomBytes(32).toString("base64url");
    lineas.push(`IP_HASH_SALT=${sal}`);
  }
}

writeFileSync(RUTA_ENV, lineas.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
console.log("  Escrito web/.env.local (ignorado por git).");

/* 5. Vercel ---------------------------------------------------------------- */
/**
 * La sube por la ENTRADA ESTÁNDAR, nunca como argumento.
 *
 * `--value` existe y sería más corto, pero los argumentos de un proceso se ven
 * en la lista de procesos de la máquina y quedan en el historial de la terminal.
 * Por stdin no los ve nadie.
 *
 * `--sensitive` la guarda como Secret: Vercel la entrega al despliegue y no
 * permite volver a leerla, ni desde el panel ni con `vercel env pull`. Para una
 * cadena de conexión es justo lo que se quiere — el único sitio donde sigue
 * existiendo en claro es el panel de Supabase, que es su dueño.
 */
function vercelEnvAdd(nombre, entorno, valor) {
  return new Promise((listo) => {
    const hijo = spawn("vercel", ["env", "add", nombre, entorno, "--sensitive", "--force"], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      /* `fileURLToPath` y no `.pathname`: esta ruta tiene espacios, y `pathname`
         los devuelve codificados como %20. */
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    });
    let salida = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (salida += d));
    hijo.on("close", (codigo) => listo({ codigo, salida }));
    hijo.stdin.write(valor + "\n");
    hijo.stdin.end();
  });
}

console.log("\nSubiendo a Vercel (plus58express-web), como secreto, a Preview y Production…");
const ENTORNOS = "preview,production";

const r = await vercelEnvAdd("WEB_DATABASE_URL", ENTORNOS, cadena);
console.log(
  `  WEB_DATABASE_URL: ${r.codigo === 0 ? "✅" : "❌"} ` +
    (r.salida.replace(cadena, "«oculta»").split("\n").filter(Boolean).pop() ?? "").trim(),
);
if (sal) {
  const s = await vercelEnvAdd("IP_HASH_SALT", ENTORNOS, sal);
  console.log(
    `  IP_HASH_SALT    : ${s.codigo === 0 ? "✅" : "❌"} ` +
      (s.salida.replace(sal, "«oculta»").split("\n").filter(Boolean).pop() ?? "").trim(),
  );
}

/* El fichero de paso no puede sobrevivir a esto: es la cadena en claro, sin
   cifrar, en una ruta que nadie va a recordar borrar. */
if (ficheroTemporal) {
  try {
    unlinkSync(ficheroTemporal);
    console.log(`  Borrado ${ficheroTemporal}.`);
  } catch (error) {
    console.log(`  ATENCIÓN: no he podido borrar ${ficheroTemporal} (${error.message}). Bórralo tú.`);
  }
}

console.log(
  "\nListo. Comprueba con `vercel env ls` (enseña los nombres, nunca los valores).\n" +
    "Siguiente paso: node scripts/verificar-esquema.mjs",
);
