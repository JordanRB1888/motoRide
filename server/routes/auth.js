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
import {
  ESTADO_BORRADO,
  TABLAS_QUE_SE_BORRAN,
  expedienteAnonimizado,
  metodosDeEntrada,
  planDeBorrado,
  sePuedeDesvincular,
  usuarioAnonimizado
} from '../domain/borradoDeCuenta.js';

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
  sanitizeText,
  /** Para borrar los ficheros privados al eliminar una cuenta. */
  privateStorage = null
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
      // Un envio ya en curso para la misma atadura. No es un fallo del
      // usuario ni gasta nada: es el segundo toque del mismo boton.
      if (resultado.error === 'SEND_IN_PROGRESS') return res.status(409).json({ error: resultado.error });
      if (resultado.error === 'VERIFICATION_PROVIDER_NOT_CONFIGURED' || resultado.error === 'VERIFICATION_SEND_FAILED') {
        // `channel` deja que la interfaz diga QUE canal no esta disponible y
        // ofrezca otro, en vez de un error generico.
        return res.status(503).json({ error: resultado.error, channel: resultado.channel ?? channel });
      }
      return res.status(400).json({ error: resultado.error });
    }
    if (!await persistir(res)) return;
    res.status(202).json({
      status: 'sent',
      ...resultado.desafio,
      maskedDestination: resultado.destinoEnmascarado,
      // El proveedor no confirmo la entrega: el codigo pudo llegar igualmente,
      // asi que el desafio vale, y reenviar o cambiar de canal no espera.
      deliveryConfirmed: resultado.deliveryConfirmed,
      ...(resultado.warning ? { warning: resultado.warning } : {})
    });
  });

  /**
   * Que canales puede ofrecer la aplicacion. Sin sesion: es la lista de lo que
   * el servidor sabe enviar, no dice nada de ninguna cuenta.
   */
  router.get('/auth/verification/channels', limitadores.identidades, (_req, res) => {
    res.json({ channels: verificacion.canalesDisponibles() });
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
      // SI LA CUENTA YA EXISTE, SE LE MARCA EL CONTACTO.
      //
      // Este proposito nacio para verificar ANTES de crear la cuenta: en ese
      // momento no hay usuario a quien marcar, y por eso aqui no se marcaba a
      // nadie. Pero el registro de la aplicacion crea la cuenta primero y
      // verifica despues, y con la version anterior el codigo se daba por
      // bueno y la cuenta seguia figurando SIN verificar: quien acababa de
      // meter su codigo no podia pedir una carrera y no habia forma de salir
      // de ahi.
      //
      // Se cubren los dos caminos: si hay cuenta, se marca; si no la hay
      // --verificar antes de registrarse-- se responde como siempre.
      const registrada = usuarioPorDestino(tipo, destino);
      if (registrada) {
        const marcado = identidad.contactos.marcarVerificado({
          userId: registrada.id, type: tipo, valueNormalized: destino
        });
        if (!marcado.ok) {
          if (!await persistir(res)) return;
          return res.status(409).json({ error: 'CONTACT_TAKEN' });
        }
        if (tipo === 'PHONE') registrada.phoneVerified = true;
        if (tipo === 'EMAIL') registrada.emailVerified = true;
        registrada.updatedAt = new Date().toISOString();
      }
      if (!await persistir(res)) return;
      return res.json({
        status: 'verified',
        purpose,
        channel: desafio.channel,
        // Para que la aplicacion sepa que ya puede seguir, sin tener que
        // adivinarlo pidiendo el perfil otra vez.
        contactVerified: Boolean(registrada)
      });
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
        const ahora = new Date().toISOString();
        user.passwordHash = hashNuevo;
        user.updatedAt = ahora;
        // AUTH-FINAL-4: quien cambia su contraseña porque cree que alguien la
        // sabe, espera que ese alguien deje de estar dentro. Todo token
        // firmado antes de esta marca deja de valer en la siguiente peticion.
        user.credentialsChangedAt = ahora;
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

  /**
   * Que proveedores sociales sabe verificar el servidor. Sin sesion: es la
   * lista de lo que esta configurado, no dice nada de ninguna cuenta.
   *
   * Existe por lo mismo que la de canales: un boton que no lleva a ninguna
   * parte es peor que no tener el boton. La aplicacion solo enciende los que
   * salgan aqui como disponibles.
   */
  router.get('/auth/social/providers', limitadores.identidades, (_req, res) => {
    res.json({
      providers: ['GOOGLE', 'APPLE'].map(provider => ({
        provider,
        available: verificadorSocial.configurado(provider) === true
      }))
    });
  });

  router.post('/auth/social/:provider', sesionOpcional, limitadores.social, (req, res) =>
    conProveedor(req, res, { exigirSesion: false })
  );

  router.post('/auth/identities/link/:provider', requireAuth, limitadores.identidades, (req, res) =>
    conProveedor(req, res, { exigirSesion: true })
  );

  /**
   * Reautenticacion: demostrar que quien pide algo delicado es el titular.
   *
   * Una sesion de siete dias no basta para borrar una cuenta ni para vincular
   * un proveedor: el telefono pudo quedarse abierto encima de una mesa. Esto
   * comprueba la contraseña ACTUAL y no emite nada; sirve como paso previo.
   */
  async function contrasenaCorrecta(user, contrasena) {
    if (typeof user?.passwordHash !== 'string' || user.passwordHash === '') return false;
    return await bcrypt.compare(String(contrasena ?? ''), user.passwordHash);
  }

  /**
   * Los metodos con los que esta persona puede entrar.
   *
   * Sin `providerSubject` y sin el valor de los contactos: la pantalla necesita
   * saber QUE tiene vinculado, no los identificadores internos.
   */
  router.get('/auth/methods', requireAuth, limitadores.identidades, (req, res) => {
    const identidades = identidad.identidades.deUsuario(req.user.id);
    const metodos = metodosDeEntrada({ user: req.user, identidades });
    res.json({
      password: metodos.conContrasena,
      providers: ['GOOGLE', 'APPLE'].map(provider => ({
        provider,
        linked: metodos.sociales.includes(provider),
        // Un proveedor sin configurar no se ofrece como vinculable.
        available: verificadorSocial.configurado(provider) === true
      })),
      total: metodos.total,
      contacts: identidad.contactos.deUsuario(req.user.id).map(contactoPublico)
    });
  });

  /**
   * Desvincular un proveedor.
   *
   * Solo si DESPUES queda al menos un metodo de entrada. La comprobacion vive
   * aqui y no en el cliente: una guarda de cliente se salta desmontando la
   * aplicacion, y el resultado seria una cuenta sin puerta.
   */
  router.delete('/auth/identities/:provider', requireAuth, limitadores.identidades, async (req, res) => {
    const provider = PROVEEDOR_POR_RUTA[String(req.params.provider || '').toLowerCase()];
    if (!provider) return res.status(404).json({ error: 'UNKNOWN_PROVIDER' });

    const identidades = identidad.identidades.deUsuario(req.user.id);
    if (!identidades.some(i => i.provider === provider)) {
      return res.status(404).json({ error: 'IDENTITY_NOT_LINKED' });
    }
    if (!sePuedeDesvincular({ user: req.user, identidades, provider })) {
      return res.status(409).json({ error: 'LAST_AUTH_METHOD' });
    }

    const sobreviven = database.authIdentities.filter(
      i => !(i.userId === req.user.id && i.provider === provider)
    );
    const retirados = database.authIdentities.filter(
      i => i.userId === req.user.id && i.provider === provider
    );
    database.authIdentities = sobreviven;
    if (!await persistDatabase()) {
      database.authIdentities = [...sobreviven, ...retirados];
      return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
    }
    res.json({
      status: 'unlinked',
      provider,
      identities: identidad.identidades.deUsuario(req.user.id).map(identidadPublica)
    });
  });

  /**
   * Eliminar la cuenta.
   *
   * Exige REAUTENTICACION: la contraseña actual, o un codigo ya verificado si
   * la persona no tiene contraseña. Una sesion abierta no basta para algo
   * irreversible.
   *
   * Borra lo que identifica --credenciales, contactos, desafios, avisos,
   * ficheros privados-- y ANONIMIZA lo que otras entidades necesitan: un viaje
   * tiene dos partes, y borrar el del pasajero destruiria el registro de
   * trabajo del conductor. La contabilidad y la auditoria se conservan sin
   * poder atribuirse a una persona identificable.
   *
   * Es idempotente: sobre una cuenta ya eliminada responde lo mismo sin volver
   * a hacer nada.
   */
  // El limitador propio del borrado. Si quien monta el router no lo pasa se
  // cae al de identidades en vez de quedarse sin ninguno: una ruta sin
  // limitador es peor que una con el limitador equivocado.
  const limitadorDeBorrado = limitadores.borrado ?? limitadores.identidades;

  /**
   * Los borrados que estan a mitad. Es el mismo patron que `enviosEnVuelo`, y
   * esta por un caso que solo aparece con dos peticiones cruzadas.
   *
   * Cada peticion toma una instantanea para poder deshacer si la escritura
   * falla. Si dos se cruzan y una escribe bien y la otra NO, la que fallo
   * restaura su instantanea --tomada cuando la cuenta estaba entera-- y
   * RESUCITA en memoria una cuenta que en disco ya esta borrada. Viva, con sus
   * credenciales y autenticable, porque `requireAuth` lee de memoria.
   *
   * Una sola a la vez y el cruce no existe. El Set se toca sin `await` en
   * medio, asi que la reserva es atomica.
   */
  const borradosEnVuelo = new Set();

  router.post('/auth/account/delete', requireAuth, limitadorDeBorrado, async (req, res) => {
    const ahora = new Date().toISOString();
    const plan = planDeBorrado({ database, userId: req.user.id, ahora });
    if (!plan.existe) return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND' });
    if (plan.yaBorrada) return res.json({ status: 'deleted', alreadyDeleted: true });

    // REAUTENTICACION. Con contraseña, la actual. Sin ella --una cuenta creada
    // con Google-- hace falta un codigo verificado para este proposito.
    const tieneContrasena = typeof req.user.passwordHash === 'string' && req.user.passwordHash !== '';
    if (tieneContrasena) {
      if (!await contrasenaCorrecta(req.user, req.body?.password)) {
        return res.status(401).json({ error: 'REAUTHENTICATION_REQUIRED' });
      }
    } else {
      const { challengeId, code } = req.body ?? {};
      if (typeof challengeId !== 'string' || typeof code !== 'string') {
        return res.status(401).json({ error: 'REAUTHENTICATION_REQUIRED' });
      }
      const prueba = verificacion.verifyChallenge({
        challengeId,
        code,
        esperado: { purpose: 'SENSITIVE_ACTION', userId: req.user.id }
      });
      if (!prueba.ok) return res.status(401).json({ error: 'REAUTHENTICATION_REQUIRED' });
    }

    // Desde aqui no puede haber otro borrado de esta misma cuenta a mitad.
    if (borradosEnVuelo.has(req.user.id)) {
      return res.status(409).json({ error: 'DELETE_IN_PROGRESS' });
    }
    borradosEnVuelo.add(req.user.id);
    try {
      // EL PLAN SE REHACE AQUI DENTRO.
      //
      // El de arriba se calculo ANTES de comprobar la contraseña, y comprobar
      // una contraseña es un `await`. En ese hueco la cuenta pudo quedar
      // borrada por otra peticion, y `plan.user` seguiria apuntando al objeto
      // entero de antes --el array se reemplaza, la referencia no--. Actuar
      // sobre el resucitaria la cuenta.
      const actual = planDeBorrado({ database, userId: req.user.id, ahora });
      if (!actual.existe) return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND' });
      if (actual.yaBorrada) return res.json({ status: 'deleted', alreadyDeleted: true });

      // Una instantanea para poder deshacer si la escritura falla: no puede
      // quedar una cuenta a medio borrar con la puerta abierta.
      const antes = {
        usuario: { ...actual.user },
        tablas: Object.fromEntries(TABLAS_QUE_SE_BORRAN.map(t => [t, [...(database[t] ?? [])]])),
        documentos: [...(database.driverDocuments ?? [])],
        expedientes: (database.driverApplications ?? []).map(e => ({ ...e }))
      };

      for (const tabla of TABLAS_QUE_SE_BORRAN) {
        database[tabla] = (database[tabla] ?? []).filter(fila => fila.userId !== req.user.id);
      }
      // Los documentos del expediente: se borra la fila y, mas abajo, el fichero.
      database.driverDocuments = (database.driverDocuments ?? []).filter(doc => doc.userId !== req.user.id);
      // El expediente se conserva anonimizado: su decision es auditoria.
      database.driverApplications = (database.driverApplications ?? []).map(
        expediente => (expediente.userId === req.user.id ? expedienteAnonimizado(expediente, ahora) : expediente)
      );

      const anonimo = usuarioAnonimizado(actual.user, ahora);
      const indice = database.users.findIndex(u => u.id === req.user.id);
      database.users[indice] = anonimo;

      if (!await persistDatabase()) {
        // Nada de esto llego al disco: se deshace en memoria y la cuenta sigue
        // como estaba, entera y accesible.
        database.users[indice] = antes.usuario;
        for (const tabla of TABLAS_QUE_SE_BORRAN) database[tabla] = antes.tablas[tabla];
        database.driverDocuments = antes.documentos;
        database.driverApplications = antes.expedientes;
        return res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
      }

      // Los ficheros, DESPUES de que el borrado este en disco: si se borraran
      // antes y la escritura fallara, quedaria una cuenta viva sin documentos.
      // Se intentan TODOS: uno que no se pueda borrar no detiene a los demas,
      // y el estado que importa --la cuenta-- ya esta guardado.
      for (const clave of actual.ficherosABorrar) {
        try { privateStorage?.remove?.(clave); } catch { /* un fichero que ya no esta no es un fallo */ }
      }

      res.json({
        status: 'deleted',
        alreadyDeleted: false,
        // Cuantas cosas, sin sacar ninguna: sirve para el informe y para que la
        // aplicacion pueda decir que se hizo.
        removed: actual.cuantos
      });
    } finally {
      borradosEnVuelo.delete(req.user.id);
    }
  });

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
