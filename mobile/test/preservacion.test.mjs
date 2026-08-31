/**
 * El contrato de preservación visual, en forma de pruebas.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 *
 * Los vehículos amarillos, el emblema, el logotipo y el control de
 * disponibilidad no son ilustraciones: son las piezas por las que +58express se
 * reconoce. Y son exactamente el tipo de cosa que se pierde sin que nadie lo
 * decida — alguien sustituye una fotografía por un pictograma «mientras tanto»,
 * el pictograma se queda, y seis meses después la aplicación parece una
 * plantilla.
 *
 * Aquí se comprueba que siguen ahí, que no se han deformado y que nadie los ha
 * cambiado por un icono genérico o un emoji. Si una fase futura decide quitar
 * alguno, tendrá que borrar la prueba a propósito, que es justo lo que se
 * quiere: que sea una decisión y no un descuido.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizWeb = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

// Ver `test/ayudas.mjs`: las pruebas que buscan algo PROHIBIDO leen el código
// sin comentarios, porque explicar por qué algo no está obliga a nombrarlo.
const sinComentarios = relativa => despojarComentarios(leer(relativa));

/** Lee el ancho y el alto de la cabecera de un PNG, sin decodificarlo. */
function medidasDePng(rutaAbsoluta) {
  const cabecera = Buffer.alloc(24);
  const descriptor = fs.openSync(rutaAbsoluta, 'r');
  try {
    fs.readSync(descriptor, cabecera, 0, 24, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  assert.equal(cabecera.subarray(1, 4).toString('ascii'), 'PNG', `${rutaAbsoluta} no es un PNG`);
  return { ancho: cabecera.readUInt32BE(16), alto: cabecera.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------
// Los activos están, y son los de la web
// ---------------------------------------------------------------------------

/**
 * Cada activo del móvil, con el original del que sale y el factor por el que se
 * redujo. Factor 1 significa «los mismos píxeles».
 */
const ACTIVOS = [
  { movil: 'assets/marca/moto.png', web: 'public/vehicles/moto-real.png', factor: 1 },
  { movil: 'assets/marca/auto.png', web: 'public/vehicles/car-real.png', factor: 1 },
  { movil: 'assets/marca/moto-mapa.png', web: 'public/vehicles/moto-map-real.png', factor: 1 },
  { movil: 'assets/marca/auto-mapa.png', web: 'public/vehicles/car-map-real.png', factor: 1 },
  { movil: 'assets/marca/logo-horizontal.png', web: 'public/brand-logo-header.png', factor: 2 }
];

test('los activos de marca están en el móvil', () => {
  for (const activo of ACTIVOS) {
    const ruta = path.join(raizMovil, activo.movil);
    assert.ok(fs.existsSync(ruta), `falta ${activo.movil}`);
  }
  assert.ok(fs.existsSync(path.join(raizMovil, 'assets/splash-icon.png')), 'falta el emblema');
});

test('ningún activo se deformó al traerlo', () => {
  // La proporción es lo que hay que proteger: una moto estirada deja de ser la
  // moto de la marca. Reducir a la mitad exacta la conserva; cualquier otro
  // recorte o ajuste la rompería y aquí se vería.
  for (const activo of ACTIVOS) {
    const original = medidasDePng(path.join(raizWeb, activo.web));
    const copia = medidasDePng(path.join(raizMovil, activo.movil));

    assert.equal(copia.ancho, original.ancho / activo.factor, `${activo.movil}: ancho`);
    assert.equal(copia.alto, original.alto / activo.factor, `${activo.movil}: alto`);
    assert.equal(
      copia.ancho / copia.alto,
      original.ancho / original.alto,
      `${activo.movil}: la proporción cambió`
    );
  }
});

test('las proporciones declaradas en el código son las reales de los archivos', () => {
  // `marca.ts` reserva el hueco de cada imagen a partir de estos números. Si el
  // archivo se cambia por otro de distinta forma y el número no, la imagen sale
  // aplastada — y no lo vería nadie hasta tener el teléfono delante.
  const fuente = leer('theme/marca.ts');

  const moto = medidasDePng(path.join(raizMovil, 'assets/marca/moto.png'));
  assert.match(fuente, new RegExp(`proporcionDeTarjeta: ${moto.ancho} / ${moto.alto}`));

  const logo = medidasDePng(path.join(raizMovil, 'assets/marca/logo-horizontal.png'));
  assert.match(fuente, new RegExp(`PROPORCION_DEL_LOGO = ${logo.ancho} / ${logo.alto}`));
});

test('los vehículos mantienen sus dos tomas, y no se confunden', () => {
  // La cenital es cuadrada porque gira sobre su centro para apuntar al rumbo;
  // la de tres cuartos es apaisada. Usar una por otra daría o una moto de
  // perfil que siempre mira a la derecha, o una moto deformada en el selector.
  for (const nombre of ['moto-mapa.png', 'auto-mapa.png']) {
    const medidas = medidasDePng(path.join(raizMovil, 'assets/marca', nombre));
    assert.equal(medidas.ancho, medidas.alto, `${nombre} debe ser cuadrada para poder girar`);
  }
  for (const nombre of ['moto.png', 'auto.png']) {
    const medidas = medidasDePng(path.join(raizMovil, 'assets/marca', nombre));
    assert.ok(medidas.ancho > medidas.alto, `${nombre} es la toma de tarjeta, apaisada`);
  }
});

test('el paquete de marca no se desmadra de tamaño', () => {
  // Son fotografías y pesan; el objetivo no es que no pesen nada, sino que
  // nadie meta un PNG de varios megas sin darse cuenta. El teléfono al que va
  // esto es un Android modesto con datos caros.
  const carpeta = path.join(raizMovil, 'assets/marca');
  const total = fs.readdirSync(carpeta)
    .reduce((suma, nombre) => suma + fs.statSync(path.join(carpeta, nombre)).size, 0);
  assert.ok(total < 1_100_000, `los activos de marca pesan ${Math.round(total / 1024)} KB`);
});

// ---------------------------------------------------------------------------
// Nadie los sustituyó por algo genérico
// ---------------------------------------------------------------------------

test('el selector de servicio usa los vehículos REALES', () => {
  const fuente = leer('ui/Servicio.tsx');
  assert.match(fuente, /<Vehiculo/, 'el selector debe pintar el vehículo de marca');
  assert.doesNotMatch(fuente, /nombre="moto"/, 'un pictograma no sustituye a la fotografía');
});

test('el marcador del mapa es la moto, no un pin genérico', () => {
  const mapa = leer('ui/Mapa.tsx');
  assert.match(mapa, /MarcadorDeVehiculo/, 'el mapa debe pintar el vehículo de marca');

  const marca = leer('ui/Marca.tsx');
  // La cenital, y girada según el rumbo: es lo que la distingue de una chincheta.
  assert.match(marca, /vehiculo\.mapa/);
  assert.match(marca, /rotate: `\$\{rumbo\}deg`/);
});

test('el control de disponibilidad lleva la moto real dentro', () => {
  // El original de la web ya probó un pictograma y «se leía como bicicleta».
  const fuente = leer('ui/Navegacion.tsx');
  assert.match(fuente, /VEHICULOS\.MOTO\.mapa/, 'la moto de marca va dentro del disco');
  assert.match(fuente, /accessibilityRole="switch"/, 'es un control de estado, y ha de anunciarse como tal');
});

test('el control de disponibilidad conserva sus estados y su latido', () => {
  const fuente = leer('ui/Navegacion.tsx');
  assert.match(fuente, /tema\.color\.exito/, 'en línea va en el verde del sistema');
  assert.match(fuente, /En línea/);
  assert.match(fuente, /Animated\.loop/, 'el latido comunica que sigue escuchando');
  assert.match(fuente, /isReduceMotionEnabled/, 'el latido se apaga si se pide movimiento reducido');
});

test('el arranque conserva la identidad del que ya existe', () => {
  const fuente = leer('ui/Arranque.tsx');
  assert.match(fuente, /Emblema/, 'el emblema circular');
  assert.match(fuente, /\+58/);
  assert.match(fuente, /express/);
  assert.match(fuente, /Preparando tu viaje/);
  assert.match(fuente, /Animated\.loop/, 'las órbitas giran');
  assert.match(fuente, /isReduceMotionEnabled/);
});

test('Transporte Seguro conserva su composición', () => {
  const fuente = leer('ui/Servicio.tsx');
  assert.match(fuente, /Transporte Seguro/);
  assert.match(fuente, /nombre="escudo"/, 'el escudo, igual que en la web');
  assert.match(fuente, /<Vehiculo tipo="MOTO"/, 'la moto entra al recinto protegido');
  assert.match(fuente, /Programa tus traslados/, 'el mismo texto que la tarjeta de la web');
});

test('el logotipo se usa donde toca y no en todas partes', () => {
  // Una marca repetida en cada pantalla deja de significar nada, y dentro de la
  // aplicación la persona ya sabe dónde está.
  const pantallas = leer('preview/pantallasC2.tsx');
  const apariciones = pantallas.match(/<LogoHorizontal/g) ?? [];
  assert.ok(apariciones.length >= 2, 'el logotipo va en el arranque y en la entrada');
  assert.ok(apariciones.length <= 3, `el logotipo aparece ${apariciones.length} veces: son demasiadas`);
});

test('las pantallas REALES llevan el logotipo, no la marca escrita a mano', () => {
  // El selector de rol pintaba «+58Express» como texto en dos colores, y el
  // acceso abria con un titulo. Existiendo el logotipo oficial con la moto,
  // eso era quedarse corto justo donde se abre la aplicacion.
  for (const pantalla of ['app/rol.tsx', 'app/acceso.tsx']) {
    assert.match(leer(pantalla), /<LogoHorizontal/, pantalla);
  }
});

test('el acceso real conserva TODA su logica de Wave 1', () => {
  // El refinamiento es de aspecto. Si alguna vez esta pantalla pierde su
  // contexto de sesion o su campo protegido, no es un cambio visual.
  const fuente = leer('app/acceso.tsx');
  for (const pieza of ['useSesion', 'entrar', 'secureTextEntry', 'textContentType']) {
    assert.match(fuente, new RegExp(pieza), `el acceso perdio ${pieza}`);
  }
});

test('no hay emoji haciendo de icono en ninguna pantalla', () => {
  // Un emoji se dibuja distinto en cada teléfono y delata que ahí faltaba un
  // icono de verdad.
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const fichero of ['preview/pantallasC2.tsx', 'ui/Marca.tsx', 'ui/Mapa.tsx', 'ui/Servicio.tsx', 'ui/Navegacion.tsx', 'ui/HojaInferior.tsx', 'ui/Arranque.tsx']) {
    assert.doesNotMatch(leer(fichero), emoji, `${fichero} tiene un emoji`);
  }
});

// ---------------------------------------------------------------------------
// La composición de C2
// ---------------------------------------------------------------------------

test('el mapa es el suelo, no una tarjeta', () => {
  const pantallas = leer('preview/pantallasC2.tsx');
  // Ni una sola pantalla de C2 puede usar el mapa metido en una caja de altura fija.
  assert.doesNotMatch(pantallas, /MapaSimulado/, 'C2 usa el lienzo a sangre');
  assert.match(pantallas, /LienzoDeMapa/);

  const lienzo = leer('ui/Mapa.tsx');
  assert.match(lienzo, /flex: 1/, 'el lienzo ocupa lo que le den');
  assert.doesNotMatch(lienzo, /altura = \d+/, 'el mapa no tiene altura fija');
});

test('la hoja nunca tapa el mapa entero', () => {
  const fuente = leer('theme/hoja.ts');
  const tope = fuente.match(/alta: ([\d.]+)/);
  assert.ok(tope, 'la hoja declara su altura máxima');
  // Con la barra de navegación llevándose otros 80 puntos por debajo, por
  // encima de 0,65 lo que queda de mapa ya no da para ver un vehículo.
  assert.ok(Number(tope[1]) <= 0.65, 'abierta del todo debe seguir dejando ver el mapa');
});

test('el filo amarillo se usa con disciplina', () => {
  // Una firma que lleva todo no señala nada. En la hoja de la pasajera lo lleva
  // Transporte Seguro; en el viaje, sólo el estado; en el selector, sólo la
  // opción elegida.
  const pantallas = leer('preview/pantallasC2.tsx');
  const destacadas = pantallas.match(/destacada/g) ?? [];
  assert.ok(destacadas.length <= 2, `hay ${destacadas.length} superficies con filo: son demasiadas`);
});

// ---------------------------------------------------------------------------
// La guarda de configuración
// ---------------------------------------------------------------------------

test('sin servidor configurado NO se monta la sesión ni las pantallas reales', () => {
  // El atajo al laboratorio no puede convertirse en una puerta trasera. Sin
  // `EXPO_PUBLIC_API_BASE_URL`, el proveedor de sesión y el Stack siguen
  // dentro de la rama `configuracion.ok`, y sólo ahí.
  const fuente = leer('app/_layout.tsx');
  const rama = fuente.slice(fuente.indexOf('configuracion.ok ? ('), fuente.indexOf(') : ('));
  assert.match(rama, /ProveedorDeSesion/, 'la sesión vive dentro de la rama con configuración');
  assert.match(rama, /<Stack/, 'las pantallas reales, también');

  const aviso = fuente.slice(fuente.indexOf('function AvisoDeConfiguracion'), fuente.indexOf('export default'));
  assert.doesNotMatch(aviso, /ProveedorDeSesion/, 'el aviso no monta sesión');
  assert.doesNotMatch(aviso, /<Stack/, 'el aviso no monta las pantallas reales');
});

test('el atajo al laboratorio sólo existe en desarrollo', () => {
  // En una compilación de release el laboratorio no debe ser alcanzable, ni
  // siquiera desde la pantalla de error.
  const fuente = leer('app/_layout.tsx');
  assert.match(fuente, /EN_DESARROLLO/, 'el atajo está condicionado');
  assert.match(fuente, /verLaboratorio && EN_DESARROLLO/, 'y también su renderizado');
});

test('hay una plantilla de configuración con el puerto correcto', () => {
  // Sin plantilla, la única forma de saber qué poner es leer el código. Y el
  // puerto tiene que ser el que el servidor escucha de verdad: el mensaje de
  // ayuda decía 8080 cuando `server/index.js` usa 4000.
  const plantilla = fs.readFileSync(path.join(raizMovil, '.env.example'), 'utf8');
  assert.match(plantilla, /EXPO_PUBLIC_API_BASE_URL=/);
  assert.match(plantilla, /:4000/, 'el puerto del servidor');
  assert.match(plantilla, /localhost/i, 'avisa de que localhost no sirve desde el teléfono');

  const servidor = fs.readFileSync(path.join(raizWeb, 'server/index.js'), 'utf8');
  assert.match(servidor, /PORT \|\| 4000/, 'el servidor sigue escuchando en 4000');
});

test('la plantilla no lleva secretos', () => {
  // Todo lo que empieza por EXPO_PUBLIC_ viaja dentro del paquete y cualquiera
  // puede leerlo. Ahí sólo van direcciones.
  const plantilla = fs.readFileSync(path.join(raizMovil, '.env.example'), 'utf8');
  const variables = plantilla.match(/^[A-Z_]+=.*/gm) ?? [];
  for (const linea of variables) {
    assert.match(linea, /^EXPO_PUBLIC_/, `«${linea}» no es una variable pública`);
    assert.doesNotMatch(linea, /(secret|token|key|password|clave)/i, `«${linea}» parece un secreto`);
  }
});

// ---------------------------------------------------------------------------
// El disco central
// ---------------------------------------------------------------------------

test('el disco central es la MISMA pieza en los dos roles', () => {
  // Es la decisión de identidad: una forma que sirve en las dos pantallas. Si
  // cada rol dibujara la suya, dejarían de ser la misma aplicación y habría que
  // aprender dos cosas donde basta una.
  const fuente = leer('ui/Navegacion.tsx');
  assert.match(fuente, /function Disco\(/, 'hay un único disco');
  assert.match(fuente, /export function ControlDeDisponibilidad/);
  assert.match(fuente, /export function ControlDePedido/);
  // Las dos lo usan.
  assert.equal((fuente.match(/<Disco/g) ?? []).length, 2, 'los dos controles pintan el mismo disco');
});

test('el disco de la pasajera se cierra desde donde se abrió', () => {
  const fuente = leer('ui/Navegacion.tsx');
  assert.match(fuente, /abierto/, 'el disco conoce su estado abierto');
  assert.match(fuente, /Aspa/, 'abierto se convierte en aspa de cerrar');
  assert.match(fuente, /accessibilityState=\{\{ expanded: abierto \}\}/);
});

// ---------------------------------------------------------------------------
// No prometer lo que no existe
// ---------------------------------------------------------------------------

test('la navegación no ofrece servicios que la aplicación no tiene', () => {
  // +58express es mototaxi. Una rejilla con comida, tienda o paquetería se ve
  // muy bien en una maqueta y es una promesa que nadie puede cumplir: los
  // destinos reales de la pasajera son inicio, viajes, seguridad y perfil.
  const fuente = sinComentarios('ui/Navegacion.tsx');
  for (const inventado of ['marketplace', 'comida', 'supermercado', 'gift', 'delivery', 'envío', 'envio']) {
    assert.doesNotMatch(fuente, new RegExp(inventado, 'i'), `la barra ofrece «${inventado}»`);
  }
});

test('pedir por otra persona se anuncia como NO conectado', () => {
  // El selector funciona en la interfaz, pero el backend no tiene campo de
  // beneficiario ni forma de avisar a quien se monta. Enseñarlo sin decirlo
  // sería prometer una función que no existe.
  const pantallas = leer('preview/pantallasC2.tsx');
  assert.match(pantallas, /todavía no está conectado al servidor/);

  const trayecto = leer('ui/Trayecto.tsx');
  assert.match(trayecto, /backend todavía no sabe[\s*]+pedir un viaje para un tercero/i);
});

test('la maqueta no enseña precios verosímiles', () => {
  // La tarifa la calcula el servidor con su configuración y la tasa del BCV.
  // Una cifra creíble en una maqueta es la forma más fácil de que alguien la
  // tome por real; los ceros no engañan a nadie.
  for (const fichero of ['preview/pantallasC2.tsx', 'preview/fixtures.ts']) {
    const fuente = leer(fichero);
    const precios = fuente.match(/\$\d+[.,]\d{2}/g) ?? [];
    for (const precio of precios) {
      assert.match(precio, /^\$0[.,]00$/, `${fichero} enseña ${precio} como si fuera una tarifa`);
    }
  }
});

test('la tasa del BCV que se enseña es de ejemplo', () => {
  const fixtures = leer('preview/fixtures.ts');
  assert.match(fixtures, /Cifra de ejemplo/);
  assert.match(fixtures, /Bs\. 000,00/, 'el valor es obviamente ficticio');
});

test('la barra inferior respeta la franja del sistema', () => {
  const fuente = leer('ui/Navegacion.tsx');
  assert.match(fuente, /useSafeAreaInsets/, 'sin esto los iconos quedan bajo la barra de gestos');
  assert.match(fuente, /Math\.max\(inferior/);
});

test('el conductor no tiene tablero financiero', () => {
  // La cartera está apagada en el servidor. Una pestaña de dinero que lleva a
  // una cifra vacía —o peor, inventada— no es navegación.
  const fuente = sinComentarios('ui/Navegacion.tsx');
  for (const palabra of ['aldo', 'anancia', 'artera', 'etiro', 'ingres']) {
    assert.doesNotMatch(fuente, new RegExp(palabra, 'i'), `la barra menciona «${palabra}»`);
  }
});

test('C2 no eligió proveedor de mapas', () => {
  const lienzo = sinComentarios('ui/Mapa.tsx');
  for (const proveedor of ['mapbox', 'google', 'maplibre', 'react-native-maps', 'leaflet']) {
    assert.doesNotMatch(lienzo, new RegExp(proveedor, 'i'), `aparece ${proveedor}`);
  }
});
