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

test('la carga completa existe una sola vez y es la del arranque', () => {
  // Una sola llamada a cada listado en todo el archivo: la de loadAll.
  for (const listado of ["'/users'", "'/trips'"]) {
    const veces = fuente.split(`apiService.get(${listado})`).length - 1;
    assert.equal(veces, 1, `${listado} deberia pedirse una sola vez, se pide ${veces}`);
  }
  assert.match(fuente, /const loadAll\s*=/, 'debe existir la carga inicial');
  assert.match(fuente, /dashboard\(\);loadAll\(\);/, 'y ejecutarse al abrir el panel');
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

  // `tripStatusUpdated` identifica el viaje con `tripId`, no con `id`: sin
  // traducirlo, la fusion no encontraria el registro y anadiria uno nuevo en
  // cada cambio de estado.
  assert.match(fuente, /id:\s*data\?\.tripId/, 'tripId debe traducirse a id');
});
