import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  AVISO_LEGAL,
  DOCUMENTOS_LEGALES,
  DURACION_DE_LA_SALIDA,
  ENTRADA_SOCIAL,
  INTENCIONES_DE_ENTRADA,
  LEMA,
  OPCIONES_DE_ENTRADA,
  SALIDA_DE_LA_MOTO,
  credencialesParaEntrar,
  destinoTrasEntrar,
  esIntencionDeEntrada
} from '../domain/entrada.ts';

/**
 * AUTH-ENTRY-EXPERIENCE-1 — la bienvenida oficial antes del acceso.
 *
 * LO QUE SE PROTEGE
 *
 * Que la elección Pasajero/Conductor sea una intención de navegación y nunca
 * una autoridad: no viaja al backend, no decide a dónde se va tras entrar, y
 * elegir «mal» no produce «contraseña incorrecta». Que con sesión no se enseñe
 * ninguna puerta. Que la pantalla que abre la aplicación no lleve nada de
 * desarrollo, no finja Google ni Apple, y enlace los documentos legales sin
 * inventarlos.
 *
 * Y lo que el dueño corrigió al verlo en Android: una tarjeta es una PUERTA
 * —un toque y al acceso—, no una casilla que se marca; el lema de la marca es
 * el de siempre; y Google y Apple viven dentro del acceso, sólo con su
 * logotipo.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));
const existe = relativa => fs.existsSync(path.join(raizMovil, relativa));

const cuenta = (extra = {}) => ({
  id: 'u1', role: 'passenger', firstName: 'Ana', lastName: 'Pérez',
  email: 'ana@x.test', phone: '', isVerified: true, ...extra
});

// ---------------------------------------------------------------------------
// La intención NO es autoridad
// ---------------------------------------------------------------------------

test('la intención sólo puede ser pasajero o conductor, nunca otra cosa', () => {
  assert.deepEqual([...INTENCIONES_DE_ENTRADA], ['passenger', 'driver']);
  assert.equal(esIntencionDeEntrada('passenger'), true);
  assert.equal(esIntencionDeEntrada('driver'), true);
  assert.equal(esIntencionDeEntrada('admin'), false);
  assert.equal(esIntencionDeEntrada(''), false);
  assert.equal(esIntencionDeEntrada(null), false);
});

test('lo que viaja al backend NO lleva la intención', () => {
  const enviado = credencialesParaEntrar({ identificador: 'ana@x.test', contrasena: 'secreto', intencion: 'driver' });
  assert.deepEqual(enviado, { identificador: 'ana@x.test', contrasena: 'secreto' });
  assert.equal('intencion' in enviado, false);
  assert.equal('rol' in enviado, false);
});

test('el cliente ya no PUEDE mandar un rol al login', () => {
  // Antes `CredencialesDeAcceso` tenía `rol?` y el cuerpo lo añadía como
  // `role`. El backend respondía 401 si no coincidía con la cuenta. Se quita
  // del contrato: no hay camino por el que la elección llegue al servidor.
  const auth = sinComentarios('services/auth.ts');
  assert.equal(/\brole\b/.test(auth), false, 'services/auth.ts vuelve a mandar role');
  assert.equal(/\brol\??:/.test(auth), false, 'CredencialesDeAcceso vuelve a tener rol');
  assert.match(auth, /identifier: credenciales\.identificador\.trim\(\)/);
  assert.match(auth, /password: credenciales\.contrasena/);
});

test('el acceso manda exactamente identificador y contraseña, una sola vez', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  const llamadas = acceso.match(/entrar\(/g) ?? [];
  assert.equal(llamadas.length, 1, 'el acceso llama a entrar más de una vez');
  assert.match(acceso, /await entrar\(\{ identificador, contrasena \}\)/);
  assert.equal(/\brol:|\brole:/.test(acceso), false, 'el acceso vuelve a mandar un rol');
});

test('el rol del backend gana: intención pasajero + cuenta conductor → conductor', () => {
  assert.equal(destinoTrasEntrar(cuenta({ role: 'driver' }), 'passenger'), '/conductor');
});

test('el rol del backend gana: intención conductor + cuenta pasajero NO abre conductor', () => {
  // La intención sí elige puerta —quien vino por «Conductor» entra a su
  // postulación en vez de al inicio de pasajera—, pero lo que NUNCA hace es
  // conceder el rol: el inicio de conductor sigue cerrado hasta que el backend
  // diga que esa persona es conductora.
  const destino = destinoTrasEntrar(cuenta({ role: 'passenger' }), 'driver');
  assert.equal(destino, '/postulacion');
  assert.notEqual(destino, '/conductor');
});

test('sin intención, el destino es el mismo: lo decide la cuenta', () => {
  assert.equal(destinoTrasEntrar(cuenta({ role: 'driver' })), '/conductor');
  assert.equal(destinoTrasEntrar(cuenta({ role: 'passenger' }), null), '/pasajero');
  // Administración no se convierte en móvil por pulsar una tarjeta.
  assert.equal(destinoTrasEntrar(cuenta({ role: 'admin' }), 'driver'), '/pasajero');
});

test('tras entrar, el acceso navega por la identidad REAL y no por lo pulsado', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  // La decisión vive en el dominio —`destinoTrasEntrar`, con la identidad real
  // como primer argumento—, y la pantalla sólo la obedece. Que esté en un solo
  // sitio es justamente lo que impide que alguien la reescriba aquí a mano.
  assert.match(acceso, /destinoTrasEntrar\(resultado\.usuario/);
  assert.match(acceso, /router\.replace\(destino\)/);
  // La intención sólo se ENSEÑA, en el subtítulo. Nunca decide.
  assert.match(acceso, /Entras como \$\{intencion\.titulo\.toLowerCase\(\)\}/);
  assert.equal(/intencion[^\n]*\?[^\n]*'\/conductor'/.test(acceso), false,
    'el acceso decide el destino por la intención');
});

// ---------------------------------------------------------------------------
// El flujo: raíz → bienvenida → acceso → casa; sesión y salida
// ---------------------------------------------------------------------------

test('sin sesión, la raíz va a la bienvenida oficial', () => {
  const raiz = sinComentarios('app/index.tsx');
  assert.match(raiz, /return <Redirect href="\/bienvenida" \/>;\s*\}\s*$/m);
  assert.equal(/["']\/rol["']/.test(raiz), false, 'la raíz vuelve a mandar al selector de desarrollo');
});

test('restaurar sesión NO pasa por la bienvenida', () => {
  const raiz = sinComentarios('app/index.tsx');
  const autenticado = raiz.indexOf("sesion.estado === 'AUTENTICADO'");
  const bienvenida = raiz.indexOf('href="/bienvenida"');
  assert.ok(autenticado !== -1 && bienvenida !== -1);
  assert.ok(autenticado < bienvenida, 'la bienvenida se decide antes de mirar la sesión');
  const pantalla = sinComentarios('app/bienvenida.tsx');
  assert.match(pantalla, /if \(sesion\.estado === 'AUTENTICADO'\) return <Redirect href="\/" \/>;/);
});

test('la bienvenida lleva al ACCESO con la intención como contexto, nunca a una casa', () => {
  const pantalla = sinComentarios('app/bienvenida.tsx');
  assert.match(pantalla, /router\.push\(\{ pathname: '\/acceso', params: \{ intencion \} \}\)/);
  assert.equal(/'\/pasajero'|'\/conductor'/.test(pantalla), false, 'la bienvenida navega a una casa sin sesión');
  assert.match(pantalla, /guardarUltimoRol\(intencion\)/);
  assert.equal(/guardarToken|iniciarSesion|fetch\(/.test(pantalla), false);
});

test('cerrar sesión vuelve a la bienvenida', () => {
  assert.match(sinComentarios('app/conductor.tsx'), /salir\(\)\.then\(\(\) => \{ router\.replace\('\/bienvenida'\); \}\)/);
  assert.match(sinComentarios('app/perfil.tsx'), /router\.replace\('\/'\)/);
});

test('el selector de desarrollo no existe en release y ya no es la raíz', () => {
  const selector = sinComentarios('app/rol.tsx');
  assert.match(selector, /if \(!EN_DESARROLLO\) return <Redirect href="\/bienvenida" \/>;/);
  assert.match(selector, /params: \{ intencion: rol \}/);
});

// ---------------------------------------------------------------------------
// Una tarjeta es una PUERTA, no una casilla
// ---------------------------------------------------------------------------

test('cada tarjeta lleva directa al acceso de un solo toque', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  // Botón, no opción de radio: al tocarla se va a otra pantalla.
  assert.match(ui, /accessibilityRole="button"/);
  assert.equal(/accessibilityRole="radio"|radiogroup/.test(ui), false,
    'las tarjetas vuelven a ser una selección');
  // Y el toque elige y navega en el mismo gesto.
  assert.match(ui, /onPress=\{\(\) => elegir\(opcion\.intencion\)\}/);
  assert.match(ui, /onElegir\(intencion\)/);
});

test('ya no hay botón de continuar: sobraba un gesto', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.equal(/Continuar con correo|continuar-con-correo|onContinuarConCorreo/.test(ui), false,
    'volvió el botón de continuar');
  // Ningún `Boton` en la bienvenida: las puertas son las tarjetas.
  assert.equal(/<Boton\b/.test(ui), false, 'la bienvenida vuelve a tener un botón suelto');
});

test('la tarjeta pulsada se ve, y la otra se queda atrás', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /encendida=\{saliendo === opcion\.intencion\}/);
  assert.match(ui, /borderColor: pressed \|\| encendida \? tema\.color\.acento : tema\.color\.borde/);
  assert.match(ui, /opacity: bloqueada && !encendida \? 0\.5 : 1/);
});

test('el lema de la marca es el de siempre, y está en las dos pantallas', () => {
  assert.equal(LEMA, 'Tu moto, al instante.');
  for (const pantalla of ['ui/Bienvenida.tsx', 'app/acceso.tsx']) {
    assert.match(sinComentarios(pantalla), /\{LEMA\}/, `${pantalla} no enseña el lema`);
  }
  // Y ya no se describe el servicio en su lugar.
  assert.equal(/Mototaxi en Maracaibo/.test(sinComentarios('ui/Bienvenida.tsx')), false);
});

test('las dos tarjetas son las aprobadas', () => {
  assert.deepEqual(OPCIONES_DE_ENTRADA.map(opcion => [opcion.titulo, opcion.detalle]), [
    ['Pasajero', 'Pide una carrera y llega a donde vas.'],
    ['Conductor', 'Recibe carreras y gestiona tu jornada.']
  ]);
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /¿Cómo quieres continuar\?/);
  assert.match(ui, /OPCIONES_DE_ENTRADA\.map/);
});

// ---------------------------------------------------------------------------
// La pantalla oficial: sin desarrollo, con lo legal enlazado
// ---------------------------------------------------------------------------

const FICHEROS_DE_LA_BIENVENIDA = ['ui/Bienvenida.tsx', 'app/bienvenida.tsx'];

test('la bienvenida oficial no lleva NADA de desarrollo', () => {
  for (const fichero of FICHEROS_DE_LA_BIENVENIDA) {
    const codigo = sinComentarios(fichero);
    assert.equal(
      /AtajoAlLaboratorio|['"]\/diseno|['"]\/preview|['"]\/rol['"]|preview\/fixtures|Recorrer la aplicaci|Laboratorio visual|datos de ejemplo|s[oó]lo en desarrollo|__DEV__/.test(codigo),
      false,
      `${fichero} enseña una puerta de desarrollo`
    );
  }
});

test('la bienvenida es UI: no habla con el backend ni con la sesión', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.equal(/services\/auth|context\/AuthContext|services\/api|fetch\(|expo-secure-store/.test(ui), false);
});

test('el aviso legal está, con sus dos enlaces, y sin casilla obligatoria', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.equal(
    `${AVISO_LEGAL.antes}${DOCUMENTOS_LEGALES.terminos.titulo}${AVISO_LEGAL.entre}${DOCUMENTOS_LEGALES.privacidad.titulo}${AVISO_LEGAL.despues}`,
    'Al continuar, aceptas los Términos y Condiciones y confirmas que has leído la Política de Privacidad.'
  );
  assert.match(ui, /onAbrir\('terminos'\)/);
  assert.match(ui, /onAbrir\('privacidad'\)/);
  assert.match(ui, /accessibilityRole="link"/);
  assert.equal(/checkbox|Switch/.test(ui), false, 'apareció una casilla obligatoria');
});

test('los enlaces legales llevan a rutas reales, y nada se inventa', () => {
  assert.ok(existe('app/legal/terminos.tsx'));
  assert.ok(existe('app/legal/privacidad.tsx'));
  assert.equal(DOCUMENTOS_LEGALES.terminos.ruta, '/legal/terminos');
  assert.equal(DOCUMENTOS_LEGALES.privacidad.ruta, '/legal/privacidad');
  const documento = sinComentarios('ui/DocumentoLegal.tsx');
  assert.match(documento, /documento\.publicado \? null : \(/);
  assert.match(documento, /Todavía no está publicado/);
  for (const clave of ['terminos', 'privacidad']) {
    if (!DOCUMENTOS_LEGALES[clave].publicado) {
      assert.equal(/cláusula|CLÁUSULA|jurisdicción|responsabilidad civil/i.test(documento), false,
        'hay texto jurídico inventado');
    }
  }
});

// ---------------------------------------------------------------------------
// Google y Apple: dentro del acceso, sólo el logotipo, sin fingir
// ---------------------------------------------------------------------------

test('Google y Apple viven en el ACCESO, no en la bienvenida', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  assert.match(acceso, /ENTRADA_SOCIAL\.google/);
  assert.match(acceso, /ENTRADA_SOCIAL\.apple/);
  // Con props desde AUTH-FINAL-3: qué proveedores hay, si está ocupado y qué
  // salió mal. Lo que la prueba protege es DÓNDE vive, no su firma.
  assert.match(acceso, /<EntradaSocial\b/);
  // Antes estaban antes de elegir, que era pedir cuenta sin saber de qué.
  assert.equal(/ENTRADA_SOCIAL/.test(sinComentarios('ui/Bienvenida.tsx')), false,
    'la bienvenida vuelve a llevar los accesos sociales');
});

test('los botones sociales enseñan SÓLO el logotipo', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  // El logotipo va dentro; el nombre, en la etiqueta de accesibilidad.
  assert.match(acceso, /<LogoDeGoogle \/>/);
  assert.match(acceso, /<LogoDeApple \/>/);
  assert.match(acceso, /accessibilityLabel=\{nombre\}/);
  // Y el título NO se pinta como texto dentro del botón.
  assert.equal(/<Txt[^>]*>\{nombre\}<\/Txt>|\{google\.titulo\}<|\{apple\.titulo\}</.test(acceso), false,
    'el botón social vuelve a llevar texto dentro');
});

test('no se finge ninguna autenticación social', () => {
  const paquete = JSON.parse(leer('package.json'));
  const dependencias = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  const haySocial = dependencias.some(nombre => /apple-authentication|google-signin|auth-session/.test(nombre));
  const servidor = despojarComentarios(fs.readFileSync(path.resolve(raizMovil, '..', 'server', 'index.js'), 'utf8'));
  const rutaSocial = /\/api\/auth\/(google|apple)/.test(servidor);
  if (!haySocial && !rutaSocial) {
    assert.equal(ENTRADA_SOCIAL.google.disponible, false, 'Google se declara disponible sin infraestructura');
    assert.equal(ENTRADA_SOCIAL.apple.disponible, false, 'Apple se declara disponible sin infraestructura');
  }
  const acceso = sinComentarios('app/acceso.tsx');
  assert.match(acceso, /disabled=\{!disponible\}/);
  assert.match(acceso, /accessibilityState=\{\{ disabled: !disponible \}\}/);
  // Sin texto en el botón, la razón se dice igual: debajo de los dos.
  assert.match(acceso, /AVISO_DE_NO_DISPONIBLE/);
  assert.equal(/expo-auth-session|AuthSession|google-signin|apple-authentication/.test(acceso), false);
});

test('los logotipos de terceros son marcadores, y se dice dónde y por qué', () => {
  // No son los archivos oficiales: hay que sustituirlos antes de publicar, y
  // eso tiene que estar escrito donde alguien lo vaya a leer.
  assert.ok(existe('assets/marca/terceros/google.png'));
  assert.ok(existe('assets/marca/terceros/apple.png'));
  const marca = leer('theme/marca.ts');
  assert.match(marca, /MARCAS_DE_TERCEROS/);
  assert.match(marca, /NO SON LOS OFICIALES/);
  assert.match(marca, /scripts\/marcas-de-terceros\.py/);
  // La «G» es de cuatro colores y no se recolorea; la manzana sí se tiñe.
  const logos = sinComentarios('ui/MarcasDeTerceros.tsx');
  assert.equal(/tintColor[^\n]*google/i.test(logos), false, 'se recolorea la G de Google');
  assert.match(logos, /tintColor: esquema === 'claro' \? '#000000'/);
});

// ---------------------------------------------------------------------------
// La moto: tiempos, ralentí, movimiento reducido, y que no bloquee
// ---------------------------------------------------------------------------

test('la salida de la moto dura entre 450 y 650 ms', () => {
  assert.equal(DURACION_DE_LA_SALIDA, SALIDA_DE_LA_MOTO.ignicion + SALIDA_DE_LA_MOTO.retroceso + SALIDA_DE_LA_MOTO.aceleracion);
  assert.ok(DURACION_DE_LA_SALIDA >= 450 && DURACION_DE_LA_SALIDA <= 650, `dura ${DURACION_DE_LA_SALIDA} ms`);
  assert.equal(SALIDA_DE_LA_MOTO.ignicion % 6, 0, 'la ignición se reparte en seis sacudidas iguales');
});

test('la navegación no espera al final de la animación', () => {
  assert.ok(SALIDA_DE_LA_MOTO.navegarEn < DURACION_DE_LA_SALIDA);
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /setTimeout\(\(\) => onElegir\(intencion\), SALIDA_DE_LA_MOTO\.navegarEn\)/);
  assert.equal(/start\(\([^)]*\) => [^\n]*onElegir/.test(ui), false);
});

test('la moto está encendida en las DOS pantallas de entrada', () => {
  // Ralentí: un temblor corto y un balanceo lento, sumados.
  const marca = sinComentarios('ui/Marca.tsx');
  assert.match(marca, /export function LogoEncendido/);
  assert.match(marca, /const encendido = asentado && enMarcha && !quieto;/);
  assert.match(marca, /temblor\.interpolate/);
  assert.match(marca, /balanceo\.interpolate/);
  for (const pantalla of ['ui/Bienvenida.tsx', 'app/acceso.tsx']) {
    assert.match(sinComentarios(pantalla), /<LogoEncendido\b/, `${pantalla} no enciende la moto`);
  }
  // Y en la bienvenida el motor se apaga cuando la moto arranca de verdad.
  assert.match(sinComentarios('ui/Bienvenida.tsx'), /enMarcha=\{saliendo === null\}/);
});

test('con movimiento reducido no hay animación: se navega en el acto', () => {
  const movimiento = sinComentarios('ui/movimiento.ts');
  assert.match(movimiento, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(movimiento, /reduceMotionChanged/);
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /useMovimientoReducido\(\)/);
  assert.match(ui, /if \(quieto\) \{\s*onElegir\(intencion\);\s*return;\s*\}/);
  // El ralentí y el hero animado también se paran.
  assert.match(sinComentarios('ui/Marca.tsx'), /!quieto/);
  assert.match(sinComentarios('app/acceso.tsx'), /quieto=\{quieto\}/);
  const hero = sinComentarios('ui/HeroDeMarca.tsx');
  assert.match(hero, /const animado = esAcceso && !quieto;/);
  assert.match(hero, /if \(!animado\) \{ destello\.setValue\(0\); return; \}/);
});

test('todo el movimiento va por el controlador nativo', () => {
  for (const fichero of ['ui/Bienvenida.tsx', 'ui/HeroDeMarca.tsx', 'ui/Marca.tsx']) {
    const codigo = sinComentarios(fichero);
    const temporizaciones = codigo.match(/Animated\.timing\(/g) ?? [];
    const nativas = codigo.match(/useNativeDriver: true/g) ?? [];
    assert.ok(temporizaciones.length > 0, `${fichero} no anima nada`);
    assert.equal(nativas.length, temporizaciones.length, `${fichero} tiene una animación fuera del controlador nativo`);
  }
});

// ---------------------------------------------------------------------------
// El amarillo: dos formas, y la del acceso se mueve
// ---------------------------------------------------------------------------

test('el hero es el mismo en las dos pantallas, con dos formas', () => {
  const hero = sinComentarios('ui/HeroDeMarca.tsx');
  assert.match(hero, /export function HeroDeMarca/);
  // La curva: el fondo subiendo por detras del amarillo, girado. El angulo y
  // los radios se pueden afinar; lo que no puede desaparecer es la curva.
  assert.match(hero, /const curva = esAcceso/);
  assert.match(hero, /borderTopLeftRadius: curva\.radioIzquierdo/);
  assert.match(hero, /transform: \[\{ rotate: curva\.giro \}\]/);
  assert.match(hero, /backgroundColor: tema\.color\.fondo/);
  // Y cada pantalla pide la suya.
  assert.match(sinComentarios('ui/Bienvenida.tsx'), /<HeroDeMarca variante="bienvenida"/);
  assert.match(sinComentarios('app/acceso.tsx'), /<HeroDeMarca variante="acceso"/);
});

test('el amarillo del acceso se mueve: destello y halos', () => {
  const hero = sinComentarios('ui/HeroDeMarca.tsx');
  assert.match(hero, /const destello = useRef\(new Animated\.Value\(0\)\)\.current;/);
  assert.match(hero, /const respiracion = useRef\(new Animated\.Value\(0\)\)\.current;/);
  assert.match(hero, /Animated\.loop\(/);
  // Lento y tenue: un destello que cruza en segundos, no un parpadeo.
  assert.ok(/DESTELLO_MS = (\d+)/.test(hero));
  const duracion = Number(hero.match(/DESTELLO_MS = (\d+)/)[1]);
  assert.ok(duracion >= 1500, `el destello cruza en ${duracion} ms: demasiado rápido`);
});

// ---------------------------------------------------------------------------
// Día, noche y automático
// ---------------------------------------------------------------------------

test('la entrada pinta con el tema de +58Express, no con el del sistema', () => {
  for (const fichero of ['ui/Bienvenida.tsx', 'ui/HeroDeMarca.tsx', 'app/acceso.tsx']) {
    const codigo = sinComentarios(fichero);
    assert.match(codigo, /useTema\(\)/, `${fichero} no lee el tema`);
    assert.equal(/useColorScheme|Appearance\./.test(codigo), false,
      `${fichero} lee el esquema del sistema por su cuenta`);
  }
  // Ningún color escrito a mano salvo el destello, que es luz y no un token.
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(sinComentarios('ui/Bienvenida.tsx')), false,
    'hay un color escrito a mano en la bienvenida');
});

// ---------------------------------------------------------------------------
// Lo que el dueno pidio al ver la referencia
// ---------------------------------------------------------------------------

test('la moto LLEGA al acceso y frena: el viaje continua', () => {
  const marca = sinComentarios('ui/Marca.tsx');
  assert.match(marca, /export function LogoQueFrena/);
  // Entra por la izquierda, se pasa de largo y vuelve: eso es frenar.
  assert.match(marca, /outputRange: \[-ancho \* 1\.35, ancho \* 0\.09, -ancho \* 0\.02, 0\]/);
  // Y cabecea al clavar.
  assert.match(marca, /outputRange: \['-1\.6deg', '1\.7deg', '-0\.5deg', '0deg'\]/);
  // El acceso la pide; la bienvenida usa la entrada de siempre.
  assert.match(sinComentarios('app/acceso.tsx'), /<LogoEncendido ancho=\{\d+\} llegada="frenazo" \/>/);
  assert.equal(/llegada="frenazo"/.test(sinComentarios('ui/Bienvenida.tsx')), false);
});

test('el formulario vive en una hoja, con sus iconos y su ojo', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  assert.match(acceso, /testID="hoja-de-acceso"/);
  assert.match(acceso, /<IconoDeCorreo /);
  assert.match(acceso, /<IconoDeCandado /);
  // El ojo ensena la contrasena mientras se escribe, y al entrar se vuelve a
  // ocultar: no se queda a la vista para el siguiente que coja el telefono.
  assert.match(acceso, /secureTextEntry=\{!aLaVista\}/);
  assert.match(acceso, /testID="ver-contrasena"/);
  assert.match(acceso, /setALaVista\(false\);/);
  // Y el boton lleva la flecha.
  assert.match(acceso, /sufijo=\{<FlechaDerecha color=\{tema\.color\.sobreAcento\} \/>\}/);
});

test('«¿Olvidaste tu contraseña?» no finge un flujo que no existe', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  assert.match(acceso, /testID="contrasena-olvidada"/);
  // El backend NO tiene recuperacion. Mientras no la tenga, esto avisa y no
  // navega a ninguna pantalla de restablecer.
  const servidor = despojarComentarios(fs.readFileSync(path.resolve(raizMovil, '..', 'server', 'index.js'), 'utf8'));
  const hayRecuperacion = /forgot|reset-password|password\/reset/.test(servidor);
  if (!hayRecuperacion) {
    assert.match(acceso, /Alert\.alert\(/);
    assert.equal(/router\.push\([^)]*(recuperar|olvid|reset)/i.test(acceso), false,
      'lleva a una pantalla de recuperacion que no existe');
  }
});

test('las tarjetas llevan el disco con la flecha, y el lema sus filos', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /<DiscoConFlecha activo=\{encendida\} \/>/);
  assert.match(ui, /<FlechaDerecha tamano=\{\d+\} color=\{tema\.color\.sobreAcento\} \/>/);
  assert.match(ui, /<LemaConFilos texto=\{LEMA\} \/>/);
  assert.match(sinComentarios('app/acceso.tsx'), /<LemaConFilos texto=\{LEMA\} \/>/);
});
