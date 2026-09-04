/**
 * AUTH-FINAL-1: las rutas nuevas de identidad. Conviven con el login y el
 * registro de `index.js`, que no cambian: esto se monta AL LADO, no encima.
 *
 *   POST /auth/verification/send       pedir un codigo (WhatsApp, SMS, correo)
 *   POST /auth/verification/verify     comprobarlo y aplicar su proposito
 *   POST /auth/social/:provider        entrar o crear cuenta con Google/Apple
 *   POST /auth/identities/link/:provider   vincular un proveedor a la sesion
 *   GET  /auth/identities              que proveedores y contactos tiene uno
 *
 * SIN ENUMERACION DE CUENTAS
 *
 * Pedir un codigo responde igual exista o no una cuenta con ese destino. Lo
 * unico que distingue destinos es la posesion demostrada: DESPUES de escribir
 * el codigo correcto, y solo entonces, se puede decir «no hay cuenta con este
 * telefono».
 *
 * EL ROL NO SE TOCA
 *
 * Un User creado desde Google o Apple nace pasajero, como el del registro. No
 * hay campo del cuerpo que lo cambie. Nada de este fichero escribe `role`
 * salvo esa constante.
 *
 * NADA DE ESTO SE REGISTRA: ni codigos, ni tokens de proveedor, ni cabeceras
 * Authorization. Los errores llegan al cliente como codigos, no como texto de
 * la excepcion.
 */
import express from 'express';
import crypto from 'node:crypto';
import { identityKey } from '../services/httpRateLimit.js';
import { PROPOSITOS, TIPO_DE_CONTACTO_POR_CANAL, RESULTADO } from '../domain/otpChallenge.js';
import { normalizarCorreo, normalizarTelefono, valorNormalizadoDeContacto } from '../domain/contactos.js';
import { contactoPublico, identidadPublica } from '../domain/authIdentity.js';
import { DECISION, ROL_DE_USUARIO_SOCIAL_NUEVO, decidirVinculacion } from '../domain/accountLinking.js';

/** Los propositos que solo tienen sentido con sesion. */
const PROPOSITOS_CON_SESION = Object.freeze(['CHANGE_PHONE', 'CHANGE_EMAIL', 'ACCOUNT_LINK', 'SENSITIVE_ACTION']);

const PROVEEDOR_POR_RUTA = Object.freeze({ google: 'GOOGLE', apple: 'APPLE' });

function respuestaDeVerificacionFallida(res, resultado, desafio) {
  if (resultado === RESULTADO.VENCIDO) return res.status(400).json({ error: 'CODE_EXPIRED' });
  if (resultado === RESULTADO.AGOTADO) return res.status(400).json({ error: 'CODE_EXHAUSTED' });
  const attemptsLeft =
    resultado === RESULTADO.CODIGO_INCORRECTO && desafio ? Math.max(0, desafio.maxAttempts - desafio.attempts) : undefined;
  return res.status(400).json(attemptsLeft === undefined ? { error: 'INVALID_CODE' } : { error: 'INVALID_CODE', attemptsLeft });
}

export function createAuthRouter({
  database,
  persistDatabase,
  publicUser,
  signToken,
  requireAuth,
  sesionOpcional,
  identidad,
  verificacion,
  verificadorSocial,
  limitadores,
  bcrypt,
  sanitizeText
}) {
  const router = express.Router();

  async function persistir(res) {
    if (await persistDatabase()) return true;
    res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
    return false;
  }

  /** El User activo cuyo correo o telefono es ese destino, o null. */
  function usuarioPorDestino(tipo, destino) {
    if (tipo === 'EMAIL') return database.users.find(u => normalizarCorreo(u.email) === destino) ?? null;
    return database.users.find(u => u.phone && normalizarTelefono(u.phone).e164 === destino) ?? null;
  }

  // ---------------------------------------------------------------------
  // Codigos
  // ---------------------------------------------------------------------

  router.post('/auth/verification/send', sesionOpcional, limitadores.desafio, async (req, res) => {
    const { channel, destination, purpose } = req.body ?? {};
    if (!PROPOSITOS.includes(purpose)) return res.status(400).json({ error: 'INVALID_PURPOSE' });
    const conSesion = PROPOSITOS_CON_SESION.includes(purpose);
    if (conSesion && !req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    const resultado = await verificacion.sendVerification({
      channel,
      destination,
      purpose,
      userId: conSesion ? req.user.id : null,
      origen: identityKey(req)
    });

    if (!resultado.ok) {
      if (resultado.error === 'RESEND_COOLDOWN' || resultado.error === 'RATE_LIMITED') {
        res.set('Retry-After', String(Math.ceil(resultado.retryAfterMs / 1000)));
        return res.status(429).json({ error: resultado.error, retryAfterMs: resultado.retryAfterMs });
      }
      if (resultado.error === 'VERIFICATION_PROVIDER_NOT_CONFIGURED' || resultado.error === 'VERIFICATION_SEND_FAILED') {
        return res.status(503).json({ error: resultado.error });
      }
      return res.status(400).json({ error: resultado.error });
    }
    if (!await persistir(res)) return;
    res.status(202).json({ status: 'sent', ...resultado.desafio });
  });

  router.post('/auth/verification/verify', sesionOpcional, limitadores.verificacion, async (req, res) => {
    const { challengeId, code, purpose, newPassword } = req.body ?? {};
    if (!PROPOSITOS.includes(purpose)) return res.status(400).json({ error: 'INVALID_PURPOSE' });
    const conSesion = PROPOSITOS_CON_SESION.includes(purpose);
    if (conSesion && !req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    if (typeof challengeId !== 'string' || typeof code !== 'string') return res.status(400).json({ error: 'INVALID_CODE' });

    // PASSWORD_RESET necesita la contrasena nueva ANTES de gastar el codigo:
    // un codigo consumido por una peticion invalida obligaria a pedir otro.
    let hashNuevo = null;
    if (purpose === 'PASSWORD_RESET') {
      if (String(newPassword || '').length < 8) {
        return res.status(400).json({ error: 'VALIDATION_FAILED', fields: { newPassword: 'La contraseña debe tener al menos 8 caracteres.' } });
      }
      hashNuevo = await bcrypt.hash(String(newPassword), 12);
    }

    const { ok, resultado, desafio } = verificacion.verifyChallenge({
      challengeId,
      code,
      esperado: { purpose, userId: conSesion ? req.user.id : null }
    });
    if (!ok) {
      // Un intento fallido tambien se guarda: es lo que hace real el limite.
      if (desafio && !await persistir(res)) return;
      return respuestaDeVerificacionFallida(res, resultado, desafio);
    }

    const tipo = TIPO_DE_CONTACTO_POR_CANAL[desafio.channel];
    const destino = desafio.destination;

    // A partir de aqui la posesion esta demostrada: se aplica el proposito.
    if (purpose === 'SIGNUP') {
      if (!await persistir(res)) return;
      return res.json({ status: 'verified', purpose, channel: desafio.channel });
    }

    if (purpose === 'LOGIN' || purpose === 'PASSWORD_RESET') {
      const user = usuarioPorDestino(tipo, destino);
      if (!user) {
        if (!await persistir(res)) return;
        return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND' });
      }
      if (user.accountStatus === 'DISABLED') {
        if (!await persistir(res)) return;
        return res.status(403).json({ error: 'ACCOUNT_DISABLED' });
      }
      const marcado = identidad.contactos.marcarVerificado({ userId: user.id, type: tipo, valueNormalized: destino });
      if (!marcado.ok) {
        if (!await persistir(res)) return;
        return res.status(409).json({ error: 'CONTACT_TAKEN' });
      }
      if (tipo === 'PHONE') user.phoneVerified = true;
      if (tipo === 'EMAIL') user.emailVerified = true;
      if (purpose === 'PASSWORD_RESET') {
        user.passwordHash = hashNuevo;
        user.updatedAt = new Date().toISOString();
        identidad.identidades.asegurarDeContrasena(user);
      }
      if (!await persistir(res)) return;
      if (purpose === 'PASSWORD_RESET') return res.json({ status: 'password_reset' });
      const { identidad: dePassword } = identidad.identidades.asegurarDeContrasena(user);
      identidad.identidades.marcarUso(dePassword);
      return res.json({ status: 'success', user: publicUser(user), token: signToken(user) });
    }

    // Con sesion: el contacto pasa a ser del User de la sesion, y si es un
    // cambio, se aplica. El contacto NUEVO se verifico primero; el antiguo no
    // se toca hasta este punto.
    const user = req.user;
    const marcado = identidad.contactos.marcarVerificado({ userId: user.id, type: tipo, valueNormalized: destino });
    if (!marcado.ok) {
      if (!await persistir(res)) return;
      return res.status(409).json({ error: 'CONTACT_TAKEN' });
    }
    if (purpose === 'CHANGE_PHONE' || purpose === 'CHANGE_EMAIL') {
      const otro = usuarioPorDestino(tipo, destino);
      if (otro && otro.id !== user.id) {
        if (!await persistir(res)) return;
        return res.status(409).json({ error: 'USER_EXISTS' });
      }
      if (purpose === 'CHANGE_PHONE') {
        user.phone = destino;
        user.phoneVerified = true;
      } else {
        user.email = destino;
        user.emailVerified = true;
      }
      user.updatedAt = new Date().toISOString();
    } else if (tipo === 'PHONE') {
      user.phoneVerified = true;
    } else {
      user.emailVerified = true;
    }
    if (!await persistir(res)) return;
    res.json({ status: 'verified', purpose, channel: desafio.channel, user: publicUser(user) });
  });

  // ---------------------------------------------------------------------
  // Google y Apple
  // ---------------------------------------------------------------------

  /**
   * El corazon compartido de entrar con un proveedor y de vincularlo. Con
   * `exigirSesion` la ruta es la de vincular: sin sesion, 401.
   */
  async function conProveedor(req, res, { exigirSesion }) {
    const provider = PROVEEDOR_POR_RUTA[String(req.params.provider || '').toLowerCase()];
    if (!provider) return res.status(404).json({ error: 'UNKNOWN_PROVIDER' });
    if (exigirSesion && !req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    const token = req.body?.token ?? req.body?.idToken ?? req.body?.identityToken;
    const verificado = await verificadorSocial.verificar(provider, token);
    if (verificado.configurado === false) return res.status(503).json({ error: 'SOCIAL_PROVIDER_NOT_CONFIGURED', provider });
    if (!verificado.ok) return res.status(401).json({ error: 'INVALID_PROVIDER_TOKEN' });

    const identidadExistente = identidad.identidades.buscar(provider, verificado.subject);
    const usuarioPorCorreo = verificado.email ? usuarioPorDestino('EMAIL', verificado.email) : null;
    const { decision, userId } = decidirVinculacion({
      identidadExistente,
      usuarioDeSesion: req.user ?? null,
      usuarioPorCorreo
    });

    if (decision === DECISION.CONFLICT) return res.status(409).json({ error: 'IDENTITY_TAKEN' });
    if (decision === DECISION.LINK_REQUIRES_PROOF) return res.status(409).json({ error: 'ACCOUNT_LINK_REQUIRED' });

    if (decision === DECISION.LOGIN_EXISTING) {
      const user = database.users.find(u => u.id === userId);
      if (!user) return res.status(401).json({ error: 'INVALID_SESSION' });
      if (user.accountStatus === 'DISABLED') return res.status(403).json({ error: 'ACCOUNT_DISABLED' });
      identidad.identidades.marcarUso(identidadExistente);
      if (!await persistir(res)) return;
      return res.json({ status: 'success', user: publicUser(user), token: signToken(user) });
    }

    if (decision === DECISION.LINK_TO_SESSION) {
      identidad.identidades.crear({ userId: req.user.id, provider, providerSubject: verificado.subject });
      if (!await persistir(res)) return;
      return res.json({
        status: 'linked',
        provider,
        identities: identidad.identidades.deUsuario(req.user.id).map(identidadPublica)
      });
    }

    // CREATE_USER. El nombre lo puede sugerir el cliente --Apple solo lo
    // entrega la primera vez y en el cliente--, pero se sanea como en el
    // registro y no es prueba de nada. El rol es la constante.
    const now = new Date().toISOString();
    const firstName = sanitizeText(req.body?.firstName, 80);
    const lastName = sanitizeText(req.body?.lastName, 80);
    const user = {
      id: `passenger_${crypto.randomUUID()}`,
      role: ROL_DE_USUARIO_SOCIAL_NUEVO,
      firstName: firstName.length >= 2 ? firstName : 'Pasajero',
      lastName: lastName.length >= 2 ? lastName : '',
      email: verificado.email ?? null,
      phone: null,
      rating: 5,
      totalTrips: 0,
      walletBalance: 0,
      accountStatus: 'ACTIVE',
      emailVerified: false,
      phoneVerified: false,
      createdAt: now,
      updatedAt: now
    };
    database.users.push(user);
    let creada;
    try {
      creada = identidad.identidades.crear({ userId: user.id, provider, providerSubject: verificado.subject });
    } catch (error) {
      database.users.splice(database.users.indexOf(user), 1);
      if (error?.code === 'IDENTITY_TAKEN') return res.status(409).json({ error: 'IDENTITY_TAKEN' });
      throw error;
    }
    // El correo del proveedor se anota como contacto SIN verificar: que Google
    // diga `email_verified` habla de su cuenta, no de que esta persona controle
    // ese buzon para nosotros. Verificarlo es un codigo por el canal EMAIL.
    if (verificado.email) {
      identidad.contactos.asegurar({ userId: user.id, type: 'EMAIL', valueNormalized: verificado.email });
    }
    if (!await persistDatabase()) {
      database.users.splice(database.users.indexOf(user), 1);
      database.authIdentities.splice(database.authIdentities.indexOf(creada.identidad), 1);
      return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
    }
    res.status(201).json({ status: 'created', user: publicUser(user), token: signToken(user) });
  }

  router.post('/auth/social/:provider', sesionOpcional, limitadores.social, (req, res) =>
    conProveedor(req, res, { exigirSesion: false })
  );

  router.post('/auth/identities/link/:provider', requireAuth, limitadores.identidades, (req, res) =>
    conProveedor(req, res, { exigirSesion: true })
  );

  router.get('/auth/identities', requireAuth, limitadores.identidades, (req, res) => {
    res.json({
      identities: identidad.identidades.deUsuario(req.user.id).map(identidadPublica),
      contacts: identidad.contactos.deUsuario(req.user.id).map(contactoPublico)
    });
  });

  return router;
}

/** Para las pruebas y el informe: el destino canonico que usaria un envio. */
export function destinoCanonico(channel, destination) {
  return valorNormalizadoDeContacto(TIPO_DE_CONTACTO_POR_CANAL[channel], destination);
}
