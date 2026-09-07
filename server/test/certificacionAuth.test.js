import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createAuthRouter } from '../routes/auth.js';
import { createAuthIdentityStore } from '../services/authIdentityStore.js';
import { createVerificationService } from '../services/verificationChallenges.js';
import { crearProveedores } from '../services/verificationProviders.js';
import { crearVerificadorSocial } from '../services/socialTokenVerifier.js';
import { tokenSigueValiendo } from '../domain/borradoDeCuenta.js';

/**
 * AUTH-FINAL-5: certificación. Los casos que sólo aparecen cuando dos cosas
 * pasan a la vez, o cuando algo falla a mitad.
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que nadie se quede sin ninguna forma de entrar por pedir dos cosas a la
 *    vez.
 * 2. Que un borrado interrumpido no deje una cuenta accesible a medias.
 * 3. Que no haya una ventana de un segundo en la que un token que debería
 *    estar muerto siga valiendo.
 */

const JWT_SECRET = 'secreto-de-certificacion-0123456789abcdef';
const GOOGLE_AUD = 'plus58express-google-client-id';

// La firma se verifica DE VERDAD contra este JWKS. Lo único que cambia
// respecto a producción es quién emitió la clave.
const claveDeGoogle = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS = {
  GOOGLE: {
    keys: [{ ...claveDeGoogle.publicKey.export({ format: 'jwk' }), kid: 'g1', alg: 'RS256', use: 'sig' }]
  }
};
const tokenDeGoogle = ({ sub, email }) => jwt.sign(
  { sub, ...(email ? { email, email_verified: true } : {}) },
  claveDeGoogle.privateKey,
  { algorithm: 'RS256', keyid: 'g1', issuer: 'https://accounts.google.com', audience: GOOGLE_AUD, expiresIn: '5m' }
);

async function montar(t, { fallarPersistencia = () => false, storage = null } = {}) {
  const database = {
    users: [], authIdentities: [], verifiedContacts: [], authChallenges: [],
    pushSubscriptions: [], notifications: [], driverDocuments: [], driverApplications: [],
    trips: [], transactions: []
  };
  const identidad = createAuthIdentityStore({ database });
  const verificacion = createVerificationService({
    database, secreto: JWT_SECRET, proveedores: crearProveedores({ env: {} })
  });
  const verificadorSocial = crearVerificadorSocial({
    env: { GOOGLE_OAUTH_CLIENT_IDS: GOOGLE_AUD },
    obtenerJwks: async provider => JWKS[provider] ?? { keys: [] }
  });
  const signToken = user => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  const publicUser = user => { const { passwordHash, ...resto } = user; return resto; };
  const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = database.users.find(u => u.id === payload.sub);
      if (!user) return res.status(401).json({ error: 'INVALID_SESSION' });
      if (user.accountStatus === 'DELETED') return res.status(401).json({ error: 'INVALID_SESSION' });
      if (!tokenSigueValiendo(user, payload.iat)) return res.status(401).json({ error: 'SESSION_EXPIRED' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'INVALID_SESSION' });
    }
  };
  const sesionOpcional = (req, _res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = database.users.find(u => u.id === payload.sub);
        if (user && user.accountStatus === 'ACTIVE') req.user = user;
      } catch { /* visitante */ }
    }
    next();
  };
  const pasa = (_req, _res, next) => next();
  const app = express();
  app.use(express.json());
  app.use('/api', createAuthRouter({
    database,
    persistDatabase: async () => !fallarPersistencia(),
    publicUser,
    signToken,
    requireAuth,
    sesionOpcional,
    identidad,
    verificacion,
    verificadorSocial,
    limitadores: { desafio: pasa, verificacion: pasa, social: pasa, identidades: pasa, borrado: pasa },
    bcrypt,
    sanitizeText: (v, m) => String(v ?? '').trim().slice(0, m),
    privateStorage: storage
  }));
  // Bloque propio, detrás del de otpEndpoints (26900-27298).
  const port = 27300 + Math.floor(Math.random() * 399);
  const server = await new Promise(r => { const s = app.listen(port, '127.0.0.1', () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const api = `http://127.0.0.1:${port}/api`;
  const pedir = async (ruta, { metodo = 'GET', cuerpo, token } = {}) => {
    const r = await fetch(`${api}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    return { status: r.status, cuerpo: await r.json().catch(() => null) };
  };

  /** Crea un usuario con los métodos que se le digan. */
  const crear = async ({ conContrasena = true, sociales = [], documentos = [] } = {}) => {
    const user = {
      id: `passenger_${database.users.length + 1}`,
      role: 'passenger',
      firstName: 'Ana',
      lastName: 'Prueba',
      email: `ana${database.users.length}@x.co`,
      accountStatus: 'ACTIVE',
      ...(conContrasena ? { passwordHash: await bcrypt.hash('ClaveSegura123', 4) } : {})
    };
    database.users.push(user);
    if (conContrasena) identidad.identidades.asegurarDeContrasena(user);
    for (const provider of sociales) {
      identidad.identidades.crear({ userId: user.id, provider, providerSubject: `${provider}-${user.id}` });
    }
    for (const clave of documentos) {
      database.driverDocuments.push({ id: `doc_${clave}`, userId: user.id, storageKey: clave });
    }
    return { user, token: signToken(user) };
  };

  return { database, identidad, pedir, crear };
}

// ---------------------------------------------------------------------------
// Desvinculación concurrente — el caso obligatorio
// ---------------------------------------------------------------------------

test('dos unlink SIMULTÁNEOS no pueden dejar la cuenta sin ninguna forma de entrar', async t => {
  const { database, pedir, crear } = await montar(t);
  // El caso peligroso: SIN contraseña y con dos sociales. Cada petición, por
  // separado, es legítima —quedaría una—; las dos a la vez dejarían cero.
  const { token } = await crear({ conContrasena: false, sociales: ['GOOGLE', 'APPLE'] });

  const [a, b] = await Promise.all([
    pedir('/auth/identities/google', { metodo: 'DELETE', token }),
    pedir('/auth/identities/apple', { metodo: 'DELETE', token })
  ]);

  const quedan = database.authIdentities.length;
  assert.ok(quedan >= 1, `la cuenta se quedó sin puerta: ${quedan} métodos`);
  // Una prospera y la otra recibe el conflicto.
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const rechazada = [a, b].find(r => r.status === 409);
  assert.equal(rechazada.cuerpo.error, 'LAST_AUTH_METHOD');
});

test('con contraseña, quitar las dos sociales a la vez sí es seguro', async t => {
  const { database, pedir, crear } = await montar(t);
  const { token } = await crear({ conContrasena: true, sociales: ['GOOGLE', 'APPLE'] });
  const [a, b] = await Promise.all([
    pedir('/auth/identities/google', { metodo: 'DELETE', token }),
    pedir('/auth/identities/apple', { metodo: 'DELETE', token })
  ]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  // Queda la contraseña: la cuenta sigue teniendo puerta.
  assert.equal(database.authIdentities.filter(i => i.provider === 'PASSWORD').length, 1);
});

test('el mismo unlink dos veces: uno lo quita y el otro dice que no está', async t => {
  const { pedir, crear } = await montar(t);
  const { token } = await crear({ conContrasena: true, sociales: ['GOOGLE'] });
  const [a, b] = await Promise.all([
    pedir('/auth/identities/google', { metodo: 'DELETE', token }),
    pedir('/auth/identities/google', { metodo: 'DELETE', token })
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 404]);
});

// ---------------------------------------------------------------------------
// Borrado: inyección de fallos
// ---------------------------------------------------------------------------

test('si la persistencia falla, la cuenta queda ENTERA y accesible', async t => {
  let fallar = true;
  const { database, pedir, crear } = await montar(t, { fallarPersistencia: () => fallar });
  const { user, token } = await crear({
    conContrasena: true,
    sociales: ['GOOGLE'],
    documentos: ['docs/cedula.jpg', 'docs/video.mp4']
  });
  const identidadesAntes = database.authIdentities.length;
  const documentosAntes = database.driverDocuments.length;

  const fallido = await pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } });
  assert.equal(fallido.status, 503);
  assert.equal(fallido.cuerpo.error, 'DATABASE_WRITE_FAILED');

  // NADA se quedó a medias: ni el usuario, ni sus identidades, ni sus papeles.
  const vivo = database.users.find(u => u.id === user.id);
  assert.equal(vivo.accountStatus, 'ACTIVE', 'la cuenta quedó marcada como borrada sin estarlo');
  assert.equal(vivo.email, user.email, 'se anonimizó a medias');
  assert.ok(typeof vivo.passwordHash === 'string' && vivo.passwordHash !== '', 'perdió su contraseña');
  assert.equal(database.authIdentities.length, identidadesAntes);
  assert.equal(database.driverDocuments.length, documentosAntes);

  // Y sigue pudiendo entrar: no queda a medio borrar con la puerta abierta.
  assert.equal((await pedir('/auth/methods', { token })).status, 200);

  // Reintentar cuando la escritura vuelve a funcionar sí borra.
  fallar = false;
  const bueno = await pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } });
  assert.equal(bueno.status, 200);
  assert.equal(database.users.find(u => u.id === user.id).accountStatus, 'DELETED');
});

test('los ficheros privados se borran DESPUÉS de que el borrado esté en disco', async t => {
  const borrados = [];
  let fallar = true;
  const { pedir, crear } = await montar(t, {
    fallarPersistencia: () => fallar,
    storage: { remove: clave => borrados.push(clave) }
  });
  const { token } = await crear({ documentos: ['docs/cedula.jpg', 'docs/video.mp4'] });

  await pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } });
  assert.deepEqual(borrados, [], 'se borraron ficheros de una cuenta que sigue viva');

  fallar = false;
  await pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } });
  assert.deepEqual(borrados.sort(), ['docs/cedula.jpg', 'docs/video.mp4']);
});

test('un fichero que no se puede borrar no deja la cuenta a medias', async t => {
  const intentados = [];
  const { database, pedir, crear } = await montar(t, {
    storage: {
      remove: clave => {
        intentados.push(clave);
        // El primero revienta: un fichero que ya no está, un permiso, lo que sea.
        if (clave === 'docs/cedula.jpg') throw new Error('EACCES');
      }
    }
  });
  const { user, token } = await crear({ documentos: ['docs/cedula.jpg', 'docs/video.mp4'] });

  const borrado = await pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } });
  // La cuenta ESTÁ borrada: el estado que importa ya está en disco.
  assert.equal(borrado.status, 200);
  assert.equal(database.users.find(u => u.id === user.id).accountStatus, 'DELETED');
  // Y se intentaron TODOS los ficheros, no sólo hasta el que falló.
  assert.deepEqual(intentados.sort(), ['docs/cedula.jpg', 'docs/video.mp4']);
  // El token ya no vale, que es lo que impide un estado accesible a medias.
  assert.equal((await pedir('/auth/methods', { token })).status, 401);
});

test('sin almacenamiento privado montado, el borrado no revienta', async t => {
  const { pedir, crear } = await montar(t, { storage: null });
  const { token } = await crear({ documentos: ['docs/cedula.jpg'] });
  const borrado = await pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } });
  assert.equal(borrado.status, 200);
});

test('borrar dos veces a la vez: ninguna deja estado inconsistente', async t => {
  const { database, pedir, crear } = await montar(t);
  const { user, token } = await crear({ sociales: ['GOOGLE'] });
  const [a, b] = await Promise.all([
    pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } }),
    pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } })
  ]);
  // Sólo una hace el trabajo. La otra llega y encuentra la puerta cerrada:
  // 409 si pilla el borrado a mitad, 200 si ya había terminado.
  assert.ok([a.status, b.status].includes(200));
  assert.ok([a.status, b.status].every(c => [200, 409].includes(c)), `${a.status}/${b.status}`);
  // Un solo usuario, borrado una sola vez, sin identidades sueltas.
  assert.equal(database.users.filter(u => u.id === user.id).length, 1);
  assert.equal(database.users.find(u => u.id === user.id).accountStatus, 'DELETED');
  assert.equal(database.authIdentities.filter(i => i.userId === user.id).length, 0);
});

test('un borrado que falla no puede RESUCITAR a la cuenta que otro ya borró', async t => {
  // El cruce peligroso: dos borrados a la vez, uno escribe bien y el otro no.
  // El que falla restaura su instantánea --tomada cuando la cuenta estaba
  // entera-- y devolvería a la vida, en memoria, una cuenta que en disco ya
  // está borrada: con sus credenciales y autenticable, porque `requireAuth`
  // lee de memoria. La reserva síncrona impide que las dos entren.
  let llamadas = 0;
  const { database, pedir, crear } = await montar(t, {
    // La primera escritura va bien; la segunda falla.
    fallarPersistencia: () => { llamadas += 1; return llamadas > 1; }
  });
  const { user, token } = await crear({ conContrasena: true, sociales: ['GOOGLE'] });

  await Promise.all([
    pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } }),
    pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } })
  ]);

  const final = database.users.find(u => u.id === user.id);
  assert.equal(final.accountStatus, 'DELETED', 'la cuenta volvió a la vida');
  assert.equal(final.passwordHash, null, 'resucitó con su contraseña intacta');
  assert.equal(database.authIdentities.filter(i => i.userId === user.id).length, 0);
  // Y sobre todo: no se puede volver a entrar.
  assert.equal((await pedir('/auth/methods', { token })).status, 401);
});

// ---------------------------------------------------------------------------
// La cuenta borrada
// ---------------------------------------------------------------------------

test('una cuenta borrada no conserva credenciales ni contactos, y sus viajes sí', async t => {
  const { database, pedir, crear } = await montar(t);
  const { user, token } = await crear({ sociales: ['GOOGLE'] });
  database.trips.push({ id: 't1', passengerId: user.id, driverId: 'otro' });
  database.transactions.push({ id: 'tx1', userId: user.id, amount: 3.5 });
  database.verifiedContacts.push({ id: 'c1', userId: user.id, type: 'EMAIL', valueNormalized: 'ana0@x.co' });

  await pedir('/auth/account/delete', { metodo: 'POST', token, cuerpo: { password: 'ClaveSegura123' } });

  assert.equal(database.authIdentities.filter(i => i.userId === user.id).length, 0, 'credenciales fuera');
  assert.equal(database.verifiedContacts.filter(c => c.userId === user.id).length, 0, 'contactos fuera');
  // Lo que es de otras personas o es contabilidad, se queda.
  assert.equal(database.trips.length, 1, 'el viaje también es del conductor');
  assert.equal(database.transactions.length, 1, 'la contabilidad no se borra');
  assert.equal(database.trips[0].passengerId, user.id, 'la referencia sigue, ya anonimizada');
});

// ---------------------------------------------------------------------------
// La ventana del mismo segundo
// ---------------------------------------------------------------------------

test('no queda ninguna ventana temporal: un token del mismo segundo del cambio no vale', () => {
  const cambiadas = '2026-09-04T12:00:00.000Z';
  const enSegundos = Math.floor(new Date(cambiadas).getTime() / 1000);
  // El caso que importa: el token se firmó en el MISMO segundo en que se
  // cambiaron las credenciales. Antes valía por el margen; ahora no.
  assert.equal(tokenSigueValiendo({ credentialsChangedAt: cambiadas }, enSegundos), false);
  assert.equal(tokenSigueValiendo({ credentialsChangedAt: cambiadas }, enSegundos - 1), false);
  // Un token posterior sí vale.
  assert.equal(tokenSigueValiendo({ credentialsChangedAt: cambiadas }, enSegundos + 1), true);
  // Y sin marca, todo sigue valiendo.
  assert.equal(tokenSigueValiendo({}, enSegundos), true);
});

// ---------------------------------------------------------------------------
// Vinculación concurrente
// ---------------------------------------------------------------------------

test('dos entradas sociales SIMULTÁNEAS con el mismo sub crean una sola cuenta', async t => {
  const { database, pedir } = await montar(t);
  // La verificación del token es asíncrona: las dos peticiones pueden pasar
  // ese await antes de que ninguna haya creado nada, y ver la identidad libre.
  const token = tokenDeGoogle({ sub: 'sub-concurrente-1', email: 'ana@x.co' });
  const [a, b] = await Promise.all([
    pedir('/auth/social/google', { metodo: 'POST', cuerpo: { token } }),
    pedir('/auth/social/google', { metodo: 'POST', cuerpo: { token } })
  ]);

  assert.equal(
    database.authIdentities.filter(i => i.providerSubject === 'sub-concurrente-1').length, 1,
    'una sola identidad para un sub'
  );
  assert.equal(database.users.length, 1, 'quedó una cuenta huérfana de la petición que perdió');
  // Los desenlaces legítimos son tres, según cómo se crucen: 201 crea la
  // cuenta, 200 entra en la que la otra acaba de crear, 409 choca contra la
  // unicidad. Lo que NUNCA puede pasar es que las dos creen, y alguna tiene
  // que haber creado.
  const codigos = [a.status, b.status].sort();
  assert.ok(codigos.includes(201), `nadie creó la cuenta: ${codigos}`);
  assert.ok(codigos.every(c => [200, 201, 409].includes(c)), `desenlace inesperado: ${codigos}`);
  const perdedora = [a, b].find(r => r.status === 409);
  if (perdedora) assert.equal(perdedora.cuerpo.error, 'IDENTITY_TAKEN');
});

test('dos vinculaciones SIMULTÁNEAS del mismo sub dejan una sola identidad', async t => {
  const { database, pedir, crear } = await montar(t);
  const { user, token: sesion } = await crear({ conContrasena: true });
  const social = tokenDeGoogle({ sub: 'sub-concurrente-2' });
  const [a, b] = await Promise.all([
    pedir('/auth/identities/link/google', { metodo: 'POST', token: sesion, cuerpo: { token: social } }),
    pedir('/auth/identities/link/google', { metodo: 'POST', token: sesion, cuerpo: { token: social } })
  ]);

  const suyas = database.authIdentities.filter(i => i.userId === user.id && i.provider === 'GOOGLE');
  assert.equal(suyas.length, 1, 'la misma cuenta acabó con el proveedor duplicado');
  assert.ok([a.status, b.status].includes(200));
});

test('dos cuentas reclamando el mismo sub a la vez: una lo consigue, la otra no', async t => {
  const { database, pedir, crear } = await montar(t);
  const primera = await crear({ conContrasena: true });
  const segunda = await crear({ conContrasena: true });
  const social = tokenDeGoogle({ sub: 'sub-disputado' });

  const [a, b] = await Promise.all([
    pedir('/auth/identities/link/google', { metodo: 'POST', token: primera.token, cuerpo: { token: social } }),
    pedir('/auth/identities/link/google', { metodo: 'POST', token: segunda.token, cuerpo: { token: social } })
  ]);

  const conEseSub = database.authIdentities.filter(i => i.providerSubject === 'sub-disputado');
  assert.equal(conEseSub.length, 1, 'el mismo Google quedó vinculado a dos cuentas distintas');
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal([a, b].find(r => r.status === 409).cuerpo.error, 'IDENTITY_TAKEN');
});

test('el correo de Google NO fusiona cuentas por sí solo', async t => {
  const { pedir, crear } = await montar(t);
  // AUTO_MERGE_BY_EMAIL está en NO de forma permanente: que Google diga que
  // ese correo es suyo no prueba que sea la misma persona de la cuenta local.
  const { user } = await crear({ conContrasena: true });
  const social = tokenDeGoogle({ sub: 'sub-mismo-correo', email: user.email });
  const r = await pedir('/auth/social/google', { metodo: 'POST', cuerpo: { token: social } });
  assert.equal(r.status, 409);
  assert.equal(r.cuerpo.error, 'ACCOUNT_LINK_REQUIRED');
});
