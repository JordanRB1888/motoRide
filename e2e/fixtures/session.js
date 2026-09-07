import { RUTAS, INICIO_CON_ADMIN, abrir, desplegarAcceso, esperarArmazon } from '../helpers/appShell.js';
import { CUENTAS } from './testAccounts.js';

/**
 * Sesión autenticada por el camino REAL del producto.
 *
 * Se entra rellenando el formulario y pulsando el botón, como lo haría una
 * persona. No se inyecta un token en `localStorage` ni se toca la
 * autorización del backend: una prueba que se salta el acceso deja de probar
 * el acceso, y la primera vez que ese camino se rompa la suite seguirá verde.
 *
 * La contraseña llega del entorno y nunca se registra: Playwright no imprime
 * el valor de `fill`, y aquí no se añade ningún rastro.
 */

const SELECTOR_DE_ROL = {
  pasajera: 'Pasajero',
  conductor: 'Conductor',
  administracion: 'Admin'
};

/**
 * Entra con el rol indicado y espera a que su pantalla esté montada.
 *
 * Devuelve `true` si la sesión quedó abierta. Si el acceso no prospera
 * —credenciales que ya no valen, backend caído— devuelve `false` en lugar de
 * reventar, para que quien llama decida si eso es un fallo o un motivo para
 * saltarse la prueba.
 */
export async function entrarComo(page, rol) {
  const cuenta = CUENTAS[rol];
  if (!cuenta) return false;

  // El selector de administración solo se pinta con `?admin=1`.
  await abrir(page, rol === 'administracion' ? INICIO_CON_ADMIN : RUTAS.inicio);
  await desplegarAcceso(page);

  const pestanaDeRol = page.getByRole('button', { name: SELECTOR_DE_ROL[rol], exact: true });
  if (await pestanaDeRol.isVisible().catch(() => false)) await pestanaDeRol.click();

  const formulario = page.locator('#auth-form');
  await formulario.locator('input[type="email"], input[name="email"], #email').first()
    .fill(cuenta.email);
  await formulario.locator('input[type="password"], input[name="password"], #password').first()
    .fill(cuenta.password);
  await formulario.locator('#btn-submit-cta').click();

  // La aplicación redirige por hash al panel del rol cuando la sesión entra.
  const destino = {
    pasajera: RUTAS.pasajera,
    conductor: RUTAS.conductor,
    administracion: RUTAS.administracion
  }[rol];

  try {
    await page.waitForFunction(
      esperado => window.location.hash === esperado,
      destino,
      { timeout: 20_000 }
    );
  } catch {
    return false;   // no entró: quien llama decide qué significa
  }
  await esperarArmazon(page);
  return true;
}
