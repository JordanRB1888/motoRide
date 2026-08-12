// Proyecciones explícitas de perfil por rol.
//
// Son listas blancas: cada campo se copia por nombre y nunca se propaga el
// objeto original. Un campo nuevo en el modelo de usuario no aparece aquí
// hasta que alguien lo añade a mano, que es justo lo contrario de lo que hace
// `publicUser()` en index.js — esa función quita dos campos y deja pasar el
// resto, de modo que cada campo nuevo se publicaba solo.
//
// Funciones puras, sin dependencias del servidor, para poder probarlas en
// aislamiento. Toleran null, undefined y objetos incompletos.

const text = value => (typeof value === 'string' ? value : '');
const numeric = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Lo que un conductor puede ver de su pasajero.
 *
 * `lastName` se conserva en esta fase porque la app del conductor lo usa para
 * componer el nombre completo; retirarlo exige tocar el frontend y queda para
 * una fase posterior.
 */
export function passengerPublicProfile(passenger) {
  if (!passenger) return null;
  return {
    id: passenger.id ?? null,
    firstName: text(passenger.firstName),
    lastName: text(passenger.lastName),
    photoUrl: passenger.photoUrl ?? null,
    rating: numeric(passenger.rating)
  };
}

/**
 * Lo que un pasajero puede ver de su conductor.
 *
 * El teléfono solo se incluye cuando quien llama lo pide de forma explícita,
 * y esa decisión corresponde a la ruta: solo durante un viaje activo entre
 * ambos participantes.
 */
export function driverPublicProfile(driver, { includePhone = false } = {}) {
  if (!driver) return null;
  const profile = {
    id: driver.id ?? null,
    firstName: text(driver.firstName),
    lastName: text(driver.lastName),
    photoUrl: driver.photoUrl ?? null,
    rating: numeric(driver.rating),
    totalTrips: numeric(driver.totalTrips),
    vehicleType: text(driver.vehicleType) || 'MOTO',
    vehicleBrand: text(driver.vehicleBrand),
    vehicleModel: text(driver.vehicleModel),
    vehicleColor: text(driver.vehicleColor),
    vehiclePlate: text(driver.vehiclePlate)
  };
  if (includePhone) profile.phone = text(driver.phone);
  return profile;
}

/**
 * Sanea el perfil que quedó incrustado dentro de un viaje ya guardado.
 *
 * Los viajes anteriores a `cafc7e8` almacenaron el registro completo del
 * conductor en `trip.driver`. No se migra la base de datos: se proyecta al
 * serializar, de modo que el dato histórico deja de salir sin reescribirlo.
 */
export function sanitizeEmbeddedTripDriver(trip, { includePhone = false } = {}) {
  if (!trip || typeof trip !== 'object') return trip;
  if (!trip.driver || typeof trip.driver !== 'object') return trip;
  return { ...trip, driver: driverPublicProfile(trip.driver, { includePhone }) };
}
