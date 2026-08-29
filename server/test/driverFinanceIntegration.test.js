import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import pg from 'pg';

/**
 * DRIVER-FINANCE-1 v4 — el camino REAL, de punta a punta.
 *
 * Las pruebas de `driverFinancePostgres.test.js` ejercitan las primitivas. La
 * tercera auditoría señaló —con razón— que eso no basta: hay que atravesar el
 * servidor de verdad, por el socket que usa el conductor y por el endpoint que
 * usa para reclamar un traslado, porque los defectos que encontró estaban en
 * el CABLEADO, no en el SQL.
 *
 * Aquí se levanta el backend contra la base de PRUEBAS, con la política
 * encendida, y se recorre lo que hace una persona: aceptar una carrera en
 * efectivo, completarla, intentar reclamar un traslado con la cuenta
 * bloqueada, recargar y volver a intentarlo.
 *
 * Nunca toca producción: solo se ejecuta si `TEST_DATABASE_URL` está definida,
 * y todo lo que crea lo borra al terminar.
 */

const connectionString = process.env.TEST_DATABASE_URL;
const saltar = { skip: !connectionString ? 'requiere TEST_DATABASE_URL (base NO productiva)' : false };
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marca = () => crypto.randomUUID().slice(0, 8);

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Espera a que el viaje llegue DURABLEMENTE al estado pedido antes de mandar
 * la siguiente acción del conductor.
 *
 * No es cosmética. La red de este equipo solo alcanza el pooler de Supabase en
 * modo TRANSACCIÓN (6543); producción usa el 5432, modo SESIÓN. En modo
 * transacción, una transacción larga de dinero solapada con la escritura del
 * documento se queda esperando indefinidamente en el pooler —la base queda
 * «idle in transaction» esperando al cliente—, y eso enmascararía el resultado
 * de esta prueba con un problema del intermediario. Confirmando cada paso se
 * elimina el solapamiento sin relajar ni una sola comprobación de dinero.
 */
async function esperarEstadoDurable(pool, tripId, estado, limiteMs = 20_000) {
  const hasta = Date.now() + limiteMs;
  while (Date.now() < hasta) {
    const { rows } = await pool.query(`select status from public.trips where id = $1`, [tripId]);
    if (rows[0]?.status === estado) return true;
    await esperar(300);
  }
  throw new Error(`el viaje nunca llegó a ${estado} de forma durable`);
}
const CLAVE_ADMIN = 'integracion-driver-finance-v4';

async function levantarServidor(t, pool) {
  // La cuenta de administración de la base de PRUEBAS puede arrastrar una
  // clave de otra sesión. Se le retira el hash para que el arranque la vuelva
  // a sembrar con la que esta prueba conoce. Es una cuenta de siembra en una
  // base no productiva: no hay dato de nadie detrás.
  await pool.query(`update public.users set payload = payload - 'passwordHash' where id = 'admin_1'`);
  const port = 20200 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: connectionString,
      DATABASE_SSL: 'no-verify',
      DRIVER_FINANCE_ENABLED: '1',
      ADMIN_PASSWORD: CLAVE_ADMIN,
      // Ni la pasada mensual ni el reconciliador deben entrometerse: aquí se
      // prueba el camino en vivo, no el planificador.
      DRIVER_FINANCE_INTERVAL_MS: String(60 * 60 * 1000),
      DRIVER_FINANCE_RECONCILE_INTERVAL_MS: String(60 * 60 * 1000),
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const errores = [];
  // Con DEBUG_INTEGRACION=1 el registro del servidor sale a la consola: es la
  // unica forma de ver por que fallo una liquidacion que ocurre dentro de el.
  const espejo = process.env.DEBUG_INTEGRACION === '1';
  child.stderr.on('data', c => { errores.push(c.toString()); if (espejo) process.stderr.write(c); });
  if (espejo) child.stdout.on('data', c => process.stderr.write(c));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`El servidor no inició. stderr: ${errores.join('').slice(-600)}`)), 45_000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}. ${errores.join('').slice(-600)}`)));
  });
  return { url: `http://127.0.0.1:${port}`, child };
}

test('§28/§29 · aceptar, completar y reclamar por el camino REAL, contra PostgreSQL', saltar, async (t) => {
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 4 });
  const { url, child } = await levantarServidor(t, pool);

  const sufijo = marca();
  const correoPasajera = `pg.pasajera.${sufijo}@prueba.test`;
  const correoConductor = `pg.conductor.${sufijo}@prueba.test`;
  const tripEfectivo = `trip_int_${sufijo}`;
  let passengerId = null;
  let driverId = null;
  let trasladoId = null;

  const sockets = [];
  // UNA sola despedida, y en el orden que importa: primero se sueltan los
  // sockets y el servidor —si no, sigue escribiendo mientras se borra—, luego
  // se limpia y solo al final se cierra el pozo de conexiones.
  t.after(async () => {
    for (const socket of sockets) { try { socket.close(); } catch {} }
    child.kill('SIGKILL');
    await esperar(300);
    const ids = [passengerId, driverId].filter(Boolean);
    const viajes = [tripEfectivo, trasladoId].filter(Boolean);
    if (viajes.length) {
      await pool.query(
        `delete from public.admin_actions
          where payload->>'transactionId' in (select id from public.transactions where trip_id = any($1::text[]))`,
        [viajes]);
      await pool.query(`delete from public.transactions where trip_id = any($1::text[])`, [viajes]);
      await pool.query(`delete from public.driver_commission_reservations where trip_id = any($1::text[])`, [viajes]);
      await pool.query(`delete from public.messages where trip_id = any($1::text[])`, [viajes]);
      await pool.query(`delete from public.trips where id = any($1::text[])`, [viajes]);
    }
    if (ids.length) {
      await pool.query(`delete from public.driver_inactivity_warnings where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_maintenance_obligations where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_commission_reservations where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_finance_state where driver_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.notifications where user_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.driver_applications where payload->>'userId' = any($1::text[])`, [ids]);
      // Las acciones de administración referencian a la transacción que
      // revisaron: se retiran ANTES que los apuntes, o la clave foránea lo
      // impide.
      await pool.query(`delete from public.admin_actions where payload->>'targetUserId' = any($1::text[])`, [ids]);
      await pool.query(`delete from public.admin_actions where payload->>'adminId' = any($1::text[])`, [ids]);
      await pool.query(`delete from public.transactions where user_id = any($1::text[])`, [ids]);
      await pool.query(`delete from public.users where id = any($1::text[])`, [ids]);
    }
    await pool.end();
  });

  const json = async (respuesta) => ({ status: respuesta.status, body: await respuesta.json().catch(() => null) });
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

  // ---- Cuentas ------------------------------------------------------------
  const acceso = await json(await post('/api/auth/login', { identifier: 'admin@58express.com', password: CLAVE_ADMIN, role: 'admin' }));
  assert.equal(acceso.status, 200, 'sesión de administración');
  const adminToken = acceso.body.token;

  const alta = await json(await post('/api/auth/register', {
    email: correoPasajera, phone: `+5841${Math.floor(1000000 + Math.random() * 8999999)}`,
    password: 'password123', role: 'passenger', firstName: 'Pasajera', lastName: 'Integracion'
  }));
  assert.equal(alta.status, 201);
  passengerId = alta.body.user.id;
  const passengerToken = alta.body.token;

  const altaConductor = await json(await post('/api/admin/drivers', {
    email: correoConductor, phone: `+5842${Math.floor(1000000 + Math.random() * 8999999)}`,
    firstName: 'Conductor', lastName: 'Integracion',
    vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: `IT${sufijo.slice(0, 4).toUpperCase()}`
  }, adminToken));
  assert.equal(altaConductor.status, 201);
  driverId = altaConductor.body.user.id;
  const sesionConductor = await json(await post('/api/auth/login', {
    identifier: correoConductor, password: altaConductor.body.temporaryPassword, role: 'driver'
  }));
  assert.equal(sesionConductor.status, 200);
  const driverToken = sesionConductor.body.token;

  // ---- El conductor entra y se pone disponible -----------------------------
  const conductor = io(url, { auth: { token: driverToken } });
  const pasajera = io(url, { auth: { token: passengerToken } });
  sockets.push(conductor, pasajera);
  const rechazos = [];
  conductor.on('tripStatusRejected', d => rechazos.push(d));
  conductor.on('socket:error', d => rechazos.push(d));
  conductor.on('authorization:error', d => rechazos.push(d));

  conductor.on('connect', () => conductor.emit('driver:connect', { status: 'AVAILABLE' }));
  conductor.on('driver:connected', () => conductor.emit('driver:location', { latitude: 10.6428, longitude: -71.6126, heading: 0 }));
  conductor.on('rideRequested', trip => {
    if (trip.id === tripEfectivo) conductor.emit('rideAccepted', { tripId: trip.id });
  });
  await Promise.all([
    new Promise(resolve => pasajera.on('connect', resolve)),
    new Promise(resolve => conductor.on('driver:connected', resolve))
  ]);
  await esperar(250);

  // ---- §28 · aceptación REAL por socket, con reserva de comisión -----------
  const asignada = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('no llegó la asignación')), 15_000);
    pasajera.on('tripStatusUpdated', update => {
      if (update.tripId === tripEfectivo && update.status === 'EN_ROUTE') { clearTimeout(timeout); resolve(update); }
    });
  });
  const creacion = await json(await post('/api/trips/create', {
    id: tripEfectivo,
    pickup: { lat: 10.6427, lng: -71.6125 },
    destination: { lat: 10.65, lng: -71.60 },
    fareUSD: 4,
    paymentMethod: 'efectivo'
  }, passengerToken));
  assert.equal(creacion.status, 200, 'la carrera se crea');
  await asignada;

  const reserva = await pool.query(
    `select driver_id, reserved_usd, status from public.driver_commission_reservations where trip_id = $1`,
    [tripEfectivo]);
  assert.equal(reserva.rowCount, 1, 'aceptar por socket dejó la reserva EN LA BASE');
  assert.equal(reserva.rows[0].driver_id, driverId);
  assert.equal(reserva.rows[0].status, 'RESERVED');
  // 15% de $4.00: la comisión que esta carrera le costará.
  assert.equal(Number(reserva.rows[0].reserved_usd), 0.6);

  const estadoInicial = await pool.query(
    `select wallet_balance_usd from public.driver_finance_state where driver_id = $1`, [driverId]);
  assert.equal(estadoInicial.rowCount, 1, 'y el conductor ya tiene su fila en el libro');

  // ---- §29 · completar la carrera de verdad --------------------------------
  const completada = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('no llegó el fin de carrera')), 15_000);
    pasajera.on('tripStatusUpdated', update => {
      if (update.tripId === tripEfectivo && update.status === 'COMPLETED') { clearTimeout(timeout); resolve(update); }
    });
  });
  conductor.emit('tripStatusUpdated', { tripId: tripEfectivo, status: 'ARRIVED' });
  await esperarEstadoDurable(pool, tripEfectivo, 'ARRIVED');
  conductor.emit('tripStatusUpdated', { tripId: tripEfectivo, status: 'IN_PROGRESS' });
  await esperarEstadoDurable(pool, tripEfectivo, 'IN_PROGRESS');
  conductor.emit('tripStatusUpdated', { tripId: tripEfectivo, status: 'COMPLETED' });
  await completada;
  await esperarEstadoDurable(pool, tripEfectivo, 'COMPLETED');
  await esperar(600);
  if (process.env.DEBUG_INTEGRACION === '1') {
    const { rows } = await pool.query(
      `select pid, state, wait_event_type, wait_event, left(regexp_replace(query, '\s+', ' ', 'g'), 110) as consulta,
              now() - query_start as duracion
         from pg_stat_activity
        where datname = current_database() and pid <> pg_backend_pid()
        order by query_start`);
    console.error('[DIAG-PG]', JSON.stringify(rows, null, 1));
  }

  assert.deepEqual(rechazos, [], 'ninguna transición del conductor fue rechazada');
  const liquidada = await pool.query(
    `select status, applied_usd, deferred_usd from public.driver_commission_reservations where trip_id = $1`,
    [tripEfectivo]);
  assert.equal(liquidada.rows[0].status, 'SETTLED', 'la reserva quedó liquidada');
  assert.equal(Number(liquidada.rows[0].applied_usd), 0.6, 'con la comisión cobrada');
  assert.equal(Number(liquidada.rows[0].deferred_usd), 0, 'y nada a deber: cabía entera');

  const saldoTrasCarrera = await pool.query(
    `select wallet_balance_usd from public.driver_finance_state where driver_id = $1`, [driverId]);
  assert.equal(Number(saldoTrasCarrera.rows[0].wallet_balance_usd), -0.6,
    'el saldo operativo bajó exactamente la comisión');

  const apuntes = await pool.query(
    `select count(*)::int as n from public.transactions
      where trip_id = $1 and transaction_type = 'PLATFORM_COMMISSION'`, [tripEfectivo]);
  assert.equal(apuntes.rows[0].n, 1, 'un solo apunte en el libro');

  // Repetir el fin de carrera NO puede volver a cobrar.
  conductor.emit('tripStatusUpdated', { tripId: tripEfectivo, status: 'COMPLETED' });
  await esperar(1200);
  const saldoRepetido = await pool.query(
    `select wallet_balance_usd from public.driver_finance_state where driver_id = $1`, [driverId]);
  assert.equal(Number(saldoRepetido.rows[0].wallet_balance_usd), -0.6, 'repetir no cobra dos veces');
  const apuntesRepetidos = await pool.query(
    `select count(*)::int as n from public.transactions
      where trip_id = $1 and transaction_type = 'PLATFORM_COMMISSION'`, [tripEfectivo]);
  assert.equal(apuntesRepetidos.rows[0].n, 1, 'ni duplica el apunte');

  // ---- §13 · la reclamación de un traslado cruza la puerta financiera ------
  const traslado = await json(await post('/api/trips/scheduled', {
    pickup: { address: 'Vereda del Lago' },
    destination: { address: 'Sambil Maracaibo' },
    scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    fareUSD: 5, rideType: 'MOTO'
  }, passengerToken));
  assert.equal(traslado.status, 201);
  trasladoId = traslado.body.id;

  // Se le bloquea DONDE MANDA: en la base. El documento en memoria del
  // servidor no sabe nada — es exactamente la situación que la auditoría
  // reprodujo con dos réplicas.
  await pool.query(
    `update public.driver_finance_state
        set block_active = true, block_reason = 'FINANCIAL_BALANCE_BLOCK', block_since = now()
      where driver_id = $1`, [driverId]);

  const negada = await json(await post(`/api/trips/scheduled/${trasladoId}/claim`, {}, driverToken));
  assert.equal(negada.status, 402, 'con la cuenta bloqueada NO se reclama trabajo futuro');
  assert.equal(negada.body.error, 'FINANCIAL_BALANCE_BLOCK');
  const sinAsignar = await pool.query(`select assigned_driver_id from public.trips where id = $1`, [trasladoId]);
  assert.equal(sinAsignar.rows[0].assigned_driver_id, null, 'y el traslado sigue libre');

  // ---- La recarga aprobada salda y desbloquea en el acto -------------------
  // La referencia bancaria es numerica y de longitud fija: un identificador
  // aleatorio puede quedarse sin digitos suficientes y el alta la rechaza.
  const referencia = String(Date.now()).slice(-10);
  const recarga = await json(await post('/api/wallet/topups', { amount: 3, reference: referencia }, driverToken));
  assert.equal(recarga.status, 201);
  const aprobacion = await json(await patch(`/api/admin/transactions/${recarga.body.id}`,
    { status: 'APPROVED', referenceConfirmed: true }, adminToken));
  assert.equal(aprobacion.status, 200);

  const trasRecarga = await pool.query(
    `select wallet_balance_usd, block_active from public.driver_finance_state where driver_id = $1`, [driverId]);
  assert.equal(Number(trasRecarga.rows[0].wallet_balance_usd), 2.4, '−0.60 + 3.00');
  assert.equal(trasRecarga.rows[0].block_active, false, 'el bloqueo se levanta en el mismo acto');

  const concedida = await json(await post(`/api/trips/scheduled/${trasladoId}/claim`, {}, driverToken));
  assert.equal(concedida.status, 200, 'al día, sí puede reclamarlo');
  assert.equal(concedida.body.driverId, driverId);

  const reservaTraslado = await pool.query(
    `select reserved_usd, status from public.driver_commission_reservations where trip_id = $1`, [trasladoId]);
  assert.equal(reservaTraslado.rowCount, 1, 'y su comisión proyectada queda RESERVADA por el viaje');
  assert.equal(reservaTraslado.rows[0].status, 'RESERVED');
  assert.equal(Number(reservaTraslado.rows[0].reserved_usd), 0.75, '15% de $5.00');

  // ---- La pantalla del conductor ve lo AUTORITATIVO ------------------------
  const cartera = await json(await fetch(`${url}/api/wallet/me`, { headers: { authorization: `Bearer ${driverToken}` } }));
  assert.equal(cartera.status, 200);
  assert.equal(cartera.body.balance, 2.4);
  assert.equal(cartera.body.driverFinance.enabled, true);
  assert.equal(cartera.body.driverFinance.authoritative, true, 'la respuesta se construye desde las tablas');
  assert.equal(cartera.body.driverFinance.blocked, false);
  assert.equal(cartera.body.driverFinance.committedCommissionUSD, 0.75,
    'y NO subestima lo comprometido: la reserva viva se ve');
});
