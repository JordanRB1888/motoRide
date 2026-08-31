import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BANDERAS_ENCENDIDAS,
  CUENTA_VALIDA,
  PAGO_MOVIL_VALIDO,
  abrirBaseDePruebas,
  crearUsuario,
  limpiar,
  esquemaPreparado,
  motivoParaSaltar
} from './helpers/walletTestDb.js';
import {
  crearMetodo,
  desactivarMetodo,
  leerDetalleCompletoParaPago,
  leerMetodoDeUsuario,
  listarMetodos
} from '../services/paymentMethodStore.ts';
import { asegurarCartera, abonar, enTransaccion } from '../services/walletStore.ts';
import { solicitarRetiro } from '../services/withdrawalService.ts';

/**
 * WALLET-PAYOUTS-1 — métodos de retiro contra PostgreSQL.
 *
 * Los datos bancarios de estas pruebas son inventados.
 */

const pool = await abrirBaseDePruebas();
const preparado = pool ? await esquemaPreparado(pool) : false;
const saltar = { skip: motivoParaSaltar(pool, preparado) };

test.after(async () => {
  await limpiar(pool);
  if (pool) await pool.end();
});

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

test('se da de alta una transferencia bancaria y vuelve ENMASCARADA', saltar, async () => {
  const usuario = await crearUsuario(pool, 'driver');
  const resultado = await crearMetodo(pool, usuario, 'BANK_TRANSFER', CUENTA_VALIDA);

  assert.equal(resultado.ok, true, resultado.ok ? '' : resultado.detalle);
  assert.equal(resultado.metodo.type, 'BANK_TRANSFER');
  assert.equal(resultado.metodo.status, 'ACTIVE');
  assert.equal(resultado.metodo.maskedIdentifier, '****2345');

  // Lo que vuelve NO lleva la cuenta completa, ni siquiera para su dueño.
  const texto = JSON.stringify(resultado.metodo);
  assert.equal(texto.includes(CUENTA_VALIDA.accountNumber), false);
  assert.equal(texto.includes(CUENTA_VALIDA.holderDocumentNumber), false);
});

test('se da de alta un Pago Móvil', saltar, async () => {
  const usuario = await crearUsuario(pool);
  const resultado = await crearMetodo(pool, usuario, 'PAGO_MOVIL', PAGO_MOVIL_VALIDO);
  assert.equal(resultado.ok, true, resultado.ok ? '' : resultado.detalle);
  assert.equal(resultado.metodo.maskedIdentifier, '0414****567');
  assert.equal(JSON.stringify(resultado.metodo).includes('04141234567'), false);
});

test('el motor rechaza una cuenta que no empieza por su banco', saltar, async () => {
  // La misma invariante que valida el dominio, pero impuesta por PostgreSQL:
  // así también protege a un script que escriba directamente en la tabla.
  const usuario = await crearUsuario(pool);
  await assert.rejects(
    () => pool.query(
      `insert into public.payment_methods
         (id, user_id, method_type, bank_code, bank_name, account_type, account_number,
          holder_name, holder_document_type, holder_document_number)
       values ($1, $2, 'BANK_TRANSFER', '0105', 'Otro', 'CORRIENTE', '01020123456789012345',
               'Alguien', 'V', '12345678')`,
      [`pm_malo_${usuario}`, usuario]
    ),
    /violates check constraint/
  );
});

test('el motor rechaza un Pago Móvil con número de cuenta', saltar, async () => {
  // Sin esto cabría un método que no se puede pagar: ni teléfono ni coherencia.
  const usuario = await crearUsuario(pool);
  await assert.rejects(
    () => pool.query(
      `insert into public.payment_methods
         (id, user_id, method_type, bank_code, bank_name, account_number, phone,
          holder_name, holder_document_type, holder_document_number)
       values ($1, $2, 'PAGO_MOVIL', '0102', 'Banco', '01020123456789012345', null,
               'Alguien', 'V', '12345678')`,
      [`pm_mixto_${usuario}`, usuario]
    ),
    /violates check constraint/
  );
});

test('el motor rechaza un teléfono que no es un móvil venezolano', saltar, async () => {
  const usuario = await crearUsuario(pool);
  await assert.rejects(
    () => pool.query(
      `insert into public.payment_methods
         (id, user_id, method_type, bank_code, bank_name, phone,
          holder_name, holder_document_type, holder_document_number)
       values ($1, $2, 'PAGO_MOVIL', '0102', 'Banco', '02611234567',
               'Alguien', 'V', '12345678')`,
      [`pm_fijo_${usuario}`, usuario]
    ),
    /violates check constraint/
  );
});

// ---------------------------------------------------------------------------
// Propiedad
// ---------------------------------------------------------------------------

test('un método de otra persona sencillamente NO aparece', saltar, async () => {
  // La propiedad va en el `where`, no en una comparación posterior. Y devolver
  // `null` en vez de «no autorizado» evita confirmar que ese identificador
  // existe.
  const dueno = await crearUsuario(pool);
  const intruso = await crearUsuario(pool);
  const metodo = await crearMetodo(pool, dueno, 'PAGO_MOVIL', PAGO_MOVIL_VALIDO);

  assert.ok(await leerMetodoDeUsuario(pool, dueno, metodo.metodo.id));
  assert.equal(await leerMetodoDeUsuario(pool, intruso, metodo.metodo.id), null);
  assert.deepEqual(await listarMetodos(pool, intruso), []);
});

test('nadie puede desactivar el método de otra persona', saltar, async () => {
  const dueno = await crearUsuario(pool);
  const intruso = await crearUsuario(pool);
  const metodo = await crearMetodo(pool, dueno, 'PAGO_MOVIL', PAGO_MOVIL_VALIDO);

  assert.equal(await desactivarMetodo(pool, intruso, metodo.metodo.id), false);
  const intacto = await leerMetodoDeUsuario(pool, dueno, metodo.metodo.id);
  assert.equal(intacto.status, 'ACTIVE', 'sigue activo');

  assert.equal(await desactivarMetodo(pool, dueno, metodo.metodo.id), true);
  assert.equal((await leerMetodoDeUsuario(pool, dueno, metodo.metodo.id)).status, 'DISABLED');
});

// ---------------------------------------------------------------------------
// Los datos completos, sólo por la puerta que se llama distinto
// ---------------------------------------------------------------------------

test('el detalle para pagar SÍ trae lo necesario para transferir', saltar, async () => {
  // Existe una única función que devuelve los datos completos, y se llama
  // distinto para que usarla sea una decisión visible en el código.
  const usuario = await crearUsuario(pool);
  const metodo = await crearMetodo(pool, usuario, 'BANK_TRANSFER', CUENTA_VALIDA);
  const detalle = await leerDetalleCompletoParaPago(pool, metodo.metodo.id);

  assert.equal(detalle.accountNumber, CUENTA_VALIDA.accountNumber);
  assert.equal(detalle.bankCode, CUENTA_VALIDA.bankCode);
  assert.equal(detalle.holderName, CUENTA_VALIDA.holderName);
  // El documento viene además enmascarado, para las pantallas que no lo
  // necesitan entero.
  assert.equal(detalle.maskedDocument, 'V-****678');
});

// ---------------------------------------------------------------------------
// Métodos y retiros: la instantánea
// ---------------------------------------------------------------------------

test('cambiar el método NO cambia los retiros ya creados', saltar, async () => {
  // El caso del encargo: alguien pide un retiro y después cambia su cuenta. El
  // retiro anterior tiene que seguir apuntando a la cuenta que se eligió al
  // solicitarlo. Resolver los datos leyendo siempre el método «actual»
  // significaría pagar a una cuenta que quien solicitó nunca seleccionó.
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: '80.00', claseDeFondos: 'EARNED',
    claveDeIdempotencia: `snap-${usuario}`
  }));

  const metodo = await crearMetodo(pool, usuario, 'BANK_TRANSFER', CUENTA_VALIDA);
  const retiro = await solicitarRetiro(pool, {
    userId: usuario, rol: 'driver', metodoId: metodo.metodo.id, monto: '40.00',
    claveDeIdempotencia: `snap-wd-${usuario}`, banderas: BANDERAS_ENCENDIDAS
  });
  assert.equal(retiro.ok, true, retiro.ok ? '' : retiro.detalle);
  const cuentaAlSolicitar = retiro.retiro.method.maskedIdentifier;
  assert.equal(cuentaAlSolicitar, '****2345');

  // Ahora cambia la cuenta del método, directamente en la tabla.
  await pool.query(
    `update public.payment_methods
        set account_number = '01029999999999999999', updated_at = now()
      where id = $1`,
    [metodo.metodo.id]
  );

  const { rows } = await pool.query(
    'select method_snapshot from public.withdrawal_requests where id = $1', [retiro.retiro.id]
  );
  assert.equal(rows[0].method_snapshot.accountNumber, CUENTA_VALIDA.accountNumber,
    'la instantánea conserva la cuenta que se eligió');
});

test('desactivar el método NO borra el retiro histórico', saltar, async () => {
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: '60.00', claseDeFondos: 'EARNED',
    claveDeIdempotencia: `del-${usuario}`
  }));
  const metodo = await crearMetodo(pool, usuario, 'PAGO_MOVIL', PAGO_MOVIL_VALIDO);
  const retiro = await solicitarRetiro(pool, {
    userId: usuario, rol: 'driver', metodoId: metodo.metodo.id, monto: '30.00',
    claveDeIdempotencia: `del-wd-${usuario}`, banderas: BANDERAS_ENCENDIDAS
  });
  assert.equal(retiro.ok, true);

  await desactivarMetodo(pool, usuario, metodo.metodo.id);

  // Y borrarlo del todo es IMPOSIBLE mientras respalde un retiro: haría
  // desaparecer la evidencia de a dónde se mandó el dinero.
  await assert.rejects(
    () => pool.query('delete from public.payment_methods where id = $1', [metodo.metodo.id]),
    /violates foreign key constraint/
  );
});

test('no se puede pedir un retiro con un método deshabilitado', saltar, async () => {
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: '50.00', claseDeFondos: 'EARNED',
    claveDeIdempotencia: `dis-${usuario}`
  }));
  const metodo = await crearMetodo(pool, usuario, 'PAGO_MOVIL', PAGO_MOVIL_VALIDO);
  await desactivarMetodo(pool, usuario, metodo.metodo.id);

  const resultado = await solicitarRetiro(pool, {
    userId: usuario, rol: 'driver', metodoId: metodo.metodo.id, monto: '10.00',
    claveDeIdempotencia: `dis-wd-${usuario}`, banderas: BANDERAS_ENCENDIDAS
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'METODO_DESHABILITADO');

  // Y el dinero no se movió.
  const { rows } = await pool.query('select reserved_usd from public.wallets where user_id = $1', [usuario]);
  assert.equal(rows[0].reserved_usd, '0.00');
});
