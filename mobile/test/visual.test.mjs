import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios, ficherosDelLaboratorio } from './ayudas.mjs';

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

// Las pruebas que buscan algo PROHIBIDO leen el código sin comentarios: si no,
// lo encuentran en el propio comentario que explica por qué está prohibido.
const sinComentarios = relativa => despojarComentarios(leer(relativa));
const ficheros = () => ficherosDelLaboratorio(raizMovil);

// ---------------------------------------------------------------------------
// Las tres direcciones
// ---------------------------------------------------------------------------

test('existen exactamente cuatro direcciones', () => {
  // C2 se suma; A, B y C NO se retiran. El dueño todavía no ha decidido, y sin
  // las anteriores no habría contra qué comparar la refinada.
  assert.deepEqual([...DIRECCIONES], ['A', 'B', 'C', 'C2']);
  for (const clave of DIRECCIONES) assert.ok(CATALOGO[clave], clave);
});

test('la recomendada es C2', () => {
  assert.equal(DIRECCION_RECOMENDADA, 'C2');
});

test('C2 conserva EXACTAMENTE la identidad de C', () => {
  // El contrato de preservación en forma de prueba. C2 refina composición,
  // aire y jerarquía; la paleta es intocable. Si alguien «mejora» el amarillo
  // o el grafito dentro de C2, la marca deja de ser la misma y esto salta.
  assert.deepEqual(CATALOGO.C2.color, CATALOGO.C.color);
  assert.equal(CATALOGO.C2.presenciaDelAcento, 'firma');
  assert.equal(CATALOGO.C2.color.acento, '#ffd21f');
});

test('C2 respira más que C por dentro, sin robarle alto al mapa', () => {
  // El aire de A entra donde se nota y no donde cuesta: dentro de las
  // superficies, no en los márgenes exteriores. Con el mapa de fondo, cada
  // punto de margen exterior es un punto menos de mapa.
  assert.ok(CATALOGO.C2.ritmo.dentroDeTarjeta > CATALOGO.C.ritmo.dentroDeTarjeta);
  assert.ok(CATALOGO.C2.ritmo.entreElementos > CATALOGO.C.ritmo.entreElementos);
  assert.equal(CATALOGO.C2.ritmo.margenPantalla, CATALOGO.C.ritmo.margenPantalla);
  assert.equal(CATALOGO.C2.ritmo.entreBloques, CATALOGO.C.ritmo.entreBloques);
});

test('C2 no lleva borde en las superficies', () => {
  // Es lo que desactiva la sopa de tarjetas: sin un contorno gris por
  // elemento, la única línea que pide atención es la amarilla.
  assert.equal(CATALOGO.C2.superficie.conBorde, false);
});

test('C2 lee mejor de reojo que C', () => {
  // Lo único que se toma de B: las etiquetas se leen en movimiento y con sol.
  assert.ok(CATALOGO.C2.texto.etiqueta.tamano > CATALOGO.C.texto.etiqueta.tamano);
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

test('cada dirección tiene carácter DISTINTO, ninguna es otra con otro nombre', () => {
  // Si dos direcciones coincidieran en ritmo y radios, comparar no serviría de
  // nada.
  //
  // La huella incluye el relleno interior, el aire entre elementos, el borde y
  // el cuerpo de etiqueta a propósito: son justo los cuatro valores donde C2 se
  // separa de C. Con la huella antigua —márgenes, radio y display— C y C2 se
  // distinguían sólo por un punto de radio, y la prueba habría pasado casi por
  // casualidad sin mirar lo que de verdad cambió.
  const huella = tema => [
    tema.ritmo.margenPantalla,
    tema.ritmo.entreBloques,
    tema.ritmo.dentroDeTarjeta,
    tema.ritmo.entreElementos,
    tema.radio.tarjeta,
    tema.texto.display.tamano,
    tema.texto.etiqueta.tamano,
    tema.superficie.conBorde
  ].join('-');
  const huellas = DIRECCIONES.map(clave => huella(CATALOGO[clave]));
  assert.equal(
    new Set(huellas).size,
    DIRECCIONES.length,
    'hay direcciones que son visualmente idénticas'
  );
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

test('el laboratorio es alcanzable desde la aplicacion', () => {
  // Una ruta que nada enlaza no existe desde el telefono: habria que escribir
  // la direccion a mano en Expo Go. La primera version puso la puerta solo en
  // la pantalla de «falta configurar el servidor», y desaparecia justo cuando
  // alguien creaba su .env y la aplicacion empezaba a funcionar.
  for (const pantalla of ['app/rol.tsx', 'app/acceso.tsx']) {
    assert.match(leer(pantalla), /<AtajoAlLaboratorio \/>/, `${pantalla} no enlaza el laboratorio`);
  }
  // Dos puertas: el recorrido de la aplicacion navegable y el laboratorio de
  // pantallas sueltas. La primera es la forma normal de mirar el diseno desde
  // que la aplicacion se puede recorrer; la segunda sigue siendo comoda para
  // comparar dos estados de la misma pantalla.
  const atajo = leer('components/AtajoAlLaboratorio.tsx');
  assert.match(atajo, /a="\/diseno"/, 'no enlaza el recorrido de la aplicacion');
  assert.match(atajo, /a="\/preview"/, 'no enlaza el laboratorio');
});

test('se puede SALIR del laboratorio', () => {
  // Se llega por la ruta —y hay a donde volver— o montado desde la pantalla de
  // configuracion faltante, donde el router ni existe. Sin preguntar antes,
  // salir desde el segundo caso reventaria.
  const preview = leer('app/preview.tsx');
  assert.match(preview, /router\.canGoBack\(\)/, 'pregunta si hay a donde volver');
  assert.match(preview, /router\.back\(\)/);
});

test('las TRES puertas al laboratorio están cerradas en produccion', () => {
  // Hay dos formas de llegar: la ruta /preview y el atajo de la pantalla de
  // «falta configurar el servidor». Las dos tienen que comprobar el modo
  // desarrollo; cerrar sólo una deja la otra abierta en una version publicada.
  const preview = leer('app/preview.tsx');
  assert.match(preview, /__DEV__/, 'la ruta comprueba el modo desarrollo');
  assert.match(preview, /if \(!EN_DESARROLLO\) return/,
    'sale antes de montar cualquier pantalla de preview');

  const atajo = leer('components/AtajoAlLaboratorio.tsx');
  assert.match(atajo, /__DEV__/, 'el atajo comprueba el modo desarrollo');
  assert.match(atajo, /if \(!EN_DESARROLLO\) return null/,
    'fuera de desarrollo no dibuja ni el boton');

  const raiz = leer('app/_layout.tsx');
  assert.match(raiz, /__DEV__/, 'la puerta del aviso comprueba el modo desarrollo');
  assert.match(raiz, /verLaboratorio && EN_DESARROLLO/,
    'el atajo no monta el laboratorio fuera de desarrollo');
  assert.match(raiz, /EN_DESARROLLO \? \(/,
    'el boton del atajo tampoco se dibuja fuera de desarrollo');
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
      // El laboratorio y el recorrido de diseño SÍ pueden importarlos: son sus
      // únicos consumidores, los dos se apagan en release y ninguno llama a
      // ninguna API. Las rutas REALES siguen sin poder tocarlos, que es de lo
      // que trata esta prueba.
      if (relativa === 'app/preview.tsx') continue;
      if (relativa.startsWith('app/diseno/')) continue;
      assert.equal(
        /from ['"][^'"]*preview\/fixtures/.test(fs.readFileSync(completa, 'utf8')), false,
        `${relativa} importa datos de demostración`
      );
    }
  }
});

test('el recorrido de diseño está CERRADO en release', () => {
  // Es la condición que hace aceptable la excepción de arriba. Un recorrido
  // que enseña saldos, viajes y comercios de ejemplo no puede quedar
  // alcanzable en una aplicación publicada: quien llegue por un enlace no
  // tiene forma de saber que lo que ve es mentira.
  const layout = leer('app/diseno/_layout.tsx');
  assert.match(layout, /__DEV__/, 'el recorrido no comprueba que esté en desarrollo');
  assert.match(layout, /Redirect href="\/"/, 'en release no redirige fuera');
});

test('el recorrido de diseño no llama a NINGUNA API', () => {
  // Por la misma razón que el laboratorio: se abre sin servidor, y si llamara
  // a algo lo haría contra la base que tuviera configurada quien lo abriera.
  const carpeta = path.join(raizMovil, 'app/diseno');
  for (const nombre of fs.readdirSync(carpeta, { recursive: true })) {
    const completa = path.join(carpeta, String(nombre));
    if (!fs.statSync(completa).isFile() || !/\.(ts|tsx)$/.test(completa)) continue;
    const codigo = despojarComentarios(fs.readFileSync(completa, 'utf8'));
    for (const prohibido of ['fetch(', 'XMLHttpRequest', 'services/', 'SecureStore']) {
      assert.ok(
        !codigo.includes(prohibido),
        `app/diseno/${nombre} usa ${prohibido}`
      );
    }
  }
});

test('cada destino de la barra tiene una ruta a la que ir', () => {
  // Una pestaña que no lleva a ninguna parte se toca una vez y no se vuelve a
  // tocar. Esto comprueba que las cuatro de cada rol estén mapeadas.
  const rutas = leer('navegacion/rutas.ts');
  const navegacion = leer('ui/Navegacion.tsx');

  const claves = [...navegacion.matchAll(/clave: '([a-z-]+)'/g)].map(coincidencia => coincidencia[1]);
  assert.ok(claves.length >= 8, `sólo se encontraron ${claves.length} destinos`);

  for (const clave of claves) {
    // El mapa nombra los del conductor con prefijo para no chocar con los de
    // la pasajera: «historial» es de ella, «conductor-saldo» es de él.
    const mapeada = rutas.includes(`${clave}:`) || rutas.includes(`'${clave}'`)
      || rutas.includes(`conductor-${clave}`) || clave === 'mapa';
    assert.ok(mapeada, `el destino «${clave}» no tiene ruta`);
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

test('el laboratorio recorre TODOS sus ficheros en las comprobaciones', () => {
  // Las comprobaciones de abajo listaban tres ficheros a mano, así que cada
  // pantalla nueva quedaba sin vigilar hasta que alguien se acordara de
  // añadirla. Ahora se descubren solas; esta prueba avisa si la carpeta se
  // queda vacía por un cambio de estructura.
  const encontrados = ficheros();
  assert.ok(encontrados.length >= 4, `sólo se encontraron ${encontrados.length} ficheros`);
  assert.ok(encontrados.includes('preview/pantallasC2.tsx'));
  assert.ok(encontrados.includes('preview/pantallasC2Secciones.tsx'));
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
  // El laboratorio NO puede crear autoridad: ni marcar una sesión como
  // autenticada, ni escribir en el almacén seguro, ni fabricar un token. Lo que
  // enseña son fixtures, y tienen que quedarse en fixtures.
  for (const relativa of ficheros()) {
    const codigo = sinComentarios(relativa);
    assert.equal(/AuthContext|useSesion|SecureStore|guardarToken|setItemAsync/.test(codigo), false,
      `${relativa} toca la sesión real`);
    assert.equal(/wallet\/payouts|WALLET_PAYOUTS_ENABLED|driverFinance/i.test(codigo), false,
      `${relativa} toca finanzas`);
  }
});

test('el laboratorio no escribe en el almacén seguro', () => {
  // Comprobación aparte porque es la que más caro sale equivocarse: una sesión
  // escrita desde una maqueta sobreviviría al cierre de la aplicación.
  for (const relativa of ficheros()) {
    const codigo = sinComentarios(relativa);
    for (const prohibido of ['expo-secure-store', 'AsyncStorage', 'services/session']) {
      assert.equal(codigo.includes(prohibido), false, `${relativa} importa ${prohibido}`);
    }
  }
});

test('el saldo no enseña NINGUNA cifra', () => {
  // La cartera está apagada en el servidor. Incluso «$0,00» afirmaría que la
  // cuenta existe y está a cero; cualquier otra cosa sería inventar dinero.
  const saldo = leer('preview/pantallasC2Secciones.tsx');
  const seccion = saldo.slice(saldo.indexOf('export function C2Saldo'), saldo.indexOf('// Historial'));
  assert.doesNotMatch(seccion, /\$\s?\d/, 'la pantalla de saldo enseña una cifra');
  assert.doesNotMatch(seccion, /Bs\.\s?\d/, 'la pantalla de saldo enseña bolívares');
  assert.match(seccion, /Todavía no está activa/);
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

test('el mapa del recorrido de diseño sigue siendo una superficie sustituible', () => {
  // Lo que esta prueba protegía —que nadie eligiera proveedor a escondidas— ya
  // no aplica: el dueño eligió Google. Lo que sigue importándo es que el
  // recorrido de diseño NO dependa de él: es una maqueta, no habla con ningún
  // servidor y no debe abrir Google ni pedir una clave para poder mirarse.
  assert.match(leer('ui/componentes.tsx'), /MapaSimulado/);

  // El lienzo pinta Google sólo cuando alguien le pasa un modelo con
  // coordenadas, y el recorrido no tiene ninguna: sus vehículos están en
  // porcentajes de pantalla.
  assert.match(leer('ui/Mapa.tsx'), /modelo === undefined \? <Calles \/>/);
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
