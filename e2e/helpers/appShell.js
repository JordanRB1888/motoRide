/**
 * Lo que toda prueba necesita saber del armazón de +58express.
 *
 * La aplicación enruta por HASH (`#/`, `#/passenger`, `#/driver`, `#/admin`) y
 * arranca detrás de una pantalla de bienvenida que se retira sola. Esperar a
 * que esa pantalla desaparezca no es cosmética: mientras está puesta, tapa
 * literalmente todo lo demás con `z-index: 2147483647`, y cualquier clic iría
 * contra ella.
 */

/** Rutas reales del producto. Se nombran una vez y se usan en todas partes. */
export const RUTAS = Object.freeze({
  inicio: '#/',
  pasajera: '#/passenger',
  conductor: '#/driver',
  administracion: '#/admin'
});

/**
 * La pantalla de inicio CON el selector de administración a la vista.
 *
 * Es una ruta completa y no un hash a propósito: `accesoAdminVisible()` mira
 * la cadena de búsqueda, y `router()` compara el hash con `'#/'` exacto — así
 * que `#/?admin=1` no coincide, cae al caso desconocido y vuelve a `#/`
 * limpio, sin el selector. Comportamiento del producto; la prueba se adapta.
 */
export const INICIO_CON_ADMIN = '/?admin=1#/';

/**
 * Abre una ruta y espera a que el armazón esté de verdad utilizable.
 *
 * La pantalla de bienvenida dura un mínimo deliberado (~1,1 s) y se va con una
 * transición. Se espera a que se retire del DOM en lugar de a un tiempo fijo.
 */
export async function abrir(page, ruta = RUTAS.inicio) {
  // Una ruta que ya empieza por `/` es completa (lleva su propia búsqueda);
  // lo demás es un hash sobre la raíz.
  await page.goto(ruta.startsWith('/') ? ruta : `/${ruta}`);
  await esperarArmazon(page);
}

export async function esperarArmazon(page) {
  // `#app-splash` se elimina del DOM al terminar; no se oculta.
  await page.locator('#app-splash').waitFor({ state: 'detached', timeout: 20_000 });
  await page.locator('#app').waitFor({ state: 'attached' });
}

/**
 * Navega por hash como lo hace la propia aplicación y espera al repintado.
 *
 * `page.goto` con otro hash no siempre dispara `hashchange` en la misma
 * página; asignar `location.hash` sí, que es justo lo que hace `navigateTo`.
 */
export async function irA(page, ruta) {
  await page.evaluate(hash => { window.location.hash = hash; }, ruta.replace(/^#/, '#'));
  await page.waitForFunction(
    esperado => window.location.hash === esperado || window.location.hash === '#/',
    ruta,
    { timeout: 10_000 }
  );
}

/** El hash actual, normalizado: `''` y `#/` son lo mismo. */
export async function hashActual(page) {
  const hash = await page.evaluate(() => window.location.hash);
  return hash === '' ? '#/' : hash;
}

/**
 * Las pestañas del formulario, por su identificador.
 *
 * Por rol accesible no valen: «Iniciar Sesión» es a la vez el nombre de la
 * pestaña y el del botón de enviar, y el localizador resolvería a dos
 * elementos.
 */
export const PESTANA_ENTRAR = '#tab-mode-login';
export const PESTANA_REGISTRARSE = '#tab-mode-register';

/** ¿Se está viendo la pantalla de acceso —la que ve quien no ha entrado—? */
export async function enPantallaDeAcceso(page) {
  return page.getByRole('button', { name: 'Acceder' }).isVisible().catch(() => false);
}

/**
 * Despliega el formulario de acceso.
 *
 * La tarjeta arranca plegada tras el botón «Acceder»: sin esto, los campos
 * existen en el DOM pero no son utilizables.
 */
export async function desplegarAcceso(page) {
  const acceder = page.getByRole('button', { name: 'Acceder' });
  if (await acceder.isVisible().catch(() => false)) {
    await acceder.click();
    await page.locator('#auth-form').waitFor({ state: 'visible' });
  }
}

/**
 * Deja la sesión del navegador limpia.
 *
 * La sesión vive en `localStorage` bajo `58express_session`. Se limpia por
 * clave y no con un borrado total, para no tocar preferencias como el tema —
 * que forman parte del producto aprobado.
 */
export async function cerrarSesionLocal(page) {
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem('58express_session');
    } catch { /* almacenamiento no disponible: no hay sesión que limpiar */ }
  });
}
