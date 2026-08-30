import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * DRIVER-FINANCE-1 v9 — la deuda saldada se ve donde el dinero se mira.
 *
 * La octava auditoría comprobó que el apunte de una comisión pendiente saldada
 * se escribía correctamente y era exactamente-una-vez, pero que NO aparecía ni
 * en el historial del conductor ni en la auditoría de administración. El saldo
 * bajaba de verdad y no había nada que lo explicara.
 *
 * Aquí se recorre el camino REAL: se le deja al conductor una comisión
 * diferida, se le aprueba una recarga por la ruta de administración de verdad
 * —que es la que salda la deuda— y se mira lo que devuelven los tres
 * historiales legítimos.
 *
 * Nunca toca producción: solo se ejecuta con `TEST_DATABASE_URL`, y todo lo
 * que crea lo borra al terminar.
 */

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marca = () => crypto.randomUUID().slice(0, 8);
const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
const CLAVE_ADMIN = 'integracion-driver-finance-v9';

async function levantarServidor(pool) {
  await pool.query(`update public.users set payload = payload - 'passwordHash' where id = 'admin_1'`);
  const port = 20700 + Math.floor(Math.random() * 299);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: connectionString,
      DATABASE_SSL: 'no-verify',
      DRIVER_FINANCE_ENABLED: '1',
      ADMIN_PASSWORD: CLAVE_ADMIN,
      DRIVER_FINANCE_INTERVAL_MS: String(60 * 60 * 1000),
      DRIVER_FINANCE_RECONCILE_INTERVAL_MS: String(60 * 60 * 1000),
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const errores = [];
  child.stderr.on('data', c => errores.push(c.toString()));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`El servidor no inició. ${errores.join('').slice(-600)}`)), 45_000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}. ${errores.join('').slice(-600)}`)));
  });
  return { url: `http://127.0.0.1:${port}`, child };
}

test('§24/§26/§27 · la comisión pendiente saldada se ve donde debe, y solo ahí', saltar, async (t) => {
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 4 });
  const { url, child } = await levantarServidor(pool);

  const sufijo = marca();
  const correoPasajera = `hist.pasajera.${sufijo}@prueba.test`;
  const correoConductor = `hist.conductor.${sufijo}@prueba.test`;
  const viejaDeuda = `trip_hist_${sufijo}`;
  let passengerId = null;
  let driverId = null;

  t.after(async () => {
    child.kill('SIGKILL');
    await esperar(300);
    const ids = [passengerId, driverId].filter(Boolean);
    await pool.query(`delete from public.driver_commission_reservations where trip_id = $1`, [viejaDeuda]);
    if (ids.length) {
      await pool.query(`delete from public.driver_money_operations where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_inactivity_warnings where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_maintenance_obligations where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_commission_reservations where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_finance_state where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.notifications where user_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_applications where payload->>'userId' = any($1::text[])`, [ids]);
      await pool.query(`delete from public.admin_actions where payload->>'targetUserId' = any($1::text[])`, [ids]);
      await pool.query(`delete from public.admin_actions where payload->>'adminId' = any($1::text[])`, [ids]);
      await pool.query(`delete from public.transactions where user_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.users where id = any($1::text[])`, [ids]);
    }
    await pool.end();
  });

  const json = async r => ({ status: r.status, body: await r.json().catch(() => null) });
  const post = (ruta, cuerpo, token) => fetch(`${url}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo)
  });
  const patch = (ruta, cuerpo, token) => fetch(`${url}${ruta}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo)
  });
  const get = (ruta, token) => fetch(`${url}${ruta}`, { headers: { authorization: `Bearer ${token}` } });

  // ---- Cuentas ------------------------------------------------------------
  const acceso = await json(await post('/api/auth/login',
    { identifier: 'admin@58express.com', password: CLAVE_ADMIN, role: 'admin' }));
  assert.equal(acceso.status, 200, 'sesión de administración');
  const adminToken = acceso.body.token;

  const alta = await json(await post('/api/auth/register', {
    email: correoPasajera, phone: `+5843${Math.floor(1000000 + Math.random() * 8999999)}`,
    password: 'password123', role: 'passenger', firstName: 'Pasajera', lastName: 'Historial'
  }));
  assert.equal(alta.status, 201);
  passengerId = alta.body.user.id;
  const passengerToken = alta.body.token;

  const altaConductor = await json(await post('/api/admin/drivers', {
    email: correoConductor, phone: `+5844${Math.floor(1000000 + Math.random() * 8999999)}`,
    firstName: 'Conductor', lastName: 'Historial',
    vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: `HI${sufijo.slice(0, 4).toUpperCase()}`
  }, adminToken));
  assert.equal(altaConductor.status, 201);
  driverId = altaConductor.body.user.id;
  const sesionConductor = await json(await post('/api/auth/login', {
    identifier: correoConductor, password: altaConductor.body.temporaryPassword, role: 'driver'
  }));
  assert.equal(sesionConductor.status, 200);
  const driverToken = sesionConductor.body.token;

  // ---- Una comisión que en su día no cupo ---------------------------------
  // La reserva vive en la base y es de donde la cobranza la lee: es
  // exactamente la forma que deja una carrera cuya comisión no cabía bajo el
  // suelo de deuda.
  await pool.query(
    `insert into public.driver_commission_reservations
       (trip_id, driver_id, reserved_usd, applied_usd, deferred_usd, status, resolved_at)
     values ($1, $2, 1.00, 0, 1.00, 'SETTLED', now())`,
    [viejaDeuda, driverId]);

  // ---- La recarga REAL, aprobada por la ruta REAL -------------------------
  const recarga = await json(await post('/api/wallet/topups',
    { amount: 5, reference: `9${Date.now()}`.slice(0, 12) }, driverToken));
  assert.equal(recarga.status, 201, 'la recarga queda pendiente de verificación');

  const aprobacion = await json(await patch(
    `/api/admin/transactions/${recarga.body.id}`,
    // La ruta real exige que quien aprueba confirme haber visto la referencia:
    // es la puerta que impide acreditar una recarga sin comprobarla.
    { status: 'APPROVED', referenceConfirmed: true }, adminToken));
  assert.equal(aprobacion.status, 200, 'la administración la aprueba');

  // El saldo autoritativo: entraron 5.00 y se saldó 1.00 de deuda.
  const estado = await pool.query(
    `select wallet_balance_usd, deferred_commission_usd from public.driver_finance_state where driver_id = $1`,
    [driverId]);
  assert.equal(Number(estado.rows[0].wallet_balance_usd), 4, 'saldo 4.00: 5.00 menos la deuda saldada');
  assert.equal(Number(estado.rows[0].deferred_commission_usd), 0, 'y no queda deuda');

  const apunteDurable = await pool.query(
    `select count(*)::int as n from public.transactions
      where user_id = $1 and transaction_type = 'DRIVER_DEFERRED_COMMISSION_PAYMENT'`, [driverId]);
  assert.equal(apunteDurable.rows[0].n, 1, 'el apunte durable existe, y es uno solo');

  // ---- §24 · el CONDUCTOR lo ve en su historial ---------------------------
  const carteraConductor = await json(await get('/api/wallet/me', driverToken));
  assert.equal(carteraConductor.status, 200);
  const suyos = carteraConductor.body.transactions.filter(
    t => t.type === 'DRIVER_DEFERRED_COMMISSION_PAYMENT');
  assert.equal(suyos.length, 1, 'EL CONDUCTOR LO VE: antes su saldo bajaba sin explicación');
  assert.equal(Number(suyos[0].amount), -1, 'con el importe real y su signo');
  assert.equal(Number(suyos[0].balanceAfter), 4, 'y el saldo con el que quedó');
  assert.ok(suyos[0].createdAt, 'y cuándo ocurrió');
  // Nada de la contabilidad interna se le cuela al historial.
  const serializado = JSON.stringify(suyos[0]);
  assert.ok(!serializado.includes(viejaDeuda), 'sin identificadores de reserva');
  assert.ok(!/operation_id|sourceType|sourceId/i.test(serializado), 'ni identidades de operación');

  // ---- §26 · la ADMINISTRACIÓN lo audita ----------------------------------
  const finanzas = await json(await get('/api/admin/finance', adminToken));
  assert.equal(finanzas.status, 200);
  const movimientos = (finanzas.body.driverMovements || []).filter(
    m => m.user?.id === driverId && m.type === 'DRIVER_DEFERRED_COMMISSION_PAYMENT');
  assert.equal(movimientos.length, 1, 'LA ADMINISTRACIÓN LO AUDITA: antes no salía por ninguna parte');
  assert.equal(Number(movimientos[0].amount), -1);
  assert.equal(Number(movimientos[0].balanceAfter), 4);
  assert.ok(movimientos[0].createdAt);
  assert.ok(!JSON.stringify(movimientos[0]).includes(viejaDeuda),
    'y tampoco ahí se exponen las reservas internas');

  // ---- §27 · la PASAJERA no ve nada de esto -------------------------------
  const carteraPasajera = await json(await get('/api/wallet/me', passengerToken));
  assert.equal(carteraPasajera.status, 200);
  assert.equal(
    carteraPasajera.body.transactions.filter(t => t.type === 'DRIVER_DEFERRED_COMMISSION_PAYMENT').length,
    0, 'la pasajera no recibe movimientos del libro del conductor');
  assert.ok(!JSON.stringify(carteraPasajera.body).includes(driverId),
    'ni el identificador del conductor');

  // Y no puede asomarse a la auditoría de administración.
  const intento = await get('/api/admin/finance', passengerToken);
  assert.equal(intento.status, 403, 'la auditoría de finanzas sigue siendo solo de administración');
});

// ==========================================================================
// v10 · la auditoria completa, por paginas
// ==========================================================================
//
// La novena auditoria encontro que la ruta cortaba en cien y no ofrecia forma
// de seguir: los apuntes mas antiguos quedaban sencillamente fuera del alcance
// de quien audita. Y ordenar solo por fecha deja indefinido el orden entre
// apuntes del MISMO instante —y los hay: una conciliacion escribe varios en la
// misma transaccion—, asi que en el corte de una pagina unos podian saltarse y
// otros salir dos veces.

test('§23 · el historial completo se recorre por paginas, sin perder ni repetir', saltar, async (t) => {
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 4 });

  const sufijo = marca();
  const driverId = `drv_pag_${sufijo}`;
  const TOTAL = 137;
  // Un tercio comparten instante EXACTO: es el caso que rompe una paginacion
  // que solo ordena por fecha.
  const MISMO_INSTANTE = new Date('2026-08-30T03:00:00.000Z').toISOString();

  // UNA sola despedida, y en el orden que importa: primero se suelta el
  // servidor, luego se limpia y solo al final se cierra el pozo.
  let servidor = null;
  let pasajeraId = null;
  t.after(async () => {
    if (servidor) servidor.kill('SIGKILL');
    await esperar(300);
    const ids = [driverId, pasajeraId].filter(Boolean);
    await pool.query(`delete from public.transactions where user_id = any($1::text[])`, [ids]);
    await pool.query(`delete from public.driver_finance_state where driver_id = any($1::text[])`, [ids]);
    await pool.query(`delete from public.users where id = any($1::text[])`, [ids]);
    await pool.end();
  });

  // El conductor y sus apuntes se siembran ANTES de levantar el servidor, que
  // es como llegan de verdad: el proceso los carga al arrancar.
  await pool.query(
    `insert into public.users (id, payload) values ($1, $2::jsonb)`,
    [driverId, JSON.stringify({
      id: driverId, role: 'driver', email: `${driverId}@prueba.test`,
      phone: `+58 409${sufijo.slice(0, 7)}`, firstName: 'Conductor', lastName: 'Paginado',
      isVerified: true, status: 'AVAILABLE', accountStatus: 'ACTIVE', vehicleType: 'MOTO',
      walletBalance: 0, createdAt: new Date().toISOString()
    })]);

  const esperados = [];
  for (let i = 0; i < TOTAL; i++) {
    const id = `transaction_pag_${sufijo}_${String(i).padStart(3, '0')}`;
    const createdAt = i % 3 === 0
      ? MISMO_INSTANTE
      : new Date(Date.parse('2026-08-30T03:00:00.000Z') - (i * 60_000)).toISOString();
    esperados.push(id);
    await pool.query(
      `insert into public.transactions (id, payload) values ($1, $2::jsonb)`,
      [id, JSON.stringify({
        id, userId: driverId,
        type: i % 2 === 0 ? 'DRIVER_DEFERRED_COMMISSION_PAYMENT' : 'DRIVER_ACCOUNT_MAINTENANCE',
        amount: -1, currency: 'USD', status: 'APPROVED', balanceAfter: 10 - i * 0.01, createdAt
      })]);
  }

  const { url, child } = await levantarServidor(pool);
  servidor = child;

  const json = async r => ({ status: r.status, body: await r.json().catch(() => null) });
  const post = (ruta, cuerpo) => fetch(`${url}${ruta}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo)
  });
  const get = (ruta, token) => fetch(`${url}${ruta}`, { headers: { authorization: `Bearer ${token}` } });

  const acceso = await json(await post('/api/auth/login',
    { identifier: 'admin@58express.com', password: CLAVE_ADMIN, role: 'admin' }));
  assert.equal(acceso.status, 200);
  const adminToken = acceso.body.token;

  // ---- Se recorre entero, pagina a pagina --------------------------------
  const vistos = [];
  let cursor = null;
  let paginas = 0;
  do {
    const ruta = `/api/admin/finance/driver-movements?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const pagina = await json(await get(ruta, adminToken));
    assert.equal(pagina.status, 200, 'la auditoria responde');
    assert.ok(pagina.body.items.length <= 25, 'y respeta el tamaño de pagina');
    vistos.push(...pagina.body.items.filter(m => m.user?.id === driverId).map(m => m.id));
    cursor = pagina.body.nextCursor;
    paginas += 1;
    assert.ok(paginas < 60, 'la paginacion tiene que terminar');
  } while (cursor);

  assert.ok(paginas > 5, `hicieron falta varias paginas (${paginas}), no una sola`);
  assert.equal(new Set(vistos).size, vistos.length, 'NINGUNO se repitio');
  assert.deepEqual([...vistos].sort(), [...esperados].sort(),
    'y NINGUNO se quedo fuera: el historial completo es alcanzable');

  // ---- El orden es determinista y estable --------------------------------
  const primera = await json(await get('/api/admin/finance/driver-movements?limit=25', adminToken));
  const otraVez = await json(await get('/api/admin/finance/driver-movements?limit=25', adminToken));
  assert.deepEqual(primera.body.items.map(m => m.id), otraVez.body.items.map(m => m.id),
    'dos lecturas iguales devuelven lo mismo, en el mismo orden');
  for (let i = 1; i < primera.body.items.length; i++) {
    const antes = primera.body.items[i - 1];
    const ahora = primera.body.items[i];
    const cmp = Date.parse(ahora.createdAt) - Date.parse(antes.createdAt);
    assert.ok(cmp <= 0, 'de mas reciente a mas antiguo');
    if (cmp === 0) {
      assert.ok(antes.id.localeCompare(ahora.id) < 0,
        'y con el MISMO instante desempata el identificador, siempre igual');
    }
  }

  // ---- Un tope: el cliente no puede reintroducir el problema -------------
  const excesivo = await json(await get('/api/admin/finance/driver-movements?limit=999999', adminToken));
  assert.equal(excesivo.status, 400, 'pedir el libro entero de una vez no se permite');
  const cursorRoto = await json(await get('/api/admin/finance/driver-movements?cursor=no-es-un-cursor!!', adminToken));
  assert.equal(cursorRoto.status, 400, 'ni un cursor manipulado');

  // ---- Y sigue siendo solo de administracion -----------------------------
  const alta = await json(await post('/api/auth/register', {
    email: `pag.pasajera.${sufijo}@prueba.test`,
    phone: `+5845${Math.floor(1000000 + Math.random() * 8999999)}`,
    password: 'password123', role: 'passenger', firstName: 'Pasajera', lastName: 'Paginada'
  }));
  assert.equal(alta.status, 201);
  pasajeraId = alta.body.user.id;
  const intentoPasajera = await get('/api/admin/finance/driver-movements', alta.body.token);
  assert.equal(intentoPasajera.status, 403, 'la pasajera no audita el libro de nadie');
  const sinSesion = await fetch(`${url}/api/admin/finance/driver-movements`);
  assert.equal(sinSesion.status, 401, 'y sin sesion, ni eso');
});
