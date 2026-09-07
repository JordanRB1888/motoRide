import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BANDERAS_ENCENDIDAS,
  CUENTA_VALIDA,
  MIGRACIONES,
  abrirBaseDePruebas,
  crearUsuario,
  identidad,
  limpiar,
  esquemaPreparado,
  motivoParaSaltar
} from './helpers/walletTestDb.js';
import {
  abonar,
  asegurarCartera,
  enTransaccion,
  leerCartera,
  leerMovimientos,
  normalizarImporteUsd
} from '../services/walletStore.ts';
import { crearMetodo } from '../services/paymentMethodStore.ts';
import { solicitarRetiro } from '../services/withdrawalService.ts';

/**
 * WALLET-PAYOUTS-1 — cartera, libro mayor y migración, contra PostgreSQL real.
 *
 * El guard de identidad de FX-BCV-1A corre ANTES de cualquier conexión. Sin
 * `FX_TEST_DB_PROJECT_REF` la suite se salta entera.
 */

const pool = await abrirBaseDePruebas();
const preparado = pool ? await esquemaPreparado(pool) : false;
const saltar = { skip: motivoParaSaltar(pool, preparado) };

test.after(async () => {
  await limpiar(pool);
  if (pool) await pool.end();
});

// ---------------------------------------------------------------------------
// El guard
// ---------------------------------------------------------------------------

test('no se abrió ninguna conexión antes de confirmar la identidad', () => {
  if (pool !== null) {
    assert.equal(identidad?.puedeEscribir, true, 'hay conexión sin identidad confirmada');
  }
  assert.ok(identidad === null || typeof identidad.veredicto === 'string');
});

// ---------------------------------------------------------------------------
// Migración: precisión, invariantes e idempotencia
// ---------------------------------------------------------------------------

test('el dinero se guarda en NUMERIC, nunca en coma flotante', saltar, async () => {
  // Es la razón de ser de toda la fase: el saldo de hoy es un `number` de
  // JavaScript redondeado con Math.round(x*100)/100.
  const { rows } = await pool.query(
    `select table_name, column_name, data_type, numeric_precision, numeric_scale
       from information_schema.columns
      where table_schema = 'public'
        and table_name in ('wallets', 'wallet_ledger_entries', 'withdrawal_requests')
        and (column_name like '%_usd' or column_name like '%_ves' or column_name = 'fx_rate')`
  );
  assert.ok(rows.length >= 8, 'hay columnas de dinero que comprobar');

  for (const columna of rows) {
    assert.equal(columna.data_type, 'numeric',
      `${columna.table_name}.${columna.column_name} debe ser numeric`);
    // Nada de real / double precision, que es lo que este proyecto quiere evitar.
    assert.notEqual(columna.data_type, 'double precision');
    const escalaEsperada = columna.column_name === 'fx_rate' ? 8 : 2;
    assert.equal(columna.numeric_scale, escalaEsperada,
      `${columna.table_name}.${columna.column_name} escala`);
  }
});

test('las invariantes del dinero viven en el motor, no en un if', saltar, async () => {
  const { rows } = await pool.query(
    `select con.conname as nombre, pg_get_constraintdef(con.oid) as definicion
       from pg_constraint con
       join pg_class cls on cls.oid = con.conrelid
       join pg_namespace nsp on nsp.oid = cls.relnamespace
      where nsp.nspname = 'public'
        and cls.relname in ('wallets', 'wallet_ledger_entries', 'payment_methods',
                            'withdrawal_requests', 'withdrawal_audit_events')`
  );
  const porNombre = Object.fromEntries(rows.map(r => [r.nombre, r.definicion]));

  assert.match(porNombre.wallets_available_no_negativo, /available_usd >= \(?0/);
  assert.match(porNombre.wallets_reserved_no_negativo, /reserved_usd >= \(?0/);
  // Lo retirable es un SUBCONJUNTO de lo disponible. Si se rompiera, el sistema
  // creería poder transferir dinero que no tiene.
  assert.match(porNombre.wallets_retirable_cabe_en_disponible, /withdrawable_available_usd <= available_usd/);
  assert.match(porNombre.wallet_ledger_amount_positivo, /amount_usd > \(?0/);
  assert.match(porNombre.withdrawals_amount_positivo, /amount_usd > \(?0/);
  assert.ok(porNombre.withdrawals_pagado_con_referencia, 'pagado exige referencia');
  assert.ok(porNombre.withdrawals_fx_completo_o_ausente, 'la instantánea del cambio va entera o no va');
  assert.ok(porNombre.payment_methods_cuenta_coincide_con_banco, 'la cuenta debe empezar por su banco');
});

test('toda la migración está escrita para poder reaplicarse', () => {
  // Se comprueba el TEXTO y no se reaplica el DDL desde aquí, a propósito.
  //
  // Aplicar `create table` / `create trigger` mientras las demás suites operan
  // sobre esas mismas tablas obliga a esperar un ACCESS EXCLUSIVE, y la prueba
  // se quedaba bloqueada por algo que no tiene nada que ver con lo que quiere
  // demostrar. La reaplicación real se ejerce con el script explícito
  // —`npm --prefix server run db:migrate:wallet-test`—, que es precisamente lo
  // que se ejecuta antes de esta suite.
  //
  // Lo que sí puede afirmarse aquí, y es lo que importa para un despliegue
  // repetido, es que NINGUNA sentencia de creación es de un solo uso.
  const sql = MIGRACIONES.map(ruta => fs.readFileSync(ruta, 'utf8')).join('\n');
  const sentencias = sql
    .replace(/--[^\n]*/g, ' ')
    .split(';')
    .map(trozo => trozo.trim().toLowerCase())
    .filter(trozo => trozo.startsWith('create ') || trozo.startsWith('drop '));

  assert.ok(sentencias.length >= 10, 'hay sentencias de esquema que comprobar');

  // PostgreSQL NO admite `create trigger if not exists`, así que el patrón
  // idempotente para un disparador es precederlo de `drop trigger if exists`
  // con el mismo nombre. Se comprueba eso, que es la regla de verdad.
  const disparadoresBorradosAntes = new Set(
    [...sql.matchAll(/drop\s+trigger\s+if\s+exists\s+(\w+)/gi)].map(m => m[1].toLowerCase())
  );

  for (const sentencia of sentencias) {
    const primeraLinea = sentencia.split('\n')[0].slice(0, 90);

    const disparador = /^create\s+trigger\s+(\w+)/.exec(sentencia);
    if (disparador) {
      assert.ok(
        disparadoresBorradosAntes.has(disparador[1].toLowerCase()),
        `el disparador ${disparador[1]} se crea sin un «drop trigger if exists» previo`
      );
      continue;
    }

    const esIdempotente =
      sentencia.includes('if not exists') ||
      sentencia.includes('if exists') ||
      sentencia.startsWith('create or replace');
    assert.ok(esIdempotente, `no se puede reaplicar: ${primeraLinea}`);
  }
});

test('el esquema resultante es exactamente el esperado', saltar, async () => {
  const { rows } = await pool.query(
    `select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('wallets', 'wallet_ledger_entries', 'payment_methods',
                           'withdrawal_requests', 'withdrawal_audit_events')
      order by table_name`
  );
  assert.deepEqual(rows.map(r => r.table_name), [
    'payment_methods', 'wallet_ledger_entries', 'wallets',
    'withdrawal_audit_events', 'withdrawal_requests'
  ]);
});

test('el motor rechaza los saldos imposibles', saltar, async () => {
  const usuario = await crearUsuario(pool);
  await asegurarCartera(pool, usuario);

  // Saldo negativo.
  await assert.rejects(
    () => pool.query('update public.wallets set available_usd = -1 where user_id = $1', [usuario]),
    /violates check constraint/
  );
  // Retirable mayor que disponible.
  await assert.rejects(
    () => pool.query(
      'update public.wallets set withdrawable_available_usd = 10 where user_id = $1',
      [usuario]
    ),
    /violates check constraint/
  );
  // Reservado negativo.
  await assert.rejects(
    () => pool.query('update public.wallets set reserved_usd = -5 where user_id = $1', [usuario]),
    /violates check constraint/
  );
});

test('el libro mayor rechaza importes cero o negativos', saltar, async () => {
  const usuario = await crearUsuario(pool);
  await asegurarCartera(pool, usuario);
  for (const importe of ['0', '-10.00']) {
    await assert.rejects(
      () => pool.query(
        `insert into public.wallet_ledger_entries
           (id, wallet_id, user_id, amount_usd, direction, entry_type, fund_class,
            idempotency_key, available_after_usd, reserved_after_usd)
         values ($1, $2, $3, $4::numeric, 'CREDIT', 'WALLET_CREDIT', 'EARNED', $5, 0, 0)`,
        [`led_${importe}_${usuario}`, `wallet-${usuario}`, usuario, importe, `k_${importe}_${usuario}`]
      ),
      /violates check constraint/,
      `debería rechazar ${importe}`
    );
  }
});

test('la metadata del libro no admite datos bancarios ni secretos', saltar, async () => {
  const usuario = await crearUsuario(pool);
  await asegurarCartera(pool, usuario);
  for (const clave of ['password', 'pin', 'accountNumber', 'phone', 'documentNumber']) {
    await assert.rejects(
      () => pool.query(
        `insert into public.wallet_ledger_entries
           (id, wallet_id, user_id, amount_usd, direction, entry_type, fund_class,
            idempotency_key, available_after_usd, reserved_after_usd, metadata)
         values ($1, $2, $3, 1, 'CREDIT', 'WALLET_CREDIT', 'EARNED', $4, 0, 0, $5::jsonb)`,
        [`led_${clave}_${usuario}`, `wallet-${usuario}`, usuario, `k_${clave}_${usuario}`,
         JSON.stringify({ [clave]: 'x' })]
      ),
      /violates check constraint/,
      `debería rechazar metadata con ${clave}`
    );
  }
});

// ---------------------------------------------------------------------------
// Cartera y libro mayor
// ---------------------------------------------------------------------------

test('crear la cartera es idempotente', saltar, async () => {
  const usuario = await crearUsuario(pool);
  const primera = await asegurarCartera(pool, usuario);
  const segunda = await asegurarCartera(pool, usuario);
  assert.equal(primera.available, '0.00');
  assert.deepEqual(primera, segunda);

  const { rows } = await pool.query(
    'select count(*)::int as n from public.wallets where user_id = $1', [usuario]
  );
  assert.equal(rows[0].n, 1, 'una sola cartera por persona');
});

test('los saldos vienen como CADENA, no como número', saltar, async () => {
  // `pg` devuelve numeric como texto y aquí no se convierte. En cuanto pasara
  // por Number dejaría de ser exacto, que es el problema que veníamos a
  // resolver.
  const usuario = await crearUsuario(pool);
  const saldos = await asegurarCartera(pool, usuario);
  assert.equal(typeof saldos.available, 'string');
  assert.equal(typeof saldos.reserved, 'string');
  assert.equal(typeof saldos.withdrawableAvailable, 'string');
});

test('un abono de dinero ganado es retirable', saltar, async () => {
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: '100.00', claseDeFondos: 'EARNED',
    claveDeIdempotencia: `abono-${usuario}-1`
  }));

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.available, '100.00');
  assert.equal(saldos.withdrawableAvailable, '100.00');
  assert.equal(saldos.reserved, '0.00');
});

test('una promoción suma saldo pero NO saldo retirable', saltar, async () => {
  // La distinción que el saldo único de hoy no puede expresar.
  const usuario = await crearUsuario(pool);
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: '50.00', claseDeFondos: 'PROMO',
    claveDeIdempotencia: `promo-${usuario}-1`
  }));

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.available, '50.00', 'se puede usar en la aplicación');
  assert.equal(saldos.withdrawableAvailable, '0.00', 'pero no puede salir de ella');
});

test('el mismo abono dos veces acredita una sola vez', saltar, async () => {
  const usuario = await crearUsuario(pool);
  await asegurarCartera(pool, usuario);
  const entrada = {
    userId: usuario, monto: '25.00', claseDeFondos: 'DEPOSITED',
    claveDeIdempotencia: `dep-${usuario}-unico`
  };

  const primera = await enTransaccion(pool, cliente => abonar(cliente, entrada));
  const segunda = await enTransaccion(pool, cliente => abonar(cliente, entrada));

  assert.equal(primera.resultado, 'ACREDITADO');
  assert.equal(segunda.resultado, 'YA_APLICADO');
  assert.equal((await leerCartera(pool, usuario)).available, '25.00');
});

test('el libro deja el saldo resultante de cada movimiento', saltar, async () => {
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  for (const [monto, clave] of [['10.00', 'a'], ['15.50', 'b']]) {
    await enTransaccion(pool, cliente => abonar(cliente, {
      userId: usuario, monto, claseDeFondos: 'EARNED',
      claveDeIdempotencia: `mov-${usuario}-${clave}`
    }));
  }

  const movimientos = await leerMovimientos(pool, usuario);
  assert.equal(movimientos.length, 2);
  // Del más nuevo al más viejo.
  assert.equal(movimientos[0].amount, '15.50');
  assert.equal(movimientos[0].availableAfter, '25.50');
  assert.equal(movimientos[0].direction, 'CREDIT');
  assert.equal(movimientos[1].availableAfter, '10.00');
});

test('el libro es APPEND-ONLY, impuesto por el motor', saltar, async () => {
  const usuario = await crearUsuario(pool);
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: '10.00', claseDeFondos: 'DEPOSITED',
    claveDeIdempotencia: `ap-${usuario}`
  }));

  await assert.rejects(
    () => pool.query('update public.wallet_ledger_entries set amount_usd = 999 where user_id = $1', [usuario]),
    /append-only/
  );
  await assert.rejects(
    () => pool.query('delete from public.wallet_ledger_entries where user_id = $1', [usuario]),
    /append-only/
  );
});

// ---------------------------------------------------------------------------
// Precisión de los importes
// ---------------------------------------------------------------------------

test('se rechaza el exceso de precisión en vez de redondearlo en silencio', () => {
  // Quien pide retirar 10.999 debe recibir un error, no diez con noventa y nueve.
  assert.equal(normalizarImporteUsd('10.999'), null);
  assert.equal(normalizarImporteUsd('0.001'), null);
  assert.equal(normalizarImporteUsd('10.99'), '10.99');
  // Lo que sí se normaliza es la ESCALA: los importes se llevan a céntimos, así
  // que «10» y «10.5» se guardan como «10.00» y «10.50». Eso no pierde nada.
  assert.equal(normalizarImporteUsd('10'), '10.00');
  assert.equal(normalizarImporteUsd('10.5'), '10.50');
});

test('no se admite nada que no sea un decimal', () => {
  for (const basura of ['NaN', 'Infinity', '', 'diez', '1e5', '10,50', '--1']) {
    assert.equal(normalizarImporteUsd(basura), null, basura);
  }
});

// ---------------------------------------------------------------------------
// La invariante contable global
// ---------------------------------------------------------------------------

test('el reservado de la cartera coincide con los retiros vivos', saltar, async () => {
  // Es LA invariante del sistema: si alguna vez no cuadra, hay dinero perdido o
  // duplicado en alguna parte.
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: '100.00', claseDeFondos: 'EARNED',
    claveDeIdempotencia: `inv-${usuario}`
  }));
  const metodo = await crearMetodo(pool, usuario, 'BANK_TRANSFER', CUENTA_VALIDA);

  for (const [monto, clave] of [['30.00', 'a'], ['20.00', 'b']]) {
    const resultado = await solicitarRetiro(pool, {
      userId: usuario, rol: 'driver', metodoId: metodo.metodo.id, monto,
      claveDeIdempotencia: `inv-wd-${usuario}-${clave}`, banderas: BANDERAS_ENCENDIDAS
    });
    assert.equal(resultado.ok, true, resultado.ok ? '' : resultado.detalle);
  }

  const { rows } = await pool.query(
    `select w.reserved_usd,
            coalesce((select sum(amount_usd) from public.withdrawal_requests r
                       where r.user_id = w.user_id
                         and r.status in ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING')), 0) as vivos
       from public.wallets w where w.user_id = $1`,
    [usuario]
  );
  assert.equal(rows[0].reserved_usd, '50.00');
  assert.equal(Number(rows[0].vivos), 50, 'el reservado es exactamente la suma de los retiros vivos');

  // Y el dinero NO desapareció: disponible + reservado sigue siendo el total.
  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.available, '50.00');
  assert.equal(saldos.reserved, '50.00');
  assert.equal(Number(saldos.available) + Number(saldos.reserved), 100);
});
