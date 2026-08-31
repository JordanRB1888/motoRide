import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOGO, DIRECCIONES, DIRECCION_RECOMENDADA } from '../theme/directions.ts';
import { AMARILLO, GRAFITO, AREA_TACTIL_MINIMA } from '../theme/primitives.ts';

/**
 * VISUAL-PREVIEW-1 — la dirección visual.
 *
 * No se comprueba «que se vea bonito», que no es comprobable. Se comprueban las
 * reglas que, de romperse, no darían ningún error: que las tres direcciones
 * compartan estructura, que la marca no se pierda, que la preview no llegue a
 * una versión publicada y que los datos de demostración no se filtren a la
 * aplicación real.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

// ---------------------------------------------------------------------------
// Las tres direcciones
// ---------------------------------------------------------------------------

test('existen exactamente tres direcciones', () => {
  assert.deepEqual([...DIRECCIONES], ['A', 'B', 'C']);
  for (const clave of DIRECCIONES) assert.ok(CATALOGO[clave], clave);
});

test('la recomendada es C', () => {
  assert.equal(DIRECCION_RECOMENDADA, 'C');
});

test('las tres comparten la MISMA estructura de tokens', () => {
  // Es lo que hace que la comparación sea justa: mismas pantallas, mismos
  // datos, sólo cambia el carácter. Si una dirección tuviera tokens propios,
  // habría que escribir pantallas propias para ella.
  const forma = tema => ({
    color: Object.keys(tema.color).sort(),
    ritmo: Object.keys(tema.ritmo).sort(),
    radio: Object.keys(tema.radio).sort(),
    texto: Object.keys(tema.texto).sort()
  });

  const referencia = forma(CATALOGO.A);
  for (const clave of ['B', 'C']) {
    assert.deepEqual(forma(CATALOGO[clave]), referencia,
      `la dirección ${clave} no tiene la misma estructura que A`);
  }
});

test('las tres conservan el amarillo de la marca', () => {
  // La identidad no se negocia entre direcciones: lo que cambia es cuánto se
  // usa, no cuál es.
  for (const clave of DIRECCIONES) {
    assert.equal(CATALOGO[clave].color.acento, AMARILLO.base,
      `la dirección ${clave} cambió el amarillo de marca`);
    assert.equal(CATALOGO[clave].color.sobreAcento, AMARILLO.tinta,
      `la dirección ${clave} escribe sobre el amarillo con otro color`);
  }
});

test('ninguna usa negro puro como fondo', () => {
  // El negro absoluto aplasta la profundidad y produce bordes duros en OLED.
  for (const clave of DIRECCIONES) {
    const fondo = CATALOGO[clave].color.fondo.toLowerCase();
    assert.notEqual(fondo, '#000000', clave);
    assert.notEqual(fondo, '#000', clave);
  }
});

test('cada dirección tiene profundidad: varias superficies distintas', () => {
  // Si fondo, superficie y elevada fueran iguales, no habría jerarquía posible.
  for (const clave of DIRECCIONES) {
    const { fondo, superficie, superficieElevada, borde } = CATALOGO[clave].color;
    const distintos = new Set([fondo, superficie, superficieElevada, borde]);
    assert.equal(distintos.size, 4, `la dirección ${clave} no diferencia sus superficies`);
  }
});

test('las tres tienen carácter DISTINTO, no son la misma con otro nombre', () => {
  // Si dos direcciones coincidieran en ritmo y radios, comparar no serviría de
  // nada.
  const huella = tema => `${tema.ritmo.margenPantalla}-${tema.ritmo.entreBloques}-${tema.radio.tarjeta}-${tema.texto.display.tamano}`;
  const huellas = DIRECCIONES.map(clave => huella(CATALOGO[clave]));
  assert.equal(new Set(huellas).size, 3, 'hay direcciones que son visualmente idénticas');
});

test('la presencia del acento va de menos a más', () => {
  assert.equal(CATALOGO.A.presenciaDelAcento, 'reservada');
  assert.equal(CATALOGO.B.presenciaDelAcento, 'presente');
  // La firma de identidad: el filo amarillo, sólo en C.
  assert.equal(CATALOGO.C.presenciaDelAcento, 'firma');
});

// ---------------------------------------------------------------------------
// Reglas de legibilidad en la calle
// ---------------------------------------------------------------------------

test('el cuerpo de texto nunca baja de 15 puntos', () => {
  // Esto se usa al sol, en movimiento y con teléfonos económicos.
  for (const clave of DIRECCIONES) {
    assert.ok(CATALOGO[clave].texto.cuerpo.tamano >= 15,
      `la dirección ${clave} tiene el cuerpo demasiado pequeño`);
  }
});

test('el área táctil mínima sigue siendo 48', () => {
  assert.equal(AREA_TACTIL_MINIMA, 48);
  const componentes = leer('ui/componentes.tsx');
  assert.match(componentes, /AREA_TACTIL_MINIMA/);
});

test('las sombras son contenidas', () => {
  // La profundidad viene del contraste entre superficies. Una sombra fuerte en
  // Android se ve sucia.
  for (const clave of DIRECCIONES) {
    const { sombra } = CATALOGO[clave].superficie;
    assert.ok(sombra.shadowOpacity <= 0.35, `${clave}: sombra demasiado marcada`);
    assert.ok(sombra.elevation <= 6, `${clave}: elevación demasiado alta`);
  }
});

// ---------------------------------------------------------------------------
// La preview NO puede llegar a una versión publicada
// ---------------------------------------------------------------------------

test('el laboratorio está protegido por __DEV__', () => {
  const preview = leer('app/preview.tsx');
  assert.match(preview, /__DEV__/, 'la ruta comprueba el modo desarrollo');
  assert.match(preview, /if \(!EN_DESARROLLO\) return/,
    'sale antes de montar cualquier pantalla de preview');
});

test('los datos de demostración NO llegan a la aplicación real', () => {
  // Unos datos de demostración que acaban como respaldo en tiempo de ejecución
  // son la forma más silenciosa de enseñar información falsa como verdadera.
  const carpetas = ['app', 'components', 'config', 'context', 'domain', 'services', 'ui'];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.(ts|tsx)$/.test(completa)) continue;
      const relativa = path.relative(raizMovil, completa).replace(/\\/g, '/');
      // La ruta del laboratorio SÍ puede importarlos: es su único consumidor.
      if (relativa === 'app/preview.tsx') continue;
      assert.equal(
        /from ['"][^'"]*preview\/fixtures/.test(fs.readFileSync(completa, 'utf8')), false,
        `${relativa} importa datos de demostración`
      );
    }
  }
});

test('los datos de demostración son OBVIAMENTE ficticios', () => {
  // Si una captura acaba en una presentación, no debe parecerse a la
  // información de una persona real.
  const fixtures = leer('preview/fixtures.ts');
  // Nada con pinta de teléfono venezolano real ni de cédula.
  assert.equal(/04\d{2}[\s-]?\d{7}/.test(fixtures), false, 'hay algo con forma de teléfono real');
  assert.equal(/\bV-?\d{7,8}\b/.test(fixtures), false, 'hay algo con forma de cédula');
  // Y los nombres se identifican como demostración.
  assert.match(fixtures, /Demo/);
});

test('la preview no llama a NINGUNA API', () => {
  for (const relativa of ['preview/pantallas.tsx', 'preview/fixtures.ts', 'app/preview.tsx']) {
    const codigo = leer(relativa)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.equal(/\bfetch\(|from ['"].*services\/api|llamar\(/.test(codigo), false,
      `${relativa} llama a la red`);
  }
});

test('la preview no toca autenticación ni finanzas', () => {
  for (const relativa of ['preview/pantallas.tsx', 'preview/fixtures.ts', 'app/preview.tsx']) {
    const codigo = leer(relativa);
    assert.equal(/AuthContext|useSesion|SecureStore|guardarToken/.test(codigo), false,
      `${relativa} toca la sesión real`);
    assert.equal(/wallet\/payouts|WALLET_PAYOUTS_ENABLED|driverFinance/i.test(codigo), false,
      `${relativa} toca finanzas`);
  }
});

test('la cifra de saldo del conductor NO se inventa', () => {
  // La cartera está apagada en el backend. Enseñar un número como si fuera real
  // sería mentir.
  const fixtures = leer('preview/fixtures.ts');
  assert.match(fixtures, /resumen: '—'/, 'el saldo se muestra vacío');
  assert.match(fixtures, /nota:/, 'y con una nota que lo explica');
});

// ---------------------------------------------------------------------------
// La lógica real de Wave 1 sigue intacta
// ---------------------------------------------------------------------------

test('la pantalla de acceso REAL conserva su lógica', () => {
  const acceso = leer('app/acceso.tsx');
  assert.match(acceso, /useSesion/, 'sigue usando el contexto de sesión real');
  assert.match(acceso, /secureTextEntry/);
  assert.match(acceso, /setContrasena\(''\)/, 'sigue limpiando la contraseña');
  assert.match(acceso, /experienciaDeLaIdentidad/, 'el destino lo decide el backend');
  // Y no se ha colado ningún dato de demostración en la pantalla real.
  assert.equal(/preview\/fixtures/.test(acceso), false);
});

test('no se eligió proveedor de mapas', () => {
  // Google Navigation SDK frente a Mapbox sigue sin decidirse.
  const paquete = JSON.parse(leer('package.json'));
  const todas = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  for (const nombre of todas) {
    assert.equal(/mapbox|react-native-maps|google-maps/i.test(nombre), false,
      `proveedor de mapas instalado: ${nombre}`);
  }
  // Y el mapa de la preview es una superficie sustituible, no un proveedor.
  assert.match(leer('ui/componentes.tsx'), /MapaSimulado/);
});

// ---------------------------------------------------------------------------
// Identidad propia: ni Cabify ni Yummy
// ---------------------------------------------------------------------------

test('no se copió literalmente ninguna referencia', () => {
  // Las referencias son ideas sobre espacio y densidad, no activos que copiar.
  const ficheros = ['theme/directions.ts', 'theme/primitives.ts', 'ui/componentes.tsx',
    'preview/pantallas.tsx'];
  // Los colores corporativos de las referencias no aparecen en ninguna parte.
  const ajenos = ['#7b16ff', '#6c2bd9', '#00d68f', '#f5a623'];
  for (const relativa of ficheros) {
    const codigo = leer(relativa).toLowerCase();
    for (const color of ajenos) {
      assert.equal(codigo.includes(color), false, `${relativa} usa un color ajeno: ${color}`);
    }
    // Ni sus nombres como marca dentro del código.
    const sinComentarios = codigo
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.equal(/cabify|yummy/.test(sinComentarios), false,
      `${relativa} nombra una referencia en el código`);
  }
});

test('la marca sigue siendo +58Express', () => {
  const app = JSON.parse(leer('app.json'));
  assert.equal(app.expo.name, '+58Express');
  assert.equal(app.expo.backgroundColor.toLowerCase(), GRAFITO.fondo);
  // Y los assets oficiales no se tocaron.
  assert.ok(fs.existsSync(path.join(raizMovil, 'assets/icon.png')));
  assert.ok(fs.existsSync(path.join(raizMovil, 'assets/splash-icon.png')));
});

test('no se introdujo ninguna fuente nueva', () => {
  // La elección tipográfica todavía no está tomada; se usa la del sistema, que
  // además es la que mejor rinde en teléfonos económicos.
  const paquete = JSON.parse(leer('package.json'));
  const todas = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  for (const nombre of todas) {
    assert.equal(/expo-font|@expo-google-fonts|react-native-vector-icons/i.test(nombre), false,
      `fuente o iconos externos: ${nombre}`);
  }
});
