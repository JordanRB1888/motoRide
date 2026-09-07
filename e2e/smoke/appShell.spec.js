import { test, expect } from '@playwright/test';
import { RUTAS, INICIO_CON_ADMIN, PESTANA_ENTRAR, PESTANA_REGISTRARSE, abrir, hashActual } from '../helpers/appShell.js';
import { vigilarErrores } from '../helpers/pageErrors.js';
import { vigilarRed } from '../helpers/network.js';

/**
 * El armazón de +58express: que la aplicación ARRANQUE.
 *
 * Estas son las pruebas que valen por todas las demás. Una excepción no
 * capturada durante el montaje deja la pantalla a medio pintar sin que nadie
 * lo note —se ve «bien» porque lo que falta es lo que nunca llegó a
 * dibujarse—, y el proyecto ya tuvo exactamente ese fallo: la vista del
 * conductor reventaba después de pintar la plantilla y antes de enganchar los
 * oyentes, y los cuatro botones de abajo no hacían nada.
 *
 * Nada de esto escribe en ningún sitio: se abre la aplicación y se mira.
 */

test.describe('armazón @humo', () => {
  test('la aplicación carga y muestra la marca, sin pantalla en blanco', async ({ page }) => {
    const errores = vigilarErrores(page);
    await abrir(page, RUTAS.inicio);

    // La marca, por su texto real y no por una clase de estilo.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('express');
    await expect(page).toHaveTitle(/\+58express/);

    // «Sin pantalla en blanco» dicho de forma comprobable: el contenedor tiene
    // contenido de verdad, no un div vacío.
    const contenido = await page.locator('#app').innerText();
    expect(contenido.trim().length).toBeGreaterThan(20);

    expect(errores.graves(), 'el arranque no puede lanzar excepciones').toEqual([]);
  });

  test('la puerta de acceso se abre y ofrece los roles del producto', async ({ page }) => {
    const errores = vigilarErrores(page);
    await abrir(page, RUTAS.inicio);

    const acceder = page.getByRole('button', { name: 'Acceder' });
    await expect(acceder).toBeVisible();
    await acceder.click();

    // El formulario existe de verdad, con sus dos modos y sus dos roles
    // públicos. El de administración solo aparece con `?admin=1`.
    await expect(page.locator('#auth-form')).toBeVisible();
    await expect(page.locator(PESTANA_ENTRAR)).toBeVisible();
    await expect(page.locator(PESTANA_REGISTRARSE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pasajero', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conductor', exact: true })).toBeVisible();

    expect(errores.graves()).toEqual([]);
  });

  test('el acceso de administración solo se ofrece cuando se pide', async ({ page }) => {
    // Comportamiento aprobado del producto: el selector de administración no
    // se enseña en la pantalla pública.
    await abrir(page, RUTAS.inicio);
    await page.getByRole('button', { name: 'Acceder' }).click();
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);

    await abrir(page, INICIO_CON_ADMIN);
    await page.getByRole('button', { name: 'Acceder' }).click();
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toBeVisible();
  });

  test('una ruta desconocida devuelve al inicio en vez de romper', async ({ page }) => {
    const errores = vigilarErrores(page);
    await abrir(page, '#/no-existe-esta-ruta');

    expect(await hashActual(page)).toBe('#/');
    await expect(page.getByRole('button', { name: 'Acceder' })).toBeVisible();
    expect(errores.graves()).toEqual([]);
  });

  test('las rutas privadas rechazan a quien no ha entrado', async ({ page }) => {
    const errores = vigilarErrores(page);

    for (const ruta of [RUTAS.pasajera, RUTAS.conductor, RUTAS.administracion]) {
      await abrir(page, ruta);
      expect(await hashActual(page), `${ruta} no puede abrirse sin sesión`).toBe('#/');
      await expect(page.getByRole('button', { name: 'Acceder' })).toBeVisible();
    }

    expect(errores.graves()).toEqual([]);
  });

  test('navegar entre rutas repetidamente no degrada la aplicación', async ({ page }) => {
    // Cada cambio de hash vacía y repinta el contenedor, y de paso libera las
    // URLs de los documentos protegidos. Si algo se enganchara mal, se vería
    // aquí como una excepción o como una pantalla que deja de responder.
    const errores = vigilarErrores(page);
    await abrir(page, RUTAS.inicio);

    for (let vuelta = 0; vuelta < 3; vuelta++) {
      for (const ruta of [RUTAS.pasajera, RUTAS.conductor, '#/tampoco-existe', RUTAS.inicio]) {
        await page.evaluate(hash => { window.location.hash = hash; }, ruta);
        await page.waitForTimeout(120);
      }
    }

    await expect(page.getByRole('button', { name: 'Acceder' })).toBeVisible();
    expect(errores.graves()).toEqual([]);
  });

  test('sin backend, la aplicación se degrada pero no se cae', async ({ page }) => {
    // Los cimientos tienen que valer con y sin servidor local levantado: lo
    // que se exige es que el armazón se monte igual y que nadie vea una
    // pantalla en blanco.
    const errores = vigilarErrores(page);
    const red = vigilarRed(page);

    await abrir(page, RUTAS.inicio);
    await expect(page.getByRole('button', { name: 'Acceder' })).toBeVisible();

    // Un 5xx sí sería un defecto del servidor; que no responda nada es lo
    // esperado cuando no hay backend, y está contemplado.
    expect(red.erroresDeServidor(), 'ninguna llamada de arranque puede devolver 5xx').toEqual([]);
    expect(errores.excepciones(), 'ninguna excepción no capturada').toEqual([]);
  });
});
