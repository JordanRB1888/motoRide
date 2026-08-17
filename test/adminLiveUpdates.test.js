import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fuente = fs.readFileSync(path.join(raiz, 'src/pages/admin/adminApp.js'), 'utf8');

/**
 * Cada evento de Socket.IO volvia a descargar la lista completa de usuarios y
 * de viajes. Medido contra el servidor real, `/api/users` son 7 MB con el
 * volumen de seis meses, y una rafaga de 36 eventos producia 108 peticiones.
 *
 * Verificado en el panel real tras el cambio: 36 eventos, 3 peticiones, todas
 * a `/admin/overview`, y ninguna a `/users` ni a `/trips`.
 */

// Los `socket.on(...)` del panel, con su cuerpo hasta el cierre de la llamada.
function manejadoresDeSocket() {
  const encontrados = [];
  const patron = /socket\.on\(\s*'([^']+)'\s*,/g;
  for (const coincidencia of fuente.matchAll(patron)) {
    const desde = coincidencia.index + coincidencia[0].length;
    let profundidad = 0;
    let i = desde;
    for (; i < fuente.length; i += 1) {
      const c = fuente[i];
      if (c === '(') profundidad += 1;
      else if (c === ')') {
        if (profundidad === 0) break;
        profundidad -= 1;
      }
    }
    encontrados.push({ evento: coincidencia[1], cuerpo: fuente.slice(desde, i) });
  }
  return encontrados;
}

test('el panel declara manejadores de socket que se pueden inspeccionar', () => {
  const manejadores = manejadoresDeSocket();
  assert.ok(manejadores.length >= 6, `se esperaban varios manejadores, hay ${manejadores.length}`);
});

test('ningun evento de socket vuelve a pedir las listas completas', () => {
  for (const { evento, cuerpo } of manejadoresDeSocket()) {
    for (const listado of ["'/users'", "'/trips'"]) {
      assert.ok(
        !cuerpo.includes(`apiService.get(${listado})`),
        `el manejador de ${evento} vuelve a descargar ${listado}`
      );
    }
  }
});

test('la carga inicial no pide colecciones enteras', () => {
  // `/trips` sigue sin paginar y se pide una sola vez, al abrir el panel.
  const viajes = fuente.split("apiService.get('/trips')").length - 1;
  assert.equal(viajes, 1, `/trips deberia pedirse una sola vez, se pide ${viajes}`);

  // El listado de usuarios nunca se pide entero: siempre acotado. Se mira un
  // tramo de texto tras cada peticion en vez de intentar delimitar la cadena,
  // porque dentro hay parentesis y comillas de `encodeURIComponent`.
  const posiciones = [...fuente.matchAll(/\/users\?/g)].map(m => m.index);
  assert.ok(posiciones.length > 0, 'el panel debe seguir pidiendo usuarios');
  for (const posicion of posiciones) {
    const tramo = fuente.slice(posicion, posicion + 140);
    // El limite puede ser literal o una constante interpolada.
    assert.match(tramo, /limit=(\d+|\$\{)/, `sin limite explicito: ${tramo.slice(0, 70)}`);
  }
  // Y la constante que se interpola tiene que ser un numero acotado, no algo
  // que pueda acabar valiendo «todos».
  const constante = fuente.match(/const DRIVERS_FOR_MAP\s*=\s*(\d+)/);
  assert.ok(constante, 'el tope de conductores debe ser una constante numerica');
  assert.ok(Number(constante[1]) > 0 && Number(constante[1]) <= 500, `tope irrazonable: ${constante[1]}`);
  assert.ok(
    !/apiService\.get\('\/users'\)/.test(fuente),
    'no debe quedar ninguna peticion del listado completo'
  );

  assert.match(fuente, /const loadAll\s*=/, 'debe existir la carga inicial');
  assert.match(fuente, /dashboard\(\);loadAll\(\);/, 'y ejecutarse al abrir el panel');
});

test('los participantes de los viajes se resuelven en bloque, no fila a fila', () => {
  // Pedirlos uno a uno seria una peticion por celda de la tabla.
  assert.match(fuente, /\/users\?ids=/, 'debe resolverse por identificadores');
  assert.match(fuente, /resolverFaltantes=createCoalescer\(/, 'y agrupando las peticiones');
});

test('las cifras agregadas se piden de forma agrupada, no una vez por evento', () => {
  // `/admin/overview` es un objeto pequeno, pero sin agrupar seguiria habiendo
  // una peticion por evento.
  assert.match(fuente, /createCoalescer\(/, 'el refresco debe estar agrupado');
  const suelto = fuente.split("apiService.get('/admin/overview')").length - 1;
  assert.equal(suelto, 2, 'solo la carga inicial y el refresco agrupado');
});

test('los registros que llegan en el evento se aplican sin pedir nada', () => {
  assert.match(fuente, /const patchTrip\s*=/, 'debe aplicarse el viaje del evento');
  assert.match(fuente, /const patchUser\s*=/, 'debe aplicarse el usuario del evento');
  assert.match(fuente, /mergeById\(/, 'usando la fusion por identificador');

  // Cada evento nombra el identificador a su manera: `tripStatusUpdated` usa
  // `tripId` y una de las ramas de `admin:driver_updated` usaba solo `userId`.
  // Sin normalizar, la fusion no encuentra el registro y el aviso se pierde o
  // se duplica. El comportamiento de esa normalizacion esta comprobado en
  // test/liveUpdates.test.js; aqui solo se verifica que la pantalla la use.
  assert.match(fuente, /withCanonicalId\(patch,\s*\['id',\s*'tripId'\]\)/, 'el viaje debe normalizarse');
  assert.match(fuente, /withCanonicalId\(patch,\s*\['id',\s*'userId',\s*'driverId'\]\)/, 'y el usuario tambien');
});
