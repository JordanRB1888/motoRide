import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { experienciaDeLaIdentidad, puedeOperarComoConductor } from '../domain/authState.ts';
import { decidirValidacion } from '../domain/authDecisions.ts';

/**
 * REAL-APP-BOOT-GATE — cómo arranca la aplicación de verdad.
 *
 * LO QUE PASÓ
 *
 * Sin sesión, la raíz mandaba a `/rol`: «¿Cómo quieres continuar?», Pasajero,
 * Conductor, y los atajos al laboratorio. Una herramienta de desarrollo
 * haciendo de arranque. Y el acceso enviaba al backend el rol elegido, que lo
 * rechaza si no coincide con la cuenta: elegir mal era «contraseña incorrecta»
 * con la contraseña correcta.
 *
 * QUÉ SE PROTEGE
 *
 * Que abrir +58Express sin sesión sea el acceso real, y con sesión sea la casa
 * que diga el backend. Que nadie elija su rol: lo dice `/api/auth/me`. Que
 * cerrar sesión vuelva al acceso. Y que el selector siga existiendo para el
 * dueño, sólo en desarrollo y sólo yendo a él a propósito.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

const usuario = (extra = {}) => ({
  id: 'u1', role: 'passenger', firstName: 'Ana', lastName: 'Pérez',
  email: 'ana@x.test', phone: '', isVerified: true, ...extra
});

// ---------------------------------------------------------------------------
// La raíz
// ---------------------------------------------------------------------------

test('sin sesión, la raíz va a la BIENVENIDA oficial', () => {
  const raiz = sinComentarios('app/index.tsx');
  // Lo último que hace, cuando no hay sesión. Desde AUTH-ENTRY-EXPERIENCE-1
  // es la bienvenida oficial, que lleva al acceso real.
  assert.match(raiz, /return <Redirect href="\/bienvenida" \/>;\s*\}\s*$/m);
  // Y ya nunca al selector.
  assert.equal(/["']\/rol["']/.test(raiz), false, 'la raíz vuelve a mandar al selector');
});

test('con sesión, la raíz va a la casa que diga el backend', () => {
  const raiz = sinComentarios('app/index.tsx');
  assert.match(raiz, /experienciaDeLaIdentidad\(sesion\.usuario\)/);
  assert.match(raiz, /destino === 'driver' \? '\/conductor' : '\/pasajero'/);
});

test('el rol sale de la sesión del backend, no de una elección', () => {
  assert.equal(experienciaDeLaIdentidad(usuario({ role: 'passenger' })), 'passenger');
  assert.equal(experienciaDeLaIdentidad(usuario({ role: 'driver' })), 'driver');
  // Administración no se convierte en móvil por ningún selector: cae en la
  // experiencia de pasajera, que es la que no puede hacer daño.
  assert.equal(experienciaDeLaIdentidad(usuario({ role: 'admin' })), 'passenger');
});

// ---------------------------------------------------------------------------
// El acceso
// ---------------------------------------------------------------------------

test('el acceso NO manda ningún rol al backend', () => {
  // El backend rechaza el acceso si el rol enviado no coincide con la cuenta.
  // Mandarlo convertía una elección de pantalla en autoridad.
  const acceso = sinComentarios('app/acceso.tsx');
  assert.match(acceso, /await entrar\(\{ identificador, contrasena \}\)/);
  // Puede LEER la intención de la bienvenida para enseñarla como contexto,
  // pero ni `rol` ni `role` aparecen en lo que se manda.
  assert.equal(/\brol:|\brole:|esRolMovil/.test(acceso), false,
    'el acceso vuelve a mandar un rol');
});

test('tras entrar, se va a donde diga la cuenta', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  assert.match(acceso, /experienciaDeLaIdentidad\(resultado\.usuario\)/);
  assert.match(acceso, /router\.replace\(destino === 'driver' \? '\/conductor' : '\/pasajero'\)/);
});

test('el acceso es el aprobado, sin puertas de desarrollo', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  // El título del recorrido de diseño (`C2Acceso`), sin rol.
  assert.match(acceso, /Entra a tu cuenta/);
  assert.match(sinComentarios('preview/pantallasC2.tsx'), /Entra a tu cuenta/);
  // Ni «Cambiar de modo» ni atajos al laboratorio: nada de desarrollo en la
  // pantalla que abre la aplicación.
  assert.equal(/AtajoAlLaboratorio|Cambiar de modo|['"]\/rol['"]/.test(acceso), false,
    'el acceso enseña una puerta de desarrollo');
  // Sin credenciales de ejemplo.
  assert.equal(/demo@|_DEMO\b|preview\/fixtures/.test(acceso), false);
});

test('el acceso reutiliza la sesión real, no otra autenticación', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  assert.match(acceso, /useSesion\(\)/);
  assert.equal(/fetch\(|axios|\/api\/auth/.test(acceso), false, 'el acceso llama al backend por su cuenta');
});

// ---------------------------------------------------------------------------
// El selector, sólo desarrollo
// ---------------------------------------------------------------------------

test('el selector NO es la raíz ni un respaldo de nadie', () => {
  const carpetas = ['app', 'context', 'services', 'ui', 'components'];
  const enlazan = [];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      const relativa = path.relative(raizMovil, completa).replace(/\\/g, '/');
      if (relativa.startsWith('app/diseno/')) continue;
      if (/["']\/rol["']/.test(despojarComentarios(fs.readFileSync(completa, 'utf8')))) enlazan.push(relativa);
    }
  }
  // Nadie de la aplicación real navega a `/rol`: se llega a propósito.
  assert.deepEqual(enlazan, [], `navegan al selector: ${enlazan.join(', ')}`);
});

test('el selector no existe en release', () => {
  const selector = sinComentarios('app/rol.tsx');
  assert.match(selector, /__DEV__/);
  assert.match(selector, /if \(!EN_DESARROLLO\) return <Redirect href="\/bienvenida" \/>;/);
});

test('los atajos al laboratorio viven en el selector, no en el acceso', () => {
  assert.match(sinComentarios('app/rol.tsx'), /<AtajoAlLaboratorio \/>/);
  const atajo = sinComentarios('components/AtajoAlLaboratorio.tsx');
  assert.match(atajo, /if \(!EN_DESARROLLO\) return null/);
});

test('/diseno sigue siendo sólo desarrollo', () => {
  const grupo = sinComentarios('app/diseno/_layout.tsx');
  assert.match(grupo, /__DEV__/);
  assert.match(grupo, /EN_DESARROLLO/);
});

// ---------------------------------------------------------------------------
// Salir, restaurar, fallar
// ---------------------------------------------------------------------------

test('cerrar sesión vuelve a la BIENVENIDA, nunca al selector', () => {
  // El conductor navega él mismo; el perfil vuelve a la raíz, que sin sesión
  // ya manda a la bienvenida; la tarjeta de «sin conexión» sólo sale, y la
  // raíz decide.
  assert.match(sinComentarios('app/conductor.tsx'), /salir\(\)\.then\(\(\) => \{ router\.replace\('\/bienvenida'\); \}\)/);
  assert.match(sinComentarios('app/perfil.tsx'), /router\.replace\('\/'\)/);
});

test('restaurar sesión no enseña la bienvenida de paso', () => {
  // Mientras se pregunta al backend, la raíz enseña el arranque, no la
  // bienvenida: una entrada que aparece y desaparece hace creer que se cerró
  // la sesión.
  const raiz = sinComentarios('app/index.tsx');
  const arrancando = raiz.indexOf("sesion.estado === 'ARRANCANDO'");
  const acceso = raiz.indexOf('href="/bienvenida"');
  assert.ok(arrancando !== -1 && acceso !== -1);
  assert.ok(arrancando < acceso, 'el acceso se decide antes de saber si hay sesión');
  assert.match(raiz.slice(arrancando, acceso), /ActivityIndicator/);
});

test('un fallo de red NO es cerrar sesión', () => {
  // Con token guardado y sin poder preguntar, la sesión se conserva y se
  // enseña «Sin conexión» con reintentar. Regla de AUTH-INTEGRATION.
  const decision = decidirValidacion({ ok: false, motivo: 'SIN_RED', codigo: null, mensaje: 'x' });
  assert.equal(decision.resultado, 'SIN_CONEXION', 'un corte de red cierra la sesión');
  const raiz = sinComentarios('app/index.tsx');
  assert.match(raiz, /sesion\.estado === 'SIN_VERIFICAR'/);
  assert.match(raiz, /Reintentar/);
});

test('una sesión revocada llega al acceso', () => {
  // El backend dice 401: se cierra de verdad, y la raíz manda al acceso.
  const decision = decidirValidacion({ ok: false, motivo: 'NO_AUTENTICADO', codigo: 'UNAUTHORIZED', mensaje: 'x', estadoHttp: 401 });
  assert.equal(decision.resultado, 'INVALIDA');
});

test('la puerta del conductor sigue exigiendo aprobación', () => {
  // El rol viene del backend, pero conducir además pide estar verificado.
  assert.equal(puedeOperarComoConductor({ estado: 'AUTENTICADO', usuario: usuario({ role: 'driver', isVerified: false }) }), false);
  assert.equal(puedeOperarComoConductor({ estado: 'AUTENTICADO', usuario: usuario({ role: 'driver', isVerified: true }) }), true);
  assert.equal(puedeOperarComoConductor({ estado: 'AUTENTICADO', usuario: usuario({ role: 'passenger' }) }), false);
});

// ---------------------------------------------------------------------------
// Y después de entrar, Pedir sigue siendo el real
// ---------------------------------------------------------------------------

test('Passenger Home → Pedir sigue resolviendo a app/pedir.tsx', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /if \(clave === 'pedir'\) \{ router\.push\('\/pedir'\); return; \}/);
  assert.ok(fs.existsSync(path.join(raizMovil, 'app/pedir.tsx')));
});
