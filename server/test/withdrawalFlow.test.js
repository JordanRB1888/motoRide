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
import { abonar, asegurarCartera, enTransaccion, leerCartera, leerMovimientos } from '../services/walletStore.ts';
import { crearMetodo } from '../services/paymentMethodStore.ts';
import {
  cambiarEstado,
  leerAuditoria,
  leerRetiroDeUsuario,
  listarRetirosDeUsuario,
  solicitarRetiro
} from '../services/withdrawalService.ts';

/**
 * WALLET-PAYOUTS-1 — el ciclo de vida de un retiro contra PostgreSQL.
 */

const pool = await abrirBaseDePruebas();
const preparado = pool ? await esquemaPreparado(pool) : false;
const saltar = { skip: motivoParaSaltar(pool, preparado) };

test.after(async () => {
  await limpiar(pool);
  if (pool) await pool.end();
});

/** Un usuario con cartera, saldo retirable y un método dado de alta. */
async function prepararConductor(saldo = '100.00') {
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: saldo, claseDeFondos: 'EARNED',
    claveDeIdempotencia: `saldo-${usuario}`
  }));
  const metodo = await crearMetodo(pool, usuario, 'BANK_TRANSFER', CUENTA_VALIDA);
  return { usuario, metodoId: metodo.metodo.id };
}

const pedir = (usuario, metodoId, monto, clave, extra = {}) => solicitarRetiro(pool, {
  userId: usuario, rol: 'driver', metodoId, monto,
  claveDeIdempotencia: clave, banderas: BANDERAS_ENCENDIDAS, ...extra
});

// ---------------------------------------------------------------------------
// Reserva atómica
// ---------------------------------------------------------------------------

test('solicitar reserva los fondos: el dinero no desaparece, se mueve', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const resultado = await pedir(usuario, metodoId, '40.00', `r-${usuario}`);

  assert.equal(resultado.ok, true, resultado.ok ? '' : resultado.detalle);
  assert.equal(resultado.retiro.status, 'REQUESTED');
  assert.equal(resultado.retiro.amount, '40.00');

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.available, '60.00', 'baja lo disponible');
  assert.equal(saldos.reserved, '40.00', 'sube lo reservado');
  assert.equal(saldos.withdrawableAvailable, '60.00', 'y también lo retirable');
  assert.equal(Number(saldos.available) + Number(saldos.reserved), 100, 'el total no cambia');
});

test('lo reservado ya no se puede volver a retirar', saltar, async () => {
  // Es lo que el flujo actual del producto no hace: allí el saldo sigue entero
  // entre solicitar y aprobar, así que se puede gastar dos veces.
  const { usuario, metodoId } = await prepararConductor('100.00');
  await pedir(usuario, metodoId, '80.00', `r1-${usuario}`);
  const segundo = await pedir(usuario, metodoId, '80.00', `r2-${usuario}`);

  assert.equal(segundo.ok, false);
  assert.equal(segundo.motivo, 'FONDOS_INSUFICIENTES');
});

test('no se puede retirar saldo NO retirable', saltar, async () => {
  const usuario = await crearUsuario(pool);
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: '500.00', claseDeFondos: 'PROMO',
    claveDeIdempotencia: `promo-${usuario}`
  }));
  const metodo = await crearMetodo(pool, usuario, 'BANK_TRANSFER', CUENTA_VALIDA);

  const resultado = await solicitarRetiro(pool, {
    userId: usuario, rol: 'passenger', metodoId: metodo.metodo.id, monto: '10.00',
    claveDeIdempotencia: `promo-wd-${usuario}`, banderas: BANDERAS_ENCENDIDAS
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'FONDOS_INSUFICIENTES');
  // Y el saldo promocional sigue intacto: no se tocó nada.
  assert.equal((await leerCartera(pool, usuario)).available, '500.00');
});

test('importes imposibles se rechazan antes de tocar la cartera', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const casos = ['0', '-10.00', '10.999', 'NaN', 'Infinity', ''];

  for (const monto of casos) {
    const resultado = await pedir(usuario, metodoId, monto, `mal-${usuario}-${monto}`);
    assert.equal(resultado.ok, false, monto);
    assert.equal(resultado.motivo, 'IMPORTE_INVALIDO', monto);
  }
  assert.equal((await leerCartera(pool, usuario)).reserved, '0.00');
});

// ---------------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------------

test('la misma clave de idempotencia no reserva dos veces', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const clave = `idem-${usuario}`;

  const primera = await pedir(usuario, metodoId, '30.00', clave);
  const segunda = await pedir(usuario, metodoId, '30.00', clave);

  assert.equal(primera.ok, true);
  assert.equal(primera.yaExistia, false);
  assert.equal(segunda.ok, true);
  assert.equal(segunda.yaExistia, true, 'se devuelve el que ya había');
  assert.equal(segunda.retiro.id, primera.retiro.id);

  assert.equal((await leerCartera(pool, usuario)).reserved, '30.00', 'una sola reserva');
  assert.equal((await listarRetirosDeUsuario(pool, usuario)).length, 1);
});

// ---------------------------------------------------------------------------
// El ciclo completo
// ---------------------------------------------------------------------------

test('aprobar NO paga: el dinero sigue reservado', saltar, async () => {
  // La distinción que ordena toda la fase. En el flujo actual del producto,
  // aprobar descuenta el saldo y notifica «Liquidación pagada».
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '50.00', `ap-${usuario}`);

  const aprobado = await cambiarEstado(pool, {
    retiroId: retiro.retiro.id, nuevoEstado: 'APPROVED',
    actorId: 'admin_prueba', actorRol: 'admin'
  });

  assert.equal(aprobado.ok, true, aprobado.ok ? '' : aprobado.detalle);
  assert.equal(aprobado.retiro.status, 'APPROVED');

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.reserved, '50.00', 'sigue reservado: todavía no se ha pagado');
  assert.equal(saldos.available, '50.00');
});

test('el camino completo hasta PAID consume el dinero', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '50.00', `full-${usuario}`);
  const id = retiro.retiro.id;

  for (const estado of ['UNDER_REVIEW', 'APPROVED', 'PROCESSING']) {
    const paso = await cambiarEstado(pool, {
      retiroId: id, nuevoEstado: estado, actorId: 'admin_prueba', actorRol: 'admin'
    });
    assert.equal(paso.ok, true, `${estado}: ${paso.ok ? '' : paso.detalle}`);
  }

  const pagado = await cambiarEstado(pool, {
    retiroId: id, nuevoEstado: 'PAID', actorId: 'admin_prueba', actorRol: 'admin',
    referenciaDePago: 'REF-BANCO-001122'
  });
  assert.equal(pagado.ok, true, pagado.ok ? '' : pagado.detalle);
  assert.equal(pagado.retiro.paymentReference, 'REF-BANCO-001122');

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.reserved, '0.00', 'lo reservado se consumió');
  assert.equal(saldos.available, '50.00', 'y NO volvió a disponible: salió del sistema');
});

test('marcar como pagado SIN referencia se rechaza', saltar, async () => {
  // No se genera una referencia automática: una referencia inventada por el
  // sistema no demuestra que el banco movió nada.
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '20.00', `sinref-${usuario}`);
  await cambiarEstado(pool, { retiroId: retiro.retiro.id, nuevoEstado: 'APPROVED', actorId: 'a', actorRol: 'admin' });
  await cambiarEstado(pool, { retiroId: retiro.retiro.id, nuevoEstado: 'PROCESSING', actorId: 'a', actorRol: 'admin' });

  for (const referencia of [null, '', '   ']) {
    const resultado = await cambiarEstado(pool, {
      retiroId: retiro.retiro.id, nuevoEstado: 'PAID',
      actorId: 'a', actorRol: 'admin', referenciaDePago: referencia
    });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, 'REFERENCIA_DE_PAGO_REQUERIDA');
  }
});

test('rechazar devuelve el dinero exactamente una vez', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '40.00', `rej-${usuario}`);

  const rechazado = await cambiarEstado(pool, {
    retiroId: retiro.retiro.id, nuevoEstado: 'REJECTED',
    actorId: 'admin_prueba', actorRol: 'admin', motivo: 'datos bancarios incorrectos'
  });
  assert.equal(rechazado.ok, true);

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.available, '100.00', 'el dinero vuelve entero');
  assert.equal(saldos.reserved, '0.00');
  assert.equal(saldos.withdrawableAvailable, '100.00', 'y vuelve a ser retirable');
});

test('repetir el rechazo NO devuelve el dinero dos veces', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '40.00', `rej2-${usuario}`);

  for (let i = 0; i < 3; i += 1) {
    const resultado = await cambiarEstado(pool, {
      retiroId: retiro.retiro.id, nuevoEstado: 'REJECTED', actorId: 'a', actorRol: 'admin'
    });
    assert.equal(resultado.ok, true, `intento ${i}`);
    if (i > 0) assert.equal(resultado.sinCambios, true, 'los reintentos no hacen nada');
  }

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.available, '100.00', 'exactamente una devolución');
  assert.equal(saldos.reserved, '0.00');
});

test('marcar PAID tres veces paga una vez', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '60.00', `paid3-${usuario}`);
  const id = retiro.retiro.id;
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'APPROVED', actorId: 'a', actorRol: 'admin' });
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'PROCESSING', actorId: 'a', actorRol: 'admin' });

  for (let i = 0; i < 3; i += 1) {
    const resultado = await cambiarEstado(pool, {
      retiroId: id, nuevoEstado: 'PAID', actorId: 'a', actorRol: 'admin',
      referenciaDePago: 'REF-XYZ'
    });
    assert.equal(resultado.ok, true, `intento ${i}`);
    if (i > 0) assert.equal(resultado.sinCambios, true);
  }

  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.reserved, '0.00');
  assert.equal(saldos.available, '40.00', 'se consumió una sola vez');
});

test('no se puede pagar un retiro ya rechazado, ni al revés', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '30.00', `term-${usuario}`);
  await cambiarEstado(pool, { retiroId: retiro.retiro.id, nuevoEstado: 'REJECTED', actorId: 'a', actorRol: 'admin' });

  const pagar = await cambiarEstado(pool, {
    retiroId: retiro.retiro.id, nuevoEstado: 'PAID',
    actorId: 'a', actorRol: 'admin', referenciaDePago: 'REF'
  });
  assert.equal(pagar.ok, false);
  assert.equal(pagar.motivo, 'TRANSICION_INVALIDA');

  const aprobar = await cambiarEstado(pool, {
    retiroId: retiro.retiro.id, nuevoEstado: 'APPROVED', actorId: 'a', actorRol: 'admin'
  });
  assert.equal(aprobar.ok, false);
  assert.equal(aprobar.motivo, 'TRANSICION_INVALIDA');

  // Y el dinero sigue devuelto una sola vez.
  assert.equal((await leerCartera(pool, usuario)).available, '100.00');
});

// ---------------------------------------------------------------------------
// El libro mayor del retiro
// ---------------------------------------------------------------------------

test('cada momento del retiro deja SU movimiento, y sólo uno', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '25.00', `led-${usuario}`);
  const id = retiro.retiro.id;
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'APPROVED', actorId: 'a', actorRol: 'admin' });
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'PROCESSING', actorId: 'a', actorRol: 'admin' });
  await cambiarEstado(pool, {
    retiroId: id, nuevoEstado: 'PAID', actorId: 'a', actorRol: 'admin', referenciaDePago: 'REF-1'
  });

  const movimientos = await leerMovimientos(pool, usuario);
  const delRetiro = movimientos.filter(m => m.referenceId === id);

  // Reservar y liquidar: dos movimientos. Aprobar y pasar a proceso NO son
  // hechos contables y no anotan nada.
  assert.equal(delRetiro.length, 2);
  assert.deepEqual(delRetiro.map(m => m.type).sort(),
    ['WITHDRAWAL_RESERVE', 'WITHDRAWAL_SETTLE']);
  for (const movimiento of delRetiro) {
    assert.equal(movimiento.amount, '25.00');
    assert.equal(movimiento.referenceType, 'WITHDRAWAL');
  }
});

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------

test('cada acción administrativa queda registrada con su actor', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '20.00', `aud-${usuario}`);
  await cambiarEstado(pool, {
    retiroId: retiro.retiro.id, nuevoEstado: 'APPROVED',
    actorId: 'admin_ana', actorRol: 'admin', motivo: 'documentación correcta'
  });

  const eventos = await leerAuditoria(pool, retiro.retiro.id);
  assert.equal(eventos.length, 2, 'la solicitud y la aprobación');

  const aprobacion = eventos[1];
  assert.equal(aprobacion.actor_user_id, 'admin_ana');
  assert.equal(aprobacion.actor_role, 'admin');
  assert.equal(aprobacion.from_status, 'REQUESTED');
  assert.equal(aprobacion.to_status, 'APPROVED');
  assert.equal(aprobacion.reason, 'documentación correcta');
  assert.ok(aprobacion.created_at);
});

test('la auditoría es APPEND-ONLY', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('50.00');
  const retiro = await pedir(usuario, metodoId, '10.00', `audap-${usuario}`);

  await assert.rejects(
    () => pool.query(
      'update public.withdrawal_audit_events set actor_user_id = $2 where withdrawal_id = $1',
      [retiro.retiro.id, 'otro']
    ),
    /append-only/
  );
  await assert.rejects(
    () => pool.query('delete from public.withdrawal_audit_events where withdrawal_id = $1', [retiro.retiro.id]),
    /append-only/
  );
});

// ---------------------------------------------------------------------------
// Los términos son inmutables
// ---------------------------------------------------------------------------

test('el importe y la instantánea de un retiro NO se pueden editar', saltar, async () => {
  // Que puedan cambiarse después convierte cualquier revisión administrativa en
  // una oportunidad de cambiar cuánto y a dónde, sin dejar rastro.
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '30.00', `inm-${usuario}`);

  const intentos = [
    ['amount_usd', '999.00'],
    ['method_snapshot', JSON.stringify({ accountNumber: '00000000000000000000' })],
    ['user_id', 'otro_usuario'],
    ['idempotency_key', 'otra-clave']
  ];
  for (const [columna, valor] of intentos) {
    await assert.rejects(
      () => pool.query(
        `update public.withdrawal_requests set ${columna} = $2 where id = $1`,
        [retiro.retiro.id, valor]
      ),
      /inmutables|violates/,
      `debería impedir cambiar ${columna}`
    );
  }
});

// ---------------------------------------------------------------------------
// Instantánea del tipo de cambio (FX-BCV-1)
// ---------------------------------------------------------------------------

const LECTURA_DE_TASA = {
  rate: {
    base: 'USD', quote: 'VES', rate: '794.99170000',
    valueDate: '2026-08-31', source: 'BCV', fetchedAt: '2026-08-30T21:30:00.000Z'
  },
  freshness: 'FRESH',
  ageInDays: 0
};

test('el equivalente en bolívares se congela al solicitar', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '50.00', `fx-${usuario}`, {
    incluirEquivalenteEnVes: true,
    proveedorDeTasa: async () => LECTURA_DE_TASA
  });

  assert.equal(retiro.ok, true, retiro.ok ? '' : retiro.detalle);
  assert.equal(retiro.retiro.fx.rate, '794.99170000');
  assert.equal(retiro.retiro.fx.effectiveDate, '2026-08-31');
  assert.equal(retiro.retiro.fx.source, 'BCV');
  // 50.00 × 794.99170000 = 39749.585 → 39749.59 con redondeo comercial.
  assert.equal(retiro.retiro.amountVes, '39749.59');
});

test('sin tasa oficial NO se inventa ninguna: falla cerrado', saltar, async () => {
  // Ni 1, ni 0, ni la constante heredada de 874,50, ni una tasa de mercado
  // paralelo.
  const { usuario, metodoId } = await prepararConductor('100.00');
  const resultado = await pedir(usuario, metodoId, '50.00', `nofx-${usuario}`, {
    incluirEquivalenteEnVes: true,
    proveedorDeTasa: async () => null
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'SIN_TASA_DE_CAMBIO');
  // Y no se reservó nada: el fallo ocurre antes de tocar la cartera.
  assert.equal((await leerCartera(pool, usuario)).reserved, '0.00');
});

test('la instantánea del cambio NO se recalcula al avanzar el retiro', saltar, async () => {
  // Volver a preguntarle al BCV daría otra cifra en cuanto publique una
  // corrección, y la persona vería cambiar un importe ya comunicado.
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '50.00', `fxfix-${usuario}`, {
    incluirEquivalenteEnVes: true,
    proveedorDeTasa: async () => LECTURA_DE_TASA
  });
  const id = retiro.retiro.id;

  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'APPROVED', actorId: 'a', actorRol: 'admin' });
  await cambiarEstado(pool, { retiroId: id, nuevoEstado: 'PROCESSING', actorId: 'a', actorRol: 'admin' });
  await cambiarEstado(pool, {
    retiroId: id, nuevoEstado: 'PAID', actorId: 'a', actorRol: 'admin', referenciaDePago: 'REF-FX'
  });

  const final = await leerRetiroDeUsuario(pool, usuario, id);
  assert.equal(final.fx.rate, '794.99170000', 'la misma tasa que al solicitar');
  assert.equal(final.amountVes, '39749.59');
});

test('el motor rechaza una instantánea de cambio a medias', saltar, async () => {
  // Una a medias —tasa sin fecha, o importe en bolívares sin tasa— es peor que
  // ninguna: parece auditable y no lo es.
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '10.00', `fxmed-${usuario}`);

  await assert.rejects(
    () => pool.query(
      `update public.withdrawal_requests set fx_rate = 794.99 where id = $1`,
      [retiro.retiro.id]
    ),
    /inmutables|violates/
  );

  // Y directamente en un insert nuevo, saltándose el servicio.
  await assert.rejects(
    () => pool.query(
      `insert into public.withdrawal_requests
         (id, user_id, wallet_id, amount_usd, status, payment_method_id,
          method_type, method_snapshot, fx_rate, idempotency_key)
       values ($1, $2, $3, 10, 'REQUESTED', $4, 'BANK_TRANSFER', '{}'::jsonb, 794.99, $5)`,
      [`wd_medio_${usuario}`, usuario, `wallet-${usuario}`, metodoId, `k_medio_${usuario}`]
    ),
    /violates check constraint/
  );
});

test('el motor sólo admite BCV como fuente de la tasa', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  await assert.rejects(
    () => pool.query(
      `insert into public.withdrawal_requests
         (id, user_id, wallet_id, amount_usd, status, payment_method_id,
          method_type, method_snapshot,
          fx_rate, fx_effective_date, fx_fetched_at, fx_source, amount_ves, idempotency_key)
       values ($1, $2, $3, 10, 'REQUESTED', $4, 'BANK_TRANSFER', '{}'::jsonb,
               100, '2026-08-31', now(), 'BINANCE', 1000, $5)`,
      [`wd_binance_${usuario}`, usuario, `wallet-${usuario}`, metodoId, `k_binance_${usuario}`]
    ),
    /violates check constraint/
  );
});

test('el motor exige referencia para que una fila esté PAID', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor('100.00');
  const retiro = await pedir(usuario, metodoId, '10.00', `paidref-${usuario}`);
  await assert.rejects(
    () => pool.query(
      `update public.withdrawal_requests set status = 'PAID' where id = $1`,
      [retiro.retiro.id]
    ),
    /violates check constraint/
  );
});
