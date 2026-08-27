/**
 * Suscripcion de Web Push en el navegador.
 *
 * Toda la maquinaria de `PushManager` vive aqui: ni driverApp.js ni ninguna
 * pantalla llama al navegador por su cuenta. Asi hay un unico sitio donde
 * razonar sobre permisos, soporte y ciclo de vida.
 *
 * Tres reglas que gobiernan el modulo:
 *
 *   1. Push es una MEJORA, nunca un requisito. Ninguna rama de este fichero
 *      puede impedir que un conductor se ponga en linea. Todo devuelve un
 *      resultado estructurado; nada lanza hacia la pantalla.
 *   2. La clave publica VAPID viene del backend. No se codifica en el fuente,
 *      y la privada no existe en el navegador ni puede existir.
 *   3. El propietario de la suscripcion lo decide el servidor a partir del
 *      token. Este cliente NO envia userId, ni rol, ni nada del dispositivo.
 *
 * El modulo se carga sin efectos secundarios: `apiService` se importa de forma
 * diferida dentro del acceso al singleton, de modo que las pruebas pueden
 * construir el servicio con dobles sin arrastrar `import.meta.env`.
 */

export const PUSH_RESULT = Object.freeze({
  UNSUPPORTED: 'UNSUPPORTED',
  PUSH_DISABLED: 'PUSH_DISABLED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PERMISSION_DISMISSED: 'PERMISSION_DISMISSED',
  INVALID_PUBLIC_KEY: 'INVALID_PUBLIC_KEY',
  SUBSCRIBE_FAILED: 'SUBSCRIBE_FAILED',
  REGISTRATION_FAILED: 'REGISTRATION_FAILED',
  SUBSCRIBED: 'SUBSCRIBED',
  ALREADY_SUBSCRIBED: 'ALREADY_SUBSCRIBED',
  UNSUBSCRIBED: 'UNSUBSCRIBED',
  NOTHING_TO_DO: 'NOTHING_TO_DO'
});

/**
 * Clave local. Solo guarda el identificador OPACO que devuelve el servidor,
 * que es lo unico que necesita la baja explicita (`DELETE /push/subscriptions/:id`).
 *
 * NUNCA se guarda el endpoint ni `p256dh` ni `auth`: ese material ya lo posee
 * el propio `PushManager` del navegador, y duplicarlo en localStorage solo
 * multiplicaria los sitios desde los que puede escaparse.
 *
 * Perderlo no es grave: el alta es idempotente por endpoint, asi que la
 * siguiente reconciliacion devuelve el mismo identificador y lo restaura.
 */
const CLAVE_ID = '58express_push_subscription_id';

/** Convierte la clave publica base64url del servidor al formato del navegador. */
export function urlBase64ToUint8Array(base64UrlString) {
  if (typeof base64UrlString !== 'string' || base64UrlString.trim() === '') {
    throw new Error('INVALID_PUBLIC_KEY');
  }
  const limpia = base64UrlString.trim();
  if (!/^[A-Za-z0-9_-]+=*$/.test(limpia)) throw new Error('INVALID_PUBLIC_KEY');

  const relleno = '='.repeat((4 - (limpia.length % 4)) % 4);
  const base64 = (limpia + relleno).replace(/-/g, '+').replace(/_/g, '/');
  let binario;
  try {
    binario = atob(base64);
  } catch {
    throw new Error('INVALID_PUBLIC_KEY');
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function createPushSubscriptionService({
  api,
  navigatorRef = typeof navigator !== 'undefined' ? navigator : undefined,
  windowRef = typeof window !== 'undefined' ? window : undefined,
  storage = typeof localStorage !== 'undefined' ? localStorage : undefined,
  logger = { warn: () => {}, info: () => {} },
  base64ToBytes = urlBase64ToUint8Array
} = {}) {
  if (!api) throw new Error('PUSH_SERVICE_REQUIRES_API');

  /**
   * Deteccion de capacidades. Se comprueban las TRES: hay navegadores con
   * service worker y sin PushManager, y iOS solo expone PushManager cuando el
   * PWA esta instalado en la pantalla de inicio.
   */
  function detectSupport() {
    const falta = [];
    if (!navigatorRef || !('serviceWorker' in navigatorRef)) falta.push('serviceWorker');
    if (!windowRef || !('PushManager' in windowRef)) falta.push('PushManager');
    if (!windowRef || !('Notification' in windowRef)) falta.push('Notification');
    return { supported: falta.length === 0, missing: falta };
  }

  /** 'unsupported' | 'default' | 'granted' | 'denied' */
  function getPermissionState() {
    if (!detectSupport().supported) return 'unsupported';
    return windowRef.Notification.permission;
  }

  const leerId = () => {
    try { return storage?.getItem(CLAVE_ID) || null; } catch { return null; }
  };
  const guardarId = (id) => {
    try { if (id) storage?.setItem(CLAVE_ID, id); } catch { /* almacenamiento no disponible */ }
  };
  const borrarId = () => {
    try { storage?.removeItem(CLAVE_ID); } catch { /* almacenamiento no disponible */ }
  };

  /** Configuracion del servidor. Nunca lanza. */
  async function fetchConfig() {
    const respuesta = await api.get('/push/public-key').catch(() => null);
    if (!respuesta || typeof respuesta !== 'object') return { enabled: false, publicKey: null };
    return {
      enabled: respuesta.enabled === true,
      publicKey: typeof respuesta.publicKey === 'string' && respuesta.publicKey !== ''
        ? respuesta.publicKey
        : null
    };
  }

  /**
   * Registra en el backend una suscripcion del navegador.
   *
   * Envia EXCLUSIVAMENTE el contrato que PUSH-1 espera. Ni `userId`, ni rol,
   * ni user-agent, ni nombre de dispositivo: el propietario lo deriva el
   * servidor de `req.user.id`, y mandar un userId no serviria de nada porque
   * el backend lo descarta sin mirarlo.
   */
  async function registrarEnBackend(subscription) {
    const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
    const endpoint = json?.endpoint;
    const p256dh = json?.keys?.p256dh;
    const auth = json?.keys?.auth;
    if (!endpoint || !p256dh || !auth) return null;

    const creado = await api.post('/push/subscriptions', {
      endpoint,
      keys: { p256dh, auth }
    }).catch(() => null);

    if (!creado || typeof creado.id !== 'string') return null;
    guardarId(creado.id);
    return creado.id;
  }

  async function obtenerRegistro() {
    try {
      return await navigatorRef.serviceWorker.ready;
    } catch {
      return null;
    }
  }

  /**
   * Flujo completo de alta. `requestPermission` a true SOLO desde un gesto
   * explicito de la persona: los navegadores lo exigen, y un dialogo no
   * solicitado se rechaza casi siempre y de forma practicamente definitiva.
   */
  async function subscribe({ requestPermission = false } = {}) {
    const soporte = detectSupport();
    if (!soporte.supported) return { result: PUSH_RESULT.UNSUPPORTED, missing: soporte.missing };

    let permiso = windowRef.Notification.permission;
    if (permiso === 'denied') return { result: PUSH_RESULT.PERMISSION_DENIED };
    if (permiso === 'default') {
      if (!requestPermission) return { result: PUSH_RESULT.PERMISSION_DISMISSED };
      try {
        permiso = await windowRef.Notification.requestPermission();
      } catch {
        return { result: PUSH_RESULT.PERMISSION_DISMISSED };
      }
      if (permiso === 'denied') return { result: PUSH_RESULT.PERMISSION_DENIED };
      if (permiso !== 'granted') return { result: PUSH_RESULT.PERMISSION_DISMISSED };
    }

    // Se consulta al servidor DESPUES del permiso pero ANTES de suscribir: con
    // la funcionalidad apagada no tiene sentido crear una suscripcion en el
    // navegador que nadie va a usar.
    const config = await fetchConfig();
    if (!config.enabled) return { result: PUSH_RESULT.PUSH_DISABLED };
    if (!config.publicKey) return { result: PUSH_RESULT.INVALID_PUBLIC_KEY };

    let claveAplicacion;
    try {
      claveAplicacion = base64ToBytes(config.publicKey);
    } catch {
      return { result: PUSH_RESULT.INVALID_PUBLIC_KEY };
    }

    const registro = await obtenerRegistro();
    if (!registro?.pushManager) return { result: PUSH_RESULT.UNSUPPORTED, missing: ['pushManager'] };

    // Se reutiliza la suscripcion que ya tenga el navegador en vez de crear
    // otra a ciegas: crear una nueva rota el endpoint anterior y deja una fila
    // muerta en el servidor hasta que un 410 la retire.
    let existente = null;
    try {
      existente = await registro.pushManager.getSubscription();
    } catch {
      existente = null;
    }

    if (existente) {
      const id = await registrarEnBackend(existente);
      return id
        ? { result: PUSH_RESULT.ALREADY_SUBSCRIBED, subscriptionId: id }
        : { result: PUSH_RESULT.REGISTRATION_FAILED };
    }

    let nueva;
    try {
      nueva = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveAplicacion
      });
    } catch {
      // No se registra el error tal cual: su mensaje puede arrastrar el
      // endpoint completo, que es material sensible.
      logger.warn('[push] no se pudo suscribir en el navegador');
      return { result: PUSH_RESULT.SUBSCRIBE_FAILED };
    }

    const id = await registrarEnBackend(nueva);
    if (!id) {
      // El backend no acepto el alta. Se deshace la suscripcion del navegador
      // para no dejar un endpoint vivo que nadie conoce.
      try { await nueva.unsubscribe(); } catch { /* ya no existe */ }
      return { result: PUSH_RESULT.REGISTRATION_FAILED };
    }
    return { result: PUSH_RESULT.SUBSCRIBED, subscriptionId: id };
  }

  /**
   * Reconciliacion en primer plano.
   *
   * Es el camino fiable para la rotacion de endpoint: el service worker no
   * puede registrar en el backend porque no tiene sesion, asi que cuando la
   * aplicacion vuelve al frente con permiso concedido se vuelve a registrar la
   * suscripcion que tenga el navegador. Es idempotente --el alta reasigna la
   * misma fila por endpoint-- y nunca pide permiso ni muestra dialogos.
   */
  async function reconcile() {
    const soporte = detectSupport();
    if (!soporte.supported) return { result: PUSH_RESULT.UNSUPPORTED, missing: soporte.missing };
    if (windowRef.Notification.permission !== 'granted') return { result: PUSH_RESULT.NOTHING_TO_DO };

    const registro = await obtenerRegistro();
    if (!registro?.pushManager) return { result: PUSH_RESULT.NOTHING_TO_DO };

    let existente = null;
    try {
      existente = await registro.pushManager.getSubscription();
    } catch {
      existente = null;
    }
    if (!existente) return { result: PUSH_RESULT.NOTHING_TO_DO };

    const config = await fetchConfig();
    if (!config.enabled) return { result: PUSH_RESULT.PUSH_DISABLED };

    const id = await registrarEnBackend(existente);
    return id
      ? { result: PUSH_RESULT.ALREADY_SUBSCRIBED, subscriptionId: id }
      : { result: PUSH_RESULT.REGISTRATION_FAILED };
  }

  /**
   * Baja explicita.
   *
   * Se intenta el servidor primero y el navegador siempre. Que el backend
   * falle no puede dejar a nadie atrapado con una suscripcion viva que no
   * sabe quitarse: la baja del navegador ocurre pase lo que pase.
   */
  async function unsubscribe() {
    const soporte = detectSupport();
    if (!soporte.supported) return { result: PUSH_RESULT.UNSUPPORTED, missing: soporte.missing };

    const id = leerId();
    if (id) await api.delete(`/push/subscriptions/${encodeURIComponent(id)}`).catch(() => null);

    const registro = await obtenerRegistro();
    let habia = false;
    if (registro?.pushManager) {
      try {
        const actual = await registro.pushManager.getSubscription();
        if (actual) {
          habia = true;
          await actual.unsubscribe();
        }
      } catch {
        // El navegador ya no la tiene: el objetivo se cumple igual.
      }
    }

    borrarId();
    return { result: habia || id ? PUSH_RESULT.UNSUBSCRIBED : PUSH_RESULT.NOTHING_TO_DO };
  }

  return {
    detectSupport,
    getPermissionState,
    fetchConfig,
    subscribe,
    reconcile,
    unsubscribe,
    getStoredSubscriptionId: leerId
  };
}

let instancia = null;

/**
 * Singleton de la aplicacion. La importacion de `apiService` es diferida a
 * proposito: mantiene este modulo libre de efectos al cargarse y permite
 * probar `createPushSubscriptionService` sin `import.meta.env`.
 */
export async function getPushSubscriptionService() {
  if (!instancia) {
    const { apiService } = await import('./apiService.js');
    const { eventLogger } = await import('../utils/logger.js');
    instancia = createPushSubscriptionService({ api: apiService, logger: eventLogger });
  }
  return instancia;
}
