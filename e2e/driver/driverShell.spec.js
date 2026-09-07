import { test, expect } from '@playwright/test';
import { RUTAS, esperarArmazon, hashActual } from '../helpers/appShell.js';
import { vigilarErrores } from '../helpers/pageErrors.js';
import { entrarComo } from '../fixtures/session.js';
import { hayCuenta, motivoSinCuenta } from '../fixtures/testAccounts.js';

/**
 * Cimientos del conductor.
 *
 * La barra de abajo se comprueba de forma explícita porque el proyecto ya tuvo
 * un fallo exactamente de esa forma: la pantalla se pintaba entera y los
 * cuatro botones no hacían nada, porque el montaje reventaba después de pintar
 * la plantilla y antes de engancharles los oyentes. Una prueba que solo mirase
 * el texto no lo habría visto.
 *
 * No se cambia la disponibilidad, no se acepta ninguna carrera y no se toca el
 * dinero de nadie: DRIVER-FINANCE-1 está PAUSADO y aquí no se da por activo.
 */

test.describe('conductor @rol', () => {
  test.skip(!hayCuenta('conductor'), motivoSinCuenta('conductor'));

  test('su pantalla se monta con las cuatro pestañas de la barra', async ({ page }) => {
    const errores = vigilarErrores(page);
    const dentro = await entrarComo(page, 'conductor');
    test.skip(!dentro, 'la cuenta de prueba de conductor no pudo iniciar sesión en este entorno');

    expect(await hashActual(page)).toBe(RUTAS.conductor);
    await esperarArmazon(page);

    for (const pestana of ['inicio', 'ganancias', 'viajes', 'perfil']) {
      await expect(
        page.locator(`.nav-tab[data-tab="${pestana}"]`),
        `la pestaña «${pestana}» tiene que estar montada`
      ).toBeVisible();
    }
    expect(errores.graves()).toEqual([]);
  });
});
