import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.TEST_DATABASE_URL;
const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
const adminEmail = `db2-admin-${suffix}@example.test`;
const passengerEmail = `db2-passenger-${suffix}@example.test`;
const driverEmail = `db2-driver-${suffix}@example.test`;
const adminPassword = `Db2Admin-${suffix}!`;
const passengerPassword = `Db2Passenger-${suffix}!`;
const phoneBase = String(Date.now()).slice(-8);

async function request(api, pathname, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${api}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, payload };
}

async function startBackend() {
  const port = 24100 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      PORT: String(port),
      JWT_SECRET: 'database-2-final-validation-secret-with-adequate-length',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`BACKEND_START_TIMEOUT:${stderr}`)), 15000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`BACKEND_EXIT_${code}:${stderr}`));
    });
  });
  return { api: `http://127.0.0.1:${port}/api`, child };
}

async function cleanup(pool) {
  const users = await pool.query(
    `select id from public.users where id <> 'admin_1' and (payload->>'email' = any($1::text[]) or payload->>'email'=$2)`,
    [[adminEmail, passengerEmail, driverEmail], `db2-concurrent-${suffix}@example.test`]
  );
  const ids = users.rows.map(row => row.id);
  if (!ids.length) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set constraints all deferred');
    await client.query(`delete from public.admin_actions where admin_id=any($1::text[]) or target_user_id=any($1::text[]) or transaction_id in (select id from public.transactions where user_id=any($1::text[])) or payload::text like $2`, [ids, `%${suffix}%`]);
    await client.query(`delete from public.driver_documents where user_id=any($1::text[]) or application_id in (select id from public.driver_applications where user_id=any($1::text[])) or payload::text like $2`, [ids, `%${suffix}%`]);
    await client.query(`delete from public.driver_applications where user_id=any($1::text[]) or payload::text like $2`, [ids, `%${suffix}%`]);
    await client.query(`delete from public.transactions where user_id=any($1::text[]) or payload::text like $2`, [ids, `%${suffix}%`]);
    await client.query(`delete from public.support_messages where sender_id=any($1::text[]) or conversation_user_id=any($1::text[]) or payload::text like $2`, [ids, `%${suffix}%`]);
    await client.query(`delete from public.messages where sender_id=any($1::text[]) or trip_id in (select id from public.trips where passenger_id=any($1::text[]) or driver_id=any($1::text[]) or assigned_driver_id=any($1::text[])) or payload::text like $2`, [ids, `%${suffix}%`]);
    await client.query(`delete from public.notifications where user_id=any($1::text[]) or payload::text like $2`, [ids, `%${suffix}%`]);
    await client.query(`delete from public.trips where passenger_id=any($1::text[]) or driver_id=any($1::text[]) or assigned_driver_id=any($1::text[]) or payload::text like $2`, [ids, `%${suffix}%`]);
    await client.query('delete from public.users where id = any($1::text[])', [ids]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

test('DATABASE-2 final PostgreSQL backend smokes and two-client concurrency', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 4 });
  let child;
  let originalAdminPayload;
  try {
    await cleanup(pool);
    const storedAdmin = await pool.query("select payload from public.users where id='admin_1'");
    assert.equal(storedAdmin.rowCount, 1, 'admin_1 must exist in the migrated test data');
    originalAdminPayload = storedAdmin.rows[0].payload;
    await pool.query(
      "update public.users set payload=$1::jsonb where id='admin_1'",
      [JSON.stringify({ ...originalAdminPayload, email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 12), accountStatus: 'ACTIVE' })]
    );
    const started = await startBackend();
    child = started.child;
    const api = started.api;

    const registration = await request(api, '/auth/register', {
      method: 'POST',
      body: {
        email: passengerEmail,
        phone: `+58412${phoneBase}`,
        password: passengerPassword,
        role: 'passenger',
        firstName: `Db2-${suffix}`,
        lastName: 'Passenger'
      }
    });
    assert.equal(registration.response.status, 201, JSON.stringify(registration.payload));
    assert.ok(registration.payload.token);
    assert.equal(registration.payload.user.passwordHash, undefined);

    const passengerLogin = await request(api, '/auth/login', {
      method: 'POST', body: { identifier: passengerEmail, password: passengerPassword, role: 'passenger' }
    });
    assert.equal(passengerLogin.response.status, 200, JSON.stringify(passengerLogin.payload));
    const passengerToken = passengerLogin.payload.token;
    assert.equal((await request(api, '/auth/me', { token: passengerToken })).response.status, 200);
    assert.equal((await request(api, '/auth/me', { token: 'invalid.jwt.value' })).response.status, 401);
    assert.equal((await request(api, '/admin/overview', { token: passengerToken })).response.status, 403);

    const adminLogin = await request(api, '/auth/login', {
      method: 'POST', body: { identifier: adminEmail, password: adminPassword, role: 'admin' }
    });
    assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.payload));
    const adminToken = adminLogin.payload.token;
    assert.equal((await request(api, '/admin/overview', { token: adminToken })).response.status, 200);

    const driverCreation = await request(api, '/admin/drivers', {
      token: adminToken,
      method: 'POST',
      body: {
        email: driverEmail,
        phone: `+58414${phoneBase}`,
        firstName: `Db2-${suffix}`,
        lastName: 'Driver',
        vehicleType: 'MOTO',
        vehicleBrand: 'Test',
        vehicleModel: 'DB2',
        vehiclePlate: `DB${phoneBase.slice(-5)}`
      }
    });
    assert.equal(driverCreation.response.status, 201, JSON.stringify(driverCreation.payload));
    const driverLogin = await request(api, '/auth/login', {
      method: 'POST', body: { identifier: driverEmail, password: driverCreation.payload.temporaryPassword, role: 'driver' }
    });
    assert.equal(driverLogin.response.status, 200, JSON.stringify(driverLogin.payload));
    const driverToken = driverLogin.payload.token;
    assert.equal((await request(api, '/drivers/status', { token: driverToken, method: 'PATCH', body: { status: 'AVAILABLE' } })).response.status, 200);

    const scheduled = await request(api, '/trips/scheduled', {
      token: passengerToken,
      method: 'POST',
      body: {
        pickup: { address: `DB2 pickup ${suffix}`, lat: 10.5, lng: -66.9 },
        destination: { address: `DB2 destination ${suffix}`, lat: 10.6, lng: -66.8 },
        scheduledAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        rideType: 'MOTO', paymentMethod: 'CASH', fareUSD: 3
      }
    });
    assert.equal(scheduled.response.status, 201, JSON.stringify(scheduled.payload));
    const claim = await request(api, `/trips/scheduled/${scheduled.payload.id}/claim`, { token: driverToken, method: 'POST', body: {} });
    assert.equal(claim.response.status, 200, JSON.stringify(claim.payload));
    assert.equal(claim.payload.driverId, driverCreation.payload.user.id);

    const topup = await request(api, '/wallet/topups', {
      token: passengerToken, method: 'POST', body: { amount: 12.34, reference: `9${phoneBase}` }
    });
    assert.equal(topup.response.status, 201, JSON.stringify(topup.payload));
    const approved = await request(api, `/admin/transactions/${topup.payload.id}`, {
      token: adminToken, method: 'PATCH', body: { status: 'APPROVED', referenceConfirmed: true, reviewNote: suffix }
    });
    assert.equal(approved.response.status, 200, JSON.stringify(approved.payload));
    assert.equal(approved.payload.balance, 12.34);
    const wallet = await request(api, '/wallet/me', { token: passengerToken });
    assert.equal(wallet.response.status, 200);
    assert.equal(wallet.payload.balance, 12.34);

    const chat = await request(api, '/support/messages', {
      token: passengerToken, method: 'POST', body: { text: `DATABASE-2 chat smoke ${suffix}` }
    });
    assert.equal(chat.response.status, 201, JSON.stringify(chat.payload));
    const supportMessages = await request(api, `/support/threads/${registration.payload.user.id}/messages`, { token: adminToken });
    assert.equal(supportMessages.response.status, 200, JSON.stringify(supportMessages.payload));
    assert.ok(JSON.stringify(supportMessages.payload).includes(suffix));

    const passengerId = registration.payload.user.id;
    const driverA = driverCreation.payload.user.id;
    const driverB = `db2_concurrent_driver_${suffix}`;
    const tripId = `db2_concurrent_trip_${suffix}`;
    await pool.query(
      `insert into public.users(id,payload) values ($1,$2::jsonb)`,
      [driverB, JSON.stringify({ id: driverB, email: `db2-concurrent-${suffix}@example.test`, role: 'driver', accountStatus: 'ACTIVE' })]
    );
    await pool.query(
      `insert into public.trips(id,payload) values ($1,$2::jsonb)`,
      [tripId, JSON.stringify({ id: tripId, passengerId, status: 'SEARCHING' })]
    );
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await Promise.all([first.query('begin'), second.query('begin')]);
      const update = `update public.trips set payload=jsonb_set(jsonb_set(payload,'{driverId}',to_jsonb($2::text),true),'{status}',to_jsonb('DRIVER_ASSIGNED'::text),true) where id=$1 and status='SEARCHING' and driver_id is null returning id`;
      const firstResult = await first.query(update, [tripId, driverA]);
      const competing = second.query(update, [tripId, driverB]);
      await delay(150);
      await first.query('commit');
      const secondResult = await competing;
      await second.query('commit');
      assert.equal(firstResult.rowCount + secondResult.rowCount, 1);
    } finally {
      await first.query('rollback').catch(() => {});
      await second.query('rollback').catch(() => {});
      first.release();
      second.release();
    }

    const persisted = await pool.query(
      `select
        exists(select 1 from public.users where id=$1) passenger,
        exists(select 1 from public.users where id=$2) driver,
        exists(select 1 from public.transactions where id=$3) wallet,
        exists(select 1 from public.support_messages where id=$4) chat`,
      [registration.payload.user.id, driverCreation.payload.user.id, topup.payload.id, chat.payload.id]
    );
    assert.deepEqual(persisted.rows[0], { passenger: true, driver: true, wallet: true, chat: true });
  } finally {
    if (child) {
      child.kill();
      await delay(300);
    }
    await cleanup(pool);
    if (originalAdminPayload) {
      await pool.query("update public.users set payload=$1::jsonb where id='admin_1'", [JSON.stringify(originalAdminPayload)]);
    }
    await pool.end();
  }
});
