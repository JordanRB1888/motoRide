/**
 * Lo que dice un aviso push, y a dónde lleva. Puro: sin React Native, sin red.
 *
 * EL PAYLOAD NO ES AUTORIDAD
 *
 * Un aviso trae un TIPO y, si acaso, el identificador de un viaje. Nada más se
 * lee, y nada de lo que trae se cree: sirve para decidir QUÉ PANTALLA abrir, y
 * esa pantalla vuelve a preguntar al servidor lo que hay de verdad. Un aviso
 * que diga «tu viaje empezó» de un viaje que ya no es tuyo abre la pantalla del
 * viaje activo, que dirá que no hay ninguno. Nunca se pinta nada del payload.
 *
 * Por eso aquí no existe ningún campo de dirección, de nombre, de texto de
 * mensaje ni de imagen: aunque un servidor equivocado los mandara, este
 * analizador no los devuelve, y ninguna pantalla puede leerlos.
 *
 * LA TABLA DE TEXTOS ES ESPEJO DE LA DEL SERVIDOR
 *
 * `TEXTO_DE_AVISO` traduce el tipo a título y cuerpo cuando la aplicación está
 * abierta y presenta el aviso ella misma. Con la aplicación cerrada lo presenta
 * el sistema con las mismas cadenas, que el servidor manda como constantes.
 * Hay una prueba que compara las dos tablas: si divergen, se nota antes.
 */

export const TIPOS_DE_AVISO = [
  'ride_request',
  'scheduled_offer',
  'scheduled_pickup_due',
  'scheduled_cancelled',
  'trip_accepted',
  'trip_arrived',
  'trip_started',
  'trip_completed',
  'trip_cancelled',
  'chat_message'
] as const;

export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

export interface Aviso {
  readonly tipo: TipoDeAviso;
  readonly viajeId: string | null;
}

/** Título y cuerpo por tipo. CONSTANTES: ver la cabecera. */
export const TEXTO_DE_AVISO: Readonly<Record<TipoDeAviso | 'por_omision', { readonly title: string; readonly body: string }>> = Object.freeze({
  ride_request: { title: 'Nueva carrera', body: 'Tienes una solicitud cerca de ti. Responde antes de 15 segundos.' },
  scheduled_offer: { title: 'Transporte Seguro', body: 'Te proponen un traslado programado.' },
  scheduled_pickup_due: { title: 'Transporte Seguro', body: 'Es hora de ir a buscar tu traslado programado.' },
  scheduled_cancelled: { title: 'Transporte Seguro', body: 'Un traslado programado se canceló.' },
  trip_accepted: { title: 'Tu moto viene', body: 'Un conductor aceptó tu viaje.' },
  trip_arrived: { title: 'Tu conductor llegó', body: 'Te está esperando en el punto de recogida.' },
  trip_started: { title: 'Viaje en marcha', body: 'Ya vas en camino a tu destino.' },
  trip_completed: { title: 'Viaje terminado', body: 'Llegaste. Gracias por viajar con +58Express.' },
  trip_cancelled: { title: 'Viaje cancelado', body: 'Tu viaje se canceló. Puedes pedir otro cuando quieras.' },
  chat_message: { title: 'Nuevo mensaje', body: 'Tienes un mensaje en el chat de tu viaje.' },
  por_omision: { title: '+58Express', body: 'Tienes una novedad en tu viaje.' }
});

function esTipo(valor: unknown): valor is TipoDeAviso {
  return typeof valor === 'string' && (TIPOS_DE_AVISO as readonly string[]).includes(valor);
}

/**
 * Lee el `data` de un aviso. Devuelve `null` ante cualquier cosa que no sea
 * un aviso nuestro: un tipo desconocido, una versión que no se entiende, un
 * `data` vacío. Nunca lanza — un aviso raro no puede tumbar la aplicación.
 */
export function leerAviso(data: unknown): Aviso | null {
  if (typeof data !== 'object' || data === null) return null;
  const dato = data as Record<string, unknown>;
  const version = Number(dato.v ?? 1);
  if (version !== 1) return null;
  if (!esTipo(dato.t)) return null;
  const viajeId = typeof dato.tripId === 'string' && dato.tripId.trim() !== '' ? dato.tripId.trim() : null;
  return { tipo: dato.t, viajeId };
}

export type RolDeSesion = 'passenger' | 'driver' | null;

/**
 * A qué pantalla lleva un aviso, según quién lo toca.
 *
 * Las rutas son las REALES, las que ya vuelven a consultar al servidor al
 * montarse: `/conductor` enseña la oferta viva del socket, `/viaje-activo`
 * resincroniza el viaje, `/chat` lee el viaje activo. Ninguna recibe el payload
 * como estado — sólo se abre la puerta correcta.
 *
 * Un aviso para un rol que no es el de la sesión lleva al inicio: si entró
 * otra cuenta en este teléfono, la oferta del conductor anterior no debe abrir
 * nada suyo. Y sin sesión, a la raíz, que decide.
 */
export function destinoDeAviso(aviso: Aviso, rol: RolDeSesion): string {
  if (rol === null) return '/';

  switch (aviso.tipo) {
    case 'ride_request':
    case 'scheduled_offer':
    case 'scheduled_pickup_due':
      return rol === 'driver' ? '/conductor' : inicioDe(rol);
    case 'trip_accepted':
    case 'trip_arrived':
    case 'trip_started':
      return rol === 'passenger' ? '/viaje-activo' : '/conductor';
    case 'trip_completed':
    case 'trip_cancelled':
    case 'scheduled_cancelled':
      // Ya no hay viaje activo que abrir: el historial es donde queda.
      return aviso.viajeId !== null ? `/viaje/${encodeURIComponent(aviso.viajeId)}` : inicioDe(rol);
    case 'chat_message':
      return '/chat';
    default:
      return inicioDe(rol);
  }
}

function inicioDe(rol: Exclude<RolDeSesion, null>): string {
  return rol === 'driver' ? '/conductor' : '/pasajero';
}

/**
 * El canal de Android. Importancia máxima: una oferta de carrera tiene que
 * sonar. Es espejo de `CANAL_ANDROID` en el servidor --el aviso llega con ese
 * `channelId`-- y hay una prueba que lo vigila.
 */
export const CANAL_DE_CARRERAS = 'carreras';

/**
 * El permiso, en tres estados y sin adornos.
 *
 *   sin_decidir  todavía no se ha preguntado: se puede pedir.
 *   concedido    se puede registrar el dispositivo.
 *   denegado     NO se vuelve a preguntar. La aplicación funciona igual: el
 *                socket, la resincronización y el historial no dependen de esto.
 */
export type EstadoDePermiso = 'sin_decidir' | 'concedido' | 'denegado';

/**
 * `yaSePidio` es memoria NUESTRA, y hace falta: Android no distingue «nunca se
 * pidió» de «se denegó». Antes de la primera petición el sistema ya dice
 * `denied` (con `canAskAgain: true`), porque lo deriva de «las notificaciones
 * no están habilitadas». Sin esta memoria, o no se pediría nunca, o se
 * insistiría en cada sesión mientras el sistema lo permitiera.
 */
export function estadoDePermiso(granted: boolean, canAskAgain: boolean, status: string, yaSePidio = false): EstadoDePermiso {
  if (granted) return 'concedido';
  // El sistema ya no deja preguntar: denegado, se haya pedido aquí o no.
  if (!canAskAgain) return 'denegado';
  // iOS lo dice claro: nunca se preguntó.
  if (status === 'undetermined') return 'sin_decidir';
  // Se pidió una vez y se negó: no se insiste aunque el sistema lo permita.
  if (yaSePidio) return 'denegado';
  // El `denied` de Android antes de pedir: nunca se pidió, se pide.
  return 'sin_decidir';
}

/** Sólo se pide cuando no se ha decidido. Nunca se insiste. */
export function convienePedirPermiso(estado: EstadoDePermiso): boolean {
  return estado === 'sin_decidir';
}
