import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivatePhotoLoader, userPhotoEndpoint, canonicalPhotoPath } from '../src/utils/privatePhoto.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/**
 * FOTO-1: la tarjeta del viaje activo del conductor muestra la fotografia
 * REAL del pasajero cuando el backend la autoriza, y el avatar local de
 * iniciales --con tamaño propio-- en cualquier otro caso.
 *
 * La seguridad no se negocia: la ruta es la privada de siempre, la pide el
 * cargador autenticado existente, y la unica autoridad de acceso es el
 * backend (contrapartes de un viaje activo). Aqui se fija el contrato de la
 * tarjeta y el ciclo de vida de las object URLs con el cargador real.
 */

const tarjeta = leer('src/pages/driver/activeTrip.js');
const app = leer('src/pages/driver/driverApp.js');
const css = leer('src/styles/driver.css');

// --------------------------------------------------------------------------
// El contrato del marcado
// --------------------------------------------------------------------------

test('la tarjeta nace con el avatar local y un img oculto marcado para hidratacion', () => {
  assert.ok(tarjeta.includes('localAvatarHtml('), 'el estado neutro es el avatar local');
  assert.ok(tarjeta.includes('data-private-photo='), 'la foto real llega por hidratacion, nunca por src directo');
  assert.match(tarjeta, /<img hidden data-private-photo=/, 'la imagen nace oculta: sin caja rota mientras carga');
  assert.ok(tarjeta.includes('alt="Foto de '), 'con su texto alternativo');
  assert.ok(tarjeta.includes('trip-passenger-avatar'), 'dentro del hueco con tamaño propio');
});

test('la ruta de la foto es la privada canonica, derivada del id cuando la oferta no la trae', () => {
  assert.ok(tarjeta.includes('canonicalPhotoPath(passenger?.avatar)'));
  assert.ok(tarjeta.includes('userPhotoEndpoint(passenger.id)'),
    'sin ruta en el perfil se deriva la canonica: el backend decide con 404/403');
  // Derivar la ruta jamas decide el acceso: es la misma que ya protege el
  // backend. Ninguna otra URL de foto puede aparecer.
  assert.ok(!/https?:\/\//.test(tarjeta.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')),
    'la tarjeta no puede apuntar a ningun origen externo');
});

test('ningun proveedor remoto de avatares volvio', () => {
  for (const fichero of ['src/pages/driver/activeTrip.js', 'src/pages/driver/driverApp.js']) {
    const codigo = leer(fichero).toLowerCase();
    for (const prohibido of ['dicebear', 'ui-avatars', 'gravatar', 'avatars.githubusercontent']) {
      assert.ok(!codigo.includes(prohibido), `${fichero} reintrodujo ${prohibido}`);
    }
  }
});

// --------------------------------------------------------------------------
// La hidratacion y su ciclo de vida en driverApp
// --------------------------------------------------------------------------

test('las cuatro vistas del viaje se hidratan tras conectarse al documento', () => {
  const hidrataciones = app.match(/hydratePrivatePhotos\(/g) || [];
  assert.equal(hidrataciones.length, 4,
    'aceptar, llegar, iniciar y restaurar: cada montaje hidrata su vista');
  // Y siempre DESPUES de appendChild: el cargador solo pinta elementos vivos.
  for (const vista of ['enRouteView', 'waitingView', 'inTripView', 'view']) {
    const monta = app.indexOf(`activeTripContainer.appendChild(${vista})`);
    const hidrata = app.indexOf(`hydratePrivatePhotos(${vista}`);
    assert.ok(monta >= 0 && hidrata > monta, `${vista}: hidratar va despues de montar`);
  }
});

test('cerrar el viaje revoca la foto del pasajero con SU clave y respeta la propia', () => {
  const limpiar = app.slice(app.indexOf('function clearCompletedTripUi'), app.indexOf('tripPanelToggle.addEventListener'));
  assert.ok(limpiar.includes('privatePhotos.release(fotoPasajero)'), 'la foto del pasajero se libera al cerrar');
  assert.ok(limpiar.includes('userPhotoEndpoint(currentPassenger.id)'),
    'la clave de liberacion se deriva IGUAL que la de hidratacion');
  assert.ok(!limpiar.includes('releaseAll'),
    'liberar todo arrasaria el avatar propio del conductor');
  assert.ok(!limpiar.includes("release('propia')"), 'la foto propia no se toca al cerrar un viaje');
});

// --------------------------------------------------------------------------
// El tamaño: el hueco mide lo que media el <img> de siempre
// --------------------------------------------------------------------------

test('el hueco del avatar tiene tamaño explicito y la imagen conserva su contrato', () => {
  assert.match(css, /\.trip-passenger-row \.trip-passenger-avatar\{width:42px;height:42px/,
    'el hueco define su tamaño: se acabo el recuadro sin dimension');
  assert.match(css, /\.trip-passenger-avatar \.local-avatar\{width:42px;height:42px[^}]*border-radius:50%/,
    'el avatar local llena el hueco con la geometria del diseño');
  assert.match(css, /\.trip-passenger-row img\{width:42px;height:42px[^}]*object-fit:cover\}/,
    'el contrato del <img> de la fila no cambio');
});

// --------------------------------------------------------------------------
// El ciclo real de object URLs, con el cargador verdadero
// --------------------------------------------------------------------------

function elementoVivo() {
  const local = { hidden: false, matches: () => true };
  const el = {
    isConnected: true,
    hidden: true,
    src: '',
    removeAttribute() { this.src = ''; },
    parentElement: { querySelector: () => local }
  };
  return { el, local };
}

function montarCargador(respuestas) {
  const revocadas = [];
  let peticiones = 0;
  const loader = createPrivatePhotoLoader({
    loadUrl: async (endpoint) => {
      peticiones += 1;
      const respuesta = respuestas[endpoint];
      return typeof respuesta === 'function' ? respuesta() : (respuesta ?? null);
    },
    revokeUrl: url => revocadas.push(url)
  });
  return { loader, revocadas, contarPeticiones: () => peticiones };
}

test('la foto autorizada se pinta y sustituye visualmente al avatar local', async () => {
  const rutaA = userPhotoEndpoint('p_a');
  const { loader } = montarCargador({ [rutaA]: 'blob:foto-a' });
  const { el, local } = elementoVivo();

  const url = await loader.applyTo(el, rutaA, { key: rutaA });
  assert.equal(url, 'blob:foto-a');
  assert.equal(el.src, 'blob:foto-a');
  assert.equal(el.hidden, false, 'la imagen se muestra');
  assert.equal(local.hidden, true, 'y el avatar local se oculta');
  loader.destroy();
});

test('sin foto o con acceso denegado no se pinta nada y el avatar local se queda', async () => {
  // 401, 403 y 404 llegan igual: getPrivateFileUrl devuelve null.
  const rutaB = userPhotoEndpoint('p_b');
  const { loader } = montarCargador({ [rutaB]: null });
  const { el, local } = elementoVivo();

  const url = await loader.applyTo(el, rutaB, { key: rutaB });
  assert.equal(url, null);
  assert.equal(el.src, '', 'no hay src que romper');
  assert.equal(el.hidden, true, 'la imagen sigue oculta');
  assert.equal(local.hidden, false, 'el avatar local sigue visible');
  loader.destroy();
});

test('una ruta vacia (pasajero sin id) no genera ninguna peticion', async () => {
  const { loader, contarPeticiones } = montarCargador({});
  const { el } = elementoVivo();
  const url = await loader.applyTo(el, '', { key: '' });
  assert.equal(url, null);
  assert.equal(contarPeticiones(), 0, 'sin ruta valida no se toca la red');
  loader.destroy();
});

test('una respuesta tardia del pasajero anterior no pisa al nuevo y su URL se revoca', async () => {
  const rutaA = userPhotoEndpoint('p_a');
  const rutaB = userPhotoEndpoint('p_b');
  let soltarA;
  const { loader, revocadas } = montarCargador({
    [rutaA]: () => new Promise(resolve => { soltarA = () => resolve('blob:foto-a-tardia'); }),
    [rutaB]: 'blob:foto-b'
  });

  const vistaA = elementoVivo();
  const pendienteA = loader.applyTo(vistaA.el, rutaA, { key: rutaA });

  // El viaje de A se cierra ANTES de que llegue su foto (release con SU clave,
  // exactamente lo que hace clearCompletedTripUi) y entra el pasajero B.
  loader.release(rutaA);
  const vistaB = elementoVivo();
  await loader.applyTo(vistaB.el, rutaB, { key: rutaB });

  soltarA();
  const resultadoA = await pendienteA;
  assert.equal(resultadoA, null, 'la respuesta tardia queda invalidada');
  assert.equal(vistaA.el.src, '', 'la vista vieja no se pinta');
  assert.equal(vistaB.el.src, 'blob:foto-b', 'la vista nueva conserva SU foto');
  assert.ok(revocadas.includes('blob:foto-a-tardia'), 'la URL tardia se revoca: nadie la posee');
  loader.destroy();
});

test('el ciclo A -> B -> A -> destruir no filtra ninguna object URL', async () => {
  const rutaA = userPhotoEndpoint('p_a');
  const rutaB = userPhotoEndpoint('p_b');
  let entregadas = 0;
  const { loader, revocadas } = montarCargador({
    [rutaA]: () => { entregadas += 1; return `blob:a-${entregadas}`; },
    [rutaB]: () => { entregadas += 1; return `blob:b-${entregadas}`; }
  });

  const creadas = [];
  const viaje = async ruta => {
    const { el } = elementoVivo();
    const url = await loader.applyTo(el, ruta, { key: ruta });
    assert.ok(url, 'cada viaje pinta su foto');
    creadas.push(url);
    loader.release(ruta); // clearCompletedTripUi
  };

  await viaje(rutaA);
  await viaje(rutaB);
  await viaje(rutaA);
  loader.destroy(); // cambio de ruta / cierre de sesion

  assert.equal(creadas.length, 3);
  for (const url of creadas) {
    assert.ok(revocadas.includes(url), `la URL ${url} quedo sin revocar`);
  }
  assert.equal(loader.openCount, 0, 'ninguna URL viva tras destruir');
});

// --------------------------------------------------------------------------
// La seguridad del endpoint no se movio
// --------------------------------------------------------------------------

test('el endpoint de fotos sigue autenticado y con su alcance de dominio', () => {
  const servidor = leer('server/index.js');
  assert.match(servidor, /users\/:id\/photo['"]?,\s*requireAuth/,
    'GET /api/users/:id/photo debe seguir tras requireAuth');
  const acceso = leer('server/domain/photoAccess.js');
  assert.ok(acceso.includes('canViewUserPhoto'), 'la regla de acceso sigue en el dominio');
  assert.ok(acceso.includes('isActiveTripStatus'),
    'y sigue exigiendo la relacion de viaje activo entre contrapartes');
});

test('canonicalPhotoPath y userPhotoEndpoint coinciden: una sola forma de la ruta', () => {
  assert.equal(canonicalPhotoPath(userPhotoEndpoint('p_x')), userPhotoEndpoint('p_x'));
});
