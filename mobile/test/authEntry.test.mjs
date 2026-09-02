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
 * ningún selector. Que la pantalla que abre la aplicación no lleve nada de
 * desarrollo, no finja Google ni Apple, y enlace los documentos legales sin
 * inventarlos.
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

test('el rol del backend gana: intención conductor + cuenta pasajero → pasajero', () => {
  assert.equal(destinoTrasEntrar(cuenta({ role: 'passenger' }), 'driver'), '/pasajero');
});

test('sin intención, el destino es el mismo: lo decide la cuenta', () => {
  assert.equal(destinoTrasEntrar(cuenta({ role: 'driver' })), '/conductor');
  assert.equal(destinoTrasEntrar(cuenta({ role: 'passenger' }), null), '/pasajero');
  // Administración no se convierte en móvil por elegir una tarjeta.
  assert.equal(destinoTrasEntrar(cuenta({ role: 'admin' }), 'driver'), '/pasajero');
});

test('tras entrar, el acceso navega por la identidad REAL y no por lo elegido', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  assert.match(acceso, /experienciaDeLaIdentidad\(resultado\.usuario\)/);
  assert.match(acceso, /router\.replace\(destino === 'driver' \? '\/conductor' : '\/pasajero'\)/);
  // La intención sólo se ENSEÑA: aparece en una insignia, no en una decisión.
  assert.match(acceso, /<Insignia texto=\{intencion\.titulo\}/);
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
  // La raíz decide la casa antes de llegar a la bienvenida…
  const raiz = sinComentarios('app/index.tsx');
  const autenticado = raiz.indexOf("sesion.estado === 'AUTENTICADO'");
  const bienvenida = raiz.indexOf('href="/bienvenida"');
  assert.ok(autenticado !== -1 && bienvenida !== -1);
  assert.ok(autenticado < bienvenida, 'la bienvenida se decide antes de mirar la sesión');
  // …y la propia bienvenida se quita de en medio si hay sesión.
  const pantalla = sinComentarios('app/bienvenida.tsx');
  assert.match(pantalla, /if \(sesion\.estado === 'AUTENTICADO'\) return <Redirect href="\/" \/>;/);
});

test('la bienvenida lleva al ACCESO con la intención como contexto, nunca a una casa', () => {
  const pantalla = sinComentarios('app/bienvenida.tsx');
  assert.match(pantalla, /router\.push\(\{ pathname: '\/acceso', params: \{ intencion \} \}\)/);
  assert.equal(/'\/pasajero'|'\/conductor'/.test(pantalla), false, 'la bienvenida navega a una casa sin sesión');
  // Lo recordado es una preferencia de navegación, no una sesión.
  assert.match(pantalla, /guardarUltimoRol\(intencion\)/);
  assert.equal(/guardarToken|iniciarSesion|fetch\(/.test(pantalla), false);
});

test('cerrar sesión vuelve a la bienvenida', () => {
  assert.match(sinComentarios('app/conductor.tsx'), /salir\(\)\.then\(\(\) => \{ router\.replace\('\/bienvenida'\); \}\)/);
  // El perfil vuelve a la raíz, que sin sesión ya manda a la bienvenida.
  assert.match(sinComentarios('app/perfil.tsx'), /router\.replace\('\/'\)/);
});

test('el selector de desarrollo no existe en release y ya no es la raíz', () => {
  const selector = sinComentarios('app/rol.tsx');
  assert.match(selector, /if \(!EN_DESARROLLO\) return <Redirect href="\/bienvenida" \/>;/);
  assert.match(selector, /params: \{ intencion: rol \}/);
});

// ---------------------------------------------------------------------------
// La pantalla oficial: sin desarrollo, sin fingir, con lo legal enlazado
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
  // Y las dos tarjetas son las aprobadas.
  assert.deepEqual(OPCIONES_DE_ENTRADA.map(opcion => [opcion.titulo, opcion.detalle]), [
    ['Pasajero', 'Pide una carrera y llega a donde vas.'],
    ['Conductor', 'Recibe carreras y gestiona tu jornada.']
  ]);
  assert.match(ui, /¿Cómo quieres continuar\?/);
  assert.match(ui, /OPCIONES_DE_ENTRADA\.map/);
  assert.match(ui, /accessibilityRole="radio"/);
});

test('Google y Apple se ven, y no se finge ninguna autenticación', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /ENTRADA_SOCIAL\.google\.titulo/);
  assert.match(ui, /ENTRADA_SOCIAL\.apple\.titulo/);
  assert.equal(ENTRADA_SOCIAL.google.titulo, 'Continuar con Google');
  assert.equal(ENTRADA_SOCIAL.apple.titulo, 'Continuar con Apple');

  // Sin infraestructura real, deshabilitados y avisados.
  const paquete = JSON.parse(leer('package.json'));
  const dependencias = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  const haySocial = dependencias.some(nombre => /apple-authentication|google-signin|auth-session/.test(nombre));
  const servidor = despojarComentarios(fs.readFileSync(path.resolve(raizMovil, '..', 'server', 'index.js'), 'utf8'));
  const rutaSocial = /\/api\/auth\/(google|apple)/.test(servidor);
  if (!haySocial && !rutaSocial) {
    assert.equal(ENTRADA_SOCIAL.google.disponible, false, 'Google se declara disponible sin infraestructura');
    assert.equal(ENTRADA_SOCIAL.apple.disponible, false, 'Apple se declara disponible sin infraestructura');
  }
  assert.match(ui, /disabled=\{!disponible\}/);
  assert.match(ui, /accessibilityState=\{\{ disabled: !disponible \}\}/);
  assert.match(ui, /AVISO_DE_NO_DISPONIBLE/);
  assert.equal(/expo-auth-session|AuthSession|google-signin|apple-authentication/.test(ui), false);
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
  // Mientras no haya documento publicado, la pantalla lo dice; no redacta.
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
// La moto: tiempos, movimiento reducido, y que no bloquee
// ---------------------------------------------------------------------------

test('la salida de la moto dura entre 450 y 650 ms', () => {
  assert.equal(DURACION_DE_LA_SALIDA, SALIDA_DE_LA_MOTO.ignicion + SALIDA_DE_LA_MOTO.retroceso + SALIDA_DE_LA_MOTO.aceleracion);
  assert.ok(DURACION_DE_LA_SALIDA >= 450 && DURACION_DE_LA_SALIDA <= 650, `dura ${DURACION_DE_LA_SALIDA} ms`);
  assert.equal(SALIDA_DE_LA_MOTO.ignicion % 6, 0, 'la ignición se reparte en seis sacudidas iguales');
});

test('la navegación no espera al final de la animación', () => {
  assert.ok(SALIDA_DE_LA_MOTO.navegarEn < DURACION_DE_LA_SALIDA);
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /setTimeout\(\(\) => onContinuarConCorreo\(intencion\), SALIDA_DE_LA_MOTO\.navegarEn\)/);
  // Y no está colgada del `start` de la animación.
  assert.equal(/start\(\([^)]*\) => [^\n]*onContinuarConCorreo/.test(ui), false);
});

test('con movimiento reducido no hay animación: se navega en el acto', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(ui, /reduceMotionChanged/);
  assert.match(ui, /if \(quieto\) \{\s*onContinuarConCorreo\(intencion\);\s*return;\s*\}/);
  // El ralentí tampoco se mueve.
  assert.match(ui, /if \(!asentado \|\| quieto \|\| saliendo\)/);
});

test('todo el movimiento va por el controlador nativo', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  const temporizaciones = ui.match(/Animated\.timing\(/g) ?? [];
  const nativas = ui.match(/useNativeDriver: true/g) ?? [];
  assert.ok(temporizaciones.length > 0);
  assert.equal(nativas.length, temporizaciones.length, 'hay una animación fuera del controlador nativo');
});

// ---------------------------------------------------------------------------
// Día, noche y automático
// ---------------------------------------------------------------------------

test('la bienvenida pinta con el tema de +58Express, no con el del sistema', () => {
  const ui = sinComentarios('ui/Bienvenida.tsx');
  assert.match(ui, /useTema\(\)/);
  assert.equal(/useColorScheme|Appearance\./.test(ui), false, 'lee el esquema del sistema por su cuenta');
  // Ningún color escrito a mano: todo sale del tema o de las primitivas.
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(ui), false, 'hay un color escrito a mano');
  assert.match(ui, /tema\.color\.fondo/);
  assert.match(ui, /tema\.color\.acento/);
});
