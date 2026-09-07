/**
 * Cuentas de prueba, SOLO por entorno.
 *
 * Este fichero no contiene ni contendrá una credencial. Lee lo que haya en el
 * entorno y, si no hay nada, lo dice: las pruebas que necesiten una sesión se
 * SALTAN con un motivo legible en lugar de inventarse un usuario.
 *
 * Por qué no se fabrican credenciales aquí:
 *
 *   · crear cuentas por API contra un entorno equivocado sería crear usuarios
 *     REALES —`apiService` apunta a producción fuera de localhost—;
 *   · escribir directamente en la base de datos para «facilitar» la prueba
 *     saltaría la autorización del backend, que es justo lo que hay que
 *     comprobar;
 *   · y un usuario de conveniencia con contraseña fija en el repositorio es
 *     una credencial en el repositorio, se llame como se llame.
 *
 * Variables reconocidas (todas opcionales):
 *
 *   E2E_PASSENGER_EMAIL / E2E_PASSENGER_PASSWORD
 *   E2E_DRIVER_EMAIL    / E2E_DRIVER_PASSWORD
 *   E2E_ADMIN_EMAIL     / E2E_ADMIN_PASSWORD
 *
 * Ninguna se imprime en los informes ni en las trazas.
 */

const leer = (usuario, clave) => {
  const email = process.env[usuario]?.trim();
  const password = process.env[clave]?.trim();
  return email && password ? { email, password } : null;
};

export const CUENTAS = Object.freeze({
  pasajera: leer('E2E_PASSENGER_EMAIL', 'E2E_PASSENGER_PASSWORD'),
  conductor: leer('E2E_DRIVER_EMAIL', 'E2E_DRIVER_PASSWORD'),
  administracion: leer('E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD')
});

/**
 * El motivo por el que se salta una prueba de sesión, dicho de forma que
 * quien lo lea sepa exactamente qué le falta.
 */
export function motivoSinCuenta(rol) {
  const variables = {
    pasajera: 'E2E_PASSENGER_EMAIL / E2E_PASSENGER_PASSWORD',
    conductor: 'E2E_DRIVER_EMAIL / E2E_DRIVER_PASSWORD',
    administracion: 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD'
  }[rol];
  return `sin cuenta de prueba para ${rol}: define ${variables} apuntando a un entorno NO productivo`;
}

export const hayCuenta = rol => Boolean(CUENTAS[rol]);
