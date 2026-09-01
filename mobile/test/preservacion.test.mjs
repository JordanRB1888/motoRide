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
  // `LogoQueEntra` envuelve a `LogoHorizontal` con la animacion de entrada de
  // la web: los dos cuentan como «el logotipo esta ahí».
  const apariciones = pantallas.match(/<Logo(Horizontal|QueEntra)/g) ?? [];
  assert.ok(apariciones.length >= 2, 'el logotipo va en el arranque y en la entrada');
  assert.ok(apariciones.length <= 3, `el logotipo aparece ${apariciones.length} veces: son demasiadas`);
});

test('las pantallas REALES llevan el logotipo, no la marca escrita a mano', () => {
  // El selector de rol pintaba «+58Express» como texto en dos colores, y el
  // acceso abria con un titulo. Existiendo el logotipo oficial con la moto,
  // eso era quedarse corto justo donde se abre la aplicacion.
  for (const pantalla of ['app/rol.tsx', 'app/acceso.tsx']) {
    assert.match(leer(pantalla), /<Logo(Horizontal|QueEntra)/, pantalla);
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
// La herramienta de cuenta de prueba
// ---------------------------------------------------------------------------

test('el script de cuenta de prueba no lleva contraseña escrita', () => {
  // Una contraseña fija en el repositorio deja de ser de pruebas el día que
  // alguien la reutiliza, y queda en el historial de git para siempre.
  //
  // La primera versión de esta prueba buscaba «password = "algo"» en todo el
  // fichero y saltaba con el texto de AYUDA —el que enseña a pasar la
  // contraseña por el entorno—. Buscar la forma de una contraseña encuentra
  // también las instrucciones para no escribir ninguna. Así que se comprueba lo
  // que de verdad importa: de dónde sale el valor que se envía.
  const fuente = leer('scripts/crearCuentaDePrueba.mjs');

  assert.match(fuente, /const password = process\.env\.PASSWORD/,
    'la contraseña sale del entorno');
  assert.doesNotMatch(fuente, /process\.env\.PASSWORD\s*\?\?\s*['"].{3,}['"]/,
    'no puede haber una contraseña de reserva');

  // Y lo que se manda es esa variable, no un literal.
  const objeto = fuente.slice(fuente.indexOf('const cuenta = {'), fuente.indexOf('};', fuente.indexOf('const cuenta = {')));
  assert.match(objeto, /^\s*password,\s*$/m, 'el registro envía la variable, no una cadena');
});

test('el script de cuenta de prueba SÓLO acepta servidores privados', () => {
  // Se comprueba lo que está permitido, no lo que está prohibido. Una lista de
  // dominios prohibidos siempre se queda corta: basta con que producción cambie
  // de nombre una vez para que deje de proteger.
  const fuente = leer('scripts/crearCuentaDePrueba.mjs');
  assert.match(fuente, /function esServidorLocal/);
  assert.match(fuente, /a === 10\b/, 'acepta 10.0.0.0/8');
  assert.match(fuente, /192 && b === 168/, 'acepta 192.168.0.0/16');
  assert.match(fuente, /b >= 16 && b <= 31/, 'acepta 172.16.0.0/12');
  assert.match(fuente, /return false/, 'y rechaza todo lo demás');
  // La comprobación va ANTES de enviar nada.
  assert.ok(
    fuente.indexOf('esServidorLocal(destino.hostname)') < fuente.indexOf('await fetch('),
    'el destino se comprueba antes de la petición'
  );
});

// ---------------------------------------------------------------------------
// La revisión visual no puede separarse del producto
// ---------------------------------------------------------------------------

test('el dibujo web importa los tokens, no los copia', () => {
  // Es el riesgo de verdad de tener un dibujo paralelo: que se convierta en una
  // maqueta bonita que luego haya que volver a diseñar. La defensa es que todo
  // lo que sea DATO venga de los mismos ficheros que consume el teléfono.
  const web = leer('scripts/pantallasWeb.mjs');
  assert.match(web, /from '\.\.\/theme\/directions\.ts'/, 'los colores y espacios');
  assert.match(web, /from '\.\.\/theme\/hoja\.ts'/, 'las alturas de la hoja');
});

test('el dibujo web no escribe colores a mano', () => {
  // Un hexadecimal suelto aquí es una decisión de diseño que el teléfono no
  // conoce: se ve bien en el navegador y no existe en la aplicación.
  //
  // Se permiten los grises del andamiaje —el marco del teléfono, la sombra— que
  // no forman parte de lo que se evalúa, y el azul del agua del mapa, que sale
  // del token de información.
  const codigo = sinComentarios('scripts/pantallasWeb.mjs');
  const hexadecimales = [...new Set(codigo.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])];
  const permitidos = new Set(['#63c9ff', '#000', '#0000', '#111', '#1a1a1a', '#0d0d0d', '#eee', '#999', '#888', '#ccc', '#e8e8e8']);

  for (const color of hexadecimales) {
    assert.ok(
      permitidos.has(color.toLowerCase()),
      `«${color}» está escrito a mano: debería salir de theme/`
    );
  }
});

test('el servidor de revisión sólo escucha en local', () => {
  // Un servidor de desarrollo abierto a la red es una puerta que nadie recuerda
  // haber dejado puesta.
  const servidor = leer('scripts/servidorDeRevision.mjs');
  assert.match(servidor, /listen\(PUERTO, '127\.0\.0\.1'/, 'escucha sólo en el propio equipo');
  assert.doesNotMatch(sinComentarios('scripts/servidorDeRevision.mjs'), /0\.0\.0\.0/);
});

test('el servidor de revisión no necesita backend', () => {
  // Se revisa con fixtures. Pedir un servidor levantado para mirar un botón
  // convertiría la revisión en un trámite.
  const servidor = sinComentarios('scripts/servidorDeRevision.mjs');
  for (const prohibido of ['fetch(', 'EXPO_PUBLIC', 'AuthContext', 'SecureStore']) {
    assert.equal(servidor.includes(prohibido), false, `el servidor usa ${prohibido}`);
  }
});

test('los avatares de rol son los que envió el dueño', () => {
  const marca = leer('theme/marca.ts');
  assert.match(marca, /AVATARES_DE_ROL/);
  for (const rol of ['pasajero', 'conductor']) {
    const ruta = path.join(raizMovil, `assets/marca/rol-${rol}.png`);
    assert.ok(fs.existsSync(ruta), `falta el avatar de ${rol}`);
    const medidas = medidasDePng(ruta);
    assert.equal(medidas.ancho, medidas.alto, 'los avatares son cuadrados');
  }
});

// ---------------------------------------------------------------------------
// Nombres y estructura
// ---------------------------------------------------------------------------

test('la barra del conductor lleva Saldo y no Jornada', () => {
  // Las cifras de la jornada ya salen al tocar el disco. Una pestaña entera
  // para repetirlas gastaba uno de los cuatro sitios en algo que ya está a un
  // toque; el saldo sí necesita pantalla propia.
  const fuente = leer('ui/Navegacion.tsx');
  const barra = fuente.slice(fuente.indexOf('DESTINOS_DE_CONDUCTOR'));
  assert.match(barra, /etiqueta: 'Saldo'/);
  assert.doesNotMatch(barra, /etiqueta: 'Jornada'/);
});

test('la barra de la pasajera usa los nombres acordados', () => {
  // «Historial» y no «Viajes»: lo que hay ahí son los que YA hiciste, y
  // «Viajes» en una aplicación de viajes no distingue nada.
  //
  // «Viaje seguro» y no «Seguridad»: dice de qué va y coincide con el nombre
  // que la marca ya usa. «Seguridad» a secas suena a ajustes de contraseña.
  const fuente = leer('ui/Navegacion.tsx');
  const barra = fuente.slice(fuente.indexOf('DESTINOS_DE_PASAJERA'));

  assert.match(barra, /etiqueta: 'Historial'/);
  assert.match(barra, /etiqueta: 'Viaje seguro'/);
  assert.doesNotMatch(barra.slice(0, barra.indexOf('DESTINOS_DE_CONDUCTOR')), /etiqueta: 'Seguridad'/);
});

test('los ajustes de cuenta viven en el perfil, no en la barra', () => {
  // La barra tiene cinco sitios y son para lo de todos los días. Contraseña,
  // avisos y preferencias se visitan dos veces al año.
  const secciones = leer('preview/pantallasC2Secciones.tsx');
  const perfil = secciones.slice(secciones.indexOf('export function C2Perfil'), secciones.indexOf('// Saldo'));
  for (const entrada of ['Seguridad de la cuenta', 'Notificaciones', 'Configuración', 'Cambiar de modo']) {
    assert.ok(perfil.includes(entrada), `el perfil no lleva «${entrada}»`);
  }

  const navegacion = sinComentarios('ui/Navegacion.tsx');
  assert.doesNotMatch(navegacion, /etiqueta: 'Configuración'/, 'configuración no es una pestaña');
});

test('lo irreversible va separado de lo reversible', () => {
  // «Eliminar cuenta» junto a «Cerrar sesión» en la misma lista es un accidente
  // esperando: se parecen, están juntas, y una de las dos no tiene vuelta.
  const secciones = leer('preview/pantallasC2Secciones.tsx');
  const perfil = secciones.slice(secciones.indexOf('export function C2Perfil'), secciones.indexOf('// Saldo'));
  assert.match(perfil, /Eliminar cuenta/);
  assert.match(perfil, /tono="peligro"/, 'va marcada como destructiva');
  assert.ok(
    perfil.indexOf('Cerrar sesión') < perfil.indexOf('Eliminar cuenta'),
    'eliminar va después de cerrar sesión, y separada'
  );
});

test('los avisos tienen puerta desde las pantallas de uso', () => {
  // Antes eran una pantalla suelta a la que no llevaba nada. Existir sin puerta
  // es no existir.
  const secciones = leer('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /export function Campana/);
  assert.match(secciones, /sinLeer > 0/, 'marca lo que está sin leer');

  // El inicio de la pasajera se mudó a su propio fichero el día que dejó de
  // llevar mapa. La puerta a los avisos sigue estando donde siempre.
  const inicio = leer('preview/pantallaInicioPasajera.tsx');
  assert.match(inicio, /<Campana/, 'el inicio de la pasajera lleva campana');
});

test('el panel del conductor cabe en un vistazo', () => {
  // Se abre en un semáforo. Los datos van en dos columnas —la mitad de alto que
  // seis filas para lo mismo— y la hoja se ajusta a su contenido.
  const estados = leer('ui/Estados.tsx');
  assert.match(estados, /width: '50%'/, 'los datos van en dos columnas');

  const pantallas = leer('preview/pantallasC2.tsx');
  const conductor = pantallas.slice(pantallas.indexOf('export function C2InicioConductor'));
  assert.match(conductor, /alturaAutomatica/, 'la hoja se ajusta a lo que ocupa');
});

test('la entrada del logotipo es la de la web', () => {
  // `passengerBrandRideIn`: llega desde fuera por la izquierda, se pasa de
  // largo, rebota y asienta. Copiada, no reinterpretada: ese gesto es de las
  // pocas cosas de +58express que ya se reconocen.
  const marca = leer('ui/Marca.tsx');
  assert.match(marca, /export function LogoQueEntra/);
  assert.match(marca, /Easing\.bezier\(0\.16, 0\.82, 0\.24, 1\)/, 'la misma curva');
  assert.match(marca, /duration: 900/, 'la misma duración');
  assert.match(marca, /-ancho \* 1\.9/, 'entra desde fuera por la izquierda');
});

test('el arranque no dibuja círculos', () => {
  // La web tiene un degradado continuo. Con tres discos se veía cada borde y
  // quedaban tres círculos donde no hay ninguno.
  const arranque = leer('ui/Arranque.tsx');
  const capas = arranque.match(/CAPAS_DEL_RESPLANDOR = \[([^\]]+)\]/);
  assert.ok(capas, 'el resplandor declara sus capas');
  assert.ok(capas[1].split(',').length >= 10, 'con menos de diez capas se ven los bordes');
  assert.match(arranque, /opacity: 0\.0\d/, 'y cada una es muy tenue');
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

test('el disco va en el CENTRO de la barra, no a un lado', () => {
  // Estaba pintado después de los dos grupos y acababa pegado al borde
  // derecho. Es el elemento principal de la barra y tiene que caer bajo el
  // pulgar sin recolocar la mano, así que va en medio.
  const fuente = leer('ui/Navegacion.tsx');
  const barra = fuente.slice(fuente.indexOf('export function BarraDeNavegacion'));

  const izquierda = barra.indexOf('destinos={izquierda}');
  const centro = barra.indexOf('{control ?');
  const derecha = barra.indexOf('destinos={derecha}');

  assert.ok(izquierda > 0 && centro > 0 && derecha > 0, 'la barra tiene tres zonas');
  assert.ok(izquierda < centro, 'el disco va después del grupo izquierdo');
  assert.ok(centro < derecha, 'y antes del derecho');
});

test('el disco sobresale por encima de la barra', () => {
  // Es lo que lo separa de los demás destinos: si se queda a ras, se lee como
  // una pestaña más y deja de ser la acción principal.
  const fuente = leer('ui/Navegacion.tsx');
  const margenes = [...fuente.matchAll(/marginTop: -(\d+)/g)].map(coincidencia => Number(coincidencia[1]));
  assert.equal(margenes.length, 2, 'los dos controles suben');
  for (const margen of margenes) {
    assert.ok(margen >= 26, `sube sólo ${margen} puntos: no se despega de los iconos`);
  }
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

test('el saldo del conductor NO inventa ninguna cifra', () => {
  // Esta prueba sustituye a otra que prohibía la pestaña de dinero entera. La
  // prohibía porque la cartera está apagada en el servidor y una pestaña que
  // lleva a un número inventado no es navegación.
  //
  // El dueño decidió que la pantalla exista, y tiene sentido: recargar, pedir
  // liquidación y revisar qué te descontaron son el trabajo del conductor, no
  // un adorno. Lo que había que proteger no era la ausencia de la pantalla,
  // sino la ausencia de cifras falsas. Eso es lo que se comprueba ahora.
  const saldo = leer('preview/pantallaSaldoConductor.tsx');

  const importes = saldo.match(/\$\s?\d[\d.,]*/g) ?? [];
  for (const importe of importes) {
    assert.match(importe, /^\$0,00$/, `la pantalla de saldo enseña ${importe}`);
  }
  assert.match(saldo, /todavía no está encendida en el servidor/i,
    'la pantalla dice que la cartera está apagada');

  const movimientos = leer('preview/fixtures.ts');
  const enMovimientos = movimientos.slice(movimientos.indexOf('MOVIMIENTOS_DEMO'));
  const cifras = enMovimientos.slice(0, enMovimientos.indexOf('] as const')).match(/\$\d[\d.,]*/g) ?? [];
  for (const cifra of cifras) {
    assert.match(cifra, /^\$0,00$/, `un movimiento enseña ${cifra}`);
  }
});

test('el saldo del conductor no promete un porcentaje de comisión', () => {
  // La comisión sale de la configuración del servidor (`commissionRate`), y su
  // valor por defecto en el código es 0.15 aunque el modelo de negocio hable de
  // otro. Escribir un porcentaje en la pantalla lo congela en la aplicación y
  // deja de coincidir con lo que de verdad se cobra en cuanto se cambie.
  const saldo = leer('preview/pantallaSaldoConductor.tsx');
  assert.doesNotMatch(saldo, /\d+\s?%/, 'la pantalla escribe un porcentaje fijo');
  assert.match(saldo, /lo fija \+58express en su configuración/i,
    'dice de dónde sale el porcentaje');
});

test('el saldo deudor no es el mismo estado con un signo menos', () => {
  // El conductor cobra en efectivo y la plataforma le descuenta su parte, así
  // que el balance puede quedar en negativo — y entonces deja de recibir
  // viajes. Quien no puede trabajar hasta recargar necesita LEER eso, no
  // deducirlo de un signo delante del número.
  const saldo = leer('preview/pantallaSaldoConductor.tsx');
  assert.match(saldo, /SALDO DEUDOR CON \+58EXPRESS/);
  assert.match(saldo, /Recarga para volver a recibir viajes/);
  assert.match(saldo, /deshabilitado=\{deudor\}/, 'en deuda no se puede pedir liquidación');
});

test('C2 no eligió proveedor de mapas', () => {
  const lienzo = sinComentarios('ui/Mapa.tsx');
  for (const proveedor of ['mapbox', 'google', 'maplibre', 'react-native-maps', 'leaflet']) {
    assert.doesNotMatch(lienzo, new RegExp(proveedor, 'i'), `aparece ${proveedor}`);
  }
});
