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
  const carpetas = ['app', 'components', 'config', 'context', 'domain', 'services', 'theme'];
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
  // Esta prueba prohibía `expo-location` entero. Ya no: el dueño autorizó
  // la ubicación en primer plano, que es la que se ve y se explica sola.
  //
  // Lo que sigue vedado es medir con la aplicación cerrada, que es donde
  // están la batería y el consentimiento de verdad: `expo-task-manager` es
  // la pieza que hace falta para eso, y no está.
  const paquete = JSON.parse(fs.readFileSync(path.join(raizMovil, 'package.json'), 'utf8'));
  const dependencias = Object.keys(paquete.dependencies ?? {});
  for (const nombre of ['expo-notifications', 'expo-task-manager', 'expo-background-fetch']) {
    assert.equal(dependencias.includes(nombre), false,
      `${nombre} no corresponde a esta fase`);
  }
});

// ---------------------------------------------------------------------------
// Mapas: decisión aplazada
// ---------------------------------------------------------------------------

test('el proveedor de mapas es el que el dueño eligió, y sólo ese', () => {
  // La prueba anterior prohibía CUALQUIER proveedor porque la decisión estaba
  // abierta. El dueño eligió Google con `react-native-maps`, así que lo que se
  // protege ahora es que no entre un SEGUNDO proveedor por la puerta de atrás:
  // dos mapas en la misma aplicación son dos facturas y dos aspectos.
  const paquete = JSON.parse(fs.readFileSync(path.join(raizMovil, 'package.json'), 'utf8'));
  const todas = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });

  for (const nombre of todas) {
    assert.equal(/mapbox|maplibre|expo-maps|leaflet/i.test(nombre), false,
      `segundo proveedor de mapas instalado: ${nombre}`);
  }
  assert.ok(todas.includes('react-native-maps'), 'falta el proveedor elegido');
  // Fijada: un `npm install` limpio no puede traer otra versión que la probada
  // contra este SDK de Expo.
  assert.match(paquete.dependencies['react-native-maps'], /^\d+\.\d+\.\d+$/);
});

test('la clave del SERVIDOR no aparece en el cliente', () => {
  // `DISPATCH_ROUTES_API_KEY` calcula rutas en el despacho y no tiene
  // restricción de referente: publicada en una aplicación es una factura
  // abierta. Sólo puede nombrarse para prohibirla.
  const carpetas = ['app', 'mapa', 'domain', 'services', 'realtime', 'ui', 'preview', 'config'];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      // El fichero de claves lo NOMBRA para declararlo prohibido.
      if (completa.endsWith(path.join('mapa', 'claves.ts'))) continue;

      assert.equal(
        /DISPATCH_ROUTES_API_KEY/.test(fs.readFileSync(completa, 'utf8')), false,
        `${carpeta}/${nombre} menciona la clave del servidor`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Secretos
// ---------------------------------------------------------------------------

test('la configuración de la app no lleva secretos', () => {
  // Todo `EXPO_PUBLIC_*` queda incrustado en el paquete instalable y se puede
  // leer descompilándolo.
  const app = fs.readFileSync(path.join(raizMovil, 'app.json'), 'utf8');

  // Las claves de Google se declaran por REFERENCIA -`$EXPO_PUBLIC_...`-, no
  // por valor: Expo las sustituye al construir y el fichero no lleva ninguna.
  // Esas referencias se descuentan antes de buscar secretos; cualquier otro
  // `apiKey` con un valor de verdad sigue estando prohibido.
  const sinReferencias = app.replace(/"\$EXPO_PUBLIC_[A-Z0-9_]+"/g, '"<referencia>"');

  const prohibido = /(secret|password|api_key|token|privateKey|JWT_SECRET)\s*"?\s*:/i;
  assert.equal(prohibido.test(sinReferencias), false, 'app.json contiene algo con pinta de secreto');

  // Y ninguna clave literal de Google: siempre empiezan por `AIza`.
  assert.equal(/AIza[0-9A-Za-z_-]{10,}/.test(app), false, 'hay una clave de Google escrita en app.json');
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
