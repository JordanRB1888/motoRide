import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BANDERA_RETIROS_ANTIGUOS,
  ERROR_RETIROS_ANTIGUOS_APAGADOS,
  bloquearSiApagado,
  esAprobacionDeRetiroAntiguo,
  retirosAntiguosHabilitados
} from '../services/legacyPayoutGate.js';

/**
 * WALLET-PAYOUTS-1A — la compuerta del flujo ANTIGUO de retiros.
 *
 * Se prueba contra el servidor REAL, levantado con `index.js`, y por la API de
 * verdad. Con dobles no se comprobaría lo que importa: que la ruta que existe
 * hoy en producción deja de mover dinero.
 *
 * Cada prueba usa su propio fichero de datos temporal. No se toca ninguna base
 * compartida ni, por supuesto, producción.
 */

const dirServidor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE_ADMIN = 'legacy-payout-gate-admin';

const arrancados = [];

async function levantarServidor(dataFile, extra = {}) {
  const puerto = 25600 + Math.floor(Math.random() * 300);
  const hijo = spawn(process.execPath, ['index.js'], {
    cwd: dirServidor,
    env: {
      ...process.env,
      PORT: String(puerto),
      DATA_FILE: dataFile,
      JWT_SECRET: 'legacy-payout-gate-secret-suficientemente-largo',
      ADMIN_PASSWORD: CLAVE_ADMIN,
      // Se limpia por si el entorno de quien ejecuta la tuviera puesta: esta
      // suite decide su valor en cada caso, y heredarlo daría un falso verde.
      [BANDERA_RETIROS_ANTIGUOS]: '',
      ...extra
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  arrancados.push(hijo);

  let traza = '';
  await new Promise((resolver, rechazar) => {
    const limite = setTimeout(() => rechazar(new Error(`El servidor no inició: ${traza}`)), 25000);
    hijo.stdout.on('data', trozo => {
      traza += trozo.toString();
      if (traza.includes('Running')) { clearTimeout(limite); resolver(); }
    });
    hijo.stderr.on('data', trozo => { traza += trozo.toString(); });
    hijo.once('exit', codigo => rechazar(new Error(`Servidor finalizó con código ${codigo}: ${traza}`)));
  });

  return { url: `http://127.0.0.1:${puerto}`, hijo };
}

async function detener(hijo) {
  if (!hijo || hijo.killed) return;
  hijo.kill();
  await new Promise(listo => { hijo.once('exit', listo); setTimeout(listo, 3000); });
}

test.after(() => {
  for (const hijo of arrancados) hijo.kill();
});

const pedir = (url, ruta, opciones = {}) => fetch(`${url}${ruta}`, opciones);

const conToken = (token, cuerpo) => ({
  method: cuerpo?.method ?? 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`
  },
  ...(cuerpo?.body ? { body: JSON.stringify(cuerpo.body) } : {})
});

async function entrarComoAdmin(url) {
  const respuesta = await pedir(url, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@58express.com', password: CLAVE_ADMIN, role: 'admin' })
  });
  assert.equal(respuesta.status, 200, 'el administrador de prueba debe poder entrar');
  return (await respuesta.json()).token;
}

let contador = 0;

/** Crea un conductor YA verificado y devuelve su sesión. */
async function crearConductor(url, tokenAdmin) {
  contador += 1;
  const email = `legacy.driver${contador}.${Date.now()}@ejemplo.com`;
  const alta = await pedir(url, '/api/admin/drivers', conToken(tokenAdmin, {
    body: {
      email,
      phone: `+58414${String(5000000 + contador).slice(0, 7)}`,
      firstName: `Conductor${contador}`,
      lastName: 'Prueba',
      vehiclePlate: `AB${contador}23X`
    }
  }));
  assert.equal(alta.status, 201, 'el alta del conductor de prueba debe funcionar');
  const { temporaryPassword } = await alta.json();

  const sesion = await pedir(url, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: email, password: temporaryPassword, role: 'driver' })
  });
  assert.equal(sesion.status, 200, 'el conductor de prueba debe poder entrar');
  return (await sesion.json()).token;
}

/** Acredita saldo por el camino real: recarga + aprobación de administración. */
async function acreditarSaldo(url, tokenAdmin, tokenConductor, monto) {
  const recarga = await pedir(url, '/api/wallet/topups', conToken(tokenConductor, {
    body: { amount: monto, reference: String(Date.now()).slice(-10) }
  }));
  assert.equal(recarga.status, 201, 'la recarga debe crearse');
  const transaccion = await recarga.json();

  const aprobacion = await pedir(url, `/api/admin/transactions/${transaccion.id}`, conToken(tokenAdmin, {
    method: 'PATCH',
    body: { status: 'APPROVED', referenceConfirmed: true }
  }));
  assert.equal(aprobacion.status, 200, 'aprobar una RECARGA debe seguir funcionando');
  return (await aprobacion.json()).balance;
}

const cartera = async (url, token) => {
  const respuesta = await pedir(url, '/api/wallet/me', {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(respuesta.status, 200);
  return respuesta.json();
};

const pedirRetiro = (url, token, monto) =>
  pedir(url, '/api/wallet/payouts', conToken(token, { body: { amount: monto } }));

async function temporal() {
  const dir = await mkdtemp(path.join(tmpdir(), 'plus58express-legacy-gate-'));
  return path.join(dir, 'database.json');
}

// ---------------------------------------------------------------------------
// La bandera, sin servidor
// ---------------------------------------------------------------------------

test('la bandera está APAGADA por defecto', () => {
  assert.equal(retirosAntiguosHabilitados({}), false);
  assert.ok(bloquearSiApagado({}), 'sin bandera, se bloquea');
});

test('SÓLO el literal «1» enciende el flujo antiguo', () => {
  // Un único valor aceptado significa que encenderlo es deliberado y que nadie
  // lo hace por accidente escribiendo cualquier cosa en una variable.
  for (const valor of ['0', 'true', 'TRUE', 'yes', 'si', 'on', 'enabled', '', '  ', '2', 'false']) {
    assert.equal(
      retirosAntiguosHabilitados({ [BANDERA_RETIROS_ANTIGUOS]: valor }), false,
      `«${valor}» no debe encender el flujo antiguo`
    );
  }
  assert.equal(retirosAntiguosHabilitados({ [BANDERA_RETIROS_ANTIGUOS]: '1' }), true);
  assert.equal(retirosAntiguosHabilitados({ [BANDERA_RETIROS_ANTIGUOS]: ' 1 ' }), true);
});

test('NINGUNA otra variable puede encender el flujo antiguo', () => {
  // La fundación nueva y el flujo antiguo tienen controles separados: encender
  // uno jamás debe encender el otro.
  const entorno = {
    NODE_ENV: 'development',
    CI: '1',
    WALLET_PAYOUTS_ENABLED: '1',
    DRIVER_WITHDRAWALS_ENABLED: '1',
    LEGACY_PAYOUTS: '1',
    PAYOUTS_ENABLED: '1'
  };
  assert.equal(retirosAntiguosHabilitados(entorno), false);
  assert.ok(bloquearSiApagado(entorno));
});

test('la compuerta administrativa es estrecha a propósito', () => {
  // Sólo la aprobación de un PAYOUT, que es la única rama que resta del saldo.
  assert.equal(esAprobacionDeRetiroAntiguo('PAYOUT', 'APPROVED'), true);

  // Rechazar no mueve dinero: dejarlo pasar es lo que permite resolver de forma
  // segura los retiros que queden pendientes.
  assert.equal(esAprobacionDeRetiroAntiguo('PAYOUT', 'REJECTED'), false);

  // Y ningún otro tipo de transacción se ve afectado.
  for (const tipo of ['TOP_UP', 'RIDE_PAYMENT', 'DRIVER_EARNING', 'PLATFORM_COMMISSION']) {
    assert.equal(esAprobacionDeRetiroAntiguo(tipo, 'APPROVED'), false, tipo);
    assert.equal(esAprobacionDeRetiroAntiguo(tipo, 'REJECTED'), false, tipo);
  }
});

// ---------------------------------------------------------------------------
// A, B, C — la ruta de solicitud, contra el servidor real
// ---------------------------------------------------------------------------

test('A · sin la bandera: solicitar un retiro NO escribe nada', async () => {
  const { url } = await levantarServidor(await temporal());
  const tokenAdmin = await entrarComoAdmin(url);
  const tokenConductor = await crearConductor(url, tokenAdmin);
  await acreditarSaldo(url, tokenAdmin, tokenConductor, 100);

  const antes = await cartera(url, tokenConductor);
  assert.equal(antes.balance, 100, 'el conductor tiene saldo de verdad');

  const respuesta = await pedirRetiro(url, tokenConductor, 50);
  assert.equal(respuesta.status, 403);
  assert.deepEqual(await respuesta.json(), { error: ERROR_RETIROS_ANTIGUOS_APAGADOS });

  const despues = await cartera(url, tokenConductor);
  assert.equal(despues.balance, 100, 'el saldo no se movió');
  assert.equal(
    despues.transactions.filter(item => item.type === 'PAYOUT').length, 0,
    'no se creó ninguna transacción de retiro'
  );
  assert.equal(despues.transactions.length, antes.transactions.length,
    'ni ninguna otra transacción');
});

test('B · con la bandera en «0»: DENEGADO', async () => {
  const { url } = await levantarServidor(await temporal(), { [BANDERA_RETIROS_ANTIGUOS]: '0' });
  const tokenAdmin = await entrarComoAdmin(url);
  const tokenConductor = await crearConductor(url, tokenAdmin);
  await acreditarSaldo(url, tokenAdmin, tokenConductor, 40);

  const respuesta = await pedirRetiro(url, tokenConductor, 20);
  assert.equal(respuesta.status, 403);
  assert.equal((await respuesta.json()).error, ERROR_RETIROS_ANTIGUOS_APAGADOS);
  assert.equal((await cartera(url, tokenConductor)).balance, 40);
});

test('C · con la bandera en «true»: DENEGADO', async () => {
  // El valor que más fácilmente pondría alguien creyendo que enciende.
  const { url } = await levantarServidor(await temporal(), { [BANDERA_RETIROS_ANTIGUOS]: 'true' });
  const tokenAdmin = await entrarComoAdmin(url);
  const tokenConductor = await crearConductor(url, tokenAdmin);
  await acreditarSaldo(url, tokenAdmin, tokenConductor, 40);

  const respuesta = await pedirRetiro(url, tokenConductor, 20);
  assert.equal(respuesta.status, 403);
  assert.equal((await respuesta.json()).error, ERROR_RETIROS_ANTIGUOS_APAGADOS);
  assert.equal((await cartera(url, tokenConductor)).balance, 40);
});

test('D · con la bandera en «1»: el comportamiento antiguo sigue disponible', async () => {
  // Sólo en un entorno de prueba controlado. Sirve para demostrar que la
  // compuerta apaga y enciende de verdad, y que no se rompió la ruta.
  const { url } = await levantarServidor(await temporal(), { [BANDERA_RETIROS_ANTIGUOS]: '1' });
  const tokenAdmin = await entrarComoAdmin(url);
  const tokenConductor = await crearConductor(url, tokenAdmin);
  await acreditarSaldo(url, tokenAdmin, tokenConductor, 60);

  const respuesta = await pedirRetiro(url, tokenConductor, 25);
  assert.equal(respuesta.status, 201, 'con la bandera encendida, el flujo antiguo funciona');
  const transaccion = await respuesta.json();
  assert.equal(transaccion.type, 'PAYOUT');
  assert.equal(transaccion.status, 'PENDING');

  // Y sigue siendo el flujo antiguo, con sus defectos: crear la solicitud NO
  // reserva nada. Se deja constatado, no arreglado — arreglarlo es la
  // fundación nueva, que sigue apagada.
  assert.equal((await cartera(url, tokenConductor)).balance, 60,
    'el flujo antiguo no reserva: el saldo sigue entero');
});

// ---------------------------------------------------------------------------
// E — la aprobación administrativa, que es la que mueve dinero
// ---------------------------------------------------------------------------

test('E · un retiro PENDIENTE no se puede aprobar con el flujo apagado', async () => {
  // Es el escenario del encargo: queda un PAYOUT antiguo en PENDING y después
  // se apaga el flujo. Ese retiro NO puede pagarse solo.
  const dataFile = await temporal();

  // Primero, con el flujo encendido, se crea el pendiente.
  const encendido = await levantarServidor(dataFile, { [BANDERA_RETIROS_ANTIGUOS]: '1' });
  let tokenAdmin = await entrarComoAdmin(encendido.url);
  const tokenConductor = await crearConductor(encendido.url, tokenAdmin);
  await acreditarSaldo(encendido.url, tokenAdmin, tokenConductor, 80);
  const creacion = await pedirRetiro(encendido.url, tokenConductor, 30);
  assert.equal(creacion.status, 201);
  const retiro = await creacion.json();
  await detener(encendido.hijo);

  // Ahora se reinicia con el flujo APAGADO, sobre los mismos datos.
  const apagado = await levantarServidor(dataFile);
  tokenAdmin = await entrarComoAdmin(apagado.url);

  const aprobacion = await pedir(apagado.url, `/api/admin/transactions/${retiro.id}`,
    conToken(tokenAdmin, { method: 'PATCH', body: { status: 'APPROVED' } }));

  assert.equal(aprobacion.status, 403);
  assert.equal((await aprobacion.json()).error, ERROR_RETIROS_ANTIGUOS_APAGADOS);

  const saldos = await cartera(apagado.url, tokenConductor);
  assert.equal(saldos.balance, 80, 'el saldo quedó INTACTO: no se debitó nada');
  const pendiente = saldos.transactions.find(item => item.id === retiro.id);
  assert.equal(pendiente.status, 'PENDING', 'y el retiro sigue pendiente, sin resolverse solo');
});

test('E2 · rechazar un pendiente SÍ se permite: es la salida segura', async () => {
  // Rechazar no mueve dinero. Bloquearlo también dejaría los retiros
  // pendientes atascados sin más salida que tocar la base a mano.
  const dataFile = await temporal();
  const encendido = await levantarServidor(dataFile, { [BANDERA_RETIROS_ANTIGUOS]: '1' });
  let tokenAdmin = await entrarComoAdmin(encendido.url);
  const tokenConductor = await crearConductor(encendido.url, tokenAdmin);
  await acreditarSaldo(encendido.url, tokenAdmin, tokenConductor, 80);
  const retiro = await (await pedirRetiro(encendido.url, tokenConductor, 30)).json();
  await detener(encendido.hijo);

  const apagado = await levantarServidor(dataFile);
  tokenAdmin = await entrarComoAdmin(apagado.url);

  const rechazo = await pedir(apagado.url, `/api/admin/transactions/${retiro.id}`,
    conToken(tokenAdmin, { method: 'PATCH', body: { status: 'REJECTED', reviewNote: 'flujo antiguo retirado' } }));

  assert.equal(rechazo.status, 200, 'rechazar sigue disponible');
  const saldos = await cartera(apagado.url, tokenConductor);
  assert.equal(saldos.balance, 80, 'y no toca el saldo');
  assert.equal(saldos.transactions.find(item => item.id === retiro.id).status, 'REJECTED');
});

// ---------------------------------------------------------------------------
// F — no romper lo que no es un retiro
// ---------------------------------------------------------------------------

test('F · las RECARGAS siguen funcionando exactamente igual', async () => {
  // Apagar el retiro no puede bloquear una recarga. `acreditarSaldo` ya pasa
  // por la aprobación administrativa de un TOP_UP, así que esta prueba es la
  // comprobación explícita de que ese camino está intacto.
  const { url } = await levantarServidor(await temporal());
  const tokenAdmin = await entrarComoAdmin(url);
  const tokenConductor = await crearConductor(url, tokenAdmin);

  const saldo = await acreditarSaldo(url, tokenAdmin, tokenConductor, 35);
  assert.equal(saldo, 35, 'la recarga se acreditó');

  // Y una segunda, para descartar que funcionara sólo la primera vez.
  const total = await acreditarSaldo(url, tokenAdmin, tokenConductor, 15);
  assert.equal(total, 50);

  const cuenta = await cartera(url, tokenConductor);
  assert.equal(cuenta.transactions.filter(item => item.type === 'TOP_UP').length, 2);
});

test('F2 · rechazar una recarga sigue funcionando', async () => {
  const { url } = await levantarServidor(await temporal());
  const tokenAdmin = await entrarComoAdmin(url);
  const tokenConductor = await crearConductor(url, tokenAdmin);

  const recarga = await (await pedir(url, '/api/wallet/topups', conToken(tokenConductor, {
    body: { amount: 20, reference: String(Date.now()).slice(-10) }
  }))).json();

  const rechazo = await pedir(url, `/api/admin/transactions/${recarga.id}`,
    conToken(tokenAdmin, { method: 'PATCH', body: { status: 'REJECTED' } }));
  assert.equal(rechazo.status, 200);
  assert.equal((await cartera(url, tokenConductor)).balance, 0);
});

// ---------------------------------------------------------------------------
// G — la compuerta no es autenticación
// ---------------------------------------------------------------------------

test('G · con la bandera ENCENDIDA, la autenticación sigue mandando', async () => {
  // Encender una bandera abre una puerta; no convierte a nadie en conductor
  // aprobado ni en administrador.
  const { url } = await levantarServidor(await temporal(), { [BANDERA_RETIROS_ANTIGUOS]: '1' });
  const tokenAdmin = await entrarComoAdmin(url);

  // Sin token.
  const anonimo = await pedir(url, '/api/wallet/payouts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 10 })
  });
  assert.equal(anonimo.status, 401, 'sin token sigue siendo 401');

  // Con token de administración, que no es conductor.
  const comoAdmin = await pedirRetiro(url, tokenAdmin, 10);
  assert.equal(comoAdmin.status, 403);
  assert.equal((await comoAdmin.json()).error, 'FORBIDDEN', 'y el motivo es el de siempre');

  // Y la ruta administrativa sigue exigiendo el rol.
  const tokenConductor = await crearConductor(url, tokenAdmin);
  const intento = await pedir(url, '/api/admin/transactions/transaction_inexistente',
    conToken(tokenConductor, { method: 'PATCH', body: { status: 'APPROVED' } }));
  assert.equal(intento.status, 403, 'un conductor no puede usar la ruta de administración');
});

test('G2 · con la bandera APAGADA, la autenticación se evalúa ANTES', async () => {
  // La compuerta va después de `requireAuth`: una petición sin token muere en
  // el 401 como siempre, y no revela que la funcionalidad existe pero está
  // apagada.
  const { url } = await levantarServidor(await temporal());
  const anonimo = await pedir(url, '/api/wallet/payouts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 10 })
  });
  assert.equal(anonimo.status, 401);
  assert.notEqual((await anonimo.json()).error, ERROR_RETIROS_ANTIGUOS_APAGADOS);
});

// ---------------------------------------------------------------------------
// H — repetición y concurrencia
// ---------------------------------------------------------------------------

test('H · repetir y paralelizar con el flujo apagado deja CERO efectos', async () => {
  const { url } = await levantarServidor(await temporal());
  const tokenAdmin = await entrarComoAdmin(url);
  const tokenConductor = await crearConductor(url, tokenAdmin);
  await acreditarSaldo(url, tokenAdmin, tokenConductor, 90);

  // Ocho peticiones a la vez, más otras cuatro en serie.
  const enParalelo = await Promise.all(
    Array.from({ length: 8 }, () => pedirRetiro(url, tokenConductor, 45))
  );
  for (const respuesta of enParalelo) {
    assert.equal(respuesta.status, 403);
    assert.equal((await respuesta.json()).error, ERROR_RETIROS_ANTIGUOS_APAGADOS);
  }
  for (let i = 0; i < 4; i += 1) {
    const respuesta = await pedirRetiro(url, tokenConductor, 45);
    assert.equal(respuesta.status, 403);
    await respuesta.json();
  }

  const saldos = await cartera(url, tokenConductor);
  assert.equal(saldos.balance, 90, 'el saldo no se movió ni un céntimo');
  assert.equal(saldos.transactions.filter(item => item.type === 'PAYOUT').length, 0,
    'y no se creó ni una transacción de retiro');
});
