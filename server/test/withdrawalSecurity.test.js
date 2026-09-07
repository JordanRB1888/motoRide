import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { abonar, asegurarCartera, enTransaccion, leerCartera, leerMovimientos } from '../services/walletStore.ts';
import { crearMetodo, listarMetodos } from '../services/paymentMethodStore.ts';
import {
  cambiarEstado,
  leerAuditoria,
  leerRetiroDeUsuario,
  listarRetirosDeUsuario,
  solicitarRetiro
} from '../services/withdrawalService.ts';

/**
 * WALLET-PAYOUTS-1 — seguridad.
 *
 * Dos personas, y todo lo que una no debe poder hacerle a la otra.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizServidor = path.resolve(aqui, '..');

const pool = await abrirBaseDePruebas();
const preparado = pool ? await esquemaPreparado(pool) : false;
const saltar = { skip: motivoParaSaltar(pool, preparado) };

test.after(async () => {
  await limpiar(pool);
  if (pool) await pool.end();
});

async function prepararConductor(saldo = '100.00') {
  const usuario = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, usuario);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: usuario, monto: saldo, claseDeFondos: 'EARNED',
    claveDeIdempotencia: `sec-${usuario}`
  }));
  const metodo = await crearMetodo(pool, usuario, 'BANK_TRANSFER', CUENTA_VALIDA);
  return { usuario, metodoId: metodo.metodo.id };
}

const pedir = (usuario, metodoId, monto, clave) => solicitarRetiro(pool, {
  userId: usuario, rol: 'driver', metodoId, monto,
  claveDeIdempotencia: clave, banderas: BANDERAS_ENCENDIDAS
});

// ---------------------------------------------------------------------------
// IDOR
// ---------------------------------------------------------------------------

test('nadie puede LEER el retiro de otra persona', saltar, async () => {
  const victima = await prepararConductor();
  const intruso = await crearUsuario(pool, 'driver');
  const retiro = await pedir(victima.usuario, victima.metodoId, '40.00', `idor1-${victima.usuario}`);

  assert.ok(await leerRetiroDeUsuario(pool, victima.usuario, retiro.retiro.id), 'su dueño sí lo ve');
  assert.equal(
    await leerRetiroDeUsuario(pool, intruso, retiro.retiro.id), null,
    'y nadie más'
  );
  assert.deepEqual(await listarRetirosDeUsuario(pool, intruso), []);
});

test('nadie puede CANCELAR el retiro de otra persona', saltar, async () => {
  const victima = await prepararConductor();
  const intruso = await crearUsuario(pool, 'driver');
  const retiro = await pedir(victima.usuario, victima.metodoId, '40.00', `idor2-${victima.usuario}`);

  const intento = await cambiarEstado(pool, {
    retiroId: retiro.retiro.id, nuevoEstado: 'CANCELLED',
    actorId: intruso, actorRol: 'driver', restringirAUsuario: intruso
  });

  assert.equal(intento.ok, false);
  assert.equal(intento.motivo, 'RETIRO_NO_ENCONTRADO');

  // El retiro y el dinero siguen igual.
  const intacto = await leerRetiroDeUsuario(pool, victima.usuario, retiro.retiro.id);
  assert.equal(intacto.status, 'REQUESTED');
  assert.equal((await leerCartera(pool, victima.usuario)).reserved, '40.00');
});

test('su dueño SÍ puede cancelar, y recupera el dinero', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor();
  const retiro = await pedir(usuario, metodoId, '40.00', `cancel-${usuario}`);

  const cancelado = await cambiarEstado(pool, {
    retiroId: retiro.retiro.id, nuevoEstado: 'CANCELLED',
    actorId: usuario, actorRol: 'driver', restringirAUsuario: usuario
  });

  assert.equal(cancelado.ok, true, cancelado.ok ? '' : cancelado.detalle);
  const saldos = await leerCartera(pool, usuario);
  assert.equal(saldos.available, '100.00');
  assert.equal(saldos.reserved, '0.00');
});

test('no se puede retirar usando el método de OTRA persona', saltar, async () => {
  // El intruso tiene saldo propio, pero apunta al método bancario ajeno: el
  // dinero saldría de su cartera hacia la cuenta de otro.
  const victima = await prepararConductor();
  const intruso = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, intruso);
  await enTransaccion(pool, cliente => abonar(cliente, {
    userId: intruso, monto: '500.00', claseDeFondos: 'EARNED',
    claveDeIdempotencia: `intruso-${intruso}`
  }));

  const resultado = await solicitarRetiro(pool, {
    userId: intruso, rol: 'driver', metodoId: victima.metodoId, monto: '10.00',
    claveDeIdempotencia: `cross-${intruso}`, banderas: BANDERAS_ENCENDIDAS
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'METODO_NO_ENCONTRADO');
  assert.equal((await leerCartera(pool, intruso)).reserved, '0.00', 'no se reservó nada');
});

test('nadie ve los movimientos de la cartera ajena', saltar, async () => {
  const victima = await prepararConductor();
  const intruso = await crearUsuario(pool, 'driver');
  assert.ok((await leerMovimientos(pool, victima.usuario)).length > 0);
  assert.deepEqual(await leerMovimientos(pool, intruso), []);
});

test('nadie ve los métodos de pago ajenos', saltar, async () => {
  const victima = await prepararConductor();
  const intruso = await crearUsuario(pool);
  await crearMetodo(pool, intruso, 'PAGO_MOVIL', PAGO_MOVIL_VALIDO);

  const suyos = await listarMetodos(pool, intruso);
  assert.equal(suyos.length, 1, 'sólo el suyo');
  assert.equal(suyos[0].type, 'PAGO_MOVIL');
});

// ---------------------------------------------------------------------------
// Lo que sale por la API no lleva datos bancarios
// ---------------------------------------------------------------------------

test('un retiro NO expone la cuenta completa ni el documento', saltar, async () => {
  // Ni siquiera a su dueño: no le hacen falta para reconocer su cuenta, y una
  // respuesta que los lleva acaba en un registro o una captura de pantalla.
  const { usuario, metodoId } = await prepararConductor();
  const retiro = await pedir(usuario, metodoId, '30.00', `exp-${usuario}`);
  const texto = JSON.stringify(retiro.retiro);

  for (const secreto of [CUENTA_VALIDA.accountNumber, CUENTA_VALIDA.holderDocumentNumber]) {
    assert.equal(texto.includes(secreto), false, `no debe aparecer: ${secreto}`);
  }
  assert.equal(retiro.retiro.method.maskedIdentifier, '****2345');
});

test('la auditoría no guarda secretos', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor();
  const retiro = await pedir(usuario, metodoId, '20.00', `aud-${usuario}`);
  await cambiarEstado(pool, {
    retiroId: retiro.retiro.id, nuevoEstado: 'APPROVED',
    actorId: 'admin_x', actorRol: 'admin', motivo: 'revisado'
  });

  const texto = JSON.stringify(await leerAuditoria(pool, retiro.retiro.id));
  for (const secreto of [CUENTA_VALIDA.accountNumber, CUENTA_VALIDA.holderDocumentNumber, 'contraseña']) {
    assert.equal(texto.includes(secreto), false, secreto);
  }
});

test('el motor rechaza metadata de auditoría con datos sensibles', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor();
  const retiro = await pedir(usuario, metodoId, '10.00', `audmeta-${usuario}`);

  for (const clave of ['jwt', 'cookie', 'accountNumber', 'otp']) {
    await assert.rejects(
      () => pool.query(
        `insert into public.withdrawal_audit_events
           (id, withdrawal_id, actor_user_id, actor_role, action, metadata)
         values ($1, $2, 'a', 'admin', 'X', $3::jsonb)`,
        [`wae_${clave}_${usuario}`, retiro.retiro.id, JSON.stringify({ [clave]: 'x' })]
      ),
      /violates check constraint/,
      clave
    );
  }
});

// ---------------------------------------------------------------------------
// Las banderas NO son un permiso
// ---------------------------------------------------------------------------

test('encender la bandera NO salta la propiedad ni las invariantes', saltar, async () => {
  // Una bandera abre una puerta; no convierte a nadie en administrador ni hace
  // aparecer dinero.
  const victima = await prepararConductor();
  const intruso = await crearUsuario(pool, 'driver');
  await asegurarCartera(pool, intruso);

  // Con TODO encendido, sigue sin poder usar el método ajeno…
  const ajeno = await solicitarRetiro(pool, {
    userId: intruso, rol: 'driver', metodoId: victima.metodoId, monto: '10.00',
    claveDeIdempotencia: `flag1-${intruso}`, banderas: BANDERAS_ENCENDIDAS
  });
  assert.equal(ajeno.ok, false);
  assert.equal(ajeno.motivo, 'METODO_NO_ENCONTRADO');

  // …ni retirar dinero que no tiene.
  const propio = await crearMetodo(pool, intruso, 'PAGO_MOVIL', PAGO_MOVIL_VALIDO);
  const sinFondos = await solicitarRetiro(pool, {
    userId: intruso, rol: 'driver', metodoId: propio.metodo.id, monto: '10.00',
    claveDeIdempotencia: `flag2-${intruso}`, banderas: BANDERAS_ENCENDIDAS
  });
  assert.equal(sinFondos.ok, false);
  assert.equal(sinFondos.motivo, 'FONDOS_INSUFICIENTES');
});

test('con las banderas apagadas no se retira, aunque todo lo demás esté bien', saltar, async () => {
  const { usuario, metodoId } = await prepararConductor();
  const apagadas = { retirosHabilitados: false, retirosDeConductorHabilitados: false };

  const resultado = await solicitarRetiro(pool, {
    userId: usuario, rol: 'driver', metodoId, monto: '10.00',
    claveDeIdempotencia: `off-${usuario}`, banderas: apagadas
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'RETIROS_DESHABILITADOS');
  assert.equal((await leerCartera(pool, usuario)).reserved, '0.00');
});

test('los retiros de CONDUCTOR siguen bloqueados por Driver Finance', saltar, async () => {
  // DRIVER-FINANCE-1 está pausado: el saldo de un conductor depende de una
  // liquidación cuya corrección está en revisión.
  const { usuario, metodoId } = await prepararConductor();
  const soloGeneral = { retirosHabilitados: true, retirosDeConductorHabilitados: false };

  const resultado = await solicitarRetiro(pool, {
    userId: usuario, rol: 'driver', metodoId, monto: '10.00',
    claveDeIdempotencia: `drv-${usuario}`, banderas: soloGeneral
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'RETIROS_DE_CONDUCTOR_DESHABILITADOS');
});

// ---------------------------------------------------------------------------
// Reglas sobre el propio código
// ---------------------------------------------------------------------------

test('el código de retiros NO crea su propia autenticación', saltar, () => {
  // La autoridad sigue siendo `requireAuth` / `requireRole` del backend. Dos
  // autoridades de autenticación conviviendo es una vulnerabilidad, no una
  // migración.
  const soloCodigo = texto =>
    texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const prohibido = /jsonwebtoken|jwt\.sign|jwt\.verify|bcrypt|passwordHash/i;

  const ficheros = [
    'services/withdrawalService.ts',
    'services/walletStore.ts',
    'services/paymentMethodStore.ts',
    'services/walletFeatureFlags.ts',
    'domain/withdrawalStateMachine.ts',
    'domain/venezuelanPaymentMethods.ts',
    'domain/fundClasses.ts'
  ];
  for (const relativa of ficheros) {
    const codigo = soloCodigo(fs.readFileSync(path.join(raizServidor, relativa), 'utf8'));
    assert.equal(prohibido.test(codigo), false, `${relativa} no debe autenticar por su cuenta`);
  }
});

test('esta fase NO toca Driver Finance', saltar, () => {
  const soloCodigo = texto =>
    texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const prohibido = /driverFinanceStore|driver_finance|driver_commission_reservations|driver_maintenance_obligations/i;

  const ficheros = [
    'services/withdrawalService.ts', 'services/walletStore.ts',
    'services/paymentMethodStore.ts', 'services/walletFeatureFlags.ts'
  ];
  for (const relativa of ficheros) {
    const codigo = soloCodigo(fs.readFileSync(path.join(raizServidor, relativa), 'utf8'));
    assert.equal(prohibido.test(codigo), false, `${relativa} menciona Driver Finance`);
  }
});

test('la tasa heredada de 874,50 NO aparece en el código nuevo', saltar, () => {
  // Los nuevos modelos usan el servicio FX aprobado o no convierten. La
  // constante legacy sigue existiendo para otras pantallas, pero no entra aquí.
  const ficheros = [
    'services/withdrawalService.ts', 'services/walletStore.ts',
    'services/paymentMethodStore.ts'
  ];
  for (const relativa of ficheros) {
    const texto = fs.readFileSync(path.join(raizServidor, relativa), 'utf8');
    assert.equal(texto.includes('874.5'), false, relativa);
    assert.equal(/BCV_RATE|BCV_EURO_RATE/.test(texto), false, relativa);
  }
});
