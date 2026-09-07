import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TODAS LAS RUTAS EMPIEZAN POR `/api`
 *
 * POR QUÉ ESTA PRUEBA EXISTE
 *
 * `services/otp.ts` llamaba a `/auth/verification/channels` en vez de
 * `/api/auth/verification/channels`. El servidor devolvía 404 y la aplicación
 * enseñaba «El servidor no responde», que manda a mirar la conexión — el sitio
 * equivocado. Estuvo así sin que nadie lo notara porque a la pantalla de
 * verificación casi no se llegaba; en cuanto el registro empezó a pasar por
 * ella, apareció a la primera.
 *
 * `EXPO_PUBLIC_API_BASE_URL` es sólo el origen (`https://…`, sin `/api`), así
 * que el prefijo lo pone cada ruta. Una que se lo salte compila, pasa el
 * typecheck y falla únicamente contra el servidor de verdad, que es la peor
 * combinación posible.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpetaDeServicios = path.join(raizMovil, 'services');

/** Cada `llamar('…')` del código, con el fichero donde vive. */
function rutasLlamadas() {
  const encontradas = [];
  for (const fichero of fs.readdirSync(carpetaDeServicios)) {
    if (!/\.(ts|tsx)$/.test(fichero)) continue;
    const fuente = fs.readFileSync(path.join(carpetaDeServicios, fichero), 'utf8');
    // `llamar` y `llamarConArchivo` reciben la ruta como primer argumento.
    for (const coincidencia of fuente.matchAll(/\bllamar[A-Za-z]*[^(\n]*\(\s*(?:<[^>]*>\s*)?['"`](\/[^'"`]*)['"`]/g)) {
      encontradas.push({ fichero, ruta: coincidencia[1] });
    }
  }
  return encontradas;
}

test('ninguna ruta se salta el prefijo /api', () => {
  const rutas = rutasLlamadas();

  // Si el patrón deja de encontrar llamadas, la prueba pasaría sin comprobar
  // nada. Se exige un mínimo para que no se convierta en decoración.
  assert.ok(rutas.length >= 10, `sólo se encontraron ${rutas.length} llamadas: revisa el patrón`);

  const sinPrefijo = rutas.filter(({ ruta }) => !ruta.startsWith('/api/'));
  assert.deepEqual(
    sinPrefijo,
    [],
    'estas rutas devolverán 404 contra el servidor de verdad, y la aplicación lo enseñará como «el servidor no responde»'
  );
});

test('la dirección base es sólo el origen, sin `/api` dentro', () => {
  // Si alguien mete `/api` en la variable Y en la ruta, sale `/api/api/…`.
  // La plantilla es la que enseña la forma correcta.
  const plantilla = fs.readFileSync(path.join(raizMovil, '.env.staging.example'), 'utf8');
  const linea = plantilla.split('\n').find(l => l.startsWith('EXPO_PUBLIC_API_BASE_URL='));
  assert.ok(linea, 'la plantilla perdió la variable del backend');
  assert.doesNotMatch(linea, /\/api\/?$/, 'la dirección base no lleva `/api`: lo pone cada ruta');
});

test('las tres rutas de verificación son las que el servidor sirve', () => {
  // Las que fallaban. Se nombran una a una porque son el camino por el que
  // alguien confirma su cuenta: si se rompen, nadie puede entrar.
  const otp = fs.readFileSync(path.join(carpetaDeServicios, 'otp.ts'), 'utf8');
  for (const ruta of [
    '/api/auth/verification/channels',
    '/api/auth/verification/send',
    '/api/auth/verification/verify'
  ]) {
    assert.ok(otp.includes(`'${ruta}'`), `falta ${ruta}`);
  }
});
