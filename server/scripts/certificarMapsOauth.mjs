/**
 * Certifica que las llamadas de servidor a Google Maps NO dependen de la IP.
 *
 * PARA QUÉ
 *
 * Aquí la IP pública la pone una VPN y cambia cada vez que se cambia de
 * servidor de salida. Con clave de API restringida por IP, cada cambio dejaba
 * Routes fuera de juego --`API_KEY_IP_ADDRESS_BLOCKED`-- hasta que alguien
 * añadía la IP nueva en Google Cloud a mano. Un token OAuth de cuenta de
 * servicio no está atado a ninguna IP, y esto lo demuestra en vez de suponerlo.
 *
 * CÓMO SE USA
 *
 *   node scripts/certificarMapsOauth.mjs      ← con la IP de ahora
 *   (cambiar de servidor en la VPN, SIN tocar la lista de Google Cloud)
 *   node scripts/certificarMapsOauth.mjs      ← tiene que seguir en PASA
 *
 * Entre las dos ejecuciones se recuerda una HUELLA de la IP --no la IP-- para
 * poder decir si cambió. La huella vive en el directorio temporal del sistema,
 * nunca en el repositorio.
 *
 * QUÉ NO IMPRIME
 *
 * Ni el token, ni la clave de API, ni la clave privada, ni la IP. Solo
 * veredictos.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { crearAuthDeMaps, MODO_DE_AUTH } from '../services/googleMapsAuth.js';
import { createRouteGeometryClient } from '../services/routeGeometryClient.js';
import { createRouteMatrixClient } from '../services/routeMatrixClient.js';
import { createPlacesClient } from '../services/placesClient.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUELLA = path.join(os.tmpdir(), 'plus58express-certificacion-maps.txt');

// Dos puntos reales de Maracaibo: una llamada mínima que sí devuelve ruta.
const ORIGEN = { lat: 10.6666, lng: -71.6124 };
const DESTINO = { lat: 10.6712, lng: -71.6083 };

/** Solo una huella: la IP en claro no se guarda ni se imprime. */
async function huellaDeLaIp() {
  try {
    const respuesta = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5_000) });
    if (!respuesta.ok) return null;
    const ip = (await respuesta.text()).trim();
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
}

function compararConLaAnterior(huella) {
  if (!huella) return 'DESCONOCIDA';
  let anterior = null;
  try {
    anterior = fs.readFileSync(HUELLA, 'utf8').trim();
  } catch {
    anterior = null;
  }
  try {
    fs.writeFileSync(HUELLA, huella, 'utf8');
  } catch {
    // Si no se puede recordar, se dice que no se sabe; no se falla por esto.
  }
  if (!anterior) return 'PRIMERA_MEDIDA';
  return anterior === huella ? 'IGUAL' : 'CAMBIO';
}

async function probar(nombre, llamada) {
  try {
    const resultado = await llamada();
    console.log(`  ${nombre.padEnd(16)} PASA   ${resultado}`);
    return true;
  } catch (error) {
    // El mensaje es un código escueto de los clientes; nunca lleva credencial.
    console.log(`  ${nombre.padEnd(16)} FALLA  ${error?.message || 'sin detalle'}`);
    return false;
  }
}

const auth = crearAuthDeMaps({
  rutaDeLaCuenta: process.env.GOOGLE_MAPS_SERVICE_ACCOUNT_FILE
    || path.join(serverDir, 'maps-service-account.json'),
  logger: console
});

console.log('\n=== +58express · certificacion de Google Maps en el servidor ===\n');
console.log(`  modo de auth     ${auth.modo}`);
console.log(`  depende de la IP ${auth.dependeDeLaIp ? 'SI (clave de API restringida)' : 'NO (token OAuth)'}`);

const cambio = compararConLaAnterior(await huellaDeLaIp());
console.log(`  IP publica       ${cambio}\n`);

if (!auth.estaConfigurado()) {
  console.log('  Sin credencial: no hay nada que certificar.\n');
  process.exit(1);
}

const geometria = createRouteGeometryClient({ auth, logger: console });
const matriz = createRouteMatrixClient({ auth, logger: console });
const lugares = createPlacesClient({ auth, logger: console });

const exigidos = [
  await probar('computeRoutes', async () => {
    const r = await geometria.computeRoute(ORIGEN, DESTINO);
    return `${r.metros} m, ${Math.round(r.duracionMs / 1000)} s`;
  }),
  await probar('computeMatrix', async () => {
    const r = await matriz.computeToPickup([ORIGEN], DESTINO);
    return `${r.length} fila(s)`;
  })
];

// Places solo cuenta para el veredicto en OAuth. Con clave de API es normal
// que falle: la clave de despacho esta restringida a las APIs de Routes, y
// ampliarla seria justo lo contrario de dar permisos minimos.
const enPlaces = await probar('placesSearch', async () => {
  const r = await lugares.buscar('sambil maracaibo', ORIGEN);
  return `${r.length} resultado(s)`;
});
if (!enPlaces && auth.modo === MODO_DE_AUTH.API_KEY) {
  console.log('                   (esperado: la clave de despacho solo abre Routes)');
}

const todo = exigidos.every(Boolean) && (auth.modo !== MODO_DE_AUTH.OAUTH || enPlaces);
console.log(`\n  VEREDICTO: ${todo ? 'PASA' : 'FALLA'}`);
if (todo && auth.modo === MODO_DE_AUTH.OAUTH && cambio === 'CAMBIO') {
  console.log('  La IP cambio y las llamadas siguen pasando: no dependen de la lista de Google Cloud.');
}
console.log('');
process.exit(todo ? 0 : 1);
