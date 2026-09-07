/**
 * Contratos de dominio de +58express.
 *
 * Cada valor de este fichero sale de una fuente canónica que YA existe en el
 * producto; ninguno se inventa aquí. La fuente está anotada en cada bloque.
 *
 * Neutral respecto al entorno: no usa `window`, `document`, DOM ni APIs de
 * Node, para que la futura app de React Native pueda importarlo tal cual.
 *
 * Y lo que no hace, que importa tanto como lo que hace: estos tipos
 * desaparecen al compilar. NO validan nada en ejecución. Lo que impide que
 * llegue un estado inventado por HTTP es la comprobación del servidor, no
 * esto.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * Los tres roles del producto.
 *
 * Fuente: `server/index.js` — las guardias `requireRole('admin')`, el alta de
 * pasajeras con `role: 'passenger'` y el acceso del conductor. Van en
 * minúsculas porque así viajan en el token y así los compara el backend.
 *
 * `as const` en vez de un `enum`: no hace falta ningún valor nuevo en tiempo de
 * ejecución, y un `enum` de TypeScript generaría un objeto que hoy nadie
 * necesita.
 */
export const USER_ROLES = ['passenger', 'driver', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ---------------------------------------------------------------------------
// Estados del viaje
// ---------------------------------------------------------------------------

/**
 * Los estados canónicos de una carrera.
 *
 * Fuente: `server/domain/tripStateMachine.js` (`TRIP_STATUS`). Es LA autoridad:
 * el servidor normaliza cualquier alias a uno de estos seis antes de decidir
 * nada.
 *
 * OJO — divergencia conocida y NO corregida aquí: `src/utils/constants.js`
 * declara un `TRIP_STATES` distinto y más antiguo (`DRAFT`, `DRIVER_EN_ROUTE`,
 * `DRIVER_ARRIVED`, `IN_TRIP`) que hoy no usa nadie. Unificarlo sería un cambio
 * de producto y no pertenece a TYPESCRIPT-1; queda anotado en
 * `docs/typescript.md` para que se decida a conciencia.
 */
export const TRIP_STATUSES = [
  'SEARCHING',
  'DRIVER_ASSIGNED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/**
 * Alias históricos que el servidor sigue aceptando y normalizando.
 *
 * Fuente: el mismo fichero, constante `aliases`. Se declara porque un cliente
 * antiguo puede mandarlos todavía, y quien lea este contrato debe saber que
 * existen — no para animar a usarlos.
 */
export const TRIP_STATUS_ALIASES = {
  PENDING: 'SEARCHING',
  ACCEPTED: 'DRIVER_ASSIGNED',
  EN_ROUTE: 'DRIVER_ASSIGNED',
  DRIVER_ARRIVING: 'DRIVER_ASSIGNED',
  DRIVER_ARRIVED: 'ARRIVED',
  IN_TRIP: 'IN_PROGRESS'
} as const satisfies Record<string, TripStatus>;

export type TripStatusAlias = keyof typeof TRIP_STATUS_ALIASES;

/** Estados en los que una carrera ya terminó y no admite más transiciones. */
export const TERMINAL_TRIP_STATUSES = ['COMPLETED', 'CANCELLED'] as const;
export type TerminalTripStatus = (typeof TERMINAL_TRIP_STATUSES)[number];

// ---------------------------------------------------------------------------
// Estado del conductor
// ---------------------------------------------------------------------------

/**
 * Lo que un conductor puede fijar por su cuenta desde la aplicación.
 *
 * Fuente: `server/domain/driverState.js` (`DRIVER_STATUS`).
 */
export const DRIVER_STATUSES = ['AVAILABLE', 'BUSY', 'IN_TRIP', 'OFFLINE'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

/**
 * Estados que SOLO puede asignar administración.
 *
 * Fuente: el mismo fichero (`ADMIN_DRIVER_STATUS`). Se mantienen separados a
 * propósito: mezclarlos en una sola unión invitaría a que un cliente creyera
 * que puede ponerse en `SUSPENDED`.
 */
export const ADMIN_DRIVER_STATUSES = ['SUSPENDED', 'PENDING_APPROVAL'] as const;
export type AdminDriverStatus = (typeof ADMIN_DRIVER_STATUSES)[number];

/** Cualquier estado en el que puede estar un conductor, lo fije quien lo fije. */
export type AnyDriverStatus = DriverStatus | AdminDriverStatus;

// ---------------------------------------------------------------------------
// Vehículo
// ---------------------------------------------------------------------------

/**
 * Tipos de vehículo del producto.
 *
 * Fuente: `server/domain/driverApplicationModel.js`, que normaliza cualquier
 * entrada a `'CAR'` o `'MOTO'`, y `dispatchEligibility.js`, que empareja el
 * vehículo del conductor con el `rideType` de la carrera.
 */
export const VEHICLE_TYPES = ['MOTO', 'CAR'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** El tipo de vehículo que pide una carrera. Es el mismo juego de valores. */
export type RideType = VehicleType;

// ---------------------------------------------------------------------------
// Geografía
// ---------------------------------------------------------------------------

/**
 * Un punto en el mapa.
 *
 * Fuente: `src/services/navigationRoute.js` y `driverNavigation.js`, que
 * normalizan a `{ lat, lng }`. Hay código que recibe `latitude`/`longitude`
 * desde la API de geolocalización del navegador y lo convierte en la frontera;
 * aquí se declara solo la forma canónica, que es la que circula por dentro.
 */
export interface Coordinates {
  readonly lat: number;
  readonly lng: number;
}

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

/**
 * Identificadores del dominio, distinguibles entre sí.
 *
 * Son cadenas en ejecución —el marcador desaparece al compilar— pero impiden
 * pasar el identificador de un viaje donde se espera el de una persona, que es
 * un error fácil de cometer y difícil de ver leyendo.
 */
declare const marcaDeTipo: unique symbol;
type Identificador<T extends string> = string & { readonly [marcaDeTipo]: T };

export type UserId = Identificador<'UserId'>;
export type TripId = Identificador<'TripId'>;
export type TransactionId = Identificador<'TransactionId'>;
