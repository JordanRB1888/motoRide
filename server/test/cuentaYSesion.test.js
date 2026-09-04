import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADO_BORRADO,
  TABLAS_QUE_SE_BORRAN,
  expedienteAnonimizado,
  metodosDeEntrada,
  planDeBorrado,
  sePuedeDesvincular,
  tokenSigueValiendo,
  usuarioAnonimizado
} from '../domain/borradoDeCuenta.js';

/**
 * AUTH-FINAL-4: borrar la cuenta, invalidar sesiones y no dejar a nadie fuera
 * de su propia cuenta.
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que cambiar la contraseña eche de verdad a quien la sabía.
 * 2. Que borrar la cuenta destruya lo que identifica y CONSERVE lo que otras
 *    personas necesitan: un viaje tiene dos partes.
 * 3. Que nadie pueda quedarse sin puerta de entrada a su cuenta.
 * 4. Que el borrado no deje un estado a medias con acceso abierto.
 */

const AHORA = '2026-09-04T12:00:00.000Z';
const EN_SEGUNDOS = Math.floor(new Date(AHORA).getTime() / 1000);

// ---------------------------------------------------------------------------
// Invalidación de sesiones
// ---------------------------------------------------------------------------

test('sin marca de cambio, todo token sigue valiendo: nada caduca de más', () => {
  assert.equal(tokenSigueValiendo({}, EN_SEGUNDOS), true);
  assert.equal(tokenSigueValiendo({ credentialsChangedAt: null }, EN_SEGUNDOS), true);
  assert.equal(tokenSigueValiendo({ credentialsChangedAt: '' }, EN_SEGUNDOS), true);
});

test('un token firmado ANTES del cambio de credenciales deja de valer', () => {
  const usuario = { credentialsChangedAt: AHORA };
  assert.equal(tokenSigueValiendo(usuario, EN_SEGUNDOS - 3600), false, 'el de hace una hora');
  assert.equal(tokenSigueValiendo(usuario, EN_SEGUNDOS - 10), false);
  // El del mismo segundo tampoco vale: dentro de ese segundo no se puede saber
  // si se firmó antes o después, y el empate se resuelve del lado seguro.
  assert.equal(tokenSigueValiendo(usuario, EN_SEGUNDOS), false);
  assert.equal(tokenSigueValiendo(usuario, EN_SEGUNDOS + 60), true);
});

test('un token sin fecha de emisión no se invalida por si acaso', () => {
  const usuario = { credentialsChangedAt: AHORA };
  assert.equal(tokenSigueValiendo(usuario, undefined), true);
  assert.equal(tokenSigueValiendo(usuario, NaN), true);
});

test('el mecanismo no necesita Redis ni lista negra', () => {
  // Se apoya en que `requireAuth` ya recarga al usuario en cada petición: la
  // marca viaja con el usuario, no en una tabla aparte.
  assert.equal(typeof tokenSigueValiendo, 'function');
  assert.equal(tokenSigueValiendo({ credentialsChangedAt: AHORA }, EN_SEGUNDOS - 2), false);
  // Sin margen: aqui hubo uno de un segundo y AUTH-FINAL-5 lo quito. Ningun
  // camino firma un token en el segundo de la marca --el reinicio de
  // contrasena responde sin token--, asi que el margen solo dejaba vivo un
  // segundo justo al token que se queria echar.
  assert.equal(tokenSigueValiendo({ credentialsChangedAt: AHORA }, EN_SEGUNDOS - 1), false);
});

// ---------------------------------------------------------------------------
// Métodos de entrada y desvinculación
// ---------------------------------------------------------------------------

const conContrasena = { id: 'u1', passwordHash: '$2a$12$loquesea' };
const sinContrasena = { id: 'u2' };

test('la contraseña cuenta como método de entrada, igual que cada proveedor', () => {
  assert.deepEqual(
    metodosDeEntrada({ user: conContrasena, identidades: [{ provider: 'PASSWORD' }] }),
    { conContrasena: true, sociales: [], total: 1 }
  );
  assert.deepEqual(
    metodosDeEntrada({ user: conContrasena, identidades: [{ provider: 'PASSWORD' }, { provider: 'GOOGLE' }] }),
    { conContrasena: true, sociales: ['GOOGLE'], total: 2 }
  );
  assert.deepEqual(
    metodosDeEntrada({ user: sinContrasena, identidades: [{ provider: 'GOOGLE' }] }),
    { conContrasena: false, sociales: ['GOOGLE'], total: 1 }
  );
});

test('NO se puede quitar el último método: dejaría la cuenta sin puerta', () => {
  // Sólo Google, y quiere quitar Google.
  assert.equal(
    sePuedeDesvincular({ user: sinContrasena, identidades: [{ provider: 'GOOGLE' }], provider: 'GOOGLE' }),
    false
  );
  // Con contraseña además, sí puede.
  assert.equal(
    sePuedeDesvincular({
      user: conContrasena,
      identidades: [{ provider: 'PASSWORD' }, { provider: 'GOOGLE' }],
      provider: 'GOOGLE'
    }),
    true
  );
  // Dos sociales y ninguna contraseña: puede quitar una.
  assert.equal(
    sePuedeDesvincular({
      user: sinContrasena,
      identidades: [{ provider: 'GOOGLE' }, { provider: 'APPLE' }],
      provider: 'APPLE'
    }),
    true
  );
});

test('la contraseña no se «desvincula», y lo no vinculado no se puede quitar', () => {
  assert.equal(
    sePuedeDesvincular({ user: conContrasena, identidades: [{ provider: 'PASSWORD' }], provider: 'PASSWORD' }),
    false
  );
  assert.equal(
    sePuedeDesvincular({ user: conContrasena, identidades: [{ provider: 'PASSWORD' }], provider: 'GOOGLE' }),
    false,
    'no se puede quitar lo que no está'
  );
});

// ---------------------------------------------------------------------------
// Anonimizar
// ---------------------------------------------------------------------------

test('el usuario anonimizado no conserva NADA que identifique', () => {
  const anonimo = usuarioAnonimizado(
    {
      id: 'u1',
      role: 'driver',
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@x.co',
      phone: '+584141234567',
      photoStorageKey: 'fotos/ana.jpg',
      passwordHash: '$2a$12$x',
      rating: 4.8,
      totalTrips: 42,
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    AHORA
  );
  const serializado = JSON.stringify(anonimo);
  for (const rastro of ['Ana', 'Pérez', 'ana@x.co', '584141234567', 'fotos/ana.jpg', '$2a$12$x']) {
    assert.ok(!serializado.includes(rastro), `sigue ahí: ${rastro}`);
  }
  assert.equal(anonimo.accountStatus, ESTADO_BORRADO);
  assert.equal(anonimo.credentialsChangedAt, AHORA, 'el token anterior deja de valer');
  assert.equal(anonimo.passwordHash, null);
});

test('el id y el rol se CONSERVAN: los viajes y la contabilidad los referencian', () => {
  const anonimo = usuarioAnonimizado({ id: 'u1', role: 'driver', totalTrips: 42, walletBalance: 3.5 }, AHORA);
  assert.equal(anonimo.id, 'u1', 'borrar el id rompería los viajes de la otra parte');
  assert.equal(anonimo.role, 'driver');
  assert.equal(anonimo.totalTrips, 42);
  assert.equal(anonimo.walletBalance, 3.5, 'el saldo es contabilidad, no identidad');
});

test('el expediente conserva su decisión y pierde los datos personales', () => {
  const anonimo = expedienteAnonimizado(
    {
      id: 'app1',
      userId: 'u1',
      status: 'approved',
      personal: { firstName: 'Ana', lastName: 'Pérez', idNumber: 'V-12345678' },
      vehicle: { type: 'MOTO', plate: 'AB123CD' },
      submittedAt: '2026-02-01T00:00:00.000Z'
    },
    AHORA
  );
  assert.equal(anonimo.status, 'approved', 'la decisión es auditoría');
  assert.equal(anonimo.submittedAt, '2026-02-01T00:00:00.000Z');
  assert.equal(anonimo.personal, null);
  assert.equal(anonimo.vehicle.plate, null, 'la placa identifica un vehículo real');
  assert.equal(anonimo.vehicle.type, 'MOTO');
  assert.ok(!JSON.stringify(anonimo).includes('V-12345678'));
});

// ---------------------------------------------------------------------------
// El plan de borrado
// ---------------------------------------------------------------------------

function baseConUsuario() {
  return {
    users: [{ id: 'u1', role: 'driver', email: 'ana@x.co', photoStorageKey: 'fotos/ana.jpg', accountStatus: 'ACTIVE' }],
    authIdentities: [{ id: 'i1', userId: 'u1', provider: 'PASSWORD' }, { id: 'i2', userId: 'otro', provider: 'GOOGLE' }],
    verifiedContacts: [{ id: 'c1', userId: 'u1', type: 'EMAIL' }],
    authChallenges: [{ id: 'ch1', userId: 'u1' }],
    pushSubscriptions: [{ id: 'p1', userId: 'u1' }],
    notifications: [{ id: 'n1', userId: 'u1' }],
    driverDocuments: [
      { id: 'd1', userId: 'u1', storageKey: 'docs/cedula.jpg' },
      { id: 'd2', userId: 'u1', storageKey: 'docs/video.mp4' },
      { id: 'd3', userId: 'otro', storageKey: 'docs/ajeno.jpg' }
    ],
    driverApplications: [{ id: 'a1', userId: 'u1', status: 'approved', personal: { firstName: 'Ana' } }],
    trips: [{ id: 't1', passengerId: 'otro', driverId: 'u1' }],
    transactions: [{ id: 'tx1', userId: 'u1' }]
  };
}

test('el plan recoge TODOS los ficheros privados: foto, documentos y vídeo', () => {
  const plan = planDeBorrado({ database: baseConUsuario(), userId: 'u1', ahora: AHORA });
  assert.equal(plan.existe, true);
  assert.equal(plan.yaBorrada, false);
  assert.deepEqual(plan.ficherosABorrar.sort(), ['docs/cedula.jpg', 'docs/video.mp4', 'fotos/ana.jpg']);
  // Y NO el de otra persona.
  assert.ok(!plan.ficherosABorrar.includes('docs/ajeno.jpg'));
});

test('el plan cuenta lo que hay, y lo que se conserva también', () => {
  const plan = planDeBorrado({ database: baseConUsuario(), userId: 'u1', ahora: AHORA });
  assert.equal(plan.cuantos.identidades, 1);
  assert.equal(plan.cuantos.contactos, 1);
  assert.equal(plan.cuantos.desafios, 1);
  assert.equal(plan.cuantos.documentos, 2);
  // Estos NO se borran: se cuentan para poder decir qué queda.
  assert.equal(plan.cuantos.viajes, 1);
  assert.equal(plan.cuantos.transacciones, 1);
});

test('una cuenta ya borrada se reconoce: el borrado es idempotente', () => {
  const database = baseConUsuario();
  database.users[0].accountStatus = ESTADO_BORRADO;
  const plan = planDeBorrado({ database, userId: 'u1', ahora: AHORA });
  assert.equal(plan.existe, true);
  assert.equal(plan.yaBorrada, true);
});

test('una cuenta que no existe no da un plan', () => {
  assert.deepEqual(planDeBorrado({ database: baseConUsuario(), userId: 'nadie', ahora: AHORA }), { existe: false });
});

test('las tablas que se borran son las que identifican, y ninguna más', () => {
  assert.deepEqual([...TABLAS_QUE_SE_BORRAN].sort(), [
    'authChallenges', 'authIdentities', 'notifications', 'pushSubscriptions', 'verifiedContacts'
  ]);
  // Lo que NO está en la lista, y es deliberado: son de otras personas o son
  // contabilidad y auditoría.
  for (const conservada of ['trips', 'transactions', 'adminActions', 'messages', 'supportMessages']) {
    assert.ok(!TABLAS_QUE_SE_BORRAN.includes(conservada), `${conservada} no puede borrarse`);
  }
});
