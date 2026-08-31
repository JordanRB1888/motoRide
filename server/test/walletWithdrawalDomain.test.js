import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASES_SIN_DECIDIR,
  RETIRABILIDAD,
  esRetirable,
  retirabilidadDe
} from '../domain/fundClasses.ts';
import {
  ESTADO_INICIAL,
  esTerminal,
  evaluarTransicion,
  mantieneFondosReservados,
  requiereReferenciaDePago,
  transicionesDesde
} from '../domain/withdrawalStateMachine.ts';
import {
  enmascararDocumento,
  enmascararIdentificador,
  paraRegistro,
  validarMetodoDePago
} from '../domain/venezuelanPaymentMethods.ts';
import {
  BANDERA_RETIROS,
  BANDERA_RETIROS_DE_CONDUCTOR,
  evaluarDisponibilidad,
  leerBanderas
} from '../services/walletFeatureFlags.ts';
import { WITHDRAWAL_STATUSES } from '../../shared/contracts/wallet.ts';

/**
 * WALLET-PAYOUTS-1 — el dominio, sin base de datos.
 *
 * Todo aquí es puro. Ninguna prueba se conecta a nada, y los datos bancarios
 * que aparecen son inventados.
 */

// ---------------------------------------------------------------------------
// Clases de fondos: qué dinero puede salir de la aplicación
// ---------------------------------------------------------------------------

test('sólo lo ganado y lo depositado es retirable', () => {
  assert.equal(esRetirable('EARNED'), true, 'lo que un conductor ganó trabajando');
  assert.equal(esRetirable('DEPOSITED'), true, 'lo que la persona metió por una recarga');
});

test('las promociones NO se pueden convertir en una transferencia bancaria', () => {
  // Tratarlas como retirables convertiría cada campaña de marketing en una vía
  // de extracción de efectivo.
  for (const clase of ['PROMO', 'BONUS', 'REFERRAL']) {
    assert.equal(esRetirable(clase), false, clase);
  }
});

test('lo que no está decidido se trata como NO retirable', () => {
  // No es una política comercial disfrazada: es negarse a asumir. Si el dueño
  // decide que las promos son retirables, se cambia una línea. Al revés, el
  // dinero ya salió.
  assert.ok(CLASES_SIN_DECIDIR.length > 0, 'hay decisiones pendientes, y se declaran');
  for (const clase of CLASES_SIN_DECIDIR) {
    assert.equal(RETIRABILIDAD[clase], 'UNDECIDED');
    assert.equal(esRetirable(clase), false, `${clase} sin decidir no puede retirarse`);
  }
});

test('una clase desconocida tampoco es retirable', () => {
  assert.equal(retirabilidadDe('LO_QUE_SEA'), 'UNDECIDED');
  assert.equal(esRetirable('LO_QUE_SEA'), false);
});

// ---------------------------------------------------------------------------
// La máquina de estados: aprobar NO es pagar
// ---------------------------------------------------------------------------

test('APPROVED y PAID son estados distintos, y no se salta de uno a otro', () => {
  // El flujo actual del producto los confunde: al aprobar descuenta el saldo y
  // notifica «Liquidación pagada». Aquí hay que pasar por PROCESSING, que es
  // donde vive la transferencia real.
  assert.notEqual('APPROVED', 'PAID');
  const directo = evaluarTransicion('APPROVED', 'PAID');
  assert.equal(directo.permitida, false, 'aprobar no puede pagar por sí solo');

  assert.equal(evaluarTransicion('APPROVED', 'PROCESSING').permitida, true);
  assert.equal(evaluarTransicion('PROCESSING', 'PAID').permitida, true);
});

test('el camino feliz completo es válido y sólo consume al final', () => {
  const camino = [
    ['REQUESTED', 'UNDER_REVIEW', 'NINGUNO'],
    ['UNDER_REVIEW', 'APPROVED', 'NINGUNO'],
    ['APPROVED', 'PROCESSING', 'NINGUNO'],
    ['PROCESSING', 'PAID', 'CONSUMIR']
  ];
  for (const [desde, hacia, efecto] of camino) {
    const resultado = evaluarTransicion(desde, hacia);
    assert.equal(resultado.permitida, true, `${desde} → ${hacia}`);
    assert.equal(resultado.efecto, efecto, `${desde} → ${hacia}`);
  }
});

test('rechazar libera los fondos desde cualquier estado vivo', () => {
  for (const desde of ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING']) {
    const resultado = evaluarTransicion(desde, 'REJECTED');
    assert.equal(resultado.permitida, true, `debe poder rechazarse desde ${desde}`);
    assert.equal(resultado.efecto, 'LIBERAR', `y devolver el dinero desde ${desde}`);
  }
});

test('los estados terminales son terminales de verdad', () => {
  for (const estado of ['PAID', 'REJECTED', 'CANCELLED']) {
    assert.equal(esTerminal(estado), true, estado);
    assert.deepEqual(transicionesDesde(estado), [], `no se sale de ${estado}`);
  }
});

test('las transiciones prohibidas están prohibidas', () => {
  const imposibles = [
    ['PAID', 'REQUESTED'],
    ['PAID', 'REJECTED'],
    ['REJECTED', 'PAID'],
    ['REJECTED', 'APPROVED'],
    ['CANCELLED', 'PAID'],
    ['REQUESTED', 'PROCESSING'],
    ['REQUESTED', 'PAID'],
    ['UNDER_REVIEW', 'PAID'],
    ['UNDER_REVIEW', 'CANCELLED']
  ];
  for (const [desde, hacia] of imposibles) {
    assert.equal(evaluarTransicion(desde, hacia).permitida, false, `${desde} → ${hacia}`);
  }
});

test('pedir el estado en el que ya está se distingue de lo imposible', () => {
  // La diferencia importa: repetir es un reintento idempotente; lo imposible es
  // un error. Un motivo común para los dos los confundiría.
  const repetido = evaluarTransicion('APPROVED', 'APPROVED');
  assert.equal(repetido.permitida, false);
  assert.equal(repetido.motivo, 'YA_ESTA_EN_ESE_ESTADO');

  const imposible = evaluarTransicion('REJECTED', 'PAID');
  assert.equal(imposible.permitida, false);
  assert.notEqual(imposible.motivo, 'YA_ESTA_EN_ESE_ESTADO');
});

test('todos los estados del contrato están en la máquina', () => {
  // Si alguien añade un estado al contrato y no aquí, quedaría sin transiciones
  // definidas y esta prueba lo dice.
  for (const estado of WITHDRAWAL_STATUSES) {
    assert.doesNotThrow(() => esTerminal(estado), estado);
  }
  assert.equal(ESTADO_INICIAL, 'REQUESTED');
});

test('sólo los estados vivos mantienen dinero reservado', () => {
  for (const estado of ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING']) {
    assert.equal(mantieneFondosReservados(estado), true, estado);
  }
  for (const estado of ['PAID', 'REJECTED', 'CANCELLED']) {
    assert.equal(mantieneFondosReservados(estado), false, estado);
  }
});

test('marcar como pagado exige referencia; los demás estados no', () => {
  assert.equal(requiereReferenciaDePago('PAID'), true);
  for (const estado of ['APPROVED', 'PROCESSING', 'REJECTED', 'CANCELLED']) {
    assert.equal(requiereReferenciaDePago(estado), false, estado);
  }
});

// ---------------------------------------------------------------------------
// Métodos venezolanos
// ---------------------------------------------------------------------------

const CUENTA_VALIDA = {
  bankCode: '0102',
  bankName: 'Banco de Venezuela',
  accountType: 'CORRIENTE',
  accountNumber: '01020123456789012345',
  holderName: 'María Rodríguez',
  holderDocumentType: 'V',
  holderDocumentNumber: '12345678'
};

const PAGO_MOVIL_VALIDO = {
  bankCode: '0102',
  bankName: 'Banco de Venezuela',
  phone: '04141234567',
  holderName: 'María Rodríguez',
  holderDocumentType: 'V',
  holderDocumentNumber: '12345678'
};

test('una transferencia bancaria bien formada se acepta y se normaliza', () => {
  const resultado = validarMetodoDePago('BANK_TRANSFER', {
    ...CUENTA_VALIDA,
    accountNumber: '0102-0123-4567-8901-2345',
    holderDocumentNumber: 'V-12.345.678'
  });
  assert.equal(resultado.ok, true, resultado.ok ? '' : resultado.detalle);
  // Normalizado: dos personas que escriben la misma cuenta de formas distintas
  // acaban con el mismo dato guardado.
  assert.equal(resultado.datos.accountNumber, '01020123456789012345');
  assert.equal(resultado.datos.holderDocumentNumber, '12345678');
});

test('la cuenta debe empezar por el código de su banco', () => {
  // Es la comprobación que de verdad atrapa errores, y no necesita una lista de
  // bancos que se quedaría desactualizada. Una transferencia a la cuenta
  // equivocada no se deshace con un UPDATE.
  const resultado = validarMetodoDePago('BANK_TRANSFER', {
    ...CUENTA_VALIDA,
    bankCode: '0105'
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'CUENTA_NO_COINCIDE_CON_BANCO');
});

test('una cuenta venezolana tiene veinte dígitos, ni uno más ni uno menos', () => {
  for (const cuenta of ['0102012345678901234', '010201234567890123456', '']) {
    const resultado = validarMetodoDePago('BANK_TRANSFER', { ...CUENTA_VALIDA, accountNumber: cuenta });
    assert.equal(resultado.ok, false, cuenta);
    assert.equal(resultado.motivo, 'CUENTA_INVALIDA');
  }
});

test('Pago Móvil exige un móvil venezolano de verdad', () => {
  const bueno = validarMetodoDePago('PAGO_MOVIL', PAGO_MOVIL_VALIDO);
  assert.equal(bueno.ok, true, bueno.ok ? '' : bueno.detalle);
  assert.equal(bueno.datos.phone, '04141234567');

  // Fijo, longitud incorrecta y prefijo que no existe.
  for (const telefono of ['02611234567', '0414123456', '04991234567', '']) {
    const resultado = validarMetodoDePago('PAGO_MOVIL', { ...PAGO_MOVIL_VALIDO, phone: telefono });
    assert.equal(resultado.ok, false, telefono);
    assert.equal(resultado.motivo, 'TELEFONO_INVALIDO');
  }
});

test('un Pago Móvil no lleva número de cuenta, y una transferencia no lleva teléfono', () => {
  const movil = validarMetodoDePago('PAGO_MOVIL', PAGO_MOVIL_VALIDO);
  assert.equal(movil.ok, true);
  assert.equal('accountNumber' in movil.datos, false);

  const banco = validarMetodoDePago('BANK_TRANSFER', CUENTA_VALIDA);
  assert.equal(banco.ok, true);
  assert.equal('phone' in banco.datos, false);
});

test('NUNCA se acepta una credencial bancaria', () => {
  // Rechazar la operación entera, no ignorar el campo: descartarlo en silencio
  // deja a quien lo envió creyendo que guardamos su PIN, y a nadie mirándolo.
  const credenciales = [
    'password', 'clave', 'pin', 'otp', 'claveInternet', 'claveBanca',
    'securityAnswer', 'preguntaSeguridad', 'coordenadas', 'cvv', 'c2p'
  ];
  for (const campo of credenciales) {
    const resultado = validarMetodoDePago('PAGO_MOVIL', { ...PAGO_MOVIL_VALIDO, [campo]: 'lo-que-sea' });
    assert.equal(resultado.ok, false, campo);
    assert.equal(resultado.motivo, 'CREDENCIAL_PROHIBIDA', campo);
    // El detalle nombra el campo, nunca su valor.
    assert.equal(resultado.detalle.includes('lo-que-sea'), false, campo);
  }
});

test('el documento y el titular se validan', () => {
  assert.equal(
    validarMetodoDePago('PAGO_MOVIL', { ...PAGO_MOVIL_VALIDO, holderDocumentType: 'X' }).motivo,
    'DOCUMENTO_INVALIDO'
  );
  assert.equal(
    validarMetodoDePago('PAGO_MOVIL', { ...PAGO_MOVIL_VALIDO, holderDocumentNumber: '123' }).motivo,
    'DOCUMENTO_INVALIDO'
  );
  assert.equal(
    validarMetodoDePago('PAGO_MOVIL', { ...PAGO_MOVIL_VALIDO, holderName: 'M' }).motivo,
    'TITULAR_INVALIDO'
  );
  // Los cinco tipos venezolanos se aceptan.
  for (const tipo of ['V', 'E', 'J', 'G', 'P']) {
    const resultado = validarMetodoDePago('PAGO_MOVIL', { ...PAGO_MOVIL_VALIDO, holderDocumentType: tipo });
    assert.equal(resultado.ok, true, tipo);
  }
});

test('un tipo de método desconocido se rechaza', () => {
  for (const tipo of ['ZELLE', 'C2P', 'PAYPAL', '']) {
    assert.equal(validarMetodoDePago(tipo, PAGO_MOVIL_VALIDO).motivo, 'TIPO_DESCONOCIDO', tipo);
  }
});

// ---------------------------------------------------------------------------
// Enmascarado y registros
// ---------------------------------------------------------------------------

test('el identificador enmascarado no reconstruye la cuenta', () => {
  const banco = validarMetodoDePago('BANK_TRANSFER', CUENTA_VALIDA);
  const enmascarado = enmascararIdentificador(banco.datos);
  assert.equal(enmascarado, '****2345');
  assert.equal(enmascarado.includes('01020123456789'), false);

  const movil = validarMetodoDePago('PAGO_MOVIL', PAGO_MOVIL_VALIDO);
  const telefono = enmascararIdentificador(movil.datos);
  // Se deja ver el prefijo: identifica la operadora sin identificar a la persona.
  assert.equal(telefono, '0414****567');
  assert.equal(telefono.includes('04141234567'), false);
});

test('el documento enmascarado conserva el tipo y oculta el número', () => {
  assert.equal(enmascararDocumento('V', '12345678'), 'V-****678');
});

test('la forma para registros NO lleva ni un dato bancario', () => {
  // Es lo único que puede salir hacia un registro, Sentry o analítica.
  const banco = validarMetodoDePago('BANK_TRANSFER', CUENTA_VALIDA);
  const registro = paraRegistro('pm_123', banco.datos);
  const texto = JSON.stringify(registro);

  for (const secreto of ['01020123456789012345', '12345678', 'María Rodríguez']) {
    assert.equal(texto.includes(secreto), false, `no debe aparecer: ${secreto}`);
  }
  assert.deepEqual(Object.keys(registro).sort(), ['bankCode', 'methodId', 'type']);
});

// ---------------------------------------------------------------------------
// Banderas
// ---------------------------------------------------------------------------

test('todo está apagado por defecto', () => {
  const banderas = leerBanderas({});
  assert.equal(banderas.retirosHabilitados, false);
  assert.equal(banderas.retirosDeConductorHabilitados, false);
  assert.equal(evaluarDisponibilidad('passenger', banderas).disponible, false);
  assert.equal(evaluarDisponibilidad('driver', banderas).disponible, false);
});

test('sólo el literal «1» enciende una bandera', () => {
  // Un único valor aceptado significa que encender es deliberado y que nadie lo
  // hace por accidente escribiendo cualquier cosa.
  for (const valor of ['true', 'yes', 'si', 'on', 'TRUE', '0', '', 'enabled']) {
    const banderas = leerBanderas({ [BANDERA_RETIROS]: valor });
    assert.equal(banderas.retirosHabilitados, false, `«${valor}» no debe encender`);
  }
  assert.equal(leerBanderas({ [BANDERA_RETIROS]: '1' }).retirosHabilitados, true);
});

test('encender los retiros NO enciende los de conductor', () => {
  // Driver Finance sigue pausado: el saldo de un conductor depende de una
  // liquidación cuya corrección está en revisión.
  const banderas = leerBanderas({ [BANDERA_RETIROS]: '1' });
  assert.equal(evaluarDisponibilidad('passenger', banderas).disponible, true);

  const conductor = evaluarDisponibilidad('driver', banderas);
  assert.equal(conductor.disponible, false);
  assert.equal(conductor.motivo, 'RETIROS_DE_CONDUCTOR_DESHABILITADOS');
});

test('el conductor necesita LAS DOS banderas', () => {
  // Sólo la suya tampoco basta: si la general está apagada, no hay retiros.
  const soloConductor = leerBanderas({ [BANDERA_RETIROS_DE_CONDUCTOR]: '1' });
  assert.equal(evaluarDisponibilidad('driver', soloConductor).motivo, 'RETIROS_DESHABILITADOS');

  const ambas = leerBanderas({ [BANDERA_RETIROS]: '1', [BANDERA_RETIROS_DE_CONDUCTOR]: '1' });
  assert.equal(evaluarDisponibilidad('driver', ambas).disponible, true);
});
