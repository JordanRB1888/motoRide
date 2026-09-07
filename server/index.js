// PRIMERO, Y NO ES UN CAPRICHO DE ORDEN: el SDK de diagnóstico instrumenta
// `http` y Express envolviéndolos al inicializarse, así que tiene que cargarse
// antes que ellos. El porqué completo está en `instrumentacion.js`.
import { observabilidad } from './instrumentacion.js';

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { calculateFare, DEFAULT_PRICING } from './domain/pricingService.js';
import { canTransitionTrip, normalizeTripStatus, transitionTrip, TRIP_STATUS, TRIP_STATUS_ALIASES } from './domain/tripStateMachine.js';
import { calculateDistance, estadosActivos, metricasDelRecorrido } from './domain/tripMetrics.js';
import { createRouteMatrixClient } from './services/routeMatrixClient.js';
import { createRouteGeometryClient } from './services/routeGeometryClient.js';
import { capturarExcepcion, capturarFalloDeSocket } from './services/observabilidad.js';
import { crearAuthDeMaps, MODO_DE_AUTH } from './services/googleMapsAuth.js';
import { createPlacesClient, PLACES_ERROR } from './services/placesClient.js';
import { crearCacheDeRecorridos } from './services/routeMetricsCache.js';
import { SIN_RUTA, tramoDeLaRuta } from './domain/rutaDelViaje.js';
import { DRIVER_STATUS, normalizeCoordinates, normalizeDriverStatus } from './domain/driverState.js';
import { passengerPublicProfile, driverPublicProfile, sanitizeEmbeddedTripDriver } from './domain/userProjections.js';
import { canViewUserPhoto, userPhotoUrl } from './domain/photoAccess.js';
import { canViewChatMedia, findMessageByMediaId } from './domain/chatMediaAccess.js';
import {
  PAYMENT_METHODS,
  normalizeTripId,
  normalizePaymentMethod
} from './domain/tripInput.js';
import { createPrivateStorage } from './services/privateStorage.js';
import { openDatabaseBackend } from './services/databaseBackend.js';
import { createEventRateLimiter } from './services/socketRateLimit.js';
import { createConnectionLimiter } from './services/connectionLimit.js';
import { resolveTrustProxy } from './services/trustProxy.js';
import { addressKey, createIdentityLimiter, MINUTO, CUARTO_DE_HORA } from './services/httpRateLimit.js';
import { createChatMediaStorage, resolveChatMediaRoot } from './services/chatMediaStorage.js';
import { createChatMediaPipeline } from './services/chatMediaPipeline.js';
import { isChatImageDataUrl } from './domain/chatImageInput.js';
import { publicChatMessage, publicChatMessages } from './domain/chatMessageProjection.js';
import { parseLimit, parsePage, paginate, paginateByPage } from './domain/pagination.js';
import { parseUserFilters, filterUsers, isSuspended } from './domain/userFilters.js';
import { averageAdminResponseMs } from './domain/supportMetrics.js';
import { parseSupportSearch, filterSupportThreads } from './domain/supportSearch.js';
import { parseTripFilters, filterTrips, summarizeTripsByUser, tripRecency, MAX_TRIP_USER_IDS } from './domain/tripFilters.js';
// UNA sola autoridad de «viaje activo», para todos los que preguntan: el
// despacho, `/api/trips/active/me`, el guard de creacion y el restauro. Antes
// convivia con un `viajeActivoDe(passengerId)` local que resolvia lo mismo con
// otro criterio --sin la ventana del SEARCHING--, y por eso una pasajera podia
// quedar bloqueada para crear por un viaje que `/active/me` ya no le enseniaba.
// Ese criterio local se elimino; aqui esta el unico.
import {
  esViajeObsoleto,
  viajeActivoDe,
  viajeQueOcupaAlConductor
} from './domain/viajeActivo.js';
import { selectEligibleDrivers } from './domain/dispatchEligibility.js';
import { createDriverApplicationsRouter } from './routes/driverApplications.js';
import { createHash } from 'node:crypto';
import { createAuthRouter } from './routes/auth.js';
import { createAuthIdentityStore } from './services/authIdentityStore.js';
import { createVerificationService } from './services/verificationChallenges.js';
import { crearProveedores, describirConfiguracion } from './services/verificationProviders.js';
import { crearTransporteHttp, TIMEOUT_POR_OMISION_MS } from './services/verificationTransport.js';
import { crearVerificadorSocial } from './services/socialTokenVerifier.js';
import { normalizarTelefono } from './domain/contactos.js';
import { ESTADO_BORRADO, tokenSigueValiendo } from './domain/borradoDeCuenta.js';
import { createPushRouter } from './routes/push.js';
import { createTripOfflineEventsRouter } from './routes/tripOfflineEvents.js';
import { createTransportSubscriptionsRouter } from './routes/transportSubscriptions.js';
import { createTransportDriverRouter } from './routes/transportDriver.js';
import {
  createSafeTransportService,
  DEFAULT_SAFE_TRANSPORT_PRICING,
  sanitizeSafeTransportPricing
} from './services/safeTransport.js';
import { PUSH_TYPE, createPushNotificationService, isWebPushEnabled } from './services/pushNotificationService.js';
import { createFcmSender } from './services/fcmSender.js';
import { crearSenderCompuesto } from './services/pushSender.js';
import { createDispatchRanker } from './services/dispatchRanking.js';
import { createWebPushSender } from './services/webPushSender.js';
import {
  bloquearSiApagado as bloquearRetiroAntiguoSiApagado,
  esAprobacionDeRetiroAntiguo
} from './services/legacyPayoutGate.js';

const app = express();
const allowedOrigins = String(process.env.CLIENT_ORIGIN || 'https://plus58express.vercel.app,http://localhost:3000,http://localhost:5173,http://127.0.0.1:4173')
  .split(',').map(value => value.trim()).filter(Boolean);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    callback(new Error('ORIGIN_NOT_ALLOWED'));
  }
}));
app.use(express.json({ limit: '1mb' }));
/**
 * Topes por ruta y por identidad. Están calculados sobre el uso legítimo con
 * holgura: la idea es cortar el abuso, no estorbar a quien trabaja.
 *
 * Nivel 2 --lecturas cuyo coste no guarda proporción con el esfuerzo de
 * pedirlas-- y nivel 3 --escrituras de estado--, según la clasificación de
 * phase-3a-retencion-y-rutas.md. El nivel 4 no lleva limitador propio: ya está
 * paginado y una petición cuesta lo mismo la pida quien la pida.
 */
const limitadores = {
  // Nivel 2. Recorren o agregan colecciones enteras en cada llamada.
  listados: createIdentityLimiter({ name: 'listados', limit: 240, windowMs: MINUTO }),
  resumenes: createIdentityLimiter({ name: 'resumenes', limit: 240, windowMs: MINUTO }),
  finanzas: createIdentityLimiter({ name: 'finanzas', limit: 60, windowMs: MINUTO }),
  cercania: createIdentityLimiter({ name: 'cercania', limit: 180, windowMs: MINUTO }),
  // Leen de disco en cada peticion. El panel abre una por ficha desplegada.
  archivos: createIdentityLimiter({ name: 'archivos', limit: 180, windowMs: MINUTO }),
  // La geometria de la ruta puede acabar en una llamada de PAGO a Google. La
  // cache absorbe la mayoria --dos minutos, clave redondeada-- pero el techo lo
  // pone esto: sesenta por minuto es un pulso cada segundo, cuatro veces mas de
  // lo que el movil pide, y aun asi acotado si alguien decide insistir.
  rutas: createIdentityLimiter({ name: 'rutas', limit: 60, windowMs: MINUTO }),
  // Buscar el destino es escribir: cada pulsacion podria ser una llamada de
  // PAGO a Places. El cliente agrupa las teclas antes de preguntar, pero el
  // techo lo pone esto.
  lugares: createIdentityLimiter({ name: 'lugares', limit: 60, windowMs: MINUTO }),
  // Subidas: caras y raras.
  subidas: createIdentityLimiter({ name: 'subidas', limit: 30, windowMs: CUARTO_DE_HORA }),

  // Nivel 3. Escrituras de estado; el riesgo es de volumen, no de acceso.
  mensajes: createIdentityLimiter({ name: 'mensajes', limit: 60, windowMs: MINUTO }),
  viajes: createIdentityLimiter({ name: 'viajes', limit: 60, windowMs: MINUTO }),
  // Gemelo REST del GPS por socket: el cliente ya lo regula a uno cada dos
  // segundos, asi que 120 por minuto es cuatro veces su ritmo maximo.
  telemetria: createIdentityLimiter({ name: 'telemetria', limit: 120, windowMs: MINUTO }),
  notificaciones: createIdentityLimiter({ name: 'notificaciones', limit: 120, windowMs: MINUTO }),
  // Movimientos de dinero: pocos y deliberados.
  cartera: createIdentityLimiter({ name: 'cartera', limit: 20, windowMs: CUARTO_DE_HORA }),
  // Administracion. El alta de conductor cuesta un hash de contrasena, pero
  // dar de alta una flota entera de una sentada es legitimo.
  administracion: createIdentityLimiter({ name: 'administracion', limit: 300, windowMs: CUARTO_DE_HORA }),
  // Un comunicado escribe una notificacion por cada persona de la plataforma.
  difusion: createIdentityLimiter({ name: 'difusion', limit: 10, windowMs: CUARTO_DE_HORA })
};

/**
 * Intentos de credenciales. Antes habia un solo limitador montado sobre todo
 * `/api/auth`, asi que login, registro y la lectura de sesion compartian los
 * mismos treinta intentos por cuarto de hora. Como el cliente pide
 * `GET /api/auth/me` en cada carga de la aplicacion, bastaba con recargar unas
 * cuantas veces para quedarse sin poder entrar ni registrarse --y el 429 se
 * mostraba como "Credenciales incorrectas", porque el limitador antiguo
 * respondia texto plano.
 *
 * Ahora cada finalidad tiene su cubo. Ninguna sesion existe todavia en estas
 * dos rutas, asi que `createIdentityLimiter` cuenta por direccion, que es lo
 * que corresponde sin identidad a la que agarrarse.
 */
const credenciales = {
  // Se conserva el tope anterior, ahora dedicado solo a iniciar sesion: es la
  // proteccion contra prueba de contrasenas por fuerza bruta.
  login: createIdentityLimiter({ name: 'login', limit: 30, windowMs: CUARTO_DE_HORA }),
  // Crear cuentas es lo mas abusable de las dos, asi que va algo mas ajustado.
  // Aun asi deja margen a una direccion compartida por NAT de operador, que en
  // Venezuela es lo habitual.
  registro: createIdentityLimiter({ name: 'registro', limit: 20, windowMs: CUARTO_DE_HORA }),
  // Lectura y edicion de la propia sesion. No son intentos de credenciales y
  // no deben gastar de los cubos de arriba, pero tampoco pueden quedarse sin
  // proteccion al retirar el limitador global.
  sesion: createIdentityLimiter({ name: 'sesion', limit: 240, windowMs: MINUTO }),
  perfil: createIdentityLimiter({ name: 'perfil', limit: 60, windowMs: MINUTO }),
  // AUTH-FINAL-1. Pedir codigos cuesta dinero por cada envio, asi que va tan
  // ajustado como el registro; escribirlos es la fuerza bruta de un codigo de
  // seis cifras y encima cada desafio ya tiene su propio tope de intentos.
  desafio: createIdentityLimiter({ name: 'desafio', limit: 20, windowMs: CUARTO_DE_HORA }),
  verificacion: createIdentityLimiter({ name: 'verificacion', limit: 30, windowMs: CUARTO_DE_HORA }),
  // Entrar con Google o Apple es un intento de credenciales como el login.
  social: createIdentityLimiter({ name: 'social', limit: 30, windowMs: CUARTO_DE_HORA }),
  identidades: createIdentityLimiter({ name: 'identidades', limit: 60, windowMs: MINUTO }),
  // AUTH-FINAL-4. Borrar una cuenta es irreversible y no se hace en rafaga:
  // un tope bajo y propio, que no comparte cubo con nada.
  borrado: createIdentityLimiter({ name: 'borrado', limit: 5, windowMs: CUARTO_DE_HORA })
};

/**
 * Techo por direccion para /api/auth/me*, ANTES de `requireAuth`.
 *
 * Los limitadores de arriba se montan detras de `requireAuth` a proposito:
 * necesitan `req.user` para contar por cuenta, que es lo correcto cuando hay
 * sesion --si contaran por direccion, las personas tras el NAT del operador
 * compartirian cupo sin motivo--. Pero eso deja fuera del conteo justo al
 * trafico que nunca llega a autenticarse: sin cabecera, con un token invalido
 * o corrupto, `requireAuth` responde 401 y el limitador de detras no llega a
 * verlo. Antes de este hotfix ese trafico si tenia techo, porque el limitador
 * global de `/api/auth` corria por delante de todo.
 *
 * Asi que van dos capas: esta por direccion para cortar inundaciones, y la de
 * cuenta detras para el uso ya autenticado.
 *
 * El tope es deliberadamente alto: no cuenta intentos de credenciales --con
 * un token no se adivina nada-- sino peticiones por segundo. La referencia mas
 * alta de Phase 3A es `listados`, 240 por minuto, pero aquella cuenta por
 * cuenta y esta por direccion, y en Venezuela una sola direccion puede ser un
 * operador movil entero. Dimensionado sobre ese caso: quinientas personas tras
 * el mismo NAT abriendo la aplicacion una vez por minuto son 500 peticiones,
 * asi que 1200 deja mas del doble de margen al uso legitimo. Del otro lado,
 * medido en esta maquina el proceso despacha unas 2700 peticiones por segundo
 * de las que aqui se rechazan; 1200 por minuto son 20 por segundo, es decir
 * que recorta una inundacion en mas del noventa y nueve por ciento.
 */
// Configurable para poder ejercitarlo en las pruebas sin lanzar cientos de
// peticiones. Se exige la cadena entera de digitos: `parseInt` aceptaria
// '600abc' --y '203.0.113.7'--, que es como se colo un fallo en trustProxy.
const TOPE_GUARDIA_SESION = /^[1-9]\d*$/.test(String(process.env.AUTH_ME_GUARD_LIMIT ?? ''))
  ? Number(process.env.AUTH_ME_GUARD_LIMIT)
  : 1200;
const guardiaSesion = createIdentityLimiter({
  name: 'sesion-previa',
  limit: TOPE_GUARDIA_SESION,
  windowMs: MINUTO,
  keyGenerator: addressKey
});
// Cubre GET y PATCH /api/auth/me, POST /api/auth/me/photo y cualquier subruta
// que se anada bajo ese prefijo: el techo lo hereda por montaje, no por lista.
app.use('/api/auth/me', guardiaSesion);

/**
 * Techo por direccion para /api/chat-media*, ANTES de `requireAuth`.
 *
 * Mismo razonamiento --y mismo mecanismo-- que `guardiaSesion`: el limitador
 * de la ruta vive detras de `requireAuth` para poder contar por cuenta, asi
 * que una peticion sin token, o con uno invalido, muere en el 401 y nunca se
 * cuenta. Sin esta guardia, ese trafico no tendria ningun techo. Se comprobo
 * que ningun `app.use` anterior cubre este prefijo.
 *
 * Cubo propio, no compartido con la guardia de sesion: agotar uno no puede
 * dejar sin servicio al otro, que es la leccion del cubo unico de /api/auth.
 *
 * Mismo tope que aquella, y por el mismo motivo: sin token la peticion muere
 * en la verificacion del testigo, antes de tocar el disco, de modo que el
 * coste por peticion es el mismo. Quien si lee del disco es el trafico ya
 * autenticado, y a ese lo acota ademas `limitadores.archivos` por cuenta.
 */
const TOPE_GUARDIA_MEDIOS = /^[1-9]\d*$/.test(String(process.env.CHAT_MEDIA_GUARD_LIMIT ?? ''))
  ? Number(process.env.CHAT_MEDIA_GUARD_LIMIT)
  : 1200;
const guardiaMedios = createIdentityLimiter({
  name: 'medios-previa',
  limit: TOPE_GUARDIA_MEDIOS,
  windowMs: MINUTO,
  keyGenerator: addressKey,
  // Solo cuenta lo que falla. Una pantalla de chat puede abrir diez imagenes,
  // y detras del NAT de un operador hay cientos de personas haciendo lo mismo:
  // contando los aciertos, el uso legitimo agotaria el cupo antes que ningun
  // abuso. Lo que esta guardia debe frenar es la peticion que no llega a
  // autenticarse --401, 403--, y a esa la sigue contando. El uso legitimo ya
  // tiene su techo por cuenta en `limitadores.archivos`, detras de requireAuth.
  skipSuccessfulRequests: true
});
app.use('/api/chat-media', guardiaMedios);

/**
 * La guardia de entrada de los expedientes de conductor.
 *
 * Antes aquí había un tope de veinte peticiones por dirección cada quince
 * minutos, y contaba TODO: postularse cuesta una creación, once subidas de
 * documento, alguna corrección y el envío. Catorce peticiones para el
 * recorrido más corto. Detrás del NAT de un operador venezolano, donde
 * cientos de personas comparten dirección, la segunda persona del día se
 * quedaba fuera sin haber hecho nada malo.
 *
 * Ahora se separa lo que protege cada cosa:
 *
 *   - Esta guardia, por dirección, sólo cuenta lo que FALLA (peticiones sin
 *     sesión válida, cuerpos rechazados). Es la red contra el abuso que ni
 *     siquiera llega a autenticarse, y por eso puede ser amplia.
 *   - Lo que ya está autenticado tiene su techo POR CUENTA dentro del router
 *     del expediente (`documentos`, `subidas`, `expedientes`), donde compartir
 *     dirección con otra persona no resta a nadie.
 *   - Crear un expediente, que es lo único que no lleva sesión y sí cuesta
 *     (una cuenta nueva y un hash de contraseña), tiene su propio tope por
 *     dirección en la ruta, contando también los aciertos.
 */
const TOPE_GUARDIA_EXPEDIENTES = /^[1-9]\d*$/.test(String(process.env.DRIVER_APPLICATION_GUARD_LIMIT ?? ''))
  ? Number(process.env.DRIVER_APPLICATION_GUARD_LIMIT)
  : 300;
const guardiaExpedientes = createIdentityLimiter({
  name: 'expedientes-previa',
  limit: TOPE_GUARDIA_EXPEDIENTES,
  windowMs: CUARTO_DE_HORA,
  keyGenerator: addressKey,
  skipSuccessfulRequests: true
});
app.use('/api/driver-applications', guardiaExpedientes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 4000;
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE || path.join(serverDir, 'data', 'plus58express.sqlite');
const jwtSecret = process.env.JWT_SECRET || 'plus58express-development-secret';
const isProduction = process.env.NODE_ENV === 'production' || String(process.env.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase() === 'production';
if (isProduction && (!process.env.JWT_SECRET || jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET_REQUIRED_IN_PRODUCTION');
}

// Sin esto, `req.ip` es la dirección del proxy de borde, idéntica para todo el
// mundo: los limitadores de frecuencia dejan de ser «por cliente» y pasan a ser
// un cupo global, de modo que treinta intentos de inicio de sesión en toda la
// plataforma dejan fuera a los demás. El valor es el número EXACTO de proxies
// por delante y tiene que coincidir con el despliegue real: pasarse permite
// falsificar la dirección de origen y quedarse corto reproduce el cupo global.
const trustProxy = resolveTrustProxy({ value: process.env.TRUST_PROXY, isProduction });
app.set('trust proxy', trustProxy.value);
console.log(`[+58express HTTP] trust proxy = ${String(trustProxy.value)} (${trustProxy.source})`);
const privateStorage = createPrivateStorage({
  rootDirectory: process.env.UPLOAD_DIR || path.join(path.dirname(dataFile), 'private-uploads')
});
// Raiz propia para los adjuntos de chat y soporte, dentro del mismo volumen
// persistente. Se valida al arrancar: si no esta contenida, no es escribible o
// falta en produccion, el proceso no arranca antes que aceptar imagenes que
// desapareceran en el siguiente despliegue.
const chatMediaStorage = createChatMediaStorage({
  rootDirectory: resolveChatMediaRoot({ dataFile })
});
// Unico camino de alta de una imagen de chat: archivo primero, registro
// despues, y compensacion si el registro falla. Lo usan los dos productores.
const chatMediaPipeline = createChatMediaPipeline({
  storage: chatMediaStorage,
  onCompensationError: detalle => console.error(
    `[+58express chat-media] archivo huerfano tras fallo de persistencia: ${detalle.reason} (${detalle.mimeType}, ${detalle.bytes} bytes)`
  )
});
/**
 * Quien mide los recorridos, y la cache que evita repetir la pregunta.
 *
 * Es el MISMO cliente que usa el ranking del despacho: una sola integracion con
 * Google en todo el servidor, con la credencial dedicada de servidor
 * --DISPATCH_ROUTES_API_KEY-- que jamas sale de este proceso ni llega a un
 * telefono. Sin ella el medidor cae a su geodesica propia.
 *
 * Lo que NUNCA hace es preguntarle la distancia al cliente.
 */
/**
 * LA AUTENTICACION DE GOOGLE MAPS, UNA SOLA PARA TODO EL SERVIDOR
 *
 * Con cuenta de servicio se usa un token OAuth, que NO depende de la IP: en
 * este entorno la pone una VPN y cambiaba cada vez que se cambiaba de
 * servidor, dejando el calculo de distancia y tiempo fuera de juego hasta que
 * alguien anadia la IP nueva en Google Cloud a mano.
 *
 * Compartida a proposito: un solo token cacheado para el medidor y para el
 * ranking, en vez de que cada cliente se autentique por su cuenta.
 */
const authDeMaps = crearAuthDeMaps({
  // Misma convencion que FCM: si nadie dice otra cosa, el fichero vive junto al
  // servidor y git lo ignora. En produccion no hay fichero y la cuenta llega
  // por GOOGLE_MAPS_SERVICE_ACCOUNT_B64, que `crearAuthDeMaps` ya mira sola.
  rutaDeLaCuenta: process.env.GOOGLE_MAPS_SERVICE_ACCOUNT_FILE || path.join(serverDir, 'maps-service-account.json'),
  logger: console
});

const routeMatrix = createRouteMatrixClient({ auth: authDeMaps, logger: console });
const cacheDeRecorridos = crearCacheDeRecorridos();

/**
 * Quien traza la GEOMETRIA de la ruta, y su propia cache (ROUTE-1).
 *
 * Aparte del medidor a proposito. El medidor pregunta CUANTO y pide
 * expresamente que no le manden polilineas; este pregunta POR DONDE y pide
 * justo la polilinea. Juntarlos habria hecho que ordenar conductores para el
 * despacho empezara a descargar geometria que se tira.
 *
 * La credencial es la misma --DISPATCH_ROUTES_API_KEY, dedicada de servidor-- y
 * las reglas tambien: no sale de este proceso y no se imprime.
 *
 * Cache propia y mas larga que la del medidor: por donde se va a un sitio no
 * cambia en dos minutos, y una carrera entera son decenas de posiciones del
 * conductor que caen todas en la misma clave redondeada.
 */
const clienteDeGeometria = createRouteGeometryClient({ auth: authDeMaps, logger: console });
const clienteDeLugares = createPlacesClient({ auth: authDeMaps, logger: console });
const cacheDeGeometria = crearCacheDeRecorridos({ ttlMs: 120_000 });

/** Los estados que ocupan a una pasajera. Derivados, no escritos a mano. */
const ESTADOS_DE_VIAJE_ACTIVO = estadosActivos(TRIP_STATUS, TRIP_STATUS_ALIASES);

/** Mide un recorrido con la autoridad del servidor. Nunca mira el cuerpo. */
function medirRecorrido(pickup, destination) {
  return metricasDelRecorrido(pickup, destination, {
    routeMatrix,
    cache: cacheDeRecorridos,
    logger: console
  });
}

let pricingConfig = {
  ...DEFAULT_PRICING,
  bcvRate: Number(process.env.BCV_RATE || 0),
  parallelRate: Number(process.env.PARALLEL_RATE || 0)
};

function sanitizeText(value, max = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    const payload = jwt.verify(token, jwtSecret);
    const currentUser = database.users.find(user => user.id === payload.sub);
    if (!currentUser) return next(new Error('INVALID_SESSION'));
    if (currentUser.role === 'driver' && (!currentUser.isVerified || currentUser.status === 'SUSPENDED')) {
      return next(new Error('DRIVER_NOT_APPROVED'));
    }
    if (currentUser.accountStatus === 'DISABLED') return next(new Error('ACCOUNT_DISABLED'));
    socket.data.auth = { userId: currentUser.id, role: currentUser.role };
    next();
  } catch {
    next(new Error('INVALID_SESSION'));
  }
});

function allowSocketRole(socket, role) {
  if (socket.data.auth?.role === role) return true;
  socket.emit('authorization:error', { error: 'FORBIDDEN', requiredRole: role });
  return false;
}

// In-Memory Database & State Sync Engine (Real-Time Backend Dispatch)
const initialDatabase = {
  users: [{
    id: 'admin_1',
    role: 'admin',
    firstName: 'Admin',
    lastName: '+58express',
    phone: '+58 414-000-0000',
    email: process.env.ADMIN_EMAIL || 'admin@58express.com',
    accountStatus: 'ACTIVE'
  }],
  trips: [],
  notifications: [],
  messages: [],
  supportMessages: [],
  settings: [],
  transactions: [],
  driverApplications: [],
  driverDocuments: [],
  adminActions: [],
  pushSubscriptions: [],
  pushDeliveries: [],
  transportSubscriptions: [],
  scheduledRides: []
};

const migrationsDirectory = path.join(serverDir, 'migrations');
const databaseBackend = await openDatabaseBackend({ dataFile, migrationsDirectory });
const { database, persistence } = databaseBackend;
console.log(`[+58express Database] backend = ${databaseBackend.kind}`);

const storedPricing = database.settings.find(item => item.id === 'pricing');
if (storedPricing?.value) pricingConfig = { ...pricingConfig, ...storedPricing.value };

// SAFE-2A: tarifas del plan de Transporte Seguro (fijas por categoría + %
// de la plataforma), editables por el ADMIN y persistidas en settings.
let safeTransportPricing = { ...DEFAULT_SAFE_TRANSPORT_PRICING };
{
  const guardada = database.settings.find(item => item.id === 'safeTransportPricing');
  const valida = sanitizeSafeTransportPricing(guardada?.value);
  if (valida) safeTransportPricing = valida;
}

async function ensureSeedCredentials() {
  let changed = false;
  for (const seedUser of initialDatabase.users) {
    if (!database.users.some(user => user.id === seedUser.id)) {
      database.users.push(structuredClone(seedUser));
      changed = true;
    }
  }
  const admin = database.users.find(user => user.id === 'admin_1');
  if (admin && !admin.passwordHash) {
    const bootstrapPassword = process.env.ADMIN_PASSWORD || (isProduction ? crypto.randomUUID() : 'admin');
    admin.passwordHash = bcrypt.hashSync(bootstrapPassword, 12);
    admin.accountStatus = 'ACTIVE';
    changed = true;
  }
  if (isProduction && process.env.DISABLE_LEGACY_DEMO_USERS !== 'false') {
    for (const user of database.users.filter(item => ['d1', 'p1'].includes(item.id))) {
      if (user.accountStatus !== 'DISABLED') {
        user.accountStatus = 'DISABLED';
        user.disabledReason = 'LEGACY_DEMO_ACCOUNT';
        if (user.role === 'driver') user.status = 'SUSPENDED';
        changed = true;
      }
    }
  }
  for (const user of database.users) {
    if (!user.accountStatus) {
      user.accountStatus = 'ACTIVE';
      changed = true;
    }
  }
  if (changed && !await persistDatabase()) throw new Error('DATABASE_SEED_PERSIST_FAILED');
}

// Escritura incremental: solo llegan al disco las filas que cambiaron. La
// versión anterior borraba y reinsertaba las diez tablas en cada llamada, de
// modo que el coste de persistir una sola coordenada de GPS crecía con todo el
// histórico acumulado de la aplicación.
async function persistDatabase() {
  return await persistence.persist();
}

// Para los eventos que modifican exactamente un registro ya conocido. Ver el
// contrato en services/databasePersistence.js: no guarda otros cambios
// pendientes, así que solo debe usarse cuando el manejador toca un único
// registro y nada más.
async function persistRecord(table, item) {
  return await persistence.persistRecord(table, item);
}

async function persistHttp(res) {
  if (await persistDatabase()) return true;
  res.status(503).json({ error: 'DATABASE_WRITE_FAILED' });
  return false;
}

await ensureSeedCredentials();

// AUTH-FINAL-1: la identidad canonica. Cada User con contrasena recibe su
// identidad PASSWORD (el hash sigue en `users`; aqui no se duplica). Corre en
// cada arranque y la segunda vez no crea nada.
const identidad = createAuthIdentityStore({ database });
{
  const creadas = identidad.identidades.rellenarContrasenas();
  if (creadas > 0) {
    if (!await persistDatabase()) throw new Error('AUTH_IDENTITY_BACKFILL_PERSIST_FAILED');
    console.log(`[+58express Auth] identidades PASSWORD creadas al arrancar: ${creadas}`);
  }
}

// Los codigos se firman con OTP_PEPPER si existe. Si no, el secreto se DERIVA
// del de las sesiones en vez de reutilizarlo tal cual: comprometer uno no
// entrega el otro, y la derivacion siempre tiene la longitud que el HMAC exige
// aunque el secreto de desarrollo sea corto. Los proveedores de envio se leen
// del entorno y hoy ninguno esta cableado a un transporte real: el arranque lo
// cuenta por nombre de variable, nunca por valor.
const otpSecret = process.env.OTP_PEPPER || createHash('sha256').update(`otp-pepper:${jwtSecret}`).digest('hex');
// El transporte HTTP real, con su timeout. Es lo unico que separa a los
// adaptadores de enviar de verdad: en cuanto haya configuracion autentica,
// envian. Ver `services/verificationTransport.js`.
const transporteDeVerificacion = await crearTransporteHttp({
  timeoutMs: Number(process.env.VERIFICATION_TIMEOUT_MS) || TIMEOUT_POR_OMISION_MS
});
const verificacion = createVerificationService({
  database,
  secreto: otpSecret,
  proveedores: crearProveedores({ env: process.env, transporte: transporteDeVerificacion }),
  // Diagnostico con metadata segura: canal, proposito, categoria del
  // resultado, latencia y el destino ENMASCARADO. Nunca el codigo.
  registrar: metadata => console.log(`[+58express OTP] ${JSON.stringify(metadata)}`)
});
const verificadorSocial = crearVerificadorSocial({ env: process.env });
{
  const canales = describirConfiguracion(process.env);
  const resumen = Object.entries(canales).map(([canal, c]) => `${canal}=${c.configurado ? 'configurado' : `faltan ${c.faltan.length}`}`);
  const sociales = ['GOOGLE', 'APPLE'].map(p => `${p}=${verificadorSocial.configurado(p) ? 'configurado' : 'sin audiencia'}`);
  console.log(`[+58express Auth] verificacion: ${resumen.join(', ')}; social: ${sociales.join(', ')}`);
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, photoStorageKey, ...safeUser } = user;
  // La ruta de la fotografía se deriva del almacenamiento real: los registros
  // antiguos guardan una ruta sin el prefijo /api, y cualquier valor externo
  // heredado dejaría de ser contenido privado de la aplicación.
  safeUser.photoUrl = userPhotoUrl(user);
  return safeUser;
}

// Representación mínima del conductor para el pasajero durante un viaje.
// Delega en la proyección compartida para que exista una sola lista blanca.
function driverPublicSummary(driver) {
  return driverPublicProfile(driver, { includePhone: true });
}

// Estados en los que dos participantes todavía necesitan poder llamarse.
// Se comparan en su forma canónica para cubrir los alias históricos
// (EN_ROUTE, DRIVER_ARRIVED, IN_TRIP).
const CONTACTABLE_TRIP_STATUSES = new Set([
  TRIP_STATUS.DRIVER_ASSIGNED,
  TRIP_STATUS.ARRIVED,
  TRIP_STATUS.IN_PROGRESS
]);

function isContactableTrip(trip) {
  return CONTACTABLE_TRIP_STATUSES.has(normalizeTripStatus(trip?.status));
}

/**
 * Construye la vista de un viaje según quién pregunta.
 *
 * El solicitante recibe su propio perfil sin recortar y el del otro
 * participante proyectado. El teléfono del conductor solo viaja mientras el
 * viaje sigue vivo. Un administrador conserva la vista completa: el panel se
 * revisa en una fase posterior.
 */
function tripParticipantsView(trip, viewer) {
  const passenger = database.users.find(user => user.id === trip.passengerId);
  const driver = database.users.find(user => user.id === trip.driverId);
  const contactable = isContactableTrip(trip);

  if (viewer?.role === 'admin') {
    return { trip, passenger: publicUser(passenger), driver: publicUser(driver) };
  }

  const isPassenger = viewer?.id === trip.passengerId;
  return {
    trip: sanitizeEmbeddedTripDriver(trip, { includePhone: contactable }),
    passenger: isPassenger ? publicUser(passenger) : passengerPublicProfile(passenger),
    driver: isPassenger ? driverPublicProfile(driver, { includePhone: contactable }) : publicUser(driver)
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
}

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const tripFareUSD = trip => Math.max(0, roundMoney(trip?.fareUSD || trip?.fareEUR || trip?.pricing?.fareUSD || 0));
const isWalletPayment = paymentMethod => ['WALLET', 'BILLETERA', 'BILLETERA EXPRESS'].includes(
  String(paymentMethod || '').trim().replaceAll('_', ' ').toUpperCase()
);

function ensureWalletCanCoverTrip(trip, passenger) {
  if (!isWalletPayment(trip?.paymentMethod)) return;
  if (trip?.id && database.transactions.some(item => item.type === 'RIDE_PAYMENT' && item.tripId === trip.id)) return;
  const fare = tripFareUSD(trip);
  const balance = roundMoney(passenger?.walletBalance || 0);
  if (!passenger || fare <= 0 || balance < fare) {
    const error = new Error('INSUFFICIENT_WALLET_BALANCE');
    error.code = 'INSUFFICIENT_WALLET_BALANCE';
    error.balance = balance;
    error.required = fare;
    throw error;
  }
}

function debitPassengerWalletForCompletedTrip(trip) {
  if (!trip || trip.status !== TRIP_STATUS.COMPLETED || !isWalletPayment(trip.paymentMethod)) return null;
  const existing = database.transactions.find(item => item.type === 'RIDE_PAYMENT' && item.tripId === trip.id);
  if (existing) return existing;

  const passenger = database.users.find(user => user.id === trip.passengerId);
  ensureWalletCanCoverTrip(trip, passenger);
  const fare = tripFareUSD(trip);
  passenger.walletBalance = roundMoney(Number(passenger.walletBalance || 0) - fare);
  trip.passengerWalletDebitUSD = fare;
  const transaction = {
    id: `transaction_${crypto.randomUUID()}`,
    userId: passenger.id,
    tripId: trip.id,
    type: 'RIDE_PAYMENT',
    amount: -fare,
    currency: 'USD',
    status: 'APPROVED',
    balanceAfter: passenger.walletBalance,
    createdAt: new Date().toISOString()
  };
  database.transactions.push(transaction);
  database.notifications.push({
    id: `notification_${crypto.randomUUID()}`,
    userId: passenger.id,
    title: 'Pago de viaje realizado',
    message: `Se descontaron $${fare.toFixed(2)} de tu Billetera Express. Saldo disponible: $${passenger.walletBalance.toFixed(2)}.`,
    category: 'FINANCE',
    read: false,
    createdAt: transaction.createdAt
  });
  return transaction;
}

function settleDriverForCompletedTrip(trip) {
  if (!trip || trip.status !== TRIP_STATUS.COMPLETED) return null;
  const existing = database.transactions.find(item => ['DRIVER_EARNING', 'PLATFORM_COMMISSION'].includes(item.type) && item.tripId === trip.id);
  if (existing) return existing;
  const driver = database.users.find(user => user.id === trip.driverId);
  if (!driver) return null;
  const gross = tripFareUSD(trip);
  // SAFE-2A: un viaje puede traer SU tasa de comisión (los del plan de
  // Transporte Seguro llevan la del plan, 20% por defecto); sin ella rige la
  // tasa general de siempre. Ningún viaje normal cambia.
  const tasaComision = Number.isFinite(Number(trip.commissionRate))
    ? Number(trip.commissionRate)
    : Number(pricingConfig.commissionRate || 0.15);
  const commission = roundMoney(gross * tasaComision);
  const net = Math.max(0, roundMoney(gross - commission));
  const platformCollectedPayment = isWalletPayment(trip.paymentMethod);
  const amount = platformCollectedPayment ? net : -commission;
  driver.walletBalance = roundMoney(Number(driver.walletBalance || 0) + amount);
  trip.driverEarningUSD = net;
  trip.platformCommissionUSD = commission;
  trip.driverSettlementType = platformCollectedPayment ? 'WALLET_CREDIT' : 'COMMISSION_DEBIT';
  const transaction = {
    id: `transaction_${crypto.randomUUID()}`,
    userId: driver.id,
    tripId: trip.id,
    type: platformCollectedPayment ? 'DRIVER_EARNING' : 'PLATFORM_COMMISSION',
    amount,
    gross,
    commission,
    net,
    paymentMethod: trip.paymentMethod || 'efectivo',
    currency: 'USD',
    status: 'APPROVED',
    balanceAfter: driver.walletBalance,
    createdAt: new Date().toISOString()
  };
  database.transactions.push(transaction);
  database.notifications.push({
    id: `notification_${crypto.randomUUID()}`,
    userId: driver.id,
    title: platformCollectedPayment ? 'Ganancia acreditada' : 'Comisión de viaje registrada',
    message: platformCollectedPayment
      ? `Se acreditaron $${net.toFixed(2)} por el viaje. Saldo: $${driver.walletBalance.toFixed(2)}.`
      : `Recibiste el pago directamente. Se descontó la comisión de +58Express por $${commission.toFixed(2)}. Saldo operativo: $${driver.walletBalance.toFixed(2)}.`,
    category: 'FINANCE',
    read: false,
    createdAt: transaction.createdAt
  });
  return transaction;
}

function settleCompletedTrip(trip) {
  const passengerTransaction = debitPassengerWalletForCompletedTrip(trip);
  const driverTransaction = settleDriverForCompletedTrip(trip);
  return { passengerTransaction, driverTransaction };
}

function emitCompletedTripWalletUpdates(trip, settlement) {
  if (settlement?.passengerTransaction) {
    const passenger = database.users.find(user => user.id === trip.passengerId);
    io.to(`user:${trip.passengerId}`).emit('wallet:updated', {
      balance: roundMoney(passenger?.walletBalance || 0),
      transaction: settlement.passengerTransaction
    });
  }
  if (settlement?.driverTransaction) {
    const driver = database.users.find(user => user.id === trip.driverId);
    io.to(`user:${trip.driverId}`).emit('wallet:updated', {
      balance: roundMoney(driver?.walletBalance || 0),
      transaction: settlement.driverTransaction
    });
  }
}

/**
 * LA transicion de negocio del conductor (OFFLINE-TRIP-1A).
 *
 * Unico lugar donde una accion del conductor (ARRIVED / IN_PROGRESS /
 * COMPLETED) se convierte en estado: guardia de cartera, maquina de estados
 * canonica, liberacion del conductor y liquidacion. La llaman DOS
 * transportes --el evento de socket en linea y la reconciliacion sin
 * conexion-- y por construccion no pueden divergir. No persiste ni anuncia:
 * eso lo hace quien llama, tras un persist correcto.
 */
function aplicarTransicionDelConductor(trip, status, driverId) {
  if (status === TRIP_STATUS.COMPLETED) {
    try {
      ensureWalletCanCoverTrip(trip, database.users.find(user => user.id === trip.passengerId));
    } catch (error) {
      return { ok: false, code: error.code, balance: error.balance, required: error.required };
    }
  }
  try {
    transitionTrip(trip, status, { actorId: driverId, actorRole: 'driver' });
  } catch (error) {
    return { ok: false, code: error.code || 'INVALID_TRIP_TRANSITION' };
  }
  if ([TRIP_STATUS.COMPLETED, TRIP_STATUS.CANCELLED].includes(trip.status)) {
    const assignedDriver = database.users.find(user => user.id === trip.driverId);
    if (assignedDriver) assignedDriver.status = DRIVER_STATUS.AVAILABLE;
    tripLocks.delete(trip.id);
  }
  const settlement = trip.status === TRIP_STATUS.COMPLETED ? settleCompletedTrip(trip) : null;
  return { ok: true, settlement };
}

/**
 * Anuncio en tiempo real de una transicion YA persistida. Payload construido
 * por el servidor a partir del viaje: nunca se retransmite lo recibido.
 */
function anunciarTransicionDelConductor(trip, settlement) {
  emitCompletedTripWalletUpdates(trip, settlement);
  io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).to('admins').emit('tripStatusUpdated', {
    tripId: trip.id,
    status: trip.status,
    canonicalStatus: trip.status,
    updatedAt: trip.updatedAt
  });
  avisarDelCambioDeViaje(trip);
}

/**
 * El push del cambio de estado, para quien espera (PUSH-1).
 *
 * ACOMPANA al socket, no lo sustituye. El socket ya llevo el cambio a quien
 * tenia la aplicacion abierta; esto es para el telefono guardado en el bolsillo.
 *
 * SIN AWAIT, Y SIN PODER ROMPER NADA
 *
 * Igual que la oferta de carrera desde PUSH-3A: la transicion ya esta
 * persistida y anunciada, y un proveedor lento no puede robarle segundos a
 * nadie. El servicio nunca rechaza, y aun asi se captura por si acaso.
 *
 * Solo a la PASAJERA: el conductor es quien provoca estos cambios pulsando los
 * botones, asi que avisarle de lo que acaba de hacer seria ruido.
 */
const TIPO_DE_PUSH_POR_ESTADO = Object.freeze({
  [TRIP_STATUS.DRIVER_ASSIGNED]: PUSH_TYPE.TRIP_ACCEPTED,
  [TRIP_STATUS.ARRIVED]: PUSH_TYPE.TRIP_ARRIVED,
  [TRIP_STATUS.IN_PROGRESS]: PUSH_TYPE.TRIP_STARTED,
  [TRIP_STATUS.COMPLETED]: PUSH_TYPE.TRIP_COMPLETED,
  [TRIP_STATUS.CANCELLED]: PUSH_TYPE.TRIP_CANCELLED
});

function avisarDelCambioDeViaje(trip) {
  const tipo = TIPO_DE_PUSH_POR_ESTADO[normalizeTripStatus(trip?.status)];
  if (!tipo || !trip?.passengerId) return;
  pushService.notifyTripLifecycle(trip, tipo, trip.passengerId).catch(error => {
    console.error(`[+58express Push] rechazo inesperado de notifyTripLifecycle: ${error?.name || 'UNKNOWN'}`);
  });
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = database.users.find(item => item.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'INVALID_SESSION' });
    // Una cuenta eliminada no entra, y no se le dice que esta «desactivada»:
    // ya no existe como cuenta.
    if (user.accountStatus === ESTADO_BORRADO) return res.status(401).json({ error: 'INVALID_SESSION' });
    if (user.accountStatus === 'DISABLED') return res.status(403).json({ error: 'ACCOUNT_DISABLED' });
    // AUTH-FINAL-4: un token firmado ANTES de que cambiaran las credenciales
    // deja de valer. Sin lista negra ni Redis: `requireAuth` ya recarga al
    // usuario en cada peticion, asi que basta comparar con su marca.
    if (!tokenSigueValiendo(user, payload.iat)) {
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'INVALID_SESSION' });
  }
}

/**
 * Exige que la cuenta haya demostrado que un contacto suyo es suyo.
 *
 * EL AGUJERO QUE CIERRA
 *
 * `POST /api/auth/register` crea la cuenta y devuelve el token en el acto. Eso
 * esta bien --la aplicacion necesita sesion para poder pedir el codigo-- pero
 * nadie comprobaba despues si el contacto se habia verificado, asi que con un
 * correo inventado se podia pedir una carrera de verdad, a un conductor de
 * verdad, que se desplaza de verdad. Y sin forma de avisar a nadie despues.
 *
 * POR QUE NO SE MIRA SOLO `emailVerified === true`
 *
 * Porque dejaria fuera a quien no paso por el registro publico. El
 * administrador que se siembra al arrancar y los conductores que crea el
 * panel NO tienen ese campo --ni verdadero ni falso: no existe--, y su
 * identidad esta respaldada por otra via. Solo las cuentas auto-registradas
 * llevan el `false` explicito, y son exactamente las que hay que retener.
 *
 * Un campo ausente es «esta cuenta es anterior a esta comprobacion»; un `false`
 * es «lo sabemos y no lo ha hecho». No es lo mismo y no se tratan igual.
 *
 * QUE NO SE BLOQUEA
 *
 * Ni `/auth/me`, ni pedir o comprobar el codigo, ni salir, ni borrar la cuenta.
 * Bloquear eso dejaria a alguien encerrado: con sesion, sin poder verificarse y
 * sin poder irse.
 */
function contactoSinVerificar(user) {
  if (!user) return false;
  if (user.role === 'admin') return false;
  const declarado = user.emailVerified !== undefined || user.phoneVerified !== undefined;
  if (!declarado) return false;
  return user.emailVerified !== true && user.phoneVerified !== true;
}

/**
 * Si el servidor PUEDE mandar un codigo por algun canal.
 *
 * UNA PUERTA QUE NADIE PUEDE CRUZAR NO SE CIERRA
 *
 * Exigir la verificacion cuando no hay ni un canal configurado dejaria a TODO
 * el mundo fuera y sin salida: nadie podria verificarse, porque no hay como
 * mandarle el codigo. La aplicacion entera quedaria inservible, y por una
 * medida de seguridad que en ese estado no protege de nada --si no se puede
 * mandar un codigo, tampoco se pueden crear cuentas verificadas--.
 *
 * Asi que la guarda se exige cuando se puede satisfacer, y no antes. En
 * staging y en produccion, con el correo configurado, se exige. En una maquina
 * de desarrollo sin proveedor, no.
 *
 * Y NO EN SILENCIO
 *
 * Se dice al arrancar, igual que el modo de Maps. Que una comprobacion de
 * seguridad este apagada tiene que poder leerse en el registro, no deducirse.
 */
function sePuedeVerificar() {
  return verificacion.canalesDisponibles().some(canal => canal.available === true);
}

function requireContactoVerificado(req, res, next) {
  if (sePuedeVerificar() && contactoSinVerificar(req.user)) {
    // El codigo es explicito para que la aplicacion sepa a donde llevar a la
    // persona, en vez de ensenar un «no autorizado» que no dice que hacer.
    return res.status(403).json({ error: 'CONTACT_NOT_VERIFIED' });
  }
  next();
}

/**
 * Resuelve la sesion si la hay, sin exigirla.
 *
 * Postularse a conductor es una ruta PUBLICA a proposito: alguien que todavia
 * no tiene cuenta tiene que poder hacerlo, y para eso manda una contrasena con
 * la que se le crea. Pero quien ya entro en la aplicacion no tiene su
 * contrasena a mano --nadie se la pidio-- y volver a pedirsela para algo que
 * la sesion ya demuestra es friccion inutil.
 *
 * Un token invalido o caducado es como no traer ninguno: la ruta sigue siendo
 * publica y quien llame tendra que identificarse por el otro camino.
 */
function sesionOpcional(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next();
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = database.users.find(item => item.id === payload.sub);
    const utilizable = user
      && user.accountStatus !== 'DISABLED'
      && user.accountStatus !== ESTADO_BORRADO
      && tokenSigueValiendo(user, payload.iat);
    if (utilizable) req.user = user;
  } catch { /* Sin sesion utilizable: se sigue como visitante. */ }
  next();
}

function requireRole(role) {
  return (req, res, next) => req.user?.role === role
    ? next()
    : res.status(403).json({ error: 'FORBIDDEN' });
}

function requireApprovedDriver(req, res, next) {
  if (req.user?.role !== 'driver') return res.status(403).json({ error: 'FORBIDDEN' });
  if (!req.user.isVerified || req.user.status === 'SUSPENDED') return res.status(403).json({ error: 'DRIVER_NOT_APPROVED' });
  next();
}

// Web Push.
//
// El despacho invoca `notifyRideOffer` dentro de `offerNext` (PUSH-3A) como
// aviso de atencion de mejor esfuerzo, sin `await`, para que un proveedor
// lento no pueda robar segundos de la ventana de quince. El despacho solo
// conoce esta operacion semantica: nunca importa web-push, VAPID ni el
// formato de las suscripciones, y por eso FCM/APNs podran sumarse manana
// como transportes del mismo servicio sin tocar la seleccion ni los tiempos.
//
// El adaptador real solo se construye si la funcionalidad esta encendida. Con
// la bandera apagada --que es el valor por defecto y el estado de produccion--
// no se lee ninguna variable VAPID, no se configura nada y no existe forma de
// contactar con un proveedor.
function construirPushSender() {
  // Dos transportes, cada uno con su credencial, compuestos en UN sender.
  // Push queda encendido si al menos uno esta configurado; el otro se omite
  // sin penalizar a nadie. Ver `services/pushSender.js`.
  const webpush = construirWebPushSender();
  const fcm = construirFcmSender();
  const compuesto = crearSenderCompuesto({ webpush, fcm });
  if (compuesto.enabled) console.log(`[+58express Push] transportes activos: ${compuesto.transportes.join(', ')}`);

  // SI SE EXIGE VERIFICAR EL CONTACTO, DICHO EN VOZ ALTA.
  //
  // Apagada, cualquiera se registra con un correo inventado y pide una carrera
  // de verdad. Que este apagada es legitimo --sin canal no hay forma de
  // verificarse-- pero no puede ser una sorpresa.
  if (sePuedeVerificar()) {
    console.log('[+58express Auth] verificacion de contacto EXIGIDA para pedir viajes y gastar');
  } else {
    console.log('[+58express Auth] verificacion de contacto NO exigida: no hay ningun canal para mandar codigos');
  }

  // COMO SE AUTENTICA MAPS, DICHO EN VOZ ALTA
  //
  // No es informacion decorativa: en `api-key` las llamadas dependen de que
  // la IP publica este en la lista de Google, y esta IP la mueve la VPN.
  // Quien vea rutas cayendo sin motivo mira esta linea primero.
  if (authDeMaps.modo === MODO_DE_AUTH.OAUTH) {
    console.log('[+58express Maps] autenticacion: OAuth con cuenta de servicio (no depende de la IP)');
  } else if (authDeMaps.modo === MODO_DE_AUTH.API_KEY) {
    console.log('[+58express Maps] autenticacion: clave de API (RESPALDO: depende de la IP permitida en Google Cloud)');
  } else {
    console.log('[+58express Maps] sin autenticacion: las rutas caen a la medida geodesica');
  }
  return { sender: compuesto.sender, enabled: compuesto.enabled };
}

/**
 * El emisor de FCM V1 para los telefonos (PUSH-1 · Firebase).
 *
 * DOS CAMINOS, Y EL FICHERO VA PRIMERO
 *
 * En local, un fichero que git ignora --por omision
 * `server/fcm-service-account.json`, o la ruta de FCM_SERVICE_ACCOUNT_FILE--.
 * Es explicito y se ve en el disco de quien programa.
 *
 * En Railway no hay donde montar un fichero: la imagen no copia ninguna
 * credencial a proposito --meterla dejaria una clave privada en cada capa y en
 * el registro de contenedores-- asi que la cuenta llega por
 * FCM_SERVICE_ACCOUNT_B64, en base64 y decodificada EN MEMORIA.
 *
 * Base64 y no JSON crudo por lo mismo que en Maps: un JSON de varias lineas en
 * el entorno acaba mal escapado y, peor, acaba impreso el dia que alguien
 * vuelca el entorno para depurar. Es la misma convencion que
 * GOOGLE_MAPS_SERVICE_ACCOUNT_B64, y eso es deliberado: una sola forma de dar
 * una cuenta de servicio es una sola forma de equivocarse.
 *
 * Sin ninguna de las dos, FCM queda apagado y se dice. Nada se cae.
 */
function construirFcmSender() {
  const ruta = process.env.FCM_SERVICE_ACCOUNT_FILE || path.join(serverDir, 'fcm-service-account.json');
  const enBase64 = process.env.FCM_SERVICE_ACCOUNT_B64;
  const hayFichero = fs.existsSync(ruta);

  if (!hayFichero && !enBase64) {
    console.log('[+58express Push] FCM apagado: sin cuenta de servicio');
    return null;
  }
  try {
    // El fichero manda: se le pasa `cuentaEnBase64: null` a proposito, porque
    // si no la funcion tomaria la variable de entorno por su cuenta y el
    // fichero de quien programa dejaria de tener efecto.
    const sender = hayFichero
      ? createFcmSender({ rutaDeLaCuenta: ruta, cuentaEnBase64: null, logger: console })
      : createFcmSender({ cuentaEnBase64: enBase64, logger: console });
    console.log(`[+58express Push] FCM configurado (${hayFichero ? 'fichero' : 'entorno'})`);
    return sender;
  } catch (error) {
    // El codigo es escueto y nunca lleva material de la cuenta dentro. Los
    // NOMBRES de los campos que fallan si viajan: son lo unico que permite
    // diagnosticar «valida en mi portatil, invalida en el servidor» sin llegar
    // a imprimir la credencial.
    const campos = Array.isArray(error.campos) && error.campos.length > 0
      ? ` (campos: ${error.campos.join(', ')})`
      : '';
    // Si fallan TODOS los campos, lo que llego no es la cuenta y hay que saber
    // que es. Los NOMBRES de las claves presentes lo dicen sin publicar ningun
    // valor: una cuenta de servicio real trae `type`, `project_id`, `auth_uri`…
    const claves = Array.isArray(error.claves) && error.claves.length > 0
      ? ` (claves recibidas: ${error.claves.join(', ')})`
      : '';
    const via = hayFichero ? 'fichero' : 'entorno';
    console.error(`[+58express Push] cuenta de servicio de FCM invalida por ${via}: ${error.message}${campos}${claves}. FCM queda DESACTIVADO.`);
    return null;
  }
}

function construirWebPushSender() {
  if (!isWebPushEnabled()) return null;
  try {
    const sender = createWebPushSender({
      publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
      privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
      subject: process.env.WEB_PUSH_VAPID_SUBJECT,
      logger: console
    });
    console.log('[+58express Push] Web Push configurado');
    return sender;
  } catch (error) {
    // Falla cerrado, pero SIN tumbar el servidor.
    //
    // Push es entrega auxiliar de mejor esfuerzo: dejar sin servicio el
    // despacho de carreras de toda la plataforma porque falta una clave de
    // notificaciones seria desproporcionado, y contradice la regla que rige
    // desde PUSH-1 --un fallo de push nunca puede impedir que se cree y
    // despache un viaje--.
    //
    // Lo que si se apaga es push ENTERO, no solo el envio: con `enabled` en
    // falso el alta de suscripciones tambien se rechaza. Aceptar endpoints
    // para una funcionalidad que no puede entregar seria acumular material
    // sensible a cambio de nada.
    //
    // El codigo es escueto y nunca lleva material de clave dentro.
    console.error(`[+58express Push] configuracion VAPID invalida: ${error.message}. Web Push queda DESACTIVADO.`);
    return null;
  }
}

// DISPATCH-2A: ranking por ETA real de carretera, DORMIDO por defecto
// (DISPATCH_ROUTE_MATRIX_ENABLED=false). Solo reordena a los YA elegibles;
// cualquier fallo devuelve el orden actual y el despacho ni se entera.
const dispatchRanker = createDispatchRanker();

const { sender: pushSender, enabled: pushEnabled } = construirPushSender();

const pushService = createPushNotificationService({
  database,
  persistRecord,
  sender: pushSender,
  enabled: pushEnabled,
  logger: console,
  /**
   * Cuantos sockets vivos tiene esa persona AHORA.
   *
   * Sale de SU sala, que es estado del servidor: ningun cliente puede
   * declararse presente para silenciarse los avisos. Solo se usa para suprimir
   * el aviso de un mensaje de chat, que es el unico que se puede permitir
   * perder; las ofertas y los cambios de estado del viaje no se suprimen nunca.
   */
  contarConexiones: async userId => {
    try {
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      return sockets.length;
    } catch {
      return 0;
    }
  }
});

app.use('/api', createPushRouter({
  database,
  persistHttp,
  requireAuth,
  pushService
}));

// OFFLINE-TRIP-1A: reconciliacion idempotente de acciones del conductor
// registradas sin conexion. Usa LA MISMA transicion de negocio que el evento
// de socket en linea (aplicar/anunciar) — un solo juego de reglas.
app.use('/api', createTripOfflineEventsRouter({
  database,
  requireAuth,
  requireApprovedDriver,
  applyTransition: (trip, status, driverId) => aplicarTransicionDelConductor(trip, status, driverId),
  announceTransition: (trip, settlement) => anunciarTransicionDelConductor(trip, settlement),
  persistDatabase
}));

app.use('/api', createDriverApplicationsRouter({
  database,
  persistDatabase,
  publicUser,
  signToken,
  requireAuth,
  sesionOpcional,
  requireRole,
  io,
  bcrypt,
  privateStorage,
  authIdentities: identidad
}));

// AUTH-FINAL-1: codigos de verificacion, Google/Apple y vinculacion. Al lado
// del login y el registro, que siguen tal cual.
app.use('/api', createAuthRouter({
  database,
  persistDatabase,
  publicUser,
  signToken,
  requireAuth,
  sesionOpcional,
  identidad,
  verificacion,
  verificadorSocial,
  limitadores: {
    desafio: credenciales.desafio,
    verificacion: credenciales.verificacion,
    social: credenciales.social,
    identidades: credenciales.identidades,
    borrado: credenciales.borrado
  },
  bcrypt,
  sanitizeText,
  privateStorage
}));

// SAFE-TRANSPORT-1E: el puente al MOTOR DE VIAJES existente. El traslado
// programado se convierte, a su hora, en UN viaje normal — y desde ahí mandan
// la maquinaria de siempre: tarjeta activa, chat, GPS, navegación MAPS-2C,
// transiciones del conductor, OFFLINE-TRIP-1, tarifa y liquidación. El
// candado de exactamente-una-vez es el identificador DETERMINISTA del viaje
// (`trip_sched_<rideId>`, clave primaria en Postgres) más la referencia
// `scheduledRideId`: tras cualquier caída, la reconciliación ENCUENTRA el
// viaje existente en vez de crear otro.
const safeTransportTripBridge = {
  findTripForRide: ride => database.trips.find(t =>
    t.id === `trip_sched_${ride.id}` || t.scheduledRideId === ride.id) ?? null,
  driverById: id => database.users.find(u => u.id === id && u.role === 'driver') ?? null,
  driverHasActiveTrip: driverId => Boolean(activeTripForDriver(driverId)),
  tripStatusOf: tripId => {
    const trip = database.trips.find(t => t.id === tripId);
    return trip ? normalizeTripStatus(trip.status) : null;
  },
  async createTripForRide({ ride, driver = null }) {
    const pickup = normalizeLocation(ride.pickup);
    const destination = normalizeLocation(ride.destination);
    if (!pickup || !destination) return { ok: false, code: 'INVALID_ROUTE' };
    const passenger = database.users.find(u => u.id === ride.passengerId);
    if (!passenger) return { ok: false, code: 'PASSENGER_NOT_FOUND' };

    // Métricas estimadas por el servidor con el estimador urbano EXISTENTE
    // (haversine × 1.35, el mismo del radio de despacho) y 25 km/h de
    // velocidad urbana. Las REGLAS de tarifa son las de siempre
    // (calculateFare + pricingConfig); solo cambia la fuente de las métricas,
    // y queda marcada en el documento.
    const distanceKm = Math.round(calculateDistance(pickup.lat, pickup.lng, destination.lat, destination.lng) * 100) / 100;
    const durationMin = Math.max(1, Math.round((distanceKm / 25) * 60));
    const instante = new Date().toISOString();
    const cobroPorWallet = safeTransport.billingEnabled;
    const trip = {
      id: `trip_sched_${ride.id}`,   // determinista: EL candado de unicidad
      scheduledRideId: ride.id,      // referencia de auditoría y reconciliación
      pickup: tripLocation(pickup),
      destination: tripLocation(destination),
      rideType: ride.vehiclePreference === 'CAR' ? 'CAR' : 'MOTO',
      // SAFE-2A: con la facturación del plan encendida, la carrera se paga de
      // la WALLET de la clienta al completarse (80% conductor / % plataforma
      // del plan). Apagada, sigue el efectivo del piloto inicial.
      paymentMethod: cobroPorWallet ? PAYMENT_METHODS.WALLET : PAYMENT_METHODS.CASH,
      exchangeRateType: 'BCV',
      distanceKm,
      durationMin,
      passengerId: ride.passengerId,
      passengerName: `${passenger.firstName || ''} ${passenger.lastName || ''}`.trim() || 'Pasajero',
      passengerAvatar: null,
      passengerRating: Number(passenger.rating || 0),
      driverId: null,
      status: TRIP_STATUS.SEARCHING,
      createdAt: instante,
      updatedAt: instante,
      statusHistory: [{ status: TRIP_STATUS.SEARCHING, at: instante, actorId: 'system:safe-transport' }]
    };
    if (cobroPorWallet) {
      // Tarifa FIJA por categoría (config del admin) — el precio pactado del
      // plan, no el metro del taxímetro.
      const pricing = safeTransport.getEffectivePricing();
      trip.fareUSD = pricing.perRide[trip.rideType === 'CAR' ? 'CAR' : 'MOTO'];
      trip.fareVES = roundMoney(trip.fareUSD * Number(pricingConfig.bcvRate || 0));
      trip.fareSource = 'SUBSCRIPTION_FIXED';
      trip.commissionRate = pricing.platformFeeRate;
      // Cero deuda: sin saldo para ESTA carrera, el viaje no nace.
      try {
        ensureWalletCanCoverTrip(trip, passenger);
      } catch (error) {
        return { ok: false, code: 'INSUFFICIENT_WALLET_BALANCE', required: error.required, balance: error.balance };
      }
    } else {
      trip.pricing = calculateFare({
        distanceKm, durationMin, exchangeRateType: 'BCV', rideType: trip.rideType
      }, pricingConfig);
      trip.fareUSD = trip.pricing.fareUSD;
      trip.fareVES = trip.pricing.fareVES;
      trip.fareSource = 'SERVER_CALCULATED';
    }
    trip.routeMetricsSource = 'HAVERSINE_URBAN_ESTIMATE';

    if (driver) {
      // La MISMA máquina de estados canónica del viaje: SEARCHING →
      // DRIVER_ASSIGNED, con el conductor comprometido de SAFE-1D.
      transitionTrip(trip, TRIP_STATUS.DRIVER_ASSIGNED, { actorId: driver.id, actorRole: 'driver' });
      trip.driver = driverPublicSummary(driver);
      trip.driverId = driver.id;
    }

    database.trips.push(trip);
    if (!await persistRecord('trips', trip)) {
      database.trips.splice(database.trips.indexOf(trip), 1);
      return { ok: false, code: 'DATABASE_WRITE_FAILED' };
    }
    return { ok: true, trip };
  },
  async announceAssignedTrip(trip) {
    // El mismo anuncio que la aceptación atómica del despacho: participantes
    // y administración. Un conductor sin socket lo verá al reconectar por
    // /api/trips/active/me (ventana de 12 h de la app actual).
    const driver = database.users.find(u => u.id === trip.driverId);
    if (driver) {
      driver.status = DRIVER_STATUS.BUSY;
      await persistRecord('users', driver);
    }
    io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).to('admins').emit('tripStatusUpdated', {
      tripId: trip.id,
      status: 'EN_ROUTE',
      canonicalStatus: trip.status,
      updatedAt: trip.updatedAt,
      driver: trip.driver ?? null
    });
    avisarDelCambioDeViaje(trip);
  },
  dispatchTrip: trip => dispatchTripToDrivers(trip)
};

// SAFE-TRANSPORT-1C: suscripciones del traslado recurrente y materializador
// idempotente. TODO detrás de SAFE_TRANSPORT_ENABLED (apagada por defecto):
// sin bandera no hay API ni pasadas. Sin ofertas a conductores, sin traspaso
// a viajes y sin consumo de créditos en esta fase.
/**
 * Entrega de los avisos del Transporte Seguro. El motor decide QUÉ se avisa;
 * esta frontera decide CÓMO llega: en vivo a la app abierta y, en lo
 * accionable, al teléfono. Ambas vías son mejor esfuerzo — un socket muerto o
 * un proveedor de push lento no pueden robarle tiempo al motor de cobertura,
 * así que el push va sin `await`, igual que en el despacho inmediato.
 */
const safeTransportNotifier = {
  live(userId, doc) {
    io.to(`user:${userId}`).emit('platform:notification', {
      id: doc.id,
      title: doc.title,
      message: doc.message,
      category: doc.category,
      event: doc.event,
      createdAt: doc.createdAt,
      read: false
    });
  },
  push(userId, tipo, tripId) {
    pushService.notifyScheduledEvent(userId, tipo, tripId)
      .catch(error => console.error(`[+58express Push] aviso programado no enviado: ${error?.name || 'UNKNOWN'}`));
  }
};

const safeTransport = createSafeTransportService({
  database,
  persistRecord,
  tripBridge: safeTransportTripBridge,
  notifier: safeTransportNotifier,
  // SAFE-2A: las tarifas del plan llegan por función para que la edición del
  // admin rija EN CALIENTE, sin reiniciar.
  getPricing: () => safeTransportPricing,
  logger: console
});
app.use('/api', createTransportSubscriptionsRouter({
  safeTransport,
  requireAuth,
  requirePassenger: requireRole('passenger')
}));
// SAFE-1D: participación y consentimiento del conductor (opt-in, ofertas,
// accept/decline/withdraw). Misma bandera, mismo motor, cero handoff.
app.use('/api', createTransportDriverRouter({
  safeTransport,
  requireAuth,
  requireApprovedDriver
}));
safeTransport.startMaterializer();

// Driver Dispatch Registry & Atomic Lock Map
const driverRegistry = new Map();
const tripLocks = new Map();
const dispatchTimers = new Map();
const dispatchSessions = new Map();

// La distancia por calle vive ahora en domain/tripMetrics.js, que la comparten
// el radio de despacho, el estimador de viajes programados y el precio. Se
// importa arriba: aqui habia una copia de la formula.

function normalizeLocation(location) {
  const coordinates = normalizeCoordinates(location);
  if (!coordinates) return null;
  return { ...location, lat: coordinates.lat, lng: coordinates.lng };
}

/** Proyección de una ubicación de viaje: nada más que el recorrido. */
function tripLocation(location) {
  if (!location) return null;
  return {
    address: sanitizeText(location.address, 240),
    lat: location.lat,
    lng: location.lng,
    accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
    source: sanitizeText(location.source, 20) || 'gps'
  };
}

// Un conductor solo existe para administración, para sí mismo y para el
// pasajero con el que comparte un viaje activo. Ese es el alcance máximo de
// cualquier evento de flota.
// La lista de estados vivia aqui a mano y en `/api/trips/active/me` por
// separado, con ventanas distintas. Ahora las dos preguntan a `domain/viajeActivo`,
// que es la unica autoridad: si divergen, un conductor puede quedar ocupado por
// un viaje que su propia aplicacion ya no le ensenia.
function activeTripForDriver(driverId) {
  return viajeQueOcupaAlConductor(database.trips, driverId);
}

function emitDriverPresence(driver, { includeActivePassenger = true } = {}) {
  if (!driver?.id) return;
  const summary = { driverId: driver.id, userId: driver.id, status: driver.status || 'OFFLINE' };
  let audience = io.to('admins').to(`user:${driver.id}`);
  const activeTrip = includeActivePassenger ? activeTripForDriver(driver.id) : null;
  if (activeTrip?.passengerId) audience = audience.to(`user:${activeTrip.passengerId}`);
  audience.emit('driverStatusChanged', summary);
  // El perfil completo (correo, teléfono, cédula, documentos) es exclusivo de
  // administración; el resto de la flota solo recibe el resumen de estado.
  io.to('admins').emit('admin:driver_updated', publicUser(driver));
}

function userCanAccessTrip(userId, role, trip) {
  return role === 'admin' || trip?.passengerId === userId || trip?.driverId === userId;
}

function emitDriverLocation(driverId, location) {
  const payload = { ...location, driverId, userId: driverId };
  const activeTrip = activeTripForDriver(driverId);
  io.to('admins').to(`user:${driverId}`).emit('driverLocationUpdated', {
    ...payload,
    tripId: activeTrip?.id || null
  });
  if (activeTrip) {
    io.to(`user:${activeTrip.passengerId}`).emit('driverLocationUpdated', {
      ...payload,
      tripId: activeTrip.id
    });
  }
  // El mapa de flota es una pantalla exclusiva de administración.
  io.to('admins').emit('admin:driver_location', payload);
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '+58express Real Backend Server Active 🇻🇪',
    features: {
      livePassengerGpsOrigin: true,
      idempotentWalletRideSettlement: true,
      resilientDriverApplications: true,
      driverCommissionDebtLedger: true
    },
    timestamp: Date.now()
  });
});

/**
 * Comprobar que la observabilidad funciona de verdad.
 *
 * POR QUÉ HACE FALTA UN ENDPOINT PARA ESTO
 *
 * Porque «Sentry está configurado» y «los errores llegan a Sentry» son dos
 * afirmaciones distintas, y sólo la segunda sirve de algo. Entre las dos hay un
 * DSN mal copiado, una red que bloquea la salida, un `beforeSend` que devuelve
 * `null` por un fallo propio, o un proyecto equivocado. Todo eso compila,
 * arranca y no dice nada.
 *
 * POR QUÉ NO ES UNA PUERTA TRASERA
 *
 * Tres cierres, y hacen falta los tres:
 *
 *   1. NO EXISTE en producción. La ruta ni se registra —no es que responda 403:
 *      es que no está—, así que no hay nada que descubrir escaneando.
 *   2. Exige sesión de administración.
 *   3. No hace nada. Lanza un error, lo manda y responde. No lee ni escribe
 *      datos, no toca la base y no cambia ningún estado.
 *
 * Lo que devuelve es el identificador del evento, para poder buscarlo en Sentry
 * y confirmar que llegó de verdad en vez de suponerlo.
 */
const EN_PRODUCCION_DE_VERDAD = String(process.env.SENTRY_ENVIRONMENT ?? process.env.RAILWAY_ENVIRONMENT_NAME ?? '')
  .trim().toLowerCase() === 'production';

if (!EN_PRODUCCION_DE_VERDAD) {
  app.post('/api/diagnostico/prueba', requireAuth, requireRole('admin'), (req, res) => {
    const marca = `prueba-${Date.now()}`;
    const error = new Error(`Error de prueba de observabilidad (${marca})`);
    error.name = 'PruebaDeObservabilidad';
    capturarExcepcion(error, {
      usuario: { id: req.user.id, role: req.user.role },
      etiquetas: { area: 'diagnostico', prueba: 'manual' },
      extra: { marca }
    });
    res.json({ status: 'sent', marca, observabilidad: observabilidad.activo, entorno: observabilidad.entorno });
  });
}

app.get('/api/pricing/config', requireAuth, (req, res) => res.json(pricingConfig));

/**
 * Cuanto cuesta ir de un sitio a otro.
 *
 * EL CLIENTE DICE DONDE, NO CUANTO
 *
 * Antes recibia `distanceKm` y `durationMin` del telefono y calculaba la tarifa
 * con ellos. El precio lo ponia el servidor, si, pero con la regla que le
 * prestaba el cliente: declarar cuatro kilometros donde hay uno cambiaba el
 * importe.
 *
 * Ahora recibe los dos PUNTOS y mide el recorrido el mismo. Lo que llegue en
 * `distanceKm`, `durationMin` o `fareUSD` se ignora por completo.
 *
 * `requestedAt` tambien lo pone el servidor: si lo pusiera el cliente, bastaria
 * declarar las tres de la tarde para esquivar el recargo nocturno.
 */
// Va con la guarda porque cada estimacion puede ser una llamada DE PAGO a
// Google: sin ella, una cuenta inventada gasta la factura de mapas sin pedir
// jamas una carrera.
app.post('/api/pricing/estimate', requireAuth, requireContactoVerificado, limitadores.telemetria, async (req, res) => {
  const pickup = normalizeLocation(req.body.pickup ?? req.body.origin);
  const destination = normalizeLocation(req.body.destination);
  if (!pickup || !destination) {
    return res.status(400).json({ error: 'VALID_GPS_COORDINATES_REQUIRED' });
  }

  let metrics;
  try {
    metrics = await medirRecorrido(pickup, destination);
  } catch (error) {
    return res.status(400).json({ error: error.code || 'INVALID_ROUTE_METRICS' });
  }

  const fare = calculateFare({
    distanceKm: metrics.distanceKm,
    durationMin: metrics.durationMin,
    requestedAt: new Date(),
    exchangeRateType: req.body.exchangeRateType || 'BCV',
    rideType: req.body.rideType || 'MOTO'
  }, pricingConfig);

  res.json({ ...fare, metricsSource: metrics.source });
});

app.post('/api/auth/login', credenciales.login, async (req, res) => {
  const { identifier, phone, email, password, role } = req.body;
  const loginId = String(identifier || phone || email || '').trim().toLowerCase();
  const identityUser = database.users.find(item =>
    [item.email, item.phone].filter(Boolean).some(value => String(value).trim().toLowerCase() === loginId)
  );
  if (identityUser?.accountStatus === 'DISABLED') return res.status(403).json({ error: 'ACCOUNT_DISABLED' });
  // Una cuenta eliminada no se distingue de una que no existe: decir «esta
  // eliminada» confirmaria que ese correo estuvo registrado.
  if (identityUser?.accountStatus === ESTADO_BORRADO) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  if (!identityUser || !identityUser.passwordHash || !await bcrypt.compare(String(password || ''), identityUser.passwordHash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  if (role === 'driver' && identityUser?.role === 'passenger' && identityUser.driverApplicationId) {
    const application = database.driverApplications.find(item => item.id === identityUser.driverApplicationId);
    return res.status(403).json({ error: 'DRIVER_APPLICATION_NOT_APPROVED', applicationStatus: application?.status || 'pending' });
  }
  const user = identityUser && (!role || identityUser.role === role) ? identityUser : null;
  if (!user) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  // AUTH-FINAL-1: se anota el uso de la identidad PASSWORD. Si no se pudiera
  // guardar, el login sigue siendo el de siempre: esto es contabilidad, no
  // autorizacion.
  identidad.identidades.marcarUso(identidad.identidades.asegurarDeContrasena(user).identidad);
  await persistDatabase();
  res.json({ status: 'success', user: publicUser(user), token: signToken(user) });
});

app.post('/api/auth/register', credenciales.registro, async (req, res) => {
  const {
    email, phone, password, role = 'passenger', firstName, lastName
  } = req.body;
  const normalizedFirstName = sanitizeText(firstName, 80);
  const normalizedLastName = sanitizeText(lastName, 80);
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = String(phone || '').trim();
  const phoneDigits = normalizedPhone.replace(/\D/g, '');
  const fields = {};
  if (role !== 'passenger') fields.role = 'El registro directo solamente permite cuentas de cliente.';
  if (normalizedFirstName.length < 2) fields.firstName = 'El nombre es obligatorio.';
  if (normalizedLastName.length < 2) fields.lastName = 'El apellido es obligatorio.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) fields.email = 'Introduce una dirección de correo válida.';
  if (phoneDigits.length < 10 || phoneDigits.length > 15) fields.phone = 'Introduce un teléfono válido.';
  if (String(password || '').length < 8) fields.password = 'La contraseña debe tener al menos 8 caracteres.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'VALIDATION_FAILED', fields });
  const duplicate = database.users.some(user => user.email?.toLowerCase() === normalizedEmail || String(user.phone || '').replace(/\D/g, '') === phoneDigits);
  if (duplicate) return res.status(409).json({ error: 'USER_EXISTS' });
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 12);
  if (database.users.some(existing => existing.email?.toLowerCase() === normalizedEmail || String(existing.phone || '').replace(/\D/g, '') === phoneDigits)) return res.status(409).json({ error: 'USER_EXISTS' });
  const user = {
    id: `passenger_${crypto.randomUUID()}`,
    role: 'passenger',
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    email: normalizedEmail,
    phone: normalizedPhone,
    passwordHash,
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
  // AUTH-FINAL-1: la identidad PASSWORD y los contactos declarados, SIN
  // verificar. Aparecer en el registro no demuestra posesion.
  const alta = identidad.altaConContrasena(user, {
    email: normalizedEmail,
    phoneE164: normalizarTelefono(normalizedPhone).e164
  });
  if (!await persistHttp(res)) {
    alta.deshacer();
    database.users.splice(database.users.indexOf(user), 1);
    return;
  }
  res.status(201).json({ status: 'created', user: publicUser(user), token: signToken(user) });
});

app.get('/api/auth/me', requireAuth, credenciales.sesion, (req, res) => res.json(publicUser(req.user)));

app.patch('/api/auth/me', requireAuth, credenciales.perfil, async (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'cedula', ...(req.user.role === 'driver' ? ['vehicleBrand', 'vehicleModel', 'vehiclePlate', 'vehicleColor'] : [])];
  for (const key of allowed) {
    if (!(key in req.body)) continue;
    const value = sanitizeText(req.body[key], key === 'phone' ? 30 : 100);
    if (['firstName','lastName'].includes(key) && value.length < 2) return res.status(400).json({ error:'VALIDATION_FAILED', fields:{[key]:'Campo obligatorio.'} });
    if (key === 'phone' && (value.replace(/\D/g,'').length < 10 || value.replace(/\D/g,'').length > 15)) return res.status(400).json({ error:'VALIDATION_FAILED', fields:{phone:'Teléfono inválido.'} });
    if (key === 'phone' && database.users.some(user => user.id !== req.user.id && String(user.phone || '').replace(/\D/g,'') === value.replace(/\D/g,''))) return res.status(409).json({ error:'USER_EXISTS' });
    req.user[key] = key === 'vehiclePlate' ? value.toUpperCase() : value;
  }
  req.user.updatedAt = new Date().toISOString();
  if (!await persistHttp(res)) return;
  res.json(publicUser(req.user));
});

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype))
}).single('file');

app.post('/api/auth/me/photo', requireAuth, limitadores.subidas, profilePhotoUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'INVALID_PROFILE_PHOTO' });
  let storageKey;
  try { storageKey = privateStorage.save(req.file, req.user.id); }
  catch (error) { return res.status(400).json({ error: error.code || 'UPLOAD_FAILED' }); }
  if (req.user.photoStorageKey) privateStorage.remove(req.user.photoStorageKey);
  req.user.photoStorageKey = storageKey;
  req.user.photoMimeType = req.file.mimetype;
  req.user.photoSize = req.file.size;
  req.user.photoUrl = userPhotoUrl(req.user);
  req.user.updatedAt = new Date().toISOString();
  if (!await persistHttp(res)) {
    privateStorage.remove(storageKey);
    return;
  }
  res.json(publicUser(req.user));
});

app.get('/api/users/:id/photo', requireAuth, limitadores.archivos, (req, res) => {
  // Una única respuesta para todo lo que no sea un acceso legítimo. Quien no
  // está autorizado no puede distinguir si la persona existe, si tiene
  // fotografía o si compartió alguna vez un viaje: un identificador
  // inexistente, uno malformado y uno ajeno responden exactamente igual.
  const accessDenied = () => res.status(403).json({ error: 'PHOTO_FORBIDDEN' });

  const user = database.users.find(item => item.id === req.params.id);
  const decision = canViewUserPhoto({
    viewer: req.user,
    targetId: user?.id,
    trips: database.trips
  });
  if (!decision.allowed) return accessDenied();

  // A partir de aquí quien pregunta sí tiene derecho a saber que no hay foto.
  const image = privateStorage.readImage(user.photoStorageKey, user.photoMimeType);
  if (!image) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });

  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Length', String(image.buffer.length));
  // Contenido privado: nunca en caché de disco, de memoria ni de intermediarios.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.end(image.buffer);
});

// Lee de disco en cada peticion, igual que la foto de perfil: misma categoria
// de limitador --`archivos`-- y mismo orden, detras de `requireAuth` para que
// cuente por cuenta. El trafico que no llega a autenticarse lo acota
// `guardiaMedios`, montado sobre el prefijo mas arriba.
app.get('/api/chat-media/:id/content', requireAuth, limitadores.archivos, (req, res) => {
  // Una unica respuesta para todo lo que no sea un acceso legitimo: un
  // identificador inexistente, uno malformado y uno ajeno son indistinguibles.
  const accessDenied = () => res.status(403).json({ error: 'CHAT_MEDIA_FORBIDDEN' });

  // Se localiza el mensaje por igualdad exacta de imageRef.id. El identificador
  // publico nunca se convierte en una ruta: la clave la aporta el registro.
  const encontrado = findMessageByMediaId({
    id: req.params.id,
    messages: database.messages,
    supportMessages: database.supportMessages
  });
  if (!encontrado) return accessDenied();

  // La autorizacion se decide antes de tocar imageStorageKey.
  const autorizado = canViewChatMedia({
    viewer: req.user,
    message: encontrado.message,
    channel: encontrado.channel,
    trips: database.trips
  });
  if (!autorizado) return accessDenied();

  // A partir de aqui quien pregunta si tiene derecho a saber que no hay archivo.
  const image = chatMediaStorage.readImage(encontrado.message.imageStorageKey, encontrado.message.imageRef?.mimeType);
  if (!image) return res.status(404).json({ error: 'CHAT_MEDIA_NOT_FOUND' });

  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Length', String(image.buffer.length));
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.end(image.buffer);
});

// El listado devolvia la coleccion entera: 7 MB con el volumen de seis meses,
// medido contra el servidor real, y el filtrado y la busqueda ocurrian despues
// en el navegador, de modo que buscar a una persona por su placa obligaba a
// descargar antes a los 25 000 usuarios.
//
// Admite los dos modos de recorrido: `page` para el paginador numerado de la
// pantalla de gestion, y `cursor` para quien solo necesite iterar.
app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  let limit;
  let page;
  let filters;
  try {
    limit = parseLimit(req.query.limit, USERS_PAGE);
    page = parsePage(req.query.page);
    filters = parseUserFilters(req.query);
  } catch (error) {
    return res.status(400).json({ error: error.code || 'INVALID_QUERY' });
  }

  // Se filtra sobre el registro completo --hace falta `isVerified`, que la
  // proyeccion publica no expone-- y solo se proyecta la pagina resultante.
  const filtrados = filterUsers(database.users, filters);

  try {
    const cursor = req.query.cursor;
    const pagina = cursor
      ? paginate(filtrados, { limit, cursor, sortKeyOf: user => user.createdAt || '' })
      : paginateByPage(filtrados, { limit, page, sortKeyOf: user => user.createdAt || '' });
    return res.json({ ...pagina, items: pagina.items.map(publicUser) });
  } catch (error) {
    return res.status(400).json({ error: error.code || 'INVALID_CURSOR' });
  }
});

app.get('/api/admin/overview', requireAuth, requireRole('admin'), limitadores.resumenes, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const activeStatuses = ['SEARCHING', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'];
  const completedToday = database.trips.filter(trip => trip.status === 'COMPLETED' && String(trip.completedAt || trip.closedAt || trip.updatedAt || '').startsWith(today));
  const grossToday = completedToday.reduce((sum, trip) => sum + Number(trip.fareUSD || trip.fareEUR || trip.pricing?.fareUSD || 0), 0);
  const drivers = database.users.filter(user => user.role === 'driver');
  const ratings = database.trips.flatMap(trip => [trip.driverRating, trip.passengerRating]).filter(Number.isFinite);
  res.json({
    activeTrips: database.trips.filter(trip => activeStatuses.includes(trip.status)).length,
    completedToday: completedToday.length,
    grossToday: Math.round(grossToday * 100) / 100,
    commissionToday: Math.round(grossToday * Number(pricingConfig.commissionRate || 0.15) * 100) / 100,
    drivers: {
      total: drivers.length,
      available: drivers.filter(driver => ['AVAILABLE', 'ONLINE'].includes(driver.status)).length,
      busy: drivers.filter(driver => ['BUSY', 'IN_TRIP'].includes(driver.status)).length,
      offline: drivers.filter(driver => !['AVAILABLE', 'ONLINE', 'BUSY', 'IN_TRIP'].includes(driver.status)).length
    },
    // Cifras globales de la pantalla de gestion. Son independientes de los
    // filtros que tenga puestos quien mira, asi que no pueden salir de una
    // pagina del listado: pertenecen aqui.
    customers: (() => {
      const clientes = database.users.filter(user => ['driver', 'passenger'].includes(user.role));
      return {
        total: clientes.length,
        drivers: clientes.filter(user => user.role === 'driver').length,
        passengers: clientes.filter(user => user.role === 'passenger').length,
        suspended: clientes.filter(isSuspended).length
      };
    })(),
    driverApplications: {
      total: database.driverApplications.length,
      pending: database.driverApplications.filter(item => item.status === 'pending').length,
      needsChanges: database.driverApplications.filter(item => item.status === 'needs_changes').length
    },
    walletRequests: {
      pendingTopups: database.transactions.filter(item => item.type === 'TOP_UP' && item.status === 'PENDING').length,
      pendingPayouts: database.transactions.filter(item => item.type === 'PAYOUT' && item.status === 'PENDING').length
    },
    averageRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 : null,
    bcvRate: Number(pricingConfig.bcvRate || 0)
  });
});

app.get('/api/drivers/nearby', requireAuth, limitadores.cercania, (req, res) => {
  const drivers = database.users.filter(user => user.role === 'driver');
  if (req.user.role === 'admin') {
    return res.json(drivers.map(driver => ({
      ...publicUser(driver),
      ...(driver.location || {}),
      driverId: driver.id,
      driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim()
    })));
  }

  res.json(drivers
    .filter(driver => ['AVAILABLE', 'ONLINE'].includes(driver.status) && Number.isFinite(driver.location?.lat) && Number.isFinite(driver.location?.lng))
    .map(driver => ({
      id: driver.id,
      driverId: driver.id,
      firstName: driver.firstName || 'Conductor',
      rating: Number(driver.rating || 0),
      vehicleType: driver.vehicleType || 'MOTO',
      status: driver.status,
      lat: driver.location.lat,
      lng: driver.location.lng,
      heading: Number(driver.location.heading || 0),
      updatedAt: driver.location.updatedAt || null
    })));
});

// SAFE-2A: tarifas del plan de Transporte Seguro — el ADMIN las lee y las
// edita aquí (tarifa fija por categoría + % de la plataforma). Persisten en
// settings y rigen EN CALIENTE para las próximas carreras del plan.
app.get('/api/admin/safe-transport/pricing', requireAuth, requireRole('admin'), limitadores.administracion, (_req, res) => {
  res.json(safeTransportPricing);
});

app.patch('/api/admin/safe-transport/pricing', requireAuth, requireRole('admin'), limitadores.administracion, async (req, res) => {
  const propuesta = {
    perRide: {
      MOTO: req.body?.perRide?.MOTO ?? safeTransportPricing.perRide.MOTO,
      CAR: req.body?.perRide?.CAR ?? safeTransportPricing.perRide.CAR
    },
    platformFeeRate: req.body?.platformFeeRate ?? safeTransportPricing.platformFeeRate
  };
  const valida = sanitizeSafeTransportPricing(propuesta);
  if (!valida) return res.status(400).json({ error: 'INVALID_SAFE_TRANSPORT_PRICING' });
  const anterior = safeTransportPricing;
  safeTransportPricing = valida;
  const registro = database.settings.find(item => item.id === 'safeTransportPricing');
  if (registro) registro.value = valida;
  else database.settings.push({ id: 'safeTransportPricing', value: valida });
  if (!await persistHttp(res)) {
    safeTransportPricing = anterior;
    return;
  }
  io.to('admins').emit('admin:safe_transport_pricing_updated', valida);
  res.json(valida);
});

app.patch('/api/admin/pricing', requireAuth, requireRole('admin'), limitadores.administracion, async (req, res) => {
  const numberFields = ['nightMultiplier', 'peakMultiplier', 'bcvRate', 'parallelRate', 'commissionRate'];
  const next = structuredClone(pricingConfig);
  for (const key of numberFields) if (req.body[key] !== undefined) next[key] = Number(req.body[key]);
  for (const type of ['MOTO', 'CAR']) {
    if (!req.body.vehicleTypes?.[type]) continue;
    next.vehicleTypes[type] = { ...next.vehicleTypes[type] };
    for (const [key, value] of Object.entries(req.body.vehicleTypes[type])) next.vehicleTypes[type][key] = Number(value);
  }
  if (!Number.isFinite(next.bcvRate) || next.bcvRate < 0 || !Number.isFinite(next.commissionRate) || next.commissionRate < 0 || next.commissionRate > 1) {
    return res.status(400).json({ error: 'INVALID_PRICING' });
  }
  pricingConfig = next;
  const record = database.settings.find(item => item.id === 'pricing');
  if (record) record.value = next;
  else database.settings.push({ id: 'pricing', value: next });
  if (!await persistHttp(res)) return;
  io.to('admins').emit('admin:pricing_updated', next);
  res.json(next);
});

app.get('/api/admin/finance', requireAuth, requireRole('admin'), limitadores.finanzas, (req, res) => {
  const commissionRate = Number(pricingConfig.commissionRate || 0.15);
  const transactions = database.trips.filter(trip => trip.status === 'COMPLETED').map(trip => {
    const gross = Number(trip.fareUSD || trip.fareEUR || trip.pricing?.fareUSD || 0);
    const commission = Math.round(gross * commissionRate * 100) / 100;
    const driver = database.users.find(user => user.id === trip.driverId);
    const passenger = database.users.find(user => user.id === trip.passengerId);
    return { id: trip.id, date: trip.completedAt || trip.closedAt || trip.updatedAt, gross, commission, driverNet: Math.round((gross - commission) * 100) / 100, settlementType:trip.driverSettlementType || (isWalletPayment(trip.paymentMethod) ? 'WALLET_CREDIT' : 'COMMISSION_DEBIT'), payoutStatus: trip.payoutStatus || 'CREDITED', paymentMethod: trip.paymentMethod || 'EFECTIVO', driver: publicUser(driver), passenger: publicUser(passenger) };
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  res.json({
    bcvRate: Number(pricingConfig.bcvRate || 0), commissionRate, transactions,
    walletRequests: database.transactions.filter(item => ['TOP_UP','PAYOUT'].includes(item.type)).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(item=>({...item,user:publicUser(database.users.find(user=>user.id===item.userId))})),
    summary: {
      gross: transactions.reduce((s, t) => s + t.gross, 0),
      commission: transactions.reduce((s, t) => s + t.commission, 0),
      pending: database.transactions.filter(t => t.type === 'PAYOUT' && t.status === 'PENDING').reduce((s, t) => s + t.amount, 0),
      paid: database.transactions.filter(t => t.type === 'PAYOUT' && t.status === 'APPROVED').reduce((s, t) => s + t.amount, 0),
      driverDebt: Math.abs(database.users.filter(user => user.role === 'driver' && Number(user.walletBalance || 0) < 0).reduce((sum, user) => sum + Number(user.walletBalance || 0), 0)),
      driversInDebt: database.users.filter(user => user.role === 'driver' && Number(user.walletBalance || 0) < 0).length
    }
  });
});

app.patch('/api/admin/trips/:id/payout', requireAuth, requireRole('admin'), limitadores.administracion, async (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id && item.status === 'COMPLETED');
  if (!trip) return res.status(404).json({ error: 'COMPLETED_TRIP_NOT_FOUND' });
  if (!['PAID', 'REJECTED', 'PENDING'].includes(req.body.status)) return res.status(400).json({ error: 'INVALID_PAYOUT_STATUS' });
  trip.payoutStatus = req.body.status;
  trip.payoutUpdatedAt = new Date().toISOString();
  trip.payoutReference = req.body.reference || null;
  if (!await persistHttp(res)) return;
  const event = { tripId: trip.id, status: trip.payoutStatus, reference: trip.payoutReference };
  io.to(`user:${trip.driverId}`).to('admins').emit('finance:payout_updated', event);
  io.to(`user:${trip.driverId}`).emit('platform:notification', { title: trip.payoutStatus === 'PAID' ? 'Liquidación aprobada' : 'Liquidación actualizada', message: `El pago del viaje #${trip.id.slice(-6)} figura como ${trip.payoutStatus}.`, category: 'FINANCE', icon: '💵' });
  res.json(event);
});

// Tamaños de página. El máximo es lo que impide que el cliente anule la
// paginación pidiendo `?limit=999999`. El de mensajes es más estrecho porque
// cada registro puede arrastrar todavía una imagen en base64: eso desaparece
// cuando entre la infraestructura de adjuntos de la fase 2B-2-4.
// La pantalla de gestion muestra ocho por pagina; el tope superior acota lo
// que puede pedir cualquier cliente.
const USERS_PAGE = { defaultLimit: 25, maxLimit: 100 };
const SUPPORT_THREADS_PAGE = { defaultLimit: 25, maxLimit: 100 };
const SUPPORT_MESSAGES_PAGE = { defaultLimit: 30, maxLimit: 50 };
// El panel pinta ocho viajes recientes y el mapa de flota los activos, que
// son pocos por definicion. El maximo acota lo que puede pedir cualquiera.
const TRIPS_PAGE = { defaultLimit: 25, maxLimit: 100 };

// Un hilo de soporte se resume para el listado: el texto completo y, sobre
// todo, la imagen en base64 se quedan fuera. Devolver el historial entero de
// todos los hilos hacia el panel producia 149 MB en una sola respuesta con el
// volumen de seis meses, medido contra el servidor real.
function summarizeSupportMessage(message) {
  if (!message) return null;
  return {
    id: message.id,
    senderId: message.senderId,
    senderRole: message.senderRole,
    text: sanitizeText(message.text || '', 160),
    // Cuenta cualquiera de los dos formatos: el nuevo guarda la referencia
    // en `imageRef` y ya no rellena `image`.
    hasImage: Boolean(message.image || message.imageRef),
    read: Boolean(message.read),
    createdAt: message.createdAt
  };
}

const supportTime = message => new Date(message?.createdAt || 0).getTime() || 0;

// Los hilos se ordenan por actividad reciente. El orden anterior era el de
// aparicion del primer mensaje, que sin paginacion daba igual; con paginacion
// dejaria los hilos nuevos en la ultima pagina.
app.get('/api/support/threads', requireAuth, (req, res) => {
  let limit;
  let search;
  try {
    limit = parseLimit(req.query.limit, SUPPORT_THREADS_PAGE);
    search = parseSupportSearch(req.query.search);
  } catch (error) {
    return res.status(400).json({ error: error.code });
  }

  const messages = req.user.role === 'admin'
    ? database.supportMessages
    : database.supportMessages.filter(message => message.conversationUserId === req.user.id);

  // Indice por identificador: resolver el usuario con find() dentro del bucle
  // costaba O(hilos x usuarios), unos 150 millones de comparaciones con el
  // volumen de seis meses.
  const usersById = new Map(database.users.map(user => [user.id, user]));

  const byThread = new Map();
  for (const message of messages) {
    const id = message.conversationUserId;
    let thread = byThread.get(id);
    if (!thread) {
      thread = { userId: id, last: null, unread: 0, messageCount: 0 };
      byThread.set(id, thread);
    }
    thread.messageCount += 1;
    // `unread` es relativo a quien pregunta, igual que antes: para
    // administracion cuenta lo que escribio la otra parte, y viceversa.
    if (!message.read && message.senderRole !== req.user.role) thread.unread += 1;
    if (!thread.last || supportTime(message) >= supportTime(thread.last)) thread.last = message;
  }

  const resumidos = [...byThread.values()]
    .sort((a, b) => supportTime(b.last) - supportTime(a.last))
    .map(thread => ({
      userId: thread.userId,
      user: publicUser(usersById.get(thread.userId)),
      lastMessage: summarizeSupportMessage(thread.last),
      unread: thread.unread,
      messageCount: thread.messageCount
    }));

  // Se busca sobre TODOS los hilos y despues se corta la pagina. Al reves --que
  // es lo que hacia la pantalla-- una conversacion que estuviera mas atras no
  // aparecia nunca, y el panel decia que no habia ninguna coincidencia.
  const threads = filterSupportThreads(resumidos, search);

  try {
    const page = paginate(threads, {
      limit,
      cursor: req.query.cursor,
      idOf: thread => thread.userId,
      sortKeyOf: thread => thread.lastMessage?.createdAt || ''
    });
    // El tiempo medio de respuesta se calculaba en el navegador recorriendo el
    // historial completo, que es justo lo que este listado ha dejado de
    // enviar. Se calcula aquí sobre el mismo conjunto que ve quien pregunta.
    return res.json({ ...page, averageResponseMs: averageAdminResponseMs(messages) });
  } catch (error) {
    return res.status(400).json({ error: error.code || 'INVALID_CURSOR' });
  }
});

// Los mensajes de un hilo concreto, del mas reciente al mas antiguo, para que
// la primera pagina sea la conversacion actual.
app.get('/api/support/threads/:userId/messages', requireAuth, (req, res) => {
  const { userId } = req.params;
  // Solo administracion o la persona duena del hilo.
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ error: 'SUPPORT_THREAD_FORBIDDEN' });
  }

  let limit;
  try {
    limit = parseLimit(req.query.limit, SUPPORT_MESSAGES_PAGE);
  } catch (error) {
    return res.status(400).json({ error: error.code });
  }

  const messages = database.supportMessages
    .filter(message => message.conversationUserId === userId)
    .sort((a, b) => supportTime(b) - supportTime(a));

  try {
    const page = paginate(messages, {
      limit,
      cursor: req.query.cursor,
      sortKeyOf: message => message.createdAt || ''
    });
    return res.json({ ...page, items: publicChatMessages(page.items) });
  } catch (error) {
    return res.status(400).json({ error: error.code || 'INVALID_CURSOR' });
  }
});

app.post('/api/support/messages', requireAuth, limitadores.mensajes, async (req, res) => {
  const conversationUserId = req.user.role === 'admin' ? req.body.recipientId : req.user.id;
  const target = database.users.find(user => user.id === conversationUserId && user.role !== 'admin');
  // La imagen ya no se guarda en la fila: se escribe en el almacen privado y el
  // mensaje se queda con la referencia. Aqui solo se comprueba que venga algo
  // con forma de imagen; decodificarla y validarla es cosa del pipeline.
  const tieneImagen = isChatImageDataUrl(req.body.image);
  if (!target || (!req.body.text?.trim() && !tieneImagen)) return res.status(400).json({ error: 'INVALID_SUPPORT_MESSAGE' });

  const construir = async (media) => {
    const message = {
      id: `support_${crypto.randomUUID()}`,
      conversationUserId,
      senderId: req.user.id,
      senderRole: req.user.role,
      text: sanitizeText(req.body.text, 2000),
      ...(media || {}),
      createdAt: new Date().toISOString(),
      read: false
    };
    database.supportMessages.push(message);
    try {
      if (!await persistDatabase()) throw new Error('DATABASE_WRITE_FAILED');
    } catch (error) {
      // Deshacer el alta en memoria: si no se ha persistido, el mensaje no
      // existe, y dejarlo en la coleccion lo haria visible hasta el reinicio.
      const indice = database.supportMessages.indexOf(message);
      if (indice >= 0) database.supportMessages.splice(indice, 1);
      throw error;
    }
    return message;
  };

  let message;
  try {
    message = tieneImagen
      ? await chatMediaPipeline.withStoredImageAsync(req.body.image, req.user.id, construir)
      : await construir(null);
  } catch (error) {
    // Nunca se devuelve el detalle: llevaria rutas o claves del almacen.
    const code = ['INVALID_CHAT_IMAGE', 'CHAT_IMAGE_TOO_LARGE', 'INVALID_FILE_TYPE', 'CHAT_MEDIA_TOO_LARGE', 'CHAT_MEDIA_STORAGE_FULL'].includes(error?.code)
      ? error.code
      : 'SUPPORT_MESSAGE_FAILED';
    return res.status(code === 'SUPPORT_MESSAGE_FAILED' ? 500 : 400).json({ error: code });
  }

  const publico = publicChatMessage(message);
  io.to('admins').to(`user:${conversationUserId}`).emit('support:message', { ...publico, user: publicUser(target) });
  res.status(201).json(publico);
});

app.patch('/api/support/threads/:userId/read', requireAuth, requireRole('admin'), async (req, res) => {
  database.supportMessages.forEach(message => { if (message.conversationUserId === req.params.userId && message.senderRole !== 'admin') message.read = true; });
  if (!await persistHttp(res)) return;
  res.json({ ok: true });
});

app.get('/api/notifications/me', requireAuth, (req, res) => {
  const notifications = database.notifications
    .filter(item => item.userId === req.user.id || item.targetRole === 'all' || item.targetRole === req.user.role)
    .sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp))
    .slice(0, 150);
  res.json(notifications);
});

app.patch('/api/notifications/:id/read', requireAuth, limitadores.notificaciones, async (req, res) => {
  const notification = database.notifications.find(item => item.id === req.params.id);
  if (!notification || !(notification.userId === req.user.id || notification.targetRole === 'all' || notification.targetRole === req.user.role)) {
    return res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
  }
  notification.read = true;
  notification.readAt = new Date().toISOString();
  if (!await persistHttp(res)) return;
  res.json(notification);
});

app.patch('/api/notifications/me/read-all', requireAuth, limitadores.notificaciones, async (req, res) => {
  const now = new Date().toISOString();
  database.notifications.forEach(item => {
    if (item.userId === req.user.id || item.targetRole === 'all' || item.targetRole === req.user.role) {
      item.read = true;
      item.readAt = now;
    }
  });
  if (!await persistHttp(res)) return;
  res.json({ ok: true });
});

app.get('/api/wallet/me', requireAuth, (req, res) => {
  res.json({
    balance: Number(req.user.walletBalance || 0),
    currency: 'USD',
    transactions: database.transactions.filter(item => item.userId === req.user.id).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 150)
  });
});

app.post('/api/wallet/topups', requireAuth, requireContactoVerificado, limitadores.cartera, async (req, res) => {
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const reference = String(req.body.reference || '').replace(/\D/g, '').slice(0, 20);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000 || reference.length < 6) return res.status(400).json({ error: 'INVALID_TOPUP' });
  if (database.transactions.some(item => item.type === 'TOP_UP' && item.reference === reference && item.status !== 'REJECTED')) return res.status(409).json({ error: 'REFERENCE_EXISTS' });
  const transaction = { id:`transaction_${crypto.randomUUID()}`, userId:req.user.id, type:'TOP_UP', amount, currency:'USD', method:'PAGO_MOVIL', reference, status:'PENDING', createdAt:new Date().toISOString() };
  database.transactions.push(transaction);
  database.notifications.push({ id:`notification_${crypto.randomUUID()}`, targetRole:'admin', title:'Recarga pendiente de verificación', message:`${req.user.firstName} registró una recarga de $${amount.toFixed(2)}.`, category:'FINANCE', read:false, createdAt:new Date().toISOString() });
  if (!await persistHttp(res)) return;
  io.to('admins').emit('finance:topup_pending', transaction);
  res.status(201).json(transaction);
});

app.post('/api/wallet/payouts', requireAuth, requireApprovedDriver, limitadores.cartera, async (req, res) => {
  // WALLET-PAYOUTS-1A. El flujo ANTIGUO de retiros esta apagado por defecto.
  //
  // Va DESPUES de `requireAuth` y `requireApprovedDriver` a proposito: la
  // compuerta no sustituye a la autenticacion, y una peticion sin token debe
  // seguir muriendo en el 401 como siempre. Y va ANTES de leer el saldo o
  // escribir nada, para que con la bandera apagada no quede ni una transaccion
  // creada ni un saldo tocado.
  //
  // No hay puente automatico a la fundacion nueva: se rechaza y punto.
  const compuerta = bloquearRetiroAntiguoSiApagado();
  if (compuerta) return res.status(compuerta.estado).json(compuerta.cuerpo);

  const available = Number(req.user.walletBalance || 0);
  const amount = Math.round(Number(req.body.amount || available) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > available) return res.status(400).json({ error:'INVALID_PAYOUT' });
  if (database.transactions.some(item => item.userId===req.user.id && item.type==='PAYOUT' && item.status==='PENDING')) return res.status(409).json({ error:'PAYOUT_ALREADY_PENDING' });
  const transaction={id:`transaction_${crypto.randomUUID()}`,userId:req.user.id,type:'PAYOUT',amount,currency:'USD',method:'PAGO_MOVIL',status:'PENDING',createdAt:new Date().toISOString()};
  database.transactions.push(transaction);
  database.notifications.push({ id:`notification_${crypto.randomUUID()}`, targetRole:'admin', title:'Liquidación pendiente', message:`${sanitizeText(req.user.firstName,80)} solicitó retirar $${amount.toFixed(2)}.`, category:'FINANCE', read:false, createdAt:new Date().toISOString() });
  if (!await persistHttp(res)) return;
  io.to('admins').emit('finance:payout_pending',transaction);res.status(201).json(transaction);
});

app.patch('/api/admin/transactions/:id', requireAuth, requireRole('admin'), limitadores.administracion, async (req, res) => {
  const transaction = database.transactions.find(item => item.id === req.params.id);
  if (!transaction) return res.status(404).json({ error:'TRANSACTION_NOT_FOUND' });
  const status = String(req.body.status || '').toUpperCase();
  if (!['APPROVED','REJECTED'].includes(status) || transaction.status !== 'PENDING') return res.status(409).json({ error:'INVALID_TRANSACTION_STATE' });
  if (transaction.type === 'TOP_UP' && status === 'APPROVED' && req.body.referenceConfirmed !== true) {
    return res.status(400).json({ error:'TOPUP_REFERENCE_CONFIRMATION_REQUIRED' });
  }

  // WALLET-PAYOUTS-1A. Aprobar un PAYOUT antiguo es la unica rama de esta ruta
  // que RESTA del saldo, y lo hace sin cerrojo y llamandolo «pagado» sin que
  // exista transferencia ni referencia bancaria. Con el flujo antiguo apagado,
  // se bloquea antes de tocar nada.
  //
  // La comprobacion es deliberadamente ESTRECHA:
  //
  //  · solo `PAYOUT`. Las recargas (`TOP_UP`) y cualquier otro tipo siguen
  //    exactamente igual;
  //  · solo `APPROVED`. Rechazar no mueve dinero, y dejarlo pasar es lo que
  //    permite resolver de forma segura los retiros que queden pendientes.
  if (esAprobacionDeRetiroAntiguo(transaction.type, status)) {
    const compuerta = bloquearRetiroAntiguoSiApagado();
    if (compuerta) return res.status(compuerta.estado).json(compuerta.cuerpo);
  }

  const owner = database.users.find(item => item.id === transaction.userId);
  if (status === 'APPROVED' && transaction.type === 'PAYOUT' && Number(owner?.walletBalance || 0) < transaction.amount) return res.status(409).json({ error:'INSUFFICIENT_BALANCE' });
  transaction.status = status;
  transaction.reviewedBy = req.user.id;
  transaction.reviewedAt = new Date().toISOString();
  transaction.reviewNote = sanitizeText(req.body.reviewNote, 500) || null;
  if (status === 'APPROVED' && owner && transaction.type === 'TOP_UP') owner.walletBalance = Math.round((Number(owner.walletBalance || 0) + transaction.amount) * 100) / 100;
  if (status === 'APPROVED' && owner && transaction.type === 'PAYOUT') {
    owner.walletBalance = Math.round((Number(owner.walletBalance || 0) - transaction.amount) * 100) / 100;
  }
  const isPayout = transaction.type === 'PAYOUT';
  database.adminActions.push({ id:`admin_action_${crypto.randomUUID()}`, adminId:req.user.id, targetUserId:transaction.userId, action:`${isPayout?'payout':'topup'}_${status.toLowerCase()}`, transactionId:transaction.id, createdAt:new Date().toISOString() });
  database.notifications.push({ id:`notification_${crypto.randomUUID()}`, userId:transaction.userId, title:isPayout?(status==='APPROVED'?'Liquidación pagada':'Liquidación rechazada'):(status==='APPROVED'?'Recarga acreditada':'Recarga rechazada'), message:isPayout?(status==='APPROVED'?`Administración aprobó tu liquidación de $${transaction.amount.toFixed(2)}.`:'Administración rechazó la solicitud de liquidación.'):(status==='APPROVED'?`Se acreditaron $${transaction.amount.toFixed(2)} a tu billetera.`:'Administración no pudo validar la referencia enviada.'), category:'FINANCE', read:false, createdAt:new Date().toISOString() });
  if (!await persistHttp(res)) return;
  io.to(`user:${transaction.userId}`).emit('finance:topup_updated', transaction);
  if (owner) {
    io.to(`user:${transaction.userId}`).emit('wallet:updated', {
      balance: roundMoney(owner.walletBalance || 0),
      transaction
    });
  }
  io.to('admins').emit('finance:transaction_updated', { id: transaction.id, type: transaction.type, status: transaction.status });
  res.json({ transaction, balance:Number(owner?.walletBalance || 0) });
});

app.post('/api/admin/broadcasts', requireAuth, requireRole('admin'), limitadores.difusion, async (req, res) => {
  const role = ['all', 'driver', 'passenger'].includes(req.body.role) ? req.body.role : 'all';
  if (!req.body.title?.trim() || !req.body.message?.trim()) return res.status(400).json({ error: 'INVALID_BROADCAST' });
  const notification = { id: `notification_${crypto.randomUUID()}`, title: sanitizeText(req.body.title, 120), message: sanitizeText(req.body.message, 1000), category: 'ANNOUNCEMENT', icon: '📢', targetRole: role, createdAt: new Date().toISOString() };
  database.notifications.push(notification);
  if (!await persistHttp(res)) return;
  if (role === 'all') io.to('drivers').to('passengers').emit('platform:notification', notification);
  else io.to(`${role}s`).emit('platform:notification', notification);
  io.to('admins').emit('admin:broadcast_sent', notification);
  res.status(201).json(notification);
});

app.patch('/api/admin/drivers/:id', requireAuth, requireRole('admin'), limitadores.administracion, async (req, res) => {
  const driver = database.users.find(user => user.id === req.params.id && user.role === 'driver');
  if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  const { action, documentKey, documentStatus } = req.body;
  const reason = sanitizeText(req.body.reason, 600);
  if (action === 'suspend' && !reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  const previousStatus = driver.status;
  if (documentKey && ['approved', 'rejected', 'pending'].includes(documentStatus)) {
    driver.documents = { ...(driver.documents || {}), [documentKey]: documentStatus };
  }
  if (action === 'approve') {
    driver.isVerified = true;
    driver.status = 'OFFLINE';
    driver.documents = Object.fromEntries(
      ['cedula', 'licencia', 'rcv', 'certificadoMedico', 'carnetCirculacion'].map(key => [key, 'approved'])
    );
  } else if (action === 'suspend') {
    driver.isVerified = false;
    driver.status = 'SUSPENDED';
  } else if (action === 'pending') {
    driver.isVerified = false;
    driver.status = 'PENDING_APPROVAL';
  }
  const application = database.driverApplications.find(item => item.userId === driver.id);
  if (application && action === 'suspend') Object.assign(application, { status: 'suspended', decisionReason: reason, reviewedBy: req.user.id, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (application && action === 'approve' && application.status === 'suspended') Object.assign(application, { status: 'approved', decisionReason: null, reviewedBy: req.user.id, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (['approve','suspend'].includes(action)) {
    database.adminActions.push({ id:`admin_action_${crypto.randomUUID()}`, adminId:req.user.id, targetUserId:driver.id, applicationId:application?.id||null, action:action==='approve'?'reactivate':'suspend', previousStatus, nextStatus:driver.status, reason:reason||null, createdAt:new Date().toISOString() });
    database.notifications.push({ id:`notification_${crypto.randomUUID()}`, userId:driver.id, title:action==='suspend'?'Cuenta de conductor suspendida':'Cuenta de conductor reactivada', message:action==='suspend'?reason:'Tu acceso operativo fue restaurado.', category:'SYSTEM', read:false, createdAt:new Date().toISOString() });
  }
  if (!await persistHttp(res)) return;
  io.to(`user:${driver.id}`).emit('driver:account_updated', publicUser(driver));
  io.to('admins').emit('admin:driver_updated', publicUser(driver));
  if (driver.status === 'SUSPENDED') {
    const sockets = await io.in(`user:${driver.id}`).fetchSockets();
    sockets.forEach(client => client.disconnect(true));
  }
  res.json(publicUser(driver));
});

app.patch('/api/admin/trips/:id', requireAuth, requireRole('admin'), limitadores.administracion, async (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
  const allowedStatuses = ['CANCELLED', 'COMPLETED'];
  if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ error: 'INVALID_STATUS' });
  if (req.body.status === TRIP_STATUS.COMPLETED) {
    try {
      ensureWalletCanCoverTrip(trip, database.users.find(user => user.id === trip.passengerId));
    } catch (error) {
      return res.status(402).json({ error: error.code, balance: error.balance, required: error.required });
    }
  }
  try {
    transitionTrip(trip, req.body.status, { actorId: req.user.id, actorRole: 'admin' });
  } catch (error) {
    return res.status(409).json({ error: error.code });
  }
  trip.closedAt = new Date().toISOString();
  tripLocks.delete(trip.id);
  const driver = database.users.find(user => user.id === trip.driverId);
  if (driver) driver.status = 'AVAILABLE';
  const settlement = trip.status === TRIP_STATUS.COMPLETED ? settleCompletedTrip(trip) : null;
  if (!await persistHttp(res)) return;
  emitCompletedTripWalletUpdates(trip, settlement);
  io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).to('admins').emit('tripStatusUpdated', {
    tripId: trip.id,
    status: trip.status
  });
  avisarDelCambioDeViaje(trip);
  res.json(trip);
});

app.delete('/api/admin/drivers/:id', requireAuth, requireRole('admin'), limitadores.administracion, async (req, res) => {
  const index = database.users.findIndex(user => user.id === req.params.id && user.role === 'driver');
  if (index < 0) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  const [driver] = database.users.splice(index, 1);
  if (!await persistHttp(res)) return;
  const sockets = await io.in(`user:${driver.id}`).fetchSockets();
  sockets.forEach(client => client.disconnect(true));
  res.status(204).end();
});

app.post('/api/admin/drivers', requireAuth, requireRole('admin'), limitadores.administracion, async (req, res) => {
  const { email, phone, firstName, lastName, vehicleType = 'MOTO', vehicleBrand, vehicleModel, vehiclePlate } = req.body;
  if (!email || !phone || !firstName || !vehiclePlate) return res.status(400).json({ error: 'INVALID_DRIVER' });
  if (database.users.some(user => user.email?.toLowerCase() === email.toLowerCase() || user.phone === phone)) {
    return res.status(409).json({ error: 'USER_EXISTS' });
  }
  const temporaryPassword = `Moto-${crypto.randomUUID().slice(0, 8)}`;
  const driver = {
    id: `driver_${Date.now()}`,
    role: 'driver', firstName, lastName, email: email.toLowerCase(), phone,
    vehicleType: vehicleType === 'CAR' ? 'CAR' : 'MOTO', vehicleBrand, vehicleModel, vehiclePlate,
    passwordHash: await bcrypt.hash(temporaryPassword, 12),
    status: 'OFFLINE', isVerified: true, rating: 5, totalTrips: 0,
    documents: Object.fromEntries(
      ['cedula', 'licencia', 'rcv', 'certificadoMedico', 'carnetCirculacion'].map(key => [key, 'approved'])
    )
  };
  database.users.push(driver);
  if (!await persistHttp(res)) return;
  res.status(201).json({ user: publicUser(driver), temporaryPassword });
});

// Devolvia la coleccion entera. Cuatro pantallas la pedian y ninguna la queria
// completa: el panel usa los ocho mas recientes, el mapa de flota solo los
// activos, soporte el ultimo de una persona y la gestion de usuarios los de
// quien este seleccionado. Ahora cada una pide lo suyo.
app.get('/api/trips', requireAuth, requireRole('admin'), limitadores.listados, (req, res) => {
  let limit;
  let page;
  let filters;
  try {
    limit = parseLimit(req.query.limit, TRIPS_PAGE);
    page = parsePage(req.query.page);
    filters = parseTripFilters(req.query);
  } catch (error) {
    return res.status(400).json({ error: error.code || 'INVALID_QUERY' });
  }

  const filtrados = filterTrips(database.trips, filters);
  try {
    const cursor = req.query.cursor;
    const pagina = cursor
      ? paginate(filtrados, { limit, cursor, sortKeyOf: trip => String(tripRecency(trip)) })
      : paginateByPage(filtrados, { limit, page, sortKeyOf: trip => String(tripRecency(trip)) });
    return res.json(pagina);
  } catch (error) {
    return res.status(400).json({ error: error.code || 'INVALID_CURSOR' });
  }
});

// Recuento de viajes por persona. La columna «N viajes» del listado de usuarios
// solo enseña el numero: traer los viajes para contarlos seria descargar la
// coleccion con otro nombre.
app.get('/api/trips/summary', requireAuth, requireRole('admin'), limitadores.resumenes, (req, res) => {
  const bruto = req.query.userId;
  if (bruto === undefined || bruto === null || bruto === '') {
    return res.status(400).json({ error: 'INVALID_USER_ID' });
  }
  const userIds = String(bruto).split(',').map(valor => valor.trim()).filter(Boolean);
  if (!userIds.length) return res.status(400).json({ error: 'INVALID_USER_ID' });
  if (userIds.length > MAX_TRIP_USER_IDS) return res.status(400).json({ error: 'TOO_MANY_USER_IDS' });

  return res.json({ items: summarizeTripsByUser(database.trips, userIds) });
});

app.get('/api/trips/me/history', requireAuth, (req, res) => {
  if (!['passenger', 'driver'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const trips = database.trips
    .filter(item => req.user.role === 'passenger' ? item.passengerId === req.user.id : item.driverId === req.user.id || item.assignedDriverId === req.user.id)
    .sort((a, b) => new Date(b.completedAt || b.updatedAt || b.createdAt || 0) - new Date(a.completedAt || a.updatedAt || a.createdAt || 0))
    // Los viajes guardados antes de cafc7e8 incrustaron el registro completo
    // del conductor. Se proyecta al leer; la base de datos no se toca.
    .map(trip => sanitizeEmbeddedTripDriver(trip, { includePhone: isContactableTrip(trip) }));
  res.json(trips);
});

app.get('/api/trips/active/me', requireAuth, (req, res) => {
  // MISMO CRITERIO QUE EL DESPACHO, y no es un detalle de estilo.
  //
  // Antes esto caducaba a las doce horas y `activeTripForDriver` no caducaba
  // nunca. El resultado era un conductor ocupado por un viaje que su propia
  // aplicacion habia dejado de enseniarle: no recibia carreras y no tenia como
  // cerrarlo. Ahora los dos preguntan a `domain/viajeActivo`.
  const trip = viajeActivoDe(database.trips, req.user.id);
  if (!trip) return res.status(204).end();
  // `obsoleto` marca el que lleva demasiado abierto. No lo cierra nadie por su
  // cuenta --eso seria mover dinero sin que lo pidan-- pero deja de ser
  // invisible, que era el problema.
  res.json({ ...tripParticipantsView(trip, req.user), obsoleto: esViajeObsoleto(trip) });
});

app.get('/api/trips/pending-review/me', requireAuth, requireRole('passenger'), (req, res) => {
  const reviewWindowMs = 2 * 60 * 60 * 1000;
  const trip = database.trips.findLast(item =>
    item.passengerId === req.user.id &&
    item.status === TRIP_STATUS.COMPLETED &&
    !item.driverReview &&
    Date.now() - new Date(item.closedAt || item.updatedAt || item.createdAt || 0).getTime() < reviewWindowMs
  );
  if (!trip) return res.status(204).end();
  res.json(tripParticipantsView(trip, req.user));
});

app.get('/api/trips/:id', requireAuth, (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
  if (!userCanAccessTrip(req.user.id, req.user.role, trip)) return res.status(403).json({ error: 'FORBIDDEN' });
  res.json(tripParticipantsView(trip, req.user));
});

/**
 * La GEOMETRIA de la ruta del viaje (ROUTE-1).
 *
 * EL SERVIDOR SIGUE SIENDO LA AUTORIDAD
 *
 * El telefono no dice por donde va la ruta: la pide. Aqui se decide que tramo
 * toca segun el estado --`rutaDelViaje.js`, funcion pura-- y se traza con el
 * proveedor. Lo que el cliente aporta es CERO: ni origen, ni destino, ni
 * posicion del conductor, que sale del registro del propio conductor.
 *
 * SOLO LAS DOS PARTES, Y DE FORMA EXPLICITA
 *
 * Ni administracion. `userCanAccessTrip` la autorizaria por herencia y aqui no
 * debe: el mapa de flota tiene su propio canal, y la ruta de una carrera
 * concreta es de quien la hace y de quien la va a hacer. Misma decision que ya
 * se tomo para los adjuntos del chat.
 *
 * SIN PROVEEDOR NO HAY GEOMETRIA, Y SE DICE
 *
 * Nunca una recta entre los dos extremos. Una recta sobre un mapa se lee como
 * «por aqui se va», y por ahi puede no haber calle. Se responde
 * `available:false` con el motivo, y la pantalla degrada con honestidad.
 */
app.get('/api/trips/:id/route', requireAuth, limitadores.rutas, async (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
  const esParte = trip.passengerId === req.user.id || trip.driverId === req.user.id;
  if (!esParte) return res.status(403).json({ error: 'FORBIDDEN' });

  // La posicion del conductor sale de SU registro, nunca del cuerpo de la
  // peticion. Un telefono que dijera donde esta la moto podria dibujar la ruta
  // desde donde quisiera.
  const conductor = trip.driverId ? database.users.find(item => item.id === trip.driverId) : null;
  const conductorEn = conductor?.location ? { lat: conductor.location.lat, lng: conductor.location.lng } : null;

  const tramo = tramoDeLaRuta(trip, conductorEn);
  if (!tramo.ok) return res.json({ available: false, reason: tramo.motivo });

  if (!clienteDeGeometria.isConfigured()) {
    return res.json({ available: false, reason: 'ROUTE_PROVIDER_NOT_CONFIGURED', leg: tramo.tramo });
  }

  try {
    // La cache reparte una misma llamada entre quien la pida y guarda el
    // resultado dos minutos: una carrera son decenas de posiciones que caen en
    // la misma clave redondeada.
    const geometria = await cacheDeGeometria.medir(
      tramo.origen,
      tramo.destino,
      () => clienteDeGeometria.computeRoute(tramo.origen, tramo.destino)
    );
    return res.json({
      available: true,
      leg: tramo.tramo,
      source: 'GOOGLE_ROUTES',
      points: geometria.puntos,
      distanceMeters: geometria.metros,
      durationMillis: geometria.duracionMs,
      origin: tramo.origen,
      destination: tramo.destino
    });
  } catch (error) {
    // Caido, lento o ilegible: no hay geometria. No se sustituye por una recta.
    console.warn(`[+58express Ruta] sin geometria para el viaje (${error?.message || 'sin detalle'})`);
    return res.json({ available: false, reason: 'ROUTE_PROVIDER_UNAVAILABLE', leg: tramo.tramo });
  }
});

/**
 * La busqueda escrita del destino.
 *
 * Vive en el servidor a proposito: si la hiciera el telefono llevaria dentro
 * una credencial de Places, y una credencial dentro de un APK es publica. Aqui
 * la peticion la firma la cuenta de servicio y el movil solo ve resultados.
 *
 * Solo devuelve lo que hace falta para pintar la lista y fijar un destino.
 */
app.get('/api/places/search', requireAuth, requireContactoVerificado, limitadores.lugares, async (req, res) => {
  if (!clienteDeLugares.isConfigured()) {
    return res.status(503).json({ error: PLACES_ERROR.NOT_CONFIGURED });
  }

  // El sesgo es una ayuda, no un requisito: sin coordenada valida se busca sin el.
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const cerca = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  try {
    const resultados = await clienteDeLugares.buscar(req.query.q, cerca);
    return res.json({ results: resultados });
  } catch (error) {
    const codigo = error?.message;
    if (codigo === PLACES_ERROR.INVALID_QUERY) {
      return res.status(400).json({ error: PLACES_ERROR.INVALID_QUERY });
    }
    // Caido, lento o ilegible: no hay sugerencias. No se inventa ninguna.
    console.warn(`[+58express Lugares] busqueda sin resultado del proveedor (${codigo || 'sin detalle'})`);
    return res.status(503).json({ error: PLACES_ERROR.PROVIDER_ERROR });
  }
});

app.get('/api/trips/:id/messages', requireAuth, (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
  if (!userCanAccessTrip(req.user.id, req.user.role, trip)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  // ORDEN DETERMINISTA, y no el de insercion. En memoria coinciden, pero tras
  // un reinicio la coleccion vuelve de la base y ese orden ya no es promesa de
  // nadie. Se ordena por marca de tiempo, con el id como desempate para que
  // dos mensajes del mismo milisegundo salgan siempre igual.
  const conversacion = database.messages
    .filter(message => message.tripId === trip.id)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : a.id < b.id ? -1 : 1));
  res.json(publicChatMessages(conversacion));
});

app.post('/api/trips/create', requireAuth, requireContactoVerificado, requireRole('passenger'), limitadores.viajes, async (req, res) => {
  // Identificador: lo aporta el cliente por compatibilidad, pero con forma
  // acotada. `Idempotency-Key` sirve cuando el cuerpo no trae `id`, que es lo
  // que ocurre al reenviar desde la cola sin conexión.
  const rawId = req.body.id ?? req.headers['idempotency-key'];
  const requestedId = rawId === undefined || rawId === null ? null : normalizeTripId(rawId);
  if (rawId !== undefined && rawId !== null && !requestedId) {
    return res.status(400).json({ error: 'INVALID_TRIP_ID' });
  }
  if (requestedId) {
    const claimed = database.trips.find(item => item.id === requestedId);
    // Repetir la propia solicitud devuelve el viaje ya creado; usar la clave
    // de otra persona se rechaza con un código genérico que no revela de quién
    // es el viaje.
    if (claimed) {
      if (claimed.passengerId !== req.user.id) return res.status(409).json({ error: 'TRIP_ID_UNAVAILABLE' });
      // IDEMPOTENCIA. El mismo intento logico --doble toque, reintento de red,
      // reenvio desde la cola sin conexion-- devuelve EL MISMO viaje en vez de
      // crear otro. La clave es el propio id del viaje, que es unico para
      // siempre: mas fuerte que una ventana de horas.
      return res.json({ status: 'existing', trip: claimed, idempotentReplay: true });
    }
  }

  // Lista blanca: el cliente solo aporta el recorrido y las preferencias de
  // la carrera. Identidad, estado y asignación los fija el servidor, de modo
  // que un cuerpo manipulado no puede inyectar campos ni suplantar a nadie.
  const pickup = normalizeLocation(req.body.pickup);
  const destination = normalizeLocation(req.body.destination);
  if (!pickup || !destination) {
    return res.status(400).json({ error: 'VALID_GPS_COORDINATES_REQUIRED' });
  }
  const paymentMethod = req.body.paymentMethod === undefined || req.body.paymentMethod === null
    ? PAYMENT_METHODS.CASH
    : normalizePaymentMethod(req.body.paymentMethod);
  if (!paymentMethod) return res.status(400).json({ error: 'INVALID_PAYMENT_METHOD' });

  // LAS METRICAS LAS MIDE EL SERVIDOR, SIEMPRE
  //
  // Se miden aqui a partir de los mismos dos puntos que llegan en esta
  // peticion, asi que no hay ventana entre estimar y crear: pedir precio para
  // un recorrido y crear otro no cambia el importe, porque el importe se
  // vuelve a calcular con el recorrido que se esta creando de verdad.
  //
  // Lo que venga en `distanceKm`, `durationMin`, `fareUSD` o `fareEUR` se
  // ignora. Sigue llegando de clientes viejos y no se rechaza por eso --seria
  // romperlos sin motivo-- pero no influye en nada.
  let routeMetrics;
  try {
    routeMetrics = await medirRecorrido(pickup, destination);
  } catch (error) {
    return res.status(400).json({ error: error.code || 'INVALID_ROUTE_METRICS' });
  }

  const trip = {
    pickup: tripLocation(pickup),
    destination: tripLocation(destination),
    rideType: req.body.rideType === 'CAR' ? 'CAR' : 'MOTO',
    paymentMethod,
    exchangeRateType: req.body.exchangeRateType === 'PARALLEL' ? 'PARALLEL' : 'BCV'
  };
  trip.distanceKm = routeMetrics.distanceKm;
  trip.durationMin = routeMetrics.durationMin;
  trip.metricsSource = routeMetrics.source;

  // Identidad derivada siempre del usuario autenticado.
  trip.passengerId = req.user.id;
  trip.passengerName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Pasajero';
  // La fotografía no se copia en el viaje: la contraparte la pide bajo
  // demanda mientras el viaje siga abierto, y las pantallas históricas
  // muestran un avatar neutro.
  trip.passengerAvatar = null;
  trip.passengerRating = Number(req.user.rating || 0);
  trip.driverId = null;
  trip.id = requestedId || `trip_${crypto.randomUUID()}`;
  trip.status = TRIP_STATUS.SEARCHING;
  trip.createdAt = new Date().toISOString();
  trip.updatedAt = trip.createdAt;
  trip.statusHistory = [{ status: trip.status, at: trip.createdAt, actorId: req.user.id }];
  // El precio, con las metricas que acaba de medir el servidor.
  //
  // Ya no hay segundo camino. El que aceptaba la estimacion del cliente estaba
  // marcado en este mismo sitio como RIESGO PENDIENTE (alta) y era la ultima
  // via por la que una pasajera influia en el importe de su propio viaje.
  trip.pricing = calculateFare({
    distanceKm: routeMetrics.distanceKm,
    durationMin: routeMetrics.durationMin,
    exchangeRateType: trip.exchangeRateType || 'BCV',
    rideType: trip.rideType
  }, pricingConfig);
  trip.fareUSD = trip.pricing.fareUSD;
  trip.fareVES = trip.pricing.fareVES;
  trip.fareSource = 'SERVER_CALCULATED';
  try {
    ensureWalletCanCoverTrip(trip, req.user);
  } catch (error) {
    return res.status(402).json({ error: error.code, balance: error.balance, required: error.required });
  }
  // UN SOLO VIAJE ACTIVO POR PASAJERA
  //
  // La comprobacion y el alta van juntas y sin ceder el control: en memoria
  // porque Node es de un solo hilo y entre estas dos lineas no hay `await`, y
  // en PostgreSQL porque `reserveActiveTripSlot` es UNA sentencia condicional.
  //
  // Comprobar y despues insertar en dos pasos deja una ventana por la que dos
  // toques del mismo dedo crean dos viajes.
  // La MISMA autoridad que `/api/trips/active/me`. Asi lo que bloquea crear es
  // exactamente lo que la aplicacion le ensenia a la pasajera: un SEARCHING ya
  // caducado no cuenta aqui como no cuenta alli, y nunca hay un bloqueo por un
  // viaje invisible.
  const yaTieneUno = viajeActivoDe(database.trips, req.user.id);
  if (yaTieneUno) {
    // Se devuelve el viaje para que la aplicacion pueda llevar a la persona a
    // el sin una segunda peticion.
    return res.status(409).json({ error: 'ACTIVE_TRIP_EXISTS', trip: yaTieneUno });
  }
  database.trips.push(trip);

  // Y la misma invariante en la base, que es la que sobrevive a varias
  // instancias del servidor. En SQLite no hay nada que reservar --un proceso,
  // un hilo-- y responde que si.
  if (!await persistence.reserveActiveTripSlot(trip, ESTADOS_DE_VIAJE_ACTIVO)) {
    database.trips.splice(database.trips.indexOf(trip), 1);
    return res.status(409).json({ error: 'ACTIVE_TRIP_EXISTS', trip: viajeActivoDe(database.trips, req.user.id) });
  }
  // La reserva ya dejo la fila puesta en PostgreSQL; esto es lo que la guarda
  // en SQLite, donde la reserva no escribe.
  if (!await persistHttp(res)) {
    database.trips.splice(database.trips.indexOf(trip), 1);
    return;
  }
  
  // Trigger Dispatch Service
  dispatchTripToDrivers(trip);

  res.json({ status: 'created', trip });
});

app.post('/api/trips/scheduled', requireAuth, requireRole('passenger'), limitadores.viajes, async (req, res) => {
  const scheduledAt = new Date(req.body.scheduledAt);
  const pickupAddress = String(req.body.pickup?.address || '').trim().slice(0, 240);
  const destinationAddress = String(req.body.destination?.address || '').trim().slice(0, 240);
  if (!pickupAddress || !destinationAddress || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 30 * 60 * 1000) return res.status(400).json({ error:'INVALID_SCHEDULED_TRIP' });
  const trip = { id:`scheduled_${crypto.randomUUID()}`, passengerId:req.user.id, pickup:{...req.body.pickup,address:pickupAddress}, destination:{...req.body.destination,address:destinationAddress}, scheduledAt:scheduledAt.toISOString(), rideType:req.body.rideType==='CAR'?'CAR':'MOTO', paymentMethod:String(req.body.paymentMethod||'CASH').slice(0,30), fareUSD:Math.max(0,Math.round(Number(req.body.fareUSD||0)*100)/100), status:'SCHEDULED', assignedDriverId:null, createdAt:new Date().toISOString() };
  database.trips.push(trip);
  if (!await persistHttp(res)) {
    database.trips.splice(database.trips.indexOf(trip), 1);
    return;
  }
  io.to('drivers').to('admins').emit('scheduled_trip:new',trip); res.status(201).json(trip);
});

app.get('/api/trips/scheduled/available', requireAuth, requireApprovedDriver, (req, res) => {
  const trips = database.trips.filter(item => item.status==='SCHEDULED' && item.rideType===(req.user.vehicleType||'MOTO') && (!item.assignedDriverId || item.assignedDriverId===req.user.id) && new Date(item.scheduledAt)>new Date()).map(trip=>({...trip,passenger:passengerPublicProfile(database.users.find(user=>user.id===trip.passengerId))}));
  res.json(trips);
});

app.post('/api/trips/scheduled/:id/claim', requireAuth, requireApprovedDriver, limitadores.viajes, async (req, res) => {
  const trip = database.trips.find(item=>item.id===req.params.id && item.status==='SCHEDULED');
  if(!trip)return res.status(404).json({error:'SCHEDULED_TRIP_NOT_FOUND'});
  if(trip.assignedDriverId && trip.assignedDriverId!==req.user.id)return res.status(409).json({error:'ALREADY_ASSIGNED'});
  trip.assignedDriverId=req.user.id;trip.driverId=req.user.id;trip.updatedAt=new Date().toISOString();
  if (!await persistHttp(res)) return;
  io.to(`user:${trip.passengerId}`).to('admins').emit('scheduled_trip:claimed',{tripId:trip.id,driver:driverPublicProfile(req.user)});res.json(trip);
});

app.delete('/api/trips/scheduled/:id', requireAuth, requireRole('passenger'), limitadores.viajes, async (req, res) => {
  const trip = database.trips.find(item => item.id === req.params.id && item.passengerId === req.user.id && item.status === 'SCHEDULED');
  if (!trip) return res.status(404).json({ error: 'SCHEDULED_TRIP_NOT_FOUND' });
  if (trip.assignedDriverId) return res.status(409).json({ error: 'SCHEDULED_TRIP_ALREADY_ASSIGNED' });
  trip.status = TRIP_STATUS.CANCELLED;
  trip.cancelledAt = new Date().toISOString();
  trip.updatedAt = trip.cancelledAt;
  if (!await persistHttp(res)) return;
  io.to('admins').emit('scheduled_trip:cancelled', { tripId: trip.id });
  res.json(trip);
});

app.patch('/api/drivers/status', requireAuth, requireApprovedDriver, limitadores.telemetria, async (req, res) => {
  const driverId = req.user.id;
  const driver = database.users.find(u => u.id === driverId && u.role === 'driver');
  if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  const status = normalizeDriverStatus(req.body.status);
  if (!status) return res.status(400).json({ error: 'INVALID_DRIVER_STATUS' });
  driver.status = status;
  if (!await persistHttp(res)) return;
  emitDriverPresence(driver);
  res.json(publicUser(driver));
});

app.patch('/api/drivers/location', requireAuth, requireApprovedDriver, limitadores.telemetria, async (req, res) => {
  const driverId = req.user.id;
  const driver = database.users.find(u => u.id === driverId && u.role === 'driver');
  if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
  const coordinates = normalizeCoordinates(req.body);
  if (!coordinates) return res.status(400).json({ error: 'INVALID_COORDINATES' });
  driver.location = { ...coordinates, updatedAt: Date.now() };
  if (!await persistHttp(res)) return;
  emitDriverLocation(driverId, { ...driver.location });
  res.json(publicUser(driver));
});

/**
 * Lo que dura una oferta delante de un conductor.
 *
 * UNA SOLA FUENTE, Y VIAJA DE DOS MANERAS
 *
 * Este numero manda el temporizador que pasa al siguiente candidato y el
 * vencimiento que se le anuncia al telefono. Estaba escrito dos veces, y dos
 * copias de un numero que tiene que ser el mismo acaban divergiendo.
 *
 * Al cliente se le manda `offerExpiresInMs` --lo que queda, contado desde
 * ahora-- ademas de `offerExpiresAt` --la marca absoluta, para administracion
 * y registros--. La marca absoluta esta en el reloj de ESTE proceso, y el
 * telefono no tiene por que compartirlo: restarla contra el reloj del aparato
 * convierte cualquier desajuste del telefono en segundos inventados. La
 * duracion relativa no tiene ese problema: el cliente la ancla a su propio
 * reloj en cuanto la recibe, y lo unico que se pierde es la latencia de la
 * red, que son milisegundos.
 */
const VENTANA_DE_OFERTA_MS = 15_000;

function dispatchTripToDrivers(trip) {
  const pickup = normalizeLocation(trip.pickup);
  if (!pickup) {
    console.error(`[+58express Dispatcher] Trip [${trip.id}] rejected: invalid pickup GPS`);
    return;
  }
  const pickupLat = pickup.lat;
  const pickupLng = pickup.lng;

  const { candidates: availableDrivers, rejectionCounts } = selectEligibleDrivers({
    drivers: database.users,
    trip,
    pickup: { lat: pickupLat, lng: pickupLng },
    driverRegistry,
    activeTripForDriver,
    calculateDistance,
    maxRadiusKm: Number(process.env.MAX_DISPATCH_RADIUS_KM || 15),
    maxLocationAgeMs: Number(process.env.MAX_DRIVER_LOCATION_AGE_MS || 120_000)
  });

  console.log(`[+58express Dispatcher] ${JSON.stringify({
    event: 'dispatch_eligibility',
    tripId: trip.id,
    eligibleDriverCount: availableDrivers.length,
    rejectionCounts
  })}`);

  const session = { tripId: trip.id, candidates: availableDrivers, index: -1, currentDriverId: null };
  dispatchSessions.set(trip.id, session);

  const offerNext = async () => {
    if (tripLocks.get(trip.id) || trip.status !== TRIP_STATUS.SEARCHING) return;
    session.index += 1;
    const candidate = session.candidates[session.index];
    if (!candidate) {
      transitionTrip(trip, TRIP_STATUS.CANCELLED, { actorRole: 'system', reason: 'NO_DRIVERS_AVAILABLE' });
      if (!await persistDatabase()) {
        console.error(`[+58express Database] No se pudo persistir la cancelación automática de ${trip.id}`);
        return;
      }
      dispatchSessions.delete(trip.id);
      dispatchTimers.delete(trip.id);
      io.to(`user:${trip.passengerId}`).to('admins').emit('dispatch:no_drivers', { tripId: trip.id });
      io.to(`user:${trip.passengerId}`).to('admins').emit('tripStatusUpdated', {
        tripId: trip.id,
        status: TRIP_STATUS.CANCELLED,
        reason: 'NO_DRIVERS_AVAILABLE'
      });
      avisarDelCambioDeViaje(trip);
      return;
    }
    session.currentDriverId = candidate.driver.id;
    const socketId = driverRegistry.get(candidate.driver.id) || candidate.driver.socketId;
    const offer = {
      ...trip,
      offeredDriverId: candidate.driver.id,
      distanceToPickupKm: Math.round(candidate.dist * 100) / 100,
      candidatesCount: session.candidates.length,
      // La marca absoluta se conserva para administracion y registros; el
      // telefono cuenta con la relativa, que no depende de su reloj.
      offerExpiresAt: Date.now() + VENTANA_DE_OFERTA_MS,
      offerExpiresInMs: VENTANA_DE_OFERTA_MS
    };
    if (socketId) {
      io.to(socketId).emit('rideRequested', offer);
      console.log(`[+58express Dispatcher] ${JSON.stringify({ event: 'driver_offer_emitted', tripId: trip.id, emitted: true })}`);
      // PUSH-3A: aviso de atencion que acompana a ESTA misma oferta, para
      // ESTE mismo conductor. Es mejor esfuerzo puro: sin `await`, porque la
      // ventana de quince segundos no puede depender de un proveedor de push.
      // El servicio nunca rechaza por contrato --clasifica y absorbe todos
      // los desenlaces--; el `catch` es la red de ultima instancia por si ese
      // contrato se rompiera algun dia, y no registra mas que el nombre.
      pushService.notifyRideOffer(trip, candidate.driver.id).catch(error => {
        console.error(`[+58express Push] rechazo inesperado de notifyRideOffer: ${error?.name || 'UNKNOWN'}`);
      });
    }
    io.to('admins').emit('rideRequested', offer);
    const timer = setTimeout(() => offerNext().catch(error => {
      console.error('[+58express Dispatcher] No se pudo continuar el despacho:', error.message);
    }), VENTANA_DE_OFERTA_MS);
    dispatchTimers.set(trip.id, timer);
  };

  const iniciarOfertas = () => offerNext().catch(error => {
    console.error('[+58express Dispatcher] No se pudo iniciar el despacho:', error.message);
  });

  if (dispatchRanker.enabled && session.candidates.length > 1) {
    // DISPATCH-2A: UNA llamada acotada de matriz por ciclo de despacho, con
    // su propio timeout duro, ANTES de la primera oferta. La ventana de
    // 15000 ms por conductor no se toca: son relojes distintos. El ranking
    // devuelve SIEMPRE el mismo conjunto (jamas añade ni quita elegibles);
    // cualquier fallo → el orden geografico actual.
    dispatchRanker.rank({ pickup: { lat: pickupLat, lng: pickupLng }, candidates: session.candidates })
      .then(({ candidates }) => {
        if (candidates.length === session.candidates.length) session.candidates = candidates;
        iniciarOfertas();
      })
      .catch(() => iniciarOfertas());
  } else {
    iniciarOfertas();
  }
}

// Socket.IO Server Setup
// Un valor mal escrito en el entorno no debe dejar el techo abierto ni
// bloquear a todo el mundo: solo se acepta un entero válido.
const configuredMaxConnections = Number.parseInt(process.env.SOCKET_MAX_CONNECTIONS_PER_USER ?? '', 10);
const connectionLimiter = createConnectionLimiter(
  Number.isInteger(configuredMaxConnections) && configuredMaxConnections >= 1
    ? { maxPerUser: configuredMaxConnections }
    : {}
);

io.on('connection', (socket) => {
  // El techo de frecuencia vive en cada socket, así que abrir muchas
  // conexiones con la misma sesión multiplicaría el cupo. La liberación se
  // registra antes de contar y se ejecuta siempre, admitida la conexión o no:
  // emparejarlas sin ramas es lo que impide que el contador se desincronice y
  // acabe cerrando la puerta a una cuenta legítima.
  const { userId: connectionUserId } = socket.data.auth;
  socket.on('disconnect', () => connectionLimiter.release(connectionUserId));
  const cupo = connectionLimiter.acquire(connectionUserId);
  if (!cupo.allowed) {
    socket.emit('socket:error', { error: 'TOO_MANY_CONNECTIONS', maxPerUser: cupo.maxPerUser });
    socket.disconnect(true);
    return;
  }

  console.log(`[+58express Socket.IO] Client connected: ${socket.id}`);
  socket.join(`${socket.data.auth.role}s`);
  socket.join(`user:${socket.data.auth.userId}`);

  // Contador de frecuencia propio de este socket: nace y muere con él, así que
  // no queda ninguna estructura global creciendo por conexión.
  const rateLimiter = createEventRateLimiter();

  // Devuelve `true` si el evento debe descartarse. El aviso al cliente sale
  // una sola vez por ventana: responder a cada evento descartado convertiría
  // la defensa en un amplificador.
  const rateLimited = (event) => {
    const rechazo = rateLimiter.check(event);
    if (!rechazo) return false;
    if (rechazo.notificar) {
      socket.emit('socket:rate_limited', { event, retryAfterMs: rechazo.retryAfterMs });
    }
    return true;
  };

  // Registra un handler de evento a prueba de payloads hostiles. Un valor por
  // defecto (`data = {}`) no cubre un `null` explícito, así que desestructurar
  // lanzaba y, al ser síncrono, tumbaba el proceso entero. Aquí el payload se
  // normaliza a objeto y cualquier excepción queda contenida en el socket.
  const on = (event, handler) => socket.on(event, async payload => {
    // La frecuencia se comprueba antes de tocar la base de datos, de emitir a
    // otras salas y de escribir en el registro.
    if (rateLimited(event)) return;
    const data = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    try {
      await handler(data);
    } catch (error) {
      console.error(`[+58express Socket.IO] Error no controlado en ${event}:`, error?.message);
      // UN SOLO SITIO PARA TODO EL TIEMPO REAL.
      //
      // Cada evento pasa por aquí, así que instrumentar este `catch` cubre el
      // canal entero sin tocar ningún handler. Es donde hay que mirar cuando
      // alguien dice «se quedó pensando»: por el socket van el despacho, la
      // aceptación y el seguimiento, y un fallo aquí no devuelve ningún código
      // HTTP que delate nada.
      capturarFalloDeSocket(error, {
        evento: event,
        usuario: socket.data?.auth
          ? { id: socket.data.auth.userId, role: socket.data.auth.role }
          : undefined,
        // El payload NO viaja: lo manda el cliente y puede traer cualquier cosa.
        // Sus claves sí, que es lo que dice si faltaba un campo.
        extra: { camposRecibidos: Object.keys(data).join(',') || '(vacio)' }
      });
      socket.emit('socket:error', { event, error: 'EVENT_FAILED' });
    }
  });

  socket.on('join:room', (room) => {
    if (rateLimited('join:room')) return;
    const allowedRooms = [`${socket.data.auth.role}s`, `user:${socket.data.auth.userId}`];
    if (!allowedRooms.includes(room)) return;
    socket.join(room);
    console.log(`[+58express Socket.IO] Socket ${socket.id} joined room: ${room}`);
  });

  on('driver:connect', async (data = {}) => {
    if (!allowSocketRole(socket, 'driver')) return;
    socket.join('drivers');
    // Nunca se resuelve el conductor por el payload: solo por la sesión firmada.
    const driver = database.users.find(u => u.id === socket.data.auth.userId && u.role === 'driver');
    if (!driver) {
      socket.emit('authorization:error', { error: 'DRIVER_NOT_FOUND' });
      return;
    }
    const requestedStatus = data.status === undefined ? DRIVER_STATUS.AVAILABLE : normalizeDriverStatus(data.status);
    if (!requestedStatus) {
      socket.emit('driver:status_rejected', { error: 'INVALID_DRIVER_STATUS', status: data.status });
      return;
    }
    driver.status = requestedStatus;
    driver.socketId = socket.id;
    driverRegistry.set(driver.id, socket.id);
    if (!await persistRecord('users', driver)) {
      socket.emit('driver:status_rejected', { error: 'DATABASE_WRITE_FAILED' });
      return;
    }
    socket.emit('driver:connected', { success: true, socketId: socket.id, driver: publicUser(driver) });
    emitDriverPresence(driver);
  });

  // Driver GPS Continuous Streaming Event
  const handleDriverLocation = async (data = {}) => {
    if (!allowSocketRole(socket, 'driver')) return;
    // El identificador siempre proviene de la sesión, jamás del payload.
    const driverId = socket.data.auth.userId;
    const coordinates = normalizeCoordinates(data);
    if (!coordinates) {
      socket.emit('driver:location_rejected', { error: 'INVALID_COORDINATES' });
      return;
    }
    const driver = database.users.find(u => u.id === driverId && u.role === 'driver');
    if (!driver) return;
    driver.location = { ...coordinates, updatedAt: Date.now() };
    // Reportar GPS no reactiva a un conductor suspendido ni cambia su estado:
    // solo cubre el caso de una cuenta sin estado previo.
    if (!driver.status) driver.status = DRIVER_STATUS.AVAILABLE;
    // La ruta más caliente de la aplicación: se dispara con cada lectura de
    // GPS de cada moto en marcha, y solo cambia este conductor.
    if (!await persistRecord('users', driver)) {
      socket.emit('driver:location_rejected', { error: 'DATABASE_WRITE_FAILED' });
      return;
    }
    emitDriverLocation(driverId, { ...driver.location });
  };

  on('driver:location', handleDriverLocation);
  on('driver:location_update', handleDriverLocation);

  on('passenger:location_update', async (data = {}) => {
    if (!allowSocketRole(socket, 'passenger')) return;
    const passengerId = socket.data.auth.userId;
    const trip = database.trips.findLast(item =>
      item.passengerId === passengerId &&
      ['SEARCHING', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP'].includes(item.status)
    );
    if (!trip) return;
    const lat = Number(data.latitude ?? data.lat);
    const lng = Number(data.longitude ?? data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    // EL PUNTO DE RECOGIDA SE CONGELA CUANDO UN CONDUCTOR ACEPTA
    //
    // Decision del dueno: PASSENGER_PICKUP_POLICY = FREEZE_ON_DRIVER_ACCEPT.
    //
    // Buscando conductor tiene sentido que el punto siga a quien lo pidio: aun
    // esta bajando las escaleras o caminando hacia la calle, y nadie ha salido
    // todavia a buscarla.
    //
    // Con un conductor YA en camino, no. El sitio al que va cambiaria bajo sus
    // ruedas sin que el se entere: acepto ir a un punto y acabaria en otro. El
    // punto que recibio al aceptar es el que se queda.
    //
    // Esto NO depende de que el telefono deje de mandar: se comprueba el estado
    // aqui, que es donde esta la autoridad. La posicion en vivo de la pasajera
    // sigue viajando --el conductor la ve acercarse-- pero ya no mueve la
    // recogida.
    if (normalizeTripStatus(trip.status) === TRIP_STATUS.SEARCHING) {
      trip.pickup = { ...(trip.pickup || {}), lat, lng };
    }
    trip.passengerLocation = { lat, lng, heading: Number(data.heading || 0), updatedAt: Date.now() };
    // Un evento por cada movimiento del pasajero: solo cambia este viaje.
    if (!await persistRecord('trips', trip)) {
      socket.emit('passenger:location_rejected', { error: 'DATABASE_WRITE_FAILED' });
      return;
    }
    const payload = { ...trip.passengerLocation, passengerId, tripId: trip.id };
    io.to(`user:${trip.driverId}`).to('admins').emit('passengerLocationUpdated', payload);
  });

  // Driver Status Toggle Event ('AVAILABLE' | 'BUSY' | 'IN_TRIP' | 'OFFLINE')
  const handleDriverStatus = async (data = {}) => {
    if (!allowSocketRole(socket, 'driver')) return;
    const driverId = socket.data.auth.userId;
    const status = normalizeDriverStatus(data.status);
    if (!status) {
      socket.emit('driver:status_rejected', { error: 'INVALID_DRIVER_STATUS', status: data.status });
      return;
    }
    const driver = database.users.find(u => u.id === driverId && u.role === 'driver');
    if (!driver) return;
    driver.status = status;
    if (!await persistRecord('users', driver)) {
      socket.emit('driver:status_rejected', { error: 'DATABASE_WRITE_FAILED' });
      return;
    }
    emitDriverPresence(driver);
  };

  on('driver:status', handleDriverStatus);
  on('driver:status_change', handleDriverStatus);

  // Passenger Ride Request Event
  on('rideRequested', (tripData) => {
    if (!allowSocketRole(socket, 'passenger')) return;
    // `rideRequested` entrante ya no crea, modifica ni redespacha viajes: la
    // única vía es POST /api/trips/create, que valida tarifa, saldo y GPS y
    // persiste en SQLite antes de despachar. El evento saliente del mismo
    // nombre (oferta al conductor) no se ve afectado.
    socket.emit('rideRequestFailed', {
      tripId: typeof tripData?.id === 'string' ? tripData.id : null,
      reason: 'USE_REST_API'
    });
  });

  // Driver Atomic Ride Acceptance Event
  on('rideAccepted', async (data = {}) => {
    if (!allowSocketRole(socket, 'driver')) return;
    // Del cliente solo se acepta el identificador del viaje.
    const tripId = typeof data.tripId === 'string' ? data.tripId : null;
    const driverId = socket.data.auth.userId;
    // Todo rechazo sale por aquí sin haber tocado viaje, conductor, cerrojo,
    // sesión ni temporizador.
    const reject = reason => socket.emit('rideAcceptanceFailed', { tripId, reason });

    if (!tripId) return reject('INVALID_TRIP_ID');
    const authenticatedDriver = database.users.find(user => user.id === driverId && user.role === 'driver');
    if (!authenticatedDriver?.isVerified || authenticatedDriver.status === 'SUSPENDED') {
      return reject('DRIVER_NOT_APPROVED');
    }
    // Sin sesión de despacho no hay oferta que aceptar: conocer el ID del viaje
    // no basta.
    const dispatchSession = dispatchSessions.get(tripId);
    if (!dispatchSession) return reject('NO_ACTIVE_OFFER');
    if (dispatchSession.currentDriverId !== driverId) return reject('NOT_CURRENT_OFFER');

    const trip = database.trips.find(item => item.id === tripId);
    if (!trip) return reject('TRIP_NOT_FOUND');
    if (normalizeTripStatus(trip.status) !== TRIP_STATUS.SEARCHING) {
      return reject('TRIP_NOT_SEARCHING');
    }
    if (tripLocks.get(tripId)) return reject('ALREADY_ACCEPTED');
    if (!canTransitionTrip(trip.status, TRIP_STATUS.DRIVER_ASSIGNED)) {
      return reject('INVALID_TRIP_TRANSITION');
    }

    // PostgreSQL es el árbitro final entre procesos/instancias. El UPDATE
    // condicional solo reserva el viaje si todavía sigue SEARCHING y sin
    // conductor; el cerrojo en memoria por sí solo no cubre otra instancia.
    const reserved = await persistence.reserveTripAssignment(tripId, driverId, new Date().toISOString());
    if (!reserved) return reject('ALREADY_ACCEPTED');

    // A partir de aquí se muta estado. La transición va protegida para que un
    // evento malicioso no pueda derribar el proceso, y el cerrojo se revierte
    // si algo falla.
    tripLocks.set(tripId, true);
    try {
      transitionTrip(trip, TRIP_STATUS.DRIVER_ASSIGNED, { actorId: driverId, actorRole: 'driver' });
    } catch (error) {
      tripLocks.delete(tripId);
      return reject(error.code || 'INVALID_TRIP_TRANSITION');
    }

    if (dispatchTimers.has(tripId)) {
      clearTimeout(dispatchTimers.get(tripId));
      dispatchTimers.delete(tripId);
    }
    dispatchSessions.delete(tripId);

    const driver = driverPublicSummary(authenticatedDriver);
    trip.driver = driver;
    trip.driverId = driverId;
    // El conductor pasa a BUSY solo con la asignación ya consolidada.
    authenticatedDriver.status = DRIVER_STATUS.BUSY;
    if (!await persistDatabase()) return reject('PERSISTENCE_FAILED');

    console.log(`[+58express Socket.IO] Atomic lock success! Ride [${tripId}] assigned to ${driver.firstName}`);

    // Solo los participantes del viaje y administración.
    io.to(`user:${trip.passengerId}`).to(`user:${driverId}`).to('admins').emit('tripStatusUpdated', {
      tripId: trip.id,
      // `EN_ROUTE` es el alias que consumen las pantallas actuales; el estado
      // realmente persistido viaja en canonicalStatus.
      status: 'EN_ROUTE',
      canonicalStatus: trip.status,
      updatedAt: trip.updatedAt,
      driver
    });
    // Y al telefono guardado: «Tu moto viene». Sin await, como todos.
    avisarDelCambioDeViaje(trip);
  });

  on('rideRejected', ({ tripId } = {}) => {
    if (!allowSocketRole(socket, 'driver')) return;
    const session = dispatchSessions.get(tripId);
    if (!session || session.currentDriverId !== socket.data.auth.userId) return;
    if (dispatchTimers.has(tripId)) clearTimeout(dispatchTimers.get(tripId));
    const trip = database.trips.find(item => item.id === tripId);
    if (trip) {
      trip.excludedDriverIds = [...(trip.excludedDriverIds || []), socket.data.auth.userId];
      dispatchTripToDrivers(trip);
    }
  });

  // Trip Status Transition Event ('ARRIVED', 'IN_PROGRESS', 'COMPLETED')
  //
  // OFFLINE-TRIP-1A: la logica de negocio vive en
  // aplicarTransicionDelConductor / anunciarTransicionDelConductor, LAS
  // MISMAS que usa la reconciliacion sin conexion. Este handler solo
  // traduce el transporte socket: online y offline no pueden divergir.
  on('tripStatusUpdated', async (data = {}) => {
    if (!allowSocketRole(socket, 'driver')) return;
    // Del payload del conductor solo se leen estos dos campos; cualquier otra
    // cosa que venga (driver, roles, HTML, campos extra) se descarta.
    const tripId = typeof data.tripId === 'string' ? data.tripId : null;
    const status = typeof data.status === 'string' ? data.status : null;
    const trip = tripId ? database.trips.find(t => t.id === tripId) : null;
    if (!trip || trip.driverId !== socket.data.auth.userId) {
      socket.emit('authorization:error', { error: 'FORBIDDEN', tripId });
      return;
    }
    if (!status) {
      socket.emit('tripStatusRejected', { tripId, status: null, error: 'INVALID_TRIP_STATUS' });
      return;
    }
    const resultado = aplicarTransicionDelConductor(trip, status, socket.data.auth.userId);
    if (!resultado.ok) {
      socket.emit('tripStatusRejected', {
        tripId, status, error: resultado.code,
        balance: resultado.balance, required: resultado.required
      });
      return;
    }
    if (!await persistDatabase()) {
      socket.emit('tripStatusRejected', { tripId, status, error: 'DATABASE_WRITE_FAILED' });
      return;
    }
    anunciarTransicionDelConductor(trip, resultado.settlement);
  });

  // Passenger Ride Cancelled Event
  on('rideCancelled', async (data = {}) => {
    if (!allowSocketRole(socket, 'passenger')) return;
    const { tripId } = data;
    const passengerId = socket.data.auth.userId;
    const trip = database.trips.find(t => t.id === tripId);
    if (!trip) {
      socket.emit('rideCancellationRejected', { tripId, error: 'TRIP_NOT_FOUND' });
      return;
    }
    // La propiedad del viaje se comprueba antes de tocar cerrojos o temporizadores:
    // de lo contrario un tercero podría desarmar el despacho de un viaje ajeno.
    if (trip.passengerId !== passengerId) {
      socket.emit('rideCancellationRejected', { tripId, error: 'FORBIDDEN' });
      return;
    }
    // `canTransitionTrip` admite el estado consigo mismo, así que los viajes ya
    // terminados se descartan aparte.
    const isClosed = [TRIP_STATUS.COMPLETED, TRIP_STATUS.CANCELLED].includes(normalizeTripStatus(trip.status));
    if (isClosed || !canTransitionTrip(trip.status, TRIP_STATUS.CANCELLED)) {
      socket.emit('rideCancellationRejected', { tripId, error: 'TRIP_NOT_CANCELLABLE', status: trip.status });
      return;
    }

    // Se captura al conductor con la oferta abierta antes de limpiar la sesión,
    // para poder cerrarle el modal de carrera entrante.
    const offeredDriverId = dispatchSessions.get(tripId)?.currentDriverId || null;
    tripLocks.delete(tripId);
    dispatchSessions.delete(tripId);
    if (dispatchTimers.has(tripId)) {
      clearTimeout(dispatchTimers.get(tripId));
      dispatchTimers.delete(tripId);
    }
    try {
      transitionTrip(trip, TRIP_STATUS.CANCELLED, { actorId: passengerId, actorRole: 'passenger' });
    } catch (error) {
      socket.emit('rideCancellationRejected', { tripId, error: error.code || 'TRIP_NOT_CANCELLABLE', status: trip.status });
      return;
    }
    const assignedDriver = database.users.find(user => user.id === trip.driverId);
    if (assignedDriver) assignedDriver.status = DRIVER_STATUS.AVAILABLE;
    if (!await persistDatabase()) {
      socket.emit('rideCancellationRejected', { tripId, error: 'DATABASE_WRITE_FAILED' });
      return;
    }

    console.log(`[+58express Socket.IO] Ride [${tripId}] cancelled by passenger`);
    let audience = io.to(`user:${passengerId}`).to('admins');
    if (trip.driverId) audience = audience.to(`user:${trip.driverId}`);
    if (offeredDriverId && offeredDriverId !== trip.driverId) audience = audience.to(`user:${offeredDriverId}`);
    audience.emit('rideCancelled', { tripId });
    if (assignedDriver) emitDriverPresence(assignedDriver, { includeActivePassenger: false });
  });

  on('chat:send_message', async (data = {}) => {
    const trip = database.trips.find(item => item.id === data.tripId);
    // La identidad sale de la sesion firmada. `data.senderId`, si viene, se
    // ignora: nadie habla en nombre de otro por escribirlo en el payload.
    const { userId, role } = socket.data.auth;
    if (!trip || !userCanAccessTrip(userId, role, trip) || role === 'admin') {
      socket.emit('chat:error', { error: 'FORBIDDEN', tripId: data.tripId });
      return;
    }
    // LA POLITICA DE CONTACTO YA EXISTIA; EL CHAT NO LA APLICABA.
    //
    // `isContactableTrip` es la que decide cuando viaja el telefono del
    // conductor: solo mientras la carrera esta viva. Es la misma regla para
    // escribir. Un viaje terminado conserva su historial --se lee igual-- pero
    // no admite mensajes nuevos: no es una conversacion, es un registro.
    if (!isContactableTrip(trip)) {
      socket.emit('chat:error', { error: 'CHAT_CLOSED', tripId: trip.id });
      return;
    }
    const text = String(data.text || '').trim().slice(0, 1000);
    // Misma semantica que el productor de soporte, por el mismo pipeline.
    const tieneImagen = isChatImageDataUrl(data.image);
    // Vacio se contesta, no se traga: el cliente que mando algo espera saber
    // que paso con ello.
    if (!text && !tieneImagen) {
      socket.emit('chat:error', { error: 'EMPTY_MESSAGE', tripId: trip.id });
      return;
    }

    // IDEMPOTENCIA DEL CLIENTE.
    //
    // Un reintento tras un corte --el mismo mensaje reenviado al reconectar--
    // no puede aparecer dos veces. El cliente manda una clave por intento, y
    // si ya hay un mensaje de ESTA persona en ESTE viaje con esa clave, se
    // vuelve a anunciar el existente en vez de crear otro. La clave se acota
    // para que no sirva de almacen de nada.
    const clientId = typeof data.clientId === 'string'
      ? data.clientId.trim().slice(0, 64)
      : '';
    if (clientId) {
      const repetido = database.messages.find(m =>
        m.tripId === trip.id && m.senderId === userId && m.clientId === clientId);
      if (repetido) {
        io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).emit('chat:message', publicChatMessage(repetido));
        return;
      }
    }
    const sender = database.users.find(user => user.id === userId);

    const construir = async (media) => {
      const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tripId: trip.id,
        senderId: userId,
        senderName: sender?.firstName || 'Usuario',
        recipientId: role === 'driver' ? trip.passengerId : trip.driverId,
        text,
        ...(media || {}),
        // Se guarda para poder reconocer el reintento. Viaja al cliente, que es
        // quien la genero, para casar su pendiente con el mensaje durable.
        ...(clientId ? { clientId } : {}),
        timestamp: new Date().toISOString()
      };
      database.messages.push(message);
      try {
        if (!await persistRecord('messages', message)) throw new Error('DATABASE_WRITE_FAILED');
      } catch (error) {
        const indice = database.messages.indexOf(message);
        if (indice >= 0) database.messages.splice(indice, 1);
        throw error;
      }
      return message;
    };

    let message;
    try {
      message = tieneImagen
        ? await chatMediaPipeline.withStoredImageAsync(data.image, userId, construir)
        : await construir(null);
    } catch (error) {
      // El cliente recibe el codigo, nunca el detalle.
      socket.emit('chat:error', {
        error: ['INVALID_CHAT_IMAGE', 'CHAT_IMAGE_TOO_LARGE', 'INVALID_FILE_TYPE', 'CHAT_MEDIA_TOO_LARGE', 'CHAT_MEDIA_STORAGE_FULL'].includes(error?.code)
          ? error.code
          : 'CHAT_MESSAGE_FAILED',
        tripId: trip.id
      });
      return;
    }

    io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).emit('chat:message', publicChatMessage(message));

    // El push del mensaje, para la CONTRAPARTE (PUSH-1).
    //
    // Quien escribio no necesita que le avisen de su propio mensaje. Y si la
    // contraparte tiene la aplicacion conectada tampoco: ya lo esta viendo
    // aparecer en la conversacion, y el servicio lo suprime solo.
    //
    // El payload lleva el tipo y el viaje. Ni el texto, ni el nombre de quien
    // escribio, ni la imagen: eso se lee al abrir, con sesion.
    const destinatario = userId === trip.passengerId ? trip.driverId : trip.passengerId;
    if (destinatario) {
      pushService.notifyChatMessage({ tripId: trip.id, messageId: message.id, userId: destinatario })
        .catch(error => {
          console.error(`[+58express Push] rechazo inesperado de notifyChatMessage: ${error?.name || 'UNKNOWN'}`);
        });
    }
  });

  on('tripRated', async (data = {}) => {
    const trip = database.trips.find(item => item.id === data.tripId);
    const { userId, role } = socket.data.auth;
    if (!trip || !userCanAccessTrip(userId, role, trip) || !['driver', 'passenger'].includes(role)) return;
    const rating = Math.max(1, Math.min(5, Number(data.rating) || 5));
    const review = {
      rating,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 5) : [],
      comment: String(data.comment || '').slice(0, 500),
      createdAt: new Date().toISOString()
    };
    if (role === 'driver' && data.targetRole === 'passenger') trip.passengerReview = review;
    if (role === 'passenger' && data.targetRole === 'driver') {
      trip.driverReview = { ...review, tipEUR: Math.max(0, Number(data.tipEUR) || 0) };
    }
    if (!await persistRecord('trips', trip)) {
      socket.emit('tripRatingRejected', { tripId: trip.id, error: 'DATABASE_WRITE_FAILED' });
      return;
    }
    io.to(`user:${trip.passengerId}`).to(`user:${trip.driverId}`).to('admins').emit('tripRatingUpdated', { tripId: trip.id, role, review });
  });

  socket.on('disconnect', async () => {
    for (const [driverId, socketId] of driverRegistry.entries()) {
      if (socketId === socket.id) {
        driverRegistry.delete(driverId);
        const driver = database.users.find(u => u.id === driverId);
        if (driver) {
          driver.status = DRIVER_STATUS.OFFLINE;
          if (!await persistRecord('users', driver)) {
            console.error(`[+58express Database] No se pudo persistir la desconexión de ${driverId}`);
          }
          emitDriverPresence(driver);
        } else {
          io.to('admins').emit('admin:driver_updated', { id: driverId, userId: driverId, status: DRIVER_STATUS.OFFLINE });
        }
      }
    }
    console.log(`[+58express Socket.IO] Client disconnected: ${socket.id}`);
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED' });
  }
  if (error?.code === 'INVALID_FILE_TYPE' || error?.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ error: 'INVALID_FILE_TYPE' });
  }
  if (error?.message === 'ORIGIN_NOT_ALLOWED') return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
  console.error('[+58express HTTP]', error);
  // LOS 4xx DE ARRIBA NO SE MANDAN, ÉSTE SÍ.
  //
  // Un fichero demasiado grande o un origen no permitido son respuestas
  // correctas a peticiones incorrectas: no hay nada que arreglar y llenarían
  // Sentry de ruido. Llegar aquí, en cambio, es un fallo del servidor.
  capturarExcepcion(error, {
    usuario: _req?.user ? { id: _req.user.id, role: _req.user.role } : undefined,
    etiquetas: { area: 'http', metodo: _req?.method ?? '?', ruta: _req?.route?.path ?? _req?.path ?? '?' }
  });
  return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
});

/**
 * Lo que se escapa de todos los `try`.
 *
 * Sin esto, una promesa rechazada sin capturar sale por la consola de Railway y
 * ahí se queda: nadie la ve hasta que alguien va a mirar los registros, que es
 * justo lo que la observabilidad viene a evitar.
 *
 * NO SE MATA EL PROCESO en ninguno de los dos casos. Con testers externos
 * usando la beta, un rechazo no capturado en una rama secundaria no puede
 * tumbar el servidor de todos: se registra, se envía y se sigue sirviendo.
 */
process.on('unhandledRejection', razon => {
  console.error('[+58express Proceso] promesa rechazada sin capturar:', razon);
  capturarExcepcion(razon instanceof Error ? razon : new Error(String(razon)), {
    etiquetas: { area: 'proceso', tipo: 'unhandledRejection' }
  });
});

process.on('uncaughtException', error => {
  console.error('[+58express Proceso] excepcion sin capturar:', error);
  capturarExcepcion(error, { etiquetas: { area: 'proceso', tipo: 'uncaughtException' } });
});

server.listen(PORT, () => {
  console.log(`🚀 [+58express Backend Server] Running on http://localhost:${PORT}`);
  console.log(
    observabilidad.activo
      ? `[+58express Observabilidad] Sentry ENCENDIDO (entorno=${observabilidad.entorno}, version=${observabilidad.version ?? 'sin declarar'})`
      : `[+58express Observabilidad] Sentry apagado: ${observabilidad.motivo} (entorno=${observabilidad.entorno})`
  );
});
