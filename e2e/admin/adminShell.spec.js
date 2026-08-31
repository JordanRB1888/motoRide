import { test, expect } from '@playwright/test';
import { RUTAS, abrir, esperarArmazon, hashActual } from '../helpers/appShell.js';
import { vigilarErrores } from '../helpers/pageErrors.js';
import { entrarComo } from '../fixtures/session.js';
import { hayCuenta, motivoSinCuenta } from '../fixtures/testAccounts.js';

/**
 * Cimientos de administración, en escritorio: el panel está diseñado así.
 *
 * No se aprueba ningún conductor, no se toca ningún usuario y no se cambia
 * ninguna tarifa. Solo se comprueba la puerta y que el armazón se monta.
 */

test.describe('administración @rol @escritorio', () => {
  test('la ruta de administración no se abre sin ese rol', async ({ page }) => {
    // Esta SÍ se ejecuta siempre: no necesita cuenta, y es la comprobación de
    // autorización más importante del panel.
    const errores = vigilarErrores(page);
    await abrir(page, RUTAS.administracion);

    expect(await hashActual(page)).toBe('#/');
    await expect(page.getByRole('button', { name: 'Acceder' })).toBeVisible();
    expect(errores.graves()).toEqual([]);
  });

  test('el panel se monta para una cuenta de administración', async ({ page }) => {
    test.skip(!hayCuenta('administracion'), motivoSinCuenta('administracion'));
    const errores = vigilarErrores(page);
    const dentro = await entrarComo(page, 'administracion');
    test.skip(!dentro, 'la cuenta de prueba de administración no pudo iniciar sesión en este entorno');

    expect(await hashActual(page)).toBe(RUTAS.administracion);
    await esperarArmazon(page);
    await expect(page.locator('.admin-app')).toBeVisible();
    await expect(page.locator('#page-title')).toBeVisible();
    expect(errores.graves()).toEqual([]);
  });
});
