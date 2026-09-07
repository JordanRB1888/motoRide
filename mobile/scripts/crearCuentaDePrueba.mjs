/**
 * Crea una cuenta de pasajera contra TU servidor local, para poder entrar en la
 * aplicación móvil mientras se prueba.
 *
 * POR QUÉ ESTO EN VEZ DE UNAS CREDENCIALES ESCRITAS EN ALGÚN SITIO
 *
 * Una contraseña fija en el repositorio deja de ser de pruebas el día que
 * alguien la reutiliza, y sale en el historial de git para siempre. Aquí la
 * contraseña la pones tú al ejecutarlo, no se guarda en ningún archivo y no
 * aparece en el código.
 *
 * SÓLO CONTRA SERVIDORES LOCALES
 *
 * Comprueba el destino ANTES de enviar nada y se niega a hablar con cualquier
 * cosa que no sea tu red: nada de dominios públicos, nada de Railway, nada de
 * producción. Crear cuentas de prueba en la base real es de esas cosas que se
 * hacen una vez sin darse cuenta y se limpian durante meses.
 *
 * CÓMO SE USA
 *
 *   cd mobile
 *   PASSWORD='la-que-tu-elijas' node scripts/crearCuentaDePrueba.mjs
 *
 * En PowerShell:
 *
 *   $env:PASSWORD='la-que-tu-elijas'; node scripts/crearCuentaDePrueba.mjs
 *
 * Opcionalmente puedes cambiar el correo y el teléfono:
 *
 *   EMAIL=otra@ejemplo.com PHONE=04140000001 PASSWORD='...' node scripts/...
 *
 * El servidor exige: nombre y apellido de 2 letras o más, correo válido,
 * teléfono de 10 a 15 dígitos y contraseña de 8 caracteres o más. El registro
 * directo sólo crea cuentas de pasajera; conductor requiere aprobación.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');

// ---------------------------------------------------------------------------
// A dónde
// ---------------------------------------------------------------------------

/** Lee `EXPO_PUBLIC_API_BASE_URL` del `.env`, que es el que usa la aplicación. */
function urlDelEntorno() {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  const ruta = path.join(raizMovil, '.env');
  if (!fs.existsSync(ruta)) return '';
  const linea = fs.readFileSync(ruta, 'utf8')
    .split(/\r?\n/)
    .find(texto => texto.trim().startsWith('EXPO_PUBLIC_API_BASE_URL='));
  return linea ? linea.slice(linea.indexOf('=') + 1).trim() : '';
}

/**
 * `true` sólo para direcciones de tu propia red.
 *
 * Se comprueba lo que ESTÁ permitido, no lo que está prohibido. Una lista de
 * dominios prohibidos siempre se queda corta: basta con que producción cambie
 * de nombre una vez para que deje de protegerte.
 */
function esServidorLocal(host) {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  const partes = host.split('.').map(Number);
  if (partes.length !== 4 || partes.some(numero => !Number.isInteger(numero) || numero < 0 || numero > 255)) {
    return false;
  }
  const [a, b] = partes;
  if (a === 10) return true;                       // 10.0.0.0/8
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  return false;
}

function salir(mensaje) {
  console.error(`\n  ${mensaje}\n`);
  process.exit(1);
}

const base = urlDelEntorno();
if (!base) {
  salir('No encuentro EXPO_PUBLIC_API_BASE_URL. Copia mobile/.env.example a mobile/.env.');
}

let destino;
try {
  destino = new URL(base);
} catch {
  salir(`«${base}» no es una dirección válida.`);
}

if (!esServidorLocal(destino.hostname)) {
  salir(
    `Me niego a registrar contra «${destino.hostname}»: no es un servidor de tu red.\n` +
    '  Este script sólo habla con localhost o direcciones privadas (10.x, 192.168.x, 172.16-31.x).\n' +
    '  Crear cuentas de prueba en la base real se limpia durante meses.'
  );
}

// ---------------------------------------------------------------------------
// Qué
// ---------------------------------------------------------------------------

const password = process.env.PASSWORD ?? '';
if (password.length < 8) {
  salir(
    'Falta la contraseña, o tiene menos de 8 caracteres.\n\n' +
    "    PASSWORD='la-que-tu-elijas' node scripts/crearCuentaDePrueba.mjs\n\n" +
    '  La eliges tú: no se guarda en ningún archivo ni aparece en el código.'
  );
}

const cuenta = {
  firstName: process.env.FIRST_NAME ?? 'Prueba',
  lastName: process.env.LAST_NAME ?? 'Local',
  email: process.env.EMAIL ?? 'prueba.local@ejemplo.com',
  phone: process.env.PHONE ?? '04140000000',
  password,
  role: 'passenger'
};

// ---------------------------------------------------------------------------
// Vamos
// ---------------------------------------------------------------------------

const url = new URL('/api/auth/register', destino).toString();
console.log(`\n  Registrando en ${url}`);
console.log(`  Correo:   ${cuenta.email}`);
console.log(`  Teléfono: ${cuenta.phone}\n`);

let respuesta;
try {
  respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuenta)
  });
} catch (error) {
  salir(
    `No pude conectar: ${error instanceof Error ? error.message : String(error)}\n` +
    '  ¿Está el servidor levantado?  cd server && npm start'
  );
}

const cuerpo = await respuesta.json().catch(() => ({}));

if (respuesta.status === 409) {
  console.log('  Esa cuenta YA EXISTE. Entra con ella, o usa otro EMAIL y PHONE.\n');
  process.exit(0);
}

if (!respuesta.ok) {
  const detalle = cuerpo?.fields
    ? Object.entries(cuerpo.fields).map(([campo, texto]) => `\n    · ${campo}: ${texto}`).join('')
    : ` ${cuerpo?.error ?? respuesta.statusText}`;
  salir(`El servidor rechazó el registro (${respuesta.status}):${detalle}`);
}

console.log('  Cuenta creada. Ya puedes entrar en la aplicación con ese correo');
console.log('  y la contraseña que acabas de usar.\n');
