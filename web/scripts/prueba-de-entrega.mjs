/**
 * UN solo correo técnico de prueba. Nada más.
 *
 *   node scripts/prueba-de-entrega.mjs --del-portapapeles --salida "C:\\ruta\\resultado.json"
 *   node scripts/prueba-de-entrega.mjs --desde "C:\\ruta\\clave.txt" --salida "…"
 *
 * POR QUÉ ESTE GUION EXISTE
 *
 * `RESEND_API_KEY` está en Vercel como Secret, y Vercel no la devuelve —ni al
 * panel ni a `vercel env pull`—. Eso es lo que se quería, pero significa que el
 * envío no puede dispararse desde fuera de un despliegue sin volver a tener la
 * clave delante. Encender un formulario para probar el envío sería mucho peor:
 * publicaría una superficie que recoge datos personales sin política de
 * privacidad.
 *
 * LA CLAVE NO SE IMPRIME, y del resultado se guarda todo menos ella.
 *
 * El correo no lleva ni un enlace, ni una imagen, ni un identificador: no hay
 * nada que rastrear ni nada que se pueda confundir con un dato de una persona.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

/* Exactamente el valor guardado en Vercel Production, comprobado leyéndolo de
   vuelta (es de tipo Config, no secreto). Se puede sustituir con --de. */
const REMITENTE_POR_DEFECTO = "+58Express <no-reply@mas58express.com>";
const DESTINO = "58expressapp@gmail.com";
const ASUNTO = "+58Express Web — prueba de entrega";
const TEXTO = "Prueba técnica de entrega del sistema web de +58Express. No requiere acción.";

/* Sin <img>, sin <a>, sin nada que cargue desde fuera. Estilos en línea porque
   los clientes de correo descartan las hojas de estilo. */
const HTML = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<p style="margin:0;font-size:16px;line-height:1.6;color:#111111">${TEXTO}</p>
</div></body></html>`;

function delPortapapeles() {
  const [orden, args] =
    process.platform === "win32"
      ? ["powershell", ["-NoProfile", "-Command", "Get-Clipboard -Raw"]]
      : process.platform === "darwin"
        ? ["pbpaste", []]
        : ["xclip", ["-selection", "clipboard", "-o"]];
  return execFileSync(orden, args, { encoding: "utf8" });
}

const argv = process.argv.slice(2);
const valorDe = (bandera) => {
  const i = argv.indexOf(bandera);
  return i > -1 ? argv[i + 1] : null;
};

let clave;
if (argv.includes("--del-portapapeles")) clave = delPortapapeles().trim();
else if (valorDe("--desde")) clave = readFileSync(valorDe("--desde"), "utf8").trim();
else {
  console.error(
    "Dime de dónde leer la clave, sin escribirla en la línea de órdenes:\n" +
      "  --del-portapapeles   |   --desde <fichero>",
  );
  process.exit(2);
}

if (!clave) {
  console.error("No he leído nada.");
  process.exit(2);
}
if (!clave.startsWith("re_")) {
  console.error(`Eso no parece una clave de Resend (${clave.length} car., no empieza por «re_»).`);
  process.exit(2);
}

const remitente = valorDe("--de") ?? REMITENTE_POR_DEFECTO;

console.log("Enviando UN correo:");
console.log(`   de     : ${remitente}`);
console.log(`   para   : ${DESTINO}`);
console.log(`   asunto : ${ASUNTO}`);
console.log(`   clave  : ${clave.length} caracteres, empieza por «re_» (no se muestra)`);

const respuesta = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${clave}`, "content-type": "application/json" },
  body: JSON.stringify({
    from: remitente,
    to: [DESTINO],
    subject: ASUNTO,
    text: TEXTO,
    html: HTML,
  }),
});

const texto = await respuesta.text();
let cuerpo = null;
try {
  cuerpo = JSON.parse(texto);
} catch {
  /* Se conserva el texto crudo más abajo. */
}

const resultado = {
  cuando: new Date().toISOString(),
  http: respuesta.status,
  aceptado: respuesta.ok,
  id: cuerpo?.id ?? null,
  error: cuerpo?.name ?? cuerpo?.message ?? null,
  remitente,
  destino: DESTINO,
  asunto: ASUNTO,
  /* Se sustituye la clave por si algún día Resend la devolviera en un eco. */
  respuestaCruda: texto.replace(clave, "«oculta»").slice(0, 400),
};

console.log(`\nHTTP ${resultado.http} — ${resultado.aceptado ? "✅ ACEPTADO por Resend" : "❌ RECHAZADO"}`);
if (resultado.id) console.log(`id del correo: ${resultado.id}`);
if (resultado.error) console.log(`error: ${resultado.error}`);
console.log(`respuesta: ${resultado.respuestaCruda}`);

const salida = valorDe("--salida");
if (salida) {
  writeFileSync(salida, JSON.stringify(resultado, null, 2), "utf8");
  console.log(`\nResultado escrito en ${salida} (sin la clave).`);
}

console.log(
  "\nOJO: que Resend lo acepte significa que lo ha admitido para entrega, no que\n" +
    "haya llegado al buzón. Eso solo lo confirma mirar Gmail.",
);

process.exit(resultado.aceptado ? 0 : 1);
