import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emoji = /\p{Extended_Pictographic}/u;

const archivos = [];
const recorrer = dir => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) { recorrer(completo); continue; }
    if (entrada.name.endsWith('.js')) archivos.push(completo);
  }
};
recorrer(path.join(root, 'src'));

const lineasConEmoji = () => {
  const salida = [];
  for (const archivo of archivos) {
    const relativo = path.relative(root, archivo).split(path.sep).join('/');
    fs.readFileSync(archivo, 'utf8').split(/\r?\n/).forEach((linea, i) => {
      if (emoji.test(linea)) salida.push({ archivo: relativo, n: i + 1, texto: linea.trim() });
    });
  }
  return salida;
};

/* MEDIUM 1 de la certificación de Codex.
   El emoji puede quedarse cuando es CONTENIDO —un mensaje que sale hacia otra
   persona, una plantilla de respuesta rápida, un log— pero no cuando hace de
   ICONO de la interfaz: botón, estado, permiso, navegación, acción o control
   de calificación. Para eso está la familia de icon(). */

test('ninguna superficie de interfaz usa emoji como icono funcional', () => {
  // Marcas de que el emoji está haciendo de icono, no de texto.
  const patronesDeIcono = [
    /innerHTML\s*=\s*[`'"]\s*\p{Extended_Pictographic}/u,
    /<span[^>]*>\s*\p{Extended_Pictographic}\s*<\/span>/u,
    /<div[^>]*class="[^"]*icon[^"]*"[^>]*>\s*\p{Extended_Pictographic}/u,
    /class="star-btn"[^>]*>\s*\p{Extended_Pictographic}/u
  ];

  const infractores = lineasConEmoji().filter(({ texto }) =>
    patronesDeIcono.some(p => p.test(texto)));

  assert.deepEqual(
    infractores.map(i => `${i.archivo}:${i.n}`),
    [],
    'un emoji hace de icono de interfaz; debe usar icon() de la familia oficial'
  );
});

test('el emoji que permanece es contenido, no interfaz', () => {
  // Inventario vivo: si aparece un emoji en un archivo que no está en esta
  // lista, alguien lo metió en una superficie nueva y hay que clasificarlo.
  const permitidos = new Set([
    // Mensajes y plantillas que viajan al otro usuario
    'src/components/chatModal.js',
    'src/components/digitalReceiptModal.js',
    'src/components/sosModal.js',
    // Avisos transitorios: el emoji va dentro de la frase
    'src/pages/passenger/passengerApp.js',
    'src/pages/passenger/activeRide.js',
    'src/pages/driver/driverApp.js',
    'src/pages/driver/driverProfile.js',
    'src/components/mapComponent.js',
    'src/services/driverGpsTracker.js',
    // Campo icon de las notificaciones, que se renderiza como texto
    'src/services/notificationService.js',
    // Registro interno, nunca se pinta
    'src/services/driverDispatchService.js',
    'src/services/socketClient.js',
    'src/utils/logger.js',
    'src/pages/admin/adminApp.js',
    'src/components/adminSupportChat.js',
    // Contenido con significado propio: bandera del país, símbolo de copyright
    'src/pages/landing.js',
    'src/pages/admin/fleetMap.js'
  ]);

  const inesperados = [...new Set(lineasConEmoji().map(l => l.archivo))]
    .filter(a => !permitidos.has(a));

  assert.deepEqual(inesperados, [],
    'emoji en una superficie no clasificada: decide si es contenido o si debe usar icon()');
});

test('los controles de calificación usan la familia oficial', () => {
  // Eran cinco ⭐ como control de estrellas: un icono funcional de manual.
  const activeRide = fs.readFileSync(path.join(root, 'src/pages/passenger/activeRide.js'), 'utf8');
  const estrellas = [...activeRide.matchAll(/class="star-btn"[^>]*>([^<]*)</g)];
  assert.equal(estrellas.length, 5, 'deben seguir siendo cinco estrellas');
  for (const [, contenido] of estrellas) {
    assert.match(contenido, /icon\('starFilled'/,
      'la estrella debe venir de icon(), no de un emoji');
  }
});
