import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * MOBILE-NATIVE-1 — reglas de seguridad sobre el propio código.
 *
 * Son comprobaciones estáticas: leen los ficheros del cliente móvil y verifican
 * reglas que, si se rompen, no darían ningún error al ejecutar. Un token
 * guardado en el sitio equivocado funciona perfectamente hasta que alguien lee
 * el dispositivo.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');

/** Los ficheros propios del cliente móvil, sin dependencias ni artefactos. */
function ficherosDelMovil() {
  const carpetas = ['app', 'components', 'config', 'domain', 'services', 'theme'];
  const encontrados = [];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile()) continue;
      if (!/\.(ts|tsx)$/.test(completa)) continue;
      encontrados.push({
        relativa: path.relative(raizMovil, completa).replace(/\\/g, '/'),
        contenido: fs.readFileSync(completa, 'utf8')
      });
    }
  }
  return encontrados;
}

/** El código sin comentarios: lo que de verdad se ejecuta. */
const soloCodigo = texto =>
  texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('hay ficheros del móvil que revisar', () => {
  const ficheros = ficherosDelMovil();
  assert.ok(ficheros.length >= 8, `se esperaban varios ficheros, hay ${ficheros.length}`);
});

// ---------------------------------------------------------------------------
// El retiro antiguo no entra en el móvil
// ---------------------------------------------------------------------------

test('el cliente móvil NO usa el endpoint de retiro ANTIGUO', () => {
  // `POST /api/wallet/payouts` está deshabilitado en producción por
  // WALLET-PAYOUTS-1A y no pertenece al futuro móvil: cuando los retiros lleguen
  // al teléfono, será sobre la fundación nueva.
  //
  // Es fácil que se cuele copiando de la web por costumbre, y no daría ningún
  // error: simplemente recibiría un 403 en producción y nadie sabría por qué.
  for (const { relativa, contenido } of ficherosDelMovil()) {
    // La lista de rutas prohibidas SÍ puede nombrarla: es su declaración.
    if (relativa === 'services/api.ts') continue;
    assert.equal(
      soloCodigo(contenido).includes('/api/wallet/payouts'), false,
      `${relativa} usa el endpoint de retiro antiguo`
    );
  }
});

test('la ruta prohibida está declarada donde las pruebas la ven', () => {
  const api = fs.readFileSync(path.join(raizMovil, 'services/api.ts'), 'utf8');
  assert.match(api, /RUTAS_PROHIBIDAS/);
  assert.match(api, /\/api\/wallet\/payouts/);
});

// ---------------------------------------------------------------------------
// El token, en el sitio correcto
// ---------------------------------------------------------------------------

test('el token de sesión sólo se guarda en el almacén SEGURO', () => {
  const sesion = fs.readFileSync(path.join(raizMovil, 'services/session.ts'), 'utf8');
  const codigo = soloCodigo(sesion);

  assert.match(codigo, /expo-secure-store/, 'usa el almacén seguro del sistema');
  // Nada de almacenamiento plano para el token.
  assert.equal(codigo.includes('AsyncStorage'), false, 'el token no va a almacenamiento plano');
  assert.equal(/localStorage|sessionStorage/.test(codigo), false, 'ni a almacenamiento del navegador');
});

test('ningún fichero del móvil guarda el token en almacenamiento plano', () => {
  for (const { relativa, contenido } of ficherosDelMovil()) {
    const codigo = soloCodigo(contenido);
    assert.equal(
      /AsyncStorage[\s\S]{0,80}(token|jwt|session)/i.test(codigo), false,
      `${relativa} parece guardar sesión en almacenamiento plano`
    );
  }
});

// ---------------------------------------------------------------------------
// Nada sensible en los registros
// ---------------------------------------------------------------------------

test('no se registra el token, la contraseña ni las cabeceras', () => {
  const prohibido = /console\.(log|warn|error|info|debug)\s*\([^)]*\b(token|jwt|password|contrasena|authorization|cookie|otp)\b/i;
  for (const { relativa, contenido } of ficherosDelMovil()) {
    assert.equal(prohibido.test(soloCodigo(contenido)), false,
      `${relativa} registra algo sensible`);
  }
});

// ---------------------------------------------------------------------------
// No hay una segunda autoridad de autenticación
// ---------------------------------------------------------------------------

test('el móvil NO trae su propio sistema de autenticación', () => {
  // El backend existente sigue siendo la autoridad. Dos sistemas de
  // autenticación conviviendo es una vulnerabilidad, no una migración.
  const prohibido = /firebase\/auth|@supabase|@clerk|auth0|jsonwebtoken|jwt\.sign|bcrypt/i;
  for (const { relativa, contenido } of ficherosDelMovil()) {
    assert.equal(prohibido.test(soloCodigo(contenido)), false,
      `${relativa} introduce autenticación propia`);
  }
});

test('tampoco está en las dependencias', () => {
  const paquete = JSON.parse(fs.readFileSync(path.join(raizMovil, 'package.json'), 'utf8'));
  const todas = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  for (const nombre of todas) {
    assert.equal(
      /firebase|supabase|clerk|auth0|jsonwebtoken|bcrypt/i.test(nombre), false,
      `dependencia de autenticación no autorizada: ${nombre}`
    );
  }
});

// ---------------------------------------------------------------------------
// Cartera y finanzas apagadas
// ---------------------------------------------------------------------------

test('el móvil NO enciende retiros ni toca Driver Finance', () => {
  const prohibido = /WALLET_PAYOUTS_ENABLED|DRIVER_WITHDRAWALS_ENABLED|LEGACY_PAYOUTS_ENABLED|driverFinance|driver_finance/i;
  for (const { relativa, contenido } of ficherosDelMovil()) {
    assert.equal(prohibido.test(soloCodigo(contenido)), false,
      `${relativa} toca banderas financieras o Driver Finance`);
  }
});

// ---------------------------------------------------------------------------
// Permisos: nada al arrancar
// ---------------------------------------------------------------------------

test('NO se piden permisos al arrancar', () => {
  // Un permiso pedido nada más abrir, sin contexto, se deniega — y una vez
  // denegado, volverlo a pedir cuesta mucho más. Cada permiso se pedirá cuando
  // la función que lo necesita esté a la vista.
  const prohibido = /requestForegroundPermissions|requestBackgroundPermissions|requestPermissionsAsync|getCurrentPositionAsync|watchPositionAsync/;
  for (const { relativa, contenido } of ficherosDelMovil()) {
    assert.equal(prohibido.test(soloCodigo(contenido)), false,
      `${relativa} pide permisos`);
  }
});

test('no hay GPS en segundo plano ni registro de notificaciones', () => {
  const paquete = JSON.parse(fs.readFileSync(path.join(raizMovil, 'package.json'), 'utf8'));
  const dependencias = Object.keys(paquete.dependencies ?? {});
  for (const nombre of ['expo-location', 'expo-notifications', 'expo-task-manager']) {
    assert.equal(dependencias.includes(nombre), false,
      `${nombre} no corresponde a esta fase`);
  }
});

// ---------------------------------------------------------------------------
// Mapas: decisión aplazada
// ---------------------------------------------------------------------------

test('no se ha elegido proveedor de mapas', () => {
  // Google Navigation SDK frente a Mapbox sigue sin decidirse. Instalar uno
  // ahora sería tomar la decisión por la puerta de atrás.
  const paquete = JSON.parse(fs.readFileSync(path.join(raizMovil, 'package.json'), 'utf8'));
  const todas = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  for (const nombre of todas) {
    assert.equal(/mapbox|react-native-maps|google-maps/i.test(nombre), false,
      `proveedor de mapas instalado sin decisión: ${nombre}`);
  }
});

// ---------------------------------------------------------------------------
// Secretos
// ---------------------------------------------------------------------------

test('la configuración de la app no lleva secretos', () => {
  // Todo `EXPO_PUBLIC_*` queda incrustado en el paquete instalable y se puede
  // leer descompilándolo.
  const app = fs.readFileSync(path.join(raizMovil, 'app.json'), 'utf8');
  const prohibido = /(secret|password|apiKey|api_key|token|privateKey|JWT_SECRET)\s*"?\s*:/i;
  assert.equal(prohibido.test(app), false, 'app.json contiene algo con pinta de secreto');
});

test('los identificadores de app son coherentes entre plataformas', () => {
  const app = JSON.parse(fs.readFileSync(path.join(raizMovil, 'app.json'), 'utf8'));
  assert.equal(app.expo.ios.bundleIdentifier, app.expo.android.package,
    'iOS y Android comparten identificador');
  assert.match(app.expo.ios.bundleIdentifier, /^com\.[a-z0-9]+\.[a-z0-9]+$/);
  assert.equal(app.expo.name, '+58Express');
});

// ---------------------------------------------------------------------------
// Enlaces profundos
// ---------------------------------------------------------------------------

test('hay un esquema propio declarado', () => {
  const app = JSON.parse(fs.readFileSync(path.join(raizMovil, 'app.json'), 'utf8'));
  assert.equal(app.expo.scheme, 'plus58express');
});

test('ninguna ruta ejecuta una acción financiera', () => {
  // Un enlace nunca debe aprobar un retiro, cambiar un rol privilegiado ni
  // marcar un viaje como completo. Hoy sólo hay rutas de navegación, y esta
  // prueba lo mantiene así.
  const rutas = fs.readdirSync(path.join(raizMovil, 'app'))
    .filter(nombre => /\.tsx$/.test(nombre))
    .map(nombre => nombre.replace(/\.tsx$/, ''));

  const prohibidas = /payout|approve|withdraw|pay|settle|complete|admin/i;
  for (const ruta of rutas) {
    assert.equal(prohibidas.test(ruta), false, `ruta con nombre de acción sensible: ${ruta}`);
  }
});

// ---------------------------------------------------------------------------
// Contratos compartidos
// ---------------------------------------------------------------------------

test('los contratos se REUTILIZAN, no se copian', () => {
  const sesion = fs.readFileSync(path.join(raizMovil, 'services/session.ts'), 'utf8');
  const api = fs.readFileSync(path.join(raizMovil, 'services/api.ts'), 'utf8');

  assert.match(sesion, /shared\/contracts\/domain/, 'los roles vienen del contrato compartido');
  assert.match(api, /shared\/contracts\/api/, 'la forma del error viene del contrato compartido');

  // Y no hay una copia local de lo que ya existe.
  assert.equal(fs.existsSync(path.join(raizMovil, 'contracts')), false,
    'no debe haber una carpeta de contratos duplicada en el móvil');
});
