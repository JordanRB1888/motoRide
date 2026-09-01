/**
 * Los viajes: el historial y el registro de uno.
 *
 * DOS RESPUESTAS CON FORMAS DISTINTAS
 *
 *   GET /api/trips/me/history  →  un ARRAY de viajes, con el conductor
 *                                 incrustado y saneado
 *   GET /api/trips/:id         →  un OBJETO { trip, passenger, driver }
 *
 * No es un descuido del backend: el detalle necesita los dos participantes
 * proyectados según quién pregunta, y el listado no. Se leen por separado.
 *
 * LA CRONOLOGÍA YA EXISTÍA
 *
 * `trip.statusHistory[]` guarda `{ status, at }` de cada transición, más
 * `actorId`, `actorRole` y `reason` cuando quien la provocó los aportó. Es
 * exactamente la cronología que dibuja «Tu viaje»: no hizo falta backend nuevo.
 *
 * LO QUE NO ESTÁ, NO SE RELLENA
 *
 * Un viaje sin tarifa, sin conductor o sin alguna hora es un viaje normal —se
 * cancela antes de que existan— y esas ausencias se propagan tal cual. La
 * pantalla decide cómo enseñar un hueco; aquí no se inventa ninguno.
 */

import { TRIP_STATUSES, TRIP_STATUS_ALIASES, type TripStatus } from '../../shared/contracts/domain';
import { leerCoordenada, type Coordenada } from '../mapa/modelo';

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');
const numero = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null;

/**
 * Lleva un estado a su forma canónica.
 *
 * El backend normaliza al escribir, pero los viajes guardados antes de esa
 * normalización conservan los alias —`EN_ROUTE`, `IN_TRIP`, `DRIVER_ARRIVED`—
 * y siguen llegando así en el historial. Un estado desconocido se devuelve tal
 * cual: la pantalla lo enseña sin pretender entenderlo, que es mejor que
 * esconder un viaje entero.
 */
export function normalizarEstado(estado: string): string {
  const alias = (TRIP_STATUS_ALIASES as Record<string, string>)[estado];
  return alias ?? estado;
}

export function esEstadoConocido(estado: string): estado is TripStatus {
  return (TRIP_STATUSES as readonly string[]).includes(normalizarEstado(estado));
}

/** Cómo se llama cada estado en pantalla. */
const NOMBRE_DEL_ESTADO: Readonly<Record<string, string>> = Object.freeze({
  SEARCHING: 'Buscando',
  DRIVER_ASSIGNED: 'En camino',
  ARRIVED: 'Te espera',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado'
});

/**
 * El rótulo del estado.
 *
 * Uno desconocido se enseña con su propio nombre en vez de traducirse a
 * «Completado» por descuido: decirle a alguien que su viaje terminó bien cuando
 * el servidor dice otra cosa es peor que enseñarle una palabra rara.
 */
export function nombreDeEstado(estado: string): string {
  return NOMBRE_DEL_ESTADO[normalizarEstado(estado)] ?? normalizarEstado(estado);
}

// ---------------------------------------------------------------------------
// El historial
// ---------------------------------------------------------------------------

export interface ViajeDeHistorial {
  readonly id: string;
  readonly estado: string;
  readonly origen: string;
  readonly destino: string;
  /** ISO-8601 de cuando se pidió, o cadena vacía. */
  readonly cuando: string;
}

const direccion = (lugar: unknown): string => {
  if (typeof lugar !== 'object' || lugar === null) return '';
  return texto((lugar as Record<string, unknown>).address);
};

/**
 * Traduce el listado.
 *
 * Un viaje sin identificador se descarta: no se podría abrir su detalle, y una
 * fila que no responde al tocarla es peor que una fila que no está.
 */
export function leerHistorial(cuerpo: unknown): readonly ViajeDeHistorial[] {
  if (!Array.isArray(cuerpo)) return [];

  const viajes: ViajeDeHistorial[] = [];
  for (const posible of cuerpo) {
    if (typeof posible !== 'object' || posible === null) continue;
    const dato = posible as Record<string, unknown>;

    const id = texto(dato.id);
    if (id === '') continue;

    viajes.push({
      id,
      estado: normalizarEstado(texto(dato.status)),
      origen: direccion(dato.pickup),
      destino: direccion(dato.destination),
      cuando: texto(dato.createdAt)
    });
  }
  return viajes;
}

// ---------------------------------------------------------------------------
// El detalle
// ---------------------------------------------------------------------------

export interface ParticipanteDeViaje {
  readonly nombre: string;
  readonly vehiculo: string;
  readonly placa: string;
  /**
   * La valoración, ya formateada, o `null` si el servidor no la da.
   *
   * `driverPublicProfile` la publica como número. Se formatea aquí —con coma
   * decimal, como el resto de la aplicación— y un cero se lee como AUSENTE: un
   * conductor nuevo tiene cero viajes, no una valoración de cero.
   */
  readonly valoracion: string | null;
}

export interface DetalleReal {
  readonly id: string;
  readonly estado: string;
  readonly cuando: string;
  readonly origen: string;
  readonly destino: string;
  /**
   * Dónde caen el origen y el destino, o `null`.
   *
   * `tripLocation` los guarda con `lat` y `lng` cuando quien pidió el viaje los
   * aportó. Pueden faltar —un viaje escrito a mano no los tiene— y entonces el
   * mapa se queda sin ese marcador. NO se geocodifica la dirección desde el
   * teléfono para rellenarlos: eso sería inventar una posición.
   */
  readonly origenEn: Coordenada | null;
  readonly destinoEn: Coordenada | null;
  /** Quién iba al volante, o `null` si el viaje se cerró sin conductor. */
  readonly conductor: ParticipanteDeViaje | null;
  /** Para la vista del conductor: a quién llevó. */
  readonly pasajero: string;
  /** En dólares. `null` cuando el viaje no llegó a tener tarifa. */
  readonly importe: number | null;
  readonly metodoDePago: string;
  /** `MOTO` o `CAR`, tal como lo guarda el servidor. */
  readonly tipoDeVehiculo: string;
  readonly hitos: readonly HitoReal[];
  readonly cerradoEn: string;
  /** Quién canceló y por qué, si se canceló y el servidor lo apuntó. */
  readonly cancelacion: Cancelacion | null;
}

export interface HitoReal {
  readonly estado: string;
  /** ISO-8601. */
  readonly cuando: string;
  readonly actorRole: string;
  readonly razon: string;
}

export interface Cancelacion {
  /** `passenger`, `driver`, `system`… tal como lo apuntó el servidor. */
  readonly quien: string;
  readonly razon: string;
  readonly cuando: string;
}

/** Los pasos, tal como el servidor los apuntó. Sin inventar ninguno. */
export function leerHitos(cuerpo: unknown): readonly HitoReal[] {
  if (!Array.isArray(cuerpo)) return [];

  const hitos: HitoReal[] = [];
  for (const posible of cuerpo) {
    if (typeof posible !== 'object' || posible === null) continue;
    const dato = posible as Record<string, unknown>;
    const estado = texto(dato.status);
    if (estado === '') continue;

    hitos.push({
      estado: normalizarEstado(estado),
      cuando: texto(dato.at),
      actorRole: texto(dato.actorRole),
      razon: texto(dato.reason)
    });
  }
  return hitos;
}

/**
 * Quién canceló, sacado de la propia cronología.
 *
 * El servidor NO guarda `cancelledBy` ni `cancelReason` como campos del viaje:
 * los apunta en la entrada `CANCELLED` de `statusHistory`, con `actorRole` y a
 * veces `reason`. Es la misma información, en otro sitio.
 *
 * `cancelledAt` sí existe como campo, pero SÓLO en el flujo de Transporte
 * Seguro. Para el resto, la hora es la de esa entrada.
 */
export function leerCancelacion(hitos: readonly HitoReal[]): Cancelacion | null {
  const hito = hitos.find(paso => paso.estado === 'CANCELLED');
  if (hito === undefined) return null;
  return { quien: hito.actorRole, razon: hito.razon, cuando: hito.cuando };
}

/**
 * Traduce `GET /api/trips/:id`, que devuelve `{ trip, passenger, driver }`.
 *
 * El conductor puede venir en dos sitios: como `driver` de primer nivel —lo
 * normal— o incrustado dentro del viaje en registros antiguos. Se miran los
 * dos, empezando por el de fuera.
 */
export function leerDetalle(cuerpo: unknown): DetalleReal | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const sobre = cuerpo as Record<string, unknown>;

  const viaje = sobre.trip;
  if (typeof viaje !== 'object' || viaje === null) return null;
  const dato = viaje as Record<string, unknown>;

  const id = texto(dato.id);
  if (id === '') return null;

  const hitos = leerHitos(dato.statusHistory);
  const fuenteDelConductor = sobre.driver ?? dato.driver;

  return {
    id,
    estado: normalizarEstado(texto(dato.status)),
    cuando: texto(dato.createdAt),
    origen: direccion(dato.pickup),
    destino: direccion(dato.destination),
    origenEn: leerCoordenada(dato.pickup),
    destinoEn: leerCoordenada(dato.destination),
    conductor: leerConductor(fuenteDelConductor, texto(dato.rideType)),
    pasajero: leerNombre(sobre.passenger) || texto(dato.passengerName),
    importe: numero(dato.fareUSD),
    metodoDePago: texto(dato.paymentMethod),
    tipoDeVehiculo: texto(dato.rideType),
    hitos,
    cerradoEn: texto(dato.closedAt) || texto(dato.cancelledAt),
    cancelacion: leerCancelacion(hitos)
  };
}

function leerNombre(persona: unknown): string {
  if (typeof persona !== 'object' || persona === null) return '';
  const dato = persona as Record<string, unknown>;
  return [texto(dato.firstName), texto(dato.lastName)].filter(parte => parte !== '').join(' ');
}

function leerConductor(persona: unknown, tipoDeVehiculo: string): ParticipanteDeViaje | null {
  if (typeof persona !== 'object' || persona === null) return null;
  const dato = persona as Record<string, unknown>;

  const nombre = leerNombre(dato);
  const marca = texto(dato.vehicleBrand);
  const modelo = texto(dato.vehicleModel);
  // Sin marca ni modelo se cae al tipo de vehículo del viaje, que sí existe
  // siempre. «Moto» dice menos que «Bera SBR», pero es cierto.
  const vehiculo = [marca, modelo].filter(parte => parte !== '').join(' ')
    || (tipoDeVehiculo === 'CAR' ? 'Carro' : 'Moto');

  if (nombre === '' && texto(dato.id) === '') return null;

  // Un cero es ausencia, no una nota: un conductor recién aprobado no tiene
  // valoración, y enseñarle un 0,0 al pasajero sería calumniarlo.
  const nota = typeof dato.rating === 'number' && dato.rating > 0
    ? dato.rating.toFixed(1).replace('.', ',')
    : null;

  return { nombre, vehiculo, placa: texto(dato.vehiclePlate), valoracion: nota };
}

// ---------------------------------------------------------------------------
// La conversación archivada
// ---------------------------------------------------------------------------

export interface MensajeReal {
  readonly id: string;
  readonly autorId: string;
  readonly autorNombre: string;
  readonly texto: string;
  /** ISO-8601. */
  readonly cuando: string;
  /** El identificador PÚBLICO del adjunto, para pedir su contenido. */
  readonly adjuntoId: string;
}

/**
 * Traduce los mensajes.
 *
 * Del adjunto sólo viaja `imageRef: { id, mimeType }`. La clave del almacén
 * (`imageStorageKey`) el servidor no la publica, y aquí no se echa de menos: el
 * contenido se pide por el identificador público, con sesión.
 *
 * NO se leen «entregado» ni «leído»: el backend no los guarda para el chat del
 * viaje. Inventarlos sería atrezo, y del que se nota.
 */
export function leerMensajes(cuerpo: unknown): readonly MensajeReal[] {
  if (!Array.isArray(cuerpo)) return [];

  const mensajes: MensajeReal[] = [];
  for (const posible of cuerpo) {
    if (typeof posible !== 'object' || posible === null) continue;
    const dato = posible as Record<string, unknown>;

    const id = texto(dato.id);
    if (id === '') continue;

    const referencia = dato.imageRef;
    const adjuntoId = typeof referencia === 'object' && referencia !== null
      ? texto((referencia as Record<string, unknown>).id)
      : '';

    const cuerpoDelMensaje = texto(dato.text);
    // Un mensaje sin texto y sin imagen no es un mensaje.
    if (cuerpoDelMensaje === '' && adjuntoId === '') continue;

    mensajes.push({
      id,
      autorId: texto(dato.senderId),
      autorNombre: texto(dato.senderName),
      texto: cuerpoDelMensaje,
      cuando: texto(dato.timestamp),
      adjuntoId
    });
  }
  return mensajes;
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** «08:14», o cadena vacía si la fecha no se puede leer. */
export function horaDe(iso: string): string {
  if (iso === '') return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Caracas'
  });
}

/**
 * «Hoy · 08:14», «Ayer · 19:02», «14/03 · 10:00».
 *
 * El mismo formato que ya tenía el historial. Se compara en la zona de
 * Venezuela, no en la del teléfono: alguien en otro huso vería «Ayer» en un
 * viaje de esta mañana.
 */
export function fechaDe(iso: string, ahora: number = Date.now()): string {
  const hora = horaDe(iso);
  if (hora === '') return '';

  const fecha = new Date(iso);
  const dia = (momento: number) =>
    new Date(momento).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

  const suyo = dia(fecha.getTime());
  if (suyo === dia(ahora)) return `Hoy · ${hora}`;
  if (suyo === dia(ahora - DIA)) return `Ayer · ${hora}`;

  // La fecha corta se arma a partir del `en-CA` de arriba —que siempre da
  // `AAAA-MM-DD`— y no de un formato local: `es-VE` con `2-digit` devuelve
  // «20/8» en unos entornos y «20/08» en otros, según la versión de ICU.
  const [, mes, diaDelMes] = suyo.split('-');
  return `${diaDelMes}/${mes} · ${hora}`;
}

/**
 * «$12,50». En dólares, con coma decimal, como el resto de la aplicación.
 *
 * Sin importe devuelve cadena vacía: un viaje que se canceló antes de tener
 * tarifa no vale «$0,00», que se lee como «gratis».
 */
export function importeDe(dolares: number | null): string {
  if (dolares === null) return '';
  return `$${dolares.toFixed(2).replace('.', ',')}`;
}

/** Cuánto duró, de la hora de inicio a la de cierre. */
export function duracionEntre(desde: string, hasta: string): string {
  if (desde === '' || hasta === '') return '';
  const inicio = new Date(desde).getTime();
  const fin = new Date(hasta).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fin) || fin < inicio) return '';

  const minutos = Math.round((fin - inicio) / MINUTO);
  if (minutos < 1) return 'Menos de un minuto';
  return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
}
