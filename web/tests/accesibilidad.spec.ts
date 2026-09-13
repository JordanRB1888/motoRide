import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Barrido WCAG 2.1 AA con axe sobre las diez rutas, en móvil y en escritorio.
 *
 * Se recorre la página entera antes de analizar: buena parte del sitio se
 * revela con el scroll, y un análisis desde arriba del todo no vería ni la
 * escena de la carrera, ni el mapa, ni el pie.
 */
const RUTAS = [
  "/",
  "/servicios",
  "/pasajeros",
  "/conductores",
  "/seguridad",
  "/aliados",
  "/nosotros",
  "/ayuda",
  "/privacidad",
  "/terminos",
];

async function recorrer(page: Page) {
  await page.evaluate(async () => {
    const paso = innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += paso) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
}

for (const ruta of RUTAS) {
  for (const v of [
    { nombre: "móvil", width: 390, height: 844 },
    { nombre: "escritorio", width: 1440, height: 900 },
  ]) {
    test(`axe AA — ${ruta} (${v.nombre})`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto(ruta);
      await page.waitForLoadState("networkidle").catch(() => {});
      await recorrer(page);

      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const resumen = violations.map((v) => ({
        id: v.id,
        impacto: v.impact,
        nodos: v.nodes.map((n) => n.target.join(" ")).slice(0, 4),
      }));
      expect(JSON.stringify(resumen, null, 2)).toBe("[]");
    });
  }
}

test("el menú móvil abierto también pasa axe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "Abrir menú" }).click();
  // Los enlaces entran escalonados: el último acaba su fundido a los ~675 ms, y
  // analizar a mitad del fundido mide el contraste de un texto translúcido.
  await page.waitForTimeout(1200);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});
