/**
 * La oferta de carrera que le llega a un conductor.
 *
 * QUÉ HAY YA Y QUÉ FALTABA
 *
 * El despacho existe entero en el servidor: elige candidatos, ofrece de uno en
 * uno, cuenta quince segundos y pasa al siguiente si nadie contesta. Emite
 * `rideRequested` con el viaje y su vencimiento, y acepta `rideAccepted` y
 * `rideRejected`. Nada de eso se toca aquí.
 *
 * Lo que faltaba era la pantalla. Este fichero es su cabeza: decide qué se ve,
 * cuánto queda y qué se puede pulsar, sin nada de React Native, para poder
 * comprobarlo sin emulador.
 *
 * EL SERVIDOR SIGUE SIENDO LA AUTORIDAD
 *
 * Lo de aquí decide qué ENSEÑAR. Quién se queda la carrera lo decide el
 * servidor con su reserva condicional: dos conductores pueden pulsar «aceptar»
 * a la vez y sólo uno la consigue. Esta pantalla nunca da por hecho que ganó
 * hasta que llega la confirmación.
 */

/** Los estados por los que pasa la superficie de oferta. */
export const ESTADOS_DE_OFERTA = [
  /** Sin conexión de tiempo real: no puede llegar ninguna oferta. */
  'OFFLINE',
  /** En línea y disponible, sin oferta delante. */
  'ESPERANDO',
  /** Hay una oferta viva y se está pintando. */
  'OFERTA',
  /** Se pulsó aceptar y el servidor todavía no ha contestado. */
  'ACEPTANDO',
  /** El servidor confirmó: la carrera es suya. */
  'ACEPTADA',
  /** Se rechazó; el despacho sigue con otro. */
  'RECHAZADA',
  /** Se acabaron los segundos sin contestar. */
  'EXPIRADA',
  /** El servidor dijo que no: otro llegó antes, o algo falló. */
  'ERROR'
] as const;
export type EstadoDeOferta = (typeof ESTADOS_DE_OFERTA)[number];

/** Lo que hace falta para pintar una oferta. Nada de esto se inventa. */
export interface OfertaDeViaje {
  readonly viajeId: string;
  readonly recogida: { readonly lat: number; readonly lng: number; readonly direccion: string | null };
  readonly destino: { readonly lat: number; readonly lng: number; readonly direccion: string | null } | null;
  readonly tipo: 'MOTO' | 'AUTO';
  /** Kilómetros del recorrido, medidos por el servidor. */
  readonly distanciaKm: number | null;
  /** Kilómetros que hay HASTA la recogida. */
  readonly distanciaHastaRecogidaKm: number | null;
  readonly minutos: number | null;
  readonly dolares: number | null;
  readonly bolivares: number | null;
  readonly formaDePago: string;
  /**
   * Cuándo deja de valer la oferta, EN EL RELOJ DE ESTE APARATO.
   *
   * No es la marca que mandó el servidor: es esa duración anclada al reloj
   * local al recibirla. Ver `leerOferta`.
   */
  readonly venceEn: number;
  readonly nombreDePasajera: string | null;
}

const FORMAS_DE_PAGO: Readonly<Record<string, string>> = {
  CASH: 'Efectivo',
  WALLET: 'Saldo',
  PAGO_MOVIL: 'Pago móvil',
  ZELLE: 'Zelle',
  ZINLI: 'Zinli'
};

/** Cómo se llama una forma de pago en la pantalla. */
export function formaDePagoEnPantalla(valor: unknown): string {
  const clave = String(valor ?? '').trim().toUpperCase();
  return FORMAS_DE_PAGO[clave] ?? 'Efectivo';
}

function numeroPositivo(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function punto(valor: unknown): { lat: number; lng: number; direccion: string | null } | null {
  if (valor === null || typeof valor !== 'object') return null;
  const crudo = valor as Record<string, unknown>;
  const lat = Number(crudo.lat);
  const lng = Number(crudo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const direccion = typeof crudo.address === 'string' && crudo.address.trim() !== ''
    ? crudo.address.trim()
    : null;
  return { lat, lng, direccion };
}

/**
 * Cuándo vence esta oferta, en el reloj de ESTE aparato.
 *
 * EL RELOJ DEL TELÉFONO NO ES EL DEL SERVIDOR, Y AQUÍ ESO DECIDÍA LA CARRERA
 *
 * El servidor manda dos cosas: `offerExpiresInMs`, lo que le queda a la oferta
 * contado desde que la emite, y `offerExpiresAt`, la marca absoluta en SU
 * reloj. La segunda no sirve para contar aquí: restarla contra `Date.now()`
 * del aparato mete en el resultado todo lo que los dos relojes se lleven. En
 * el laboratorio el emulador iba veintidós segundos atrasado y la tarjeta
 * anunciaba treinta y siete segundos de una ventana de quince. Con el reloj
 * adelantado el error va al otro lado y es mucho peor: la oferta nace vencida,
 * el botón no deja pulsar, y quien conduce no puede aceptar NINGUNA carrera
 * sin entender por qué.
 *
 * Así que se ancla la duración al reloj propio en el momento de recibirla. Lo
 * único que se pierde es el viaje del mensaje por la red, que son
 * milisegundos, y siempre en la dirección segura: el contador local va un
 * pelín por detrás del servidor, nunca por delante.
 *
 * `offerExpiresAt` se sigue aceptando para no depender de que el servidor esté
 * al día, pero es el camino de peor: sólo acierta si los dos relojes coinciden.
 */
function vencimientoAnclado(crudo: Record<string, unknown>, recibidaEn: number): number | null {
  const restante = Number(crudo.offerExpiresInMs);
  if (Number.isFinite(restante) && Number.isFinite(recibidaEn)) return recibidaEn + restante;
  const absoluto = Number(crudo.offerExpiresAt);
  return Number.isFinite(absoluto) ? absoluto : null;
}

/**
 * Lee la oferta que llega por `rideRequested`.
 *
 * Devuelve `null` si le falta algo sin lo cual no se puede pintar: el viaje, el
 * punto de recogida o el vencimiento. **Media oferta no se enseña** — un
 * conductor decidiendo en quince segundos no puede permitirse un dato a medias.
 *
 * Lo que sí puede faltar sin romper nada son la tarifa, la distancia o el
 * destino: se pintan como «—» y quien mira sabe que no se sabe, en vez de leer
 * un cero que parece un precio.
 */
export function leerOferta(cuerpo: unknown, recibidaEn: number = Date.now()): OfertaDeViaje | null {
  if (cuerpo === null || typeof cuerpo !== 'object') return null;
  const crudo = cuerpo as Record<string, unknown>;

  const viajeId = typeof crudo.id === 'string' && crudo.id !== '' ? crudo.id : null;
  const recogida = punto(crudo.pickup);
  const venceEn = vencimientoAnclado(crudo, recibidaEn);
  if (viajeId === null || recogida === null || venceEn === null) return null;

  const nombre = typeof crudo.passengerName === 'string' && crudo.passengerName.trim() !== ''
    ? crudo.passengerName.trim()
    : null;

  return {
    viajeId,
    recogida,
    destino: punto(crudo.destination),
    tipo: crudo.rideType === 'CAR' ? 'AUTO' : 'MOTO',
    distanciaKm: numeroPositivo(crudo.distanceKm),
    distanciaHastaRecogidaKm: numeroPositivo(crudo.distanceToPickupKm),
    minutos: numeroPositivo(crudo.durationMin),
    dolares: numeroPositivo(crudo.fareUSD),
    // Con `FX_BCV_LIVE` apagado el servidor manda cero, y «Bs. 0,00» es una
    // cifra falsa. Mejor no pintar nada.
    bolivares: numeroPositivo(crudo.fareVES),
    formaDePago: formaDePagoEnPantalla(crudo.paymentMethod),
    venceEn,
    nombreDePasajera: nombre
  };
}

/**
 * Los segundos que le quedan a una oferta.
 *
 * Se calcula contra el vencimiento anclado --ver `leerOferta`--, no contando
 * hacia atrás desde quince: si la oferta tardó dos segundos en llegar, aquí
 * quedan trece y no quince. Un reloj que promete más tiempo del que hay es peor
 * que no tener reloj.
 *
 * Los dos extremos son marcas absolutas del MISMO reloj, así que esto sigue
 * siendo cierto aunque la aplicación haya estado dormida entre medias: al
 * volver se resta con la hora de ahora y sale el tiempo real, no un contador
 * congelado que reanuda donde lo dejó.
 */
export function segundosRestantes(venceEn: number, ahora: number): number {
  if (!Number.isFinite(venceEn) || !Number.isFinite(ahora)) return 0;
  return Math.max(0, Math.ceil((venceEn - ahora) / 1000));
}

/** Si la oferta ya no vale. */
export function estaVencida(oferta: OfertaDeViaje | null, ahora: number): boolean {
  if (oferta === null) return true;
  return ahora >= oferta.venceEn;
}

/**
 * Si se puede pulsar «aceptar».
 *
 * TRES CANDADOS, Y LOS TRES HACEN FALTA
 *
 * 1. Sólo con una oferta viva delante.
 * 2. Sólo si no hay ya una aceptación en camino: el segundo toque del mismo
 *    dedo no manda un segundo `rideAccepted`.
 * 3. Nunca una vencida. El servidor también la rechazaría --su sesión de
 *    despacho ya pasó a otro-- pero dejar pulsar algo que no puede funcionar es
 *    prometer una carrera que no existe.
 */
export function sePuedeAceptar(
  estado: EstadoDeOferta,
  oferta: OfertaDeViaje | null,
  ahora: number
): boolean {
  if (estado !== 'OFERTA') return false;
  if (oferta === null) return false;
  return !estaVencida(oferta, ahora);
}

/** Si se puede pulsar «rechazar». Las mismas reglas. */
export function sePuedeRechazar(
  estado: EstadoDeOferta,
  oferta: OfertaDeViaje | null,
  ahora: number
): boolean {
  return sePuedeAceptar(estado, oferta, ahora);
}

/**
 * Qué hacer cuando llega una oferta y ya hay otra en pantalla.
 *
 * NO SE INVENTA UNA COLA
 *
 * El servidor ofrece de uno en uno: no manda una segunda mientras la primera
 * sigue viva para el mismo conductor. Si llega otra es porque la anterior ya no
 * vale --se agotó, o el viaje se fue a otro-- así que la nueva sustituye a la
 * vieja. Guardar la anterior sería inventar una cola que el despacho no tiene, y
 * enseñar una carrera que ya se llevó otro.
 *
 * La excepción es la aceptación en vuelo: si se está esperando respuesta del
 * servidor, la oferta nueva espera a que esa respuesta llegue. Cambiar la
 * pantalla debajo del dedo mientras se resuelve es la forma más fácil de que
 * alguien acepte una carrera que no quería.
 */
export function debeSustituirLaOferta(estado: EstadoDeOferta): boolean {
  return estado !== 'ACEPTANDO';
}

// ---------------------------------------------------------------------------
// Cuando se acepta justo en el segundo malo
// ---------------------------------------------------------------------------

/**
 * Los motivos con los que el servidor dice «esta carrera ya no es tuya».
 *
 * Los cuatro dicen lo mismo con distintas palabras, y para quien conduce
 * significan lo de siempre: se le pasó el tiempo.
 */
const YA_NO_ERA_SUYA = [
  'NO_ACTIVE_OFFER',    // la sesión de despacho ya pasó al siguiente
  'NOT_CURRENT_OFFER',  // se la están ofreciendo a otro
  'TRIP_NOT_SEARCHING', // el viaje ya tiene conductor, o se canceló
  'ALREADY_ACCEPTED'    // otro llegó antes
];

/**
 * A qué estado lleva una aceptación que el servidor no aceptó.
 *
 * Fuente: `rideAcceptanceFailed`, que llega con su motivo. Llegar tarde se
 * cuenta como vencida —que es lo que pasó— y lo demás como error: no es lo
 * mismo perder una carrera por unos segundos que no poder tomar ninguna.
 */
export function estadoTrasRechazoDeAceptacion(motivo: unknown): 'EXPIRADA' | 'ERROR' {
  return typeof motivo === 'string' && YA_NO_ERA_SUYA.includes(motivo) ? 'EXPIRADA' : 'ERROR';
}

/**
 * Lo que se espera a que el servidor conteste una aceptación, pasado el
 * vencimiento, antes de darla por perdida.
 *
 * No es un tiempo de espera de red: la respuesta viaja por el mismo socket y
 * tarda milisegundos. Es el margen para no cortar una aceptación que iba a
 * llegar bien: el vencimiento local se ancla al recibir la oferta, así que va
 * unos milisegundos por detrás del servidor, y una aceptación pulsada en el
 * último instante necesita su ida y vuelta.
 */
export const MARGEN_DE_RESPUESTA_MS = 3_000;

/**
 * Si una aceptación en vuelo se quedó sin respuesta.
 *
 * ESTO ES LA RED DE SEGURIDAD, Y HACE FALTA AUNQUE EL SERVIDOR CONTESTE.
 *
 * Aceptar en el último segundo dejaba la pantalla en «aceptando…» para siempre:
 * el viaje ya estaba cancelado, el servidor mandaba su negativa y este cliente
 * no la escuchaba. Ahora la escucha —y ése es el arreglo de verdad—, pero si esa
 * respuesta no llegara nunca porque la red se cayó justo ahí, quien conduce se
 * quedaría mirando un botón que gira, sin poder recibir la siguiente carrera y
 * sin ninguna salida que no sea cerrar la aplicación.
 *
 * Así que pasado el vencimiento más un margen, se cierra. El servidor sigue
 * siendo la autoridad: no se da por aceptada, se da por perdida, que es lo único
 * que se puede afirmar cuando nadie contesta.
 */
export function seQuedoSinRespuesta(
  estado: EstadoDeOferta,
  oferta: OfertaDeViaje | null,
  ahora: number
): boolean {
  if (estado !== 'ACEPTANDO' || oferta === null) return false;
  return ahora >= oferta.venceEn + MARGEN_DE_RESPUESTA_MS;
}
