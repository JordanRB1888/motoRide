/**
 * Qué shell le corresponde a cada persona. La frontera entre pasajero y
 * conductor, escrita una sola vez.
 *
 * POR QUÉ EXISTE
 *
 * Cada pantalla llevaba su propia guarda, y una se quedó sin ella:
 * `app/pasajero.tsx` comprobaba que hubiera sesión pero no de quién era. Un
 * conductor entraba al shell de pasajero, y el cruce sólo se hacía visible al
 * pulsar «Viajes», porque `pedir.tsx` sí comprobaba y redirigía a
 * `/conductor`. El síntoma aparecía en Pedir; la causa estaba en el Home.
 *
 * Con la regla en un solo sitio, una pantalla nueva no puede olvidarse de ella:
 * o llama aquí, o no tiene guarda, y eso se ve en la revisión.
 *
 * EL ROL LO DA EL SERVIDOR
 *
 * `role` sale de `/api/auth/me`, y `requireAuth` recarga al usuario de la base
 * en cada petición. Aquí no se decide nada: se traduce. No se mira la
 * intención con la que alguien pulsó un botón, ni la ruta en la que está, ni
 * ninguna caché. Un expediente en borrador o pendiente **no cambia el rol**:
 * esa persona sigue siendo pasajera hasta que administración apruebe.
 */

/** Los shells que existen. `admin` no tiene el suyo: entra por el de pasajero. */
export type Shell = 'pasajero' | 'conductor';

/**
 * A qué shell pertenece un rol.
 *
 * `admin` va al de pasajero a propósito: puede pedir viajes como cualquiera, y
 * el shell de conductor le pondría a la vista una disponibilidad que no tiene.
 * Su panel es otra cosa y vive en la web.
 */
export function shellDelRol(rol: string | null | undefined): Shell | null {
  if (rol === 'driver') return 'conductor';
  if (rol === 'passenger' || rol === 'admin') return 'pasajero';
  return null;
}

/** Si ese rol puede estar en ese shell. */
export function puedeEstarEn(shell: Shell, rol: string | null | undefined): boolean {
  return shellDelRol(rol) === shell;
}

/**
 * A dónde mandar a quien está en el shell equivocado.
 *
 * Un conductor que aparece en una ruta de pasajero va a su propio inicio. Un
 * pasajero en una ruta de conductor va a la postulación —que es la puerta que
 * le corresponde: todavía no es conductor, pero es lo que estaba buscando—. Y
 * quien no tiene rol reconocible sale a la raíz, que decide de nuevo.
 */
export function destinoSiNoLeCorresponde(
  shell: Shell,
  rol: string | null | undefined
): '/conductor' | '/postulacion' | '/' {
  const suyo = shellDelRol(rol);
  if (suyo === null) return '/';
  return shell === 'pasajero' ? '/conductor' : '/postulacion';
}

/**
 * Las pestañas de pasajero, por su clave de navegación, y la ruta de cada una.
 *
 * Es la lista que el shell usa para decidir si un cambio de pestaña es
 * horizontal —y por tanto instantáneo— o una entrada en profundidad.
 */
export const RUTAS_DE_PESTANA_PASAJERO = Object.freeze({
  inicio: '/pasajero',
  saldo: '/saldo',
  historial: '/historial',
  perfil: '/perfil'
} as const);

export const RUTAS_DE_PESTANA_CONDUCTOR = Object.freeze({
  mapa: '/conductor',
  saldo: '/conductor-saldo',
  historial: '/historial',
  perfil: '/perfil'
} as const);

/** Si una clave es una de las pestañas del shell de pasajero. */
export function esPestanaDePasajero(clave: string): clave is keyof typeof RUTAS_DE_PESTANA_PASAJERO {
  return Object.prototype.hasOwnProperty.call(RUTAS_DE_PESTANA_PASAJERO, clave);
}
