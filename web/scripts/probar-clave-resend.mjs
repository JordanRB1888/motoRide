/**
 * ¿Es válida esta clave de Resend? — SIN mandar ningún correo.
 *
 *   node scripts/probar-clave-resend.mjs --del-portapapeles
 *   node scripts/probar-clave-resend.mjs --desde "C:\\ruta\\clave.txt"
 *
 * CÓMO PUEDE COMPROBARLO SIN ENVIAR NADA
 *
 * Manda a `POST /emails` un cuerpo deliberadamente incompleto —sin `from`, sin
 * `to` y sin `subject`—, que Resend no puede llegar a enviar. Lo que interesa no
 * es el envío sino QUIÉN contesta y con qué código:
 *
 *   401  la clave no autentica: está mal, caducada o revocada;
 *   403  autentica, pero no tiene permiso para esto;
 *   422  autentica y el permiso es correcto — falla sólo por el cuerpo, que es
 *        justo lo que se buscaba;
 *   200  no debería ocurrir jamás con este cuerpo. Si ocurre, algo raro pasa.
 *
 * La clave NO se imprime. Lo único que se enseña de ella es si empieza por `re_`
 * y cuántos caracteres tiene, que es lo que hace falta para descartar un pegado
 * a medias o un valor de otra cosa.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function delPortapapeles() {
  const [orden, args] =
    process.platform === "win32"
      ? ["powershell", ["-NoProfile", "-Command", "Get-Clipboard -Raw"]]
      : process.platform === "darwin"
        ? ["pbpaste", []]
        : ["xclip", ["-selection", "clipboard", "-o"]];
  return execFileSync(orden, args, { encoding: "utf8" });
}

const argumentos = process.argv.slice(2);
const iDesde = argumentos.indexOf("--desde");

let clave;
if (argumentos.includes("--del-portapapeles")) {
  clave = delPortapapeles().trim();
} else if (iDesde > -1) {
  clave = readFileSync(argumentos[iDesde + 1], "utf8").trim();
} else {
  console.error(
    "Dime de dónde leerla, sin escribirla en la línea de órdenes:\n" +
      "  node scripts/probar-clave-resend.mjs --del-portapapeles\n" +
      '  node scripts/probar-clave-resend.mjs --desde "C:\\ruta\\clave.txt"',
  );
  process.exit(2);
}

if (!clave) {
  console.error("No he leído nada.");
  process.exit(2);
}

console.log(`Leída: ${clave.length} caracteres, empieza por «re_»: ${clave.startsWith("re_")}`);
if (!clave.startsWith("re_")) {
  console.log("AVISO: las claves de Resend empiezan por «re_». Esto no lo parece.");
}

/* Cuerpo incompleto A PROPÓSITO: sin destinatario no hay correo que enviar. */
const respuesta = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${clave}`, "content-type": "application/json" },
  body: JSON.stringify({ comprobacion_sin_envio: true }),
});

const texto = await respuesta.text();
const veredicto =
  {
    401: "❌ La clave NO autentica. Está mal, caducada o revocada.",
    403: "⚠️  Autentica, pero le falta permiso (¿no es de «Sending access»?).",
    422: "✅ La clave autentica y tiene el permiso correcto.",
    400: "✅ La clave autentica (rechazo por el cuerpo, que era incompleto a propósito).",
    200: "⁉️  Ha devuelto 200 con un cuerpo incompleto. Revísalo a mano.",
  }[respuesta.status] ?? `⚠️  Código inesperado ${respuesta.status}.`;

console.log(`\nHTTP ${respuesta.status} — ${veredicto}`);

/* La respuesta de error de Resend no contiene la clave; aun así se recorta por
   si algún día decidieran incluir un eco de la cabecera. */
console.log(`Respuesta: ${texto.replace(clave, "«oculta»").slice(0, 200)}`);

process.exit(respuesta.status === 422 || respuesta.status === 400 ? 0 : 1);
