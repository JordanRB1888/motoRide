import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivatePhotoLoader, hydratePrivatePhotos } from '../src/utils/privatePhoto.js';
import { createPrivatePhotoScope } from '../src/utils/privatePhotoScope.js';
import {
  LOCAL_AVATAR_CLASS,
  applyLocalAvatar,
  avatarInitials,
  avatarTone,
  localAvatarHtml
} from '../src/utils/localAvatar.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => fs.readFileSync(path.join(raiz, r), 'utf8');

function fuentesRastreadas() {
  const salida = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(completo);
      else if (/\.(js|css|html|md)$/.test(e.name)) salida.push(completo);
    }
  };
  recorrer(path.join(raiz, 'src'));
  recorrer(path.join(raiz, 'test'));
  recorrer(path.join(raiz, 'public'));
  salida.push(path.join(raiz, 'index.html'));
  return salida.filter(f => fs.existsSync(f));
}

// ------------------------------------------------------ ausencia de terceros

test('no queda ninguna referencia a DiceBear en el código rastreado', () => {
  const esteArchivo = fileURLToPath(import.meta.url);
  const ofensores = fuentesRastreadas()
    .filter(f => f !== esteArchivo)
    .filter(f => /dicebear/i.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(ofensores.map(f => path.relative(raiz, f)), []);
});

test('ningún avatar se genera pidiéndolo a un servicio externo', () => {
  const ofensores = [];
  // Solo el codigo de la aplicacion: las pruebas usan dominios de ejemplo a
  // proposito como fixtures negativos.
  const soloAplicacion = fuentesRastreadas().filter(f => f.includes(path.sep + 'src' + path.sep));
  for (const f of soloAplicacion) {
    for (const linea of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!/avatar/i.test(linea)) continue;
      if (/https?:\/\/(?!localhost|127\.0\.0\.1)/.test(linea)) ofensores.push(`${path.relative(raiz, f)}: ${linea.trim().slice(0, 70)}`);
    }
  }
  assert.deepEqual(ofensores, [], 'un avatar no puede depender de un tercero');
});

test('el avatar local no usa data URLs, base64, SVG ni canvas', () => {
  const helper = leer('src/utils/localAvatar.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const prohibido of ['data:image', 'base64', '<svg', 'toDataURL', 'canvas', 'createObjectURL']) {
    assert.ok(!helper.includes(prohibido), `el helper no puede usar ${prohibido}`);
  }
  const marcado = localAvatarHtml({ name: 'Ana Pérez', role: 'driver' });
  assert.ok(!/https?:|data:|base64|<svg/i.test(marcado), `el marcado no puede llevar URLs: ${marcado}`);
});

// ----------------------------------------------------------------- iniciales

test('iniciales con nombres normales', () => {
  assert.equal(avatarInitials('Ana Pérez'), 'AP');
  assert.equal(avatarInitials('josé maría rodríguez'), 'JM');
});

test('un nombre de una sola palabra da una inicial', () => {
  assert.equal(avatarInitials('Carlos'), 'C');
});

test('espacios repetidos y bordes no alteran el resultado', () => {
  assert.equal(avatarInitials('   Ana    Pérez   '), 'AP');
  assert.equal(avatarInitials('\tAna\nPérez '), 'AP');
});

test('un nombre vacío cae en una inicial genérica', () => {
  for (const vacio of ['', '   ', null, undefined]) {
    assert.equal(avatarInitials(vacio), '·', `«${vacio}» debía dar la genérica`);
  }
});

test('nunca más de dos iniciales', () => {
  assert.equal(avatarInitials('Ana María Pérez Rodríguez de la Torre').length, 2);
  assert.equal(avatarInitials('a b c d e f'), 'AB');
});

test('caracteres Unicode fuera del plano básico no se parten', () => {
  assert.equal(avatarInitials('Ñandú Ávila'), 'ÑÁ');
  assert.equal(avatarInitials('Ωμέγα Δέλτα'), 'ΩΔ');
  // Un emoji ocupa dos unidades UTF-16: debe salir entero, no medio carácter.
  const conEmoji = avatarInitials('🙂 Pérez');
  assert.equal([...conEmoji].length, 2);
  assert.ok(conEmoji.startsWith('🙂'));
});

test('el texto con caracteres HTML se escapa y no inyecta marcado', () => {
  const marcado = localAvatarHtml({ name: '<img src=x onerror=alert(1)> Pérez' });
  assert.ok(!marcado.includes('<img'), `no puede inyectarse marcado: ${marcado}`);
  assert.ok(!marcado.includes('onerror'));
  assert.ok(marcado.includes('&lt;'), 'las iniciales llegan escapadas');

  const comillas = localAvatarHtml({ name: '"x', className: '" onmouseover="alert(1)', label: '"><b>' });
  assert.ok(!comillas.includes('" onmouseover'), 'las comillas del atributo van escapadas');
  assert.ok(comillas.includes('&quot;'), 'y aparecen como entidad');
  assert.ok(!comillas.includes('<b>'), 'ni por la etiqueta accesible');
});

test('applyLocalAvatar escribe por textContent, nunca por HTML', () => {
  const clases = [];
  const elemento = { textContent: '', classList: { add: (...c) => clases.push(...c) } };
  applyLocalAvatar(elemento, { name: '<b>Ana</b> Pérez', role: 'passenger' });
  assert.equal(elemento.textContent, '<P', 'el valor va literal, sin interpretarse');
  assert.ok(clases.includes(LOCAL_AVATAR_CLASS));
  assert.ok(clases.includes(`${LOCAL_AVATAR_CLASS}--passenger`));
});

// ------------------------------------------------------------------- paleta

test('el tono depende solo del rol, nunca de datos personales', () => {
  assert.equal(avatarTone('driver'), 'driver');
  assert.equal(avatarTone('admin'), 'admin');
  assert.equal(avatarTone('passenger'), 'passenger');
  assert.equal(avatarTone('desconocido'), 'passenger');
  // Dos personas distintas con el mismo rol comparten tono: el color no
  // transporta identidad.
  const a = localAvatarHtml({ name: 'Ana Pérez', role: 'driver' });
  const b = localAvatarHtml({ name: 'Luis Gómez', role: 'driver' });
  assert.equal(a.match(/local-avatar--\w+/)[0], b.match(/local-avatar--\w+/)[0]);
});

test('ningún dato personal aparece dentro de una URL de avatar', () => {
  const marcado = localAvatarHtml({
    name: 'Ana Pérez',
    role: 'driver',
    label: 'Ana Pérez'
  });
  for (const portador of ['src=', 'href=', 'url(', 'http:', 'https:', 'data:']) {
    assert.ok(!marcado.includes(portador), `el avatar local no puede llevar ${portador}: ${marcado}`);
  }
});

// -------------------------------------------- convivencia con la foto privada

function makeSlot(photoPath) {
  const local = { hidden: false, dataset: { localAvatar: '' }, textContent: 'AP' };
  const img = {
    hidden: true,
    src: '',
    isConnected: true,
    dataset: { privatePhoto: photoPath },
    removeAttribute(nombre) { if (nombre === 'src') this.src = ''; }
  };
  img.parentElement = { querySelector: sel => (sel === '[data-local-avatar]' ? local : null) };
  return { local, img, container: { querySelectorAll: () => [img] } };
}

/** Un hueco está en estado neutro cuando no hay imagen y sí avatar local. */
function assertNeutro(s, mensaje) {
  assert.equal(s.img.src, '', `${mensaje}: el src debe quedar vacío`);
  assert.equal(s.img.hidden, true, `${mensaje}: la imagen debe ocultarse`);
  assert.equal(s.local.hidden, false, `${mensaje}: el avatar local debe reaparecer`);
}

const arnes = ({ responder } = {}) => {
  const revoked = [];
  let n = 0;
  const loader = createPrivatePhotoLoader({
    loadUrl: async () => (responder ? responder() : `blob:foto-${++n}`),
    revokeUrl: u => revoked.push(u)
  });
  return { loader, revoked };
};

test('una fotografía autorizada sustituye visualmente al avatar local', async () => {
  const { loader } = arnes();
  const s = makeSlot('/api/users/driver_1/photo');
  await hydratePrivatePhotos(s.container, loader);

  assert.equal(s.img.src, 'blob:foto-1');
  assert.equal(s.img.hidden, false, 'la fotografía se muestra');
  assert.equal(s.local.hidden, true, 'y el avatar local se oculta');
});

test('ante 401, 403, 404 o red caída permanece el avatar local', async () => {
  for (const fallo of [() => null, () => { throw new Error('red'); }]) {
    const { loader } = arnes({ responder: fallo });
    const s = makeSlot('/api/users/ajeno/photo');
    await hydratePrivatePhotos(s.container, loader);

    assert.equal(s.img.src, '', 'no se pinta ninguna imagen');
    assert.equal(s.img.hidden, true);
    assert.equal(s.local.hidden, false, 'el avatar local se queda');
  }
});

test('releaseAll revoca la URL y devuelve el hueco a su estado neutro', async () => {
  const { loader, revoked } = arnes();
  const s = makeSlot('/api/users/driver_1/photo');
  await hydratePrivatePhotos(s.container, loader);
  assert.equal(loader.openCount, 1);
  assert.equal(s.local.hidden, true, 'el avatar local estaba oculto');

  loader.releaseAll();

  assert.deepEqual(revoked, ['blob:foto-1']);
  assert.equal(loader.openCount, 0);
  assertNeutro(s, 'releaseAll');
});

test('release(key) restaura solo el hueco de esa clave', async () => {
  const { loader, revoked } = arnes();
  const uno = makeSlot('/api/users/driver_1/photo');
  const dos = makeSlot('/api/users/driver_2/photo');
  await hydratePrivatePhotos(uno.container, loader);
  await hydratePrivatePhotos(dos.container, loader);

  loader.release('/api/users/driver_1/photo');

  assert.deepEqual(revoked, ['blob:foto-1']);
  assertNeutro(uno, 'release');
  assert.equal(dos.img.hidden, false, 'el otro hueco no se toca');
  assert.equal(dos.local.hidden, true);
});

test('destroy restaura todos los huecos', async () => {
  const { loader } = arnes();
  const uno = makeSlot('/api/users/driver_1/photo');
  const dos = makeSlot('/api/users/driver_2/photo');
  await hydratePrivatePhotos(uno.container, loader);
  await hydratePrivatePhotos(dos.container, loader);

  loader.destroy();

  assertNeutro(uno, 'destroy');
  assertNeutro(dos, 'destroy');
  assert.equal(loader.openCount, 0);
});

test('completar, cancelar o cambiar de viaje devuelve el avatar local', async () => {
  const { loader } = arnes();
  const scope = createPrivatePhotoScope({ loader });
  const viaje = { id: 'trip_1' };
  const conductor = { id: 'driver_1', photoUrl: '/api/users/driver_1/photo' };

  for (const cierre of ['COMPLETED', 'CANCELLED', 'IDLE']) {
    const s = makeSlot('/api/users/driver_1/photo');
    scope.sync('IN_TRIP', viaje, conductor);
    await hydratePrivatePhotos(s.container, loader);
    assert.equal(s.local.hidden, true, `${cierre}: la fotografía se mostraba`);

    scope.sync(cierre, viaje, conductor);

    assertNeutro(s, cierre);
  }
});

test('una respuesta tardía nunca oculta el avatar local', async () => {
  let resolver;
  const { loader } = arnes({ responder: () => new Promise(r => { resolver = r; }) });
  const s = makeSlot('/api/users/driver_1/photo');

  const enVuelo = hydratePrivatePhotos(s.container, loader);
  loader.releaseAll();
  resolver('blob:tardia');
  await enVuelo;

  assertNeutro(s, 'respuesta tardía');
});

test('reemplazar la fotografía no deja dos imágenes ni dos fallbacks visibles', async () => {
  const { loader } = arnes();
  const s = makeSlot('/api/users/driver_1/photo');
  await hydratePrivatePhotos(s.container, loader);
  assert.equal(s.img.hidden, false);
  assert.equal(s.local.hidden, true);

  // Se sustituye la fotografía: primero se suelta, luego se vuelve a pedir.
  loader.release('/api/users/driver_1/photo');
  assertNeutro(s, 'tras soltar');
  await hydratePrivatePhotos(s.container, loader);

  // Exactamente uno visible en cada momento.
  assert.equal(s.img.hidden, false, 'la nueva fotografía se ve');
  assert.equal(s.local.hidden, true, 'y el avatar local no');
  assert.notEqual(s.img.src, '', 'con una única imagen');
});

// -------------------------------------------------- integración por pantalla

test('los consumidores migrados usan el avatar local', () => {
  const pantallas = [
    'src/components/chatModal.js',
    'src/components/ratingTipModal.js',
    'src/components/driverRatingModal.js',
    'src/pages/admin/fleetMap.js',
    'src/pages/driver/activeTrip.js',
    'src/pages/driver/incomingRide.js',
    'src/pages/driver/driverApp.js',
    'src/pages/driver/driverProfile.js',
    'src/pages/passenger/activeRide.js',
    'src/pages/passenger/requestRide.js',
    'src/pages/passenger/profile.js'
  ];
  for (const p of pantallas) {
    const fuente = leer(p);
    assert.ok(fuente.includes('localAvatar.js'), `${p} debe usar el avatar local`);
    assert.ok(!/dicebear/i.test(fuente), `${p} no puede conservar DiceBear`);
  }
});

test('el recibo histórico y las calificaciones usan avatar local sin fotografía', () => {
  const recibo = leer('src/components/digitalReceiptModal.js');
  assert.ok(!/dicebear|ui-avatars/i.test(recibo));
  assert.ok(recibo.includes('neutralizePrivatePhoto'), 'el recibo nunca pide la fotografía privada');
  const rating = leer('src/components/driverRatingModal.js');
  assert.ok(rating.includes('localAvatarHtml'));
});

test('no se reintroduce photoUrl crudo en ningún src', () => {
  const ofensores = [];
  for (const f of fuentesRastreadas().filter(f => f.endsWith('.js'))) {
    const fuente = fs.readFileSync(f, 'utf8')
      .replace(/neutralizePrivatePhoto\([^)]*\)/g, 'NEUTRO')
      .replace(/canonicalPhotoPath\([^)]*\)/g, 'CANONICO');
    for (const [n, linea] of fuente.split('\n').entries()) {
      if (/src="\$\{/.test(linea) && /photoUrl|passengerAvatar/.test(linea)) {
        ofensores.push(`${path.relative(raiz, f)}:${n + 1}`);
      }
    }
  }
  assert.deepEqual(ofensores, []);
});

test('las clases visuales del diseño aprobado se conservan', () => {
  assert.ok(leer('src/components/chatModal.js').includes('recipient-avatar'));
  assert.ok(leer('src/pages/driver/driverApp.js').includes("className: 'driver-avatar'"));
  assert.ok(leer('src/pages/driver/driverApp.js').includes('id="driver-avatar"'));
  assert.ok(leer('src/pages/passenger/requestRide.js').includes('data-private-photo='));

  // La hoja local existe, está enganchada y el diseño aprobado sigue cargado.
  assert.ok(fs.existsSync(path.join(raiz, 'src/styles/local-avatar.css')));
  const main = leer('src/main.js');
  assert.ok(main.includes("import './styles/local-avatar.css'"));
  assert.ok(main.includes("import('./styles/um-motion-preview.css')"), 'el diseño aprobado sigue cargándose');
  assert.ok(fs.existsSync(path.join(raiz, 'src/components/notificationCenterModal.js')));
});
