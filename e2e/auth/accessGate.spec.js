import { test, expect } from '@playwright/test';
import { RUTAS, INICIO_CON_ADMIN, PESTANA_ENTRAR, PESTANA_REGISTRARSE, abrir, desplegarAcceso, hashActual } from '../helpers/appShell.js';
import { vigilarErrores } from '../helpers/pageErrors.js';
import { vigilarRed } from '../helpers/network.js';

/**
 * La puerta de acceso, sin crear ni una cuenta.
 *
 * Aquí no se registra a nadie: registrar por el camino real crearía un usuario
 * de verdad en el entorno al que apunte la aplicación, y estos cimientos no
 * están autorizados a crear datos. Lo que sí se comprueba es que la puerta
 * está bien puesta: que existe, que valida, y que no deja pasar sola.
 */

test.describe('puerta de acceso @humo', () => {
  test('el formulario exige credenciales antes de intentar nada', async ({ page }) => {
    const red = vigilarRed(page);
    await abrir(page, RUTAS.inicio);
    await desplegarAcceso(page);

    // Enviar vacío no puede mandar una petición de sesión al servidor.
    await page.locator('#btn-submit-cta').click();
    await page.waitForTimeout(500);

    const intentosDeAcceso = red.todas().filter(r => /\/auth\/login/.test(r.url));
    expect(intentosDeAcceso, 'un formulario vacío no llega al servidor').toEqual([]);
    expect(await hashActual(page), 'y nadie entra').toBe('#/');
  });

  test('unas credenciales que no existen no abren ninguna sesión', async ({ page }) => {
    // Credenciales deliberadamente inexistentes y únicas: no corresponden a
    // ninguna cuenta y no crean nada. Lo que se comprueba es que la puerta
    // NIEGA el paso, que es su trabajo.
    const errores = vigilarErrores(page);
    await abrir(page, RUTAS.inicio);
    await desplegarAcceso(page);

    const inexistente = `e2e.no.existe.${Date.now()}@invalido.test`;
    const formulario = page.locator('#auth-form');
    await formulario.locator('input[type="email"], input[name="email"], #email').first()
      .fill(inexistente);
    await formulario.locator('input[type="password"], input[name="password"], #password').first()
      .fill('contrasena-que-no-vale');
    await formulario.locator('#btn-submit-cta').click();

    await page.waitForTimeout(2500);
    expect(await hashActual(page), 'sigue fuera').toBe('#/');
    await expect(page.locator('#auth-form')).toBeVisible();
    expect(errores.excepciones(), 'y el rechazo no revienta la pantalla').toEqual([]);
  });

  test('cambiar de rol en la puerta no rompe el formulario', async ({ page }) => {
    const errores = vigilarErrores(page);
    await abrir(page, INICIO_CON_ADMIN);
    await desplegarAcceso(page);

    for (const rol of ['Conductor', 'Admin', 'Pasajero']) {
      await page.getByRole('button', { name: rol, exact: true }).click();
      await expect(page.locator('#auth-form')).toBeVisible();
    }

    expect(errores.graves()).toEqual([]);
  });

  test('alternar entre entrar y registrarse mantiene la pantalla utilizable', async ({ page }) => {
    const errores = vigilarErrores(page);
    await abrir(page, RUTAS.inicio);
    await desplegarAcceso(page);

    await page.locator(PESTANA_REGISTRARSE).click();
    await expect(page.locator('#auth-form')).toBeVisible();
    await page.locator(PESTANA_ENTRAR).click();
    await expect(page.locator('#auth-form')).toBeVisible();

    expect(errores.graves()).toEqual([]);
  });
});
