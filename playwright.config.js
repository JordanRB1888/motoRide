import { defineConfig, devices } from '@playwright/test';

/**
 * +58express — cimientos de las pruebas E2E.
 *
 * SEGURIDAD ANTES QUE NADA
 * ------------------------
 * `apiService` decide su servidor por el NOMBRE DE HOST de la página: en
 * `localhost` y `127.0.0.1` habla con el backend local; en cualquier otro
 * apunta a PRODUCCIÓN. Una suite E2E que se ejecutara contra un dominio
 * público estaría, sin decirlo, creando usuarios y viajes reales.
 *
 * Por eso este fichero se niega a arrancar contra un servidor que no sea
 * local salvo que alguien lo pida explícitamente —y aun así, solo para una
 * comprobación de lectura—. La suite nunca depende de producción.
 *
 * CÓMO SE ELIGE EL SERVIDOR
 * -------------------------
 *   E2E_BASE_URL          dónde vive la aplicación (por defecto, la vista
 *                         previa local de Vite)
 *   E2E_ALLOW_REMOTE=1    permite un host no local. Solo para humo de
 *                         LECTURA, nunca para pruebas que escriban.
 *   E2E_SKIP_WEBSERVER=1  no levantar Vite: ya hay algo escuchando ahí.
 *
 * Las credenciales de prueba, si existen, llegan SOLO por entorno
 * (`e2e/fixtures/testAccounts.js`). Este repositorio no guarda ninguna.
 */

const PUERTO_VISTA_PREVIA = 4173;
// `localhost` y no `127.0.0.1`: la vista previa de Vite se ata a `localhost`,
// que en esta maquina resuelve a IPv6, y `127.0.0.1` da conexion rechazada.
// Los dos estan en la lista de hosts locales de `apiService`, asi que la
// garantia de no hablar con produccion es la misma.
const BASE_POR_DEFECTO = `http://localhost:${PUERTO_VISTA_PREVIA}`;
const baseURL = process.env.E2E_BASE_URL || BASE_POR_DEFECTO;

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
const esLocal = (() => {
  try {
    return HOSTS_LOCALES.has(new URL(baseURL).hostname);
  } catch {
    throw new Error(`E2E_BASE_URL no es una URL válida: ${baseURL}`);
  }
})();

if (!esLocal && process.env.E2E_ALLOW_REMOTE !== '1') {
  throw new Error(
    `E2E_BASE_URL apunta a un servidor NO local (${new URL(baseURL).hostname}).\n`
    + 'La aplicación resuelve su API por el nombre de host: fuera de localhost habla con PRODUCCIÓN,\n'
    + 'y una prueba que escriba crearía usuarios, viajes o saldos reales.\n'
    + 'Si de verdad quieres un humo de SOLO LECTURA contra un entorno remoto, arranca con E2E_ALLOW_REMOTE=1.'
  );
}

// Solo se levanta Vite cuando la base es la local por defecto: si alguien
// apunta a otro sitio, ya sabe lo que tiene escuchando ahí.
const levantarServidor = esLocal
  && process.env.E2E_SKIP_WEBSERVER !== '1'
  && baseURL === BASE_POR_DEFECTO;

export default defineConfig({
  testDir: './e2e',
  // Un fallo por tiempo agotado en un móvil lento no es lo mismo que un fallo
  // de producto: se da margen, pero no tanto como para esconder un cuelgue.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // En CI, un `test.only` olvidado convierte la suite entera en una sola prueba.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',

  use: {
    baseURL,
    // La traza solo del reintento: en verde no aporta y ocupa.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'es-VE',
    timezoneId: 'America/Caracas'
  },

  /**
   * La aplicación es MÓVIL PRIMERO, así que los anchos reales del producto son
   * la referencia y el escritorio es la excepción (el panel de administración).
   *
   * Se etiquetan con `@movil` / `@escritorio` para que las fases siguientes
   * puedan ampliar la cobertura responsiva sin reescribir nada.
   */
  projects: [
    {
      name: 'movil-360',
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 800 } },
      testIgnore: /admin\//
    },
    {
      name: 'movil-390',
      use: { ...devices['iPhone 12'], viewport: { width: 390, height: 844 } },
      testIgnore: /admin\//
    },
    {
      name: 'movil-430',
      use: { ...devices['iPhone 14 Pro Max'], viewport: { width: 430, height: 932 } },
      testIgnore: /admin\//
    },
    {
      // El panel de administración es de escritorio por diseño.
      name: 'escritorio-admin',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: /(admin\/|smoke\/)/
    }
  ],

  ...(levantarServidor
    ? {
      webServer: {
        // Vista previa de la compilación real, no el servidor de desarrollo:
        // es lo que más se parece a lo que ve una persona.
        command: `npm run build && npm run preview -- --port ${PUERTO_VISTA_PREVIA} --strictPort`,
        url: BASE_POR_DEFECTO,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe'
      }
    }
    : {})
});
