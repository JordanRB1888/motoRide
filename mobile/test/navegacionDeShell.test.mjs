import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  RUTAS_DE_PESTANA_PASAJERO,
  destinoSiNoLeCorresponde,
  esPestanaDePasajero,
  puedeEstarEn,
  shellDelRol
} from '../domain/shellDeRol.ts';

/**
 * AISLAMIENTO PASAJERO / CONDUCTOR Y NAVEGACIÓN DEL SHELL
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que nadie vea el shell del otro rol. El fallo que lo destapó: una cuenta
 *    aprobada como conductora veía el Home de pasajero —porque esa pantalla no
 *    comprobaba el rol— y el cruce sólo aparecía al pulsar «Viajes», que la
 *    mandaba al shell de conductor.
 * 2. Que el botón amarillo funcione desde las cuatro pestañas.
 * 3. Que Saldo responda.
 * 4. Que cambiar de pestaña no deslice la pantalla.
 * 5. Que un expediente en trámite no cambie el rol de nadie.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

// ---------------------------------------------------------------------------
// La frontera de roles
// ---------------------------------------------------------------------------

test('cada rol tiene su shell, y el servidor es quien lo dice', () => {
  assert.equal(shellDelRol('passenger'), 'pasajero');
  assert.equal(shellDelRol('driver'), 'conductor');
  // Administración entra por el de pasajero: puede pedir viajes, y el shell de
  // conductor le pondría delante una disponibilidad que no tiene.
  assert.equal(shellDelRol('admin'), 'pasajero');
  assert.equal(shellDelRol(null), null);
  assert.equal(shellDelRol(undefined), null);
  assert.equal(shellDelRol('lo-que-sea'), null);
});

test('un conductor NO puede estar en el shell de pasajero, ni al revés', () => {
  assert.equal(puedeEstarEn('pasajero', 'passenger'), true);
  assert.equal(puedeEstarEn('pasajero', 'driver'), false, 'era el bug: un conductor veía el Home de pasajero');
  assert.equal(puedeEstarEn('conductor', 'driver'), true);
  assert.equal(puedeEstarEn('conductor', 'passenger'), false);
  assert.equal(puedeEstarEn('pasajero', null), false, 'sin rol no se entra a ningún sitio');
  assert.equal(puedeEstarEn('conductor', null), false);
});

test('a quien está en el shell equivocado se le manda al suyo', () => {
  // Un conductor en una ruta de pasajero va a su inicio.
  assert.equal(destinoSiNoLeCorresponde('pasajero', 'driver'), '/conductor');
  // Un pasajero en una ruta de conductor va a la postulación: todavía no es
  // conductor, pero es la puerta que buscaba.
  assert.equal(destinoSiNoLeCorresponde('conductor', 'passenger'), '/postulacion');
  // Sin rol reconocible, a la raíz, que vuelve a decidir.
  assert.equal(destinoSiNoLeCorresponde('pasajero', null), '/');
  assert.equal(destinoSiNoLeCorresponde('conductor', 'vaya-usted-a-saber'), '/');
});

test('un expediente en borrador o pendiente NO cambia el rol de nadie', () => {
  // El rol lo concede la APROBACIÓN, en el servidor. Mientras tanto esa
  // persona sigue siendo pasajera y sigue en su shell.
  assert.equal(shellDelRol('passenger'), 'pasajero');
  assert.equal(puedeEstarEn('pasajero', 'passenger'), true);
  // Y el dominio no tiene ninguna entrada por la que pueda colarse un estado
  // de expediente: sólo mira el rol.
  const dominio = despojarComentarios(leer('domain/shellDeRol.ts'));
  for (const prohibido of [/draft/i, /pending/i, /approved/i, /solicitud/i, /expediente/i, /intencion/i]) {
    assert.ok(!prohibido.test(dominio), `el rol no puede depender de ${prohibido}`);
  }
});

test('la guarda mira el rol de la SESIÓN, nunca la ruta ni una caché', () => {
  const shell = despojarComentarios(leer('navegacion/shellDePasajero.tsx'));
  assert.match(shell, /puedeEstarEn\('pasajero', sesion\.usuario\.role\)/);
  // Nada de rol local, ni de intención, ni de almacenamiento.
  for (const prohibido of [/setRole/, /AsyncStorage/, /SecureStore/, /intencion/i, /localRole/]) {
    assert.ok(!prohibido.test(shell), `la guarda no puede apoyarse en ${prohibido}`);
  }
  // Y mientras la sesión se resuelve NO expulsa a nadie: eso es el otro error
  // clásico de las guardas.
  assert.match(shell, /if \(sesion\.estado === 'ARRANCANDO' \|\| sesion\.estado === 'AUTENTICANDO'\) return <>\{cargando\}<\/>/);
});

test('el Home de pasajero ya tiene la guarda que le faltaba', () => {
  const home = despojarComentarios(leer('app/pasajero.tsx'));
  assert.match(home, /<ShellDePasajero/);
  // Y ya no lleva su propia tabla de navegación a medias.
  assert.ok(!/function irA\(/.test(home), 'la tabla vive en el shell');
});

// ---------------------------------------------------------------------------
// El botón amarillo, desde las cuatro pestañas
// ---------------------------------------------------------------------------

test('las cuatro pestañas de pasajero tienen ruta, y Saldo es una de ellas', () => {
  assert.deepEqual(Object.keys(RUTAS_DE_PESTANA_PASAJERO).sort(), ['historial', 'inicio', 'perfil', 'saldo']);
  assert.equal(RUTAS_DE_PESTANA_PASAJERO.saldo, '/saldo');
  for (const clave of ['inicio', 'saldo', 'historial', 'perfil']) {
    assert.equal(esPestanaDePasajero(clave), true, clave);
  }
  assert.equal(esPestanaDePasajero('pedir'), false, 'pedir no es una pestaña');
});

test('la tabla del shell entiende TODAS las claves, no un puñado', () => {
  const shell = despojarComentarios(leer('navegacion/shellDePasajero.tsx'));
  // Las cuatro pestañas...
  for (const clave of ['inicio', 'saldo', 'historial', 'perfil']) {
    assert.match(shell, new RegExp(`case '${clave}':`), clave);
  }
  // ...y lo demás que la interfaz pide.
  for (const clave of ['pedir', 'servicio', 'avisos', 'viaje-detalle']) {
    assert.match(shell, new RegExp(`case '${clave}':`), clave);
  }
});

test('el botón amarillo abre la hoja desde cualquier pestaña, con UNA sola hoja', () => {
  const shell = despojarComentarios(leer('navegacion/shellDePasajero.tsx'));
  // Desde Saldo, Historial o Perfil lleva al Home pidiéndole que la abra.
  assert.match(shell, /router\.replace\(\{ pathname: '\/pasajero', params: \{ \[ABRIR_SERVICIOS\]: '1' \} \}\)/);
  // Estando ya en Pedir, cierra y vuelve al inicio.
  assert.match(shell, /if \(enPedir\) router\.replace\('\/pasajero'\)/);

  // Y la hoja sigue siendo la del Home: no se monta una por pestaña.
  const home = despojarComentarios(leer('preview/pantallaInicioPasajera.tsx'));
  assert.match(home, /abrirServiciosAlMontar/);
  assert.equal(
    (home.match(/¿Qué necesitas hoy\?/g) ?? []).length,
    1,
    'una sola implementación de la hoja'
  );
  // Las otras pantallas del shell NO tienen hoja propia.
  for (const fichero of ['app/saldo.tsx', 'app/historial.tsx', 'app/perfil.tsx']) {
    assert.ok(!/necesitas hoy/i.test(despojarComentarios(leer(fichero))), `${fichero} no debe duplicar la hoja`);
  }
});

test('el FAB no se tocó: sigue siendo el mismo control aprobado', () => {
  const navegacion = leer('ui/Navegacion.tsx');
  // Su implementación no cambia; lo que cambia es que ahora hace algo.
  assert.match(navegacion, /export function ControlDePedido/);
  // Y las pantallas del shell lo montan igual.
  for (const fichero of ['app/saldo.tsx']) {
    assert.match(leer(fichero), /<ControlDePedido abierto=\{false\} \/>/, fichero);
  }
});

test('Pedir entiende la tabla entera: antes sólo sabía volver al inicio', () => {
  const pedir = despojarComentarios(leer('app/pedir.tsx'));
  assert.match(pedir, /crearNavegacionDePasajero\(\{ enPedir: true \}\)/);
  assert.ok(
    !/const irA = \(destinoDeLaBarra: string\) => \{/.test(pedir),
    'ya no tiene su propia tabla a medias'
  );
  // Y conserva su guarda de rol.
  assert.match(pedir, /role !== 'passenger'/);
});

// ---------------------------------------------------------------------------
// Saldo
// ---------------------------------------------------------------------------

test('Saldo existe, responde y es honesto: ni cifras inventadas ni pantalla muerta', () => {
  const saldo = despojarComentarios(leer('app/saldo.tsx'));
  assert.match(saldo, /export default function PantallaDeSaldo/);
  assert.match(saldo, /<ShellDePasajero/, 'con la guarda de rol del shell');
  assert.match(saldo, /Todavía no puedes recargar/);
  assert.match(saldo, /aparecerán aquí/);
  // Nada de dinero falso.
  assert.ok(!/Bs\. ?[0-9]/.test(saldo), 'sin cifras inventadas');
  assert.ok(!/\$ ?[0-9]/.test(saldo), 'sin importes inventados');
  assert.ok(!/HISTORIAL_DE_EJEMPLO|DEMO|fixture/i.test(saldo), 'sin datos de ejemplo');
  // No se reutiliza la cartera del conductor.
  assert.ok(!/liquidacion|liquidación|retiro|comision|comisión/i.test(saldo), 'no es la cartera del conductor');
  // Y la barra sigue estando: desde aquí se llega a todo.
  assert.match(saldo, /<BarraDeNavegacion/);
  assert.match(saldo, /activo="saldo"/);
});

// ---------------------------------------------------------------------------
// El deslizamiento
// ---------------------------------------------------------------------------

test('las pestañas NO se deslizan, y las pantallas en profundidad sí', () => {
  const layout = leer('app/_layout.tsx');
  // Las cuatro pestañas de pasajero y el inicio de conductor, instantáneas.
  for (const ruta of ['pasajero', 'saldo', 'historial', 'perfil', 'conductor']) {
    assert.match(
      layout,
      new RegExp(`<Stack\\.Screen name="${ruta}" options=\\{\\{ animation: 'none' \\}\\} />`),
      `${ruta} debe cambiar sin deslizamiento`
    );
  }
  // La transición general se conserva: abrir un viaje o los ajustes sí es ir
  // hacia dentro, y ahí el deslizamiento significa algo.
  assert.match(layout, /animation: 'slide_from_right'/);
});

test('ninguna pantalla del shell reintroduce un deslizamiento propio', () => {
  for (const fichero of ['app/pasajero.tsx', 'app/saldo.tsx', 'app/historial.tsx', 'app/perfil.tsx']) {
    const fuente = despojarComentarios(leer(fichero));
    for (const prohibido of [/slide_from_(right|left)/, /translateX/, /animation: 'slide/]) {
      assert.ok(!prohibido.test(fuente), `${fichero} no debe deslizar: ${prohibido}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Las pantallas compartidas
// ---------------------------------------------------------------------------

test('Historial y Perfil pintan la barra del ROL, no siempre la de pasajera', () => {
  for (const fichero of ['app/historial.tsx', 'app/perfil.tsx']) {
    const fuente = despojarComentarios(leer(fichero));
    assert.match(fuente, /<ShellCompartido/, fichero);
    assert.match(fuente, /shellDelRol\(sesion\.estado === 'AUTENTICADO' \? sesion\.usuario\.role : null\)/, fichero);
    assert.match(fuente, /barra=\{barraDelRol\}/, fichero);
  }
  // Y el componente sabe pintar las dos.
  const secciones = leer('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /barra === 'conductor' \? DESTINOS_DE_CONDUCTOR : DESTINOS_DE_PASAJERA/);
  // Un conductor no lleva el botón de pedir: no es suyo.
  assert.match(secciones, /barra === 'conductor' \? undefined : <ControlDePedido abierto=\{false\} \/>/);
});

test('el shell compartido elige la navegación por el rol real', () => {
  const compartido = despojarComentarios(leer('navegacion/shellCompartido.tsx'));
  assert.match(compartido, /shell === 'conductor' \? crearNavegacionDeConductor\(\) : crearNavegacionDePasajero\(\)/);
  assert.match(compartido, /shellDelRol\(rol\)/);
});

// ---------------------------------------------------------------------------
// Rendimiento
// ---------------------------------------------------------------------------

test('el botón amarillo no dispara ninguna petición por sí mismo', () => {
  const shell = despojarComentarios(leer('navegacion/shellDePasajero.tsx'));
  const compartido = despojarComentarios(leer('navegacion/shellCompartido.tsx'));
  for (const fuente of [shell, compartido]) {
    for (const prohibido of [/fetch\(/, /llamar\(/, /useEffect/, /pedir[A-Z]/]) {
      assert.ok(!prohibido.test(fuente), `el shell sólo navega: ${prohibido}`);
    }
  }
});

test('los shells no registran nada ni guardan estado de rol', () => {
  for (const fichero of ['navegacion/shellDePasajero.tsx', 'navegacion/shellCompartido.tsx', 'domain/shellDeRol.ts', 'app/saldo.tsx']) {
    const fuente = despojarComentarios(leer(fichero));
    assert.ok(!/console\.(log|warn|error)/.test(fuente), `${fichero} no debe registrar`);
    assert.ok(!/useState/.test(fuente) || fichero === 'app/saldo.tsx', `${fichero} no guarda estado de rol`);
  }
});
