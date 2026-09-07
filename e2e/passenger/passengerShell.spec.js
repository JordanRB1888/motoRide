import { test, expect } from '@playwright/test';
import { RUTAS, esperarArmazon, hashActual } from '../helpers/appShell.js';
import { vigilarErrores } from '../helpers/pageErrors.js';
import { entrarComo } from '../fixtures/session.js';
import { hayCuenta, motivoSinCuenta } from '../fixtures/testAccounts.js';

/**
 * Cimientos de la pasajera.
 *
 * Solo se abre y se mira: no se pide ninguna carrera, no se cancela nada y no
 * se toca ningún saldo. Pedir un viaje de verdad crearía datos, y estos
 * cimientos no están autorizados a crearlos.
 */

test.describe('pasajera @rol', () => {
  test.skip(!hayCuenta('pasajera'), motivoSinCuenta('pasajera'));

  test('su pantalla se monta entera tras entrar', async ({ page }) => {
    const errores = vigilarErrores(page);
    const dentro = await entrarComo(page, 'pasajera');
    test.skip(!dentro, 'la cuenta de prueba de pasajera no pudo iniciar sesión en este entorno');

    expect(await hashActual(page)).toBe(RUTAS.pasajera);
    await esperarArmazon(page);

    // «Se monta entera» dicho de forma comprobable: hay contenido de verdad y
    // el montaje no lanzó nada.
    const contenido = await page.locator('#app').innerText();
    expect(contenido.trim().length).toBeGreaterThan(20);
    expect(errores.graves()).toEqual([]);
  });
});
