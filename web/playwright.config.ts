import { defineConfig, devices } from "@playwright/test";

/**
 * Las pruebas corren contra el build de producción, no contra el servidor de
 * desarrollo: lo que se comprueba —el optimizador de imágenes, qué se descarga
 * en la portada, el HTML de metadatos— solo se comporta como en producción ahí.
 */
/** `SITIO=https://mas58express.com npx playwright test` corre la misma suite
 *  contra el sitio publicado en vez de contra el build local. */
const SITIO = process.env.SITIO;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: SITIO ?? "http://127.0.0.1:3100",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(SITIO
    ? {}
    : {
        webServer: {
          command: "npm run build && npm run start -- -p 3100",
          url: "http://127.0.0.1:3100",
          reuseExistingServer: true,
          timeout: 300_000,
        },
      }),
});
