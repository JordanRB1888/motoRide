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
