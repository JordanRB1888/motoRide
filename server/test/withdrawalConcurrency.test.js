import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BANDERAS_ENCENDIDAS,
  CUENTA_VALIDA,
  abrirBaseDePruebas,
  crearUsuario,
  limpiar,
  esquemaPreparado,
  motivoParaSaltar
} from './helpers/walletTestDb.js';
import { abonar, asegurarCartera, enTransaccion, leerCartera } from '../services/walletStore.ts';
import { crearMetodo } from '../services/paymentMethodStore.ts';
import { cambiarEstado, listarRetirosDeUsuario, solicitarRetiro } from '../services/withdrawalService.ts';

/**
 * WALLET-PAYOUTS-1 — concurrencia.
 *
 * Es donde estos sistemas fallan de verdad, y donde el flujo actual del
 * producto falla: aprobar un retiro allí es un leer-comprobar-escribir sin
 * cerrojo, así que dos aprobaciones a la vez pueden pasar las dos.
 *
 * Todo esto corre contra PostgreSQL de verdad. Con dobles no se podría
 * comprobar nada: la garantía la da el motor, no el código de JavaScript.
 */

const pool = await abrirBaseDePruebas();
const preparado = pool ? await esquemaPreparado(pool) : false;
const saltar = { skip: motivoParaSaltar(pool, preparado) };

test.after(async () => {
  await limpiar(pool);
  if (pool) await pool.end();
});

async function prepararConductor(saldo) {
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: saldo, claseDeFondos: 'EARNED',
    claveDeIdempotencia: `conc-saldo-${usuario}`
  }));
  const metodo = await crearMetodo(pool, usuario, 'BANK_TRANSFER', CUENTA_VALIDA);
  return { usuario, metodoId: metodo.metodo.id };
}

const pedir = (usuario, metodoId, monto, clave) => solicitarRetiro(pool, {
  userId: usuario, rol: 'driver', metodoId, monto,
  claveDeIdempotencia: clave, banderas: BANDERAS_ENCENDIDAS
});

// ---------------------------------------------------------------------------
// Doble gasto
// ---------------------------------------------------------------------------

test('dos retiros simultáneos por el saldo total: sólo uno reserva', saltar, async () => {
  // El doble gasto clásico. La comprobación de saldo vive en el `where` del
  // `update`, así que comprobar y descontar son la misma operación y no hay
  // ventana entre ellas.
  const { usuario, metodoId } = await prepararConductor('100.00');

  const resultados = await Promise.all([
    pedir(usuario, metodoId, '100.00', `dg1-${usuario}`),
    pedir(usuario, metodoId, '100.00', `dg2-${usuario}`)
  ]);

  const aceptados = resultados.filter(r => r.ok);
  const rechazados = resultados.filter(r => !r.ok);
  assert.equal(aceptados.length, 1, 'exactamente uno gana');
  assert.equal(rechazados.length, 1);
  assert.equal(rechazados[0].motivo, 'FONDOS_INSUFICIENTES');

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.reserved, '100.00');
  assert.equal(saldos.available, '0.00');
});

test('cinco retiros simultáneos que juntos exceden el saldo', saltar, async () => {
  // Saldo para tres de cinco. Ni uno más, ni uno menos.
  const { usuario, metodoId } = await prepararConductor('30.00');

  const resultados = await Promise.all(
    Array.from({ length: 5 }, (_, i) => pedir(usuario, metodoId, '10.00', `m${i}-${usuario}`))
  );

  const aceptados = resultados.filter(r => r.ok);
  assert.equal(aceptados.length, 3, 'sólo caben tres');
  assert.equal(resultados.filter(r => !r.ok && r.motivo === 'FONDOS_INSUFICIENTES').length, 2);

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.reserved, '30.00');
  assert.equal(saldos.available, '0.00');
  // El dinero no se creó ni se perdió.
  assert.equal(Number(saldos.available) + Number(saldos.reserved), 30);
});

// ---------------------------------------------------------------------------
// Idempotencia bajo concurrencia
// ---------------------------------------------------------------------------

test('la misma clave en paralelo produce UN retiro lógico', saltar, async () => {
  // El reintento de un cliente con la red inestable: cuatro peticiones a la vez
  // con la misma clave.
  const { usuario, metodoId } = await prepararConductor('100.00');
  const clave = `par-idem-${usuario}`;

  const resultados = await Promise.all(
    Array.from({ length: 4 }, () => pedir(usuario, metodoId, '25.00', clave))
  );

  const exitosos = resultados.filter(r => r.ok);
  assert.equal(exitosos.length, 4, 'todas las peticiones responden bien');
  const identificadores = new Set(exitosos.map(r => r.retiro.id));
  assert.equal(identificadores.size, 1, 'y todas hablan del MISMO retiro');

  const retiros = await listarRetirosDeUsuario(pool, usuario);
  assert.equal(retiros.length, 1);
  assert.equal((await leerCartera(pool, usuario)).reserved, '25.00', 'una sola reserva');
});

// ---------------------------------------------------------------------------
// Carreras entre estados
// ---------------------------------------------------------------------------

test('aprobar y rechazar a la vez: gana exactamente uno', saltar, async () => {
  // Dos personas de administración pulsando a la vez. La fila se toma con
  // `for update`, así que la segunda encuentra el estado ya cambiado y su
  // transición se evalúa contra el estado real.
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '40.00', `race1-${usuario}`);
  const id = retiro.retiro.id;

  await Promise.all([
    cambiarEstado(pool, { retiroId: id, nuevoEstado: 'APPROVED', actorId: 'admin_a', actorRol: 'admin' }),
    cambiarEstado(pool, { retiroId: id, nuevoEstado: 'REJECTED', actorId: 'admin_b', actorRol: 'admin' })
  ]);

  const { rows } = await pool.query('select status from public.withdrawal_requests where id = $1', [id]);
  const estadoFinal = rows[0].status;

  // Los DOS desenlaces son legítimos, y conviene decir por qué:
  //
  //  · si el rechazo llega primero, aprobar después es imposible —REJECTED es
  //    terminal— y el estado final es REJECTED;
  //  · si la aprobación llega primero, rechazar después SÍ está permitido
  //    (APPROVED → REJECTED), y el estado final también es REJECTED.
  //
  // Lo que importa no es cuál de las dos operaciones ganó, sino que el dinero
  // acabe donde debe. Una prueba que exigiera un ganador concreto estaría
  // fijando un detalle de la carrera, no una garantía.
  assert.ok(['APPROVED', 'REJECTED'].includes(estadoFinal), `estado final: ${estadoFinal}`);

  const saldos = await leerCartera(pool, usuario);
  if (estadoFinal === 'REJECTED') {
    // Liberado UNA vez, pase por donde pase.
    assert.equal(saldos.available, '100.00');
    assert.equal(saldos.reserved, '0.00');
    const liberaciones = await pool.query(
      `select count(*)::int as n from public.wallet_ledger_entries
        where reference_id = $1 and entry_type = 'WITHDRAWAL_RELEASE'`,
      [id]
    );
    assert.equal(liberaciones.rows[0].n, 1, 'una sola liberación');
  } else {
    // Aprobado: el dinero sigue reservado, porque aprobar no paga.
    assert.equal(saldos.reserved, '40.00');
    assert.equal(saldos.available, '60.00');
  }
});

test('pagar y rechazar a la vez: NUNCA los dos efectos', saltar, async () => {
  // El peor caso: uno consume el dinero y el otro lo devuelve. Si ambos se
  // aplicaran, la persona se quedaría el dinero Y cobraría la transferencia.
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '50.00', `race2-${usuario}`);
  const id = retiro.retiro.id;
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'APPROVED', actorId: 'a', actorRol: 'admin' });
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'PROCESSING', actorId: 'a', actorRol: 'admin' });

  await Promise.all([
    cambiarEstado(pool, {
      retiroId: id, nuevoEstado: 'PAID', actorId: 'admin_a', actorRol: 'admin',
      referenciaDePago: 'REF-CARRERA'
    }),
    cambiarEstado(pool, { retiroId: id, nuevoEstado: 'REJECTED', actorId: 'admin_b', actorRol: 'admin' })
  ]);

  const { rows } = await pool.query('select status from public.withdrawal_requests where id = $1', [id]);
  const estadoFinal = rows[0].status;
  const saldos = await leerCartera(pool, usuario);

  if (estadoFinal === 'PAID') {
    assert.equal(saldos.reserved, '0.00', 'consumido');
    assert.equal(saldos.available, '50.00', 'y NO devuelto');
  } else {
    assert.equal(estadoFinal, 'REJECTED');
    assert.equal(saldos.reserved, '0.00');
    assert.equal(saldos.available, '100.00', 'devuelto, y no consumido además');
  }

  // Lo que NO puede pasar en ningún caso: que el total supere lo que había.
  assert.ok(Number(saldos.available) + Number(saldos.reserved) <= 100,
    'no puede haber más dinero del que había');
});

test('cuatro rechazos simultáneos devuelven el dinero UNA vez', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '60.00', `race3-${usuario}`);

  await Promise.all(
    Array.from({ length: 4 }, (_, i) => cambiarEstado(pool, {
      retiroId: retiro.retiro.id, nuevoEstado: 'REJECTED',
      actorId: `admin_${i}`, actorRol: 'admin'
    }))
  );

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.available, '100.00', 'exactamente una devolución');
  assert.equal(saldos.reserved, '0.00');

  // Y un solo movimiento de liberación en el libro.
  const { rows } = await pool.query(
    `select count(*)::int as n from public.wallet_ledger_entries
      where reference_id = $1 and entry_type = 'WITHDRAWAL_RELEASE'`,
    [retiro.retiro.id]
  );
  assert.equal(rows[0].n, 1);
});

test('cuatro pagos simultáneos consumen el dinero UNA vez', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '70.00', `race4-${usuario}`);
  const id = retiro.retiro.id;
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'APPROVED', actorId: 'a', actorRol: 'admin' });
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'PROCESSING', actorId: 'a', actorRol: 'admin' });

  await Promise.all(
    Array.from({ length: 4 }, (_, i) => cambiarEstado(pool, {
      retiroId: id, nuevoEstado: 'PAID', actorId: `admin_${i}`, actorRol: 'admin',
      referenciaDePago: 'REF-UNICA'
    }))
  );

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.reserved, '0.00');
  assert.equal(saldos.available, '30.00', 'se consumió una sola vez');

  const { rows } = await pool.query(
    `select count(*)::int as n from public.wallet_ledger_entries
      where reference_id = $1 and entry_type = 'WITHDRAWAL_SETTLE'`,
    [id]
  );
  assert.equal(rows[0].n, 1);
});

// ---------------------------------------------------------------------------
// La invariante contable, bajo presión
// ---------------------------------------------------------------------------

test('tras una tanda concurrente, el reservado sigue cuadrando', saltar, async () => {
  // La comprobación que resume todo: si alguna vez no cuadra, hay dinero
  // perdido o duplicado.
  const { usuario, metodoId } = await prepararConductor('100.00');

  await Promise.all(
    Array.from({ length: 6 }, (_, i) => pedir(usuario, metodoId, '20.00', `inv${i}-${usuario}`))
  );

  const { rows } = await pool.query(
    `select w.available_usd, w.reserved_usd, w.withdrawable_available_usd,
            coalesce((select sum(amount_usd) from public.withdrawal_requests r
                       where r.user_id = w.user_id
                         and r.status in ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING')), 0) as vivos
       from public.wallets w where w.user_id = $1`,
    [usuario]
  );
  const cartera = rows[0];

  assert.equal(Number(cartera.reserved_usd), Number(cartera.vivos),
    'el reservado es exactamente la suma de los retiros vivos');
  assert.equal(Number(cartera.available_usd) + Number(cartera.reserved_usd), 100,
    'el total sigue siendo el que había');
  assert.ok(Number(cartera.withdrawable_available_usd) <= Number(cartera.available_usd),
    'lo retirable nunca supera lo disponible');
});
